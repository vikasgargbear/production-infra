#!/usr/bin/env python3
"""Package customer-advance branch, execution, and bounce-capacity authority."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = (
    ROOT
    / "database/canonical/commands_automation/baseline-automation-command-enforcements.json"
)
OUTPUT = (
    ROOT
    / "backend/alembic/sql/20260828_0046_customer_advance_bounce_integrity.sql"
)
AUTOMATION_GENERATOR = (
    ROOT / "database/canonical/commands_automation/generate_automation_commands.py"
)
FUNCTIONS = (
    "guard_command_request_match",
    "prepare_operator_command",
    "resolve_customer_receipt_prepare",
    "resolve_customer_cheque_action_prepare",
    "persist_customer_cheque_bounce_prepare",
    "execute_approved_command",
)


def _statements() -> list[str]:
    artifact = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    return [
        statement
        for enforcement in artifact["enforcements"]
        for statement in enforcement["statements"]
    ]


def _function_bundle(statements: list[str], function_name: str) -> list[str]:
    create_prefix = f'CREATE FUNCTION "erp_automation_commands"."{function_name}"('
    definitions = [
        statement for statement in statements if statement.startswith(create_prefix)
    ]
    if len(definitions) != 1:
        raise RuntimeError(f"expected one canonical {function_name} definition")
    identity_prefix = f'"erp_automation_commands"."{function_name}"('
    acl = [
        statement
        for statement in statements
        if identity_prefix in statement
        and statement.startswith(
            (
                "ALTER FUNCTION ",
                "REVOKE ALL ON FUNCTION ",
                "GRANT EXECUTE ON FUNCTION ",
            )
        )
    ]
    if not any(statement.startswith("ALTER FUNCTION ") for statement in acl):
        raise RuntimeError(f"canonical {function_name} owner is missing")
    if not any(statement.startswith("REVOKE ALL ON FUNCTION ") for statement in acl):
        raise RuntimeError(f"canonical {function_name} revocation is missing")
    return [
        definitions[0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1),
        *acl,
    ]


def _current_execute_statements() -> list[str]:
    spec = importlib.util.spec_from_file_location(
        "customer_advance_automation_generator", AUTOMATION_GENERATOR
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load canonical automation generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module._execution_definition()


def generated_sql() -> str:
    statements = _statements()
    bundles: list[str] = []
    for function_name in FUNCTIONS:
        if function_name == "execute_approved_command":
            bundles.extend(
                _function_bundle(_current_execute_statements(), function_name)
            )
        else:
            bundles.extend(_function_bundle(statements, function_name))
    sql = "\n\n".join(statement.rstrip(";") + ";" for statement in bundles) + "\n"
    required = (
        "WHEN 'finance.adjustment_note.prepare' THEN 'adjustment_note'",
        "WHEN 'finance.adjustment_note.prepare' THEN 'finance.adjustment_note.post'",
        "WHEN 'finance.bank_reconciliation.prepare' THEN 'reconciliation_match'",
        "WHEN 'finance.bank_reconciliation.prepare' THEN 'finance.bank_reconciliation.match'",
        "WHEN 'finance.expense_claim.prepare' THEN 'expense_claim'",
        "WHEN 'finance.expense_claim.prepare' THEN 'finance.expense_claim.post'",
        "FROM sales.orders AS source_order",
        "source_order.branch_id=branch_id",
        ":customer-advance-order:",
        "reversal.related_payment_id=existing.id AND reversal.payment_purpose='cheque_bounce'",
        "FROM finance.payments AS source_payment",
        "source_payment.branch_id=branch_id",
        "payment.payment_purpose NOT IN ('commercial_settlement','customer_advance')",
        "SELECT event.journal_entry_id INTO STRICT original_journal_id",
        "event.payment_id=(resolved_document->>'original_payment_id')::uuid",
        "THEN resolved_document->>'cheques_in_hand_account_id' ELSE resolved_document->>'settlement_account_id'",
        "THEN resolved_document->>'offset_account_id' ELSE resolved_document->>'cheques_in_hand_account_id'",
    )
    missing = [fragment for fragment in required if fragment not in sql]
    if missing:
        raise RuntimeError(f"customer-advance bounce integrity is incomplete: {missing}")
    forbidden = (
        "FROM sales.orders WHERE org_id=organization_id AND id=sales_order_id",
        "AND branch_id=branch_id AND customer_account_id=customer.id",
        "FROM finance.payments WHERE org_id=organization_id AND id=original_id",
    )
    present = [fragment for fragment in forbidden if fragment in sql]
    if present:
        raise RuntimeError(f"customer-advance migration retained unsafe SQL: {present}")
    return (
        "-- Generated by backend/scripts/generate_customer_advance_bounce_integrity_migration.py.\n"
        "-- Source owner: canonical automation command generator.\n\n"
        "SET LOCAL ROLE erp_migration_owner;\n\n"
        + sql
        + "\nRESET ROLE;\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    expected = generated_sql()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != expected:
            raise SystemExit("customer-advance bounce-integrity migration is stale")
        return 0
    OUTPUT.write_text(expected, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
