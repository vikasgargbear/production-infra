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

    assert len(authority.canonical_relations) == 120
    assert len(authority.alembic_schemas) == 30
    assert authority.preserved_seed_relations == tuple(sorted(PRESERVED_SEED_RELATIONS))
    assert len(authority.preserved_seed_relations) == 5
    assert len(authority.reset_relations) == 115
    assert authority.ephemeral_scope_relations == tuple(
        sorted(EPHEMERAL_SCOPE_RELATIONS)
    )
    assert len(authority.ephemeral_scope_relations) == 9
    assert authority.manifest()["whole_database_reset_available"] is False
    assert authority.manifest()["expected_organization_relation_count"] == 104
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


def test_whole_database_reset_sql_is_not_exposed() -> None:
    authority = load_reset_authority()
    source = inspect.getsource(reset_authority)

    assert not hasattr(authority, "truncate_sql")
    assert not hasattr(authority, "truncate_relations")
    assert "TRUNCATE TABLE" not in source
    assert "execute_reset" not in source
    assert "--execute-organization-purge" not in source
    assert "WHERE org_id=%s::uuid" in source


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
            created_relations=(
                *authority.canonical_relations[:-1],
                *authority.ephemeral_scope_relations,
            ),
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


def test_postgresql_gate_executes_scoped_purge_and_rollback() -> None:
    gate = (
        REPOSITORY_ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    runtime_check = (
        REPOSITORY_ROOT
        / "backend/tests/postgres/check_canonical_data_reset_authority.py"
    ).read_text(encoding="utf-8")

    assert "check_canonical_data_reset_authority.py" in gate
    assert "reset_authority.execute_organization_purge(" in runtime_check
    assert "organization_row_count_before_purge" in runtime_check
    assert "injected post-purge failure" in runtime_check
    assert "other_organization_row_count_preserved" in runtime_check


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


def test_purge_requires_exact_uuid_confirmation_and_signed_plan() -> None:
    organization_id = "10000000-0000-4000-8000-000000000010"

    assert reset_authority.organization_confirmation(organization_id) == (
        f"DELETE-ORGANIZATION:{organization_id}"
    )
    with pytest.raises(ResetAuthorityError, match="canonical non-zero UUID"):
        reset_authority.organization_confirmation(
            "00000000-0000-0000-0000-000000000000"
        )
    signature = inspect.signature(reset_authority.execute_organization_purge)
    assert "authorized_plan_sha256" in signature.parameters


class _PurgeExecutorCursor:
    def __init__(self, rows) -> None:
        self.rows = list(rows)
        self.executed = []

    def execute(self, statement, parameters=None) -> None:
        self.executed.append((statement, parameters))

    def fetchone(self):
        return self.rows.pop(0)


def test_purge_executor_accepts_only_the_exact_delegated_owner() -> None:
    cursor = _PurgeExecutorCursor(
        [
            ("postgres", "erp_migration_owner", False, True, True, True),
            (True,),
            (True,),
        ]
    )

    receipt = reset_authority._require_purge_executor(
        cursor, ("core.memberships",)
    )

    assert receipt == {
        "session_user": "postgres",
        "current_user": "erp_migration_owner",
        "superuser": False,
        "delegated_owner": True,
        "session_replication_role_set": True,
    }
    assert [parameters for _statement, parameters in cursor.executed[1:]] == [
        ("core.memberships",),
        ("core.organizations",),
    ]


@pytest.mark.parametrize(
    "posture",
    (
        ("postgres", "postgres", False, True, True, True),
        ("postgres", "erp_migration_owner", False, True, True, False),
        ("erp_runtime", "erp_migration_owner", False, False, False, True),
    ),
)
def test_purge_executor_rejects_unreviewed_posture(posture) -> None:
    cursor = _PurgeExecutorCursor([posture])

    with pytest.raises(ResetAuthorityError, match="reviewed database administrator"):
        reset_authority._require_purge_executor(cursor, ("core.memberships",))


def test_purge_executor_rejects_nonowned_target_relation() -> None:
    cursor = _PurgeExecutorCursor(
        [
            ("postgres", "erp_migration_owner", False, True, True, True),
            (False,),
        ]
    )

    with pytest.raises(ResetAuthorityError, match="does not own every"):
        reset_authority._require_purge_executor(cursor, ("core.memberships",))


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


def test_purge_refuses_shared_or_unproven_relations_by_construction() -> None:
    source = inspect.getsource(reset_authority._organization_relations)

    assert "EXPECTED_ORGANIZATION_RELATION_COUNT" in source
    assert "direct_organization_foreign_key" in source
    assert "tenant_organization_foreign_key" in source
    assert 'forbidden = {"core.organizations", "core.users"}' in source
