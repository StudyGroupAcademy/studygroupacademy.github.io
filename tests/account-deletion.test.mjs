import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [server, auth, dashboard, html, core] = await Promise.all([
  readFile(new URL("../server.mjs", import.meta.url), "utf8"),
  readFile(new URL("../auth-client.js", import.meta.url), "utf8"),
  readFile(new URL("../dashboard.js", import.meta.url), "utf8"),
  readFile(new URL("../dashboard/index.html", import.meta.url), "utf8"),
  readFile(new URL("../core.js", import.meta.url), "utf8")
]);

test("account deletion requires an authenticated identity and explicit confirmation", () => {
  assert.match(server, /url\.pathname === \"\/api\/account\/delete\"/);
  assert.match(server, /if \(!identity\)/);
  assert.match(server, /body\.confirm !== true/);
});

test("account deletion removes personal data and deactivates school membership", () => {
  assert.match(server, /DELETE FROM app_records WHERE owner_id = \$1/);
  assert.match(server, /DELETE FROM assignment_submissions WHERE student_id = \$1/);
  assert.match(server, /UPDATE school_members SET active = false/);
});

test("client reauthenticates before removing data and deleting Firebase user", () => {
  assert.match(auth, /reauthenticateWithCredential/);
  assert.match(auth, /reauthenticateWithPopup/);
  assert.match(auth, /api\/account\/delete/);
  assert.match(auth, /deleteUser\(user\)/);
});

test("account deletion requires typing DELETE and displays a permanent warning", () => {
  assert.match(html, /Type <strong>DELETE<\/strong> to confirm/);
  assert.match(html, /This cannot be undone/);
  assert.match(dashboard, /value\.trim\(\) !== \"DELETE\"/);
});

test("technical service errors are translated into student-friendly language", () => {
  assert.match(core, /couldn't reach StudyGroup's server/);
  assert.match(core, /Those sign-in details don't match/);
  assert.match(core, /temporary problem/);
});
