from __future__ import annotations

import hashlib
import importlib.util
import inspect
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import Response
from pydantic import ValidationError

from app.api.routes import canonical_erp_reads
from app.infrastructure import canonical_write_commands


ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "database/canonical/operations/master/product_setup_commands.sql"
GENERATOR = ROOT / "backend/scripts/generate_canonical_product_setup_migration.py"
MIGRATION = ROOT / "backend/alembic/sql/20260828_0049_canonical_product_setup.sql"
REVISION = ROOT / "backend/alembic/versions/20260828_0049_canonical_product_setup.py"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_reviewed_product_setup_source_generates_hash_bound_linear_migration():
    generator = _load(GENERATOR, "product_setup_generator")
    revision = _load(REVISION, "product_setup_revision")
    migration_bytes = MIGRATION.read_bytes()

    assert generator.render().encode() == migration_bytes
    assert revision.revision == "20260828_0049"
    assert revision.down_revision == "20260828_0048"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration_bytes).hexdigest()


def test_one_database_owner_controls_setup_readiness_and_activation():
    source = SOURCE.read_text(encoding="utf-8")
    migration = MIGRATION.read_text(encoding="utf-8")
    adapter = inspect.getsource(canonical_write_commands)
    route = inspect.getsource(canonical_erp_reads)

    for function in (
        "product_setup_missing_fields",
        "configure_product_draft",
        "activate_configured_product",
    ):
        assert source.count(f"CREATE FUNCTION erp_master_commands.{function}(") == 1
    assert "erp_regulatory_commands.activate_product" in source
    assert "only an unused product draft can be configured" in source
    assert "REVOKE INSERT,UPDATE,DELETE ON TABLE catalog.uom_conversions" in migration
    assert "REVOKE INSERT,UPDATE,DELETE ON TABLE catalog.product_ingredients" in migration
    assert "INSERT INTO catalog.product_ingredients" not in adapter
    assert "INSERT INTO catalog.product_ingredients" not in route
    assert "erp_master_commands.configure_product_draft" in adapter
    assert "SELECT product_id,product_code,product_name,new_row_version" in adapter
    assert "idempotency_replayed" in adapter
    assert 'activated["idempotency_replayed"]' in route
    assert "release.ruleset_version" in route


def test_product_setup_mutations_use_the_supported_master_edit_permission():
    for route in (
        canonical_erp_reads.configure_product_setup,
        canonical_erp_reads.activate_product_setup,
        canonical_erp_reads.update_product_draft,
    ):
        dependency = inspect.signature(route).parameters["user"].default.dependency
        assert dependency.module == "master"
        assert dependency.permission == "edit"


def test_setup_contract_requires_canonical_manufacturer_hsn_and_typed_composition():
    with pytest.raises(ValidationError):
        canonical_erp_reads.CanonicalProductSetupWrite.model_validate({
            "row_version": 1,
            "base_uom_code": "EA",
            "hsn_code": "3004",
            "cold_chain_required": False,
        })

    valid = canonical_erp_reads.CanonicalProductSetupWrite.model_validate({
        "row_version": 1,
        "manufacturer_party_id": str(uuid4()),
        "base_uom_code": "EA",
        "hsn_code": "3004",
        "cold_chain_required": True,
        "minimum_storage_celsius": 2,
        "maximum_storage_celsius": 8,
        "pack_conversions": [{"uom_code": "STRIP", "multiplier": 10}],
        "ingredients": [{
            "ingredient_id": str(uuid4()),
            "ingredient_role": "active",
            "strength_value": 500,
            "strength_uom_code": "MG",
            "basis_quantity": 1,
            "basis_uom_code": "EA",
        }],
    })
    assert valid.hsn_code == "3004"
    assert valid.pack_conversions[0].multiplier == 10


def test_search_is_ranked_server_side_and_not_unbounded_substring_matching():
    source = inspect.getsource(canonical_erp_reads.products)
    migration = MIGRATION.read_text(encoding="utf-8")

    assert "search_rank" in source
    assert "to_tsquery" in source
    assert "manufacturer.legal_name" in source
    assert "ingredient.normalized_name" in source
    assert "ILIKE :pattern" not in source
    assert "products_search_document_idx" in migration
    assert "products_search_name_lower_idx" in migration


def test_batch_owned_facts_never_enter_product_setup_contract():
    properties = set(
        canonical_erp_reads.CanonicalProductSetupWrite.model_json_schema()["properties"]
    )
    assert not {
        "batch_number",
        "manufactured_on",
        "expiry_date",
        "mrp",
        "purchase_cost",
        "opening_quantity",
    } & properties


class _CommitOnlyDatabase:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1


def test_setup_and_activation_routes_read_back_identity_and_honest_replay(monkeypatch):
    org_id = uuid4()
    product_id = uuid4()
    manufacturer_id = uuid4()
    database = _CommitOnlyDatabase()
    monkeypatch.setattr(canonical_erp_reads, "_activate", lambda _db, _user: org_id)
    monkeypatch.setattr(
        canonical_write_commands,
        "configure_product_draft",
        lambda _db, **_parameters: {
            "product_id": product_id,
            "product_code": "PROD-000042",
            "product_name": "Paracetamol 500 mg",
            "new_row_version": 2,
        },
    )
    configured = canonical_erp_reads.configure_product_setup(
        product_id,
        canonical_erp_reads.CanonicalProductSetupWrite.model_validate({
            "row_version": 1,
            "manufacturer_party_id": manufacturer_id,
            "base_uom_code": "EA",
            "hsn_code": "3004",
            "cold_chain_required": False,
        }),
        user={},
        db=database,
    )
    assert configured == {
        "product_id": product_id,
        "product_code": "PROD-000042",
        "product_name": "Paracetamol 500 mg",
        "row_version": 2,
        "lifecycle_status": "draft",
        "message": "Product setup saved and checked",
    }

    monkeypatch.setattr(
        canonical_write_commands,
        "activate_configured_product",
        lambda _db, **_parameters: {
            "product_id": product_id,
            "product_code": "PROD-000042",
            "product_name": "Paracetamol 500 mg",
            "new_row_version": 3,
            "idempotency_replayed": True,
        },
    )
    response = Response()
    activated = canonical_erp_reads.activate_product_setup(
        product_id,
        canonical_erp_reads.CanonicalProductActivationWrite(row_version=2),
        response=response,
        idempotency_key="product-activation-test",
        user={},
        db=database,
    )
    assert activated["product_code"] == "PROD-000042"
    assert activated["product_name"] == "Paracetamol 500 mg"
    assert response.headers["X-Idempotency-Replayed"] == "true"
    assert database.commits == 2
