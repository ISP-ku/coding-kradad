"""Homework: a lecturer assigns it, students submit it, TAs grade it.

Who may do what (checked on the server, never trusted from the browser):
  lecturer  assign homework; view every submission
  ta        view submissions and give each a score + feedback
  student   see all homework, submit / resubmit (until graded), see own grade
Everyone must be signed in. Role checks run before any database lookup, so a
wrong-role caller gets 403 whether or not the id exists.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from activities import authenticated_user, require_lecturer, require_staff
from database import Homework, HomeworkSubmission, get_db
from timeutil import UtcDateTime

router = APIRouter(prefix="/api/homework", tags=["homework"])

RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

# What a student sees for each homework.
STATUS_TODO = "todo"            # nothing submitted yet
STATUS_SUBMITTED = "submitted"  # handed in, waiting for a TA
STATUS_GRADED = "graded"        # scored by a TA


def require_student(user: dict = Depends(authenticated_user)) -> dict:
    if user.get("role", "student") != "student":
        raise HTTPException(status_code=403, detail="Only students can submit homework.")
    return user


def require_ta(user: dict = Depends(authenticated_user)) -> dict:
    if user.get("role") != "ta":
        raise HTTPException(status_code=403, detail="Only teaching assistants can grade homework.")
    return user


def identity(user: dict) -> str:
    return f"{user['provider']}:{user['id']}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc(value: datetime) -> datetime:
    """The database keeps naive UTC. Treat a value with no zone as UTC."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


# --- Request / response shapes ------------------------------------------------

class HomeworkCreate(BaseModel):
    course_id: RequiredText = Field(max_length=100)
    title: RequiredText = Field(max_length=200)
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    due_at: datetime
    max_score: int = Field(default=100, ge=1, le=1000)


class SubmissionCreate(BaseModel):
    answer: RequiredText = Field(max_length=5000)


class GradeUpdate(BaseModel):
    score: int = Field(ge=0)
    feedback: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    homework_id: int
    student_name: str
    answer: str
    submitted_at: UtcDateTime
    is_late: bool = False
    score: Optional[int] = None
    feedback: Optional[str] = None
    graded_at: Optional[UtcDateTime] = None


class HomeworkOut(BaseModel):
    id: int
    course_id: str
    title: str
    description: str
    due_at: UtcDateTime
    max_score: int
    created_at: UtcDateTime
    # Student view: todo / submitted / graded, whether it is overdue, own work.
    status: Optional[str] = None
    is_overdue: bool = False
    my_submission: Optional[SubmissionOut] = None
    # TA / lecturer view: how much work has come in.
    submission_count: Optional[int] = None
    graded_count: Optional[int] = None


def submission_out(sub: HomeworkSubmission, homework: Homework) -> SubmissionOut:
    out = SubmissionOut.model_validate(sub)
    out.is_late = sub.submitted_at > homework.due_at
    return out


def homework_out(hw: Homework, **extra) -> HomeworkOut:
    return HomeworkOut(
        id=hw.id, course_id=hw.course_id, title=hw.title, description=hw.description,
        due_at=hw.due_at, max_score=hw.max_score, created_at=hw.created_at, **extra,
    )


def _get_homework(db: Session, homework_id: int) -> Homework:
    hw = db.get(Homework, homework_id)
    if hw is None:
        raise HTTPException(status_code=404, detail="Homework not found.")
    return hw


# --- Endpoints ----------------------------------------------------------------

@router.get("", response_model=list[HomeworkOut])
def list_homework(user: dict = Depends(authenticated_user), db: Session = Depends(get_db)):
    """Every homework, soonest due first. The extra fields depend on the role."""
    items = db.scalars(select(Homework).order_by(Homework.due_at, Homework.id)).all()
    now = _utcnow()

    if user.get("role") in ("ta", "lecturer"):
        counts = {
            hid: (total, graded or 0)
            for hid, total, graded in db.execute(
                select(HomeworkSubmission.homework_id, func.count(), func.count(HomeworkSubmission.score))
                .group_by(HomeworkSubmission.homework_id)
            )
        }
        return [
            homework_out(hw, submission_count=counts.get(hw.id, (0, 0))[0], graded_count=counts.get(hw.id, (0, 0))[1])
            for hw in items
        ]

    mine = {
        s.homework_id: s
        for s in db.scalars(select(HomeworkSubmission).where(HomeworkSubmission.student_id == identity(user)))
    }
    result = []
    for hw in items:
        sub = mine.get(hw.id)
        if sub is None:
            status, overdue = STATUS_TODO, hw.due_at < now
        else:
            status, overdue = (STATUS_GRADED if sub.score is not None else STATUS_SUBMITTED), False
        result.append(homework_out(
            hw, status=status, is_overdue=overdue,
            my_submission=submission_out(sub, hw) if sub else None,
        ))
    return result


@router.post("", response_model=HomeworkOut, status_code=201)
def assign_homework(
    data: HomeworkCreate, user: dict = Depends(require_lecturer), db: Session = Depends(get_db),
):
    hw = Homework(
        course_id=data.course_id, title=data.title, description=data.description,
        due_at=_naive_utc(data.due_at), max_score=data.max_score, created_by=identity(user),
    )
    db.add(hw)
    db.commit()
    db.refresh(hw)
    return homework_out(hw, submission_count=0, graded_count=0)


@router.get("/{homework_id}/submissions", response_model=list[SubmissionOut])
def list_submissions(
    homework_id: int, _user: dict = Depends(require_staff), db: Session = Depends(get_db),
):
    """Everything students sent in for one homework, oldest first (ungraded work is easy to spot)."""
    hw = _get_homework(db, homework_id)
    subs = db.scalars(
        select(HomeworkSubmission).where(HomeworkSubmission.homework_id == hw.id)
        .order_by(HomeworkSubmission.submitted_at, HomeworkSubmission.id)
    ).all()
    return [submission_out(s, hw) for s in subs]


@router.post("/{homework_id}/submissions", response_model=SubmissionOut, status_code=201)
def submit_homework(
    homework_id: int, data: SubmissionCreate, response: Response,
    user: dict = Depends(require_student), db: Session = Depends(get_db),
):
    """Hand in (or replace) the signed-in student's answer. Late work is accepted
    and flagged; graded work is locked."""
    hw = _get_homework(db, homework_id)
    sub = db.scalar(select(HomeworkSubmission).where(
        HomeworkSubmission.homework_id == hw.id, HomeworkSubmission.student_id == identity(user)))
    if sub is None:
        sub = HomeworkSubmission(homework_id=hw.id, student_id=identity(user))
        db.add(sub)
    elif sub.score is not None:
        raise HTTPException(status_code=409, detail="This homework has already been graded and can no longer be changed.")
    else:
        response.status_code = 200  # replacing an earlier submission
    sub.student_name = user.get("username") or "Student"
    sub.answer = data.answer
    sub.submitted_at = _utcnow()
    db.commit()
    db.refresh(sub)
    return submission_out(sub, hw)


@router.patch("/{homework_id}/submissions/{submission_id}", response_model=SubmissionOut)
def grade_submission(
    homework_id: int, submission_id: int, data: GradeUpdate,
    user: dict = Depends(require_ta), db: Session = Depends(get_db),
):
    hw = _get_homework(db, homework_id)
    sub = db.scalar(select(HomeworkSubmission).where(
        HomeworkSubmission.id == submission_id, HomeworkSubmission.homework_id == hw.id))
    if sub is None:
        raise HTTPException(status_code=404, detail="Submission not found.")
    if data.score > hw.max_score:
        raise HTTPException(status_code=422, detail=f"Score cannot be more than {hw.max_score}.")
    sub.score = data.score
    sub.feedback = data.feedback or None
    sub.graded_by = identity(user)
    sub.graded_at = _utcnow()
    db.commit()
    db.refresh(sub)
    return submission_out(sub, hw)
