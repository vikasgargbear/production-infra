#!/usr/bin/env python3
"""Select one Supavisor mode only after every isolated role verifies on it."""

from __future__ import annotations

import os
import re
import sys
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from urllib.parse import quote

import psycopg2


ROLE_PASSWORD_ENV = (
    ("erp_runtime", "ERP_RUNTIME_PASSWORD"),
    ("erp_calculator", "ERP_CALCULATOR_PASSWORD"),
    ("erp_tax_provider", "ERP_TAX_PROVIDER_PASSWORD"),
    ("erp_regulatory_importer", "ERP_REGULATORY_IMPORTER_PASSWORD"),
)
PASSWORD_PATTERN = re.compile(r"[A-Za-z0-9_-]{48,96}")
PROJECT_REF_PATTERN = re.compile(r"[a-z0-9]{20}")
POOLER_HOST_PATTERN = re.compile(r"[a-z0-9.-]+\.pooler\.supabase\.com")
TRANSIENT_MARKERS = (
    # A just-rotated password can be rejected by a stale Supavisor auth worker.
    # The verifier remains fail-closed: one complete cohort retry is bounded,
    # and a wrong secret never becomes an accepted connection.
    ("password authentication failed", "credential_propagation_pending"),
    ("eauthquery", "auth_query_unavailable"),
    ("auth_query secret check timed out", "auth_query_timeout"),
    ("ecircuitbreaker", "pooler_circuit_open"),
    ("worker_not_found", "pooler_worker_unavailable"),
    ("connection timed out", "connection_timeout"),
    ("timeout expired", "connection_timeout"),
    ("server closed the connection unexpectedly", "connection_closed"),
    ("econnrefused", "connection_refused"),
    ("connection refused", "connection_refused"),
    ("could not connect to server", "connection_unavailable"),
    ("server didn't return client encoding", "connection_unavailable"),
    ("network is unreachable", "network_unavailable"),
    ("temporary failure in name resolution", "dns_unavailable"),
    ("could not translate host name", "dns_unavailable"),
)
MAX_ATTEMPTS = 2
RETRY_DELAY_SECONDS = 125
QUIET_WINDOW_FAILURE_KINDS = frozenset(
    {"auth_query_unavailable", "auth_query_timeout", "pooler_circuit_open"}
)


class RoleVerificationFailure(RuntimeError):
    """A bounded, non-secret classification of one role verification failure."""

    def __init__(self, role: str, kind: str, *, transient: bool) -> None:
        super().__init__(f"{role}:{kind}")
        self.role = role
        self.kind = kind
        self.transient = transient


class PoolerVerificationFailure(RuntimeError):
    """The exact pooler mode on which a reviewed role set failed."""

    def __init__(self, mode: str, failure: RoleVerificationFailure) -> None:
        super().__init__(f"{mode}:{failure.role}:{failure.kind}")
        self.mode = mode
        self.failure = failure


def _transient_kind(error: BaseException) -> str | None:
    if not isinstance(error, psycopg2.OperationalError):
        return None
    sqlstate = getattr(error, "pgcode", None)
    if isinstance(sqlstate, str) and sqlstate.startswith("08"):
        return "connection_exception"
    if sqlstate in {"57P01", "57P02", "57P03"}:
        return "database_temporarily_unavailable"
    message = " ".join(str(error).lower().split())
    return next((kind for marker, kind in TRANSIENT_MARKERS if marker in message), None)


def _role_url(*, role: str, password: str, project_ref: str, host: str, port: str) -> str:
    return (
        f"postgresql://{role}.{project_ref}:{quote(password, safe='')}"
        f"@{host}:{port}/postgres?sslmode=require&gssencmode=disable&connect_timeout=5"
        "&application_name=canonical_staging_verify"
    )


def verify_role_once(
    *, role: str, password: str, project_ref: str, host: str, port: str
) -> None:
    try:
        with psycopg2.connect(
            _role_url(
                role=role,
                password=password,
                project_ref=project_ref,
                host=host,
                port=port,
            ),
            connect_timeout=5,
        ) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT current_user, rolsuper, rolbypassrls "
                    "FROM pg_catalog.pg_roles WHERE rolname=current_user"
                )
                posture = cursor.fetchone()
                if posture != (role, False, False):
                    raise RoleVerificationFailure(
                        role, "runtime_posture_mismatch", transient=False
                    )
    except RoleVerificationFailure:
        raise
    except Exception as error:
        transient_kind = _transient_kind(error)
        raise RoleVerificationFailure(
            role,
            transient_kind or "non_transient_verification_failure",
            transient=transient_kind is not None,
        ) from None


def verify_admin_once(
    *, password: str, project_ref: str, host: str, port: str
) -> None:
    url = (
        f"postgresql://postgres.{project_ref}:{quote(password, safe='')}"
        f"@{host}:{port}/postgres?sslmode=require&gssencmode=disable&connect_timeout=5"
        "&application_name=canonical_staging_admin_preflight"
    )
    try:
        with psycopg2.connect(url, connect_timeout=5) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT current_user,rolsuper,rolcreaterole,rolbypassrls "
                    "FROM pg_catalog.pg_roles WHERE rolname=current_user"
                )
                posture = cursor.fetchone()
                if posture != ("postgres", False, True, True):
                    raise RoleVerificationFailure(
                        "postgres", "bootstrap_posture_mismatch", transient=False
                    )
    except RoleVerificationFailure:
        raise
    except Exception as error:
        transient_kind = _transient_kind(error)
        raise RoleVerificationFailure(
            "postgres",
            transient_kind or "non_transient_verification_failure",
            transient=transient_kind is not None,
        ) from None


def verify_admin_with_retry(
    *,
    password: str,
    project_ref: str,
    host: str,
    port: str,
    verify_once: Callable[..., None] = verify_admin_once,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            verify_once(
                password=password,
                project_ref=project_ref,
                host=host,
                port=port,
            )
            return
        except RoleVerificationFailure as failure:
            if not failure.transient or attempt == MAX_ATTEMPTS:
                raise
            sleep(RETRY_DELAY_SECONDS)
    raise AssertionError("bounded bootstrap verification loop did not terminate")


def verify_role_set_once(
    *,
    roles: Mapping[str, str],
    project_ref: str,
    host: str,
    port: str,
    verify_once: Callable[..., None] = verify_role_once,
) -> None:
    for role, password in roles.items():
        verify_once(
            role=role,
            password=password,
            project_ref=project_ref,
            host=host,
            port=port,
        )


def verify_role_set_with_retry(
    *,
    roles: Mapping[str, str],
    project_ref: str,
    host: str,
    port: str,
    verify_set_once: Callable[..., None] = verify_role_set_once,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Require one complete role cohort to pass in the same bounded sweep."""

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            verify_set_once(
                roles=roles,
                project_ref=project_ref,
                host=host,
                port=port,
            )
            return
        except RoleVerificationFailure as failure:
            if not failure.transient or attempt == MAX_ATTEMPTS:
                raise
            sleep(RETRY_DELAY_SECONDS)
    raise AssertionError("bounded cohort verification loop did not terminate")


def select_pooler(
    *,
    roles: Mapping[str, str],
    project_ref: str,
    host: str,
    session_port: str,
    transaction_port: str,
    verify_set: Callable[..., None] = verify_role_set_with_retry,
) -> tuple[str, str]:
    try:
        verify_set(
            roles=roles, project_ref=project_ref, host=host, port=session_port
        )
        return session_port, "session"
    except RoleVerificationFailure as session_failure:
        if not session_failure.transient:
            raise PoolerVerificationFailure("session", session_failure) from None
        if session_failure.kind in QUIET_WINDOW_FAILURE_KINDS:
            raise PoolerVerificationFailure("session", session_failure) from None

    try:
        # A partial session-mode pass grants no authority to mix pooler modes.
        # Every reviewed role is verified again from the beginning here.
        verify_set(
            roles=roles, project_ref=project_ref, host=host, port=transaction_port
        )
        return transaction_port, "transaction"
    except RoleVerificationFailure as transaction_failure:
        raise PoolerVerificationFailure("transaction", transaction_failure) from None


def select_admin_pooler(
    *,
    password: str,
    project_ref: str,
    host: str,
    session_port: str,
    transaction_port: str,
    verify_admin: Callable[..., None] = verify_admin_with_retry,
) -> tuple[str, str]:
    """Select one reachable pooler mode before reset or migration writes."""

    try:
        verify_admin(
            password=password,
            project_ref=project_ref,
            host=host,
            port=session_port,
        )
        return session_port, "session"
    except RoleVerificationFailure as session_failure:
        if not session_failure.transient:
            raise PoolerVerificationFailure("session", session_failure) from None
        if session_failure.kind in QUIET_WINDOW_FAILURE_KINDS:
            raise PoolerVerificationFailure("session", session_failure) from None

    try:
        verify_admin(
            password=password,
            project_ref=project_ref,
            host=host,
            port=transaction_port,
        )
        return transaction_port, "transaction"
    except RoleVerificationFailure as transaction_failure:
        raise PoolerVerificationFailure("transaction", transaction_failure) from None


def _validated_port(value: str) -> str:
    if not value.isdigit() or not 1 <= int(value) <= 65535:
        raise ValueError("invalid pooler port")
    return value


def _configuration(environment: Mapping[str, str]) -> tuple[
    dict[str, str], str, str, str, str
]:
    roles: dict[str, str] = {}
    for role, variable in ROLE_PASSWORD_ENV:
        password = environment.get(variable, "")
        if PASSWORD_PATTERN.fullmatch(password) is None:
            raise ValueError("invalid reviewed role credential")
        roles[role] = password
    project_ref = environment.get("CANONICAL_STAGING_PROJECT_REF", "")
    host = environment.get("SUPABASE_POOLER_HOST", "")
    if PROJECT_REF_PATTERN.fullmatch(project_ref) is None:
        raise ValueError("invalid staging project reference")
    if POOLER_HOST_PATTERN.fullmatch(host) is None:
        raise ValueError("invalid staging pooler host")
    session_port = _validated_port(environment.get("SUPABASE_SESSION_POOLER_PORT", ""))
    transaction_port = _validated_port(environment.get("SUPABASE_POOLER_PORT", ""))
    if session_port == transaction_port:
        raise ValueError("pooler ports must be distinct")
    return roles, project_ref, host, session_port, transaction_port


def _write_pooler_environment(
    *,
    environment: Mapping[str, str],
    project_ref: str,
    host: str,
    port: str,
    mode: str,
) -> None:
    admin_password = environment.get("SUPABASE_DB_PASSWORD", "")
    github_env = environment.get("GITHUB_ENV", "")
    if not admin_password or not github_env:
        raise ValueError("transaction pooler environment is incomplete")
    psycopg_url = (
        f"postgresql://postgres.{project_ref}:{quote(admin_password, safe='')}"
        f"@{host}:{port}/postgres?sslmode=require&gssencmode=disable&connect_timeout=15"
        "&application_name=canonical_staging_ci"
    )
    sqlalchemy_url = "postgresql+psycopg2://" + psycopg_url.removeprefix(
        "postgresql://"
    )
    print(f"::add-mask::{psycopg_url}")
    print(f"::add-mask::{sqlalchemy_url}")
    with Path(github_env).open("a", encoding="utf-8") as env_file:
        env_file.write(f"PSYCOPG_DATABASE_URL={psycopg_url}\n")
        env_file.write(f"DATABASE_URL={sqlalchemy_url}\n")
        env_file.write(f"CANONICAL_ACTIVE_POOLER_PORT={port}\n")
        env_file.write(f"CANONICAL_ACTIVE_POOLER_MODE={mode}\n")


def main(arguments: list[str] | None = None) -> int:
    try:
        roles, project_ref, host, session_port, transaction_port = _configuration(
            os.environ
        )
        admin_password = os.environ.get("SUPABASE_DB_PASSWORD", "")
        parsed_arguments = sys.argv[1:] if arguments is None else arguments
        bootstrap_only = parsed_arguments == ["--bootstrap-only"]
        if parsed_arguments not in ([], ["--bootstrap-only"]):
            raise ValueError("unsupported verifier mode")
        if bootstrap_only:
            active_port, active_mode = select_admin_pooler(
                password=admin_password,
                project_ref=project_ref,
                host=host,
                session_port=session_port,
                transaction_port=transaction_port,
            )
        else:
            active_port, active_mode = select_pooler(
                roles=roles,
                project_ref=project_ref,
                host=host,
                session_port=session_port,
                transaction_port=transaction_port,
            )
            try:
                verify_admin_with_retry(
                    password=admin_password,
                    project_ref=project_ref,
                    host=host,
                    port=active_port,
                )
            except RoleVerificationFailure as failure:
                raise PoolerVerificationFailure(active_mode, failure) from None
        _write_pooler_environment(
            environment=os.environ,
            project_ref=project_ref,
            host=host,
            port=active_port,
            mode=active_mode,
        )
        verified_subject = "bootstrap administrator" if bootstrap_only else "all reviewed roles"
        print(f"{active_mode.capitalize()} pooler verified for {verified_subject}")
        return 0
    except PoolerVerificationFailure as failure:
        detail = failure.failure
        print(
            "::error title=Canonical staging role verification failed::"
            f"mode={failure.mode}; role={detail.role}; kind={detail.kind}; "
            f"transient={str(detail.transient).lower()}",
            file=sys.stderr,
        )
        return 1
    except (KeyError, OSError, ValueError):
        print(
            "::error title=Canonical staging role verification failed::"
            "mode=configuration; role=none; kind=invalid_configuration; transient=false",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
