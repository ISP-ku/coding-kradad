"""
Unit tests for the real OAuth app (app.py).

These tests never hit a real provider: every network call
(requests.get / requests.post) is mocked, so the suite runs offline and is
safe to run in CI without any Discord/Google/LINE credentials.

Run:
    pytest source/test_app.py
"""

from unittest.mock import MagicMock, patch

import pytest
import requests
from flask import url_for

import app as app_module


@pytest.fixture
def client():
    app_module.app.config["TESTING"] = True
    with app_module.app.test_client() as client:
        yield client


def _profile(provider="discord", **overrides):
    profile = {
        "provider": provider,
        "id": "42",
        "username": "Alice",
        "email": None,
        "avatar_url": None,
        "classroom_courses": None,
    }
    profile.update(overrides)
    return profile


# ---- routes: index / login ----

def test_index_without_login_shows_login_buttons(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Login with Discord" in resp.data


def test_index_with_session_user_shows_welcome(client):
    with client.session_transaction() as sess:
        sess["user"] = _profile(username="Alice")
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Alice" in resp.data


def test_login_unknown_provider_returns_404(client):
    resp = client.get("/login/not-a-provider")
    assert resp.status_code == 404


@pytest.mark.parametrize("provider", ["discord", "google", "line"])
def test_login_redirects_to_provider_and_stores_state(client, provider):
    resp = client.get(f"/login/{provider}")
    assert resp.status_code == 302
    assert app_module.PROVIDERS[provider]["authorize_url"] in resp.headers["Location"]
    with client.session_transaction() as sess:
        assert sess["oauth_provider"] == provider
        assert sess["oauth_state"]


def test_login_legacy_redirects_to_discord(client):
    resp = client.get("/login")
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/login/discord")


# ---- routes: callback ----

def test_callback_unknown_provider_returns_404(client):
    resp = client.get("/callback/not-a-provider")
    assert resp.status_code == 404


def test_callback_provider_error_returns_400(client):
    resp = client.get("/callback/discord?error=access_denied")
    assert resp.status_code == 400


def test_callback_missing_code_returns_400(client):
    with client.session_transaction() as sess:
        sess["oauth_state"] = "abc"
        sess["oauth_provider"] = "discord"
    resp = client.get("/callback/discord?state=abc")
    assert resp.status_code == 400


def test_callback_state_mismatch_returns_400(client):
    with client.session_transaction() as sess:
        sess["oauth_state"] = "abc"
        sess["oauth_provider"] = "discord"
    resp = client.get("/callback/discord?code=xyz&state=WRONG")
    assert resp.status_code == 400


def test_callback_success_logs_in_and_redirects_to_dashboard(client):
    with client.session_transaction() as sess:
        sess["oauth_state"] = "abc"
        sess["oauth_provider"] = "discord"

    fake_profile = _profile(username="Alice")

    with patch.object(app_module, "exchange_code_for_token", return_value="fake-token") as mock_exchange, \
         patch.dict(app_module.PROFILE_FETCHERS, {"discord": lambda _token: fake_profile}):
        resp = client.get("/callback/discord?code=xyz&state=abc")

    mock_exchange.assert_called_once_with("discord", "xyz")
    assert resp.status_code == 302
    assert resp.headers["Location"].endswith("/dashboard")
    with client.session_transaction() as sess:
        assert sess["user"] == fake_profile


def test_callback_provider_request_failure_returns_400(client):
    with client.session_transaction() as sess:
        sess["oauth_state"] = "abc"
        sess["oauth_provider"] = "discord"

    with patch.object(app_module, "exchange_code_for_token", side_effect=requests.RequestException("boom")):
        resp = client.get("/callback/discord?code=xyz&state=abc")

    assert resp.status_code == 400


def test_callback_legacy_delegates_to_discord(client):
    resp = client.get("/callback?error=access_denied")
    assert resp.status_code == 400
    assert b"Discord" in resp.data


# ---- routes: dashboard / logout ----

def test_dashboard_without_login_redirects_to_index(client):
    resp = client.get("/dashboard")
    assert resp.status_code == 302
    # NOTE: the old version of this assertion (`.endswith("")`) was always
    # true regardless of the Location header, so it never actually checked
    # the redirect target. Compare against the real index URL instead.
    with app_module.app.test_request_context():
        assert resp.headers["Location"] == url_for("index")


def test_dashboard_with_login_returns_200(client):
    with client.session_transaction() as sess:
        sess["user"] = _profile(username="Alice")
    resp = client.get("/dashboard")
    assert resp.status_code == 200
    assert b"Alice" in resp.data


def test_logout_clears_session_and_redirects(client):
    with client.session_transaction() as sess:
        sess["user"] = _profile()
    resp = client.get("/logout")
    assert resp.status_code == 302
    with client.session_transaction() as sess:
        assert "user" not in sess


# ---- helpers: OAuth building blocks ----

def test_build_authorize_url_contains_expected_params():
    url = app_module.build_authorize_url("discord", "somestate")
    assert url.startswith(app_module.PROVIDERS["discord"]["authorize_url"])
    assert "state=somestate" in url
    assert "response_type=code" in url


@patch("app.requests.post")
def test_exchange_code_for_token_returns_access_token(mock_post):
    mock_response = MagicMock()
    mock_response.json.return_value = {"access_token": "tok123"}
    mock_post.return_value = mock_response

    token = app_module.exchange_code_for_token("discord", "somecode")

    assert token == "tok123"
    mock_response.raise_for_status.assert_called_once()


# ---- helpers: profile fetchers ----

@patch("app.requests.get")
def test_fetch_discord_profile_builds_avatar_url(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {"id": "42", "username": "Bob", "avatar": "abc123"}
    mock_get.return_value = mock_response

    profile = app_module.fetch_discord_profile("tok")

    assert profile["provider"] == "discord"
    assert profile["id"] == "42"
    assert profile["username"] == "Bob"
    assert profile["avatar_url"] == "https://cdn.discordapp.com/avatars/42/abc123.png"


@patch("app.requests.get")
def test_fetch_discord_profile_without_avatar_is_none(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {"id": "42", "username": "Bob", "avatar": None}
    mock_get.return_value = mock_response

    profile = app_module.fetch_discord_profile("tok")

    assert profile["avatar_url"] is None


@patch("app.requests.get")
def test_fetch_google_classroom_courses_returns_list(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {"courses": [{"id": "1", "name": "DB"}, {"id": "2", "name": "SE Lab"}]}
    mock_get.return_value = mock_response

    courses = app_module.fetch_google_classroom_courses("tok")

    assert courses == [{"id": "1", "name": "DB"}, {"id": "2", "name": "SE Lab"}]


@patch("app.requests.get")
def test_fetch_google_classroom_courses_returns_none_on_failure(mock_get):
    mock_get.side_effect = requests.RequestException("boom")

    courses = app_module.fetch_google_classroom_courses("tok")

    assert courses is None


@patch("app.fetch_google_classroom_courses")
@patch("app.requests.get")
def test_fetch_google_profile_combines_userinfo_and_courses(mock_get, mock_courses):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "sub": "google-42",
        "name": "Alice",
        "email": "alice@example.com",
        "picture": "https://example.com/pic.png",
    }
    mock_get.return_value = mock_response
    mock_courses.return_value = [{"id": "1", "name": "DB"}]

    profile = app_module.fetch_google_profile("tok")

    assert profile["provider"] == "google"
    assert profile["id"] == "google-42"
    assert profile["email"] == "alice@example.com"
    assert profile["classroom_courses"] == [{"id": "1", "name": "DB"}]


@patch("app.requests.get")
def test_fetch_line_profile_maps_fields(mock_get):
    mock_response = MagicMock()
    mock_response.json.return_value = {"userId": "line-42", "displayName": "Charlie", "pictureUrl": "https://example.com/c.png"}
    mock_get.return_value = mock_response

    profile = app_module.fetch_line_profile("tok")

    assert profile["provider"] == "line"
    assert profile["id"] == "line-42"
    assert profile["username"] == "Charlie"
    assert profile["email"] is None
    assert profile["avatar_url"] == "https://example.com/c.png"


# ---- additional coverage: flows, edge cases, security ----

def test_dashboard_after_logout_redirects_to_index(client):
    """Full flow: log in, log out, then hit /dashboard again - the old
    session must not leak through, and it must land back on index."""
    with client.session_transaction() as sess:
        sess["user"] = _profile(username="Alice")
    client.get("/logout")
    resp = client.get("/dashboard", follow_redirects=True)
    assert resp.status_code == 200
    assert b"Login with Discord" in resp.data


def test_dashboard_hides_faq_and_homework_links(client):
    """app.py doesn't implement /faq or /homework (only test_ui.py's fake
    preview does) - dashboard.html must not render links to routes that
    don't exist here, or it would 500 with a Jinja BuildError."""
    with client.session_transaction() as sess:
        sess["user"] = _profile(username="Alice")
    resp = client.get("/dashboard")
    assert resp.status_code == 200
    assert b"FAQ" not in resp.data
    assert b"Homework" not in resp.data


def test_dashboard_username_with_html_is_escaped(client):
    """Username comes straight from the OAuth provider - untrusted input.
    Jinja autoescaping must stay on, or a crafted display name is a stored
    XSS vector against every other viewer of this dashboard."""
    with client.session_transaction() as sess:
        sess["user"] = _profile(username="<script>alert(1)</script>")
    resp = client.get("/dashboard")
    assert b"<script>alert(1)</script>" not in resp.data
    assert b"&lt;script&gt;alert(1)&lt;/script&gt;" in resp.data


def test_dashboard_shows_google_classroom_courses(client):
    with client.session_transaction() as sess:
        sess["user"] = _profile(
            provider="google",
            username="Alice",
            classroom_courses=[{"id": "1", "name": "Intro to Databases"}],
        )
    resp = client.get("/dashboard")
    assert resp.status_code == 200
    assert b"Intro to Databases" in resp.data


def test_dashboard_shows_no_courses_message_for_google_without_courses(client):
    with client.session_transaction() as sess:
        sess["user"] = _profile(provider="google", username="Alice", classroom_courses=None)
    resp = client.get("/dashboard")
    assert b"No active courses found" in resp.data


def test_callback_with_no_prior_login_session_returns_400(client):
    """Hitting /callback directly with no /login visit first (no session
    state at all) - e.g. a replayed, bookmarked, or forged URL - must not
    be accepted as a valid login."""
    resp = client.get("/callback/discord?code=xyz&state=someguess")
    assert resp.status_code == 400


def test_callback_provider_mismatch_with_session_returns_400(client):
    """Session started a Discord login but the callback claims to be for
    Google - a matching state alone isn't enough, the provider must match
    what /login actually started."""
    with client.session_transaction() as sess:
        sess["oauth_state"] = "abc"
        sess["oauth_provider"] = "discord"
    resp = client.get("/callback/google?code=xyz&state=abc")
    assert resp.status_code == 400


def test_login_state_is_unique_per_request(client):
    """Two separate /login/discord hits must not reuse the same CSRF state
    token, or an attacker could pre-generate and replay a valid one."""
    client.get("/login/discord")
    with client.session_transaction() as sess:
        first_state = sess["oauth_state"]

    client.get("/login/discord")
    with client.session_transaction() as sess:
        second_state = sess["oauth_state"]

    assert first_state != second_state


def test_callback_state_is_single_use(client):
    """Once a state has been consumed by a successful callback, replaying
    the same code/state pair must fail - callback() pops the state out of
    the session so it can't be reused."""
    with client.session_transaction() as sess:
        sess["oauth_state"] = "abc"
        sess["oauth_provider"] = "discord"

    fake_profile = _profile(username="Alice")
    with patch.object(app_module, "exchange_code_for_token", return_value="fake-token"), \
         patch.dict(app_module.PROFILE_FETCHERS, {"discord": lambda _token: fake_profile}):
        first = client.get("/callback/discord?code=xyz&state=abc")
    assert first.status_code == 302

    replay = client.get("/callback/discord?code=xyz&state=abc")
    assert replay.status_code == 400
