"""Tests for the FAQ / Issue board API (SRS-16, SRS-17, SRS-18)."""
import json
import os
import tempfile
from base64 import b64encode

# Use a throwaway database so tests never touch the real dashboard.db.
# This must be set BEFORE app/database are imported.
_tmp_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp_dir, 'test.db')}"

import pytest
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner

import app as backend
from app import app
from database import (
    TOPIC_STATUS_PENDING,
    TOPIC_STATUS_PUBLISHED,
    TOPIC_STATUS_REJECTED,
    Comment,
    SavedTopic,
    SessionLocal,
    Topic,
)
from faq import _optional_user, _signed_in_user, require_lecturer

client = TestClient(app)

BOARD_URL = "/api/faq"
PENDING_URL = "/api/faq/pending"
SAVED_URL = "/api/faq/saved"

VALID_SUBMISSION = {
    "title": "When is the midterm project due?",
    "description": "Please clarify the exact deadline and timezone.",
}


def login_as(user_id, role="ta"):
    """Pretend a signed-in user is acting (skips real OAuth login)."""
    user = {"id": user_id, "provider": "google", "role": role}
    app.dependency_overrides[_signed_in_user] = lambda: user
    app.dependency_overrides[_optional_user] = lambda: user


def login_as_lecturer(user_id="lecturer-1"):
    """Pretend a signed-in Lecturer is reviewing (skips real OAuth login)."""
    user = {"id": user_id, "provider": "google", "role": "lecturer"}
    app.dependency_overrides[require_lecturer] = lambda: user
    app.dependency_overrides[_optional_user] = lambda: user


def _session_cookie(user):
    """A real signed session cookie, as app.py's SessionMiddleware would set."""
    signer = TimestampSigner(str(backend.SECRET_KEY))
    payload = b64encode(json.dumps({"user": user}).encode())
    return signer.sign(payload).decode()


def _ku_user(role):
    return {"id": "ku-1", "username": "U", "provider": "google", "auth_method": "ku_google", "role": role}


def _seed_topic(*, title="Existing topic?", description="Some description.",
                 status=TOPIC_STATUS_PUBLISHED, submitted_by="google:111"):
    with SessionLocal() as db:
        topic = Topic(title=title, description=description, status=status, submitted_by=submitted_by)
        db.add(topic)
        db.commit()
        db.refresh(topic)
        return topic.id


@pytest.fixture(autouse=True)
def clean_state():
    """Each test starts logged out with empty tables."""
    app.dependency_overrides.clear()
    with SessionLocal() as db:
        db.query(SavedTopic).delete()
        db.query(Comment).delete()
        db.query(Topic).delete()
        db.commit()
    yield
    app.dependency_overrides.clear()


# --- SRS-16: keyword search, Published only -------------------------------


def test_search_requires_no_login():
    """Students can browse published topics without full account access."""
    _seed_topic(title="Is attendance mandatory?", status=TOPIC_STATUS_PUBLISHED)
    assert client.get(BOARD_URL).status_code == 200


def test_search_only_returns_published_topics():
    _seed_topic(title="Published one", status=TOPIC_STATUS_PUBLISHED)
    _seed_topic(title="Pending one", status=TOPIC_STATUS_PENDING)
    _seed_topic(title="Rejected one", status=TOPIC_STATUS_REJECTED)

    titles = [t["title"] for t in client.get(BOARD_URL).json()]
    assert titles == ["Published one"]


@pytest.mark.parametrize("keyword", ["midterm", "MIDTERM", "deadline", "due Friday"])
def test_search_matches_title_or_description(keyword):
    _seed_topic(
        title="When is the midterm project due Friday?",
        description="Covers the deadline for the project.",
        status=TOPIC_STATUS_PUBLISHED,
    )
    results = client.get(BOARD_URL, params={"q": keyword}).json()
    assert len(results) == 1


def test_search_excludes_non_matching_topics():
    _seed_topic(title="Lab attendance policy", description="About lab sessions.", status=TOPIC_STATUS_PUBLISHED)
    assert client.get(BOARD_URL, params={"q": "midterm"}).json() == []


def test_search_response_includes_comment_count_and_saved_flag():
    topic_id = _seed_topic(title="Q", status=TOPIC_STATUS_PUBLISHED)
    topic = client.get(BOARD_URL).json()[0]
    assert topic["id"] == topic_id
    assert topic["comment_count"] == 0
    assert topic["saved"] is False


# --- SRS-17: submission ------------------------------------------------


def test_submit_requires_login():
    assert client.post(BOARD_URL, json=VALID_SUBMISSION).status_code == 401


def test_submit_rejects_blank_title():
    login_as("111")
    resp = client.post(BOARD_URL, json={**VALID_SUBMISSION, "title": "   "})
    assert resp.status_code == 422


def test_submit_rejects_blank_description():
    login_as("111")
    resp = client.post(BOARD_URL, json={**VALID_SUBMISSION, "description": "   "})
    assert resp.status_code == 422


def test_submit_saves_as_pending():
    login_as("111")
    resp = client.post(BOARD_URL, json=VALID_SUBMISSION)
    assert resp.status_code == 201
    assert resp.json()["status"] == TOPIC_STATUS_PENDING

    with SessionLocal() as db:
        saved = db.query(Topic).one()
        assert saved.status == TOPIC_STATUS_PENDING
        assert saved.title == VALID_SUBMISSION["title"]
        assert saved.submitted_by == "google:111"


def test_submitted_topic_is_hidden_from_search_until_approved():
    login_as("111")
    client.post(BOARD_URL, json=VALID_SUBMISSION)
    assert client.get(BOARD_URL).json() == []


# --- topic detail + privacy ------------------------------------------------


def test_detail_requires_no_login_for_published_topic():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    resp = client.get(f"{BOARD_URL}/{topic_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == topic_id


def test_detail_hides_pending_topic_from_everyone():
    """Pending topics stay private, same as the original FAQ entries did -
    a lecturer reviews them from the pending queue, not the detail page."""
    topic_id = _seed_topic(status=TOPIC_STATUS_PENDING)
    assert client.get(f"{BOARD_URL}/{topic_id}").status_code == 404

    login_as_lecturer()
    assert client.get(f"{BOARD_URL}/{topic_id}").status_code == 404


def test_detail_unknown_topic_is_404():
    assert client.get(f"{BOARD_URL}/999999").status_code == 404


def test_detail_includes_comments_oldest_first():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    with SessionLocal() as db:
        db.add_all([
            Comment(topic_id=topic_id, author="google:1", body="first"),
            Comment(topic_id=topic_id, author="google:2", body="second"),
        ])
        db.commit()

    bodies = [c["body"] for c in client.get(f"{BOARD_URL}/{topic_id}").json()["comments"]]
    assert bodies == ["first", "second"]


# --- comments ------------------------------------------------


def test_comment_requires_login():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    resp = client.post(f"{BOARD_URL}/{topic_id}/comments", json={"body": "hi"})
    assert resp.status_code == 401


def test_comment_rejects_blank_body():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    login_as("111")
    resp = client.post(f"{BOARD_URL}/{topic_id}/comments", json={"body": "   "})
    assert resp.status_code == 422


def test_comment_is_saved_and_returned():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    login_as("111")
    resp = client.post(f"{BOARD_URL}/{topic_id}/comments", json={"body": "Great question!"})
    assert resp.status_code == 201
    assert resp.json()["body"] == "Great question!"
    assert resp.json()["author"] == "google:111"

    with SessionLocal() as db:
        assert db.query(Comment).filter_by(topic_id=topic_id).count() == 1


def test_comment_on_pending_topic_is_404():
    """Matches the detail view: nobody can interact with an unreviewed topic."""
    topic_id = _seed_topic(status=TOPIC_STATUS_PENDING)
    login_as("111")
    resp = client.post(f"{BOARD_URL}/{topic_id}/comments", json={"body": "hi"})
    assert resp.status_code == 404


# --- save / saved topics ------------------------------------------------


def test_save_requires_login():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    assert client.post(f"{BOARD_URL}/{topic_id}/save").status_code == 401


def test_save_then_search_marks_topic_saved():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    login_as("111")
    assert client.post(f"{BOARD_URL}/{topic_id}/save").status_code == 204

    topic = client.get(BOARD_URL).json()[0]
    assert topic["saved"] is True


def test_save_is_idempotent():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    login_as("111")
    client.post(f"{BOARD_URL}/{topic_id}/save")
    client.post(f"{BOARD_URL}/{topic_id}/save")

    with SessionLocal() as db:
        assert db.query(SavedTopic).count() == 1


def test_save_unknown_topic_is_404():
    login_as("111")
    assert client.post(f"{BOARD_URL}/999999/save").status_code == 404


def test_unsave_removes_bookmark():
    topic_id = _seed_topic(status=TOPIC_STATUS_PUBLISHED)
    login_as("111")
    client.post(f"{BOARD_URL}/{topic_id}/save")

    resp = client.delete(f"{BOARD_URL}/{topic_id}/save")
    assert resp.status_code == 204
    with SessionLocal() as db:
        assert db.query(SavedTopic).count() == 0


def test_saved_list_requires_login():
    assert client.get(SAVED_URL).status_code == 401


def test_saved_list_only_shows_this_users_saved_topics():
    mine = _seed_topic(title="Mine", status=TOPIC_STATUS_PUBLISHED)
    also_mine = _seed_topic(title="Also mine", status=TOPIC_STATUS_PUBLISHED)
    _seed_topic(title="Never saved", status=TOPIC_STATUS_PUBLISHED)

    login_as("111")
    client.post(f"{BOARD_URL}/{mine}/save")
    client.post(f"{BOARD_URL}/{also_mine}/save")

    login_as("222")
    assert client.get(SAVED_URL).json() == []

    login_as("111")
    titles = {t["title"] for t in client.get(SAVED_URL).json()}
    assert titles == {"Mine", "Also mine"}


# --- SRS-18: lecturer-only review ---------------------------------------


def test_pending_list_requires_login():
    assert client.get(PENDING_URL).status_code == 401


def test_pending_list_requires_lecturer():
    with TestClient(app) as real_client:
        real_client.cookies.set(backend.SESSION_COOKIE, _session_cookie(_ku_user("ta")))
        assert real_client.get(PENDING_URL).status_code == 403


@pytest.mark.parametrize("role", ["student", "ta", "Lecturer"])
def test_approve_requires_lecturer_role_not_just_login(role):
    """A signed-in non-lecturer must be rejected with 403. "Lecturer" (wrong
    case) must not pass either - roles are lowercase."""
    topic_id = _seed_topic(status=TOPIC_STATUS_PENDING)
    with TestClient(app) as real_client:
        real_client.cookies.set(backend.SESSION_COOKIE, _session_cookie(_ku_user(role)))
        resp = real_client.post(f"{BOARD_URL}/{topic_id}/approve")
        assert resp.status_code == 403


def test_pending_list_only_shows_pending_topics():
    _seed_topic(title="Published", status=TOPIC_STATUS_PUBLISHED)
    _seed_topic(title="Pending", status=TOPIC_STATUS_PENDING)
    _seed_topic(title="Rejected", status=TOPIC_STATUS_REJECTED)

    login_as_lecturer()
    titles = [t["title"] for t in client.get(PENDING_URL).json()]
    assert titles == ["Pending"]


def test_approve_publishes_topic_and_makes_it_searchable():
    topic_id = _seed_topic(title="Can I resubmit?", status=TOPIC_STATUS_PENDING)

    login_as_lecturer("lect-1")
    resp = client.post(f"{BOARD_URL}/{topic_id}/approve")
    assert resp.status_code == 200

    with SessionLocal() as db:
        saved = db.get(Topic, topic_id)
        assert saved.status == TOPIC_STATUS_PUBLISHED
        assert saved.reviewed_by == "google:lect-1"
        assert saved.reviewed_at is not None

    assert [t["title"] for t in client.get(BOARD_URL).json()] == ["Can I resubmit?"]


def test_reject_keeps_topic_hidden_from_search():
    topic_id = _seed_topic(title="Off-topic question", status=TOPIC_STATUS_PENDING)

    login_as_lecturer()
    client.post(f"{BOARD_URL}/{topic_id}/reject")

    with SessionLocal() as db:
        assert db.get(Topic, topic_id).status == TOPIC_STATUS_REJECTED
    assert client.get(BOARD_URL).json() == []


def test_approve_unknown_topic_is_404():
    login_as_lecturer()
    assert client.post(f"{BOARD_URL}/999999/approve").status_code == 404
