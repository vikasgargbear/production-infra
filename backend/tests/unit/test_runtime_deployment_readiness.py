from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.infrastructure.operator_actions.deployment_contract import (
    EXPECTED_CANONICAL_ALEMBIC_HEAD,
)
from app.infrastructure.operator_actions.service import (
    SqlAlchemyOperatorActionService,
)
from scripts.canonical_migration_contract import load_contract


REPO_ROOT = Path(__file__).resolve().parents[3]
SQL = (
    REPO_ROOT
    / "backend/alembic/sql/20260825_0017_runtime_deployment_readiness.sql"
)
REVISION = (
    REPO_ROOT
    / "backend/alembic/versions/20260825_0017_runtime_deployment_readiness.py"
)


class _Result:
    def __init__(self, rows):
        self.rows = list(rows)

    def mappings(self):
        return self

    def all(self):
        return self.rows

    def one(self):
        assert len(self.rows) == 1
        return self.rows[0]


class _Transaction:
    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None


class _Session:
    def __init__(self, *, ready=True, fail_readiness=False):
        self.ready = ready
        self.fail_readiness = fail_readiness
        self.executions = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return None

    def begin(self):
        return _Transaction()

    def execute(self, statement, params=None):
        sql = str(statement)
        bound = dict(params or {})
        self.executions.append((sql, bound))
        if "FROM pg_catalog.pg_roles AS role" in sql:
            return _Result(
                ({
                    "role_name": "erp_runtime",
                    "rolsuper": False,
                    "rolbypassrls": False,
                },)
            )
        if "deployed_canonical_revision" in sql:
            if self.fail_readiness:
                raise RuntimeError("revision function unavailable")
            return _Result(({"ready": self.ready},))
        raise AssertionError(sql)


def test_expected_runtime_head_is_the_exact_checked_in_migration_head() -> None:
    contract = load_contract()

    assert contract.head == EXPECTED_CANONICAL_ALEMBIC_HEAD == "20260829_0064"
    assert contract.canonical_table_count == 121


def test_runtime_revision_function_is_hash_bound_and_least_privilege() -> None:
    sql = SQL.read_text(encoding="utf-8")
    revision = REVISION.read_text(encoding="utf-8")
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert digest in revision
    assert 'revision = "20260825_0017"' in revision
    assert 'down_revision = "20260825_0016"' in revision
    assert "SECURITY DEFINER" in sql
    assert "SET search_path = ''" in sql
    assert "FROM public.alembic_version" in sql
    assert "GRANT SELECT ON TABLE public.alembic_version TO erp_migration_owner" in sql
    assert "GRANT EXECUTE ON FUNCTION erp_security.deployed_canonical_revision() TO erp_runtime" in sql
    assert "GRANT SELECT ON TABLE public.alembic_version TO erp_runtime" not in sql
    assert "REVOKE ALL ON FUNCTION erp_security.deployed_canonical_revision() FROM PUBLIC" in sql


def test_schema_authority_declares_both_runtime_readiness_sources() -> None:
    authority = json.loads(
        (REPO_ROOT / "database/schema-authority.json").read_text(encoding="utf-8")
    )
    required = set(authority["required_migration_files"])

    assert SQL.relative_to(REPO_ROOT).as_posix() in required
    assert REVISION.relative_to(REPO_ROOT).as_posix() in required


def test_service_requires_the_exact_revision_without_a_table_count_literal() -> None:
    session = _Session()
    service = SqlAlchemyOperatorActionService(
        lambda: session,
        runtime_principal_configured=True,
    )

    assert service.deployment_readiness() is True

    readiness_sql, params = next(
        execution
        for execution in session.executions
        if "deployed_canonical_revision" in execution[0]
    )
    assert params == {"expected_revision": EXPECTED_CANONICAL_ALEMBIC_HEAD}
    assert "count(*)=110" not in readiness_sql
    assert "=:expected_revision" in readiness_sql
    assert "activate_context(uuid,uuid)" in readiness_sql
    assert "prepare_operator_command" in readiness_sql


def test_service_fails_closed_for_mismatch_error_or_missing_runtime_principal() -> None:
    assert SqlAlchemyOperatorActionService(
        lambda: _Session(ready=False),
        runtime_principal_configured=True,
    ).deployment_readiness() is False
    assert SqlAlchemyOperatorActionService(
        lambda: _Session(fail_readiness=True),
        runtime_principal_configured=True,
    ).deployment_readiness() is False
    assert SqlAlchemyOperatorActionService(
        lambda: (_ for _ in ()).throw(AssertionError("database opened")),
        runtime_principal_configured=False,
    ).deployment_readiness() is False


def test_postgres_and_staging_gates_prove_runtime_exact_head_before_demo() -> None:
    postgres_gate = (
        REPO_ROOT / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    workflow = (
        REPO_ROOT / ".github/workflows/canonical-staging.yml"
    ).read_text(encoding="utf-8")

    assert "check_runtime_deployment_readiness.py" in postgres_gate
    assert "has_function_privilege('erp_runtime', 'erp_security.deployed_canonical_revision()', 'EXECUTE')" in postgres_gate
    assert "has_function_privilege('erp_app', 'erp_security.deployed_canonical_revision()', 'EXECUTE')" in postgres_gate
    assert "has_schema_privilege('erp_runtime', 'erp_security', 'USAGE')" in postgres_gate

    provision = workflow.split(
        "Provision and exercise the disposable demo organization", 1
    )[1]
    revision_check = "SELECT erp_security.deployed_canonical_revision()"
    assert revision_check in provision
    assert "has_table_privilege(CURRENT_USER, 'public.alembic_version', 'SELECT')" in provision
    assert "runtime_can_read_alembic=$(psql -X -Atqc" in provision
    assert 'test "$runtime_can_read_alembic" = f' in provision
    assert 'psql -X -Atqc \\"SELECT has_table_privilege' not in provision
    assert provision.index(revision_check) < provision.index("python3 -m uvicorn")
    assert provision.index(revision_check) < provision.index(
        "python3 -u backend/scripts/provision_canonical_demo.py"
    )
