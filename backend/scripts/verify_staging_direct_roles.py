#!/usr/bin/env python3
"""Bind CI to the manifest-owned canonical staging direct IPv4 transport."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

try:
    from canonical_staging_database import (
        CanonicalStagingDatabaseError,
        build_direct_dsn,
        load_direct_database_contract,
        verify_direct_database,
    )
except ModuleNotFoundError:  # Imported as ``scripts.*`` by pytest.
    from scripts.canonical_staging_database import (
        CanonicalStagingDatabaseError,
        build_direct_dsn,
        load_direct_database_contract,
        verify_direct_database,
    )


ROLE_PASSWORD_ENV = {
    "erp_runtime": "ERP_RUNTIME_PASSWORD",
    "erp_calculator": "ERP_CALCULATOR_PASSWORD",
    "erp_tax_provider": "ERP_TAX_PROVIDER_PASSWORD",
    "erp_regulatory_importer": "ERP_REGULATORY_IMPORTER_PASSWORD",
}
PASSWORD_PATTERN = re.compile(r"[A-Za-z0-9_-]{48,96}")


def _required_password(environment: dict[str, str], variable: str) -> str:
    value = environment.get(variable, "")
    if not value:
        raise CanonicalStagingDatabaseError(
            f"required canonical database secret is missing: {variable}"
        )
    return value


def _write_environment(*, environment: dict[str, str], admin_dsn: str) -> None:
    output = environment.get("GITHUB_ENV", "")
    if not output:
        raise CanonicalStagingDatabaseError("GitHub environment output is missing")
    contract = load_direct_database_contract()
    sqlalchemy_dsn = "postgresql+psycopg2://" + admin_dsn.removeprefix(
        "postgresql://"
    )
    print(f"::add-mask::{admin_dsn}")
    print(f"::add-mask::{sqlalchemy_dsn}")
    with Path(output).open("a", encoding="utf-8") as stream:
        stream.write(f"PSYCOPG_DATABASE_URL={admin_dsn}\n")
        stream.write(f"DATABASE_URL={sqlalchemy_dsn}\n")
        stream.write(f"SUPABASE_DIRECT_DATABASE_HOST={contract.host}\n")
        stream.write(f"SUPABASE_DIRECT_DATABASE_PORT={contract.port}\n")
        stream.write("CANONICAL_DATABASE_TRANSPORT=direct_ipv4\n")


def verify(environment: dict[str, str], *, bootstrap_only: bool) -> None:
    contract = load_direct_database_contract()
    configured_project = environment.get("CANONICAL_STAGING_PROJECT_REF", "")
    if configured_project != contract.project_ref:
        raise CanonicalStagingDatabaseError(
            "workflow project does not match canonical database authority"
        )
    administrator_password = _required_password(environment, "SUPABASE_DB_PASSWORD")
    verify_direct_database(
        contract=contract,
        role=contract.administrator_role,
        password=administrator_password,
        application_name="canonical_staging_admin_verify",
    )
    if not bootstrap_only:
        if tuple(ROLE_PASSWORD_ENV) != contract.isolated_roles:
            raise CanonicalStagingDatabaseError(
                "workflow roles do not match canonical database authority"
            )
        for role, variable in ROLE_PASSWORD_ENV.items():
            password = _required_password(environment, variable)
            if PASSWORD_PATTERN.fullmatch(password) is None:
                raise CanonicalStagingDatabaseError(
                    f"reviewed canonical database secret is malformed: {variable}"
                )
            verify_direct_database(
                contract=contract,
                role=role,
                password=password,
                application_name="canonical_staging_role_verify",
            )
    admin_dsn = build_direct_dsn(
        contract=contract,
        role=contract.administrator_role,
        password=administrator_password,
        application_name="canonical_staging_ci",
    )
    _write_environment(environment=environment, admin_dsn=admin_dsn)


def main(arguments: list[str] | None = None) -> int:
    parsed = sys.argv[1:] if arguments is None else arguments
    if parsed not in ([], ["--bootstrap-only"]):
        print(
            "::error title=Canonical direct IPv4 verification failed::"
            "unsupported verifier arguments",
            file=sys.stderr,
        )
        return 2
    try:
        verify(dict(os.environ), bootstrap_only=parsed == ["--bootstrap-only"])
    except CanonicalStagingDatabaseError as error:
        safe_error = str(error).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(
            "::error title=Canonical direct IPv4 verification failed::"
            f"{safe_error}",
            file=sys.stderr,
        )
        return 1
    subject = "administrator" if parsed else "administrator and isolated roles"
    print(f"Canonical direct IPv4 transport verified for {subject}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
