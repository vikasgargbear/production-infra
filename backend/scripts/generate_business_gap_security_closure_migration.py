#!/usr/bin/env python3
"""Verify the frozen, reviewed business-gap security migration 0044.

Revision 0044 is immutable Alembic history. Current canonical command sources
may evolve only through later revisions, so this verifier reads and hash-checks
the frozen SQL instead of regenerating history from HEAD.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = REPOSITORY_ROOT / "backend/alembic/sql/20260828_0044_business_gap_security_closure.sql"
EXPECTED_SQL_SHA256 = "7e696c6d5cba70d3d472f2f967386acbc875def52d65ec1b16ce83b51b0f3026"
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
    sql = OUTPUT_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("frozen business-gap security migration hash mismatch")
    return sql


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    generate_sql()
    message = (
        "business-gap security migration is frozen; verified without rewriting"
        if args.write
        else "business-gap security closure migration: current"
    )
    print(message)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
