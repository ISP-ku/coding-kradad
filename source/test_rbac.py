"""Authentication, session and role-based access tests (SRS-1, SRS-18, SRS-21 to SRS-23).

Iteration 4 test plan (Sirapat): prove that the *combined* application
enforces who may do what, not just that each router works on its own.

Unlike the feature tests, nothing here overrides a dependency. Every user
signs in through the real /login/google -> /callback/google flow (only
Google's token exchange is faked, no network), receives a real signed
session cookie, and then calls the real endpoints. So a regression in
current_user(), the session middleware, the allowlists in users.py or any
router's role check shows up here.

Roles:   student < ta < lecturer, assigned from LECTURER_EMAILS / TA_EMAILS.
Matrix:  signed out -> 401, wrong role -> 403, right role -> not 401/403.
"""
import json
from base64 import b64encode
from urllib.parse import parse_qs, urlparse

import itsdangerous
import pytest
import requests
from fastapi.testclient import TestClient

import app as backend
from database import (
    Activity, Comment, ConsultationSession, Homework, HomeworkSubmission, SavedTopic, SessionLocal, Task, Topic, User,
)

LECTURER_EMAIL = "lecturer@ku.th"
TA_EMAIL = "ta@ku.th"
OTHER_TA_EMAIL = "ta2@ku.th"
STUDENT_EMAIL = "student@ku.th"

ACCOUNTS = {  # role -> (google sub, email)
    "lecturer": ("sub-lecturer", LECTURER_EMAIL),
    "ta": ("sub-ta", TA_EMAIL),
    "other_ta": ("sub-ta2", OTHER_TA_EMAIL),
    "student": ("sub-student", STUDENT_EMAIL),
}
ROLE_OF = {"lecturer": "lecturer", "ta": "ta", "other_ta": "ta", "student": "student"}


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    """Fake Google config, no network, allowlists, and empty tables."""
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "ci-client-id")
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_SECRET", "ci-secret")

    def no_network(*args, **kwargs):
        raise AssertionError("Unexpected network request")

    monkeypatch.setattr(requests.sessions.Session, "request", no_network)
    monkeypatch.setenv("LECTURER_EMAILS", LECTURER_EMAIL)
    monkeypatch.setenv("TA_EMAILS", f"{TA_EMAIL}, {OTHER_TA_EMAIL.upper()}")
    with SessionLocal() as db:
        for model in (Comment, SavedTopic, Topic, Task, Activity, ConsultationSession, HomeworkSubmission, Homework, User):
            db.query(model).delete()
        db.commit()
    yield


@pytest.fixture
def sign_in(monkeypatch):
    """sign_in(account) -> a TestClient holding that account's real session."""
    clients = []

    def _sign_in(account, email=None, sub=None, **claim_overrides):
        default_sub, default_email = ACCOUNTS.get(account, ("sub-" + account, account))
        client = TestClient(backend.app, follow_redirects=False)
        clients.append(client)
        login = client.get("/login/google")
        params = {k: v[0] for k, v in parse_qs(urlparse(login.headers["location"]).query).items()}
        claims = {"sub": sub or default_sub, "name": account.title(), "email": email or default_email,
                  "email_verified": True, "hd": "ku.th", "nonce": params["nonce"], **claim_overrides}
        monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "signed-token")
        monkeypatch.setattr(backend, "verify_google_token", lambda token: claims)
        response = client.get("/callback/google", params={"code": "code", "state": params["state"]})
        assert response.status_code == 303, response.text
        return client

    yield _sign_in
    for client in clients:
        client.close()


@pytest.fixture
def anon():
    with TestClient(backend.app, follow_redirects=False) as client:
        yield client


VALID_ACTIVITY = {
    "course_id": "01219245", "title": "Lab 4 preparation", "type": "lab",
    "starts_at": "2099-10-21T09:30:00+07:00", "location": "Room 204",
    "assignee_id": "google:sub-ta",
}
TOPIC = {"title": "Where is the lab?", "description": "Room number for Lab 4, please."}
CONSULTATION = {"session_date": "2026-10-01", "duration_minutes": 30,
                "topic": "ER diagram", "participants": "Group 3"}
HOMEWORK = {"course_id": "01219245", "title": "HW1 - ER Diagram", "description": "Draw the ERD.",
            "due_at": "2099-01-01T09:00:00+07:00", "max_score": 20}
REPORT_QUERY = {"course_id": "01219245", "start_date": "2026-01-01", "end_date": "2026-12-31"}


def make_activity(lecturer_client):
    response = lecturer_client.post("/api/activities", json=VALID_ACTIVITY)
    assert response.status_code == 201, response.text
    return response.json()


# --- 1. Role matrix: every protected endpoint, every role ------------------

# (method, path, request kwargs, roles allowed through). Signed-out callers
# must always get 401; every other role must get 403.
PROTECTED = [
    ("GET", "/api/me", {}, {"student", "ta", "lecturer"}),
    ("GET", "/api/activities", {}, {"ta", "lecturer"}),
    ("GET", "/api/activities/assignees", {}, {"lecturer"}),
    ("POST", "/api/activities", {"json": VALID_ACTIVITY}, {"lecturer"}),
    ("GET", "/api/activities/999", {}, {"lecturer"}),
    ("PATCH", "/api/activities/999", {"json": {"title": "Renamed"}}, {"lecturer"}),
    ("POST", "/api/activities/999/archive", {}, {"lecturer"}),
    ("DELETE", "/api/activities/999", {}, {"lecturer"}),
    ("PATCH", "/api/activities/999/tasks/999", {"json": {"status": "Done"}}, {"ta", "lecturer"}),
    ("GET", "/api/consultations", {}, {"ta"}),
    ("POST", "/api/consultations", {"json": CONSULTATION}, {"ta"}),
    ("GET", "/api/homework", {}, {"student", "ta", "lecturer"}),
    ("POST", "/api/homework", {"json": HOMEWORK}, {"lecturer"}),
    ("GET", "/api/homework/999/submissions", {}, {"ta", "lecturer"}),
    ("POST", "/api/homework/999/submissions", {"json": {"answer": "my work"}}, {"student"}),
    ("PATCH", "/api/homework/999/submissions/999", {"json": {"score": 5}}, {"ta"}),
    ("GET", "/api/reports/courses", {}, {"lecturer"}),
    ("GET", "/api/reports/activities", {"params": REPORT_QUERY}, {"lecturer"}),
    ("GET", "/api/faq/pending", {}, {"lecturer"}),
    ("GET", "/api/faq/saved", {}, {"student", "ta", "lecturer"}),
    ("POST", "/api/faq", {"json": TOPIC}, {"student", "ta", "lecturer"}),
    ("POST", "/api/faq/999/comments", {"json": {"body": "Thanks"}}, {"student", "ta", "lecturer"}),
    ("POST", "/api/faq/999/save", {}, {"student", "ta", "lecturer"}),
    ("DELETE", "/api/faq/999/save", {}, {"student", "ta", "lecturer"}),
    ("POST", "/api/faq/999/approve", {}, {"lecturer"}),
    ("POST", "/api/faq/999/reject", {}, {"lecturer"}),
]
IDS = [f"{m} {p}" for m, p, _, _ in PROTECTED]


@pytest.mark.parametrize("method,path,kwargs,allowed", PROTECTED, ids=IDS)
def test_signed_out_gets_401(anon, method, path, kwargs, allowed):
    assert anon.request(method, path, **kwargs).status_code == 401


@pytest.mark.parametrize("method,path,kwargs,allowed", PROTECTED, ids=IDS)
@pytest.mark.parametrize("account", ["student", "ta", "lecturer"])
def test_role_matrix(sign_in, account, method, path, kwargs, allowed):
    client = sign_in(account)
    status = client.request(method, path, **kwargs).status_code
    if ROLE_OF[account] in allowed:
        # Authorised: the request reaches the handler (it may then 404/422 on fake data).
        assert status not in (401, 403), f"{account} wrongly denied {method} {path}: {status}"
    else:
        assert status == 403, f"{account} should be forbidden from {method} {path}, got {status}"


def test_student_has_no_dashboard_data(sign_in):
    """R-02: the Dashboard API refuses students outright, not with an empty list."""
    sign_in("ta")  # the TA must have signed in once to be assignable
    lecturer = sign_in("lecturer")
    make_activity(lecturer)
    response = sign_in("student").get("/api/activities")
    assert response.status_code == 403
    assert "Lab 4" not in response.text


def test_public_faq_board_needs_no_login(anon):
    assert anon.get("/api/faq").status_code == 200
    assert anon.get("/api/faq", params={"q": "anything"}).status_code == 200
    assert anon.get("/api/faq/999").status_code == 404  # public lookup: not found, not 401


def test_public_pages_do_not_require_login(anon):
    assert anon.get("/").status_code == 200
    assert anon.get("/api/auth-options").status_code == 200


# --- 2. Roles come from the server, never from the client -------------------

def test_role_allowlists_assign_each_role(sign_in):
    for account, role in ROLE_OF.items():
        assert sign_in(account).get("/api/me").json()["role"] == role


def test_unlisted_ku_email_is_only_a_student(sign_in):
    """SRS-23: holding a KU address proves identity, not course membership or staff rights."""
    stranger = sign_in("stranger", email="6810000000@ku.th", sub="sub-stranger")
    assert stranger.get("/api/me").json()["role"] == "student"
    for method, path, kwargs in [("GET", "/api/activities", {}), ("GET", "/api/consultations", {}),
                                 ("GET", "/api/reports/courses", {}), ("GET", "/api/faq/pending", {})]:
        assert stranger.request(method, path, **kwargs).status_code == 403


def test_email_allowlist_match_is_exact(sign_in):
    """Look-alike addresses must not inherit staff roles."""
    for fake in ("xlecturer@ku.th", "lecturer2@ku.th", "t.a@ku.th"):
        client = sign_in("fake", email=fake, sub="sub-fake")
        assert client.get("/api/me").json()["role"] == "student", fake
    # Case differences in the *same* address are still the same person.
    assert sign_in("shout", email=LECTURER_EMAIL.upper(), sub="sub-shout").get("/api/me").json()["role"] == "lecturer"


def test_google_claims_cannot_grant_a_role(sign_in):
    """A role/admin claim in the Google token or in the form is ignored."""
    client = sign_in("student", role="lecturer", is_admin=True)
    assert client.get("/api/me").json()["role"] == "student"
    assert client.get("/api/reports/courses").status_code == 403


def test_role_is_resynced_on_each_login(sign_in, monkeypatch):
    """Removing someone from LECTURER_EMAILS takes effect the next time they sign in."""
    assert sign_in("lecturer").get("/api/reports/courses").status_code == 200
    monkeypatch.setenv("LECTURER_EMAILS", "")
    demoted = sign_in("lecturer")
    assert demoted.get("/api/me").json()["role"] == "student"
    assert demoted.get("/api/reports/courses").status_code == 403


# --- 3. Object-level permissions --------------------------------------------

def test_only_assigned_ta_or_lecturer_can_update_a_task(sign_in):
    lecturer, ta = sign_in("lecturer"), sign_in("ta")
    other_ta, student = sign_in("other_ta"), sign_in("student")
    activity = make_activity(lecturer)
    url = f"/api/activities/{activity['id']}/tasks/{activity['tasks'][0]['id']}"
    body = {"status": "In Progress"}

    assert student.patch(url, json=body).status_code == 403
    assert other_ta.patch(url, json=body).status_code == 403
    assert ta.patch(url, json=body).status_code == 200
    assert lecturer.patch(url, json={"status": "Done"}).status_code == 200
    final = lecturer.get("/api/activities").json()
    assert final == [] or final[0]["tasks"][0]["status"] == "Done"


def test_status_change_is_visible_to_other_roles_and_timestamped(sign_in):
    lecturer, ta = sign_in("lecturer"), sign_in("ta")
    activity = make_activity(lecturer)
    url = f"/api/activities/{activity['id']}/tasks/{activity['tasks'][0]['id']}"
    assert activity["tasks"][0]["status_changed_at"] is None
    assert ta.patch(url, json={"status": "In Progress"}).status_code == 200
    seen = lecturer.get("/api/activities").json()[0]["tasks"][0]
    assert seen["status"] == "In Progress"
    assert seen["status_changed_at"]


def test_invalid_status_rejected_even_for_owner(sign_in):
    lecturer, ta = sign_in("lecturer"), sign_in("ta")
    activity = make_activity(lecturer)
    url = f"/api/activities/{activity['id']}/tasks/{activity['tasks'][0]['id']}"
    assert ta.patch(url, json={"status": "Hacked"}).status_code == 422


def test_only_lecturer_can_edit_archive_or_delete_an_activity(sign_in):
    sign_in("ta")
    lecturer, ta, student = sign_in("lecturer"), sign_in("other_ta"), sign_in("student")
    activity_id = make_activity(lecturer)["id"]
    for who in (student, ta, sign_in("ta")):
        assert who.get(f"/api/activities/{activity_id}").status_code == 403
        assert who.patch(f"/api/activities/{activity_id}", json={"title": "Hacked"}).status_code == 403
        assert who.post(f"/api/activities/{activity_id}/archive").status_code == 403
        assert who.delete(f"/api/activities/{activity_id}").status_code == 403
    assert lecturer.get(f"/api/activities/{activity_id}").json()["title"] == VALID_ACTIVITY["title"]
    assert lecturer.post(f"/api/activities/{activity_id}/archive").status_code == 200


def test_cannot_assign_work_to_a_non_ta(sign_in):
    lecturer = sign_in("lecturer")
    sign_in("student")  # creates a student user row
    bad = {**VALID_ACTIVITY, "assignee_id": "google:sub-student"}
    assert lecturer.post("/api/activities", json=bad).status_code == 422


def test_consultations_are_private_to_their_ta(sign_in):
    ta, other_ta = sign_in("ta"), sign_in("other_ta")
    assert ta.post("/api/consultations", json=CONSULTATION).status_code == 201
    assert len(ta.get("/api/consultations").json()) == 1
    assert other_ta.get("/api/consultations").json() == []


# --- 4. FAQ moderation visibility (R-06) ------------------------------------

def titles(response):
    assert response.status_code == 200
    return [t["title"] for t in response.json()]


def test_topic_hidden_until_lecturer_approves(sign_in, anon):
    student, lecturer = sign_in("student"), sign_in("lecturer")
    created = student.post("/api/faq", json=TOPIC)
    assert created.status_code == 201 and created.json()["status"] == "Pending"
    topic_id = created.json()["id"]

    # Pending: invisible on the board and by direct link, to everyone but the lecturer's queue.
    assert titles(anon.get("/api/faq")) == []
    assert titles(student.get("/api/faq")) == []
    assert anon.get(f"/api/faq/{topic_id}").status_code == 404
    assert student.get(f"/api/faq/{topic_id}").status_code == 404
    assert titles(lecturer.get("/api/faq/pending")) == [TOPIC["title"]]

    assert lecturer.post(f"/api/faq/{topic_id}/approve").status_code == 200
    assert titles(anon.get("/api/faq")) == [TOPIC["title"]]
    assert anon.get(f"/api/faq/{topic_id}").status_code == 200
    assert titles(lecturer.get("/api/faq/pending")) == []


def test_rejected_topic_stays_hidden_and_students_cannot_moderate(sign_in, anon):
    student, lecturer = sign_in("student"), sign_in("lecturer")
    topic_id = student.post("/api/faq", json=TOPIC).json()["id"]

    assert student.post(f"/api/faq/{topic_id}/approve").status_code == 403
    assert sign_in("ta").post(f"/api/faq/{topic_id}/approve").status_code == 403
    assert anon.post(f"/api/faq/{topic_id}/approve").status_code == 401
    assert titles(anon.get("/api/faq")) == []

    assert lecturer.post(f"/api/faq/{topic_id}/reject").status_code == 200
    assert titles(anon.get("/api/faq")) == []
    assert anon.get(f"/api/faq/{topic_id}").status_code == 404
    assert titles(lecturer.get("/api/faq/pending")) == []


def test_comments_and_saves_only_on_published_topics_and_only_when_signed_in(sign_in, anon):
    student, lecturer = sign_in("student"), sign_in("lecturer")
    topic_id = student.post("/api/faq", json=TOPIC).json()["id"]
    assert student.post(f"/api/faq/{topic_id}/comments", json={"body": "Hi"}).status_code == 404  # still pending
    lecturer.post(f"/api/faq/{topic_id}/approve")
    assert anon.post(f"/api/faq/{topic_id}/comments", json={"body": "Hi"}).status_code == 401
    assert student.post(f"/api/faq/{topic_id}/comments", json={"body": "Hi"}).status_code == 201
    assert anon.post(f"/api/faq/{topic_id}/save").status_code == 401


def test_saved_topics_are_private_to_each_user(sign_in):
    student, ta, lecturer = sign_in("student"), sign_in("ta"), sign_in("lecturer")
    topic_id = student.post("/api/faq", json=TOPIC).json()["id"]
    lecturer.post(f"/api/faq/{topic_id}/approve")
    assert student.post(f"/api/faq/{topic_id}/save").status_code == 204
    assert titles(student.get("/api/faq/saved")) == [TOPIC["title"]]
    assert titles(ta.get("/api/faq/saved")) == []


# --- 5. Sessions: login, logout, tampering, expiry ---------------------------

def test_login_sets_a_hardened_cookie(monkeypatch):
    client = TestClient(backend.app, follow_redirects=False)
    # Re-run the flow by hand so the callback's Set-Cookie header can be inspected.
    params = {k: v[0] for k, v in parse_qs(urlparse(client.get("/login/google").headers["location"]).query).items()}
    claims = {"sub": "s", "name": "S", "email": STUDENT_EMAIL, "email_verified": True,
              "hd": "ku.th", "nonce": params["nonce"]}
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "t")
    monkeypatch.setattr(backend, "verify_google_token", lambda t: claims)
    cookie = client.get("/callback/google", params={"code": "c", "state": params["state"]}).headers["set-cookie"].lower()
    assert cookie.startswith(backend.SESSION_COOKIE + "=")
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert f"max-age={8 * 60 * 60}" in cookie
    assert "id_token" not in cookie and "access_token" not in cookie


def test_session_cookie_never_exposes_tokens_or_secrets(sign_in):
    client = sign_in("student")
    me = client.get("/api/me").json()
    assert set(me) >= {"id", "username", "email", "role"}
    for secret in ("id_token", "access_token", "refresh_token", "client_secret"):
        assert secret not in me
    assert client.get("/api/me").headers["cache-control"] == "no-store"


def test_logout_ends_access_everywhere(sign_in):
    client = sign_in("lecturer")
    assert client.get("/api/reports/courses").status_code == 200
    response = client.get("/logout")
    assert response.status_code == 303
    assert response.headers["location"] == backend.FRONTEND_URL + "/"
    for path in ("/api/me", "/api/activities", "/api/reports/courses", "/api/faq/pending"):
        assert client.get(path).status_code == 401, path


def test_tampered_session_cookie_rejected(sign_in):
    client = sign_in("lecturer")
    value = client.cookies.get(backend.SESSION_COOKIE)
    client.cookies.clear()
    client.cookies.set(backend.SESSION_COOKIE, value[:-3] + ("AAA" if not value.endswith("AAA") else "BBB"))
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/reports/courses").status_code == 401


def test_forged_session_signed_with_wrong_key_rejected(anon):
    user = {"id": "evil", "username": "Evil", "email": "evil@ku.th", "provider": "google",
            "auth_method": "ku_google", "role": "lecturer"}
    payload = b64encode(json.dumps({"user": user}).encode())
    forged = itsdangerous.TimestampSigner("not-the-real-secret").sign(payload).decode()
    anon.cookies.set(backend.SESSION_COOKIE, forged)
    assert anon.get("/api/me").status_code == 401
    assert anon.get("/api/reports/courses").status_code == 401


def test_session_without_auth_method_rejected(anon):
    """A correctly signed but legacy session (old providers / preview) is not a login."""
    user = {"id": "x", "username": "Old", "provider": "discord", "role": "lecturer"}
    payload = b64encode(json.dumps({"user": user}).encode())
    anon.cookies.set(backend.SESSION_COOKIE, itsdangerous.TimestampSigner(backend.SECRET_KEY).sign(payload).decode())
    assert anon.get("/api/me").status_code == 401
    assert anon.get("/api/activities").status_code == 401


def test_expired_session_cookie_rejected(sign_in, monkeypatch):
    client = sign_in("lecturer")
    now = backend.time.time()
    monkeypatch.setattr("itsdangerous.timed.time.time", lambda: now + 8 * 60 * 60 + 60)
    assert client.get("/api/me").status_code == 401


def test_new_login_attempt_drops_the_previous_identity(sign_in):
    """Starting another sign-in in the same browser must not keep the old user logged in."""
    client = sign_in("lecturer")
    assert client.get("/api/me").status_code == 200
    client.get("/login/google")
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/reports/courses").status_code == 401


def test_two_browsers_have_independent_sessions(sign_in):
    lecturer, student = sign_in("lecturer"), sign_in("student")
    assert lecturer.get("/api/me").json()["role"] == "lecturer"
    assert student.get("/api/me").json()["role"] == "student"
    student.get("/logout")
    assert lecturer.get("/api/me").status_code == 200


@pytest.mark.parametrize("overrides", [
    {"email": "attacker@gmail.com", "hd": None},
    {"email": "attacker@ku.th", "email_verified": False},
    {"email": "attacker@ku.th.evil.com"},
])
def test_rejected_login_leaves_no_session_and_no_user_row(sign_in, overrides, monkeypatch):
    client = TestClient(backend.app, follow_redirects=False)
    params = {k: v[0] for k, v in parse_qs(urlparse(client.get("/login/google").headers["location"]).query).items()}
    claims = {"sub": "attacker", "name": "A", "email": "attacker@ku.th", "email_verified": True,
              "hd": "ku.th", "nonce": params["nonce"], **overrides}
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "t")
    monkeypatch.setattr(backend, "verify_google_token", lambda t: claims)
    assert client.get("/callback/google", params={"code": "c", "state": params["state"]}).status_code == 403
    assert client.get("/api/me").status_code == 401
    with SessionLocal() as db:
        assert db.query(User).filter(User.provider_user_id == "attacker").count() == 0


# --- 6. Local test login must never widen access ------------------------------

@pytest.fixture
def local_client(monkeypatch, tmp_path):
    monkeypatch.setattr(backend, "LOCAL_TEST_LOGIN", True)
    monkeypatch.setattr(backend, "APP_ENV", "development")
    monkeypatch.setattr(backend, "HOST", "127.0.0.1")
    users = tmp_path / "users.json"
    users.write_text(json.dumps([{"email": "test.ta@ku.th", "name": "Test TA", "role": "ta"}]))
    monkeypatch.setattr(backend, "TEST_USERS_FILE", users)
    with TestClient(backend.app, base_url="http://localhost:8000", client=("127.0.0.1", 1),
                    follow_redirects=False) as client:
        yield client


def test_local_test_session_is_dead_on_every_router_once_disabled(local_client, monkeypatch):
    """A leftover local-test cookie must stop working on *all* routers, including
    consultations, which used to read the raw session instead of current_user()."""
    import re
    token = re.search(r'name="csrf" value="([^"]+)"', local_client.get("/local-test-login").text).group(1)
    assert local_client.post("/local-test-login", data={"email": "test.ta@ku.th", "csrf": token}).status_code == 303
    assert local_client.get("/api/consultations").status_code == 200
    assert local_client.get("/api/activities").status_code == 200

    monkeypatch.setattr(backend, "APP_ENV", "production")
    for path in ("/api/me", "/api/consultations", "/api/activities", "/api/faq/pending"):
        assert local_client.get(path).status_code == 401, path
    assert local_client.post("/api/consultations", json=CONSULTATION).status_code == 401


# --- 7. Safe redirects ----------------------------------------------------------

def test_redirects_only_go_to_the_configured_frontend(sign_in, anon):
    client = sign_in("student")
    assert client.get("/dashboard").headers["location"] == backend.FRONTEND_URL + "/dashboard"
    assert anon.get("/dashboard").headers["location"] == backend.FRONTEND_URL + "/"
    assert anon.get("/logout", params={"next": "https://evil.example"}).headers["location"] == backend.FRONTEND_URL + "/"
