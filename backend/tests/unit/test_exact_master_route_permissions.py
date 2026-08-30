from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.api.routes import canonical_erp_reads
from app.core.database import get_db
from app.core.security.permissions import (
    FOUNDATION_CUSTOMER_LOOKUP_PERMISSIONS,
    FOUNDATION_PRODUCT_LOOKUP_PERMISSIONS,
    FOUNDATION_SUPPLIER_LOOKUP_PERMISSIONS,
)


USER_ID = "5c3fd8ee-5768-437a-bec4-94a175f224cd"
AUTH_USER_ID = "24b5260d-bdb6-40b5-a1c0-e85af2fe2098"
ORG_ID = "01e3fe3d-437d-4d52-a1de-701313b3c08b"
ROOT = Path(__file__).resolve().parents[3]


class _EmptyResult:
    def fetchall(self):
        return []

    def scalar_one(self):
        return 0

    def scalar(self):
        return USER_ID


class _TrackingDatabase:
    def __init__(self):
        self.calls = []

    def execute(self, statement, parameters=None):
        self.calls.append((str(statement), parameters))
        return _EmptyResult()


def _client(monkeypatch, permissions: set[str], *, is_admin: bool = False):
    database = _TrackingDatabase()
    application = FastAPI()
    application.include_router(canonical_erp_reads.router, prefix="/api")
    application.dependency_overrides[get_db] = lambda: database
    monkeypatch.setattr(
        "app.core.security.permissions.is_test_mode_enabled", lambda: False
    )
    monkeypatch.setattr(
        "app.core.security.permissions.require_canonical_session_authority",
        lambda _db: None,
    )
    monkeypatch.setattr(
        "app.core.security.permissions.decode_jwt",
        lambda _token: {
            "user_id": USER_ID,
            "auth_user_id": AUTH_USER_ID,
            "org_id": ORG_ID,
            "email": "operator@example.com",
            "is_admin": is_admin,
            "permissions": {permission: True for permission in permissions},
        },
    )
    return TestClient(application), database


@pytest.mark.parametrize(
    ("path", "exact_permission"),
    (
        ("/api/products?search=aspirin", "catalog.product.manage"),
        ("/api/customers?search=asha", "parties.customer.manage"),
        ("/api/suppliers?search=medico", "parties.supplier.manage"),
    ),
)
def test_foundation_search_rejects_unauthenticated_without_database_action(
    monkeypatch, path, exact_permission
):
    client, database = _client(monkeypatch, {exact_permission})

    response = client.get(path)

    assert response.status_code == 401
    assert database.calls == []


@pytest.mark.parametrize(
    ("path", "unrelated_permission"),
    (
        ("/api/products?search=aspirin", "parties.customer.manage"),
        ("/api/customers?search=asha", "parties.supplier.manage"),
        ("/api/suppliers?search=medico", "catalog.product.manage"),
    ),
)
@pytest.mark.parametrize("is_admin", (False, True), ids=("operator", "admin"))
def test_foundation_search_rejects_cross_capability_before_database_action(
    monkeypatch, path, unrelated_permission, is_admin
):
    client, database = _client(
        monkeypatch, {unrelated_permission}, is_admin=is_admin
    )

    response = client.get(path, headers={"Authorization": "Bearer signed-token"})

    assert response.status_code == 403
    assert database.calls == []


@pytest.mark.parametrize(
    ("path", "allowed_permission"),
    (
        ("/api/products?search=aspirin", "catalog.product.manage"),
        ("/api/products?search=aspirin", "sales.invoice.create"),
        ("/api/products?search=aspirin", "procurement.order.manage"),
        ("/api/products?search=aspirin", "inventory.transfer.create"),
        ("/api/customers?search=asha", "parties.customer.manage"),
        ("/api/customers?search=asha", "sales.order.create"),
        ("/api/customers?search=asha", "finance.customer_receipt.create"),
        ("/api/suppliers?search=medico", "parties.supplier.manage"),
        ("/api/suppliers?search=medico", "procurement.receipt.post"),
        ("/api/suppliers?search=medico", "finance.supplier_payment.create"),
    ),
)
@pytest.mark.parametrize("is_admin", (False, True), ids=("operator", "admin"))
def test_foundation_search_accepts_only_a_reviewed_exact_capability(
    monkeypatch, path, allowed_permission, is_admin
):
    client, database = _client(monkeypatch, {allowed_permission}, is_admin=is_admin)

    response = client.get(path, headers={"Authorization": "Bearer signed-token"})

    assert response.status_code == 200, response.text
    assert database.calls


@pytest.mark.parametrize(
    ("path", "unrelated_permission"),
    (
        ("/api/products?search=aspirin", "hr.employee.manage"),
        ("/api/customers?search=asha", "core.settings.manage"),
        ("/api/suppliers?search=medico", "hr.department.manage"),
    ),
)
def test_foundation_search_never_inherits_broad_hr_or_core_master_access(
    monkeypatch, path, unrelated_permission
):
    client, database = _client(monkeypatch, {unrelated_permission}, is_admin=True)

    response = client.get(path, headers={"Authorization": "Bearer signed-token"})

    assert response.status_code == 403
    assert database.calls == []


@pytest.mark.parametrize(
    ("path", "operational_permission"),
    (
        ("/api/products?search=aspirin&limit=101", "sales.invoice.create"),
        ("/api/customers?search=asha&limit=101", "sales.order.create"),
        ("/api/suppliers?search=medico&limit=101", "procurement.order.manage"),
    ),
)
def test_operational_lookup_cannot_expand_to_master_list_size(
    monkeypatch, path, operational_permission
):
    client, database = _client(monkeypatch, {operational_permission})

    response = client.get(path, headers={"Authorization": "Bearer signed-token"})

    assert response.status_code == 403
    assert database.calls == []


@pytest.mark.parametrize(
    ("path", "manage_permission"),
    (
        ("/api/products?search=aspirin&limit=101", "catalog.product.manage"),
        ("/api/customers?search=asha&limit=101", "parties.customer.manage"),
        ("/api/suppliers?search=medico&limit=101", "parties.supplier.manage"),
    ),
)
def test_entity_manager_can_use_the_documented_master_list_size(
    monkeypatch, path, manage_permission
):
    client, database = _client(monkeypatch, {manage_permission})

    response = client.get(path, headers={"Authorization": "Bearer signed-token"})

    assert response.status_code == 200, response.text
    assert database.calls


@pytest.mark.parametrize(
    "sales_permission", ("sales.order.create", "sales.invoice.create")
)
def test_sales_operator_can_read_one_customer_address_projection(
    monkeypatch, sales_permission
):
    client, database = _client(monkeypatch, {sales_permission})

    response = client.get(
        f"/api/customers/{USER_ID}/addresses",
        headers={"Authorization": "Bearer signed-token"},
    )

    assert response.status_code == 200, response.text
    assert database.calls


@pytest.mark.parametrize("unrelated_permission", ("hr.employee.manage", "core.settings.manage"))
def test_customer_address_projection_rejects_broad_master_domains(
    monkeypatch, unrelated_permission
):
    client, database = _client(monkeypatch, {unrelated_permission}, is_admin=True)

    response = client.get(
        f"/api/customers/{USER_ID}/addresses",
        headers={"Authorization": "Bearer signed-token"},
    )

    assert response.status_code == 403
    assert database.calls == []


@pytest.mark.parametrize(
    ("path", "payload", "unrelated_permission"),
    (
        (
            "/api/products/",
            {"product_name": "Test Product", "product_kind": "medicine"},
            "parties.customer.manage",
        ),
        (
            "/api/customers/",
            {
                "customer_name": "Test Customer",
                "customer_type": "organization",
                "primary_phone": "9876543210",
                "credit_limit": "0.00",
                "credit_days": 0,
            },
            "catalog.product.manage",
        ),
        (
            "/api/suppliers/",
            {"supplier_name": "Test Supplier", "payment_days": 30},
            "parties.customer.manage",
        ),
    ),
)
@pytest.mark.parametrize("is_admin", (False, True), ids=("operator", "admin"))
def test_foundation_create_rejects_unrelated_capability_before_database_action(
    monkeypatch, path, payload, unrelated_permission, is_admin
):
    client, database = _client(
        monkeypatch, {unrelated_permission}, is_admin=is_admin
    )

    response = client.post(
        path,
        json=payload,
        headers={
            "Authorization": "Bearer signed-token",
            "X-Idempotency-Key": "exact-rbac-test-0001",
        },
    )

    assert response.status_code == 403, response.text
    assert database.calls == []


@pytest.mark.parametrize(
    ("path", "payload"),
    (
        (
            f"/api/products/{USER_ID}/activate",
            {"row_version": 1, "manufacturer_traceability_code": None},
        ),
        (
            f"/api/products/{USER_ID}/setup",
            {
                "row_version": 1,
                "manufacturer_party_id": AUTH_USER_ID,
                "base_uom_code": "EA",
                "hsn_code": "3004",
            },
        ),
    ),
)
@pytest.mark.parametrize("is_admin", (False, True), ids=("operator", "admin"))
def test_product_lookup_capability_cannot_configure_or_activate_product(
    monkeypatch, path, payload, is_admin
):
    client, database = _client(
        monkeypatch, {"sales.invoice.create"}, is_admin=is_admin
    )

    response = client.request(
        "POST" if path.endswith("/activate") else "PUT",
        path,
        json=payload,
        headers={
            "Authorization": "Bearer signed-token",
            "X-Idempotency-Key": "exact-rbac-test-0002",
        },
    )

    assert response.status_code == 403, response.text
    assert database.calls == []


def test_lookup_matrix_covers_reviewed_frontend_transaction_selectors() -> None:
    assert {
        "sales.order.create",
        "sales.order.manage",
        "sales.invoice.create",
        "procurement.order.manage",
        "procurement.invoice.post",
        "inventory.adjustment.create",
        "inventory.transfer.create",
        "inventory.document.post",
    }.issubset(FOUNDATION_PRODUCT_LOOKUP_PERMISSIONS)
    assert {
        "sales.order.create",
        "sales.order.manage",
        "sales.invoice.create",
        "sales.return.create",
        "finance.customer_receipt.create",
        "finance.payment.manage",
        "finance.account.manage",
    }.issubset(FOUNDATION_CUSTOMER_LOOKUP_PERMISSIONS)
    assert {
        "procurement.order.manage",
        "procurement.receipt.post",
        "procurement.invoice.post",
        "procurement.supplier_invoice.create",
        "procurement.purchase_return.create",
        "finance.supplier_payment.create",
        "finance.payment.manage",
        "finance.account.manage",
    }.issubset(FOUNDATION_SUPPLIER_LOOKUP_PERMISSIONS)


def test_lookup_allowlists_use_only_published_non_hr_non_core_capabilities() -> None:
    catalog = (
        ROOT / "database/canonical/platform/baseline-platform-enforcements.json"
    ).read_text(encoding="utf-8")

    for permission_codes in (
        FOUNDATION_PRODUCT_LOOKUP_PERMISSIONS,
        FOUNDATION_CUSTOMER_LOOKUP_PERMISSIONS,
        FOUNDATION_SUPPLIER_LOOKUP_PERMISSIONS,
    ):
        assert len(permission_codes) == len(set(permission_codes))
        assert all(
            not permission.startswith(("hr.", "core."))
            for permission in permission_codes
        )
        for permission in permission_codes:
            assert f"('{permission}'," in catalog


def test_every_foundation_route_uses_its_exact_capability_dependency() -> None:
    product_lookup_routes = (
        canonical_erp_reads.products,
        canonical_erp_reads.products_with_batches,
        canonical_erp_reads.product_batches,
    )
    product_admin_routes = (
        canonical_erp_reads.product_setup_options,
        canonical_erp_reads.product_setup_ingredients,
        canonical_erp_reads.product_setup_hsn_codes,
        canonical_erp_reads.product_setup,
        canonical_erp_reads.configure_product_setup,
        canonical_erp_reads.activate_product_setup,
        canonical_erp_reads.create_product_draft,
        canonical_erp_reads.update_product_draft,
        canonical_erp_reads.delete_product_draft,
    )
    customer_lookup_routes = (
        canonical_erp_reads.customers,
        canonical_erp_reads.customer_addresses,
    )
    customer_admin_routes = (
        canonical_erp_reads.create_customer,
        canonical_erp_reads.update_customer,
        canonical_erp_reads.customers_with_addresses,
        canonical_erp_reads.create_customer_address,
        canonical_erp_reads.update_customer_address,
    )
    supplier_lookup_routes = (canonical_erp_reads.suppliers,)
    supplier_admin_routes = (
        canonical_erp_reads.create_supplier,
        canonical_erp_reads.update_supplier,
    )

    for route in product_lookup_routes:
        assert route.__defaults__ is not None
        assert canonical_erp_reads.PRODUCT_LOOKUP_USER in route.__defaults__
    for route in product_admin_routes:
        assert route.__defaults__ is not None
        assert canonical_erp_reads.PRODUCT_USER in route.__defaults__
    for route in customer_lookup_routes:
        assert route.__defaults__ is not None
        assert canonical_erp_reads.CUSTOMER_LOOKUP_USER in route.__defaults__
    for route in customer_admin_routes:
        assert route.__defaults__ is not None
        assert canonical_erp_reads.CUSTOMER_USER in route.__defaults__
    for route in supplier_lookup_routes:
        assert route.__defaults__ is not None
        assert canonical_erp_reads.SUPPLIER_LOOKUP_USER in route.__defaults__
    for route in supplier_admin_routes:
        assert route.__defaults__ is not None
        assert canonical_erp_reads.SUPPLIER_USER in route.__defaults__
