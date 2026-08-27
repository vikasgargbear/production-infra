#!/usr/bin/env python3
"""Verify the frozen reviewed SQL for immutable migration 0040."""

from __future__ import annotations

import hashlib
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
OUTPUT = REPO / "backend/alembic/sql/20260828_0040_supplier_invoice_landed_cost_authority.sql"
EXPECTED_SQL_SHA256 = "5d2eab3f2bc452f363c7048a046783164aa9ac7db7963583e69d343a4edc1b87"
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
