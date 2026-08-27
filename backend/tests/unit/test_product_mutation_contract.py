"""Canonical product drafts cannot accept or infer regulated tax facts."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.routes.canonical_erp_reads import (
    CanonicalProductDraftCreate,
    CanonicalProductDraftUpdate,
)
from app.main import app


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
FORBIDDEN_REGULATORY_FIELDS = {
    "hsn_code",
    "gst_percent",
    "gst_rate",
    "tax_percent",
    "drug_schedule",
    "requires_prescription",
    "regulatory_ruleset_version",
    "initial_quantity",
    "mrp_per_unit",
}


@pytest.mark.parametrize("field", sorted(FORBIDDEN_REGULATORY_FIELDS))
def test_product_draft_create_rejects_browser_owned_regulatory_fact(field):
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        CanonicalProductDraftCreate.model_validate({
            "product_name": "Reviewed later",
            "product_kind": "medicine",
            field: "18",
        })


def test_product_draft_create_serializes_only_identity_facts():
    draft = CanonicalProductDraftCreate.model_validate({
        "product_name": "  Saline  ",
        "generic_name": "  Sodium chloride  ",
        "product_kind": "medicine",
    })

    assert draft.model_dump() == {
        "product_name": "Saline",
        "generic_name": "Sodium chloride",
        "product_kind": "medicine",
    }


@pytest.mark.parametrize("payload", [{}, {"gst_percent": "18"}, {"unknown": True}])
def test_product_draft_update_rejects_empty_or_unowned_fields(payload):
    with pytest.raises(ValidationError):
        CanonicalProductDraftUpdate.model_validate(payload)


def test_openapi_exposes_only_canonical_product_draft_mutations():
    paths = app.openapi()["paths"]

    assert "post" in paths["/api/products/"]
    assert "put" in paths["/api/products/{product_id}"]
    assert "delete" in paths["/api/products/{product_id}"]
    schemas = app.openapi()["components"]["schemas"]
    create_properties = set(schemas["CanonicalProductDraftCreate"]["properties"])
    update_properties = set(schemas["CanonicalProductDraftUpdate"]["properties"])
    assert create_properties == {
        "product_name",
        "generic_name",
        "product_kind",
    }
    assert update_properties == {
        "row_version",
        "product_name",
        "generic_name",
        "product_kind",
    }
    assert schemas["CanonicalProductDraftUpdate"]["required"] == ["row_version"]
    assert not FORBIDDEN_REGULATORY_FIELDS & (create_properties | update_properties)


def test_legacy_product_router_and_service_are_retired():
    assert not (
        REPOSITORY_ROOT / "backend/app/api/routes/master/products/routes.py"
    ).exists()
    assert not (
        REPOSITORY_ROOT / "backend/app/api/services/master/product/service.py"
    ).exists()
