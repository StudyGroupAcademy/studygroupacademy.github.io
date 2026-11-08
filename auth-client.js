import { createAuthClient } from "https://esm.sh/@neon/neon-js@0.10.2/auth?bundle";

const AUTH_BASE_URL = "https://ep-wispy-firefly-zavoom2z.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth";

export const authClient = createAuthClient(
  AUTH_BASE_URL,
  {
    fetchOptions: {
      credentials: "include"
    }
  }
);

function sessionPayloads(result) {
  const payloads = [];
  const queue = [result];
  const seen = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    payloads.push(value);
    if (value.data && typeof value.data === "object") queue.push(value.data);
  }
  return payloads;
}

export function getSessionUser(result) {
  for (const payload of sessionPayloads(result)) {
    if (payload.user && typeof payload.user === "object") return payload.user;
    if (payload.session?.user && typeof payload.session.user === "object") return payload.session.user;
  }
  return null;
}

export function getSessionRecord(result) {
  for (const payload of sessionPayloads(result)) {
    if (payload.session && typeof payload.session === "object") return payload.session;
  }
  return null;
}

export function normalizeSessionResult(result) {
  const payload = sessionPayloads(result).find((entry) => entry.user || entry.session) || {};
  return {
    ...payload,
    user: getSessionUser(result),
    session: getSessionRecord(result)
  };
}

export async function getCurrentSession({ retries = 0, retryDelay = 250 } = {}) {
  let result = null;
  const sessionUrl = new URL("get-session", `${AUTH_BASE_URL.replace(/\/$/, "")}/`);
  sessionUrl.searchParams.set("disableCookieCache", "true");
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(sessionUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.message || payload?.error?.message || payload?.error || `Neon Auth session check failed (${response.status}).`;
      throw new Error(String(message));
    }
    result = { data: payload, error: null };
    if (getSessionUser(result)) return result;
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }
  return result;
}

export async function getAuthToken() {
  const tokenUrl = new URL("token", `${AUTH_BASE_URL.replace(/\/$/, "")}/`);
  const response = await fetch(tokenUrl, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { Accept: "application/json" }
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.error?.message || payload?.error || `Neon Auth token request failed (${response.status}).`;
    throw new Error(String(message));
  }

  const token = payload?.token || payload?.data?.token;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Neon Auth did not return a JWT. Please sign in again.");
  }

  return token;
}
