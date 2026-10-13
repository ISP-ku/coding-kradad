# Project D: Course Support & Activity Dashboard

## Group members

1.Sirapat Pringprom(pringpromn-lang)
2.Chatthaya Tipatnaranan(chatthaya)
3.Thanutdit Jiravichalert(thanutdit-ku)
4.Kasithat Panya(zortorrrr)

## Current project status

FastAPI backend and Next.js frontend with KU Google (@ku.th) sign-in only.
Discord and LINE login are removed. Google Classroom permissions are no longer requested.

Start with [KU_LOGIN_SETUP.md](KU_LOGIN_SETUP.md) for Google OAuth configuration, local startup commands, tests and troubleshooting.

The real backend is source/app.py. source/test_ui.py is a separate fake UI preview only.

## Local testing without Google

See [LOCAL_TEST_LOGIN.md](LOCAL_TEST_LOGIN.md). This mode runs through source/app.py and reads test users from data/allowed_users.json. Real Google login remains available.

## Project layout

- source/: FastAPI authentication and backend tests
- nextjs-frontend/: Next.js interface and frontend tests
- templates/: fallback backend login page and legacy UI preview
- .github/workflows/ci.yml: backend tests, frontend tests and production build
- docs/: existing course documents
