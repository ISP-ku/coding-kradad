"""Email code sign-in and optional personal Google accounts.

KU Google accounts are sent to KU ALL by the university's Google Workspace,
which some people cannot get through. Two ways around it:

- Email code: type your address, get a 6-digit code by email, type it in.
  Codes are hashed, single-use, expire after 10 minutes, allow 5 wrong tries,
  and at most 1 per minute / 5 per hour are sent per address. The answer never
  reveals whether an address may sign in.
- Personal Google (ALLOW_PERSONAL_GOOGLE=1, off by default): a Gmail address a
  lecturer has added on the Access page can sign in with Google directly.

Every path still needs course membership (SRS-23) and takes its role from the
Access page.
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import requests
from fastapi.testclient import TestClient

import app as backend
import email_login
import users
from database import AccessAccount, Course, CourseMember, LoginCode, SessionLocal, User

FRONT = "http://localhost:3000"
MEMBER = "member@ku.th"
TA = "ta@ku.th"
GMAIL = "someone@gmail.com"
STRANGER = "stranger@ku.th"


@pytest.fixture(autouse=True)
def setup(monkeypatch):
    monkeypatch.setenv("REQUIRE_COURSE_MEMBERSHIP", "1")
    monkeypatch.setenv("LECTURER_EMAILS", "")
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "0")
    monkeypatch.setattr(backend, "FRONTEND_URL", FRONT)
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "ci-client-id")
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_SECRET", "ci-secret")

    def no_network(*args, **kwargs):
        raise AssertionError("Unexpected network request")

    monkeypatch.setattr(requests.sessions.Session, "request", no_network)
    sent = []
    monkeypatch.setattr(email_login, "send_code", lambda email, code: sent.append((email, code)))
    monkeypatch.setattr(email_login, "email_sending_available", lambda: True)
    with SessionLocal() as db:
        for model in (LoginCode, CourseMember, AccessAccount, Course, User):
            db.query(model).delete()
        course = Course(code="CS101", name="Intro")
        db.add(course)
        db.flush()
        for email, role in ((MEMBER, "student"), (TA, "ta")):
            db.add(AccessAccount(email=email, role=role))
            db.add(CourseMember(course_id=course.id, email=email))
        db.commit()
    yield sent
    with SessionLocal() as db:
        for model in (LoginCode, CourseMember, AccessAccount, Course):
            db.query(model).delete()
        db.commit()


def client():
    return TestClient(backend.app, follow_redirects=False)


def ask(c, email, origin=FRONT):
    return c.post("/email-login/request", data={"email": email}, headers={"origin": origin} if origin else {})


def verify(c, email, code, origin=FRONT):
    return c.post("/email-login/verify", data={"email": email, "code": code}, headers={"origin": origin} if origin else {})


def query(response):
    return {k: v[0] for k, v in parse_qs(urlparse(response.headers["location"]).query).items()}


def add_member(email, role="student"):
    with SessionLocal() as db:
        db.add(AccessAccount(email=email, role=role))
        db.add(CourseMember(course_id=db.query(Course).one().id, email=email))
        db.commit()


# --- asking for a code ------------------------------------------------------

def test_member_gets_a_code_by_email(setup):
    response = ask(client(), " Member@KU.th ")
    assert response.status_code == 303
    assert response.headers["location"].startswith(FRONT + "/sign-in/email?")
    assert query(response) == {"email": MEMBER, "sent": "1"}
    assert len(setup) == 1 and setup[0][0] == MEMBER
    assert len(setup[0][1]) == 6 and setup[0][1].isdigit()


def test_code_is_stored_hashed(setup):
    ask(client(), MEMBER)
    with SessionLocal() as db:
        row = db.query(LoginCode).one()
        assert setup[0][1] not in row.code_hash


def test_non_member_gets_the_same_answer_but_no_email(setup):
    response = ask(client(), STRANGER)
    assert query(response) == {"email": STRANGER, "sent": "1"}
    assert setup == []


@pytest.mark.parametrize("bad", ["", "nobody", "a@gmail.com", "x@ku.th.evil.com"])
def test_invalid_address_is_refused(setup, bad):
    response = ask(client(), bad)
    assert query(response)["error"] == "invalid_email"
    assert setup == []


def test_one_code_per_minute(setup):
    c = client()
    ask(c, MEMBER)
    response = ask(c, MEMBER)
    assert query(response)["error"] == "wait"
    assert len(setup) == 1


def test_rate_limit_looks_the_same_for_non_members(setup):
    c = client()
    ask(c, STRANGER)
    assert query(ask(c, STRANGER))["error"] == "wait"


def test_at_most_five_codes_an_hour(setup):
    c = client()
    for _ in range(5):
        ask(c, MEMBER)
        with SessionLocal() as db:   # age the codes past the 1-minute limit
            for row in db.query(LoginCode):
                row.created_at = row.created_at - timedelta(minutes=2)
            db.commit()
    assert query(ask(c, MEMBER))["error"] == "wait"
    assert len(setup) == 5


def test_request_from_another_site_is_refused(setup):
    response = ask(client(), MEMBER, origin="https://evil.example")
    assert response.status_code == 403
    assert setup == []


def test_no_email_service_outside_development(setup, monkeypatch):
    monkeypatch.setattr(email_login, "email_sending_available", lambda: False)
    monkeypatch.setattr(backend, "APP_ENV", "production")
    assert query(ask(client(), MEMBER))["error"] == "unavailable"


def test_development_without_email_service_logs_the_code(setup, monkeypatch, caplog):
    monkeypatch.setattr(email_login, "email_sending_available", lambda: False)
    monkeypatch.setattr(email_login, "send_code", email_login.send_code_or_log)
    monkeypatch.setattr(backend, "APP_ENV", "development")
    monkeypatch.setattr(email_login, "_smtp_settings", lambda: None)
    with caplog.at_level("WARNING"):
        response = ask(client(), MEMBER)
    assert query(response)["sent"] == "1"
    assert "DEVELOPMENT ONLY" in caplog.text


# --- typing the code in ------------------------------------------------------

def test_right_code_signs_in_with_the_access_page_role(setup):
    c = client()
    ask(c, TA)
    response = verify(c, TA, setup[0][1])
    assert response.status_code == 303
    assert response.headers["location"] == FRONT + "/dashboard"
    me = c.get("/api/me").json()
    assert me["email"] == TA and me["role"] == "ta"
    assert me["provider"] == "email" and me["auth_method"] == "email_code"


def test_student_lands_on_homework(setup):
    c = client()
    ask(c, MEMBER)
    assert verify(c, MEMBER, setup[0][1]).headers["location"] == FRONT + "/homework"


def test_code_works_once(setup):
    c = client()
    ask(c, MEMBER)
    verify(c, MEMBER, setup[0][1])
    assert query(verify(client(), MEMBER, setup[0][1]))["error"] == "expired"


def test_wrong_code(setup):
    c = client()
    ask(c, MEMBER)
    wrong = "000000" if setup[0][1] != "000000" else "111111"
    response = verify(c, MEMBER, wrong)
    assert query(response) == {"email": MEMBER, "sent": "1", "error": "wrong"}
    assert c.get("/api/me").status_code == 401


def test_five_wrong_tries_cancel_the_code(setup):
    c = client()
    ask(c, MEMBER)
    wrong = "000000" if setup[0][1] != "000000" else "111111"
    for _ in range(4):
        assert query(verify(c, MEMBER, wrong))["error"] == "wrong"
    assert query(verify(c, MEMBER, wrong))["error"] == "locked"
    assert query(verify(c, MEMBER, setup[0][1]))["error"] == "expired"


def test_expired_code(setup):
    c = client()
    ask(c, MEMBER)
    with SessionLocal() as db:
        db.query(LoginCode).one().expires_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        db.commit()
    assert query(verify(c, MEMBER, setup[0][1]))["error"] == "expired"


def test_new_code_replaces_the_old_one(setup):
    c = client()
    ask(c, MEMBER)
    with SessionLocal() as db:
        db.query(LoginCode).one().created_at -= timedelta(minutes=2)
        db.commit()
    ask(c, MEMBER)
    assert query(verify(c, MEMBER, setup[0][1]))["error"] in {"expired", "wrong"}
    assert verify(c, MEMBER, setup[1][1]).status_code == 303


def test_removed_member_cannot_finish(setup):
    c = client()
    ask(c, MEMBER)
    with SessionLocal() as db:
        db.query(CourseMember).filter_by(email=MEMBER).delete()
        db.commit()
    assert query(verify(c, MEMBER, setup[0][1]))["error"] == "denied"


def test_verify_from_another_site_is_refused(setup):
    c = client()
    ask(c, MEMBER)
    assert verify(c, MEMBER, setup[0][1], origin="https://evil.example").status_code == 403


def test_session_survives_the_next_request(setup):
    c = client()
    ask(c, TA)
    verify(c, TA, setup[0][1])
    assert c.get("/api/activities").status_code == 200


def test_auth_options_lists_email_code(setup):
    body = client().get("/api/auth-options").json()
    assert body["email_code"] is True
    assert body["personal_google"] is False


# --- personal Google accounts (optional) ---------------------------------------

def google_login(monkeypatch, path, email, hd=None):
    c = client()
    login = c.get(path)
    assert login.status_code in (302, 307), login.text
    params = {k: v[0] for k, v in parse_qs(urlparse(login.headers["location"]).query).items()}
    claims = {"sub": "sub-" + email, "name": "Someone", "email": email, "email_verified": True, "nonce": params["nonce"]}
    if hd:
        claims["hd"] = hd
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "t")
    monkeypatch.setattr(backend, "verify_google_token", lambda token: claims)
    return c, params, c.get("/callback/google", params={"code": "x", "state": params["state"]})


def test_personal_google_is_off_by_default(monkeypatch):
    assert client().get("/login/google-personal").status_code == 404
    add_member(GMAIL)
    _, _, response = google_login(monkeypatch, "/login/google", GMAIL)
    assert response.status_code == 403


def test_personal_google_signs_in_a_member_gmail(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    add_member(GMAIL)
    c, params, response = google_login(monkeypatch, "/login/google-personal", GMAIL)
    assert "hd" not in params
    assert response.status_code == 303
    assert c.get("/api/me").json()["email"] == GMAIL


def test_personal_google_needs_membership_even_with_the_gate_off(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    monkeypatch.setenv("REQUIRE_COURSE_MEMBERSHIP", "0")
    _, _, response = google_login(monkeypatch, "/login/google-personal", GMAIL)
    assert response.status_code == 403


def test_personal_google_still_refuses_other_domains(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    _, _, response = google_login(monkeypatch, "/login/google-personal", "x@outlook.com")
    assert response.status_code == 403


def test_access_page_accepts_gmail_only_when_enabled(monkeypatch):
    with pytest.raises(ValueError):
        users.normalise_member_email(GMAIL)
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    assert users.normalise_member_email(" SomeOne@Gmail.com ") == GMAIL
    assert users.normalise_member_email("a@ku.th") == "a@ku.th"
    with pytest.raises(ValueError):
        users.normalise_member_email("a@outlook.com")


def test_email_code_works_for_a_member_gmail_when_enabled(setup, monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    add_member(GMAIL)
    c = client()
    ask(c, GMAIL)
    assert verify(c, GMAIL, setup[0][1]).status_code == 303


def test_auth_options_shows_personal_google_when_enabled(monkeypatch):
    monkeypatch.setenv("ALLOW_PERSONAL_GOOGLE", "1")
    assert client().get("/api/auth-options").json()["personal_google"] is True
