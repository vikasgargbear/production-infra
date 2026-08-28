from __future__ import annotations

import hashlib
import inspect
import json
from pathlib import Path
import subprocess

import pytest

import scripts.canonical_data_reset_authority as reset_authority
from scripts.canonical_data_reset_authority import (
    CatalogSnapshot,
    EPHEMERAL_SCOPE_RELATIONS,
    PRESERVED_SEED_RELATIONS,
    ResetAuthorityError,
    classify_relations,
    load_reset_authority,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


class _FakeCursor:
    def __init__(self) -> None:
        self.executed: list[tuple[str, object]] = []
        self.fetchone_result = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, statement: str, parameters=None) -> None:
        self.executed.append((statement, parameters))

    def fetchone(self):
        return self.fetchone_result


class _FakeConnection:
    def __init__(self) -> None:
        self.cursor_instance = _FakeCursor()
        self.committed = False
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.committed = exc_type is None
        self.rolled_back = exc_type is not None
        return False

    def cursor(self):
        return self.cursor_instance


def _catalog(authority) -> CatalogSnapshot:
    relation_names = (
        *authority.canonical_relations,
        *authority.ephemeral_scope_relations,
    )
    schema_names = authority.alembic_schemas
    return CatalogSnapshot(
        alembic_head=authority.alembic_head,
        alembic_schemas=authority.alembic_schemas,
        canonical_relations=authority.canonical_relations,
        ephemeral_scope_relations=authority.ephemeral_scope_relations,
        relation_oids=tuple(
            (name, index) for index, name in enumerate(sorted(relation_names), 1)
        ),
        schema_oids=tuple(
            (name, index) for index, name in enumerate(schema_names, 1)
        ),
        auth_schema_present=True,
        storage_schema_present=True,
    )


def test_reset_authority_classifies_exact_head_relation_sets() -> None:
    authority = load_reset_authority()

    assert len(authority.canonical_relations) == 119
    assert len(authority.alembic_schemas) == 30
    assert authority.preserved_seed_relations == tuple(sorted(PRESERVED_SEED_RELATIONS))
    assert len(authority.preserved_seed_relations) == 5
    assert len(authority.reset_relations) == 114
    assert authority.ephemeral_scope_relations == tuple(
        sorted(EPHEMERAL_SCOPE_RELATIONS)
    )
    assert len(authority.ephemeral_scope_relations) == 8
    assert len(authority.truncate_relations) == 122
    assert set(authority.reset_relations).isdisjoint(
        authority.preserved_seed_relations
    )


def test_reset_authority_preserves_only_deterministic_alembic_seeds() -> None:
    authority = load_reset_authority()

    assert set(authority.preserved_seed_relations) == {
        "catalog.units_of_measure",
        "core.permissions",
        "tax.gst_jurisdiction_releases",
        "tax.gst_jurisdiction_versions",
        "tax.gst_jurisdictions",
    }
    assert "core.reference_data_releases" in authority.reset_relations
    assert "core.users" in authority.reset_relations
    assert "tax.gstr1_reporting_rule_versions" in authority.reset_relations
    assert "tax.itc_reversal_rule_versions" in authority.reset_relations


def test_truncate_sql_is_exact_quoted_and_never_cascades() -> None:
    authority = load_reset_authority()
    sql = authority.truncate_sql

    assert sql.startswith("TRUNCATE TABLE ")
    assert sql.endswith(" RESTART IDENTITY;")
    assert "CASCADE" not in sql.upper()
    assert '"catalog"."units_of_measure"' not in sql
    assert '"core"."permissions"' not in sql
    assert '"core"."organizations"' in sql
    assert '"erp_automation_commands"."execution_scopes"' in sql


def test_observed_catalog_rejects_head_missing_extra_and_duplicate_drift() -> None:
    authority = load_reset_authority()

    with pytest.raises(ResetAuthorityError, match="Alembic head differs"):
        authority.validate_observed_catalog(
            alembic_head="wrong_head",
            alembic_schemas=authority.alembic_schemas,
            canonical_relations=authority.canonical_relations,
            ephemeral_scope_relations=authority.ephemeral_scope_relations,
        )

    with pytest.raises(ResetAuthorityError, match="missing="):
        authority.validate_observed_catalog(
            alembic_head=authority.alembic_head,
            alembic_schemas=authority.alembic_schemas[:-1],
            canonical_relations=authority.canonical_relations,
            ephemeral_scope_relations=authority.ephemeral_scope_relations,
        )

    with pytest.raises(ResetAuthorityError, match="missing="):
        authority.validate_observed_catalog(
            alembic_head=authority.alembic_head,
            alembic_schemas=authority.alembic_schemas,
            canonical_relations=authority.canonical_relations[:-1],
            ephemeral_scope_relations=authority.ephemeral_scope_relations,
        )

    with pytest.raises(ResetAuthorityError, match="extra="):
        authority.validate_observed_catalog(
            alembic_head=authority.alembic_head,
            alembic_schemas=authority.alembic_schemas,
            canonical_relations=(*authority.canonical_relations, "core.unreviewed"),
            ephemeral_scope_relations=authority.ephemeral_scope_relations,
        )

    with pytest.raises(ResetAuthorityError, match="contain duplicates"):
        authority.validate_observed_catalog(
            alembic_head=authority.alembic_head,
            alembic_schemas=authority.alembic_schemas,
            canonical_relations=(
                *authority.canonical_relations,
                authority.canonical_relations[0],
            ),
            ephemeral_scope_relations=authority.ephemeral_scope_relations,
        )


def test_source_classification_rejects_duplicate_unclassified_and_count_drift() -> None:
    authority = load_reset_authority()
    created = (*authority.canonical_relations, *authority.ephemeral_scope_relations)

    with pytest.raises(ResetAuthorityError, match="contain duplicates"):
        classify_relations(
            alembic_head=authority.alembic_head,
            created_relations=(*created, created[0]),
            created_schemas=authority.alembic_schemas,
        )

    with pytest.raises(ResetAuthorityError, match="lack reset classification"):
        classify_relations(
            alembic_head=authority.alembic_head,
            created_relations=(*created, "erp_security.command_scopes"),
            created_schemas=authority.alembic_schemas,
        )

    with pytest.raises(ResetAuthorityError, match="canonical relation count drifted"):
        classify_relations(
            alembic_head=authority.alembic_head,
            created_relations=created[:-9],
            created_schemas=authority.alembic_schemas,
        )


def test_manifest_and_cli_hash_are_deterministic() -> None:
    authority = load_reset_authority()
    first = authority.envelope()
    second = load_reset_authority().envelope()

    assert first == second
    canonical_bytes = (
        json.dumps(
            first["manifest"],
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        + "\n"
    ).encode("utf-8")
    assert first["manifest_sha256"] == hashlib.sha256(canonical_bytes).hexdigest()

    result = subprocess.run(
        [
            "python3",
            str(REPOSITORY_ROOT / "backend/scripts/canonical_data_reset_authority.py"),
            "--print-sha256",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip() == first["manifest_sha256"]


def test_postgresql_gate_executes_reset_idempotency_and_rollback() -> None:
    gate = (
        REPOSITORY_ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    runtime_check = (
        REPOSITORY_ROOT
        / "backend/tests/postgres/check_canonical_data_reset_authority.py"
    ).read_text(encoding="utf-8")

    assert "check_canonical_data_reset_authority.py" in gate
    assert "reset_authority.execute_reset(" in runtime_check
    assert "disposable_row_count_before_reset" in runtime_check
    assert "injected post-truncate failure" in runtime_check
    assert "rollback-integration" in runtime_check


def test_role_cleanup_attests_effective_set_and_usage_not_membership_absence() -> None:
    source = inspect.getsource(reset_authority.verify_post_cleanup_role_state)

    assert "WITH RECURSIVE identity" in source
    assert "SELECT oid, rolinherit, rolsuper" in source
    assert "set_path(roleid)" in source
    assert "usage_path(roleid)" in source
    assert "server_version_num" in source
    assert "'erp_migration_owner'::regrole::oid" in source
    assert "verification_principal_superuser" in source
    assert "pg_has_role" not in source
    assert "'SET'" not in source
    assert "membership.member IS NULL THEN false" in source
    assert "set_option" in source
    assert "inherit_option" in source


def test_transactional_reset_emits_safe_exact_catalog_facts(monkeypatch) -> None:
    authority = load_reset_authority()
    connection = _FakeConnection()
    catalog = _catalog(authority)
    role_snapshot = (("erp_runtime", 7, True, True),)
    counts = tuple((name, 3) for name in authority.truncate_relations)
    empty_counts = tuple((name, 0) for name in authority.truncate_relations)

    catalogs = iter((catalog, catalog))
    roles = iter((role_snapshot, role_snapshot))
    digests = iter(("a" * 64, "a" * 64))
    row_counts = iter((counts, empty_counts))
    monkeypatch.setattr(
        reset_authority,
        "_catalog_snapshot",
        lambda cursor, alembic_schemas: next(catalogs),
    )
    monkeypatch.setattr(reset_authority, "_role_snapshot", lambda cursor: next(roles))
    monkeypatch.setattr(
        reset_authority,
        "_role_password_presence",
        lambda cursor: (("erp_runtime", True),),
    )
    monkeypatch.setattr(reset_authority, "_seed_digest", lambda cursor, relations: next(digests))
    monkeypatch.setattr(
        reset_authority,
        "_relation_row_counts",
        lambda cursor, relations: next(row_counts),
    )
    monkeypatch.setattr(reset_authority, "_evidence_object_count", lambda cursor: 0)

    receipt = reset_authority.execute_reset(
        connection,
        authority=authority,
        project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
    )

    assert connection.committed is True
    assert connection.rolled_back is False
    assert receipt["canonical_relation_count"] == 119
    assert receipt["alembic_schema_count"] == 30
    assert receipt["ephemeral_scope_relation_count"] == 8
    assert receipt["catalog_relation_count"] == 127
    assert receipt["preserved_seed_relation_count"] == 5
    assert receipt["reset_relation_count"] == 114
    assert receipt["truncate_relation_count"] == 122
    assert receipt["disposable_row_count_after_reset"] == 0
    assert receipt["evidence_storage_object_count_after_reset"] == 0
    assert receipt["isolated_role_catalog_preserved"] is True
    statements = [statement for statement, _ in connection.cursor_instance.executed]
    assert authority.truncate_sql in statements
    assert all("CASCADE" not in statement.upper() for statement in statements)


def test_role_posture_and_password_presence_use_the_correct_catalogs() -> None:
    posture_source = inspect.getsource(reset_authority._role_snapshot)
    credential_source = inspect.getsource(reset_authority._role_password_presence)

    assert "pg_catalog.pg_roles" in posture_source
    assert "rolpassword" not in posture_source
    assert "pg_catalog.pg_authid" in credential_source
    assert "rolpassword IS NOT NULL" in credential_source


def test_post_cleanup_role_receipt_requires_revoked_delegation(monkeypatch) -> None:
    connection = _FakeConnection()
    connection.cursor_instance.fetchone_result = (False, False, False, False, True)
    role_rows = tuple(
        (
            role,
            index,
            role in reset_authority.LOGIN_ROLES,
            False,
            True,
            False,
            False,
            False,
            role == "erp_migration_owner",
            -1,
            None,
        )
        for index, role in enumerate(reset_authority.MANAGED_ROLES, 1)
    )
    monkeypatch.setattr(
        reset_authority,
        "_role_snapshot",
        lambda cursor: (*role_rows, ("__memberships__", ())),
    )
    password_presence = tuple(
        (role, role in reset_authority.LOGIN_ROLES)
        for role in reset_authority.MANAGED_ROLES
    )
    monkeypatch.setattr(
        reset_authority,
        "_role_password_presence",
        lambda cursor: password_presence,
    )

    receipt = reset_authority.verify_post_cleanup_role_state(
        connection,
        project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
    )

    assert receipt["managed_role_count"] == 6
    assert receipt["login_role_password_present_count"] == 4
    assert receipt["nonlogin_role_password_present_count"] == 0
    assert receipt["postgres_migration_owner_set"] is False
    assert receipt["postgres_migration_owner_usage"] is False
    assert (
        receipt["migration_owner_authority_semantics"]
        == "explicit_pg_auth_members_paths"
    )
    assert receipt["verification_principal_superuser"] is True

    connection.cursor_instance.fetchone_result = (True, False, True, False, True)
    with pytest.raises(ResetAuthorityError, match="retains temporary"):
        reset_authority.verify_post_cleanup_role_state(
            connection,
            project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
        )

    connection.cursor_instance.fetchone_result = (False, False, False, False, True)
    monkeypatch.setattr(
        reset_authority,
        "_role_password_presence",
        lambda cursor: tuple(
            (role, True if role == "erp_app" else present)
            for role, present in password_presence
        ),
    )
    with pytest.raises(ResetAuthorityError, match="NOLOGIN roles"):
        reset_authority.verify_post_cleanup_role_state(
            connection,
            project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
        )


def test_transactional_reset_rolls_back_on_seed_drift(monkeypatch) -> None:
    authority = load_reset_authority()
    connection = _FakeConnection()
    catalog = _catalog(authority)
    empty_counts = tuple((name, 0) for name in authority.truncate_relations)
    monkeypatch.setattr(
        reset_authority,
        "_catalog_snapshot",
        lambda cursor, alembic_schemas: catalog,
    )
    monkeypatch.setattr(reset_authority, "_role_snapshot", lambda cursor: (("same",),))
    monkeypatch.setattr(
        reset_authority,
        "_role_password_presence",
        lambda cursor: (("same", True),),
    )
    digests = iter(("a" * 64, "b" * 64))
    monkeypatch.setattr(reset_authority, "_seed_digest", lambda cursor, relations: next(digests))
    monkeypatch.setattr(
        reset_authority,
        "_relation_row_counts",
        lambda cursor, relations: empty_counts,
    )
    monkeypatch.setattr(reset_authority, "_evidence_object_count", lambda cursor: 0)

    with pytest.raises(ResetAuthorityError, match="seed rows changed"):
        reset_authority.execute_reset(
            connection,
            authority=authority,
            project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
        )

    assert connection.committed is False
    assert connection.rolled_back is True


def test_transactional_reset_refuses_nonempty_evidence_bucket_before_truncate(
    monkeypatch,
) -> None:
    authority = load_reset_authority()
    connection = _FakeConnection()
    monkeypatch.setattr(
        reset_authority,
        "_catalog_snapshot",
        lambda cursor, alembic_schemas: _catalog(authority),
    )
    monkeypatch.setattr(reset_authority, "_evidence_object_count", lambda cursor: 1)

    with pytest.raises(ResetAuthorityError, match="evidence bucket is not empty"):
        reset_authority.execute_reset(
            connection,
            authority=authority,
            project_ref=reset_authority.CANONICAL_STAGING_PROJECT_REF,
        )

    assert connection.rolled_back is True
    statements = [statement for statement, _ in connection.cursor_instance.executed]
    assert authority.truncate_sql not in statements
