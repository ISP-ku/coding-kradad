"""Database setup: Users/Roles (SRS-18, SRS-22), Activities / Tasks
(SRS-2 to SRS-4, SRS-6 to SRS-13), and Consultation Sessions (SRS-14,
SRS-15 - the "support-log" half of SRS-19/SRS-20's reporting).

An Activity is a scheduled item on the course calendar (a deadline, lab
session, consultation slot, or milestone - SRS-2). A Task is the assignment
of an Activity to a specific TA (SRS-8); its status, Overdue/At-Risk flags,
and timestamps (SRS-10 to SRS-13) live on the Task, not the Activity, since
the same Activity could in principle be assigned to more than one TA.

Activities are scoped to a free-form `course_id` - there is no separate
Courses table yet, since this iteration doesn't need anything beyond that
id to filter by course (SRS-19's "selected course"). Google Classroom is no
longer connected, so the known course ids are simply the distinct values
already stored here (see reports.py's /api/reports/courses).

An Activity counts as history for reporting (SRS-19) once it is either
archived (`archived_at` set) or completed - i.e. its scheduled time has
passed, the same "past (completed)" rule SRS-4 uses to drop it from the
dashboard. Neither state deletes anything (SRS-20).

ConsultationSession mirrors the identically-named table added on the
not-yet-merged feature/consultation-logging branch (same columns, same
conventions) so reports.py can report on it too (SRS-20's "support-log
records") without waiting on that branch. When the two merge, this will
be a straightforward textual conflict to dedupe, not a data migration -
the schemas are intentionally identical.
"""
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker
from sqlalchemy.ext.hybrid import hybrid_property

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'dashboard.db'}")

# check_same_thread is a SQLite-only option; other databases don't accept it.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# Activity.type values (SRS-2).
ACTIVITY_TYPES = ("deadline", "lab", "consultation", "milestone")

# Task.status values (SRS-10, SRS-11). "Done" is the only status the
# Overdue/At-Risk checks in SRS-12/SRS-13 treat specially.
TASK_STATUSES = ("Not Started", "In Progress", "Done")
TASK_STATUS_DONE = "Done"

# "Due within the configured warning period" (SRS-13). Not user-configurable
# yet - kept as one constant so it has a single place to change later.
AT_RISK_WARNING = timedelta(days=2)

# User.role values (SRS-18, SRS-22). Lowercase, matching the session's
# "role" and data/allowed_users.json.
USER_ROLES = ("student", "ta", "lecturer")
ROLE_LECTURER = "lecturer"


class User(Base):
    """An internal account for an authenticated OAuth identity (SRS-22),
    carrying the role (SRS-18) all authorisation checks key off of."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_users_identity"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    provider: Mapped[str] = mapped_column(String(20))
    provider_user_id: Mapped[str] = mapped_column(String(100))
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    display_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="student")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Activity(Base):
    """A deadline, lab session, consultation slot, or milestone on a
    course's shared schedule (SRS-2, SRS-3, SRS-9)."""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[str] = mapped_column(String(100), index=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(50))
    starts_at: Mapped[datetime] = mapped_column(DateTime)
    location: Mapped[str] = mapped_column(String(200))
    created_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    # Set when a lecturer archives the activity (SRS-19, SRS-20). Archiving
    # only hides it from the active schedule; the row is never deleted.
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    tasks: Mapped[list["Task"]] = relationship(back_populates="activity")


class Task(Base):
    """The assignment of an Activity to a specific TA (SRS-8), carrying its
    own status and timestamps (SRS-10, SRS-11) and the computed Overdue /
    At-Risk flags (SRS-12, SRS-13)."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id"), index=True)
    assignee_id: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(30), default="Not Started")
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    status_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    activity: Mapped["Activity"] = relationship(back_populates="tasks")

    @hybrid_property
    def is_overdue(self) -> bool:
        """SRS-12: past due date and not Done."""
        if self.status == TASK_STATUS_DONE:
            return False
        return self.activity.starts_at < _utcnow().replace(tzinfo=None)

    @hybrid_property
    def is_at_risk(self) -> bool:
        """SRS-13: due within the warning period, not overdue, not Done."""
        if self.status == TASK_STATUS_DONE or self.is_overdue:
            return False
        now = _utcnow().replace(tzinfo=None)
        return self.activity.starts_at <= now + AT_RISK_WARNING


class ConsultationSession(Base):
    """A TA's logged consultation session (SRS-14, SRS-15) - the
    "support-log" data SRS-20 asks reports to retain and include."""

    __tablename__ = "consultation_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ta_user_id: Mapped[str] = mapped_column(String(100), index=True)
    session_date: Mapped[date] = mapped_column(Date)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    topic: Mapped[str] = mapped_column(String(200))
    participants: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


def init_db():
    """Create any missing tables."""
    Base.metadata.create_all(engine)


def get_db():
    """FastAPI dependency: one DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
