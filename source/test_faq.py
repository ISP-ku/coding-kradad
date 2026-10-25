"""Tests for the FAQ / Issue log API (SRS-16, SRS-17, SRS-18)."""
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
    FAQ_STATUS_PENDING,
    FAQ_STATUS_PUBLISHED,
    FAQ_STATUS_REJECTED,
    FaqEntry,
    SessionLocal,
)
from faq import _signed_in_user, require_lecturer

client = TestClient(app)

SEARCH_URL = "/api/faq"
PENDING_URL = "/api/faq/pending"
SUBMIT_URL = "/faq/submit"

VALID_SUBMISSION = {
    "question": "When is the midterm project due?",
    "answer": "",
    "tags": "deadline, project",
}


def login_as(user_id, role="ta"):
    """Pretend a signed-in user is submitting (skips real OAuth login)."""
    app.dependency_overrides[_signed_in_user] = lambda: {
        "id": user_id,
        "provider": "google",
        "role": role,
    }


def login_as_lecturer(user_id="lecturer-1"):
    """Pretend a signed-in Lecturer is reviewing (skips real OAuth login)."""
    app.dependency_overrides[require_lecturer] = lambda: {
        "id": user_id,
        "provider": "google",
        "role": "lecturer",
    }


def _session_cookie(user):
    """A real signed session cookie, as app.py's SessionMiddleware would set."""
    signer = TimestampSigner(str(backend.SECRET_KEY))
    payload = b64encode(json.dumps({"user": user}).encode())
    return signer.sign(payload).decode()


def _ku_user(role):
    return {"id": "ku-1", "username": "U", "provider": "google", "auth_method": "ku_google", "role": role}


def _seed_entry(*, question="Existing question?", answer="An answer.", tags="general",
                 status=FAQ_STATUS_PUBLISHED, submitted_by="google:111"):
    with SessionLocal() as db:
        entry = FaqEntry(
            question=question, answer=answer, tags=tags, status=status, submitted_by=submitted_by,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry.id


@pytest.fixture(autouse=True)
def clean_state():
    """Each test starts logged out with an empty table."""
    app.dependency_overrides.clear()
    with SessionLocal() as db:
        db.query(FaqEntry).delete()
        db.commit()
    yield
    app.dependency_overrides.clear()


# --- SRS-16: keyword search, Published only -------------------------------


def test_search_requires_no_login():
    """Students can browse published entries without full account access."""
    _seed_entry(question="Is attendance mandatory?", status=FAQ_STATUS_PUBLISHED)
    assert client.get(SEARCH_URL).status_code == 200


def test_search_only_returns_published_entries():
    _seed_entry(question="Published one", status=FAQ_STATUS_PUBLISHED)
    _seed_entry(question="Pending one", status=FAQ_STATUS_PENDING)
    _seed_entry(question="Rejected one", status=FAQ_STATUS_REJECTED)

    questions = [e["question"] for e in client.get(SEARCH_URL).json()]
    assert questions == ["Published one"]


@pytest.mark.parametrize("keyword", ["midterm", "MIDTERM", "deadline", "due Friday"])
def test_search_matches_question_answer_or_tags(keyword):
    _seed_entry(
        question="When is the midterm project due Friday?",
        answer="",
        tags="deadline,project",
        status=FAQ_STATUS_PUBLISHED,
    )
    results = client.get(SEARCH_URL, params={"q": keyword}).json()
    assert len(results) == 1


def test_search_excludes_non_matching_entries():
    _seed_entry(question="Lab attendance policy", tags="lab", status=FAQ_STATUS_PUBLISHED)
    assert client.get(SEARCH_URL, params={"q": "midterm"}).json() == []


def test_search_response_includes_id_and_tag_list():
    _seed_entry(question="Q", tags="a,b", status=FAQ_STATUS_PUBLISHED)
    entry = client.get(SEARCH_URL).json()[0]
    assert entry["id"] > 0
    assert entry["tags"] == ["a", "b"]


# --- SRS-17: submission ------------------------------------------------


def test_submit_requires_login():
    assert client.post(SUBMIT_URL, data=VALID_SUBMISSION).status_code == 401


def test_submit_rejects_blank_question():
    login_as("111")
    resp = client.post(SUBMIT_URL, data={**VALID_SUBMISSION, "question": "   "})
    assert resp.status_code == 422


def test_submit_saves_as_pending_and_redirects():
    login_as("111")
    resp = client.post(SUBMIT_URL, data=VALID_SUBMISSION, follow_redirects=False)
    assert resp.status_code == 303
    assert resp.headers["location"].endswith("/faq")

    with SessionLocal() as db:
        saved = db.query(FaqEntry).one()
        assert saved.status == FAQ_STATUS_PENDING
        assert saved.question == VALID_SUBMISSION["question"]
        assert saved.submitted_by == "google:111"


def test_submitted_entry_is_hidden_from_search_until_approved():
    login_as("111")
    client.post(SUBMIT_URL, data=VALID_SUBMISSION)
    assert client.get(SEARCH_URL).json() == []


def test_submit_parses_comma_separated_tags():
    login_as("111")
    client.post(SUBMIT_URL, data={**VALID_SUBMISSION, "tags": " deadline ,  project ,,"})
    with SessionLocal() as db:
        saved = db.query(FaqEntry).one()
        assert saved.tags == "deadline,project"


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
    entry_id = _seed_entry(status=FAQ_STATUS_PENDING)
    with TestClient(app) as real_client:
        real_client.cookies.set(backend.SESSION_COOKIE, _session_cookie(_ku_user(role)))
        resp = real_client.post(f"/faq/{entry_id}/approve")
        assert resp.status_code == 403


def test_pending_list_only_shows_pending_entries():
    _seed_entry(question="Published", status=FAQ_STATUS_PUBLISHED)
    _seed_entry(question="Pending", status=FAQ_STATUS_PENDING)
    _seed_entry(question="Rejected", status=FAQ_STATUS_REJECTED)

    login_as_lecturer()
    questions = [e["question"] for e in client.get(PENDING_URL).json()]
    assert questions == ["Pending"]


def test_approve_publishes_entry_and_makes_it_searchable():
    entry_id = _seed_entry(question="Can I resubmit?", status=FAQ_STATUS_PENDING)

    login_as_lecturer("lect-1")
    resp = client.post(f"/faq/{entry_id}/approve", follow_redirects=False)
    assert resp.status_code == 303

    with SessionLocal() as db:
        saved = db.get(FaqEntry, entry_id)
        assert saved.status == FAQ_STATUS_PUBLISHED
        assert saved.reviewed_by == "google:lect-1"
        assert saved.reviewed_at is not None

    assert [e["question"] for e in client.get(SEARCH_URL).json()] == ["Can I resubmit?"]


def test_reject_keeps_entry_hidden_from_search():
    entry_id = _seed_entry(question="Off-topic question", status=FAQ_STATUS_PENDING)

    login_as_lecturer()
    client.post(f"/faq/{entry_id}/reject")

    with SessionLocal() as db:
        assert db.get(FaqEntry, entry_id).status == FAQ_STATUS_REJECTED
    assert client.get(SEARCH_URL).json() == []


def test_approve_unknown_entry_is_404():
    login_as_lecturer()
    assert client.post("/faq/999999/approve").status_code == 404
