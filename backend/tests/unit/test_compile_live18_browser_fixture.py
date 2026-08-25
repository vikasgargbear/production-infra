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
)


def _matrix(path: Path) -> Path:
    operations = [{"id": f"operation_{number}"} for number in range(1, 19)]
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
        (root / f"{operation}.json").write_text(json.dumps({"template_schema": TEMPLATE_SCHEMA, "operation_id": operation, "steps": steps}))
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
