"""Join desktop evidence to MCP and PostgreSQL by canonical UUID."""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any

import pytest

from .contract import load_operation_matrix


pytestmark = pytest.mark.integration


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
    ]
    assert len(candidates) == 1
    return candidates[0].get("preview", candidates[0])


@pytest.mark.skipif(
    os.environ.get("LIVE18_REQUIRED") != "true",
    reason="exact-SHA live18 reconciliation was not requested",
)
def test_all_browser_resources_reconcile_through_mcp_and_postgresql(
    canonical_live_config,
    mcp_client,
    reconciler,
    denial_db_query,
) -> None:
    evidence_value = os.environ.get("LIVE18_EVIDENCE_DIR", "").strip()
    assert evidence_value, "LIVE18_EVIDENCE_DIR is required"
    evidence_dir = Path(evidence_value)
    contracts = load_operation_matrix()
    assert all(item.availability == "published" for item in contracts), (
        "all 18 operations must be published before live certification"
    )

    expected_sha = os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower()
    assert len(expected_sha) == 40
    for contract in contracts:
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
        assert str(_find(mcp_status, "resource_id") or _find(mcp_status, "result_resource_id")) == resource_id
        database = reconciler.reconcile(
            command_id,
            contract.command_operation.removesuffix(".prepare"),
            resource_id,
            _preview(evidence),
        )
        reconciler.assert_cross_tenant_denied(
            contract.command_operation.removesuffix(".prepare"),
            resource_id,
            denial_db_query,
        )
        assert database, f"{contract.id} produced no database reconciliation evidence"
