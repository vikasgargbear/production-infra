#!/usr/bin/env python3
"""Verify frozen reviewed receipt and supplier settlement migration 0037."""

from __future__ import annotations

import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "backend/alembic/sql/20260827_0037_receipt_supplier_settlement.sql"
EXPECTED_SQL_SHA256 = "b91e86f9979ab94066688c3eda6b5c2502fad0285d6a8a6953cfee3a5ee732e5"
FUNCTIONS = (
    ("erp_automation_commands", "assert_customer_receipt_draft"),
    ("erp_automation_commands", "assert_supplier_payment_draft"),
    ("erp_automation_commands", "execute_approved_command"),
    ("erp_automation_commands", "guard_command_request_match"),
    ("erp_automation_commands", "prepare_operator_command"),
    ("erp_automation_commands", "resolve_customer_receipt_prepare"),
    ("erp_automation_commands", "persist_customer_receipt_prepare"),
    ("erp_automation_commands", "resolve_supplier_payment_prepare"),
    ("erp_automation_commands", "persist_supplier_payment_prepare"),
    ("erp_automation_commands", "resolve_customer_cheque_action_prepare"),
    ("erp_automation_commands", "resolve_customer_cheque_clearance_prepare"),
    ("erp_automation_commands", "resolve_customer_cheque_bounce_prepare"),
    ("erp_automation_commands", "persist_customer_cheque_clearance_prepare"),
    ("erp_automation_commands", "persist_customer_cheque_bounce_prepare"),
    ("erp_finance_commands", "apply_supplier_adjustment_credit"),
    ("erp_finance_commands", "apply_supplier_advance"),
    ("erp_finance_commands", "guard_payment_command"),
    ("erp_finance_commands", "post_customer_receipt"),
    ("erp_finance_commands", "post_customer_cheque_clearance"),
    ("erp_finance_commands", "post_customer_cheque_bounce"),
    ("erp_finance_commands", "post_supplier_payment"),
    ("erp_finance_commands", "post_payment"),
    ("erp_finance_invariants", "guard_allocation"),
)


def render() -> str:
    sql = TARGET.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("receipt supplier settlement migration hash mismatch")
    for schema, name in FUNCTIONS:
        marker = f'CREATE OR REPLACE FUNCTION "{schema}"."{name}"('
        if marker not in sql:
            raise RuntimeError(f"frozen migration lacks {schema}.{name}")
    return sql


def main() -> None:
    render()
    print("receipt supplier settlement migration: current")


if __name__ == "__main__":
    main()
