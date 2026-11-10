import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [server, migration, dashboard, html, styles, learning, content] = await Promise.all([
  readFile(new URL("server.mjs", root), "utf8"),
  readFile(new URL("migrations/001_initial.sql", root), "utf8"),
  readFile(new URL("dashboard.js", root), "utf8"),
  readFile(new URL("dashboard/index.html", root), "utf8"),
  readFile(new URL("styles.css", root), "utf8"),
  readFile(new URL("learning-engine.js", root), "utf8"),
  readFile(new URL("content-page.js", root), "utf8")
]);

test("PostgreSQL transactions use one checked-out connection", () => {
  assert.match(server, /const client = await pool\.connect\(\)/);
  assert.match(server, /client\.query\("BEGIN"\)/);
  assert.match(server, /client\.release\(\)/);
  assert.doesNotMatch(server, /pool\.query\("BEGIN"\)/);
});

test("API has bounded pool settings and lightweight request throttling", () => {
  assert.match(server, /connectionTimeoutMillis: 5_000/);
  assert.match(server, /idleTimeoutMillis: 30_000/);
  assert.match(server, /consumeRateLimit\(request, identity, url\.pathname\)/);
  assert.match(server, /Too many requests/);
  assert.match(migration, /app_records_path_prefix_idx/);
});

test("chat actions are rendered with side-aware hover positioning", () => {
  assert.match(dashboard, /data-message-reply/);
  assert.match(dashboard, /aria-hidden="true">↖/);
  assert.match(styles, /\.chat-message\.mine \.chat-message-toolbar/);
  assert.match(styles, /right: calc\(100% \+ 8px\)/);
});

test("dashboard includes the PEEL planner, formula shelf and revision session builder", () => {
  assert.match(html, /data-panel="tools"/);
  assert.match(html, /peel-point/);
  assert.match(html, /Formula and facts shelf/);
  assert.match(html, /build-session-plan/);
  assert.match(dashboard, /function bindStudyTools/);
});

test("flashcards save spaced-repetition reviews and prioritise due cards", () => {
  assert.match(learning, /learningReviews/);
  assert.match(learning, /nextReviewAt/);
  assert.match(learning, /intervalDays/);
  assert.match(learning, /cards due for review|due for review/);
});

test("subject pages include lazy-loaded, licensed educational imagery", () => {
  assert.match(content, /images\.unsplash\.com/);
  assert.match(content, /loading="lazy" decoding="async"/);
  assert.match(content, /unsplash\.com\/license/);
});
