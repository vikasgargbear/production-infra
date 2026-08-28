from __future__ import annotations

import hashlib
import json
import stat
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest

from .contract import load_ready_operation_matrix
from .direct_database_evidence import (
    CAPTURED_EVIDENCE_ENV,
    OUTPUT_ENV,
    DirectDatabaseEvidenceError,
    DirectDatabaseEvidenceRecorder,
    VARIANT_CAPTURED_EVIDENCE_ENV,
    VARIANT_OUTPUT_ENV,
)
from scripts.live_acceptance.live23_variants import load_supported_business_registry


SHA = "a" * 40
ORG = "d3000000-0000-7000-8000-000000000001"
DENIAL_ORG = "d3000000-0000-7000-8000-00000000002c"


def _commands() -> dict[str, str]:
    return {
        contract.id: str(contract.command_operation)
        for contract in load_ready_operation_matrix()
    }


def _environment(tmp_path: Path) -> dict[str, str]:
    return {
        "RUNNER_TEMP": str(tmp_path),
        OUTPUT_ENV: str(tmp_path / "live18-direct-database-evidence.json"),
    }


def _safe_role_query(_sql: str, _params: tuple[object, ...]):
    return [{
        "current_user": "erp_runtime",
        "superuser": False,
        "bypassrls": False,
        "migration_owner_member": False,
        "row_security": True,
        "network_family": 4,
    }]


def _record_all(recorder: DirectDatabaseEvidenceRecorder) -> None:
    for index, (operation_id, command) in enumerate(_commands().items(), start=1):
        recorder.record(
            operation_id=operation_id,
            command_operation=command,
            command_request_id=str(UUID(int=index, version=4)),
            resource_id=str(UUID(int=index + 100, version=4)),
            database={
                "header": {"grand_total": Decimal("168.00"), "posted_on": date(2026, 8, 26)},
                "response_hash": b"reviewed",
            },
        )


def test_direct_database_evidence_is_opt_in_and_rejects_ambiguous_paths(
    tmp_path: Path,
) -> None:
    assert DirectDatabaseEvidenceRecorder.from_environment(_commands(), {}) is None
    with pytest.raises(DirectDatabaseEvidenceError, match="absolute output"):
        DirectDatabaseEvidenceRecorder.from_environment(
            _commands(),
            {"RUNNER_TEMP": str(tmp_path), OUTPUT_ENV: "relative.json"},
        )
    with pytest.raises(DirectDatabaseEvidenceError, match="direct child"):
        DirectDatabaseEvidenceRecorder.from_environment(
            _commands(),
            {
                "RUNNER_TEMP": str(tmp_path),
                OUTPUT_ENV: str(tmp_path / "nested" / "evidence.json"),
            },
        )
    with pytest.raises(DirectDatabaseEvidenceError, match="cannot be selected together"):
        DirectDatabaseEvidenceRecorder.from_environment(
            _commands(),
            {
                **_environment(tmp_path),
                CAPTURED_EVIDENCE_ENV: str(tmp_path / "railway.json"),
            },
        )


def test_direct_database_evidence_writes_one_hashed_owner_only_ready_scope_artifact(
    tmp_path: Path,
) -> None:
    recorder = DirectDatabaseEvidenceRecorder.from_environment(
        _commands(), _environment(tmp_path)
    )
    assert recorder is not None
    _record_all(recorder)
    recorder.finalize(
        organization_id=ORG,
        denial_organization_id=DENIAL_ORG,
        expected_sha=SHA,
        project_ref="rgihahbmkrmhitjdjvev",
        query=_safe_role_query,
    )

    artifact = json.loads(recorder.output_path.read_text(encoding="utf-8"))
    unsigned = {key: value for key, value in artifact.items() if key != "content_sha256"}
    digest = hashlib.sha256(
        json.dumps(unsigned, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    assert artifact["schema"] == "aasopharma.live18.database-evidence.v1"
    assert artifact["action"] == "capture-evidence"
    assert artifact["evidence_scope"] == "live18"
    assert artifact["content_sha256"] == digest
    assert artifact["organization_id"] == ORG
    assert artifact["denial_organization_id"] == DENIAL_ORG
    assert artifact["runtime_role"] == {
        "current_user": "erp_runtime",
        "superuser": False,
        "bypassrls": False,
        "migration_owner_member": False,
        "row_security": True,
        "network_family": 4,
        "transport": "supabase_direct_ipv4_from_github_actions",
    }
    assert set(artifact["resources"]) == set(_commands())
    assert len(artifact["resources"]) == 17
    assert "expense_claim" not in artifact["resources"]
    assert all(
        row["command_operation"] == _commands()[operation_id]
        and row["cross_tenant_denied"] is True
        for operation_id, row in artifact["resources"].items()
    )
    assert artifact["resources"]["sales_invoice"]["database"]["header"] == {
        "grand_total": "168.00",
        "posted_on": "2026-08-26",
    }
    assert artifact["resources"]["sales_invoice"]["database"]["response_hash"] == {
        "hex": b"reviewed".hex()
    }
    assert stat.S_IMODE(recorder.output_path.stat().st_mode) == 0o600
    serialized = recorder.output_path.read_text(encoding="utf-8").lower()
    assert "postgresql://" not in serialized
    assert "password" not in serialized
    assert "access_token" not in serialized


def test_direct_database_evidence_never_writes_partial_or_unsafe_role_artifacts(
    tmp_path: Path,
) -> None:
    recorder = DirectDatabaseEvidenceRecorder.from_environment(
        _commands(), _environment(tmp_path)
    )
    assert recorder is not None
    first_operation, command = next(iter(_commands().items()))
    recorder.record(
        operation_id=first_operation,
        command_operation=command,
        command_request_id="00000000-0000-4000-8000-000000000001",
        resource_id="00000000-0000-4000-8000-000000000002",
        database={"header": {"status": "posted"}},
    )
    with pytest.raises(DirectDatabaseEvidenceError, match="incomplete"):
        recorder.finalize(
            organization_id=ORG,
            denial_organization_id=DENIAL_ORG,
            expected_sha=SHA,
            project_ref="rgihahbmkrmhitjdjvev",
            query=_safe_role_query,
        )
    assert not recorder.output_path.exists()

    second_root = tmp_path / "second"
    second_root.mkdir()
    unsafe = DirectDatabaseEvidenceRecorder.from_environment(
        _commands(), _environment(second_root)
    )
    assert unsafe is not None
    _record_all(unsafe)
    with pytest.raises(DirectDatabaseEvidenceError, match="no owner/RLS bypass"):
        unsafe.finalize(
            organization_id=ORG,
            denial_organization_id=DENIAL_ORG,
            expected_sha=SHA,
            project_ref="rgihahbmkrmhitjdjvev",
            query=lambda _sql, _params: [{
                "current_user": "erp_runtime",
                "superuser": False,
                "bypassrls": True,
                "migration_owner_member": False,
                "row_security": True,
                "network_family": 6,
            }],
        )
    assert not unsafe.output_path.exists()


def test_direct_database_evidence_rejects_credentials_before_recording(tmp_path: Path) -> None:
    recorder = DirectDatabaseEvidenceRecorder.from_environment(
        _commands(), _environment(tmp_path)
    )
    assert recorder is not None
    operation_id, command = next(iter(_commands().items()))
    with pytest.raises(DirectDatabaseEvidenceError, match="forbidden credential field"):
        recorder.record(
            operation_id=operation_id,
            command_operation=command,
            command_request_id="00000000-0000-4000-8000-000000000001",
            resource_id="00000000-0000-4000-8000-000000000002",
            database={"password": "must-not-write"},
        )
    assert recorder.resources == {}


def test_direct_database_evidence_supports_separate_exact_variant_scope(
    tmp_path: Path,
) -> None:
    commands = {
        str(row["id"]): str(row["command_operation"])
        for row in load_supported_business_registry()
    }
    environment = {
        "RUNNER_TEMP": str(tmp_path),
        VARIANT_OUTPUT_ENV: str(tmp_path / "live23-business-database-evidence.json"),
    }
    recorder = DirectDatabaseEvidenceRecorder.from_environment(
        commands,
        environment,
        output_env=VARIANT_OUTPUT_ENV,
        captured_evidence_env=VARIANT_CAPTURED_EVIDENCE_ENV,
        evidence_scope="supported_business_variants",
    )
    assert recorder is not None
    for index, (variant_id, command) in enumerate(commands.items(), start=1):
        recorder.record(
            operation_id=variant_id,
            command_operation=command,
            command_request_id=str(UUID(int=index, version=4)),
            resource_id=str(UUID(int=index + 100, version=4)),
            database={"variant_id": variant_id},
        )
    recorder.finalize(
        organization_id=ORG,
        denial_organization_id=DENIAL_ORG,
        expected_sha=SHA,
        project_ref="rgihahbmkrmhitjdjvev",
        query=_safe_role_query,
    )

    artifact = json.loads(recorder.output_path.read_text(encoding="utf-8"))
    assert artifact["evidence_scope"] == "supported_business_variants"
    assert len(artifact["resources"]) == 7
    assert set(artifact["resources"]) == set(commands)
