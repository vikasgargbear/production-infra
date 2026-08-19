#!/usr/bin/env python3
"""Idempotently provision the two Render pilot services from reviewed inputs.

Dry-run is the default. Applying changes requires --apply and RENDER_API_KEY.
Deploying after configuration requires the additional --deploy flag.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


API_BASE = "https://api.render.com/v1"
DEFAULT_OWNER_ID = "tea-da2nh58ae00c73ciaqog"
DEFAULT_REPO = "https://github.com/vikasgargbear/production-infra"
DEFAULT_BRANCH = "main"
API_NAME = "aasopharma-api-pilot"
FRONTEND_NAME = "aasopharma-erp-pilot"

BACKEND_REQUIRED = (
    "DATABASE_URL",
    "JWT_SECRET_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
)
SMTP_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD")


class ProvisioningError(RuntimeError):
    pass


@dataclass(frozen=True)
class ServiceRef:
    id: str
    name: str
    type: str
    url: str
    raw: Mapping[str, object]


def load_env_file(path: Optional[Path]) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if path is None:
        return values
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            raise ProvisioningError(f"Invalid env file entry at line {line_number}")
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in values:
            raise ProvisioningError(f"Invalid or duplicate env key at line {line_number}")
        values[key] = value.strip()
    return values


def operator_values(env_file: Optional[Path]) -> Dict[str, str]:
    values = load_env_file(env_file)
    for key in (*BACKEND_REQUIRED, *SMTP_KEYS):
        if os.getenv(key):
            values[key] = os.environ[key]
    missing = [key for key in BACKEND_REQUIRED if not values.get(key, "").strip()]
    if missing:
        raise ProvisioningError(
            "Missing required operator values: " + ", ".join(sorted(missing))
        )
    configured_smtp = [key for key in SMTP_KEYS if values.get(key, "").strip()]
    if configured_smtp and len(configured_smtp) != len(SMTP_KEYS):
        missing_smtp = sorted(set(SMTP_KEYS) - set(configured_smtp))
        raise ProvisioningError(
            "SMTP must be fully configured or omitted; missing: "
            + ", ".join(missing_smtp)
        )
    return values


def backend_env(values: Mapping[str, str], frontend_url: str) -> Dict[str, str]:
    result = {
        "APP_ENV": "production",
        "ENV": "production",
        "DEBUG": "false",
        "LOG_LEVEL": "INFO",
        "LOG_FORMAT": "json",
        "CORS_ORIGINS": frontend_url,
        "APP_URL": frontend_url,
    }
    for key in (*BACKEND_REQUIRED, *SMTP_KEYS):
        if values.get(key):
            result[key] = values[key]
    return result


def frontend_env(values: Mapping[str, str], backend_url: Optional[str]) -> Dict[str, str]:
    result = {
        "REACT_APP_SUPABASE_URL": values["SUPABASE_URL"],
        "REACT_APP_SUPABASE_ANON_KEY": values["SUPABASE_ANON_KEY"],
    }
    if backend_url:
        result["REACT_APP_API_BASE_URL"] = backend_url
    return result


def api_create_payload(
    owner_id: str,
    repo: str,
    branch: str,
    env: Mapping[str, str],
) -> Dict[str, object]:
    return {
        "type": "web_service",
        "name": API_NAME,
        "ownerId": owner_id,
        "repo": repo,
        "branch": branch,
        "autoDeploy": "no",
        "envVars": [{"key": key, "value": value} for key, value in sorted(env.items())],
        "serviceDetails": {
            "runtime": "docker",
            "plan": "free",
            "region": "singapore",
            "healthCheckPath": "/ready",
            "envSpecificDetails": {
                "dockerContext": "./backend",
                "dockerfilePath": "./backend/Dockerfile",
            },
        },
    }


def frontend_create_payload(
    owner_id: str,
    repo: str,
    branch: str,
    env: Mapping[str, str],
) -> Dict[str, object]:
    return {
        "type": "static_site",
        "name": FRONTEND_NAME,
        "ownerId": owner_id,
        "repo": repo,
        "branch": branch,
        "autoDeploy": "no",
        "envVars": [{"key": key, "value": value} for key, value in sorted(env.items())],
        "serviceDetails": {
            "buildCommand": (
                "cd frontend && npm ci && npm run typecheck && "
                "npm run lint:critical && npm run test:ci -- --runInBand && "
                "CI=false npm run build"
            ),
            "publishPath": "./frontend/build",
            "routes": [
                {"type": "rewrite", "source": "/*", "destination": "/index.html"}
            ],
        },
    }


def redacted_payload(payload: Mapping[str, object]) -> Dict[str, object]:
    copy = json.loads(json.dumps(payload))
    for item in copy.get("envVars", []):
        item["value"] = "${" + item["key"] + "}"
    return copy


def normalized_repo_url(value: object) -> str:
    return str(value or "").rstrip("/").removesuffix(".git")


class RenderClient:
    def __init__(self, api_key: str):
        if not api_key:
            raise ProvisioningError("RENDER_API_KEY is required with --apply")
        self.api_key = api_key

    def request(
        self,
        method: str,
        path: str,
        payload: Optional[Mapping[str, object]] = None,
        query: Optional[Mapping[str, object]] = None,
        allow_not_found: bool = False,
    ) -> Optional[object]:
        url = API_BASE + path
        if query:
            url += "?" + urlencode(query, doseq=True)
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            url,
            data=data,
            method=method,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                body = response.read()
                return json.loads(body) if body else None
        except HTTPError as error:
            if allow_not_found and error.code == 404:
                return None
            raise ProvisioningError(
                f"Render API {method} {path} failed with HTTP {error.code}"
            ) from None

    @staticmethod
    def service_ref(value: Mapping[str, object]) -> ServiceRef:
        raw = value.get("service", value)
        details = raw.get("serviceDetails", {}) if isinstance(raw, dict) else {}
        url = raw.get("url") or (details.get("url") if isinstance(details, dict) else None)
        if not isinstance(raw, dict) or not all(raw.get(key) for key in ("id", "name", "type")):
            raise ProvisioningError("Render returned an incomplete service object")
        if not url:
            slug = raw.get("slug")
            url = f"https://{slug}.onrender.com" if slug else ""
        if not url:
            raise ProvisioningError(f"Render service {raw['name']} has no public URL")
        return ServiceRef(
            id=str(raw["id"]),
            name=str(raw["name"]),
            type=str(raw["type"]),
            url=str(url).rstrip("/"),
            raw=raw,
        )

    def find_service(self, owner_id: str, name: str, expected_type: str) -> Optional[ServiceRef]:
        response = self.request(
            "GET",
            "/services",
            query={
                "ownerId": owner_id,
                "name": name,
                "includePreviews": "false",
                "limit": 100,
            },
        )
        matches = []
        for item in response or []:
            service = self.service_ref(item)
            if service.name == name:
                matches.append(service)
        if len(matches) > 1:
            raise ProvisioningError(f"Multiple Render services named {name}")
        if not matches:
            return None
        if matches[0].type != expected_type:
            raise ProvisioningError(
                f"Existing {name} has type {matches[0].type}, expected {expected_type}"
            )
        return matches[0]

    def create_service(self, payload: Mapping[str, object]) -> ServiceRef:
        response = self.request("POST", "/services", payload=payload)
        if not isinstance(response, dict):
            raise ProvisioningError("Render create service returned no object")
        return self.service_ref(response)

    def ensure_auto_deploy_off(self, service: ServiceRef) -> bool:
        if service.raw.get("autoDeploy") in (False, "no"):
            return False
        self.request("PATCH", f"/services/{service.id}", payload={"autoDeploy": "no"})
        return True

    def ensure_service_config(
        self,
        service: ServiceRef,
        repo: str,
        branch: str,
    ) -> bool:
        patch: Dict[str, object] = {}
        if normalized_repo_url(service.raw.get("repo")) != normalized_repo_url(repo):
            patch["repo"] = repo
        if service.raw.get("branch") != branch:
            patch["branch"] = branch

        current = service.raw.get("serviceDetails", {})
        current = current if isinstance(current, dict) else {}
        desired_details: Dict[str, object] = {}
        if service.type == "web_service":
            current_region = current.get("region")
            if current_region and current_region != "singapore":
                raise ProvisioningError(
                    f"Existing {service.name} is in {current_region}; region cannot be patched safely"
                )
            desired = {
                "runtime": "docker",
                "plan": "free",
                "healthCheckPath": "/ready",
                "envSpecificDetails": {
                    "dockerContext": "./backend",
                    "dockerfilePath": "./backend/Dockerfile",
                },
            }
        else:
            desired = {
                "buildCommand": (
                    "cd frontend && npm ci && npm run typecheck && "
                    "npm run lint:critical && npm run test:ci -- --runInBand && "
                    "CI=false npm run build"
                ),
                "publishPath": "./frontend/build",
            }
        for key, value in desired.items():
            if current.get(key) != value:
                desired_details[key] = value
        if desired_details:
            patch["serviceDetails"] = desired_details
        if not patch:
            return False
        self.request("PATCH", f"/services/{service.id}", payload=patch)
        return True

    def ensure_spa_rewrite(self, service: ServiceRef) -> bool:
        if service.type != "static_site":
            raise ProvisioningError("SPA rewrite can only be applied to the static site")
        response = self.request(
            "GET", f"/services/{service.id}/routes", query={"limit": 100}
        )
        routes = []
        for item in response or []:
            route = item.get("route", item) if isinstance(item, dict) else {}
            if isinstance(route, dict):
                routes.append(route)
        expected = {"type": "rewrite", "source": "/*", "destination": "/index.html"}
        if any(all(route.get(key) == value for key, value in expected.items()) for route in routes):
            return False
        if any(route.get("source") == "/*" for route in routes):
            raise ProvisioningError("Existing /* route conflicts with the required SPA rewrite")
        self.request("POST", f"/services/{service.id}/routes", payload=expected)
        return True

    def ensure_env(self, service: ServiceRef, values: Mapping[str, str]) -> bool:
        changed = False
        for key, desired in sorted(values.items()):
            current = self.request(
                "GET",
                f"/services/{service.id}/env-vars/{key}",
                allow_not_found=True,
            )
            current_value = None
            if isinstance(current, dict):
                env_var = current.get("envVar", current)
                if isinstance(env_var, dict):
                    current_value = env_var.get("value")
            if current_value == desired:
                continue
            self.request(
                "PUT",
                f"/services/{service.id}/env-vars/{key}",
                payload={"value": desired},
            )
            changed = True
        return changed

    def deploy(self, service: ServiceRef) -> None:
        self.request(
            "POST",
            f"/services/{service.id}/deploys",
            payload={"clearCache": "do_not_clear"},
        )


def dry_run_plan(owner_id: str, repo: str, branch: str) -> Dict[str, object]:
    placeholders = {key: "${" + key + "}" for key in (*BACKEND_REQUIRED, *SMTP_KEYS)}
    return {
        "mode": "dry_run",
        "workspace": owner_id,
        "create_order": [FRONTEND_NAME, API_NAME],
        "notes": [
            "Create can start an initial deploy even when autoDeploy is no.",
            "The frontend is created first so its exact URL can configure API CORS.",
            "Environment variables are updated per key; unmanaged variables are not deleted.",
            "No post-configuration deploy occurs unless --deploy is supplied.",
        ],
        "frontend_create": redacted_payload(
            frontend_create_payload(owner_id, repo, branch, frontend_env(placeholders, None))
        ),
        "api_create": redacted_payload(
            api_create_payload(
                owner_id,
                repo,
                branch,
                backend_env(placeholders, "${RENDER_FRONTEND_URL_AFTER_CREATE}"),
            )
        ),
        "api_sequence": [
            "GET /services by ownerId and exact name for each service",
            "POST /services for the static site when absent",
            "POST /services for the API when absent",
            "PATCH /services/{serviceId} only for configuration drift",
            "GET /services/{staticSiteId}/routes",
            "POST /services/{staticSiteId}/routes only when the SPA rewrite is absent",
            "GET then PUT /services/{serviceId}/env-vars/{envVarKey} only when changed",
            "POST /services/{serviceId}/deploys only with --deploy",
        ],
    }


def converge(args: argparse.Namespace) -> Dict[str, object]:
    values = operator_values(args.env_file)
    client = RenderClient(os.getenv("RENDER_API_KEY", ""))

    api_service = client.find_service(args.owner_id, API_NAME, "web_service")
    frontend_service = client.find_service(args.owner_id, FRONTEND_NAME, "static_site")

    if frontend_service is None:
        frontend_service = client.create_service(
            frontend_create_payload(
                args.owner_id,
                args.repo,
                args.branch,
                frontend_env(values, api_service.url if api_service else None),
            )
        )

    if api_service is None:
        api_service = client.create_service(
            api_create_payload(
                args.owner_id,
                args.repo,
                args.branch,
                backend_env(values, frontend_service.url),
            )
        )

    changed = {
        API_NAME: client.ensure_auto_deploy_off(api_service),
        FRONTEND_NAME: client.ensure_auto_deploy_off(frontend_service),
    }
    changed[API_NAME] |= client.ensure_service_config(
        api_service, args.repo, args.branch
    )
    changed[FRONTEND_NAME] |= client.ensure_service_config(
        frontend_service, args.repo, args.branch
    )
    changed[FRONTEND_NAME] |= client.ensure_spa_rewrite(frontend_service)
    changed[API_NAME] |= client.ensure_env(
        api_service, backend_env(values, frontend_service.url)
    )
    changed[FRONTEND_NAME] |= client.ensure_env(
        frontend_service, frontend_env(values, api_service.url)
    )

    deployed: List[str] = []
    if args.deploy:
        for service in (api_service, frontend_service):
            client.deploy(service)
            deployed.append(service.name)

    return {
        "mode": "applied",
        "services": {
            API_NAME: {"id": api_service.id, "url": api_service.url, "changed": changed[API_NAME]},
            FRONTEND_NAME: {
                "id": frontend_service.id,
                "url": frontend_service.url,
                "changed": changed[FRONTEND_NAME],
            },
        },
        "deployed": deployed,
    }


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Create/update Render resources")
    parser.add_argument("--deploy", action="store_true", help="Deploy both services after updates")
    parser.add_argument("--env-file", type=Path, help="Operator-owned KEY=VALUE file")
    parser.add_argument("--owner-id", default=DEFAULT_OWNER_ID)
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    args = parser.parse_args(argv)
    if args.deploy and not args.apply:
        parser.error("--deploy requires --apply")
    return args


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = parse_args(argv)
    try:
        result = (
            converge(args)
            if args.apply
            else dry_run_plan(args.owner_id, args.repo, args.branch)
        )
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except ProvisioningError as error:
        print(f"provisioning blocked: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
