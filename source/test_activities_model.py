"""Tests for the Activities / Tasks data model (SRS-2 to SRS-4, SRS-6 to
SRS-13).

There's no API on top of these tables yet (see database.py's docstring) -
these tests exercise the SQLAlchemy models directly: that the tables
create, that a Task's Overdue/At-Risk flags (SRS-12, SRS-13) compute
correctly from its Activity's due date and its own status, and that
marking a Task Done clears both flags.
"""
from datetime import datetime, timedelta, timezone

import pytest

from database import AT_RISK_WARNING, Activity, Base, SessionLocal, Task, engine

Base.metadata.create_all(engine)


def _now():
    """Naive UTC now, matching how database.py stores starts_at."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture(autouse=True)
def clean_tables():
    with SessionLocal() as db:
        db.query(Task).delete()
        db.query(Activity).delete()
        db.commit()
    yield


def _make_activity(db, *, starts_at, course_id="course-1"):
    activity = Activity(
        course_id=course_id,
        title="HW2 grading",
        type="deadline",
        starts_at=starts_at,
        location="online",
        created_by="google:lecturer-1",
    )
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


def _make_task(db, activity, *, status="Not Started"):
    task = Task(activity_id=activity.id, assignee_id="google:ta-1", status=status)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def test_activity_and_task_round_trip():
    with SessionLocal() as db:
        activity = _make_activity(db, starts_at=_now() + timedelta(days=5))
        task = _make_task(db, activity)

        assert task.activity_id == activity.id
        assert task.activity.title == "HW2 grading"
        assert activity.tasks == [task]
        assert task.status == "Not Started"
        assert task.assigned_at is not None


def test_task_not_overdue_or_at_risk_when_due_far_in_future():
    with SessionLocal() as db:
        activity = _make_activity(db, starts_at=_now() + timedelta(days=30))
        task = _make_task(db, activity)

        assert task.is_overdue is False
        assert task.is_at_risk is False


def test_task_overdue_when_past_due_date_and_not_done():
    """SRS-12: a task past its due date and not marked Done is Overdue."""
    with SessionLocal() as db:
        activity = _make_activity(db, starts_at=_now() - timedelta(days=1))
        task = _make_task(db, activity)

        assert task.is_overdue is True
        assert task.is_at_risk is False  # overdue takes precedence over at-risk


def test_task_at_risk_when_due_within_warning_period():
    """SRS-13: a task due within the warning period and not Done is At Risk."""
    with SessionLocal() as db:
        activity = _make_activity(
            db, starts_at=_now() + (AT_RISK_WARNING / 2)
        )
        task = _make_task(db, activity)

        assert task.is_at_risk is True
        assert task.is_overdue is False


def test_done_task_is_never_overdue_or_at_risk():
    """Marking a task Done clears both flags, even if its due date has passed."""
    with SessionLocal() as db:
        activity = _make_activity(db, starts_at=_now() - timedelta(days=1))
        task = _make_task(db, activity, status="Done")

        assert task.is_overdue is False
        assert task.is_at_risk is False
