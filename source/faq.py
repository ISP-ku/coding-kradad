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

Sign-in and role checks are the shared dependencies from activities.py
(authenticated_user, require_lecturer), the same ones homework.py uses.
They go through app.py's current_user(), the session check /api/me uses.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from activities import authenticated_user, identity, require_lecturer
from database import (
    TOPIC_STATUS_PENDING,
    TOPIC_STATUS_PUBLISHED,
    TOPIC_STATUS_REJECTED,
    Comment,
    SavedTopic,
    Topic,
    User,
    get_db,
)
from timeutil import UtcDateTime

router = APIRouter(prefix="/api/faq", tags=["faq"])

# Non-blank after trimming (SRS-17).
RequiredText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _optional_user(request: Request) -> Optional[dict]:
    """Who is logged in, or None - the topic list/detail is public."""
    # Imported here, not at module level: app.py imports this module to
    # register the router, so a top-level import would be circular.
    from app import current_user

    return current_user(request)


class CommentIn(BaseModel):
    body: RequiredText


# Shown when a comment's author has no users row (e.g. the account was removed).
UNKNOWN_AUTHOR = "Unknown user"


class CommentOut(BaseModel):
    id: int
    author: str  # "provider:id", stable for code; never shown to people
    author_name: str  # the name to show in the thread
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
    def from_topic(cls, topic: Topic, saved_ids: set[int], **extra):
        """`extra` fills fields a subclass adds, e.g. TopicDetailOut.comments."""
        return cls(
            id=topic.id,
            title=topic.title,
            description=topic.description,
            status=topic.status,
            submitted_by=topic.submitted_by,
            created_at=topic.created_at,
            comment_count=len(topic.comments),
            saved=topic.id in saved_ids,
            **extra,
        )


class TopicDetailOut(TopicOut):
    comments: list[CommentOut]


def _saved_ids(db: Session, user: Optional[dict]) -> set[int]:
    if not user:
        return set()
    rows = db.scalars(select(SavedTopic.topic_id).where(SavedTopic.user_id == identity(user))).all()
    return set(rows)


def _display_names(db: Session, identities: set[str]) -> dict[str, str]:
    """{"google:123": "Somchai J.", ...} from the users table, which records
    every account's display name at sign-in. Identities with no row are left
    out, so callers fall back to UNKNOWN_AUTHOR."""
    user_ids = {i.partition(":")[2] for i in identities}
    if not user_ids:
        return {}
    rows = db.execute(
        select(User.provider, User.provider_user_id, User.display_name)
        .where(User.provider_user_id.in_(user_ids))
    ).all()
    names = {f"{provider}:{user_id}": name for provider, user_id, name in rows}
    return {i: names[i] for i in identities if i in names}


def _comments_out(db: Session, comments: list[Comment]) -> list[CommentOut]:
    names = _display_names(db, {c.author for c in comments})
    return [
        CommentOut(id=c.id, author=c.author, author_name=names.get(c.author, UNKNOWN_AUTHOR),
                   body=c.body, created_at=c.created_at)
        for c in comments
    ]


def _saved_row(db: Session, user: dict, topic_id: int) -> Optional[SavedTopic]:
    return db.scalar(
        select(SavedTopic).where(SavedTopic.user_id == identity(user), SavedTopic.topic_id == topic_id)
    )


def _get_topic(db: Session, topic_id: int, *, published_only: bool = True) -> Topic:
    """The topic, or 404. Pending and Rejected topics count as missing
    unless published_only is False (the lecturer's review actions)."""
    topic = db.get(Topic, topic_id)
    if topic is None or (published_only and topic.status != TOPIC_STATUS_PUBLISHED):
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
    user: dict = Depends(authenticated_user),
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
    topic = _get_topic(db, topic_id)
    saved_ids = _saved_ids(db, viewer)
    return TopicDetailOut.from_topic(topic, saved_ids, comments=_comments_out(db, topic.comments))


@router.post("", response_model=TopicOut, status_code=201)
def submit_topic(
    data: TopicIn,
    user: dict = Depends(authenticated_user),
    db: Session = Depends(get_db),
):
    topic = Topic(
        title=data.title,
        description=data.description,
        status=TOPIC_STATUS_PENDING,
        submitted_by=identity(user),
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return TopicOut.from_topic(topic, set())


def _review(db: Session, topic_id: int, reviewer: dict, status: str) -> Topic:
    topic = _get_topic(db, topic_id, published_only=False)
    topic.status = status
    topic.reviewed_by = identity(reviewer)
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
    user: dict = Depends(authenticated_user),
    db: Session = Depends(get_db),
):
    topic = _get_topic(db, topic_id)
    comment = Comment(topic_id=topic.id, author=identity(user), body=data.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return _comments_out(db, [comment])[0]


@router.post("/{topic_id}/save", status_code=204)
def save_topic(
    topic_id: int,
    user: dict = Depends(authenticated_user),
    db: Session = Depends(get_db),
):
    _get_topic(db, topic_id)
    if not _saved_row(db, user, topic_id):
        db.add(SavedTopic(user_id=identity(user), topic_id=topic_id))
        db.commit()


@router.delete("/{topic_id}/save", status_code=204)
def unsave_topic(
    topic_id: int,
    user: dict = Depends(authenticated_user),
    db: Session = Depends(get_db),
):
    row = _saved_row(db, user, topic_id)
    if row:
        db.delete(row)
        db.commit()
