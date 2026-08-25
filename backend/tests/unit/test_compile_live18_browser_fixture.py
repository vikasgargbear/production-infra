import json
from pathlib import Path

import pytest

from scripts.compile_live18_browser_fixture import (
    FixtureCompileError,
    MAX_SCALAR_BYTES,
    SCALAR_SCHEMA,
    TEMPLATE_SCHEMA,
    compile_fixture,
    load_reviewed_scalars,
    _compile_value,
    _validate_compiled_steps,
)


def _matrix(path: Path) -> Path:
    operations = [
        {"id": f"operation_{number}", "approval_policy": "actor_confirmation"}
        for number in range(1, 19)
    ]
    path.write_text(json.dumps({"required_operation_count": 18, "operations": operations}))
    return path


def _templates(root: Path) -> Path:
    root.mkdir()
    for number in range(1, 19):
        operation = f"operation_{number}"
        steps = {
            "missing_required_steps": [{"actor": "requester", "action": "expectText", "locator": {"kind": "text", "name": "Required"}}],
            "prepare_steps": [{"actor": "requester", "action": "goto", "value": "/?module={{fact.display.branch_code}}"}],
            "approval_steps": [{"actor": "reviewer", "action": "expectText", "locator": {"kind": "text", "name": "{{command_request_id}}"}}],
            "execute_steps": [{"actor": "requester", "action": "expectText", "locator": {"kind": "text", "name": "{{command_request_id}}"}}],
        }
        if number == 1:
            steps["prepare_steps"].append({"actor": "requester", "action": "fill", "locator": {"kind": "label", "name": "Quantity"}, "value": "{{scalar.quantity}}"})
        (root / f"{operation}.json").write_text(json.dumps({
            "template_schema": TEMPLATE_SCHEMA,
            "operation_id": operation,
            "lifecycle_mode": "split",
            "steps": steps,
        }))
    return root


def test_compiles_exact_18_from_facts_and_only_used_reviewed_scalars(tmp_path: Path) -> None:
    fixture = compile_fixture(
        _matrix(tmp_path / "matrix.json"), _templates(tmp_path / "templates"),
        {"display": {"branch_code": "sales"}}, {"quantity": "1.000000"},
    )
    assert fixture["fixture_schema"] == "aasopharma.live18.fixture.v1"
    assert len(fixture["operations"]) == 18
    assert fixture["operations"]["operation_1"]["prepare_steps"][1]["value"] == "1.000000"
    assert fixture["operations"]["operation_1"]["approval_steps"][0]["locator"]["name"] == "{{command_request_id}}"


def test_combined_actor_confirmation_lifecycle_is_explicit_and_policy_bound(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["lifecycle_mode"] = "combined_actor_confirmation"
    path.write_text(json.dumps(template))
    fixture = compile_fixture(
        matrix, templates, {"display": {"branch_code": "sales"}}, {"quantity": "1.000000"},
    )
    assert fixture["operations"]["operation_1"]["lifecycle_mode"] == "combined_actor_confirmation"

    matrix_value = json.loads(matrix.read_text())
    matrix_value["operations"][0]["approval_policy"] = "separate_approver"
    matrix.write_text(json.dumps(matrix_value))
    with pytest.raises(FixtureCompileError, match="requires actor_confirmation"):
        compile_fixture(
            matrix, templates, {"display": {"branch_code": "sales"}}, {"quantity": "1.000000"},
        )


def test_missing_template_and_unused_scalar_fail_closed(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    (templates / "operation_18.json").unlink()
    with pytest.raises(FixtureCompileError, match="missing evidence-backed UI template"):
        compile_fixture(matrix, templates, {"display": {"branch_code": "sales"}}, {})
    _templates(tmp_path / "other")
    with pytest.raises(FixtureCompileError, match="unused scalar"):
        compile_fixture(
            matrix,
            tmp_path / "other",
            {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000", "surprise": "1"},
        )


def test_scalar_pack_rejects_identity_authority_and_size(tmp_path: Path) -> None:
    path = tmp_path / "scalars.json"
    path.write_text(json.dumps({"schema": SCALAR_SCHEMA, "values": {"product_id": "not-even-a-uuid"}}))
    with pytest.raises(FixtureCompileError, match="identity/time authority"):
        load_reviewed_scalars(path)
    path.write_bytes(b" " * (MAX_SCALAR_BYTES + 1))
    with pytest.raises(FixtureCompileError, match="exceeds"):
        load_reviewed_scalars(path)


def test_compiler_rejects_template_that_does_not_target_exact_command(tmp_path: Path) -> None:
    matrix = _matrix(tmp_path / "matrix.json")
    templates = _templates(tmp_path / "templates")
    path = templates / "operation_1.json"
    template = json.loads(path.read_text())
    template["steps"]["execute_steps"][0]["locator"]["name"] = "First pending"
    path.write_text(json.dumps(template))
    with pytest.raises(FixtureCompileError, match="does not target captured command"):
        compile_fixture(
            matrix,
            templates,
            {"display": {"branch_code": "sales"}},
            {"quantity": "1.000000"},
        )


def test_template_readiness_names_all_18_operations_without_false_ready_claims() -> None:
    root = Path(__file__).resolve().parents[3]
    matrix = json.loads(
        (root / "backend/tests/live_acceptance/operation_matrix.json").read_text()
    )
    readiness = json.loads(
        (root / "docs/testing/live18-ui-template-readiness.json").read_text()
    )
    assert readiness["schema"] == "aasopharma.live18.ui-template-readiness.v1"
    assert {row["id"] for row in readiness["operations"]} == {
        row["id"] for row in matrix["operations"]
    }
    assert readiness["ready_count"] == sum(
        row["status"] == "ready" for row in readiness["operations"]
    )
    assert all(row["status"] in {"ready", "blocked"} for row in readiness["operations"])
    assert all(
        (row["status"] == "ready" and not row["missing"])
        or (row["status"] == "blocked" and row["missing"])
        for row in readiness["operations"]
    )
    assert all(
        all((root / source).is_file() for source in row["evidence_sources"])
        for row in readiness["operations"]
    )


def test_stock_transfer_template_compiles_only_reviewed_choices() -> None:
    root = Path(__file__).resolve().parents[3]
    template = json.loads(
        (root / "frontend/e2e/live18/templates/stock_transfer.json").read_text()
    )
    facts = {
        "identity": {
            "branch_id": "d3000000-0000-7000-8000-000000000005",
            "saleable_location_id": "d3200000-0000-7000-8000-000000000006",
            "transfer_destination_branch_id": "d3000000-0000-7000-8000-000000000028",
            "transfer_destination_location_id": "d3200000-0000-7000-8000-00000000000f",
        },
        "display": {"product_code": "DEMO-PRODUCT", "product_name": "Demo Product"},
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        facts,
        {"stock_transfer_quantity": "1.000000", "stock_transfer_distance_km": "12.50"},
        used,
    )
    _validate_compiled_steps("stock_transfer", operation, "actor_confirmation")
    assert used == {"stock_transfer_quantity", "stock_transfer_distance_km"}
    assert operation["prepare_steps"][5]["value"] == "12.50"
    assert operation["prepare_steps"][9]["value"] == "1.000000"
