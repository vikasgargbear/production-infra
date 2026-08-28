from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
REVISION = ROOT / "backend/alembic/versions/20260828_0047_authenticated_organization_onboarding.py"
SQL = ROOT / "backend/alembic/sql/20260828_0047_authenticated_organization_onboarding.sql"


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_onboarding_migration_is_linear_and_hash_bound() -> None:
    revision = _load(REVISION, "authenticated_organization_onboarding_revision")
    sql = SQL.read_text(encoding="utf-8")
    assert revision.revision == "20260828_0047"
    assert revision.down_revision == "20260828_0046"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(sql.encode()).hexdigest()


def test_onboarding_reuses_single_use_canonical_idempotency_authority() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "CREATE FUNCTION erp_core_commands.create_organization_invitation(",
        "CREATE FUNCTION erp_core_commands.accept_organization_invitation(",
        "erp_security.has_permission('core.access.manage',NULL::uuid)",
        "'core.organization.invitation'",
        "token_digest bytea",
        "request_hash:=extensions.digest",
        "WHERE claim.org_id=inviting_org_id AND claim.id=invitation_id",
        "invitation.status<>'claimed'",
        "claim.idempotency_key_hash=token_digest FOR UPDATE",
        "PERFORM erp_core_commands.finish_claim(",
        "'core.memberships',membership_id",
        "invitation.status='succeeded'",
        "invitation was consumed by another identity",
    ):
        assert fragment in sql
    assert "CREATE TABLE" not in sql
    assert "DELETE FROM core.idempotency_keys" not in sql


def test_invitation_claims_are_tenant_email_role_scope_and_time_bound() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "'version','aasopharma-organization-invitation-v1'",
        "'audience','aasopharma-erp-onboarding'",
        "'purpose','organization_invitation'",
        "'invitation_id',requested_invitation_id",
        "'organization_id',organization_id",
        "'inviting_membership_id',actor_membership_id",
        "'email',normalized_email",
        "'role_id',requested_role_id",
        "'scope_kind',requested_scope_kind",
        "'branch_id',requested_branch_id",
        "'issued_at',requested_issued_at",
        "'expires_at',requested_expires_at",
        "expires_at>issued_at+interval '30 days'",
        "requested_scope_kind NOT IN ('organization','branch')",
    ):
        assert fragment in sql


def test_unauthenticated_bootstrap_is_narrowly_system_audited() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "authenticated_onboarding_scope := EXISTS",
        "scope.scope IN ('authenticated_organization_onboard','authenticated_invitation_accept')",
        "scope.org_id=event_org_id",
        "WHEN regulatory_import_scope OR provider_completion_scope OR authenticated_onboarding_scope THEN 'system'",
        "erp_core_commands.command_scopes",
        "runtime audited mutation lacks actor membership",
    ):
        assert fragment in sql
    assert "GRANT" not in sql.split("CREATE TABLE", 1)[0] or "CREATE TABLE" not in sql


def test_self_service_bootstrap_is_replay_safe_and_provisions_owner_authority() -> None:
    sql = SQL.read_text(encoding="utf-8")
    for fragment in (
        "pg_advisory_xact_lock(pg_catalog.hashtextextended(verified_auth_user_id::text,470001))",
        "IF existing_count=1 THEN",
        "'organization_owner','Organization Owner'",
        "FROM core.permissions permission WHERE permission.status='active'",
        "main_branch_id,'MAIN','Main Branch'",
        "CREATE FUNCTION erp_core_commands.resolve_auth_organization(",
        "'no_active_membership'",
        "'exactly_one_active_membership'",
        "'multiple_active_memberships'",
    ):
        assert fragment in sql
    assert "CREATE UNIQUE INDEX core_users_auth_user_id_uq" not in sql
    assert "FROM auth.users" not in sql


def test_runtime_can_only_execute_reviewed_onboarding_functions() -> None:
    sql = SQL.read_text(encoding="utf-8")
    signatures = (
        "erp_core_commands.resolve_auth_organization(uuid)",
        "erp_core_commands.onboard_organization(uuid,text,text,text,text,text,text,text,text)",
        "erp_core_commands.create_organization_invitation(uuid,uuid,uuid,text,uuid,text,uuid,bytea,timestamptz,timestamptz)",
        "erp_core_commands.accept_organization_invitation(uuid,text,text,uuid,uuid,uuid,uuid,text,uuid,bytea,timestamptz,timestamptz)",
    )
    for signature in signatures:
        assert f"REVOKE ALL ON FUNCTION {signature} FROM PUBLIC,erp_runtime;" in sql
        assert f"GRANT EXECUTE ON FUNCTION {signature} TO erp_app;" in sql
