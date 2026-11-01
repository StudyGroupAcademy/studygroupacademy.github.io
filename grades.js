import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { $, db, getErrorMessage, runSafely, showBanner, showToast, state } from "./core.js";
import { dateKey, escapeHTML, formatDay, percentOf, summariseScores } from "./helpers.js";
import { setData } from "./insights.js";

const gr = { scores: [], listener: null, bound: false };

function scoresCollection() {
  return collection(db, "users", state.user.uid, "scores");
}

function trendMarkup(trend, count) {
  if (count < 2) return "<small>Add another result to see a trend</small>";
  if (trend > 0) return `<small class="trend-up">▲ ${trend} points since last time</small>`;
  if (trend < 0) return `<small class="trend-down">▼ ${Math.abs(trend)} points since last time</small>`;
  return "<small>Steady since last time</small>";
}

function renderScores() {
  const summary = $("#score-summary");
  const list = $("#score-list");
  if (gr.scores.length === 0) {
    summary.innerHTML = '<div class="empty-state"><span>◔</span><strong>No results yet</strong><p>Log a mock or test score to see your average and trend.</p></div>';
    list.innerHTML = "";
    return;
  }
  summary.innerHTML = summariseScores(gr.scores).map((row) => `<div class="score-card">
    <div class="score-top"><strong>${escapeHTML(row.subject)}</strong><span>${row.average}%</span></div>
    <div class="goal-bar"><i style="width:${Math.min(100, row.average)}%"></i></div>
    <small>${row.count} ${row.count === 1 ? "result" : "results"} · best ${row.best}% · latest ${row.latest}%</small>
    ${trendMarkup(row.trend, row.count)}
  </div>`).join("");
  const ordered = gr.scores.slice().sort((first, second) => (first.takenOn < second.takenOn ? 1 : first.takenOn > second.takenOn ? -1 : 0));
  list.innerHTML = ordered.map((entry) => `<div class="item">
    <div class="item-main"><strong>${escapeHTML(entry.name)}</strong><small>${escapeHTML(entry.subject)} · ${entry.score}/${entry.outOf} (${percentOf(entry.score, entry.outOf)}%) · ${escapeHTML(formatDay(entry.takenOn))}</small></div>
    <button class="icon-btn" type="button" data-score-delete="${entry.id}" aria-label="Delete result">×</button>
  </div>`).join("");
}

function bindOnce() {
  if (gr.bound) return;
  gr.bound = true;

  $("#score-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!state.user) return;
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const score = Number(form.elements.score.value);
    const outOf = Number(form.elements.outOf.value);
    const takenOn = form.elements.takenOn.value;
    if (!name || !takenOn) return;
    if (!Number.isFinite(score) || !Number.isFinite(outOf) || outOf < 1 || outOf > 1000 || score < 0 || score > outOf) {
      showToast("Check the marks: the score can't be higher than the total.");
      return;
    }
    runSafely(async () => {
      await addDoc(scoresCollection(), {
        name,
        subject: form.elements.subject.value,
        score,
        outOf,
        takenOn,
        createdAt: serverTimestamp()
      });
      form.elements.name.value = "";
      form.elements.score.value = "";
      showToast("Result saved.");
    }, event.submitter);
  });

  $("#score-list").addEventListener("click", (event) => {
    const remove = event.target.closest("[data-score-delete]");
    if (remove) runSafely(() => deleteDoc(doc(db, "users", state.user.uid, "scores", remove.dataset.scoreDelete)));
  });
}

export function startGrades() {
  stopGrades();
  if (!state.user) return;
  bindOnce();
  const dateField = $("#score-form").elements.takenOn;
  if (!dateField.value) dateField.value = dateKey(new Date());
  gr.listener = onSnapshot(
    query(scoresCollection(), limit(300)),
    (snapshot) => {
      gr.scores = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setData("scores", gr.scores);
      renderScores();
    },
    (error) => {
      console.error("StudyGroup grades listener failed.", error);
      showBanner(getErrorMessage(error), true);
    }
  );
}

export function stopGrades() {
  if (gr.listener) gr.listener();
  gr.listener = null;
  gr.scores = [];
  if (gr.bound) renderScores();
}
