"""Who-did-this columns must fit the longest identity the app can create.

A password sign-in identity is "password:" + the email address, and an
address may be up to 200 characters. SQLite ignores column lengths, so this
only fails on PostgreSQL (run with TEST_DATABASE_URL, as CI does)."""
from fastapi.testclient import TestClient

from activities import authenticated_user, require_lecturer
from app import app
from faq import _optional_user

LONG_EMAIL = ("a" * 191) + "@ku.th"   # 197 characters, within the 200 the app accepts
USER = {"provider": "password", "id": LONG_EMAIL, "email": LONG_EMAIL, "username": "Long", "role": "lecturer"}


def test_a_long_password_identity_can_post_comment_review_and_save():
    for dependency in (authenticated_user, require_lecturer, _optional_user):
        app.dependency_overrides[dependency] = lambda: USER
    try:
        client = TestClient(app)
        topic = client.post("/api/faq", json={"title": "Long address", "description": "Does it fit?"})
        assert topic.status_code == 201, topic.text
        topic_id = topic.json()["id"]
        assert client.post(f"/api/faq/{topic_id}/approve").status_code == 200
        assert client.post(f"/api/faq/{topic_id}/comments", json={"body": "Yes."}).status_code == 201
        assert client.post(f"/api/faq/{topic_id}/save").status_code == 204
    finally:
        app.dependency_overrides.clear()
