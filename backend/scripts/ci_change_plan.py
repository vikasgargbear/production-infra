#!/usr/bin/env python3
"""Classify changed repository paths into the smallest safe CI plan."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


AREAS = (
    "backend",
    "frontend",
    "mcp",
    "postgres",
    "backend_dependencies",
    "frontend_dependencies",
    "deploy_api",
    "deploy_mcp",
    "deploy_frontend",
    "deploy_any",
    "release_required",
)


def _matches(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


def classify(paths: list[str], *, release: bool = False) -> dict[str, bool]:
    """Return conservative test boundaries for the supplied repository paths."""

    plan = {area: release for area in AREAS}
    if release:
        return plan

    for raw_path in paths:
        path = raw_path.strip()
        while path.startswith("./"):
            path = path[2:]
        if not path:
            continue

        # Changes to the CI authority or its classifier validate every lane.
        if _matches(path, ".github/workflows") or path in {
            "backend/scripts/ci_change_plan.py",
            "backend/tests/unit/test_ci_change_plan.py",
        }:
            plan.update({area: True for area in AREAS})
            continue

        if _matches(path, "frontend"):
            plan["frontend"] = True
        if (
            _matches(path, "frontend/src")
            or _matches(path, "frontend/public")
            or path in {
                "frontend/package.json",
                "frontend/package-lock.json",
                "frontend/Caddyfile",
                "frontend/Dockerfile",
            }
            or path.startswith("deploy/railway/frontend.")
        ):
            plan["deploy_frontend"] = True
        if path in {"frontend/package.json", "frontend/package-lock.json"}:
            plan["frontend_dependencies"] = True

        if _matches(path, "backend") or _matches(path, "database"):
            plan["backend"] = True
        if (
            _matches(path, "backend/app")
            or _matches(path, "backend/alembic")
            or _matches(path, "backend/scripts")
            or path == "backend/requirements.txt"
            or _matches(path, "docs/architecture/mcp-operator-actions.json")
            or path.startswith("deploy/railway/api.")
        ):
            plan["deploy_api"] = True
        if path in {"backend/requirements.txt", "backend/requirements-dev.txt"}:
            plan["backend_dependencies"] = True

        if (
            _matches(path, "backend/mcp_runtime")
            or _matches(path, "backend/app/api")
            or _matches(path, "backend/app/services")
            or path == "deploy/railway/mcp.railway.json"
            or path == "deploy/railway/mcp.Dockerfile"
        ):
            plan["mcp"] = True
        if _matches(path, "backend/mcp_runtime") or path.startswith(
            "deploy/railway/mcp."
        ):
            plan["deploy_mcp"] = True

        if (
            _matches(path, "database")
            or _matches(path, "backend/alembic")
            or path.startswith("backend/scripts/canonical_")
            or path.startswith("backend/scripts/schema_")
            or path in {
                "deploy/railway/api.railway.json",
                "deploy/railway/api.Dockerfile",
            }
        ):
            plan["postgres"] = True
            plan["release_required"] = True

        if _matches(path, "deploy/control-plane"):
            plan["backend"] = True
            plan["mcp"] = True
            plan["postgres"] = True
            plan["release_required"] = True
        if path.startswith("deploy/railway/frontend."):
            plan["frontend"] = True

    # Database/control-plane revisions need migration and exact-SHA certification;
    # never let the quick pilot lane publish a partially compatible release.
    if plan["release_required"]:
        plan["deploy_api"] = False
        plan["deploy_mcp"] = False
        plan["deploy_frontend"] = False
    plan["deploy_any"] = any(
        plan[area] for area in ("deploy_api", "deploy_mcp", "deploy_frontend")
    )

    return plan


def _changed_paths() -> list[str]:
    payload = sys.stdin.buffer.read()
    if b"\0" in payload:
        values = payload.split(b"\0")
    else:
        values = payload.splitlines()
    return [value.decode("utf-8") for value in values if value]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--release",
        action="store_true",
        help="select every static certification lane",
    )
    parser.add_argument(
        "--github-output",
        type=Path,
        help="append scalar outputs for a GitHub Actions step",
    )
    args = parser.parse_args()

    paths = _changed_paths()
    plan = classify(paths, release=args.release)
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for area in AREAS:
                output.write(f"{area}={'true' if plan[area] else 'false'}\n")
            output.write(f"plan={json.dumps(plan, sort_keys=True, separators=(',', ':'))}\n")
    print(json.dumps({"paths": sorted(paths), "plan": plan}, sort_keys=True))


if __name__ == "__main__":
    main()
