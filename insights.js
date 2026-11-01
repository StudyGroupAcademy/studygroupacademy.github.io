import { $, getErrorMessage, showToast, state } from "./core.js";
import {
  computeBadges,
  computeStats,
  describeCountdown,
  describeDue,
  escapeHTML,
  formatDay,
  quoteOfDay
} from "./helpers.js";
import { saveDailyGoal } from "./session.js";

const store = { tasks: [], sessions: [], decks: [], exams: [], groups: [], notes: [], scores: [] };
let primed = false;
let lastToday = 0;
let bound = false;

function currentGoal() {
  const goal = Number(state.profile?.dailyGoal);
  return Number.isInteger(goal) && goal >= 10 && goal <= 600 ? goal : 60;
}

function emptyLine(text) {
  return `<p class="muted-line">${text}</p>`;
}

export function renderInsights() {
  if (!$("#goal-fill")) return { today: 0 };
  const stats = computeStats(
    store.sessions.map((session) => ({ minutes: Number(session.minutes) || 0, date: session.date })),
    store.tasks
  );
  const goal = currentGoal();
  const percent = Math.min(100, Math.round((stats.today / goal) * 100));
  $("#goal-fill").style.width = `${percent}%`;
  $("#goal-text").textContent = stats.today >= goal
    ? `Goal reached: ${stats.today} of ${goal} minutes today.`
    : `${stats.today} of ${goal} minutes today. ${goal - stats.today} to go.`;
  const goalInput = $("#goal-form").elements.goal;
  if (document.activeElement !== goalInput) goalInput.value = goal;

  const upcoming = store.exams
    .filter((exam) => describeCountdown(exam.examDate) !== "Finished")
    .sort((first, second) => (first.examDate < second.examDate ? -1 : 1));
  $("#overview-exam").innerHTML = upcoming.length
    ? `<div class="exam-highlight"><strong>${escapeHTML(upcoming[0].name)}</strong><small>${escapeHTML(upcoming[0].subject)} · ${escapeHTML(formatDay(upcoming[0].examDate))}</small><span class="countdown-pill">${escapeHTML(describeCountdown(upcoming[0].examDate))}</span></div>`
    : emptyLine("No exams added yet. Add one in the Exams tab.");

  const open = store.tasks
    .filter((task) => !task.done)
    .sort((first, second) => (first.due || "9999-12-31") < (second.due || "9999-12-31") ? -1 : 1)
    .slice(0, 4);
  $("#overview-tasks").innerHTML = open.length
    ? open.map((task) => `<div class="mini-row"><strong>${escapeHTML(task.title)}</strong><small>${escapeHTML(describeDue(task.due))}</small></div>`).join("")
    : emptyLine("Nothing waiting. Nice work.");

  const badges = computeBadges({
    stats,
    goal,
    uid: state.user?.uid || "",
    optIn: Boolean(state.profile?.leaderboardOptIn),
    sessions: store.sessions,
    tasks: store.tasks,
    decks: store.decks,
    exams: store.exams,
    groups: store.groups,
    notes: store.notes,
    scores: store.scores
  });
  const unlocked = badges.filter((badge) => badge.unlocked);
  const next = badges.find((badge) => !badge.unlocked);
  $("#overview-badges").innerHTML = `<div class="mini-row"><strong>${unlocked.length} of ${badges.length} unlocked</strong>${next ? `<small>Next: ${escapeHTML(next.title)} (${escapeHTML(next.progress)})</small>` : "<small>You have them all</small>"}</div>`;
  $("#badge-summary").textContent = `${unlocked.length} of ${badges.length} badges unlocked`;
  $("#badge-grid").innerHTML = badges.map((badge) => `<div class="badge${badge.unlocked ? " is-unlocked" : ""}">
    <span class="badge-icon">${badge.unlocked ? "✳" : "○"}</span>
    <strong>${escapeHTML(badge.title)}</strong>
    <small>${escapeHTML(badge.text)}</small>
    <em>${badge.unlocked ? "Unlocked" : escapeHTML(badge.progress)}</em>
  </div>`).join("");
  $("#quote-text").textContent = quoteOfDay();
  return stats;
}

export function setData(key, value) {
  store[key] = value;
  const stats = renderInsights();
  if (key === "sessions") {
    const goal = currentGoal();
    if (primed && lastToday < goal && stats.today >= goal) showToast("Daily goal reached. Brilliant work.");
    lastToday = stats.today;
    primed = true;
  }
}

export function clearData() {
  Object.keys(store).forEach((key) => {
    store[key] = [];
  });
  primed = false;
  lastToday = 0;
  renderInsights();
}

export function initInsights() {
  if (bound) return;
  bound = true;
  $("#goal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const minutes = Math.round(Number(form.elements.goal.value));
    if (!Number.isFinite(minutes) || minutes < 10 || minutes > 600) {
      showToast("Pick a goal between 10 and 600 minutes.");
      return;
    }
    try {
      await saveDailyGoal(minutes);
      renderInsights();
      showToast(`Daily goal set to ${minutes} minutes.`);
    } catch (error) {
      console.error("Could not save the daily goal.", error);
      showToast(getErrorMessage(error));
    }
  });
}
