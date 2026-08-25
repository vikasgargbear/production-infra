#!/usr/bin/env python3
"""Capture and validate exact-SHA canonical application promotion evidence.

The checked-in promotion manifest is a reviewed release record, not a CI scratch
file.  This tool writes immutable JSON artifacts or a candidate manifest to an
operator-selected directory.  It never changes application-contract or schema
readiness decisions.
"""

from __future__ import annotations

import argparse
import ast
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import inspect
import json
from pathlib import Path
import re
import subprocess
import sys
import textwrap
from typing import Any, Iterable, Mapping
from urllib.parse import urlsplit


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
CANONICAL_STAGING_PROJECT_REF = "rgihahbmkrmhitjdjvev"
RETIRED_SOURCE_PROJECT_REF = "jfrairkkzxwkhbtqejnz"
SCHEMA_VERSION = "2.0.0"
GIT_SHA = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PREVIEW_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
ARTIFACT_DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
SQL_RELATION = re.compile(
    r"(?i)\b(?:from|join|update|into|delete\s+from)\s+"
    r"((?:analytics|compliance|financial|gst|inventory|master|parties|"
    r"procurement|public|sales|system_config|payroll)\.[a-z_][a-z0-9_]*)"
)
RENDER_SERVICE_NAMES = {
    "aasopharma-api-pilot",
    "aasopharma-erp-pilot",
    "aasopharma-mcp-pilot",
}
RENDER_SERVICE_ROLES = {
    "aasopharma-api-pilot": "api",
    "aasopharma-erp-pilot": "frontend",
    "aasopharma-mcp-pilot": "mcp",
}
RAILWAY_SERVICE_NAMES = {"api", "frontend", "mcp"}
DEPLOYMENT_PROVIDERS = {"render", "railway"}
UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
LIVE18_MATRIX_PATH = (
    REPOSITORY_ROOT / "backend" / "tests" / "live_acceptance" / "operation_matrix.json"
)
CANONICAL_SCHEMAS = (
    "automation",
    "calculation",
    "catalog",
    "compliance",
    "core",
    "finance",
    "hr",
    "inventory",
    "parties",
    "procurement",
    "sales",
    "tax",
)


class EvidenceError(ValueError):
    """A fail-closed evidence contract violation."""


def _load_json(path: Path) -> dict[str, Any]:
    def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise EvidenceError(f"duplicate JSON key in {path}: {key}")
            result[key] = value
        return result

    with path.open(encoding="utf-8") as handle:
        value = json.load(handle, object_pairs_hook=reject_duplicates)
    if not isinstance(value, dict):
        raise EvidenceError(f"{path} must contain a JSON object")
    return value


def _write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_json_bytes(value))


def _json_bytes(value: Mapping[str, Any]) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build_reset_attestation(
    *,
    project_ref: str,
    git_commit: str,
    reviewed_deploy_sha: str,
    workflow_repository: str,
    workflow_run_id: int,
    workflow_run_attempt: int,
    reset_completed_at: str,
) -> dict[str, Any]:
    """Build the immutable receipt for a completed disposable staging reset."""

    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise EvidenceError("reset attestation is restricted to canonical staging")
    git_commit = _exact_sha(git_commit, "reset git_commit")
    reviewed_deploy_sha = _exact_sha(
        reviewed_deploy_sha, "reset reviewed_deploy_sha"
    )
    if not re.fullmatch(r"[^/\s]+/[^/\s]+", workflow_repository):
        raise EvidenceError("reset workflow repository must be owner/name")
    if workflow_run_id <= 0 or workflow_run_attempt <= 0:
        raise EvidenceError("reset workflow run identity must be positive")
    completed_at = _timestamp(reset_completed_at, "reset_completed_at")
    workflow_url = (
        f"https://github.com/{workflow_repository}/actions/runs/{workflow_run_id}"
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "evidence_kind": "canonical_staging_reset",
        "payload": {
            "project_ref": project_ref,
            "git_commit": git_commit,
            "reviewed_deploy_sha": reviewed_deploy_sha,
            "workflow_run_id": workflow_run_id,
            "workflow_run_attempt": workflow_run_attempt,
            "workflow_run_url": workflow_url,
            "reset_completed_at": completed_at,
            "reset_scope": "canonical_schemas_and_isolated_roles",
            "retired_source_accessed": False,
            "auth_schema_preserved": True,
            "alembic_version_removed": True,
            "canonical_schema_count_after_reset": 0,
        },
    }


def _timestamp(value: Any, label: str) -> str:
    text = str(value)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise EvidenceError(f"{label} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise EvidenceError(f"{label} must include a timezone")
    return text


def _exact_sha(value: Any, label: str) -> str:
    text = str(value).lower()
    if not GIT_SHA.fullmatch(text):
        raise EvidenceError(f"{label} must be an exact 40-character git SHA")
    return text


def _verify_render_evidence(
    render_evidence: Mapping[str, Any], expected_sha: str
) -> dict[str, Any]:
    if render_evidence.get("commit_sha") != expected_sha:
        raise EvidenceError("Render evidence is not bound to the reviewed commit")
    services = render_evidence.get("services")
    if not isinstance(services, dict) or set(services) != RENDER_SERVICE_NAMES:
        raise EvidenceError("Render evidence must identify exactly the three pilot services")
    normalized: dict[str, Any] = {}
    for name in sorted(RENDER_SERVICE_NAMES):
        row = services.get(name)
        if not isinstance(row, dict):
            raise EvidenceError(f"Render service evidence is invalid for {name}")
        if row.get("status") != "live" or row.get("commit_sha") != expected_sha:
            raise EvidenceError(f"Render service {name} is not live on the reviewed commit")
        if not all(isinstance(row.get(field), str) and row[field] for field in (
            "service_id", "deploy_id", "url"
        )):
            raise EvidenceError(f"Render service {name} lacks immutable deployment identity")
        normalized_row = {
            field: row[field]
            for field in ("service_id", "deploy_id", "status", "commit_sha", "url")
        }
        normalized_row["url"] = _https_origin(row["url"], f"Render service {name}")
        normalized_row["service_name"] = name
        normalized[RENDER_SERVICE_ROLES[name]] = normalized_row
    return normalized


def _https_origin(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise EvidenceError(f"{label} must be an HTTPS URL")
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise EvidenceError(f"{label} must be an HTTPS origin without credentials")
    return value.rstrip("/")


def _verify_railway_evidence(
    railway_evidence: Mapping[str, Any], expected_sha: str
) -> dict[str, Any]:
    if railway_evidence.get("provider") != "railway":
        raise EvidenceError("Railway evidence has the wrong provider")
    if railway_evidence.get("git_commit") != expected_sha:
        raise EvidenceError("Railway evidence is not bound to the reviewed commit")
    if railway_evidence.get("status") != "live":
        raise EvidenceError("Railway evidence is not live")
    services = railway_evidence.get("services")
    if not isinstance(services, dict) or set(services) != RAILWAY_SERVICE_NAMES:
        raise EvidenceError("Railway evidence must identify exactly api, frontend, and mcp")
    normalized: dict[str, Any] = {}
    origins: set[str] = set()
    expected_health = {"api": "healthy", "frontend": "ok", "mcp": "ok"}
    for name in sorted(RAILWAY_SERVICE_NAMES):
        row = services.get(name)
        if not isinstance(row, dict):
            raise EvidenceError(f"Railway service evidence is invalid for {name}")
        deployment_id = row.get("deployment_id")
        if not isinstance(deployment_id, str) or UUID.fullmatch(deployment_id) is None:
            raise EvidenceError(f"Railway service {name} lacks immutable deployment identity")
        origin = _https_origin(row.get("url"), f"Railway service {name}")
        if origin in origins:
            raise EvidenceError("Railway service origins must be distinct")
        origins.add(origin)
        if row.get("health") != expected_health[name]:
            raise EvidenceError(f"Railway service {name} is not healthy")
        if name in {"api", "mcp"} and row.get("readiness") != "ready":
            raise EvidenceError(f"Railway service {name} is not ready")
        normalized[name] = {
            "deployment_id": deployment_id,
            "url": origin,
            "health": row["health"],
            **({"readiness": row["readiness"]} if name in {"api", "mcp"} else {}),
        }
    return normalized


def _verify_deployment_evidence(
    deployment_evidence: Mapping[str, Any], expected_sha: str
) -> tuple[str, dict[str, Any]]:
    provider = deployment_evidence.get("provider")
    if provider == "railway":
        return provider, _verify_railway_evidence(deployment_evidence, expected_sha)
    if provider == "render":
        return provider, _verify_render_evidence(deployment_evidence, expected_sha)
    raise EvidenceError("Deployment evidence has an unsupported provider")


def _verify_normalized_deployment_binding(binding: Mapping[str, Any]) -> None:
    provider = binding.get("deployment_provider")
    services = binding.get("deployment_services")
    if not isinstance(services, dict):
        raise EvidenceError("promotion artifacts lack deployment services")
    if provider == "railway":
        if set(services) != RAILWAY_SERVICE_NAMES:
            raise EvidenceError("Railway binding has the wrong service set")
        origins: set[str] = set()
        expected_health = {"api": "healthy", "frontend": "ok", "mcp": "ok"}
        for name, row in services.items():
            if not isinstance(row, dict):
                raise EvidenceError("Railway binding has invalid service evidence")
            if not isinstance(row.get("deployment_id"), str) or UUID.fullmatch(row["deployment_id"]) is None:
                raise EvidenceError("Railway binding lacks immutable deployment identity")
            origin = _https_origin(row.get("url"), f"Railway binding {name}")
            if origin in origins or row.get("health") != expected_health[name]:
                raise EvidenceError("Railway binding has unhealthy or duplicate services")
            origins.add(origin)
            if name in {"api", "mcp"} and row.get("readiness") != "ready":
                raise EvidenceError("Railway binding service is not ready")
    elif provider == "render":
        if set(services) != RAILWAY_SERVICE_NAMES or {
            row.get("service_name") for row in services.values() if isinstance(row, dict)
        } != RENDER_SERVICE_NAMES:
            raise EvidenceError("Render binding has the wrong service set")
        for name, row in services.items():
            if not isinstance(row, dict) or row.get("status") != "live":
                raise EvidenceError(f"Render binding is invalid for {name}")
            if row.get("commit_sha") != binding.get("git_commit"):
                raise EvidenceError(f"Render binding is stale for {name}")
            if not all(isinstance(row.get(field), str) and row[field] for field in ("service_id", "deploy_id")):
                raise EvidenceError(f"Render binding lacks immutable identity for {name}")
            _https_origin(row.get("url"), f"Render binding {name}")
    else:
        raise EvidenceError("promotion artifacts lack a supported deployment provider")


def build_binding(
    *, project_ref: str, git_commit: str, deployment_evidence: Mapping[str, Any],
    deployment_evidence_sha256: str, deployment_artifact_id: int,
    deployment_artifact_digest: str,
) -> dict[str, Any]:
    git_commit = _exact_sha(git_commit, "git_commit")
    if project_ref != CANONICAL_STAGING_PROJECT_REF:
        raise EvidenceError(
            f"refusing promotion evidence for project {project_ref!r}; only disposable canonical staging is allowed"
        )
    if project_ref == RETIRED_SOURCE_PROJECT_REF:
        raise EvidenceError("retired Supabase project evidence is forbidden")
    if SHA256.fullmatch(deployment_evidence_sha256) is None:
        raise EvidenceError("deployment evidence must provide a lowercase SHA-256")
    if deployment_artifact_id <= 0 or ARTIFACT_DIGEST.fullmatch(deployment_artifact_digest) is None:
        raise EvidenceError("deployment artifact identity or digest is invalid")
    provider, services = _verify_deployment_evidence(deployment_evidence, git_commit)
    return {
        "project_ref": project_ref,
        "git_commit": git_commit,
        "deployment_provider": provider,
        "deployed_sha": git_commit,
        "deployment_evidence_sha256": deployment_evidence_sha256,
        "deployment_artifact_id": deployment_artifact_id,
        "deployment_artifact_digest": deployment_artifact_digest,
        "deployment_services": services,
    }


def _artifact(
    kind: str, binding: Mapping[str, Any], payload: Mapping[str, Any]
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "evidence_kind": kind,
        "binding": dict(binding),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "payload": dict(payload),
    }


def wrap_reviewed_input(
    *,
    kind: str,
    input_path: Path,
    binding: Mapping[str, Any],
    repository_root: Path = REPOSITORY_ROOT,
) -> dict[str, Any]:
    value = _load_json(input_path)
    if value.get("state") != "reviewed":
        raise EvidenceError(f"{kind} input has not been reviewed")
    _timestamp(value.get("reviewed_at"), f"{kind}.reviewed_at")
    if not isinstance(value.get("reviewer"), str) or not value["reviewer"].strip():
        raise EvidenceError(f"{kind}.reviewer is required")
    if kind == "source_disposition":
        required = {
            "strategy": "reset",
            "source_identifier": CANONICAL_STAGING_PROJECT_REF,
            "retired_source_accessed": False,
            "disposable_staging_reset_verified": True,
        }
        if any(value.get(key) != expected for key, expected in required.items()):
            raise EvidenceError(
                "source disposition must be a verified canonical-staging reset with no retired-project access"
            )
        reset_run = value.get("reset_workflow_run_url")
        if not isinstance(reset_run, str) or not re.fullmatch(
            r"https://github\.com/[^/]+/[^/]+/actions/runs/[0-9]+", reset_run
        ):
            raise EvidenceError("source disposition requires the exact staging reset workflow run URL")
        if not SHA256.fullmatch(str(value.get("reset_artifact_sha256", ""))):
            raise EvidenceError("source disposition requires the reset artifact SHA-256")
        _timestamp(value.get("reset_completed_at"), "source_disposition.reset_completed_at")
        reset_artifact_value = value.get("reset_attestation_artifact")
        if (
            not isinstance(reset_artifact_value, str)
            or not reset_artifact_value
            or Path(reset_artifact_value).is_absolute()
        ):
            raise EvidenceError(
                "source disposition requires a repository-relative reset attestation"
            )
        reset_artifact_path = (repository_root / reset_artifact_value).resolve()
        try:
            reset_artifact_path.relative_to(repository_root.resolve())
        except ValueError as exc:
            raise EvidenceError("reset attestation escapes the repository") from exc
        if not reset_artifact_path.is_file():
            raise EvidenceError("source disposition reset attestation does not exist")
        if _sha256(reset_artifact_path) != value["reset_artifact_sha256"]:
            raise EvidenceError("source disposition reset attestation hash differs")
        reset_attestation = _load_json(reset_artifact_path)
        reset_payload = reset_attestation.get("payload")
        if (
            reset_attestation.get("schema_version") != SCHEMA_VERSION
            or reset_attestation.get("evidence_kind") != "canonical_staging_reset"
            or not isinstance(reset_payload, dict)
        ):
            raise EvidenceError("source disposition reset attestation is invalid")
        required_reset = {
            "project_ref": CANONICAL_STAGING_PROJECT_REF,
            "workflow_run_url": reset_run,
            "reset_completed_at": value.get("reset_completed_at"),
            "reset_scope": "canonical_schemas_and_isolated_roles",
            "retired_source_accessed": False,
            "auth_schema_preserved": True,
            "alembic_version_removed": True,
            "canonical_schema_count_after_reset": 0,
        }
        if any(reset_payload.get(key) != expected for key, expected in required_reset.items()):
            raise EvidenceError(
                "source disposition disagrees with the hash-bound reset attestation"
            )
        _exact_sha(reset_payload.get("git_commit"), "reset attestation git_commit")
        _exact_sha(
            reset_payload.get("reviewed_deploy_sha"),
            "reset attestation reviewed_deploy_sha",
        )
        payload_reset_attestation = reset_attestation
    elif kind == "rollback_plan":
        if not isinstance(value.get("steps"), list) or not value["steps"]:
            raise EvidenceError("rollback plan requires reviewed executable steps")
        if not isinstance(value.get("owner"), str) or not value["owner"].strip():
            raise EvidenceError("rollback plan requires an accountable owner")
        if not isinstance(value.get("trigger_conditions"), list) or not value["trigger_conditions"]:
            raise EvidenceError("rollback plan requires explicit trigger conditions")
        if not isinstance(value.get("verification_queries"), list) or not value["verification_queries"]:
            raise EvidenceError("rollback plan requires post-restore verification queries")
        if not isinstance(value.get("max_recovery_minutes"), int) or value["max_recovery_minutes"] <= 0:
            raise EvidenceError("rollback plan requires a positive recovery-time bound")
    elif kind == "retired_project_decommission_plan":
        if value.get("retired_project_ref") != RETIRED_SOURCE_PROJECT_REF:
            raise EvidenceError("decommission plan must explicitly identify the retired project")
        if not isinstance(value.get("steps"), list) or not value["steps"]:
            raise EvidenceError("decommission plan requires reviewed executable steps")
        if not isinstance(value.get("owner"), str) or not value["owner"].strip():
            raise EvidenceError("decommission plan requires an accountable owner")
        if not isinstance(value.get("prerequisites"), list) or not value["prerequisites"]:
            raise EvidenceError("decommission plan requires explicit prerequisites")
        if value.get("final_backup_required") is not True:
            raise EvidenceError("decommission plan must require a final retained backup")
        _timestamp(value.get("rollback_window_ends_at"), "decommission.rollback_window_ends_at")
        if not isinstance(value.get("retention_approval_reference"), str) or not value["retention_approval_reference"].strip():
            raise EvidenceError("decommission plan requires retention approval")
    else:
        raise EvidenceError(f"unsupported reviewed evidence kind: {kind}")
    payload = dict(value)
    if kind == "source_disposition":
        payload["reset_attestation"] = payload_reset_attestation
    payload["reviewed_input_sha256"] = _sha256(input_path)
    return _artifact(kind, binding, payload)


def _runtime_callable_route_graph() -> dict[str, Any]:
    """Trace mounted endpoint/dependency callables through referenced globals."""
    from app.main import app

    def leaves(routes):
        for route in routes:
            contexts = getattr(route, "effective_route_contexts", None)
            if callable(contexts):
                yield from contexts()
            else:
                yield route

    routes: list[dict[str, Any]] = []
    pending: list[Any] = []
    for route in leaves(app.routes):
        endpoint = getattr(route, "endpoint", None)
        methods = sorted(getattr(route, "methods", None) or ())
        if endpoint is None or not methods:
            continue
        routes.append({
            "path": route.path,
            "methods": methods,
            "endpoint_module": endpoint.__module__,
            "endpoint_name": endpoint.__name__,
        })
        pending.append(endpoint)
        dependency = getattr(route, "dependant", None)
        dependency_queue = list(getattr(dependency, "dependencies", ()) or ())
        while dependency_queue:
            child = dependency_queue.pop()
            call = getattr(child, "call", None)
            if call is not None:
                pending.append(call)
            dependency_queue.extend(getattr(child, "dependencies", ()) or ())
    pending.extend(getattr(app.router, "on_startup", ()) or ())
    pending.extend(getattr(app.router, "on_shutdown", ()) or ())

    visited: set[str] = set()
    modules: set[str] = set()
    relations: dict[str, set[str]] = {}

    def callable_key(value: Any) -> str | None:
        target = inspect.unwrap(value) if callable(value) else value
        module = getattr(target, "__module__", "") or ""
        qualname = getattr(target, "__qualname__", "") or ""
        if not module.startswith("app") or not qualname:
            return None
        return f"{module}.{qualname}"

    def enqueue(value: Any) -> None:
        if inspect.ismodule(value):
            return
        if inspect.isclass(value):
            for member in value.__dict__.values():
                if isinstance(member, (staticmethod, classmethod)):
                    member = member.__func__
                if inspect.isfunction(member):
                    pending.append(member)
            return
        if callable_key(value):
            pending.append(value)
        elif callable(value):
            call = getattr(value, "__call__", None)
            if callable_key(call):
                pending.append(call)

    def resolve_attribute(root_value: Any, node: ast.AST) -> Any:
        chain: list[str] = []
        while isinstance(node, ast.Attribute):
            chain.append(node.attr)
            node = node.value
        if not isinstance(node, ast.Name):
            return None
        value = root_value.get(node.id)
        for attribute in reversed(chain):
            if value is None:
                return None
            value = getattr(value, attribute, None)
        return value

    while pending:
        value = pending.pop()
        receiver = getattr(value, "__self__", None)
        target = inspect.unwrap(value)
        key = callable_key(target)
        if key is None or key in visited:
            continue
        visited.add(key)
        modules.add(target.__module__)
        try:
            source = textwrap.dedent(inspect.getsource(target))
            tree = ast.parse(source)
            closure = inspect.getclosurevars(target)
        except (OSError, TypeError, IndentationError):
            continue
        referenced: dict[str, Any] = {
            **closure.globals,
            **closure.nonlocals,
            **closure.builtins,
        }
        if receiver is not None:
            referenced["self"] = receiver
            referenced["cls"] = receiver if inspect.isclass(receiver) else type(receiver)
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str):
                for match in SQL_RELATION.finditer(node.value):
                    relations.setdefault(match.group(1).lower(), set()).add(key)
            if not isinstance(node, ast.Call):
                continue
            if isinstance(node.func, ast.Name):
                enqueue(referenced.get(node.func.id))
            elif isinstance(node.func, ast.Attribute):
                enqueue(resolve_attribute(referenced, node.func))
        for referenced_value in referenced.values():
            if isinstance(referenced_value, str):
                for match in SQL_RELATION.finditer(referenced_value):
                    relations.setdefault(match.group(1).lower(), set()).add(key)
            elif inspect.isfunction(referenced_value):
                # Closure variables contain only names used by this function's
                # bytecode, unlike a whole imported module namespace.
                enqueue(referenced_value)
    return {
        "routes": routes,
        "reachable_callables": sorted(visited),
        "reachable_modules": sorted(modules),
        "relations": {
            relation: sorted(owners) for relation, owners in sorted(relations.items())
        },
    }


def _effective_route_probe(root: Path) -> dict[str, Any]:
    marker = "__CANONICAL_PROMOTION_ROUTES__="
    probe = f"""
import json
from scripts.audit.application_promotion_evidence import _runtime_callable_route_graph
print({marker!r}+json.dumps(_runtime_callable_route_graph(), sort_keys=True))
"""
    environment = dict(__import__("os").environ)
    backend = str(root / "backend")
    environment["PYTHONPATH"] = __import__("os").pathsep.join(
        filter(None, (backend, environment.get("PYTHONPATH", "")))
    )
    completed = subprocess.run(
        [sys.executable, "-c", probe], cwd=root, env=environment,
        check=True, capture_output=True, text=True,
    )
    if marker not in completed.stdout:
        raise EvidenceError("isolated mounted-route probe returned no evidence")
    value = json.loads(completed.stdout.rsplit(marker, 1)[1].strip())
    if not isinstance(value, dict) or not value.get("routes"):
        raise EvidenceError("mounted application has no effective HTTP routes")
    return value


def capture_route_graph(
    root: Path, binding: Mapping[str, Any]
) -> dict[str, Any]:
    graph = _effective_route_probe(root)
    routes = graph["routes"]
    relations = graph["relations"]

    contract = _load_json(root / "docs/architecture/app-data-contract.json")
    legacy_map = contract.get("legacy_relation_map")
    if not isinstance(legacy_map, dict):
        raise EvidenceError("application contract lacks the legacy relation map")
    retired = {
        relation
        for relation, disposition in legacy_map.items()
        if isinstance(disposition, dict) and disposition.get("action") != "retain"
    }
    findings = [
        {"relation": relation, "reachable_callables": relations[relation]}
        for relation in sorted(set(relations) & retired)
    ]
    return _artifact("mounted_route_graph", binding, {
        "analyzer_kind": "mounted_route_graph",
        "mounted_route_count": len(routes),
        "mounted_routes": sorted(routes, key=lambda row: (row["path"], row["methods"])),
        "reachable_callable_count": len(graph["reachable_callables"]),
        "reachable_callables": graph["reachable_callables"],
        "reachable_module_count": len(graph["reachable_modules"]),
        "reachable_modules": graph["reachable_modules"],
        "reachable_relation_dependencies": graph["relations"],
        "retired_relation_catalog": sorted(retired),
        "retired_dependency_findings": findings,
        "reachable_retired_dependency_count": len(findings),
    })


def _read_only_connection(database_url: str):
    import psycopg2

    connection = psycopg2.connect(database_url, connect_timeout=15)
    connection.set_session(readonly=True, autocommit=False)
    return connection


def _one(connection, query: str, parameters: Iterable[Any] = ()):
    with connection.cursor() as cursor:
        cursor.execute(query, tuple(parameters))
        row = cursor.fetchone()
    if row is None or len(row) != 1:
        raise EvidenceError("evidence query did not return exactly one scalar")
    return row[0]


def _rows(connection, query: str, parameters: Iterable[Any] = ()) -> list[tuple[Any, ...]]:
    with connection.cursor() as cursor:
        cursor.execute(query, tuple(parameters))
        return list(cursor.fetchall())


def _quoted_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _table_content_sha256(connection, schema: str, table: str) -> str:
    """Hash every row's canonical JSONB text with unambiguous length framing."""

    qualified = f"{_quoted_identifier(schema)}.{_quoted_identifier(table)}"
    digest = hashlib.sha256()
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_catalog.to_jsonb(row_value)::text "
            f"FROM {qualified} AS row_value "
            "ORDER BY (pg_catalog.to_jsonb(row_value)::text) COLLATE \"C\""
        )
        while True:
            rows = cursor.fetchmany(1000)
            if not rows:
                break
            for (row_json,) in rows:
                encoded = str(row_json).encode("utf-8")
                digest.update(len(encoded).to_bytes(8, "big"))
                digest.update(encoded)
    return digest.hexdigest()


def capture_snapshot(connection) -> dict[str, Any]:
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL TIME ZONE 'UTC'")
        cursor.execute("SET LOCAL DateStyle TO 'ISO, YMD'")
        cursor.execute("SET LOCAL extra_float_digits TO 3")
        cursor.execute("SET LOCAL bytea_output TO 'hex'")
    tables = _rows(connection, """
        SELECT namespace.nspname, relation.relname
          FROM pg_catalog.pg_class relation
          JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
         WHERE namespace.nspname=ANY(%s) AND relation.relkind IN ('r','p')
         ORDER BY namespace.nspname, relation.relname
    """, (list(CANONICAL_SCHEMAS),))
    counts: dict[str, int] = {}
    exact_numeric_sums: dict[str, str] = {}
    table_content_sha256: dict[str, str] = {}
    with connection.cursor() as cursor:
        for schema, table in tables:
            qualified = f'"{schema}"."{table}"'
            cursor.execute(f"SELECT count(*) FROM {qualified}")
            relation_name = f"{schema}.{table}"
            counts[relation_name] = int(cursor.fetchone()[0])
            table_content_sha256[relation_name] = _table_content_sha256(
                connection, schema, table
            )
            columns = _rows(connection, """
                SELECT attribute.attname
                  FROM pg_catalog.pg_attribute attribute
                  JOIN pg_catalog.pg_class relation ON relation.oid=attribute.attrelid
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
                  JOIN pg_catalog.pg_type type_row ON type_row.oid=attribute.atttypid
                 WHERE namespace.nspname=%s AND relation.relname=%s
                   AND attribute.attnum>0 AND NOT attribute.attisdropped
                   AND type_row.typname='numeric'
                 ORDER BY attribute.attname
            """, (schema, table))
            for (column,) in columns:
                cursor.execute(
                    f'SELECT COALESCE(sum("{column}"),0)::text FROM {qualified}'
                )
                value = Decimal(str(cursor.fetchone()[0]))
                exact_numeric_sums[f"{schema}.{table}.{column}"] = format(value, "f")
    return {
        "relation_counts": counts,
        "exact_numeric_sums": exact_numeric_sums,
        "table_content_sha256": table_content_sha256,
    }


def capture_database(
    *, runtime_database_url: str, admin_database_url: str,
    expected_head: str, binding: Mapping[str, Any],
) -> dict[str, Any]:
    with _read_only_connection(admin_database_url) as admin, _read_only_connection(
        runtime_database_url
    ) as runtime:
        observed_head = str(_one(admin, "SELECT version_num FROM public.alembic_version"))
        session_user = str(_one(runtime, "SELECT session_user"))
        posture = _one(runtime, """
            SELECT pg_catalog.jsonb_build_object(
                'session_user', role.rolname,
                'superuser', role.rolsuper,
                'bypass_rls', role.rolbypassrls,
                'owns_business_relations', EXISTS (
                    SELECT 1 FROM pg_catalog.pg_class relation
                    JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
                    WHERE relation.relowner=role.oid AND namespace.nspname=ANY(%s)
                      AND relation.relkind IN ('r','p','v','m','S')
                )
            ) FROM pg_catalog.pg_roles role WHERE role.rolname=session_user
        """, (list(CANONICAL_SCHEMAS),))
        if session_user != "erp_runtime":
            raise EvidenceError(f"runtime connection uses {session_user!r}, not erp_runtime")
        tenant_tables = _rows(admin, """
            SELECT namespace.nspname||'.'||relation.relname,
                   relation.relrowsecurity, relation.relforcerowsecurity
              FROM pg_catalog.pg_class relation
              JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
              JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid=relation.oid
             WHERE namespace.nspname=ANY(%s) AND relation.relkind IN ('r','p')
               AND attribute.attname='org_id' AND attribute.attnum>0 AND NOT attribute.attisdropped
             ORDER BY 1
        """, (list(CANONICAL_SCHEMAS),))
        if not tenant_tables:
            raise EvidenceError("canonical staging exposes no tenant-scoped relations")
        rls_failures = [name for name, enabled, forced in tenant_tables if not enabled or not forced]

        identities = _rows(admin, """
            SELECT membership.org_id, user_row.auth_user_id
              FROM core.memberships membership
              JOIN core.users user_row ON user_row.id=membership.user_id
              JOIN core.organizations organization ON organization.id=membership.org_id
             WHERE membership.status='active' AND membership.joined_at IS NOT NULL
               AND membership.revoked_at IS NULL AND user_row.status='active'
               AND organization.status='active' AND user_row.auth_user_id IS NOT NULL
             ORDER BY membership.org_id, user_row.auth_user_id
        """)
        distinct: list[tuple[Any, Any]] = []
        seen_orgs: set[Any] = set()
        for org_id, auth_user_id in identities:
            if org_id not in seen_orgs:
                distinct.append((org_id, auth_user_id))
                seen_orgs.add(org_id)
        if len(distinct) < 2:
            raise EvidenceError("tenant proof requires two disposable active organizations")
        own_org, auth_user = distinct[0]
        other_org, _ = distinct[1]
        with runtime.cursor() as cursor:
            cursor.execute("SELECT erp_security.activate_context(%s,%s)", (auth_user, own_org))
            cursor.execute("SELECT count(*) FROM core.organizations WHERE id=%s", (own_org,))
            positive_count = int(cursor.fetchone()[0])
            cursor.execute("SELECT count(*) FROM core.organizations WHERE id=%s", (other_org,))
            cross_tenant_count = int(cursor.fetchone()[0])
        snapshot = capture_snapshot(admin)
        runtime.rollback()
        admin.rollback()

    if observed_head != expected_head:
        raise EvidenceError(
            f"deployed Alembic head {observed_head!r} differs from {expected_head!r}"
        )
    return _artifact("canonical_database_runtime", binding, {
        "expected_alembic_head": expected_head,
        "observed_alembic_head": observed_head,
        "runtime_role": dict(posture),
        "tenant_relation_count": len(tenant_tables),
        "forced_rls_failures": rls_failures,
        "tenant_positive_count": positive_count,
        "cross_tenant_visible_count": cross_tenant_count,
        "snapshot": snapshot,
    })


def capture_standalone_snapshot(
    *, database_url: str, binding: Mapping[str, Any], source: str
) -> dict[str, Any]:
    with _read_only_connection(database_url) as connection:
        snapshot = capture_snapshot(connection)
        connection.rollback()
    return _artifact("canonical_database_snapshot", binding, {
        "snapshot_source": source,
        "snapshot": snapshot,
    })


def reconcile_backup(
    *, source_artifact: Mapping[str, Any], restored_artifact: Mapping[str, Any],
    backup_file: Path, binding: Mapping[str, Any],
) -> dict[str, Any]:
    _require_binding(source_artifact, binding, "source database evidence")
    _require_binding(restored_artifact, binding, "restored snapshot evidence")
    source_payload = source_artifact.get("payload", {})
    restored_payload = restored_artifact.get("payload", {})
    source_snapshot = source_payload.get("snapshot")
    restored_snapshot = restored_payload.get("snapshot")
    if not isinstance(source_snapshot, dict) or not isinstance(restored_snapshot, dict):
        raise EvidenceError("backup reconciliation requires two exact snapshots")
    counts_match = source_snapshot.get("relation_counts") == restored_snapshot.get("relation_counts")
    sums_match = source_snapshot.get("exact_numeric_sums") == restored_snapshot.get("exact_numeric_sums")
    source_counts = source_snapshot.get("relation_counts")
    restored_counts = restored_snapshot.get("relation_counts")
    source_digests = source_snapshot.get("table_content_sha256")
    restored_digests = restored_snapshot.get("table_content_sha256")
    content_match = (
        isinstance(source_counts, dict)
        and isinstance(restored_counts, dict)
        and isinstance(source_digests, dict)
        and isinstance(restored_digests, dict)
        and set(source_digests) == set(source_counts)
        and set(restored_digests) == set(restored_counts)
        and source_digests == restored_digests
    )
    if not backup_file.is_file() or backup_file.stat().st_size <= 0:
        raise EvidenceError("backup artifact is missing or empty")
    if not counts_match or not sums_match or not content_match:
        raise EvidenceError("restored database does not exactly reconcile with canonical staging")
    return _artifact("reconciliation_backup_restore", binding, {
        "source_target_counts_reconciled": counts_match,
        "exact_totals_reconciled": sums_match,
        "table_content_digests_reconciled": content_match,
        "backup_verified": True,
        "restore_tested": True,
        "backup_sha256": _sha256(backup_file),
        "backup_size_bytes": backup_file.stat().st_size,
        "source_snapshot_sha256": hashlib.sha256(
            json.dumps(source_snapshot, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "restored_snapshot_sha256": hashlib.sha256(
            json.dumps(restored_snapshot, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest(),
        "relation_count": len(source_snapshot.get("relation_counts", {})),
        "numeric_column_count": len(source_snapshot.get("exact_numeric_sums", {})),
        "table_content_digest_count": len(
            source_snapshot.get("table_content_sha256", {})
        ),
    })


def _live18_http_rows(value: Any, label: str) -> list[Mapping[str, Any]]:
    if not isinstance(value, list):
        raise EvidenceError(f"Live18 {label} HTTP evidence must be an array")
    rows: list[Mapping[str, Any]] = []
    expected_keys = {"actor", "method", "path", "status", "request_id"}
    for row in value:
        if not isinstance(row, dict) or set(row) != expected_keys:
            raise EvidenceError(f"Live18 {label} HTTP evidence row is invalid")
        status = row.get("status")
        request_id = row.get("request_id")
        if (
            row.get("actor") not in {"requester", "reviewer"}
            or row.get("method") not in {
                "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"
            }
            or not isinstance(row.get("path"), str)
            or not row["path"].startswith("/api/")
            or "?" in row["path"]
            or not isinstance(status, int)
            or isinstance(status, bool)
            or status < 100
            or status > 599
            or (request_id is not None and not isinstance(request_id, str))
        ):
            raise EvidenceError(f"Live18 {label} HTTP evidence row is invalid")
        rows.append(row)
    return rows


def _validate_live18_http_lifecycle(
    row: Mapping[str, Any], command_operation: str, approval_policy: str
) -> None:
    command_id = row["command_request_id"]
    prepare_path = f"/api/web/actions/{command_operation}/prepare"
    approval_path = f"/api/web/actions/commands/{command_id}/approve"
    execute_path = f"/api/web/actions/commands/{command_id}/execute"
    http = _live18_http_rows(row.get("http"), "browser")
    missing = _live18_http_rows(
        row.get("missing_required_http"), "missing-required"
    )

    def fingerprint(item: Mapping[str, Any]) -> tuple[Any, ...]:
        return tuple(
            item[key]
            for key in ("actor", "method", "path", "status", "request_id")
        )

    http_counts = Counter(fingerprint(item) for item in http)
    missing_counts = Counter(fingerprint(item) for item in missing)
    if any(count > http_counts[key] for key, count in missing_counts.items()):
        raise EvidenceError(
            "Live18 missing-required HTTP evidence is not part of the browser capture"
        )
    if any(
        item["actor"] != "requester"
        or item["method"] != "POST"
        or item["path"] != prepare_path
        or item["status"] < 400
        for item in missing
    ):
        raise EvidenceError("Live18 missing-required UI path did not fail closed")

    def successful(method: str, path: str) -> list[Mapping[str, Any]]:
        return [
            item for item in http
            if item["method"] == method
            and item["path"] == path
            and 200 <= item["status"] < 300
        ]

    prepare = successful("POST", prepare_path)
    approval = successful("POST", approval_path)
    execute = successful("POST", execute_path)
    expected_approval_actor = (
        "reviewer" if approval_policy == "separate_approver" else "requester"
    )
    if len(prepare) != 1 or prepare[0]["actor"] != "requester":
        raise EvidenceError("Live18 UI did not prepare exactly once as requester")
    if len(approval) != 1 or approval[0]["actor"] != expected_approval_actor:
        raise EvidenceError("Live18 UI approval actor or cardinality is invalid")
    if len(execute) != 1 or execute[0]["actor"] != "requester":
        raise EvidenceError("Live18 UI did not execute exactly once as requester")


def capture_live18_acceptance(
    *, manifest: Mapping[str, Any], binding: Mapping[str, Any],
    workflow_run_id: int, workflow_run_attempt: int,
    artifact_id: int, artifact_sha256: str, artifact_digest: str,
) -> dict[str, Any]:
    """Validate and retain only scrubbed, exact-run Live18 acceptance evidence."""

    if workflow_run_id <= 0 or workflow_run_attempt <= 0 or artifact_id <= 0:
        raise EvidenceError("Live18 workflow and artifact identities must be positive")
    if SHA256.fullmatch(artifact_sha256) is None:
        raise EvidenceError("Live18 artifact must provide a lowercase SHA-256")
    if ARTIFACT_DIGEST.fullmatch(artifact_digest) is None:
        raise EvidenceError("Live18 artifact digest is invalid")
    if manifest.get("schema") != "aasopharma.live18.upload-manifest.v1":
        raise EvidenceError("Live18 manifest has an unsupported schema")
    run = manifest.get("run")
    if not isinstance(run, dict) or run != {
        "id": str(workflow_run_id),
        "attempt": str(workflow_run_attempt),
        "browser_outcome": "success",
    }:
        raise EvidenceError("Live18 manifest is not a successful exact-run acceptance")
    deployment = manifest.get("deployment")
    if not isinstance(deployment, dict):
        raise EvidenceError("Live18 deployment evidence is missing")
    if (
        deployment.get("provider") != binding.get("deployment_provider")
        or deployment.get("commit_sha") != binding.get("git_commit")
    ):
        raise EvidenceError("Live18 deployment differs from the promotion binding")
    if SHA256.fullmatch(str(deployment.get("raw_evidence_sha256", ""))) is None:
        raise EvidenceError("Live18 deployment lacks its raw evidence hash")
    origins = deployment.get("origins")
    services = binding.get("deployment_services")
    if not isinstance(origins, dict) or not isinstance(services, dict):
        raise EvidenceError("Live18 deployment origins are missing")
    expected_origins = {
        name: row.get("url") for name, row in services.items()
        if isinstance(row, dict)
    }
    if origins != expected_origins:
        raise EvidenceError("Live18 service origins differ from the exact deployment")

    matrix = _load_json(LIVE18_MATRIX_PATH)
    operations = matrix.get("operations")
    if matrix.get("required_operation_count") != 18 or not isinstance(operations, list):
        raise EvidenceError("Live18 operation authority is invalid")
    required = {
        row["id"]: (row["command_operation"], row.get("approval_policy"))
        for row in operations
        if isinstance(row, dict)
    }
    if len(required) != 18:
        raise EvidenceError("Live18 operation authority must contain exactly 18 operations")
    browser = manifest.get("browser")
    if not isinstance(browser, list) or len(browser) != 18:
        raise EvidenceError("Live18 browser evidence must contain exactly 18 operations")
    by_operation: dict[str, Mapping[str, Any]] = {}
    requester: str | None = None
    reviewer: str | None = None
    organization: str | None = None
    branch: str | None = None
    for row in browser:
        if not isinstance(row, dict):
            raise EvidenceError("Live18 browser evidence row is invalid")
        operation_id = row.get("operation_id")
        if not isinstance(operation_id, str):
            raise EvidenceError("Live18 browser operation identity is invalid")
        if operation_id in by_operation:
            raise EvidenceError("Live18 browser evidence contains a duplicate operation")
        if operation_id not in required or row.get("command_operation") != required[operation_id][0]:
            raise EvidenceError("Live18 browser evidence differs from the operation authority")
        if row.get("tested_sha") != binding.get("git_commit"):
            raise EvidenceError("Live18 browser evidence is not bound to the reviewed SHA")
        for key in ("command_request_id", "resource_id", "requester_user_id", "reviewer_user_id", "organization_id", "branch_id"):
            if not isinstance(row.get(key), str) or UUID.fullmatch(row[key]) is None:
                raise EvidenceError(f"Live18 browser evidence has invalid {key}")
        if row["requester_user_id"] == row["reviewer_user_id"]:
            raise EvidenceError("Live18 requester and reviewer must be distinct")
        if PREVIEW_SHA256.fullmatch(str(row.get("preview_hash", ""))) is None:
            raise EvidenceError("Live18 browser evidence lacks an immutable preview hash")
        current = (
            row["requester_user_id"], row["reviewer_user_id"],
            row["organization_id"], row["branch_id"],
        )
        expected_identity = (requester, reviewer, organization, branch)
        if requester is None:
            requester, reviewer, organization, branch = current
        elif current != expected_identity:
            raise EvidenceError("Live18 browser identities or tenant context drifted")
        expected_self_approval = (
            403 if required[operation_id][1] == "separate_approver" else None
        )
        if row.get("self_approval_status") != expected_self_approval:
            raise EvidenceError("Live18 self-approval did not fail closed")
        _validate_live18_http_lifecycle(
            row, required[operation_id][0], required[operation_id][1]
        )
        if not SHA256.fullmatch(str(row.get("raw_evidence_sha256", ""))):
            raise EvidenceError("Live18 browser evidence lacks a raw evidence hash")
        by_operation[str(operation_id)] = row
    if set(by_operation) != set(required):
        raise EvidenceError("Live18 browser evidence does not cover the exact operation matrix")

    database = manifest.get("database")
    if not isinstance(database, dict):
        raise EvidenceError("Live18 database reconciliation evidence is missing")
    if SHA256.fullmatch(str(database.get("raw_evidence_sha256", ""))) is None:
        raise EvidenceError("Live18 database reconciliation lacks its raw evidence hash")
    runtime = database.get("runtime_role")
    expected_runtime = {
        "current_user": "erp_runtime",
        "superuser": False,
        "bypassrls": False,
        "migration_owner_member": False,
        "network_family": 6,
        "transport": "supabase_direct_ipv6_from_railway",
    }
    if runtime != expected_runtime:
        raise EvidenceError("Live18 database evidence did not use the isolated Railway runtime role")
    if database.get("organization_id") != organization:
        raise EvidenceError("Live18 database organization differs from browser evidence")
    denial_organization = database.get("denial_organization_id")
    if (
        not isinstance(denial_organization, str)
        or UUID.fullmatch(denial_organization) is None
        or denial_organization == organization
    ):
        raise EvidenceError("Live18 denial organization is invalid")
    resources = database.get("resources")
    if not isinstance(resources, dict) or set(resources) != set(required):
        raise EvidenceError("Live18 database evidence does not cover the exact operation matrix")
    for operation_id, resource in resources.items():
        if not isinstance(resource, dict):
            raise EvidenceError("Live18 database resource evidence is invalid")
        browser_row = by_operation[operation_id]
        if (
            resource.get("command_operation") != required[operation_id][0]
            or resource.get("command_request_id") != browser_row["command_request_id"]
            or resource.get("resource_id") != browser_row["resource_id"]
            or resource.get("cross_tenant_denied") is not True
            or not SHA256.fullmatch(str(resource.get("database_sha256", "")))
        ):
            raise EvidenceError("Live18 browser and database resource evidence did not reconcile")
    demo = manifest.get("demo")
    if (
        not isinstance(demo, dict)
        or demo.get("action") != "provision-demo"
        or not SHA256.fullmatch(str(demo.get("content_sha256", "")))
        or not SHA256.fullmatch(str(demo.get("raw_evidence_sha256", "")))
    ):
        raise EvidenceError("Live18 same-run demo evidence is missing")
    return _artifact(
        "canonical_live18_acceptance",
        binding,
        {
            "workflow_run_id": workflow_run_id,
            "workflow_run_attempt": workflow_run_attempt,
            "artifact_id": artifact_id,
            "artifact_sha256": artifact_sha256,
            "artifact_digest": artifact_digest,
            "operation_count": 18,
            "operation_ids": sorted(required),
            "requester_user_id": requester,
            "reviewer_user_id": reviewer,
            "organization_id": organization,
            "branch_id": branch,
            "deployment_raw_evidence_sha256": deployment.get("raw_evidence_sha256"),
            "database_raw_evidence_sha256": database.get("raw_evidence_sha256"),
        },
    )


def _require_binding(
    artifact: Mapping[str, Any], expected: Mapping[str, Any], label: str
) -> None:
    if artifact.get("schema_version") != SCHEMA_VERSION:
        raise EvidenceError(f"{label} has an unsupported schema version")
    if artifact.get("binding") != expected:
        raise EvidenceError(f"{label} is not bound to the same staging deployment")
    _timestamp(artifact.get("captured_at"), f"{label}.captured_at")


def _relative_artifact(root: Path, path: Path, label: str) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(root.resolve()))
    except ValueError as exc:
        raise EvidenceError(f"{label} must be inside the evidence repository") from exc


def assemble_manifest(
    *, root: Path, binding: Mapping[str, Any], source_path: Path,
    route_path: Path, database_path: Path, reconciliation_path: Path,
    live18_path: Path, rollback_path: Path, decommission_path: Path, reviewer: str,
    reviewed_at: str,
) -> dict[str, Any]:
    artifacts = {
        "source_disposition": _load_json(source_path),
        "route_graph": _load_json(route_path),
        "migration_head": _load_json(database_path),
        "runtime_tenant_isolation": _load_json(database_path),
        "reconciliation_backup": _load_json(reconciliation_path),
        "live18_acceptance": _load_json(live18_path),
        "rollback": _load_json(rollback_path),
        "decommission": _load_json(decommission_path),
    }
    for label, artifact in artifacts.items():
        _require_binding(artifact, binding, label)
    _validate_artifact_payloads(artifacts)
    reviewed_at = _timestamp(reviewed_at, "reviewed_at")
    if not reviewer.strip():
        raise EvidenceError("reviewer is required")
    def reference(path: Path) -> tuple[str, str]:
        return _relative_artifact(root, path, "promotion artifact"), _sha256(path)
    source_ref, source_hash = reference(source_path)
    route_ref, route_hash = reference(route_path)
    database_ref, database_hash = reference(database_path)
    reconciliation_ref, reconciliation_hash = reference(reconciliation_path)
    live18_ref, live18_hash = reference(live18_path)
    rollback_ref, rollback_hash = reference(rollback_path)
    decommission_ref, decommission_hash = reference(decommission_path)
    database_payload = artifacts["migration_head"]["payload"]
    return {
        "schema_version": 2,
        "evidence_state": "verified",
        "source_disposition": {
            "state": "verified", "strategy": "reset",
            "source_identifier": CANONICAL_STAGING_PROJECT_REF,
            "artifact": source_ref, "artifact_sha256": source_hash,
        },
        "route_graph": {
            "state": "verified", "analyzer_kind": "mounted_route_graph",
            "reachable_retired_dependency_count": 0,
            "artifact": route_ref, "artifact_sha256": route_hash,
        },
        "migration_head": {
            "state": "verified",
            "expected_head": database_payload["expected_alembic_head"],
            "observed_head": database_payload["observed_alembic_head"],
            "artifact": database_ref, "artifact_sha256": database_hash,
        },
        "runtime_tenant_isolation": {
            "state": "verified", "runtime_role_non_owner": True,
            "runtime_role_no_bypassrls": True, "forced_rls_verified": True,
            "tenant_positive_test": True, "cross_tenant_denial_test": True,
            "artifact": database_ref, "artifact_sha256": database_hash,
        },
        "reconciliation_backup": {
            "state": "verified", "source_target_counts_reconciled": True,
            "exact_totals_reconciled": True, "backup_verified": True,
            "restore_tested": True, "table_content_digests_reconciled": True,
            "artifact": reconciliation_ref,
            "artifact_sha256": reconciliation_hash,
        },
        "live18_acceptance": {
            "state": "verified", "operation_count": 18,
            "artifact": live18_ref, "artifact_sha256": live18_hash,
        },
        "rollback_decommission": {
            "state": "verified", "rollback_artifact": rollback_ref,
            "rollback_artifact_sha256": rollback_hash,
            "decommission_artifact": decommission_ref,
            "decommission_artifact_sha256": decommission_hash,
        },
        "review": {
            "state": "verified", "reviewer": reviewer.strip(),
            "reviewed_at": reviewed_at, "git_commit": binding["git_commit"],
        },
    }


def _validate_artifact_payloads(artifacts: Mapping[str, Mapping[str, Any]]) -> None:
    source = artifacts["source_disposition"]
    source_payload = source.get("payload", {})
    if source.get("evidence_kind") != "source_disposition" or not isinstance(source_payload, dict) or any(
        source_payload.get(key) != expected for key, expected in {
            "strategy": "reset",
            "source_identifier": CANONICAL_STAGING_PROJECT_REF,
            "retired_source_accessed": False,
            "disposable_staging_reset_verified": True,
        }.items()
    ):
        raise EvidenceError("source disposition must prove a canonical-staging reset without retired-source access")
    if not re.fullmatch(
        r"https://github\.com/[^/]+/[^/]+/actions/runs/[0-9]+",
        str(source_payload.get("reset_workflow_run_url", "")),
    ) or not SHA256.fullmatch(str(source_payload.get("reset_artifact_sha256", ""))):
        raise EvidenceError("source disposition lacks exact hash-bound reset-run evidence")
    _timestamp(source_payload.get("reset_completed_at"), "source_disposition.reset_completed_at")
    reset_attestation = source_payload.get("reset_attestation")
    reset_payload = (
        reset_attestation.get("payload", {})
        if isinstance(reset_attestation, dict)
        else {}
    )
    if (
        not isinstance(reset_attestation, dict)
        or reset_attestation.get("schema_version") != SCHEMA_VERSION
        or reset_attestation.get("evidence_kind") != "canonical_staging_reset"
        or reset_payload.get("project_ref") != CANONICAL_STAGING_PROJECT_REF
        or reset_payload.get("workflow_run_url")
        != source_payload.get("reset_workflow_run_url")
        or reset_payload.get("reset_completed_at")
        != source_payload.get("reset_completed_at")
        or reset_payload.get("retired_source_accessed") is not False
        or reset_payload.get("auth_schema_preserved") is not True
        or reset_payload.get("alembic_version_removed") is not True
        or reset_payload.get("canonical_schema_count_after_reset") != 0
    ):
        raise EvidenceError("source disposition reset attestation is invalid")
    if hashlib.sha256(_json_bytes(reset_attestation)).hexdigest() != source_payload.get(
        "reset_artifact_sha256"
    ):
        raise EvidenceError("source disposition reset attestation hash differs")
    _exact_sha(reset_payload.get("git_commit"), "reset attestation git_commit")
    _exact_sha(
        reset_payload.get("reviewed_deploy_sha"),
        "reset attestation reviewed_deploy_sha",
    )
    route = artifacts["route_graph"]
    route_payload = route.get("payload", {})
    if route.get("evidence_kind") != "mounted_route_graph" or not isinstance(route_payload, dict):
        raise EvidenceError("mounted route-graph artifact is invalid")
    if route_payload.get("analyzer_kind") != "mounted_route_graph" or route_payload.get("reachable_retired_dependency_count") != 0:
        raise EvidenceError("mounted route graph has a reachable retired dependency")
    if route_payload.get("retired_dependency_findings") != [] or not route_payload.get("mounted_routes"):
        raise EvidenceError("mounted route graph lacks route proof or contains retired findings")
    database = artifacts["migration_head"]
    db = database.get("payload", {})
    if database.get("evidence_kind") != "canonical_database_runtime" or not isinstance(db, dict):
        raise EvidenceError("canonical database runtime artifact is invalid")
    if not db.get("expected_alembic_head") or db.get("observed_alembic_head") != db.get("expected_alembic_head"):
        raise EvidenceError("canonical staging is not on the exact reviewed Alembic head")
    role = db.get("runtime_role")
    if role != {"session_user": "erp_runtime", "superuser": False, "bypass_rls": False, "owns_business_relations": False}:
        raise EvidenceError("runtime role is not non-owner, non-superuser and NOBYPASSRLS")
    if db.get("forced_rls_failures") != [] or not isinstance(db.get("tenant_relation_count"), int) or db["tenant_relation_count"] < 1:
        raise EvidenceError("forced RLS was not verified on every tenant relation")
    if db.get("tenant_positive_count") != 1 or db.get("cross_tenant_visible_count") != 0:
        raise EvidenceError("positive and cross-tenant runtime probes did not pass")
    reconciliation = artifacts["reconciliation_backup"]
    rec = reconciliation.get("payload", {})
    if reconciliation.get("evidence_kind") != "reconciliation_backup_restore" or not isinstance(rec, dict):
        raise EvidenceError("backup reconciliation artifact is invalid")
    for field in (
        "source_target_counts_reconciled",
        "exact_totals_reconciled",
        "table_content_digests_reconciled",
        "backup_verified",
        "restore_tested",
    ):
        if rec.get(field) is not True:
            raise EvidenceError(f"backup reconciliation did not verify {field}")
    if not SHA256.fullmatch(str(rec.get("backup_sha256", ""))) or int(rec.get("backup_size_bytes", 0)) <= 0:
        raise EvidenceError("backup artifact identity is invalid")
    live18 = artifacts["live18_acceptance"]
    live18_payload = live18.get("payload", {})
    if (
        live18.get("evidence_kind") != "canonical_live18_acceptance"
        or not isinstance(live18_payload, dict)
        or live18_payload.get("operation_count") != 18
        or not isinstance(live18_payload.get("operation_ids"), list)
        or len(set(live18_payload["operation_ids"])) != 18
        or int(live18_payload.get("workflow_run_id", 0)) <= 0
        or int(live18_payload.get("workflow_run_attempt", 0)) <= 0
        or int(live18_payload.get("artifact_id", 0)) <= 0
        or not SHA256.fullmatch(str(live18_payload.get("artifact_sha256", "")))
        or ARTIFACT_DIGEST.fullmatch(str(live18_payload.get("artifact_digest", ""))) is None
    ):
        raise EvidenceError("exact-run Live18 acceptance evidence is invalid")
    rollback = artifacts["rollback"]
    rollback_payload = rollback.get("payload", {})
    if rollback.get("evidence_kind") != "rollback_plan" or rollback_payload.get("state") != "reviewed" or not rollback_payload.get("steps"):
        raise EvidenceError("reviewed rollback plan is missing")
    if not rollback_payload.get("owner") or not rollback_payload.get("trigger_conditions") or not rollback_payload.get("verification_queries") or not isinstance(rollback_payload.get("max_recovery_minutes"), int) or rollback_payload["max_recovery_minutes"] <= 0:
        raise EvidenceError("reviewed rollback plan lacks owner, triggers, queries, or recovery bound")
    decommission = artifacts["decommission"]
    decommission_payload = decommission.get("payload", {})
    if decommission.get("evidence_kind") != "retired_project_decommission_plan" or decommission_payload.get("state") != "reviewed":
        raise EvidenceError("reviewed retired-project decommission plan is missing")
    if decommission_payload.get("retired_project_ref") != RETIRED_SOURCE_PROJECT_REF or not decommission_payload.get("steps"):
        raise EvidenceError("decommission plan does not explicitly scope the retired project")
    if not decommission_payload.get("owner") or not decommission_payload.get("prerequisites") or decommission_payload.get("final_backup_required") is not True or not decommission_payload.get("retention_approval_reference"):
        raise EvidenceError("decommission plan lacks owner, prerequisites, final backup, or retention approval")
    _timestamp(decommission_payload.get("rollback_window_ends_at"), "decommission.rollback_window_ends_at")


def validate_manifest_artifacts(root: Path, manifest: Mapping[str, Any]) -> list[str]:
    """Deep-validate verified manifest artifacts and their common binding."""
    if manifest.get("evidence_state") != "verified":
        return []
    try:
        review = manifest.get("review", {})
        git_commit = _exact_sha(review.get("git_commit"), "review.git_commit")
        paths: dict[str, Path] = {}
        for section_name in (
            "source_disposition", "route_graph", "migration_head",
            "reconciliation_backup", "live18_acceptance",
        ):
            paths[section_name] = root / manifest[section_name]["artifact"]
        paths["runtime_tenant_isolation"] = paths["migration_head"]
        paths["rollback"] = root / manifest["rollback_decommission"]["rollback_artifact"]
        paths["decommission"] = root / manifest["rollback_decommission"]["decommission_artifact"]
        expected_hashes = {
            "source_disposition": manifest["source_disposition"]["artifact_sha256"],
            "route_graph": manifest["route_graph"]["artifact_sha256"],
            "migration_head": manifest["migration_head"]["artifact_sha256"],
            "runtime_tenant_isolation": manifest["runtime_tenant_isolation"]["artifact_sha256"],
            "reconciliation_backup": manifest["reconciliation_backup"]["artifact_sha256"],
            "live18_acceptance": manifest["live18_acceptance"]["artifact_sha256"],
            "rollback": manifest["rollback_decommission"]["rollback_artifact_sha256"],
            "decommission": manifest["rollback_decommission"]["decommission_artifact_sha256"],
        }
        for label, path in paths.items():
            expected_hash = expected_hashes[label]
            if not isinstance(expected_hash, str) or not SHA256.fullmatch(expected_hash):
                raise EvidenceError(f"{label} lacks a lowercase SHA-256")
            if _sha256(path) != expected_hash:
                raise EvidenceError(f"{label} artifact hash differs from the manifest")
        artifacts = {name: _load_json(path) for name, path in paths.items()}
        binding = artifacts["source_disposition"].get("binding")
        if not isinstance(binding, dict):
            raise EvidenceError("source disposition lacks a deployment binding")
        if binding.get("project_ref") != CANONICAL_STAGING_PROJECT_REF or binding.get("git_commit") != git_commit or binding.get("deployed_sha") != git_commit:
            raise EvidenceError("promotion artifacts are not bound to canonical staging and the reviewed SHA")
        provider = binding.get("deployment_provider")
        services = binding.get("deployment_services")
        if provider not in DEPLOYMENT_PROVIDERS or not isinstance(services, dict):
            raise EvidenceError("promotion artifacts lack a supported deployment binding")
        if not SHA256.fullmatch(str(binding.get("deployment_evidence_sha256", ""))):
            raise EvidenceError("promotion deployment evidence lacks an exact hash")
        if (
            int(binding.get("deployment_artifact_id", 0)) <= 0
            or ARTIFACT_DIGEST.fullmatch(str(binding.get("deployment_artifact_digest", ""))) is None
        ):
            raise EvidenceError("promotion deployment artifact provenance is invalid")
        _verify_normalized_deployment_binding(binding)
        for label, artifact in artifacts.items():
            _require_binding(artifact, binding, label)
        _validate_artifact_payloads(artifacts)
    except (EvidenceError, KeyError, OSError, json.JSONDecodeError, TypeError, ValueError) as exc:
        return [f"promotion evidence deep validation failed: {exc}"]
    return []


def _binding_from_args(args: argparse.Namespace) -> dict[str, Any]:
    evidence_path = Path(args.deployment_evidence)
    return build_binding(
        project_ref=args.project_ref,
        git_commit=args.git_commit,
        deployment_evidence=_load_json(evidence_path),
        deployment_evidence_sha256=_sha256(evidence_path),
        deployment_artifact_id=args.deployment_artifact_id,
        deployment_artifact_digest=args.deployment_artifact_digest,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    reset = subparsers.add_parser("reset-attestation")
    reset.add_argument("--project-ref", required=True)
    reset.add_argument("--git-commit", required=True)
    reset.add_argument("--reviewed-deploy-sha", required=True)
    reset.add_argument("--workflow-repository", required=True)
    reset.add_argument("--workflow-run-id", required=True, type=int)
    reset.add_argument("--workflow-run-attempt", required=True, type=int)
    reset.add_argument("--reset-completed-at", required=True)
    reset.add_argument("--output", required=True)

    def bound(command: str):
        item = subparsers.add_parser(command)
        item.add_argument("--project-ref", required=True)
        item.add_argument("--git-commit", required=True)
        item.add_argument("--deployment-evidence", required=True)
        item.add_argument("--deployment-artifact-id", required=True, type=int)
        item.add_argument("--deployment-artifact-digest", required=True)
        item.add_argument("--output", required=True)
        return item

    route = bound("route-graph")
    route.add_argument("--repo-root", default=str(REPOSITORY_ROOT))
    database = bound("database")
    database.add_argument("--runtime-database-url", required=True)
    database.add_argument("--admin-database-url", required=True)
    database.add_argument("--expected-head", required=True)
    snapshot = bound("snapshot")
    snapshot.add_argument("--database-url", required=True)
    snapshot.add_argument("--source", choices=("canonical_staging", "restored_postgresql_15"), required=True)
    reconcile = bound("reconcile-backup")
    reconcile.add_argument("--source-artifact", required=True)
    reconcile.add_argument("--restored-artifact", required=True)
    reconcile.add_argument("--backup-file", required=True)
    live18 = bound("capture-live18")
    live18.add_argument("--manifest", required=True)
    live18.add_argument("--workflow-run-id", required=True, type=int)
    live18.add_argument("--workflow-run-attempt", required=True, type=int)
    live18.add_argument("--artifact-id", required=True, type=int)
    live18.add_argument("--artifact-sha256", required=True)
    live18.add_argument("--artifact-digest", required=True)
    wrap = bound("wrap-reviewed-input")
    wrap.add_argument(
        "--kind",
        choices=("source_disposition", "rollback_plan", "retired_project_decommission_plan"),
        required=True,
    )
    wrap.add_argument("--input", required=True)
    wrap.add_argument("--repo-root", default=str(REPOSITORY_ROOT))
    assemble = bound("assemble")
    assemble.add_argument("--repo-root", default=str(REPOSITORY_ROOT))
    assemble.add_argument("--source-disposition", required=True)
    assemble.add_argument("--route-graph", required=True)
    assemble.add_argument("--database", required=True)
    assemble.add_argument("--reconciliation-backup", required=True)
    assemble.add_argument("--live18-acceptance", required=True)
    assemble.add_argument("--rollback", required=True)
    assemble.add_argument("--decommission", required=True)
    assemble.add_argument("--reviewer", required=True)
    assemble.add_argument("--reviewed-at", required=True)
    validate = subparsers.add_parser("validate-manifest")
    validate.add_argument("--repo-root", default=str(REPOSITORY_ROOT))
    validate.add_argument("--manifest", required=True)

    args = parser.parse_args()
    try:
        if args.command == "reset-attestation":
            value = build_reset_attestation(
                project_ref=args.project_ref,
                git_commit=args.git_commit,
                reviewed_deploy_sha=args.reviewed_deploy_sha,
                workflow_repository=args.workflow_repository,
                workflow_run_id=args.workflow_run_id,
                workflow_run_attempt=args.workflow_run_attempt,
                reset_completed_at=args.reset_completed_at,
            )
            _write_json(Path(args.output), value)
            print(f"wrote reset-attestation evidence to {args.output}")
            return 0
        if args.command == "validate-manifest":
            errors = validate_manifest_artifacts(
                Path(args.repo_root), _load_json(Path(args.manifest))
            )
            if errors:
                raise EvidenceError("; ".join(errors))
            print(f"validated exact-SHA promotion manifest {args.manifest}")
            return 0
        binding = _binding_from_args(args)
        if args.command == "route-graph":
            value = capture_route_graph(Path(args.repo_root), binding)
        elif args.command == "database":
            value = capture_database(
                runtime_database_url=args.runtime_database_url,
                admin_database_url=args.admin_database_url,
                expected_head=args.expected_head,
                binding=binding,
            )
        elif args.command == "snapshot":
            value = capture_standalone_snapshot(
                database_url=args.database_url, binding=binding, source=args.source
            )
        elif args.command == "reconcile-backup":
            value = reconcile_backup(
                source_artifact=_load_json(Path(args.source_artifact)),
                restored_artifact=_load_json(Path(args.restored_artifact)),
                backup_file=Path(args.backup_file), binding=binding,
            )
        elif args.command == "capture-live18":
            value = capture_live18_acceptance(
                manifest=_load_json(Path(args.manifest)), binding=binding,
                workflow_run_id=args.workflow_run_id,
                workflow_run_attempt=args.workflow_run_attempt,
                artifact_id=args.artifact_id,
                artifact_sha256=args.artifact_sha256,
                artifact_digest=args.artifact_digest,
            )
        elif args.command == "wrap-reviewed-input":
            value = wrap_reviewed_input(
                kind=args.kind,
                input_path=Path(args.input),
                binding=binding,
                repository_root=Path(args.repo_root),
            )
        else:
            value = assemble_manifest(
                root=Path(args.repo_root), binding=binding,
                source_path=Path(args.source_disposition),
                route_path=Path(args.route_graph), database_path=Path(args.database),
                reconciliation_path=Path(args.reconciliation_backup),
                live18_path=Path(args.live18_acceptance),
                rollback_path=Path(args.rollback), decommission_path=Path(args.decommission),
                reviewer=args.reviewer, reviewed_at=args.reviewed_at,
            )
        _write_json(Path(args.output), value)
        print(f"wrote {args.command} evidence to {args.output}")
        return 0
    except (EvidenceError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(f"canonical application promotion evidence: BLOCKED: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
