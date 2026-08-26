from __future__ import annotations

import importlib.util
from pathlib import Path
from uuid import uuid4

import pytest


SCRIPT = Path(__file__).parents[2] / "scripts" / "exercise_staging_mcp_oauth.py"
SPEC = importlib.util.spec_from_file_location("exercise_staging_mcp_oauth", SCRIPT)
assert SPEC and SPEC.loader
exercise = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exercise)


def _customer_resolution(addresses):
    return {
        "match_state": "exact_match",
        "requires_selection": False,
        "exact_match_count": 1,
        "results": [
            {
                "customer_account_id": exercise.DEMO_CUSTOMER_ACCOUNT_ID,
                "primary_delivery_addresses": addresses,
            }
        ],
    }


def test_customer_delivery_address_uses_one_authoritative_resolved_identity() -> None:
    address_id = str(uuid4())

    assert exercise._customer_delivery_address(
        _customer_resolution(
            [{
                "delivery_address_id": address_id,
                "delivery_address_row_version": 7,
                "address_kind": "shipping",
                "is_primary": True,
            }]
        )
    ) == (address_id, "7")


@pytest.mark.parametrize(
    "addresses",
    [
        [],
        [
            {
                "delivery_address_id": str(uuid4()),
                "delivery_address_row_version": 1,
            },
            {
                "delivery_address_id": str(uuid4()),
                "delivery_address_row_version": 2,
            },
        ],
    ],
)
def test_customer_delivery_address_rejects_missing_or_ambiguous_authority(addresses) -> None:
    with pytest.raises(exercise.ExerciseError, match="one exact active primary"):
        exercise._customer_delivery_address(_customer_resolution(addresses))


@pytest.mark.parametrize(
    "address_id,row_version,message",
    [
        ("not-a-uuid", 1, "invalid UUID"),
        (str(uuid4()), 0, "invalid row version"),
        (str(uuid4()), True, "invalid row version"),
        (str(uuid4()), "7", "invalid row version"),
    ],
)
def test_customer_delivery_address_rejects_malformed_authority(
    address_id, row_version, message: str
) -> None:
    with pytest.raises(exercise.ExerciseError, match=message):
        exercise._customer_delivery_address(
            _customer_resolution(
                [{
                    "delivery_address_id": address_id,
                    "delivery_address_row_version": row_version,
                    "address_kind": "shipping",
                    "is_primary": True,
                }]
            )
        )


def test_customer_delivery_address_rejects_ineligible_address() -> None:
    with pytest.raises(exercise.ExerciseError, match="ineligible primary"):
        exercise._customer_delivery_address(
            _customer_resolution(
                [{
                    "delivery_address_id": str(uuid4()),
                    "delivery_address_row_version": 1,
                    "address_kind": "warehouse",
                    "is_primary": False,
                }]
            )
        )


def test_customer_delivery_address_rejects_wrong_customer_identity() -> None:
    payload = _customer_resolution(
        [{
            "delivery_address_id": str(uuid4()),
            "delivery_address_row_version": 1,
            "address_kind": "shipping",
            "is_primary": True,
        }]
    )
    payload["results"][0]["customer_account_id"] = str(uuid4())

    with pytest.raises(exercise.ExerciseError, match="canonical demo customer"):
        exercise._customer_delivery_address(payload)


@pytest.mark.parametrize(
    "field,value",
    [
        ("match_state", "ambiguous"),
        ("exact_match_count", True),
        ("exact_match_count", 2),
        ("requires_selection", True),
    ],
)
def test_customer_delivery_address_rejects_nonexact_customer_authority(
    field: str, value
) -> None:
    payload = _customer_resolution(
        [{
            "delivery_address_id": str(uuid4()),
            "delivery_address_row_version": 1,
            "address_kind": "shipping",
            "is_primary": True,
        }]
    )
    payload[field] = value

    with pytest.raises(exercise.ExerciseError, match="one exact customer"):
        exercise._customer_delivery_address(payload)


def _documents():
    resource_id = "0198ea37-2b21-7c8d-9123-123456789abc"
    prepared = {"financial_impact": [{"currency_code": "INR", "grand_total": "1650.00"}]}
    executed = {"status": "succeeded", "resource_id": resource_id}
    status = {"status": "succeeded", "resource_id": resource_id}
    readback = {
        "match_state": "matched",
        "matched_count": 1,
        "document": {
            "sales_order_id": resource_id,
            "grand_total": "1650.00",
            "lines": [{
                "base_billed_quantity": "12.000000",
                "base_free_quantity": "2.000000",
                "quoted_unit_rate": "125.5000",
                "line_total": "1650.00",
            }],
        },
    }
    return prepared, executed, status, readback


def test_sales_order_readback_preserves_resource_quantities_and_preview_total() -> None:
    exact = exercise._verify_sales_order_readback(*_documents())

    assert exact == {
        "sales_order_id": "0198ea37-2b21-7c8d-9123-123456789abc",
        "grand_total": "1650.00",
        "base_billed_quantity": "12.000000",
        "base_free_quantity": "2.000000",
        "quoted_unit_rate": "125.5000",
        "line_total": "1650.00",
    }


@pytest.mark.parametrize(
    "mutation, message",
    [
        (lambda parts: parts[3]["document"].update(grand_total="1649.99"), "total drifted"),
        (lambda parts: parts[3]["document"]["lines"][0].update(base_free_quantity="3.000000"), "differs from the command input"),
        (lambda parts: parts[2].update(resource_id="0198ea37-2b21-7c8d-9123-000000000000"), "stable sales-order resource UUID"),
    ],
)
def test_sales_order_readback_rejects_cross_boundary_drift(mutation, message: str) -> None:
    documents = _documents()
    mutation(documents)

    with pytest.raises(exercise.ExerciseError, match=message):
        exercise._verify_sales_order_readback(*documents)
