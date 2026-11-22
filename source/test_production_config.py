"""In production the backend refuses to start with settings that would
quietly break it, e.g. no DATABASE_URL: it would fall back to a SQLite file
inside the container, which the free Render plan wipes whenever it sleeps."""
import os
import subprocess
import sys
from pathlib import Path

from app import production_config_problems

GOOD = {
    "DATABASE_URL": "postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
    "SESSION_SECRET": "x" * 48,
    "GOOGLE_CLIENT_ID": "id.apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "secret",
    "FRONTEND_URL": "https://coding-kradad.onrender.com",
    "GOOGLE_REDIRECT_URI": "https://coding-kradad.onrender.com/callback/google",
}


def test_complete_settings_have_no_problems():
    assert production_config_problems(GOOD) == []
    # A trailing slash on the site address is fine.
    assert production_config_problems({**GOOD, "FRONTEND_URL": GOOD["FRONTEND_URL"] + "/"}) == []


def test_each_missing_setting_is_named():
    for key in GOOD:
        problems = production_config_problems({**GOOD, key: ""})
        assert any(key in p for p in problems), (key, problems)


def test_google_must_send_people_back_to_this_site():
    wrong = {**GOOD, "GOOGLE_REDIRECT_URI": "http://localhost:8000/callback/google"}
    assert any("GOOGLE_REDIRECT_URI" in p for p in production_config_problems(wrong))


def test_backend_will_not_start_in_production_without_them():
    env = {**os.environ, "APP_ENV": "production", **{key: "" for key in GOOD}}
    result = subprocess.run([sys.executable, "-c", "import app"], cwd=Path(__file__).parent,
                            env=env, capture_output=True, text=True, timeout=120)
    assert result.returncode != 0
    assert "DATABASE_URL" in result.stderr and "DEPLOY.md" in result.stderr
