"""Email code sign-in.

KU's Google Workspace sends every @ku.th Google sign-in to KU ALL, which
some people cannot get through. This is a second way in: the person types
their address, gets a 6-digit code by email and types it back.

Flow (plain HTML form posts from the frontend's /sign-in/email page, so the
session cookie is set on the backend exactly like the other sign-ins):

  POST /email-login/request  email=...        -> back to /sign-in/email?email=..&sent=1
  POST /email-login/verify   email=.. code=.. -> /dashboard or /homework when right

Safety:
- Only an HMAC of the code is stored; codes are single-use and expire after
  CODE_TTL. 5 wrong tries cancel a code. A new code cancels the old one.
- At most 1 code a minute and 5 an hour per address.
- The answer to a request is the same whether or not the address may sign
  in, and a row is stored either way, so nothing reveals who is registered.
- Forms must come from our own frontend (Origin/Referer check).
- Signing in still goes through course membership (SRS-23) and takes the
  role from the Access page (users.resolve_role via app.with_role).

Sending mail needs SMTP_HOST (plus SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD,
SMTP_FROM, SMTP_SECURITY=starttls|ssl|none). With APP_ENV=development and no
SMTP settings, the code is written to the backend log instead.
"""
import hashlib
import hmac
import logging
import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select

from database import LoginCode, SessionLocal, User
from users import normalise_member_email, resolve_role

logger = logging.getLogger(__name__)
router = APIRouter(tags=["email-login"])

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
MIN_GAP = timedelta(minutes=1)
HOURLY_LIMIT = 5


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _app():
    # Imported here: app.py imports this module to register the router.
    import app
    return app


def _hash(email: str, code: str) -> str:
    return hmac.new(_app().SECRET_KEY.encode(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


# ---- sending -----------------------------------------------------------------

def _smtp_settings() -> dict | None:
    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        return None
    security = os.environ.get("SMTP_SECURITY", "starttls").strip().lower()
    return {
        "host": host,
        "port": int(os.environ.get("SMTP_PORT") or (465 if security == "ssl" else 587)),
        "username": os.environ.get("SMTP_USERNAME", ""),
        "password": os.environ.get("SMTP_PASSWORD", ""),
        "sender": os.environ.get("SMTP_FROM") or os.environ.get("SMTP_USERNAME", ""),
        "security": security,
    }


def email_sending_available() -> bool:
    return _smtp_settings() is not None


def send_code(email: str, code: str) -> None:
    """Email the code. Raises on any SMTP problem."""
    s = _smtp_settings()
    if s is None:
        raise RuntimeError("SMTP is not configured")
    msg = EmailMessage()
    msg["Subject"] = f"Your Course Support sign-in code: {code}"
    msg["From"] = s["sender"]
    msg["To"] = email
    msg.set_content(
        f"Your sign-in code is {code}\n\n"
        f"It works once and expires in {int(CODE_TTL.total_seconds() // 60)} minutes.\n"
        "If you did not ask for it, you can ignore this email.\n"
    )
    smtp_cls = smtplib.SMTP_SSL if s["security"] == "ssl" else smtplib.SMTP
    with smtp_cls(s["host"], s["port"], timeout=15) as smtp:
        if s["security"] == "starttls":
            smtp.starttls()
        if s["username"]:
            smtp.login(s["username"], s["password"])
        smtp.send_message(msg)


def send_code_or_log(email: str, code: str) -> None:
    """Development only: without SMTP settings, write the code to the log."""
    if _smtp_settings() is None:
        logger.warning("DEVELOPMENT ONLY - sign-in code for %s is %s", email, code)
        return
    send_code(email, code)


def available() -> bool:
    """Whether the sign-in page should offer email codes."""
    return email_sending_available() or _app().APP_ENV == "development"


# ---- helpers -----------------------------------------------------------------

def _check_origin(request: Request) -> None:
    """Forms must come from our frontend or the backend itself."""
    allowed = {
        _origin(_app().FRONTEND_URL),
        f"{request.url.scheme}://{request.url.netloc}",
    }
    source = request.headers.get("origin") or _origin(request.headers.get("referer", ""))
    if source not in allowed:
        raise HTTPException(403, "This form must be sent from the Course Support sign-in page.")


def _origin(url: str) -> str:
    parts = urlparse(url or "")
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""


def _back(**params) -> RedirectResponse:
    query = urlencode({k: v for k, v in params.items() if v is not None})
    return RedirectResponse(f"{_app().FRONTEND_URL}/sign-in/email?{query}", status_code=303)


# ---- routes ------------------------------------------------------------------

@router.post("/email-login/request")
def request_code(request: Request, email: str = Form("")):
    _check_origin(request)
    try:
        address = normalise_member_email(email)
    except ValueError:
        return _back(email=email.strip()[:200] or None, error="invalid_email")
    if not available():
        return _back(email=address, error="unavailable")

    now = _now()
    with SessionLocal() as db:
        recent = db.scalars(select(LoginCode).where(LoginCode.email == address,
                                                    LoginCode.created_at > now - timedelta(hours=1))).all()
        if any(r.created_at > now - MIN_GAP for r in recent) or len(recent) >= HOURLY_LIMIT:
            return _back(email=address, sent="1", error="wait")
        for old in db.scalars(select(LoginCode).where(LoginCode.email == address, LoginCode.used_at.is_(None))):
            old.used_at = now  # a new code cancels the old one

        code = f"{secrets.randbelow(10**6):06d}"
        db.add(LoginCode(email=address, code_hash=_hash(address, code), created_at=now, expires_at=now + CODE_TTL))
        db.commit()
        allowed = resolve_role(db, address, None) is not None

    if allowed:
        try:
            if email_sending_available():
                send_code(address, code)
            else:
                send_code_or_log(address, code)
        except Exception:  # noqa: BLE001 - any mail failure looks the same to the person
            logger.exception("Could not email a sign-in code")
            return _back(email=address, error="send_failed")
    return _back(email=address, sent="1")


@router.post("/email-login/verify")
def verify_code(request: Request, email: str = Form(""), code: str = Form("")):
    _check_origin(request)
    try:
        address = normalise_member_email(email)
    except ValueError:
        return _back(email=email.strip()[:200] or None, error="invalid_email")
    code = "".join(ch for ch in code if ch.isdigit())
    now = _now()

    with SessionLocal() as db:
        row = db.scalars(select(LoginCode).where(LoginCode.email == address, LoginCode.used_at.is_(None))
                         .order_by(LoginCode.created_at.desc()).limit(1)).first()
        if row is None or row.expires_at <= now:
            return _back(email=address, sent="1", error="expired")
        if len(code) != 6 or not hmac.compare_digest(row.code_hash, _hash(address, code)):
            row.attempts += 1
            locked = row.attempts >= MAX_ATTEMPTS
            if locked:
                row.used_at = now
            db.commit()
            return _back(email=address, sent="1", error="locked" if locked else "wrong")
        row.used_at = now
        db.commit()
        known = db.scalar(select(User.display_name).where(func.lower(User.email) == address).limit(1))

    app = _app()
    request.session.clear()
    try:
        user = app.with_role({
            "id": address, "username": known or address.split("@")[0],
            "email": address, "provider": "email", "auth_method": "email_code",
            "avatar_url": None, "classroom_courses": None,
        })
    except PermissionError:
        return _back(email=address, error="denied")
    request.session["user"] = user
    home = "/homework" if user.get("role") == "student" else "/dashboard"
    return RedirectResponse(app.FRONTEND_URL + home, status_code=303)
