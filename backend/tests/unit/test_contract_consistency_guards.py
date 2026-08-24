import asyncio
import importlib.util
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.routes.documents import DOC_TYPE_MAPPING
from app.api.services.document_number_service import (
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
from app.api.services.compliance.gst_engine import (
    GSTCustomerCategory,
    GSTTreatment,
)
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


def _load_audit():
    audit_path = REPOSITORY_ROOT / "backend/scripts/audit/contract_consistency_audit.py"
    spec = importlib.util.spec_from_file_location("contract_consistency_audit", audit_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_document_number_validator_matches_generated_format():
    assert DocumentNumberService.validate_format("INV-202608190001", "invoice")
    assert not DocumentNumberService.validate_format("INV-2608190001", "invoice")
    assert not DocumentNumberService.validate_format("PO-202608190001", "invoice")


def test_document_number_generation_requires_tenant_before_database_access():
    class Database:
        def execute(self, *_args, **_kwargs):
            pytest.fail("database must not be accessed without an organization")

    with pytest.raises(ValueError, match="org_id is required"):
        DocumentNumberService.generate_number(Database(), "invoice", "")


def test_document_number_registry_has_only_owned_types_and_canonical_targets():
    retired_types = {"purchase", "quotation", "stock_adjustment", "stock_count", "scheme"}
    assert retired_types.isdisjoint(DOCUMENT_CONFIGS)
    assert set(DOC_TYPE_MAPPING.values()).issubset(DOCUMENT_CONFIGS)
    assert DOCUMENT_CONFIGS["receipt"]["table"] == "financial.payments"
    assert DOCUMENT_CONFIGS["receipt"]["column"] == "payment_number"
    for document_type in {"adjustment", "stock_receipt", "stock_issue", "stock_transfer"}:
        assert DOCUMENT_CONFIGS[document_type]["table"] == "inventory.inventory_movements"
        assert DOCUMENT_CONFIGS[document_type]["column"] == "reference_number"


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


def test_purchase_service_barrels_resolve_to_mounted_canonical_modules():
    from app.api.services.purchase import (
        GRNService as DomainGRNService,
        SupplierInvoiceService as DomainSupplierInvoiceService,
    )
    from app.api.services.purchase.grn import GRNService as PackageGRNService
    from app.api.services.purchase.supplier_invoice import (
        SupplierInvoiceService as PackageSupplierInvoiceService,
    )
    from app.api.services.purchase.supplier_invoice.service import (
        SupplierInvoiceService as MountedSupplierInvoiceService,
    )
    import app.api.shared

    assert DomainGRNService is PackageGRNService
    assert DomainSupplierInvoiceService is PackageSupplierInvoiceService
    assert PackageSupplierInvoiceService is MountedSupplierInvoiceService
    assert MountedSupplierInvoiceService.__module__.endswith("supplier_invoice.service")
    assert app.api.shared is not None

    retired = (
        "backend/app/api/services/purchase/purchase_service.py",
        "backend/app/api/services/purchase/grn_service.py",
        "backend/app/api/services/purchase/supplier_invoice_service.py",
        "backend/app/api/services/purchase/supplier_invoice/supplier_invoice_service.py",
        "backend/app/api/services/purchase/supplier_invoice/supplier_invoice_repository.py",
    )
    assert all(not (REPOSITORY_ROOT / path).exists() for path in retired)


def test_document_number_reservation_commits_exactly_once(monkeypatch):
    class Database:
        commits = 0
        rollbacks = 0

        def commit(self):
            self.commits += 1

        def rollback(self):
            self.rollbacks += 1

    database = Database()
    monkeypatch.setattr(
        DocumentNumberService,
        "generate_number",
        lambda _db, _document_type, _org_id: "INV-202608190001",
    )

    result = DocumentNumberService.reserve_number(database, "invoice", "org-1")

    assert result == "INV-202608190001"
    assert database.commits == 1
    assert database.rollbacks == 0


def test_document_number_reservation_rolls_back_failed_generation(monkeypatch):
    class Database:
        commits = 0
        rollbacks = 0

        def commit(self):
            self.commits += 1

        def rollback(self):
            self.rollbacks += 1

    def fail_generation(*_args):
        raise ValueError("sequence unavailable")

    database = Database()
    monkeypatch.setattr(DocumentNumberService, "generate_number", fail_generation)

    with pytest.raises(ValueError, match="sequence unavailable"):
        DocumentNumberService.reserve_number(database, "invoice", "org-1")

    assert database.commits == 0
    assert database.rollbacks == 1


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
    assert {item.value for item in GSTTreatment} == {
        "CGST/SGST", "IGST", "EXEMPT", "NIL_RATED", "NON_GST",
    }
    assert {item.value for item in GSTCustomerCategory} == {
        "B2B", "B2C", "EXPORT", "SEZ", "DEEMED_EXPORT", "COMPOSITION",
        "UIN", "GOVERNMENT",
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
    assert "DOCUMENT_CONFIG_TARGETS_UNBASELINED" in codes
    assert "DOCUMENT_CONFIG_WITHOUT_PROVEN_CALLER" not in codes
    assert "AD_HOC_REFERENCE_GENERATORS" not in codes
    assert "DUPLICATE_PURCHASE_SERVICE_SURFACES" not in codes
    assert "DOCUMENT_NUMBER_MUTATION_USES_GET" not in codes
    assert "DOCUMENT_NUMBER_RESERVATION_NOT_COMMITTED" not in codes
    assert "DOCUMENT_NUMBER_RESERVATION_IDEMPOTENCY_UNBASELINED" in codes
    assert "DIVERGENT_ENUM_CONTRACTS" not in codes
    assert "CLIENT_SUPPLIED_GST_RATE_AUTHORITY" in codes
    assert "MISSING_BRANCH_SCOPE_FAILS_OPEN" not in codes
    assert "TENANT_KEY_WIRE_CONTRACT_DIVERGENCE" not in codes
    assert "MONEY_RESPONSE_FLOAT_SERIALIZATION" not in codes
    assert "NAIVE_TIMESTAMP_SERIALIZATION" not in codes
    assert "UNTYPED_MUTATION_RESPONSE_CONTRACTS" not in codes
