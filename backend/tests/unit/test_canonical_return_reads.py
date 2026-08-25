from __future__ import annotations

import inspect
from pathlib import Path
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.api.routes import canonical_return_reads, web_operator_actions
from app.api.routes.canonical_return_reads import (
    PostedReturnReadback,
    PurchaseReturnableAllocation,
    ReturnReasonChoice,
    ReturnCommandSummary,
    SalesReturnableAllocation,
)


def uid(index: int) -> UUID:
    return UUID(f"d3000000-0000-7000-8000-{index:012d}")


def sales_line() -> dict:
    return {
        "original_invoice_line_id": uid(1),
        "invoice_dispatch_allocation_id": uid(2),
        "dispatch_id": uid(3),
        "dispatch_line_id": uid(4),
        "product_id": uid(5),
        "product_name": "Exact product",
        "sku": "EXACT-1",
        "batch_id": uid(6),
        "batch_number": "B-1",
        "expires_on": date(2027, 8, 25),
        "uom_code": "BOX",
        "uom_conversion_factor": Decimal("10.000001"),
        "allocated_base_billed_quantity": Decimal("21.234562123456"),
        "allocated_base_free_quantity": Decimal("0.000010000001"),
        "returned_base_billed_quantity": Decimal("0"),
        "returned_base_free_quantity": Decimal("0"),
        "remaining_base_billed_quantity": Decimal("21.234562123456"),
        "remaining_base_free_quantity": Decimal("0.000010000001"),
        "returnable_billed_quantity": Decimal("2.123456"),
        "returnable_free_quantity": Decimal("0.000001"),
        "quoted_unit_rate": Decimal("99.123456"),
        "cgst_rate": Decimal("6"),
        "sgst_rate": Decimal("6"),
        "igst_rate": Decimal("0"),
        "cess_rate": Decimal("0"),
        "hsn_code": "481910",
    }


def purchase_line() -> dict:
    value = sales_line()
    for key in (
        "original_invoice_line_id",
        "invoice_dispatch_allocation_id",
        "dispatch_id",
        "dispatch_line_id",
    ):
        value.pop(key)
    value.update(
        {
            "supplier_invoice_line_id": uid(7),
            "supplier_invoice_receipt_allocation_id": uid(8),
            "goods_receipt_id": uid(9),
            "goods_receipt_line_id": uid(10),
            "from_location_id": uid(11),
            "from_location_code": "MAIN",
            "from_location_name": "Main",
            "from_location_type": "saleable",
            "stock_on_hand_base_quantity": Decimal("22"),
            "average_unit_cost": Decimal("80.123456"),
        }
    )
    return value


def posted() -> dict:
    return {
        "return_id": uid(20),
        "return_number": "SR-1",
        "return_date": date(2026, 8, 25),
        "status": "posted",
        "source_document_id": uid(21),
        "branch_id": uid(22),
        "party_account_id": uid(23),
        "gst_tax_treatment": "statutory",
        "net_value_total": Decimal("100"),
        "gst_taxable_total": Decimal("100"),
        "cgst_total": Decimal("6"),
        "sgst_total": Decimal("6"),
        "igst_total": Decimal("0"),
        "cess_total": Decimal("0"),
        "rounding_adjustment": Decimal("0"),
        "grand_total": Decimal("112"),
        "adjustment_note_id": uid(24),
        "adjustment_note_number": "CN-1",
        "adjustment_note_total": Decimal("112"),
        "tax_document_id": uid(25),
        "tax_document_total": Decimal("112"),
        "inventory_document_id": uid(26),
        "inventory_direction": "receipt",
        "inventory_total_base_quantity": Decimal("2"),
        "inventory_total_value": Decimal("80"),
        "journal_entry_id": uid(27),
        "journal_debit_total": Decimal("192"),
        "journal_credit_total": Decimal("192"),
        "journal_line_debit_total": Decimal("192"),
        "journal_line_credit_total": Decimal("192"),
        "residual_open_item_amount": Decimal("12"),
        "lines": [{
            "return_line_id": uid(28),
            "source_line_id": uid(29),
            "source_allocation_id": uid(30),
            "product_id": uid(31),
            "batch_id": uid(32),
            "location_id": uid(33),
            "billed_quantity": Decimal("2"),
            "free_quantity": Decimal("0"),
            "base_billed_quantity": Decimal("2"),
            "base_free_quantity": Decimal("0"),
            "net_value_amount": Decimal("100"),
            "gst_taxable_value": Decimal("100"),
            "cgst_amount": Decimal("6"),
            "sgst_amount": Decimal("6"),
            "igst_amount": Decimal("0"),
            "cess_amount": Decimal("0"),
            "line_total": Decimal("112"),
            "inventory_document_line_id": uid(34),
            "inventory_base_quantity": Decimal("2"),
            "inventory_extended_cost": Decimal("80"),
            "stock_ledger_entry_id": uid(35),
            "stock_quantity_delta": Decimal("2"),
            "stock_value_delta": Decimal("80"),
        }],
        "allocations": [{
            "allocation_id": uid(36),
            "open_item_id": uid(37),
            "amount": Decimal("100"),
        }],
    }


def test_exact_sales_and_purchase_remainders_reconcile():
    assert SalesReturnableAllocation.model_validate(sales_line()).returnable_billed_quantity == Decimal("2.123456")
    assert PurchaseReturnableAllocation.model_validate(purchase_line()).average_unit_cost == Decimal("80.123456")


def test_projection_rejects_non_reconciling_quantity():
    value = purchase_line()
    value["remaining_base_billed_quantity"] += Decimal("0.000001")
    with pytest.raises(ValidationError, match="do not reconcile"):
        PurchaseReturnableAllocation.model_validate(value)


def test_return_reason_choice_rejects_empty_duplicate_or_unknown_treatments():
    assert ReturnReasonChoice.model_validate({
        "reason_code": "damage",
        "supported_gst_treatments": ["commercial_only", "statutory"],
    }).reason_code == "damage"
    with pytest.raises(ValidationError, match="no executable GST treatment"):
        ReturnReasonChoice.model_validate({
            "reason_code": "damage",
            "supported_gst_treatments": [],
        })
    with pytest.raises(ValidationError, match="repeats a GST treatment"):
        ReturnReasonChoice.model_validate({
            "reason_code": "damage",
            "supported_gst_treatments": ["commercial_only", "commercial_only"],
        })
    with pytest.raises(ValidationError):
        ReturnReasonChoice.model_validate({
            "reason_code": "damage",
            "supported_gst_treatments": ["invented"],
        })


def test_effective_return_reason_choices_are_rule_and_evidence_derived(monkeypatch):
    observed = {}

    def fake_rows(_db, sql, params):
        observed.update({"sql": sql, "params": params})
        return [{
            "reason_code": "wrong_supply",
            "supported_gst_treatments": ["commercial_only"],
        }]

    monkeypatch.setattr(canonical_return_reads, "_rows", fake_rows)
    choices = canonical_return_reads._effective_return_reason_choices(
        object(),
        return_date=date(2026, 8, 25),
        side="purchase",
        statutory_evidence_available=False,
    )
    assert choices[0].reason_code == "wrong_supply"
    assert observed["params"] == {
        "side": "purchase",
        "direction": "debit",
        "return_date": date(2026, 8, 25),
        "statutory_evidence_available": False,
    }
    assert "tax.gst_adjustment_rule_versions" in observed["sql"]
    assert "release.status='active'" in observed["sql"]
    assert "HAVING count(*)=1" in observed["sql"]
    assert ":statutory_evidence_available" in observed["sql"]


def test_core_return_contexts_do_not_use_legacy_reason_metadata_or_defaults():
    source = inspect.getsource(canonical_return_reads)
    sales = inspect.getsource(canonical_return_reads.sales_return_context)
    purchase = inspect.getsource(canonical_return_reads.purchase_return_context)
    assert "metadata" not in source.lower()
    assert 'treatments = ["commercial_only"]' not in source
    assert "_effective_return_reason_choices" in sales
    assert "_effective_return_reason_choices" in purchase


def test_posted_readback_reconciles_inventory_tax_journal_and_open_item():
    assert PostedReturnReadback.model_validate(posted()).grand_total == Decimal("112")


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (("journal_credit_total",), Decimal("191"), "journal header"),
        (("lines", 0, "stock_value_delta"), Decimal("79"), "stock ledger"),
        (("residual_open_item_amount",), Decimal("11"), "open-item effects"),
    ],
)
def test_posted_readback_rejects_cross_system_drift(path, value, message):
    payload = deepcopy(posted())
    target = payload
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    with pytest.raises(ValidationError, match=message):
        PostedReturnReadback.model_validate(payload)


def test_source_projection_names_exact_lineage_and_no_legacy_routes():
    source = inspect.getsource(canonical_return_reads)
    for required in (
        "sales.invoice_dispatch_allocations",
        "procurement.supplier_invoice_receipt_allocations",
        "inventory.stock_ledger_entries",
        "tax.portal_document_lines",
        "finance.adjustment_notes",
        "finance.journal_entries",
        "finance.open_items",
    ):
        assert required in source
    assert "/api/purchases/" not in source
    assert "localStorage" not in source


def test_return_http_contract_exposes_source_review_and_posted_readback():
    contracts = {
        (route.path, tuple(sorted(route.methods or ())))
        for route in canonical_return_reads.router.routes
    }
    assert (
        "/canonical/returns/sales-invoices/{invoice_id}/context",
        ("GET",),
    ) in contracts
    assert (
        "/canonical/returns/supplier-invoices/{invoice_id}/context",
        ("GET",),
    ) in contracts
    assert ("/canonical/returns/sales/{return_id}", ("GET",)) in contracts
    assert ("/canonical/returns/purchases/{return_id}", ("GET",)) in contracts
    assert (
        "/canonical/returns/commands/{command_request_id}/review",
        ("GET",),
    ) in contracts
    assert ("/canonical/returns/approval-inbox", ("GET",)) in contracts
    assert ("/canonical/returns/requester-inbox", ("GET",)) in contracts
    assert (
        "/canonical/returns/requester/commands/{command_request_id}",
        ("GET",),
    ) in contracts


def test_independent_return_review_and_web_context_forbid_self_approval():
    review = inspect.getsource(canonical_return_reads.return_command_review)
    context = inspect.getsource(web_operator_actions._resolve_context)
    assert "requested_by_membership_id<>:membership_id" in review
    assert "approval_policy='separate_approver'" in review
    assert "operation_key == \"automation.command.approve\"" in context
    assert "command.requested_by_membership_id<>membership.id" in context
    invariant = (
        Path(__file__).parents[3]
        / "database/canonical/invariants_agent/baseline-invariants-agent-enforcements.json"
    ).read_text()
    assert "NEW.approver_membership_id = request_row.requested_by_membership_id" in invariant
    assert "separate approval requires a distinct approver" in invariant


def test_approval_inbox_denies_self_cross_org_and_cross_branch_visibility():
    source = inspect.getsource(canonical_return_reads.return_approval_inbox)
    assert "command.org_id=:org_id" in source
    assert "command.requested_by_membership_id<>:membership_id" in source
    assert "reviewer_grant.subject_membership_id=:membership_id" in source
    assert "reviewer_grant.branch_id=command.branch_id" in source
    assert "SELECT count(*)" in source
    assert "access_grant.scope_kind='organization'" in source
    assert "permission.code='automation.command.approve'" in source


def test_reviewer_detail_excludes_approved_expired_and_rejected_commands():
    source = inspect.getsource(canonical_return_reads.return_command_review)
    assert "command.status IN ('prepared','pending_approval')" in source
    assert "command.expires_at>transaction_timestamp()" in source
    assert "'approved'" not in source.split("command.status IN", 1)[1].split(")", 1)[0]
    assert "'rejected'" not in source


def test_requester_effective_status_surfaces_expiry_without_mutating_command():
    value = {
        "status": "approved",
        "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
    }
    assert canonical_return_reads._return_command_status(value) == "expired"
    value["expires_at"] = datetime.now(timezone.utc) + timedelta(minutes=5)
    assert canonical_return_reads._return_command_status(value) == "approved"
    value["status"] = "rejected"
    assert canonical_return_reads._return_command_status(value) == "rejected"


def test_requester_command_query_is_tenant_and_requester_bound():
    source = inspect.getsource(canonical_return_reads.requester_return_command)
    assert "command.org_id=:org_id" in source
    assert "command.requested_by_membership_id=:membership_id" in source
    assert "command.id=:command_request_id" in source


def test_return_command_api_schema_rejects_coerced_and_extra_fields():
    value = {
        "command_request_id": uid(50),
        "command_type": "sales.return.post",
        "return_kind": "sales",
        "status": "approved",
        "branch_id": uid(51),
        "requested_by_membership_id": uid(52),
        "requester_name": "Requester",
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "approved_at": datetime.now(timezone.utc),
        "executed_at": None,
        "resource_type": None,
        "resource_id": None,
        "failure_code": None,
        "failure_message": None,
    }
    assert ReturnCommandSummary.model_validate(value).status == "approved"
    with pytest.raises(ValidationError):
        ReturnCommandSummary.model_validate({**value, "branch_id": str(uid(51))})
    with pytest.raises(ValidationError):
        ReturnCommandSummary.model_validate({**value, "invented": True})
