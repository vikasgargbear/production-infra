from __future__ import annotations

from uuid import UUID

import pytest

from tests.live_erp.conftest import _load_live_config


def _environment(monkeypatch: pytest.MonkeyPatch) -> None:
    values = {
        "PHARMA_LIVE_API_BASE_URL": "https://api.example.test",
        "PHARMA_LIVE_DATABASE_URL": "postgresql://user:secret@db.example.test/app",
        "PHARMA_LIVE_ACCESS_TOKEN": "short-lived-token",
        "PHARMA_LIVE_TEST_ORG_ID": "d3000000-0000-7000-8000-000000000001",
        "PHARMA_LIVE_TEST_BRANCH_ID": "d3000000-0000-7000-8000-000000000005",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)


def test_live_config_preserves_canonical_uuid_identities(monkeypatch: pytest.MonkeyPatch) -> None:
    _environment(monkeypatch)

    config = _load_live_config()

    assert config.test_org_id == UUID("d3000000-0000-7000-8000-000000000001")
    assert config.test_branch_id == UUID("d3000000-0000-7000-8000-000000000005")


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("PHARMA_LIVE_TEST_ORG_ID", "1"),
        ("PHARMA_LIVE_TEST_BRANCH_ID", "42"),
        ("PHARMA_LIVE_TEST_BRANCH_ID", "not-a-uuid"),
    ],
)
def test_live_config_rejects_legacy_integer_and_invalid_ids(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    value: str,
) -> None:
    _environment(monkeypatch)
    monkeypatch.setenv(name, value)

    with pytest.raises(RuntimeError, match="canonical UUID"):
        _load_live_config()
