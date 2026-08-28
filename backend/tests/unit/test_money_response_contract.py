from decimal import Decimal

import pytest
from pydantic import TypeAdapter, ValidationError

from app.api.schemas.money import MONEY_JSON_PATTERN, MoneyJSON
from app.core.money import money_json
from app.main import app
from scripts.audit.contract_consistency_audit import (
    _dict_float_money_evidence,
    collect_issues,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (Decimal("0"), "0.00"),
        (Decimal("-0.004"), "0.00"),
        (Decimal("1.005"), "1.01"),
        (Decimal("-1.005"), "-1.01"),
        (Decimal("9999999999999999.99"), "9999999999999999.99"),
        (0.1 + 0.2, "0.30"),
    ],
)
def test_money_json_is_canonical_and_half_up(value, expected):
    assert money_json(value) == expected


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", None, "not-money"])
def test_money_json_rejects_non_finite_or_invalid_values(value):
    with pytest.raises(ValueError):
        money_json(value)


def test_money_json_openapi_type_is_an_exact_two_decimal_string():
    schema = TypeAdapter(MoneyJSON).json_schema(mode="serialization")

    assert schema["type"] == "string"
    assert schema["pattern"] == MONEY_JSON_PATTERN
    assert schema["examples"] == ["1234.50"]
    assert TypeAdapter(MoneyJSON).validate_python("1234.50") == "1234.50"
    with pytest.raises(ValidationError):
        TypeAdapter(MoneyJSON).validate_python("1234.5")


def test_contract_audit_rejects_any_return_to_binary_float_money_serialization():
    codes = {issue.code for issue in collect_issues()}

    assert "MONEY_RESPONSE_FLOAT_SERIALIZATION" not in codes


def test_money_audit_follows_assembled_response_containers(tmp_path):
    route = tmp_path / "assembled_route.py"
    route.write_text(
        """
def route(rows, service):
    results = []
    for row in rows:
        results.append({"amount": float(row.amount)})
    response = {"items": results}
    service.write({"total_amount": float(rows[0].amount)})
    return response

def mutated(rows):
    for row in rows:
        row["unit_price"] = float(row["unit_price"])
    return {"rows": rows}
""",
        encoding="utf-8",
    )

    evidence = _dict_float_money_evidence([route])

    assert any(item.endswith(":5:amount") for item in evidence)
    assert any(item.endswith(":12:unit_price") for item in evidence)
    assert not any("total_amount" in item for item in evidence)
