from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SQL = ROOT / "backend/alembic/sql/20260826_0029_evidence_storage_auth_hook.sql"
REVISION = (
    ROOT
    / "backend/alembic/versions/20260826_0029_evidence_storage_auth_hook.py"
)


def _revision_module():
    spec = importlib.util.spec_from_file_location("evidence_storage_auth_hook", REVISION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_migration_is_hash_bound_and_linear() -> None:
    revision = _revision_module()
    source = SQL.read_bytes()

    assert revision.revision == "20260826_0029"
    assert revision.down_revision == "20260826_0028"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(source).hexdigest()


def test_hook_grants_only_the_supabase_auth_executor() -> None:
    sql = SQL.read_text(encoding="utf-8")

    assert "SECURITY INVOKER" in sql
    assert "SET search_path = ''" in sql
    assert "FROM PUBLIC" in sql
    assert "TO supabase_auth_admin" in sql
    assert "SECURITY DEFINER" not in sql
    assert "auth.users" not in sql
    assert "TO service_role" not in sql
    assert "canonical evidence storage Auth hook has an unexpected grantee" in sql


def test_hook_requires_one_exact_password_service_identity() -> None:
    sql = SQL.read_text(encoding="utf-8")
    authority = json.loads(
        (
            ROOT
            / "database/canonical/security/evidence-storage-service-identity.json"
        ).read_text(encoding="utf-8")
    )

    assert authority["auth_user_id"] in sql
    assert authority["email"] in sql
    assert authority["app_metadata_marker"] in sql
    assert authority["database_role"] in sql
    assert "authentication_method NOT IN ('password', 'token_refresh')" in sql
    assert "claim_role IS DISTINCT FROM 'authenticated'" in sql
    assert "claims->>'aud' IS DISTINCT FROM 'authenticated'" in sql
    assert "OR claim_role IS NOT DISTINCT FROM service_role" in sql
    assert "OR claim_token_marker IS NOT DISTINCT FROM service_marker" in sql
    assert "canonical evidence storage service identity is invalid" in sql
    assert "ARRAY['role']::text[]" in sql
    assert "ARRAY['exp']::text[]" in sql
    assert "ARRAY['erp_service_identity']::text[]" in sql
    assert f"issued_at_epoch + {authority['max_access_token_seconds']}" in sql
    assert "original_expiry_epoch <= issued_at_epoch" in sql
    assert "pg_catalog.jsonb_typeof(claims->'exp') IS DISTINCT FROM 'number'" in sql


def test_disposable_postgres_declares_the_hosted_hook_principal() -> None:
    fixture = (
        ROOT / "database/canonical/ci/bootstrap_supabase_auth.sql"
    ).read_text(encoding="utf-8")

    assert "CREATE ROLE supabase_auth_admin NOLOGIN NOINHERIT NOBYPASSRLS" in fixture


def test_postgres15_gate_executes_password_refresh_ttl_and_acl_proof() -> None:
    gate = (
        ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    probe = (
        ROOT / "backend/tests/postgres/check_evidence_storage_auth_hook.py"
    ).read_text(encoding="utf-8")

    assert "check_evidence_storage_auth_hook.py" in gate
    assert 'for method in ("password", "token_refresh")' in probe
    assert 'issued_at < claims["exp"] <= issued_at + 900' in probe
    assert "has_function_privilege('erp_runtime'" in probe
    assert '(_event("magic_link", issued_at), "non-password service token")' in probe
    assert "assert cursor.fetchone()[0] == ordinary_claims" in probe
