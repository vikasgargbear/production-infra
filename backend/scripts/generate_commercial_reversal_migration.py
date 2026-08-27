#!/usr/bin/env python3
"""Verify frozen reviewed commercial reversal migration 0036."""

from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "backend/alembic/sql/20260827_0036_commercial_reversal_authority.sql"
EXPECTED_SQL_SHA256 = "bb10df56d8b8573d5c02b3da104dfdf063b8d4739938abb3e7aaadbf70829c62"
FUNCTIONS = (
    ("erp_automation_commands", "guard_command_request_match"),
    ("erp_automation_commands", "prepare_operator_command"),
    ("erp_commercial_commands", "reversal_scope_active"),
    ("erp_commercial_commands", "resolve_commercial_reversal_prepare"),
    ("erp_commercial_commands", "prepare_sales_return_reversal"),
    ("erp_commercial_commands", "prepare_purchase_return_reversal"),
    ("erp_commercial_commands", "prepare_adjustment_note_reversal"),
    ("erp_commercial_commands", "persist_commercial_reversal_prepare"),
    ("erp_commercial_commands", "post_commercial_reversal"),
    ("erp_commercial_commands", "post_sales_return_reversal"),
    ("erp_commercial_commands", "post_purchase_return_reversal"),
    ("erp_commercial_commands", "post_adjustment_note_reversal"),
    ("erp_commercial_commands", "execute_approved_commercial_reversal"),
    ("erp_commercial_commands", "guard_adjustment_note_companions"),
    ("erp_commercial_commands", "guard_purchase_return_state"),
    ("erp_commercial_commands", "guard_sales_return_state"),
    ("erp_commercial_commands", "guard_tax_document_source"),
    ("erp_finance_invariants", "guard_allocation"),
)


def render() -> str:
    sql = TARGET.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("commercial reversal migration hash mismatch")
    for schema, name in FUNCTIONS:
        marker = f'CREATE OR REPLACE FUNCTION "{schema}"."{name}"('
        if marker not in sql:
            raise RuntimeError(f"frozen migration lacks {schema}.{name}")
    return sql


def main() -> None:
    render()
    print("commercial reversal migration: current")


if __name__ == "__main__":
    main()
