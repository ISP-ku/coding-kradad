"""Activity & support-log reporting (SRS-19, SRS-20).

GET /api/reports/activities?course_id=...&start_date=...&end_date=...
-> completed/archived activities (with their tasks) for a selected course
   and date range, plus a support-load summary of consultation sessions
   in that same range (SRS-19, AD-6/SQD-6). Returns has_records=false
   instead of an error when nothing matches, so the frontend can show
   the "no records" message AD-6 calls for.

   "Completed" means the activity's scheduled time has passed (SRS-4's
   "past (completed)" rule); "archived" means archived_at is set. Upcoming,
   un-archived activities are still live schedule items, not history, so
   they're left out even if they fall inside the date range.

GET /api/reports/courses
-> the course ids that have activities, for the report's course picker.

Nothing in this module ever deletes a record - retention for reporting
and future reference (SRS-20) is satisfied simply by there being no
delete endpoint here.

Role enforcement (SRS-18): the shared `require_lecturer` from activities.py,
the same one faq.py, homework.py and access.py use. It goes through app.py's
current_user() - the check /api/me uses, so a session that app.py no longer
accepts (old multi-provider sessions, or a local test session after local
login was turned off) is rejected here too - and then checks the role that
app.py copied from the users table at login (users.py).

Known gap: consultation sessions aren't scoped by course (that table
has no course_id - see database.py's ConsultationSession docstring), so
the support-load summary below covers the date range only, across all
courses; the response says so (`consultations.scope`) so the UI can label
it. Redesigning that schema belongs to whoever owns
feature/consultation-logging, not this branch.
"""
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from activities import require_lecturer
from database import TASK_STATUS_DONE, Activity, ConsultationSession, Task, get_db
from timeutil import UtcDateTime, utcnow_naive

router = APIRouter(prefix="/api/reports", tags=["reports"])


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignee_id: str
    status: str
    assigned_at: UtcDateTime
    status_changed_at: Optional[UtcDateTime] = None


class ActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    type: str
    starts_at: UtcDateTime
    location: str
    created_by: str
    archived_at: Optional[UtcDateTime] = None
    tasks: list[TaskOut] = []


class ConsultationSummary(BaseModel):
    count: int
    total_minutes: int
    # Consultations aren't linked to a course yet (see module docstring).
    scope: str = "all_courses"


class ActivityReport(BaseModel):
    course_id: str
    start_date: date
    end_date: date
    has_records: bool
    activity_count: int
    status_summary: dict[str, int]
    activities: list[ActivityOut]
    consultations: ConsultationSummary


@router.get("/courses", response_model=list[str])
def list_report_courses(
    _user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    return list(db.scalars(select(Activity.course_id).distinct().order_by(Activity.course_id)))


@router.get("/activities", response_model=ActivityReport)
def get_activity_report(
    course_id: str = Query(..., min_length=1),
    start_date: date = Query(...),
    end_date: date = Query(...),
    _user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="end_date must not be before start_date.")

    range_start = datetime.combine(start_date, datetime.min.time())
    range_end = datetime.combine(end_date, datetime.max.time())

    query = (
        select(Activity)
        .where(
            Activity.course_id == course_id,
            Activity.starts_at >= range_start,
            Activity.starts_at <= range_end,
            # History only: completed (already happened) or archived (SRS-19).
            or_(
                Activity.starts_at < utcnow_naive(),
                Activity.archived_at.is_not(None),
                Activity.tasks.any() & ~Activity.tasks.any(Task.status != TASK_STATUS_DONE),
            ),
        )
        .order_by(Activity.starts_at)
    )
    activities = db.scalars(query).unique().all()

    status_summary: dict[str, int] = {}
    for activity in activities:
        for task in activity.tasks:
            status_summary[task.status] = status_summary.get(task.status, 0) + 1

    consultation_count, consultation_minutes = db.execute(
        select(
            func.count(ConsultationSession.id),
            func.coalesce(func.sum(ConsultationSession.duration_minutes), 0),
        ).where(
            ConsultationSession.session_date >= start_date,
            ConsultationSession.session_date <= end_date,
        )
    ).one()

    return ActivityReport(
        course_id=course_id,
        start_date=start_date,
        end_date=end_date,
        has_records=bool(activities) or consultation_count > 0,
        activity_count=len(activities),
        status_summary=status_summary,
        activities=list(activities),
        consultations=ConsultationSummary(
            count=consultation_count, total_minutes=consultation_minutes
        ),
    )
