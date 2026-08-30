"""Hash-bound, organization-scoped canonical data import primitives.

The private extractor owns source decoding.  This module owns the application
boundary: it accepts only pre-reviewed canonical operations, verifies their
content identity, binds them to the authenticated ERP organization, and keeps
an idempotent local receipt so interrupted imports can resume safely.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Iterable, Mapping
from urllib.parse import quote
from uuid import UUID

import httpx

from app.domain.operator_actions.contract import ACTION_POLICIES


BUNDLE_SCHEMA = "aasopharma.canonical-import-bundle.v1"
PLAN_SCHEMA = "aasopharma.canonical-import-plan.v1"
RECEIPT_SCHEMA = "aasopharma.canonical-import-receipt.v1"
CANDIDATE_BUNDLE_VERSION = "marg-canonical-candidates-v1"
MAX_MANIFEST_BYTES = 1024 * 1024
MAX_OPERATIONS_BYTES = 512 * 1024 * 1024
PACKAGE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{7,127}$")
IDEMPOTENCY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")

DIRECT_MUTATION_PATHS = {
    ("POST", "/api/products/"),
    ("POST", "/api/customers/"),
    ("POST", "/api/suppliers/"),
    ("POST", "/api/products/setup-options/categories"),
    ("POST", "/api/products/setup-options/manufacturers"),
}
DIRECT_MUTATION_PATH_TEMPLATES = {
    ("PUT", "/api/products/{product_id}/setup"),
    ("POST", "/api/products/{product_id}/activate"),
}
DIRECT_MUTATION_RESOLVED_PATTERNS = (
    re.compile(r"^/api/products/([^/]+)/setup$"),
    re.compile(r"^/api/products/([^/]+)/activate$"),
)
TEMPLATE_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
RESPONSE_FIELD_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class CanonicalImportError(RuntimeError):
    """The import package or execution boundary failed closed."""


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path, *, maximum_bytes: int) -> str:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise CanonicalImportError(f"Required import file is unavailable: {path.name}") from exc
    if size <= 0 or size > maximum_bytes:
        raise CanonicalImportError(f"Import file size is invalid: {path.name}")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stage_idempotency_key(base: str, stage: str) -> str:
    candidate = f"{base}:{stage}"
    if len(candidate) <= 128:
        return candidate
    return f"migration:{hashlib.sha256(candidate.encode('utf-8')).hexdigest()}"


def _resolved_direct_path_allowed(method: str, path: str) -> bool:
    if (method, path) in DIRECT_MUTATION_PATHS:
        return True
    for pattern in DIRECT_MUTATION_RESOLVED_PATTERNS:
        match = pattern.fullmatch(path)
        if match is None:
            continue
        expected_method = "PUT" if path.endswith("/setup") else "POST"
        if method != expected_method:
            return False
        try:
            UUID(match.group(1))
        except ValueError:
            return False
        return True
    return False


def _required_text(mapping: Mapping[str, Any], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value or value != value.strip():
        raise CanonicalImportError(f"{key} is required and must be normalized")
    return value


def _uuid_text(mapping: Mapping[str, Any], key: str) -> str:
    value = _required_text(mapping, key)
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise CanonicalImportError(f"{key} is not a canonical UUID") from exc


def _read_json(path: Path, *, maximum_bytes: int) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise CanonicalImportError(f"Import JSON is unavailable: {path.name}") from exc
    if not raw or len(raw) > maximum_bytes:
        raise CanonicalImportError(f"Import JSON size is invalid: {path.name}")
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CanonicalImportError(f"Import JSON is malformed: {path.name}") from exc
    if not isinstance(value, dict):
        raise CanonicalImportError(f"Import JSON must be an object: {path.name}")
    return value


def audit_candidate_manifest(path: Path) -> dict[str, Any]:
    """Summarize an extractor candidate manifest without exposing row content."""

    manifest = _read_json(path, maximum_bytes=MAX_MANIFEST_BYTES)
    if manifest.get("bundle_version") != CANDIDATE_BUNDLE_VERSION:
        raise CanonicalImportError("Candidate manifest version is unsupported")
    counts = manifest.get("counts")
    if not isinstance(counts, dict):
        raise CanonicalImportError("Candidate manifest counts are missing")
    records = counts.get("records")
    ready = counts.get("ready")
    quarantined = counts.get("quarantined")
    if any(not isinstance(value, int) or value < 0 for value in (records, ready, quarantined)):
        raise CanonicalImportError("Candidate manifest counts are invalid")
    if ready + quarantined != records:
        raise CanonicalImportError("Candidate manifest counts do not reconcile")
    candidate_filename = _required_text(manifest, "candidate_csv_file")
    candidate_sha = _required_text(manifest, "candidate_csv_file_sha256")
    if (
        candidate_filename != Path(candidate_filename).name
        or candidate_filename != "canonical-candidates.csv"
        or SHA256_PATTERN.fullmatch(candidate_sha) is None
    ):
        raise CanonicalImportError("Candidate CSV identity is invalid")
    candidate_path = path.parent / candidate_filename
    observed_candidate_sha = _sha256_file(
        candidate_path, maximum_bytes=MAX_OPERATIONS_BYTES
    )
    if observed_candidate_sha != candidate_sha:
        raise CanonicalImportError("Candidate CSV hash does not match manifest")
    with candidate_path.open("rb") as stream:
        row_count = sum(
            chunk.count(b"\n")
            for chunk in iter(lambda: stream.read(1024 * 1024), b"")
        )
    if row_count != records + 1:
        raise CanonicalImportError("Candidate CSV row count does not match manifest")
    apply_allowed = manifest.get("apply_allowed") is True
    policy = manifest.get("write_policy")
    blockers: list[str] = []
    if not apply_allowed:
        blockers.append("source manifest does not authorize apply")
    if quarantined:
        blockers.append(f"{quarantined} records remain quarantined")
    if not isinstance(policy, str) or not policy:
        blockers.append("write policy is missing")
    return {
        "candidate_manifest_sha256": _sha256_file(
            path, maximum_bytes=MAX_MANIFEST_BYTES
        ),
        "candidate_csv_sha256": observed_candidate_sha,
        "records": records,
        "ready": ready,
        "quarantined": quarantined,
        "apply_allowed": apply_allowed and not blockers,
        "blockers": blockers,
        "record_types": manifest.get("record_types", {}),
        "datasets": manifest.get("datasets", {}),
    }


@dataclass(frozen=True)
class ImportOperation:
    operation_id: str
    source_record_id: str
    phase: int
    mode: str
    idempotency_key: str
    payload: Mapping[str, Any]
    method: str | None = None
    path: str | None = None
    operation_key: str | None = None
    response_id_field: str | None = None
    expected_statuses: tuple[int, ...] = (200, 201)
    readback: Mapping[str, Any] | None = None
    bindings: Mapping[str, Mapping[str, str]] | None = None
    depends_on: tuple[str, ...] = ()

    @classmethod
    def from_json(cls, value: Any, *, line_number: int) -> "ImportOperation":
        if not isinstance(value, dict):
            raise CanonicalImportError(f"Operation line {line_number} is not an object")
        operation_id = _required_text(value, "operation_id")
        source_record_id = _required_text(value, "source_record_id")
        idempotency_key = _required_text(value, "idempotency_key")
        if not IDEMPOTENCY_PATTERN.fullmatch(idempotency_key):
            raise CanonicalImportError(f"Operation {operation_id} has an invalid idempotency key")
        phase = value.get("phase")
        if not isinstance(phase, int) or phase < 1 or phase > 100:
            raise CanonicalImportError(f"Operation {operation_id} has an invalid phase")
        mode = value.get("mode")
        payload = value.get("payload")
        if mode not in {"direct", "prepared"} or not isinstance(payload, dict):
            raise CanonicalImportError(f"Operation {operation_id} has an invalid mode or payload")
        statuses = value.get("expected_statuses", [200, 201])
        if (
            not isinstance(statuses, list)
            or not statuses
            or any(not isinstance(item, int) or item < 200 or item > 299 for item in statuses)
        ):
            raise CanonicalImportError(f"Operation {operation_id} has invalid expected statuses")
        method = value.get("method")
        path = value.get("path")
        operation_key = value.get("operation_key")
        if mode == "direct":
            if not isinstance(method, str) or not isinstance(path, str):
                raise CanonicalImportError(f"Direct operation {operation_id} is incomplete")
            method = method.upper()
            if (
                (method, path) not in DIRECT_MUTATION_PATHS
                and (method, path) not in DIRECT_MUTATION_PATH_TEMPLATES
            ):
                raise CanonicalImportError(
                    f"Direct operation {operation_id} uses a non-canonical path"
                )
            if operation_key is not None:
                raise CanonicalImportError(f"Direct operation {operation_id} mixes command modes")
        else:
            if method is not None or path is not None:
                raise CanonicalImportError(f"Prepared operation {operation_id} mixes command modes")
            if (
                not isinstance(operation_key, str)
                or operation_key not in ACTION_POLICIES
                or not operation_key.endswith(".prepare")
            ):
                raise CanonicalImportError(f"Prepared operation {operation_id} has an invalid key")
        readback = value.get("readback")
        if readback is not None:
            if not isinstance(readback, dict):
                raise CanonicalImportError(f"Operation {operation_id} readback is invalid")
            readback_method = readback.get("method", "GET")
            readback_path = readback.get("path_template")
            if (
                readback_method != "GET"
                or not isinstance(readback_path, str)
                or not readback_path.startswith("/api/")
            ):
                raise CanonicalImportError(
                    f"Operation {operation_id} readback is not a canonical GET"
                )
        raw_bindings = value.get("bindings", {})
        if not isinstance(raw_bindings, dict):
            raise CanonicalImportError(f"Operation {operation_id} bindings are invalid")
        bindings: dict[str, dict[str, str]] = {}
        for name, binding in raw_bindings.items():
            if not isinstance(name, str) or TEMPLATE_NAME_PATTERN.fullmatch(name) is None:
                raise CanonicalImportError(f"Operation {operation_id} binding name is invalid")
            if not isinstance(binding, dict) or set(binding) != {
                "from_operation",
                "response_field",
            }:
                raise CanonicalImportError(f"Operation {operation_id} binding is invalid")
            from_operation = binding.get("from_operation")
            response_field = binding.get("response_field")
            if (
                not isinstance(from_operation, str)
                or not from_operation
                or not isinstance(response_field, str)
                or RESPONSE_FIELD_PATTERN.fullmatch(response_field) is None
            ):
                raise CanonicalImportError(f"Operation {operation_id} binding source is invalid")
            bindings[name] = {
                "from_operation": from_operation,
                "response_field": response_field,
            }
        depends_on = value.get("depends_on", [])
        if (
            not isinstance(depends_on, list)
            or any(not isinstance(item, str) or not item for item in depends_on)
            or len(depends_on) != len(set(depends_on))
        ):
            raise CanonicalImportError(f"Operation {operation_id} dependencies are invalid")
        binding_sources = {item["from_operation"] for item in bindings.values()}
        if not binding_sources.issubset(set(depends_on)):
            raise CanonicalImportError(
                f"Operation {operation_id} binding dependencies are incomplete"
            )
        return cls(
            operation_id=operation_id,
            source_record_id=source_record_id,
            phase=phase,
            mode=mode,
            idempotency_key=idempotency_key,
            payload=payload,
            method=method,
            path=path,
            operation_key=operation_key,
            response_id_field=value.get("response_id_field"),
            expected_statuses=tuple(statuses),
            readback=readback,
            bindings=bindings,
            depends_on=tuple(depends_on),
        )


@dataclass(frozen=True)
class ImportBundle:
    directory: Path
    package_id: str
    target_organization_id: str
    source_manifest_sha256: str
    operations_sha256: str
    manifest_sha256: str
    operations: tuple[ImportOperation, ...]


def load_import_bundle(directory: Path) -> ImportBundle:
    root = directory.resolve()
    manifest_path = root / "manifest.json"
    manifest = _read_json(manifest_path, maximum_bytes=MAX_MANIFEST_BYTES)
    if manifest.get("schema") != BUNDLE_SCHEMA:
        raise CanonicalImportError("Import bundle schema is unsupported")
    if manifest.get("apply_allowed") is not True:
        raise CanonicalImportError("Import bundle is not approved for apply")
    counts = manifest.get("counts")
    if not isinstance(counts, dict) or counts.get("quarantined") != 0:
        raise CanonicalImportError("Import bundle still contains quarantined records")
    package_id = _required_text(manifest, "package_id")
    if not PACKAGE_ID_PATTERN.fullmatch(package_id):
        raise CanonicalImportError("Import package_id is invalid")
    target_org = _uuid_text(manifest, "target_organization_id")
    source_sha = _required_text(manifest, "source_manifest_sha256")
    operations_sha = _required_text(manifest, "operations_sha256")
    if not SHA256_PATTERN.fullmatch(source_sha) or not SHA256_PATTERN.fullmatch(operations_sha):
        raise CanonicalImportError("Import bundle hashes are invalid")
    source_filename = _required_text(manifest, "source_manifest_file")
    if source_filename != Path(source_filename).name or source_filename != "source-manifest.json":
        raise CanonicalImportError("Import source manifest filename is invalid")
    if _sha256_file(root / source_filename, maximum_bytes=MAX_MANIFEST_BYTES) != source_sha:
        raise CanonicalImportError("Import source manifest hash does not match bundle")
    filename = _required_text(manifest, "operations_file")
    if filename != Path(filename).name or filename != "operations.jsonl":
        raise CanonicalImportError("Import operations filename is invalid")
    operations_path = root / filename
    observed_operations_sha = _sha256_file(
        operations_path, maximum_bytes=MAX_OPERATIONS_BYTES
    )
    if observed_operations_sha != operations_sha:
        raise CanonicalImportError("Import operations hash does not match manifest")
    operations: list[ImportOperation] = []
    seen_ids: set[str] = set()
    seen_keys: set[str] = set()
    with operations_path.open("r", encoding="utf-8", newline="") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                raise CanonicalImportError(f"Operation line {line_number} is empty")
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as exc:
                raise CanonicalImportError(f"Operation line {line_number} is malformed") from exc
            operation = ImportOperation.from_json(raw, line_number=line_number)
            if operation.operation_id in seen_ids:
                raise CanonicalImportError(f"Duplicate operation_id: {operation.operation_id}")
            if operation.idempotency_key in seen_keys:
                raise CanonicalImportError(
                    f"Duplicate idempotency key: {operation.idempotency_key}"
                )
            seen_ids.add(operation.operation_id)
            seen_keys.add(operation.idempotency_key)
            operations.append(operation)
    expected_count = counts.get("operations")
    if not isinstance(expected_count, int) or expected_count != len(operations):
        raise CanonicalImportError("Import operation count does not match manifest")
    if not operations:
        raise CanonicalImportError("Import bundle contains no operations")
    by_id = {item.operation_id: item for item in operations}
    for operation in operations:
        for dependency in operation.depends_on:
            source = by_id.get(dependency)
            if source is None:
                raise CanonicalImportError(
                    f"Operation {operation.operation_id} has an unknown dependency"
                )
            if source.phase >= operation.phase:
                raise CanonicalImportError(
                    f"Operation {operation.operation_id} dependency phase is not earlier"
                )
    return ImportBundle(
        directory=root,
        package_id=package_id,
        target_organization_id=target_org,
        source_manifest_sha256=source_sha,
        operations_sha256=operations_sha,
        manifest_sha256=_sha256_file(manifest_path, maximum_bytes=MAX_MANIFEST_BYTES),
        operations=tuple(sorted(operations, key=lambda item: (item.phase, item.operation_id))),
    )


def build_plan(bundle: ImportBundle) -> dict[str, Any]:
    phase_counts: dict[str, int] = {}
    for operation in bundle.operations:
        phase_counts[str(operation.phase)] = phase_counts.get(str(operation.phase), 0) + 1
    plan: dict[str, Any] = {
        "schema": PLAN_SCHEMA,
        "package_id": bundle.package_id,
        "target_organization_id": bundle.target_organization_id,
        "source_manifest_sha256": bundle.source_manifest_sha256,
        "bundle_manifest_sha256": bundle.manifest_sha256,
        "operations_sha256": bundle.operations_sha256,
        "operation_count": len(bundle.operations),
        "phase_counts": phase_counts,
        "operation_ids_sha256": _sha256_bytes(
            _canonical_json([item.operation_id for item in bundle.operations])
        ),
        "requires_confirmation": True,
    }
    plan["plan_sha256"] = _sha256_bytes(_canonical_json(plan))
    return plan


def verify_plan(plan: Mapping[str, Any], bundle: ImportBundle) -> str:
    if plan.get("schema") != PLAN_SCHEMA:
        raise CanonicalImportError("Import plan schema is invalid")
    supplied_sha = _required_text(plan, "plan_sha256")
    unsigned = dict(plan)
    unsigned.pop("plan_sha256", None)
    if (
        not SHA256_PATTERN.fullmatch(supplied_sha)
        or _sha256_bytes(_canonical_json(unsigned)) != supplied_sha
    ):
        raise CanonicalImportError("Import plan content hash is invalid")
    expected = build_plan(bundle)
    if dict(plan) != expected:
        raise CanonicalImportError("Import plan differs from the current bundle")
    return supplied_sha


class CanonicalImportClient:
    def __init__(self, base_url: str, access_token: str, *, transport=None):
        if not base_url.startswith("https://"):
            raise CanonicalImportError("Canonical import requires an HTTPS API origin")
        if not access_token or "\n" in access_token or "\r" in access_token:
            raise CanonicalImportError("ERP access token is missing or malformed")
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def verify_boundary(self, target_organization_id: str) -> dict[str, Any]:
        ready = self._client.get("/ready")
        if ready.status_code != 200:
            raise CanonicalImportError("Canonical API is not ready")
        token = self._client.get("/api/auth/verify-token")
        if token.status_code != 200:
            raise CanonicalImportError("ERP access token is not valid")
        value = token.json()
        if value.get("valid") is not True or value.get("org_id") != target_organization_id:
            raise CanonicalImportError("ERP token is not bound to the target organization")
        return {"ready": True, "organization_id": target_organization_id}

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        expected_statuses: Iterable[int] = (200,),
        allow_list: bool = False,
    ) -> dict[str, Any] | list[Any]:
        headers = {"X-Idempotency-Key": idempotency_key} if idempotency_key else None
        try:
            response = self._client.request(method, path, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise CanonicalImportError("Canonical API request did not complete") from exc
        if response.status_code not in set(expected_statuses):
            raise CanonicalImportError(
                f"Canonical operation failed with HTTP {response.status_code}"
            )
        try:
            value = response.json()
        except ValueError as exc:
            raise CanonicalImportError("Canonical operation returned non-JSON") from exc
        if not isinstance(value, dict) and not (allow_list and isinstance(value, list)):
            raise CanonicalImportError("Canonical operation returned an invalid body")
        return value

    def execute(self, operation: ImportOperation) -> dict[str, Any]:
        if operation.mode == "direct":
            if not _resolved_direct_path_allowed(
                operation.method or "", operation.path or ""
            ):
                raise CanonicalImportError("Resolved direct operation path is not canonical")
            return self._request_json(
                operation.method or "",
                operation.path or "",
                body=operation.payload,
                idempotency_key=operation.idempotency_key,
                expected_statuses=operation.expected_statuses,
            )
        payload = dict(operation.payload)
        payload["idempotency_key"] = operation.idempotency_key
        prepared = self._request_json(
            "POST",
            f"/api/web/actions/{quote(operation.operation_key or '', safe='')}/prepare",
            body=payload,
            expected_statuses=(200,),
        )
        command_id = _uuid_text(prepared, "command_request_id")
        preview_hash = _required_text(prepared, "preview_hash")
        approval = self._request_json(
            "POST",
            f"/api/web/actions/commands/{command_id}/approve",
            body={
                "preview_hash": preview_hash,
                "idempotency_key": _stage_idempotency_key(
                    operation.idempotency_key, "approve"
                ),
            },
            expected_statuses=(200,),
        )
        if approval.get("status") not in {"approved", "succeeded"}:
            raise CanonicalImportError("Canonical command did not reach approved state")
        if approval.get("status") == "succeeded":
            return approval
        return self._request_json(
            "POST",
            f"/api/web/actions/commands/{command_id}/execute",
            body={
                "preview_hash": preview_hash,
                "idempotency_key": _stage_idempotency_key(
                    operation.idempotency_key, "execute"
                ),
            },
            expected_statuses=(200,),
        )

    def reconcile(self, operation: ImportOperation, result: Mapping[str, Any]) -> None:
        if operation.readback is None:
            raise CanonicalImportError(f"Operation {operation.operation_id} lacks readback")
        field = operation.response_id_field
        if not isinstance(field, str) or not isinstance(result.get(field), str):
            raise CanonicalImportError(f"Operation {operation.operation_id} lacks a resource ID")
        resource_id = str(UUID(result[field]))
        path = str(operation.readback["path_template"]).replace("{resource_id}", resource_id)
        if "{" in path or "}" in path or not path.startswith("/api/"):
            raise CanonicalImportError(
                f"Operation {operation.operation_id} readback path is invalid"
            )
        response = self._request_json(
            "GET", path, expected_statuses=(200,), allow_list=True
        )
        expected = operation.readback.get("expected", {})
        if not isinstance(expected, dict):
            raise CanonicalImportError(f"Operation {operation.operation_id} readback differs")
        if isinstance(response, list):
            matches = [
                item
                for item in response
                if isinstance(item, dict)
                and item.get(field) == resource_id
                and all(item.get(key) == value for key, value in expected.items())
            ]
            if len(matches) != 1:
                raise CanonicalImportError(
                    f"Operation {operation.operation_id} readback differs"
                )
            return
        if any(response.get(key) != value for key, value in expected.items()):
            raise CanonicalImportError(f"Operation {operation.operation_id} readback differs")


def _replace_binding_values(value: Any, bindings: Mapping[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _replace_binding_values(item, bindings) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_binding_values(item, bindings) for item in value]
    if isinstance(value, str):
        match = re.fullmatch(r"\{\{([a-z][a-z0-9_]{0,63})\}\}", value)
        if match:
            name = match.group(1)
            if name not in bindings:
                raise CanonicalImportError(f"Import binding is unresolved: {name}")
            return bindings[name]
        rendered = value
        for name, replacement in bindings.items():
            rendered = rendered.replace(f"{{{{{name}}}}}", str(replacement))
        if "{{" in rendered or "}}" in rendered:
            raise CanonicalImportError("Import string contains an unresolved binding")
        return rendered
    return value


def _materialize_operation(
    operation: ImportOperation, result_bindings: Mapping[str, Mapping[str, Any]]
) -> ImportOperation:
    values: dict[str, Any] = {}
    for name, binding in (operation.bindings or {}).items():
        source = result_bindings.get(binding["from_operation"], {})
        field = binding["response_field"]
        if field not in source:
            raise CanonicalImportError(
                f"Operation {operation.operation_id} dependency result is incomplete"
            )
        values[name] = source[field]
    resolved_path = operation.path
    if resolved_path is not None:
        for name, value in values.items():
            resolved_path = resolved_path.replace(f"{{{name}}}", str(value))
        if "{" in resolved_path or "}" in resolved_path:
            raise CanonicalImportError(
                f"Operation {operation.operation_id} path binding is unresolved"
            )
    return replace(
        operation,
        payload=_replace_binding_values(dict(operation.payload), values),
        path=resolved_path,
    )


def apply_bundle(
    bundle: ImportBundle,
    plan: Mapping[str, Any],
    client: CanonicalImportClient,
    *,
    confirmation: str,
    receipt_path: Path,
    workers: int = 1,
) -> dict[str, Any]:
    if workers < 1 or workers > 32:
        raise CanonicalImportError("Import workers must be between 1 and 32")
    plan_sha = verify_plan(plan, bundle)
    expected_confirmation = f"APPLY-MIGRATION:{bundle.target_organization_id}:{plan_sha}"
    if confirmation != expected_confirmation:
        raise CanonicalImportError("Import confirmation does not match the exact plan")
    client.verify_boundary(bundle.target_organization_id)
    completed: list[str] = []
    result_bindings: dict[str, dict[str, Any]] = {}
    required_response_fields: dict[str, set[str]] = {}
    for operation in bundle.operations:
        for binding in (operation.bindings or {}).values():
            required_response_fields.setdefault(binding["from_operation"], set()).add(
                binding["response_field"]
            )
    if receipt_path.exists():
        prior = _read_json(receipt_path, maximum_bytes=MAX_MANIFEST_BYTES)
        supplied_receipt_sha = prior.get("receipt_sha256")
        unsigned_receipt = dict(prior)
        unsigned_receipt.pop("receipt_sha256", None)
        if (
            prior.get("schema") != RECEIPT_SCHEMA
            or prior.get("plan_sha256") != plan_sha
            or not isinstance(prior.get("completed_operation_ids"), list)
            or not isinstance(prior.get("result_bindings"), dict)
            or not isinstance(supplied_receipt_sha, str)
            or _sha256_bytes(_canonical_json(unsigned_receipt)) != supplied_receipt_sha
        ):
            raise CanonicalImportError("Existing import receipt belongs to another plan")
        completed = list(prior["completed_operation_ids"])
        result_bindings = {
            str(operation_id): dict(values)
            for operation_id, values in prior["result_bindings"].items()
            if isinstance(values, dict)
        }
    completed_set = set(completed)

    def execute_one(operation: ImportOperation) -> tuple[ImportOperation, dict[str, Any]]:
        materialized = _materialize_operation(operation, result_bindings)
        result = client.execute(materialized)
        client.reconcile(materialized, result)
        retained: dict[str, Any] = {}
        for field in required_response_fields.get(operation.operation_id, set()):
            value = result.get(field)
            if not isinstance(value, (str, int, bool)) or isinstance(value, float):
                raise CanonicalImportError(
                    f"Operation {operation.operation_id} binding field is missing"
                )
            retained[field] = value
        return operation, retained

    def record_completion(operation: ImportOperation, retained: dict[str, Any]) -> None:
        result_bindings[operation.operation_id] = retained
        completed.append(operation.operation_id)
        completed_set.add(operation.operation_id)
        receipt = {
            "schema": RECEIPT_SCHEMA,
            "package_id": bundle.package_id,
            "target_organization_id": bundle.target_organization_id,
            "plan_sha256": plan_sha,
            "operation_count": len(bundle.operations),
            "completed_operation_ids": completed,
            "result_bindings": result_bindings,
            "complete": len(completed) == len(bundle.operations),
        }
        receipt["receipt_sha256"] = _sha256_bytes(_canonical_json(receipt))
        receipt_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = receipt_path.with_name(f".{receipt_path.name}.tmp")
        temporary.write_bytes(_canonical_json(receipt) + b"\n")
        temporary.chmod(0o600)
        os.replace(temporary, receipt_path)
        receipt_path.chmod(0o600)

    phases = sorted({operation.phase for operation in bundle.operations})
    for phase in phases:
        pending = [
            operation
            for operation in bundle.operations
            if operation.phase == phase and operation.operation_id not in completed_set
        ]
        if not pending:
            continue
        if workers == 1 or len(pending) == 1:
            for operation in pending:
                finished, retained = execute_one(operation)
                record_completion(finished, retained)
            continue
        failures: list[BaseException] = []
        with ThreadPoolExecutor(max_workers=min(workers, len(pending))) as executor:
            futures = {executor.submit(execute_one, operation): operation for operation in pending}
            for future in as_completed(futures):
                try:
                    finished, retained = future.result()
                except BaseException as exc:  # preserve resumable successes before failing closed
                    failures.append(exc)
                    continue
                record_completion(finished, retained)
        if failures:
            raise failures[0]
    return _read_json(receipt_path, maximum_bytes=MAX_MANIFEST_BYTES)
