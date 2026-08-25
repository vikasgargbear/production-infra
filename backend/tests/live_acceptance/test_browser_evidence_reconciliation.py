"""Join desktop evidence to MCP and PostgreSQL by canonical UUID."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

import pytest

from app.domain.operator_actions.contract import (
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)

from .contract import load_ready_operation_matrix
from .mcp_readback import mcp_readback_arguments
from .readback_consistency import assert_canonical_projection_consistency


pytestmark = pytest.mark.integration


MANDATORY_LINEAGE_PATHS = {
    "sales.order.prepare": (
        "customer_account_id", "delivery_address_id", "delivery_address_row_version",
        "lines.0.product_id", "lines.0.uom_conversion_id",
    ),
    "sales.dispatch.prepare": (
        "sales_order_id", "from_location_id", "lines.0.sales_order_line_id",
        "lines.0.batch_allocations.0.batch_id",
    ),
    "sales.invoice.prepare": (
        "customer_account_id", "delivery_address_id", "delivery_address_row_version",
        "lines.0.product_id", "lines.0.uom_conversion_id",
    ),
    "sales.return.prepare": (
        "original_invoice_id", "lines.0.original_invoice_line_id",
        "lines.0.invoice_dispatch_allocation_id", "lines.0.batch_allocation.batch_id",
        "lines.0.to_location_id",
    ),
    "procurement.purchase_order.prepare": (
        "supplier_account_id", "lines.0.product_id", "lines.0.uom_conversion_id",
    ),
    "procurement.goods_receipt.prepare": (
        "purchase_order_id", "supplier_account_id", "lines.0.purchase_order_line_id",
        "lines.0.batches.0.mrp_uom_conversion_id",
        "lines.0.batches.0.to_location_id",
    ),
    "procurement.supplier_invoice.prepare": (
        "supplier_account_id", "supplier_tax_registration_id",
        "portal_document_line_id", "goods_receipt_ids.0",
        "lines.0.goods_receipt_line_id",
    ),
    "procurement.purchase_return.prepare": (
        "original_supplier_invoice_id", "supplier_destination_address_id",
        "lines.0.goods_receipt_line_id",
        "lines.0.supplier_invoice_receipt_allocation_id",
        "lines.0.batch_allocation.batch_id", "lines.0.from_location_id",
    ),
    "finance.customer_receipt.prepare": (
        "customer_account_id", "settlement_account_id", "allocations.0.open_item_id",
    ),
    "finance.supplier_payment.prepare": (
        "supplier_account_id", "settlement_account_id", "allocations.0.open_item_id",
    ),
    "finance.supplier_advance.prepare": (
        "supplier_account_id", "purchase_order_id", "settlement_account_id",
        "allocations.0.purchase_order_line_id",
    ),
    "finance.adjustment_note.prepare": (
        "original_document_id", "lines.0.original_line_id",
    ),
    "finance.bank_reconciliation.prepare": (
        "bank_statement_id", "bank_statement_line_id", "journal_entry_id",
    ),
    "finance.expense_claim.prepare": (
        "reimbursement_account_id", "lines.0.expense_account_id",
        "lines.0.receipt_attachment_id",
    ),
    "inventory.adjustment.prepare": (
        "counted_by_membership_id", "location_id", "evidence_attachment_id",
        "lines.0.product_id", "lines.0.uom_conversion_id",
        "lines.0.batch_counts.0.batch_id",
    ),
    "inventory.transfer.prepare": (
        "source_branch_id", "destination_branch_id", "source_location_id",
        "destination_location_id", "lines.0.product_id",
        "lines.0.uom_conversion_id", "lines.0.batch_allocations.0.batch_id",
    ),
    "inventory.destruction.prepare": (
        "location_id", "certificate_attachment_id", "lines.0.product_id",
        "lines.0.uom_conversion_id", "lines.0.batch_allocations.0.batch_id",
    ),
}


def test_live18_lineage_contract_covers_every_published_prepare_model() -> None:
    assert set(MANDATORY_LINEAGE_PATHS) == set(PREPARE_PAYLOAD_MODELS)


def _find(value: Any, key: str):
    if isinstance(value, dict):
        if key in value:
            return value[key]
        for child in value.values():
            found = _find(child, key)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find(child, key)
            if found is not None:
                return found
    return None


def _preview(evidence: dict[str, Any]) -> dict[str, Any]:
    prepare_path = f"/api/web/actions/{evidence['command_operation']}/prepare"
    candidates = [
        row["responseBody"] for row in evidence["http_evidence"]
        if row["method"] == "POST" and row["path"] == prepare_path
        and 200 <= row["status"] < 300
    ]
    assert len(candidates) == 1, "expected exactly one successful canonical prepare"
    return candidates[0].get("preview", candidates[0])


def _prepare_request(evidence: dict[str, Any]) -> dict[str, Any]:
    prepare_path = f"/api/web/actions/{evidence['command_operation']}/prepare"
    candidates = [
        row.get("requestBody") for row in evidence["http_evidence"]
        if row["method"] == "POST" and row["path"] == prepare_path
        and 200 <= row["status"] < 300
    ]
    assert len(candidates) == 1, "expected exactly one successful canonical prepare request"
    assert isinstance(candidates[0], dict), "canonical prepare omitted its exact request body"
    return candidates[0]


def _path_value(payload: dict[str, Any], path: str) -> Any:
    value: Any = payload
    for part in path.split("."):
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def _validated_prepare_request(evidence: dict[str, Any]) -> dict[str, Any]:
    operation = evidence["command_operation"]
    request = _prepare_request(evidence)
    assert operation in PREPARE_PAYLOAD_MODELS, (
        f"{operation} has no published strict prepare-payload model"
    )
    assert operation in MANDATORY_LINEAGE_PATHS, (
        f"{operation} has no reviewed Live18 lineage contract"
    )
    validated = PREPARE_PAYLOAD_MODELS[operation].model_validate(request)
    validate_prepare_payload_semantics(operation, validated)
    canonical = validated.model_dump(mode="json", exclude_none=True)
    for path in MANDATORY_LINEAGE_PATHS[operation]:
        value = _path_value(canonical, path)
        assert value not in (None, "", []), (
            f"{operation} omitted mandatory canonical lineage at {path}"
        )
    branch_id = canonical.get("branch_id", canonical.get("source_branch_id"))
    assert str(branch_id) == evidence["branch_id"], (
        f"{operation} browser payload branch differs from its evidence envelope"
    )
    return request


def test_preview_ignores_a_prior_missing_required_422() -> None:
    evidence = {
        "command_operation": "sales.invoice.prepare",
        "http_evidence": [
            {
                "method": "POST",
                "path": "/api/web/actions/sales.invoice.prepare/prepare",
                "status": 422,
                "responseBody": {"detail": "missing customer"},
            },
            {
                "method": "POST",
                "path": "/api/web/actions/sales.invoice.prepare/prepare",
                "status": 201,
                "responseBody": {"preview": {"net_amount": "168.00"}},
            },
        ],
    }

    assert _preview(evidence) == {"net_amount": "168.00"}
    assert _prepare_request({
        **evidence,
        "http_evidence": [
            {**evidence["http_evidence"][0], "requestBody": {"missing": True}},
            {**evidence["http_evidence"][1], "requestBody": {"customer_id": "canonical-customer"}},
        ],
    }) == {"customer_id": "canonical-customer"}


def _assert_mcp_identity(
    payload: Any,
    *,
    command_id: str,
    resource_id: str,
    require_command_id: bool = False,
) -> None:
    encoded = json.dumps(payload, sort_keys=True)
    assert resource_id in encoded, "MCP readback omitted the canonical resource UUID"
    discovered_command = _find(payload, "command_request_id")
    if require_command_id:
        assert discovered_command is not None, "MCP command status omitted command_request_id"
    if discovered_command is not None:
        assert str(discovered_command) == command_id


@pytest.mark.skipif(
    os.environ.get("LIVE18_REQUIRED") != "true",
    reason="exact-SHA live18 reconciliation was not requested",
)
@pytest.mark.parametrize(
    "contract",
    load_ready_operation_matrix(),
    ids=lambda contract: contract.id,
)
def test_browser_resource_reconciles_through_mcp_and_postgresql(
    contract,
    canonical_live_config,
    mcp_client,
    reconciler,
    denial_db_query,
) -> None:
    evidence_value = os.environ.get("LIVE18_EVIDENCE_DIR", "").strip()
    assert evidence_value, "LIVE18_EVIDENCE_DIR is required"
    evidence_dir = Path(evidence_value)
    assert contract.availability == "published", contract.id

    expected_sha = os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower()
    assert len(expected_sha) == 40
    evidence_path = evidence_dir / f"{contract.id}.json"
    assert evidence_path.is_file(), f"missing desktop evidence: {evidence_path}"
    evidence = json.loads(evidence_path.read_text())
    assert evidence["operation_id"] == contract.id
    assert evidence["tested_sha"] == expected_sha
    assert evidence["organization_id"] == str(canonical_live_config.test_org_id)
    assert evidence["branch_id"] == str(canonical_live_config.test_branch_id)
    assert evidence["requester_user_id"] != evidence["reviewer_user_id"]
    command_id = str(uuid.UUID(evidence["command_request_id"]))
    resource_id = str(uuid.UUID(evidence["resource_id"]))

    mcp_status = mcp_client.call(
        "erp_operation_status_get", {"command_request_id": command_id}
    )
    _assert_mcp_identity(
        mcp_status,
        command_id=command_id,
        resource_id=resource_id,
        require_command_id=True,
    )
    assert _find(mcp_status, "status") == "succeeded", (
        f"{contract.id} MCP command status is not succeeded"
    )
    declared_tool = contract.mcp_readback_tool
    assert declared_tool and declared_tool != "erp_operation_status_get", (
        f"{contract.id} must use an operation-specific MCP readback"
    )
    declared_readback = mcp_client.call(
        declared_tool,
        mcp_readback_arguments(
            declared_tool,
            branch_id=evidence["branch_id"],
            command_id=command_id,
            resource_id=resource_id,
        ),
    )
    _assert_mcp_identity(
        declared_readback,
        command_id=command_id,
        resource_id=resource_id,
    )
    operation = contract.command_operation.removesuffix(".prepare")
    database = reconciler.reconcile(
        command_id,
        operation,
        resource_id,
        _preview(evidence),
        _validated_prepare_request(evidence),
    )
    assert database, f"{contract.id} produced no database reconciliation evidence"
    assert_canonical_projection_consistency(
        operation,
        rest=evidence["rest_readback"],
        mcp=declared_readback,
        database=database,
    )
    reconciler.assert_cross_tenant_denied(
        operation,
        resource_id,
        denial_db_query,
    )
