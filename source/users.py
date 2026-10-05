"""User & Role resolution (SRS-18, SRS-22).

Maps an authenticated account (KU Google or local test login) to an
internal User record with a role (student / ta / lecturer), creating it on
first login and keeping it in sync on every login after that.

The users table is the single source of truth for roles: whatever role
`sync_user` stores is the one copied into the session, and that session
role is what every authorisation check reads (e.g. reports.py's
require_lecturer). Where the role comes from depends on how the user
signed in:

- Local test login: the role listed for that email in
  data/allowed_users.json (passed in explicitly by app.py).
- KU Google login: there's no admin UI to manage roles yet, so it's an
  allowlist - an email in LECTURER_EMAILS (comma-separated) becomes a
  lecturer, one in TA_EMAILS becomes a TA, and everyone else is a student.
  Defaulting to student means a KU account never gets staff access just
  by signing in.

The role is re-evaluated on every login, so adding or removing someone
from an allowlist takes effect the next time they sign in.

Known gap: SRS-23's "not registered as a member of the selected
course" isn't enforced here - there's no Courses/enrollment table yet,
only a role.
"""
import os

from sqlalchemy import select
from sqlalchemy.orm import Session

from database import USER_ROLES, User


def _email_allowlist(var: str) -> set[str]:
    raw = os.environ.get(var, "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def role_for_email(email: str | None) -> str:
    """The role a KU Google account gets from the env allowlists."""
    email = (email or "").lower()
    if email in _email_allowlist("LECTURER_EMAILS"):
        return "lecturer"
    if email in _email_allowlist("TA_EMAILS"):
        return "ta"
    return "student"


def sync_user(
    db: Session,
    *,
    provider: str,
    provider_user_id: str,
    email: str | None,
    display_name: str,
    role: str | None = None,
) -> User:
    """Create or update the User for this identity and return it.

    `role` overrides the allowlist lookup (used for local test accounts,
    whose role comes from data/allowed_users.json)."""
    role = role or role_for_email(email)
    if role not in USER_ROLES:
        raise ValueError(f"Unknown role: {role!r}")

    user = db.scalar(
        select(User).where(
            User.provider == provider,
            User.provider_user_id == provider_user_id,
        )
    )
    if user is None:
        user = User(provider=provider, provider_user_id=provider_user_id)
        db.add(user)

    user.email = email
    user.display_name = display_name
    user.role = role
    db.commit()
    db.refresh(user)
    return user
