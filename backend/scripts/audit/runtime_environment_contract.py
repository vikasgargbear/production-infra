#!/usr/bin/env python3
"""Fail closed when runtime environment names or meanings drift."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys


REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACT_PATH = REPO_ROOT / "docs" / "architecture" / "runtime-environment-contract.json"
RETIRED_NAMES = {"DEBUG", "ENVIRONMENT", "SECRET_KEY", "ALLOWED_ORIGINS"}
RENDER_REQUIRED_CLASSES = {
    "backend_api": {
        "all", "production", "canonical_operator_writes", "evidence_storage_feature",
        "mcp_feature", "tax_provider_feature"
    },
    "frontend": {"all", "production_build"},
    "mcp": {"all"},
}


def _contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def _scan(pattern: re.Pattern[str], paths: list[Path]) -> set[str]:
    names: set[str] = set()
    for path in paths:
        text = path.read_text(encoding="utf-8")
        names.update(pattern.findall(text))
    return names


def discovered_runtime_names() -> dict[str, set[str]]:
    backend_paths = list((REPO_ROOT / "backend" / "app").rglob("*.py"))
    backend_paths.append(REPO_ROOT / "backend" / "start.py")
    backend = _scan(
        re.compile(r'os\.(?:getenv|environ\.get)\(\s*["\']([A-Z][A-Z0-9_]*)["\']'),
        backend_paths,
    )

    frontend = _scan(
        re.compile(r'process\.env\.([A-Z][A-Z0-9_]*)'),
        list((REPO_ROOT / "frontend" / "src").rglob("*.ts"))
        + list((REPO_ROOT / "frontend" / "src").rglob("*.tsx"))
        + list((REPO_ROOT / "frontend" / "src").rglob("*.js")),
    )

    mcp_paths = list(
        (REPO_ROOT / "backend" / "mcp_runtime" / "aasopharma_mcp").rglob("*.py")
    )
    mcp = _scan(
        re.compile(
            r'(?:_required|_https_url)\(\s*values\s*,\s*["\']([A-Z][A-Z0-9_]*)["\']'
            r'|values\.get\(\s*["\']([A-Z][A-Z0-9_]*)["\']'
        ),
        mcp_paths,
    )
    # The MCP regex has two alternatives and therefore returns tuples.
    if mcp and isinstance(next(iter(mcp)), tuple):
        mcp = {name for pair in mcp for name in pair if name}
    return {"backend_api": backend, "frontend": frontend, "mcp": mcp}


def render_environment_names() -> dict[str, set[str]]:
    """Read the small checked-in Blueprint without introducing a YAML dependency."""
    text = (REPO_ROOT / "render.yaml").read_text(encoding="utf-8")
    service_map = {
        "aasopharma-api-pilot": "backend_api",
        "aasopharma-erp-pilot": "frontend",
        "aasopharma-mcp-pilot": "mcp",
    }
    result = {service: set() for service in service_map.values()}
    for block in re.split(r"(?m)^  - type: ", text)[1:]:
        match = re.search(r"(?m)^    name: ([a-z0-9-]+)$", block)
        if not match or match.group(1) not in service_map:
            continue
        service = service_map[match.group(1)]
        result[service].update(re.findall(r"(?m)^      - key: ([A-Z][A-Z0-9_]*)$", block))
    return result


def validate() -> list[str]:
    document = _contract()
    issues: list[str] = []
    variables = document.get("variables", [])
    entries: dict[tuple[str, str], dict] = {}
    semantics_by_name: dict[str, set[str]] = {}

    for entry in variables:
        key = (entry.get("service"), entry.get("name"))
        if key in entries:
            issues.append(f"duplicate service variable: {key[0]}.{key[1]}")
        entries[key] = entry
        name = entry.get("name", "")
        semantic_id = entry.get("semantic_id", "")
        semantics_by_name.setdefault(name, set()).add(semantic_id)
        if name in RETIRED_NAMES:
            issues.append(f"retired variable is declared: {name}")
        if not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            issues.append(f"invalid variable name: {name!r}")
        if len(entry.get("description", "").strip()) < 20:
            issues.append(f"missing useful description: {key[0]}.{key[1]}")
        if not semantic_id or not entry.get("format") or "secret" not in entry:
            issues.append(f"incomplete variable definition: {key[0]}.{key[1]}")

    for name, semantic_ids in semantics_by_name.items():
        if len(semantic_ids) > 1:
            issues.append(
                f"same environment name has divergent meanings: {name} -> {sorted(semantic_ids)}"
            )

    discovered = discovered_runtime_names()
    for service, names in discovered.items():
        declared = {name for declared_service, name in entries if declared_service == service}
        for name in sorted(names - declared):
            issues.append(f"runtime variable lacks definition: {service}.{name}")
        for name in sorted(declared & RETIRED_NAMES):
            issues.append(f"runtime service declares retired variable: {service}.{name}")

    render = render_environment_names()
    for service, names in render.items():
        declared = {name for declared_service, name in entries if declared_service == service}
        required = {
            name
            for (declared_service, name), entry in entries.items()
            if declared_service == service
            and entry.get("required") in RENDER_REQUIRED_CLASSES[service]
        }
        for name in sorted(required - names):
            issues.append(f"Render omits required service variable: {service}.{name}")
        for name in sorted(names - declared):
            issues.append(f"Render variable lacks service definition: {service}.{name}")
        for name in sorted(names & RETIRED_NAMES):
            issues.append(f"Render declares retired variable: {service}.{name}")

    example_names = re.findall(
        r"(?m)^([A-Z][A-Z0-9_]*)=",
        (REPO_ROOT / "backend" / ".env.example").read_text(encoding="utf-8"),
    )
    declared_backend = {name for service, name in entries if service == "backend_api"}
    if len(example_names) != len(set(example_names)):
        issues.append("backend/.env.example contains duplicate variable names")
    for name in sorted(set(example_names) - declared_backend):
        issues.append(f"backend/.env.example variable lacks definition: {name}")
    for name in sorted(set(example_names) & RETIRED_NAMES):
        issues.append(f"backend/.env.example declares retired variable: {name}")

    mcp_contract = json.loads(
        (REPO_ROOT / "backend" / "mcp_runtime" / "service-contract.json").read_text(
            encoding="utf-8"
        )
    )
    mcp_names = set(mcp_contract["required_environment"]) | set(
        mcp_contract["optional_environment"]
    )
    declared_mcp = {name for service, name in entries if service == "mcp"}
    if mcp_names != declared_mcp:
        issues.append(
            "MCP service contract drift: "
            f"missing={sorted(mcp_names-declared_mcp)} extra={sorted(declared_mcp-mcp_names)}"
        )
    return issues


def main() -> int:
    issues = validate()
    if issues:
        print("Runtime environment contract: BLOCKED")
        for issue in issues:
            print(f"- {issue}")
        return 1
    counts: dict[str, int] = {}
    for entry in _contract()["variables"]:
        counts[entry["service"]] = counts.get(entry["service"], 0) + 1
    print(
        "Runtime environment contract: OK ("
        + ", ".join(f"{service}={count}" for service, count in sorted(counts.items()))
        + ")"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
