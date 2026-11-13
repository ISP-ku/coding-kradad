"""Course membership (SRS-23, R-08) and the lecturer Access page API.

Iteration 6 (Sirapat). A KU account may sign in only if it is a member of at
least one course; lecturers manage courses, members and roles at /access.
LECTURER_EMAILS is a safety net: always lecturer, always allowed in, never
demoted or removed through the API.
"""
import json
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from fastapi.testclient import TestClient

import app as backend
import users
from database import AccessAccount, Course, CourseMember, SessionLocal, User

BOSS = "boss@ku.th"           # in LECTURER_EMAILS
LECTURER = "lecturer@ku.th"   # lecturer via the Access page
TA = "ta@ku.th"
STUDENT = "student@ku.th"
STRANGER = "stranger@ku.th"   # in no course


@pytest.fixture(autouse=True)
def gate_on(monkeypatch):
    monkeypatch.setenv("REQUIRE_COURSE_MEMBERSHIP", "1")
    monkeypatch.setenv("LECTURER_EMAILS", BOSS)
    monkeypatch.setenv("TA_EMAILS", "")
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "ci-client-id")
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_SECRET", "ci-secret")

    def no_network(*args, **kwargs):
        raise AssertionError("Unexpected network request")

    monkeypatch.setattr(requests.sessions.Session, "request", no_network)
    with SessionLocal() as db:
        for model in (CourseMember, AccessAccount, Course, User):
            db.query(model).delete()
        course = Course(code="CS101", name="Intro")
        db.add(course)
        db.flush()
        for email, role in ((LECTURER, "lecturer"), (TA, "ta"), (STUDENT, "student")):
            db.add(AccessAccount(email=email, role=role))
            db.add(CourseMember(course_id=course.id, email=email))
        db.commit()
    yield


def course_id(code="CS101"):
    with SessionLocal() as db:
        return db.query(Course).filter_by(code=code).one().id


def google_login(monkeypatch, email, sub=None):
    """Run the real /login -> /callback flow with a faked Google token.
    Returns (client, callback response)."""
    client = TestClient(backend.app, follow_redirects=False)
    login = client.get("/login/google")
    params = {k: v[0] for k, v in parse_qs(urlparse(login.headers["location"]).query).items()}
    claims = {"sub": sub or "sub-" + email, "name": email.split("@")[0].title(), "email": email,
              "email_verified": True, "hd": "ku.th", "nonce": params["nonce"]}
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "signed-token")
    monkeypatch.setattr(backend, "verify_google_token", lambda token: claims)
    response = client.get("/callback/google", params={"code": "code", "state": params["state"]})
    return client, response


@pytest.fixture
def sign_in(monkeypatch):
    def _sign_in(email):
        client, response = google_login(monkeypatch, email)
        assert response.status_code == 303, response.text
        return client
    return _sign_in


# --- Task 1: role resolution -------------------------------------------------

def test_resolve_role_protected_lecturer_needs_no_course():
    with SessionLocal() as db:
        assert users.resolve_role(db, "Boss@KU.th", None) == "lecturer"


def test_resolve_role_uses_member_role():
    with SessionLocal() as db:
        assert users.resolve_role(db, TA, None) == "ta"
        assert users.resolve_role(db, STUDENT.upper(), "lecturer") == "student"


def test_resolve_role_denies_non_member_when_gate_on():
    with SessionLocal() as db:
        assert users.resolve_role(db, STRANGER, "student") is None
        assert users.resolve_role(db, None, "student") is None


def test_resolve_role_falls_back_when_gate_off(monkeypatch):
    monkeypatch.setenv("REQUIRE_COURSE_MEMBERSHIP", "0")
    monkeypatch.setenv("TA_EMAILS", STRANGER)
    with SessionLocal() as db:
        assert users.resolve_role(db, STRANGER, None) == "ta"
        assert users.resolve_role(db, STRANGER, "lecturer") == "lecturer"


def test_account_without_courses_is_not_a_member():
    with SessionLocal() as db:
        db.add(AccessAccount(email=STRANGER, role="ta"))
        db.commit()
        assert users.resolve_role(db, STRANGER, None) is None


@pytest.mark.parametrize("raw,expected", [
    ("  Somchai.S@KU.TH ", "somchai.s@ku.th"),
    ("a@ku.th", "a@ku.th"),
])
def test_normalise_ku_email_accepts(raw, expected):
    assert users.normalise_ku_email(raw) == expected


@pytest.mark.parametrize("raw", ["", "nobody", "@ku.th", "a@gmail.com", "a@ku.th.evil.com", "a@b@ku.th", "a b@ku.th"])
def test_normalise_ku_email_rejects(raw):
    with pytest.raises(ValueError):
        users.normalise_ku_email(raw)
