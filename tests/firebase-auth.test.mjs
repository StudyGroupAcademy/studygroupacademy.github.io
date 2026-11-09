import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const authClient = await readFile(new URL("../auth-client.js", import.meta.url), "utf8");
const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
const setup = await readFile(new URL("../SETUP.md", import.meta.url), "utf8");

test("browser authentication uses the configured Firebase project", () => {
  assert.match(authClient, /projectId: "studygroup-b5135"/);
  assert.match(authClient, /signInWithPopup/);
  assert.match(authClient, /createUserWithEmailAndPassword/);
  assert.match(authClient, /sendPasswordResetEmail/);
  assert.doesNotMatch(authClient, /neon-js|neonauth/);
});

test("Render verifies Firebase ID tokens and keeps legacy identity mappings", () => {
  assert.match(server, /https:\/\/www\.googleapis\.com\/service_accounts\/v1\/jwk\/securetoken@system\.gserviceaccount\.com/);
  assert.match(server, /https:\/\/securetoken\.google\.com\/\$\{firebaseProjectId\}/);
  assert.match(server, /firebase_auth_identities/);
  assert.match(server, /\/api\/identity/);
  assert.doesNotMatch(server, /NEON_AUTH_BASE_URL|NEON_AUTH_JWKS_URL/);
});

test("setup explains the Firebase and Neon database deployment requirements", () => {
  assert.match(setup, /FIREBASE_PROJECT_ID=studygroup-b5135/);
  assert.match(setup, /Neon PostgreSQL remains the application database/);
  assert.match(setup, /cannot be safely matched automatically/);
});
