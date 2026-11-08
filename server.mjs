import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRemoteJWKSet, jwtVerify } from "jose";
import cloudinaryPackage from "cloudinary";
import pg from "pg";
import { courses } from "./course-catalog.js";

const cloudinary = cloudinaryPackage.v2;
const { Pool } = pg;
const port = Number(process.env.PORT) || 10000;
const frontendOrigin = process.env.FRONTEND_ORIGIN;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const authJwksUrl = process.env.NEON_AUTH_JWKS_URL;
const databaseUrl = process.env.DATABASE_URL;
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudApiKey = process.env.CLOUDINARY_API_KEY;
const cloudApiSecret = process.env.CLOUDINARY_API_SECRET;
const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
const schoolAdminEmail = (process.env.SCHOOL_ADMIN_EMAIL || "mitolecule@gmail.com").trim().toLowerCase();

const requiredConfiguration = {
  FRONTEND_ORIGIN: frontendOrigin,
  NEON_AUTH_BASE_URL: authBaseUrl,
  NEON_AUTH_JWKS_URL: authJwksUrl,
  DATABASE_URL: databaseUrl,
  CLOUDINARY_CLOUD_NAME: cloudName,
  CLOUDINARY_API_KEY: cloudApiKey,
  CLOUDINARY_API_SECRET: cloudApiSecret,
  CLOUDINARY_UPLOAD_PRESET: uploadPreset
};
const missingConfiguration = Object.entries(requiredConfiguration)
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missingConfiguration.length > 0) {
  throw new Error(`Missing required environment variables: ${missingConfiguration.join(", ")}`);
}

const allowedOrigins = new Set(
  [frontendOrigin, ...(process.env.FRONTEND_ORIGINS || "").split(",")]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin)
);
const allowedOrigin = frontendOrigin;
const authIssuer = new URL(authBaseUrl).origin;
const jwks = createRemoteJWKSet(new URL(authJwksUrl));
const pool = new Pool({ connectionString: databaseUrl, max: 5 });
const databaseSchema = await readFile(new URL("./migrations/001_initial.sql", import.meta.url), "utf8");
await pool.query(databaseSchema);

const slugify = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const xpActivityIds = new Set([
  "maths-linear-equations",
  "maths-percentage-change",
  "maths-straight-line-gradient",
  "biology-cell-transport",
  "chemistry-atoms-and-ions",
  "physics-series-circuits",
  "english-language-analysis",
  "history-cause-and-consequence",
  "french-present-tense",
  "spanish-estar",
  ...courses.flatMap((course) => [
    ...course.notes.map((note) => `full-${course.slug}-${slugify(note.title)}`),
    ...course.worksheets.map((_, index) => `worksheet-${course.slug}-${index + 1}`)
  ])
]);

function assertPath(path, kind = "document") {
  const minimumLength = kind === "collection" ? 1 : 2;
  if (!Array.isArray(path) || path.length < minimumLength || path.length > 5
    || path.some((part) => typeof part !== "string" || !/^[A-Za-z0-9_-]{1,140}$/.test(part))
    || (kind === "document" && path.length % 2 !== 0)
    || (kind === "collection" && path.length % 2 !== 1)) {
    throw new Error("The requested data path is invalid.");
  }
  return path.join("/");
}

function serializeValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.__studygroupOperation === "serverTimestamp") return { __studygroupTimestamp: new Date().toISOString() };
    if (value.__studygroupOperation === "arrayUnion" || value.__studygroupOperation === "arrayRemove") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeValue(item)]));
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  return value;
}

function applyFields(existing, incoming) {
  const updated = { ...(existing || {}) };
  for (const [key, rawValue] of Object.entries(incoming || {})) {
    if (key.length > 100) throw new Error("A field name is too long.");
    if (rawValue?.__studygroupOperation === "arrayUnion") {
      const current = Array.isArray(updated[key]) ? updated[key] : [];
      const values = (rawValue.values || []).map(serializeValue);
      updated[key] = [...current, ...values.filter((value) => !current.some((item) => JSON.stringify(item) === JSON.stringify(value)))];
    } else if (rawValue?.__studygroupOperation === "arrayRemove") {
      const values = (rawValue.values || []).map((value) => JSON.stringify(serializeValue(value)));
      updated[key] = (Array.isArray(updated[key]) ? updated[key] : []).filter((item) => !values.includes(JSON.stringify(item)));
    } else {
      updated[key] = serializeValue(rawValue);
    }
  }
  return updated;
}

async function record(client, path) {
  const result = await client.query("SELECT path, owner_id, data FROM app_records WHERE path = $1", [path]);
  return result.rows[0] || null;
}

function groupIdForPath(path) {
  return path[0] === "groups" && path.length >= 2 ? path[1] : null;
}

async function isGroupMember(client, uid, groupId) {
  const group = await record(client, `groups/${groupId}`);
  return Boolean(group && (group.data.ownerId === uid || group.data.memberIds?.includes(uid)));
}

async function canReadRecord(client, uid, path) {
  if (path[0] === "publicLeaderboard") return true;
  if (!uid) return false;
  if (path[0] === "users") return path[1] === uid;
  if (path[0] === "groupCodes") return true;
  const groupId = groupIdForPath(path);
  if (!groupId) return false;
  if (await isGroupMember(client, uid, groupId)) return true;
  if (path.length === 2) {
    const invite = await record(client, `groupCodes/${groupId}`);
    return Boolean(invite && invite.data.groupId === groupId);
  }
  return false;
}

async function authorizeMutation(client, uid, change, existing) {
  const path = change.path;
  if (path[0] === "users" && path[1] === uid) return uid;
  if (path[0] === "publicLeaderboard" && path[1] === uid) return uid;
  if (path[0] === "groupCodes" && path.length === 2) {
    if (change.op === "delete") {
      if (existing?.owner_id !== uid) throw new Error("Only the group owner can remove its invite code.");
      return uid;
    }
    if (change.data?.ownerId !== uid && existing?.owner_id !== uid) {
      throw new Error("Only the group owner can create an invite code.");
    }
    return uid;
  }
  const groupId = groupIdForPath(path);
  if (!groupId) throw new Error("This data collection is not available.");

  const group = await record(client, `groups/${groupId}`);
  if (!group && path.length === 2 && change.op === "set" && change.data?.ownerId === uid
    && change.data?.memberIds?.includes(uid)) {
    return uid;
  }
  if (group && await isGroupMember(client, uid, groupId)) {
    if (path.length === 2 && change.op !== "delete" && change.data?.ownerId !== undefined
      && change.data.ownerId !== group.data.ownerId) {
      throw new Error("Group ownership cannot be changed.");
    }
    return uid;
  }

  const joinOperation = path.length === 2 && change.op === "update"
    && change.data?.memberIds?.__studygroupOperation === "arrayUnion"
    && change.data.memberIds.values?.length === 1
    && change.data.memberIds.values[0] === uid;
  if (group && joinOperation) {
    const codes = await client.query(
      "SELECT data FROM app_records WHERE path LIKE 'groupCodes/%' AND data->>'groupId' = $1 LIMIT 1",
      [groupId]
    );
    if (codes.rowCount) return uid;
  }
  throw new Error("You don't have permission to change this data.");
}

async function applyMutation(client, uid, change, trustedActivity = false) {
  const path = assertPath(change.path);
  const existing = await record(client, path);
  if (path[0] === "users" && path[1] === uid && path[2] === "learningProgress" && !trustedActivity) {
    throw new Error("Learning progress is saved only through a completed activity.");
  }
  if (path[0] === "publicLeaderboard" && change.data?.xp !== undefined
    && !(change.op === "set" && !existing && Number(change.data.xp) === 0)) {
    throw new Error("XP is awarded only when you complete an activity.");
  }
  if (change.op === "delete") {
    if (!existing) return;
    await authorizeMutation(client, uid, change, existing);
    await client.query("DELETE FROM app_records WHERE path = $1", [path]);
    return;
  }
  if (change.op !== "set" && change.op !== "update") throw new Error("Unsupported database operation.");
  if (!change.data || typeof change.data !== "object" || Array.isArray(change.data)) {
    throw new Error("Database records must be JSON objects.");
  }
  if (change.op === "update" && !existing) throw new Error("The requested record does not exist.");
  const ownerId = await authorizeMutation(client, uid, change, existing);
  const nextData = change.op === "update" || change.merge
    ? applyFields(existing?.data, change.data)
    : applyFields(null, change.data);
  await client.query(
    `INSERT INTO app_records (path, owner_id, data, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (path) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data, updated_at = now()`,
    [path, ownerId, JSON.stringify(nextData)]
  );
}

function readField(data, path) {
  return path.split(".").reduce((value, key) => value?.[key], data);
}

function matchesFilter(data, filter) {
  const actual = readField(data, filter.field);
  if (filter.operator === "==") return JSON.stringify(actual) === JSON.stringify(serializeValue(filter.value));
  if (filter.operator === "array-contains") {
    return Array.isArray(actual) && actual.some((value) => JSON.stringify(value) === JSON.stringify(serializeValue(filter.value)));
  }
  throw new Error("This query filter is not supported.");
}

async function listRecords(client, uid, collectionPath, constraints = []) {
  const parent = assertPath(collectionPath, "collection");
  const prefix = `${parent}/`;
  const result = await client.query(
    "SELECT path, owner_id, data FROM app_records WHERE path LIKE $1 AND array_length(string_to_array(path, '/'), 1) = $2",
    [`${prefix}%`, collectionPath.length + 1]
  );
  let rows = [];
  for (const row of result.rows) {
    if (await canReadRecord(client, uid, row.path.split("/"))) rows.push(row);
  }
  for (const filter of constraints.filter((item) => item.kind === "where")) {
    rows = rows.filter((row) => matchesFilter(row.data, filter));
  }
  for (const order of constraints.filter((item) => item.kind === "orderBy")) {
    rows.sort((a, b) => {
      const first = readField(a.data, order.field);
      const second = readField(b.data, order.field);
      const left = first?.__studygroupTimestamp || first || "";
      const right = second?.__studygroupTimestamp || second || "";
      return (left < right ? -1 : left > right ? 1 : 0) * (order.direction === "desc" ? -1 : 1);
    });
  }
  const cap = constraints.find((item) => item.kind === "limit")?.count;
  if (cap !== undefined) rows = rows.slice(0, Math.max(0, Math.min(500, Number(cap) || 0)));
  return rows;
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 2 * 1024 * 1024) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function dataRequest(uid, body) {
  if (body.op === "completeActivity") {
    if (!uid) throw new Error("Please sign in to complete this activity.");
    const activityId = String(body.activityId || "");
    if (!xpActivityIds.has(activityId)) throw new Error("This learning activity is not recognised.");
    const progressPath = `users/${uid}/learningProgress/${activityId}`;
    const userPath = `users/${uid}`;
    const profileRecord = await record(pool, userPath);
    if (!profileRecord) throw new Error("Your learner profile could not be found. Please refresh and sign in again.");
    await pool.query("BEGIN");
    try {
      const existingProgress = await record(pool, progressPath);
      if (existingProgress) {
        await pool.query("COMMIT");
        return { awarded: false, xp: Number(existingProgress.data.xp) || 10 };
      }
      const award = 10;
      await applyMutation(pool, uid, {
        op: "set",
        path: progressPath.split("/"),
        data: { completed: true, xp: award, completedAt: new Date().toISOString() }
      }, true);
      const profile = applyFields(profileRecord.data, {
        xp: (Number(profileRecord.data.xp) || 0) + award,
        updatedAt: new Date().toISOString()
      });
      await pool.query("UPDATE app_records SET data = $2::jsonb, updated_at = now() WHERE path = $1", [userPath, JSON.stringify(profile)]);
      if (profile.leaderboardOptIn) {
        const publicPath = `publicLeaderboard/${uid}`;
        const publicRecord = await record(pool, publicPath);
        const now = new Date();
        const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
        const weekKey = monday.toISOString().slice(0, 10);
        const monthKey = now.toISOString().slice(0, 7);
        const yearStart = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
        const yearKey = `${yearStart}-09-01`;
        const previous = publicRecord?.data || {};
        const publicData = applyFields(previous, {
          uid,
          displayName: profile.displayName || "Learner",
          nickname: profile.nickname || profile.displayName || "Learner",
          handle: profile.handle || "user",
          xp: profile.xp,
          xpWeekly: previous.weekKey === weekKey ? (Number(previous.xpWeekly) || 0) + award : award,
          weekKey,
          xpMonthly: previous.monthKey === monthKey ? (Number(previous.xpMonthly) || 0) + award : award,
          monthKey,
          xpYearly: previous.yearKey === yearKey ? (Number(previous.xpYearly) || 0) + award : award,
          yearKey,
          updatedAt: now.toISOString()
        });
        await pool.query(
          `INSERT INTO app_records (path, owner_id, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
           ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [publicPath, uid, JSON.stringify(publicData)]
        );
      }
      await pool.query("COMMIT");
      return { awarded: true, xp: award, totalXp: profile.xp };
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
  if (body.op === "get") {
    const path = body.path;
    const key = assertPath(path);
    if (!await canReadRecord(pool, uid, path)) throw new Error("You don't have permission to read this data.");
    const result = await record(pool, key);
    return { data: result?.data ?? null };
  }
  if (body.op === "list") {
    const docs = await listRecords(pool, uid, body.path, body.constraints);
    return { docs: docs.map(({ path, data }) => ({ path: path.split("/"), data })) };
  }
  if (body.op === "set" || body.op === "update" || body.op === "delete") {
    await pool.query("BEGIN");
    try {
      await applyMutation(pool, uid, body);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    return { ok: true };
  }
  if (body.op === "batch") {
    if (!Array.isArray(body.changes) || body.changes.length < 1 || body.changes.length > 500) {
      throw new Error("A batch must contain between 1 and 500 changes.");
    }
    await pool.query("BEGIN");
    try {
      for (const change of body.changes) await applyMutation(pool, uid, change);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
    return { ok: true };
  }
  throw new Error("Unsupported database request.");
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin || "*",
    "Vary": "Origin"
  });
  response.end(JSON.stringify(body));
}

function requestOrigin(request) {
  const origin = request.headers.origin;
  return allowedOrigins.has(origin) ? origin : null;
}

async function authenticatedUser(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: [authIssuer, authBaseUrl.replace(/\/$/, "")]
    });
    return typeof payload.sub === "string" && payload.sub
      ? { id: payload.sub, email: typeof payload.email === "string" ? payload.email.toLowerCase() : "" }
      : null;
  } catch (error) {
    console.warn("Rejected an invalid Neon Auth access token.", error.code || error.name);
    return null;
  }
}

const server = createServer(async (request, response) => {
  const origin = requestOrigin(request) || frontendOrigin;
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    });
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    const identity = await authenticatedUser(request);

    if (url.pathname === "/api/data") {
      if (request.method !== "POST") throw new Error("Method not allowed.");
      const body = await readJson(request);
      const result = await dataRequest(identity?.id || null, body);
      sendJson(response, 200, result, origin);
      return;
    }

    if (url.pathname === "/api/schools") {
      if (request.method !== "POST") throw new Error("Method not allowed.");
      
      const body = await readJson(request);
      
      if (!identity && !body.anonymous) {
        sendJson(response, 401, { error: "Please sign in to continue." }, origin);
        return;
      }

      const action = body.action;

      if (action === "submitApplication") {
        await pool.query(
          `INSERT INTO school_applications 
           (school_name, school_domain, website, address, contact_name, contact_email, verification_details) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            body.schoolName,
            body.schoolDomain,
            body.website,
            body.address,
            body.contactName,
            identity?.email || body.contactEmail,
            body.verificationDetails
          ]
        );

        sendJson(response, 200, { ok: true, message: "School application submitted successfully." }, origin);
        return;
      }

      sendJson(response, 200, { ok: true }, origin);
      return;
    }

    sendJson(response, 404, { error: "Not found" }, origin);
  } catch (error) {
    console.error("API error:", error);
    sendJson(response, 400, { error: error.message || "Internal server error" }, origin);
  }
});

server.listen(port, () => {});
