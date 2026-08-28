#!/usr/bin/env python3
"""Verify the immutable canonical posting-chronology migration package."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPOSITORY_ROOT / "backend/alembic/sql/20260828_0038_posting_chronology.sql"
EXPECTED_SQL_SHA256 = "89b8071c909c7c27a20c7f7c6940da325933cf4fb0e83c59334598db63d4cd4c"
FUNCTION_NAMES = (
    "resolve_sales_dispatch_prepare",
    "resolve_purchase_order_prepare",
    "resolve_goods_receipt_prepare",
    "resolve_supplier_invoice_prepare",
    "resolve_sales_invoice_prepare",
    "resolve_sales_order_prepare",
    "resolve_sales_return_prepare",
    "resolve_purchase_return_prepare",
    "resolve_adjustment_note_prepare_unchecked_v0013",
)


def generate_sql() -> str:
    """Return reviewed revision bytes without consulting mutable later sources."""

    sql = OUTPUT_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("posting-chronology migration hash mismatch")
    for name in FUNCTION_NAMES:
        marker = f'CREATE OR REPLACE FUNCTION "erp_automation_commands"."{name}"('
        if marker not in sql:
            raise RuntimeError(f"frozen migration lacks {name}")
    return sql


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if args.write:
        raise RuntimeError("revision 20260828_0038 is immutable; add a new hash-bound revision")
    generate_sql()
    print("posting chronology migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
