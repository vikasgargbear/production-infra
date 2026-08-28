from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.live_acceptance.live23_variants import (
    EXPECTED_VARIANTS,
    Live23VariantError,
    compile_ready_variant,
    compile_supported_business_variants,
    derive_customer_cheque_receipt_choices,
    derive_final_return_choices,
    load_variant_registry,
    load_supported_business_registry,
    SUPPORTED_BUSINESS_VARIANTS,
)


ROOT = Path(__file__).resolve().parents[3]
LIVE18_BASE_SCENARIOS = {
    "sales_invoice_mixed",
    "sales_order_mixed",
    "sales_dispatch_mixed",
    "purchase_order_mixed",
    "supplier_advance_no_withholding",
    "goods_receipt_mixed",
    "supplier_invoice_mixed",
    "customer_receipt_partial",
    "supplier_payment_balance_no_withholding",
    "sales_return_partial",
    "purchase_return_partial",
    "inventory_adjustment_cycle_count_loss",
    "inventory_transfer_inter_branch_fefo",
    "inventory_destruction_certified_full_balance",
    "standalone_sales_credit_note",
    "standalone_purchase_debit_note",
    "bank_reconciliation_exact_full_match",
    "member_expense_verified_receipt",
}


def _scalars() -> dict[str, str]:
    return {
        "sales_invoice_quantity": "12.000000",
        "sales_invoice_free_quantity": "2.000000",
        "sales_invoice_rate": "100.0000",
        "sales_invoice_discount_percent": "0.000000",
        "sales_invoice_free_supply_tax_treatment": "excluded_from_taxable_value",
        "sales_invoice_distance_km": "8.50",
        "sales_return_billed_quantity": "4.000000",
        "sales_return_free_quantity": "1.000000",
        "sales_return_condition": "damaged",
        "sales_return_reason_label": "Damaged Goods",
        "sales_return_gst_treatment_label": "Tax reversal",
        "goods_receipt_accepted_quantity": "50.000000",
        "goods_receipt_free_quantity": "2.500000",
        "purchase_return_billed_quantity": "10.000000",
        "purchase_return_free_quantity": "0.500000",
        "purchase_return_reason_label": "Damaged Goods",
        "purchase_return_gst_treatment_label": "Tax reversal",
        "purchase_return_transport_mode_label": "Road",
        "purchase_return_distance_km": "12.50",
        "customer_receipt_amount": "168.00",
    }


def _facts() -> dict[str, object]:
    return {
        "identity": {
            "branch_id": "d3000000-0000-7000-8000-000000000010",
            "customer_account_id": "d3000000-0000-7000-8000-000000000011",
            "supplier_account_id": "d3000000-0000-7000-8000-000000000012",
            "supplier_destination_address_id": "d3000000-0000-7000-8000-00000000001a",
            "quarantine_location_id": "d3000000-0000-7000-8000-000000000013",
            "interstate_customer_account_id": "d3000000-0000-7000-8000-000000000014",
            "interstate_delivery_address_id": "d3000000-0000-7000-8000-000000000015",
            "interstate_delivery_address_row_version": "1",
            "sez_customer_account_id": "d3000000-0000-7000-8000-000000000016",
            "sez_delivery_address_id": "d3000000-0000-7000-8000-000000000017",
            "sez_delivery_address_row_version": "1",
            "product_id": "d3000000-0000-7000-8000-000000000018",
            "direct_issue_batch_id": "d3000000-0000-7000-8000-000000000019",
            "customer_receipt_evidence_attachment_id": "d3000000-0000-7000-8000-000000000020",
            "bank_account_id": "d3000000-0000-7000-8000-000000000021",
        },
        "clock": {"business_date": "2026-08-28"},
        "display": {
            "customer_code": "LIVE23-CUSTOMER",
            "supplier_code": "LIVE23-SUPPLIER",
            "product_name": "Reviewed Product",
            "product_code": "REVIEWED-PRODUCT",
            "interstate_customer_code": "LIVE23-INTER-1-1",
            "interstate_customer_name": "Reviewed Interstate Customer",
            "sez_customer_code": "LIVE23-SEZ-1-1",
            "sez_customer_name": "Reviewed SEZ Customer",
        },
    }


def test_registry_accounts_for_exactly_the_five_non_live18_scenarios() -> None:
    operation_matrix = json.loads(
        (ROOT / "backend/tests/live_acceptance/operation_matrix.json").read_text()
    )
    advertised = {
        scenario
        for operation in operation_matrix["operations"]
        for scenario in operation["scenario_steps"]
    }
    assert len(LIVE18_BASE_SCENARIOS) == 18
    assert advertised - LIVE18_BASE_SCENARIOS == EXPECTED_VARIANTS
    assert {row["id"] for row in load_variant_registry()} == EXPECTED_VARIANTS


def test_required_live23_gate_fails_closed_until_all_variants_are_ready() -> None:
    with pytest.raises(
        Live23VariantError,
        match=r"LIVE23_VARIANTS_INCOMPLETE: 4/5 variants are browser-ready",
    ):
        load_variant_registry(require_all_ready=True)


def test_blocked_variants_name_exact_missing_authority() -> None:
    rows = {row["id"]: row for row in load_variant_registry()}
    assert rows["sales_invoice_inter"]["status"] == "ready"
    assert rows["sales_invoice_sez_with_igst"]["status"] == "ready"
    commercial = rows["sales_return_commercial_only"]
    assert commercial["depends_on_scenarios"] == ["sales_invoice_inter"]
    assert commercial["blocker"]["code"] == "COMMERCIAL_RETURN_RULE_AUTHORITY_MISSING"
    adjustment_source = (
        ROOT / "backend/scripts/provision_canonical_demo.py"
    ).read_text(encoding="utf-8")
    adjustment_dataset = adjustment_source.split(
        "def adjustment_dataset_bytes", 1
    )[1].split("def demo_adjustment_release_exists", 1)[0]
    assert '"tax_effect": "commercial_only"' not in adjustment_dataset
    assert adjustment_dataset.count('"tax_effect": "statutory"') == 2


def test_final_return_quantities_are_derived_from_source_less_partial() -> None:
    choices = derive_final_return_choices(_scalars())
    assert choices == {
        "sales_return_final_billed_quantity": "8.000000",
        "sales_return_final_free_quantity": "1.000000",
        "purchase_return_final_billed_quantity": "40.000000",
        "purchase_return_final_free_quantity": "2.000000",
    }


@pytest.mark.parametrize(
    ("key", "value", "message"),
    [
        ("sales_return_billed_quantity", "12.000001", "exceeds"),
        ("purchase_return_free_quantity", "2.500001", "exceeds"),
        ("sales_return_billed_quantity", "12.000000", "no positive residual"),
    ],
)
def test_final_return_derivation_rejects_impossible_or_empty_residuals(
    key: str,
    value: str,
    message: str,
) -> None:
    scalars = _scalars()
    scalars[key] = value
    if key == "sales_return_billed_quantity" and value == "12.000000":
        scalars["sales_return_free_quantity"] = "2.000000"
    with pytest.raises(Live23VariantError, match=message):
        derive_final_return_choices(scalars)


@pytest.mark.parametrize(
    ("scenario_id", "resource_token", "billed", "free"),
    [
        ("sales_return_final", "{{resource_sales_invoice}}", "8.000000", "1.000000"),
        ("purchase_return_final", "{{resource_supplier_invoice}}", "40.000000", "2.000000"),
    ],
)
def test_ready_variants_compile_as_exact_ui_driven_residual_writes(
    scenario_id: str,
    resource_token: str,
    billed: str,
    free: str,
) -> None:
    operation = compile_ready_variant(scenario_id, _facts(), _scalars())
    serialized = json.dumps(operation)
    assert resource_token in serialized
    assert billed in serialized
    assert free in serialized
    assert serialized.count("Prepare Immutable Return") == 1
    assert "{{command_request_id}}" in serialized
    assert "{{preview_hash}}" not in serialized


def test_final_variants_are_ordered_immediately_after_their_partial_return() -> None:
    rows = {row["id"]: row for row in load_variant_registry()}
    assert rows["sales_return_final"]["depends_on_scenarios"] == [
        "sales_invoice_mixed",
        "sales_return_partial",
    ]
    assert rows["purchase_return_final"]["depends_on_scenarios"] == [
        "supplier_invoice_mixed",
        "purchase_return_partial",
    ]


@pytest.mark.parametrize(
    ("scenario_id", "customer_code", "address_id", "mode"),
    [
        (
            "sales_invoice_inter",
            "LIVE23-INTER-1-1",
            "d3000000-0000-7000-8000-000000000015",
            "not_applicable",
        ),
        (
            "sales_invoice_sez_with_igst",
            "LIVE23-SEZ-1-1",
            "d3000000-0000-7000-8000-000000000017",
            "with_igst",
        ),
    ],
)
def test_invoice_variants_compile_only_canonical_customer_and_policy_choices(
    scenario_id: str,
    customer_code: str,
    address_id: str,
    mode: str,
) -> None:
    operation = compile_ready_variant(scenario_id, _facts(), _scalars())
    serialized = json.dumps(operation)
    assert customer_code in serialized
    assert address_id in serialized
    assert f'"value": "{mode}"' in serialized
    assert serialized.count("Generate Invoice") == 1
    assert "{{command_request_id}}" in serialized


def test_supported_business_registry_is_exact_ordered_and_dependency_bound() -> None:
    rows = load_supported_business_registry()
    assert tuple(row["id"] for row in rows) == SUPPORTED_BUSINESS_VARIANTS
    assert rows[0]["depends_on_resources"] == ["sales_order"]
    assert rows[1]["depends_on_resources"] == [
        "customer_receipt_cheque_clearance"
    ]
    assert rows[3]["depends_on_resources"] == [
        "customer_receipt_cheque_bounce"
    ]
    assert rows[2]["depends_on_resources"] == ["sales_order"]
    assert [row["schedule_after_operation"] for row in rows] == [
        "sales_order", "sales_order", "sales_order", "sales_order",
        "sales_return", "purchase_return", "customer_credit_note",
    ]
    assert rows[4]["depends_on_resources"] == ["sales_return"]
    assert rows[5]["depends_on_resources"] == ["purchase_return"]
    assert rows[6]["depends_on_resources"] == ["customer_credit_note"]


def test_supported_business_variants_compile_to_visible_exact_resource_chains() -> None:
    operations = compile_supported_business_variants(_facts(), _scalars())
    assert tuple(operations) == SUPPORTED_BUSINESS_VARIANTS
    assert "{{resource_sales_order}}" in json.dumps(
        operations["customer_receipt_cheque_clearance"]
    )
    assert "{{resource_sales_order}}" in json.dumps(
        operations["customer_receipt_cheque_bounce"]
    )
    assert '"value": "84.00"' in json.dumps(
        operations["customer_receipt_cheque_clearance"]
    )
    assert '"value": "84.00"' in json.dumps(
        operations["customer_receipt_cheque_bounce"]
    )
    clearance = json.dumps(operations["customer_cheque_clearance"])
    bounce = json.dumps(operations["customer_cheque_bounce"])
    assert "{{resource_customer_receipt_cheque_clearance}}" in clearance
    assert "{{resource_customer_receipt_cheque_bounce}}" in bounce
    assert "finance.customer_cheque_clearance.post" in clearance
    assert "finance.customer_cheque_bounce.post" in bounce
    for scenario_id, resource in (
        ("sales_return_reversal", "{{resource_sales_return}}"),
        ("purchase_return_reversal", "{{resource_purchase_return}}"),
        ("adjustment_note_reversal", "{{resource_customer_credit_note}}"),
    ):
        serialized = json.dumps(operations[scenario_id])
        assert resource in serialized
        assert "Approve as distinct reviewer" in serialized
        assert "Execute as requester" in serialized


def test_customer_cheque_receipts_split_the_reviewed_ceiling_exactly() -> None:
    assert derive_customer_cheque_receipt_choices(
        {"customer_receipt_amount": "168.01"}
    ) == {
        "customer_receipt_cheque_clearance_amount": "84.00",
        "customer_receipt_cheque_bounce_amount": "84.01",
    }
    with pytest.raises(
        Live23VariantError, match="must fund two positive cheque receipts"
    ):
        derive_customer_cheque_receipt_choices(
            {"customer_receipt_amount": "0.01"}
        )
