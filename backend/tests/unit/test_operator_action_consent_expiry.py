from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.domain.operator_actions.models import ActionErrorCode, OperatorActionError
from app.infrastructure.operator_actions import service


NOW = datetime(2026, 9, 17, 11, 9, 16, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    class Clock:
        @staticmethod
        def now(tz):
            return NOW
    monkeypatch.setattr(service, "datetime", Clock)


def test_prepare_caps_deadline_at_exact_active_grant_expiry():
    deadline = datetime(2026, 9, 17, 11, 24, 13, 137492, tzinfo=timezone.utc)
    assert service._prepare_expiry(SimpleNamespace(authority_expires_at=deadline)) == deadline


@pytest.mark.parametrize("deadline", [NOW, NOW - timedelta(microseconds=1), NOW.replace(tzinfo=None)])
def test_expired_or_unzoned_authority_fails_closed(deadline):
    with pytest.raises(OperatorActionError) as error:
        service._prepare_expiry(SimpleNamespace(authority_expires_at=deadline))
    assert error.value.code == ActionErrorCode.SCOPE_DENIED


@pytest.mark.parametrize("deadline", [None, NOW + timedelta(hours=1)])
def test_normal_preview_lifetime_is_not_extended(deadline):
    assert service._prepare_expiry(SimpleNamespace(authority_expires_at=deadline)) == NOW + timedelta(minutes=15)


def test_near_expiry_preserves_only_remaining_authority():
    deadline = NOW + timedelta(seconds=1)
    assert service._prepare_expiry(SimpleNamespace(authority_expires_at=deadline)) == deadline
