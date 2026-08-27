#!/usr/bin/env python3
"""Verify the immutable finance business-date context migration package."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPOSITORY_ROOT / "backend/alembic/sql/20260828_0035_finance_business_date_context.sql"
EXPECTED_SQL_SHA256 = "2cfe5d0451845be1edda326fd3c8af543266c15557a2f748a437bd3a0b3a1e47"
FUNCTION_NAMES = (
    "resolve_customer_receipt_prepare",
    "resolve_supplier_advance_prepare",
    "resolve_supplier_payment_prepare",
)


def generate_sql() -> str:
    sql = OUTPUT_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("finance business-date context migration hash mismatch")
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
        raise RuntimeError("revision 20260828_0035 is immutable; add a new hash-bound revision")
    generate_sql()
    print("finance business-date context migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
