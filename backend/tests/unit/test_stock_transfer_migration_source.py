from __future__ import annotations

import inspect

import pytest

from scripts import generate_stock_transfer_migration as migration_source


def test_stock_transfer_migration_is_reproducible_and_hash_bound() -> None:
    checked_in = migration_source.SQL_PATH.read_text(encoding="utf-8")

    assert migration_source.generate_sql() == checked_in
    assert migration_source.check_reviewed_migration() == (
        "f21f56c6c796f7bf41e6789f9941566ca0ce3aadb6c3d162dab958cd8689eb90"
    )


def test_verifier_cannot_overwrite_immutable_alembic_history() -> None:
    source = inspect.getsource(migration_source)

    assert ".write_text(" not in source
    assert "StockTransferMigrationDrift" in source


def test_sql_drift_fails_closed(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    changed_sql = tmp_path / "changed.sql"
    changed_sql.write_text("SELECT 1;\n", encoding="utf-8")
    monkeypatch.setattr(migration_source, "SQL_PATH", changed_sql)

    with pytest.raises(
        migration_source.StockTransferMigrationDrift,
        match="differs from the reviewed automation artifact",
    ):
        migration_source.check_reviewed_migration()
