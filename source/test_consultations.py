"""Tests for the consultation logging API (SRS-14, SRS-15)."""
import os
import tempfile

# Use a throwaway database so tests never touch the real dashboard.db.
# This must be set BEFORE app/database are imported.
_tmp_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp_dir, 'test.db')}"

import pytest
from fastapi.testclient import TestClient

from app import app
from consultations import current_ta_id
from database import ConsultationSession, SessionLocal

client = TestClient(app)

VALID = {
    "session_date": "2026-10-01",
    "duration_minutes": 45,
    "topic": "ER diagram review",
    "participants": "Group 3",
}


def login_as(ta_id):
    """Pretend a TA is signed in (skips the real OAuth login)."""
    app.dependency_overrides[current_ta_id] = lambda: ta_id


@pytest.fixture(autouse=True)
def clean_state():
    """Each test starts logged out with an empty table."""
    app.dependency_overrides.clear()
    with SessionLocal() as db:
        db.query(ConsultationSession).delete()
        db.commit()
    yield
    app.dependency_overrides.clear()


def test_requires_login():
    assert client.post("/api/consultations", json=VALID).status_code == 401
    assert client.get("/api/consultations").status_code == 401


def test_create_consultation_saves_record():
    login_as("google:111")
    r = client.post("/api/consultations", json=VALID)
    assert r.status_code == 201
    body = r.json()
    assert body["topic"] == "ER diagram review"
    assert body["duration_minutes"] == 45
    assert body["id"] > 0


@pytest.mark.parametrize("field", list(VALID))
def test_missing_required_field_is_rejected(field):
    login_as("google:111")
    data = {k: v for k, v in VALID.items() if k != field}
    assert client.post("/api/consultations", json=data).status_code == 422
    assert client.get("/api/consultations").json() == []  # nothing saved


@pytest.mark.parametrize("field", ["topic", "participants"])
def test_blank_text_is_rejected(field):
    login_as("google:111")
    r = client.post("/api/consultations", json={**VALID, field: "   "})
    assert r.status_code == 422


@pytest.mark.parametrize("minutes", [0, -15])
def test_duration_must_be_positive(minutes):
    login_as("google:111")
    r = client.post("/api/consultations", json={**VALID, "duration_minutes": minutes})
    assert r.status_code == 422


def test_saved_record_appears_in_own_history():
    login_as("google:111")
    client.post("/api/consultations", json=VALID)
    history = client.get("/api/consultations").json()
    assert len(history) == 1
    assert history[0]["participants"] == "Group 3"


def test_history_is_newest_first():
    login_as("google:111")
    client.post("/api/consultations", json={**VALID, "session_date": "2026-09-01", "topic": "older"})
    client.post("/api/consultations", json={**VALID, "session_date": "2026-10-01", "topic": "newer"})
    topics = [c["topic"] for c in client.get("/api/consultations").json()]
    assert topics == ["newer", "older"]


def test_ta_cannot_see_another_tas_history():
    login_as("google:111")
    client.post("/api/consultations", json=VALID)
    login_as("line:222")
    assert client.get("/api/consultations").json() == []
