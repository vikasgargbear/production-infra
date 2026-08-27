#!/usr/bin/env python3
"""Package explicit finance state transitions and signed count authority."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "backend/alembic/sql/20260827_0035_explicit_finance_state.sql"
SOURCES = (
    ROOT / "database/canonical/commands_automation/baseline-automation-command-enforcements.json",
    ROOT / "database/canonical/commands_commercial/baseline-commercial-command-enforcements.json",
    ROOT / "database/canonical/commands_finance/baseline-finance-command-enforcements.json",
    ROOT / "database/canonical/invariants_finance/baseline-finance-enforcements.json",
)
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


def _statements() -> list[str]:
    statements: list[str] = []
    for source in SOURCES:
        payload = json.loads(source.read_text(encoding="utf-8"))
        for enforcement in payload["enforcements"]:
            statements.extend(enforcement["statements"])
    return statements


def _reviewed_function(statements: list[str], schema: str, name: str) -> list[str]:
    create_prefix = f'CREATE FUNCTION "{schema}"."{name}"('
    creates = [item for item in statements if item.startswith(create_prefix)]
    if len(creates) != 1:
        raise RuntimeError(f"expected one reviewed definition for {schema}.{name}")
    signature_prefix = f'ALTER FUNCTION "{schema}"."{name}"('
    ownership = [item for item in statements if item.startswith(signature_prefix)]
    revoke_prefix = f'REVOKE ALL ON FUNCTION "{schema}"."{name}"('
    revokes = [item for item in statements if item.startswith(revoke_prefix)]
    if len(ownership) != 1 or len(revokes) != 1:
        raise RuntimeError(f"expected reviewed ownership for {schema}.{name}")
    definition = creates[0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
    definition = "\n".join(line.rstrip() for line in definition.splitlines())
    return [definition, ownership[0], revokes[0]]


def render() -> str:
    statements = _statements()
    selected: list[str] = []
    for schema, name in FUNCTIONS:
        selected.extend(_reviewed_function(statements, schema, name))
    prelude = """SET LOCAL ROLE erp_migration_owner;

ALTER TABLE finance.allocations
  ADD COLUMN source_open_item_id uuid;

ALTER TABLE finance.allocations
  ADD CONSTRAINT allocations_source_open_item_fk
  FOREIGN KEY (org_id, source_open_item_id)
  REFERENCES finance.open_items (org_id, id) ON DELETE RESTRICT;

ALTER TABLE finance.allocations
  DROP CONSTRAINT allocations_exact_source_ck;

ALTER TABLE finance.allocations
  ADD CONSTRAINT allocations_exact_source_ck CHECK (
    num_nonnulls(payment_id, withholding_id, adjustment_note_id,
      purchase_order_advance_allocation_id, source_open_item_id) = 1
  );

CREATE INDEX allocations_source_open_item_idx
  ON finance.allocations (org_id, source_open_item_id, allocation_date, id)
  WHERE source_open_item_id IS NOT NULL;
"""
    return prelude + "\n" + ";\n\n".join(selected) + ";\n\nRESET ROLE;\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    rendered = render()
    if args.write:
        TARGET.write_text(rendered, encoding="utf-8")
        return 0
    if not TARGET.is_file() or TARGET.read_text(encoding="utf-8") != rendered:
        raise SystemExit("explicit finance-state migration drifted; run with --write")
    print("explicit finance-state migration: current")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
