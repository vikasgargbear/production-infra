from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.routes import schema


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_published_schema_allowlist_is_derived_from_canonical_domain_catalogs() -> None:
    catalog_domains = {
        json.loads(path.read_text(encoding="utf-8"))["domain"]
        for path in (REPOSITORY_ROOT / "database/canonical/domains").glob("*.json")
        if path.name != "_contract.json"
    }

    assert set(schema.CANONICAL_DATA_SCHEMAS) == catalog_domains
    assert schema.CANONICAL_DATA_SCHEMAS == tuple(
        sorted(schema.CANONICAL_DATA_SCHEMAS)
    )
    assert {
        "master",
        "financial",
        "gst",
        "analytics",
        "system_config",
    }.isdisjoint(schema.CANONICAL_DATA_SCHEMAS)


@pytest.mark.parametrize(
    "schema_name", ["master", "financial", "gst", "analytics", "system_config"]
)
def test_retired_schema_names_fail_before_database_access(schema_name: str) -> None:
    with pytest.raises(HTTPException) as error:
        schema._require_canonical_data_schema(schema_name)

    assert error.value.status_code == 404
    assert error.value.detail == (
        f"Canonical data schema '{schema_name}' is not published"
    )


class EmptySchemaDatabase:
    def __init__(self) -> None:
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((str(statement), params))
        return []


@pytest.mark.asyncio
async def test_all_schema_query_binds_only_canonical_catalogs() -> None:
    database = EmptySchemaDatabase()

    result = await schema.get_all_schemas(
        _={},
        db=database,
        context=object(),
    )

    assert result["schema_names"] == []
    assert len(database.calls) == 1
    query, params = database.calls[0]
    assert "schema_name = ANY(CAST(:schema_names AS text[]))" in query
    assert params == {"schema_names": list(schema.CANONICAL_DATA_SCHEMAS)}


def test_redundant_shadowed_quick_route_is_not_published() -> None:
    assert all("/quick/" not in route.path for route in schema.router.routes)
