# KU Google login setup

This version replaces Discord, LINE and Google Classroom login with one **Sign in with KU Google** button. Accepted accounts must have a verified @ku.th email and Google's hosted-domain claim must be ku.th. Personal @gmail.com and Nontri @ku.ac.th accounts are not accepted by this KU-Google flow.

Your application never asks for or stores the user's Google password. Google handles authentication. Only the basic openid/email/profile permissions are requested; Classroom and mailbox access are not requested.

## 1. Configure Google OAuth once

1. Open https://console.cloud.google.com/ and select/create your project's Google Cloud project.
2. Configure the Google Auth Platform consent screen (app name, support email and audience). Use Internal only if the project belongs to the KU Workspace organization and you have permission; otherwise use External. If the console requires test users for your testing setup, add your team's @ku.th addresses.
3. Create an OAuth client of type **Web application**. You can reuse your existing Google Web application client if you update its redirect URI.
4. Add this exact **Authorized redirect URI**:
   `http://localhost:8000/callback/google`
5. Copy the client ID and client secret into the root .env file below. Keep the secret only on the backend. Do not put it in Next.js or commit .env.

You do not need to enable the Classroom API. If KU blocks third-party access to your OAuth app, the university Workspace administrator may need to allow it; the application cannot override university policy.

## 2. Configure the backend

In the project root, copy `.env.example` to `.env` and enter:

```dotenv
SESSION_SECRET=your-generated-random-secret
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/callback/google
FRONTEND_URL=http://localhost:3000
HOST=127.0.0.1
PORT=8000
COOKIE_SECURE=0
```

Generate a secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Install dependencies and start FastAPI from the project root:

```bash
python -m venv .venv
```

Windows PowerShell activation: `.venv\Scripts\Activate.ps1`

macOS/Linux activation: `source .venv/bin/activate`

```bash
python -m pip install -r source/requirements-dev.txt
python source/app.py
```

## 3. Configure Next.js

Copy `nextjs-frontend/.env.local.example` to `nextjs-frontend/.env.local`:

```dotenv
API_BASE_URL=http://localhost:8000
UI_PREVIEW=0
```

In a second terminal:

```bash
cd nextjs-frontend
npm ci
npm run dev
```

Open **http://localhost:3000**. Use localhost consistently for both services; do not open the frontend at 127.0.0.1 while the callback uses localhost. Cookies share a hostname across ports.

## 4. Try the real flow

- Click Sign in with KU Google and select your @ku.th account.
- Google redirects through FastAPI, which validates the signed ID token, client ID, issuer, expiration, nonce, hosted domain and verified email.
- FastAPI stores the basic profile in an HTTP-only signed ku_session cookie and redirects to the Next.js dashboard.
- Next.js forwards that cookie server-side to GET /api/me. Signed-out requests receive 401.
- Log out, then reopen /dashboard; you should return to the sign-in page.
- A personal Gmail account must receive a 403 denial, even if it is selected manually.

## Troubleshooting

- `redirect_uri_mismatch`: the Google console redirect URI must exactly match .env, including port and path.
- `503 login is not configured`: set both Google credentials and restart FastAPI.
- Repeated sign-in page: confirm both servers are running, UI_PREVIEW=0, matching localhost names, and COOKIE_SECURE=0 for HTTP.
- State/nonce/expired login error: start a fresh login from the button; do not reuse a callback URL.
- Changing the session secret invalidates existing sessions. If unset, a random development secret is generated each backend start.

## Tests and limitations

```bash
cd source
python -m pytest -q
```

From nextjs-frontend:

```bash
npm test
npm run build
```

Tests simulate Google responses and verify KU allow/deny rules, nonce/state validation, replay attempts with consumed sessions, logout, removed provider routes and frontend cookie forwarding. They do not use real KU credentials. Real Google/KU sign-in must be confirmed with your configured OAuth client.

A KU account can sign in only if it is a member of at least one course (SRS-23). Anyone else sees "Your KU account is not registered in any course on this dashboard." Each sign-in is recorded in the `users` table (SQLite `dashboard.db` by default, or `DATABASE_URL`) with the account's role.

- **Access page (`/access`, lecturers only).** Create courses, add or remove KU emails, and set each account's role (student, TA or lecturer). The role is per account, not per course. Changes apply on the person's next request; they do not have to sign out first.
- **`LECTURER_EMAILS`.** Always lecturers and always allowed in, even with no course. They cannot be removed or demoted on the Access page. Set at least one, so someone can open the Access page on a fresh install.
- **`TA_EMAILS`.** Only the starting role when a lecturer adds an email without choosing a role.
- **`data/course_roster.json`** (or `COURSE_ROSTER_FILE`). Loaded once, on the first start with no courses. After that the database is the source of truth. A missing or invalid file loads nothing, so only `LECTURER_EMAILS` can sign in until a lecturer adds people.
- A lecturer cannot remove or demote themselves, so at least one lecturer always keeps access.

See `source/users.py`, `source/access.py` and `source/roster.py`.

`source/test_ui.py` remains a separate fake UI demonstration and must not be used as the real backend. Next.js UI_PREVIEW=1 is available only in development and is disabled in production builds.

For future deployment, use HTTPS with COOKIE_SECURE=1, a stable SESSION_SECRET, and a same-host reverse proxy for frontend/backend routes. Separate unrelated deployment domains need additional cookie/session integration; this package is configured for local development.

Official references:
- https://ocs.ku.ac.th/email-services/
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/identity/sign-in/web/backend-auth
- https://developers.google.com/identity/protocols/oauth2/web-server

## Local backend testing without Google

See [LOCAL_TEST_LOGIN.md](LOCAL_TEST_LOGIN.md) for the new backend test login. Keep UI_PREVIEW=0 to exercise FastAPI and Next.js together.

## Local verification results

44 backend tests passed; 24 frontend tests passed; Next.js production build passed. Checked using Python 3.12 and Node 24 locally. The GitHub CI workflow retains Python 3.11 from your uploaded project; its hosted run is not yet verified.

## When KU ALL blocks sign-in

KU's Google Workspace sends every @ku.th Google sign-in to KU ALL. If KU ALL cannot verify someone (the Google page says the account "can't be accessed because your identity couldn't be verified"), no app can skip that step: it is a university setting. Two other ways in:

### Password sign-in

On the Access page, a lecturer clicks **Create password** next to the person. The server makes a random 14-character password and shows it once; the lecturer passes it on. The person chooses **Sign in with a password from your lecturer** on the sign-in page (`/sign-in/password`) and types their @ku.th address and that password. No Google, KU ALL or email is involved, and nothing needs to be configured.

- Only a scrypt hash is stored. **New password** replaces it (the old one stops working); **Remove** turns password sign-in off for that person. Removing someone from their last course also deletes their password.
- 5 wrong tries lock the password for 15 minutes (a new password unlocks it). A wrong address and a wrong password get the same answer.
- Course membership and the Access page role still apply, exactly as with Google sign-in.
- A `LECTURER_EMAILS` lecturer's password can only be created by that lecturer.
- Someone who signs in with Google one day and with a password the next stays the same user: their homework, tasks and posts follow them.

### Personal Google accounts (optional)

Set `ALLOW_PERSONAL_GOOGLE=1`. The Access page then accepts Gmail addresses, and the sign-in page shows **Continue with a personal Google account**, which does not go through KU ALL.

- Only Gmail addresses a lecturer has added to a course can sign in, even if `REQUIRE_COURSE_MEMBERSHIP=0`.
- The app no longer proves the person is a KU member; it trusts the lecturer who added the address.
- Two different Google accounts are never merged into one user.

