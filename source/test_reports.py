"""Tests for the activity reporting API (SRS-19, SRS-20)."""
from datetime import date, datetime, timedelta, timezone

import json
from base64 import b64encode

import pytest
from fastapi.testclient import TestClient
from itsdangerous import TimestampSigner

import app as backend
from app import app
from database import Activity, ConsultationSession, SessionLocal, Task
from reports import require_lecturer

client = TestClient(app)

REPORT_URL = "/api/reports/activities"
COURSES_URL = "/api/reports/courses"
PARAMS = {"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"}


def login_as(user_id, role="lecturer"):
    """Pretend someone with this role is signed in (skips the real OAuth login)."""
    app.dependency_overrides[require_lecturer] = lambda: {"id": user_id, "provider": "google", "role": role}



@pytest.fixture(autouse=True)
def clean_state():
    """Each test starts logged out with empty tables."""
    app.dependency_overrides.clear()
    with SessionLocal() as db:
        db.query(Task).delete()
        db.query(Activity).delete()
        db.query(ConsultationSession).delete()
        db.commit()
    yield
    app.dependency_overrides.clear()


def _seed_activity(
    *, course_id="course-1", starts_at, title="Lab 3", type_="lab", tasks_status=None, archived_at=None
):
    with SessionLocal() as db:
        activity = Activity(
            course_id=course_id,
            title=title,
            type=type_,
            starts_at=starts_at,
            location="Room 101",
            created_by="google:lecturer-1",
            archived_at=archived_at,
        )
        db.add(activity)
        db.commit()
        db.refresh(activity)

        if tasks_status is not None:
            for status in tasks_status:
                db.add(Task(activity_id=activity.id, assignee_id="google:ta-1", status=status))
            db.commit()

        return activity.id


def _seed_consultation(*, session_date, duration_minutes=30):
    with SessionLocal() as db:
        db.add(
            ConsultationSession(
                ta_user_id="google:ta-1",
                session_date=session_date,
                duration_minutes=duration_minutes,
                topic="ER diagram review",
                participants="Group 3",
            )
        )
        db.commit()


def test_requires_login():
    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    assert resp.status_code == 401


def _session_cookie(user):
    """A real signed session cookie, as app.py's SessionMiddleware would set."""
    signer = TimestampSigner(str(backend.SECRET_KEY))
    payload = b64encode(json.dumps({"user": user}).encode())
    return signer.sign(payload).decode()


def _ku_user(role):
    return {"id": "ku-1", "username": "U", "provider": "google", "auth_method": "ku_google", "role": role}


@pytest.mark.parametrize("role", ["ta", "student", "Lecturer"])
def test_requires_lecturer_role_not_just_login(role):
    """A signed-in non-lecturer must be rejected with 403, not 200. "Lecturer"
    (wrong case) must not pass either - roles are lowercase."""
    with TestClient(app) as real_client:
        real_client.cookies.set(backend.SESSION_COOKIE, _session_cookie(_ku_user(role)))
        resp = real_client.get(REPORT_URL, params=PARAMS)
        assert resp.status_code == 403


def test_real_lecturer_session_is_accepted():
    with TestClient(app) as real_client:
        real_client.cookies.set(backend.SESSION_COOKIE, _session_cookie(_ku_user("lecturer")))
        assert real_client.get(REPORT_URL, params=PARAMS).status_code == 200


def test_session_rejected_by_current_user_is_401():
    """Goes through app.current_user(): an old-style session without a valid
    auth_method is treated as logged out, even with role=lecturer."""
    with TestClient(app) as real_client:
        stale = {"id": "1", "username": "U", "provider": "discord", "role": "lecturer"}
        real_client.cookies.set(backend.SESSION_COOKIE, _session_cookie(stale))
        assert real_client.get(REPORT_URL, params=PARAMS).status_code == 401


def test_rejects_end_date_before_start_date():
    login_as("lecturer-1")
    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-02-01", "end_date": "2026-01-01"})
    assert resp.status_code == 400


def test_no_records_message_when_nothing_matches():
    login_as("lecturer-1")
    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_records"] is False
    assert body["activity_count"] == 0
    assert body["activities"] == []
    assert body["consultations"] == {"count": 0, "total_minutes": 0, "scope": "all_courses"}


def test_returns_activity_within_date_range_with_its_tasks():
    _seed_activity(
        starts_at=datetime(2026, 1, 15, 10, 0),
        title="HW2 grading",
        tasks_status=["Done"],
    )
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["has_records"] is True
    assert body["activity_count"] == 1
    assert body["activities"][0]["title"] == "HW2 grading"
    assert body["activities"][0]["tasks"][0]["status"] == "Done"


def test_excludes_activities_outside_date_range():
    _seed_activity(starts_at=datetime(2026, 3, 1, 10, 0))  # outside range
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["has_records"] is False
    assert body["activity_count"] == 0


def test_excludes_activities_from_a_different_course():
    _seed_activity(course_id="course-2", starts_at=datetime(2026, 1, 15, 10, 0))
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["has_records"] is False


def test_status_summary_counts_tasks_by_status():
    _seed_activity(starts_at=datetime(2026, 1, 10, 9, 0), title="A", tasks_status=["Done", "Done"])
    _seed_activity(starts_at=datetime(2026, 1, 20, 9, 0), title="B", tasks_status=["Not Started"])
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["activity_count"] == 2
    assert body["status_summary"] == {"Done": 2, "Not Started": 1}


def test_date_range_boundaries_are_inclusive():
    _seed_activity(starts_at=datetime(2026, 1, 1, 0, 0), title="first day")
    _seed_activity(starts_at=datetime(2026, 1, 31, 23, 59), title="last day")
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["activity_count"] == 2


# ---- SRS-20: consultation ("support-log") summary ----

def test_consultation_summary_counts_and_sums_minutes_in_range():
    _seed_consultation(session_date=date(2026, 1, 5), duration_minutes=30)
    _seed_consultation(session_date=date(2026, 1, 20), duration_minutes=45)
    _seed_consultation(session_date=date(2026, 2, 1), duration_minutes=60)  # outside range
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["consultations"] == {"count": 2, "total_minutes": 75, "scope": "all_courses"}


def test_has_records_true_from_consultations_alone():
    """No activities at all, but a consultation in range - still a record."""
    _seed_consultation(session_date=date(2026, 1, 10))
    login_as("lecturer-1")

    resp = client.get(REPORT_URL, params={"course_id": "course-1", "start_date": "2026-01-01", "end_date": "2026-01-31"})
    body = resp.json()

    assert body["has_records"] is True
    assert body["activity_count"] == 0


# ---- SRS-19: only completed or archived activities count as history ----

def _naive_utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _range_around(moment):
    return {
        "course_id": "course-1",
        "start_date": (moment - timedelta(days=10)).date().isoformat(),
        "end_date": (moment + timedelta(days=10)).date().isoformat(),
    }


def test_excludes_upcoming_activities_that_are_not_archived():
    now = _naive_utcnow()
    _seed_activity(starts_at=now - timedelta(days=1), title="past")
    _seed_activity(starts_at=now + timedelta(days=3), title="upcoming")
    login_as("lecturer-1")

    body = client.get(REPORT_URL, params=_range_around(now)).json()

    assert [a["title"] for a in body["activities"]] == ["past"]


def test_includes_upcoming_activity_once_archived():
    now = _naive_utcnow()
    _seed_activity(starts_at=now + timedelta(days=3), title="cancelled lab", archived_at=now)
    login_as("lecturer-1")

    body = client.get(REPORT_URL, params=_range_around(now)).json()

    assert body["activity_count"] == 1
    assert body["activities"][0]["archived_at"] is not None


def test_consultation_summary_is_labelled_as_all_courses():
    login_as("lecturer-1")
    body = client.get(REPORT_URL, params=PARAMS).json()
    assert body["consultations"]["scope"] == "all_courses"


# ---- course picker ----

def test_courses_lists_distinct_course_ids_sorted():
    _seed_activity(course_id="course-b", starts_at=datetime(2026, 1, 5, 9, 0))
    _seed_activity(course_id="course-a", starts_at=datetime(2026, 1, 6, 9, 0))
    _seed_activity(course_id="course-b", starts_at=datetime(2026, 1, 7, 9, 0))
    login_as("lecturer-1")

    assert client.get(COURSES_URL).json() == ["course-a", "course-b"]


def test_courses_requires_lecturer():
    assert client.get(COURSES_URL).status_code == 401
