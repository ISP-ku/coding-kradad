"""Password sign-in for @ku.th people KU ALL will not let through.

KU's Google Workspace sends every @ku.th Google sign-in to KU ALL, and some
people cannot get through it. No app can skip that step, so instead a
lecturer creates a password for that person on the Access page (the server
generates it and shows it once), and the person signs in here with their
address and that password. No Google, no KU ALL, no email.

  POST /password-login  email=.. password=..  -> /dashboard or /homework
  (a plain form post from the frontend's /sign-in/password page, so the
  backend sets the session cookie like the other sign-ins)

Safety:
- Only a scrypt hash (random salt) is stored; the password is shown once.
- Each try claims one of MAX_ATTEMPTS with an atomic UPDATE before the
  password is checked, so parallel requests cannot get more guesses. The
  last wrong try locks the password for LOCK_TIME; a right one resets it.
- A wrong address and a wrong password give the same answer.
- Forms must come from our own frontend (Origin/Referer check).
- Signing in still goes through course membership (SRS-23) and takes the
  role from the Access page (users.resolve_role via app.with_role).
"""
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from database import SessionLocal, SignInPassword, User
from timeutil import utcnow_naive
from users import normalise_member_email

router = APIRouter(tags=["password-login"])

MAX_ATTEMPTS = 5
LOCK_TIME = timedelta(minutes=15)
# scrypt cost: ~16 MB and a few tens of ms per check.
_N, _R, _P = 2**14, 8, 1
# Easy to read aloud or copy: no 0/O, 1/l/I.
_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PASSWORD_LENGTH = 14


def _app():
    # Imported here: app.py imports this module to register the router.
    import app
    return app


# ---- hashing -----------------------------------------------------------------

def new_password() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(PASSWORD_LENGTH))


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def check_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt),
                                n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Checked against for unknown addresses, so they take as long as known ones.
_DUMMY_HASH = hash_password(new_password())


def set_password(db: Session, email: str, set_by: str) -> str:
    """Create (or replace) the password for this address and return it. A new
    password also clears any lock. The caller commits."""
    password = new_password()
    row = db.get(SignInPassword, email)
    if row is None:
        row = SignInPassword(email=email)
        db.add(row)
    row.password_hash = hash_password(password)
    row.set_by = set_by
    row.set_at = utcnow_naive()
    row.failed_attempts = 0
    row.locked_until = None
    return password


# ---- route -------------------------------------------------------------------

def _origin(url: str) -> str:
    parts = urlparse(url or "")
    return f"{parts.scheme}://{parts.netloc}" if parts.scheme and parts.netloc else ""


def _check_origin(request: Request) -> None:
    """Forms must come from our frontend or the backend itself."""
    allowed = {_origin(_app().FRONTEND_URL), f"{request.url.scheme}://{request.url.netloc}"}
    source = request.headers.get("origin") or _origin(request.headers.get("referer", ""))
    if source not in allowed:
        raise HTTPException(403, "This form must be sent from the Course Support sign-in page.")


def _back(**params) -> RedirectResponse:
    query = urlencode({k: v for k, v in params.items() if v is not None})
    return RedirectResponse(f"{_app().FRONTEND_URL}/sign-in/password?{query}", status_code=303)


def _row_update(email: str, *conditions):
    """An UPDATE of this address's password row, only if every condition holds."""
    return update(SignInPassword).where(SignInPassword.email == email, *conditions)


def _lock(db: Session, email: str, now: datetime, *conditions) -> None:
    db.execute(_row_update(email, *conditions).values(locked_until=now + LOCK_TIME))
    db.commit()


def _verify(db: Session, email: str, password: str) -> str | None:
    """None when the password is right, otherwise "wrong" or "locked"."""
    now = utcnow_naive()
    row = db.get(SignInPassword, email)
    if row is None:
        check_password(password, _DUMMY_HASH)
        return "wrong"
    # A lock that has run out starts a fresh set of tries.
    db.execute(_row_update(email, SignInPassword.locked_until <= now)
               .values(failed_attempts=0, locked_until=None))
    # Claim a try before checking, atomically: at most MAX_ATTEMPTS checks
    # however many requests arrive at once.
    claimed = db.execute(_row_update(email, SignInPassword.locked_until.is_(None),
                                     SignInPassword.failed_attempts < MAX_ATTEMPTS)
                         .values(failed_attempts=SignInPassword.failed_attempts + 1)).rowcount
    if not claimed:
        # Out of tries but not yet locked (the last try is still running, or
        # it never finished): lock now, so the lock always runs out.
        _lock(db, email, now, SignInPassword.locked_until.is_(None))
        return "locked"
    db.commit()
    if check_password(password, row.password_hash):
        db.execute(_row_update(email).values(failed_attempts=0, locked_until=None))
        db.commit()
        return None
    attempts = db.scalar(select(SignInPassword.failed_attempts).where(SignInPassword.email == email))
    if attempts is not None and attempts >= MAX_ATTEMPTS:
        _lock(db, email, now)
        return "locked"
    return "wrong"


@router.post("/password-login")
def password_login(request: Request, email: str = Form(""), password: str = Form("")):
    _check_origin(request)
    try:
        address = normalise_member_email(email)
    except ValueError:
        return _back(email=email.strip()[:200] or None, error="invalid_email")

    with SessionLocal() as db:
        problem = _verify(db, address, password[:200])
        if problem:
            return _back(email=address, error=problem)
        known = db.scalar(select(User.display_name).where(func.lower(User.email) == address).limit(1))

    app = _app()
    request.session.clear()
    try:
        user = app.with_role({
            "id": address, "username": known or address.split("@")[0],
            "email": address, "provider": "password", "auth_method": "password",
            "avatar_url": None, "classroom_courses": None,
        })
    except PermissionError:
        return _back(email=address, error="denied")
    request.session["user"] = user
    home = "/homework" if user.get("role") == "student" else "/dashboard"
    return RedirectResponse(app.FRONTEND_URL + home, status_code=303)
