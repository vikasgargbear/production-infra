#!/usr/bin/env python3
"""Validate the isolated official-SDK MCP transport and bounded registry."""

from __future__ import annotations

import argparse
import ast
import importlib.metadata
import json
import sys
from pathlib import Path
from typing import Dict, Iterable, List

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version


ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = ROOT / "backend/mcp_runtime"
BACKEND_REQUIREMENTS = ROOT / "backend/requirements.txt"
REGISTRY_SOURCE = ROOT / "backend/app/core/api_contract.py"
EXPECTED_CORE_READ_TOOLS = {
    "erp_product_search",
    "erp_supplier_search",
    "erp_gst_settings_get",
}
SERVICE_CONTRACT = RUNTIME_ROOT / "service-contract.json"


def expected_runtime_tools() -> set[str]:
    contract = json.loads(SERVICE_CONTRACT.read_text(encoding="utf-8"))
    return set(contract["tools"])
SHARED_RUNTIME_PACKAGES = {
    "fastapi",
    "pydantic",
    "pyjwt",
    "python-multipart",
    "starlette",
    "uvicorn",
}


def read_exact_pins(path: Path) -> Dict[str, Version]:
    pins: Dict[str, Version] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or "==" not in line:
            continue
        requirement = Requirement(line)
        versions = [item.version for item in requirement.specifier if item.operator == "=="]
        if len(versions) == 1:
            pins[canonicalize_name(requirement.name)] = Version(versions[0])
    return pins


def incompatible_shared_pins(
    backend_pins: Dict[str, Version], sdk_requirements: Iterable[str]
) -> List[Dict[str, str]]:
    conflicts: List[Dict[str, str]] = []
    for requirement_text in sdk_requirements:
        requirement = Requirement(requirement_text)
        if requirement.marker and not requirement.marker.evaluate():
            continue
        name = canonicalize_name(requirement.name)
        if name not in SHARED_RUNTIME_PACKAGES or name not in backend_pins:
            continue
        pinned = backend_pins[name]
        if requirement.specifier and not requirement.specifier.contains(
            pinned, prereleases=True
        ):
            conflicts.append(
                {
                    "package": name,
                    "backend_pin": str(pinned),
                    "sdk_requirement": str(requirement.specifier),
                }
            )
    return sorted(conflicts, key=lambda item: item["package"])


def registry_tool_names(path: Path) -> List[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    tools: List[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        function_name = getattr(node.func, "id", None)
        if function_name != "OperationContract":
            continue
        values = {keyword.arg: keyword.value for keyword in node.keywords if keyword.arg}
        exported = values.get("mcp_export")
        tool_name = values.get("tool_name")
        if isinstance(exported, ast.Constant) and exported.value is True:
            if not isinstance(tool_name, ast.Constant) or not isinstance(tool_name.value, str):
                raise RuntimeError("Exported registry operation has no literal tool_name")
            tools.append(tool_name.value)
    return sorted(tools)


def probe_official_sdk() -> str:
    from mcp.server.mcpserver import MCPServer

    server = MCPServer("aasopharma-compatibility-gate")
    sdk_app = server.streamable_http_app(
        stateless_http=True,
        json_response=True,
        streamable_http_path="/",
    )
    if not callable(sdk_app):
        raise RuntimeError("Official SDK did not return an ASGI application")
    sys.path.insert(0, str(RUNTIME_ROOT))
    try:
        from aasopharma_mcp.server import create_app, registered_tool_names
    finally:
        sys.path.pop(0)
    if not callable(create_app) or set(registered_tool_names()) != expected_runtime_tools():
        raise RuntimeError("isolated MCP service drifted from the reviewed registry")
    return importlib.metadata.version("mcp")


def build_report(probe_sdk: bool) -> Dict[str, object]:
    tools = registry_tool_names(REGISTRY_SOURCE)
    if set(tools) != EXPECTED_CORE_READ_TOOLS:
        raise RuntimeError(f"core MCP read registry drift: {tools}")

    sdk_version = None
    sdk_requirements: Iterable[str] = ()
    if probe_sdk:
        sdk_version = probe_official_sdk()
        sdk_requirements = importlib.metadata.requires("mcp") or ()

    conflicts = incompatible_shared_pins(
        read_exact_pins(BACKEND_REQUIREMENTS), sdk_requirements
    )
    if probe_sdk and not conflicts:
        raise RuntimeError(
            "SDK dependency conflict is no longer present; reassess an authenticated mount"
        )

    return {
        "status": "isolated_bounded_operator_transport_source",
        "python": ".".join(map(str, sys.version_info[:3])),
        "official_sdk_version": sdk_version,
        "registry_tools": sorted(expected_runtime_tools()),
        "write_tools_exported": True,
        "mcp_transport_implemented": True,
        "transport": "official_sdk_streamable_http_stateless",
        "authentication": "supabase_asymmetric_jwks_issuer_audience",
        "authorization": "application_owned_agent_grants_per_tool",
        "shared_runtime_conflicts": conflicts,
        "remaining_blockers": [
            "official SDK remains isolated from the legacy FastAPI dependency pins",
            "Supabase DCR remains disabled; clients require reviewed pre-registration",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--probe-sdk",
        action="store_true",
        help="Import and construct the installed official SDK ASGI application",
    )
    args = parser.parse_args()
    print(json.dumps(build_report(args.probe_sdk), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
