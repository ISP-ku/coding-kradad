"""Shared pytest setup: point every test at a throwaway database.

This runs before any test module is imported, so app.py / database.py
never create or touch the real dashboard.db (app.py writes a users row on
every login).

By default that is a new SQLite file. Set TEST_DATABASE_URL to an empty
PostgreSQL database to run the same tests against Postgres, the way the
deployed app runs (CI does this; see .github/workflows/ci.yml)."""
import os
import tempfile

os.environ["DATABASE_URL"] = (os.environ.get("TEST_DATABASE_URL")
                              or f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'test.db')}")

# The course-membership gate (SRS-23) is on by default. Tests written before
# it existed sign in arbitrary KU accounts to exercise role checks, so they
# run with it off; test_access.py turns it back on for every test.
os.environ.setdefault("REQUIRE_COURSE_MEMBERSHIP", "0")
