from __future__ import annotations

import importlib.util
from pathlib import Path

import psycopg2
import pytest


ROOT = Path(__file__).parents[3]
SCRIPT = ROOT / "backend/scripts/verify_staging_pooler_roles.py"


def _load():
    spec = importlib.util.spec_from_file_location("staging_pooler_verifier", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _roles() -> dict[str, str]:
    return {
        "erp_runtime": "runtime-secret",
        "erp_calculator": "calculator-secret",
        "erp_tax_provider": "provider-secret",
        "erp_regulatory_importer": "importer-secret",
    }


def test_only_allowlisted_operational_failures_are_transient() -> None:
    verifier = _load()

    class SqlstateOperationalError(psycopg2.OperationalError):
        def __init__(self, pgcode: str) -> None:
            super().__init__("provider detail must remain private")
            self._pgcode = pgcode

        @property
        def pgcode(self) -> str:
            return self._pgcode

    assert verifier._transient_kind(
        psycopg2.OperationalError("(EAUTHQUERY) auth_query secret check timed out")
    ) == "auth_query_unavailable"
    assert verifier._transient_kind(
        psycopg2.OperationalError("connection timed out")
    ) == "connection_timeout"
    assert verifier._transient_kind(
        psycopg2.OperationalError(
            "FATAL: Failed to connect to database: :error, :econnrefused"
        )
    ) == "connection_refused"
    assert verifier._transient_kind(
        psycopg2.OperationalError("password authentication failed")
    ) == "credential_propagation_pending"
    assert verifier._transient_kind(SqlstateOperationalError("08006")) == (
        "connection_exception"
    )
    assert verifier._transient_kind(SqlstateOperationalError("57P03")) == (
        "database_temporarily_unavailable"
    )
    assert verifier._transient_kind(SqlstateOperationalError("28P01")) is None
    assert verifier._transient_kind(RuntimeError("EAUTHQUERY")) is None


def test_connection_failures_are_reduced_to_fixed_non_secret_kinds(monkeypatch) -> None:
    verifier = _load()
    secret = "secret-shaped-provider-detail-123"

    def fail_connect(*args, **kwargs):
        raise psycopg2.OperationalError(
            f"password authentication failed: {secret}"
        )

    monkeypatch.setattr(verifier.psycopg2, "connect", fail_connect)
    with pytest.raises(verifier.RoleVerificationFailure) as captured:
        verifier.verify_role_once(
            role="erp_runtime",
            password="not-printed",
            project_ref="a" * 20,
            host="pooler.example",
            port="5432",
        )
    assert captured.value.kind == "credential_propagation_pending"
    assert captured.value.transient is True
    assert secret not in str(captured.value)


def test_complete_cohort_retry_is_bounded_and_restarts_from_first_role() -> None:
    verifier = _load()
    calls: list[tuple[str, ...]] = []
    sleeps: list[float] = []

    def succeeds_after_transient(**kwargs) -> None:
        calls.append(tuple(kwargs["roles"]))
        if len(calls) == 1:
            raise verifier.RoleVerificationFailure(
                "erp_regulatory_importer", "auth_query_timeout", transient=True
            )

    verifier.verify_role_set_with_retry(
        roles=_roles(),
        project_ref="a" * 20,
        host="pooler.example",
        port="5432",
        verify_set_once=succeeds_after_transient,
        sleep=sleeps.append,
    )
    assert calls == [tuple(_roles()), tuple(_roles())]
    assert sleeps == [verifier.RETRY_DELAY_SECONDS]

    calls.clear()
    sleeps.clear()

    def fails_posture(**kwargs) -> None:
        calls.append(tuple(kwargs["roles"]))
        raise verifier.RoleVerificationFailure(
            "erp_runtime", "runtime_posture_mismatch", transient=False
        )

    with pytest.raises(verifier.RoleVerificationFailure):
        verifier.verify_role_set_with_retry(
            roles=_roles(),
            project_ref="a" * 20,
            host="pooler.example",
            port="5432",
            verify_set_once=fails_posture,
            sleep=sleeps.append,
        )
    assert calls == [tuple(_roles())]
    assert sleeps == []


def test_one_cohort_sweep_uses_reviewed_role_order_and_stops_on_failure() -> None:
    verifier = _load()
    calls: list[str] = []

    def verify_once(**kwargs) -> None:
        calls.append(kwargs["role"])
        if kwargs["role"] == "erp_tax_provider":
            raise verifier.RoleVerificationFailure(
                kwargs["role"], "connection_timeout", transient=True
            )

    with pytest.raises(verifier.RoleVerificationFailure):
        verifier.verify_role_set_once(
            roles=_roles(),
            project_ref="a" * 20,
            host="pooler.example",
            port="5432",
            verify_once=verify_once,
        )
    assert calls == ["erp_runtime", "erp_calculator", "erp_tax_provider"]


def test_pooler_selection_rechecks_the_complete_set_on_transaction_mode() -> None:
    verifier = _load()
    roles = _roles()
    calls: list[tuple[str, tuple[str, ...]]] = []

    def verify_set(**kwargs) -> None:
        calls.append((kwargs["port"], tuple(kwargs["roles"])))
        if kwargs["port"] == "5432":
            raise verifier.RoleVerificationFailure(
                "erp_regulatory_importer", "connection_refused", transient=True
            )

    assert verifier.select_pooler(
        roles=roles,
        project_ref="a" * 20,
        host="pooler.example",
        session_port="5432",
        transaction_port="6543",
        verify_set=verify_set,
    ) == ("6543", "transaction")
    assert calls == [
        ("5432", tuple(roles)),
        ("6543", tuple(roles)),
    ]


def test_bootstrap_selection_falls_back_only_after_transient_session_failure() -> None:
    verifier = _load()
    calls: list[str] = []

    def verify_admin(**kwargs) -> None:
        calls.append(kwargs["port"])
        if kwargs["port"] == "5432":
            raise verifier.RoleVerificationFailure(
                "postgres", "connection_refused", transient=True
            )

    assert verifier.select_admin_pooler(
        password="secret",
        project_ref="a" * 20,
        host="pooler.example",
        session_port="5432",
        transaction_port="6543",
        verify_admin=verify_admin,
    ) == ("6543", "transaction")
    assert calls == ["5432", "6543"]

    calls.clear()

    def permanent_failure(**kwargs) -> None:
        calls.append(kwargs["port"])
        raise verifier.RoleVerificationFailure(
            "postgres", "bootstrap_posture_mismatch", transient=False
        )

    with pytest.raises(verifier.PoolerVerificationFailure):
        verifier.select_admin_pooler(
            password="secret",
            project_ref="a" * 20,
            host="pooler.example",
            session_port="5432",
            transaction_port="6543",
            verify_admin=permanent_failure,
        )
    assert calls == ["5432"]


def test_pooler_circuit_stops_after_the_bounded_quiet_window() -> None:
    verifier = _load()
    calls: list[str] = []

    def verify_admin(**kwargs) -> None:
        calls.append(kwargs["port"])
        raise verifier.RoleVerificationFailure(
            "postgres", "pooler_circuit_open", transient=True
        )

    with pytest.raises(verifier.PoolerVerificationFailure) as captured:
        verifier.select_admin_pooler(
            password="secret",
            project_ref="a" * 20,
            host="pooler.example",
            session_port="5432",
            transaction_port="6543",
            verify_admin=verify_admin,
        )
    assert captured.value.mode == "session"
    assert calls == ["5432"]


def test_non_transient_session_failure_never_falls_back() -> None:
    verifier = _load()
    calls: list[str] = []

    def verify_set(**kwargs) -> None:
        calls.append(kwargs["port"])
        raise verifier.RoleVerificationFailure(
            "erp_runtime", "runtime_posture_mismatch", transient=False
        )

    with pytest.raises(verifier.PoolerVerificationFailure) as captured:
        verifier.select_pooler(
            roles=_roles(),
            project_ref="a" * 20,
            host="pooler.example",
            session_port="5432",
            transaction_port="6543",
            verify_set=verify_set,
        )
    assert captured.value.mode == "session"
    assert calls == ["5432"]


def test_transaction_mode_must_pass_the_complete_set() -> None:
    verifier = _load()
    calls: list[str] = []

    def verify_set(**kwargs) -> None:
        calls.append(kwargs["port"])
        role = (
            "erp_runtime"
            if kwargs["port"] == "5432"
            else "erp_tax_provider"
        )
        raise verifier.RoleVerificationFailure(
            role, "connection_timeout", transient=True
        )

    with pytest.raises(verifier.PoolerVerificationFailure) as captured:
        verifier.select_pooler(
            roles=_roles(),
            project_ref="a" * 20,
            host="pooler.example",
            session_port="5432",
            transaction_port="6543",
            verify_set=verify_set,
        )
    assert captured.value.mode == "transaction"
    assert captured.value.failure.role == "erp_tax_provider"
    assert calls == ["5432", "6543"]


def test_configuration_rejects_unreviewed_hosts_ports_and_credentials() -> None:
    verifier = _load()
    environment = {
        variable: "A" * 48 for _, variable in verifier.ROLE_PASSWORD_ENV
    }
    environment.update(
        {
            "CANONICAL_STAGING_PROJECT_REF": "a" * 20,
            "SUPABASE_POOLER_HOST": "aws-0-ap-south-1.pooler.supabase.com",
            "SUPABASE_SESSION_POOLER_PORT": "5432",
            "SUPABASE_POOLER_PORT": "6543",
        }
    )
    roles, project_ref, host, session_port, transaction_port = (
        verifier._configuration(environment)
    )
    assert tuple(roles) == tuple(role for role, _ in verifier.ROLE_PASSWORD_ENV)
    assert (project_ref, host, session_port, transaction_port) == (
        "a" * 20,
        "aws-0-ap-south-1.pooler.supabase.com",
        "5432",
        "6543",
    )

    invalid = dict(environment, SUPABASE_POOLER_HOST="example.com")
    with pytest.raises(ValueError):
        verifier._configuration(invalid)


def test_transaction_selection_preflights_admin_before_environment_write(
    monkeypatch, tmp_path
) -> None:
    verifier = _load()
    github_env = tmp_path / "github-env"
    environment = {
        variable: "A" * 48 for _, variable in verifier.ROLE_PASSWORD_ENV
    }
    environment.update(
        {
            "SUPABASE_DB_PASSWORD": "admin-secret",
            "CANONICAL_STAGING_PROJECT_REF": "a" * 20,
            "SUPABASE_POOLER_HOST": "aws-0-ap-south-1.pooler.supabase.com",
            "SUPABASE_SESSION_POOLER_PORT": "5432",
            "SUPABASE_POOLER_PORT": "6543",
            "GITHUB_ENV": str(github_env),
        }
    )
    events: list[str] = []
    monkeypatch.setattr(verifier.os, "environ", environment)
    monkeypatch.setattr(
        verifier,
        "select_pooler",
        lambda **kwargs: ("6543", "transaction"),
    )

    def preflight(**kwargs) -> None:
        events.append("admin-preflight")

    def write(**kwargs) -> None:
        events.append("environment-write")

    monkeypatch.setattr(verifier, "verify_admin_with_retry", preflight)
    monkeypatch.setattr(verifier, "_write_pooler_environment", write)
    assert verifier.main([]) == 0
    assert events == ["admin-preflight", "environment-write"]


def test_failed_transaction_admin_preflight_never_writes_environment(
    monkeypatch, tmp_path
) -> None:
    verifier = _load()
    environment = {
        variable: "A" * 48 for _, variable in verifier.ROLE_PASSWORD_ENV
    }
    environment.update(
        {
            "SUPABASE_DB_PASSWORD": "admin-secret",
            "CANONICAL_STAGING_PROJECT_REF": "a" * 20,
            "SUPABASE_POOLER_HOST": "aws-0-ap-south-1.pooler.supabase.com",
            "SUPABASE_SESSION_POOLER_PORT": "5432",
            "SUPABASE_POOLER_PORT": "6543",
            "GITHUB_ENV": str(tmp_path / "github-env"),
        }
    )
    writes: list[object] = []
    monkeypatch.setattr(verifier.os, "environ", environment)
    monkeypatch.setattr(
        verifier,
        "select_pooler",
        lambda **kwargs: ("6543", "transaction"),
    )

    def fail_admin(**kwargs) -> None:
        raise verifier.RoleVerificationFailure(
            "postgres", "bootstrap_posture_mismatch", transient=False
        )

    monkeypatch.setattr(verifier, "verify_admin_with_retry", fail_admin)
    monkeypatch.setattr(
        verifier,
        "_write_pooler_environment",
        lambda **kwargs: writes.append(kwargs),
    )
    assert verifier.main([]) == 1
    assert writes == []
    invalid = dict(environment, SUPABASE_POOLER_PORT="not-a-port")
    with pytest.raises(ValueError):
        verifier._configuration(invalid)
    invalid = dict(environment, ERP_RUNTIME_PASSWORD="too-short")
    with pytest.raises(ValueError):
        verifier._configuration(invalid)


def test_main_emits_only_bounded_failure_metadata(monkeypatch, capsys) -> None:
    verifier = _load()
    secret = "S" * 48
    environment = {
        variable: secret for _, variable in verifier.ROLE_PASSWORD_ENV
    }
    environment.update(
        {
            "CANONICAL_STAGING_PROJECT_REF": "a" * 20,
            "SUPABASE_POOLER_HOST": "aws-0-ap-south-1.pooler.supabase.com",
            "SUPABASE_SESSION_POOLER_PORT": "5432",
            "SUPABASE_POOLER_PORT": "6543",
        }
    )

    def fail_selection(**kwargs):
        raise verifier.PoolerVerificationFailure(
            "session",
            verifier.RoleVerificationFailure(
                "erp_regulatory_importer", "auth_query_timeout", transient=True
            ),
        )

    monkeypatch.setattr(verifier.os, "environ", environment)
    monkeypatch.setattr(verifier, "select_pooler", fail_selection)
    assert verifier.main([]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "mode=session" in captured.err
    assert "role=erp_regulatory_importer" in captured.err
    assert "kind=auth_query_timeout" in captured.err
    assert secret not in captured.err
