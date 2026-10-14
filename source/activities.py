"""Shared activity and task API for the dashboard (SRS-2 to SRS-13)."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from database import ACTIVITY_TYPES, ROLE_LECTURER, TASK_STATUSES, Activity, Task, User, get_db

router = APIRouter(prefix="/api/activities", tags=["activities"])
RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def authenticated_user(request: Request) -> dict:
    from app import current_user
    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first.")
    return user


def require_lecturer(user: dict = Depends(authenticated_user)) -> dict:
    if user.get("role") != ROLE_LECTURER:
        raise HTTPException(status_code=403, detail="Lecturer access required.")
    return user


class ActivityCreate(BaseModel):
    course_id: RequiredText = Field(max_length=100)
    title: RequiredText = Field(max_length=200)
    type: str
    starts_at: datetime
    location: RequiredText = Field(max_length=200)
    assignee_id: RequiredText = Field(max_length=100)

    @field_validator("type")
    @classmethod
    def valid_type(cls, value):
        if value not in ACTIVITY_TYPES:
            raise ValueError("Unsupported activity type.")
        return value


class TaskStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, value):
        if value not in TASK_STATUSES:
            raise ValueError("Unsupported task status.")
        return value


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    assignee_id: str
    status: str
    assigned_at: datetime
    status_changed_at: Optional[datetime] = None
    assignee_name: str = "TA account"


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: str
    title: str
    type: str
    starts_at: datetime
    location: str
    created_by: str
    tasks: list[TaskOut]


class AssigneeOut(BaseModel):
    id: str
    name: str


def identity(user: dict) -> str:
    return f"{user['provider']}:{user['id']}"


def activity_response(activity: Activity, db: Session) -> ActivityOut:
    ta_users = db.scalars(select(User).where(User.role == "ta")).all()
    names = {f"{user.provider}:{user.provider_user_id}": user.display_name for user in ta_users}
    tasks = []
    for task in activity.tasks:
        item = TaskOut.model_validate(task).model_dump()
        item["assignee_name"] = names.get(task.assignee_id, "TA account")
        tasks.append(item)
    return ActivityOut.model_validate({
        "id": activity.id, "course_id": activity.course_id, "title": activity.title,
        "type": activity.type, "starts_at": activity.starts_at, "location": activity.location,
        "created_by": activity.created_by, "tasks": tasks,
    })


@router.get("", response_model=list[ActivityOut])
def list_activities(
    _user: dict = Depends(authenticated_user), db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    query = (
        select(Activity)
        .options(selectinload(Activity.tasks))
        .where(Activity.archived_at.is_(None), Activity.starts_at >= now)
        .order_by(Activity.starts_at, Activity.id)
    )
    activities = db.scalars(query).unique().all()
    return [activity_response(activity, db) for activity in activities]


@router.get("/assignees", response_model=list[AssigneeOut])
def list_ta_assignees(
    _user: dict = Depends(require_lecturer), db: Session = Depends(get_db),
):
    users = db.scalars(select(User).where(User.role == "ta").order_by(User.display_name)).all()
    return [AssigneeOut(id=f"{u.provider}:{u.provider_user_id}", name=u.display_name) for u in users]


@router.post("", response_model=ActivityOut, status_code=201)
def create_activity(
    data: ActivityCreate, user: dict = Depends(require_lecturer), db: Session = Depends(get_db),
):
    assignee_provider, separator, assignee_user_id = data.assignee_id.partition(":")
    if not separator or not db.scalar(select(User.id).where(
        User.provider == assignee_provider,
        User.provider_user_id == assignee_user_id,
        User.role == "ta",
    )):
        raise HTTPException(status_code=422, detail="Choose an active TA account.")

    starts_at = data.starts_at
    if starts_at.tzinfo is not None:
        starts_at = starts_at.astimezone(timezone.utc).replace(tzinfo=None)
    activity = Activity(
        course_id=data.course_id, title=data.title, type=data.type,
        starts_at=starts_at, location=data.location, created_by=identity(user),
    )
    db.add(activity)
    db.flush()
    db.add(Task(activity_id=activity.id, assignee_id=data.assignee_id, status="Not Started"))
    db.commit()
    saved = db.scalars(select(Activity).options(selectinload(Activity.tasks)).where(Activity.id == activity.id)).one()
    return activity_response(saved, db)


@router.patch("/{activity_id}/tasks/{task_id}", response_model=TaskOut)
def update_task_status(
    activity_id: int, task_id: int, data: TaskStatusUpdate,
    user: dict = Depends(authenticated_user), db: Session = Depends(get_db),
):
    task = db.scalar(select(Task).where(Task.id == task_id, Task.activity_id == activity_id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    if user.get("role") != ROLE_LECTURER and not (
        user.get("role") == "ta" and task.assignee_id == identity(user)
    ):
        raise HTTPException(status_code=403, detail="Only the assigned TA or a lecturer can update this task.")
    task.status = data.status
    task.status_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(task)
    assignee_provider, _, assignee_id = task.assignee_id.partition(":")
    assignee = db.scalar(select(User).where(User.provider == assignee_provider, User.provider_user_id == assignee_id))
    result = TaskOut.model_validate(task).model_dump()
    result["assignee_name"] = assignee.display_name if assignee else "TA account"
    return result
