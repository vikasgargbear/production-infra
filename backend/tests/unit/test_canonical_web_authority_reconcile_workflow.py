import ast
from pathlib import Path
import textwrap


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/canonical-web-authority-reconcile.yml"


def test_web_authority_reconcile_is_exact_sha_and_staging_only() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "RECONCILE_CANONICAL_STAGING_WEB_AUTHORITY" in source
    assert "RECONCILE_CANONICAL_STAGING_MCP_AUTHORITY" in source
    assert "group: canonical-staging-live-browser-identities" in source
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in source
    assert 'os.environ.get("RAILWAY_GIT_COMMIT_SHA") != value["expected_sha"]' in source
    assert "refusing web authority reconciliation against production" in source
    assert "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID" in source
    assert 'matching_instance_ids+=("$candidate")' in source
    assert 'test "${#matching_instance_ids[@]}" -eq 1' in source
    assert "Waiting for the exact API instance and SSH key" in source


def test_user_authority_reconcile_keeps_the_bounded_web_envelope() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    for operation in (
        "sales.order.prepare",
        "sales.dispatch.prepare",
        "sales.invoice.prepare",
        "finance.customer_receipt.prepare",
        "finance.customer_cheque_clearance.prepare",
        "finance.customer_cheque_bounce.prepare",
        "sales.return.prepare",
        "finance.adjustment_note.prepare",
        "automation.command.approve",
        "automation.command.execute",
    ):
        assert operation in source
    assert "STATUS_CAPABILITY" in source
    assert 'test "$(jq -r .capability_count "$response")" = 11' in source
    assert "allow_sensitive_read=excluded.allow_sensitive_read" in source
    assert "transaction_timestamp()+interval '30 days'" in source
    assert "capability_code<>ALL(%s::varchar[])" in source
    assert "reviewed user authority did not reconcile exactly" in source


def test_user_authority_reconcile_uses_the_canonical_mcp_envelope() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    for contract in (
        "READ_CAPABILITIES",
        "WRITE_CAPABILITIES",
        "STATUS_CAPABILITY",
        'configured_clients != {target_client_id}',
        'os.environ.get(\n                      "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", ""',
        'test "$(jq -r .client_id "$response")" = "$MCP_CLIENT_ID"',
        'test "$(jq -r .capability_count "$response")" = 28',
    ):
        assert contract in source
    assert "staging-chatgpt-mcp-manual-v1" in source
    assert "canonical staging bounded ChatGPT MCP command consent" in source


def test_web_authority_reconcile_does_not_reset_deploy_or_write_business_data() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    for forbidden in (
        "reset_disposable_data",
        "provision_canonical_demo",
        "railway up",
        "railway redeploy",
        "DROP SCHEMA",
        "TRUNCATE ",
        "DELETE FROM",
        "INSERT INTO sales.",
        "INSERT INTO finance.",
        "INSERT INTO inventory.",
    ):
        assert forbidden not in source


def test_web_authority_reconcile_keeps_secrets_out_of_command_arguments() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert '--arg password "$SUPABASE_DB_PASSWORD"' in source
    assert 'python -c "$remote_code" < "$request" > "$response"' in source
    assert "--database-url" not in source
    assert "::add-mask::" not in source


def test_user_authority_reconcile_uses_canonical_identity_binding_only() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "FROM auth.users" not in source
    assert "user_row.auth_user_id=%s" in source
    assert "reviewed user identity lacks one active canonical membership authority" in source


def test_web_authority_reconcile_rolls_back_before_role_cleanup_on_failure() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "except BaseException:" in source
    assert "connection.rollback()" in source
    assert "else:\n                      _leave_migration_owner" in source
    assert "finally:\n                      _leave_migration_owner" not in source


def test_embedded_remote_reconciler_is_valid_python() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")
    remote = source.split("print(r'''", 1)[1].split("''')", 1)[0]

    ast.parse(textwrap.dedent(remote))
