"""Password sign-in (for @ku.th people KU ALL will not let through) and
optional personal Google accounts.

KU's Google Workspace sends every @ku.th Google sign-in to KU ALL, which
some people cannot get through, and no app can skip that step. Instead a
lecturer creates a password for that person on the Access page (the server
generates it and shows it once), and the person signs in with their @ku.th
address and that password. No Google, no KU ALL, no email.

- Only a hash is stored (scrypt, per-password salt).
- 5 wrong tries lock the password for 15 minutes; each try is claimed with
  an atomic UPDATE, so parallel requests cannot get more guesses.
- A wrong address and a wrong password give the same answer.
- Every path still needs course membership (SRS-23) and takes its role from
  the Access page; the same person keeps one identity across sign-in ways.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from fastapi.testclient import TestClient

import app as backend
import password_login
import users
from database import AccessAccount, Course, CourseMember, SessionLocal, SignInPassword, User

FRONT = "http://localhost:3000"
BOSS = "boss@ku.th"         # LECTURER_EMAILS
LECTURER = "lecturer@ku.th"
MEMBER = "member@ku.th"
TA = "ta@ku.th"
GMAIL = "someone@gmail.com"
STRANGER = "stranger@ku.th"


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setenv("REQUIRE_COURSE_MEMBERSHIP", "1")
    monkeypatch.setenv("LECTURER_EMAILS", BOSS)
    monkeypatch.setenv("TA_EMAILS", "")
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "0")
    monkeypatch.setattr(backend, "FRONTEND_URL", FRONT)
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "ci-client-id")
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_SECRET", "ci-secret")

    def no_network(*args, **kwargs):
        raise AssertionError("Unexpected network request")

    monkeypatch.setattr(requests.sessions.Session, "request", no_network)
    with SessionLocal() as db:
        for model in (SignInPassword, CourseMember, AccessAccount, Course, User):
            db.query(model).delete()
        course = Course(code="CS101", name="Intro")
        db.add(course)
        db.flush()
        for email, role in ((LECTURER, "lecturer"), (MEMBER, "student"), (TA, "ta")):
            db.add(AccessAccount(email=email, role=role))
            db.add(CourseMember(course_id=course.id, email=email))
        db.commit()
    yield
    with SessionLocal() as db:
        for model in (SignInPassword, CourseMember, AccessAccount, Course):
            db.query(model).delete()
        db.commit()


def client():
    return TestClient(backend.app, follow_redirects=False)


def query(response):
    return {k: v[0] for k, v in parse_qs(urlparse(response.headers["location"]).query).items()}


def add_member(email, role="student"):
    with SessionLocal() as db:
        db.add(AccessAccount(email=email, role=role))
        db.add(CourseMember(course_id=db.query(Course).one().id, email=email))
        db.commit()


def google_login(monkeypatch, email, sub=None, path="/login/google", hd="ku.th"):
    c = client()
    login = c.get(path)
    assert login.status_code in (302, 307), login.text
    params = {k: v[0] for k, v in parse_qs(urlparse(login.headers["location"]).query).items()}
    claims = {"sub": sub or "sub-" + email, "name": "Google Name", "email": email,
              "email_verified": True, "nonce": params["nonce"]}
    if hd:
        claims["hd"] = hd
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "t")
    monkeypatch.setattr(backend, "verify_google_token", lambda token: claims)
    return c, params, c.get("/callback/google", params={"code": "x", "state": params["state"]})


@pytest.fixture
def lecturer(monkeypatch):
    c, _, response = google_login(monkeypatch, LECTURER)
    assert response.status_code == 303, response.text
    return c


def set_password(c, email):
    return c.post(f"/api/access/accounts/{email}/password")


def sign_in(c, email, password, origin=FRONT):
    return c.post("/password-login", data={"email": email, "password": password},
                  headers={"origin": origin} if origin else {})


# --- lecturer creates a password ---------------------------------------------

def test_lecturer_creates_a_password_shown_once(lecturer):
    response = set_password(lecturer, MEMBER)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["password"]) >= 12
    assert body["account"]["has_password"] is True
    with SessionLocal() as db:
        stored = db.get(SignInPassword, MEMBER).password_hash
    assert body["password"] not in stored and stored.startswith("scrypt$")
    access = lecturer.get("/api/access").json()["accounts"]
    assert next(a for a in access if a["email"] == MEMBER)["has_password"] is True
    assert body["password"] not in str(access)


def test_a_new_password_replaces_the_old_one(lecturer):
    old = set_password(lecturer, MEMBER).json()["password"]
    new = set_password(lecturer, MEMBER).json()["password"]
    assert old != new
    assert query(sign_in(client(), MEMBER, old))["error"] == "wrong"
    assert sign_in(client(), MEMBER, new).status_code == 303


def test_lecturer_removes_a_password(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    response = lecturer.delete(f"/api/access/accounts/{MEMBER}/password")
    assert response.status_code == 200 and response.json()["has_password"] is False
    assert query(sign_in(client(), MEMBER, password))["error"] == "wrong"


def test_only_lecturers_create_passwords(monkeypatch):
    c, _, _ = google_login(monkeypatch, TA)
    assert set_password(c, MEMBER).status_code == 403
    assert set_password(client(), MEMBER).status_code == 401


def test_password_needs_an_account_on_the_access_page(lecturer):
    assert set_password(lecturer, STRANGER).status_code == 404


def test_server_configured_lecturer_password_cannot_be_set_by_others(lecturer):
    assert set_password(lecturer, BOSS).status_code == 400


def test_removing_someone_from_their_last_course_deletes_the_password(lecturer):
    set_password(lecturer, MEMBER)
    with SessionLocal() as db:
        course = db.query(Course).one().id
    assert lecturer.delete(f"/api/access/courses/{course}/members/{MEMBER}").status_code == 204
    with SessionLocal() as db:
        assert db.get(SignInPassword, MEMBER) is None


# --- signing in with it --------------------------------------------------------

def test_password_signs_in_with_the_access_page_role(lecturer):
    password = set_password(lecturer, TA).json()["password"]
    c = client()
    response = sign_in(c, " TA@ku.th ", password)
    assert response.status_code == 303
    assert response.headers["location"] == FRONT + "/dashboard"
    me = c.get("/api/me").json()
    assert me["email"] == TA and me["role"] == "ta" and me["auth_method"] == "password"
    assert c.get("/api/activities").status_code == 200


def test_student_lands_on_homework(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    assert sign_in(client(), MEMBER, password).headers["location"] == FRONT + "/homework"


def test_wrong_password_and_unknown_address_look_the_same(lecturer):
    set_password(lecturer, MEMBER)
    wrong = sign_in(client(), MEMBER, "not-the-password")
    unknown = sign_in(client(), STRANGER, "whatever-password")
    assert query(wrong) == {"email": MEMBER, "error": "wrong"}
    assert query(unknown) == {"email": STRANGER, "error": "wrong"}


def test_invalid_address(lecturer):
    assert query(sign_in(client(), "a@gmail.com", "x"))["error"] == "invalid_email"


def test_five_wrong_tries_lock_the_password(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    for _ in range(4):
        assert query(sign_in(client(), MEMBER, "nope"))["error"] == "wrong"
    assert query(sign_in(client(), MEMBER, "nope"))["error"] == "locked"
    assert query(sign_in(client(), MEMBER, password))["error"] == "locked"


def test_lock_ends_after_fifteen_minutes(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    for _ in range(5):
        sign_in(client(), MEMBER, "nope")
    with SessionLocal() as db:
        db.get(SignInPassword, MEMBER).locked_until = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        db.commit()
    assert sign_in(client(), MEMBER, password).status_code == 303


def test_right_password_resets_the_wrong_tries(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    for _ in range(4):
        sign_in(client(), MEMBER, "nope")
    assert sign_in(client(), MEMBER, password).status_code == 303
    assert query(sign_in(client(), MEMBER, "nope"))["error"] == "wrong"


def test_new_password_unlocks(lecturer):
    set_password(lecturer, MEMBER)
    for _ in range(5):
        sign_in(client(), MEMBER, "nope")
    password = set_password(lecturer, MEMBER).json()["password"]
    assert sign_in(client(), MEMBER, password).status_code == 303


def test_parallel_guesses_cannot_beat_the_limit(lecturer):
    set_password(lecturer, MEMBER)
    with ThreadPoolExecutor(max_workers=15) as pool:
        errors = list(pool.map(lambda _: query(sign_in(client(), MEMBER, "nope"))["error"], range(30)))
    assert errors.count("wrong") <= password_login.MAX_ATTEMPTS - 1
    with SessionLocal() as db:
        assert db.get(SignInPassword, MEMBER).failed_attempts <= password_login.MAX_ATTEMPTS


def test_removed_member_cannot_sign_in(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    with SessionLocal() as db:
        db.query(CourseMember).filter_by(email=MEMBER).delete()
        db.commit()
    assert query(sign_in(client(), MEMBER, password))["error"] == "denied"


def test_form_from_another_site_is_refused(lecturer):
    password = set_password(lecturer, MEMBER).json()["password"]
    assert sign_in(client(), MEMBER, password, origin="https://evil.example").status_code == 403


def test_auth_options_lists_password():
    body = client().get("/api/auth-options").json()
    assert body["password"] is True and "email_code" not in body
    assert body["personal_google"] is False


# --- one identity per person -----------------------------------------------------

def test_password_reuses_the_google_identity(lecturer, monkeypatch):
    _, _, response = google_login(monkeypatch, MEMBER, sub="google-sub-1")
    assert response.status_code == 303
    password = set_password(lecturer, MEMBER).json()["password"]
    c = client()
    sign_in(c, MEMBER, password)
    me = c.get("/api/me").json()
    assert (me["provider"], me["id"]) == ("google", "google-sub-1")
    with SessionLocal() as db:
        assert db.query(User).filter_by(email=MEMBER).count() == 1


def test_google_after_password_reuses_the_password_identity(lecturer, monkeypatch):
    password = set_password(lecturer, MEMBER).json()["password"]
    c = client()
    sign_in(c, MEMBER, password)
    first = c.get("/api/me").json()
    g, _, _ = google_login(monkeypatch, MEMBER, sub="google-sub-1")
    again = g.get("/api/me").json()
    assert (again["provider"], again["id"]) == (first["provider"], first["id"])
    assert again["auth_method"] == "ku_google"
    with SessionLocal() as db:
        assert db.query(User).filter_by(email=MEMBER).count() == 1


def test_two_google_accounts_are_never_merged(monkeypatch):
    google_login(monkeypatch, MEMBER, sub="google-sub-1")
    g, _, _ = google_login(monkeypatch, MEMBER, sub="google-sub-2")
    assert g.get("/api/me").json()["id"] == "google-sub-2"


# --- personal Google accounts (optional) ---------------------------------------

def test_personal_google_is_off_by_default(monkeypatch):
    assert client().get("/login/google-personal").status_code == 404
    add_member(GMAIL)
    _, _, response = google_login(monkeypatch, GMAIL, hd=None)
    assert response.status_code == 403


def test_personal_google_signs_in_a_member_gmail(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    add_member(GMAIL)
    c, params, response = google_login(monkeypatch, GMAIL, path="/login/google-personal", hd=None)
    assert "hd" not in params
    assert response.status_code == 303
    assert c.get("/api/me").json()["email"] == GMAIL


def test_personal_google_needs_membership_even_with_the_gate_off(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    monkeypatch.setenv("REQUIRE_COURSE_MEMBERSHIP", "0")
    _, _, response = google_login(monkeypatch, GMAIL, path="/login/google-personal", hd=None)
    assert response.status_code == 403


def test_personal_google_still_refuses_other_domains(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    _, _, response = google_login(monkeypatch, "x@outlook.com", path="/login/google-personal", hd=None)
    assert response.status_code == 403


def test_access_page_accepts_gmail_only_when_enabled(monkeypatch):
    with pytest.raises(ValueError):
        users.normalise_member_email(GMAIL)
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    assert users.normalise_member_email(" SomeOne@Gmail.com ") == GMAIL
    assert users.normalise_member_email("a@ku.th") == "a@ku.th"
    with pytest.raises(ValueError):
        users.normalise_member_email("a@outlook.com")


def test_auth_options_shows_personal_google_when_enabled(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    assert client().get("/api/auth-options").json()["personal_google"] is True
