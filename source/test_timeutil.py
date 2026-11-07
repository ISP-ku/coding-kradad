"""UTC serialisation helper used by every *Out schema."""
from datetime import datetime, timedelta, timezone

from timeutil import to_utc_iso


def test_naive_datetime_is_treated_as_utc():
    assert to_utc_iso(datetime(2026, 10, 25, 2, 30)) == "2026-10-25T02:30:00Z"


def test_aware_datetime_is_converted_to_utc():
    bangkok = timezone(timedelta(hours=7))
    assert to_utc_iso(datetime(2026, 10, 25, 9, 30, tzinfo=bangkok)) == "2026-10-25T02:30:00Z"
