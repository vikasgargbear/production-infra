#!/usr/bin/env python3
"""Retire the legacy evidence credential after exact-SHA backend proof.

This is phase two of the evidence-storage credential cutover.  Phase one keeps
the legacy Supabase key and Render environment variables intact while the new
service-user identity is prepared and deployed.  This command accepts only a
same-run prepare receipt plus a successful Render Live18 reconciliation whose
expense-claim evidence proves the deployed backend uploaded and read back the
reviewed PDF through the new service-user storage adapter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Mapping

import requests

try:
    from scripts.provision_canonical_evidence_storage_identity import (
        Client as SupabaseClient,
        IdentityProvisioningError,
        PROJECT_REF,
        RETIRED_KEY_NAME,
        SERVICE_AUTH_USER_ID,
        SERVICE_EMAIL,
        SERVICE_MARKER,
        SERVICE_ROLE,
        inspect_retired_custom_api_key,
    )
except ModuleNotFoundError:  # Direct script execution adds this directory.
    from provision_canonical_evidence_storage_identity import (
        Client as SupabaseClient,
        IdentityProvisioningError,
        PROJECT_REF,
        RETIRED_KEY_NAME,
        SERVICE_AUTH_USER_ID,
        SERVICE_EMAIL,
        SERVICE_MARKER,
        SERVICE_ROLE,
        inspect_retired_custom_api_key,
    )


RENDER_API = "https://api.render.com/v1"
RETIRED_RENDER_ENV_KEYS = (
    "EVIDENCE_STORAGE_SERVER_API_KEY",
    "EVIDENCE_STORAGE_SERVER_JWT",
)
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
RUN_RE = re.compile(r"^[1-9][0-9]*$")


class CredentialCutoverError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _read_receipt(path: Path, label: str) -> tuple[dict[str, Any], str]:
    try:
        content = path.read_bytes()
        value = json.loads(content)
    except (OSError, json.JSONDecodeError) as error:
        raise CredentialCutoverError(
            f"{label.upper()}_RECEIPT_INVALID", f"{label} receipt is unreadable"
        ) from error
    if not isinstance(value, dict) or len(content) > 1_048_576:
        raise CredentialCutoverError(
            f"{label.upper()}_RECEIPT_INVALID", f"{label} receipt is malformed"
        )
    return value, hashlib.sha256(content).hexdigest()


def _run(value: Mapping[str, Any], label: str) -> tuple[str, str]:
    run = value.get("run")
    if not isinstance(run, dict):
        raise CredentialCutoverError(
            f"{label.upper()}_RUN_INVALID", f"{label} receipt omitted run identity"
        )
    run_id = run.get("id")
    attempt = run.get("attempt")
    if (
        not isinstance(run_id, str)
        or RUN_RE.fullmatch(run_id) is None
        or not isinstance(attempt, str)
        or RUN_RE.fullmatch(attempt) is None
    ):
        raise CredentialCutoverError(
            f"{label.upper()}_RUN_INVALID", f"{label} run identity is invalid"
        )
    return run_id, attempt


def validate_cutover_evidence(
    *, prepare: Mapping[str, Any], proof: Mapping[str, Any], reviewed_sha: str
) -> str | None:
    expected_prepare = {
        "version": 1,
        "phase": "prepare",
        "state": "prepared",
        "project_ref": PROJECT_REF,
        "reviewed_sha": reviewed_sha,
        "service_auth_user_id": SERVICE_AUTH_USER_ID,
        "service_email": SERVICE_EMAIL,
        "service_marker": SERVICE_MARKER,
        "database_role": SERVICE_ROLE,
        "password_session_verified": True,
        "hook_enabled": True,
    }
    if any(prepare.get(key) != value for key, value in expected_prepare.items()):
        raise CredentialCutoverError(
            "PREPARE_RECEIPT_DRIFT", "identity prepare receipt drifted"
        )
    retained = prepare.get("legacy_secret_api_key_retained")
    retained_id = prepare.get("legacy_secret_api_key_id")
    if (
        not isinstance(retained, bool)
        or (retained and (not isinstance(retained_id, str) or not retained_id))
        or (not retained and retained_id is not None)
    ):
        raise CredentialCutoverError(
            "PREPARE_RECEIPT_DRIFT", "legacy credential prepare evidence drifted"
        )

    prepare_run = _run(prepare, "prepare")
    proof_run = _run(proof, "proof")
    expected_proof = {
        "schema": "aasopharma.live18.reconciliation-attestation.v1",
        "status": "success",
        "provider": "render",
        "commit_sha": reviewed_sha,
        "operation_count": 18,
        "database_mode": "captured_render_runtime",
    }
    if any(proof.get(key) != value for key, value in expected_proof.items()):
        raise CredentialCutoverError(
            "EXACT_SHA_PROOF_INVALID", "Live18 exact-SHA proof drifted"
        )
    operation_ids = proof.get("operation_ids")
    if not isinstance(operation_ids, list) or "expense_claim" not in operation_ids:
        raise CredentialCutoverError(
            "EXACT_SHA_PROOF_INVALID", "Live18 omitted the expense claim operation"
        )
    backend_proof = proof.get("evidence_storage_backend_proof")
    if (
        not isinstance(backend_proof, dict)
        or set(backend_proof)
        != {
            "actor",
            "method",
            "path",
            "status",
            "browser_evidence_sha256",
        }
        or backend_proof.get("actor") != "requester"
        or backend_proof.get("method") != "POST"
        or backend_proof.get("path") != "/api/web/evidence/expense-receipts"
    ):
        raise CredentialCutoverError(
            "BACKEND_STORAGE_PROOF_INVALID", "backend storage proof drifted"
        )
    if (
        backend_proof.get("status") not in {200, 201}
        or not isinstance(backend_proof.get("browser_evidence_sha256"), str)
        or re.fullmatch(
            r"[0-9a-f]{64}", backend_proof["browser_evidence_sha256"]
        )
        is None
    ):
        raise CredentialCutoverError(
            "BACKEND_STORAGE_PROOF_INVALID", "backend storage proof is incomplete"
        )
    if prepare_run != proof_run:
        raise CredentialCutoverError(
            "CUTOVER_RUN_MISMATCH", "prepare and proof must come from the same run"
        )
    return retained_id


class RenderClient:
    def __init__(self, api_key: str) -> None:
        if not api_key.strip():
            raise CredentialCutoverError(
                "RENDER_TOKEN_MISSING", "RENDER_API_KEY is required"
            )
        self.api_key = api_key

    def request(self, method: str, path: str, *, allow_not_found: bool = False) -> Any:
        try:
            response = requests.request(
                method,
                RENDER_API + path,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=30,
            )
        except requests.RequestException as error:
            raise CredentialCutoverError(
                "RENDER_API_UNREACHABLE", "Render API request did not complete"
            ) from error
        if allow_not_found and response.status_code == 404:
            return None
        if not response.ok:
            raise CredentialCutoverError(
                "RENDER_API_REJECTED",
                f"Render API {method} failed with HTTP {response.status_code}",
            )
        try:
            return response.json() if response.content else None
        except ValueError as error:
            raise CredentialCutoverError(
                "RENDER_API_RESPONSE_INVALID", "Render API response is not JSON"
            ) from error


def retire_render_environment(
    client: RenderClient,
    service_id: str,
    *,
    on_mutation: Callable[[tuple[str, ...]], None] | None = None,
) -> list[str]:
    if not service_id.strip():
        raise CredentialCutoverError(
            "RENDER_SERVICE_ID_MISSING", "Render API service ID is required"
        )
    removed: list[str] = []
    for key in RETIRED_RENDER_ENV_KEYS:
        path = f"/services/{service_id}/env-vars/{key}"
        current = client.request("GET", path, allow_not_found=True)
        if current is not None:
            client.request("DELETE", path)
            removed.append(key)
            if on_mutation is not None:
                on_mutation(tuple(removed))
    for key in RETIRED_RENDER_ENV_KEYS:
        if client.request(
            "GET", f"/services/{service_id}/env-vars/{key}", allow_not_found=True
        ) is not None:
            raise CredentialCutoverError(
                "RENDER_ENV_RETIREMENT_INCOMPLETE",
                "Render retained a retired evidence credential variable",
            )
    return removed


def retire_supabase_key(
    client: SupabaseClient,
    expected_id: str | None,
    *,
    on_delete: Callable[[], None] | None = None,
) -> bool:
    current_id = inspect_retired_custom_api_key(client)
    if current_id != expected_id:
        raise CredentialCutoverError(
            "LEGACY_KEY_CHANGED_AFTER_PREPARE",
            "legacy Supabase key changed after identity prepare",
        )
    if current_id is None:
        return False
    client.management("DELETE", f"/projects/{PROJECT_REF}/api-keys/{current_id}")
    if on_delete is not None:
        on_delete()
    if inspect_retired_custom_api_key(client) is not None:
        raise CredentialCutoverError(
            "LEGACY_KEY_RETIREMENT_INCOMPLETE",
            "legacy Supabase key remained after deletion",
        )
    return True


def _write_receipt(path: Path, payload: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(payload, output, indent=2, sort_keys=True)
            output.write("\n")
        os.replace(temporary, path)
        path.chmod(0o600)
    finally:
        temporary.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--reviewed-sha", required=True)
    parser.add_argument("--prepare-receipt", type=Path, required=True)
    parser.add_argument("--proof-receipt", type=Path, required=True)
    parser.add_argument("--render-api-service-id", required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args(argv)
    base = {
        "contract_version": "canonical-evidence-credential-cutover-v1",
        "phase": "retire",
        "project_ref": args.project_ref,
        "reviewed_sha": args.reviewed_sha,
        "verified_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    mutation_state = "none"
    try:
        if args.project_ref != PROJECT_REF:
            raise CredentialCutoverError(
                "PROJECT_REF_DENIED", "refusing cutover outside reviewed staging"
            )
        if SHA_RE.fullmatch(args.reviewed_sha) is None:
            raise CredentialCutoverError(
                "REVIEWED_SHA_INVALID", "reviewed SHA must be exact lowercase hexadecimal"
            )
        prepare, prepare_sha256 = _read_receipt(args.prepare_receipt, "prepare")
        proof, proof_sha256 = _read_receipt(args.proof_receipt, "proof")
        expected_key_id = validate_cutover_evidence(
            prepare=prepare, proof=proof, reviewed_sha=args.reviewed_sha
        )
        supabase = SupabaseClient(os.getenv("SUPABASE_ACCESS_TOKEN", ""))
        # Reconcile the provider key before touching either credential location.
        if inspect_retired_custom_api_key(supabase) != expected_key_id:
            raise CredentialCutoverError(
                "LEGACY_KEY_CHANGED_AFTER_PREPARE",
                "legacy Supabase key changed after identity prepare",
            )
        render = RenderClient(os.getenv("RENDER_API_KEY", ""))
        def mark_render_mutation(_removed: tuple[str, ...]) -> None:
            nonlocal mutation_state
            mutation_state = "render_environment_partially_retired"

        removed_env = retire_render_environment(
            render,
            args.render_api_service_id,
            on_mutation=mark_render_mutation,
        )
        mutation_state = "render_environment_retired"

        def mark_provider_delete() -> None:
            nonlocal mutation_state
            mutation_state = "provider_key_delete_attempted"

        removed_key = retire_supabase_key(
            supabase, expected_key_id, on_delete=mark_provider_delete
        )
        mutation_state = "complete"
        _write_receipt(
            args.receipt,
            {
                **base,
                "state": "retired",
                "prepare_receipt_sha256": prepare_sha256,
                "proof_receipt_sha256": proof_sha256,
                "legacy_render_environment_removed": removed_env,
                "legacy_secret_api_key_id": expected_key_id,
                "legacy_secret_api_key_removed": removed_key,
                "rollback_boundary": "verified_service_user_path_is_only_authority",
            },
        )
        print(json.dumps({"state": "retired", "project_ref": PROJECT_REF}))
        return 0
    except (CredentialCutoverError, IdentityProvisioningError) as error:
        code = error.code
        _write_receipt(
            args.receipt,
            {
                **base,
                "state": "blocked",
                "error_code": code,
                "mutation_state": mutation_state,
            },
        )
        print(f"evidence credential cutover blocked: {code}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
