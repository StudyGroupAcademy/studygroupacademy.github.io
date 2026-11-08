import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
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
await pool.query(`ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS grade numeric(5,2), ADD COLUMN IF NOT EXISTS grade_feedback text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS graded_by text, ADD COLUMN IF NOT EXISTS graded_at timestamptz`);

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
  if (path[0] === "publicLeaderboard" || path[0] === "publicProfiles") return true;
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
  if (path[0] === "publicProfiles" && path.length === 2) {
    if (change.op === "delete") {
      if (existing?.owner_id !== uid) throw new Error("You can only remove your own public profile.");
      return uid;
    }
    const handle = String(change.data?.handle || path[1]).toLowerCase();
    if (handle !== path[1] || !/^[a-z0-9_]{3,20}$/.test(handle)) throw new Error("Choose a valid profile handle.");
    if (change.data?.uid !== uid) throw new Error("A public profile must belong to your signed-in account.");
    if (existing && existing.owner_id !== uid) throw new Error("That profile handle is already taken. Choose another one.");
    const collision = await client.query("SELECT owner_id FROM app_records WHERE path = $1", [`publicProfiles/${handle}`]);
    if (collision.rowCount && collision.rows[0].owner_id !== uid) throw new Error("That profile handle is already taken. Choose another one.");
    return uid;
  }
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
    if (path.length === 4 && path[2] === "messages" && existing
      && existing.owner_id !== uid && group.data.ownerId !== uid) {
      throw new Error("You can only edit or delete your own messages.");
    }
    if (path.length === 4 && path[2] === "messages" && change.op !== "delete"
      && change.data?.uid !== undefined && change.data.uid !== uid) {
      throw new Error("A message must belong to its sender.");
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
  const saved = await client.query(
    `INSERT INTO app_records (path, owner_id, data, updated_at)
     VALUES ($1, $2, $3::jsonb, now())
     ON CONFLICT (path) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data, updated_at = now()
     WHERE app_records.owner_id = EXCLUDED.owner_id`,
    [path, ownerId, JSON.stringify(nextData)]
  );
  if (path[0] === "publicProfiles" && saved.rowCount === 0) {
    throw new Error("That profile handle is already taken. Choose another one.");
  }
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

function leaderboardPeriodKeys(date) {
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const yearStart = date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return {
    weekKey: monday.toISOString().slice(0, 10),
    monthKey: date.toISOString().slice(0, 7),
    yearKey: `${yearStart}-09-01`
  };
}

async function dataRequest(uid, body) {
  if (body.op === "syncXp") {
    if (!uid) throw new Error("Please sign in to synchronise your leaderboard XP.");
    const userPath = `users/${uid}`;
    const profileRecord = await record(pool, userPath);
    if (!profileRecord) throw new Error("Your learner profile could not be found.");
    const profile = profileRecord.data || {};
    if (!profile.leaderboardOptIn) {
      await pool.query("DELETE FROM app_records WHERE path = $1 AND owner_id = $2", [`publicLeaderboard/${uid}`, uid]);
      return { synced: false, reason: "opted-out", totalXp: Number(profile.xp) || 0 };
    }

    const progressPrefix = `${userPath}/learningProgress/`;
    const progressResult = await pool.query(
      "SELECT data FROM app_records WHERE path LIKE $1 AND array_length(string_to_array(path, '/'), 1) = 4",
      [`${progressPrefix}%`]
    );
    const now = new Date();
    const keys = leaderboardPeriodKeys(now);
    const totals = { weekly: 0, monthly: 0, yearly: 0, all: 0 };
    for (const row of progressResult.rows) {
      const activity = row.data || {};
      const amount = Math.max(0, Number(activity.xp) || 10);
      const completed = new Date(activity.completedAt || activity.createdAt || 0);
      if (!Number.isFinite(completed.getTime()) || completed.getTime() <= 0) continue;
      totals.all += amount;
      const activityKeys = leaderboardPeriodKeys(completed);
      if (activityKeys.weekKey === keys.weekKey) totals.weekly += amount;
      if (activityKeys.monthKey === keys.monthKey) totals.monthly += amount;
      if (activityKeys.yearKey === keys.yearKey) totals.yearly += amount;
    }
    const lifetimeXp = Math.max(0, Number(profile.xp) || 0, totals.all);
    const legacyXp = Math.max(0, lifetimeXp - totals.all);
    totals.weekly += legacyXp;
    totals.monthly += legacyXp;
    totals.yearly += legacyXp;

    if (lifetimeXp !== (Number(profile.xp) || 0)) {
      profile.xp = lifetimeXp;
      profile.updatedAt = now.toISOString();
      await pool.query("UPDATE app_records SET data = $2::jsonb, updated_at = now() WHERE path = $1", [userPath, JSON.stringify(profile)]);
    }

    const publicData = applyFields({}, {
      uid,
      displayName: profile.displayName || profile.nickname || "Learner",
      nickname: profile.nickname || profile.displayName || "Learner",
      handle: profile.handle || "user",
      xp: lifetimeXp,
      xpWeekly: totals.weekly,
      weekKey: keys.weekKey,
      xpMonthly: totals.monthly,
      monthKey: keys.monthKey,
      xpYearly: totals.yearly,
      yearKey: keys.yearKey,
      updatedAt: now.toISOString()
    });
    await pool.query(
      `INSERT INTO app_records (path, owner_id, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (path) DO UPDATE SET owner_id = EXCLUDED.owner_id, data = EXCLUDED.data, updated_at = now()`,
      [`publicLeaderboard/${uid}`, uid, JSON.stringify(publicData)]
    );
    if (profile.handle) {
      const publicProfile = applyFields({}, {
        uid,
        handle: String(profile.handle).toLowerCase(),
        displayName: profile.displayName || profile.nickname || "Learner",
        nickname: profile.nickname || profile.displayName || "Learner",
        bio: profile.bio || "",
        xp: lifetimeXp,
        yearGroup: profile.yearGroup || "",
        boards: profile.boards || {},
        createdAt: profile.createdAt || now.toISOString(),
        updatedAt: now.toISOString()
      });
      await pool.query(
        `INSERT INTO app_records (path, owner_id, data, updated_at) VALUES ($1, $2, $3::jsonb, now())
         ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now() WHERE app_records.owner_id = EXCLUDED.owner_id`,
        [`publicProfiles/${String(profile.handle).toLowerCase()}`, uid, JSON.stringify(publicProfile)]
      );
    }
    return { synced: true, totalXp: lifetimeXp, weeklyXp: totals.weekly, monthlyXp: totals.monthly, yearlyXp: totals.yearly };
  }

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
      if (profile.handle) {
        const publicPath = `publicProfiles/${String(profile.handle).toLowerCase()}`;
        const publicProfile = applyFields({}, { uid, handle: String(profile.handle).toLowerCase(), displayName: profile.displayName || profile.nickname || "Learner", nickname: profile.nickname || profile.displayName || "Learner", bio: profile.bio || "", xp: profile.xp, yearGroup: profile.yearGroup || "", boards: profile.boards || {}, createdAt: profile.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
        await pool.query(`INSERT INTO app_records (path, owner_id, data, updated_at) VALUES ($1, $2, $3::jsonb, now()) ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, updated_at = now() WHERE app_records.owner_id = EXCLUDED.owner_id`, [publicPath, uid, JSON.stringify(publicProfile)]);
      }
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


const teacherPermissionKeys = new Set([
  "post_homework", "edit_shared_homework", "review_student_submissions", "invite_and_manage_accounts", "view_student_grades", "grade_student_work"
]);
const studentPermissionKeys = new Set([
  "view_homework", "upload_submissions", "comment_privately_to_teachers", "view_feedback_and_grades"
]);
const hashInviteToken = (token) => createHash("sha256").update(String(token)).digest("hex");
const cleanText = (value, maximum, label) => {
  const text = String(value ?? "").trim();
  if (!text || text.length > maximum) throw new Error(`${label} is required and must be ${maximum} characters or fewer.`);
  return text;
};
const inviteUrl = (token) => {
  const url = new URL("/", frontendOrigin);
  url.searchParams.set("invite", token);
  return url.toString();
};
const isSchoolAdmin = (identity) => Boolean(identity?.email && identity.email.toLowerCase() === schoolAdminEmail);

async function createSchoolInvite(client, { schoolId, email, role, permissions, createdBy }) {
  const normalizedEmail = cleanText(email, 254, "Email address").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("Enter a valid email address.");
  if (!["school_admin", "teacher", "student"].includes(role)) throw new Error("Choose a valid school role.");
  const allowed = role === "student" ? studentPermissionKeys : teacherPermissionKeys;
  const safePermissions = [...new Set((Array.isArray(permissions) ? permissions : []).filter((key) => allowed.has(key)))];
  if (role === "school_admin") safePermissions.push("invite_and_manage_accounts", "post_homework", "review_student_submissions", "view_student_grades", "grade_student_work", "edit_shared_homework");
  if (role === "student" && !safePermissions.length) throw new Error("Select at least one student permission.");
  if (role === "teacher" && !safePermissions.length) throw new Error("Select at least one teacher permission.");
  await client.query(
    `UPDATE school_invites SET expires_at = now()
     WHERE school_id = $1 AND lower(email) = $2 AND role = $3 AND accepted_at IS NULL AND expires_at > now()`,
    [schoolId, normalizedEmail, role]
  );
  const token = randomBytes(32).toString("base64url");
  const result = await client.query(
    `INSERT INTO school_invites (school_id, email, role, permissions, token_hash, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, expires_at`,
    [schoolId, normalizedEmail, role, safePermissions, hashInviteToken(token), createdBy || null]
  );
  return { invite: result.rows[0], inviteUrl: inviteUrl(token) };
}

async function getSchoolMember(client, userId) {
  const result = await client.query(
    `SELECT m.school_id, m.user_id, m.email, m.display_name, m.role, m.permissions, m.active,
            s.name AS school_name, s.domain AS school_domain
     FROM school_members m JOIN schools s ON s.id = m.school_id
     WHERE m.user_id = $1 AND m.active = true LIMIT 1`, [userId]
  );
  return result.rows[0] || null;
}

async function requireSchoolMember(client, identity, schoolId = null) {
  if (!identity) throw new Error("Please sign in to continue.");
  const member = await getSchoolMember(client, identity.id);
  if (!member) throw new Error("This account is not part of a verified school. Ask your school administrator for an invitation.");
  if (schoolId && member.school_id !== schoolId) throw new Error("That school does not match your account.");
  return member;
}

function requirePermission(member, permission) {
  if (member.role === "school_admin" || member.permissions?.includes(permission)) return;
  throw new Error("Your school account does not have permission to do that. Ask your school administrator.");
}

async function notify(client, recipientId, schoolId, kind, title, body, targetId = null) {
  if (!recipientId) return;
  await client.query(
    `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [recipientId, schoolId, kind, title, body, targetId]
  );
}

async function schoolContext(client, identity) {
  const member = await getSchoolMember(client, identity.id);
  const pendingResult = member ? { rows: [] } : await client.query(
    `SELECT school_name, status FROM school_applications WHERE lower(contact_email) = $1 ORDER BY created_at DESC LIMIT 1`,
    [identity.email]
  );
  const notifications = member ? (await client.query(
    `SELECT id, kind, title, body, target_id, read_at, created_at FROM school_notifications
     WHERE recipient_id = $1 AND school_id = $2 ORDER BY created_at DESC LIMIT 50`, [identity.id, member.school_id]
  )).rows : [];
  if (!member) return { member: null, pendingApplication: pendingResult.rows[0] || null, notifications: [], assignments: [], teachers: [] };

  const assignmentQuery = member.role === "student" && !member.permissions.includes("view_homework")
    ? { rows: [] }
    : member.role === "student"
    ? await client.query(`SELECT a.* FROM school_assignments a WHERE a.school_id = $1 ORDER BY a.created_at DESC`, [member.school_id])
    : member.role === "school_admin"
      ? await client.query(`SELECT a.* FROM school_assignments a WHERE a.school_id = $1 ORDER BY a.created_at DESC`, [member.school_id])
      : await client.query(
        `SELECT DISTINCT a.* FROM school_assignments a LEFT JOIN assignment_teachers t ON t.assignment_id = a.id
         WHERE a.school_id = $1 AND (a.created_by = $2 OR t.user_id = $2) ORDER BY a.created_at DESC`,
        [member.school_id, identity.id]
      );
  const assignments = [];
  for (const assignment of assignmentQuery.rows) {
    const teacherRows = await client.query("SELECT user_id FROM assignment_teachers WHERE assignment_id = $1 ORDER BY user_id", [assignment.id]);
    const teacherIds = teacherRows.rows.map((row) => row.user_id);
    const item = { ...assignment, teacher_ids: teacherIds, comments: [], submissions: [], own_submission: null };
    if (member.role === "student") {
      const own = await client.query("SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2", [assignment.id, identity.id]);
      item.own_submission = own.rows[0] || null;
      if (item.own_submission) {
        item.comments = (await client.query("SELECT * FROM assignment_comments WHERE submission_id = $1 ORDER BY created_at ASC", [item.own_submission.id])).rows;
      }
    } else if (member.role === "school_admin" || teacherIds.includes(identity.id) || assignment.created_by === identity.id) {
      const submissions = await client.query(
        `SELECT sub.*, m.display_name AS student_name FROM assignment_submissions sub
         LEFT JOIN school_members m ON m.user_id = sub.student_id AND m.school_id = $2
         WHERE sub.assignment_id = $1 ORDER BY sub.submitted_at DESC`, [assignment.id, member.school_id]
      );
      item.submissions = submissions.rows;
      for (const submission of item.submissions) {
        const comments = await client.query("SELECT * FROM assignment_comments WHERE submission_id = $1 ORDER BY created_at ASC", [submission.id]);
        item.comments.push(...comments.rows);
      }
    }
    assignments.push(item);
  }
  const teachers = (await client.query(
    `SELECT user_id, email, display_name, role FROM school_members WHERE school_id = $1 AND active = true AND role IN ('teacher', 'school_admin') ORDER BY display_name`,
    [member.school_id]
  )).rows;
  return { member, pendingApplication: null, notifications, assignments, teachers };
}

async function handleSchoolAction(identity, body) {
  const action = body.action;
  if (action === "apply") {
    const schoolName = cleanText(body.schoolName, 160, "School name");
    const website = cleanText(body.website, 250, "School website");
    let parsed;
    try { parsed = new URL(website); } catch { throw new Error("Enter a valid school website URL."); }
    if (!/^https?:$/.test(parsed.protocol)) throw new Error("School website must use HTTPS or HTTP.");
    const contactEmail = cleanText(body.contactEmail, 254, "Contact email").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter a valid contact email.");
    const result = await pool.query(
      `INSERT INTO school_applications (school_name, school_domain, website, address, contact_name, contact_email, verification_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [schoolName, parsed.hostname.replace(/^www\./, "").toLowerCase(), parsed.toString(), cleanText(body.address, 400, "School address"), cleanText(body.contactName, 120, "Contact name"), contactEmail, cleanText(body.verificationDetails, 2000, "Verification details")]
    );
    return { ok: true, applicationId: result.rows[0].id };
  }
  if (!identity) throw new Error("Please sign in to continue.");

  if (action === "context") return schoolContext(pool, identity);

  if (action === "admin-list") {
    if (!isSchoolAdmin(identity)) throw new Error("Only the StudyGroup administrator can review school applications.");
    const [applications, notifications] = await Promise.all([
      pool.query("SELECT * FROM school_applications ORDER BY created_at DESC LIMIT 100"),
      pool.query("SELECT * FROM school_notifications WHERE recipient_email = $1 ORDER BY created_at DESC LIMIT 50", [schoolAdminEmail])
    ]);
    return { applications: applications.rows, notifications: notifications.rows };
  }

  if (action === "review") {
    if (!isSchoolAdmin(identity)) throw new Error("Only the StudyGroup administrator can review school applications.");
    if (!["approve", "decline"].includes(body.decision)) throw new Error("Choose approve or decline.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT * FROM school_applications WHERE id = $1 FOR UPDATE", [body.applicationId]);
      const application = found.rows[0];
      if (!application) throw new Error("School application not found.");
      if (application.status !== "pending") throw new Error("This application has already been reviewed.");
      if (body.decision === "decline") {
        await client.query("UPDATE school_applications SET status = 'declined', reviewer_id = $2, reviewed_at = now() WHERE id = $1", [application.id, identity.id]);
        await client.query("COMMIT");
        return { ok: true, status: "declined" };
      }
      const school = await client.query(
        `INSERT INTO schools (name, domain, website, address) VALUES ($1, $2, $3, $4) RETURNING id`,
        [application.school_name, application.school_domain, application.website, application.address]
      );
      await client.query("UPDATE school_applications SET status = 'approved', school_id = $2, reviewer_id = $3, reviewed_at = now() WHERE id = $1", [application.id, school.rows[0].id, identity.id]);
      const created = await createSchoolInvite(client, { schoolId: school.rows[0].id, email: application.contact_email, role: "school_admin", permissions: [], createdBy: identity.id });
      await client.query("COMMIT");
      return { ok: true, status: "approved", invite: created.invite, inviteEmail: created.invite.email, inviteUrl: created.inviteUrl };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "create-admin-invite") {
    if (!isSchoolAdmin(identity)) throw new Error("Only the StudyGroup administrator can create school admin invites.");
    const application = await pool.query("SELECT * FROM school_applications WHERE id = $1 AND status = 'approved' AND school_id IS NOT NULL", [body.applicationId]);
    if (!application.rowCount) throw new Error("An approved school application is required.");
    const created = await createSchoolInvite(pool, { schoolId: application.rows[0].school_id, email: application.rows[0].contact_email, role: "school_admin", permissions: [], createdBy: identity.id });
    return { ...created, inviteEmail: created.invite.email };
  }

  if (action === "accept-invite") {
    const token = cleanText(body.token, 200, "Invitation token");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT i.*, s.name AS school_name FROM school_invites i JOIN schools s ON s.id = i.school_id
         WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now() FOR UPDATE`, [hashInviteToken(token)]
      );
      const invite = result.rows[0];
      if (!invite) throw new Error("This invitation is invalid, expired or already used. Ask your school for a new link.");
      if (invite.email.toLowerCase() !== identity.email.toLowerCase()) throw new Error(`This invitation was sent to ${invite.email}. Sign in with that email address.`);
      const existingMember = await client.query("SELECT school_id, active FROM school_members WHERE user_id = $1", [identity.id]);
      if (existingMember.rowCount && existingMember.rows[0].active && existingMember.rows[0].school_id !== invite.school_id) {
        throw new Error("This account already belongs to another active school. Contact support if your school membership needs to be transferred.");
      }
      const displayName = cleanText(body.displayName || identity.email.split("@")[0], 100, "Display name");
      await client.query(
        `INSERT INTO school_members (school_id, user_id, email, display_name, role, permissions)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id, email = EXCLUDED.email,
           display_name = EXCLUDED.display_name, role = EXCLUDED.role, permissions = EXCLUDED.permissions, active = true`,
        [invite.school_id, identity.id, identity.email, displayName, invite.role, invite.permissions]
      );
      await client.query("UPDATE school_invites SET accepted_by = $2, accepted_at = now() WHERE id = $1", [invite.id, identity.id]);
      await notify(client, identity.id, invite.school_id, "welcome", "Welcome to your school workspace", `You joined ${invite.school_name} as a ${invite.role.replace("_", " ")}.`);
      await client.query("COMMIT");
      return { ok: true, schoolName: invite.school_name, role: invite.role };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "invite-member") {
    const member = await requireSchoolMember(pool, identity, body.schoolId);
    requirePermission(member, "invite_and_manage_accounts");
    if (body.role === "school_admin") throw new Error("Only the StudyGroup administrator can issue school admin invitations.");
    return createSchoolInvite(pool, { schoolId: member.school_id, email: body.email, role: body.role, permissions: body.permissions, createdBy: identity.id });
  }

  if (action === "create-assignment") {
    const member = await requireSchoolMember(pool, identity, body.schoolId);
    requirePermission(member, "post_homework");
    if (!(["teacher", "school_admin"].includes(member.role))) throw new Error("Only teachers can post homework.");
    const title = cleanText(body.title, 180, "Homework title");
    const subject = cleanText(body.subject, 80, "Subject");
    const instructions = cleanText(body.instructions, 5000, "Instructions");
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Choose a valid due date.");
    if (body.attachment && (!String(body.attachment.publicId || "").startsWith(`studygroup/schools/${member.school_id}/teacher-homework/`) || body.attachment.resourceType !== "raw")) throw new Error("The homework attachment was not uploaded through the secure school upload flow.");
    const teacherIds = [...new Set([identity.id, ...(Array.isArray(body.teacherIds) ? body.teacherIds : [])])];
    const validTeachers = await pool.query(
      "SELECT user_id FROM school_members WHERE school_id = $1 AND user_id = ANY($2::text[]) AND role IN ('teacher', 'school_admin') AND active = true",
      [member.school_id, teacherIds]
    );
    if (validTeachers.rowCount !== teacherIds.length) throw new Error("One of the selected co-teachers is not an active teacher at this school.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query(
        `INSERT INTO school_assignments (school_id, title, subject, instructions, due_at, attachment, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
        [member.school_id, title, subject, instructions, dueAt, body.attachment ? JSON.stringify(body.attachment) : null, identity.id]
      );
      for (const teacherId of teacherIds) await client.query("INSERT INTO assignment_teachers (assignment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [created.rows[0].id, teacherId]);
      await client.query(
        `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
         SELECT user_id, $1, 'homework', $2, $3, $4 FROM school_members WHERE school_id = $1 AND role = 'student' AND active = true`,
        [member.school_id, `New ${subject} homework`, title, created.rows[0].id]
      );
      await client.query("COMMIT");
      return { ok: true, assignmentId: created.rows[0].id };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "update-assignment") {
    const member = await requireSchoolMember(pool, identity);
    requirePermission(member, "edit_shared_homework");
    if (!["teacher", "school_admin"].includes(member.role)) throw new Error("Only teachers can edit school homework.");
    const title = cleanText(body.title, 180, "Homework title");
    const subject = cleanText(body.subject, 80, "Subject");
    const instructions = cleanText(body.instructions, 5000, "Instructions");
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new Error("Choose a valid due date.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT * FROM school_assignments WHERE id = $1 AND school_id = $2 FOR UPDATE", [body.assignmentId, member.school_id]);
      const assignment = found.rows[0];
      if (!assignment) throw new Error("Homework not found in your school.");
      const assigned = await client.query("SELECT 1 FROM assignment_teachers WHERE assignment_id = $1 AND user_id = $2", [assignment.id, identity.id]);
      if (member.role !== "school_admin" && !assigned.rowCount && assignment.created_by !== identity.id) throw new Error("You are not assigned to edit this homework.");
      await client.query("UPDATE school_assignments SET title = $2, subject = $3, instructions = $4, due_at = $5 WHERE id = $1", [assignment.id, title, subject, instructions, dueAt]);
      await client.query(
        `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
         SELECT user_id, $1, 'homework_update', 'Homework updated', $2, $3 FROM school_members WHERE school_id = $1 AND role = 'student' AND active = true`,
        [member.school_id, `${title} has been updated by your teacher.`, assignment.id]
      );
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "submit-assignment") {
    const member = await requireSchoolMember(pool, identity);
    if (member.role !== "student") throw new Error("Only student accounts can submit homework.");
    requirePermission(member, "upload_submissions");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const assignment = await client.query("SELECT * FROM school_assignments WHERE id = $1 AND school_id = $2", [body.assignmentId, member.school_id]);
      if (!assignment.rowCount) throw new Error("This homework does not belong to your school.");
      if (body.attachment && (!String(body.attachment.publicId || "").startsWith(`studygroup/schools/${member.school_id}/student-submission/`) || body.attachment.resourceType !== "raw")) throw new Error("The submission attachment was not uploaded through the secure school upload flow.");
      const textAnswer = String(body.textAnswer || "").trim();
      if (textAnswer.length > 10000) throw new Error("Your written answer is too long.");
      if (!textAnswer && !body.attachment) throw new Error("Write an answer or attach a file before submitting.");
      const saved = await client.query(
        `INSERT INTO assignment_submissions (assignment_id, student_id, text_answer, attachment, submitted_at)
         VALUES ($1, $2, $3, $4::jsonb, now())
         ON CONFLICT (assignment_id, student_id) DO UPDATE SET text_answer = EXCLUDED.text_answer,
           attachment = COALESCE(EXCLUDED.attachment, assignment_submissions.attachment), submitted_at = now(), grade = NULL, grade_feedback = '', graded_by = NULL, graded_at = NULL
         RETURNING id`,
        [body.assignmentId, identity.id, textAnswer, body.attachment ? JSON.stringify(body.attachment) : null]
      );
      const teachers = await client.query("SELECT user_id FROM assignment_teachers WHERE assignment_id = $1", [body.assignmentId]);
      for (const teacher of teachers.rows) await notify(client, teacher.user_id, member.school_id, "submission", "A student submitted homework", `${member.display_name} submitted ${assignment.rows[0].title}.`, saved.rows[0].id);
      await client.query("COMMIT");
      return { ok: true, submissionId: saved.rows[0].id };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "comment") {
    const member = await requireSchoolMember(pool, identity);
    const bodyText = cleanText(body.body, 2000, "Comment");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT sub.*, a.school_id, a.title, a.created_by FROM assignment_submissions sub
         JOIN school_assignments a ON a.id = sub.assignment_id WHERE sub.id = $1 FOR UPDATE`, [body.submissionId]
      );
      const submission = result.rows[0];
      if (!submission || submission.school_id !== member.school_id) throw new Error("Submission not found in your school.");
      const teacherRows = await client.query("SELECT user_id FROM assignment_teachers WHERE assignment_id = $1", [submission.assignment_id]);
      const teacherIds = teacherRows.rows.map((row) => row.user_id);
      const isStudentOwner = member.role === "student" && submission.student_id === identity.id && member.permissions.includes("comment_privately_to_teachers");
      const isAssignedTeacher = ["teacher", "school_admin"].includes(member.role) && (member.role === "school_admin" || teacherIds.includes(identity.id) || submission.created_by === identity.id);
      if (!isStudentOwner && !isAssignedTeacher) throw new Error("Only this student and the homework's assigned teachers can comment.");
      const inserted = await client.query("INSERT INTO assignment_comments (submission_id, author_id, body) VALUES ($1, $2, $3) RETURNING id", [submission.id, identity.id, bodyText]);
      const recipients = isStudentOwner ? teacherIds : [submission.student_id];
      for (const recipient of recipients) await notify(client, recipient, member.school_id, "comment", "New private homework comment", `${member.display_name} commented on ${submission.title}.`, inserted.rows[0].id);
      await client.query("COMMIT");
      return { ok: true, commentId: inserted.rows[0].id };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "grade-submission") {
    const member = await requireSchoolMember(pool, identity);
    requirePermission(member, "grade_student_work");
    if (!["teacher", "school_admin"].includes(member.role)) throw new Error("Only teachers can grade submissions.");
    const grade = Number(body.grade);
    if (!Number.isFinite(grade) || grade < 0 || grade > 100) throw new Error("Enter a grade between 0 and 100.");
    const feedback = String(body.feedback || "").trim();
    if (feedback.length > 2000) throw new Error("Feedback must be 2,000 characters or fewer.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `SELECT sub.id, sub.student_id, a.school_id, a.created_by, a.title FROM assignment_submissions sub
         JOIN school_assignments a ON a.id = sub.assignment_id WHERE sub.id = $1 FOR UPDATE`, [body.submissionId]
      );
      const submission = result.rows[0];
      if (!submission || submission.school_id !== member.school_id) throw new Error("Submission not found in your school.");
      const assigned = await client.query("SELECT 1 FROM assignment_teachers WHERE assignment_id = (SELECT assignment_id FROM assignment_submissions WHERE id = $1) AND user_id = $2", [submission.id, identity.id]);
      if (member.role !== "school_admin" && !assigned.rowCount && submission.created_by !== identity.id) throw new Error("You are not assigned to grade this homework.");
      await client.query("UPDATE assignment_submissions SET grade = $2, grade_feedback = $3, graded_by = $4, graded_at = now() WHERE id = $1", [submission.id, grade, feedback, identity.id]);
      await notify(client, submission.student_id, member.school_id, "grade", "Your homework has been graded", `${submission.title}: ${grade}%${feedback ? ` · ${feedback}` : ""}.`, submission.id);
      await client.query("COMMIT");
      return { ok: true };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  if (action === "mark-notification-read") {
    const result = await pool.query("UPDATE school_notifications SET read_at = now() WHERE id = $1 AND recipient_id = $2 RETURNING id", [body.notificationId, identity.id]);
    if (!result.rowCount) throw new Error("Notification not found.");
    return { ok: true };
  }

  if (action === "file-url") {
    const member = await requireSchoolMember(pool, identity);
    let attachment = null;
    if (body.kind === "assignment") {
      const result = await pool.query("SELECT attachment FROM school_assignments WHERE id = $1 AND school_id = $2", [body.resourceId, member.school_id]);
      attachment = result.rows[0]?.attachment;
    } else if (body.kind === "submission") {
      const result = await pool.query(
        `SELECT sub.attachment, sub.student_id, a.school_id, a.created_by, a.id AS assignment_id FROM assignment_submissions sub
         JOIN school_assignments a ON a.id = sub.assignment_id WHERE sub.id = $1 AND a.school_id = $2`, [body.resourceId, member.school_id]
      );
      const submission = result.rows[0];
      if (submission) {
        const assigned = await pool.query("SELECT 1 FROM assignment_teachers WHERE assignment_id = $1 AND user_id = $2", [submission.assignment_id, identity.id]);
        const allowed = member.role === "school_admin" || submission.student_id === identity.id || assigned.rowCount || submission.created_by === identity.id;
        if (allowed) attachment = submission.attachment;
      }
    }
    if (!attachment?.publicId) throw new Error("File not found or you do not have permission to access it.");
    const url = cloudinary.utils.private_download_url(attachment.publicId, attachment.format || "bin", {
      resource_type: attachment.resourceType || "raw", type: "authenticated", expires_at: Math.floor(Date.now() / 1000) + 300
    });
    return { url };
  }

  throw new Error("Unknown school workspace action.");
}

async function cloudinarySignature(identity, body) {
  if (!identity) throw new Error("Please sign in before uploading a file.");
  const member = await requireSchoolMember(pool, identity, body.schoolId);
  if (body.purpose === "teacher-homework") {
    requirePermission(member, "post_homework");
    if (!["teacher", "school_admin"].includes(member.role)) throw new Error("Only teachers can upload homework files.");
  } else if (body.purpose === "student-submission") {
    requirePermission(member, "upload_submissions");
    if (member.role !== "student") throw new Error("Only students can upload submission files.");
  } else throw new Error("Unknown school upload purpose.");
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    timestamp,
    folder: `studygroup/schools/${member.school_id}/${body.purpose}`,
    type: "authenticated",
    upload_preset: uploadPreset,
    unique_filename: true,
    overwrite: false
  };
  return {
    cloudName,
    apiKey: cloudApiKey,
    resourceType: "raw",
    params,
    signature: cloudinary.utils.api_sign_request(params, cloudApiSecret)
  };
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
      const result = await handleSchoolAction(identity, body);
      sendJson(response, 200, result, origin);
      return;
    }

    if (url.pathname === "/api/cloudinary/signature") {
      if (request.method !== "POST") throw new Error("Method not allowed.");
      const body = await readJson(request);
      const result = await cloudinarySignature(identity, body);
      sendJson(response, 200, result, origin);
      return;
    }

    sendJson(response, 404, { error: "Not found" }, origin);
  } catch (error) {
    console.error("API error:", error);
    sendJson(response, 400, { error: error.message || "Internal server error" }, origin);
  }
});

server.listen(port, () => {});
