"""
Unit tests for the real OAuth app (app.py), now that it runs on FastAPI
instead of Flask.

These tests never hit a real provider: every network call
(requests.get / requests.post) is mocked, so the suite runs offline and is
safe to run in CI without any Discord/Google/LINE credentials.

FastAPI's SessionMiddleware (starlette) keeps session data in a signed
cookie rather than a server-side session object, so there is no
`session_transaction()` helper like Flask's test client has. `_set_session`
/ `_read_session` below sign/unsign that cookie directly with the same
secret key the app uses, to get the same "pre-seed the session" behavior
the old Flask tests relied on.

Run:
    pytest source/test_app.py
"""

import json
from base64 import b64decode, b64encode
from unittest.mock import MagicMock, patch

import itsdangerous
import pytest
import requests
from fastapi.testclient import TestClient

import app as app_module

SESSION_COOKIE = "session"
SESSION_MAX_AGE = 14 * 24 * 60 * 60  # starlette SessionMiddleware's default


@pytest.fixture
def client():
    with TestClient(app_module.app) as test_client:
        yield test_client


def _signer():
    return itsdangerous.TimestampSigner(str(app_module.SECRET_KEY))


def _set_session(client, **data):
    payload = b64encode(json.dumps(data).encode("utf-8"))
    client.cookies.set(SESSION_COOKIE, _signer().sign(payload).decode("utf-8"))


def _read_session(response):
    """Decode the session cookie a response just set, straight off its
    Set-Cookie header. httpx's TestClient cookie jar doesn't reliably
    apply the server's cookie-clearing Set-Cookie (session=null;
    expires=epoch) the way Flask's test client did, so reading the jar
    after the fact is unreliable - read the header on the response that
    actually changed the session instead."""
    set_cookie = response.headers.get("set-cookie")
    assert set_cookie, "response did not set a session cookie"
    value = set_cookie.split(";", 1)[0].split("=", 1)[1]
    if value in ("null", ""):
        return {}
    data = _signer().unsign(value, max_age=SESSION_MAX_AGE)
    return json.loads(b64decode(data))


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
    assert "Login with Discord" in resp.text


def test_index_with_session_user_shows_welcome(client):
    _set_session(client, user=_profile(username="Alice"))
    resp = client.get("/")
    assert resp.status_code == 200
    assert "Alice" in resp.text


def test_login_unknown_provider_returns_404(client):
    resp = client.get("/login/not-a-provider")
    assert resp.status_code == 404


@pytest.mark.parametrize("provider", ["discord", "google", "line"])
def test_login_redirects_to_provider_and_stores_state(client, provider):
    resp = client.get(f"/login/{provider}", follow_redirects=False)
    assert resp.status_code == 307
    assert app_module.PROVIDERS[provider]["authorize_url"] in resp.headers["location"]
    session = _read_session(resp)
    assert session["oauth_provider"] == provider
    assert session["oauth_state"]


def test_login_legacy_redirects_to_discord(client):
    resp = client.get("/login", follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"].endswith("/login/discord")


# ---- routes: callback ----

def test_callback_unknown_provider_returns_404(client):
    resp = client.get("/callback/not-a-provider")
    assert resp.status_code == 404


def test_callback_provider_error_returns_400(client):
    resp = client.get("/callback/discord?error=access_denied")
    assert resp.status_code == 400


def test_callback_missing_code_returns_400(client):
    _set_session(client, oauth_state="abc", oauth_provider="discord")
    resp = client.get("/callback/discord?state=abc")
    assert resp.status_code == 400


def test_callback_state_mismatch_returns_400(client):
    _set_session(client, oauth_state="abc", oauth_provider="discord")
    resp = client.get("/callback/discord?code=xyz&state=WRONG")
    assert resp.status_code == 400


def test_callback_success_logs_in_and_redirects_to_dashboard(client):
    _set_session(client, oauth_state="abc", oauth_provider="discord")
    fake_profile = _profile(username="Alice")

    with patch.object(app_module, "exchange_code_for_token", return_value="fake-token") as mock_exchange, \
         patch.dict(app_module.PROFILE_FETCHERS, {"discord": lambda _token: fake_profile}):
        resp = client.get("/callback/discord?code=xyz&state=abc", follow_redirects=False)

    mock_exchange.assert_called_once_with("discord", "xyz")
    assert resp.status_code == 307
    assert resp.headers["location"].endswith("/dashboard")
    assert _read_session(resp)["user"] == fake_profile


def test_callback_provider_request_failure_returns_400(client):
    _set_session(client, oauth_state="abc", oauth_provider="discord")

    with patch.object(app_module, "exchange_code_for_token", side_effect=requests.RequestException("boom")):
        resp = client.get("/callback/discord?code=xyz&state=abc")

    assert resp.status_code == 400


def test_callback_legacy_delegates_to_discord(client):
    resp = client.get("/callback?error=access_denied")
    assert resp.status_code == 400
    assert "Discord" in resp.text


# ---- routes: dashboard / logout ----

def test_dashboard_without_login_redirects_to_index(client):
    resp = client.get("/dashboard", follow_redirects=False)
    assert resp.status_code == 307
    assert resp.headers["location"] == "http://testserver/"


def test_dashboard_with_login_returns_200(client):
    _set_session(client, user=_profile(username="Alice"))
    resp = client.get("/dashboard")
    assert resp.status_code == 200
    assert "Alice" in resp.text


def test_logout_clears_session_and_redirects(client):
    _set_session(client, user=_profile())
    resp = client.get("/logout", follow_redirects=False)
    assert resp.status_code == 307
    assert "user" not in _read_session(resp)


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
    session must not leak through, and it must land back on index.

    httpx's TestClient cookie jar doesn't apply a cookie-clearing
    Set-Cookie (session=null; expires=epoch) the way a real browser
    would, so the client-side cookie is dropped by hand here to
    reproduce what a browser does after /logout responds."""
    _set_session(client, user=_profile(username="Alice"))
    logout_resp = client.get("/logout", follow_redirects=False)
    assert _read_session(logout_resp) == {}
    client.cookies.delete(SESSION_COOKIE)

    resp = client.get("/dashboard", follow_redirects=True)
    assert resp.status_code == 200
    assert "Login with Discord" in resp.text


def test_dashboard_hides_faq_and_homework_links(client):
    """app.py doesn't implement /faq or /homework (only test_ui.py's fake
    preview does) - dashboard.html must not render links to routes that
    don't exist here, or base.html's url_for() calls would raise."""
    _set_session(client, user=_profile(username="Alice"))
    resp = client.get("/dashboard")
    assert resp.status_code == 200
    assert "FAQ" not in resp.text
    assert "Homework" not in resp.text


def test_dashboard_username_with_html_is_escaped(client):
    """Username comes straight from the OAuth provider - untrusted input.
    Jinja autoescaping must stay on, or a crafted display name is a stored
    XSS vector against every other viewer of this dashboard."""
    _set_session(client, user=_profile(username="<script>alert(1)</script>"))
    resp = client.get("/dashboard")
    assert "<script>alert(1)</script>" not in resp.text
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in resp.text


def test_dashboard_shows_google_classroom_courses(client):
    _set_session(
        client,
        user=_profile(
            provider="google",
            username="Alice",
            classroom_courses=[{"id": "1", "name": "Intro to Databases"}],
        ),
    )
    resp = client.get("/dashboard")
    assert resp.status_code == 200
    assert "Intro to Databases" in resp.text


def test_dashboard_shows_no_courses_message_for_google_without_courses(client):
    _set_session(client, user=_profile(provider="google", username="Alice", classroom_courses=None))
    resp = client.get("/dashboard")
    assert "No active courses found" in resp.text


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
    _set_session(client, oauth_state="abc", oauth_provider="discord")
    resp = client.get("/callback/google?code=xyz&state=abc")
    assert resp.status_code == 400


def test_login_state_is_unique_per_request(client):
    """Two separate /login/discord hits must not reuse the same CSRF state
    token, or an attacker could pre-generate and replay a valid one."""
    first_resp = client.get("/login/discord", follow_redirects=False)
    first_state = _read_session(first_resp)["oauth_state"]

    second_resp = client.get("/login/discord", follow_redirects=False)
    second_state = _read_session(second_resp)["oauth_state"]

    assert first_state != second_state


def test_callback_state_is_single_use(client):
    """Once a state has been consumed by a successful callback, replaying
    the same code/state pair must fail - callback() pops the state out of
    the session so it can't be reused."""
    _set_session(client, oauth_state="abc", oauth_provider="discord")

    fake_profile = _profile(username="Alice")
    with patch.object(app_module, "exchange_code_for_token", return_value="fake-token"), \
         patch.dict(app_module.PROFILE_FETCHERS, {"discord": lambda _token: fake_profile}):
        first = client.get("/callback/discord?code=xyz&state=abc", follow_redirects=False)
    assert first.status_code == 307

    replay = client.get("/callback/discord?code=xyz&state=abc")
    assert replay.status_code == 400
