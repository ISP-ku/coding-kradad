"""Real shared activity API behavior and role checks (SRS-2, SRS-3, SRS-8, SRS-10, SRS-11)."""
import os
import tempfile

_tmp_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp_dir, 'test.db')}"

import pytest
from fastapi.testclient import TestClient

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
