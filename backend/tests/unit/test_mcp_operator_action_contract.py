from __future__ import annotations

import copy
import importlib.util
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPT = REPO_ROOT / "backend/scripts/audit/mcp_operator_action_contract.py"
SPEC = importlib.util.spec_from_file_location("mcp_operator_action_contract", SCRIPT)
assert SPEC and SPEC.loader
audit = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = audit
SPEC.loader.exec_module(audit)


def test_repository_operator_action_contract_is_consistent_and_bounded_published() -> None:
    assert audit.validate() == []


def test_release_gate_without_evidence_fails_closed() -> None:
    contract = audit.load_json(audit.CONTRACT_PATH)
    contract["publication"]["release_gates"][
        "canonical_api_command_boundary_verified"
    ] = False

    errors = audit.validate(contract=contract)

    assert any("not verified" in error for error in errors)
    assert any("runtime release gates drifted" in error for error in errors)


def test_execute_rejects_business_payload_by_contract() -> None:
    runtime = audit.load_runtime()
    runtime.SHARED_ACTION_SCHEMAS = copy.deepcopy(runtime.SHARED_ACTION_SCHEMAS)
    schema = runtime.SHARED_ACTION_SCHEMAS["erp_operation_execute"]
    schema["properties"]["lines"] = {
        "type": "array",
        "description": "Unsafe payload",
        "minItems": 1,
        "maxItems": 1,
        "items": {"type": "string", "description": "Unsafe line"},
    }

    errors = audit.validate(runtime=runtime)

    assert "execute must accept exactly command_request_id, preview_hash, idempotency_key" in errors
    assert "execute schema contains business payload fields" in errors


def test_caller_controlled_tax_and_binary_number_fail_contract() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    action = runtime.PREPARE_ACTIONS["erp_sales_invoice_prepare"]
    action.input_schema["properties"]["tax_rate"] = {
        "type": "number",
        "description": "Unsafe client tax rate",
    }

    errors = audit.validate(runtime=runtime)

    assert any("numeric JSON values are forbidden" in error for error in errors)
    assert any("caller-controlled tax fields are forbidden" in error for error in errors)


def test_ambiguous_commercial_aliases_fail_contract() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    action = runtime.PREPARE_ACTIONS["erp_sales_order_prepare"]
    action.input_schema["properties"]["unit_price"] = {
        "type": "string",
        "pattern": r"^[0-9]+\.[0-9]{2}$",
        "description": "Ambiguous legacy price alias",
    }

    errors = audit.validate(runtime=runtime)

    assert any("ambiguous transport aliases are forbidden" in error for error in errors)


def test_every_input_node_requires_recursive_nonblank_description() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    schema = runtime.PREPARE_ACTIONS["erp_sales_order_prepare"].input_schema
    schema["description"] = "  "
    schema["properties"]["lines"]["description"] = ""
    schema["properties"]["lines"]["items"]["description"] = "\t"

    errors = audit.validate(runtime=runtime)

    assert any(
        error == "erp_sales_order_prepare: input schema node lacks a nonblank description"
        for error in errors
    )
    assert any(
        "erp_sales_order_prepare.lines: input schema node lacks" in error
        for error in errors
    )
    assert any(
        "erp_sales_order_prepare.lines[]: input schema node lacks" in error
        for error in errors
    )


def test_reused_field_name_requires_one_recursive_shape_or_exact_context() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    branch = runtime.PREPARE_ACTIONS[
        "erp_customer_receipt_prepare"
    ].input_schema["properties"]["branch_id"]
    branch["pattern"] = r"^unsafe-contextual-id$"

    errors = audit.validate(runtime=runtime)

    assert any(
        "field 'branch_id' has conflicting meanings/shapes" in error
        for error in errors
    )

    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    runtime.PREPARE_ACTIONS[
        "erp_customer_receipt_prepare"
    ].input_schema["properties"]["branch_id"]["description"] = (
        "A customer identifier disguised as a branch."
    )
    errors = audit.validate(runtime=runtime)
    assert any("field 'branch_id' has conflicting meanings/shapes" in error for error in errors)

    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    runtime.PREPARE_ACTIONS["erp_sales_order_prepare"].input_schema["properties"][
        "allocations"
    ] = {
        "type": "array",
        "description": "Unexpected allocation context.",
        "minItems": 1,
        "maxItems": 2,
        "items": {"type": "string", "description": "Unexpected allocation."},
    }
    errors = audit.validate(runtime=runtime)
    assert any("field 'allocations' has conflicting meanings/shapes" in error for error in errors)


def test_quantity_names_pin_selected_uom_or_base_uom_semantics() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    line = runtime.PREPARE_ACTIONS[
        "erp_sales_order_prepare"
    ].input_schema["properties"]["lines"]["items"]
    line["properties"]["base_quantity"] = {
        "type": "string",
        "description": "Unqualified base quantity.",
        "pattern": r"^[0-9]+$",
    }

    errors = audit.validate(runtime=runtime)

    assert any("must pin selected-UOM or base-UOM semantics" in error for error in errors)


def test_source_derived_lines_cannot_re_request_product_or_uom() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    line = runtime.PREPARE_ACTIONS[
        "erp_sales_dispatch_prepare"
    ].input_schema["properties"]["lines"]["items"]
    line["properties"]["product_id"] = {
        "type": "string", "format": "uuid",
        "description": "Unsafe re-requested product.",
    }

    errors = audit.validate(runtime=runtime)

    assert any(
        "erp_sales_dispatch_prepare: source-derived line re-requests" in error
        for error in errors
    )


def test_payment_and_invoice_conditional_schema_contracts_fail_closed() -> None:
    runtime = audit.load_runtime()
    runtime.PREPARE_ACTIONS = copy.deepcopy(runtime.PREPARE_ACTIONS)
    payment = runtime.PREPARE_ACTIONS["erp_customer_receipt_prepare"].input_schema
    payment["required"].append("bank_account_id")
    invoice_line = runtime.PREPARE_ACTIONS[
        "erp_sales_invoice_prepare"
    ].input_schema["properties"]["lines"]["items"]
    invoice_line["properties"]["fulfillment_source"]["enum"] = ["direct_issue"]

    errors = audit.validate(runtime=runtime)

    assert any("conditional payment fields must remain schema-optional" in error for error in errors)
    assert "erp_sales_invoice_prepare: fulfillment_source contract drifted" in errors


def test_sales_invoice_batch_allocation_policy_is_explicit_and_schema_optional() -> None:
    runtime = audit.load_runtime()
    line = runtime.PREPARE_ACTIONS[
        "erp_sales_invoice_prepare"
    ].input_schema["properties"]["lines"]["items"]

    assert set(line["properties"]["batch_allocation_mode"]["enum"]) == {
        "auto_fefo", "explicit_fefo"
    }
    assert "batch_allocation_mode" not in line["required"]
    assert "batch_allocations" not in line["required"]


def test_semantic_validator_must_be_called_before_service_prepare(tmp_path, monkeypatch) -> None:
    route = tmp_path / "mcp_actions.py"
    route.write_text(
        "def prepare_action():\n"
        "    payload = model_validate({})\n"
        "    return prepare(payload)\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(audit, "ACTION_ROUTE_PATH", route)

    errors = audit.validate()

    assert any("semantic validation before service preparation" in error for error in errors)


def test_semantic_validator_must_cover_payment_and_exact_fulfillment(tmp_path, monkeypatch) -> None:
    contract = tmp_path / "contract.py"
    contract.write_text(
        "def validate_prepare_payload_semantics(operation_key, payload):\n"
        "    return None\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(audit, "APPLICATION_CONTRACT_PATH", contract)

    errors = audit.validate()

    assert any("semantic validator contract is incomplete" in error for error in errors)


def test_app_data_operations_equal_live_reads_plus_planned_operator_actions() -> None:
    service = audit.load_json(audit.SERVICE_CONTRACT_PATH)
    operator = audit.load_json(audit.CONTRACT_PATH)
    app = audit.load_json(audit.APP_CONTRACT_PATH)
    live = set(service["tools"])
    planned = {
        item["tool"]
        for item in (*operator["prepare_actions"], *operator["shared_actions"])
    }
    planned.update(item["tool"] for item in operator["resolution_reads"])

    assert {item["tool"] for item in app["mcp_operations"]} == live | planned

    drifted = copy.deepcopy(app)
    operation = next(
        item
        for item in drifted["mcp_operations"]
        if item["tool"] == "erp_sales_invoice_prepare"
    )
    operation["tool"] = "erp_post_sales_invoice"
    errors = audit.validate(app_contract=drifted)
    assert "app-data MCP operation set drifted from live and planned operator tools" in errors


def test_separation_of_duties_is_action_specific() -> None:
    contract = audit.load_json(audit.CONTRACT_PATH)
    by_tool = {item["tool"]: item for item in contract["prepare_actions"]}
    assert by_tool["erp_sales_invoice_prepare"]["approval_policy"] == "actor_confirmation"
    assert by_tool["erp_sales_return_prepare"]["approval_policy"] == "separate_approver"
    assert by_tool["erp_inventory_destruction_prepare"]["approval_policy"] == "separate_approver"

    drifted = copy.deepcopy(contract)
    action = next(
        item for item in drifted["prepare_actions"]
        if item["tool"] == "erp_sales_return_prepare"
    )
    action["approval_policy"] = "actor_confirmation"
    errors = audit.validate(contract=drifted)
    assert "erp_sales_return_prepare: approval policy drifted" in errors
