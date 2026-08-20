from __future__ import annotations

from aasopharma_mcp.config import Settings


def settings() -> Settings:
    return Settings.from_env(
        {
            "SUPABASE_OAUTH_ISSUER": "https://example.supabase.co/auth/v1",
            "MCP_RESOURCE_SERVER_URL": "https://mcp.example.test/mcp",
            "ERP_API_BASE_URL": "https://api.example.test",
            "MCP_INTERNAL_SERVICE_TOKEN": "s" * 48,
            "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS": "chatgpt-installation,claude-installation",
        }
    )
