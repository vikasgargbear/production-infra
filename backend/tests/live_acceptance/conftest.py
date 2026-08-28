"""Reuse the reviewed canonical live transport/database fixtures."""

from __future__ import annotations

import os

import pytest

from tests.live_canonical.conftest import (  # noqa: F401
    canonical_live_config,
    db_query,
    denial_db_query,
    mcp_client,
    reconciler,
)

from .contract import load_ready_operation_matrix
from .direct_database_evidence import (
    DirectDatabaseEvidenceRecorder,
    VARIANT_CAPTURED_EVIDENCE_ENV,
    VARIANT_OUTPUT_ENV,
)
from scripts.live_acceptance.live23_variants import load_supported_business_registry
from .business_variant_reconciliation_evidence import (
    BusinessVariantReconciliationEvidenceRecorder,
)


@pytest.fixture(scope="session")
def direct_database_evidence_recorder(request):
    """Write direct DB evidence only after every exact Live18 case records."""

    expected_commands = {
        contract.id: str(contract.command_operation)
        for contract in load_ready_operation_matrix()
    }
    recorder = DirectDatabaseEvidenceRecorder.from_environment(expected_commands)
    if recorder is None:
        yield None
        return

    config = request.getfixturevalue("canonical_live_config")
    query = request.getfixturevalue("db_query")
    yield recorder
    recorder.finalize(
        organization_id=str(config.test_org_id),
        denial_organization_id=str(config.denial_org_id),
        expected_sha=os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower(),
        project_ref=config.project_ref,
        query=query,
    )


@pytest.fixture(scope="session")
def direct_business_variant_database_evidence_recorder(request):
    """Write a separate exact seven-variant direct PostgreSQL artifact."""

    expected_commands = {
        str(contract["id"]): str(contract["command_operation"])
        for contract in load_supported_business_registry()
    }
    recorder = DirectDatabaseEvidenceRecorder.from_environment(
        expected_commands,
        output_env=VARIANT_OUTPUT_ENV,
        captured_evidence_env=VARIANT_CAPTURED_EVIDENCE_ENV,
        evidence_scope="supported_business_variants",
    )
    if recorder is None:
        yield None
        return

    config = request.getfixturevalue("canonical_live_config")
    query = request.getfixturevalue("db_query")
    yield recorder
    recorder.finalize(
        organization_id=str(config.test_org_id),
        denial_organization_id=str(config.denial_org_id),
        expected_sha=os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower(),
        project_ref=config.project_ref,
        query=query,
    )


@pytest.fixture(scope="session")
def business_variant_reconciliation_evidence_recorder(request):
    """Retain hashes, never raw MCP or database payloads, for seven variants."""

    expected_commands = {
        str(contract["id"]): str(contract["command_operation"])
        for contract in load_supported_business_registry()
    }
    recorder = BusinessVariantReconciliationEvidenceRecorder.from_environment(
        expected_commands
    )
    if recorder is None:
        yield None
        return
    config = request.getfixturevalue("canonical_live_config")
    yield recorder
    recorder.finalize(
        expected_sha=os.environ.get("LIVE18_EXPECTED_DEPLOYED_SHA", "").strip().lower(),
        organization_id=str(config.test_org_id),
        branch_id=str(config.test_branch_id),
    )
