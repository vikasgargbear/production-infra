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
BASE_WORKFLOWS = (
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


def active_provider_name(manifest: Mapping[str, Any]) -> str:
    """Return the sole selected application authority or fail closed."""

    try:
        selected = manifest["deployment"]["selected_provider"]
        providers = manifest["providers"]
        active = sorted(
            name
            for name, provider in providers.items()
            if provider["authority"] == "active"
        )
    except (AttributeError, KeyError, TypeError):
        raise ControlPlaneError("provider authority is missing or malformed") from None
    if active != [selected]:
        raise ControlPlaneError(
            "selected provider is not the sole active application authority"
        )
    return selected


def active_provider_services(
    manifest: Mapping[str, Any],
) -> Mapping[str, Mapping[str, Any]]:
    """Return provider-neutral API/MCP/frontend facts for the active authority."""

    selected = active_provider_name(manifest)
    return manifest["providers"][selected]["services"]


def _service_bindings(manifest: Mapping[str, Any]) -> dict[str, str]:
    supabase = manifest["supabase"]
    deployment = manifest["deployment"]
    declared_variables = set(manifest["configuration"]["variables"])
    bindings = {
        deployment["provider_environment"]: deployment["selected_provider"],
        "CANONICAL_APPLICATION_DATABASE_TRANSPORT": manifest["providers"][
            deployment["selected_provider"]
        ]["adapter"]["application_database_transport"],
        "CANONICAL_STAGING_PROJECT_REF": supabase["project_ref"],
        "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF": supabase["project_ref"],
        "SUPABASE_URL": supabase["origin"],
        "SUPABASE_OAUTH_ISSUER": supabase["oauth_issuer"],
        "SUPABASE_DIRECT_DATABASE_HOST": supabase["database"]["host"],
        "SUPABASE_DIRECT_DATABASE_PORT": str(supabase["database"]["port"]),
    }
    for provider in manifest["providers"].values():
        adapter = provider["adapter"]
        prefix = adapter["environment_prefix"]
        for field_name, environment_name in adapter["identity_environment"].items():
            if field_name in provider:
                bindings[environment_name] = provider[field_name]
        for service_name, service in provider["services"].items():
            service_prefix = f"{prefix}_{service_name.upper()}"
            for suffix, value in (
                ("SERVICE_ID", service["id"]),
                ("URL", service["origin"]),
            ):
                environment_name = f"{service_prefix}_{suffix}"
                if environment_name in declared_variables:
                    bindings[environment_name] = value
            if f"{service_prefix}_SERVICE" in declared_variables:
                bindings[f"{service_prefix}_SERVICE"] = service["name"]
    return bindings


def _workflow_paths(manifest: Mapping[str, Any]) -> tuple[Path, ...]:
    paths = set(BASE_WORKFLOWS)
    for provider in manifest["providers"].values():
        paths.add(REPO_ROOT / provider["adapter"]["workflow"])
    return tuple(sorted(paths))


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
        "prove_competing_providers_inactive": "pre_fence_provenance",
        "open_fence": "prove_competing_providers_inactive",
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
    database = supabase["database"]
    expected_database_host = f"db.{supabase['project_ref']}.supabase.co"
    if database["host"] != expected_database_host:
        diagnostics.append(
            Diagnostic(
                "CFG_SUPABASE_DATABASE_HOST_DRIFT",
                "preflight",
                "supabase.database.host",
                "direct database host does not derive from the reviewed project reference",
                next_action="correct the single control-plane manifest",
            )
        )
    if "pooler.supabase.com" in database["host"]:
        diagnostics.append(
            Diagnostic(
                "CFG_SUPABASE_POOLER_PROHIBITED",
                "preflight",
                "supabase.database.host",
                "shared Supavisor is prohibited for canonical certification",
                next_action="use the reviewed direct IPv4 database endpoint",
            )
        )
    selected_provider = manifest["deployment"]["selected_provider"]
    active_providers = sorted(
        provider_name
        for provider_name, provider in manifest["providers"].items()
        if provider["authority"] == "active"
    )
    if active_providers != [selected_provider]:
        diagnostics.append(
            Diagnostic(
                "CFG_PROVIDER_AUTHORITY_INVALID",
                "preflight",
                "deployment.selected_provider",
                "selected provider must be the sole active application authority",
                next_action="review the provider authority transition before deployment",
            )
        )

    service_ids: set[str] = set()
    origins: set[str] = set()
    for provider_name, provider in manifest["providers"].items():
        adapter = provider["adapter"]
        if (
            adapter["kind"] != provider_name
            or adapter["environment_prefix"].lower() != provider_name
            or not adapter["commit_environment"].startswith(
                f"{adapter['environment_prefix']}_"
            )
        ):
            diagnostics.append(
                Diagnostic(
                    "CFG_PROVIDER_ADAPTER_MISMATCH",
                    "preflight",
                    f"providers.{provider_name}.adapter",
                    "provider adapter identity does not match its provider key",
                    next_action="correct the typed provider adapter in the manifest",
                )
            )
        for field_name, environment_name in adapter["identity_environment"].items():
            if (
                field_name not in provider
                or environment_name
                not in manifest["configuration"]["variables"]
            ):
                diagnostics.append(
                    Diagnostic(
                        "CFG_PROVIDER_IDENTITY_BINDING_INVALID",
                        "preflight",
                        f"providers.{provider_name}.{field_name}",
                        (
                            "provider identity binding is missing from its provider "
                            "or variable authority"
                        ),
                        next_action="correct the provider identity binding in the manifest",
                    )
                )
        adapter_paths = [adapter["workflow"], *adapter["artifacts"]]
        for relative_path in adapter_paths:
            candidate = (REPO_ROOT / relative_path).resolve()
            if REPO_ROOT not in candidate.parents or not candidate.is_file():
                diagnostics.append(
                    Diagnostic(
                        "CFG_PROVIDER_ARTIFACT_MISSING",
                        "preflight",
                        f"providers.{provider_name}:{relative_path}",
                        "provider adapter references an absent repository artifact",
                        next_action="restore the provider artifact or correct its adapter path",
                    )
                )
        required_services = set(manifest["deployment"]["required_services"])
        if set(provider["services"]) != required_services:
            diagnostics.append(
                Diagnostic(
                    "CFG_PROVIDER_SERVICE_SET_INVALID",
                    "preflight",
                    f"providers.{provider_name}.services",
                    "provider does not implement the common application service contract",
                    next_action="define API, MCP, and frontend services in the provider adapter",
                )
            )
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
            if parsed.hostname and not parsed.hostname.endswith(
                adapter["origin_suffix"]
            ):
                diagnostics.append(
                    Diagnostic(
                        "CFG_PROVIDER_ORIGIN_MISMATCH",
                        "preflight",
                        f"{provider_name}.{service_name}.origin",
                        "service origin does not match its typed provider adapter",
                        next_action="correct the service origin or provider adapter",
                    )
                )
            has_readiness = "readiness" in service
            has_closed_fence_status = "closed_fence_status" in service
            if (
                (service_name in {"api", "mcp"} and not has_readiness)
                or has_readiness != has_closed_fence_status
            ):
                diagnostics.append(
                    Diagnostic(
                        "CFG_SERVICE_READINESS_INVALID",
                        "preflight",
                        f"{provider_name}.{service_name}",
                        "service readiness and closed-fence semantics are incomplete",
                        next_action="define the common service readiness contract",
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
    for workflow in _workflow_paths(manifest):
        try:
            text = workflow.read_text(encoding="utf-8")
        except OSError:
            continue
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
        # Render returns a small HTML document rather than a provider API status
        # when an owner suspends a service.  Preserve only the stable condition,
        # never the response body, so status diagnostics can name the recovery
        # action without leaking arbitrary upstream content.
        if b"<title>Service Suspended</title>" in raw or (
            b"This service has been suspended by its owner." in raw
        ):
            return status, None, "provider_service_suspended"
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
    suspended_services: set[str] = set()
    selected_provider_name = manifest["deployment"]["selected_provider"]
    selected_provider = manifest["providers"][selected_provider_name]
    suspension = selected_provider["adapter"].get("suspension")
    for service_name in manifest["deployment"]["required_services"]:
        service = selected_provider["services"][service_name]
        status, body, transport_error = _get_json(
            service["origin"] + service["health"], timeout
        )
        observed_sha = body.get("git_commit") if body else None
        checks.append(
            {
                "provider": selected_provider_name,
                "service": service_name,
                "check": "health",
                "http_status": status,
                "git_commit": observed_sha,
            }
        )
        if status != 200:
            if suspension and transport_error == suspension["transport_error"]:
                suspended_services.add(service_name)
                diagnostics.append(
                    Diagnostic(
                        suspension["diagnostic_code"],
                        "deployment_health",
                        f"{selected_provider_name}.{service_name}",
                        suspension["message"],
                        retryable=False,
                        next_action=suspension["next_action"],
                    )
                )
                continue
            diagnostics.append(
                Diagnostic(
                    "LIVE_HEALTH_UNAVAILABLE",
                    "deployment_health",
                    f"{selected_provider_name}.{service_name}",
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
                    f"{selected_provider_name}.{service_name}",
                    f"service publishes {observed_sha or 'no SHA'} instead of the reviewed SHA",
                    next_action="deploy the reviewed exact SHA to this service",
                )
            )

    for service_name, service in selected_provider["services"].items():
        if "readiness" not in service:
            continue
        status, body, transport_error = _get_json(
            service["origin"] + service["readiness"], timeout
        )
        checks.append(
            {
                "provider": selected_provider_name,
                "service": service_name,
                "check": "readiness",
                "http_status": status,
                "reported_status": body.get("status") if body else None,
            }
        )
        if service_name in suspended_services:
            # Health already emitted the precise provider lifecycle condition.
            # Do not replace it with a second, generic readiness failure or
            # mistake a suspended MCP 503 for correct closed-fence behavior.
            continue
        expected_status = (
            200 if fence == "open" else service["closed_fence_status"]
        )
        expected_reported_status = "ready" if expected_status == 200 else "not_ready"
        if status != expected_status or not body or body.get("status") != expected_reported_status:
            diagnostic_code = (
                "LIVE_FENCE_SEMANTICS_DRIFT"
                if fence == "closed"
                else "LIVE_READINESS_FAILED"
            )
            diagnostics.append(
                Diagnostic(
                    diagnostic_code,
                    "post_fence_readiness" if fence == "open" else "pre_fence_provenance",
                    f"{selected_provider_name}.{service_name}",
                    (
                        f"readiness returned {transport_error or f'HTTP {status}'}, "
                        f"expected HTTP {expected_status} {expected_reported_status}"
                    ),
                    retryable=status in {0, 408, 425, 429, 500, 502, 503, 504},
                    next_action="inspect database authority and the named service logs",
                )
            )

    for provider_name, provider in manifest["providers"].items():
        if provider["authority"] not in {"standby", "retired"}:
            continue
        for service_name, service in provider["services"].items():
            status, _, transport_error = _get_json(
                service["origin"] + service["health"], timeout
            )
            suspension = provider["adapter"].get("suspension")
            provider_is_inactive = status == 404 or bool(
                suspension
                and transport_error == suspension["transport_error"]
            )
            checks.append(
                {
                    "provider": provider_name,
                    "service": service_name,
                    "check": "inactivity",
                    "http_status": status,
                }
            )
            if not provider_is_inactive:
                diagnostics.append(
                    Diagnostic(
                        "LIVE_INACTIVE_AUTHORITY_REACHABLE",
                        "provider_inactivity",
                        f"{provider_name}.{service_name}",
                        (
                            "inactive origin returned "
                            f"{transport_error or f'HTTP {status}'} instead of HTTP 404"
                        ),
                        retryable=status == 0,
                        next_action=(
                            f"stop the inactive {provider_name} deployment or correct "
                            "its reviewed origin"
                        ),
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
    active_provider = subparsers.add_parser(
        "assert-active-provider",
        help="fail unless the named deployment adapter is the sole active authority",
    )
    active_provider.add_argument("provider", choices=("render", "railway"))
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
        if args.command == "assert-active-provider":
            selected = active_provider_name(manifest)
            if args.provider != selected:
                return _emit(
                    [
                        Diagnostic(
                            "CFG_PROVIDER_NOT_ACTIVE",
                            "preflight",
                            args.provider,
                            f"provider is not selected; active authority is {selected}",
                            next_action=(
                                "perform a reviewed provider authority transition "
                                "before deployment"
                            ),
                        )
                    ]
                )
            return _emit([])
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
