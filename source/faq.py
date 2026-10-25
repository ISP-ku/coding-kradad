"""FAQ / Issue log (SRS-16, SRS-17, SRS-18).

GET  /api/faq
    Keyword search over question text, answer and tags (SRS-16). This is
    called from the Next.js server component without forwarding the
    session cookie (see nextjs-frontend/app/faq/page.tsx), so it is
    reachable without signing in and only ever returns Published entries -
    which matches the target users' "Students ... view FAQ/issue entries
    ... without needing full account access" goal.

POST /faq/submit
    A signed-in user (TA or student) submits a new entry. It is saved as
    Pending and stays hidden from the search above until a lecturer
    reviews it (SRS-17). This is a plain HTML form target (not a JSON
    API), so the already-built frontend's <form method="post"> works
    as-is; the session cookie rides along because frontend and backend
    are same-site. Redirects back to the frontend FAQ page like the old
    source/test_ui.py preview did.

GET  /api/faq/pending
POST /api/faq/{id}/approve
POST /api/faq/{id}/reject
    Lecturer-only review queue and actions (SRS-18). Approving publishes
    the entry (visible in the search above); rejecting keeps it hidden.
    Both record who reviewed it and when.

Role enforcement follows reports.py's require_lecturer pattern: go
through app.py's current_user() (the same session check /api/me uses),
then check the role users.py copied into the session at login.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import (
    FAQ_STATUS_PENDING,
    FAQ_STATUS_PUBLISHED,
    FAQ_STATUS_REJECTED,
    ROLE_LECTURER,
    FaqEntry,
    get_db,
)

router = APIRouter(tags=["faq"])


def _signed_in_user(request: Request) -> dict:
    """Who is logged in. Raises 401 if nobody is (SRS-17 submissions)."""
    # Imported here, not at module level: app.py imports this module to
    # register the router, so a top-level import would be circular.
    from app import current_user

    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first.")
    return user


def require_lecturer(request: Request) -> dict:
    """Signed in AND a Lecturer (SRS-18). 401 if nobody is signed in, 403
    if they're signed in but not a Lecturer."""
    user = _signed_in_user(request)
    if user.get("role") != ROLE_LECTURER:
        raise HTTPException(status_code=403, detail="Lecturer access required.")
    return user


def _frontend_url(path: str) -> str:
    from app import FRONTEND_URL

    return FRONTEND_URL + path


class FaqOut(BaseModel):
    id: int
    question: str
    answer: str
    status: str
    tags: list[str]

    @classmethod
    def from_entry(cls, entry: FaqEntry) -> "FaqOut":
        return cls(
            id=entry.id,
            question=entry.question,
            answer=entry.answer,
            status=entry.status,
            tags=[t for t in entry.tags.split(",") if t],
        )


@router.get("/api/faq", response_model=list[FaqOut])
def search_faq(q: str = "", db: Session = Depends(get_db)):
    keyword = q.strip().lower()
    entries = db.scalars(
        select(FaqEntry)
        .where(FaqEntry.status == FAQ_STATUS_PUBLISHED)
        .order_by(FaqEntry.created_at.desc())
    ).all()
    if keyword:
        entries = [
            e
            for e in entries
            if keyword in e.question.lower()
            or keyword in e.answer.lower()
            or keyword in e.tags.lower()
        ]
    return [FaqOut.from_entry(e) for e in entries]


@router.get("/api/faq/pending", response_model=list[FaqOut])
def list_pending_faq(
    _user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    entries = db.scalars(
        select(FaqEntry)
        .where(FaqEntry.status == FAQ_STATUS_PENDING)
        .order_by(FaqEntry.created_at)
    ).all()
    return [FaqOut.from_entry(e) for e in entries]


@router.post("/faq/submit")
def submit_faq(
    request: Request,
    question: str = Form(...),
    answer: str = Form(""),
    tags: str = Form(""),
    user: dict = Depends(_signed_in_user),
    db: Session = Depends(get_db),
):
    question = question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="Question is required.")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    entry = FaqEntry(
        question=question,
        answer=answer.strip(),
        tags=",".join(tag_list),
        status=FAQ_STATUS_PENDING,
        submitted_by=f"{user['provider']}:{user['id']}",
    )
    db.add(entry)
    db.commit()
    return RedirectResponse(_frontend_url("/faq"), status_code=303)


def _review(db: Session, entry_id: int, reviewer: dict, status: str) -> FaqEntry:
    entry = db.get(FaqEntry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="FAQ/issue entry not found.")
    entry.status = status
    entry.reviewed_by = f"{reviewer['provider']}:{reviewer['id']}"
    entry.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return entry


@router.post("/faq/{entry_id}/approve")
def approve_faq(
    entry_id: int,
    user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    _review(db, entry_id, user, FAQ_STATUS_PUBLISHED)
    return RedirectResponse(_frontend_url("/faq"), status_code=303)


@router.post("/faq/{entry_id}/reject")
def reject_faq(
    entry_id: int,
    user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    _review(db, entry_id, user, FAQ_STATUS_REJECTED)
    return RedirectResponse(_frontend_url("/faq"), status_code=303)
