#!/usr/bin/env python3
"""Verify the immutable, reviewed tenant timestamp-date migration package."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0039_tenant_timestamp_dates.sql"
)
EXPECTED_SQL_SHA256 = "16b9ce94dafca97338b8f8f0458dfd7a1b22454d2dcb172cefb785896fef4a36"
FUNCTIONS = (
    ("erp_trade_invariants", "guard_batch"),
    ("erp_regulatory_commands", "guard_regulatory_posting"),
    ("erp_compliance_commands", "record_controlled_substance_entry"),
    ("erp_compliance_commands", "ingest_temperature_reading"),
    ("erp_commercial_commands", "post_sales_return"),
    ("erp_commercial_commands", "post_purchase_return"),
    ("erp_commercial_commands", "post_adjustment_note"),
    ("erp_automation_commands", "resolve_sales_return_prepare"),
)
REQUIRED_FRAGMENTS = (
    "NEW.created_at AT TIME ZONE organization_timezone",
    "NEW.received_at AT TIME ZONE organization.timezone",
    "ledger.posted_at AT TIME ZONE organization.timezone",
    "measured_at AT TIME ZONE organization.timezone",
    "filing.filed_at AT TIME ZONE organization.timezone",
    "FROM core.organizations",
    "FOR SHARE",
)


def generate_sql() -> str:
    """Return the frozen package after verifying its reviewed byte identity.

    Canonical function sources continue to evolve in later revisions. Rebuilding
    revision 0039 from those mutable sources would rewrite deployed history.
    """

    sql = OUTPUT_PATH.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()
    if digest != EXPECTED_SQL_SHA256:
        raise RuntimeError("tenant timestamp-date migration hash mismatch")
    for schema, name in FUNCTIONS:
        marker = f'CREATE OR REPLACE FUNCTION "{schema}"."{name}"('
        if marker not in sql:
            raise RuntimeError(f"frozen migration lacks {schema}.{name}")
    missing = [fragment for fragment in REQUIRED_FRAGMENTS if fragment not in sql]
    if missing:
        raise RuntimeError(
            f"frozen tenant timestamp-date migration lacks authority: {missing}"
        )
    return sql


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    if args.write:
        raise RuntimeError(
            "revision 20260828_0039 is immutable; add a new hash-bound revision"
        )
    generate_sql()
    print("tenant timestamp-date migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
