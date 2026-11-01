import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { $, $$, db, getErrorMessage, state } from "./core.js";
import { escapeHTML, weekStartKey } from "./helpers.js";

let board = "checkins";
let refreshHandler = null;

function listSize() {
  return Number($("#leaderboard-list").dataset.size) || 8;
}

function setText(selector, text) {
  const element = $(selector);
  if (element) element.textContent = text;
}

function updateRank(students) {
  const element = $("#my-rank");
  if (!element) return;
  if (!state.user) {
    element.textContent = "";
    return;
  }
  const index = students.findIndex((student) => student.id === state.user.uid);
  if (index >= 0) {
    element.textContent = `You're number ${index + 1} on this board. Keep showing up.`;
  } else if (state.profile?.leaderboardOptIn) {
    element.textContent = board === "focus"
      ? "Finish a focus session this week to appear on this board."
      : "You're on the board. Check in each day to climb.";
  } else {
    element.textContent = "Join the leaderboard from your profile to see your rank.";
  }
}

function renderLeaderboard(students) {
  const list = $("#leaderboard-list");
  list.dataset.checkedInUid = "";
  if (students.length === 0) {
    const action = state.user ? "" : '<button class="leaderboard-join" type="button" data-open-auth="signup">Join the community <span>→</span></button>';
    const text = board === "focus"
      ? "No focus minutes have been logged this week yet. Finish a session and be the first."
      : "Be the first to opt into the study leaderboard. No grades, just friendly daily check-ins.";
    list.innerHTML = `<div class="leaderboard-message"><span>✳</span><strong>A fresh page. A new beginning.</strong><p>${text}</p>${action}</div>`;
    return;
  }
  list.innerHTML = students.map((student, index) => {
    const isCurrentUser = state.user?.uid === student.id;
    const nickname = escapeHTML(student.displayName || "Study buddy");
    const rank = index + 1;
    const rankClass = rank <= 3 ? ` rank-${rank}` : "";
    let score;
    if (board === "focus") {
      score = `${Number(student.weekMinutes) || 0}<small>min</small>`;
    } else {
      const points = Number.isSafeInteger(student.points) ? student.points : 0;
      score = `${points}<small>${points === 1 ? "day" : "days"}</small>`;
    }
    return `<article class="leaderboard-row${isCurrentUser ? " is-you" : ""}">
      <span class="leader-rank${rankClass}">${String(rank).padStart(2, "0")}</span>
      <span class="leader-avatar leader-avatar-${(index % 4) + 1}">${nickname.slice(0, 1).toUpperCase()}</span>
      <span class="leader-student"><strong>${nickname}</strong><small>${isCurrentUser ? "That's you · nice to see you!" : "Showing up, one day at a time"}</small></span>
      <span class="leader-points">${score}</span>
    </article>`;
  }).join("");
}

export function setBoard(name) {
  board = name === "focus" ? "focus" : "checkins";
  $$("[data-board]").forEach((chip) => chip.classList.toggle("is-active", chip.dataset.board === board));
  setText("#leaderboard-subtitle", board === "focus"
    ? "Focus minutes logged this week. Resets every Monday."
    : "A daily check-in leaderboard. Kindness over competition.");
  setText("#leaderboard-footnote", board === "focus" ? "Updates when you log a session" : "One check-in per 24 hours");
}

export async function loadLeaderboard() {
  const button = $("#refresh-leaderboard");
  const list = $("#leaderboard-list");
  const size = listSize();
  button.disabled = true;
  button.classList.add("is-refreshing");
  list.innerHTML = '<div class="leaderboard-loading"><span class="loading-spinner"></span> Finding our study buddies…</div>';
  try {
    let students;
    if (board === "focus") {
      const snapshot = await getDocs(query(
        collection(db, "publicLeaderboard"),
        where("weekKey", "==", weekStartKey()),
        limit(100)
      ));
      students = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .filter((student) => Number(student.weekMinutes) > 0)
        .sort((first, second) => second.weekMinutes - first.weekMinutes)
        .slice(0, size);
    } else {
      const snapshot = await getDocs(query(
        collection(db, "publicLeaderboard"),
        orderBy("points", "desc"),
        limit(size)
      ));
      students = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    }
    renderLeaderboard(students);
    updateRank(students);
  } catch (error) {
    console.error("Could not load the public StudyGroup leaderboard.", error);
    list.innerHTML = `<div class="leaderboard-message"><span>⌁</span><strong>We can't reach the leaderboard right now.</strong><p>${escapeHTML(getErrorMessage(error))}</p><button class="leaderboard-retry" type="button" data-retry-leaderboard>Try again</button></div>`;
  } finally {
    button.disabled = false;
    button.classList.remove("is-refreshing");
  }
}

export function initLeaderboard(onRefresh) {
  refreshHandler = onRefresh || loadLeaderboard;
  $("#refresh-leaderboard").addEventListener("click", () => refreshHandler());
  $$("[data-board]").forEach((chip) => {
    chip.addEventListener("click", () => {
      setBoard(chip.dataset.board);
      refreshHandler();
    });
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry-leaderboard]")) refreshHandler();
  });
}
