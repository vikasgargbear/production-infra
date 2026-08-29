#!/usr/bin/env python3
"""Provision, exercise, and clean one disposable Railway MCP transaction chain."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import requests
from exercise_live_mcp_multiproduct import main as exercise_multiproduct
from live18_railway_database_phase import (
    PROFILE_LIVE18,
    _apply_identity_response,
    _verify_response,
)

SCHEMA = "aasopharma.live18.railway-database-phase.v1"
EXACT_SHA = re.compile(r"^[0-9a-f]{40}$")
EXACT_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)
SENSITIVE_NAMES = (
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_ANON_KEY",
    "ERP_REGULATORY_IMPORTER_PASSWORD",
    "MCP_INTERNAL_SERVICE_TOKEN",
)


class LiveRailwayExerciseError(RuntimeError):
    """Raised after sanitizing a bounded live-exercise failure."""


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise LiveRailwayExerciseError(f"missing required environment value: {name}")
    return value


def redact(value: str) -> str:
    safe = value
    for name in SENSITIVE_NAMES:
        secret = os.getenv(name, "")
        if secret:
            safe = safe.replace(secret, "[REDACTED]")
    safe = re.sub(r"postgres(?:ql)?://[^\s]+", "[REDACTED_DATABASE_URL]", safe)
    safe = re.sub(r"eyJ[A-Za-z0-9._-]+", "[REDACTED_TOKEN]", safe)
    return " ".join(safe.split())[:1000]


def boundary(nonce: str) -> dict[str, str]:
    value = {
        "schema": SCHEMA,
        "expected_sha": required("REVIEWED_SHA"),
        "project_ref": required("CANONICAL_STAGING_PROJECT_REF"),
        "run_id": required("GITHUB_RUN_ID"),
        "run_attempt": required("GITHUB_RUN_ATTEMPT"),
        "request_nonce": nonce,
        "deployment_id": required("RAILWAY_API_DEPLOYMENT_ID"),
        "deployment_instance_id": required("RAILWAY_API_DEPLOYMENT_INSTANCE_ID"),
    }
    if not EXACT_SHA.fullmatch(value["expected_sha"]):
        raise LiveRailwayExerciseError("reviewed SHA is not exact")
    for name in ("deployment_id", "deployment_instance_id"):
        if not EXACT_UUID.fullmatch(value[name]):
            raise LiveRailwayExerciseError(f"{name} is not an exact UUID")
    if not value["run_id"].isdigit() or not value["run_attempt"].isdigit():
        raise LiveRailwayExerciseError("workflow run identity is not numeric")
    return value


def remote(action: str, request: dict[str, Any]) -> dict[str, Any]:
    command = [
        "railway",
        "ssh",
        "--project",
        required("RAILWAY_PROJECT_ID"),
        "--environment",
        required("RAILWAY_ENVIRONMENT_ID"),
        "--service",
        required("RAILWAY_API_SERVICE"),
        "--deployment-instance",
        required("RAILWAY_API_DEPLOYMENT_INSTANCE_ID"),
        "--identity-file",
        required("RAILWAY_IDENTITY_FILE"),
        "--",
        "python",
        "scripts/live18_railway_database_phase.py",
        action,
        "--input",
        "-",
        "--output",
        "-",
    ]
    completed = subprocess.run(
        command,
        input=json.dumps(request, separators=(",", ":")),
        text=True,
        capture_output=True,
        timeout=1800,
        check=False,
    )
    if completed.returncode != 0:
        raise LiveRailwayExerciseError(
            f"Railway {action} failed with exit {completed.returncode}: "
            f"{redact(completed.stderr)}"
        )
    try:
        response = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise LiveRailwayExerciseError(
            f"Railway {action} returned invalid JSON"
        ) from exc
    request_with_response = {**request, "response": response}
    _verify_response(request_with_response)
    if response.get("action") != action:
        raise LiveRailwayExerciseError(f"Railway {action} response action differs")
    return response


def require_clean_reconciliation(response: dict[str, Any]) -> None:
    if response.get("cleaned") is not True:
        raise LiveRailwayExerciseError("Railway identity cleanup was not attested")
    reconciliation = response.get("orphan_reconciliation")
    if not isinstance(reconciliation, dict):
        raise LiveRailwayExerciseError("Railway cleanup omitted reconciliation")
    for name in (
        "remaining_auth_identity_count",
        "remaining_active_temporary_grant_count",
        "remaining_active_mcp_grant_count",
        "remaining_denial_role_count",
        "remaining_active_denial_authority_count",
        "remaining_denial_auth_binding_count",
    ):
        if reconciliation.get(name) != 0:
            raise LiveRailwayExerciseError(f"Railway cleanup left {name}")


def wait_for_public_authority() -> None:
    expected_sha = required("REVIEWED_SHA")
    api_origin = required("RAILWAY_API_URL").rstrip("/")
    mcp_origin = required("RAILWAY_MCP_URL").rstrip("/")
    for _attempt in range(30):
        try:
            api_health = requests.get(f"{api_origin}/health", timeout=15).json()
            api_ready = requests.get(f"{api_origin}/ready", timeout=15).json()
            mcp_health = requests.get(f"{mcp_origin}/health", timeout=15).json()
            mcp_ready = requests.get(f"{mcp_origin}/ready", timeout=15).json()
            if (
                api_health.get("git_commit") == expected_sha
                and api_ready.get("status") == "ready"
                and mcp_health.get("git_commit") == expected_sha
                and mcp_ready.get("status") == "ready"
            ):
                return
        except (requests.RequestException, ValueError):
            pass
        time.sleep(2)
    raise LiveRailwayExerciseError(
        "exact Railway API and MCP did not become ready after authority opened"
    )


def write_evidence(name: str, value: dict[str, Any]) -> None:
    target = Path(required("RUNNER_TEMP")) / name
    target.write_text(
        json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def main() -> None:
    project_ref = required("CANONICAL_STAGING_PROJECT_REF")
    production_refs = {
        item.strip()
        for item in required("CANONICAL_PRODUCTION_PROJECT_REFS").split(",")
        if item.strip()
    }
    if project_ref in production_refs:
        raise LiveRailwayExerciseError("refusing a declared production project")
    if required("SUPABASE_URL") != f"https://{project_ref}.supabase.co":
        raise LiveRailwayExerciseError("Supabase URL differs from staging project")

    nonce = os.urandom(32).hex()
    base = boundary(nonce)
    secret_map = {
        name: required(name)
        for name in (
            "SUPABASE_ACCESS_TOKEN",
            "SUPABASE_DB_PASSWORD",
            "SUPABASE_ANON_KEY",
        )
    }
    identity_response: dict[str, Any] | None = None
    demo_provisioned = False
    identity_attempted = False
    primary_error: BaseException | None = None
    cleanup_errors: list[str] = []
    temporary = Path(required("RUNNER_TEMP"))

    try:
        recovery = remote(
            "recover-identities-before-demo",
            {
                **base,
                "identity_profile": PROFILE_LIVE18,
                "supabase_url": required("SUPABASE_URL"),
                "secrets": secret_map,
            },
        )
        require_clean_reconciliation(recovery)

        try:
            reviewed_scalars = json.loads(required("LIVE18_REVIEWED_SCALARS_JSON"))
        except json.JSONDecodeError as exc:
            raise LiveRailwayExerciseError("reviewed scalar pack is not JSON") from exc
        values = reviewed_scalars.get("values")
        if not isinstance(values, dict):
            raise LiveRailwayExerciseError("reviewed scalar pack omitted values")
        values.pop("stock_adjustment_gain_quantity", None)
        values["stock_adjustment_loss_quantity"] = required(
            "LIVE_MCP_STOCK_ADJUSTMENT_LOSS_QUANTITY"
        )
        receipt = base64.b64decode(
            required("CANONICAL_DEMO_EXPENSE_RECEIPT_BASE64"), validate=True
        )
        receipt_sha = hashlib.sha256(receipt).hexdigest()
        if receipt_sha != required("CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256"):
            raise LiveRailwayExerciseError("reviewed expense receipt hash differs")

        demo = remote(
            "provision-demo",
            {
                **base,
                "api_origin": required("RAILWAY_API_URL"),
                "production_project_refs": required(
                    "CANONICAL_PRODUCTION_PROJECT_REFS"
                ),
                "reviewed_web_auth_user_id": required(
                    "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID"
                ),
                "expense_receipt_sha256": receipt_sha,
                "expense_receipt_base64": base64.b64encode(receipt).decode("ascii"),
                "reviewed_scalars": reviewed_scalars,
                "secrets": {
                    "SUPABASE_DB_PASSWORD": required("SUPABASE_DB_PASSWORD"),
                    "ERP_REGULATORY_IMPORTER_PASSWORD": required(
                        "ERP_REGULATORY_IMPORTER_PASSWORD"
                    ),
                },
            },
        )
        if (
            demo.get("transport") != "supabase_direct_ipv6_from_railway"
            or demo.get("temporary_owner_delegation_removed") is not True
            or (demo.get("write_fence") or {}).get("state") != "open"
            or (demo.get("write_fence") or {}).get("commit_sha")
            != required("REVIEWED_SHA")
        ):
            raise LiveRailwayExerciseError(
                "Railway demo authority receipt is incomplete"
            )
        demo_provisioned = True
        write_evidence("live-mcp-demo-evidence.json", demo)
        wait_for_public_authority()

        identity_request = {
            **base,
            "identity_profile": PROFILE_LIVE18,
            "transport_key_base64": base64.b64encode(os.urandom(32)).decode("ascii"),
            "supabase_url": required("SUPABASE_URL"),
            "api_origin": required("RAILWAY_API_URL"),
            "mcp_url": f"{required('RAILWAY_MCP_URL').rstrip('/')}/mcp",
            "secrets": secret_map,
        }
        identity_attempted = True
        identity_response = remote("provision-identities", identity_request)
        identity_environment = _apply_identity_response(
            {**identity_request, "response": identity_response}, temporary
        )
        os.environ.update(identity_environment)
        os.environ.update(
            {
                "LIVE18_RUN_TOKEN": f"{required('GITHUB_RUN_ID')}-{required('GITHUB_RUN_ATTEMPT')}",
                "LIVE18_EXPECTED_DEPLOYED_SHA": required("REVIEWED_SHA"),
                "PHARMA_CANONICAL_LIVE_WRITE_ACK": "true",
                "PHARMA_CANONICAL_LIVE_TARGET_KIND": "disposable_test",
                "PHARMA_CANONICAL_LIVE_PROJECT_REF": project_ref,
                "PHARMA_CANONICAL_LIVE_ALLOWED_PROJECT_REF": project_ref,
                "PHARMA_CANONICAL_PRODUCTION_PROJECT_REFS": required(
                    "CANONICAL_PRODUCTION_PROJECT_REFS"
                ),
                "PHARMA_CANONICAL_LIVE_API_BASE_URL": required("RAILWAY_API_URL"),
                "PHARMA_CANONICAL_MCP_URL": f"{required('RAILWAY_MCP_URL').rstrip('/')}/mcp",
                "PHARMA_CANONICAL_LIVE_SERVICE_TOKEN": required(
                    "MCP_INTERNAL_SERVICE_TOKEN"
                ),
                "PHARMA_CANONICAL_LIVE_TEST_ORG_ID": identity_environment[
                    "LIVE18_EXPECTED_ORG_ID"
                ],
                "PHARMA_CANONICAL_LIVE_DATABASE_EVIDENCE_PATH": str(
                    temporary / "live-mcp-database-evidence-not-required.json"
                ),
                "PHARMA_CANONICAL_LIVE_FIXTURE_INPUT_PATH": str(
                    temporary / "live-mcp-fixture-not-required.json"
                ),
                "PHARMA_CANONICAL_LIVE_TIMEOUT_SECONDS": "30",
            }
        )
        exercise_multiproduct()
    except Exception as exc:  # noqa: BLE001 - cleanup must run for every live failure
        primary_error = exc
    finally:
        try:
            cleanup_request = {
                **base,
                "identity_profile": PROFILE_LIVE18,
                "supabase_url": required("SUPABASE_URL"),
                "browser_state": (
                    identity_response.get("browser_state")
                    if identity_response is not None
                    else None
                ),
                "mcp_state": (
                    identity_response.get("mcp_state")
                    if identity_response is not None
                    else None
                ),
                "secrets": secret_map,
            }
            cleanup_action = (
                "cleanup-identities"
                if demo_provisioned and identity_attempted
                else "recover-identities-before-demo"
            )
            cleanup = remote(cleanup_action, cleanup_request)
            require_clean_reconciliation(cleanup)
            write_evidence("live-mcp-cleanup-evidence.json", cleanup)
        except Exception as exc:  # noqa: BLE001 - authority closure must still run
            cleanup_errors.append(redact(str(exc)))
        try:
            closed = remote(
                "close-authority",
                {
                    **base,
                    "secrets": {
                        "SUPABASE_DB_PASSWORD": required("SUPABASE_DB_PASSWORD")
                    },
                },
            )
            if (closed.get("write_fence") or {}).get("state") != "closed" or closed.get(
                "temporary_owner_delegation_removed"
            ) is not True:
                raise LiveRailwayExerciseError(
                    "Railway authority closure receipt is incomplete"
                )
            write_evidence("live-mcp-authority-closed.json", closed)
        except Exception as exc:  # noqa: BLE001 - report compound cleanup failure
            cleanup_errors.append(redact(str(exc)))
        for name in (
            "live18-browser-identities.json",
            "live18-mcp-identities.json",
            "live18-fixture-identities.json",
            "live18-authoritative-facts.json",
        ):
            (temporary / name).unlink(missing_ok=True)

    if primary_error is not None and cleanup_errors:
        raise LiveRailwayExerciseError(
            "live MCP exercise failed: "
            + redact(str(primary_error))
            + "; live MCP cleanup failed: "
            + "; ".join(cleanup_errors)
        ) from primary_error
    if cleanup_errors:
        raise LiveRailwayExerciseError(
            "live MCP cleanup failed: " + "; ".join(cleanup_errors)
        )
    if primary_error is not None:
        raise LiveRailwayExerciseError(
            "live MCP exercise failed: " + redact(str(primary_error))
        ) from primary_error


if __name__ == "__main__":
    try:
        main()
    except LiveRailwayExerciseError as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from None
