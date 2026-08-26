from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/manage_canonical_write_fence.py"
SPEC = importlib.util.spec_from_file_location("manage_canonical_write_fence", SCRIPT)
fence = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = fence
SPEC.loader.exec_module(fence)


def test_fence_covers_every_canonical_command_schema() -> None:
    migration_sql = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((ROOT / "backend/alembic/sql").glob("*.sql"))
    )
    command_schemas = set(
        re.findall(
            r'CREATE SCHEMA(?: IF NOT EXISTS)?\s+"?(erp_[a-z0-9_]+_commands(?:_v[0-9]+)?)"?',
            migration_sql,
        )
    )
    assert command_schemas == set(fence.COMMAND_SCHEMA_GRANTS)


def test_open_matrix_is_the_exact_alembic_grant_contract() -> None:
    assert fence.COMMAND_SCHEMA_GRANTS == {
        "erp_automation_commands": ("erp_runtime", "erp_calculator"),
        "erp_compliance_commands": ("erp_app", "erp_runtime"),
        "erp_core_commands": ("erp_app",),
        "erp_regulatory_commands": ("erp_app", "erp_regulatory_importer"),
        "erp_finance_commands": ("erp_app",),
        "erp_commercial_commands": ("erp_app", "erp_runtime"),
        "erp_trade_commands": ("erp_app", "erp_runtime"),
        "erp_trade_commands_v2": ("erp_app", "erp_runtime"),
        "erp_tax_provider_commands": ("erp_app", "erp_tax_provider"),
        "erp_master_commands": ("erp_runtime",),
    }


def test_closed_matrix_accepts_no_effective_schema_usage() -> None:
    matrix = {
        schema: {principal: False for principal in ("public", *fence.MANAGED_PRINCIPALS)}
        for schema in fence.COMMAND_SCHEMA_GRANTS
    }
    fence._validate_matrix(matrix, open_fence=False)


def test_only_login_principals_must_lose_all_effective_mutation_authority() -> None:
    assert fence.LOGIN_PRINCIPALS == (
        "erp_runtime",
        "erp_calculator",
        "erp_regulatory_importer",
        "erp_tax_provider",
    )
    assert "erp_app" not in fence.LOGIN_PRINCIPALS


def test_open_matrix_rejects_inherited_or_public_drift() -> None:
    matrix = {
        schema: {
            principal: principal in allowed
            for principal in ("public", *fence.MANAGED_PRINCIPALS)
        }
        for schema, allowed in fence.EXPECTED_OPEN_EFFECTIVE_USAGE.items()
    }
    matrix["erp_master_commands"]["erp_app"] = True
    with pytest.raises(fence.FenceError, match="ACL mismatch"):
        fence._validate_matrix(matrix, open_fence=True)


@pytest.mark.parametrize("value", ["", "A" * 40, "a" * 39, "g" * 40])
def test_commit_sha_is_exact_and_lowercase(value: str) -> None:
    with pytest.raises(fence.FenceError, match="commit SHA"):
        fence._validate_commit_sha(value)


def test_sqlalchemy_psycopg2_url_is_normalized_for_the_driver() -> None:
    assert fence._psycopg_dsn(
        "postgresql+psycopg2://user:secret@localhost/database"
    ) == "postgresql://user:secret@localhost/database"


def test_database_failure_code_is_secret_free_and_keeps_sqlstate() -> None:
    class InjectedDatabaseError(Exception):
        pgcode = "42501"

    error = InjectedDatabaseError("secret query and relation details")

    assert fence._database_failure_code(error) == (
        "InjectedDatabaseError:sqlstate_42501"
    )
    assert "secret" not in fence._database_failure_code(error)


def test_apply_fence_classifies_connection_failure_without_error_text(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_connect(*_args: object, **_kwargs: object) -> object:
        raise fence.psycopg2.ProgrammingError("secret connection details")

    monkeypatch.setattr(fence.psycopg2, "connect", fail_connect)

    with pytest.raises(
        fence.FenceError,
        match=r"^write_fence_close_connect_failed:ProgrammingError$",
    ):
        fence.apply_fence(
            "postgresql://user:secret@host/database",
            action="close",
            commit_sha="a" * 40,
        )
