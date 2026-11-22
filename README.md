# Project D: Course Support & Activity Dashboard

A course dashboard for lecturers, teaching assistants and students: a shared
activity schedule with TA tasks, homework, a consultation log, a FAQ board and
history reports. FastAPI backend, Next.js frontend.

## Group members

| # | Name | GitHub |
|---|------|--------|
| 1 | Sirapat Pringprom | [pringpromn-lang](https://github.com/pringpromn-lang) |
| 2 | Chatthaya Tipatnaranan | [chatthaya](https://github.com/chatthaya) |
| 3 | Thanutdit Jiravichalert | [thanutdit-ku](https://github.com/thanutdit-ku) |
| 4 | Kasithat Panya | [zortorrrr](https://github.com/zortorrrr) |

## What each role can do

| Page | Student | TA | Lecturer |
|------|:-------:|:--:|:--------:|
| Dashboard: activities and TA tasks (`/dashboard`) | | ✓ | ✓ (also adds activities) |
| Homework (`/homework`) | to do and hand in | grade | assign and track |
| Consultation log (`/consultations`) | | ✓ | |
| Reports: activity and support-load history (`/reports`) | | | ✓ |
| Course access: courses, members and roles (`/access`) | | | ✓ |
| FAQ board (`/faq`) | ✓ | ✓ | ✓ (also approves topics) |

The backend checks every role on the server; the frontend only hides what a
role cannot use.

## Signing in

- **KU Google (@ku.th)** is the normal way in. Only members of at least one
  course can sign in; lecturers manage who is in each course on the Access page.
- **Lecturer-set password**, for people KU ALL will not let through. A lecturer
  creates it on the Access page.
- **Personal Gmail** (optional, off by default with `ALLOW_PERSONAL_GOOGLE=0`),
  for accounts a lecturer added on the Access page.
- **Local test login** (development only), to try the app without Google. See
  [LOCAL_TEST_LOGIN.md](LOCAL_TEST_LOGIN.md).

`LECTURER_EMAILS` in `.env` are always lecturers and always allowed in, so set
at least one before the first start.

## Running it locally

Full setup, including Google OAuth and troubleshooting, is in
[KU_LOGIN_SETUP.md](KU_LOGIN_SETUP.md). In short:

```bash
# Backend (http://localhost:8000)
cp .env.example .env          # then fill in the values
python -m venv .venv
.venv\Scripts\Activate.ps1    # Windows; on macOS/Linux: source .venv/bin/activate
python -m pip install -r source/requirements-dev.txt
python source/app.py

# Frontend (http://localhost:3000), in a second terminal
cd nextjs-frontend
cp .env.local.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000, and use `localhost` (not `127.0.0.1`) for both.

## Deploying

The app deploys for free as one Render web service with a Neon PostgreSQL
database. Step-by-step instructions are in [DEPLOY.md](DEPLOY.md).

## Tests

From the repo root:

```bash
(cd source && python -m pytest -q)                                     # backend
(cd nextjs-frontend && npx tsc --noEmit && npm test && npm run build)  # frontend
```

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs the
same checks on every push and pull request.

## Project layout

- `source/`: FastAPI backend. `app.py` is the real server (sign-in and
  sessions); each feature has its own router (`activities.py`, `homework.py`,
  `consultations.py`, `faq.py`, `reports.py`, `access.py`), with tests in
  `test_*.py`. `roster.py` loads `data/course_roster.json` on first start.
  `test_ui.py` is a separate fake UI preview, not the real backend.
- `nextjs-frontend/`: Next.js app. Pages in `app/`, components in
  `components/`, and shared helpers and API clients in `lib/`.
- `data/`: the starting course roster and the local test users.
- `templates/`: the backend's fallback login page and the legacy UI preview.
- `docs/`: course documents.

See [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commit messages and pull requests.
