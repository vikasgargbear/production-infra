"""Join desktop evidence to MCP and PostgreSQL by canonical UUID."""

from __future__ import annotations

import json
import os
import uuid
import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest

from app.domain.operator_actions.contract import (
    PREPARE_PAYLOAD_MODELS,
    validate_prepare_payload_semantics,
)
from scripts.live18_evidence_contract import MANDATORY_LINEAGE_PATHS

from .contract import load_ready_operation_matrix
from .mcp_readback import mcp_readback_arguments
from .readback_consistency import assert_canonical_projection_consistency
from scripts.live_acceptance.live23_variants import load_supported_business_registry


pytestmark = pytest.mark.integration


def test_live18_lineage_contract_covers_every_published_prepare_model() -> None:
    assert set(MANDATORY_LINEAGE_PATHS) == set(PREPARE_PAYLOAD_MODELS)


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


def _preview(evidence: dict[str, Any]) -> dict[str, Any]:
    prepare_path = f"/api/web/actions/{evidence['command_operation']}/prepare"
    candidates = [
        row["responseBody"] for row in evidence["http_evidence"]
        if row["method"] == "POST" and row["path"] == prepare_path
        and 200 <= row["status"] < 300
    ]
    assert len(candidates) == 1, "expected exactly one successful canonical prepare"
    return candidates[0].get("preview", candidates[0])


def _prepare_request(evidence: dict[str, Any]) -> dict[str, Any]:
    prepare_path = f"/api/web/actions/{evidence['command_operation']}/prepare"
    candidates = [
        row.get("requestBody") for row in evidence["http_evidence"]
        if row["method"] == "POST" and row["path"] == prepare_path
        and 200 <= row["status"] < 300
    ]
    assert len(candidates) == 1, "expected exactly one successful canonical prepare request"
    assert isinstance(candidates[0], dict), "canonical prepare omitted its exact request body"
    return candidates[0]


def _path_value(payload: dict[str, Any], path: str) -> Any:
    value: Any = payload
    for part in path.split("."):
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def _validated_prepare_request(evidence: dict[str, Any]) -> dict[str, Any]:
    operation = evidence["command_operation"]
    request = _prepare_request(evidence)
    assert operation in PREPARE_PAYLOAD_MODELS, (
        f"{operation} has no published strict prepare-payload model"
    )
    assert operation in MANDATORY_LINEAGE_PATHS, (
        f"{operation} has no reviewed Live18 lineage contract"
    )
    validated = PREPARE_PAYLOAD_MODELS[operation].model_validate(request)
    validate_prepare_payload_semantics(operation, validated)
    canonical = validated.model_dump(mode="json", exclude_none=True)
    for path in MANDATORY_LINEAGE_PATHS[operation]:
        value = _path_value(canonical, path)
        assert value not in (None, "", []), (
            f"{operation} omitted mandatory canonical lineage at {path}"
        )
    branch_id = canonical.get("branch_id", canonical.get("source_branch_id"))
    assert str(branch_id) == evidence["branch_id"], (
        f"{operation} browser payload branch differs from its evidence envelope"
    )
    return request


@lru_cache(maxsize=1)
def _captured_database_evidence() -> dict[str, Any] | None:
    value = os.environ.get(
        "PHARMA_CANONICAL_LIVE_DATABASE_EVIDENCE_PATH", ""
    ).strip()
    if not value:
        return None
    path = Path(value)
    assert path.is_absolute(), "captured database evidence path must be absolute"
    artifact = json.loads(path.read_text(encoding="utf-8"))
    assert artifact.get("schema") == "aasopharma.live18.railway-database-response.v1"
    assert artifact.get("action") == "capture-evidence"
    expected_hash = artifact.get("content_sha256")
    unsigned = {key: item for key, item in artifact.items() if key != "content_sha256"}
    actual_hash = hashlib.sha256(
        json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert expected_hash == actual_hash, "captured database evidence hash differs"
    assert artifact.get("expected_sha") == os.environ.get(
        "LIVE18_EXPECTED_DEPLOYED_SHA", ""
    ).strip().lower()
    assert artifact.get("project_ref") == os.environ.get(
        "PHARMA_CANONICAL_LIVE_PROJECT_REF", ""
    ).strip()
    assert artifact.get("run_id") == os.environ.get("GITHUB_RUN_ID", "").strip()
    assert artifact.get("run_attempt") == os.environ.get(
        "GITHUB_RUN_ATTEMPT", ""
    ).strip()
    assert artifact.get("request_nonce") == os.environ.get(
        "LIVE18_RAILWAY_REQUEST_NONCE", ""
    ).strip()
    assert artifact.get("deployment_id") == os.environ.get(
        "RAILWAY_API_DEPLOYMENT_ID", ""
    ).strip()
    assert artifact.get("deployment_instance_id") == os.environ.get(
        "RAILWAY_API_DEPLOYMENT_INSTANCE_ID", ""
    ).strip()
    assert artifact.get("runtime_role") == {
        "current_user": "erp_runtime",
        "superuser": False,
        "bypassrls": False,
        "migration_owner_member": False,
        "network_family": 6,
        "transport": "supabase_direct_ipv6_from_railway",
    }
    return artifact


@lru_cache(maxsize=1)
def _captured_business_variant_database_evidence() -> dict[str, Any] | None:
    value = os.environ.get(
        "PHARMA_CANONICAL_BUSINESS_VARIANT_DATABASE_EVIDENCE_PATH", ""
    ).strip()
    if not value:
        return None
    path = Path(value)
    assert path.is_absolute(), "variant database evidence path must be absolute"
    artifact = json.loads(path.read_text(encoding="utf-8"))
    assert artifact.get("schema") == "aasopharma.live18.railway-database-response.v1"
    assert artifact.get("action") == "capture-evidence"
    assert artifact.get("evidence_scope") == "supported_business_variants"
    expected_hash = artifact.get("content_sha256")
    unsigned = {key: item for key, item in artifact.items() if key != "content_sha256"}
    actual_hash = hashlib.sha256(
        json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    assert expected_hash == actual_hash, "variant database evidence hash differs"
    assert artifact.get("expected_sha") == os.environ.get(
        "LIVE18_EXPECTED_DEPLOYED_SHA", ""
    ).strip().lower()
    assert artifact.get("project_ref") == os.environ.get(
        "PHARMA_CANONICAL_LIVE_PROJECT_REF", ""
    ).strip()
    return artifact


def test_preview_ignores_a_prior_missing_required_422() -> None:
    evidence = {
        "command_operation": "sales.invoice.prepare",
        "http_evidence": [
            {
                "method": "POST",
                "path": "/api/web/actions/sales.invoice.prepare/prepare",
                "status": 422,
                "responseBody": {"detail": "missing customer"},
            },
            {
                "method": "POST",
                "path": "/api/web/actions/sales.invoice.prepare/prepare",
                "status": 201,
                "responseBody": {"preview": {"net_amount": "168.00"}},
            },
        ],
    }

    assert _preview(evidence) == {"net_amount": "168.00"}
    assert _prepare_request({
        **evidence,
        "http_evidence": [
            {**evidence["http_evidence"][0], "requestBody": {"missing": True}},
            {**evidence["http_evidence"][1], "requestBody": {"customer_id": "canonical-customer"}},
        ],
    }) == {"customer_id": "canonical-customer"}


def _assert_mcp_identity(
    payload: Any,
    *,
    command_id: str,
    resource_id: str,
    require_command_id: bool = False,
) -> None:
    encoded = json.dumps(payload, sort_keys=True)
    assert resource_id in encoded, "MCP readback omitted the canonical resource UUID"
    discovered_command = _find(payload, "command_request_id")
    if require_command_id:
        assert discovered_command is not None, "MCP command status omitted command_request_id"
    if discovered_command is not None:
        assert str(discovered_command) == command_id


@pytest.mark.skipif(
    os.environ.get("LIVE18_REQUIRED") != "true",
    reason="exact-SHA live18 reconciliation was not requested",
)
@pytest.mark.parametrize(
    "contract",
    load_ready_operation_matrix(),
    ids=lambda contract: contract.id,
)
def test_browser_resource_reconciles_through_mcp_and_postgresql(
    contract,
    canonical_live_config,
    direct_database_evidence_recorder,
    mcp_client,
    request,
) -> None:
    evidence_value = os.environ.get("LIVE18_EVIDENCE_DIR", "").strip()
    assert evidence_value, "LIVE18_EVIDENCE_DIR is required"
    evidence_dir = Path(evidence_value)
    assert contract.availability == "published", contract.id

    expected_sha = os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower()
    assert len(expected_sha) == 40
    evidence_path = evidence_dir / f"{contract.id}.json"
    assert evidence_path.is_file(), f"missing desktop evidence: {evidence_path}"
    evidence = json.loads(evidence_path.read_text())
    assert evidence["operation_id"] == contract.id
    assert evidence["tested_sha"] == expected_sha
    assert evidence["organization_id"] == str(canonical_live_config.test_org_id)
    assert evidence["branch_id"] == str(canonical_live_config.test_branch_id)
    assert evidence["requester_user_id"] != evidence["reviewer_user_id"]
    command_id = str(uuid.UUID(evidence["command_request_id"]))
    resource_id = str(uuid.UUID(evidence["resource_id"]))

    mcp_status = mcp_client.call(
        "erp_operation_status_get", {"command_request_id": command_id}
    )
    _assert_mcp_identity(
        mcp_status,
        command_id=command_id,
        resource_id=resource_id,
        require_command_id=True,
    )
    assert _find(mcp_status, "status") == "succeeded", (
        f"{contract.id} MCP command status is not succeeded"
    )
    declared_tool = contract.mcp_readback_tool
    assert declared_tool and declared_tool != "erp_operation_status_get", (
        f"{contract.id} must use an operation-specific MCP readback"
    )
    declared_readback = mcp_client.call(
        declared_tool,
        mcp_readback_arguments(
            declared_tool,
            branch_id=evidence["branch_id"],
            command_id=command_id,
            resource_id=resource_id,
        ),
    )
    _assert_mcp_identity(
        declared_readback,
        command_id=command_id,
        resource_id=resource_id,
    )
    operation = contract.command_operation.removesuffix(".prepare")
    captured = _captured_database_evidence()
    if captured is None:
        reconciler = request.getfixturevalue("reconciler")
        denial_db_query = request.getfixturevalue("denial_db_query")
        database = reconciler.reconcile(
            command_id,
            operation,
            resource_id,
            _preview(evidence),
            _validated_prepare_request(evidence),
        )
        reconciler.assert_cross_tenant_denied(
            operation,
            resource_id,
            denial_db_query,
        )
    else:
        assert captured["expected_sha"] == expected_sha
        assert captured["project_ref"] == canonical_live_config.project_ref
        assert captured["organization_id"] == str(canonical_live_config.test_org_id)
        assert captured["denial_organization_id"] == str(
            canonical_live_config.denial_org_id
        )
        row = captured["resources"][contract.id]
        assert row["command_operation"] == contract.command_operation
        assert row["command_request_id"] == command_id
        assert row["resource_id"] == resource_id
        assert row["cross_tenant_denied"] is True
        database = row["database"]
    assert database, f"{contract.id} produced no database reconciliation evidence"
    assert_canonical_projection_consistency(
        operation,
        rest=evidence["rest_readback"],
        mcp=declared_readback,
        database=database,
    )
    if direct_database_evidence_recorder is not None:
        assert captured is None, "direct evidence cannot reuse captured Railway evidence"
        direct_database_evidence_recorder.record(
            operation_id=contract.id,
            command_operation=contract.command_operation,
            command_request_id=command_id,
            resource_id=resource_id,
            database=database,
        )


@pytest.mark.skipif(
    os.environ.get("LIVE23_BUSINESS_VARIANTS_REQUIRED") != "true",
    reason="exact-SHA supported-business variant reconciliation was not requested",
)
@pytest.mark.parametrize(
    "contract",
    load_supported_business_registry(),
    ids=lambda contract: contract["id"],
)
def test_supported_business_variant_reconciles_through_mcp_and_postgresql(
    contract,
    canonical_live_config,
    business_variant_reconciliation_evidence_recorder,
    direct_business_variant_database_evidence_recorder,
    mcp_client,
    request,
) -> None:
    evidence_value = os.environ.get("LIVE18_EVIDENCE_DIR", "").strip()
    assert evidence_value, "LIVE18_EVIDENCE_DIR is required"
    evidence_dir = Path(evidence_value) / "business-variants"
    operation_id = contract["id"]
    expected_sha = os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower()
    evidence_path = evidence_dir / f"{operation_id}.json"
    assert evidence_path.is_file(), f"missing variant evidence: {evidence_path}"
    evidence = json.loads(evidence_path.read_text())
    assert evidence["operation_id"] == operation_id
    assert evidence["tested_sha"] == expected_sha
    assert evidence["organization_id"] == str(canonical_live_config.test_org_id)
    assert evidence["branch_id"] == str(canonical_live_config.test_branch_id)
    assert evidence["requester_user_id"] != evidence["reviewer_user_id"]
    command_id = str(uuid.UUID(evidence["command_request_id"]))
    resource_id = str(uuid.UUID(evidence["resource_id"]))

    mcp_status = mcp_client.call(
        "erp_operation_status_get", {"command_request_id": command_id}
    )
    _assert_mcp_identity(
        mcp_status,
        command_id=command_id,
        resource_id=resource_id,
        require_command_id=True,
    )
    assert _find(mcp_status, "status") == "succeeded"
    declared_tool = contract["mcp_readback_tool"]
    declared_readback = mcp_client.call(
        declared_tool,
        mcp_readback_arguments(
            declared_tool,
            branch_id=evidence["branch_id"],
            command_id=command_id,
            resource_id=resource_id,
        ),
    )
    _assert_mcp_identity(
        declared_readback,
        command_id=command_id,
        resource_id=resource_id,
    )
    operation = contract["command_operation"].removesuffix(".prepare")
    captured = _captured_business_variant_database_evidence()
    if captured is None:
        reconciler = request.getfixturevalue("reconciler")
        denial_db_query = request.getfixturevalue("denial_db_query")
        database = reconciler.reconcile(
            command_id,
            operation,
            resource_id,
            _preview(evidence),
            _validated_prepare_request(evidence),
        )
        reconciler.assert_cross_tenant_denied(
            operation, resource_id, denial_db_query,
        )
    else:
        assert captured["expected_sha"] == expected_sha
        assert captured["project_ref"] == canonical_live_config.project_ref
        row = captured["resources"][operation_id]
        assert row["command_operation"] == contract["command_operation"]
        assert row["command_request_id"] == command_id
        assert row["resource_id"] == resource_id
        assert row["cross_tenant_denied"] is True
        database = row["database"]
    assert database, f"{operation_id} produced no database reconciliation evidence"
    assert_canonical_projection_consistency(
        operation,
        rest=evidence["rest_readback"],
        mcp=declared_readback,
        database=database,
    )
    if business_variant_reconciliation_evidence_recorder is not None:
        business_variant_reconciliation_evidence_recorder.record(
            variant_id=operation_id,
            command_operation=contract["command_operation"],
            command_request_id=command_id,
            resource_id=resource_id,
            browser_evidence_path=evidence_path,
            mcp_status=mcp_status,
            mcp_readback=declared_readback,
            database=database,
        )
    if direct_business_variant_database_evidence_recorder is not None:
        assert captured is None, "direct variant evidence cannot reuse Railway evidence"
        direct_business_variant_database_evidence_recorder.record(
            operation_id=operation_id,
            command_operation=contract["command_operation"],
            command_request_id=command_id,
            resource_id=resource_id,
            database=database,
        )
