import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBadges,
  computeStats,
  daysUntil,
  describeCountdown,
  describeDue,
  escapeHTML,
  formatClock,
  makeCode,
  parseCards,
  percentOf,
  quoteOfDay,
  sanitizeNickname,
  shuffle,
  summariseScores,
  validNickname,
  weekStartKey
} from "../helpers.js";

test("sanitizeNickname strips unsupported characters and falls back", () => {
  assert.equal(sanitizeNickname("Zoë Müller", "Learner x"), "Zoe Muller");
  assert.equal(sanitizeNickname("名前", "Learner x"), "Learner x");
  assert.equal(sanitizeNickname("A".repeat(40), "Learner x").length, 24);
  assert.equal(validNickname(sanitizeNickname("<b>Sam</b>", "Learner x")), true);
});

test("parseCards reads question | answer lines and skips bad ones", () => {
  const result = parseCards("Capital of France | Paris\n\nbroken line\nTwo | parts | here\n | empty question");
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[1].a, "parts | here");
  assert.equal(result.skipped, 2);
  const many = parseCards(Array.from({ length: 130 }, (_, index) => `q${index} | a${index}`).join("\n"));
  assert.equal(many.cards.length, 100);
  assert.equal(many.skipped, 30);
});

test("computeStats totals minutes, tasks and streak", () => {
  const now = new Date(2026, 9, 29, 15, 0, 0);
  const day = (offset, hour = 10) => new Date(2026, 9, 29 - offset, hour, 0, 0);
  const sessions = [
    { minutes: 25, date: day(0) },
    { minutes: 25, date: day(0, 12) },
    { minutes: 50, date: day(1) },
    { minutes: 30, date: day(2) },
    { minutes: 40, date: day(4) },
    { minutes: 99, date: day(12) }
  ];
  const stats = computeStats(sessions, [{ done: false }, { done: true }, { done: false }], now);
  assert.equal(stats.today, 50);
  assert.equal(stats.week, 170);
  assert.equal(stats.streak, 3);
  assert.equal(stats.open, 2);
  assert.equal(stats.bars.length, 7);
});

test("streak survives a day without a session until today ends", () => {
  const now = new Date(2026, 9, 29, 9, 0, 0);
  const stats = computeStats([{ minutes: 20, date: new Date(2026, 9, 28, 18, 0, 0) }], [], now);
  assert.equal(stats.streak, 1);
  assert.equal(stats.today, 0);
});

test("due and countdown labels", () => {
  const now = new Date(2026, 9, 29, 9, 0, 0);
  assert.equal(daysUntil("2026-10-30", now), 1);
  assert.equal(describeDue("2026-10-29", now), "Due today");
  assert.equal(describeDue("2026-10-30", now), "Due tomorrow");
  assert.equal(describeDue("2026-10-27", now), "Overdue by 2 days");
  assert.equal(describeDue("", now), "No due date");
  assert.equal(describeCountdown("2026-10-28", now), "Finished");
  assert.equal(describeCountdown("2026-11-12", now), "2w 0d to go".replace("2w 0d", "2 weeks"));
});

test("makeCode only uses unambiguous characters and has six of them", () => {
  const code = makeCode(Uint8Array.from([0, 1, 2, 250, 255, 128]));
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});

test("shuffle keeps every card", () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8];
  const result = shuffle(original);
  assert.deepEqual(result.slice().sort(), original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("escapeHTML and formatClock", () => {
  assert.equal(escapeHTML('<img src="x" onerror=\'a\'>'), "&lt;img src=&quot;x&quot; onerror=&#39;a&#39;&gt;");
  assert.equal(formatClock(1500), "25:00");
  assert.equal(formatClock(61), "01:01");
  assert.equal(formatClock(-4), "00:00");
});

test("weekStartKey returns the Monday of the week", () => {
  assert.equal(weekStartKey(new Date(2026, 9, 29)), "2026-10-26");
  assert.equal(weekStartKey(new Date(2026, 9, 26)), "2026-10-26");
  assert.equal(weekStartKey(new Date(2026, 10, 1)), "2026-10-26");
});

test("summariseScores averages per subject and reports the trend", () => {
  const rows = summariseScores([
    { subject: "Maths", score: 40, outOf: 80, takenOn: "2026-09-01" },
    { subject: "Maths", score: 60, outOf: 80, takenOn: "2026-10-01" },
    { subject: "Biology", score: 30, outOf: 60, takenOn: "2026-10-05" }
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].subject, "Biology");
  const maths = rows[1];
  assert.equal(maths.average, 62.5);
  assert.equal(maths.best, 75);
  assert.equal(maths.trend, 25);
  assert.equal(percentOf(1, 3), 33.3);
});

test("computeBadges unlocks badges from real activity", () => {
  const stats = { streak: 3, today: 45, open: 0, week: 100, bars: [] };
  const badges = computeBadges({
    stats,
    goal: 30,
    uid: "me",
    optIn: true,
    sessions: [{ minutes: 30 }, { minutes: 35 }],
    tasks: [{ done: true }, { done: false }],
    decks: [{ cards: [1, 2, 3] }],
    exams: [],
    groups: [{ ownerId: "me" }],
    notes: [],
    scores: []
  });
  const byId = Object.fromEntries(badges.map((badge) => [badge.id, badge]));
  assert.equal(byId["hour-power"].unlocked, true);
  assert.equal(byId["ten-hours"].unlocked, false);
  assert.equal(byId["streak-3"].unlocked, true);
  assert.equal(byId["streak-7"].unlocked, false);
  assert.equal(byId["goal-getter"].unlocked, true);
  assert.equal(byId["group-founder"].unlocked, true);
  assert.equal(byId["card-collector"].progress, "3 / 50");
  assert.equal(byId["note-taker"].unlocked, false);
});

test("quoteOfDay is stable for a given day", () => {
  assert.equal(quoteOfDay(new Date(2026, 9, 29, 8)), quoteOfDay(new Date(2026, 9, 29, 22)));
  assert.equal(typeof quoteOfDay(), "string");
});
