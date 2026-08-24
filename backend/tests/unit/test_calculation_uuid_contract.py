from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.api.schemas.calculations import InvoiceCalculationRequest


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
