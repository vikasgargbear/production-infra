from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_demo.py"


def _module():
    spec = importlib.util.spec_from_file_location(
        "provision_canonical_demo_sales_address", SCRIPT
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_sales_payloads_bind_the_exact_selected_delivery_address_version() -> None:
    module = _module()

    order = module.sales_order_payload(7)
    invoice = module.sales_invoice_payload([], 7)

    for payload in (order, invoice):
        assert payload["delivery_address_id"] == module.IDS["customer_address"]
        assert payload["delivery_address_row_version"] == "7"
        assert "place_of_supply_state_code" not in payload
        assert "shipping_address_id" not in payload


def test_demo_identity_rejects_an_invalid_organization_pan_before_database_use() -> None:
    module = _module()

    with pytest.raises(ValueError, match="canonical PAN shape"):
        module.bootstrap_identity(object(), organization_pan="NOT-A-PAN")


@pytest.mark.parametrize("row_version", [0, -1, True])
def test_sales_payloads_reject_invalid_delivery_address_versions(
    row_version: int,
) -> None:
    module = _module()

    with pytest.raises(ValueError, match="positive integer"):
        module.sales_order_payload(row_version)
    with pytest.raises(ValueError, match="positive integer"):
        module.sales_invoice_payload([], row_version)
