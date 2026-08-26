#!/usr/bin/env python3
"""Read-only deployment control plane for canonical environments.

This is the single diagnostic entrypoint for checked-in provider identity,
workflow configuration, exact-SHA provenance, and public readiness.  It never
deploys, changes a provider, opens a write fence, or prints secret values.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Iterable, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from jsonschema import Draft202012Validator, FormatChecker


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = REPO_ROOT / "deploy/control-plane/canonical-staging.json"
SCHEMA_PATH = REPO_ROOT / "deploy/control-plane/control-plane-v1.schema.json"
WORKFLOWS = (
    REPO_ROOT / ".github/workflows/canonical-staging.yml",
    REPO_ROOT / ".github/workflows/production-readiness.yml",
)
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")
REFERENCE_PATTERN = re.compile(r"(?:vars|secrets)\.([A-Z][A-Z0-9_]*)")


@dataclass(frozen=True)
class Diagnostic:
    code: str
    phase: str
    subject: str
    message: str
    retryable: bool = False
    next_action: str = ""


class ControlPlaneError(RuntimeError):
    pass


def _load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ControlPlaneError(f"cannot read JSON authority {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ControlPlaneError(f"JSON authority must contain an object: {path}")
    return value


def load_manifest(path: Path) -> dict[str, Any]:
    manifest = _load_json(path)
    schema = _load_json(SCHEMA_PATH)
    errors = sorted(
        Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(manifest),
        key=lambda error: list(error.absolute_path),
    )
    if errors:
        rendered = "; ".join(
            f"{'/'.join(map(str, error.absolute_path)) or '<root>'}: {error.message}"
            for error in errors
        )
        raise ControlPlaneError(f"deployment manifest schema violation: {rendered}")
    return manifest


def _service_bindings(manifest: Mapping[str, Any]) -> dict[str, str]:
    render = manifest["providers"]["render"]
    railway = manifest["providers"]["railway"]
    supabase = manifest["supabase"]
    bindings = {
        "CANONICAL_STAGING_PROJECT_REF": supabase["project_ref"],
        "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF": supabase["project_ref"],
        "SUPABASE_URL": supabase["origin"],
        "SUPABASE_OAUTH_ISSUER": supabase["oauth_issuer"],
        "RENDER_OWNER_ID": render["owner_id"],
        "RAILWAY_PROJECT_ID": railway["project_id"],
        "RAILWAY_ENVIRONMENT_ID": railway["environment_id"],
    }
    for provider_name, prefix in (("render", "RENDER"), ("railway", "RAILWAY")):
        provider = manifest["providers"][provider_name]
        for service_name, service in provider["services"].items():
            service_prefix = f"{prefix}_{service_name.upper()}"
            bindings[f"{service_prefix}_SERVICE_ID"] = service["id"]
            bindings[f"{service_prefix}_URL"] = service["origin"]
            if provider_name == "railway":
                bindings[f"{service_prefix}_SERVICE"] = service["name"]
    return bindings


def _phase_diagnostics(manifest: Mapping[str, Any]) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    phases = manifest["phases"]
    names = [phase["name"] for phase in phases]
    if len(names) != len(set(names)):
        diagnostics.append(
            Diagnostic(
                "CFG_PHASE_DUPLICATE",
                "preflight",
                "phases",
                "deployment phase names must be unique",
                next_action="remove the duplicate phase from the control-plane manifest",
            )
        )
        return diagnostics
    seen: set[str] = set()
    for phase in phases:
        missing = sorted(set(phase["after"]) - seen)
        if missing:
            diagnostics.append(
                Diagnostic(
                    "CFG_PHASE_ORDER_INVALID",
                    "preflight",
                    phase["name"],
                    f"phase depends on a later or absent phase: {', '.join(missing)}",
                    next_action="restore the reviewed dependency order in the manifest",
                )
            )
        seen.add(phase["name"])
    required_edges = {
        "pre_fence_provenance": "deploy_exact_sha",
        "prove_railway_retired": "pre_fence_provenance",
        "open_fence": "prove_railway_retired",
        "full_readiness": "open_fence",
    }
    by_name = {phase["name"]: set(phase["after"]) for phase in phases}
    for phase, dependency in required_edges.items():
        if dependency not in by_name.get(phase, set()):
            diagnostics.append(
                Diagnostic(
                    "CFG_SAFETY_EDGE_MISSING",
                    "preflight",
                    phase,
                    f"required safety dependency is absent: {dependency}",
                    next_action="restore the reviewed fence/provenance phase edge",
                )
            )
    return diagnostics


def validate_manifest(manifest: Mapping[str, Any]) -> list[Diagnostic]:
    diagnostics = _phase_diagnostics(manifest)
    supabase = manifest["supabase"]
    expected_origin = f"https://{supabase['project_ref']}.supabase.co"
    if supabase["origin"].rstrip("/") != expected_origin:
        diagnostics.append(
            Diagnostic(
                "CFG_SUPABASE_ORIGIN_DRIFT",
                "preflight",
                "supabase.origin",
                "Supabase origin does not derive from the reviewed project reference",
                next_action="correct the single control-plane manifest",
            )
        )
    if supabase["oauth_issuer"].rstrip("/") != f"{expected_origin}/auth/v1":
        diagnostics.append(
            Diagnostic(
                "CFG_SUPABASE_ISSUER_DRIFT",
                "preflight",
                "supabase.oauth_issuer",
                "OAuth issuer does not derive from the reviewed Supabase origin",
                next_action="correct the single control-plane manifest",
            )
        )
    if manifest["providers"]["render"]["authority"] != "active":
        diagnostics.append(
            Diagnostic(
                "CFG_ACTIVE_PROVIDER_INVALID",
                "preflight",
                "providers.render.authority",
                "Render must be the sole active application provider",
                next_action="review provider authority before attempting deployment",
            )
        )
    if manifest["providers"]["railway"]["authority"] != "retired":
        diagnostics.append(
            Diagnostic(
                "CFG_RETIRED_PROVIDER_INVALID",
                "preflight",
                "providers.railway.authority",
                "Railway must remain explicitly retired",
                next_action="review provider authority before attempting deployment",
            )
        )

    service_ids: set[str] = set()
    origins: set[str] = set()
    for provider_name, provider in manifest["providers"].items():
        for service_name, service in provider["services"].items():
            parsed = urlparse(service["origin"])
            if parsed.scheme != "https" or not parsed.hostname or parsed.path not in {"", "/"}:
                diagnostics.append(
                    Diagnostic(
                        "CFG_SERVICE_ORIGIN_INVALID",
                        "preflight",
                        f"{provider_name}.{service_name}.origin",
                        "service origin must be a credential-free HTTPS origin",
                        next_action="correct the service origin in the manifest",
                    )
                )
            if service["id"] in service_ids:
                diagnostics.append(
                    Diagnostic(
                        "CFG_SERVICE_ID_DUPLICATE",
                        "preflight",
                        service["id"],
                        "provider service identity is duplicated",
                        next_action="correct provider identities in the manifest",
                    )
                )
            if service["origin"] in origins:
                diagnostics.append(
                    Diagnostic(
                        "CFG_SERVICE_ORIGIN_DUPLICATE",
                        "preflight",
                        service["origin"],
                        "multiple provider services share one origin",
                        next_action="correct provider origins in the manifest",
                    )
                )
            service_ids.add(service["id"])
            origins.add(service["origin"])

    declared = {
        "vars": set(manifest["configuration"]["variables"]),
        "secrets": set(manifest["configuration"]["secrets"]),
    }
    for workflow in WORKFLOWS:
        text = workflow.read_text(encoding="utf-8")
        for kind in ("vars", "secrets"):
            referenced = set(
                re.findall(rf"{kind}\.([A-Z][A-Z0-9_]*)", text)
            )
            for name in sorted(referenced - declared[kind]):
                diagnostics.append(
                    Diagnostic(
                        "CFG_WORKFLOW_BINDING_UNDECLARED",
                        "preflight",
                        f"{workflow.name}:{kind}.{name}",
                        "workflow configuration is absent from the control-plane manifest",
                        next_action="declare the binding or remove the stale workflow reference",
                    )
                )
    return diagnostics


def preflight_diagnostics(
    manifest: Mapping[str, Any],
    *,
    required_env: Iterable[str],
    expected_sha: str | None,
    repository: str | None,
    environ: Mapping[str, str],
) -> list[Diagnostic]:
    diagnostics = validate_manifest(manifest)
    declared = set(manifest["configuration"]["variables"]) | set(
        manifest["configuration"]["secrets"]
    )
    bindings = _service_bindings(manifest)
    for name in sorted(set(required_env)):
        if name not in declared and name not in manifest["configuration"]["run_outputs"]:
            diagnostics.append(
                Diagnostic(
                    "CFG_REQUIREMENT_UNDECLARED",
                    "preflight",
                    name,
                    "required environment value is not declared",
                    next_action="declare the value in the control-plane manifest",
                )
            )
        elif not environ.get(name, "").strip():
            diagnostics.append(
                Diagnostic(
                    "CFG_VALUE_MISSING",
                    "preflight",
                    name,
                    "required configuration is empty",
                    next_action="configure the declared GitHub variable or secret",
                )
            )
    for name, expected in bindings.items():
        observed = environ.get(name, "").strip()
        if observed and observed.rstrip("/") != expected.rstrip("/"):
            diagnostics.append(
                Diagnostic(
                    "CFG_VALUE_DRIFT",
                    "preflight",
                    name,
                    "configured value differs from the checked-in authority",
                    next_action="load the value from the control-plane manifest",
                )
            )
    if expected_sha is not None and SHA_PATTERN.fullmatch(expected_sha) is None:
        diagnostics.append(
            Diagnostic(
                "CFG_SHA_INVALID",
                "preflight",
                "expected_sha",
                "expected deployment SHA is not a full lowercase Git SHA",
                next_action="supply the reviewed 40-character commit SHA",
            )
        )
    if repository and repository != manifest["environment"]["repository"]:
        diagnostics.append(
            Diagnostic(
                "CFG_REPOSITORY_DRIFT",
                "preflight",
                repository,
                "workflow repository differs from the checked-in authority",
                next_action="run from the reviewed repository",
            )
        )
    return diagnostics


def _get_json(url: str, timeout: int) -> tuple[int, dict[str, Any] | None, str]:
    request = Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            status = int(response.status)
            raw = response.read()
    except HTTPError as exc:
        status = int(exc.code)
        raw = exc.read()
    except URLError as exc:
        return 0, None, type(exc.reason).__name__
    try:
        body = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        body = None
    return status, body if isinstance(body, dict) else None, ""


def status_diagnostics(
    manifest: Mapping[str, Any],
    *,
    expected_sha: str,
    fence: str,
    timeout: int,
) -> tuple[list[Diagnostic], list[dict[str, Any]]]:
    diagnostics = validate_manifest(manifest)
    checks: list[dict[str, Any]] = []
    render = manifest["providers"]["render"]["services"]
    for service_name in ("frontend", "api", "mcp"):
        service = render[service_name]
        status, body, transport_error = _get_json(
            service["origin"] + service["health"], timeout
        )
        observed_sha = body.get("git_commit") if body else None
        checks.append(
            {
                "provider": "render",
                "service": service_name,
                "check": "health",
                "http_status": status,
                "git_commit": observed_sha,
            }
        )
        if status != 200:
            diagnostics.append(
                Diagnostic(
                    "LIVE_HEALTH_UNAVAILABLE",
                    "deployment_health",
                    f"render.{service_name}",
                    f"health returned {transport_error or f'HTTP {status}'}",
                    retryable=status in {0, 408, 425, 429, 500, 502, 503, 504},
                    next_action="inspect the named service deploy/runtime logs",
                )
            )
        elif observed_sha != expected_sha:
            diagnostics.append(
                Diagnostic(
                    "LIVE_SHA_MISMATCH",
                    "deployment_health",
                    f"render.{service_name}",
                    f"service publishes {observed_sha or 'no SHA'} instead of the reviewed SHA",
                    next_action="deploy the reviewed exact SHA to this service",
                )
            )

    for service_name in ("api", "mcp"):
        service = render[service_name]
        status, body, transport_error = _get_json(
            service["origin"] + service["readiness"], timeout
        )
        checks.append(
            {
                "provider": "render",
                "service": service_name,
                "check": "readiness",
                "http_status": status,
                "reported_status": body.get("status") if body else None,
            }
        )
        expected_ready = fence == "open" or service_name == "api"
        if expected_ready and (status != 200 or not body or body.get("status") != "ready"):
            diagnostics.append(
                Diagnostic(
                    "LIVE_READINESS_FAILED",
                    "post_fence_readiness" if fence == "open" else "pre_fence_provenance",
                    f"render.{service_name}",
                    f"readiness returned {transport_error or f'HTTP {status}'}",
                    retryable=status in {0, 408, 425, 429, 500, 502, 503, 504},
                    next_action="inspect database authority and the named service logs",
                )
            )
        if fence == "closed" and service_name == "mcp" and status not in {503}:
            diagnostics.append(
                Diagnostic(
                    "LIVE_FENCE_SEMANTICS_DRIFT",
                    "pre_fence_provenance",
                    "render.mcp",
                    f"closed-fence MCP readiness returned HTTP {status}, expected 503",
                    next_action="verify the canonical write fence and MCP grant readiness boundary",
                )
            )

    railway = manifest["providers"]["railway"]["services"]
    for service_name, service in railway.items():
        status, _, transport_error = _get_json(service["origin"] + "/health", timeout)
        checks.append(
            {
                "provider": "railway",
                "service": service_name,
                "check": "retirement",
                "http_status": status,
            }
        )
        if status != 404:
            diagnostics.append(
                Diagnostic(
                    "LIVE_RETIRED_AUTHORITY_REACHABLE",
                    "provider_retirement",
                    f"railway.{service_name}",
                    f"retired origin returned {transport_error or f'HTTP {status}'} instead of HTTP 404",
                    retryable=status == 0,
                    next_action="stop the retired Railway deployment or correct its reviewed origin",
                )
            )
    return diagnostics, checks


def _write_github_env(manifest: Mapping[str, Any], path: Path) -> None:
    bindings = _service_bindings(manifest)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for name, value in sorted(bindings.items()):
            if "\n" in value or "\r" in value:
                raise ControlPlaneError(f"unsafe multiline public binding: {name}")
            handle.write(f"{name}={value}\n")


def _emit(diagnostics: list[Diagnostic], *, checks: list[dict[str, Any]] | None = None) -> int:
    payload: dict[str, Any] = {
        "schema": "aasopharma.deployment-diagnostic.v1",
        "status": "blocked" if diagnostics else "ready",
        "diagnostics": [asdict(item) for item in diagnostics],
    }
    if checks is not None:
        payload["checks"] = checks
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 1 if diagnostics else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("validate", help="validate static authority and workflow bindings")
    preflight = subparsers.add_parser("preflight", help="validate runtime inputs without mutation")
    preflight.add_argument("--require-env", action="append", default=[])
    preflight.add_argument("--expected-sha")
    preflight.add_argument("--repository")

    export = subparsers.add_parser("export-github-env", help="export reviewed public bindings")
    export.add_argument("--output", type=Path, default=None)

    status = subparsers.add_parser("status", help="diagnose exact-SHA public service state")
    status.add_argument("--expected-sha", required=True)
    status.add_argument("--fence", choices=("open", "closed"), required=True)
    status.add_argument("--timeout", type=int, default=20)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest = load_manifest(args.manifest)
        if args.command == "validate":
            return _emit(validate_manifest(manifest))
        if args.command == "preflight":
            return _emit(
                preflight_diagnostics(
                    manifest,
                    required_env=args.require_env,
                    expected_sha=args.expected_sha,
                    repository=args.repository,
                    environ=os.environ,
                )
            )
        if args.command == "export-github-env":
            output = args.output or (
                Path(os.environ["GITHUB_ENV"]) if os.environ.get("GITHUB_ENV") else None
            )
            if output is None:
                raise ControlPlaneError("pass --output or set GITHUB_ENV")
            diagnostics = validate_manifest(manifest)
            if diagnostics:
                return _emit(diagnostics)
            _write_github_env(manifest, output)
            return _emit([])
        if args.command == "status":
            if SHA_PATTERN.fullmatch(args.expected_sha) is None:
                return _emit(
                    [
                        Diagnostic(
                            "CFG_SHA_INVALID",
                            "preflight",
                            "expected_sha",
                            "expected deployment SHA is not a full lowercase Git SHA",
                            next_action="supply the reviewed 40-character commit SHA",
                        )
                    ]
                )
            diagnostics, checks = status_diagnostics(
                manifest,
                expected_sha=args.expected_sha,
                fence=args.fence,
                timeout=args.timeout,
            )
            return _emit(diagnostics, checks=checks)
        raise AssertionError(f"unhandled command: {args.command}")
    except ControlPlaneError as exc:
        return _emit(
            [
                Diagnostic(
                    "CFG_MANIFEST_INVALID",
                    "preflight",
                    str(args.manifest),
                    str(exc),
                    next_action="repair the checked-in deployment control-plane authority",
                )
            ]
        )


if __name__ == "__main__":
    sys.exit(main())
