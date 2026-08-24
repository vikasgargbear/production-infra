from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.schemas.calculations import (
    InvoiceCalculationRequest,
    SalesOrderCalculationRequest,
)


def _request(**overrides):
    values = {
        "customer_id": uuid4(),
        "items": [{
            "product_id": uuid4(),
            "quantity": 1,
            "unit_price": 150,
        }],
    }
    values.update(overrides)
    return InvoiceCalculationRequest.model_validate(values)


def test_invoice_preview_accepts_canonical_uuid_ids():
    request = _request()

    assert request.customer_id is not None
    assert request.items[0].product_id is not None


def test_sales_order_preview_accepts_canonical_customer_product_and_batch_ids():
    customer_id = uuid4()
    product_id = uuid4()
    batch_id = uuid4()

    request = SalesOrderCalculationRequest.model_validate({
        "customer_id": customer_id,
        "gst_type": "CGST/SGST",
        "items": [{
            "product_id": product_id,
            "batch_id": batch_id,
            "quantity": 1,
            "unit_price": 100,
            "tax_percent": 12,
        }],
    })

    assert request.customer_id == customer_id
    assert request.items[0].product_id == product_id
    assert request.items[0].batch_id == batch_id


def test_invoice_preview_keeps_legacy_positive_integer_ids():
    request = _request(
        customer_id=7,
        items=[{"product_id": 8, "quantity": 1, "unit_price": 150}],
    )

    assert request.customer_id == 7
    assert request.items[0].product_id == 8


@pytest.mark.parametrize("field", ["customer_id", "product_id"])
def test_invoice_preview_rejects_non_positive_integer_ids(field):
    values = {"customer_id": 7, "product_id": 8}
    values[field] = 0

    with pytest.raises(ValidationError):
        _request(
            customer_id=values["customer_id"],
            items=[{
                "product_id": values["product_id"],
                "quantity": 1,
                "unit_price": 150,
            }],
        )
