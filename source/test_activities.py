"""Real shared activity API behavior and role checks (SRS-2, SRS-3, SRS-8, SRS-10, SRS-11)."""
import os
import tempfile
from datetime import datetime, timedelta, timezone

_tmp_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp_dir, 'test.db')}"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from activities import authenticated_user
from app import app
from database import Activity, SessionLocal, Task, User

client = TestClient(app)
LECTURER = {"provider": "google", "id": "lecturer-1", "username": "Lecturer", "role": "lecturer"}
TA = {"provider": "google", "id": "ta-1", "username": "TA One", "role": "ta"}
STUDENT = {"provider": "google", "id": "student-1", "username": "Student", "role": "student"}
VALID = {
    "course_id": "01219245", "title": "Lab 4 preparation", "type": "lab",
    "starts_at": "2099-10-21T09:30:00+07:00", "location": "Room 204",
    "assignee_id": "google:ta-1",
}


def login_as(user):
    app.dependency_overrides[authenticated_user] = lambda: user


@pytest.fixture(autouse=True)
def clean_state():
    app.dependency_overrides.clear()
    with SessionLocal() as db:
        db.query(Task).delete()
        db.query(Activity).delete()
        db.query(User).delete()
        db.add(User(provider="google", provider_user_id="ta-1", email="ta@ku.th", display_name="TA One", role="ta"))
        db.commit()
    yield
    app.dependency_overrides.clear()


def test_requires_authenticated_user():
    assert client.get("/api/activities").status_code == 401
    assert client.post("/api/activities", json=VALID).status_code == 401


def test_lecturer_creates_activity_and_real_ta_task():
    login_as(LECTURER)
    response = client.post("/api/activities", json=VALID)
    assert response.status_code == 201
    saved = response.json()
    assert saved["title"] == "Lab 4 preparation"
    assert saved["course_id"] == "01219245"
    assert saved["tasks"][0]["assignee_id"] == "google:ta-1"
    assert saved["tasks"][0]["assigned_at"]
    assert client.get("/api/activities").json()[0]["id"] == saved["id"]


def test_api_returns_times_as_explicit_utc():
    """09:30 Bangkok time must come back as 02:30Z, not a bare '02:30' that
    browsers would read as local time (the 7-hour display bug)."""
    login_as(LECTURER)
    saved = client.post("/api/activities", json=VALID).json()
    assert saved["starts_at"] == "2099-10-21T02:30:00Z"
    assert saved["tasks"][0]["assigned_at"].endswith("Z")
    listed = client.get("/api/activities").json()[0]
    assert listed["starts_at"] == "2099-10-21T02:30:00Z"


def test_ta_cannot_create_and_student_cannot_change_status():
    login_as(TA)
    assert client.post("/api/activities", json=VALID).status_code == 403
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    task = created["tasks"][0]
    login_as(STUDENT)
    assert client.patch(f"/api/activities/{created['id']}/tasks/{task['id']}", json={"status": "Done"}).status_code == 403


def test_assigned_ta_status_change_is_persisted_and_timestamped():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    task = created["tasks"][0]
    login_as(TA)
    response = client.patch(f"/api/activities/{created['id']}/tasks/{task['id']}", json={"status": "In Progress"})
    assert response.status_code == 200
    assert response.json()["status"] == "In Progress"
    assert response.json()["status_changed_at"]


def test_unknown_ta_is_rejected():
    login_as(LECTURER)
    response = client.post("/api/activities", json={**VALID, "assignee_id": "google:not-a-ta"})
    assert response.status_code == 422


def add_activity(title, starts_at, status="Not Started", assignee="google:ta-1"):
    with SessionLocal() as db:
        activity = Activity(
            course_id="01219245", title=title, type="deadline", starts_at=starts_at,
            location="Online", created_by="google:lecturer-1",
        )
        db.add(activity)
        db.flush()
        db.add(Task(activity_id=activity.id, assignee_id=assignee, status=status))
        db.commit()
        return activity.id


def task_for(title):
    activity = next(a for a in client.get("/api/activities").json() if a["title"] == title)
    return activity["tasks"][0]


def test_overdue_and_at_risk_flags_on_dashboard():
    """SRS-12, SRS-13: flags are computed and returned with each task."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    add_activity("Late grading", now - timedelta(days=1))
    add_activity("Lab tomorrow", now + timedelta(days=1))
    add_activity("Midterm next month", now + timedelta(days=30))
    login_as(TA)

    late = task_for("Late grading")
    assert late["is_overdue"] is True and late["is_at_risk"] is False
    soon = task_for("Lab tomorrow")
    assert soon["is_at_risk"] is True and soon["is_overdue"] is False
    far = task_for("Midterm next month")
    assert far["is_at_risk"] is False and far["is_overdue"] is False


def test_done_tasks_are_never_flagged():
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    activity_id = add_activity("Lab tomorrow done", now + timedelta(days=1), status="Done")
    login_as(TA)
    # Completed activities no longer appear in the dashboard endpoint.
    assert all(a["id"] != activity_id for a in client.get("/api/activities").json())
    # Their persisted tasks should still have no overdue / at-risk flags.
    with SessionLocal() as db:
        task = db.scalar(select(Task).where(Task.activity_id == activity_id))
        assert task is not None
        assert task.is_at_risk is False and task.is_overdue is False


def test_past_activity_stays_visible_until_done_then_hides():
    """SRS-4 hides past activities only once their task is Done."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    activity_id = add_activity("Late grading", now - timedelta(days=1))
    login_as(TA)
    task = task_for("Late grading")

    response = client.patch(f"/api/activities/{activity_id}/tasks/{task['id']}", json={"status": "Done"})
    assert response.status_code == 200
    assert response.json()["is_overdue"] is False
    titles = [a["title"] for a in client.get("/api/activities").json()]
    assert "Late grading" not in titles


def test_lecturer_can_edit_activity_and_preserve_tasks():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    updated = client.patch(f"/api/activities/{created['id']}", json={
        "title": "Updated lab", "starts_at": "2099-10-22T11:30:00+07:00",
    })
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated lab"
    assert updated.json()["starts_at"] == "2099-10-22T04:30:00Z"
    assert updated.json()["tasks"][0]["id"] == created["tasks"][0]["id"]


def test_only_lecturer_can_edit_delete_or_archive():
    login_as(LECTURER)
    activity_id = client.post("/api/activities", json=VALID).json()["id"]
    for role in (TA, STUDENT):
        login_as(role)
        assert client.patch(f"/api/activities/{activity_id}", json={"title": "No"}).status_code == 403
        assert client.delete(f"/api/activities/{activity_id}").status_code == 403
        assert client.post(f"/api/activities/{activity_id}/archive").status_code == 403


def test_archive_retains_tasks_and_hides_activity_from_dashboard():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    url = f"/api/activities/{created['id']}"
    archived = client.post(url + "/archive")
    assert archived.status_code == 200
    assert archived.json()["archived_at"] is not None
    assert client.post(url + "/archive").json()["archived_at"] == archived.json()["archived_at"]
    assert created["id"] not in [a["id"] for a in client.get("/api/activities").json()]
    assert client.patch(url, json={"title": "No"}).status_code == 409
    assert client.delete(url).status_code == 409
    with SessionLocal() as db:
        assert db.get(Activity, created["id"]) is not None
        assert db.get(Task, created["tasks"][0]["id"]) is not None


def test_delete_removes_tasks_and_activity():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    url = f"/api/activities/{created['id']}"
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404
    with SessionLocal() as db:
        assert db.get(Activity, created["id"]) is None
        assert db.get(Task, created["tasks"][0]["id"]) is None


def test_edit_validation_and_missing_activity():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    url = f"/api/activities/{created['id']}"
    assert client.patch(url, json={"title": "   "}).status_code == 422
    assert client.patch(url, json={"starts_at": None}).status_code == 422
    assert client.patch(url, json={"type": "bad"}).status_code == 422
    assert client.patch(url, json={"unrecognized": 3}).status_code == 422
    assert client.patch("/api/activities/999999", json={"title": "Missing"}).status_code == 404


def test_future_done_moves_off_dashboard():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    task = created["tasks"][0]
    assert any(a["id"] == created["id"] for a in client.get("/api/activities").json())
    assert client.patch(f"/api/activities/{created['id']}/tasks/{task['id']}", json={"status": "Done"}).status_code == 200
    assert all(a["id"] != created["id"] for a in client.get("/api/activities").json())


def test_done_requires_all_assigned_tasks():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    with SessionLocal() as db:
        db.add(Task(activity_id=created["id"], assignee_id="google:ta-2", status="Not Started"))
        db.commit()
    task = created["tasks"][0]
    client.patch(f"/api/activities/{created['id']}/tasks/{task['id']}", json={"status": "Done"})
    assert any(a["id"] == created["id"] for a in client.get("/api/activities").json())


def test_get_activity_for_edit_lecturer_only():
    login_as(LECTURER)
    created = client.post("/api/activities", json=VALID).json()
    url = f"/api/activities/{created['id']}"
    assert client.get(url).json()["title"] == VALID["title"]
    login_as(TA)
    assert client.get(url).status_code == 403
    login_as(LECTURER)
    client.post(url + "/archive")
    assert client.get(url).status_code == 409
