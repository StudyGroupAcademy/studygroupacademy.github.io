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
  return groupId ? isGroupMember(client, uid, groupId) : false;
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
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin"
  });
  response.end(JSON.stringify(body));
}

function requestOrigin(request) {
  const origin = request.headers.origin;
  return allowedOrigins.has(origin) ? origin : null;
}

async function completeLearningActivity(uid, activityId) {
  if (!xpActivityIds.has(activityId)) throw new Error("This learning activity is not recognised.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const progressPath = `users/${uid}/learningProgress/${activityId}`;
    const existing = await record(client, progressPath);
    if (existing?.data?.completed) {
      await client.query("COMMIT");
      return { awarded: false, xp: Number(existing.data.xp) || 10 };
    }

    await applyMutation(client, uid, {
      op: "set",
      path: progressPath.split("/"),
      data: { completed: true, xp: 10, completedAt: { __studygroupTimestamp: new Date().toISOString() } }
    }, true);

    const leaderboardPath = `publicLeaderboard/${uid}`;
    const leaderboard = await record(client, leaderboardPath);
    if (leaderboard) {
      const currentXp = Number(leaderboard.data.xp) || 0;
      const nextData = applyFields(leaderboard.data, { xp: currentXp + 10 });
      await client.query(
        "UPDATE app_records SET data = $2::jsonb, updated_at = now() WHERE path = $1 AND owner_id = $3",
        [leaderboardPath, JSON.stringify(nextData), uid]
      );
    }
    await client.query("COMMIT");
    return { awarded: true, xp: 10, totalXp: leaderboard ? (Number(leaderboard.data.xp) || 0) + 10 : null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function syncLeaderboardXp(uid) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const leaderboardPath = `publicLeaderboard/${uid}`;
    const leaderboard = await record(client, leaderboardPath);
    if (!leaderboard) {
      await client.query("COMMIT");
      return { synced: false, xp: 0 };
    }
    const progress = await client.query(
      "SELECT path, data FROM app_records WHERE owner_id = $1 AND path LIKE $2",
      [uid, `users/${uid}/learningProgress/%`]
    );
    const xp = progress.rows.reduce((total, row) => {
      const activityId = row.path.split("/").at(-1);
      return xpActivityIds.has(activityId) && row.data.completed
        ? total + (Number(row.data.xp) || 10)
        : total;
    }, 0);
    const nextData = applyFields(leaderboard.data, { xp });
    await client.query(
      "UPDATE app_records SET data = $2::jsonb, updated_at = now() WHERE path = $1 AND owner_id = $3",
      [leaderboardPath, JSON.stringify(nextData), uid]
    );
    await client.query("COMMIT");
    return { synced: true, xp };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function authenticatedUser(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: authIssuer
    });
    return typeof payload.sub === "string" && payload.sub
      ? { id: payload.sub, email: typeof payload.email === "string" ? payload.email.toLowerCase() : "" }
      : null;
  } catch (error) {
    console.warn("Rejected an invalid Neon Auth access token.", error.code || error.name);
    return null;
  }
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} is required and must be no longer than ${maxLength} characters.`);
  }
  return value.trim();
}

async function schoolMember(userId, schoolId) {
  const result = await pool.query(
    `SELECT m.school_id, m.user_id, m.email, m.display_name, m.role, m.permissions, m.active,
            s.name AS school_name, s.domain AS school_domain
     FROM school_members m JOIN schools s ON s.id = m.school_id
     WHERE m.user_id = $1 AND m.school_id = $2 AND m.active = true`,
    [userId, schoolId]
  );
  return result.rows[0] || null;
}

async function requireSchoolPermission(userId, schoolId, permission) {
  const member = await schoolMember(userId, schoolId);
  if (!member) throw new Error("You are not an active member of this school.");
  if (member.role !== "school_admin" && !member.permissions.includes(permission)) {
    throw new Error(`Your school has not granted the ${permission.replaceAll("_", " ")} permission.`);
  }
  return member;
}

function randomInviteToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function schoolRequest(identity, body) {
  const action = body.action;
  if (action === "apply") {
    const schoolName = requiredText(body.schoolName, "School name", 160);
    const website = requiredText(body.website, "School website", 250);
    const address = requiredText(body.address, "School address", 400);
    const contactName = requiredText(body.contactName, "Contact name", 120);
    const contactEmail = requiredText(body.contactEmail, "Contact email", 254).toLowerCase();
    const verificationDetails = requiredText(body.verificationDetails, "School verification details", 2000);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error("Enter a valid school contact email.");
    const websiteUrl = new URL(website.startsWith("http") ? website : `https://${website}`);
    if (!["https:", "http:"].includes(websiteUrl.protocol)) throw new Error("Enter a valid school website.");
    const schoolDomain = websiteUrl.hostname.replace(/^www\./, "").toLowerCase();
    const result = await pool.query(
      `INSERT INTO school_applications
        (school_name, school_domain, website, address, contact_name, contact_email, verification_details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, school_name, school_domain, status, created_at`,
      [schoolName, schoolDomain, websiteUrl.toString(), address, contactName, contactEmail, verificationDetails]
    );
    const application = result.rows[0];
    await pool.query(
      `INSERT INTO school_notifications (recipient_email, kind, title, body, target_id)
       VALUES ($1, 'school_application', $2, $3, $4)`,
      [schoolAdminEmail, `School approval requested: ${schoolName}`, `${contactName} (${contactEmail}) submitted a school application.`, application.id]
    );
    return { application };
  }

  if (!identity) throw new Error("Sign in to continue.");

  if (action === "context") {
    const memberResult = await pool.query(
      `SELECT m.school_id, m.user_id, m.email, m.display_name, m.role, m.permissions, m.active,
              s.name AS school_name, s.domain AS school_domain
       FROM school_members m JOIN schools s ON s.id = m.school_id
       WHERE m.user_id = $1 AND m.active = true LIMIT 1`,
      [identity.id]
    );
    const member = memberResult.rows[0] || null;
    if (!member) {
      const pending = await pool.query(
        `SELECT id, school_name, status, created_at FROM school_applications
         WHERE contact_email = $1 ORDER BY created_at DESC LIMIT 1`,
        [identity.email]
      );
      const notifications = await pool.query(
        `SELECT id, kind, title, body, created_at FROM school_notifications
         WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 40`,
        [identity.id]
      );
      return { member: null, pendingApplication: pending.rows[0] || null, notifications: notifications.rows };
    }

    if (member.role === "student" && !member.permissions.includes("view_homework")) {
      return { member, assignments: [], teachers: [], notifications: [] };
    }
    const assignments = await schoolRequestAssignments(identity, member);
    const teachers = await pool.query(
      `SELECT user_id, email, display_name, permissions FROM school_members
       WHERE school_id = $1 AND role = 'teacher' AND active = true AND permissions @> ARRAY['edit_shared_homework']::text[]
       ORDER BY display_name`,
      [member.school_id]
    );
    const notifications = await pool.query(
      `SELECT id, kind, title, body, target_id, read_at, created_at FROM school_notifications
       WHERE recipient_id = $1 ORDER BY created_at DESC LIMIT 40`,
      [identity.id]
    );
    return { member, assignments, teachers: teachers.rows, notifications: notifications.rows };
  }

  if (action === "admin-list") {
    if (identity.email !== schoolAdminEmail) throw new Error("Only the StudyGroup school administrator can review applications.");
    const applications = await pool.query(
      `SELECT id, school_id, school_name, school_domain, website, address, contact_name, contact_email,
              verification_details, status, created_at
       FROM school_applications ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`
    );
    const notifications = await pool.query(
      `SELECT id, kind, title, body, target_id, read_at, created_at FROM school_notifications
       WHERE recipient_email = $1 ORDER BY created_at DESC LIMIT 100`,
      [schoolAdminEmail]
    );
    return { applications: applications.rows, notifications: notifications.rows };
  }

  if (action === "create-admin-invite") {
    if (identity.email !== schoolAdminEmail) throw new Error("Only the StudyGroup school administrator can create school invites.");
    const applicationId = requiredText(body.applicationId, "Application", 50);
    const result = await pool.query(
      `SELECT id, school_id, contact_email FROM school_applications
       WHERE id = $1 AND status = 'approved' AND school_id IS NOT NULL`,
      [applicationId]
    );
    const application = result.rows[0];
    if (!application) throw new Error("Approved school application was not found.");
    const token = randomInviteToken();
    await pool.query(
      `INSERT INTO school_invites (school_id, email, role, permissions, token_hash, created_by)
       VALUES ($1, $2, 'school_admin', ARRAY[]::text[], $3, $4)`,
      [application.school_id, application.contact_email, crypto.createHash("sha256").update(token).digest("hex"), identity.id]
    );
    return {
      inviteEmail: application.contact_email,
      inviteUrl: `${allowedOrigin}/?invite=${encodeURIComponent(token)}`
    };
  }

  if (action === "review") {
    if (identity.email !== schoolAdminEmail) throw new Error("Only the StudyGroup school administrator can review applications.");
    if (!["approve", "decline"].includes(body.decision)) throw new Error("Choose approve or decline.");
    const client = await pool.connect();
    const inviteToken = body.decision === "approve" ? randomInviteToken() : null;
    try {
      await client.query("BEGIN");
      const result = await client.query(
        "SELECT * FROM school_applications WHERE id = $1 AND status = 'pending' FOR UPDATE",
        [body.applicationId]
      );
      const application = result.rows[0];
      if (!application) throw new Error("This application was already reviewed or could not be found.");
      let schoolId = null;
      if (body.decision === "approve") {
        const school = await client.query(
          `INSERT INTO schools (name, domain, website, address) VALUES ($1, $2, $3, $4) RETURNING id`,
          [application.school_name, application.school_domain, application.website, application.address]
        );
        schoolId = school.rows[0].id;
        await client.query(
          `INSERT INTO school_invites (school_id, email, role, permissions, token_hash, created_by)
           VALUES ($1, $2, 'school_admin', ARRAY[]::text[], $3, $4)`,
          [schoolId, application.contact_email, crypto.createHash("sha256").update(inviteToken).digest("hex"), identity.id]
        );
      }
      await client.query(
        `UPDATE school_applications
         SET status = $1, school_id = $2, reviewer_id = $3, reviewed_at = now() WHERE id = $4`,
        [body.decision === "approve" ? "approved" : "declined", schoolId, identity.id, application.id]
      );
      await client.query(
        `INSERT INTO school_notifications (recipient_email, school_id, kind, title, body, target_id)
         VALUES ($1, $2, 'school_review', $3, $4, $5)`,
        [
          schoolAdminEmail,
          schoolId,
          `Application ${body.decision} — ${application.school_name}`,
          body.decision === "approve" ? `School admin invite created for ${application.contact_email}.` : `Application from ${application.contact_email} was declined.`,
          application.id
        ]
      );
      await client.query("COMMIT");
      return {
        status: body.decision === "approve" ? "approved" : "declined",
        schoolId,
        inviteUrl: inviteToken ? `${allowedOrigin}/?invite=${encodeURIComponent(inviteToken)}` : null,
        inviteEmail: application.contact_email
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === "accept-invite") {
    const token = requiredText(body.token, "Invite token", 120);
    const displayName = requiredText(body.displayName, "Display name", 80);
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        `SELECT id, school_id, email, role, permissions FROM school_invites
         WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now() FOR UPDATE`,
        [tokenHash]
      );
      const invite = found.rows[0];
      if (!invite) throw new Error("This school invite is invalid, expired, or already used.");
      if (!identity.email || invite.email.toLowerCase() !== identity.email) {
        throw new Error(`Log in with ${invite.email} to accept this school invite.`);
      }
      await client.query(
        `INSERT INTO school_members (school_id, user_id, email, display_name, role, permissions)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET school_id = EXCLUDED.school_id, email = EXCLUDED.email,
           display_name = EXCLUDED.display_name, role = EXCLUDED.role, permissions = EXCLUDED.permissions, active = true`,
        [invite.school_id, identity.id, identity.email, displayName, invite.role, invite.permissions]
      );
      await client.query(
        "UPDATE school_invites SET accepted_by = $1, accepted_at = now() WHERE id = $2",
        [identity.id, invite.id]
      );
      await client.query("COMMIT");
      return { role: invite.role, schoolId: invite.school_id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === "invite-member") {
    const schoolId = requiredText(body.schoolId, "School", 50);
    const inviter = await requireSchoolPermission(identity.id, schoolId, "invite_and_manage_accounts");
    const role = body.role;
    if (!["teacher", "student"].includes(role)) throw new Error("Schools can invite teachers or students.");
    const email = requiredText(body.email, "Email", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    const available = role === "teacher"
      ? ["post_homework", "edit_shared_homework", "review_student_submissions", "invite_and_manage_accounts", "view_student_grades"]
      : ["view_homework", "upload_submissions", "comment_privately_to_teachers", "view_feedback_and_grades"];
    const requested = Array.isArray(body.permissions) ? body.permissions : [];
    if (requested.some((permission) => !available.includes(permission))) throw new Error("The requested permission is not valid for this role.");
    const token = randomInviteToken();
    const result = await pool.query(
      `INSERT INTO school_invites (school_id, email, role, permissions, token_hash, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, role, permissions, expires_at`,
      [schoolId, email, role, requested, crypto.createHash("sha256").update(token).digest("hex"), identity.id]
    );
    await pool.query(
      `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body)
       VALUES ($1, $2, 'member_invite', $3, $4)`,
      [identity.id, schoolId, `${role === "teacher" ? "Teacher" : "Student"} invite created`, `Send this invite link to ${email}.`]
    );
    return { invite: result.rows[0], inviteUrl: `${allowedOrigin}/?invite=${encodeURIComponent(token)}`, createdBy: inviter.user_id };
  }

  if (action === "create-assignment") {
    const schoolId = requiredText(body.schoolId, "School", 50);
    const teacher = await requireSchoolPermission(identity.id, schoolId, "post_homework");
    const title = requiredText(body.title, "Homework title", 180);
    const subject = requiredText(body.subject, "Subject", 100);
    const instructions = requiredText(body.instructions, "Instructions", 5000);
    const dueAt = body.dueAt ? new Date(body.dueAt) : null;
    if (dueAt && !Number.isFinite(dueAt.getTime())) throw new Error("Enter a valid due date and time.");
    const collaborators = [...new Set([identity.id, ...(Array.isArray(body.teacherIds) ? body.teacherIds : [])])];
    const members = await pool.query(
      `SELECT user_id FROM school_members WHERE school_id = $1 AND user_id = ANY($2::text[])
       AND role = 'teacher' AND active = true
       AND (user_id = $3 OR permissions @> ARRAY['edit_shared_homework']::text[])`,
      [schoolId, collaborators, identity.id]
    );
    if (members.rowCount !== collaborators.length) throw new Error("Every co-teacher must be active in the school and allowed to edit shared homework.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO school_assignments (school_id, title, subject, instructions, due_at, attachment, created_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id, school_id, title, subject, instructions, due_at, attachment, created_by, created_at`,
        [schoolId, title, subject, instructions, dueAt, body.attachment ? JSON.stringify(body.attachment) : null, identity.id]
      );
      for (const teacherId of collaborators) {
        await client.query("INSERT INTO assignment_teachers (assignment_id, user_id) VALUES ($1, $2)", [inserted.rows[0].id, teacherId]);
      }
      await client.query(
        `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
         SELECT user_id, $1, 'homework_posted', $2, $3, $4 FROM school_members
         WHERE school_id = $1 AND role = 'student' AND active = true`,
        [schoolId, `New homework: ${title}`, `${subject}${dueAt ? ` · Due ${dueAt.toLocaleString("en-GB")}` : ""}`, inserted.rows[0].id]
      );
      await client.query("COMMIT");
      return { assignment: { ...inserted.rows[0], teacher_ids: collaborators } };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  if (action === "submit-assignment") {
    const assignmentId = requiredText(body.assignmentId, "Homework", 50);
    const memberResult = await pool.query(
      `SELECT school_id FROM school_members WHERE user_id = $1 AND role = 'student' AND active = true
       AND permissions @> ARRAY['upload_submissions']::text[] LIMIT 1`,
      [identity.id]
    );
    const member = memberResult.rows[0];
    if (!member) throw new Error("Your school has not enabled homework submissions for this student account.");
    const assignment = await pool.query(
      "SELECT id, title FROM school_assignments WHERE id = $1 AND school_id = $2",
      [assignmentId, member.school_id]
    );
    if (!assignment.rowCount) throw new Error("This homework is not available in your school.");
    const answer = typeof body.textAnswer === "string" ? body.textAnswer.trim().slice(0, 10000) : "";
    if (!answer && !body.attachment) throw new Error("Add a written answer or upload your work before handing it in.");
    const result = await pool.query(
      `INSERT INTO assignment_submissions (assignment_id, student_id, text_answer, attachment)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET text_answer = EXCLUDED.text_answer,
         attachment = EXCLUDED.attachment, submitted_at = now()
       RETURNING id, assignment_id, student_id, text_answer, attachment, submitted_at`,
      [assignmentId, identity.id, answer, body.attachment ? JSON.stringify(body.attachment) : null]
    );
    await pool.query(
      `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
       SELECT at.user_id, $1, 'homework_submitted', $2, 'A student handed in homework.', $3
       FROM assignment_teachers at WHERE at.assignment_id = $3`,
      [member.school_id, `Homework submitted: ${assignment.rows[0].title}`, assignmentId]
    );
    return { submission: result.rows[0] };
  }

  if (action === "comment") {
    const submissionId = requiredText(body.submissionId, "Submission", 50);
    const text = requiredText(body.body, "Comment", 2000);
    const submission = await pool.query(
      `SELECT s.id, s.assignment_id, s.student_id, a.school_id
       FROM assignment_submissions s JOIN school_assignments a ON a.id = s.assignment_id WHERE s.id = $1`,
      [submissionId]
    );
    const row = submission.rows[0];
    if (!row) throw new Error("Submission not found.");
    const member = await schoolMember(identity.id, row.school_id);
    const assigned = await pool.query(
      "SELECT 1 FROM assignment_teachers WHERE assignment_id = $1 AND user_id = $2",
      [row.assignment_id, identity.id]
    );
    if (row.student_id !== identity.id && !assigned.rowCount) throw new Error("Only the student and teachers assigned to this homework can view or comment.");
    if (row.student_id === identity.id && (!member || member.role !== "student" || !member.permissions.includes("comment_privately_to_teachers"))) {
      throw new Error("Your school has not enabled private teacher comments for your account.");
    }
    if (row.student_id !== identity.id && !member?.permissions.includes("review_student_submissions") && member?.role !== "school_admin") {
      throw new Error("Your school has not allowed you to review student submissions.");
    }
    const result = await pool.query(
      `INSERT INTO assignment_comments (submission_id, author_id, body) VALUES ($1, $2, $3)
       RETURNING id, submission_id, author_id, body, created_at`,
      [submissionId, identity.id, text]
    );
    if (row.student_id === identity.id) {
      await pool.query(
        `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
         SELECT user_id, $1, 'submission_comment', 'New private comment on homework', $2, $3
         FROM assignment_teachers WHERE assignment_id = $3`,
        [row.school_id, text.slice(0, 180), row.assignment_id]
      );
    } else {
      await pool.query(
        `INSERT INTO school_notifications (recipient_id, school_id, kind, title, body, target_id)
         VALUES ($1, $2, 'teacher_feedback', 'Your teacher replied to your homework', $3, $4)`,
        [row.student_id, row.school_id, text.slice(0, 180), row.assignment_id]
      );
    }
    return { comment: result.rows[0] };
  }

  if (action === "mark-notification-read") {
    const result = await pool.query(
      `UPDATE school_notifications SET read_at = now()
       WHERE id = $1 AND recipient_id = $2 RETURNING id`,
      [body.notificationId, identity.id]
    );
    if (!result.rowCount) throw new Error("Notification not found.");
    return { ok: true };
  }

  if (action === "file-url") {
    const kind = body.kind;
    const resourceId = requiredText(body.resourceId, "File owner", 50);
    let file;
    if (kind === "assignment") {
      const result = await pool.query(
        `SELECT a.attachment, a.school_id, a.id
         FROM school_assignments a WHERE a.id = $1`,
        [resourceId]
      );
      const assignment = result.rows[0];
      if (!assignment) throw new Error("Homework was not found.");
      const member = await schoolMember(identity.id, assignment.school_id);
      if (!member) throw new Error("You are not an active member of this school.");
      if (member.role === "teacher") {
        const assigned = await pool.query("SELECT 1 FROM assignment_teachers WHERE assignment_id = $1 AND user_id = $2", [resourceId, identity.id]);
        if (!assigned.rowCount) throw new Error("You are not assigned to this homework.");
      }
      if (member.role === "student" && (!member.permissions.includes("view_homework") || !assignment.attachment)) {
        throw new Error("This homework file is not available to your account.");
      }
      file = assignment.attachment;
    } else if (kind === "submission") {
      const result = await pool.query(
        `SELECT s.attachment, s.assignment_id, s.student_id, a.school_id
         FROM assignment_submissions s JOIN school_assignments a ON a.id = s.assignment_id
         WHERE s.id = $1`,
        [resourceId]
      );
      const submission = result.rows[0];
      if (!submission) throw new Error("Submission was not found.");
      const member = await schoolMember(identity.id, submission.school_id);
      if (!member) throw new Error("You are not an active member of this school.");
      if (member.role === "student" && (submission.student_id !== identity.id || !member.permissions.includes("upload_submissions"))) {
        throw new Error("You can only download your own submitted work.");
      }
      if (member.role === "teacher") {
        const assigned = await pool.query(
          "SELECT 1 FROM assignment_teachers WHERE assignment_id = $1 AND user_id = $2",
          [submission.assignment_id, identity.id]
        );
        if (!assigned.rowCount || !member.permissions.includes("review_student_submissions")) {
          throw new Error("You are not allowed to view this submission.");
        }
      }
      file = submission.attachment;
    } else {
      throw new Error("Choose a valid school file.");
    }
    if (!file?.publicId || !file?.format) throw new Error("This record has no attached file.");
    const url = cloudinary.utils.private_download_url(file.publicId, file.format, {
      api_key: cloudApiKey,
      api_secret: cloudApiSecret,
      cloud_name: cloudName,
      resource_type: file.resourceType || "raw",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300,
      attachment: true
    });
    return { url };
  }

  throw new Error("Unsupported school request.");
}

async function schoolRequestAssignments(identity, member) {
  const assignments = await pool.query(
    `SELECT a.id, a.title, a.subject, a.instructions, a.due_at, a.attachment, a.created_by, a.created_at,
            COALESCE(array_agg(DISTINCT at.user_id) FILTER (WHERE at.user_id IS NOT NULL), ARRAY[]::text[]) AS teacher_ids,
            s.id AS submission_id, s.text_answer, s.attachment AS submission_attachment, s.submitted_at
     FROM school_assignments a
     JOIN assignment_teachers at ON at.assignment_id = a.id
     LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.student_id = $2
     WHERE a.school_id = $1
       AND ($3 = 'student' OR at.user_id = $2 OR $3 = 'school_admin')
     GROUP BY a.id, s.id, s.text_answer, s.attachment, s.submitted_at
     ORDER BY a.due_at NULLS LAST, a.created_at DESC LIMIT 200`,
    [member.school_id, identity.id, member.role]
  );
  const results = [];
  for (const assignment of assignments.rows) {
    const canReview = member.role === "school_admin" || member.permissions.includes("review_student_submissions");
    const submissions = member.role === "student" || !canReview ? [] : (await pool.query(
      `SELECT s.id, s.student_id, s.text_answer, s.attachment, s.submitted_at
       FROM assignment_submissions s WHERE s.assignment_id = $1 ORDER BY s.submitted_at DESC`,
      [assignment.id]
    )).rows;
    const ownSubmission = assignment.submission_id ? {
      id: assignment.submission_id,
      text_answer: assignment.text_answer,
      attachment: assignment.submission_attachment,
      submitted_at: assignment.submitted_at
    } : null;
    const visibleSubmissions = member.role === "student" ? (ownSubmission ? [ownSubmission] : []) : submissions;
    const comments = [];
    for (const submission of visibleSubmissions) {
      const commentRows = await pool.query(
        `SELECT id, submission_id, author_id, body, created_at FROM assignment_comments
         WHERE submission_id = $1 ORDER BY created_at`,
        [submission.id]
      );
      comments.push(...commentRows.rows);
    }
    results.push({ ...assignment, own_submission: ownSubmission, submissions: visibleSubmissions, comments });
  }
  return results;
}

const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const origin = requestOrigin(request);
  if (request.method === "GET" && path === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (!origin) {
    sendJson(response, 403, { error: "Origin is not allowed." }, "null");
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin"
    });
    response.end();
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 404, { error: "Not found." }, origin);
    return;
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    sendJson(response, 400, { error: error.message || "Invalid JSON request." }, origin);
    return;
  }

  const identity = await authenticatedUser(request);
  const userId = identity?.id || null;
  const isPublicSchoolApplication = path === "/api/schools" && body.action === "apply";
  if (!identity && body.op !== "list" && !isPublicSchoolApplication) {
    sendJson(response, 401, { error: "A valid Neon Auth session is required." }, origin);
    return;
  }

  try {
    if (path === "/api/schools") {
      const result = await schoolRequest(identity, body);
      sendJson(response, 200, result, origin);
      return;
    }
    if (path === "/api/data") {
      const result = body.op === "completeActivity"
        ? await completeLearningActivity(userId, body.activityId)
        : body.op === "syncXp"
          ? await syncLeaderboardXp(userId)
          : await dataRequest(userId, body);
      sendJson(response, 200, result, origin);
      return;
    }
    if (path === "/api/cloudinary/signature") {
      if (!userId) {
        sendJson(response, 401, { error: "A valid Neon Auth session is required." }, origin);
        return;
      }
      let folder;
      if (body.purpose === "teacher-homework" || body.purpose === "student-submission") {
        const schoolId = requiredText(body.schoolId, "School", 50);
        const requiredPermission = body.purpose === "teacher-homework" ? "post_homework" : "upload_submissions";
        const member = await requireSchoolPermission(userId, schoolId, requiredPermission);
        if (body.purpose === "student-submission" && member.role !== "student") {
          throw new Error("Only students can upload work for submission.");
        }
        if (body.purpose === "teacher-homework" && member.role !== "teacher" && member.role !== "school_admin") {
          throw new Error("Only authorized teachers can upload homework instructions.");
        }
        folder = `studygroup/schools/${schoolId}/${body.purpose}/${userId}`;
      } else {
        throw new Error("School uploads must be attached to a permitted homework workflow.");
      }
      const timestamp = Math.floor(Date.now() / 1000);
      const params = {
        folder,
        overwrite: "false",
        public_id: crypto.randomUUID(),
        timestamp,
        type: "authenticated",
        upload_preset: uploadPreset
      };
      const signature = cloudinary.utils.api_sign_request(params, cloudApiSecret);
      sendJson(response, 200, { apiKey: cloudApiKey, cloudName, params, resourceType: "raw", signature }, origin);
      return;
    }
    sendJson(response, 404, { error: "Not found." }, origin);
  } catch (error) {
    const forbidden = /permission|available|owner|read this data|only the|not an active|not enabled|not allowed|not authorized/i.test(error.message);
    console.error("StudyGroup API request failed.", error);
    sendJson(response, forbidden ? 403 : 400, { error: error.message || "The request could not be completed." }, origin);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`StudyGroup API listening on port ${port}`);
});
