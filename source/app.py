"""
FastAPI app: multi-provider login for the Course Support & Activity Dashboard.

Providers (standard OAuth2 Authorization Code flow):
- Discord -> basic profile (identify)
- Google  -> profile + read-only Google Classroom course list
- LINE    -> LINE Login profile

Flow:
1. GET /login/{provider} -> redirect to provider's authorize page with a
   random `state` value (CSRF protection).
2. Provider redirects to GET /callback/{provider}?code=...&state=...
   -> verify state, exchange code for access token, fetch profile.
3. Normalized profile dict stored in session = "logged in" state.

Setup: see README.md for registering each provider and .env.example for
required environment variables.

Run:
    python app.py
    # or: uvicorn app:app --reload --host 127.0.0.1 --port 5000
"""

import os
import secrets
from pathlib import Path
from typing import Optional

import requests
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from consultations import router as consultations_router
from database import init_db

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# templates/ and static/ live one level above this file's folder (source/).
BASE_DIR = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "5000"))
SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me")

app = FastAPI(title="Course Support & Activity Dashboard")
app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY)

# Consultation logging (SRS-14, SRS-15)
init_db()
app.include_router(consultations_router)

if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

templates = Jinja2Templates(directory=str(TEMPLATE_DIR))


def _redirect_uri(env_name, default_path):
    """Read <NAME>_REDIRECT_URI from env, or default to this process's own
    HOST/PORT. Must match what's registered with the provider exactly."""
    return os.environ.get(env_name, f"http://localhost:{PORT}{default_path}")


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
        "scope": (
            "openid email profile "
            "https://www.googleapis.com/auth/classroom.courses.readonly"
        ),
        # offline + consent so Google issues a refresh_token
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

REQUEST_TIMEOUT = 10


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
    """Returns None on failure instead of raising - login shouldn't fail
    just because this extra step did (e.g. Classroom API not enabled)."""
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


@app.get("/")
async def index(request: Request):
    user = request.session.get("user")
    return templates.TemplateResponse(request, "index.html", {"user": user})


@app.get("/login/{provider}")
async def login(request: Request, provider: str):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown login provider: {provider}")

    # state proves the later callback came from this login attempt (CSRF protection)
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    request.session["oauth_provider"] = provider
    return RedirectResponse(build_authorize_url(provider, state))


@app.get("/login")
async def login_legacy(request: Request):
    """Alias for redirect URIs registered before multi-provider support."""
    return RedirectResponse(str(request.url_for("login", provider="discord")))


@app.get("/callback/{provider}")
async def callback(
    request: Request,
    provider: str,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown login provider: {provider}")

    if error:
        return PlainTextResponse(f"{provider.title()} returned an error: {error}", status_code=400)

    if not code:
        return PlainTextResponse(f"Missing authorization code from {provider.title()}.", status_code=400)

    expected_state = request.session.pop("oauth_state", None)
    expected_provider = request.session.pop("oauth_provider", None)
    if not expected_state or state != expected_state or expected_provider != provider:
        return PlainTextResponse(
            "Login request could not be verified (state mismatch). Please try logging in again.",
            status_code=400,
        )

    try:
        access_token = exchange_code_for_token(provider, code)
        profile = PROFILE_FETCHERS[provider](access_token)
    except requests.RequestException as exc:
        return PlainTextResponse(f"Failed to complete {provider.title()} login: {exc}", status_code=400)

    request.session["user"] = profile
    return RedirectResponse(str(request.url_for("dashboard")))


@app.get("/callback")
async def callback_legacy(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """Alias for redirect URIs registered before multi-provider support."""
    return await callback(request, "discord", code=code, state=state, error=error)


@app.get("/dashboard")
async def dashboard(request: Request):
    user = request.session.get("user")
    if not user:
        return RedirectResponse(str(request.url_for("index")))
    return templates.TemplateResponse(
        request, "dashboard.html", {"user": user, "has_faq": False, "has_homework": False}
    )


@app.get("/logout")
async def logout(request: Request):
    request.session.pop("user", None)
    return RedirectResponse(str(request.url_for("index")))


@app.on_event("startup")
async def warn_about_missing_credentials():
    missing = [
        name for name, cfg in PROVIDERS.items()
        if not cfg["client_id"] or not cfg["client_secret"]
    ]
    if missing:
        print(f"WARNING: missing client id/secret for: {', '.join(missing)}")
        print("Those login buttons will redirect but fail at the provider. See README.md.")

    if not TEMPLATE_DIR.is_dir():
        raise RuntimeError(f"Cannot find the templates folder at {TEMPLATE_DIR}")


if __name__ == "__main__":
    uvicorn.run("app:app", host=HOST, port=PORT, reload=True)