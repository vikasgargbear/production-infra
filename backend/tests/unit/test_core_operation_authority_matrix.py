"""Release fence for the canonical authority behind the 18 core operations.

This deliberately audits source ownership rather than the presence of legacy
tables elsewhere in the repository.  A legacy module may exist temporarily,
but it cannot enter a canonical REST/MCP command, context projection, or
readback path.
"""

from __future__ import annotations

import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[3]
MATRIX_PATH = ROOT / "docs/architecture/core-operation-authority-matrix.json"
BASELINE_PATH = ROOT / "backend/alembic/sql/20260820_0001_canonical_v1.sql"
MIGRATION_SQL = tuple(
    sorted(
        path
        for path in (ROOT / "backend/alembic/sql").glob("2026082*.sql")
        if path != BASELINE_PATH
    )
)
AUTHORITY_PYTHON = (
    ROOT / "backend/app/domain/operator_actions",
    ROOT / "backend/app/infrastructure/operator_actions",
    ROOT / "backend/app/api/routes/web_operator_actions.py",
    ROOT / "backend/app/api/routes/canonical_adjustment_note_reads.py",
    ROOT / "backend/app/api/routes/canonical_document_history_reads.py",
    ROOT / "backend/app/api/routes/canonical_erp_reads.py",
    ROOT / "backend/app/api/routes/canonical_goods_receipts.py",
    ROOT / "backend/app/api/routes/canonical_inventory_reads.py",
    ROOT / "backend/app/api/routes/canonical_inventory_transfers.py",
    ROOT / "backend/app/api/routes/canonical_payment_history_reads.py",
    ROOT / "backend/app/api/routes/canonical_purchase_order_reads.py",
    ROOT / "backend/app/api/routes/canonical_return_reads.py",
    ROOT / "backend/app/api/routes/canonical_sales_chain_reads.py",
    ROOT / "backend/app/api/routes/canonical_supplier_invoice_reads.py",
    ROOT / "backend/app/api/routes/canonical_supplier_payment_reads.py",
    ROOT / "backend/app/api/routes/internal/mcp_actions.py",
    ROOT / "backend/app/api/routes/internal/mcp_canonical_reads.py",
    ROOT / "backend/app/api/routes/internal/mcp_canonical_resolution_reads.py",
    ROOT / "backend/mcp_runtime/aasopharma_mcp/operations.py",
    ROOT / "backend/mcp_runtime/aasopharma_mcp/operator_actions.py",
)
CANONICAL_TABLE_SCHEMAS = {
    "automation",
    "calculation",
    "catalog",
    "compliance",
    "core",
    "finance",
    "inventory",
    "parties",
    "procurement",
    "sales",
    "tax",
}
FUNCTION_START = re.compile(
    r"CREATE(?: OR REPLACE)? FUNCTION\s+\"?([a-z_]\w*)\"?\.\"?([a-z_]\w*)\"?\s*\(",
    re.IGNORECASE,
)
FUNCTION_CALL = re.compile(
    r"(?<![\w])\"?([a-z_]\w*)\"?\.\"?([a-z_]\w*)\"?\s*\(",
    re.IGNORECASE,
)
TABLE_REFERENCE = re.compile(
    r"\b(?:FROM|JOIN|INTO|UPDATE|REFERENCES|DELETE\s+FROM)\s+"
    r"\"?([a-z_]\w*)\"?\.\"?([a-z_]\w*)\"?",
    re.IGNORECASE,
)


def _matrix() -> dict:
    return json.loads(MATRIX_PATH.read_text(encoding="utf-8"))


def _python_sources() -> tuple[Path, ...]:
    sources: list[Path] = []
    for path in AUTHORITY_PYTHON:
        if path.is_dir():
            sources.extend(sorted(path.rglob("*.py")))
        else:
            sources.append(path)
    return tuple(sources)


def _sql_functions() -> dict[str, str]:
    functions: dict[str, str] = {}
    for path in (BASELINE_PATH, *MIGRATION_SQL):
        source = path.read_text(encoding="utf-8")
        starts = list(FUNCTION_START.finditer(source))
        for index, match in enumerate(starts):
            end = starts[index + 1].start() if index + 1 < len(starts) else len(source)
            functions[f"{match.group(1)}.{match.group(2)}"] = source[
                match.start() : end
            ]
    return functions


def _function_closure(functions: dict[str, str], seeds: list[str]) -> tuple[set[str], str]:
    pending = list(seeds)
    visited: set[str] = set()
    bodies: list[str] = []
    while pending:
        function = pending.pop()
        if function in visited:
            continue
        visited.add(function)
        body = functions.get(function)
        assert body is not None, f"canonical authority function is absent: {function}"
        bodies.append(body)
        for schema, name in FUNCTION_CALL.findall(body):
            called = f"{schema}.{name}"
            if called in functions and called not in visited:
                pending.append(called)
    return visited, "\n".join(bodies)


def test_matrix_names_exactly_eighteen_logical_core_operations() -> None:
    matrix = _matrix()
    operations = matrix["operations"]
    assert len(operations) == 18
    assert len({operation["id"] for operation in operations}) == 18
    assert matrix["forbidden_runtime_database_namespaces"] == ["financial", "master"]
    assert all("legacy_dependencies" not in operation for operation in operations)


def test_integrated_operations_map_to_reviewed_sql_and_canonical_tables() -> None:
    functions = _sql_functions()
    for operation in _matrix()["operations"]:
        if operation.get("integration_state"):
            # The pending operation becomes mandatory as soon as its forward
            # migration is merged; this avoids pretending an undeployed path exists.
            continue
        seeds = [operation["prepare_sql"], *operation["execute_sql"]]
        _, closure = _function_closure(functions, seeds)
        referenced_tables = {
            f"{schema}.{table}"
            for schema, table in TABLE_REFERENCE.findall(closure)
            if schema in CANONICAL_TABLE_SCHEMAS
        }
        missing = set(operation["authoritative_tables"]) - referenced_tables
        assert not missing, f"{operation['id']} table mapping drifted: {sorted(missing)}"
        assert "financial." not in closure.lower()
        assert "master.organizations" not in closure.lower()


def test_rest_and_mcp_command_authority_has_no_old_schema_or_data_client() -> None:
    forbidden = {
        "financial.": [],
        "master.organizations": [],
        ".table(": [],
        "create_client(": [],
    }
    for path in _python_sources():
        source = path.read_text(encoding="utf-8").lower()
        for token, matches in forbidden.items():
            if token in source:
                matches.append(str(path.relative_to(ROOT)))
    assert forbidden == {
        "financial.": [],
        "master.organizations": [],
        ".table(": [],
        "create_client(": [],
    }


def test_rest_and_mcp_publish_the_same_integrated_operation_keys() -> None:
    registry = (
        ROOT / "backend/app/infrastructure/operator_actions/registry.py"
    ).read_text(encoding="utf-8")
    mcp = (
        ROOT / "backend/mcp_runtime/aasopharma_mcp/operator_actions.py"
    ).read_text(encoding="utf-8")
    published_block = mcp.split("PUBLISHED_PREPARE_TOOL_NAMES", 1)[1].split(
        "class OperatorActionsUnavailable", 1
    )[0]
    for operation in _matrix()["operations"]:
        if operation.get("integration_state"):
            continue
        assert f'"{operation["operation_key"]}"' in registry
        assert f'"{operation["mcp_prepare_tool"]}"' in published_block


def test_declared_context_and_readback_routes_exist_in_canonical_authority() -> None:
    source = "\n".join(
        path.read_text(encoding="utf-8") for path in _python_sources()
    )

    def shape(value: str) -> str:
        return re.sub(r"\{[^}]+\}", "{}", value.removeprefix("/api"))

    route_shapes = shape(source)
    router_prefixes = (
        "/canonical/returns",
        "/canonical/goods-receipts",
        "/canonical/supplier-invoices",
        "/canonical/supplier-payments",
        "/canonical/adjustment-notes",
        "/canonical/inventory-transfers",
        "/web/actions",
    )
    for operation in _matrix()["operations"]:
        if operation.get("integration_state"):
            continue
        declared = [*operation["rest_context"], operation["rest_readback"]]
        if operation.get("rest_review"):
            declared.append(operation["rest_review"])
        for route in declared:
            expected = shape(route)
            candidates = [expected]
            candidates.extend(
                expected[len(prefix) :]
                for prefix in router_prefixes
                if expected.startswith(prefix)
            )
            assert any(candidate in route_shapes for candidate in candidates), (
                f"{operation['id']} declares an unmounted authority route: {route}"
            )


def test_all_declared_tables_are_canonical_objects() -> None:
    ddl = "\n".join(
        path.read_text(encoding="utf-8") for path in (BASELINE_PATH, *MIGRATION_SQL)
    )
    for operation in _matrix()["operations"]:
        for qualified_name in operation["authoritative_tables"]:
            schema, table = qualified_name.split(".", 1)
            assert schema in CANONICAL_TABLE_SCHEMAS
            quoted = f'CREATE TABLE "{schema}"."{table}"'
            unquoted = f"CREATE TABLE {schema}.{table}"
            assert quoted in ddl or unquoted in ddl, (
                f"{operation['id']} names a missing canonical table: {qualified_name}"
            )
