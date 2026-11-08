"""Consultation logging API (SRS-14, SRS-15).

POST /api/consultations  -> a TA records a consultation session
GET  /api/consultations  -> a TA lists their own recorded sessions
"""
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from timeutil import UtcDateTime
from database import ConsultationSession, get_db

router = APIRouter(prefix="/api/consultations", tags=["consultations"])

# Required text: surrounding spaces are trimmed, then it must not be empty (SRS-14).
RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ConsultationIn(BaseModel):
    session_date: date
    duration_minutes: int = Field(gt=0)
    topic: RequiredText = Field(max_length=200)
    participants: RequiredText = Field(max_length=300)


class ConsultationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_date: date
    duration_minutes: int
    topic: str
    participants: str
    created_at: UtcDateTime


def current_ta_id(request: Request) -> str:
    """Who is logged in, e.g. 'google:1234'. 401 if nobody is, 403 if the
    account is not a TA (SRS-14, SRS-18).

    Goes through app.py's current_user() like every other router, so a
    session that /api/me rejects (old multi-provider sessions, or a local
    test session after local login was turned off) is rejected here too."""
    # Imported here, not at module level: app.py imports this module.
    from app import current_user

    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first.")
    if user.get("role") != "ta":
        raise HTTPException(status_code=403, detail="Teaching assistant access required.")
    return f"{user['provider']}:{user['id']}"


@router.post("", response_model=ConsultationOut, status_code=201)
def create_consultation(
    data: ConsultationIn,
    ta_id: str = Depends(current_ta_id),
    db: Session = Depends(get_db),
):
    record = ConsultationSession(ta_user_id=ta_id, **data.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("", response_model=list[ConsultationOut])
def list_my_consultations(
    ta_id: str = Depends(current_ta_id),
    db: Session = Depends(get_db),
):
    query = (
        select(ConsultationSession)
        .where(ConsultationSession.ta_user_id == ta_id)
        .order_by(ConsultationSession.session_date.desc(), ConsultationSession.id.desc())
    )
    return db.scalars(query).all()
