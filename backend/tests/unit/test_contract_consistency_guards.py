import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.services.document_number_service import (
    CanonicalDocumentCommandRequired,
    DOCUMENT_CONFIGS,
    DocumentNumberService,
)
from app.api.services.inventory.inventory_service import InventoryService
from app.main import app
from app.core.auth import org_context
from app.core.auth.org_context import BranchScope
from app.core.auth.tenant_service import TenantContext, TenantQueryBuilder
from app.core.utils.constants import (
    GRNStatus,
    InvoiceStatus,
    OrderStatus,
    POStatus,
    ReturnStatus,
    SupplierInvoiceStatus,
)
from app.core.api_contract import OperationBranchScope
from app.api.schemas.inventory.inventory import InventoryAdjustmentReason
from app.api.schemas.inventory.stock import (
    StockAdjustmentReason,
    StockOperationMovementType,
)
from app.api.schemas.purchase.grn import GRNStatus as SchemaGRNStatus
from app.api.schemas.purchase.purchase_order import POStatus as SchemaPOStatus
from app.api.schemas.purchase.supplier_invoice import (
    SupplierInvoicePaymentStatus,
    SupplierInvoiceStatus as SchemaSupplierInvoiceStatus,
)
from app.api.schemas.sales.billing import (
    BillingGSTCode,
    InvoiceStatus as SchemaInvoiceStatus,
)
from app.api.schemas.sales.order import OrderStatus as SchemaOrderStatus
from app.api.schemas.sales.returns import ReturnStatus as SchemaReturnStatus


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def _load_audit():
    audit_path = REPOSITORY_ROOT / "backend/scripts/audit/contract_consistency_audit.py"
    spec = importlib.util.spec_from_file_location("contract_consistency_audit", audit_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_document_number_validator_does_not_infer_canonical_identity():
    assert not DocumentNumberService.validate_format("INV-202608190001", "invoice")


def test_document_number_generation_fails_closed_before_database_access():
    class Database:
        def execute(self, *_args, **_kwargs):
            pytest.fail("database must not be accessed without an organization")

    with pytest.raises(CanonicalDocumentCommandRequired, match="canonical command prepare"):
        DocumentNumberService.generate_number(Database(), "invoice", "org-id")


def test_document_number_registry_has_no_standalone_targets():
    assert DOCUMENT_CONFIGS == {}


def test_stock_transfer_persists_same_reference_on_both_movements(monkeypatch):
    movements = []

    monkeypatch.setattr(
        InventoryService,
        "get_location_wise_stock",
        lambda *_args: {"quantity_available": 10},
    )

    def record_movement(_db, movement):
        movements.append(movement)
        return SimpleNamespace(movement_id=len(movements))

    monkeypatch.setattr(InventoryService, "record_stock_movement", record_movement)

    result = InventoryService.record_stock_transfer(
        db=object(),
        org_id=UUID("e78d6777-35f6-4b19-994f-caaede2f021a"),
        product_id=1,
        batch_id=2,
        quantity=3,
        source_location_id=10,
        destination_location_id=11,
        created_by=8,
        reference_number="ST-202608190001",
    )

    assert result["out_movement_id"] == 1
    assert result["in_movement_id"] == 2
    assert [movement.reference_number for movement in movements] == [
        "ST-202608190001",
        "ST-202608190001",
    ]


def test_purchase_service_barrels_do_not_eagerly_import_legacy_services():
    import app.api.services.purchase as purchase_services

    assert purchase_services.__all__ == []
    assert not hasattr(purchase_services, "GRNService")
    assert not hasattr(purchase_services, "SupplierInvoiceService")

    retired = (
        "backend/app/api/services/purchase/purchase_service.py",
        "backend/app/api/services/purchase/grn_service.py",
        "backend/app/api/services/purchase/supplier_invoice_service.py",
        "backend/app/api/services/purchase/supplier_invoice/supplier_invoice_service.py",
        "backend/app/api/services/purchase/supplier_invoice/supplier_invoice_repository.py",
    )
    assert all(not (REPOSITORY_ROOT / path).exists() for path in retired)


def test_standalone_document_number_reservation_source_is_retired():
    retired_route_functions = {
        "backend/app/api/routes/sales/invoices/routes.py": "generate_invoice_number",
        "backend/app/api/routes/sales/orders/routes.py": "generate_sales_order_number",
        "backend/app/api/routes/purchase/grn.py": "generate_grn_number",
        "backend/app/api/routes/finance/payments/routes.py": "generate_receipt_number",
        "backend/app/api/routes/finance/journal/routes.py": "generate_journal_number",
        "backend/app/api/routes/finance/expenses/routes.py": "generate_claim_number",
    }

    assert not (REPOSITORY_ROOT / "backend/app/api/routes/documents.py").exists()
    assert not hasattr(DocumentNumberService, "reserve_number")
    for relative_path, function_name in retired_route_functions.items():
        path = REPOSITORY_ROOT / relative_path
        source = path.read_text() if path.exists() else ""
        assert f"def {function_name}(" not in source


def test_canonical_document_allocation_is_tenant_scoped_and_idempotent():
    core_commands = (
        REPOSITORY_ROOT
        / "database/canonical/commands_core/generate_core_commands_contract.py"
    ).read_text()

    assert (
        '"allocate_document_number"(organization_id uuid, sequence_id uuid, '
        "idempotency_key_hash bytea, idempotency_expires_at timestamptz)"
    ) in core_commands
    assert '"claim"(organization_id,actor_id' in core_commands
    assert '"finish_claim"(organization_id,claim.id' in core_commands


def test_jwt_branch_ids_are_parsed_as_checked_in_integer_keys(monkeypatch):
    monkeypatch.setattr(org_context, "is_test_mode_enabled", lambda: False)
    monkeypatch.setattr(
        org_context,
        "decode_jwt",
        lambda _token: {
            "org_id": "e78d6777-35f6-4b19-994f-caaede2f021a",
            "user_id": 8,
            "branch_scope": "multi",
            "branch_ids": ["5", 9],
        },
    )

    context = asyncio.run(
        org_context.get_org_context(SimpleNamespace(credentials="signed-token"))
    )

    assert context.branch_ids == [5, 9]
    assert context.primary_branch_id == 5
    assert context.can_access_branch(9)


def test_jwt_without_branch_scope_is_rejected(monkeypatch):
    monkeypatch.setattr(org_context, "is_test_mode_enabled", lambda: False)
    monkeypatch.setattr(
        org_context,
        "decode_jwt",
        lambda _token: {
            "org_id": "e78d6777-35f6-4b19-994f-caaede2f021a",
            "user_id": 8,
            "branch_ids": ["5"],
        },
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(org_context.get_org_context(SimpleNamespace(credentials="legacy-token")))
    assert error.value.status_code == 401
    assert error.value.detail == "Invalid token: missing branch_scope"


def test_branch_filter_binds_integer_keys_and_fails_closed_without_assignments():
    try:
        TenantContext.set_context(
            UUID("e78d6777-35f6-4b19-994f-caaede2f021a"),
            user_id=8,
            branch_scope=BranchScope.SINGLE,
            branch_ids=[5],
        )
        params = {}
        TenantQueryBuilder._inject_branch_filter(
            "SELECT * FROM sales.invoices", params
        )
        assert params["_tenant_branch_id"] == 5

        TenantContext.set_context(
            UUID("e78d6777-35f6-4b19-994f-caaede2f021a"),
            user_id=8,
            branch_scope=BranchScope.SINGLE,
            branch_ids=[],
        )
        params = {}
        TenantQueryBuilder._inject_branch_filter(
            "SELECT * FROM sales.invoices", params
        )
        assert params["_tenant_branch_id"] == -1
    finally:
        TenantContext.clear_context()


def test_legacy_document_number_reservations_are_not_mounted():
    schema = app.openapi()
    retired_paths = (
        "/api/documents/generate-number",
        "/api/invoices/generate-number",
        "/api/sales-orders/generate-number",
        "/api/grn/generate-number",
        "/api/payments/generate-receipt-number",
        "/api/journal-entries/generate-journal-number",
        "/api/expense-claims/generate-claim-number",
        "/api/sale-returns/generate-number",
    )
    assert all(path not in schema["paths"] for path in retired_paths)


def test_lifecycle_schemas_share_canonical_enum_authority():
    assert SchemaInvoiceStatus is InvoiceStatus
    assert SchemaOrderStatus is OrderStatus
    assert SchemaPOStatus is POStatus
    assert SchemaGRNStatus is GRNStatus
    assert SchemaSupplierInvoiceStatus is SupplierInvoiceStatus
    assert SchemaReturnStatus is ReturnStatus


def test_canonical_lifecycle_enums_preserve_all_existing_wire_values():
    assert {item.value for item in OrderStatus} == {
        "draft", "pending", "confirmed", "processing", "packed", "shipped",
        "invoiced", "delivered", "completed", "returned", "cancelled",
    }
    assert {item.value for item in InvoiceStatus} == {
        "draft", "issued", "generated", "sent", "paid", "partially_paid",
        "overdue", "cancelled", "void",
    }
    assert {item.value for item in POStatus} == {
        "draft", "pending", "pending_approval", "approved", "ordered", "sent",
        "partial", "partially_received", "received", "cancelled", "closed",
    }
    assert {item.value for item in GRNStatus} == {
        "draft", "pending", "pending_qc", "qc_passed", "qc_failed", "received",
        "partial", "completed", "cancelled",
    }
    assert {item.value for item in SupplierInvoiceStatus} == {
        "draft", "pending", "pending_verification", "verified", "approved",
        "disputed", "paid", "partial", "partially_paid", "cancelled",
    }
    assert {item.value for item in ReturnStatus} == {
        "draft", "pending", "approved", "processing", "completed", "rejected",
        "cancelled",
    }


def test_distinct_wire_enums_keep_explicit_domain_names_and_values():
    assert {item.value for item in SupplierInvoicePaymentStatus} == {
        "pending", "overdue", "paid", "partially_paid",
    }
    assert {item.value for item in BillingGSTCode} == {"cgst_sgst", "igst"}
    assert {item.value for item in StockOperationMovementType} == {
        "sale", "purchase", "stock_receive", "stock_issue", "stock_transfer",
        "stock_adjustment", "stock_damage", "stock_expiry", "stock_count",
        "stock_return", "writeoff",
    }
    assert {item.value for item in StockAdjustmentReason} == {
        "damage", "expiry", "count", "other",
    }
    assert {item.value for item in InventoryAdjustmentReason} == {
        "damage", "expiry", "theft", "counting", "breakage", "other",
    }
    assert {item.value for item in OperationBranchScope} == {
        "none", "optional", "required",
    }


def test_enum_contract_audit_has_no_divergent_authorities():
    codes = {issue.code for issue in _load_audit().collect_issues()}
    assert "DIVERGENT_ENUM_CONTRACTS" not in codes


def test_consistency_audit_keeps_unresolved_contracts_release_visible():
    codes = {issue.code for issue in _load_audit().collect_issues()}

    assert "DOCUMENT_NUMBER_VALIDATOR_DIVERGENCE" not in codes
    assert "OPTIONAL_DOCUMENT_NUMBER_TENANT" not in codes
    assert "BRANCH_ID_TYPE_MISMATCH" not in codes
    assert "ORG_ID_ENDPOINT_UNDEFINED_CONTEXT" not in codes

    assert "DOCUMENT_SEQUENCE_KEY_WIDTH_MISMATCH" not in codes
    assert "COMPETING_DOCUMENT_SEQUENCE_AUTHORITIES" not in codes
    assert "NULLABLE_DOCUMENT_SEQUENCE_TENANT" not in codes
    assert "DOCUMENT_TYPE_ALIAS_PREFIX_DIVERGENCE" not in codes
    assert "DOCUMENT_CONFIG_TARGETS_UNBASELINED" not in codes
    assert "DOCUMENT_CONFIG_WITHOUT_PROVEN_CALLER" not in codes
    assert "AD_HOC_REFERENCE_GENERATORS" not in codes
    assert "DUPLICATE_PURCHASE_SERVICE_SURFACES" not in codes
    assert "DOCUMENT_NUMBER_MUTATION_USES_GET" not in codes
    assert "DOCUMENT_NUMBER_RESERVATION_NOT_COMMITTED" not in codes
    assert "DOCUMENT_NUMBER_RESERVATION_IDEMPOTENCY_UNBASELINED" not in codes
    assert "DIVERGENT_ENUM_CONTRACTS" not in codes
    assert "CLIENT_SUPPLIED_GST_RATE_AUTHORITY" not in codes
    assert "UUID_DERIVED_MASTER_CODES" not in codes
    assert "MISSING_BRANCH_SCOPE_FAILS_OPEN" not in codes
    assert "TENANT_KEY_WIRE_CONTRACT_DIVERGENCE" not in codes
    assert "MONEY_RESPONSE_FLOAT_SERIALIZATION" not in codes
    assert "NAIVE_TIMESTAMP_SERIALIZATION" not in codes
    assert "UNTYPED_MUTATION_RESPONSE_CONTRACTS" not in codes


def test_sales_tax_authority_is_effective_dated_and_not_browser_owned():
    schemas = _read("backend/app/api/schemas/calculations.py")
    routes = _read("backend/app/api/routes/calculations.py")
    authority = _read("backend/app/api/services/sales/tax_authority.py")
    calculator = _read("backend/app/api/services/sales/calculation.py")
    canonical_line = schemas.split(
        "class CanonicalSalesCalculationLine", 1
    )[1].split("class InvoiceCalculationRequest", 1)[0]

    assert "gst_percent" not in canonical_line
    assert "tax_percent" not in canonical_line
    assert "resolve_sales_tax_authority" in routes
    assert "authority.lines" in routes
    assert 'item["resolved_gst_percent"]' in calculator
    assert "tax.tax_code_versions" in authority
    assert "core.reference_data_releases" in authority
    assert "version.effective_from<=:document_date" in authority
    assert "release.dataset_kind='hsn_sac_tax'" in authority
