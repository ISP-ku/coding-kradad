# Test FastAPI + Next.js without a Google account

Real KU Google login is still available. This extra mode signs in a fake account through the **same source/app.py backend**, so you can test the backend session, /api/me, Next.js dashboard and logout together.

## 1. Set the backend environment

Copy .env.example to .env in the project root if you do not already have .env. Keep your existing Google credentials and session secret if configured. Add/change:

```dotenv
APP_ENV=development
LOCAL_TEST_LOGIN=1
HOST=127.0.0.1
PORT=8000
FRONTEND_URL=http://localhost:3000
COOKIE_SECURE=0
```

Google credentials can be blank when using only local test login. Generate SESSION_SECRET as described in KU_LOGIN_SETUP.md if you need sessions to persist across backend restarts.

## 2. Choose your test users

Edit **data/allowed_users.json**:

```json
[
  {"email": "test.student@ku.th", "name": "Test Student", "role": "student"},
  {"email": "test.ta@ku.th", "name": "Test TA", "role": "ta"},
  {"email": "test.lecturer@ku.th", "name": "Test Lecturer", "role": "lecturer"}
]
```

These are fake examples, not real mailboxes. The file is read by the backend when you open or submit the test form. Only listed users can use local test login. Editing a role takes effect the next time that user logs in. The role is saved to the `users` table and the session, and role-restricted features use it. For example, sign in as `test.lecturer@ku.th` to see the lecturer-only Reports page.

This file controls local test users only. Real Google login still accepts verified KU Google accounts; it does not use this file as a real-user allowlist.

## 3. Start the backend (terminal 1)

From the project root, activate your Python virtual environment, then:

```bash
python -m pip install -r source/requirements-dev.txt
python source/app.py
```

If you need to create a virtual environment first:

```bash
python -m venv .venv
```

Windows PowerShell: `.venv\Scripts\Activate.ps1`

macOS/Linux: `source .venv/bin/activate`

## 4. Start Next.js (terminal 2)

Create/edit nextjs-frontend/.env.local:

```dotenv
API_BASE_URL=http://localhost:8000
UI_PREVIEW=0
```

Keep UI_PREVIEW=0: the old UI preview would bypass the backend you want to test.

```bash
cd nextjs-frontend
npm ci
npm run dev
```

## 5. Test

1. Open http://localhost:3000.
2. Click **Local test login (no Google)**.
3. Select a user and click **Continue with test account**.
4. You return to the Next.js dashboard with a real backend session for that fake user.
5. Open http://localhost:8000/api/me in the same browser to inspect the selected user and role.
6. Log out. /api/me must return 401 and opening /dashboard must return to sign-in.

You can also start directly at http://localhost:8000/local-test-login.

## Turn local login off

Set LOCAL_TEST_LOGIN=0 and restart FastAPI. Existing local-test sessions are then rejected; real Google sessions continue to work. For deployment set APP_ENV=production as well.

The local endpoints require the flag, development environment, a loopback HOST, a loopback client address, and a localhost/loopback request hostname. The bundled app.py runner disables proxy headers. Do not expose the local test server through a tunnel or reverse proxy; turn off local login before doing so. The test button is hidden in production Next.js builds.

If the button is missing, check both servers are running, open the frontend using localhost, use npm run dev, and restart after changing environment files. A 404 from /local-test-login means one of the local-only checks is not satisfied.

## Automated tests

From the project root: `python -m pytest source -q`

From nextjs-frontend: `npm test` and `npm run build`

Verified locally: 44 backend tests, 24 frontend tests, Next.js production build, and a live HTTP flow through both running servers (login button, account form, dashboard, /api/me and logout).
