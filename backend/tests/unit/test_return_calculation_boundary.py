from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.calculations import preview_return_totals
from app.api.schemas.calculations import ReturnCalculationRequest
from app.api.services.returns.return_calculation import ReturnCalculator
from app.core.auth.tenant_service import BranchScope
from app.main import app


def test_return_preview_is_typed_authenticated_and_not_mcp_exported():
    operation = app.openapi()["paths"]["/api/calculations/return"]["post"]

    assert operation["security"] == [{"HTTPBearer": []}]
    assert "x-erp-tool-name" not in operation
    request_schema = operation["requestBody"]["content"]["application/json"]["schema"]
    assert request_schema["$ref"].endswith("/ReturnCalculationRequest")


def test_sales_return_lines_reconcile_with_free_quantity_and_gst_withheld():
    result = ReturnCalculator.calculate_return_totals(
        [{
            "product_id": 11,
            "return_quantity": "3",
            "paid_quantity": "2",
            "free_quantity": "1",
            "unit_price": "100",
            "discount_percent": "10",
            "tax_percent": "18",
        }],
        "IGST",
        include_gst=False,
        cap_to_paid_quantity=True,
        exclude_free_quantity_from_taxable=True,
    )

    line = result["calculated_items"][0]
    assert line["taxable_quantity"] == Decimal("2")
    assert line["taxable_amount"] == Decimal("180.00")
    assert line["tax_amount"] == Decimal("0.00")
    assert result["subtotal"] == Decimal("180.00")
    assert result["total_amount"] == Decimal("180")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("return_type", "permissions", "expected_module"),
    [
        ("sales", {"procurement.purchase_return.create": True}, "sales"),
        ("purchase", {"sales.return.create": True}, "purchase"),
    ],
)
async def test_return_preview_requires_permission_for_the_requested_document_side(
    return_type, permissions, expected_module,
):
    request = ReturnCalculationRequest(
        return_type=return_type,
        customer_id=uuid4() if return_type == "sales" else None,
        supplier_id=uuid4() if return_type == "purchase" else None,
        items=[{
            "return_quantity": "1", "unit_price": "100", "tax_percent": "18",
        }],
    )
    context = SimpleNamespace(
        org_id=uuid4(), user_id=uuid4(), branch_scope=BranchScope.ALL, branch_ids=[],
        primary_branch_id=uuid4(),
    )

    with pytest.raises(HTTPException) as denied:
        await preview_return_totals(
            request, user={"permissions": permissions}, db=object(), context=context,
        )

    assert denied.value.status_code == 403
    assert expected_module in denied.value.detail
