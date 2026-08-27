"""Verify the immutable stock-transfer migration against its reviewed source."""

from __future__ import annotations

import hashlib
import json
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


class StockTransferMigrationDrift(RuntimeError):
    """The immutable migration no longer matches its reviewed source artifact."""


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return path


def generate_sql() -> str:
    """Render the reviewed SQL in its deterministic migration order."""

    document = json.loads(MAPPING.read_text(encoding="utf-8"))
    selected: dict[str, list[str]] = {name: [] for name in FUNCTION_NAMES}
    for enforcement in document["enforcements"]:
        for statement in enforcement["statements"]:
            declaration = statement.splitlines()[0]
            for function_name in FUNCTION_NAMES:
                qualified_name = (
                    f'"erp_automation_commands"."{function_name}"('
                )
                if qualified_name not in declaration:
                    continue
                if statement.startswith(
                    'CREATE FUNCTION "erp_automation_commands".'
                ):
                    statement = statement.replace(
                        "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1
                    )
                selected[function_name].append(statement.rstrip(";") + ";")
                break

    expected_statement_counts = {
        "resolve_inventory_transfer_prepare": 4,
        "assert_inventory_transfer_draft": 3,
        "persist_inventory_transfer_prepare": 4,
        "execute_approved_command": 4,
    }
    if {
        name: len(statements) for name, statements in selected.items()
    } != expected_statement_counts:
        raise StockTransferMigrationDrift(
            "reviewed automation artifact does not contain the exact function, "
            "ownership, revoke, and runtime grant sources expected by migration 0005"
        )

    statements = [
        statement
        for function_name in FUNCTION_NAMES
        for statement in selected[function_name]
    ]
    return (
        "SET LOCAL ROLE erp_migration_owner;\n\n"
        + "\n\n".join(statements)
        + "\n\nRESET ROLE;\n"
    )


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
