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


# --- Lecturer Access API (/access page) --------------------------------------
# Every endpoint is lecturer-only, enforced here on the server, not just by
# hiding the page (Iteration 5 lesson). Safeguards:
#   - nobody can remove or change the role of a LECTURER_EMAILS account;
#   - a lecturer cannot remove or demote themselves, which also guarantees
#     at least one lecturer (the one acting) always keeps access.

from typing import Annotated, Literal, Optional  # noqa: E402

from fastapi import APIRouter, Depends, HTTPException, Response  # noqa: E402
from pydantic import BaseModel, Field, StringConstraints, field_validator  # noqa: E402
from sqlalchemy import func  # noqa: E402

from activities import require_lecturer  # noqa: E402
from database import User, get_db  # noqa: E402
from users import protected_lecturers  # noqa: E402

router = APIRouter(prefix="/api/access", tags=["access"])
Role = Literal["student", "ta", "lecturer"]
CourseCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_CODE)]


class CourseIn(BaseModel):
    code: CourseCode
    name: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=MAX_NAME)]] = None


class CourseOut(BaseModel):
    id: int
    code: str
    name: str


class MemberIn(BaseModel):
    email: str = Field(max_length=200)
    role: Optional[Role] = None

    @field_validator("email")
    @classmethod
    def ku_email(cls, value: str) -> str:
        return normalise_ku_email(value)


class RoleIn(BaseModel):
    role: Role


class AccountOut(BaseModel):
    email: str
    role: str
    course_ids: list[int]
    protected: bool
    is_self: bool


class AccessOut(BaseModel):
    courses: list[CourseOut]
    accounts: list[AccountOut]


def _viewer_email(user: dict) -> str:
    return (user.get("email") or "").strip().lower()


def _path_email(raw: str) -> str:
    try:
        return normalise_ku_email(raw)
    except ValueError:
        raise HTTPException(404, "No such account.")


def _account_out(db: Session, email: str, viewer: str) -> AccountOut:
    account = db.get(AccessAccount, email)
    protected = email in protected_lecturers()
    course_ids = sorted(db.scalars(select(CourseMember.course_id).where(CourseMember.email == email)))
    return AccountOut(
        email=email, role="lecturer" if protected else account.role, course_ids=course_ids,
        protected=protected, is_self=email == viewer,
    )


def _check_can_change(email: str, viewer: str, action: str) -> None:
    if email in protected_lecturers():
        raise HTTPException(400, f"{email} is a lecturer set in the server configuration (LECTURER_EMAILS) and cannot be {action} here.")
    if email == viewer:
        raise HTTPException(400, f"You cannot {'remove' if action == 'removed' else 'change'} your own access. Ask another lecturer.")


def _set_role(db: Session, account: AccessAccount, role: str, viewer: str) -> None:
    if role == account.role:
        return
    _check_can_change(account.email, viewer, "changed")
    account.role = role
    # Keep the users table (used e.g. to list TAs for assignment) in step.
    for user in db.scalars(select(User).where(func.lower(User.email) == account.email)):
        user.role = role


@router.get("", response_model=AccessOut)
def get_access(user: dict = Depends(require_lecturer), db: Session = Depends(get_db)):
    viewer = _viewer_email(user)
    courses = [CourseOut(id=c.id, code=c.code, name=c.name)
               for c in db.scalars(select(Course).order_by(Course.code))]
    emails = set(db.scalars(select(AccessAccount.email))) | protected_lecturers()
    return AccessOut(courses=courses, accounts=[_account_out(db, email, viewer) for email in sorted(emails)])


@router.post("/courses", response_model=CourseOut, status_code=201)
def create_course(data: CourseIn, _user: dict = Depends(require_lecturer), db: Session = Depends(get_db)):
    if db.scalar(select(Course.id).where(func.lower(Course.code) == data.code.lower())) is not None:
        raise HTTPException(409, f"A course with code {data.code} already exists.")
    course = Course(code=data.code, name=data.name or data.code)
    db.add(course)
    db.commit()
    return CourseOut(id=course.id, code=course.code, name=course.name)


@router.post("/courses/{course_id}/members", response_model=AccountOut, status_code=201)
def add_member(course_id: int, data: MemberIn, user: dict = Depends(require_lecturer),
               db: Session = Depends(get_db)):
    viewer = _viewer_email(user)
    if db.get(Course, course_id) is None:
        raise HTTPException(404, "No such course.")
    if db.scalar(select(CourseMember.id).where(CourseMember.course_id == course_id,
                                               CourseMember.email == data.email)) is not None:
        raise HTTPException(409, f"{data.email} is already in this course.")
    account = db.get(AccessAccount, data.email)
    if account is None:
        account = AccessAccount(email=data.email, role=data.role or role_for_email(data.email))
        if data.email in protected_lecturers() and account.role != "lecturer":
            _check_can_change(data.email, viewer, "changed")
        db.add(account)
        db.flush()
    elif data.role:
        _set_role(db, account, data.role, viewer)
    db.add(CourseMember(course_id=course_id, email=data.email))
    db.commit()
    return _account_out(db, data.email, viewer)


@router.delete("/courses/{course_id}/members/{email}", status_code=204)
def remove_member(course_id: int, email: str, user: dict = Depends(require_lecturer),
                  db: Session = Depends(get_db)):
    email = _path_email(email)
    member = db.scalar(select(CourseMember).where(CourseMember.course_id == course_id,
                                                  CourseMember.email == email))
    if member is None:
        raise HTTPException(404, f"{email} is not in this course.")
    _check_can_change(email, _viewer_email(user), "removed")
    db.delete(member)
    db.flush()
    if db.scalar(select(CourseMember.id).where(CourseMember.email == email).limit(1)) is None:
        db.delete(db.get(AccessAccount, email))
    db.commit()
    return Response(status_code=204)


@router.patch("/accounts/{email}", response_model=AccountOut)
def change_role(email: str, data: RoleIn, user: dict = Depends(require_lecturer),
                db: Session = Depends(get_db)):
    email = _path_email(email)
    viewer = _viewer_email(user)
    account = db.get(AccessAccount, email)
    if account is None:
        raise HTTPException(404, "No such account.")
    _set_role(db, account, data.role, viewer)
    db.commit()
    return _account_out(db, email, viewer)
