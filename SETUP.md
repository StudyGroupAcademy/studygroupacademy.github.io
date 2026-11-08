# StudyGroup Academy setup

## Firebase Authentication

The browser now uses Firebase Authentication for Google sign-in, email/password registration and login, password resets, and Google account linking. The Firebase project is `studygroup-b5135`.

In Firebase Console:

1. Open Authentication and choose Get started if Authentication has not been enabled.
2. Under Sign-in method, enable Google and Email/Password.
3. Under Settings → Authorized domains, add `studygroupacademy.github.io`.
4. Set the public-facing project name and support email for the Google provider.
5. In Authentication → Templates, configure the email verification and password reset templates.

The Firebase web configuration is in `auth-client.js`. It contains public client configuration only. Never put a service-account private key, database password, or other server secret in frontend files.

## Render environment

Keep these environment variables in Render:

- `FRONTEND_ORIGIN=https://studygroupacademy.github.io`
- `FRONTEND_ORIGINS` (optional comma-separated additional website origins)
- `FIREBASE_PROJECT_ID=studygroup-b5135`
- `DATABASE_URL` (the existing Neon PostgreSQL connection string)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_UPLOAD_PRESET`
- `SCHOOL_ADMIN_EMAIL` (optional; the platform admin is configured in server code)

Remove `NEON_AUTH_BASE_URL` and `NEON_AUTH_JWKS_URL` from Render after deploying this version. Neon PostgreSQL remains the application database. Only Neon Auth is replaced.

The Render API verifies Firebase ID tokens against Google's public signing keys and checks the expected Firebase project issuer and audience. It does not need a Firebase service-account key.

## Existing account and data continuity

The backend creates a `firebase_auth_identities` mapping table. For a returning user, it can associate the Firebase UID with an existing StudyGroup user record when the existing profile contains the same verified email address. Application records and school records remain in Neon.

Some older StudyGroup profiles may not contain an email address in their stored profile document. Those accounts cannot be safely matched automatically by email. Do not delete Neon Auth or its users until those accounts have been checked and linked. Email/password credentials are not transferred from Neon Auth; affected users will need to create/reset credentials in Firebase or use a verified Google account. Never copy passwords or password hashes manually.

## Deployment

Deploy the whole repository to GitHub Pages and deploy `server.mjs`, `migrations/001_initial.sql`, and the package files to Render. Render must be deployed before the frontend because the frontend calls `/api/identity` to resolve the user's existing StudyGroup database identity.

Run `npm test` for the unit tests and `npm run build` to syntax-check the server and browser JavaScript modules.

## Public learner profile URLs

GitHub Pages uses the root `404.html` fallback for clean profile paths such as `https://studygroupacademy.github.io/ayaan`. Keep `404.html` at the repository root and deploy it with `profile.js` and `styles.css`. The profile script reads the handle from the requested path; the older `/?ayaan` form remains supported for compatibility. GitHub Pages still serves fallback pages with an HTTP 404 status, which is a limitation of static hosting even though the profile content renders in the browser.

## Leaderboard XP synchronisation

The dashboard and homepage call the authenticated `/api/data` `syncXp` operation for opted-in learners. The server rebuilds lifetime and current-period XP from completed learning activity records, then updates the public leaderboard and profile records. Deploy the updated `server.mjs` to Render as well as the frontend files to GitHub Pages.
