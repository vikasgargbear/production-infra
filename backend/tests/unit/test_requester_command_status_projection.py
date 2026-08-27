from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
SOURCE = (
    ROOT
    / "database/canonical/operations/automation/requester_command_status.sql"
)
GENERATOR = ROOT / "backend/scripts/generate_requester_command_status_migration.py"
MIGRATION_SQL = (
    ROOT / "backend/alembic/sql/20260827_0033_requester_command_status.sql"
)
REVISION = (
    ROOT / "backend/alembic/versions/20260827_0033_requester_command_status.py"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_projection_has_one_reviewed_source_and_hash_bound_linear_migration() -> None:
    generator = _load(GENERATOR, "requester_status_generator")
    revision = _load(REVISION, "requester_status_revision")
    migration = MIGRATION_SQL.read_bytes()

    assert generator.render().encode("utf-8") == migration
    assert revision.revision == "20260827_0033"
    assert revision.down_revision == "20260827_0032"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration).hexdigest()
    assert SOURCE.read_text(encoding="utf-8").count(
        "CREATE OR REPLACE FUNCTION erp_automation_reads.requester_command_status("
    ) == 1


def test_projection_derives_approval_only_from_current_exact_evidence() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "evidence.preview_hash = command.preview_hash" in source
    assert "evidence.aggregate_version_hash = command.aggregate_version_hash" in source
    assert "evidence.valid_until_at > pg_catalog.transaction_timestamp()" in source
    assert "command.expires_at <= pg_catalog.transaction_timestamp()" in source
    assert "approval.has_exact_rejection" in source
    assert "count(DISTINCT evidence.approver_membership_id) FILTER" in source
    assert "approval.valid_approval_count >= command.required_approval_count" in source
    assert "command.approval_policy <> 'actor_confirmation'" in source
    assert "command.approval_policy <> 'human_compliance_approver'" in source
    assert "evidence.authentication_strength = 'mfa'" in source


def test_projection_preserves_terminal_state_and_does_not_mutate_commands() -> None:
    source = SOURCE.read_text(encoding="utf-8")

    assert "command.status NOT IN ('prepared', 'pending_approval', 'approved')" in source
    assert "THEN command.status" in source
    assert "UPDATE automation.command_requests" not in source
    assert "INSERT INTO automation.command_approvals" not in source
    assert "DELETE FROM automation.command_approvals" not in source
    assert "GRANT EXECUTE ON FUNCTION erp_automation_reads.requester_command_status" in source
    assert "TO erp_runtime" in source
