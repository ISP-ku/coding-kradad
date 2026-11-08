"""FAQ / Issue board (SRS-16, SRS-17, SRS-18).

A Reddit-style discussion board: anyone can browse Published topics, a
signed-in user (TA or student) can submit a new topic and comment on a
Published one, and a lecturer reviews new submissions before they become
public.

GET  /api/faq
    Keyword search over Published topics' title/description (SRS-16).
    Works without a session - matching the target users' "Students ...
    view FAQ/issue entries ... without needing full account access" goal
    - but the Next.js server component forwards the cookie when one
    exists (see nextjs-frontend/app/faq/page.tsx) so `saved` reflects the
    viewer's own bookmarks from the first render.

GET  /api/faq/pending
    Lecturer-only review queue (SRS-18).

GET  /api/faq/saved
    A signed-in user's bookmarked topics.

GET  /api/faq/{id}
    A single Published topic with its comment thread. 404s for anyone
    (lecturer included) while the topic is Pending or Rejected - pending
    topics stay private until reviewed, same as the list above.

POST /api/faq
    A signed-in user (TA or student) submits a new topic. It is saved as
    Pending and stays hidden from everyone but a lecturer until reviewed
    (SRS-17).

POST /api/faq/{id}/approve
POST /api/faq/{id}/reject
    Lecturer-only review actions (SRS-18). Approving publishes the topic
    (visible in the search/detail above); rejecting keeps it hidden. Both
    record who reviewed it and when.

POST /api/faq/{id}/comments
    A signed-in user adds a comment to a Published topic's discussion.

POST   /api/faq/{id}/save
DELETE /api/faq/{id}/save
    Bookmark / unbookmark a Published topic for the signed-in user.

Role enforcement follows reports.py's require_lecturer pattern: go
through app.py's current_user() (the same session check /api/me uses),
then check the role users.py copied into the session at login.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import (
    TOPIC_STATUS_PENDING,
    TOPIC_STATUS_PUBLISHED,
    TOPIC_STATUS_REJECTED,
    Comment,
    SavedTopic,
    Topic,
    get_db,
)
from timeutil import UtcDateTime

router = APIRouter(prefix="/api/faq", tags=["faq"])

# Non-blank after trimming (SRS-17).
RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _signed_in_user(request: Request) -> dict:
    """Who is logged in. Raises 401 if nobody is (SRS-17 submissions)."""
    # Imported here, not at module level: app.py imports this module to
    # register the router, so a top-level import would be circular.
    from app import current_user

    user = current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in first.")
    return user


def _optional_user(request: Request) -> Optional[dict]:
    """Who is logged in, or None - the topic list/detail is public."""
    from app import current_user

    return current_user(request)


def require_lecturer(request: Request) -> dict:
    """Signed in AND a Lecturer (SRS-18). 401 if nobody is signed in, 403
    if they're signed in but not a Lecturer."""
    user = _signed_in_user(request)
    if user.get("role") != "lecturer":
        raise HTTPException(status_code=403, detail="Lecturer access required.")
    return user


def _identity(user: dict) -> str:
    return f"{user['provider']}:{user['id']}"


class CommentIn(BaseModel):
    body: RequiredText


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author: str
    body: str
    created_at: UtcDateTime


class TopicIn(BaseModel):
    title: RequiredText
    description: RequiredText


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: str
    submitted_by: str
    created_at: UtcDateTime
    comment_count: int
    saved: bool

    @classmethod
    def from_topic(cls, topic: Topic, saved_ids: set[int]) -> "TopicOut":
        return cls(
            id=topic.id,
            title=topic.title,
            description=topic.description,
            status=topic.status,
            submitted_by=topic.submitted_by,
            created_at=topic.created_at,
            comment_count=len(topic.comments),
            saved=topic.id in saved_ids,
        )


class TopicDetailOut(TopicOut):
    comments: list[CommentOut]

    @classmethod
    def from_topic_detail(cls, topic: Topic, saved_ids: set[int]) -> "TopicDetailOut":
        return cls(
            id=topic.id,
            title=topic.title,
            description=topic.description,
            status=topic.status,
            submitted_by=topic.submitted_by,
            created_at=topic.created_at,
            comment_count=len(topic.comments),
            saved=topic.id in saved_ids,
            comments=[CommentOut.model_validate(c) for c in topic.comments],
        )


def _saved_ids(db: Session, user: Optional[dict]) -> set[int]:
    if not user:
        return set()
    rows = db.scalars(select(SavedTopic.topic_id).where(SavedTopic.user_id == _identity(user))).all()
    return set(rows)


def _get_published_topic(db: Session, topic_id: int) -> Topic:
    topic = db.get(Topic, topic_id)
    if topic is None or topic.status != TOPIC_STATUS_PUBLISHED:
        raise HTTPException(status_code=404, detail="Topic not found.")
    return topic


@router.get("/pending", response_model=list[TopicOut])
def list_pending_topics(
    _user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    topics = db.scalars(
        select(Topic).where(Topic.status == TOPIC_STATUS_PENDING).order_by(Topic.created_at)
    ).all()
    return [TopicOut.from_topic(t, set()) for t in topics]


@router.get("/saved", response_model=list[TopicOut])
def list_saved_topics(
    user: dict = Depends(_signed_in_user),
    db: Session = Depends(get_db),
):
    saved_ids = _saved_ids(db, user)
    if not saved_ids:
        return []
    topics = db.scalars(
        select(Topic)
        .where(Topic.id.in_(saved_ids), Topic.status == TOPIC_STATUS_PUBLISHED)
        .order_by(Topic.created_at.desc())
    ).all()
    return [TopicOut.from_topic(t, saved_ids) for t in topics]


@router.get("", response_model=list[TopicOut])
def search_topics(
    q: str = "",
    viewer: Optional[dict] = Depends(_optional_user),
    db: Session = Depends(get_db),
):
    keyword = q.strip().lower()
    topics = db.scalars(
        select(Topic)
        .where(Topic.status == TOPIC_STATUS_PUBLISHED)
        .order_by(Topic.created_at.desc())
    ).all()
    if keyword:
        topics = [
            t for t in topics
            if keyword in t.title.lower() or keyword in t.description.lower()
        ]
    saved_ids = _saved_ids(db, viewer)
    return [TopicOut.from_topic(t, saved_ids) for t in topics]


@router.get("/{topic_id}", response_model=TopicDetailOut)
def get_topic(
    topic_id: int,
    viewer: Optional[dict] = Depends(_optional_user),
    db: Session = Depends(get_db),
):
    topic = _get_published_topic(db, topic_id)
    saved_ids = _saved_ids(db, viewer)
    return TopicDetailOut.from_topic_detail(topic, saved_ids)


@router.post("", response_model=TopicOut, status_code=201)
def submit_topic(
    data: TopicIn,
    user: dict = Depends(_signed_in_user),
    db: Session = Depends(get_db),
):
    topic = Topic(
        title=data.title,
        description=data.description,
        status=TOPIC_STATUS_PENDING,
        submitted_by=_identity(user),
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return TopicOut.from_topic(topic, set())


def _review(db: Session, topic_id: int, reviewer: dict, status: str) -> Topic:
    topic = db.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found.")
    topic.status = status
    topic.reviewed_by = _identity(reviewer)
    topic.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(topic)
    return topic


@router.post("/{topic_id}/approve", response_model=TopicOut)
def approve_topic(
    topic_id: int,
    user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    topic = _review(db, topic_id, user, TOPIC_STATUS_PUBLISHED)
    return TopicOut.from_topic(topic, set())


@router.post("/{topic_id}/reject", response_model=TopicOut)
def reject_topic(
    topic_id: int,
    user: dict = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    topic = _review(db, topic_id, user, TOPIC_STATUS_REJECTED)
    return TopicOut.from_topic(topic, set())


@router.post("/{topic_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(
    topic_id: int,
    data: CommentIn,
    user: dict = Depends(_signed_in_user),
    db: Session = Depends(get_db),
):
    topic = _get_published_topic(db, topic_id)
    comment = Comment(topic_id=topic.id, author=_identity(user), body=data.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.post("/{topic_id}/save", status_code=204)
def save_topic(
    topic_id: int,
    user: dict = Depends(_signed_in_user),
    db: Session = Depends(get_db),
):
    _get_published_topic(db, topic_id)
    exists = db.scalar(
        select(SavedTopic).where(SavedTopic.user_id == _identity(user), SavedTopic.topic_id == topic_id)
    )
    if not exists:
        db.add(SavedTopic(user_id=_identity(user), topic_id=topic_id))
        db.commit()


@router.delete("/{topic_id}/save", status_code=204)
def unsave_topic(
    topic_id: int,
    user: dict = Depends(_signed_in_user),
    db: Session = Depends(get_db),
):
    row = db.scalar(
        select(SavedTopic).where(SavedTopic.user_id == _identity(user), SavedTopic.topic_id == topic_id)
    )
    if row:
        db.delete(row)
        db.commit()
