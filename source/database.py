"""Database setup and the consultation_sessions table (SRS-14, SRS-15)."""
import os
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import Date, DateTime, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

BASE_DIR = Path(__file__).resolve().parent.parent
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BASE_DIR / 'dashboard.db'}")

# check_same_thread is a SQLite-only option; other databases don't accept it.
_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


class ConsultationSession(Base):
    __tablename__ = "consultation_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ta_user_id: Mapped[str] = mapped_column(String(100), index=True)
    session_date: Mapped[date] = mapped_column(Date)
    duration_minutes: Mapped[int] = mapped_column(Integer)
    topic: Mapped[str] = mapped_column(String(200))
    participants: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


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
