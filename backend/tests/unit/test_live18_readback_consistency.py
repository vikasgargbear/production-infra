from __future__ import annotations

from copy import deepcopy

import pytest

from tests.live_acceptance.readback_consistency import (
    FIELDS_BY_OPERATION,
    assert_canonical_projection_consistency,
)
from tests.live_canonical.reconciliation import RESOURCE_TABLES


def _assign_path(target: dict, path: str, value: str) -> None:
    parts = path.split(".")
    current: object = target
    for index, part in enumerate(parts):
        final = index == len(parts) - 1
        if isinstance(current, list):
            position = int(part)
            while len(current) <= position:
                current.append({})
            if final:
                current[position] = value
            else:
                current = current[position]
        else:
            assert isinstance(current, dict)
            if final:
                current[part] = value
            else:
                next_part = parts[index + 1]
                current = current.setdefault(part, [] if next_part.isdigit() else {})


def _matching_projection(operation: str):
    rest: dict = {}
    mcp: dict = {}
    database: dict = {}
    for index, rule in enumerate(FIELDS_BY_OPERATION[operation], start=1):
        value = str(index) if rule.absolute_database_value else f"value-{index}"
        if rule.rest_key is not None and any(
            token in rule.rest_key for token in ("amount", "quantity", "total", "value")
        ):
            value = str(index)
        if rule.rest_key is not None:
            rest[rule.rest_key] = value
        mcp[rule.mcp_key] = value
        database_value = f"-{value}" if rule.absolute_database_value else value
        _assign_path(database, rule.database_path, database_value)
    return rest, mcp, database


def test_every_live_operation_has_reviewed_cross_authority_fields() -> None:
    assert set(FIELDS_BY_OPERATION) == set(RESOURCE_TABLES)
    for operation, fields in FIELDS_BY_OPERATION.items():
        assert len(fields) >= 2, operation
        rest, mcp, database = _matching_projection(operation)
        assert_canonical_projection_consistency(
            operation, rest=rest, mcp=mcp, database=database
        )


def test_cross_authority_numeric_mismatch_fails_closed() -> None:
    rest, mcp, database = _matching_projection("sales.invoice")
    mismatched = deepcopy(mcp)
    mismatched["grand_total"] = "999.00"

    with pytest.raises(AssertionError, match="differs between REST and MCP"):
        assert_canonical_projection_consistency(
            "sales.invoice", rest=rest, mcp=mismatched, database=database
        )


def test_missing_database_effect_fails_closed() -> None:
    rest, mcp, database = _matching_projection("sales.dispatch")
    del database["stock"]

    with pytest.raises(AssertionError, match="database reconciliation omitted"):
        assert_canonical_projection_consistency(
            "sales.dispatch", rest=rest, mcp=mcp, database=database
        )
