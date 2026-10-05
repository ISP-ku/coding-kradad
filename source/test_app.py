"""KU Google authentication tests. No live accounts or network required."""
import json
from base64 import b64encode
from urllib.parse import parse_qs, urlparse
from unittest.mock import Mock

import itsdangerous
import pytest
import requests
from fastapi.testclient import TestClient
import app as backend


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "ci-client-id")
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_SECRET", "ci-secret")
    def no_network(*args, **kwargs):
        raise AssertionError("Unexpected network request")
    monkeypatch.setattr(requests.sessions.Session, "request", no_network)
    with TestClient(backend.app, follow_redirects=False) as client:
        yield client


def start(client):
    response = client.get("/login/google")
    assert response.status_code == 307
    return {k: v[0] for k, v in parse_qs(urlparse(response.headers["location"]).query).items()}


def claims(nonce, **overrides):
    data = {"sub": "ku-user-123", "name": "KU Student", "email": "student@ku.th",
            "email_verified": True, "hd": "ku.th", "nonce": nonce}
    data.update(overrides)
    return data


def complete(client, monkeypatch, **overrides):
    params = start(client)
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "signed-token")
    monkeypatch.setattr(backend, "verify_google_token", lambda token: claims(params["nonce"], **overrides))
    return client.get("/callback/google", params={"code": "code", "state": params["state"]}), params


def test_login_page_has_only_ku_option(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Sign in with KU Google" in response.text
    assert "Login with Discord" not in response.text
    assert "Login with LINE" not in response.text
    assert "Google (Classroom)" not in response.text


@pytest.mark.parametrize("provider", ["discord", "line", "unknown"])
@pytest.mark.parametrize("route", ["login", "callback"])
def test_removed_providers_rejected(client, provider, route):
    assert client.get(f"/{route}/{provider}").status_code == 404


def test_authorize_request(client):
    params = start(client)
    assert params["scope"] == "openid email profile"
    assert params["hd"] == "ku.th"
    assert params["prompt"] == "select_account"
    assert params["client_id"] == "ci-client-id"
    assert params["state"] and params["nonce"]
    assert params["state"] != start(client)["state"]


def test_missing_configuration(client, monkeypatch):
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "")
    assert client.get("/login/google").status_code == 503


def test_valid_ku_login_and_logout(client, monkeypatch):
    response, params = complete(client, monkeypatch)
    assert response.status_code == 303
    assert response.headers["location"] == backend.FRONTEND_URL + "/dashboard"
    assert "httponly" in response.headers["set-cookie"].lower()
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["email"] == "student@ku.th"
    assert me.headers["cache-control"] == "no-store"
    assert "id_token" not in me.json()
    assert client.get("/callback/google", params={"code": "code", "state": params["state"]}).status_code == 400
    assert client.get("/api/me").status_code == 401
    complete(client, monkeypatch)
    assert client.get("/logout").headers["location"] == backend.FRONTEND_URL + "/"
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize("overrides", [
    {"email": "student@gmail.com", "hd": None},
    {"email": "student@another.ac.th", "hd": "another.ac.th"},
    {"email": "student@ku.th.evil.com"},
    {"email": "student@ku.ac.th"},
    {"email": "@ku.th"},
    {"email": "student@ku.th", "hd": None},
    {"email_verified": False}, {"email_verified": "true"},
])
def test_non_ku_or_unverified_denied(client, monkeypatch, overrides, caplog):
    response, _ = complete(client, monkeypatch, **overrides)
    assert response.status_code == 403
    assert client.get("/api/me").status_code == 401
    assert "KU sign-in denied" in caplog.text


@pytest.mark.parametrize("overrides", [{"nonce": "wrong"}, {"nonce": None}, {"sub": ""}])
def test_invalid_identity_claims(client, monkeypatch, overrides):
    response, _ = complete(client, monkeypatch, **overrides)
    assert response.status_code == 400
    assert client.get("/api/me").status_code == 401


@pytest.mark.parametrize("query", ["code=code&state=wrong", "error=access_denied", "state=guess"])
def test_callback_without_login(client, query):
    assert client.get("/callback/google?" + query).status_code == 400


def test_bad_state_does_not_exchange_token(client, monkeypatch):
    start(client)
    exchange = Mock()
    monkeypatch.setattr(backend, "exchange_code_for_token", exchange)
    assert client.get("/callback/google?code=code&state=wrong").status_code == 400
    exchange.assert_not_called()


def test_cancelled_login(client):
    params = start(client)
    assert client.get("/callback/google", params={"state": params["state"], "error": "access_denied"}).status_code == 400


def test_expired_login(client, monkeypatch):
    params = start(client)
    now = backend.time.time()
    monkeypatch.setattr(backend.time, "time", lambda: now + 601)
    assert client.get("/callback/google", params={"state": params["state"], "code": "code"}).status_code == 400


@pytest.mark.parametrize("exception", [requests.Timeout("private detail"), ValueError("invalid token"), KeyError("id_token")])
def test_exchange_failure_has_no_session_or_leaked_error(client, monkeypatch, exception):
    params = start(client)
    monkeypatch.setattr(backend, "exchange_code_for_token", Mock(side_effect=exception))
    response = client.get("/callback/google", params={"state": params["state"], "code": "code"})
    assert response.status_code == 400
    assert "private detail" not in response.text
    assert client.get("/api/me").status_code == 401


def test_invalid_token_signature_is_rejected(client, monkeypatch):
    params = start(client)
    monkeypatch.setattr(backend, "exchange_code_for_token", lambda code: "bad-token")
    monkeypatch.setattr(backend.id_token, "verify_oauth2_token", Mock(side_effect=ValueError("bad signature")))
    assert client.get("/callback/google", params={"state": params["state"], "code": "code"}).status_code == 400
    assert client.get("/api/me").status_code == 401


def test_google_verifier_receives_expected_audience(monkeypatch):
    monkeypatch.setattr(backend, "GOOGLE_CLIENT_ID", "expected-client")
    verifier = Mock(return_value={"sub": "123"})
    monkeypatch.setattr(backend.id_token, "verify_oauth2_token", verifier)
    assert backend.verify_google_token("signed-token") == {"sub": "123"}
    assert verifier.call_args.args[0] == "signed-token"
    assert verifier.call_args.args[2] == "expected-client"


def test_token_exchange_uses_server_secret(monkeypatch):
    response = Mock()
    response.json.return_value = {"id_token": "signed-token"}
    post = Mock(return_value=response)
    monkeypatch.setattr(backend.requests, "post", post)
    assert backend.exchange_code_for_token("auth-code") == "signed-token"
    assert post.call_args.kwargs["data"]["code"] == "auth-code"
    assert post.call_args.kwargs["timeout"] == 10
    response.raise_for_status.assert_called_once()


def test_logged_out_and_old_sessions_denied(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/dashboard").headers["location"] == backend.FRONTEND_URL + "/"
    payload = b64encode(json.dumps({"user": {"provider": "google", "email": "student@ku.th"}}).encode())
    client.cookies.set(backend.SESSION_COOKIE, itsdangerous.TimestampSigner(backend.SECRET_KEY).sign(payload).decode())
    assert client.get("/api/me").status_code == 401


def test_legacy_login_uses_google(client):
    assert client.get("/login").headers["location"].startswith("https://accounts.google.com/")


@pytest.fixture
def local_client(monkeypatch, tmp_path):
    monkeypatch.setattr(backend, "LOCAL_TEST_LOGIN", True)
    monkeypatch.setattr(backend, "APP_ENV", "development")
    monkeypatch.setattr(backend, "HOST", "127.0.0.1")
    path = tmp_path / "users.json"
    path.write_text(json.dumps([{"email": "test.ta@ku.th", "name": "Test TA", "role": "ta"}]))
    monkeypatch.setattr(backend, "TEST_USERS_FILE", path)
    with TestClient(backend.app, base_url="http://localhost:8000", client=("127.0.0.1", 12345), follow_redirects=False) as c:
        yield c


def local_csrf(client):
    import re
    response = client.get("/local-test-login")
    assert response.status_code == 200
    return re.search(r'name="csrf" value="([^"]+)"', response.text).group(1)


def test_local_login_session_and_logout(local_client, monkeypatch):
    def no_google(*args):
        raise AssertionError("Local test must not call Google")
    monkeypatch.setattr(backend, "exchange_code_for_token", no_google)
    assert local_client.get("/api/auth-options").json()["local_test_login"] is True
    response = local_client.post("/local-test-login", data={"email": "test.ta@ku.th", "csrf": local_csrf(local_client), "role": "lecturer"})
    assert response.status_code == 303
    assert response.headers["location"] == backend.FRONTEND_URL + "/dashboard"
    user = local_client.get("/api/me").json()
    assert user["role"] == "ta"
    assert user["provider"] == "local"
    assert user["auth_method"] == "local_test"
    assert local_client.get("/logout").status_code == 303
    assert local_client.get("/api/me").status_code == 401


def test_unknown_local_user_denied(local_client):
    assert local_client.post("/local-test-login", data={"email": "unknown@ku.th", "csrf": local_csrf(local_client)}).status_code == 403
    assert local_client.get("/api/me").status_code == 401


def test_local_csrf_required(local_client):
    assert local_client.post("/local-test-login", data={"email": "test.ta@ku.th", "csrf": "wrong"}).status_code == 403


@pytest.mark.parametrize("setting,value", [("LOCAL_TEST_LOGIN", False), ("APP_ENV", "production"), ("HOST", "0.0.0.0")])
def test_local_login_disabled_and_existing_session_rejected(local_client, monkeypatch, setting, value):
    local_client.post("/local-test-login", data={"email": "test.ta@ku.th", "csrf": local_csrf(local_client)})
    monkeypatch.setattr(backend, setting, value)
    assert local_client.get("/api/auth-options").json()["local_test_login"] is False
    assert local_client.get("/local-test-login").status_code == 404
    assert local_client.post("/local-test-login", data={"email": "test.ta@ku.th", "csrf": "any"}).status_code == 404
    assert local_client.get("/api/me").status_code == 401


def test_remote_client_denied_local_login(local_client):
    with TestClient(backend.app, base_url="http://localhost:8000", client=("192.168.1.10", 12345)) as remote:
        assert remote.get("/local-test-login", headers={"X-Forwarded-For": "127.0.0.1"}).status_code == 404


def test_nonlocal_hostname_denied(local_client):
    assert local_client.get("/local-test-login", headers={"host": "example.com"}).status_code == 404


def test_invalid_users_file_fails_closed(local_client, monkeypatch, tmp_path):
    path = tmp_path / "bad.json"
    path.write_text('not json')
    monkeypatch.setattr(backend, "TEST_USERS_FILE", path)
    assert local_client.get("/local-test-login").status_code == 503
