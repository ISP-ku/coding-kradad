# Project D: Course Support & Activity Dashboard

## Group members

1.Sirapat Pringprom(pringpromn-lang)
2.Chatthaya Tipatnaranan(chatthaya)
3.Thanutdit Jiravichalert(thanutdit-ku)
4.Kasithat Panya(zortorrrr)

## Current project status

A "Login with..." demo supporting **Discord**, **Google (with Google
Classroom course listing)**, and **LINE Login**. Clicking any button sends
the user to that provider, they approve, the provider sends them back with
their profile, and the app stores that in a session. For Google, we also
call the Classroom API to list the user's active courses on the dashboard.

`source/test_ui.py` is a separate, credential-free version for previewing
the UI (including a fake Google Classroom course list) without setting up
any real OAuth app - see its own docstring.

## 1. Install dependencies

We recommend a virtual environment so this doesn't touch your system Python:

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r source/requirements.txt
```

## 2. Set up each login provider you want to test

You don't need all three - the app runs fine with only some providers
configured (their buttons will just fail at login until you add credentials).

### Discord

1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name (e.g. "Course Dashboard Demo")
3. In the left sidebar, click **OAuth2** -> **General**
4. Copy the **Client ID** and **Client Secret**
5. Under **Redirects**, click **Add Redirect** and enter:
   ```
   http://localhost:5000/callback/discord
   ```
   Save changes.

### Google (login + Google Classroom course list)

1. Go to https://console.cloud.google.com/ and create (or select) a project
2. **APIs & Services -> Library**: search for **Google Classroom API** and
   click **Enable** (without this, login still works but the course list
   on the dashboard will be empty)
3. **APIs & Services -> OAuth consent screen**: set it to **External**,
   fill in the required fields, and under **Test users** add every
   teammate's Google account (while the app is unpublished/"Testing",
   only test users can actually log in)
4. **APIs & Services -> Credentials -> Create Credentials -> OAuth client ID**
   -> Application type **Web application**
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:5000/callback/google
   ```
6. Copy the **Client ID** and **Client Secret**

Scopes requested: `openid email profile` (who they are) plus
`classroom.courses.readonly` (to list their courses). This is read-only -
we never create, edit, or grade anything in Classroom.

### LINE Login

1. Go to https://developers.line.biz/console/ and create a **Provider**
   (if you don't have one yet)
2. Inside that provider, **Create a new channel** and choose
   **LINE Login** (NOT "Messaging API" - that's a different product, for
   bots, not for signing users in)
3. In the channel's **LINE Login** tab, add a callback URL:
   ```
   http://localhost:5000/callback/line
   ```
4. Copy the **Channel ID** (this is your client ID) and **Channel Secret**
   (Basic settings tab) - these map to `LINE_CLIENT_ID` / `LINE_CLIENT_SECRET`
5. Note: LINE only returns the user's display name and picture with the
   default scopes. An email address requires a special scope that LINE
   must approve per-channel - out of scope for this demo.

## 3. Set environment variables

Easiest: copy `.env.example` (at the project root) to `.env` and fill in
your real values - `app.py` loads it automatically. `.env` is already in
`.gitignore`, so it will never be committed.

```bash
cp .env.example .env
# then edit .env with your values
```

Or export them by hand if you prefer:

```bash
export DISCORD_CLIENT_ID="..."
export DISCORD_CLIENT_SECRET="..."
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export LINE_CLIENT_ID="..."
export LINE_CLIENT_SECRET="..."
export FLASK_SECRET_KEY="any-random-string"
```

On Windows (PowerShell):
```powershell
$env:DISCORD_CLIENT_ID="..."
$env:DISCORD_CLIENT_SECRET="..."
$env:GOOGLE_CLIENT_ID="..."
$env:GOOGLE_CLIENT_SECRET="..."
$env:LINE_CLIENT_ID="..."
$env:LINE_CLIENT_SECRET="..."
$env:FLASK_SECRET_KEY="any-random-string"
```

You only need to set the variables for the provider(s) you're testing.
Redirect URIs default to `http://localhost:5000/callback/<provider>` and
only need overriding if you changed `PORT` or `HOST` (see `.env.example`).

## 4. Run it

```bash
python source/app.py
```

Open http://localhost:5000, click a login button, approve the request, and
you'll land on a dashboard showing your profile (and, for Google, your
active Classroom courses).

**Port already in use?** On macOS, port 5000 is often held by the AirPlay
Receiver. Either turn it off (System Settings -> General -> AirDrop &
Handoff), or run with a different port and update the matching
`*_REDIRECT_URI` (both in `.env` and in each provider's console) to match:
```bash
PORT=5001 python source/app.py
```

## How this maps to your SRS

- This demo covers **authentication only** (URS-1 / SRS-1: "require users
  to authenticate before displaying any course data").
- After login, `session["user"]["id"]` is the provider's user ID - in your
  real app, you'd look this up against your **Users & Roles table** to
  determine if the person is a TA, Lecturer, or Student, and route them
  accordingly. `session["user"]["provider"]` tells you which login method
  they used (`discord`, `google`, or `line`).
- The Google Classroom course list is a **read-only preview** of real
  Classroom data reachable once a user logs in with Google - it's the
  seed for whatever "combined activity dashboard" work you build next
  (deadlines, tasks, consultations), not the finished feature.
- This is NOT a notifications/bot integration for Discord or LINE -
  sending messages to Discord or LINE is a separate feature (a bot token +
  webhook / LINE Messaging API, not OAuth login), and your SRS explicitly
  marks automated notifications as out of scope for this iteration. Keep
  this demo scoped to login (+ Classroom read) only when presenting.

## Files

- `source/app.py` - Flask routes and the OAuth2 exchange logic for
  Discord/Google/LINE, plus the Google Classroom course lookup
- `source/test_ui.py` - credential-free UI preview (fake login for all 3
  providers, plus the FAQ/Homework demo pages)
- `source/requirements.txt` - Python dependencies
- `templates/index.html` - landing page with the 3 login buttons
- `templates/dashboard.html` - page shown after successful login
- `.env.example` - template for the environment variables above
