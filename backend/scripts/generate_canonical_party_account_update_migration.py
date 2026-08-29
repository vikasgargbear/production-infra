#!/usr/bin/env python3
"""Render the reviewed customer and supplier account update boundary."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = (
    ROOT
    / "database/canonical/operations/master/party_account_update_commands.sql"
)
OUTPUT = (
    ROOT
    / "backend/alembic/sql/20260829_0053_canonical_party_account_updates.sql"
)


def render() -> str:
    command_sql = SOURCE.read_text(encoding="utf-8").rstrip()
    return f"""SET LOCAL ROLE erp_migration_owner;

{command_sql}

-- Runtime party/account/contact mutations now have one named owner. Security-
-- definer commands remain executable through their explicit grants.
REVOKE UPDATE ON TABLE parties.parties FROM erp_app,erp_runtime;
REVOKE INSERT,UPDATE ON TABLE parties.contacts FROM erp_app,erp_runtime;
REVOKE UPDATE ON TABLE parties.customer_accounts FROM erp_app,erp_runtime;
REVOKE UPDATE ON TABLE parties.supplier_accounts FROM erp_app,erp_runtime;

RESET ROLE;
"""


if __name__ == "__main__":
    rendered = render()
    if sys.argv[1:] == ["--write"]:
        OUTPUT.write_text(rendered, encoding="utf-8")
    elif sys.argv[1:]:
        raise SystemExit(
            "usage: generate_canonical_party_account_update_migration.py [--write]"
        )
    else:
        print(rendered, end="")
