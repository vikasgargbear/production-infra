"""Verify the immutable stock-transfer migration against its reviewed source."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MAPPING = ROOT / "database/canonical/commands_automation/baseline-automation-command-enforcements.json"
SQL_PATH = ROOT / "backend/alembic/sql/20260825_0005_inventory_transfer_command.sql"
VERSION_PATH = ROOT / "backend/alembic/versions/20260825_0005_inventory_transfer_command.py"
FUNCTION_NAMES = (
    "resolve_inventory_transfer_prepare",
    "assert_inventory_transfer_draft",
    "persist_inventory_transfer_prepare",
    "execute_approved_command",
)
EXPECTED_SQL_SHA256 = "f21f56c6c796f7bf41e6789f9941566ca0ce3aadb6c3d162dab958cd8689eb90"


class StockTransferMigrationDrift(RuntimeError):
    """The immutable migration no longer matches its reviewed source artifact."""


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def generate_sql() -> str:
    """Return the frozen migration only when its reviewed identity is intact."""

    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise StockTransferMigrationDrift(
            f"{_display_path(SQL_PATH)} differs from the reviewed automation artifact"
        )
    return sql


def check_reviewed_migration() -> str:
    """Return the verified SHA-256 or fail without changing repository files."""

    generated_sql = generate_sql()
    checked_in_sql = SQL_PATH.read_text(encoding="utf-8")
    if checked_in_sql != generated_sql:
        raise StockTransferMigrationDrift(
            f"{_display_path(SQL_PATH)} differs from the reviewed automation artifact"
        )

    digest = hashlib.sha256(checked_in_sql.encode("utf-8")).hexdigest()
    version = VERSION_PATH.read_text(encoding="utf-8")
    match = re.search(r'^EXPECTED_SQL_SHA256 = "([0-9a-f]{64})"$', version, re.MULTILINE)
    if match is None or match.group(1) != digest:
        raise StockTransferMigrationDrift(
            f"{_display_path(VERSION_PATH)} does not bind the reviewed SQL SHA-256"
        )
    return digest


def main() -> None:
    digest = check_reviewed_migration()
    print(f"stock-transfer migration source verified: sha256={digest}")


if __name__ == "__main__":
    main()
