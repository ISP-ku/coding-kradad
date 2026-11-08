# Contributing Guide

A short guide for group members working together on this repo.

## Setup

Follow [README.md](README.md) to install dependencies and run the project first.

```bash
pip install -r source/requirements.txt --break-system-packages
```

## Branch

- Never commit directly to `main` — always create a new branch for your work.
- Name branches to describe what you're doing, e.g.:
  - `feature/faq-page`
  - `fix/login-redirect`
  - `docs/update-readme`

```bash
git checkout -b feature/your-feature-name
```

## Commit message

Use the format `<type>: <short description>`. Say what the change does, not which files it touched.

**Allowed Types**

| Type | Use when |
|------|----------|
| `feat` | Adding a new feature |
| `fix` | Fixing a bug |
| `test` | Adding/updating tests |
| `docs` | Updating documentation (README, comments) |
| `style` | Code formatting changes, no logic impact |
| `refactor` | Restructuring code, no new feature or bug fix |
| `chore` | Misc tasks, e.g. setup, dependency updates |
| `perf` | Performance improvements |
| `ci` | CI/pipeline changes |

Good examples: `feat: add faq search filter`, `fix: session not clearing on logout`, `ci: add github actions workflow`
Avoid: `update`, `fix bug`, `asdf`

## Before you push / open a PR

1. Run the app and actually test the flow you changed in the browser (don't just eyeball the code).
2. Make sure the Python files compile:
   ```bash
   python -m py_compile source/*.py
   ```
3. **Never commit secrets** — `DISCORD_CLIENT_SECRET`, `FLASK_SECRET_KEY` must come from environment variables only. Don't hardcode them in code or push a `.env` file to the repo.

## Pull Request

1. Push your branch and open a PR into `main`.
2. Write a short description of what changed and why.
3. Wait for GitHub Actions (CI) to pass before requesting review.
4. Get at least 1 review from a group member before merging.
5. Use **Squash and merge** to keep the history on `main` readable.

## Code style

- Python: follow PEP8 (meaningful variable names, consistent spacing).
- Route/variable names in Flask should match what's used in `templates/` (keep consistent with what's already in `app.py`).
- If you add a new page, also add a fake-data version in `test_ui.py` so teammates can preview the UI without setting up Discord OAuth.

## Reporting issues

Open an Issue in the repo and include:
- What you were doing before hitting the problem
- Expected vs. actual result
- Error message (if any)
