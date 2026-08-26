from __future__ import annotations

import hashlib
import hmac
import importlib.util
import json
import time
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes.internal import tax_provider
from app.domain.tax_provider import ProviderCompletionRequest
from app.infrastructure import tax_provider as provider_infrastructure


REPO = Path(__file__).resolve().parents[3]
FIXTURE = REPO / "backend/tests/fixtures/tax_provider/offline-boundary-conformance.json"
COMMAND_ROOT = REPO / "database/canonical/commands_tax_provider"


def _cases() -> list[dict]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))["completion_cases"]


def test_offline_boundary_fixtures_are_exact_but_not_official_conformance() -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert document["scope"] == (
        "provider-neutral boundary only; not official NIC/GSP sandbox evidence"
    )
    parsed = [ProviderCompletionRequest.model_validate(case) for case in document["completion_cases"]]
    assert {(item.artifact_kind, item.outcome) for item in parsed} == {
        ("einvoice", "generated"),
        ("eway_bill", "generated"),
    }


def test_completion_contract_rejects_extra_wrong_hash_and_cross_kind_evidence() -> None:
    extra = {**_cases()[0], "provider_payload": {"guessed": True}}
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ProviderCompletionRequest.model_validate(extra)

    wrong_hash = {**_cases()[0], "response_sha256": "0" * 64}
    with pytest.raises(ValidationError, match="response_sha256"):
        ProviderCompletionRequest.model_validate(wrong_hash)

    cross_kind = {**_cases()[1], "irn": "not-allowed"}
    with pytest.raises(ValidationError, match="must not contain IRN"):
        ProviderCompletionRequest.model_validate(cross_kind)


def test_non_generated_outcomes_cannot_assert_provider_authority_fields() -> None:
    failed = {**_cases()[0], "outcome": "failed"}
    with pytest.raises(ValidationError, match="must not assert authority evidence"):
        ProviderCompletionRequest.model_validate(failed)

    cancelled = {**_cases()[1], "outcome": "cancelled"}
    with pytest.raises(ValidationError, match="must not assert authority evidence"):
        ProviderCompletionRequest.model_validate(cancelled)


def test_raw_body_hmac_binds_version_time_method_path_and_bytes(monkeypatch) -> None:
    token = "t" * 48
    secret = "h" * 48
    monkeypatch.setenv("TAX_PROVIDER_INTERNAL_SERVICE_TOKEN", token)
    monkeypatch.setenv("TAX_PROVIDER_INTERNAL_HMAC_SECRET", secret)
    raw_body = json.dumps(_cases()[0], separators=(",", ":")).encode()
    timestamp = "1787211000"
    path = "/api/internal/tax-provider/completions"
    signature = hmac.new(
        secret.encode(),
        tax_provider._signed_message(timestamp, "POST", path, raw_body),
        hashlib.sha256,
    ).hexdigest()
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    request_id = _cases()[0]["worker_request_id"]

    tax_provider.verify_worker_authentication(
        raw_body=raw_body,
        method="POST",
        path=path,
        credentials=credentials,
        timestamp=timestamp,
        signature=f"v1={signature}",
        idempotency_key=request_id,
        worker_request_id=request_id,
        now=int(timestamp),
    )

    cross_tenant_body = raw_body.replace(
        b'"organization_id":"20000000-0000-4000-8000-000000000001"',
        b'"organization_id":"20000000-0000-4000-8000-000000000099"',
    )
    assert cross_tenant_body != raw_body
    with pytest.raises(HTTPException) as changed:
        tax_provider.verify_worker_authentication(
            raw_body=cross_tenant_body,
            method="POST",
            path=path,
            credentials=credentials,
            timestamp=timestamp,
            signature=f"v1={signature}",
            idempotency_key=request_id,
            worker_request_id=request_id,
            now=int(timestamp),
        )
    assert changed.value.status_code == 401

    with pytest.raises(HTTPException) as stale:
        tax_provider.verify_worker_authentication(
            raw_body=raw_body,
            method="POST",
            path=path,
            credentials=credentials,
            timestamp=timestamp,
            signature=f"v1={signature}",
            idempotency_key=request_id,
            worker_request_id=request_id,
            now=int(timestamp) + 301,
        )
    assert stale.value.status_code == 401


def test_worker_secrets_must_be_distinct_from_each_other_mcp_and_jwt(monkeypatch) -> None:
    repeated = "r" * 48
    monkeypatch.setenv("TAX_PROVIDER_INTERNAL_SERVICE_TOKEN", repeated)
    monkeypatch.setenv("TAX_PROVIDER_INTERNAL_HMAC_SECRET", repeated)
    with pytest.raises(HTTPException) as blocked:
        tax_provider.verify_worker_authentication(
            raw_body=b"{}",
            method="POST",
            path="/api/internal/tax-provider/completions",
            credentials=HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=repeated
            ),
            timestamp="1787211000",
            signature="v1=" + "0" * 64,
            idempotency_key="10000000-0000-4000-8000-000000000001",
            worker_request_id="10000000-0000-4000-8000-000000000001",
            now=1787211000,
        )
    assert blocked.value.status_code == 503


def test_provider_database_url_cannot_reuse_runtime_or_calculator_principal(monkeypatch) -> None:
    reused = "postgresql://erp_runtime:secret@example.invalid/postgres"
    monkeypatch.setenv("DATABASE_URL", reused)
    monkeypatch.setenv("TAX_PROVIDER_DATABASE_URL", reused)
    provider_infrastructure.get_tax_provider_database.cache_clear()
    with pytest.raises(
        provider_infrastructure.TaxProviderConfigurationError,
        match="independent database principal",
    ):
        provider_infrastructure.get_tax_provider_database()
    provider_infrastructure.get_tax_provider_database.cache_clear()


def test_provider_database_uses_one_connection_with_zero_overflow(monkeypatch) -> None:
    captured = {}
    database_url = (
        "postgresql://erp_tax_provider:secret@example.invalid:5432/postgres"
    )
    monkeypatch.delenv("DATABASE_TRANSPORT_REQUIREMENT", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://erp_runtime:secret@localhost/db")
    monkeypatch.setenv(
        "ERP_CALCULATOR_DATABASE_URL",
        "postgresql://erp_calculator:secret@localhost/db",
    )
    monkeypatch.setenv("TAX_PROVIDER_DATABASE_URL", database_url)
    monkeypatch.setattr(
        provider_infrastructure,
        "create_engine",
        lambda url, **kwargs: captured.update(url=url, **kwargs) or object(),
    )
    provider_infrastructure.get_tax_provider_database.cache_clear()

    provider_infrastructure.get_tax_provider_database()

    assert captured["url"] == database_url
    assert captured["pool_size"] == 1
    assert captured["max_overflow"] == 0
    assert "poolclass" not in captured
    provider_infrastructure.get_tax_provider_database.cache_clear()


def test_provider_direct_transport_rejects_pooler(monkeypatch) -> None:
    primary = (
        "postgresql://erp_runtime:secret@db.project.supabase.co:5432/postgres"
        "?sslmode=require"
    )
    monkeypatch.setenv("DATABASE_TRANSPORT_REQUIREMENT", "supabase_direct_ipv4")
    monkeypatch.setenv("DATABASE_URL", primary)
    monkeypatch.setenv(
        "ERP_CALCULATOR_DATABASE_URL",
        primary.replace("erp_runtime", "erp_calculator"),
    )
    monkeypatch.setenv(
        "TAX_PROVIDER_DATABASE_URL",
        "postgresql://erp_tax_provider.project:secret@"
        "aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require",
    )
    provider_infrastructure.get_tax_provider_database.cache_clear()

    with pytest.raises(
        provider_infrastructure.TaxProviderConfigurationError,
        match="direct IPv4 database endpoint",
    ):
        provider_infrastructure.get_tax_provider_database()
    provider_infrastructure.get_tax_provider_database.cache_clear()


def test_worker_route_is_hidden_separate_and_externally_fail_closed() -> None:
    assert {route.path for route in tax_provider.router.routes} == {
        "/internal/tax-provider/requests:fetch",
        "/internal/tax-provider/completions",
    }
    assert all(route.include_in_schema is False for route in tax_provider.router.routes)
    assert tax_provider.TAX_PROVIDER_PROMOTION_VERIFIED is False
    with pytest.raises(HTTPException) as blocked:
        tax_provider._require_promotion()
    assert blocked.value.status_code == 503


def test_promoted_completion_route_preserves_signed_raw_evidence(monkeypatch) -> None:
    case = _cases()[0]
    token = "t" * 48
    secret = "h" * 48
    profile = (
        case["adapter_name"],
        case["verification"]["official_schema_version"],
        case["verification"]["conformance_profile_sha256"],
    )
    monkeypatch.setenv("TAX_PROVIDER_INTERNAL_SERVICE_TOKEN", token)
    monkeypatch.setenv("TAX_PROVIDER_INTERNAL_HMAC_SECRET", secret)
    monkeypatch.setattr(tax_provider, "TAX_PROVIDER_PROMOTION_VERIFIED", True)
    monkeypatch.setattr(tax_provider, "APPROVED_PROVIDER_SCHEMA_PROFILES", frozenset({profile}))

    class FakeDatabase:
        completion = None

        def complete(self, payload):
            self.completion = payload

    database = FakeDatabase()
    monkeypatch.setattr(tax_provider, "get_tax_provider_database", lambda: database)
    app = FastAPI()
    app.include_router(tax_provider.router, prefix="/api")
    raw_body = json.dumps(case, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    path = "/api/internal/tax-provider/completions"
    signature = hmac.new(
        secret.encode(),
        tax_provider._signed_message(timestamp, "POST", path, raw_body),
        hashlib.sha256,
    ).hexdigest()

    response = TestClient(app).post(
        path,
        content=raw_body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "X-Tax-Provider-Timestamp": timestamp,
            "X-Tax-Provider-Signature": f"v1={signature}",
            "X-Tax-Provider-Idempotency-Key": case["worker_request_id"],
        },
    )
    assert response.status_code == 200
    assert response.json()["committed"] is True
    assert database.completion.response_sha256 == case["response_sha256"]


def test_database_commands_bind_completion_to_immutable_request_identity() -> None:
    sql = (COMMAND_ROOT / "tax-provider-commands.sql").read_text(encoding="utf-8")
    for fragment in (
        '"read_request"',
        "expected_adapter_name",
        "expected_provider_request_id",
        "expected_request_sha256",
        "completion does not bind the canonical provider request",
        "transport_mode IS DISTINCT FROM request_doc#>>'{document,transport_mode}'",
        "vehicle_number IS DISTINCT FROM request_doc#>>'{document,vehicle_number}'",
        "SESSION_USER<>'erp_tax_provider'",
        "WHERE org_id=organization_id AND id=artifact_id FOR UPDATE",
        "WHERE artifact.org_id=organization_id AND artifact.id=artifact_id",
    ):
        assert fragment in sql


def test_disabled_provider_release_has_reviewed_manual_compliance_handling() -> None:
    audit_path = REPO / "backend/scripts/audit/tax_provider_operational_readiness.py"
    spec = importlib.util.spec_from_file_location("tax_provider_readiness_boundary", audit_path)
    assert spec and spec.loader
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    evidence = json.loads(
        (COMMAND_ROOT / "provider-operational-readiness.json").read_text(encoding="utf-8")
    )
    assert audit.blockers(evidence) == []
    evidence["release_compliance_handling"]["reviewed"] = False
    assert audit.blockers(evidence) == ["manual_compliance_handling_unreviewed"]


def test_render_declares_all_three_unique_provider_secrets() -> None:
    contract = json.loads(
        (REPO / "docs/architecture/runtime-environment-contract.json").read_text(
            encoding="utf-8"
        )
    )
    expected = {
        "TAX_PROVIDER_DATABASE_URL",
        "TAX_PROVIDER_INTERNAL_SERVICE_TOKEN",
        "TAX_PROVIDER_INTERNAL_HMAC_SECRET",
    }
    entries = {
        item["name"]: item
        for item in contract["variables"]
        if item["service"] == "backend_api" and item["name"] in expected
    }
    assert set(entries) == expected
    assert len({entry["semantic_id"] for entry in entries.values()}) == 3
    assert all(entry["secret"] is True for entry in entries.values())
    render = (REPO / "render.yaml").read_text(encoding="utf-8")
    provisioner = (REPO / "backend/scripts/provision_render_pilot.py").read_text(
        encoding="utf-8"
    )
    for name in expected:
        assert f"- key: {name}" in render
        assert f'"{name}"' in provisioner
