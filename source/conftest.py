"""Shared pytest setup: point every test at a throwaway SQLite database.

This runs before any test module is imported, so app.py / database.py
never create or touch the real dashboard.db (app.py writes a users row on
every login)."""
import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'test.db')}"
