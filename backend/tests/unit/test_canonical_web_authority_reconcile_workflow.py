import ast
from pathlib import Path
import textwrap


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/canonical-web-authority-reconcile.yml"


def _embedded_remote_source() -> str:
    source = WORKFLOW.read_text(encoding="utf-8")
    return textwrap.dedent(source.split("print(r'''", 1)[1].split("''')", 1)[0])


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
    assert "existing consent receipt capability envelope differs" in source
    assert "transaction_timestamp()+interval '30 days'" in source
    assert "(*row, audit_membership_id) for row in capability_rows" in source
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
        'test "$(jq -r .subject_user_id "$response")" = "$SUBJECT_USER_ID"',
        'test "$(jq -r .mcp_commit_sha "$response")" = "$MCP_REVIEWED_SHA"',
        'test "$(jq -r .capability_count "$response")" = 28',
    ):
        assert contract in source
    assert "staging-chatgpt-mcp-manual-v1" in source
    assert "canonical staging bounded ChatGPT MCP command consent" in source
    assert '"MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS", ""' in source
    assert '.MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS == $client' in source
    assert '.status == "ok" and .git_commit == $sha' in source
    assert '.status == "ready" and (.tools | length) == 64' in source
    assert 'git merge-base --is-ancestor "$MCP_REVIEWED_SHA" origin/main' in source
    assert 'test "$observed_inventory_sha256" = "$MCP_TOOL_INVENTORY_SHA256"' in source
    assert "deployed MCP policy differs from the reviewed envelope" in source


def test_user_authority_reconcile_is_idempotent_for_an_exact_active_grant() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "existing consent receipt differs from the reviewed grant" in source
    assert "existing consent receipt capability envelope differs" in source
    assert "expected_grant = (" in source
    assert "(*row, audit_membership_id) for row in capability_rows" in source
    assert "expires_at=consented_at+interval '30 days'" in source
    assert "consented_at=granted_at" in source
    assert "granted_by_membership_id::text" in source
    assert "created_by_membership_id::text" in source
    assert 'reconciliation_outcome = "unchanged"' in source
    assert 'reconciliation_outcome = "created"' in source
    assert 'f"{consent_text_sha256}"' in source
    assert ") ON CONFLICT (org_id,id) DO NOTHING" in source
    assert '"reconciliation_outcome": reconciliation_outcome' in source


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
    assert "user_row.id=%s" in source
    assert "subject_auth_user_id" in source
    assert "organization_id" in source
    assert "access_grant.scope_kind='organization'" in source
    assert "reviewed user identity lacks one active canonical membership authority" in source


def test_web_authority_reconcile_rolls_back_before_role_cleanup_on_failure() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "except BaseException:" in source
    assert "connection.rollback()" in source
    assert "else:\n                      _leave_migration_owner" in source
    assert "finally:\n                      _leave_migration_owner" not in source


def test_embedded_remote_reconciler_is_valid_python() -> None:
    ast.parse(_embedded_remote_source())


def test_web_authority_rerun_preserves_immutable_grant_scope() -> None:
    remote = _embedded_remote_source()
    tree = ast.parse(remote)
    sql_literals = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str)
    ]
    grant_updates = [
        sql for sql in sql_literals if "UPDATE automation.agent_grants" in sql
    ]

    assert len(grant_updates) == 1
    metadata_update = grant_updates[0]
    assert "client_display_name=%s" in metadata_update
    assert "updated_by_membership_id=%s" in metadata_update
    for immutable_assignment in (
        "subject_membership_id=",
        "client_id=",
        "branch_id=",
        "authorization_mode=",
        "consent_version=",
        "consent_text_hash=",
        "consented_by_membership_id=",
        "consented_at=",
        "granted_by_membership_id=",
        "granted_at=",
        "expires_at=",
    ):
        assert immutable_assignment not in metadata_update
    assert "ON CONFLICT (org_id,id) DO UPDATE" not in remote
    assert "existing reviewed web grant immutable scope differs" in remote
    assert "existing reviewed web grant is not active and unexpired" in remote


def test_web_authority_capability_reconciliation_never_rewrites_consent_bounds() -> None:
    remote = _embedded_remote_source()

    assert "existing capability immutable scope differs" in remote
    assert "missing_capabilities" in remote
    assert "ON CONFLICT (org_id,agent_grant_id,capability_code) DO UPDATE" not in remote
    assert "SET status='revoked',revoked_at=transaction_timestamp()" in remote
    assert "status='active',revoked_at=NULL" not in remote


def test_web_authority_readback_reports_the_preserved_expiry() -> None:
    remote = _embedded_remote_source()

    assert "SELECT expires_at" in remote
    assert "grant_expires_at = cursor.fetchone()[0].isoformat()" in remote
    assert '"grant_expires_at": grant_expires_at' in remote
    assert '"expires_in_days": 30' not in remote
