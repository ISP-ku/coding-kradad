"""DATABASE_URL handling: Neon/Render-style Postgres URLs and SQLite."""
from database import engine_options, normalise_database_url


def test_postgres_urls_use_the_psycopg_driver():
    neon = "postgresql://user:pw@ep-x.aws.neon.tech/kradad?sslmode=require"
    assert normalise_database_url(neon) == "postgresql+psycopg://user:pw@ep-x.aws.neon.tech/kradad?sslmode=require"
    # Heroku/Render style scheme, which SQLAlchemy 2 refuses as-is.
    assert normalise_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"


def test_explicit_drivers_and_sqlite_are_left_alone():
    assert normalise_database_url("postgresql+psycopg://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert normalise_database_url("sqlite:///dashboard.db") == "sqlite:///dashboard.db"


def test_sqlite_allows_use_across_threads():
    assert engine_options("sqlite:///x.db") == {"connect_args": {"check_same_thread": False}}


def test_postgres_checks_connections_and_runs_in_utc():
    # Neon closes idle connections; times are stored as naive UTC (timeutil.py).
    assert engine_options("postgresql+psycopg://u:p@h/db") == {
        "pool_pre_ping": True,
        "connect_args": {"options": "-c timezone=UTC"},
    }
