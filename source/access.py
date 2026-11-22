"""Lecturer-only Access API for the /access page (SRS-23, R-08) - Iteration 6, Sirapat.

Courses, their members and each account's role. Every endpoint is
lecturer-only, enforced here on the server, not just by hiding the page
(Iteration 5 lesson). Safeguards:
  - nobody can remove or change the role of a LECTURER_EMAILS account;
  - a lecturer cannot remove or demote themselves, which also guarantees
    at least one lecturer (the one acting) always keeps access;
  - only the LECTURER_EMAILS account itself can create its own password.

The first-start roster import lives in roster.py.
"""

from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from activities import require_lecturer
from database import AccessAccount, Course, CourseMember, SignInPassword, User, get_db
from password_login import set_password as create_password
from roster import MAX_CODE, MAX_NAME
from users import normalise_member_email, protected_lecturers, role_for_email

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
        return normalise_member_email(value)


class RoleIn(BaseModel):
    role: Role


class AccountOut(BaseModel):
    email: str
    role: str
    course_ids: list[int]
    protected: bool
    is_self: bool
    # A lecturer-made password exists (password_login.py). Never the password.
    has_password: bool


class PasswordOut(BaseModel):
    # Shown to the lecturer once, to pass on; only its hash is stored.
    password: str
    account: AccountOut


class AccessOut(BaseModel):
    courses: list[CourseOut]
    accounts: list[AccountOut]


def _viewer_email(user: dict) -> str:
    return (user.get("email") or "").strip().lower()


def _path_email(raw: str) -> str:
    try:
        return normalise_member_email(raw)
    except ValueError:
        raise HTTPException(404, "No such account.")


def _account_out(db: Session, email: str, viewer: str) -> AccountOut:
    account = db.get(AccessAccount, email)
    protected = email in protected_lecturers()
    course_ids = sorted(db.scalars(select(CourseMember.course_id).where(CourseMember.email == email)))
    return AccountOut(
        email=email, role="lecturer" if protected else account.role, course_ids=course_ids,
        protected=protected, is_self=email == viewer,
        has_password=db.get(SignInPassword, email) is not None,
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
        password = db.get(SignInPassword, email)
        if password is not None:
            db.delete(password)
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


def _password_account(db: Session, raw: str, viewer: str) -> str:
    """The address whose password may be changed by this lecturer."""
    email = _path_email(raw)
    if email in protected_lecturers():
        if email != viewer:
            raise HTTPException(400, f"{email} is a lecturer set in the server configuration (LECTURER_EMAILS). Only they can create their own password.")
        return email
    if db.get(AccessAccount, email) is None:
        raise HTTPException(404, "No such account.")
    return email


@router.post("/accounts/{email}/password", response_model=PasswordOut)
def make_password(email: str, user: dict = Depends(require_lecturer), db: Session = Depends(get_db)):
    """Create (or replace) a sign-in password for someone KU ALL will not let
    through. The response is the only time the password is shown."""
    viewer = _viewer_email(user)
    email = _password_account(db, email, viewer)
    password = create_password(db, email, set_by=viewer)
    db.commit()
    return PasswordOut(password=password, account=_account_out(db, email, viewer))


@router.delete("/accounts/{email}/password", response_model=AccountOut)
def remove_password(email: str, user: dict = Depends(require_lecturer), db: Session = Depends(get_db)):
    viewer = _viewer_email(user)
    email = _password_account(db, email, viewer)
    row = db.get(SignInPassword, email)
    if row is not None:
        db.delete(row)
        db.commit()
    return _account_out(db, email, viewer)
