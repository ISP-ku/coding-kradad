"""Shared datetime helpers for API responses.

The database stores every timestamp as *naive UTC* (no tzinfo). If the API
returns that as "2026-10-25T09:00:00", browsers treat it as local time, so
Bangkok users saw everything 7 hours early. ``UtcDateTime`` serialises those
values with an explicit "Z" so the frontend converts them correctly.

``utcnow_naive`` and ``to_naive_utc`` go the other way: they turn "now" and
incoming request values into the naive UTC the database stores.
"""

from datetime import datetime, timezone
from typing import Annotated

from pydantic import PlainSerializer


def to_utc_iso(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def utcnow_naive() -> datetime:
    """The current time as naive UTC, the way the database stores it."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def to_naive_utc(value: datetime) -> datetime:
    """Naive UTC for storing. A value with no zone is taken to be UTC already."""
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


UtcDateTime = Annotated[datetime, PlainSerializer(to_utc_iso, return_type=str)]
