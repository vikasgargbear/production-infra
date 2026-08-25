from __future__ import annotations

import inspect
import json
from datetime import date, datetime, timezone
from uuid import uuid4

from app.api.routes import canonical_controlled_operation_reads as reads
from app.main import app


def test_controlled_desktop_context_routes_are_typed_and_mounted() -> None:
    schema = app.openapi()
    bank_operation = schema["paths"]["/api/canonical/bank-reconciliation/context"]["get"]
    destruction_operation = schema["paths"]["/api/canonical/inventory-destruction/context"]["get"]
    assert bank_operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/BankReconciliationContext"
    }
    assert destruction_operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/InventoryDestructionContext"
    }
    assert bank_operation["security"] == [{"HTTPBearer": []}]
    assert destruction_operation["security"] == [{"HTTPBearer": []}]


def test_bank_candidate_projection_matches_the_command_resolver_boundary() -> None:
    source = inspect.getsource(reads.bank_reconciliation_context)
    for fragment in (
        "finance.bank_statements", "finance.bank_statement_lines",
        "finance.journal_entries", "finance.journal_lines",
        "bank_ledger.allows_bank_reconciliation",
        "statement.status IN ('imported','reconciling')",
        "journal.posting_date=statement_line.transaction_date",
        "statement_line.amount", "erp_security.can_access_branch",
        "finance.reconciliation_matches", "reversal.reversal_of_match_id=matched.id",
    ):
        assert fragment in source
    assert "financial." not in source
    assert "master." not in source


def test_destruction_projection_is_evidence_and_full_balance_only() -> None:
    source = inspect.getsource(reads.inventory_destruction_context)
    for fragment in (
        "core.attachments", "inventory_destruction_certificate",
        "attachment.status IN ('verified','retained')",
        "attachment.document_date=:business_date", "tax.registrations",
        "inventory.stock_balances",
        "location.location_type IN ('quarantine','damaged')",
        "NOT location.allows_sale", "NOT product.cold_chain_required",
        "product.drug_schedule", "product.ndps_regulated",
        "compliance.recall_batches", "pending.status IN ('draft','submitted','approved')",
        "inventory_destruction_loss",
    ):
        assert fragment in source
    assert "legacy" not in source.lower()


def test_exact_wire_models_keep_fail_closed_flags_and_decimal_strings() -> None:
    context = reads.InventoryDestructionContext(
        organization_id=uuid4(), organization_timezone="Asia/Kolkata",
        business_date=date(2026, 8, 25),
        as_of=datetime(2026, 8, 25, 12, tzinfo=timezone.utc), ready=False,
        blocking_reasons=["No evidence"], certificate_upload_available=False,
        certificate_upload_message="Unavailable", certificates=[], candidates=[],
    )
    wire = json.loads(context.model_dump_json())
    assert wire["certificate_upload_available"] is False
    candidate = reads.BankReconciliationCandidate(
        branch_id=uuid4(), branch_code="MAIN", branch_name="Main",
        bank_account_id=uuid4(), bank_name="Bank", bank_account_name="Current",
        bank_statement_id=uuid4(), statement_reference="STMT-1",
        bank_statement_line_id=uuid4(), statement_line_number=1,
        transaction_date=date(2026, 8, 25), statement_direction="credit",
        matched_amount="168.00", bank_reference="JRN-1",
        statement_description="Settlement", journal_entry_id=uuid4(),
        journal_number="JRN-1", journal_description="Receipt",
        match_methods=["reference_exact", "manual"],
    )
    assert json.loads(candidate.model_dump_json())["matched_amount"] == "168.00"
