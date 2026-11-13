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
    """Gate on, one course with a lecturer, TA and student; tables emptied
    again afterwards so other test files (gate off) see no members."""
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
    with SessionLocal() as db:
        for model in (CourseMember, AccessAccount, Course):
            db.query(model).delete()
        db.commit()


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


# --- Task 2: sign-in gate and per-request refresh ----------------------------

def test_non_member_google_login_denied(monkeypatch):
    client, response = google_login(monkeypatch, STRANGER)
    assert response.status_code == 403
    assert "not registered in any course" in response.text
    assert client.get("/api/me").status_code == 401


def test_member_google_login_gets_member_role(sign_in):
    assert sign_in(TA).get("/api/me").json()["role"] == "ta"
    assert sign_in(STUDENT).get("/api/me").json()["role"] == "student"


def test_protected_lecturer_signs_in_without_course(sign_in):
    assert sign_in(BOSS).get("/api/me").json()["role"] == "lecturer"


def test_removed_member_loses_session_immediately(sign_in):
    client = sign_in(TA)
    assert client.get("/api/activities").status_code == 200
    with SessionLocal() as db:
        db.query(CourseMember).filter_by(email=TA).delete()
        db.commit()
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/activities").status_code == 401


def test_role_change_applies_to_live_session(sign_in):
    client = sign_in(TA)
    assert client.get("/api/activities/assignees").status_code == 403
    with SessionLocal() as db:
        db.get(AccessAccount, TA).role = "lecturer"
        db.commit()
    assert client.get("/api/me").json()["role"] == "lecturer"
    assert client.get("/api/activities/assignees").status_code == 200


@pytest.fixture
def local_client(monkeypatch, tmp_path):
    path = tmp_path / "users.json"
    path.write_text(json.dumps([
        {"email": TA, "name": "Test TA", "role": "lecturer"},
        {"email": STRANGER, "name": "Stranger", "role": "lecturer"},
    ]))
    monkeypatch.setattr(backend, "TEST_USERS_FILE", path)
    monkeypatch.setattr(backend, "LOCAL_TEST_LOGIN", True)
    monkeypatch.setattr(backend, "APP_ENV", "development")
    monkeypatch.setattr(backend, "HOST", "127.0.0.1")
    return TestClient(backend.app, base_url="http://127.0.0.1", client=("127.0.0.1", 5000), follow_redirects=False)


def local_login(client, email):
    form = client.get("/local-test-login")
    csrf = form.text.split('name="csrf" value="')[1].split('"')[0]
    return client.post("/local-test-login", data={"email": email, "csrf": csrf})


def test_local_login_requires_membership(local_client):
    response = local_login(local_client, STRANGER)
    assert response.status_code == 403
    assert "not registered in any course" in response.text


def test_local_login_role_comes_from_access_page(local_client):
    assert local_login(local_client, TA).status_code == 303
    assert local_client.get("/api/me").json()["role"] == "ta"


# --- Task 3: roster seeding ---------------------------------------------------

import access  # noqa: E402


def empty_access_tables():
    with SessionLocal() as db:
        for model in (CourseMember, AccessAccount, Course):
            db.query(model).delete()
        db.commit()


ROSTER = {"courses": [
    {"code": "DEMO-101", "name": "Demo course", "members": [
        {"email": "Test.Lecturer@ku.th", "role": "lecturer"},
        {"email": "test.ta@ku.th", "role": "ta"},
        {"email": "test.student@ku.th"},
    ]},
    {"code": "DEMO-202", "members": [{"email": "test.ta@ku.th", "role": "ta"}]},
]}


def test_seed_roster_creates_courses_and_members(tmp_path):
    empty_access_tables()
    path = tmp_path / "roster.json"
    path.write_text(json.dumps(ROSTER))
    with SessionLocal() as db:
        assert access.seed_roster(db, path) == 2
        assert {c.code: c.name for c in db.query(Course)} == {"DEMO-101": "Demo course", "DEMO-202": "DEMO-202"}
        assert {a.email: a.role for a in db.query(AccessAccount)} == {
            "test.lecturer@ku.th": "lecturer", "test.ta@ku.th": "ta", "test.student@ku.th": "student"}
        assert db.query(CourseMember).count() == 4


@pytest.mark.parametrize("bad", [
    "not json",
    json.dumps({"courses": [{"code": "X", "members": [{"email": "a@gmail.com"}]}]}),
    json.dumps({"courses": [{"code": "X", "members": [{"email": "a@ku.th", "role": "admin"}]}]}),
    json.dumps({"courses": [{"code": "X", "members": [{"email": "a@ku.th", "role": "ta"}]},
                            {"code": "Y", "members": [{"email": "a@ku.th", "role": "student"}]}]}),
    json.dumps({"courses": [{"code": "X", "members": []}, {"code": "x", "members": []}]}),
    json.dumps({"courses": [{"code": "", "members": []}]}),
    json.dumps([]),
])
def test_seed_invalid_roster_seeds_nothing(tmp_path, bad):
    empty_access_tables()
    path = tmp_path / "roster.json"
    path.write_text(bad)
    with SessionLocal() as db:
        assert access.seed_roster(db, path) == 0
        assert db.query(Course).count() == 0 and db.query(AccessAccount).count() == 0


def test_seed_missing_roster_seeds_nothing(tmp_path, monkeypatch):
    empty_access_tables()
    with SessionLocal() as db:
        assert access.seed_roster(db, tmp_path / "missing.json") == 0
    _, response = google_login(monkeypatch, STUDENT)
    assert response.status_code == 403


def test_seed_skipped_when_courses_exist(tmp_path, monkeypatch):
    path = tmp_path / "roster.json"
    path.write_text(json.dumps(ROSTER))
    monkeypatch.setenv("COURSE_ROSTER_FILE", str(path))
    assert access.seed_roster_if_empty() == 0
    with SessionLocal() as db:
        assert [c.code for c in db.query(Course)] == ["CS101"]


def test_seed_if_empty_uses_env_path(tmp_path, monkeypatch):
    empty_access_tables()
    path = tmp_path / "roster.json"
    path.write_text(json.dumps(ROSTER))
    monkeypatch.setenv("COURSE_ROSTER_FILE", str(path))
    assert access.seed_roster_if_empty() == 2


def test_repo_roster_file_is_valid(tmp_path):
    empty_access_tables()
    with SessionLocal() as db:
        assert access.seed_roster(db, access.DEFAULT_ROSTER_FILE) >= 1
        emails = {a.email for a in db.query(AccessAccount)}
    # Every local test account can still sign in once the gate is on.
    test_users = json.loads((access.DEFAULT_ROSTER_FILE.parent / "allowed_users.json").read_text())
    assert {u["email"].lower() for u in test_users} <= emails
