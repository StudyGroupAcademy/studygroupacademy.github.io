# StudyGroup Academy setup

## Google sign-in

The Google button uses Neon Auth social sign-in. Enable Google as a social provider in the Neon project that owns the Auth URL configured in `auth-client.js`.

In Google Cloud Console, create a Web OAuth client and add this authorised redirect URI:

`https://ep-wispy-firefly-zavoom2z.neonauth.c-2.eu-west-2.aws.neon.tech/neondb/auth/callback/google`

Add the Google client ID and client secret to the Google provider configuration in Neon Auth. Do not put the client secret in frontend files or commit it to GitHub.

Add the production website origin to Neon Auth's trusted/allowed domains. The app currently redirects successful sign-ins to `/dashboard/` on the same website origin.

The browser client sends credentialed requests to the Neon Auth host. The browser must accept the Neon Auth session cookie after the OAuth redirect and send it on requests from the website. If a browser blocks cross-site cookies for the Neon Auth domain, the SDK cannot restore a session from frontend JavaScript alone; use a browser that permits the cookie or move the app and auth traffic behind a supported same-site custom-domain/proxy setup.

## Render environment

The API server requires these environment variables:

- `FRONTEND_ORIGIN`
- `FRONTEND_ORIGINS` (optional comma-separated additional website origins)
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_JWKS_URL`
- `DATABASE_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_UPLOAD_PRESET`
- `SCHOOL_ADMIN_EMAIL` (optional)

Keep database credentials, OAuth client secrets, and Cloudinary secrets in Render's environment settings only.

## Checks

Run `npm test` for the existing unit tests and `npm run build` to syntax-check the server and browser JavaScript modules.
