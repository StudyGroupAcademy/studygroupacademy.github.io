import { createServer } from "node:http";
import { createRemoteJWKSet, jwtVerify } from "jose";
import cloudinaryPackage from "cloudinary";

const cloudinary = cloudinaryPackage.v2;
const port = Number(process.env.PORT) || 10000;
const frontendOrigin = process.env.FRONTEND_ORIGIN;
const authBaseUrl = process.env.NEON_AUTH_BASE_URL;
const authJwksUrl = process.env.NEON_AUTH_JWKS_URL;
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudApiKey = process.env.CLOUDINARY_API_KEY;
const cloudApiSecret = process.env.CLOUDINARY_API_SECRET;
const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

const requiredConfiguration = {
  FRONTEND_ORIGIN: frontendOrigin,
  NEON_AUTH_BASE_URL: authBaseUrl,
  NEON_AUTH_JWKS_URL: authJwksUrl,
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

const allowedOrigin = new URL(frontendOrigin).origin;
const authIssuer = new URL(authBaseUrl).origin;
const jwks = createRemoteJWKSet(new URL(authJwksUrl));

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
  return origin === allowedOrigin ? origin : null;
}

async function authenticatedUser(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  if (!match) return null;

  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: authIssuer,
      audience: authIssuer
    });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch (error) {
    console.warn("Rejected an invalid Neon Auth access token.", error.code || error.name);
    return null;
  }
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

  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Vary", "Origin");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || path !== "/api/cloudinary/signature") {
    sendJson(response, 404, { error: "Not found." }, origin);
    return;
  }

  const userId = await authenticatedUser(request);
  if (!userId) {
    sendJson(response, 401, { error: "A valid Neon Auth session is required." }, origin);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: `studygroup/homework/${userId}`,
    overwrite: "false",
    public_id: crypto.randomUUID(),
    timestamp,
    type: "authenticated",
    upload_preset: uploadPreset
  };
  const signature = cloudinary.utils.api_sign_request(params, cloudApiSecret);

  sendJson(response, 200, {
    apiKey: cloudApiKey,
    cloudName,
    params,
    resourceType: "raw",
    signature
  }, origin);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`StudyGroup API listening on port ${port}`);
});
