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
