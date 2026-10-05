"""Tests for User/Role resolution (SRS-18, SRS-22)."""

import pytest

from database import Base, SessionLocal, User, engine
from users import sync_user

Base.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def clean_users():
    with SessionLocal() as db:
        db.query(User).delete()
        db.commit()
    yield


@pytest.fixture(autouse=True)
def clean_allowlist_env(monkeypatch):
    monkeypatch.delenv("LECTURER_EMAILS", raising=False)
    monkeypatch.delenv("TA_EMAILS", raising=False)


def _login(email="alice@ku.th", provider_user_id="1", provider="google", role=None):
    with SessionLocal() as db:
        user = sync_user(
            db,
            provider=provider,
            provider_user_id=provider_user_id,
            email=email,
            display_name="Alice",
            role=role,
        )
        return user.id, user.role


def test_first_login_defaults_to_student_role():
    assert _login()[1] == "student"


def test_email_on_lecturer_allowlist_becomes_lecturer(monkeypatch):
    monkeypatch.setenv("LECTURER_EMAILS", "prof@ku.th")
    assert _login(email="prof@ku.th")[1] == "lecturer"


def test_email_on_ta_allowlist_becomes_ta(monkeypatch):
    monkeypatch.setenv("TA_EMAILS", "ta@ku.th, other@ku.th")
    assert _login(email="ta@ku.th")[1] == "ta"


def test_allowlist_match_is_case_insensitive(monkeypatch):
    monkeypatch.setenv("LECTURER_EMAILS", "Prof@KU.th")
    assert _login(email="prof@ku.th")[1] == "lecturer"


def test_explicit_role_overrides_allowlist(monkeypatch):
    """Local test accounts pass their role from data/allowed_users.json."""
    monkeypatch.setenv("LECTURER_EMAILS", "alice@ku.th")
    assert _login(provider="local", role="ta")[1] == "ta"


def test_unknown_role_is_rejected():
    with pytest.raises(ValueError):
        _login(role="Lecturer")


def test_same_identity_reuses_row_and_resyncs_role(monkeypatch):
    first_id, first_role = _login()
    assert first_role == "student"

    # Adding the email to an allowlist takes effect on the next login.
    monkeypatch.setenv("LECTURER_EMAILS", "alice@ku.th")
    second_id, second_role = _login()

    assert second_id == first_id
    assert second_role == "lecturer"
    with SessionLocal() as db:
        assert db.query(User).count() == 1


def test_different_providers_with_same_id_are_different_users():
    a_id, _ = _login(provider="google")
    b_id, _ = _login(provider="local")
    assert a_id != b_id
