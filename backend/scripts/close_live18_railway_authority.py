#!/usr/bin/env python3
"""Idempotently close canonical authority on an exact Railway deployment."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
from typing import Mapping

REQUIRED_ENVIRONMENT = (
    "CANONICAL_STAGING_PROJECT_REF",
    "GITHUB_RUN_ATTEMPT",
    "GITHUB_RUN_ID",
    "LIVE18_RAILWAY_AUTHORITY_OPEN_ATTEMPTED_PATH",
    "LIVE18_RAILWAY_REQUEST_NONCE",
    "LIVE18_RAILWAY_SSH_PRIVATE_KEY",
    "RAILWAY_API_DEPLOYMENT_ID",
    "RAILWAY_API_DEPLOYMENT_INSTANCE_ID",
    "RAILWAY_API_SERVICE",
    "RAILWAY_ENVIRONMENT_ID",
    "RAILWAY_PROJECT_ID",
    "REVIEWED_DEPLOY_SHA",
    "SUPABASE_DB_PASSWORD",
)


class AuthorityCloseError(RuntimeError):
    """Canonical authority could not be attested closed."""


def _verify_response(request: Mapping[str, object]) -> None:
    """Load the database-phase verifier only after authority may have opened.

    Early workflow preflight failures happen before the pinned live acceptance
    dependencies are installed.  They also happen before the authority marker
    exists, so importing the PostgreSQL-backed database phase at module import
    time makes otherwise unnecessary failure compensation fail.  Keep the
    cheap marker check dependency-free and load the verifier only for a real
    close operation.
    """

    from scripts.live18_railway_database_phase import _verify_response as verify

    verify(request)


def _required_environment(environment: Mapping[str, str]) -> dict[str, str]:
    missing = [name for name in REQUIRED_ENVIRONMENT if not environment.get(name)]
    if missing:
        raise AuthorityCloseError(
            "Railway authority close is missing required environment: "
            + ", ".join(missing)
        )
    return {name: environment[name] for name in REQUIRED_ENVIRONMENT}


def close_authority(environment: Mapping[str, str] = os.environ) -> bool:
    marker_value = environment.get(
        "LIVE18_RAILWAY_AUTHORITY_OPEN_ATTEMPTED_PATH", ""
    ).strip()
    if not marker_value:
        print("Canonical authority opening was never attempted.")
        return False
    marker = Path(marker_value)
    if not marker.is_file():
        print("Canonical authority opening was never attempted or is already closed.")
        return False
    values = _required_environment(environment)

    request = {
        "schema": "aasopharma.live18.railway-database-phase.v1",
        "expected_sha": values["REVIEWED_DEPLOY_SHA"],
        "project_ref": values["CANONICAL_STAGING_PROJECT_REF"],
        "run_id": values["GITHUB_RUN_ID"],
        "run_attempt": values["GITHUB_RUN_ATTEMPT"],
        "request_nonce": values["LIVE18_RAILWAY_REQUEST_NONCE"],
        "deployment_id": values["RAILWAY_API_DEPLOYMENT_ID"],
        "deployment_instance_id": values["RAILWAY_API_DEPLOYMENT_INSTANCE_ID"],
        "secrets": {
            "SUPABASE_DB_PASSWORD": values["SUPABASE_DB_PASSWORD"],
        },
    }
    command = (
        "railway",
        "ssh",
        "--project",
        values["RAILWAY_PROJECT_ID"],
        "--environment",
        values["RAILWAY_ENVIRONMENT_ID"],
        "--service",
        values["RAILWAY_API_SERVICE"],
        "--deployment-instance",
        values["RAILWAY_API_DEPLOYMENT_INSTANCE_ID"],
        "--identity-file",
        values["LIVE18_RAILWAY_SSH_PRIVATE_KEY"],
        "--",
        "python",
        "scripts/live18_railway_database_phase.py",
        "close-authority",
        "--input",
        "-",
        "--output",
        "-",
    )
    try:
        completed = subprocess.run(
            command,
            input=json.dumps(request),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=90,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise AuthorityCloseError(
            "Railway authority close command exceeded 90 seconds"
        ) from None
    if completed.returncode != 0:
        raise AuthorityCloseError(
            f"Railway authority close command failed with exit {completed.returncode}"
        )
    try:
        response = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise AuthorityCloseError(
            "Railway authority close returned an invalid attestation"
        ) from error

    _verify_response({**request, "response": response})
    fence = response.get("write_fence")
    if not (
        response.get("action") == "close-authority"
        and response.get("temporary_owner_delegation_removed") is True
        and isinstance(fence, dict)
        and fence.get("state") == "closed"
        and fence.get("commit_sha") == values["REVIEWED_DEPLOY_SHA"]
    ):
        raise AuthorityCloseError(
            "Live18 failure compensation was not attested closed"
        )
    marker.unlink()
    print("Canonical authority is attested closed.")
    return True


def main() -> int:
    close_authority()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
