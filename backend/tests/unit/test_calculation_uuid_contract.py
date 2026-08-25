from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.schemas.calculations import (
    InvoiceCalculationRequest,
    SalesOrderCalculationRequest,
)


def _request(**overrides):
    values = {
        "branch_id": uuid4(),
        "customer_id": uuid4(),
        "document_date": date(2026, 8, 25),
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
        "branch_id": uuid4(),
        "customer_id": customer_id,
        "order_date": date(2026, 8, 25),
        "items": [{
            "product_id": product_id,
            "batch_id": batch_id,
            "quantity": 1,
            "unit_price": 100,
        }],
    })

    assert request.customer_id == customer_id
    assert request.items[0].product_id == product_id
    assert request.items[0].batch_id == batch_id


def test_invoice_preview_rejects_legacy_positive_integer_ids():
    with pytest.raises(ValidationError):
        _request(
            customer_id=7,
            items=[{"product_id": 8, "quantity": 1, "unit_price": 150}],
        )


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
