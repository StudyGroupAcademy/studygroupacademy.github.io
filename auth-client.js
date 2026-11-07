import { createAuthClient } from "https://esm.sh/@neon/neon-js@0.10.2/auth?bundle";
import { BetterAuthVanillaAdapter } from "https://esm.sh/@neon/neon-js@0.10.2/auth/vanilla/adapters?bundle";

export const authClient = createAuthClient(
  "https://ep-wispy-firefly-zavoom2z.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth",
  {
    adapter: BetterAuthVanillaAdapter({
      fetchOptions: { credentials: "include" }
    })
  }
);
