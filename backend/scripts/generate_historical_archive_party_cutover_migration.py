#!/usr/bin/env python3
"""Package the reviewed historical archive-party cutover correction for Alembic."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/automation/historical_operational_cutover.sql"
TARGET = ROOT / "backend/alembic/sql/20260830_0068_historical_archive_party_cutover.sql"


def render() -> str:
    source = SOURCE.read_text(encoding="utf-8")
    start = source.index(
        "CREATE FUNCTION erp_automation_commands.promote_historical_operational_batch"
    )
    end = source.index("ALTER TABLE automation.historical_party_bindings OWNER")
    functions = source[start:end]
    functions = functions.replace(
        "CREATE FUNCTION erp_automation_commands.",
        "CREATE OR REPLACE FUNCTION erp_automation_commands.",
    ).replace(
        "CREATE FUNCTION erp_automation_reads.",
        "CREATE OR REPLACE FUNCTION erp_automation_reads.",
    )
    authority = """ALTER FUNCTION erp_automation_commands.promote_historical_operational_batch(uuid,varchar,integer)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.historical_operational_cutover_status(uuid,varchar)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.promote_historical_operational_batch(uuid,varchar,integer)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.historical_operational_cutover_status(uuid,varchar)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_commands.promote_historical_operational_batch(uuid,varchar,integer)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_operational_cutover_status(uuid,varchar)
  TO erp_runtime;
"""
    return f"SET LOCAL ROLE erp_migration_owner;\n\n{functions}{authority}\nRESET ROLE;\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.write:
        TARGET.write_text(rendered, encoding="utf-8")
        return 0
    if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != rendered:
        raise SystemExit(
            "historical archive-party cutover migration drifted; run with --write"
        )
    print("historical archive-party cutover migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
