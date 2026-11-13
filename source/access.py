"""Course membership management (SRS-23, R-08) - Iteration 6, Sirapat.

Two parts:

- Roster seeding. data/course_roster.json (or COURSE_ROSTER_FILE) fills the
  courses / access_accounts / course_members tables the first time the app
  starts with no courses. After that the database is the source of truth and
  the file is ignored, so edits made on the Access page survive restarts.
  A missing or invalid file seeds nothing (fail closed): only
  LECTURER_EMAILS can then sign in, and they can add everyone else.

- The lecturer-only Access API used by the /access page (see the router below).
"""
import json
import logging
import os
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from database import USER_ROLES, AccessAccount, Course, CourseMember, SessionLocal
from users import normalise_ku_email, role_for_email

logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_ROSTER_FILE = BASE_DIR / "data" / "course_roster.json"
MAX_CODE = 50
MAX_NAME = 200


def _parse_roster(raw: str) -> list[tuple[str, str, list[tuple[str, str]]]]:
    """[(code, name, [(email, role), ...]), ...] or ValueError. Checks the
    whole file before anything is written, so a bad file seeds nothing."""
    data = json.loads(raw)
    if not isinstance(data, dict) or not isinstance(data.get("courses"), list):
        raise ValueError("expected {\"courses\": [...]}")
    courses, codes, roles = [], set(), {}
    for course in data["courses"]:
        if not isinstance(course, dict):
            raise ValueError("each course must be an object")
        code = course.get("code")
        if not isinstance(code, str) or not code.strip() or len(code.strip()) > MAX_CODE:
            raise ValueError("each course needs a code of 1-50 characters")
        code = code.strip()
        if code.lower() in codes:
            raise ValueError(f"duplicate course code {code}")
        codes.add(code.lower())
        name = course.get("name") or code
        if not isinstance(name, str) or len(name.strip()) > MAX_NAME:
            raise ValueError(f"invalid name for course {code}")
        members = course.get("members", [])
        if not isinstance(members, list):
            raise ValueError(f"members of {code} must be a list")
        parsed = []
        for member in members:
            if not isinstance(member, dict) or not isinstance(member.get("email"), str):
                raise ValueError(f"invalid member in {code}")
            email = normalise_ku_email(member["email"])
            role = member.get("role") or role_for_email(email)
            if role not in USER_ROLES:
                raise ValueError(f"unknown role {role!r} for {email}")
            if roles.setdefault(email, role) != role:
                raise ValueError(f"{email} is listed with two different roles")
            parsed.append((email, role))
        courses.append((code, name.strip(), parsed))
    return courses


def seed_roster(db: Session, path: Path) -> int:
    """Load the roster file into the database. Returns the number of courses
    created (0 when the file is missing or invalid)."""
    try:
        courses = _parse_roster(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError:
        logger.warning("No course roster at %s: only LECTURER_EMAILS can sign in until a lecturer adds members.", path)
        return 0
    except (OSError, ValueError) as error:
        logger.error("Course roster %s is invalid (%s); nothing was loaded.", path, error)
        return 0
    for code, name, members in courses:
        course = Course(code=code, name=name)
        db.add(course)
        db.flush()
        for email, role in members:
            if db.get(AccessAccount, email) is None:
                db.add(AccessAccount(email=email, role=role))
                db.flush()
            db.add(CourseMember(course_id=course.id, email=email))
    db.commit()
    return len(courses)


def seed_roster_if_empty() -> int:
    """Seed from COURSE_ROSTER_FILE (default data/course_roster.json) only when
    no course exists yet."""
    with SessionLocal() as db:
        if db.scalar(select(Course.id).limit(1)) is not None:
            return 0
        return seed_roster(db, Path(os.environ.get("COURSE_ROSTER_FILE") or DEFAULT_ROSTER_FILE))
