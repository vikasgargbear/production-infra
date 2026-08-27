from __future__ import annotations

import importlib.util
from datetime import date, datetime
from pathlib import Path
import re
from uuid import UUID

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

    order = module.sales_order_payload(
        7,
        business_date=date(2026, 8, 26),
        delivery_offset_days="2",
    )
    invoice = module.sales_invoice_payload(
        [], 7, business_date=date(2026, 8, 26)
    )

    for payload in (order, invoice):
        assert payload["delivery_address_id"] == module.IDS["customer_address"]
        assert payload["delivery_address_row_version"] == "7"
        assert "place_of_supply_state_code" not in payload
        assert "shipping_address_id" not in payload


def test_sales_order_requested_date_is_derived_from_reviewed_authority() -> None:
    module = _module()

    payload = module.sales_order_payload(
        7,
        business_date=date(2026, 8, 26),
        delivery_offset_days="2",
    )

    assert payload["order_date"] == "2026-08-26"
    assert payload["requested_delivery_date"] == "2026-08-28"
    assert module.SOURCE_RETRIEVED_ON.isoformat() not in {
        payload["order_date"],
        payload["requested_delivery_date"],
    }


def test_sales_dispatch_posts_on_business_date_not_future_delivery_plan() -> None:
    module = _module()
    order = module.sales_order_payload(
        7,
        business_date=date(2026, 8, 26),
        delivery_offset_days="2",
    )

    dispatch = module.sales_dispatch_payload(
        str(UUID(int=1)),
        str(UUID(int=2)),
        [
            {
                "batch_id": str(UUID(int=3)),
                "billed_quantity": "12",
                "free_quantity": "2",
            }
        ],
        business_date=date(2026, 8, 26),
        requested_delivery_date=order["requested_delivery_date"],
    )

    assert dispatch["dispatch_date"] == order["order_date"]
    assert (
        dispatch["logistics"]["transport_document_date"]
        == order["order_date"]
    )
    assert dispatch["dispatch_date"] < order["requested_delivery_date"]
    assert dispatch["dispatch_date"] != module.SOURCE_RETRIEVED_ON.isoformat()


@pytest.mark.parametrize(
    "requested_delivery_date", [None, date(2026, 8, 28), "28-08-2026"]
)
def test_sales_dispatch_rejects_noncanonical_delivery_date_authority(
    requested_delivery_date: object,
) -> None:
    module = _module()

    with pytest.raises(ValueError, match="approved order requested delivery date"):
        module.sales_dispatch_payload(
            str(UUID(int=1)),
            str(UUID(int=2)),
            [],
            business_date=date(2026, 8, 26),
            requested_delivery_date=requested_delivery_date,
        )


def test_sales_dispatch_rejects_a_delivery_plan_before_business_date() -> None:
    module = _module()

    with pytest.raises(ValueError, match="precedes the business date"):
        module.sales_dispatch_payload(
            str(UUID(int=1)),
            str(UUID(int=2)),
            [],
            business_date=date(2026, 8, 26),
            requested_delivery_date="2026-08-25",
        )


@pytest.mark.parametrize("delivery_offset_days", ["0", "31", 2, "two"])
def test_sales_order_requested_date_rejects_unreviewed_offsets(
    delivery_offset_days: object,
) -> None:
    module = _module()

    with pytest.raises(ValueError, match="reviewed integer from 1 through 30"):
        module.sales_order_payload(
            7,
            business_date=date(2026, 8, 26),
            delivery_offset_days=delivery_offset_days,
        )


@pytest.mark.parametrize("business_date", ["2026-08-26", datetime(2026, 8, 26)])
def test_sales_order_requested_date_rejects_non_date_authority(
    business_date: object,
) -> None:
    module = _module()

    with pytest.raises(ValueError, match="authoritative organization business date"):
        module.sales_order_payload(
            7,
            business_date=business_date,
            delivery_offset_days="2",
        )


def test_demo_identity_rejects_an_invalid_organization_pan_before_database_use() -> None:
    module = _module()

    with pytest.raises(ValueError, match="canonical PAN shape"):
        module.bootstrap_identity(object(), organization_pan="NOT-A-PAN")


def test_live23_customer_identities_and_gstins_are_run_derived() -> None:
    module = _module()

    for key in (
        "interstate_customer_party",
        "interstate_customer_account",
        "interstate_customer_address",
        "interstate_customer_gstin",
        "sez_customer_party",
        "sez_customer_account",
        "sez_customer_address",
        "sez_customer_gstin",
    ):
        UUID(module.IDS[key])
        assert module.IDS[key] == module.demo_ui_fixture_uuid(key)
    for gstin in (module.INTERSTATE_CUSTOMER_GSTIN, module.SEZ_CUSTOMER_GSTIN):
        assert re.fullmatch(
            r"29[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]",
            gstin,
        )
        alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        factor = 2
        total = 0
        for character in reversed(gstin[:-1]):
            product = alphabet.index(character) * factor
            total += product // 36 + product % 36
            factor = 1 if factor == 2 else 2
        assert gstin[-1] == alphabet[(36 - total % 36) % 36]
    assert module.INTERSTATE_CUSTOMER_GSTIN != module.SEZ_CUSTOMER_GSTIN


@pytest.mark.parametrize("row_version", [0, -1, True])
def test_sales_payloads_reject_invalid_delivery_address_versions(
    row_version: int,
) -> None:
    module = _module()

    with pytest.raises(ValueError, match="positive integer"):
        module.sales_order_payload(
            row_version,
            business_date=date(2026, 8, 26),
            delivery_offset_days="2",
        )
    with pytest.raises(ValueError, match="positive integer"):
        module.sales_invoice_payload(
            [], row_version, business_date=date(2026, 8, 26)
        )
