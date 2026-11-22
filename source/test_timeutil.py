"""UTC serialisation helper used by every *Out schema."""
from datetime import datetime, timedelta, timezone

from timeutil import to_naive_utc, to_utc_iso, utcnow_naive


def test_naive_datetime_is_treated_as_utc():
    assert to_utc_iso(datetime(2026, 10, 25, 2, 30)) == "2026-10-25T02:30:00Z"


def test_aware_datetime_is_converted_to_utc():
    bangkok = timezone(timedelta(hours=7))
    assert to_utc_iso(datetime(2026, 10, 25, 9, 30, tzinfo=bangkok)) == "2026-10-25T02:30:00Z"


def test_to_naive_utc_keeps_a_naive_value_as_utc():
    assert to_naive_utc(datetime(2026, 10, 25, 2, 30)) == datetime(2026, 10, 25, 2, 30)


def test_to_naive_utc_converts_an_aware_value_and_drops_the_zone():
    bangkok = timezone(timedelta(hours=7))
    assert to_naive_utc(datetime(2026, 10, 25, 9, 30, tzinfo=bangkok)) == datetime(2026, 10, 25, 2, 30)


def test_utcnow_naive_has_no_zone_and_is_utc():
    now = utcnow_naive()
    assert now.tzinfo is None
    assert abs(now - datetime.now(timezone.utc).replace(tzinfo=None)) < timedelta(seconds=5)
