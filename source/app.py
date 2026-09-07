"""
Simple Flask demo: "Login with Discord" using OAuth2.

Flow:
1. User clicks "Login with Discord" -> redirected to Discord's authorize page.
2. Discord redirects back to /callback with a ?code=...
3. We exchange that code for an access token.
4. We use the access token to fetch the user's Discord profile.
5. We store basic profile info in the Flask session (this is our "logged in" state).

Setup required (see README.md):
- Create a Discord Application at https://discord.com/developers/applications
- Copy Client ID and Client Secret into the .env file (or set as env vars)
- Add http://localhost:5000/callback as a Redirect URI in the Discord app's OAuth2 settings
"""

import os
import requests
from flask import Flask, redirect, request, session, url_for, render_template

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

# ---- Discord OAuth2 config ----
DISCORD_CLIENT_ID = os.environ.get("DISCORD_CLIENT_ID", "")
DISCORD_CLIENT_SECRET = os.environ.get("DISCORD_CLIENT_SECRET", "")
DISCORD_REDIRECT_URI = os.environ.get("DISCORD_REDIRECT_URI", "http://localhost:5000/callback")

DISCORD_API_BASE = "https://discord.com/api"
AUTHORIZE_URL = f"{DISCORD_API_BASE}/oauth2/authorize"
TOKEN_URL = f"{DISCORD_API_BASE}/oauth2/token"
USER_URL = f"{DISCORD_API_BASE}/users/@me"

# Scopes: "identify" gives basic profile (id, username, avatar). Add "email" if you need it.
OAUTH_SCOPES = "identify"


@app.route("/")
def index():
    user = session.get("user")
    return render_template("index.html", user=user)


@app.route("/login")
def login():
    """Redirect the user to Discord's OAuth2 authorize page."""
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": OAUTH_SCOPES,
    }
    query_string = "&".join(f"{k}={requests.utils.quote(str(v))}" for k, v in params.items())
    return redirect(f"{AUTHORIZE_URL}?{query_string}")


@app.route("/callback")
def callback():
    """Discord redirects here after the user approves the login."""
    code = request.args.get("code")
    error = request.args.get("error")

    if error:
        return f"Discord returned an error: {error}", 400
    if not code:
        return "Missing authorization code from Discord.", 400

    # Step 1: exchange the code for an access token
    token_data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": DISCORD_REDIRECT_URI,
    }
    token_headers = {"Content-Type": "application/x-www-form-urlencoded"}

    token_response = requests.post(TOKEN_URL, data=token_data, headers=token_headers)
    if token_response.status_code != 200:
        return f"Failed to get access token: {token_response.text}", 400

    access_token = token_response.json()["access_token"]

    # Step 2: use the access token to fetch the user's Discord profile
    profile_response = requests.get(
        USER_URL, headers={"Authorization": f"Bearer {access_token}"}
    )
    if profile_response.status_code != 200:
        return f"Failed to fetch user profile: {profile_response.text}", 400

    profile = profile_response.json()

    # Step 3: store what we need in the session (this is your "logged in" state)
    session["user"] = {
        "id": profile.get("id"),
        "username": profile.get("username"),
        "discriminator": profile.get("discriminator"),
        "avatar_url": (
            f"https://cdn.discordapp.com/avatars/{profile.get('id')}/{profile.get('avatar')}.png"
            if profile.get("avatar")
            else None
        ),
    }

    return redirect(url_for("dashboard"))


@app.route("/dashboard")
def dashboard():
    """A page only reachable if the user is logged in."""
    user = session.get("user")
    if not user:
        return redirect(url_for("index"))
    return render_template("dashboard.html", user=user)


@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("index"))


if __name__ == "__main__":
    if not DISCORD_CLIENT_ID or not DISCORD_CLIENT_SECRET:
        print("WARNING: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET are not set.")
        print("Set them as environment variables before running, see README.md")
    app.run(debug=True, port=5000)
