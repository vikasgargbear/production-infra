from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/retire_canonical_evidence_storage_credential.py"
SPEC = importlib.util.spec_from_file_location(
    "retire_canonical_evidence_storage_credential", SCRIPT
)
cutover = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = cutover
SPEC.loader.exec_module(cutover)


REVIEWED_SHA = "a" * 40
RUN = {"id": "1234", "attempt": "2"}


def prepare_receipt(key_id: str | None = "legacy-key-id") -> dict:
    return {
        "version": 1,
        "phase": "prepare",
        "state": "prepared",
        "project_ref": cutover.PROJECT_REF,
        "reviewed_sha": REVIEWED_SHA,
        "run": RUN,
        "service_auth_user_id": cutover.SERVICE_AUTH_USER_ID,
        "service_email": cutover.SERVICE_EMAIL,
        "service_marker": cutover.SERVICE_MARKER,
        "database_role": cutover.SERVICE_ROLE,
        "password_session_verified": True,
        "hook_enabled": True,
        "legacy_secret_api_key_retained": key_id is not None,
        "legacy_secret_api_key_id": key_id,
    }


def proof_receipt(**overrides) -> dict:
    value = {
        "schema": "aasopharma.live18.reconciliation-attestation.v1",
        "status": "success",
        "provider": "render",
        "commit_sha": REVIEWED_SHA,
        "run": RUN,
        "operation_count": 18,
        "operation_ids": ["expense_claim", *[f"operation_{i}" for i in range(17)]],
        "database_mode": "captured_render_runtime",
        "evidence_storage_backend_proof": {
            "actor": "requester",
            "method": "POST",
            "path": "/api/web/evidence/expense-receipts",
            "status": 200,
            "browser_evidence_sha256": "b" * 64,
        },
    }
    value.update(overrides)
    return value


def test_cutover_requires_same_run_exact_sha_backend_upload_proof() -> None:
    assert cutover.validate_cutover_evidence(
        prepare=prepare_receipt(), proof=proof_receipt(), reviewed_sha=REVIEWED_SHA
    ) == "legacy-key-id"

    with pytest.raises(cutover.CredentialCutoverError) as captured:
        cutover.validate_cutover_evidence(
            prepare=prepare_receipt(),
            proof=proof_receipt(run={"id": "1235", "attempt": "1"}),
            reviewed_sha=REVIEWED_SHA,
        )
    assert captured.value.code == "CUTOVER_RUN_MISMATCH"

    invalid = proof_receipt()
    invalid["evidence_storage_backend_proof"]["path"] = "/api/health"
    with pytest.raises(cutover.CredentialCutoverError) as captured:
        cutover.validate_cutover_evidence(
            prepare=prepare_receipt(), proof=invalid, reviewed_sha=REVIEWED_SHA
        )
    assert captured.value.code == "BACKEND_STORAGE_PROOF_INVALID"


class FakeRender:
    def __init__(self) -> None:
        self.values = {
            "EVIDENCE_STORAGE_SERVER_API_KEY": {"value": "never-inspected"},
            "EVIDENCE_STORAGE_SERVER_JWT": {"value": "never-inspected"},
        }
        self.calls: list[tuple[str, str]] = []

    def request(self, method, path, *, allow_not_found=False):
        self.calls.append((method, path))
        key = path.rsplit("/", 1)[-1]
        if method == "GET":
            return self.values.get(key)
        assert method == "DELETE"
        self.values.pop(key, None)
        return None


def test_render_environment_is_retired_and_read_back_before_provider_key() -> None:
    render = FakeRender()

    removed = cutover.retire_render_environment(render, "srv-api")

    assert removed == list(cutover.RETIRED_RENDER_ENV_KEYS)
    delete_positions = [i for i, call in enumerate(render.calls) if call[0] == "DELETE"]
    final_read_positions = [
        i for i, call in enumerate(render.calls) if call[0] == "GET"
    ][-2:]
    assert max(delete_positions) < min(final_read_positions)


class FakeSupabase:
    def __init__(self) -> None:
        self.key_id = "legacy-key-id"
        self.calls: list[tuple[str, str]] = []

    def management(self, method, path, **_kwargs):
        self.calls.append((method, path))
        if method == "GET":
            return (
                []
                if self.key_id is None
                else [{
                    "id": self.key_id,
                    "name": cutover.RETIRED_KEY_NAME,
                    "type": "secret",
                    "secret_jwt_template": {"role": cutover.SERVICE_ROLE},
                }]
            )
        assert method == "DELETE"
        self.key_id = None
        return None


def test_provider_key_is_deleted_only_after_render_environment_readback(
    tmp_path, monkeypatch
) -> None:
    prepare_path = tmp_path / "prepare.json"
    proof_path = tmp_path / "proof.json"
    result_path = tmp_path / "retirement.json"
    prepare_path.write_text(json.dumps(prepare_receipt()), encoding="utf-8")
    proof_path.write_text(json.dumps(proof_receipt()), encoding="utf-8")
    supabase = FakeSupabase()
    render = FakeRender()
    events: list[str] = []

    class OrderedRender(FakeRender):
        def request(self, method, path, *, allow_not_found=False):
            result = render.request(method, path, allow_not_found=allow_not_found)
            if method == "GET" and not render.values:
                events.append("render_absent")
            return result

    original_management = supabase.management

    def management(method, path, **kwargs):
        if method == "DELETE":
            events.append("provider_delete")
        return original_management(method, path, **kwargs)

    supabase.management = management
    monkeypatch.setattr(cutover, "SupabaseClient", lambda _token: supabase)
    monkeypatch.setattr(cutover, "RenderClient", lambda _token: OrderedRender())
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "runner-token")
    monkeypatch.setenv("RENDER_API_KEY", "render-token")

    result = cutover.main([
        "--project-ref", cutover.PROJECT_REF,
        "--reviewed-sha", REVIEWED_SHA,
        "--prepare-receipt", str(prepare_path),
        "--proof-receipt", str(proof_path),
        "--render-api-service-id", "srv-api",
        "--receipt", str(result_path),
    ])

    assert result == 0
    assert events.index("render_absent") < events.index("provider_delete")
    receipt = json.loads(result_path.read_text(encoding="utf-8"))
    assert receipt["state"] == "retired"
    assert receipt["legacy_secret_api_key_removed"] is True
    assert receipt["rollback_boundary"] == (
        "verified_service_user_path_is_only_authority"
    )


def test_invalid_proof_causes_no_hosted_client_or_mutation(tmp_path, monkeypatch) -> None:
    prepare_path = tmp_path / "prepare.json"
    proof_path = tmp_path / "proof.json"
    result_path = tmp_path / "retirement.json"
    prepare_path.write_text(json.dumps(prepare_receipt()), encoding="utf-8")
    proof_path.write_text(
        json.dumps(proof_receipt(commit_sha="c" * 40)), encoding="utf-8"
    )

    def forbidden(_token):
        raise AssertionError("invalid proof must not construct a hosted client")

    monkeypatch.setattr(cutover, "SupabaseClient", forbidden)
    monkeypatch.setattr(cutover, "RenderClient", forbidden)

    result = cutover.main([
        "--project-ref", cutover.PROJECT_REF,
        "--reviewed-sha", REVIEWED_SHA,
        "--prepare-receipt", str(prepare_path),
        "--proof-receipt", str(proof_path),
        "--render-api-service-id", "srv-api",
        "--receipt", str(result_path),
    ])

    assert result == 2
    receipt = json.loads(result_path.read_text(encoding="utf-8"))
    assert receipt["state"] == "blocked"
    assert receipt["error_code"] == "EXACT_SHA_PROOF_INVALID"
    assert receipt["mutation_state"] == "none"


def test_partial_render_failure_keeps_provider_key_and_records_boundary(
    tmp_path, monkeypatch
) -> None:
    prepare_path = tmp_path / "prepare.json"
    proof_path = tmp_path / "proof.json"
    result_path = tmp_path / "retirement.json"
    prepare_path.write_text(json.dumps(prepare_receipt()), encoding="utf-8")
    proof_path.write_text(json.dumps(proof_receipt()), encoding="utf-8")
    supabase = FakeSupabase()

    class FailingRender(FakeRender):
        def request(self, method, path, *, allow_not_found=False):
            if (
                method == "GET"
                and path.endswith("/EVIDENCE_STORAGE_SERVER_JWT")
                and len(self.values) == 1
            ):
                raise cutover.CredentialCutoverError(
                    "RENDER_API_UNREACHABLE", "bounded failure"
                )
            return super().request(method, path, allow_not_found=allow_not_found)

    monkeypatch.setattr(cutover, "SupabaseClient", lambda _token: supabase)
    monkeypatch.setattr(cutover, "RenderClient", lambda _token: FailingRender())
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "runner-token")
    monkeypatch.setenv("RENDER_API_KEY", "render-token")

    result = cutover.main([
        "--project-ref", cutover.PROJECT_REF,
        "--reviewed-sha", REVIEWED_SHA,
        "--prepare-receipt", str(prepare_path),
        "--proof-receipt", str(proof_path),
        "--render-api-service-id", "srv-api",
        "--receipt", str(result_path),
    ])

    assert result == 2
    assert supabase.key_id == "legacy-key-id"
    assert all(call[0] != "DELETE" for call in supabase.calls)
    receipt = json.loads(result_path.read_text(encoding="utf-8"))
    assert receipt["state"] == "blocked"
    assert receipt["mutation_state"] == "render_environment_partially_retired"
