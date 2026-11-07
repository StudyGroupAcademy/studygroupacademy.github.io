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
  return groupId ? isGroupMember(client, uid, groupId) : false;
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

async function schoolRequestAssignments(identity, member) {
  if (member.role === "teacher") {
    const res = await pool.query(
      `SELECT a.id, a.school_id, a.title, a.subject, a.instructions, a.due_at, a.attachment, a.created_by, a.created_at
       FROM school_assignments a JOIN assignment_teachers t ON t.assignment_id = a.id
       WHERE a.school_id = $1 AND t.user_id = $2 ORDER BY a.due_at ASC NULLS LAST`,
      [member.school_id, identity.id]
    );
    return res.rows;
  } else {
    const res = await pool.query(
      `SELECT id, school_id, title, subject, instructions, due_at, attachment, created_by, created_at
       FROM school_assignments WHERE school_id = $1 ORDER BY due_at ASC NULLS LAST`,
      [member.school_id]
    );
    return res.rows;
  }
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

  if (action === "submit-assignment") {
    const assignmentId = requiredText(body.assignmentId, "Homework", 50);
    const memberResult = await pool.query(
      "SELECT school_id, role, permissions FROM school_members WHERE user_id = $1 AND active = true",
      [identity.id]
    );
    const member = memberResult.rows[0];
    if (!member || member.role !== "student" || !member.permissions.includes("upload_submissions")) {
      throw new Error("You do not have permission to submit homework.");
    }
    const attachment = body.attachment;
    if (!attachment || typeof attachment.url !== "string" || typeof attachment.publicId !== "string") {
      throw new Error("A valid file attachment is required for submission.");
    }
    const result = await pool.query(
      `INSERT INTO school_submissions (assignment_id, user_id, attachment)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (assignment_id, user_id)
       DO UPDATE SET attachment = EXCLUDED.attachment, updated_at = now()
       RETURNING id, assignment_id, user_id, attachment, submitted_at`,
      [assignmentId, identity.id, JSON.stringify(attachment)]
    );
    return { submission: result.rows[0] };
  }

  throw new Error("Unknown school action.");
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

    if (url.pathname === "/api/school") {
      if (request.method !== "POST") throw new Error("Method not allowed.");
      const body = await readJson(request);
      const result = await schoolRequest(identity, body);
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
