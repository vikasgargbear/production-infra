"""Fail-closed source map for foundation master-data authority."""

from __future__ import annotations

import json
from pathlib import Path

from app.main import app
from app.api.routes.internal import mcp_master_commands
from app.api.routes.internal.mcp_master_contract import MASTER_WRITE_POLICIES


ROOT = Path(__file__).resolve().parents[3]
CONTRACT = ROOT / "docs/architecture/foundation-master-authority-contract.json"
CORE_MATRIX = ROOT / "docs/architecture/core-operation-authority-matrix.json"


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_foundation_contract_preserves_the_exact_transaction_matrix() -> None:
    contract = _json(CONTRACT)
    matrix = _json(CORE_MATRIX)
    assert contract["transaction_operation_contract"] == {
        "path": "docs/architecture/core-operation-authority-matrix.json",
        "expected_operation_count": 18,
        "relationship": "prerequisite_master_data_only",
    }
    assert len(matrix["operations"]) == 18
    assert {row["id"] for row in contract["operations"]} == {
        "customer_create",
        "supplier_create",
        "product_draft_create",
        "product_draft_configure",
        "product_activate",
    }


def test_every_foundation_path_is_real_and_published() -> None:
    contract = _json(CONTRACT)
    openapi = app.openapi()["paths"]
    internal_paths = {route.path for route in mcp_master_commands.router.routes}
    operations = (
        ROOT / "backend/mcp_runtime/aasopharma_mcp/operations.py"
    ).read_text(encoding="utf-8")
    service_tools = set(
        _json(ROOT / "backend/mcp_runtime/service-contract.json")["tools"]
    )
    for row in contract["operations"]:
        component, call = row["frontend"]
        assert (ROOT / component).is_file()
        assert call in (ROOT / component).read_text(encoding="utf-8")

        rest_method, rest_path = row["rest_write"]
        assert rest_path in openapi
        assert rest_method.lower() in openapi[rest_path]

        tool, mcp_method, mcp_path = row["mcp_write"]
        assert tool in service_tools
        assert f'"{tool}", "{row["operation_key"]}"' in operations
        assert f'"{row["operation_key"]}": "{mcp_path}"' in operations
        assert mcp_method == "POST"
        assert mcp_path.removeprefix("/api") in internal_paths

        read_tool, read_key, read_path = row["readback"]["mcp"]
        assert read_tool in service_tools
        assert f'"{read_key}", "{read_tool}"' in operations
        assert f'"{read_path}"' in operations


def test_declared_postgres_authority_and_identity_mappings_are_complete() -> None:
    contract = _json(CONTRACT)
    ddl = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (ROOT / "backend/alembic/sql").glob("*.sql")
    )
    model = _json(ROOT / "docs/architecture/canonical-data-model.json")
    relations = {
        relation
        for group in model["canonical_tables"].values()
        for relation in group
    }
    app_contract = _json(ROOT / "docs/architecture/app-data-contract.json")
    for manifest in app_contract["data_authority"]["post_baseline_manifests"]:
        relations.add(_json(ROOT / manifest)["relation"])

    for row in contract["operations"]:
        sources = (ROOT / row["postgres_source"]).read_text(encoding="utf-8")
        if supplemental := row.get("supplemental_postgres_source"):
            sources += (ROOT / supplemental).read_text(encoding="utf-8")
        for function in row["postgres_functions"]:
            assert function in sources or function in ddl
        assert set(row["relations"]) <= relations
        assert not {
            relation for relation in row["relations"]
            if relation.split(".", 1)[0] in {"financial", "master"}
        }
        assert all(
            len(projections) == len(contract["projection_order"])
            and all(projections)
            for projections in row["readback"]["projection_mapping"].values()
        )


def test_activation_parity_is_closed_with_consequential_confirmation() -> None:
    activation = next(
        row for row in _json(CONTRACT)["operations"]
        if row["id"] == "product_activate"
    )
    policy = MASTER_WRITE_POLICIES[activation["operation_key"]]
    assert activation["mcp_write"][0] == "erp_product_activate"
    assert activation["risk"] == policy.risk_class == "consequential_write"
    assert activation["approval"] == policy.approval_policy == "actor_confirmation"
    assert "erp_master_commands.activate_configured_product" in activation[
        "postgres_functions"
    ]
    assert activation["readback"]["mcp"][0] == "erp_product_setup_get"
