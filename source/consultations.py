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
    created_at: datetime


def current_ta_id(request: Request) -> str:
    """Who is logged in, e.g. 'google:1234'. Raises 401 if nobody is."""
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first.")
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
