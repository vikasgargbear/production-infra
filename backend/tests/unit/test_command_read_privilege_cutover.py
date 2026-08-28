from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0026_command_read_privilege_cutover.sql"
REVISION = (
    ROOT
    / "backend/alembic/versions/20260826_0026_command_read_privilege_cutover.py"
)


def _sql() -> str:
    return SQL.read_text(encoding="utf-8")


def test_cutover_migration_is_hash_bound_and_linear() -> None:
    spec = importlib.util.spec_from_file_location("command_read_cutover", REVISION)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "20260826_0026"
    assert module.down_revision == "20260826_0025"
    assert module.EXPECTED_SQL_SHA256 == hashlib.sha256(SQL.read_bytes()).hexdigest()


def test_runtime_receives_only_typed_command_read_functions() -> None:
    sql = _sql()

    for signature in (
        "command_authority_context(uuid,uuid)",
        "payment_post_provenance(uuid)",
        "sales_dispatch_post_provenance(uuid,uuid)",
        "adjustment_note_post_provenance(\n    uuid,uuid,uuid,bytea,uuid,timestamptz\n)",
    ):
        assert f"GRANT EXECUTE ON FUNCTION erp_automation_reads.{signature}" in sql
    assert (
        "REVOKE ALL ON TABLE automation.command_requests FROM erp_app, erp_runtime;"
        in sql
    )


def test_mounted_application_has_no_raw_command_request_access() -> None:
    direct_references = []
    for path in (ROOT / "backend/app").rglob("*.py"):
        source = path.read_text(encoding="utf-8")
        if "automation.command_requests" in source:
            direct_references.append(path.relative_to(ROOT).as_posix())

    assert direct_references == []


def test_exact_authority_projection_is_tenant_actor_branch_and_hash_bound() -> None:
    sql = _sql()

    assert "request.id = command_request_id" in sql
    assert "organization_id IS DISTINCT FROM erp_security.current_org_id()" in sql
    assert "erp_security.current_actor_is_active() IS DISTINCT FROM true" in sql
    assert "erp_security.can_access_branch(request.branch_id)" in sql
    assert "erp_security.can_access_branch(request.destination_branch_id)" in sql
    assert "request.request_hash = pg_catalog.sha256(request.request_bytes)" in sql
    assert "request.preview_hash = pg_catalog.sha256(request.preview_bytes)" in sql
    assert "request.response_hash = pg_catalog.sha256(request.response_bytes)" in sql


def test_web_command_authority_preserves_exact_cross_branch_grant_scope() -> None:
    source = (
        ROOT / "backend/app/api/routes/web_operator_actions.py"
    ).read_text(encoding="utf-8")

    assert "grant_row.branch_id=command.branch_id" in source
    assert (
        "command.destination_branch_id IS NULL\n"
        "                             OR grant_row.branch_id=command.destination_branch_id"
    ) in source


def test_resource_projections_enforce_exact_succeeded_command_cardinality() -> None:
    sql = _sql()

    assert sql.count("count(*) OVER") >= 3
    assert sql.count("candidate_count = 1") >= 3
    assert "request.target_resource_id = request.result_resource_id" in sql
    assert "request.target_resource_id = dispatch_id" in sql
    assert "request.target_resource_id = adjustment_note_id" in sql
    assert (
        "approval.approver_membership_id\n                 <> request.requested_by_membership_id"
        in sql
    )
