from __future__ import annotations

import hashlib
from pathlib import Path

from app.domain.operator_actions.contract import PREPARE_PAYLOAD_MODELS
from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "backend/alembic/sql/20260825_0011_sales_delivery_address_authority.sql"
REVISION_PATH = ROOT / "backend/alembic/versions/20260825_0011_sales_delivery_address_authority.py"
READ_API_PATH = ROOT / "backend/app/api/routes/canonical_erp_reads.py"


def test_sales_address_migration_is_hash_bound_and_linear() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    revision = REVISION_PATH.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert 'revision = "20260825_0011"' in revision
    assert 'down_revision = "20260825_0010"' in revision
    assert digest in revision
    assert "SET LOCAL ROLE erp_migration_owner" in sql
    assert "pg_catalog.pg_get_functiondef" in sql
    assert "differs from reviewed migration precondition" in sql
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]


def test_sales_resolvers_bind_address_identity_version_and_tax_authority() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    assert "delivery_address_id" in sql
    assert "delivery_address_row_version" in sql
    assert "party_id=customer.party_id" in sql
    assert "party_id=customer_party_id" in sql
    assert "row_version=delivery_address_row_version" in sql
    assert "place_of_supply:=shipping.state_code" in sql
    assert "request_document?'place_of_supply_state_code'" in sql
    assert "request_document?'shipping_address_id'" in sql
    assert "shipping_address_id=shipping.id" in sql
    assert "org_id=organization_id AND id=delivery_address_id" in sql
    assert "valid_from<=invoice_date" in sql
    assert "valid_from<=order_date" in sql


def test_rest_and_mcp_share_required_address_selection_without_state_alias() -> None:
    for operation in ("sales.order.prepare", "sales.invoice.prepare"):
        model = PREPARE_PAYLOAD_MODELS[operation]
        fields = model.model_fields
        assert fields["delivery_address_id"].is_required()
        assert fields["delivery_address_row_version"].is_required()
        assert "place_of_supply_state_code" not in fields
        assert "shipping_address_id" not in fields

        try:
            model.model_validate({"place_of_supply_state_code": "27"})
        except ValidationError as exc:
            errors = exc.errors()
            assert any(error["type"] == "extra_forbidden" for error in errors)
        else:  # pragma: no cover - explicit fail-closed contract
            raise AssertionError("legacy state authority alias was accepted")


def test_customer_address_choice_read_includes_row_version() -> None:
    source = READ_API_PATH.read_text(encoding="utf-8")
    address_route = source.split(
        '@router.get("/customers/{customer_id:uuid}/addresses")', 1
    )[1].split("@router.post(", 1)[0]
    assert "address.id AS address_id" in address_route
    assert "address.row_version" in address_route
    assert "address.state_code" in address_route
