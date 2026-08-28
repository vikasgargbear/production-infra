from datetime import timezone

from app.infrastructure.operator_actions.service import _persisted_expiry


def test_persisted_expiry_accepts_postgresql_variable_fraction_precision() -> None:
    four_digits = _persisted_expiry("2026-08-25T10:54:23.7009+00:00")
    six_digits = _persisted_expiry("2026-08-25T10:54:23.700900Z")

    assert four_digits == six_digits
    assert four_digits.microsecond == 700900
    assert four_digits.tzinfo == timezone.utc

