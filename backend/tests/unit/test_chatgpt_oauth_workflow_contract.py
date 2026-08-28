from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/chatgpt-mcp-oauth-client.yml"
AUTH_ADMIN = ROOT / "backend/scripts/supabase_auth_admin.py"
PROVISIONER = ROOT / "backend/scripts/provision_staging_mcp_oauth.py"


def _workflow() -> str:
    return WORKFLOW.read_text(encoding="utf-8")


def test_chatgpt_oauth_workflow_is_manual_only_with_least_permissions() -> None:
    workflow = _workflow()

    assert workflow.startswith("name: Register ChatGPT MCP OAuth client callback\n\n")
    assert "\non:\n  workflow_dispatch:\n" in workflow
    for forbidden_trigger in (
        "  push:",
        "  pull_request:",
        "  schedule:",
        "  workflow_call:",
    ):
        assert forbidden_trigger not in workflow
    assert "permissions:\n  contents: read\n" in workflow
    assert "actions: write" not in workflow
    assert "contents: write" not in workflow
    assert "deployments: write" not in workflow
    assert "id-token: write" not in workflow
    assert "packages: write" not in workflow
    assert "pull-requests: write" not in workflow
    assert "environment: canonical-staging" in workflow
    assert "cancel-in-progress: false" in workflow


def test_chatgpt_oauth_workflow_runs_only_the_bounded_authority_mode() -> None:
    workflow = _workflow()

    assert workflow.count("provision_staging_mcp_oauth.py") == 1
    assert workflow.count("--mode chatgpt-client-authority-only") == 1
    for forbidden_mode in (
        "--mode complete",
        "--mode client-authority-only",
        "--mode client-only",
        "--mode bind-existing-demo",
    ):
        assert forbidden_mode not in workflow
    for forbidden_authority in (
        "PSYCOPG_DATABASE_URL",
        "SUPABASE_DB_PASSWORD",
        "CANONICAL_STAGING_MCP_TEST_PASSWORD",
        "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID",
        "RAILWAY_API_TOKEN",
        "railway ",
        "render ",
    ):
        assert forbidden_authority not in workflow


def test_chatgpt_oauth_workflow_pins_callback_sha_secret_and_evidence() -> None:
    workflow = _workflow()

    callback = "https://chatgpt.com/connector/oauth/_MPTGhIZ1AcM"
    assert workflow.count(callback) == 2
    assert "REVIEWED_SHA: ${{ github.sha }}" in workflow
    assert "ref: ${{ github.sha }}" in workflow
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in workflow
    assert "Type REGISTER_CHATGPT_STATIC_OAUTH_CLIENT" in workflow
    assert (
        'test "$CONFIRMATION" = REGISTER_CHATGPT_STATIC_OAUTH_CLIENT' in workflow
    )
    assert workflow.count("secrets.") == 1
    assert (
        "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}" in workflow
    )
    assert "client_secret" in workflow
    assert '.oauth_client_secret_issued == false' in workflow
    assert ".token_endpoint_auth_method == \"none\"" in workflow
    assert ".pkce_code_challenge_method == \"S256\"" in workflow
    assert ".resource_parameter_required == true" in workflow
    assert 'evidence_dir="$RUNNER_TEMP/chatgpt-mcp-oauth-evidence"' in workflow
    assert (
        'echo "CANONICAL_DEMO_EVIDENCE_DIR=$evidence_dir" >> "$GITHUB_ENV"'
        in workflow
    )
    assert workflow.count('case "$GITHUB_ENV" in') == 2
    assert "uses: actions/upload-artifact@v4" in workflow
    assert "retention-days: 7" in workflow


def test_chatgpt_oauth_workflow_installs_only_pinned_script_dependencies() -> None:
    workflow = _workflow()

    assert workflow.count("python -m pip install") == 1
    assert "jsonschema==4.23.0" in workflow
    assert "psycopg2-binary==2.9.9" in workflow
    assert "requests==2.34.2" in workflow
    assert "backend/requirements.txt" not in workflow
    assert "npm " not in workflow


def test_chatgpt_oauth_workflow_uses_current_supabase_admin_contract() -> None:
    workflow = _workflow()
    auth_admin = AUTH_ADMIN.read_text(encoding="utf-8")
    provisioner = PROVISIONER.read_text(encoding="utf-8")

    assert "python3 backend/scripts/provision_staging_mcp_oauth.py" in workflow
    assert 'return {"apikey": self.secret_key}' in auth_admin
    assert '"Authorization": f"Bearer {self.secret_key}"' not in auth_admin
    assert '"client_name": CLIENT_NAME' in provisioner
    assert '"PUT",\n                f"{endpoint}/{client[\'client_id\']}"' in provisioner
    assert '"PATCH",\n                f"{endpoint}/{client[\'client_id\']}"' not in provisioner
    assert "AUTH_ADMIN_REJECTED (HTTP" not in provisioner
    assert 'f" (HTTP {error.status_code})"' in provisioner
