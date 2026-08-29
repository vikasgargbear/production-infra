import json
from pathlib import Path

from scripts import provision_staging_mcp_oauth as provision


ROOT = Path(__file__).resolve().parents[3]
PLUGIN_ROOT = ROOT / "plugins" / "aasopharma-erp"
MCP_URL = "https://aasopharma-mcp-pilot-production.up.railway.app/mcp"
PUBLIC_CLIENT_ID = "830faf90-83da-4221-90c8-bb533cc2ed21"


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_plugin_packages_the_reviewed_streamable_http_oauth_client() -> None:
    manifest = _json(PLUGIN_ROOT / ".codex-plugin" / "plugin.json")
    mcp_config = _json(PLUGIN_ROOT / ".mcp.json")

    assert manifest["name"] == "aasopharma-erp"
    assert manifest["mcpServers"] == "./.mcp.json"
    assert manifest["version"] == "0.2.0+codex.20260829034551"

    assert mcp_config == {
        "mcpServers": {
            "aasopharma-erp": {
                "type": "http",
                "url": MCP_URL,
                "default_tools_approval_mode": "writes",
                "oauth": {
                    "clientId": PUBLIC_CLIENT_ID,
                    "callbackUrl": provision.REVIEWED_CODEX_DESKTOP_CALLBACK,
                },
            }
        }
    }


def test_repository_marketplace_exposes_only_the_reviewed_plugin() -> None:
    marketplace = _json(ROOT / ".agents" / "plugins" / "marketplace.json")

    assert marketplace == {
        "name": "aasopharma",
        "interface": {"displayName": "AASOPharma"},
        "plugins": [
            {
                "name": "aasopharma-erp",
                "source": {
                    "source": "local",
                    "path": "./plugins/aasopharma-erp",
                },
                "policy": {
                    "installation": "AVAILABLE",
                    "authentication": "ON_INSTALL",
                },
                "category": "Productivity",
            }
        ],
    }
