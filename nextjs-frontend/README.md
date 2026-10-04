# coding-kradad — frontend (Next.js)

Port of `templates/*.html` (Flask + Jinja2, inline `<style>` blocks) to
Next.js App Router with CSS Modules.

## Mapping

| Old (Flask)             | New (Next.js)                          |
|--------------------------|-----------------------------------------|
| `templates/index.html`  | `app/page.tsx` + `app/page.module.css` |
| `templates/dashboard.html` | `app/dashboard/page.tsx` + `.module.css` |
| `templates/faq.html`    | `app/faq/page.tsx` + `.module.css`     |
| `templates/homework.html` | `app/homework/page.tsx` + `.module.css` |
| `{{ url_for('x') }}`    | `next/link` for internal routes, plain `href`/`action` strings pointing at `API_BASE_URL` for backend/OAuth routes |
| session (`session["user"]`) | `lib/session.ts` → `getSessionUser()`, fetches `GET /api/me` from the backend, forwarding the session cookie |

Every class name from the original `<style>` blocks was kept 1:1 in meaning
(just camelCased for CSS Modules, e.g. `.discord-btn` → `.discordBtn`) — no
visual changes were intended in this pass, only the CSS delivery mechanism.

## Setup

```
npm install
cp .env.local.example .env.local   # then point API_BASE_URL at the backend
npm run dev
```

## What's still a stub / needs the backend team

The FastAPI conversion (`backend/fastapi-conversion` branch) needs to expose:

- `GET /api/me` — current session user, 401 if logged out
- `GET /login/discord` / `/login/google` / `/login/line` — OAuth start (same as old Flask routes)
- `GET /logout`
- `GET /api/faq?q=...`, `POST /faq/submit`
- `GET /api/homework`, `GET /api/homework/assignments`, `POST /homework/submit`

Until those exist, `npm run dev` will render but every fetch will fail
quietly (pages just show empty states) — that's expected, not a bug in
this port.
