"""Product drafts must not accept or infer regulated and tax facts."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.schemas.master.product_schema import ProductCreate, ProductUpdate
from app.api.routes.master.products.routes import _build_product_draft_data
from app.api.services.master.product.service import ProductService
from app.main import app


FORBIDDEN_AUTHORITY_FIELDS = {
    "hsn_code": "3004",
    "gst_percent": 12,
    "gst_rate": 12,
    "drug_schedule": "H1",
    "schedule": "H1",
    "is_narcotic": True,
    "is_controlled": True,
    "is_controlled_substance": True,
    "requires_prescription": True,
    "schedule_h2_applicable_from": "2027-07-01",
    "traceability_product_code": "GTIN-UNVERIFIED",
    "regulatory_ruleset_version": "client-asserted",
    "composition": {"active": "Unverified"},
    "initial_quantity": 100,
    "mrp_per_unit": 50,
}


@pytest.mark.parametrize("field,value", FORBIDDEN_AUTHORITY_FIELDS.items())
def test_create_rejects_unverified_or_separate_command_fields(field, value):
    with pytest.raises(ValidationError) as exc_info:
        ProductCreate(product_name="Draft product", **{field: value})

    assert any(error["type"] == "extra_forbidden" for error in exc_info.value.errors())


def test_schedule_h2_is_not_a_drug_schedule_alias():
    with pytest.raises(ValidationError):
        ProductCreate(product_name="Draft product", drug_schedule="H2")


def test_draft_contract_has_one_canonical_name_for_each_field():
    product = ProductCreate(
        product_name="Draft product",
        product_kind="medicine",
        maintain_batch=True,
        maintain_expiry=True,
    )

    assert product.model_dump() == {
        "product_name": "Draft product",
        "product_code": None,
        "generic_name": None,
        "brand": None,
        "manufacturer": None,
        "category_id": None,
        "type_id": None,
        "product_kind": "medicine",
        "reorder_level": None,
        "min_stock_quantity": None,
        "max_stock_quantity": None,
        "maintain_batch": True,
        "maintain_expiry": True,
    }


def test_update_rejects_unknown_fields_and_empty_payload():
    with pytest.raises(ValidationError):
        ProductUpdate()
    with pytest.raises(ValidationError):
        ProductUpdate(brand_name="Legacy alias")
    with pytest.raises(ValidationError):
        ProductUpdate(gst_percent=12)


def test_stock_level_relationship_is_validated():
    with pytest.raises(ValidationError, match="min_stock_quantity"):
        ProductCreate(
            product_name="Draft product",
            min_stock_quantity=20,
            max_stock_quantity=10,
        )


def test_new_product_is_an_inactive_non_transactional_draft():
    data = _build_product_draft_data(
        ProductCreate(product_name="Draft product"),
        "PROD-001",
    )

    assert data["is_active"] is False
    assert data["is_saleable"] is False
    assert data["is_purchasable"] is False
    assert data["hsn_code"] is None
    assert data["gst_percent"] is None


def test_openapi_publishes_strict_named_product_mutations():
    schema = app.openapi()
    create = schema["paths"]["/api/products/"]["post"]
    update = schema["paths"]["/api/products/{product_id}"]["put"]

    assert create["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProductCreate"
    }
    assert update["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProductUpdate"
    }
    assert create["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProductMutationResponse"
    }
    assert update["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ProductMutationResponse"
    }
    for component in ("ProductCreate", "ProductUpdate", "ProductMutationResponse"):
        assert schema["components"]["schemas"][component]["additionalProperties"] is False


class MissingProductDatabase:
    writes = 0

    def execute(self, statement, params):
        if "SELECT product_id" not in str(statement):
            self.writes += 1
        return self

    def fetchone(self):
        return None


def test_purchase_lookup_does_not_implicitly_create_unclassified_product():
    database = MissingProductDatabase()

    with pytest.raises(ValueError, match="Create and classify a product draft"):
        ProductService.get_or_create_product(
            database,
            org_id="00000000-0000-0000-0000-000000000001",
            product_name="Unknown medicine",
            hsn_code="3004",
        )

    assert database.writes == 0


class CapturingSearchDatabase:
    def __init__(self):
        self.statement = ""

    def execute(self, statement, params):
        self.statement = str(statement)
        return []


def test_transactional_search_requires_active_and_saleable_product():
    database = CapturingSearchDatabase()

    assert ProductService.search_products(database, "Draft") == []
    assert "p.is_active = true" in database.statement
    assert "p.is_saleable = true" in database.statement


def test_product_route_has_no_raw_dict_mutation_body_or_initial_batch_side_effect():
    route_source = (
        Path(__file__).resolve().parents[2]
        / "app/api/routes/master/products/routes.py"
    ).read_text(encoding="utf-8")

    create_section = route_source.split("async def create_product", 1)[1].split(
        "async def get_product", 1
    )[0]
    assert "product: ProductCreate" in create_section
    assert "create_initial_batch" not in create_section
    assert "gst_percent" not in create_section.split("product_data =", 1)[0]
