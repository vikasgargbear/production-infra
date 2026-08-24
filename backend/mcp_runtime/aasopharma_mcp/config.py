"""Fail-closed configuration for the hosted MCP resource server."""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Mapping
from urllib.parse import urlparse


class ConfigurationError(RuntimeError):
    """Hosted MCP configuration is absent or unsafe."""


def _required(environment: Mapping[str, str], name: str) -> str:
    value = environment.get(name, "").strip()
    if not value:
        raise ConfigurationError(f"missing required MCP setting: {name}")
    return value


def _https_url(environment: Mapping[str, str], name: str) -> str:
    value = _required(environment, name).rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        raise ConfigurationError(f"{name} must be an absolute HTTPS URL without credentials")
    return value


@dataclass(frozen=True)
class Settings:
    supabase_issuer: str
    supabase_audience: str
    supabase_jwks_url: str
    resource_server_url: str
    erp_api_base_url: str
    grant_authorize_url: str
    grant_readiness_url: str
    internal_service_token: str
    pre_registered_client_ids: tuple[str, ...]
    required_scopes: tuple[str, ...]
    bind_host: str
    request_timeout_seconds: float
    allowed_origins: tuple[str, ...]

    @classmethod
    def from_env(cls, environment: Mapping[str, str] | None = None) -> "Settings":
        values = os.environ if environment is None else environment
        issuer = _https_url(values, "SUPABASE_OAUTH_ISSUER")
        resource_url = _https_url(values, "MCP_RESOURCE_SERVER_URL")
        api_url = _https_url(values, "ERP_API_BASE_URL")
        if not resource_url.endswith("/mcp"):
            raise ConfigurationError("MCP_RESOURCE_SERVER_URL must end with /mcp")

        service_token = _required(values, "MCP_INTERNAL_SERVICE_TOKEN")
        if len(service_token) < 32:
            raise ConfigurationError("MCP_INTERNAL_SERVICE_TOKEN is too short")
        audience = "authenticated"
        client_ids = tuple(
            item.strip()
            for item in _required(values, "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS").split(",")
            if item.strip()
        )
        if not client_ids or len(client_ids) > 16 or len(set(client_ids)) != len(client_ids):
            raise ConfigurationError(
                "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS must contain 1..16 unique client IDs"
            )
        if any(len(item) > 255 for item in client_ids):
            raise ConfigurationError("pre-registered OAuth client ID is too long")
        try:
            timeout = float(values.get("MCP_REQUEST_TIMEOUT_SECONDS", "10"))
        except ValueError as exc:
            raise ConfigurationError("MCP_REQUEST_TIMEOUT_SECONDS must be numeric") from exc
        if not 1 <= timeout <= 30:
            raise ConfigurationError("MCP_REQUEST_TIMEOUT_SECONDS must be between 1 and 30")

        bind_host = values.get("MCP_BIND_HOST", "0.0.0.0").strip()
        if bind_host not in {"0.0.0.0", "127.0.0.1", "::"}:
            raise ConfigurationError("MCP_BIND_HOST is not an allowed bind address")

        raw_origins = values.get("MCP_ALLOWED_ORIGINS", "").strip()
        if raw_origins:
            origins: tuple[str, ...] = tuple(
                o.strip() for o in raw_origins.split(",") if o.strip()
            )
            if "*" in origins:
                raise ConfigurationError(
                    "MCP_ALLOWED_ORIGINS cannot contain '*' when credentials are enabled"
                )
            for origin in origins:
                parsed = urlparse(origin)
                if parsed.scheme not in {"https", "http"} or not parsed.netloc:
                    raise ConfigurationError(
                        f"MCP_ALLOWED_ORIGINS entry must be an absolute HTTP(S) URL: {origin!r}"
                    )
                if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
                    raise ConfigurationError(
                        f"MCP_ALLOWED_ORIGINS: non-localhost HTTP origins are not allowed: {origin!r}"
                    )
        else:
            origins = ()

        return cls(
            supabase_issuer=issuer,
            supabase_audience=audience,
            supabase_jwks_url=f"{issuer}/.well-known/jwks.json",
            resource_server_url=resource_url,
            erp_api_base_url=api_url,
            grant_authorize_url=f"{api_url}/api/internal/mcp/agent-grants/authorize",
            grant_readiness_url=f"{api_url}/api/internal/mcp/agent-grants/ready",
            internal_service_token=service_token,
            pre_registered_client_ids=client_ids,
            required_scopes=("openid", "offline_access"),
            bind_host=bind_host,
            request_timeout_seconds=timeout,
            allowed_origins=origins,
        )
