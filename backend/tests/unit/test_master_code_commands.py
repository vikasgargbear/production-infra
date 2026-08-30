from __future__ import annotations

import hashlib
import importlib.util
import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import DBAPIError

from app.api.routes import canonical_erp_reads
from app.api.routes.internal import mcp_master_commands, mcp_master_contract


ROOT = Path(__file__).parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0027_master_code_commands.sql"
REVISION = ROOT / "backend/alembic/versions/20260826_0027_master_code_commands.py"
ONBOARDING_SQL = ROOT / "backend/alembic/sql/20260826_0028_organization_master_code_onboarding.sql"
ONBOARDING_REVISION = ROOT / "backend/alembic/versions/20260826_0028_organization_master_code_onboarding.py"
GENERATOR = (
    ROOT / "database/canonical/master_codes/generate_master_code_contract.py"
)
MANIFEST = ROOT / "database/canonical/master_codes/master-code-authority.json"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_master_code_migration_is_hash_bound_linear_and_deployed() -> None:
    revision = _load(REVISION, "master_code_revision")
    onboarding_revision = _load(ONBOARDING_REVISION, "master_code_onboarding_revision")
    source = SQL.read_bytes()
    onboarding_source = ONBOARDING_SQL.read_bytes()
    sql = source.decode("utf-8")

    assert revision.revision == "20260826_0027"
    assert revision.down_revision == "20260826_0026"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(source).hexdigest()
    assert onboarding_revision.revision == "20260826_0028"
    assert onboarding_revision.down_revision == revision.revision
    assert onboarding_revision.EXPECTED_SQL_SHA256 == hashlib.sha256(
        onboarding_source
    ).hexdigest()
    assert sql.index(
        "CREATE SCHEMA erp_master_commands AUTHORIZATION erp_migration_owner;"
    ) < sql.index("SET LOCAL ROLE erp_migration_owner;")
    assert sql.index("SET LOCAL ROLE erp_migration_owner;") < sql.index(
        "REVOKE ALL ON SCHEMA erp_master_commands"
    )
    assert canonical_erp_reads.__name__

    deployment = _load(
        ROOT / "backend/app/infrastructure/operator_actions/deployment_contract.py",
        "master_code_deployment_contract",
    )
    assert onboarding_revision.revision == "20260826_0028"
    assert deployment.EXPECTED_CANONICAL_ALEMBIC_HEAD == "20260830_0071"


def test_generated_authority_manifest_is_exact_and_post_baseline() -> None:
    generator = _load(GENERATOR, "master_code_generator")
    assert MANIFEST.read_text(encoding="utf-8") == generator.render()
    contract = json.loads(generator.render())

    assert contract["authority"] == "post_baseline_alembic"
    assert contract["scope"] == "organization_global_perpetual"
    assert contract["code_kinds"] == ["customer", "product", "supplier"]
    assert contract["public_request_code_fields"] == []
    assert set(contract["allocation"]["forbidden_strategies"]) == {
        "application_generated",
        "count_plus_one",
        "max_plus_one",
        "random_code",
        "uuid_code",
    }
    assert contract["migration_revision"] == "20260826_0027"
    assert contract["onboarding"] == {
        "activation_event": "first_active_membership",
        "authority": "erp_master_commands.provision_organization_code_sequences",
        "defaults": {
            "customer": {"padding": 6, "prefix": "CUST-", "suffix": ""},
            "product": {"padding": 6, "prefix": "PROD-", "suffix": ""},
            "supplier": {"padding": 6, "prefix": "SUP-", "suffix": ""},
        },
        "existing_organization_backfill": "active_memberships_only",
        "idempotent": True,
        "migration_sql": "backend/alembic/sql/20260826_0028_organization_master_code_onboarding.sql",
        "migration_sql_sha256": hashlib.sha256(ONBOARDING_SQL.read_bytes()).hexdigest(),
    }


def test_onboarding_is_backend_owned_idempotent_and_collision_checked() -> None:
    sql = ONBOARDING_SQL.read_text(encoding="utf-8")

    assert "CREATE FUNCTION erp_master_commands.provision_organization_code_sequences" in sql
    assert "AFTER INSERT OR UPDATE OF status ON core.memberships" in sql
    assert "('customer'::text,'CUST-'::text,''::text,6::smallint)" in sql
    assert "('supplier'::text,'SUP-'::text,''::text,6::smallint)" in sql
    assert "('product'::text,'PROD-'::text,''::text,6::smallint)" in sql
    assert "pg_advisory_xact_lock" in sql
    assert "assigned_code_conflicts" in sql
    assert "existing master code sequence is not an active valid configuration" in sql
    assert "exactly three active master code sequences" in sql
    assert "GRANT EXECUTE ON FUNCTION erp_master_commands.provision_organization_code_sequences(uuid)\n  TO erp_runtime" in sql
    assert "INSERT INTO erp_core_commands.command_scopes" in sql
    assert "organization_master_code_onboard" in sql
    assert "ON CONFLICT DO NOTHING" in sql
    assert "core.organization.manage" in sql
    assert "ac270000" not in sql
    assert "DEMO-" not in sql


def test_app_contract_requires_safe_hash_bound_post_baseline_authority(
    monkeypatch,
) -> None:
    gate = _load(
        ROOT / "backend/scripts/audit/app_data_contract_gate.py",
        "master_code_app_contract_gate",
    )
    contract = json.loads(
        (ROOT / "docs/architecture/app-data-contract.json").read_text(encoding="utf-8")
    )
    model = json.loads(
        (ROOT / "docs/architecture/canonical-data-model.json").read_text(
            encoding="utf-8"
        )
    )
    assert gate.validate_contract(
        contract, source_root=None, model=model, repository_root=ROOT
    ) == []

    unsafe = deepcopy(contract)
    unsafe["data_authority"]["post_baseline_manifests"] = ["../outside.json"]
    errors = gate.validate_contract(
        unsafe, source_root=None, model=model, repository_root=ROOT
    )
    assert any("invalid post-baseline authority path" in error for error in errors)

    original_load = gate._load_json

    def tampered_load(path):
        value = original_load(path)
        if path.resolve() == MANIFEST.resolve():
            value["migration_sql_sha256"] = "0" * 64
        return value

    monkeypatch.setattr(gate, "_load_json", tampered_load)
    errors = gate.validate_contract(
        contract, source_root=None, model=model, repository_root=ROOT
    )
    assert any("post-baseline migration hash differs" in error for error in errors)


def test_sequence_is_force_rls_audited_immutable_and_atomic() -> None:
    sql = SQL.read_text(encoding="utf-8")
    allocation = sql.split(
        "CREATE FUNCTION erp_master_commands.allocate_code", 1
    )[1].split("CREATE FUNCTION erp_master_commands.create_customer", 1)[0]

    assert "ALTER TABLE core.master_code_sequences FORCE ROW LEVEL SECURITY" in sql
    assert "core_master_code_sequences_audit_trg" in sql
    assert "master code sequences cannot be deleted" in sql
    assert "identity and format are immutable" in sql
    assert "assigned master codes are immutable" in sql
    assert "FOR UPDATE" in allocation
    assert "next_value=next_value+1" in allocation
    assert "scope_active('master_code_allocate'" in sql
    assert "core.document_sequences" not in allocation
    assert "max(" not in allocation.lower()
    assert "count(" not in allocation.lower()
    assert "random" not in allocation.lower()


def test_runtime_can_create_only_through_typed_functions() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for function_name in ("create_customer", "create_supplier", "create_product_draft"):
        assert f"GRANT EXECUTE ON FUNCTION erp_master_commands.{function_name}(" in sql
    assert "GRANT USAGE ON SCHEMA erp_master_commands TO erp_runtime" in sql
    for relation in (
        "catalog.products",
        "parties.customer_accounts",
        "parties.supplier_accounts",
    ):
        assert f"REVOKE INSERT ON TABLE {relation} FROM erp_app,erp_runtime;" in sql
    assert "GRANT SELECT ON TABLE core.master_code_sequences" not in sql
    assert "GRANT INSERT ON TABLE core.master_code_sequences" not in sql


@pytest.mark.parametrize(
    ("model", "payload", "field"),
    [
        (
            canonical_erp_reads.CanonicalProductDraftCreate,
            {"product_name": "Product", "product_kind": "medicine", "product_code": "P-1"},
            "product_code",
        ),
        (
            canonical_erp_reads.CanonicalCustomerCreate,
            {
                "customer_name": "Customer", "customer_type": "organization",
                "primary_phone": "9876543210", "credit_limit": "0.00",
                "credit_days": 0, "customer_code": "C-1",
            },
            "customer_code",
        ),
        (
            canonical_erp_reads.CanonicalSupplierCreate,
            {"supplier_name": "Supplier", "payment_days": 30, "supplier_code": "S-1"},
            "supplier_code",
        ),
    ],
)
def test_public_create_contract_rejects_code_injection(model, payload, field) -> None:
    with pytest.raises(ValidationError) as error:
        model.model_validate(payload)
    assert any(item["loc"] == (field,) for item in error.value.errors())
    assert field not in model.model_json_schema()["properties"]


def test_routes_require_bounded_idempotency_and_use_typed_commands() -> None:
    source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")

    assert source.count('alias="X-Idempotency-Key"') == 9
    assert source.count("min_length=8") >= 6
    assert source.count("max_length=128") >= 6
    for command in ("create_customer", "create_supplier", "create_product_draft"):
        assert f"erp_master_commands.{command}(" in source
    assert 'response.headers["X-Idempotency-Replayed"]' in source


def test_rest_and_mcp_share_canonical_master_command_helpers() -> None:
    rest_source = Path(canonical_erp_reads.__file__).read_text(encoding="utf-8")
    mcp_source = Path(mcp_master_commands.__file__).read_text(encoding="utf-8")

    for helper_name, command_name in (
        ("_execute_canonical_product_create", "create_product_draft"),
        ("_execute_canonical_customer_create", "create_customer"),
        ("_execute_canonical_supplier_create", "create_supplier"),
    ):
        assert rest_source.count(helper_name) >= 2
        assert mcp_source.count(helper_name) >= 2
        assert f"erp_master_commands.{command_name}" in rest_source
    assert rest_source.count("_execute_canonical_product_setup") >= 2
    assert "canonical_write_commands.configure_product_draft" in rest_source
    assert "CanonicalProductSetupWrite" in mcp_source
    assert "configure_product_draft_idempotent" in mcp_source
    idempotent_setup_sql = (
        ROOT / "backend/alembic/sql/20260829_0055_mcp_product_setup_idempotency.sql"
    ).read_text(encoding="utf-8")
    assert "FROM erp_master_commands.configure_product_draft(" in idempotent_setup_sql
    assert "erp_core_commands.claim(" in idempotent_setup_sql
    assert "erp_core_commands.finish_claim(" in idempotent_setup_sql
    assert mcp_source.count("erp_master_commands.") == 0
    assert "erp_master_commands.create_product_draft" not in mcp_source
    assert "erp_master_commands.configure_product_draft(" not in mcp_source
    assert "INSERT INTO catalog.products" not in mcp_source
    assert "INSERT INTO parties.customer_accounts" not in mcp_source
    assert "INSERT INTO parties.supplier_accounts" not in mcp_source

    assert set(mcp_master_contract.MASTER_WRITE_POLICIES) == {
        "catalog.product_draft.create",
        "catalog.product_draft.configure",
        "catalog.product.activate",
        "catalog.product_category.create",
        "catalog.product_manufacturer.create",
        "parties.customer.create",
        "parties.supplier.create",
        "parties.customer.update",
        "parties.supplier.update",
        "compliance.wholesale_license.record",
    }
    assert all(
        policy.branch_fields == ()
        for policy in mcp_master_contract.MASTER_WRITE_POLICIES.values()
    )
    assert mcp_master_contract.MASTER_WRITE_POLICIES[
        "catalog.product.activate"
    ].risk_class == "consequential_write"
    assert mcp_master_contract.MASTER_WRITE_POLICIES[
        "compliance.wholesale_license.record"
    ].risk_class == "consequential_write"
    assert all(
        policy.risk_class == "reversible_write"
        for key, policy in mcp_master_contract.MASTER_WRITE_POLICIES.items()
        if key not in {
            "catalog.product.activate", "compliance.wholesale_license.record"
        }
    )


@pytest.mark.parametrize(
    ("model", "payload", "field"),
    [
        (
            mcp_master_commands.MCPProductDraftCreate,
            {
                "product_name": "Product",
                "product_kind": "medicine",
                "product_code": "FORGED",
                "idempotency_key": "mcp-product-create-0001",
            },
            "product_code",
        ),
        (
            mcp_master_commands.MCPCustomerCreate,
            {
                "customer_name": "Customer",
                "customer_type": "organization",
                "primary_phone": "9876543210",
                "credit_limit": "0.00",
                "credit_days": 0,
                "customer_code": "FORGED",
                "idempotency_key": "mcp-customer-create-0001",
            },
            "customer_code",
        ),
        (
            mcp_master_commands.MCPSupplierCreate,
            {
                "supplier_name": "Supplier",
                "payment_days": 30,
                "supplier_code": "FORGED",
                "idempotency_key": "mcp-supplier-create-0001",
            },
            "supplier_code",
        ),
    ],
)
def test_mcp_master_create_contract_rejects_code_injection(model, payload, field) -> None:
    with pytest.raises(ValidationError) as error:
        model.model_validate(payload)
    assert any(item["loc"] == (field,) for item in error.value.errors())


def test_mcp_product_setup_reuses_exact_browser_setup_contract() -> None:
    product_id = "33333333-3333-7333-8333-333333333333"
    manufacturer_id = "44444444-4444-7444-8444-444444444444"
    payload = {
        "product_id": product_id,
        "idempotency_key": "mcp-product-setup-0001",
        "row_version": 1,
        "manufacturer_party_id": manufacturer_id,
        "base_uom_code": "EA",
        "hsn_code": "3004",
        "dosage_form": "Tablet",
        "strength_display": "500 mg",
        "pack_conversions": [{"uom_code": "STRIP", "multiplier": "10"}],
        "ingredients": [],
    }

    mcp_setup = mcp_master_commands.MCPProductSetup.model_validate(payload)
    browser_setup = canonical_erp_reads.CanonicalProductSetupWrite.model_validate(
        mcp_setup.model_dump(exclude={"product_id", "idempotency_key"})
    )

    assert str(mcp_setup.product_id) == product_id
    assert browser_setup.model_dump(mode="json") == {
        "row_version": 1,
        "category_id": None,
        "manufacturer_party_id": manufacturer_id,
        "base_uom_code": "EA",
        "dosage_form": "Tablet",
        "strength_display": "500 mg",
        "hsn_code": "3004",
        "cold_chain_required": False,
        "minimum_storage_celsius": None,
        "maximum_storage_celsius": None,
        "shelf_life_days": None,
        "gtin": None,
        "pack_conversions": [{"uom_code": "STRIP", "multiplier": "10"}],
        "ingredients": [],
    }


def test_mcp_product_create_and_setup_handlers_return_the_write_result(monkeypatch) -> None:
    calls = []

    def run(db, context, operation_key, execute):
        calls.append((db, context, operation_key, execute))
        if operation_key == "catalog.product_draft.create":
            return {"product_code": "PROD-000001"}
        return {
            "product_id": "33333333-3333-7333-8333-333333333333",
            "product_code": "PROD-000001",
            "product_name": "Dolo 500",
            "new_row_version": 2,
            "idempotency_replayed": False,
        }

    monkeypatch.setattr(mcp_master_commands, "_run_master_write", run)
    context = object()
    db = object()
    created = mcp_master_commands.create_product_draft(
        mcp_master_commands.MCPProductDraftCreate.model_validate({
            "product_name": "Dolo 500",
            "product_kind": "medicine",
            "idempotency_key": "mcp-product-create-0001",
        }),
        context,
        db,
    )
    configured = mcp_master_commands.configure_product_draft(
        mcp_master_commands.MCPProductSetup.model_validate({
            "product_id": "33333333-3333-7333-8333-333333333333",
            "idempotency_key": "mcp-product-setup-0001",
            "row_version": 1,
            "manufacturer_party_id": "44444444-4444-7444-8444-444444444444",
            "base_uom_code": "EA",
            "hsn_code": "3004",
        }),
        context,
        db,
    )

    assert created == {"product_code": "PROD-000001"}
    assert configured["message"] == "Product details saved for review"
    assert configured["lifecycle_status"] == "draft"
    assert [item[2] for item in calls] == [
        "catalog.product_draft.create",
        "catalog.product_draft.configure",
    ]


def test_unknown_database_failure_is_not_mislabeled_as_a_conflict() -> None:
    class UnknownDatabaseFailure(Exception):
        pgcode = "XX999"

    error = DBAPIError("typed command", {}, UnknownDatabaseFailure(), False)
    with pytest.raises(DBAPIError) as raised:
        canonical_erp_reads._raise_master_create_database_error(error)
    assert raised.value is error

    class ReviewedConflict(Exception):
        pgcode = "23505"

    conflict = DBAPIError("typed command", {}, ReviewedConflict(), False)
    with pytest.raises(HTTPException) as mapped:
        canonical_erp_reads._raise_master_create_database_error(conflict)
    assert mapped.value.status_code == 409


def test_demo_provisioner_uses_canonical_organization_onboarding() -> None:
    demo = (
        ROOT / "backend/scripts/provision_canonical_demo.py"
    ).read_text(encoding="utf-8")

    assert "INSERT INTO core.master_code_sequences" not in demo
    assert "canonical organization onboarding did not provision master codes" in demo


def test_postgres_acceptance_is_wired_into_the_alembic_gate() -> None:
    gate = (
        ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    assert "check_master_code_sequence_runtime_role.py" in gate
