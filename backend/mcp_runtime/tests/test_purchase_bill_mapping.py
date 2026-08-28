from __future__ import annotations

from copy import deepcopy

import pytest

from aasopharma_mcp.purchase_bill_mapping import review_purchase_bill_mapping


SUPPLIER_ID = "11111111-1111-4111-8111-111111111111"
PRODUCT_ID = "22222222-2222-4222-8222-222222222222"


def _mapping() -> dict:
    return {
        "review_id": "bill-review-0001",
        "revision": 1,
        "parent_mapping_hash": None,
        "evidence": {
            "source_kind": "image",
            "source_reference": "user attachment 1",
            "supplier_name": "Exact Supplier Text",
            "supplier_gstin": "07ABCDE1234F1Z5",
            "invoice_number": "INV/44",
            "invoice_date": "2026-08-28",
            "additional_document_fields": [
                {"label": "Taxable value", "value": "800.00", "uncertain": False},
                {"label": "CGST", "value": "48.00", "uncertain": False},
                {"label": "SGST", "value": "48.00", "uncertain": False},
                {"label": "Round off", "value": "0.00", "uncertain": False},
                {"label": "Invoice total", "value": "896.00", "uncertain": False},
            ],
        },
        "supplier_resolution": {
            "status": "matched",
            "supplier_id": SUPPLIER_ID,
            "canonical_name": "Exact Supplier Pvt Ltd",
            "proposed_supplier_name": None,
            "candidate_supplier_ids": [],
            "skip_reason": None,
        },
        "lines": [
            {
                "line_id": "line-1",
                "source_fields": {
                    "description": "MEDICINE 500 1*10",
                    "pack": "1*10",
                    "batch": "B-100",
                    "expiry": "08/28",
                    "mrp": "125.00",
                    "quantity": "10",
                    "free_quantity": "1",
                    "rate": "80.00",
                    "discount": "5%",
                    "hsn": "30049099",
                    "tax": "12%",
                },
                "uncertain_fields": [],
                "product_resolution": {
                    "status": "matched",
                    "product_id": PRODUCT_ID,
                    "canonical_name": "Medicine 500",
                    "candidate_product_ids": [],
                    "proposed_product": None,
                    "skip_reason": None,
                },
            }
        ],
        "unresolved_fields": [],
        "skipped_fields": [],
        "explicit_skip_permission": False,
    }


def test_review_preserves_exact_evidence_and_only_opens_canonical_validation() -> None:
    mapping = _mapping()

    result = review_purchase_bill_mapping(mapping)

    assert result["contract"] == "aasopharma.purchase_bill_mapping.v1"
    assert result["status"] == "ready_for_canonical_prepare_validation"
    assert result["mapping"] == mapping
    assert result["mapping"] is not mapping
    assert result["mapping"]["lines"][0]["source_fields"]["pack"] == "1*10"
    assert result["mapping"]["lines"][0]["source_fields"]["tax"] == "12%"
    assert result["mapping"]["evidence"]["additional_document_fields"][-1] == {
        "label": "Invoice total",
        "value": "896.00",
        "uncertain": False,
    }
    assert result["next_steps"][0] == {
        "sequence": 1,
        "tool": "erp_purchase_order_prepare",
        "state": "awaiting_canonical_validation",
        "blockers": [],
    }
    assert result["next_steps"][1]["blockers"] == ["requires_executed_purchase_order"]
    assert result["next_steps"][2]["blockers"] == ["requires_executed_goods_receipt"]
    assert result["posting_performed"] is False
    assert result["canonical_ids_resolved_by_this_tool"] is False


def test_review_is_resumable_with_stable_hash_and_full_state() -> None:
    first = review_purchase_bill_mapping(_mapping())
    second_mapping = deepcopy(first["mapping"])
    second_mapping["revision"] = first["resume"]["next_revision"]
    second_mapping["parent_mapping_hash"] = first["mapping_hash"]
    second = review_purchase_bill_mapping(second_mapping)

    assert first["mapping_hash"].startswith("sha256:")
    assert review_purchase_bill_mapping(_mapping())["mapping_hash"] == first["mapping_hash"]
    assert second["mapping_hash"] != first["mapping_hash"]
    assert second["mapping"]["parent_mapping_hash"] == first["mapping_hash"]


def test_unresolved_and_proposed_products_remain_visible_and_blocked() -> None:
    mapping = _mapping()
    mapping["lines"][0]["uncertain_fields"] = ["batch"]
    mapping["lines"][0]["product_resolution"] = {
        "status": "proposed_new",
        "product_id": None,
        "canonical_name": None,
        "candidate_product_ids": [],
        "proposed_product": {
            "product_name": "Medicine 500",
            "product_kind": "medicine",
            "generic_name": None,
            "observed_pack": "1*10",
        },
        "skip_reason": None,
    }
    mapping["unresolved_fields"] = [
        {
            "path": "lines.line-1.source_fields.batch",
            "reason": "The batch text is illegible.",
            "required_for": ["goods_receipt", "supplier_invoice"],
        }
    ]

    result = review_purchase_bill_mapping(mapping)

    assert result["status"] == "needs_context"
    assert result["mapping"]["unresolved_fields"] == mapping["unresolved_fields"]
    assert result["next_steps"][0]["state"] == "blocked"
    assert "product_proposed_new:line-1" in result["next_steps"][0]["blockers"]
    assert "unresolved_fields:lines.line-1.source_fields.batch" in result["next_steps"][1]["blockers"]


def test_proposed_master_data_is_not_reported_as_transaction_ready() -> None:
    mapping = _mapping()
    mapping["supplier_resolution"] = {
        "status": "proposed_new",
        "supplier_id": None,
        "canonical_name": None,
        "proposed_supplier_name": "Exact Supplier Text",
        "candidate_supplier_ids": [],
        "skip_reason": None,
    }

    result = review_purchase_bill_mapping(mapping)

    assert result["status"] == "needs_master_data"
    assert result["next_steps"][0]["state"] == "blocked"
    assert result["next_steps"][0]["blockers"] == ["supplier_proposed_new"]


def test_skip_requires_explicit_permission_and_reason() -> None:
    mapping = _mapping()
    mapping["lines"][0]["product_resolution"] = {
        "status": "skipped",
        "product_id": None,
        "canonical_name": None,
        "candidate_product_ids": [],
        "proposed_product": None,
        "skip_reason": "User chose to exclude the illegible line.",
    }

    with pytest.raises(ValueError, match="explicit skip permission"):
        review_purchase_bill_mapping(mapping)

    mapping["explicit_skip_permission"] = True
    result = review_purchase_bill_mapping(mapping)
    assert result["status"] == "needs_context"
    assert "line_skipped:line-1" in result["next_steps"][0]["blockers"]


def test_skipping_a_required_field_never_bypasses_the_command_gate() -> None:
    mapping = _mapping()
    mapping["explicit_skip_permission"] = True
    mapping["skipped_fields"] = [
        {
            "path": "lines.line-1.source_fields.quantity",
            "reason": "User permitted this unreadable fact to remain unresolved.",
            "required_for": ["purchase_order", "goods_receipt", "supplier_invoice"],
        }
    ]

    result = review_purchase_bill_mapping(mapping)

    assert result["next_steps"][0]["state"] == "blocked"
    assert (
        "skipped_fields:lines.line-1.source_fields.quantity"
        in result["next_steps"][0]["blockers"]
    )


def test_semantic_identity_and_line_uniqueness_are_fail_closed() -> None:
    missing_id = _mapping()
    missing_id["supplier_resolution"]["supplier_id"] = None
    with pytest.raises(ValueError, match="supplier_id is required"):
        review_purchase_bill_mapping(missing_id)

    duplicate_line = _mapping()
    duplicate_line["lines"].append(deepcopy(duplicate_line["lines"][0]))
    with pytest.raises(ValueError, match="duplicates line-1"):
        review_purchase_bill_mapping(duplicate_line)


def test_contract_rejects_unknown_fields_and_invalid_dates() -> None:
    unknown = _mapping()
    unknown["guessed_tax"] = "12%"
    with pytest.raises(ValueError, match="Additional properties"):
        review_purchase_bill_mapping(unknown)

    invalid_date = _mapping()
    invalid_date["evidence"]["invoice_date"] = "28/08/2026"
    with pytest.raises(ValueError, match="not a 'date'"):
        review_purchase_bill_mapping(invalid_date)
