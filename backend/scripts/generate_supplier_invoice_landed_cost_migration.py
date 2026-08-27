#!/usr/bin/env python3
"""Verify the frozen reviewed SQL for immutable migration 0034."""

from __future__ import annotations

import hashlib
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
OUTPUT = REPO / "backend/alembic/sql/20260827_0034_supplier_invoice_landed_cost_authority.sql"
EXPECTED_SQL_SHA256 = "51e4efd4e2f10edafbf921efe45f114e39c8d2f6f0c51e3996a959b56d1d58a4"
FUNCTIONS = (
    ("erp_trade_commands_v2", "total_landed_cost_pool"),
    ("erp_trade_commands_v2", "eligible_landed_cost_pool"),
    ("erp_trade_commands_v2", "consumed_landed_cost_pool"),
    ("erp_trade_commands_v2", "assert_landed_cost_document"),
    ("erp_trade_commands_v2", "prepare_supplier_invoice_landed_cost_adjustment"),
    ("erp_commercial_commands", "resolve_role_account"),
    ("erp_commercial_commands", "post_supplier_invoice"),
    ("erp_automation_commands", "resolve_supplier_invoice_prepare"),
    ("erp_automation_commands", "persist_supplier_invoice_prepare"),
    ("erp_automation_commands", "execute_approved_command"),
)


def generated_sql() -> str:
    """Return the frozen SQL after verifying its immutable reviewed identity.

    Later migrations replace shared dispatch functions. Regenerating this migration
    from the mutable current baseline would silently rewrite migration history.
    """
    sql = OUTPUT.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("supplier-invoice landed-cost migration hash mismatch")
    for schema, name in FUNCTIONS:
        marker = f'CREATE OR REPLACE FUNCTION "{schema}"."{name}"('
        if marker not in sql:
            raise RuntimeError(f"frozen migration lacks {schema}.{name}")
    return sql


def main() -> None:
    generated_sql()
    print("supplier-invoice landed-cost migration: current")


if __name__ == "__main__":
    main()
