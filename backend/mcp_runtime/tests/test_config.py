from __future__ import annotations

import pytest

from aasopharma_mcp.config import ConfigurationError, Settings


BASE = {
    "SUPABASE_OAUTH_ISSUER": "https://example.supabase.co/auth/v1",
    "MCP_RESOURCE_SERVER_URL": "https://mcp.example.test/mcp",
    "ERP_API_BASE_URL": "https://api.example.test",
    "MCP_INTERNAL_SERVICE_TOKEN": "s" * 48,
    "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": "chatgpt-installation,claude-installation",
}


def test_hosted_configuration_is_minimal_and_derived() -> None:
    settings = Settings.from_env(BASE)

    assert settings.supabase_audience == "authenticated"
    assert settings.supabase_jwks_url == (
        "https://example.supabase.co/auth/v1/.well-known/jwks.json"
    )
    assert settings.grant_authorize_url == (
        "https://api.example.test/api/internal/mcp/agent-grants/authorize"
    )
    assert settings.grant_readiness_url == (
        "https://api.example.test/api/internal/mcp/agent-grants/ready"
    )


@pytest.mark.parametrize("missing", sorted(BASE))
def test_every_hosted_setting_is_required(missing: str) -> None:
    environment = dict(BASE)
    del environment[missing]
    with pytest.raises(ConfigurationError):
        Settings.from_env(environment)


def test_http_and_wrong_resource_audience_are_rejected() -> None:
    environment = dict(BASE, MCP_RESOURCE_SERVER_URL="http://mcp.example.test/mcp")
    with pytest.raises(ConfigurationError, match="HTTPS"):
        Settings.from_env(environment)

    environment = dict(BASE, MCP_RESOURCE_SERVER_URL="https://mcp.example.test/not-mcp")
    with pytest.raises(ConfigurationError, match="end with /mcp"):
        Settings.from_env(environment)


def test_oauth_audience_is_not_an_environment_override() -> None:
    settings = Settings.from_env(dict(BASE, SUPABASE_OAUTH_AUDIENCE="unsafe-custom-audience"))
    assert settings.supabase_audience == "authenticated"
