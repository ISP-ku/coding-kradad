"""KU Google sign-in for FastAPI + Next.js. See KU_LOGIN_SETUP.md."""
import ipaddress
import json
import logging
import os
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode

import requests
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token
from starlette.middleware.sessions import SessionMiddleware

from activities import router as activities_router
from consultations import router as consultations_router
from database import SessionLocal, init_db

from faq import router as faq_router
from homework import router as homework_router
from reports import router as reports_router
from users import sync_user

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8000"))
# A random development key invalidates sessions after a restart if not configured.
SECRET_KEY = os.getenv("SESSION_SECRET") or secrets.token_urlsafe(48)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/callback/google")
KU_DOMAIN = "ku.th"
REQUEST_TIMEOUT = 10
SESSION_COOKIE = "ku_session"
logger = logging.getLogger(__name__)

# Messages shown on the sign-in error page (SRS-23). Each one describes exactly
# one cause, so what the person reads matches what actually went wrong. They are
# fixed strings: nothing from Google or the request is echoed back.
MSG_NOT_CONFIGURED = "KU Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env."
MSG_STATE_INVALID = "Login request expired or could not be verified. Please start again."
MSG_CANCELLED = "Google sign-in was cancelled. Please try again when you are ready."
MSG_GOOGLE_ERROR = "Google could not complete the sign-in and reported a problem. Please try again, or contact the course team if it keeps happening."
MSG_NO_CODE = "Google did not return an authorization code. Please start again."
MSG_NOT_KU = "Please sign in with your KU Google account ending in @ku.th. Personal Gmail and other accounts are not allowed."
MSG_BAD_EMAIL = "Google did not return a valid email address for this account. Please try again with your KU Google account."
MSG_UNVERIFIED = "Google has not verified this email address, so it cannot be used to sign in. Verify it with Google and try again."
MSG_NOT_WORKSPACE = "Google did not confirm that this account belongs to the KU Google Workspace. Please sign in with your KU Google account."
MSG_UNREACHABLE = "Could not reach Google to complete the sign-in. Please try again in a moment."
MSG_CODE_REJECTED = "Google rejected the sign-in request. It has probably expired or was already used. Please start again."
MSG_UNVERIFIABLE = "Google sign-in could not be verified. Please try again."
APP_ENV = os.getenv("APP_ENV", "development")
LOCAL_TEST_LOGIN = os.getenv("LOCAL_TEST_LOGIN", "0") == "1"
TEST_USERS_FILE = BASE_DIR / "data" / "allowed_users.json"


def local_login_enabled(request):
    """No proxy headers are trusted by the bundled local development runner."""
    try:
        loopback = ipaddress.ip_address(request.client.host).is_loopback
    except (ValueError, AttributeError):
        loopback = False
    return (LOCAL_TEST_LOGIN and APP_ENV == "development"
            and HOST in {"127.0.0.1", "localhost", "::1"}
            and request.url.hostname in {"localhost", "127.0.0.1", "::1"}
            and loopback)


def test_users():
    """Roles and names come only from this backend file, never the form."""
    try:
        users = json.loads(TEST_USERS_FILE.read_text(encoding="utf-8"))
        if not isinstance(users, list):
            raise ValueError("Expected a list")
        seen = set()
        for user in users:
            if (not isinstance(user, dict)
                    or not all(isinstance(user.get(k), str) and user[k].strip()
                               for k in ("email", "name", "role"))
                    or user["email"].count("@") != 1
                    or not user["email"].lower().endswith("@ku.th")
                    or user["role"] not in {"student", "ta", "lecturer"}
                    or user["email"].lower() in seen):
                raise ValueError("Invalid test account")
            seen.add(user["email"].lower())
        return users
    except (OSError, ValueError, TypeError):
        raise HTTPException(503, "Check data/allowed_users.json: expected unique KU emails, names and student/ta/lecturer roles")


app = FastAPI(title="Course Support & Activity Dashboard")
app.add_middleware(
    SessionMiddleware, secret_key=SECRET_KEY, session_cookie=SESSION_COOKIE,
    max_age=8 * 60 * 60, same_site="lax",
    https_only=os.getenv("COOKIE_SECURE", "0") == "1",
)
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# Users, Activities / Tasks and Consultation tables (see database.py).
init_db()
app.include_router(activities_router)  # SRS-2 to SRS-13
app.include_router(reports_router)
app.include_router(consultations_router)  # SRS-14, SRS-15

app.include_router(faq_router)  # SRS-16, SRS-17, SRS-18
app.include_router(homework_router)  # Homework: lecturer assigns, student submits, TA grades


def current_user(request):
    user = request.session.get("user")
    # Do not accept old multi-provider sessions or preview cookies.
    if not isinstance(user, dict):
        return None
    if user.get("auth_method") == "ku_google":
        return user
    if user.get("auth_method") == "local_test" and local_login_enabled(request):
        return user
    return None


def with_role(user, role=None):
    """Record the signed-in account in the users table (SRS-22) and copy its
    role into the session user (SRS-18). See users.py for where roles come
    from."""
    with SessionLocal() as db:
        row = sync_user(db, provider=user["provider"], provider_user_id=user["id"],
                        email=user.get("email"), display_name=user["username"], role=role)
        return {**user, "role": row.role}


def build_authorize_url(state, nonce):
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "hd": KU_DOMAIN,  # Account-picker hint; the backend enforces it below.
        "prompt": "select_account",
    })


def exchange_code_for_token(code):
    response = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": GOOGLE_REDIRECT_URI,
    }, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()["id_token"]


def verify_google_token(token):
    # google-auth checks signature, audience, issuer and expiration.
    with requests.Session() as session:
        transport = GoogleRequest(session=session)
        def fetch_with_timeout(*args, **kwargs):
            kwargs["timeout"] = REQUEST_TIMEOUT
            return transport(*args, **kwargs)
        return id_token.verify_oauth2_token(token, fetch_with_timeout, GOOGLE_CLIENT_ID)


def ku_profile(claims, nonce):
    if not isinstance(claims.get("nonce"), str) or not secrets.compare_digest(claims["nonce"], nonce):
        raise ValueError("Invalid login nonce")
    email = claims.get("email", "")
    # One check per cause, in order, so the message matches the real reason.
    if not isinstance(email, str) or email.count("@") != 1 or not email.split("@")[0]:
        raise PermissionError(MSG_BAD_EMAIL)
    if email.rsplit("@", 1)[-1].lower() != KU_DOMAIN:
        raise PermissionError(MSG_NOT_KU)
    if claims.get("email_verified") is not True:
        raise PermissionError(MSG_UNVERIFIED)
    if claims.get("hd") != KU_DOMAIN:
        raise PermissionError(MSG_NOT_WORKSPACE)
    if not claims.get("sub"):
        raise ValueError("Missing account ID")
    return {
        "id": claims["sub"], "username": claims.get("name") or email,
        "email": email, "provider": "google", "auth_method": "ku_google",
        "avatar_url": claims.get("picture"), "classroom_courses": None,
    }


def login_error(request, message, status_code):
    """Readable sign-in error page with a way back, instead of bare text (SRS-23)."""
    return templates.TemplateResponse(
        request, "login_error.html",
        {"message": message, "login_url": FRONTEND_URL + "/"},
        status_code=status_code, headers={"Cache-Control": "no-store"},
    )


@app.get("/")
def index(request: Request):
    return templates.TemplateResponse(request, "index.html", {"user": current_user(request)})


@app.get("/api/auth-options")
def auth_options(request: Request):
    return JSONResponse({"local_test_login": local_login_enabled(request)},
                        headers={"Cache-Control": "no-store"})


@app.get("/local-test-login")
def local_test_form(request: Request):
    if not local_login_enabled(request):
        raise HTTPException(404, "Not found")
    csrf = secrets.token_urlsafe(32)
    request.session["local_csrf"] = csrf
    return templates.TemplateResponse(request, "local_login.html", {
        "users": test_users(), "csrf": csrf,
    }, headers={"Cache-Control": "no-store"})


@app.post("/local-test-login")
def local_test_submit(request: Request, email: str = Form(...), csrf: str = Form(...)):
    if not local_login_enabled(request):
        raise HTTPException(404, "Not found")
    expected = request.session.pop("local_csrf", None)
    if not expected or not secrets.compare_digest(csrf, expected):
        raise HTTPException(403, "Invalid test login form. Open the form again.")
    selected = next((u for u in test_users() if u["email"].lower() == email.strip().lower()), None)
    if not selected:
        raise HTTPException(403, "This account is not in data/allowed_users.json")
    request.session.clear()
    request.session["user"] = with_role({
        "id": "local:" + selected["email"].lower(), "username": selected["name"],
        "email": selected["email"].lower(),
        "provider": "local", "auth_method": "local_test",
        "avatar_url": None, "classroom_courses": None,
    }, role=selected["role"])
    return RedirectResponse(FRONTEND_URL + "/dashboard", status_code=303)


@app.get("/login/{provider}")
def login(request: Request, provider: str):
    if provider != "google":
        raise HTTPException(404, "Only KU Google login is supported")
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        return login_error(request, MSG_NOT_CONFIGURED, 503)
    request.session.clear()
    state, nonce = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    request.session.update(oauth_state=state, oauth_nonce=nonce, oauth_started=time.time())
    return RedirectResponse(build_authorize_url(state, nonce))


@app.get("/login")
def login_legacy(request: Request):
    return login(request, "google")


@app.get("/callback/{provider}")
def callback(request: Request, provider: str, code: str | None = None,
             state: str | None = None, error: str | None = None):
    if provider != "google":
        raise HTTPException(404, "Only KU Google login is supported")
    expected = request.session.pop("oauth_state", None)
    nonce = request.session.pop("oauth_nonce", None)
    started = request.session.pop("oauth_started", 0)
    request.session.pop("user", None)
    if (not expected or not state or not secrets.compare_digest(state, expected)
            or not nonce or time.time() - started > 600):
        return login_error(request, MSG_STATE_INVALID, 400)
    if error == "access_denied":
        return login_error(request, MSG_CANCELLED, 400)
    if error:
        logger.warning("KU sign-in failed: Google returned error=%s", error[:40])
        return login_error(request, MSG_GOOGLE_ERROR, 400)
    if not code:
        return login_error(request, MSG_NO_CODE, 400)
    try:
        claims = verify_google_token(exchange_code_for_token(code))
        user = ku_profile(claims, nonce)
    except PermissionError as denied:
        # The message is one of the fixed MSG_* strings raised by ku_profile().
        logger.warning("KU sign-in denied: account does not meet KU domain/verification rules")
        return login_error(request, str(denied), 403)
    except (requests.ConnectionError, requests.Timeout, TransportError):
        logger.warning("KU sign-in failed: could not reach Google")
        return login_error(request, MSG_UNREACHABLE, 502)
    except requests.HTTPError:
        logger.warning("KU sign-in failed: Google rejected the authorization code")
        return login_error(request, MSG_CODE_REJECTED, 400)
    except (requests.RequestException, GoogleAuthError, ValueError, KeyError, TypeError):
        logger.warning("KU sign-in failed: token exchange or identity validation failed")
        return login_error(request, MSG_UNVERIFIABLE, 400)
    request.session.clear()
    request.session["user"] = with_role(user)
    return RedirectResponse(FRONTEND_URL + "/dashboard", status_code=303)


@app.get("/callback")
def callback_legacy(request: Request, code: str | None = None,
                    state: str | None = None, error: str | None = None):
    return callback(request, "google", code, state, error)


@app.get("/api/me")
def me(request: Request):
    user = current_user(request)
    if not user:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401, headers={"Cache-Control": "no-store"})
    return JSONResponse(user, headers={"Cache-Control": "no-store"})


@app.get("/dashboard")
def dashboard(request: Request):
    if not current_user(request):
        return RedirectResponse(FRONTEND_URL + "/")
    return RedirectResponse(FRONTEND_URL + "/dashboard")


@app.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(FRONTEND_URL + "/", status_code=303)


if __name__ == "__main__":
    uvicorn.run("app:app", host=HOST, port=PORT, reload=True, proxy_headers=False)
