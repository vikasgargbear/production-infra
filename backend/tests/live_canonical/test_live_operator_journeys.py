from __future__ import annotations

import copy
import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from typing import Any

import pytest

from .oracle import calculate_document, calculate_reversal, calculate_withholding
from .transport import (
    TransportContractError,
    immutable_preview_projection,
    required_preview_fields,
)


pytestmark = pytest.mark.integration


def _resolve(value: Any, results: dict[str, dict[str, Any]]) -> Any:
    if isinstance(value, str) and value.startswith("$result."):
        _, step_id, field = value.split(".", 2)
        return results[step_id][field]
    if isinstance(value, dict):
        return {key: _resolve(child, results) for key, child in value.items()}
    if isinstance(value, list):
        return [_resolve(child, results) for child in value]
    return value


def _find(value: Any, key: str):
    if isinstance(value, dict):
        if key in value:
            return value[key]
        for child in value.values():
            found = _find(child, key)
            if found is not None:
                return found
    elif isinstance(value, list):
        for child in value:
            found = _find(child, key)
            if found is not None:
                return found
    return None


def _result_resource_id(body: dict[str, Any]) -> str:
    value = _find(body, "result_resource_id") or _find(body, "resource_id")
    assert value, "execute response omitted its canonical result resource id"
    uuid.UUID(str(value))
    return str(value)


def _assert_expected_money(preview: dict[str, Any], expected: dict[str, Any]) -> None:
    for field, expected_value in expected.items():
        if field == "lines" or not isinstance(expected_value, Decimal):
            continue
        actual = _find(preview, field)
        assert actual is not None, f"preview omitted oracle field {field}"
        assert Decimal(str(actual)) == expected_value, field


def _command_by_idempotency(
    db_query,
    org_id: str,
    operation_key: str,
    client_id: str,
    idempotency_key: str,
):
    rows = db_query(
        """
        SELECT id::text,status,result_resource_id::text,completed_at
          FROM erp_automation_reads.requester_command_by_idempotency(
               %s::uuid,%s,%s,%s
          )
        """,
        (
            org_id,
            operation_key,
            client_id,
            hashlib.sha256(idempotency_key.encode("utf-8")).digest(),
        ),
    )
    assert len(rows) <= 1
    return rows[0] if rows else None


def _assert_prepare_has_no_result(
    db_query,
    org_id: str,
    operation_key: str,
    client_id: str,
    idempotency_key: str,
    command_request_id: str,
):
    command = _command_by_idempotency(
        db_query, org_id, operation_key, client_id, idempotency_key
    )
    assert command is not None
    assert command["id"] == command_request_id
    assert command["result_resource_id"] is None
    assert command["completed_at"] is None
    assert command["status"] in {"prepared", "pending_approval"}


def _command_exists_by_idempotency(
    db_query,
    org_id: str,
    operation_key: str,
    client_id: str,
    idempotency_key: str,
) -> bool:
    return _command_by_idempotency(
        db_query, org_id, operation_key, client_id, idempotency_key
    ) is not None


def _assert_prepare_rejected(
    *,
    probe: dict[str, Any],
    payload: dict[str, Any],
    rest_client,
    mcp_client,
    db_query,
    org_id: str,
) -> None:
    operation_key = f"{probe['operation']}.prepare"
    payload.setdefault("idempotency_key", f"reject:{probe['id']}")
    client_id = rest_client.oauth_claims["requester"]["client_id"]
    assert not _command_exists_by_idempotency(
        db_query,
        org_id,
        operation_key,
        client_id,
        payload["idempotency_key"],
    )

    with pytest.raises(TransportContractError) as rest_failure:
        rest_client.prepare(operation_key, copy.deepcopy(payload))
    expected_code = probe.get("expected_rest_code")
    if expected_code:
        assert rest_failure.value.code == expected_code

    with pytest.raises(TransportContractError) as mcp_failure:
        mcp_client.call(probe["prepare_tool"], copy.deepcopy(payload))

    expected_message = probe.get("expected_message_contains")
    if expected_message:
        assert expected_message.lower() in str(rest_failure.value).lower()
        assert expected_message.lower() in str(mcp_failure.value).lower()

    assert not _command_exists_by_idempotency(
        db_query,
        org_id,
        operation_key,
        client_id,
        payload["idempotency_key"],
    )


def _execute_step(
    *,
    index: int,
    step: dict[str, Any],
    entry: dict[str, Any],
    payload: dict[str, Any],
    rest_client,
    mcp_client,
    db_query,
    denial_db_query,
    reconciler,
    org_id: str,
    oracle_documents: dict[str, dict[str, Any]],
    reversal_state: dict[str, dict[str, dict[str, Decimal]]],
):
    payload.setdefault("idempotency_key", f"prepare:{step['id']}")

    def prepare_rest():
        return rest_client.prepare(
            f"{step['operation']}.prepare", copy.deepcopy(payload)
        )

    def prepare_mcp():
        return mcp_client.call(step["prepare_tool"], copy.deepcopy(payload))

    if step.get("concurrency_probe"):
        with ThreadPoolExecutor(max_workers=2) as executor:
            rest_prepared, mcp_prepared = list(
                executor.map(lambda fn: fn(), [prepare_rest, prepare_mcp])
            )
    else:
        rest_prepared = prepare_rest()
        mcp_prepared = prepare_mcp()
    rest_command_id, rest_hash = required_preview_fields(rest_prepared)
    mcp_command_id, mcp_hash = required_preview_fields(mcp_prepared)
    assert mcp_command_id == rest_command_id
    assert mcp_hash == rest_hash
    assert immutable_preview_projection(rest_prepared) == immutable_preview_projection(
        mcp_prepared
    )
    _assert_prepare_has_no_result(
        db_query,
        org_id,
        f"{step['operation']}.prepare",
        rest_client.oauth_claims["requester"]["client_id"],
        payload["idempotency_key"],
        rest_command_id,
    )
    preview = rest_prepared.get("preview", rest_prepared)

    expected = None
    if step.get("oracle") == "document":
        expected = calculate_document(entry["oracle"])
        oracle_documents[step["id"]] = expected
    elif step.get("oracle") == "withholding":
        expected = calculate_withholding(entry["oracle"])
        assert expected["gross_advance_amount"] == (
            expected["cash_disbursed_amount"] + expected["withheld_amount"]
        )
    elif step.get("oracle") == "reversal":
        original_id = step["original_step"]
        expected, new_state = calculate_reversal(
            oracle_documents[original_id],
            entry["oracle"]["cumulative_line_ratios"],
            reversal_state.get(original_id),
            entry["oracle"].get(
                "gst_tax_treatment", step.get("gst_tax_treatment", "statutory")
            ),
        )
        reversal_state[original_id] = new_state
    if expected:
        _assert_expected_money(preview, expected)

    approve_key = f"live-approve-{step['id']}-{uuid.uuid4()}"
    execute_key = f"live-execute-{step['id']}-{uuid.uuid4()}"

    approval_actor = step.get("approval_actor", "requester")

    def approve_rest():
        return rest_client.approve(
            rest_command_id, rest_hash, approve_key, actor=approval_actor
        )

    def approve_mcp():
        return mcp_client.call(
            "erp_operation_approve",
            {
                "command_request_id": rest_command_id,
                "preview_hash": rest_hash,
                "approval_intent": "approve",
                "idempotency_key": approve_key,
            },
            actor=approval_actor,
        )

    if step.get("concurrency_probe"):
        with ThreadPoolExecutor(max_workers=2) as executor:
            approvals = list(
                executor.map(lambda fn: fn(), [approve_rest, approve_mcp])
            )
        assert all(
            _find(candidate, "decision") in {None, "approved"}
            for candidate in approvals
        )
        approval = approvals[0]
    elif index % 2:
        approval = approve_mcp()
    else:
        approval = approve_rest()
    assert _find(approval, "decision") in {None, "approved"}

    def execute_rest():
        return rest_client.execute(rest_command_id, rest_hash, execute_key)

    def execute_mcp():
        return mcp_client.call(
            "erp_operation_execute",
            {
                "command_request_id": rest_command_id,
                "preview_hash": rest_hash,
                "idempotency_key": execute_key,
            },
        )

    if step.get("concurrency_probe"):
        with ThreadPoolExecutor(max_workers=2) as executor:
            executions = list(executor.map(lambda fn: fn(), [execute_rest, execute_mcp]))
        first_resource_id = _result_resource_id(executions[0])
        assert _result_resource_id(executions[1]) == first_resource_id
        executed = executions[0]
    elif index % 2:
        executed = execute_rest()
        first_resource_id = _result_resource_id(executed)
    else:
        executed = execute_mcp()
        first_resource_id = _result_resource_id(executed)

    # Same-key replay over the other transport must return the one original effect.
    replayed = execute_mcp() if index % 2 else execute_rest()
    assert _result_resource_id(replayed) == first_resource_id
    status_rest = rest_client.status(rest_command_id)
    status_mcp = mcp_client.call(
        "erp_operation_status_get", {"command_request_id": rest_command_id}
    )
    assert _result_resource_id(status_rest) == first_resource_id
    assert _result_resource_id(status_mcp) == first_resource_id

    evidence = reconciler.reconcile(
        rest_command_id, step["operation"], first_resource_id, preview
    )
    reconciler.assert_cross_tenant_denied(
        step["operation"], first_resource_id, denial_db_query
    )
    return {
        "command_request_id": rest_command_id,
        "preview_hash": rest_hash,
        "resource_id": first_resource_id,
        "execution": executed,
        "evidence": evidence,
    }


def test_all_canonical_operator_journeys(
    live_preflight,
    canonical_live_config,
    scenario_matrix,
    fixture_inputs,
    rest_client,
    mcp_client,
    db_query,
    denial_db_query,
    reconciler,
):
    """Run the ordered disposable-tenant journey through both transport adapters."""

    results: dict[str, dict[str, Any]] = {}
    oracle_documents: dict[str, dict[str, Any]] = {}
    reversal_state: dict[str, dict[str, dict[str, Decimal]]] = {}
    index = 0
    for journey in scenario_matrix["journeys"]:
        for step in journey["steps"]:
            entry = fixture_inputs["steps"][step["id"]]
            payload = _resolve(copy.deepcopy(entry["payload"]), results)
            results[step["id"]] = _execute_step(
                index=index,
                step=step,
                entry=entry,
                payload=payload,
                rest_client=rest_client,
                mcp_client=mcp_client,
                db_query=db_query,
                denial_db_query=denial_db_query,
                reconciler=reconciler,
                org_id=str(canonical_live_config.test_org_id),
                oracle_documents=oracle_documents,
                reversal_state=reversal_state,
            )
            index += 1

    unavailable = set(
        scenario_matrix["readiness_contract"]["unavailable_prepare_operations"]
    )
    readiness_rejections = {
        f"{probe['operation']}.prepare"
        for probe in scenario_matrix["expected_rejections"]
        if probe["phase"] == "readiness"
    }
    assert readiness_rejections == unavailable

    rejected: set[str] = set()
    for probe in scenario_matrix["expected_rejections"]:
        if probe["phase"] != "prepare":
            rejected.add(probe["id"])
            continue
        entry = fixture_inputs["steps"][probe["id"]]
        payload = _resolve(copy.deepcopy(entry["payload"]), results)
        _assert_prepare_rejected(
            probe=probe,
            payload=payload,
            rest_client=rest_client,
            mcp_client=mcp_client,
            db_query=db_query,
            org_id=str(canonical_live_config.test_org_id),
        )
        rejected.add(probe["id"])

    assert set(results) == {
        step["id"]
        for journey in scenario_matrix["journeys"]
        for step in journey["steps"]
    }
    assert rejected == {
        probe["id"] for probe in scenario_matrix["expected_rejections"]
    }
