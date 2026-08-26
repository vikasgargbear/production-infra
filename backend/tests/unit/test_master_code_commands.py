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


ROOT = Path(__file__).parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0027_master_code_commands.sql"
REVISION = ROOT / "backend/alembic/versions/20260826_0027_master_code_commands.py"
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
    source = SQL.read_bytes()

    assert revision.revision == "20260826_0027"
    assert revision.down_revision == "20260826_0026"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(source).hexdigest()
    assert canonical_erp_reads.__name__

    deployment = _load(
        ROOT / "backend/app/infrastructure/operator_actions/deployment_contract.py",
        "master_code_deployment_contract",
    )
    assert deployment.EXPECTED_CANONICAL_ALEMBIC_HEAD == revision.revision


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

    assert source.count('alias="X-Idempotency-Key"') == 3
    assert source.count("min_length=8") >= 3
    assert source.count("max_length=128") >= 3
    for command in ("create_customer", "create_supplier", "create_product_draft"):
        assert f"erp_master_commands.{command}(" in source
    assert 'response.headers["X-Idempotency-Replayed"]' in source


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


def test_demo_prefixes_are_reviewed_fixture_configuration_only() -> None:
    demo = (
        ROOT / "backend/scripts/provision_canonical_demo.py"
    ).read_text(encoding="utf-8")
    production_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "backend/app").rglob("*.py")
    ) + SQL.read_text(encoding="utf-8")

    for prefix in ("DEMO-CUST-", "DEMO-SUP-", "DEMO-PROD-"):
        assert prefix in demo
        assert prefix not in production_sources
    assert "DEMO_MASTER_CODE_CONFIGURATION" in demo


def test_postgres_acceptance_is_wired_into_the_alembic_gate() -> None:
    gate = (
        ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    assert "check_master_code_sequence_runtime_role.py" in gate
