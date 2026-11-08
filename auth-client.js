import { createAuthClient } from "https://esm.sh/@neon/neon-js@0.10.2/auth?bundle";

export const authClient = createAuthClient(
  "https://ep-wispy-firefly-zavoom2z.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth",
  {
    fetchOptions: {
      credentials: "include"
    }
  }
);

export function getSessionUser(result) {
  const data = result?.data || result || {};
  return data.user || data.session?.user || data.data?.user || data.data?.session?.user || null;
}

export function getSessionRecord(result) {
  const data = result?.data || result || {};
  return data.session || data.data?.session || null;
}

export function normalizeSessionResult(result) {
  const data = result?.data || {};
  return {
    ...data,
    user: getSessionUser(result),
    session: getSessionRecord(result)
  };
}

export async function getAuthToken() {
  if (typeof authClient.token === "function") {
    const tokenResult = await authClient.token();
    if (tokenResult.error) throw tokenResult.error;
    if (tokenResult.data?.token) return tokenResult.data.token;
  }
  const sessionResult = await authClient.getSession();
  if (sessionResult.error) throw sessionResult.error;
  const session = getSessionRecord(sessionResult);
  return session?.token
    || session?.access_token
    || session?.accessToken
    || sessionResult.data?.token
    || null;
}
