"""Keep the retired integer journal surface outside the runtime route graph."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def test_legacy_journal_router_is_not_mounted() -> None:
    main_source = (ROOT / "backend/app/main.py").read_text(encoding="utf-8")
    assert "journal_entries.router" not in main_source
    assert 'prefix="/journal-entries"' not in main_source
