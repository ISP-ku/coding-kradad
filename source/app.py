"""
Flask app: multi-provider login for the Course Support & Activity Dashboard.

Providers supported (all standard OAuth2 "Authorization Code" flow):
- Discord -> basic profile only (identify)
- Google  -> profile + a read-only list of the user's Google Classroom courses
- LINE    -> LINE Login profile (LINE calls its OAuth app a "channel")

Flow (same shape for every provider):
1. User clicks a "Login with X" button -> GET /login/<provider>
   -> we redirect to that provider's authorize page, carrying a random
      one-time `state` value for CSRF protection.
2. Provider redirects back to GET /callback/<provider>?code=...&state=...
   -> we check `state` matches what we generated, exchange the code for an
      access token, then fetch the user's profile with that token.
   -> for Google specifically, we also call the Classroom API to list courses.
3. We store a normalized profile dict in the Flask session - this is our
   "logged in" state.

Setup required for each provider (see README.md for the full walkthrough):
- Discord:  https://discord.com/developers/applications
- Google:   https://console.cloud.google.com/  (enable the "Google Classroom API")
- LINE:     https://developers.line.biz/console/  (create a "LINE Login" channel,
            NOT a Messaging API channel - those are different products)

Environment variables (or put them in a .env file next to this script - see
.env.example at the project root):
    FLASK_SECRET_KEY
    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI
    GOOGLE_CLIENT_ID,  GOOGLE_CLIENT_SECRET,  GOOGLE_REDIRECT_URI
    LINE_CLIENT_ID,    LINE_CLIENT_SECRET,    LINE_REDIRECT_URI
    PORT, HOST (optional - default 127.0.0.1:5000)
"""

import os
import secrets
from pathlib import Path

import requests
from flask import Flask, abort, redirect, render_template, request, session, url_for

try:
    from dotenv import load_dotenv
    load_dotenv()  # reads a .env file in the current directory, if present
except ImportError:
    pass  # python-dotenv is optional; exporting env vars another way still works

# templates/ and static/ live at the project root, one level above this
# file's folder (source/). Building the path from __file__ keeps this
# correct no matter which directory you launch the app from, on macOS,
# Linux or Windows.
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

app = Flask(__name__, template_folder=str(TEMPLATE_DIR), static_folder=str(STATIC_DIR))
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5000"))


def _redirect_uri(env_name, default_path):
    """Read <NAME>_REDIRECT_URI from the environment, or build a localhost
    default from the HOST/PORT this process will actually bind to. Keeping
    this in sync with the real bind address matters: every provider only
    ever redirects back to a URI you registered with them ahead of time, so
    if we silently ran on a different port than this default assumes, the
    callback would never reach us."""
    return os.environ.get(env_name, f"http://localhost:{PORT}{default_path}")


# ---- Provider configuration ----
# Each provider needs: client_id/secret, the 3 OAuth endpoints, the scopes
# we ask for, and (below) a fetch_<provider>_profile() function that turns
# that provider's raw profile response into our normalized shape.

PROVIDERS = {
    "discord": {
        "client_id": os.environ.get("DISCORD_CLIENT_ID", ""),
        "client_secret": os.environ.get("DISCORD_CLIENT_SECRET", ""),
        "redirect_uri": _redirect_uri("DISCORD_REDIRECT_URI", "/callback/discord"),
        "authorize_url": "https://discord.com/api/oauth2/authorize",
        "token_url": "https://discord.com/api/oauth2/token",
        "scope": "identify",
        "auth_extra": {},
    },
    "google": {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        "redirect_uri": _redirect_uri("GOOGLE_REDIRECT_URI", "/callback/google"),
        "authorize_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        # openid+email+profile = who they are; classroom.courses.readonly = what
        # we need to list their Google Classroom courses on the dashboard.
        "scope": (
            "openid email profile "
            "https://www.googleapis.com/auth/classroom.courses.readonly"
        ),
        # access_type=offline + prompt=consent so Google actually issues a
        # refresh_token (useful later if the dashboard wants to refresh
        # Classroom data without forcing the user to log in again).
        "auth_extra": {"access_type": "offline", "prompt": "consent"},
    },
    "line": {
        "client_id": os.environ.get("LINE_CLIENT_ID", ""),
        "client_secret": os.environ.get("LINE_CLIENT_SECRET", ""),
        "redirect_uri": _redirect_uri("LINE_REDIRECT_URI", "/callback/line"),
        "authorize_url": "https://access.line.me/oauth2/v2.1/authorize",
        "token_url": "https://api.line.me/oauth2/v2.1/token",
        "scope": "profile openid",
        "auth_extra": {},
    },
}

REQUEST_TIMEOUT = 10  # seconds - don't hang forever if a provider is slow/down


def build_authorize_url(provider_name, state):
    provider = PROVIDERS[provider_name]
    params = {
        "client_id": provider["client_id"],
        "redirect_uri": provider["redirect_uri"],
        "response_type": "code",
        "scope": provider["scope"],
        "state": state,
        **provider["auth_extra"],
    }
    query_string = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return f"{provider['authorize_url']}?{query_string}"


def exchange_code_for_token(provider_name, code):
    """Step 1 of every provider's flow: trade the one-time code for an access token."""
    provider = PROVIDERS[provider_name]
    data = {
        "client_id": provider["client_id"],
        "client_secret": provider["client_secret"],
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": provider["redirect_uri"],
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    response = requests.post(provider["token_url"], data=data, headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()["access_token"]


def fetch_discord_profile(access_token):
    r = requests.get(
        "https://discord.com/api/users/@me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    profile = r.json()
    avatar = profile.get("avatar")
    return {
        "provider": "discord",
        "id": profile.get("id"),
        "username": profile.get("username"),
        "email": None,
        "avatar_url": (
            f"https://cdn.discordapp.com/avatars/{profile.get('id')}/{avatar}.png"
            if avatar else None
        ),
        "classroom_courses": None,
    }


def fetch_google_classroom_courses(access_token):
    """Best-effort: list up to 20 active Google Classroom courses for this user.

    Returns None (rather than raising) if the call fails - e.g. the Classroom
    API isn't enabled yet on the Google Cloud project, or the account has no
    courses. A login should never fail just because this extra step did.
    """
    try:
        r = requests.get(
            "https://classroom.googleapis.com/v1/courses",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"courseStates": "ACTIVE", "pageSize": 20},
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        courses = r.json().get("courses", [])
        return [{"id": c.get("id"), "name": c.get("name")} for c in courses]
    except requests.RequestException:
        return None


def fetch_google_profile(access_token):
    r = requests.get(
        "https://openidconnect.googleapis.com/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    profile = r.json()
    return {
        "provider": "google",
        "id": profile.get("sub"),
        "username": profile.get("name") or profile.get("email"),
        "email": profile.get("email"),
        "avatar_url": profile.get("picture"),
        "classroom_courses": fetch_google_classroom_courses(access_token),
    }


def fetch_line_profile(access_token):
    r = requests.get(
        "https://api.line.me/v2/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    r.raise_for_status()
    profile = r.json()
    return {
        "provider": "line",
        "id": profile.get("userId"),
        "username": profile.get("displayName"),
        "email": None,  # LINE only returns email with a special approved scope
        "avatar_url": profile.get("pictureUrl"),
        "classroom_courses": None,
    }


PROFILE_FETCHERS = {
    "discord": fetch_discord_profile,
    "google": fetch_google_profile,
    "line": fetch_line_profile,
}


@app.route("/")
def index():
    user = session.get("user")
    return render_template("index.html", user=user)


@app.route("/login/<provider>")
def login(provider):
    """Redirect the user to <provider>'s OAuth2 authorize page."""
    if provider not in PROVIDERS:
        abort(404, f"Unknown login provider: {provider}")

    # A random, one-time `state` value proves the /callback we receive later
    # was actually triggered by this login attempt, and not forged by an
    # attacker linking a victim to the attacker's own account (login CSRF).
    # We check it again in callback() below.
    state = secrets.token_urlsafe(24)
    session["oauth_state"] = state
    session["oauth_provider"] = provider
    return redirect(build_authorize_url(provider, state))


@app.route("/login")
def login_legacy():
    """Backward-compatible alias for a Discord app already registered with
    the old (pre-multi-provider) redirect URI of just /login."""
    return redirect(url_for("login", provider="discord"))


@app.route("/callback/<provider>")
def callback(provider):
    """Every provider redirects back here after the user approves the login."""
    if provider not in PROVIDERS:
        abort(404, f"Unknown login provider: {provider}")

    error = request.args.get("error")
    if error:
        return f"{provider.title()} returned an error: {error}", 400

    code = request.args.get("code")
    if not code:
        return f"Missing authorization code from {provider.title()}.", 400

    expected_state = session.pop("oauth_state", None)
    got_state = request.args.get("state")
    expected_provider = session.pop("oauth_provider", None)
    if not expected_state or got_state != expected_state or expected_provider != provider:
        return "Login request could not be verified (state mismatch). Please try logging in again.", 400

    try:
        access_token = exchange_code_for_token(provider, code)
        profile = PROFILE_FETCHERS[provider](access_token)
    except requests.RequestException as exc:
        return f"Failed to complete {provider.title()} login: {exc}", 400

    session["user"] = profile
    return redirect(url_for("dashboard"))


@app.route("/callback")
def callback_legacy():
    """Backward-compatible alias for a Discord app already registered with
    the old (pre-multi-provider) redirect URI of just /callback."""
    return callback("discord")


@app.route("/dashboard")
def dashboard():
    """A page only reachable if the user is logged in."""
    user = session.get("user")
    if not user:
        return redirect(url_for("index"))
    # dashboard.html is shared with test_ui.py, which also defines /faq and
    # /homework demo pages; this app doesn't (yet), so we tell the template
    # not to render those links here rather than crash with a BuildError.
    return render_template("dashboard.html", user=user, has_faq=False, has_homework=False)


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("index"))


if __name__ == "__main__":
    # NOTE: with debug=True below, Flask's reloader re-executes this entire
    # file in a child process (WERKZEUG_RUN_MAIN=true) to watch for code
    # changes; that child inherits the parent's already-bound listening
    # socket. A "probe" pre-check here (bind a throwaway socket first to see
    # if the port is free, then let app.run() bind for real) sounds
    # reasonable but is NOT safe with that reloader: the check runs again in
    # the child, sees the parent's own live socket, and reports a false
    # "port in use" - killing an otherwise-healthy server. So we don't
    # pre-check; we let app.run() bind for real and rely on Werkzeug's own
    # "Address already in use" message (it already suggests checking for
    # AirPlay Receiver on macOS) if that fails. If your *_REDIRECT_URI env
    # vars assume a specific port, remember to update them to match PORT.
    missing = [
        name for name, cfg in PROVIDERS.items()
        if not cfg["client_id"] or not cfg["client_secret"]
    ]
    if missing:
        print(f"WARNING: missing client id/secret for: {', '.join(missing)}")
        print("Those login buttons will redirect but fail at the provider. See README.md.")

    if not TEMPLATE_DIR.is_dir():
        raise SystemExit(f"Cannot find the templates folder at {TEMPLATE_DIR}")

    app.run(debug=True, host=HOST, port=PORT)
