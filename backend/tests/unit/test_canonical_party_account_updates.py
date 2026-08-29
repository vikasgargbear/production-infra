from __future__ import annotations

import hashlib
import importlib.util
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import Response
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_master_commands
from app.api.schemas.master.customer import CanonicalCustomerUpdate
from app.api.schemas.master.supplier import CanonicalSupplierUpdate
from app.domain.operator_actions import ActionContext
from app.infrastructure import canonical_write_commands


ROOT = Path(__file__).parents[3]
SOURCE = ROOT / "database/canonical/operations/master/party_account_update_commands.sql"
MIGRATION = ROOT / "backend/alembic/sql/20260829_0053_canonical_party_account_updates.sql"
REVISION = ROOT / "backend/alembic/versions/20260829_0053_canonical_party_account_updates.py"
GENERATOR = ROOT / "backend/scripts/generate_canonical_party_account_update_migration.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_party_account_update_migration_is_generated_hash_bound_and_linear() -> None:
    generator = _load(GENERATOR, "party_account_update_generator")
    revision = _load(REVISION, "party_account_update_revision")
    migration = MIGRATION.read_text(encoding="utf-8")

    assert migration == generator.render()
    assert revision.revision == "20260829_0053"
    assert revision.down_revision == "20260829_0052"
    assert revision.down_revision == "20260828_0049"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(MIGRATION.read_bytes()).hexdigest()


def test_functions_are_the_only_runtime_party_account_update_owners() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")

    for name, permission, operation in (
        ("update_customer_account", "parties.customer.manage", "parties.customer.update"),
        ("update_supplier_account", "parties.supplier.manage", "parties.supplier.update"),
    ):
        assert f"CREATE FUNCTION erp_master_commands.{name}(" in source
        assert permission in source
        assert operation in source
        assert f"GRANT EXECUTE ON FUNCTION erp_master_commands.{name}(" in source
    assert source.count("erp_core_commands.claim(") == 2
    assert source.count("erp_core_commands.finish_claim(") == 2
    assert source.count("FOR UPDATE") >= 6
    assert "expected_account_row_version" in source
    assert "expected_party_row_version" in source
    assert "INSERT INTO parties.addresses" not in source
    assert "UPDATE parties.addresses" not in source
    assert "INSERT INTO parties.tax_registrations" not in source
    assert "UPDATE parties.tax_registrations" not in source
    for relation in (
        "parties.parties", "parties.customer_accounts", "parties.supplier_accounts",
    ):
        assert f"REVOKE UPDATE ON TABLE {relation} FROM erp_app,erp_runtime;" in migration
    assert "REVOKE INSERT,UPDATE ON TABLE parties.contacts FROM erp_app,erp_runtime;" in migration


@pytest.mark.parametrize(
    ("model", "payload"),
    (
        (CanonicalCustomerUpdate, {"account_row_version": 1, "party_row_version": 1}),
        (CanonicalSupplierUpdate, {"account_row_version": 1, "party_row_version": 1}),
    ),
)
def test_patch_contract_requires_at_least_one_mutable_field(model, payload) -> None:
    with pytest.raises(ValidationError, match="At least one canonical"):
        model.model_validate(payload)


@pytest.mark.parametrize(
    ("model", "field", "value"),
    (
        (CanonicalCustomerUpdate, "pan_number", "ABCDE1234"),
        (CanonicalSupplierUpdate, "pan_number", "ABCDE1234"),
        (CanonicalCustomerUpdate, "primary_phone", "123"),
        (CanonicalSupplierUpdate, "primary_email", "not-an-email"),
    ),
)
def test_patch_contract_rejects_invalid_party_identity_fields(model, field, value) -> None:
    with pytest.raises(ValidationError):
        model.model_validate({
            "account_row_version": 1, "party_row_version": 1, field: value,
        })


class _Database:
    def __init__(self) -> None:
        self.committed = False
        self.rolled_back = False

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True


def test_rest_customer_patch_passes_exact_flags_versions_and_replay_headers(monkeypatch) -> None:
    organization_id = uuid4()
    customer_id = uuid4()
    party_id = uuid4()
    captured = {}
    db = _Database()

    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda *_args: organization_id)

    def update_customer_account(_db, **parameters):
        captured.update(parameters)
        return {
            "customer_account_id": customer_id, "party_id": party_id,
            "customer_code": "CUST-000001", "updated_customer_name": "Updated",
            "updated_customer_type": "organization", "updated_primary_phone": "9876543210",
            "updated_primary_email": None, "updated_contact_person_name": "Updated",
            "updated_pan": None, "updated_credit_limit": Decimal("100.00"),
            "updated_credit_days": 7, "account_row_version": 3,
            "party_row_version": 5, "idempotency_replayed": False,
        }

    monkeypatch.setattr(canonical_write_commands, "update_customer_account", update_customer_account)
    response = Response()
    result = canonical_erp_reads.update_customer(
        customer_id,
        CanonicalCustomerUpdate.model_validate({
            "account_row_version": 2, "party_row_version": 4,
            "customer_name": "Updated", "primary_email": None,
        }),
        response,
        "web-customer-update-0001",
        {"org_id": str(organization_id)},
        db,
    )

    assert db.committed and not db.rolled_back
    assert captured["expected_account_row_version"] == 2
    assert captured["expected_party_row_version"] == 4
    assert captured["set_customer_name"] is True
    assert captured["set_primary_email"] is True
    assert captured["set_primary_phone"] is False
    assert result["customer_id"] == customer_id
    assert result["account_row_version"] == 3
    assert result["credit_limit"] == "100.00"
    assert response.headers["X-Idempotency-Replayed"] == "false"


def test_runtime_adapters_call_only_security_definer_functions() -> None:
    source = Path(canonical_write_commands.__file__).read_text(encoding="utf-8")
    assert "erp_master_commands.update_customer_account(" in source
    assert "erp_master_commands.update_supplier_account(" in source
    assert "UPDATE parties.parties" not in source
    assert "UPDATE parties.customer_accounts" not in source
    assert "UPDATE parties.supplier_accounts" not in source


def test_mcp_customer_update_uses_same_adapter_and_delegated_authority(monkeypatch) -> None:
    organization_id = uuid4()
    customer_id = uuid4()
    party_id = uuid4()
    db = _Database()
    captured = {}
    context = ActionContext(
        auth_user_id=uuid4(), user_id=uuid4(), organization_id=organization_id,
        membership_id=uuid4(), agent_grant_id=uuid4(), client_id="test-client",
        operation_key="parties.customer.update",
        permission="parties.customer.manage", branch_ids=(), organization_scope=True,
    )
    monkeypatch.setattr(mcp_master_commands, "_activate_master_context", lambda *_args: None)

    def update_customer_account(_db, **parameters):
        captured.update(parameters)
        return {
            "customer_account_id": customer_id, "party_id": party_id,
            "customer_code": "CUST-000001", "updated_customer_name": "MCP Updated",
            "updated_customer_type": "organization", "updated_primary_phone": "9876543210",
            "updated_primary_email": None, "updated_contact_person_name": "Contact",
            "updated_pan": None, "updated_credit_limit": Decimal("0.00"),
            "updated_credit_days": 0, "account_row_version": 2,
            "party_row_version": 2, "idempotency_replayed": False,
        }

    monkeypatch.setattr(canonical_write_commands, "update_customer_account", update_customer_account)
    result = mcp_master_commands.update_customer(
        mcp_master_commands.MCPCustomerUpdate.model_validate({
            "customer_id": customer_id, "account_row_version": 1,
            "party_row_version": 1, "customer_name": "MCP Updated",
            "idempotency_key": "mcp-customer-update-0001",
        }),
        context,
        db,
    )

    assert db.committed
    assert captured["org_id"] == organization_id
    assert captured["set_customer_name"] is True
    assert captured["set_primary_email"] is False
    assert result["customer_id"] == customer_id
    assert result["idempotency_replayed"] is False
    assert result["credit_limit"] == "0.00"
