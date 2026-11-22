"""User & Role resolution (SRS-18, SRS-22) and course membership (SRS-23).

Maps an authenticated account (KU Google or local test login) to an
internal User record with a role (student / ta / lecturer), creating it on
first login and keeping it in sync on every login after that.

Who may sign in, and with which role (Iteration 6, R-08):

- An email in LECTURER_EMAILS (comma-separated) is always a lecturer and is
  always allowed in. This is the safety net that stops the Access page from
  ever locking every lecturer out.
- Otherwise the email must be a member of at least one course
  (course_members). Its role is the one a lecturer set on the Access page
  (access_accounts.role).
- Anyone else is refused (SRS-23: "not registered as a member of the
  selected course").

A lecturer may also add an address outside @ku.th (normalise_member_email).
Google sign-in refuses it (app.ku_profile), so its only way in is a password
the lecturer creates on the Access page (password_login.py), and it always
needs a course membership, even with the check below switched off.

REQUIRE_COURSE_MEMBERSHIP=0 switches the membership check off. A KU non-member
then falls back to the old behaviour: the role passed in (local test login)
or the TA_EMAILS allowlist, defaulting to student. TA_EMAILS otherwise only
gives the starting role when a lecturer adds an email without choosing one.

resolve_role() is called at sign-in and again on every request (app.py's
current_user), so removing someone or changing their role takes effect
immediately rather than when their session expires.
"""
import os

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import USER_ROLES, AccessAccount, CourseMember, User

KU_DOMAIN = "ku.th"


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


def membership_required() -> bool:
    """SRS-23 gate. On unless REQUIRE_COURSE_MEMBERSHIP is exactly "0"."""
    return os.environ.get("REQUIRE_COURSE_MEMBERSHIP", "1").strip() != "0"


def protected_lecturers() -> set[str]:
    """LECTURER_EMAILS: always lecturers, never demoted or removed."""
    return _email_allowlist("LECTURER_EMAILS")


# Personal Google accounts a lecturer may add when ALLOW_PERSONAL_GOOGLE=1.
PERSONAL_DOMAINS = {"gmail.com"}


def personal_google_allowed() -> bool:
    """Optional: let lecturer-added Gmail addresses sign in (off by default)."""
    return os.environ.get("ALLOW_PERSONAL_GOOGLE", "0").strip() == "1"


def is_ku_email(email: str | None) -> bool:
    return (email or "").strip().lower().rpartition("@")[2] == KU_DOMAIN


def normalise_member_email(raw: str) -> str:
    """Any valid address a lecturer may add to a course, lower-cased, or
    ValueError. KU addresses can use Google sign-in; any other address can
    only sign in with a password the lecturer creates (and, when personal
    Google accounts are turned on, a Gmail address may also use Google).

    The same rule as normaliseMemberEmail in nextjs-frontend/lib/access.ts:
    one @, something before it, a domain with a dot that does not start or
    end with a dot and has no empty parts, no spaces, at most 200 characters."""
    email = (raw or "").strip().lower()
    local, at, domain = email.partition("@")
    labels = domain.split(".")
    if (not at or not local or "@" in domain or len(labels) < 2 or not all(labels)
            or any(c.isspace() for c in email) or len(email) > 200):
        raise ValueError("Enter a valid email address.")
    return email


def resolve_role(db: Session, email: str | None, fallback_role: str | None) -> str | None:
    """The role this email signs in with, or None if it may not sign in."""
    email = (email or "").strip().lower()
    if email and email in protected_lecturers():
        return "lecturer"
    if email:
        account = db.get(AccessAccount, email)
        if account is not None and db.scalar(
                select(CourseMember.id).where(CourseMember.email == email).limit(1)) is not None:
            return account.role
    # A non-KU (personal) account is only ever let in because a lecturer
    # added it, so it needs membership even when the gate is switched off.
    if membership_required() or (email and not is_ku_email(email)):
        return None
    return fallback_role or role_for_email(email)


# Which existing identity a sign-in may take over when it has no row of its
# own yet. Password sign-in may use any account with the same address;
# Google may only take over a password account (two Google accounts with
# the same address are never merged).
_REUSABLE_PROVIDERS = {"password": ("google", "local"), "google": ("password",)}
_PROVIDER_PREFERENCE = {"google": 0, "local": 1, "password": 2}


def shared_identity(db: Session, provider: str, provider_user_id: str,
                    email: str | None) -> tuple[str, str]:
    """The (provider, provider_user_id) to record this sign-in under.

    Homework, tasks, FAQs and consultations key off "provider:id", so the
    same person signing in by Google one day and by password the next
    must keep one identity. The first identity an address used wins."""
    email = (email or "").strip().lower()
    reusable = _REUSABLE_PROVIDERS.get(provider)
    if not email or not reusable:
        return provider, provider_user_id
    if db.scalar(select(User.id).where(User.provider == provider,
                                       User.provider_user_id == provider_user_id)) is not None:
        return provider, provider_user_id
    rows = db.scalars(select(User).where(func.lower(User.email) == email,
                                         User.provider.in_(reusable))).all()
    if not rows:
        return provider, provider_user_id
    best = min(rows, key=lambda r: (_PROVIDER_PREFERENCE.get(r.provider, 9), r.created_at, r.id))
    return best.provider, best.provider_user_id


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
