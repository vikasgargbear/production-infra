#!/usr/bin/env python3
"""Verify frozen explicit finance state and signed-count migration SQL."""

from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "backend/alembic/sql/20260828_0041_explicit_finance_state.sql"
EXPECTED_SQL_SHA256 = "7e57be833e5a90204b23f0bce0cd6be5462bd9955197da0dd7bbeb3cf073db54"
FUNCTIONS = (
    ("erp_automation_commands", "assert_inventory_adjustment_draft"),
    ("erp_automation_commands", "resolve_inventory_adjustment_prepare"),
    ("erp_automation_commands", "persist_inventory_adjustment_prepare"),
    ("erp_automation_commands", "execute_approved_command"),
    ("erp_commercial_commands", "post_adjustment_note"),
    ("erp_commercial_commands", "post_purchase_return"),
    ("erp_commercial_commands", "post_sales_return"),
    ("erp_finance_commands", "apply_supplier_advance"),
    ("erp_finance_commands", "mark_journal_reversed"),
    ("erp_finance_commands", "reverse_payment"),
    ("erp_finance_commands", "synchronize_open_item_status"),
    ("erp_finance_invariants", "guard_allocation"),
    ("erp_finance_invariants", "guard_journal_entry"),
    ("erp_finance_invariants", "guard_open_item"),
)


def render() -> str:
    sql = TARGET.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("explicit finance-state migration hash mismatch")
    for schema, name in FUNCTIONS:
        marker = f'CREATE OR REPLACE FUNCTION "{schema}"."{name}"('
        if marker not in sql:
            raise RuntimeError(f"frozen migration lacks {schema}.{name}")
    return sql


def main() -> int:
    render()
    print("explicit finance-state migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
