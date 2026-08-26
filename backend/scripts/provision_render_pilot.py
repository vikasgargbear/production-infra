#!/usr/bin/env python3
"""Idempotently provision the three Render pilot services from reviewed inputs.

Dry-run is the default. Applying changes requires --apply and RENDER_API_KEY.
Deploying after configuration requires the additional --deploy flag.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import re
import socket
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Mapping, Optional
from urllib.error import HTTPError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


API_BASE = "https://api.render.com/v1"
DEFAULT_OWNER_ID = "tea-da2nh58ae00c73ciaqog"
DEFAULT_REPO = "https://github.com/vikasgargbear/production-infra"
DEFAULT_BRANCH = "main"
API_NAME = "aasopharma-api-pilot"
FRONTEND_NAME = "aasopharma-erp-pilot"
MCP_NAME = "aasopharma-mcp-pilot"
REPO_ROOT = Path(__file__).resolve().parents[2]
EVIDENCE_IDENTITY_AUTHORITY = json.loads(
    (
        REPO_ROOT
        / "database/canonical/security/evidence-storage-service-identity.json"
    ).read_text(encoding="utf-8")
)

BACKEND_REQUIRED = (
    "DATABASE_URL",
    "DATABASE_TRANSPORT_REQUIREMENT",
    "DATABASE_POOL_SIZE",
    "DATABASE_MAX_OVERFLOW",
    "ERP_CALCULATOR_DATABASE_URL",
    "TAX_PROVIDER_DATABASE_URL",
    "TAX_PROVIDER_INTERNAL_SERVICE_TOKEN",
    "TAX_PROVIDER_INTERNAL_HMAC_SECRET",
    "JWT_SECRET_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "MCP_INTERNAL_SERVICE_TOKEN",
    "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
    "EVIDENCE_STORAGE_ENABLED",
    "EVIDENCE_STORAGE_EXPECTED_PROJECT_REF",
    "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID",
    "EVIDENCE_STORAGE_SERVICE_EMAIL",
    "EVIDENCE_STORAGE_SERVICE_PASSWORD",
)
MCP_SHARED_REQUIRED = (
    "SUPABASE_OAUTH_ISSUER",
    "MCP_INTERNAL_SERVICE_TOKEN",
    "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
)
MCP_OPTIONAL_KEYS = ("MCP_ALLOWED_ORIGINS",)
OPERATOR_REQUIRED = tuple(dict.fromkeys((*BACKEND_REQUIRED, *MCP_SHARED_REQUIRED)))
SMTP_KEYS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD")
SMTP_OPTIONAL_KEYS = ("SMTP_FROM_EMAIL", "SMTP_FROM_NAME")
MCP_ALLOWED_ENV_KEYS = frozenset(
    {
        "SUPABASE_OAUTH_ISSUER",
        "MCP_RESOURCE_SERVER_URL",
        "ERP_API_BASE_URL",
        "MCP_INTERNAL_SERVICE_TOKEN",
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
        "MCP_ALLOWED_ORIGINS",
        "MCP_BIND_HOST",
        "MCP_REQUEST_TIMEOUT_SECONDS",
    }
)
API_ALLOWED_ENV_KEYS = frozenset(
    {
        "APP_ENV",
        "LOG_LEVEL",
        "LOG_FORMAT",
        "CORS_ORIGINS",
        "APP_URL",
        *BACKEND_REQUIRED,
        *SMTP_KEYS,
        *SMTP_OPTIONAL_KEYS,
    }
)
FRONTEND_ALLOWED_ENV_KEYS = frozenset(
    {
        "NODE_VERSION",
        "REACT_APP_API_BASE_URL",
        "REACT_APP_SUPABASE_URL",
        "REACT_APP_SUPABASE_ANON_KEY",
    }
)
RETIRED_API_ENV_KEYS = frozenset(
    {"EVIDENCE_STORAGE_SERVER_API_KEY", "EVIDENCE_STORAGE_SERVER_JWT"}
)


class ProvisioningError(RuntimeError):
    pass


RENDER_DATABASE_TRANSPORT_REQUIREMENT = "supabase_direct_ipv4"
RENDER_DATABASE_POOL_SIZE = "3"
RENDER_DATABASE_MAX_OVERFLOW = "1"
DATABASE_PRINCIPALS = {
    "DATABASE_URL": "erp_runtime",
    "ERP_CALCULATOR_DATABASE_URL": "erp_calculator",
    "TAX_PROVIDER_DATABASE_URL": "erp_tax_provider",
}
DATABASE_DSN_OVERRIDE_PARAMETERS = frozenset(
    {"host", "port", "dbname", "user", "password", "service", "servicefile"}
)


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


def _direct_ipv4_database_url(
    name: str,
    value: str,
    project_ref: str,
) -> str:
    """Pin one reviewed direct Supabase DSN to a current IPv4 DNS address."""

    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as exc:
        raise ProvisioningError(f"{name} is not a valid direct PostgreSQL URL") from exc
    if (
        parsed.scheme not in {"postgresql", "postgresql+psycopg2"}
        or parsed.username != DATABASE_PRINCIPALS[name]
        or not parsed.password
        or parsed.hostname != f"db.{project_ref}.supabase.co"
        or port != 5432
        or parsed.path != "/postgres"
        or parsed.fragment
    ):
        raise ProvisioningError(
            f"{name} must use its reviewed role on the direct Supabase endpoint"
        )
    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    if DATABASE_DSN_OVERRIDE_PARAMETERS.intersection(
        key for key, _value in query_items
    ):
        raise ProvisioningError(f"{name} contains a connection override")
    if sum(key == "hostaddr" for key, _value in query_items) > 1:
        raise ProvisioningError(f"{name} contains multiple hostaddr values")
    if sum(key == "sslmode" for key, _value in query_items) != 1:
        raise ProvisioningError(f"{name} must contain exactly one TLS mode")
    query = dict(query_items)
    if query.get("sslmode") != "require":
        raise ProvisioningError(f"{name} must require TLS")
    try:
        addresses = {
            str(ipaddress.ip_address(item[4][0]))
            for item in socket.getaddrinfo(
                parsed.hostname,
                port,
                socket.AF_INET,
                socket.SOCK_STREAM,
            )
            if len(item) >= 5
            and item[4]
            and ipaddress.ip_address(item[4][0]).version == 4
            and ipaddress.ip_address(item[4][0]).is_global
        }
    except OSError as exc:
        raise ProvisioningError(
            f"{name} direct Supabase IPv4 DNS resolution failed"
        ) from exc
    if not addresses:
        raise ProvisioningError(
            f"{name} direct Supabase endpoint has no reviewed public IPv4 path"
        )
    configured_hostaddr = query.get("hostaddr")
    if configured_hostaddr:
        try:
            configured_hostaddr = str(ipaddress.ip_address(configured_hostaddr))
        except ValueError as exc:
            raise ProvisioningError(f"{name} hostaddr is invalid") from exc
        if configured_hostaddr not in addresses:
            raise ProvisioningError(
                f"{name} hostaddr is not a current direct Supabase IPv4 path"
            )
    else:
        configured_hostaddr = sorted(addresses)[0]
    normalized_query = [
        (key, item_value)
        for key, item_value in query_items
        if key != "hostaddr"
    ]
    normalized_query.append(("hostaddr", configured_hostaddr))
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(normalized_query),
            "",
        )
    )


def operator_values(env_file: Optional[Path]) -> Dict[str, str]:
    values = load_env_file(env_file)
    for key in (*OPERATOR_REQUIRED, *MCP_OPTIONAL_KEYS, *SMTP_KEYS, *SMTP_OPTIONAL_KEYS):
        if os.getenv(key):
            values[key] = os.environ[key]
    missing = [key for key in OPERATOR_REQUIRED if not values.get(key, "").strip()]
    if missing:
        raise ProvisioningError(
            "Missing required operator values: " + ", ".join(sorted(missing))
        )
    if values["EVIDENCE_STORAGE_ENABLED"] != "true":
        raise ProvisioningError(
            "EVIDENCE_STORAGE_ENABLED must be true for reviewed Render certification"
        )
    expected_project = values["EVIDENCE_STORAGE_EXPECTED_PROJECT_REF"]
    expected_origin = f"https://{expected_project}.supabase.co"
    if values["SUPABASE_URL"].rstrip("/") != expected_origin:
        raise ProvisioningError(
            "canonical evidence storage project authority does not match SUPABASE_URL"
        )
    if values["DATABASE_TRANSPORT_REQUIREMENT"] != (
        RENDER_DATABASE_TRANSPORT_REQUIREMENT
    ):
        raise ProvisioningError(
            "DATABASE_TRANSPORT_REQUIREMENT must be supabase_direct_ipv4 for Render"
        )
    if values["DATABASE_POOL_SIZE"] != RENDER_DATABASE_POOL_SIZE:
        raise ProvisioningError("DATABASE_POOL_SIZE must be 3 for Render")
    if values["DATABASE_MAX_OVERFLOW"] != RENDER_DATABASE_MAX_OVERFLOW:
        raise ProvisioningError("DATABASE_MAX_OVERFLOW must be 1 for Render")
    for database_name in DATABASE_PRINCIPALS:
        values[database_name] = _direct_ipv4_database_url(
            database_name,
            values[database_name],
            expected_project,
        )
    if values["EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID"] != (
        EVIDENCE_IDENTITY_AUTHORITY["auth_user_id"]
    ):
        raise ProvisioningError(
            "canonical evidence storage service Auth user ID drifted"
        )
    if values["EVIDENCE_STORAGE_SERVICE_EMAIL"] != (
        EVIDENCE_IDENTITY_AUTHORITY["email"]
    ):
        raise ProvisioningError(
            "canonical evidence storage service email drifted"
        )
    if re.fullmatch(
        r"[A-Za-z0-9_-]{64,128}",
        values["EVIDENCE_STORAGE_SERVICE_PASSWORD"],
    ) is None:
        raise ProvisioningError(
            "canonical evidence storage requires one generated service password"
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
        "LOG_LEVEL": "INFO",
        "LOG_FORMAT": "json",
        "CORS_ORIGINS": frontend_url,
        "APP_URL": frontend_url,
    }
    for key in (*BACKEND_REQUIRED, *SMTP_KEYS, *SMTP_OPTIONAL_KEYS):
        if values.get(key):
            result[key] = values[key]
    return result


def frontend_env(values: Mapping[str, str], backend_url: Optional[str]) -> Dict[str, str]:
    result = {
        "NODE_VERSION": "22",
        "REACT_APP_SUPABASE_URL": values["SUPABASE_URL"],
        "REACT_APP_SUPABASE_ANON_KEY": values["SUPABASE_ANON_KEY"],
    }
    if backend_url:
        result["REACT_APP_API_BASE_URL"] = backend_url
    return result


def mcp_env(
    values: Mapping[str, str],
    api_url: str,
    mcp_url: Optional[str],
) -> Dict[str, str]:
    result = {
        "SUPABASE_OAUTH_ISSUER": values["SUPABASE_OAUTH_ISSUER"],
        "ERP_API_BASE_URL": api_url.rstrip("/"),
        "MCP_INTERNAL_SERVICE_TOKEN": values["MCP_INTERNAL_SERVICE_TOKEN"],
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": values[
            "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"
        ],
    }
    if mcp_url:
        result["MCP_RESOURCE_SERVER_URL"] = mcp_url.rstrip("/") + "/mcp"
    for key in MCP_OPTIONAL_KEYS:
        if values.get(key):
            result[key] = values[key]
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
            "maxShutdownDelaySeconds": 60,
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


def mcp_create_payload(
    owner_id: str,
    repo: str,
    branch: str,
    env: Mapping[str, str],
) -> Dict[str, object]:
    return {
        "type": "web_service",
        "name": MCP_NAME,
        "ownerId": owner_id,
        "repo": repo,
        "branch": branch,
        "autoDeploy": "no",
        "envVars": [{"key": key, "value": value} for key, value in sorted(env.items())],
        "serviceDetails": {
            "runtime": "docker",
            "plan": "free",
            "region": "singapore",
            "healthCheckPath": "/health",
            "maxShutdownDelaySeconds": 60,
            "envSpecificDetails": {
                "dockerContext": "./backend/mcp_runtime",
                "dockerfilePath": "./backend/mcp_runtime/Dockerfile",
            },
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
            if current_region != "singapore":
                raise ProvisioningError(
                    f"Existing {service.name} region is {current_region or 'unknown'}; "
                    "region cannot be patched safely"
                )
            if service.name == API_NAME:
                docker = {
                    "dockerContext": "./backend",
                    "dockerfilePath": "./backend/Dockerfile",
                }
            elif service.name == MCP_NAME:
                docker = {
                    "dockerContext": "./backend/mcp_runtime",
                    "dockerfilePath": "./backend/mcp_runtime/Dockerfile",
                }
            else:
                raise ProvisioningError(
                    f"Unreviewed Render web service name: {service.name}"
                )
            desired = {
                "runtime": "docker",
                "plan": "free",
                "healthCheckPath": (
                    "/ready" if service.name == API_NAME else "/health"
                ),
                "maxShutdownDelaySeconds": 60,
                "envSpecificDetails": docker,
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

    def retire_env(self, service: ServiceRef, keys: Iterable[str]) -> bool:
        changed = False
        for key in sorted(keys):
            current = self.request(
                "GET",
                f"/services/{service.id}/env-vars/{key}",
                allow_not_found=True,
            )
            if current is None:
                continue
            self.request("DELETE", f"/services/{service.id}/env-vars/{key}")
            changed = True
        return changed

    def require_allowed_env(self, service: ServiceRef, allowed: Iterable[str]) -> None:
        response = self.request(
            "GET", f"/services/{service.id}/env-vars", query={"limit": 100}
        )
        keys = set()
        for item in response or []:
            env_var = item.get("envVar", item) if isinstance(item, dict) else {}
            if isinstance(env_var, dict) and isinstance(env_var.get("key"), str):
                keys.add(env_var["key"])
        unexpected = sorted(keys - set(allowed))
        if unexpected:
            raise ProvisioningError(
                f"Existing {service.name} has unreviewed environment keys: "
                + ", ".join(unexpected)
            )

    def deploy(
        self,
        service: ServiceRef,
        commit_id: str,
        *,
        cancel_stale_deploys: bool = False,
    ) -> Mapping[str, object]:
        history = self.request(
            "GET", f"/services/{service.id}/deploys", query={"limit": 20}
        )
        active_statuses = {
            "created",
            "queued",
            "build_in_progress",
            "update_in_progress",
            "pre_deploy_in_progress",
        }
        stale_active = []
        if isinstance(history, list):
            for item in history:
                deploy = item.get("deploy", item) if isinstance(item, dict) else {}
                commit = deploy.get("commit", {}) if isinstance(deploy, dict) else {}
                if (
                    isinstance(commit, dict)
                    and commit.get("id") == commit_id
                    and deploy.get("status")
                    not in {
                        "build_failed",
                        "update_failed",
                        "pre_deploy_failed",
                        "canceled",
                        "deactivated",
                    }
                ):
                    return {
                        "id": deploy["id"],
                        "status": deploy.get("status", "created"),
                        "reused": True,
                    }
                if (
                    cancel_stale_deploys
                    and isinstance(deploy, dict)
                    and isinstance(deploy.get("id"), str)
                    and deploy.get("status") in active_statuses
                ):
                    stale_active.append(deploy["id"])
        for deploy_id in stale_active:
            self.request(
                "POST",
                f"/services/{service.id}/deploys/{deploy_id}/cancel",
            )
        if stale_active:
            for attempt in range(5):
                remaining = []
                for deploy_id in stale_active:
                    current = self.request(
                        "GET",
                        f"/services/{service.id}/deploys/{deploy_id}",
                    )
                    if (
                        isinstance(current, dict)
                        and current.get("status") in active_statuses
                    ):
                        remaining.append(deploy_id)
                if not remaining:
                    break
                if attempt == 4:
                    raise ProvisioningError(
                        f"Stale deploy cancellation did not settle for {service.name}"
                    )
                time.sleep(15)
        result = None
        for attempt in range(5):
            try:
                result = self.request(
                    "POST",
                    f"/services/{service.id}/deploys",
                    payload={"clearCache": "do_not_clear", "commitId": commit_id},
                )
                break
            except ProvisioningError as error:
                # Render can briefly reject an exact deploy while a resume or
                # configuration-only deployment settles. Retry only that
                # explicit conflict; authentication and other API failures
                # remain immediate hard failures.
                if "HTTP 409" not in str(error) or attempt == 4:
                    raise
                time.sleep(15)
        if not isinstance(result, dict) or not isinstance(result.get("id"), str):
            raise ProvisioningError(
                f"Render did not return a deploy ID for {service.name}"
            )
        return {
            "id": result["id"],
            "status": result.get("status", "queued"),
            "reused": False,
        }


def dry_run_plan(owner_id: str, repo: str, branch: str) -> Dict[str, object]:
    placeholders = {
        key: "${" + key + "}"
        for key in (*OPERATOR_REQUIRED, *MCP_OPTIONAL_KEYS, *SMTP_KEYS, *SMTP_OPTIONAL_KEYS)
    }
    return {
        "mode": "dry_run",
        "workspace": owner_id,
        "create_order": [FRONTEND_NAME, API_NAME, MCP_NAME],
        "notes": [
            "Create can start an initial deploy even when autoDeploy is no.",
            "The frontend is created first so its exact URL can configure API CORS.",
            "MCP is created after API; its exact URL then defines MCP_RESOURCE_SERVER_URL.",
            "API/frontend env is updated per key; MCP refuses any unreviewed env key.",
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
        "mcp_create": redacted_payload(
            mcp_create_payload(
                owner_id,
                repo,
                branch,
                mcp_env(
                    placeholders,
                    "${RENDER_API_URL_AFTER_CREATE}",
                    None,
                ),
            )
        ),
        "api_sequence": [
            "GET /services by ownerId and exact name for each service",
            "POST /services for the static site when absent",
            "POST /services for the API when absent",
            "POST /services for MCP when absent",
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
    mcp_service = client.find_service(args.owner_id, MCP_NAME, "web_service")

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

    if mcp_service is None:
        mcp_service = client.create_service(
            mcp_create_payload(
                args.owner_id,
                args.repo,
                args.branch,
                mcp_env(values, api_service.url, None),
            )
        )

    changed = {
        API_NAME: client.ensure_auto_deploy_off(api_service),
        FRONTEND_NAME: client.ensure_auto_deploy_off(frontend_service),
        MCP_NAME: client.ensure_auto_deploy_off(mcp_service),
    }
    changed[API_NAME] |= client.ensure_service_config(
        api_service, args.repo, args.branch
    )
    changed[FRONTEND_NAME] |= client.ensure_service_config(
        frontend_service, args.repo, args.branch
    )
    changed[MCP_NAME] |= client.ensure_service_config(
        mcp_service, args.repo, args.branch
    )
    changed[FRONTEND_NAME] |= client.ensure_spa_rewrite(frontend_service)
    if getattr(args, "evidence_credential_cutover_phase", "prepare") == "retire":
        changed[API_NAME] |= client.retire_env(api_service, RETIRED_API_ENV_KEYS)
        api_allowed_env_keys = API_ALLOWED_ENV_KEYS
    else:
        # The legacy variables remain available to the old suspended artifact
        # until the exact-SHA backend proves its service-user storage path.
        # The dedicated proof-gated retirement command removes them later.
        api_allowed_env_keys = API_ALLOWED_ENV_KEYS | RETIRED_API_ENV_KEYS
    client.require_allowed_env(api_service, api_allowed_env_keys)
    client.require_allowed_env(frontend_service, FRONTEND_ALLOWED_ENV_KEYS)
    changed[API_NAME] |= client.ensure_env(
        api_service, backend_env(values, frontend_service.url)
    )
    changed[FRONTEND_NAME] |= client.ensure_env(
        frontend_service, frontend_env(values, api_service.url)
    )
    client.require_allowed_env(mcp_service, MCP_ALLOWED_ENV_KEYS)
    changed[MCP_NAME] |= client.ensure_env(
        mcp_service, mcp_env(values, api_service.url, mcp_service.url)
    )

    deployed: Dict[str, Mapping[str, object]] = {}
    if args.deploy:
        if not args.commit_id:
            raise ProvisioningError("--deploy requires --commit-id")
        requested_services = set(getattr(args, "deploy_service", ()) or ())
        services = (api_service, frontend_service, mcp_service)
        selected_services = (
            tuple(service for service in services if service.name in requested_services)
            if requested_services
            else services
        )
        for service in selected_services:
            deployed[service.name] = client.deploy(
                service,
                args.commit_id,
                cancel_stale_deploys=getattr(args, "cancel_stale_deploys", False),
            )

    return {
        "mode": "applied",
        "services": {
            API_NAME: {"id": api_service.id, "url": api_service.url, "changed": changed[API_NAME]},
            FRONTEND_NAME: {
                "id": frontend_service.id,
                "url": frontend_service.url,
                "changed": changed[FRONTEND_NAME],
            },
            MCP_NAME: {
                "id": mcp_service.id,
                "url": mcp_service.url,
                "changed": changed[MCP_NAME],
            },
        },
        "deployed": deployed,
    }


def parse_args(argv: Optional[Iterable[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Create/update Render resources")
    parser.add_argument("--deploy", action="store_true", help="Deploy all three services after updates")
    parser.add_argument("--env-file", type=Path, help="Operator-owned KEY=VALUE file")
    parser.add_argument("--owner-id", default=DEFAULT_OWNER_ID)
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--branch", default=DEFAULT_BRANCH)
    parser.add_argument(
        "--commit-id",
        help="Exact reviewed Git commit to deploy (required with --deploy)",
    )
    parser.add_argument(
        "--deploy-service",
        action="append",
        choices=(API_NAME, FRONTEND_NAME, MCP_NAME),
        help="Deploy only this service; repeat as needed (default: all three)",
    )
    parser.add_argument(
        "--cancel-stale-deploys",
        action="store_true",
        help="Cancel non-target active deploys for explicitly selected services",
    )
    parser.add_argument(
        "--evidence-credential-cutover-phase",
        choices=("prepare", "retire"),
        default="prepare",
        help=(
            "Preserve legacy evidence variables during deployment preparation; "
            "retirement is allowed only at the separately proof-gated boundary"
        ),
    )
    args = parser.parse_args(argv)
    if args.deploy and not args.apply:
        parser.error("--deploy requires --apply")
    if args.deploy and not args.commit_id:
        parser.error("--deploy requires --commit-id")
    if args.cancel_stale_deploys and not args.deploy_service:
        parser.error("--cancel-stale-deploys requires --deploy-service")
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
