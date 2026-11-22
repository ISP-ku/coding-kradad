# Deploying to Render + Neon (free)

The app runs as **one free Render web service**: Next.js is the public site
and passes sign-in and `/api` requests to FastAPI inside the same container
(see `Dockerfile`, `deploy/start.sh` and `render.yaml`). Data lives in a
**free Neon PostgreSQL** database. Both are in Singapore.

What the free plans mean in practice:

- The site **sleeps after 15 minutes** with no visitors. The next visit takes
  about a minute while it wakes up; after that it is normal speed. Open the
  site a minute before a presentation.
- Render gives 512 MB of memory and 0.1 CPU. The app uses about 165 MB.
- Neon gives 1 GB of storage. If a limit is ever reached it pauses the
  database until next month; it never bills you.

You need: a GitHub account with access to `ISP-ku/coding-kradad`, a Google
account for Google Cloud Console (the one that owns the OAuth client), and
about 30 minutes.

## 1. Create the database (Neon)

1. Sign up at <https://neon.com> (the free plan needs no credit card).
2. **Create project**: name it `coding-kradad`, Postgres 17, region
   **AWS Asia Pacific (Singapore)**.
3. Open **Connect**. Turn **Connection pooling off** and copy the connection
   string. It looks like
   `postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
   Keep it secret: it is the database password.

The app creates its tables on first start; there is nothing else to set up.

## 2. Choose the site address

Render names the site after the service: `https://coding-kradad.onrender.com`.
If that name is taken, Render adds a suffix (for example
`coding-kradad-x1y2.onrender.com`). You can check after step 4 and update
steps 3 and 4 if it differs. Below, `<site>` means this address.

## 3. Allow Google sign-in on the site (Google Cloud Console)

1. <https://console.cloud.google.com> → **APIs & Services → Credentials** →
   open the OAuth client the app already uses.
2. Under **Authorized redirect URIs**, add `https://<site>/callback/google`.
   Keep the `http://localhost:8000/callback/google` entry for local work.
   Save.
3. **OAuth consent screen**: if the user type is **External** and the
   publishing status is **Testing**, only listed test users can sign in. Click
   **Publish app** so any @ku.th account can. (If the project belongs to the
   KU Google organization, **Internal** also works and needs no publishing.)

## 4. Create the service (Render)

1. Sign up at <https://render.com> with **GitHub**.
2. **New → Blueprint**, and connect the `ISP-ku/coding-kradad` repository.
   `ISP-ku` is a GitHub organization: GitHub may ask an **organization owner**
   to approve the Render app before the repository shows up.
3. Render reads `render.yaml` and asks for the values marked `sync: false`:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `GOOGLE_CLIENT_ID` | from the OAuth client in step 3 |
   | `GOOGLE_CLIENT_SECRET` | from the OAuth client in step 3 |
   | `FRONTEND_URL` | `https://<site>` (no slash at the end) |
   | `GOOGLE_REDIRECT_URI` | `https://<site>/callback/google` |
   | `LECTURER_EMAILS` | the real lecturers, comma-separated, e.g. `sirapat.pri@ku.th` |
   | `TA_EMAILS` | TAs who should start as TA (can be left empty; roles can also be set on the Access page) |

   Everything else is already set in `render.yaml`: production mode, local
   test login off, secure cookies, any @ku.th account may sign in (as a
   student unless listed above), no demo courses, and a generated
   `SESSION_SECRET`.
4. **Apply**. The first build takes about 5–10 minutes. The service is live
   when its status is **Live** and `https://<site>/api/auth-options` shows
   `{"local_test_login":false, ...}`.

## 5. First sign-in

1. Open `https://<site>` and **Sign in with KU Google** using an address in
   `LECTURER_EMAILS`.
2. **Access → New course** to create each course, then **Add people** for TAs
   (or put them in `TA_EMAILS`). Students can sign in straight away with their
   @ku.th account; they start as students.
3. Give someone whom KU ALL blocks a password from the Access page; they use
   **Sign in with a password from your lecturer**.

## Updating the site

Render redeploys automatically whenever `main` changes (after a pull request
is merged). To change a setting, edit it under the service's **Environment**
tab; Render restarts the service.

## If something goes wrong

| What you see | Likely cause |
|--------------|--------------|
| Google says `redirect_uri_mismatch` | The redirect URI in step 3 does not exactly match `GOOGLE_REDIRECT_URI` (check `https`, the address, no trailing slash). |
| Google says the app is not verified or access is blocked | The consent screen is still in Testing (step 3.3). |
| You sign in but land back on the sign-in page | `FRONTEND_URL` is not exactly `https://<site>`. |
| The first page after a while takes about a minute | Normal: the free service was asleep. |
| Errors mentioning the database | `DATABASE_URL` is wrong, or the pooled Neon string was used; use the direct one (step 1.3). |
| Render shows the build failed | Open the service's **Events → Deploy** log. |

## Trying the production image locally

With Docker Desktop running, from the repository root:

```bash
docker build -t coding-kradad:local .
docker run --rm -p 10000:10000 --memory=512m \
  -e PORT=10000 -e APP_ENV=production -e COOKIE_SECURE=0 \
  -e FRONTEND_URL=http://localhost:10000 \
  -e GOOGLE_REDIRECT_URI=http://localhost:10000/callback/google \
  -e GOOGLE_CLIENT_ID=... -e GOOGLE_CLIENT_SECRET=... \
  -e SESSION_SECRET=any-long-random-text \
  -e LECTURER_EMAILS=you@ku.th \
  -e COURSE_ROSTER_FILE=/app/data/course_roster.empty.json \
  coding-kradad:local
```

Then open http://localhost:10000. Without `DATABASE_URL` it uses a SQLite
file inside the container, which is lost when the container stops.
`COOKIE_SECURE=0` is only for plain-HTTP local testing; Render uses HTTPS.
In Git Bash on Windows, put `MSYS_NO_PATHCONV=1` before `docker run` so the
`/app/...` path is not rewritten.
