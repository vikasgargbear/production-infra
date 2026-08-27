from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.auth import session_authority


ROOT = Path(__file__).resolve().parents[3]
GENERATOR = (
    ROOT
    / "database/canonical/session_authority/generate_session_authority.py"
)
MIGRATION_GENERATOR = ROOT / "backend/scripts/generate_session_authority_migration.py"
MIGRATION_SQL = ROOT / "backend/alembic/sql/20260827_0032_session_authority.sql"
MIGRATION_REVISION = (
    ROOT / "backend/alembic/versions/20260827_0032_session_authority.py"
)


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_generated_role_contract_is_one_hash_bound_linear_migration() -> None:
    generator = _load(GENERATOR, "session_authority_generator")
    migration_generator = _load(
        MIGRATION_GENERATOR, "session_authority_migration_generator"
    )
    revision = _load(MIGRATION_REVISION, "session_authority_revision")
    migration_bytes = MIGRATION_SQL.read_bytes()

    assert generator.render_sql().encode("utf-8") == migration_bytes
    assert migration_generator.render().encode("utf-8") == migration_bytes
    assert revision.revision == "20260827_0032"
    assert revision.down_revision == "20260827_0031"
    assert revision.EXPECTED_SQL_SHA256 == hashlib.sha256(migration_bytes).hexdigest()


def test_role_is_non_login_non_owner_and_migration_does_not_open_it() -> None:
    sql = MIGRATION_SQL.read_text(encoding="utf-8")

    assert "CREATE ROLE erp_session_authority" in sql
    assert "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE" in sql
    assert "INHERIT NOBYPASSRLS NOREPLICATION" in sql
    assert "REVOKE erp_session_authority FROM" in sql
    assert "GRANT erp_session_authority" not in sql


class _Result:
    def __init__(self, row: dict[str, bool]):
        self.row = row

    def mappings(self):
        return self

    def one(self):
        return self.row


class _Database:
    def __init__(self, row: dict[str, bool]):
        self.row = row

    def execute(self, _statement):
        return _Result(self.row)


@pytest.mark.parametrize(
    ("row", "public", "provisioning"),
    (
        (
            {
                "principal_is_runtime": True,
                "command_authority": False,
                "session_role_exists": True,
                "session_authority": False,
            },
            False,
            False,
        ),
        (
            {
                "principal_is_runtime": True,
                "command_authority": True,
                "session_role_exists": True,
                "session_authority": False,
            },
            False,
            True,
        ),
        (
            {
                "principal_is_runtime": True,
                "command_authority": True,
                "session_role_exists": True,
                "session_authority": True,
            },
            True,
            False,
        ),
        (
            {
                "principal_is_runtime": False,
                "command_authority": True,
                "session_role_exists": True,
                "session_authority": True,
            },
            False,
            False,
        ),
        (
            {
                "principal_is_runtime": True,
                "command_authority": False,
                "session_role_exists": True,
                "session_authority": True,
            },
            False,
            False,
        ),
        (
            {
                "principal_is_runtime": True,
                "command_authority": True,
                "session_role_exists": False,
                "session_authority": False,
            },
            False,
            False,
        ),
    ),
)
def test_application_gates_distinguish_three_authority_states(
    row: dict[str, bool], public: bool, provisioning: bool
) -> None:
    database = _Database(row)
    assert session_authority.canonical_session_authority_available(database) is public
    assert (
        session_authority.canonical_provisioning_authority_available(database)
        is provisioning
    )


def test_public_authority_denial_is_stable_maintenance_response() -> None:
    database = _Database(
        {
            "principal_is_runtime": True,
            "command_authority": True,
            "session_role_exists": True,
            "session_authority": False,
        }
    )
    with pytest.raises(HTTPException) as raised:
        session_authority.require_canonical_session_authority(database)

    assert raised.value.status_code == 503
    assert raised.value.detail == session_authority.MAINTENANCE_DETAIL
    assert raised.value.headers == {"Retry-After": "15"}


def test_authority_probe_tolerates_missing_0032_role_by_construction() -> None:
    source = (
        ROOT / "backend/app/core/auth/session_authority.py"
    ).read_text(encoding="utf-8")
    assert "to_regrole('erp_session_authority') IS NULL" in source
    assert "THEN false" in source
