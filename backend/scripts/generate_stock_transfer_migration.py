"""Build the hash-bound incremental migration from reviewed command artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MAPPING = ROOT / "database/canonical/commands_automation/baseline-automation-command-enforcements.json"
SQL_PATH = ROOT / "backend/alembic/sql/20260825_0005_inventory_transfer_command.sql"
VERSION_PATH = ROOT / "backend/alembic/versions/20260825_0005_inventory_transfer_command.py"


def main() -> None:
    document = json.loads(MAPPING.read_text(encoding="utf-8"))
    selected: list[str] = []
    needles = (
        '"resolve_inventory_transfer_prepare"',
        '"assert_inventory_transfer_draft"',
        '"persist_inventory_transfer_prepare"',
        '"execute_approved_command"',
    )
    for enforcement in document["enforcements"]:
        for statement in enforcement["statements"]:
            if any(needle in statement for needle in needles):
                if statement.startswith('CREATE FUNCTION "erp_automation_commands".'):
                    statement = statement.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
                selected.append(statement.rstrip(";") + ";")
    def order(statement: str) -> int:
        declaration = statement.splitlines()[0]
        if '"resolve_inventory_transfer_prepare"' in declaration:
            return 0
        if '"assert_inventory_transfer_draft"' in declaration:
            return 1
        if '"persist_inventory_transfer_prepare"' in declaration:
            return 2
        return 3

    sql = "\n\n".join(sorted(selected, key=order)) + "\n"
    SQL_PATH.write_text(sql, encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    version = f'''"""Add reviewed canonical inter-branch inventory transfer command.

Revision ID: 20260825_0005
Revises: 20260825_0004
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from alembic import context, op

from migration_support.canonical_baseline import CanonicalBaselineError


revision = "20260825_0005"
down_revision = "20260825_0004"
branch_labels = None
depends_on = None

SQL_PATH = Path(__file__).resolve().parents[1] / "sql" / "20260825_0005_inventory_transfer_command.sql"
EXPECTED_SQL_SHA256 = "{digest}"


def _reviewed_sql() -> str:
    sql = SQL_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise CanonicalBaselineError("inventory transfer migration source hash mismatch")
    return sql


def upgrade() -> None:
    if context.is_offline_mode():
        raise CanonicalBaselineError("inventory transfer migration requires an online reviewed principal")
    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(_reviewed_sql())
    finally:
        cursor.close()


def downgrade() -> None:
    raise CanonicalBaselineError("inventory transfer command downgrade is intentionally unavailable")
'''
    VERSION_PATH.write_text(version, encoding="utf-8")


if __name__ == "__main__":
    main()
