#!/usr/bin/env python3
"""Generate immutable migration 0034 from reviewed canonical command artifacts."""

from __future__ import annotations

import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
OUTPUT = REPO / "backend/alembic/sql/20260827_0034_supplier_invoice_landed_cost_authority.sql"
SOURCES = (
    REPO / "database/canonical/commands_trade_v2/baseline-trade-posting-enforcements.json",
    REPO / "database/canonical/commands_commercial/baseline-commercial-command-enforcements.json",
    REPO / "database/canonical/commands_automation/baseline-automation-command-enforcements.json",
)
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


def _statements() -> list[str]:
    statements: list[str] = []
    for source in SOURCES:
        payload = json.loads(source.read_text(encoding="utf-8"))
        for enforcement in payload["enforcements"]:
            statements.extend(enforcement["statements"])
        statements.extend(payload.get("platform_enforcements", ()))
    return statements


def generated_sql() -> str:
    statements = _statements()
    selected: list[str] = []
    for schema, name in FUNCTIONS:
        create_prefix = f'CREATE FUNCTION "{schema}"."{name}"('
        create = [statement for statement in statements if statement.startswith(create_prefix)]
        if len(create) != 1:
            raise RuntimeError(f"expected one reviewed definition for {schema}.{name}, found {len(create)}")
        definition = create[0].replace(
            "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1
        )
        selected.append("\n".join(line.rstrip() for line in definition.splitlines()))
        signature_prefix = f'ALTER FUNCTION "{schema}"."{name}"('
        ownership = [statement for statement in statements if statement.startswith(signature_prefix)]
        if len(ownership) != 1:
            raise RuntimeError(f"expected one ownership statement for {schema}.{name}")
        selected.append(ownership[0])
        revoke_prefix = f'REVOKE ALL ON FUNCTION "{schema}"."{name}"('
        revokes = [statement for statement in statements if statement.startswith(revoke_prefix)]
        if len(revokes) != 1:
            raise RuntimeError(f"expected one revoke statement for {schema}.{name}")
        selected.append(revokes[0])

    prelude = """SET LOCAL ROLE erp_migration_owner;

ALTER TABLE procurement.supplier_invoice_lines
  ADD COLUMN landed_cost_allocation_method text;

ALTER TABLE procurement.supplier_invoice_lines
  ADD CONSTRAINT supplier_invoice_lines_landed_cost_allocation_ck CHECK (
    (inventory_cost_treatment='capitalize'
      AND landed_cost_allocation_method IN ('direct','quantity_weighted','value_weighted'))
    OR (inventory_cost_treatment='expense'
      AND landed_cost_allocation_method IS NULL)
  ) NOT VALID;
"""
    return prelude + "\n" + ";\n\n".join(selected) + ";\n\nRESET ROLE;\n"


def main() -> None:
    OUTPUT.write_text(generated_sql(), encoding="utf-8")


if __name__ == "__main__":
    main()
