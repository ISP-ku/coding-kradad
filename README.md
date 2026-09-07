# Project D: Course Support & Activity Dashboard

## Group members

1.Sirapat Pringprom(pringpromn-lang)
2.Chatthaya Tipatnaranan(chatthaya)
3.Thanutdit Jiravichalert(thanutdit-ku)
4.Kasithat Panya(zortorrrr)

## Current project status

A minimal "Login with Discord" demo. Clicking the button sends the user to
Discord, they approve, Discord sends them back with their profile, and the
app stores that in a session.

## 1. Install dependencies

```bash
pip install -r requirements.txt --break-system-packages
```

## 2. Create a Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application**, give it a name (e.g. "Course Dashboard Demo")
3. In the left sidebar, click **OAuth2** → **General**
4. Copy the **Client ID** and **Client Secret**
5. Under **Redirects**, click **Add Redirect** and enter:
   ```
   http://localhost:5000/callback
   ```
   Save changes.

## 3. Set environment variables

Before running, set these (replace with your real values):

```bash
export DISCORD_CLIENT_ID="your_client_id_here"
export DISCORD_CLIENT_SECRET="your_client_secret_here"
export DISCORD_REDIRECT_URI="http://localhost:5000/callback"
export FLASK_SECRET_KEY="any-random-string"
```

On Windows (PowerShell):
```powershell
$env:DISCORD_CLIENT_ID="your_client_id_here"
$env:DISCORD_CLIENT_SECRET="your_client_secret_here"
$env:DISCORD_REDIRECT_URI="http://localhost:5000/callback"
$env:FLASK_SECRET_KEY="any-random-string"
```

## 4. Run it

```bash
python app.py
```

Open http://localhost:5000 in your browser, click **Login with Discord**,
approve the request, and you'll land on a dashboard showing your Discord
username and avatar.

## How this maps to your SRS

- This demo covers **authentication only** (URS-1 / SRS-1: "require users
  to authenticate before displaying any course data").
- After login, `session["user"]["id"]` is the Discord user ID — in your
  real app, you'd look this up against your **Users & Roles table** to
  determine if the person is a TA, Lecturer, or Student, and route them
  accordingly.
- This is NOT a notifications/bot integration — sending messages to Discord
  is a separate feature (a bot token + webhook, not OAuth), and your SRS
  explicitly marks automated notifications as out of scope for this
  iteration. Keep this demo scoped to login only when presenting.

## Files

- `app.py` — Flask routes and the OAuth2 exchange logic
- `templates/index.html` — landing page with the Discord login button
- `templates/dashboard.html` — page shown after successful login
- `requirements.txt` — Python dependencies
