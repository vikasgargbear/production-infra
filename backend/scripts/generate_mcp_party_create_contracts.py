#!/usr/bin/env python3
"""Generate MCP party-create schemas from the canonical application models."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.api.schemas.master.customer import CanonicalCustomerCreate
from app.api.schemas.master.supplier import CanonicalSupplierCreate


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = (
    ROOT
    / "backend/mcp_runtime/aasopharma_mcp/party_create_contracts.json"
)
IDEMPOTENCY_KEY_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
MONEY_PATTERN = r"^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$"


def _without_presentation_metadata(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _without_presentation_metadata(item)
            for key, item in value.items()
            if key not in {"default", "description", "examples", "title"}
        }
    if isinstance(value, list):
        return [_without_presentation_metadata(item) for item in value]
    return value


def _create_schema(model, *, decimal_strings: set[str]) -> dict[str, Any]:
    canonical = model.model_json_schema()
    properties = _without_presentation_metadata(canonical["properties"])
    for field_name in decimal_strings:
        properties[field_name] = {"type": "string", "pattern": MONEY_PATTERN}
    properties["idempotency_key"] = {
        "type": "string",
        "pattern": IDEMPOTENCY_KEY_PATTERN,
        "description": "Stable caller key for exact replay of this create request.",
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": properties,
        "required": [*canonical["required"], "idempotency_key"],
    }


def build_contracts() -> dict[str, dict[str, Any]]:
    return {
        "erp_customer_create": _create_schema(
            CanonicalCustomerCreate, decimal_strings={"credit_limit"}
        ),
        "erp_supplier_create": _create_schema(
            CanonicalSupplierCreate, decimal_strings=set()
        ),
    }


def main() -> None:
    OUTPUT.write_text(
        json.dumps(build_contracts(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
