#!/usr/bin/env python3
"""Package the reviewed business-gap security closure for Alembic."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_PATH = (
    REPOSITORY_ROOT
    / "database/canonical/commands_commercial/baseline-commercial-command-enforcements.json"
)
FINANCE_ARTIFACT_PATH = (
    REPOSITORY_ROOT
    / "database/canonical/commands_finance/baseline-finance-command-enforcements.json"
)
AUTOMATION_ARTIFACT_PATH = (
    REPOSITORY_ROOT
    / "database/canonical/commands_automation/baseline-automation-command-enforcements.json"
)
OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0044_business_gap_security_closure.sql"
)
SCHEMA = "erp_commercial_commands"
FUNCTION_NAME = "resolve_commercial_reversal_prepare"
SIGNATURE = (
    "organization_id uuid, reversal_kind text, original_resource_id uuid, "
    "expected_row_version bigint, reversal_date date, reason text, "
    "amendment_evidence_attachment_id uuid"
)
EXECUTE_FUNCTION_NAME = "execute_approved_commercial_reversal"
EXECUTE_SIGNATURE = "organization_id uuid, command_request_id uuid"
SUPPLIER_CREDIT_FUNCTION = "apply_supplier_adjustment_credit"
SUPPLIER_CREDIT_SIGNATURE = (
    "organization_id uuid, adjustment_note_id uuid, source_open_item_id uuid, "
    "target_open_item_id uuid, allocation_id uuid, application_date date"
)
NON_RUNTIME_FUNCTIONS = (
    '"erp_commercial_commands"."post_supplier_invoice"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz)',
    '"erp_commercial_commands"."post_sales_return_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz)',
    '"erp_commercial_commands"."post_purchase_return_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz)',
    '"erp_commercial_commands"."post_adjustment_note_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz)',
    '"erp_finance_commands"."post_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid)',
    '"erp_finance_commands"."post_customer_receipt"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, receipt_allocations jsonb, customer_advance_open_item_id uuid)',
    '"erp_finance_commands"."post_customer_cheque_clearance"(organization_id uuid, original_payment_id uuid, clearance_payment_id uuid, journal_id uuid, event_id uuid)',
    '"erp_finance_commands"."post_customer_cheque_bounce"(organization_id uuid, original_payment_id uuid, bounce_payment_id uuid, journal_id uuid, event_id uuid, compensating_allocations jsonb)',
    '"erp_finance_commands"."post_supplier_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, settlement_components jsonb)',
    '"erp_finance_commands"."post_supplier_advance_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, advance_allocations jsonb)',
    '"erp_finance_commands"."reverse_payment"(organization_id uuid, original_payment_id uuid, reversal_payment_id uuid, reversal_payment_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reason text)',
    '"erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid)',
    '"erp_finance_commands"."apply_supplier_adjustment_credit"(organization_id uuid, adjustment_note_id uuid, source_open_item_id uuid, target_open_item_id uuid, allocation_id uuid, application_date date)',
)
REPLAY_FUNCTIONS = (
    ("find_exact_prepare_replay", "organization_id uuid, grant_id uuid, capability_name varchar, target_id uuid, key_hash bytea, request_bytes bytea, preview_bytes bytea"),
    ("persist_supplier_invoice_prepare", "organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz"),
    ("persist_supplier_payment_prepare", "organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz"),
    ("persist_supplier_advance_prepare", "organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz"),
    ("persist_customer_receipt_prepare", "organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz"),
    ("persist_customer_cheque_clearance_prepare", "organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz"),
    ("persist_customer_cheque_bounce_prepare", "organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz"),
)


def generate_sql() -> str:
    artifact = json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))
    finance_artifact = json.loads(FINANCE_ARTIFACT_PATH.read_text(encoding="utf-8"))
    automation_artifact = json.loads(AUTOMATION_ARTIFACT_PATH.read_text(encoding="utf-8"))
    statements = [
        statement
        for enforcement in artifact["enforcements"]
        for statement in enforcement["statements"]
    ]
    def canonical_definition(function_name: str, signature: str) -> str:
        prefix = f'CREATE FUNCTION "{SCHEMA}"."{function_name}"({signature})'
        definitions = [statement for statement in statements if statement.startswith(prefix)]
        if len(definitions) != 1:
            raise RuntimeError(f"expected one canonical {function_name} definition")
        return definitions[0]

    definition = canonical_definition(FUNCTION_NAME, SIGNATURE)
    execute_definition = canonical_definition(EXECUTE_FUNCTION_NAME, EXECUTE_SIGNATURE)
    required = (
        '"erp_core_commands"."current_organization_business_date"()',
        "commercial reversal date cannot be in the future",
        "reversal_kind NOT IN ('sales_return','purchase_return','adjustment_note')",
        "note.reversal_of_adjustment_note_id IS NOT NULL",
    )
    missing = [fragment for fragment in required if fragment not in definition]
    if missing:
        raise RuntimeError(f"commercial reversal date authority is incomplete: {missing}")
    execute_required = (
        "grant_row.status<>'active'",
        "capability.operation_mode IS DISTINCT FROM command.operation_mode",
        "erp_security.has_permission('automation.command.execute',command.branch_id)",
    )
    execute_missing = [fragment for fragment in execute_required if fragment not in execute_definition]
    if execute_missing:
        raise RuntimeError(f"commercial reversal execute authority is incomplete: {execute_missing}")
    identity = f'"{SCHEMA}"."{FUNCTION_NAME}"(uuid,text,uuid,bigint,date,text,uuid)'
    acl = [
        statement
        for statement in statements
        if identity in statement
        and statement.startswith(("ALTER FUNCTION ", "REVOKE ALL ON FUNCTION ", "GRANT EXECUTE ON FUNCTION "))
    ]
    if not any(statement.startswith("ALTER FUNCTION ") for statement in acl):
        raise RuntimeError("commercial reversal resolver owner is missing")
    if not any(statement.startswith("REVOKE ALL ON FUNCTION ") for statement in acl):
        raise RuntimeError("commercial reversal resolver revocation is missing")
    execute_identity = f'"{SCHEMA}"."{EXECUTE_FUNCTION_NAME}"(uuid,uuid)'
    execute_acl = [
        statement
        for statement in statements
        if execute_identity in statement
        and statement.startswith(("ALTER FUNCTION ", "REVOKE ALL ON FUNCTION ", "GRANT EXECUTE ON FUNCTION "))
    ]
    all_statements = statements + [
        statement
        for enforcement in finance_artifact["enforcements"]
        for statement in enforcement["statements"]
    ]
    automation_statements = [
        statement
        for enforcement in automation_artifact["enforcements"]
        for statement in enforcement["statements"]
    ]
    replay_replacements: list[str] = []
    for function_name, signature in REPLAY_FUNCTIONS:
        prefix = f'CREATE FUNCTION "erp_automation_commands"."{function_name}"({signature})'
        definitions = [statement for statement in automation_statements if statement.startswith(prefix)]
        if len(definitions) != 1:
            raise RuntimeError(f"expected one canonical {function_name} definition")
        replay_definition = definitions[0]
        if function_name != "find_exact_prepare_replay":
            replay_position = replay_definition.find("find_exact_prepare_replay")
            resolve_position = replay_definition.find("resolve_", replay_position)
            if replay_position < 0 or resolve_position < 0 or replay_position > resolve_position:
                raise RuntimeError(f"{function_name} does not replay before resolving source state")
        identity_prefix = f'"erp_automation_commands"."{function_name}"('
        acl = [
            statement for statement in automation_statements
            if identity_prefix in statement
            and statement.startswith(("ALTER FUNCTION ", "REVOKE ALL ON FUNCTION ", "GRANT EXECUTE ON FUNCTION "))
        ]
        replay_replacements.extend((replay_definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1), *acl))

    commercial_persist = canonical_definition(
        "persist_commercial_reversal_prepare",
        "organization_id uuid, reversal_kind text, original_resource_id uuid, reversal_adjustment_note_id uuid, command_request_id uuid, grant_id uuid, key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz",
    )
    if commercial_persist.find("find_exact_prepare_replay") > commercial_persist.find("resolve_commercial_reversal_prepare"):
        raise RuntimeError("commercial reversal replay occurs after source resolution")
    commercial_persist_identity = f'"{SCHEMA}"."persist_commercial_reversal_prepare"(uuid,text,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz)'
    commercial_persist_acl = [
        statement for statement in statements
        if commercial_persist_identity in statement
        and statement.startswith(("ALTER FUNCTION ", "REVOKE ALL ON FUNCTION ", "GRANT EXECUTE ON FUNCTION "))
    ]
    finance_prefix = (
        f'CREATE FUNCTION "erp_finance_commands"."{SUPPLIER_CREDIT_FUNCTION}"'
        f"({SUPPLIER_CREDIT_SIGNATURE})"
    )
    finance_definitions = [
        statement for statement in all_statements if statement.startswith(finance_prefix)
    ]
    if len(finance_definitions) != 1:
        raise RuntimeError("expected one canonical supplier credit application definition")
    supplier_credit_definition = finance_definitions[0]
    if '"current_organization_business_date"()' not in supplier_credit_definition:
        raise RuntimeError("supplier credit application lacks organization business date")
    revocations: list[str] = []
    for function_identity in NON_RUNTIME_FUNCTIONS:
        expected = (
            f"REVOKE ALL ON FUNCTION {function_identity} "
            'FROM PUBLIC, "erp_app", "erp_runtime"'
        )
        if expected not in all_statements:
            raise RuntimeError(f"non-runtime function revocation is missing: {function_identity}")
        if any(
            statement.startswith("GRANT EXECUTE ON FUNCTION ")
            and function_identity in statement
            for statement in all_statements
        ):
            raise RuntimeError(f"non-runtime function remains granted: {function_identity}")
        revocations.append(expected)
    body = ";\n".join(
        (
            definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1),
            *acl,
            execute_definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1),
            *execute_acl,
            supplier_credit_definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1),
            *replay_replacements,
            commercial_persist.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1),
            *commercial_persist_acl,
            *revocations,
        )
    )
    return (
        "-- Generated by backend/scripts/generate_business_gap_security_closure_migration.py.\n"
        "-- Alembic owns the transaction; this file must not be applied directly.\n"
        "SET LOCAL ROLE erp_migration_owner;\n"
        f"{body};\n"
        "RESET ROLE;\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    generated = generate_sql()
    if args.check:
        if not OUTPUT_PATH.is_file() or OUTPUT_PATH.read_text(encoding="utf-8") != generated:
            raise RuntimeError("business-gap security closure migration is stale")
        print("business-gap security closure migration: current")
    else:
        OUTPUT_PATH.write_text(generated, encoding="utf-8")
        print(f"wrote {OUTPUT_PATH.relative_to(REPOSITORY_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
