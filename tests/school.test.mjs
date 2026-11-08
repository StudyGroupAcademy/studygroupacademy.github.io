import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [portal, dashboard, server] = await Promise.all([
  readFile(new URL("../school-portal.js", import.meta.url), "utf8"),
  readFile(new URL("../dashboard.js", import.meta.url), "utf8"),
  readFile(new URL("../server.mjs", import.meta.url), "utf8")
]);

test("the signed-in dashboard starts the school portal", () => {
  assert.match(dashboard, /import \{ initSchoolPortal, startSchoolPortal \} from "\.\/school-portal\.js"/);
  assert.match(dashboard, /initSchoolPortal\(\)/);
  assert.match(dashboard, /await startSchoolPortal\(currentUser, profile\)/);
});

test("every school action used by the portal has a backend handler", () => {
  const actions = [...portal.matchAll(/schoolRequest\("([a-z-]+)"/g)].map((match) => match[1]);
  for (const action of new Set(actions)) {
    assert.ok(server.includes(`action === "${action}"`), `Missing backend handler for ${action}`);
  }
});


test("mitolecule email is the fixed platform administrator identity", () => {
  assert.match(server, /const schoolAdminEmail = "mitolecule@gmail\.com";/);
  assert.match(server, /identity\.email\.toLowerCase\(\) === schoolAdminEmail/);
});

test("school applications notify the platform administrator and decisions notify applicants", () => {
  assert.match(server, /'school_application', 'New school application'/);
  assert.match(server, /'school_application_approved', 'School application approved'/);
  assert.match(server, /'school_application_declined', 'School application update'/);
});

test("all signed-in users can load and mark their notifications read", () => {
  assert.match(server, /action === "notifications-list"/);
  assert.match(server, /recipient_id = \$1 OR lower\(recipient_email\) = lower\(\$2\)/);
  assert.match(server, /lower\(recipient_email\) = lower\(\$3\)/);
  assert.match(portal, /notification-toggle/);
  assert.match(portal, /setInterval\(refreshGlobalNotifications, 20000\)/);
});
