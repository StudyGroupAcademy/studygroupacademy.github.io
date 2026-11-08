import { createAuthClient } from "https://esm.sh/@neon/neon-js@0.10.2/auth?bundle";

export const authClient = createAuthClient(
  "https://ep-wispy-firefly-zavoom2z.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth",
  {
    fetchOptions: {
      credentials: "include"
    }
  }
);

export async function getAuthToken() {
  if (typeof authClient.token === "function") {
    const tokenResult = await authClient.token();
    if (tokenResult.error) throw tokenResult.error;
    if (tokenResult.data?.token) return tokenResult.data.token;
  }
  const sessionResult = await authClient.getSession();
  if (sessionResult.error) throw sessionResult.error;
  return sessionResult.data?.session?.token
    || sessionResult.data?.session?.access_token
    || sessionResult.data?.session?.accessToken
    || sessionResult.data?.token
    || null;
}
