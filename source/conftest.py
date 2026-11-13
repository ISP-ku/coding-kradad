"""Shared pytest setup: point every test at a throwaway SQLite database.

This runs before any test module is imported, so app.py / database.py
never create or touch the real dashboard.db (app.py writes a users row on
every login)."""
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'test.db')}"

# The course-membership gate (SRS-23) is on by default. Tests written before
# it existed sign in arbitrary KU accounts to exercise role checks, so they
# run with it off; test_access.py turns it back on for every test.
os.environ.setdefault("REQUIRE_COURSE_MEMBERSHIP", "0")
