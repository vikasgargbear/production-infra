from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


SCRIPT = Path(__file__).parents[2] / "scripts" / "exercise_staging_mcp_oauth.py"
SPEC = importlib.util.spec_from_file_location("exercise_staging_mcp_oauth", SCRIPT)
assert SPEC and SPEC.loader
exercise = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exercise)


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
