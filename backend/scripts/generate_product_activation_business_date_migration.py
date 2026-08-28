#!/usr/bin/env python3
"""Render the organization-business-date product activation boundary."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/master/product_setup_commands.sql"
OUTPUT = (
    ROOT
    / "backend/alembic/sql/20260829_0051_product_activation_business_date.sql"
)


def render() -> str:
    source = SOURCE.read_text(encoding="utf-8")
    start = source.index(
        "CREATE OR REPLACE FUNCTION erp_master_commands.activate_configured_product("
    )
    end = source.index(
        "\nALTER FUNCTION erp_master_commands.product_setup_missing_fields", start
    )
    command_sql = source[start:end].rstrip()
    return f"""SET LOCAL ROLE erp_migration_owner;

{command_sql}

ALTER FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) TO erp_runtime;

-- The security-definer setup command is the sole runtime activation owner.
-- Its organization-timezone scope contains the inherited regulatory command's
-- effective-date checks without exposing that lower-level command directly.
REVOKE EXECUTE ON FUNCTION erp_regulatory_commands.activate_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;

RESET ROLE;
"""


if __name__ == "__main__":
    rendered = render()
    if sys.argv[1:] == ["--write"]:
        OUTPUT.write_text(rendered, encoding="utf-8")
    elif sys.argv[1:]:
        raise SystemExit(
            "usage: generate_product_activation_business_date_migration.py [--write]"
        )
    else:
        print(rendered, end="")
