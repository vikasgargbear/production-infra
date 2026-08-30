from __future__ import annotations

import hashlib
import json
from pathlib import Path
import threading
import time
from uuid import uuid4

import httpx
import pytest

from migration_support.canonical_import import (
    BUNDLE_SCHEMA,
    CANDIDATE_BUNDLE_VERSION,
    CanonicalImportClient,
    CanonicalImportError,
    apply_bundle,
    audit_candidate_manifest,
    build_plan,
    load_import_bundle,
)


ORG_ID = "11111111-1111-4111-8111-111111111111"
PRODUCT_ID = "22222222-2222-4222-8222-222222222222"
COMMAND_ID = "33333333-3333-4333-8333-333333333333"


def _json_bytes(value: object) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _write_bundle(tmp_path: Path, operations: list[dict], **overrides) -> Path:
    source = {
        "bundle_version": "reviewed-marg-import-v1",
        "source_candidate_manifest_sha256": "a" * 64,
        "counts": {"ready": len(operations), "quarantined": 0},
    }
    source_bytes = _json_bytes(source) + b"\n"
    (tmp_path / "source-manifest.json").write_bytes(source_bytes)
    operations_bytes = b"".join(_json_bytes(item) + b"\n" for item in operations)
    (tmp_path / "operations.jsonl").write_bytes(operations_bytes)
    manifest = {
        "schema": BUNDLE_SCHEMA,
        "package_id": "marg-fy2026-test-001",
        "target_organization_id": ORG_ID,
        "source_manifest_file": "source-manifest.json",
        "source_manifest_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "operations_file": "operations.jsonl",
        "operations_sha256": hashlib.sha256(operations_bytes).hexdigest(),
        "counts": {"operations": len(operations), "quarantined": 0},
        "apply_allowed": True,
        **overrides,
    }
    (tmp_path / "manifest.json").write_bytes(_json_bytes(manifest) + b"\n")
    return tmp_path


def _product_operation() -> dict:
    return {
        "operation_id": "product-A00362-create",
        "source_record_id": str(uuid4()),
        "phase": 10,
        "mode": "direct",
        "method": "POST",
        "path": "/api/products/",
        "idempotency_key": "migration:marg:A00362:create",
        "payload": {
            "product_name": "Reviewed product",
            "generic_name": None,
            "product_kind": "medical_device",
        },
        "response_id_field": "product_id",
        "expected_statuses": [201],
        "readback": {
            "method": "GET",
            "path_template": "/api/products/{resource_id}",
            "expected": {"product_name": "Reviewed product"},
        },
    }


def test_candidate_manifest_remains_blocked_until_all_rows_are_ready(tmp_path: Path) -> None:
    path = tmp_path / "manifest.json"
    candidates = "record_id,state\n1,ready\n2,ready\n" + "".join(
        f"{index},quarantined\n" for index in range(3, 13)
    )
    candidate_path = tmp_path / "canonical-candidates.csv"
    candidate_path.write_text(candidates, encoding="utf-8")
    path.write_text(
        json.dumps(
            {
                "bundle_version": CANDIDATE_BUNDLE_VERSION,
                "apply_allowed": False,
                "write_policy": "dry_run_only",
                "candidate_csv_file": "canonical-candidates.csv",
                "candidate_csv_file_sha256": hashlib.sha256(
                    candidates.encode("utf-8")
                ).hexdigest(),
                "counts": {"records": 12, "ready": 2, "quarantined": 10},
                "record_types": {},
                "datasets": {},
            }
        ),
        encoding="utf-8",
    )

    result = audit_candidate_manifest(path)

    assert result["apply_allowed"] is False
    assert result["records"] == 12
    assert result["blockers"] == [
        "source manifest does not authorize apply",
        "10 records remain quarantined",
    ]


def test_bundle_and_plan_are_content_addressed(tmp_path: Path) -> None:
    bundle = load_import_bundle(_write_bundle(tmp_path, [_product_operation()]))

    plan = build_plan(bundle)

    assert plan["target_organization_id"] == ORG_ID
    assert plan["operation_count"] == 1
    assert plan["phase_counts"] == {"10": 1}
    assert len(plan["plan_sha256"]) == 64


def test_bundle_rejects_tampered_operations(tmp_path: Path) -> None:
    root = _write_bundle(tmp_path, [_product_operation()])
    with (root / "operations.jsonl").open("a", encoding="utf-8") as stream:
        stream.write("{}\n")

    with pytest.raises(CanonicalImportError, match="hash does not match"):
        load_import_bundle(root)


def test_bundle_rejects_arbitrary_mutation_paths(tmp_path: Path) -> None:
    operation = _product_operation()
    operation["path"] = "/api/auth/onboarding/organizations"

    with pytest.raises(CanonicalImportError, match="non-canonical path"):
        load_import_bundle(_write_bundle(tmp_path, [operation]))


def test_bundle_rejects_unregistered_prepared_commands(tmp_path: Path) -> None:
    operation = _product_operation()
    operation.update(
        {
            "mode": "prepared",
            "operation_key": "inventory.magic.prepare",
        }
    )
    operation.pop("method")
    operation.pop("path")

    with pytest.raises(CanonicalImportError, match="invalid key"):
        load_import_bundle(_write_bundle(tmp_path, [operation]))


def test_apply_binds_token_to_org_reconciles_and_resumes(tmp_path: Path) -> None:
    bundle = load_import_bundle(_write_bundle(tmp_path, [_product_operation()]))
    plan = build_plan(bundle)
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if request.url.path == "/ready":
            return httpx.Response(200, json={"status": "ready"})
        if request.url.path == "/api/auth/verify-token":
            return httpx.Response(200, json={"valid": True, "org_id": ORG_ID})
        if request.url.path == "/api/products/" and request.method == "POST":
            assert request.headers["x-idempotency-key"] == "migration:marg:A00362:create"
            return httpx.Response(201, json={"product_id": PRODUCT_ID})
        if request.url.path == f"/api/products/{PRODUCT_ID}":
            return httpx.Response(200, json={"product_name": "Reviewed product"})
        raise AssertionError(f"unexpected request {request.method} {request.url.path}")

    client = CanonicalImportClient(
        "https://api.example.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    receipt_path = tmp_path / "receipts" / "receipt.json"
    confirmation = f"APPLY-MIGRATION:{ORG_ID}:{plan['plan_sha256']}"
    try:
        first = apply_bundle(
            bundle,
            plan,
            client,
            confirmation=confirmation,
            receipt_path=receipt_path,
        )
        second = apply_bundle(
            bundle,
            plan,
            client,
            confirmation=confirmation,
            receipt_path=receipt_path,
        )
    finally:
        client.close()

    assert first["complete"] is True
    assert second == first
    assert calls.count(("POST", "/api/products/")) == 1
    assert receipt_path.stat().st_mode & 0o777 == 0o600


def test_apply_runs_independent_phase_operations_concurrently(tmp_path: Path) -> None:
    operations = []
    for index in range(6):
        operation = _product_operation()
        operation["operation_id"] = f"product-concurrent-{index}"
        operation["source_record_id"] = f"source-concurrent-{index}"
        operation["idempotency_key"] = f"migration:concurrent:{index}"
        operations.append(operation)
    bundle = load_import_bundle(_write_bundle(tmp_path, operations))
    plan = build_plan(bundle)
    lock = threading.Lock()
    active = 0
    maximum_active = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active, maximum_active
        if request.url.path == "/ready":
            return httpx.Response(200, json={"status": "ready"})
        if request.url.path == "/api/auth/verify-token":
            return httpx.Response(200, json={"valid": True, "org_id": ORG_ID})
        if request.url.path == "/api/products/" and request.method == "POST":
            with lock:
                active += 1
                maximum_active = max(maximum_active, active)
            time.sleep(0.02)
            with lock:
                active -= 1
            return httpx.Response(201, json={"product_id": PRODUCT_ID})
        if request.url.path == f"/api/products/{PRODUCT_ID}":
            return httpx.Response(200, json={"product_name": "Reviewed product"})
        raise AssertionError(request.url.path)

    client = CanonicalImportClient(
        "https://api.example.test", "token", transport=httpx.MockTransport(handler)
    )
    try:
        receipt = apply_bundle(
            bundle,
            plan,
            client,
            confirmation=f"APPLY-MIGRATION:{ORG_ID}:{plan['plan_sha256']}",
            receipt_path=tmp_path / "concurrent-receipt.json",
            workers=4,
        )
    finally:
        client.close()

    assert receipt["complete"] is True
    assert maximum_active > 1


def test_apply_refuses_token_for_another_organization(tmp_path: Path) -> None:
    bundle = load_import_bundle(_write_bundle(tmp_path, [_product_operation()]))
    plan = build_plan(bundle)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/ready":
            return httpx.Response(200, json={"status": "ready"})
        return httpx.Response(
            200,
            json={"valid": True, "org_id": "99999999-9999-4999-8999-999999999999"},
        )

    client = CanonicalImportClient(
        "https://api.example.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    try:
        with pytest.raises(CanonicalImportError, match="target organization"):
            apply_bundle(
                bundle,
                plan,
                client,
                confirmation=f"APPLY-MIGRATION:{ORG_ID}:{plan['plan_sha256']}",
                receipt_path=tmp_path / "receipt.json",
            )
    finally:
        client.close()


def test_prepared_command_uses_review_approve_execute_and_readback(tmp_path: Path) -> None:
    operation = {
        "operation_id": "opening-stock-command-1",
        "source_record_id": str(uuid4()),
        "phase": 30,
        "mode": "prepared",
        "operation_key": "inventory.adjustment.prepare",
        "idempotency_key": "migration:marg:opening-stock:1",
        "payload": {"branch_id": ORG_ID, "placeholder": "server validates real package"},
        "response_id_field": "resource_id",
        "expected_statuses": [200],
        "readback": {
            "method": "GET",
            "path_template": "/api/inventory/adjustments/{resource_id}",
            "expected": {"status": "posted"},
        },
    }
    bundle = load_import_bundle(_write_bundle(tmp_path, [operation]))
    plan = build_plan(bundle)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/ready":
            return httpx.Response(200, json={"status": "ready"})
        if request.url.path == "/api/auth/verify-token":
            return httpx.Response(200, json={"valid": True, "org_id": ORG_ID})
        if request.url.path.endswith("/inventory.adjustment.prepare/prepare"):
            return httpx.Response(
                200, json={"command_request_id": COMMAND_ID, "preview_hash": "b" * 64}
            )
        if request.url.path.endswith(f"/{COMMAND_ID}/approve"):
            return httpx.Response(200, json={"status": "approved"})
        if request.url.path.endswith(f"/{COMMAND_ID}/execute"):
            return httpx.Response(
                200, json={"status": "succeeded", "resource_id": PRODUCT_ID}
            )
        if request.url.path == f"/api/inventory/adjustments/{PRODUCT_ID}":
            return httpx.Response(200, json={"status": "posted"})
        raise AssertionError(request.url.path)

    client = CanonicalImportClient(
        "https://api.example.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    try:
        receipt = apply_bundle(
            bundle,
            plan,
            client,
            confirmation=f"APPLY-MIGRATION:{ORG_ID}:{plan['plan_sha256']}",
            receipt_path=tmp_path / "receipt.json",
        )
    finally:
        client.close()

    assert receipt["complete"] is True
    assert calls[-1] == f"/api/inventory/adjustments/{PRODUCT_ID}"


def test_product_setup_can_bind_server_ids_and_row_versions(tmp_path: Path) -> None:
    create = _product_operation()
    setup = {
        "operation_id": "product-A00362-setup",
        "source_record_id": str(uuid4()),
        "phase": 20,
        "mode": "direct",
        "method": "PUT",
        "path": "/api/products/{product_id}/setup",
        "idempotency_key": "migration:marg:A00362:setup",
        "depends_on": [create["operation_id"]],
        "bindings": {
            "product_id": {
                "from_operation": create["operation_id"],
                "response_field": "product_id",
            },
            "product_row_version": {
                "from_operation": create["operation_id"],
                "response_field": "row_version",
            },
        },
        "payload": {
            "row_version": "{{product_row_version}}",
            "manufacturer_party_id": "44444444-4444-4444-8444-444444444444",
            "base_uom_code": "PCS",
            "hsn_code": "9021",
            "pack_conversions": [],
            "ingredients": [],
        },
        "response_id_field": "product_id",
        "expected_statuses": [200],
        "readback": {
            "method": "GET",
            "path_template": "/api/products/{resource_id}",
            "expected": {"product_name": "Reviewed product"},
        },
    }
    bundle = load_import_bundle(_write_bundle(tmp_path, [setup, create]))
    plan = build_plan(bundle)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/ready":
            return httpx.Response(200, json={"status": "ready"})
        if request.url.path == "/api/auth/verify-token":
            return httpx.Response(200, json={"valid": True, "org_id": ORG_ID})
        if request.url.path == "/api/products/" and request.method == "POST":
            return httpx.Response(
                201, json={"product_id": PRODUCT_ID, "row_version": 1}
            )
        if request.url.path == f"/api/products/{PRODUCT_ID}/setup":
            assert json.loads(request.content)["row_version"] == 1
            return httpx.Response(
                200, json={"product_id": PRODUCT_ID, "row_version": 2}
            )
        if request.url.path == f"/api/products/{PRODUCT_ID}":
            return httpx.Response(200, json={"product_name": "Reviewed product"})
        raise AssertionError(request.url.path)

    client = CanonicalImportClient(
        "https://api.example.test",
        "token",
        transport=httpx.MockTransport(handler),
    )
    try:
        receipt = apply_bundle(
            bundle,
            plan,
            client,
            confirmation=f"APPLY-MIGRATION:{ORG_ID}:{plan['plan_sha256']}",
            receipt_path=tmp_path / "receipt.json",
        )
    finally:
        client.close()

    assert receipt["complete"] is True
    assert receipt["result_bindings"][create["operation_id"]] == {
        "product_id": PRODUCT_ID,
        "row_version": 1,
    }
