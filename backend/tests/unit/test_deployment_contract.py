import json
import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def test_live_promotion_is_exact_sha_canonical_and_disposable_org_bound():
    production = _read(".github/workflows/production-readiness.yml")
    staging = _read(".github/workflows/canonical-staging.yml")

    assert "deploy_render_pilot: ${{ inputs.deploy_canonical_staging && inputs.live18_provider == 'render' }}" in production
    assert "if: inputs.deploy_render_pilot == true" in staging
    assert staging.count("if: inputs.deploy_render_pilot == true") == 3
    provision = staging.split("Provision and exercise the disposable demo organization", 1)[1]
    assert "if [ '${{ inputs.deploy_render_pilot }}' != true ]; then" in provision
    assert "CANONICAL_RENDER_DEPLOY_SHA=not_deployed_ci_api" in provision

    live_job = production.split("\n  live-erp:", 1)[1].split("\n  live-browser-erp:", 1)[0]
    assert "verify_render_pilot_sha.py" in live_job
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_DEPLOY_SHA"' in live_job
    assert "pytest -q backend/tests/live_canonical" in live_job
    assert "backend/tests/live_erp" not in live_job
    assert "PHARMA_CANONICAL_LIVE_TARGET_KIND: disposable_test" in live_job
    assert "PHARMA_CANONICAL_LIVE_PROJECT_REF: rgihahbmkrmhitjdjvev" in live_job
    assert "provision_ephemeral_canonical_live.py provision" in live_job
    assert "PHARMA_CANONICAL_MCP_REVIEWER_ACCESS_TOKEN" in live_job
    assert "PHARMA_CANONICAL_LIVE_DELEGATED_TOKENS_JSON" not in live_job
    assert "PHARMA_CANONICAL_LIVE_FIXTURE_INPUT_JSON" in live_job
    assert "environment: canonical-staging" in live_job
    assert "needs: [canonical-free-staging]" in live_job
    assert "needs.canonical-free-staging.result == 'success'" in live_job
    assert "inputs.provision_canonical_demo" in live_job
    assert "environment: live-erp-test" not in live_job
    assert "Canonical live API reconciliation is securely blocked" in live_job
    assert "PHARMA_CANONICAL_LIVE_TEST_ORG_ID: d3000000-0000-7000-8000-000000000001" in live_job

    browser_job = production.split("\n  live-browser-erp:", 1)[1].split(
        "\n  live-browser-erp-two-user-approvals:", 1
    )[0]
    assert "verify_render_pilot_sha.py" in browser_job
    assert "PLAYWRIGHT_LIVE_BASE_URL: https://aasopharma-erp-pilot.onrender.com" in browser_job
    assert "PLAYWRIGHT_LIVE_EXPECTED_ORG_ID" in browser_job
    assert "PLAYWRIGHT_SALES_CHAIN_FIXTURE" in browser_job
    assert "environment: canonical-staging" in browser_job
    assert "needs: [canonical-free-staging]" in browser_job
    assert "needs.canonical-free-staging.result == 'success'" in browser_job
    assert "inputs.provision_canonical_demo" in browser_job
    assert "environment: live-erp-test" not in browser_job
    assert "canonical-staging-live-browser-identities" in browser_job
    assert "provision --profile core-operator" in browser_job
    assert "Always restore seeded identity and remove disposable Auth user" in browser_job
    for removed_secret in (
        "PLAYWRIGHT_LIVE_EMAIL",
        "PLAYWRIGHT_LIVE_PASSWORD",
        "PLAYWRIGHT_SALES_CHAIN_FIXTURE",
    ):
        assert f"secrets.{removed_secret}" not in browser_job
    browser_environment = browser_job.split("    steps:", 1)[0]
    for admin_secret in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"):
        reference = f"{admin_secret}: ${{{{ secrets.{admin_secret} }}}}"
        assert reference not in browser_environment
        assert browser_job.count(reference) == 2

    two_user_job = production.split("\n  live-browser-erp-two-user-approvals:", 1)[1].split(
        "\n  live18-acceptance:", 1
    )[0]
    assert "verify_render_pilot_sha.py" in two_user_job
    assert "needs: [canonical-free-staging]" in two_user_job
    assert "needs.canonical-free-staging.result == 'success'" in two_user_job
    assert "inputs.provision_canonical_demo" in two_user_job
    assert 'PLAYWRIGHT_LIVE_EXPECTED_ORG_ID: "d3000000-0000-7000-8000-000000000001"' in two_user_job
    assert browser_job.count("group: canonical-staging-live-browser-identities") == 1
    assert live_job.count("group: canonical-staging-live-browser-identities") == 1
    assert two_user_job.count("group: canonical-staging-live-browser-identities") == 1


def test_live_api_mcp_authority_is_ephemeral_and_command_bound():
    workflow = _read(".github/workflows/production-readiness.yml")
    live_job = workflow.split("\n  live-erp:", 1)[1].split(
        "\n  live-browser-erp:", 1
    )[0]
    provisioner = _read("backend/scripts/provision_ephemeral_canonical_live.py")
    demo_provisioner = _read("backend/scripts/provision_canonical_demo.py")
    transport = _read("backend/tests/live_canonical/transport.py")

    assert "secrets.PHARMA_CANONICAL_MCP_ACCESS_TOKEN" not in live_job
    assert "secrets.PHARMA_CANONICAL_LIVE_SERVICE_TOKEN" not in live_job
    assert "secrets.PHARMA_CANONICAL_LIVE_DATABASE_URL" not in live_job
    assert "secrets.PHARMA_CANONICAL_LIVE_DELEGATED_TOKENS_JSON" not in live_job
    assert "secrets.MCP_INTERNAL_SERVICE_TOKEN" in live_job
    assert "secrets.ERP_RUNTIME_PASSWORD" in live_job
    assert "provision --profile two-user-approvals" in live_job
    assert "provision_ephemeral_canonical_live.py provision" in live_job
    assert "provision_ephemeral_canonical_live.py cleanup" in live_job
    assert live_job.index("provision_ephemeral_canonical_live.py cleanup") < live_job.index(
        "provision_ephemeral_browser_identities.py cleanup"
    )
    assert live_job.count("if: always()") >= 3

    assert "_reconcile_client" in provisioner
    assert "_exchange_token" in provisioner
    assert "_exercise_mcp(token, business_flow=False)" in provisioner
    assert "transaction_timestamp()+interval '2 hours'" in provisioner
    assert '"temporary_grants"' in provisioner
    assert "state_path.unlink(missing_ok=True)" in provisioner
    assert "tokens" not in provisioner.split("state = {", 1)[1].split(
        "_write_state(state_path, state)", 1
    )[0]

    assert "/api/internal/mcp/agent-grants/authorize-action" in transport
    assert '"command_request_id": command_request_id' in transport
    assert "delegated_token_path" not in transport
    assert '"denial_org"' in demo_provisioner
    assert "AasoPharma Disposable RLS Denial Tenant" in demo_provisioner
    assert '"rls_denial_organization_id": IDS["denial_org"]' in demo_provisioner


def test_live_browser_two_user_approval_harness_is_explicit_and_ui_driven():
    workflow = _read(".github/workflows/production-readiness.yml")
    package = json.loads(_read("frontend/package.json"))
    spec = _read("frontend/e2e/live-two-user-approval.spec.ts")
    provisioner = _read(
        "backend/scripts/provision_ephemeral_browser_identities.py"
    )

    assert "run_live_erp_two_user_approvals:" in workflow
    assert "inputs.run_live_erp_two_user_approvals" in workflow
    two_user_job = workflow.split("live-browser-erp-two-user-approvals:", 1)[1].split(
        "\n  live18-acceptance:", 1
    )[0]
    assert "environment: canonical-staging" in two_user_job
    assert 'PLAYWRIGHT_LIVE_BASE_URL: "https://aasopharma-erp-pilot.onrender.com"' in two_user_job
    assert "environment: live-erp-test" not in two_user_job
    for long_lived_secret in (
        "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
        "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
        "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
        "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
    ):
        assert f"secrets.{long_lived_secret}" not in two_user_job
    job_environment = two_user_job.split("    steps:", 1)[0]
    for admin_secret in ("SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD"):
        reference = f"{admin_secret}: ${{{{ secrets.{admin_secret} }}}}"
        assert reference not in job_environment
        assert two_user_job.count(reference) == 2
    assert "SUPABASE_SERVICE_ROLE_KEY" not in two_user_job
    assert "canonical-staging-live-browser-identities" in two_user_job
    assert "provision_ephemeral_browser_identities.py" in two_user_job
    assert "provision --profile two-user-approvals" in two_user_job
    assert "Refuse missing or identical maker/checker browser identities" in two_user_job
    for ephemeral_value in (
        "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
        "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
        "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
        "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
    ):
        assert f'test -n "${ephemeral_value}"' in two_user_job
    assert (
        'test "$PLAYWRIGHT_LIVE_REQUESTER_EMAIL" != '
        '"$PLAYWRIGHT_LIVE_REVIEWER_EMAIL"'
    ) in two_user_job
    assert "npm run test:e2e:live:approvals -- --retries=0" in two_user_job
    assert "Require one passed maker/checker journey and complete browser evidence" in two_user_job
    assert 'if len(cases) != 1 or failures or errors or skipped:' in two_user_job
    assert 'if len(screenshots) < 9 or len(traces) < 2:' in two_user_job
    assert 'cleanup --state "$RUNNER_TEMP/canonical-browser-identities.json"' in two_user_job
    cleanup_step = two_user_job.split(
        "Always restore seeded identities and remove disposable Auth users", 1
    )[1]
    assert "if: always()" in cleanup_step
    assert two_user_job.index("npm run test:e2e:live:approvals") < two_user_job.index(
        "Always restore seeded identities and remove disposable Auth users"
    )
    assert two_user_job.index("npm ci") < two_user_job.index(
        "Provision masked disposable maker and checker identities"
    )
    assert "https://*)" in workflow
    assert "npm run test:e2e:live:approvals" in workflow
    assert "live-erp-two-user-approval-evidence" in workflow
    assert 'EXPECTED_PROJECT_REF = "rgihahbmkrmhitjdjvev"' in provisioner
    assert "from provision_staging_mcp_oauth import" in provisioner
    assert "_service_role_key" in provisioner
    assert 'WEB_CLIENT_ID = "aasopharma-erp-web"' in provisioner
    assert "status='suspended'" in provisioner
    assert "_clear_browser_environment()" in provisioner
    assert "_delete_auth_user" in provisioner
    assert "email_confirm" in provisioner
    assert '"password"' in provisioner
    assert 'state["auth_users"].append' in provisioner
    assert '"auth_user_id": auth_user_id' in provisioner

    command = package["scripts"]["test:e2e:live:approvals"]
    assert "PLAYWRIGHT_LIVE_WRITES=true" in command
    assert "live-two-user-approval.spec.ts" in command
    assert "--project=desktop-chrome" in command
    assert "--workers=1" in command

    assert spec.count("browser.newContext") == 2
    assert "requesterEmail === configuration.reviewerEmail" in spec
    assert "Approve — requester posts later" in spec
    assert "Post Approved Return" in spec
    assert "Load immutable preview" in spec
    assert "Approve exact preview" in spec
    assert "Execute Approved Count" in spec
    assert "executeCounts" in spec
    assert "decimalUnits" in spec and "BigInt" in spec
    assert "requester-maker-trace.zip" in spec
    assert "reviewer-checker-trace.zip" in spec
    assert "Purchase Return" in spec
    assert "supplier_invoice_receipt_allocation_id" in spec
    purchase_selector = _read(
        "frontend/src/components/returns/ui/PurchaseReturnSelector.tsx"
    )
    assert '<button' in purchase_selector
    assert 'aria-label={`Select supplier invoice ${invoiceNumber}`}' in purchase_selector
    for forbidden in ("request.newContext", ".request.get(", ".request.post(", "fetch(", "page.evaluate("):
        assert forbidden not in spec


def test_backend_image_is_cloud_run_compatible_and_non_root():
    dockerfile = _read("backend/Dockerfile")
    dockerignore = _read("backend/.dockerignore")

    assert "FROM python:3.11-slim" in dockerfile
    assert "PORT=8080" in dockerfile
    assert "EXPOSE 8080" in dockerfile
    assert "--host 0.0.0.0" in dockerfile
    assert "${PORT:-8080}" in dockerfile
    assert "USER appuser" in dockerfile
    assert dockerfile.index("USER appuser") < dockerfile.index("CMD [")
    assert "HEALTHCHECK" in dockerfile
    assert "/health" in dockerfile
    assert ".env.*" in dockerignore
    assert "venv" in dockerignore
    assert "tests" in dockerignore


def test_cloud_run_template_is_mumbai_bounded_and_probed():
    template = _read("deploy/cloud-run/service.template.yaml")

    assert "asia-south1-docker.pkg.dev/" in template
    assert 'autoscaling.knative.dev/minScale: "0"' in template
    max_scale = int(re.search(
        r'autoscaling\.knative\.dev/maxScale: "(\d+)"', template
    ).group(1))
    concurrency = int(re.search(r"containerConcurrency: (\d+)", template).group(1))
    assert 1 <= max_scale <= 10
    assert 1 <= concurrency <= 40
    assert "timeoutSeconds: 300" in template
    assert template.count("path: /health") == 2
    assert "startupProbe:" in template
    assert "livenessProbe:" in template
    assert "serviceAccountName:" in template


def test_render_blueprint_is_manual_free_and_health_checked():
    blueprint = _read("render.yaml")
    services = blueprint.split("  - type: web")
    backend = next(service for service in services if "aasopharma-api-pilot" in service)
    frontend = next(service for service in services if "aasopharma-erp-pilot" in service)

    assert "name: aasopharma-api-pilot" in backend
    assert "runtime: docker" in backend
    assert "plan: free" in backend
    assert "region: singapore" in backend
    assert "dockerfilePath: ./backend/Dockerfile" in backend
    assert "dockerContext: ./backend" in backend
    assert "healthCheckPath: /ready" in backend
    assert 'autoDeployTrigger: "off"' in backend
    assert "key: PORT" not in backend
    assert "key: APP_URL" in backend

    assert "name: aasopharma-erp-pilot" in frontend
    assert "runtime: static" in frontend
    assert "plan:" not in frontend
    assert "npm run typecheck" in frontend
    assert "npm run lint:critical" in frontend
    assert "npm run test:ci -- --runInBand" in frontend
    assert "CI=false npm run build" in frontend
    assert "staticPublishPath: ./frontend/build" in frontend
    assert "source: /*" in frontend
    assert "destination: /index.html" in frontend
    assert 'autoDeployTrigger: "off"' in frontend
    assert 'key: NODE_VERSION' in frontend
    assert 'value: "22"' in frontend
    assert "key: REACT_APP_API_BASE_URL" in frontend
    assert "key: REACT_APP_SUPABASE_URL" in frontend
    assert "key: REACT_APP_SUPABASE_ANON_KEY" in frontend


def test_render_mcp_service_is_isolated_minimal_and_fail_closed():
    blueprint = _read("render.yaml")
    service = blueprint.split("name: aasopharma-mcp-pilot", 1)[1]

    assert "dockerfilePath: ./backend/mcp_runtime/Dockerfile" in service
    assert "dockerContext: ./backend/mcp_runtime" in service
    assert "healthCheckPath: /health" in service
    assert 'autoDeployTrigger: "off"' in service
    for name in (
        "SUPABASE_OAUTH_ISSUER",
        "MCP_RESOURCE_SERVER_URL",
        "ERP_API_BASE_URL",
        "MCP_INTERNAL_SERVICE_TOKEN",
        "MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS",
    ):
        block = service.split(f"key: {name}", 1)[1].split("- key:", 1)[0]
        assert "sync: false" in block
        assert "value:" not in block
    assert "key: SUPABASE_OAUTH_AUDIENCE" not in service
    assert "SUPABASE_SERVICE_ROLE_KEY" not in service
    assert "key: APP_ENV" not in service
    assert "key: ENV" not in service


def test_render_blueprint_contains_no_runtime_secret_values():
    blueprint = _read("render.yaml")
    backend = blueprint.split("name: aasopharma-api-pilot", 1)[1].split(
        "name: aasopharma-erp-pilot", 1
    )[0]
    secret_names = (
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "SUPABASE_ANON_KEY",
        "SMTP_USER",
        "SMTP_PASSWORD",
    )

    for name in secret_names:
        block = backend.split(f"key: {name}", 1)[1].split("- key:", 1)[0]
        assert "sync: false" in block, name
        assert "value:" not in block, name

    assert "key: SECRET_KEY" not in backend


def test_render_finance_audit_enforces_a_read_only_database_session():
    fixtures = _read("backend/tests/live_erp/conftest.py")
    audit = _read("backend/tests/live_erp/test_live_finance_gst_audit.py")
    runbook = _read("docs/deployment/render.md")

    assert '"PHARMA_LIVE_DATABASE_READ_ONLY", ""' in fixtures
    assert "conn.set_session(readonly=True, autocommit=True)" in fixtures
    assert 'cur.execute("SHOW transaction_read_only")' in fixtures
    assert "require_read_only_database" in audit
    assert "PHARMA_LIVE_DATABASE_READ_ONLY=true" in runbook


def test_render_readiness_requires_database_without_replacing_liveness():
    main = _read("backend/app/main.py")
    dockerfile = _read("backend/Dockerfile")
    blueprint = _read("render.yaml")
    provisioner = _read("backend/scripts/provision_render_pilot.py")

    assert '@app.get("/health")' in main
    assert '@app.get("/ready", include_in_schema=False)' in main
    assert "current_user AS principal" in main
    assert "current_setting('row_security') = 'on' AS row_security" in main
    assert "family(inet_server_addr()) AS address_family" in main
    assert 'DATABASE_TRANSPORT_REQUIREMENT == "supabase_direct_ipv6"' in main
    assert "READINESS_TIMEOUT_SECONDS = 5.0" in main
    assert 'content={"status": "not_ready"}' in main
    assert "/health" in dockerfile
    api_service = blueprint.split("name: aasopharma-api-pilot", 1)[1].split(
        "  - type: web", 1
    )[0]
    mcp_service = blueprint.split("name: aasopharma-mcp-pilot", 1)[1].split(
        "  - type: web", 1
    )[0]
    assert "healthCheckPath: /ready" in api_service
    assert "healthCheckPath: /health" in mcp_service
    assert provisioner.count('"healthCheckPath": "/ready"') == 1
    assert provisioner.count('"healthCheckPath": "/health"') == 1


def test_render_pilot_deploys_from_main_only_after_deterministic_ci_passes():
    workflow = _read(".github/workflows/production-readiness.yml")
    job = workflow.split("  deploy-render-pilot:", 1)[1].split(
        "  production-blockers:", 1
    )[0]

    assert "github.event_name == 'push'" in job
    assert "github.ref == 'refs/heads/main'" in job
    for dependency in (
        "backend-unit",
        "canonical-postgres15",
        "frontend",
        "frontend-dependency-audit",
        "frontend-toolchain-dependency-audit",
        "mcp-sdk-compatibility",
        "production-blockers",
    ):
        assert f"- {dependency}" in job
    assert 'commitId' in job
    assert "$GITHUB_SHA" in job
    assert '"$RENDER_API_URL/ready"' in job
    assert '"$RENDER_MCP_URL/ready"' in job
    assert "secrets.RENDER_API_KEY" in job
    assert "vars.RENDER_API_SERVICE_ID" in job
    assert "vars.RENDER_MCP_SERVICE_ID" in job
    assert "vars.RENDER_FRONTEND_SERVICE_ID" in job


def test_render_pilot_diagnostics_emit_only_allowlisted_deploy_metadata():
    workflow = _read(".github/workflows/production-readiness.yml")
    job = workflow.split("  render-pilot-diagnostics:", 1)[1].split(
        "  deploy-render-pilot:", 1
    )[0]

    assert "vars.RENDER_API_SERVICE_ID" in job
    assert "vars.RENDER_MCP_SERVICE_ID" in job
    assert "vars.RENDER_FRONTEND_SERVICE_ID" in job
    assert "select_latest_deploy(deploy_rows)" in job
    assert 'query={"limit": 20}' in job
    assert '"created_at": deploy.get("createdAt")' in job
    assert '"finished_at": deploy.get("finishedAt")' in job
    assert '"/logs"' not in job
    assert 'get("message"' not in job
    assert "redact(" not in job


def test_free_staging_retries_only_transient_pooler_baseline_failures():
    workflow = _read(".github/workflows/canonical-staging.yml")

    assert "/config/database/pooler" in workflow
    assert "/database/query/read-only" in workflow
    assert "Control plane verified exact canonical revision and topology" in workflow
    assert 'test "$pooler_port" = 6543' in workflow
    assert 'echo "SUPABASE_SESSION_POOLER_PORT=5432"' in workflow
    assert "@${SUPABASE_POOLER_HOST}:${SUPABASE_SESSION_POOLER_PORT}/postgres" in workflow
    bootstrap = workflow.split("Build and mask the staging bootstrap connection", 1)[1].split(
        "Reset canonical data", 1
    )[0]
    assert "${SUPABASE_SESSION_POOLER_PORT}/postgres" in bootstrap
    assert "${SUPABASE_POOLER_PORT}/postgres" not in bootstrap
    assert "Supabase reserves 6543 transaction mode" in bootstrap
    assert "SUPABASE_POOLER_HOST" in workflow
    assert "SUPABASE_POOLER_PORT" in workflow
    assert "pooler.supabase.com:5432" not in workflow
    assert workflow.count("connect_timeout=15") == 7
    assert "application_name=canonical_staging_ci" in workflow
    assert "application_name=canonical_staging_verify" in workflow
    assert workflow.count("gssencmode=disable") >= 2
    assert "for attempt in $(seq 1 3)" in workflow
    assert "Supabase pooler unavailable; retrying baseline connection" in workflow
    assert "OperationalError|econnrefused|connection refused" in workflow
    assert "canceling statement due to (lock|statement) timeout" in workflow
    assert "server didn.t return client encoding" in workflow
    assert "auth_query secret check timed out" in workflow
    assert 'if [ "$baseline_applied" != true ]' in workflow
    assert "rotate_role_passwords:" in workflow
    role_provisioning = workflow.split(
        "Provision isolated staging login credentials", 1
    )[1].split("Verify Alembic-owned canonical command definitions", 1)[0]
    assert "inputs.rotate_role_passwords == true || inputs.reset_disposable_data == true" in role_provisioning
    assert "inputs.provision_demo_data" not in role_provisioning
    assert 're.fullmatch(r"[A-Za-z0-9_-]{48,96}", password)' in workflow
    assert "ALTER ROLE" in role_provisioning
    assert 'session_url = os.environ["PSYCOPG_DATABASE_URL"]' in workflow
    assert "os.environ['SUPABASE_SESSION_POOLER_PORT']" in role_provisioning
    assert "os.environ['SUPABASE_POOLER_PORT']" in role_provisioning
    assert '("session", session_url)' in role_provisioning
    assert '("transaction", transaction_url)' in role_provisioning
    assert "psycopg2.connect(database_url, connect_timeout=10)" in workflow
    assert "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=%s" in workflow
    assert 'sql.SQL("ALTER ROLE {} LOGIN PASSWORD %s")' in workflow
    assert '"erp_regulatory_importer": os.environ["ERP_REGULATORY_IMPORTER_PASSWORD"]' in workflow
    assert "for attempt in range(1, 3)" in role_provisioning
    assert "range(1, 61)" not in workflow
    assert "range(1, 19)" not in workflow
    assert "seq 1 60" not in workflow
    assert "if attempt < 2" in role_provisioning
    assert "Allow rotated credentials to propagate through Supavisor" in workflow
    assert "run: sleep 125" in workflow
    assert "restart_requested" not in workflow
    assert "Canonical staging restart deferred" not in workflow
    assert "def verify_role(role, password, port)" in workflow
    assert "ROLE_POSTURE_QUERY" in workflow
    assert "role.rolpassword IS NOT NULL AS password_present" in workflow
    assert "password_unexpired" in workflow
    assert "Canonical isolated role posture" in workflow
    assert "/network-bans/retrieve" in workflow
    assert "--request POST" in workflow
    assert "Canonical staging network-ban count" in workflow
    assert 'canary_role = "erp_runtime"' in workflow
    assert "verify_role_with_retry(canary_role, canary_password, session_port)" in workflow
    assert "verify_role_with_retry(canary_role, canary_password, transaction_port)" in workflow
    assert "for role, password in expected_roles.items()" in workflow
    assert "for attempt in range(1, 3):" in workflow
    assert "if attempt < 2:" in workflow
    assert "connect_timeout=5&application_name=canonical_staging_verify" in workflow
    assert "Transaction pooler selected after session-mode canary failed" in workflow
    assert "Diagnose bounded Supavisor role verification failure" in workflow
    assert "/analytics/endpoints/logs" in workflow
    assert "source = 'supavisor_logs'" in workflow
    assert "EAUTHQUERY" in workflow
    assert "ECIRCUITBREAKER" in workflow
    assert "CANONICAL_ACTIVE_POOLER_PORT" in workflow
    assert "CANONICAL_ACTIVE_POOLER_MODE" in workflow
    assert 'port="$CANONICAL_ACTIVE_POOLER_PORT"' in workflow
    assert "${CANONICAL_ACTIVE_POOLER_PORT}/postgres" in workflow
    assert 'pooler_mode: $pooler_mode' in workflow
    assert "/database/query\"" not in workflow
    verification = workflow.split(
        "Verify Alembic-owned canonical command definitions", 1
    )[1].split("Verify baseline topology", 1)[0]
    assert "/database/query/read-only" in verification
    assert "Control plane verified Alembic-owned command definitions are current" in verification
    for reviewed_marker in (
        "purchase_order.id,purchase_order.row_version",
        "exact_execute_aggregate_bindings_v2",
        "supplier_invoice.id,supplier_invoice.row_version",
        "sales_invoice.id,sales_invoice.row_version",
        "sales_return.id,sales_return.row_version",
        "purchase_return.id,purchase_return.row_version",
        "sales_invoice_fefo_expiry_date_equivalence_v3",
        "terminal_response_body",
        "return_rounding_current",
        "portal_parser_ownership_current",
        "trade_trigger_helpers_current",
        "inventory_adjustment_persist_current",
        "goods_receipt_date_current",
        "purchase_order_binding_current",
        "runtime_prepare_context_current",
    ):
        assert reviewed_marker in verification
    assert "CREATE OR REPLACE FUNCTION" not in verification
    assert "reconciliation_sql" not in verification
    assert "--single-transaction" not in verification
    assert "generate_canonical_command_definition_migration.py --check" in workflow
    assert "isolated_role_count" in workflow
    assert "unsafe_role_count" in workflow
    baseline_query = workflow.split("baseline_query=$(cat", 1)[1].split("SQL\n", 1)[0]
    assert "rolsuper OR rolcreaterole OR rolbypassrls" in baseline_query
    assert "NOT rolcanlogin" not in baseline_query
    assert "Run canonical rollback fixtures on live free staging" in workflow
    assert (
        're.findall(r"(?m)^canonical demo provisioning failed: (\\{.*\\})$", raw)'
        in workflow
    )
    assert 'detail = "canonical demo failure summary unavailable"' in workflow
    assert "raw[-2800:]" not in workflow
    assert 'detail = ((headlines[-1] + "\\n") if headlines else "")' not in workflow
    assert workflow.count("backend/scripts/safe_ci_log_summary.py") == 2
    assert '--label readiness "$api_log"' in workflow
    assert '--label runtime "$api_log"' in workflow
    assert 'tail -c 3500 "$api_log"' not in workflow
    assert "Canonical CI API traceback" not in workflow
    assert 're.sub(r"Bearer\\s+\\S+"' not in workflow
    assert "PGCONNECT_TIMEOUT=15" in workflow
    assert "statement_timeout=120000" in workflow
    assert "lock_timeout=15000" in workflow
    assert "-name 'test_*.sql' -o -name 'head_test_*.sql'" in workflow
    assert "mapfile -t canonical_fixtures" in workflow
    assert 'test "${#canonical_fixtures[@]}" -gt 0' in workflow
    assert 'test "$fixture_count" = "${#canonical_fixtures[@]}"' in workflow
    assert "timeout --signal=TERM 180s" in workflow
    assert "for attempt in 1 2 3" in workflow
    assert "SSL connection has been closed unexpectedly" in workflow
    assert 'test "$fixture_status" = 124' in workflow
    assert 'test "$fixture_passed" != true' in workflow
    assert (
        "GRANT erp_migration_owner, erp_runtime TO postgres WITH SET TRUE, INHERIT FALSE"
        in workflow
    )
    assert workflow.count("WITH SET TRUE, INHERIT FALSE") == 3
    assert workflow.count("revoke_staging_postgres_set_roles.sh") == 4
    assert workflow.count("migration-owner-runtime") == 1
    assert workflow.count("migration-owner\n") == 3
    assert "cleanup_alembic_on_exit" in workflow
    assert "cleanup_fixture_roles_on_exit" in workflow
    assert "cleanup_demo_role_on_exit" in workflow
    assert "cleanup_demo_on_exit" in workflow
    assert workflow.count("postgres retained unverified") == 9
    assert "unverified migration-owner delegation" in workflow
    assert "unverified fixture role delegation" in workflow
    assert "unverified demo role delegation" in workflow
    assert "cleanup_role_membership EXIT" not in workflow
    assert "cleanup_demo_role_membership' EXIT" not in workflow
    assert 'mutation_boundary: "BEGIN_ROLLBACK_or_read_only"' in workflow


def test_demo_runtime_computes_activation_hash_without_extensions_access():
    provisioner = _read("backend/scripts/provision_canonical_demo.py")
    assert '"sales.order.manage"' in provisioner
    assert '"internal.sequence.allocate"' in provisioner
    assert '"inventory.batch.manage"' in provisioner
    activation = provisioner.split("def activate_demo_product", 1)[1].split(
        "\ndef token", 1
    )[0]

    assert "hashlib.sha256" in activation
    assert "psycopg2.Binary" in activation
    assert "extensions.digest" not in activation

    preflight = provisioner.split("def preflight_sales_order", 1)[1].split(
        "\ndef exercise_sales_order", 1
    )[0]
    assert 'required("ERP_CALCULATOR_DATABASE_URL")' in preflight
    assert "calculator.rollback()" in preflight
    assert "resolve_sales_order_prepare" in preflight
    assert "calculation_documents" in preflight
    assert 'join_transaction_mode="create_savepoint"' in preflight
    assert "outer_transaction.rollback()" in preflight
    assert "SqlAlchemyOperatorActionService" in preflight
    assert "PREPARE_PAYLOAD_MODELS[operation].model_validate(payload)" in provisioner
    assert 'model_dump(mode="python", exclude_none=True)' in provisioner
    assert provisioner.count('"prepared_replay": prepared_replay') == 2
    assert provisioner.count('"approved_replay": approved_replay') == 2
    assert provisioner.count('"executed_replay": executed_replay') == 2
    assert provisioner.count('idempotency_replayed") is not True') == 4
    assert '"customer_contact"' in provisioner
    assert '"supplier_contact"' in provisioner
    assert provisioner.count("INSERT INTO parties.contacts") == 2
    assert "def reconcile_party_master" in provisioner
    assert 're.fullmatch(r"[6-9][0-9]{9}"' in provisioner
    assert 'endswith("@example.invalid")' in provisioner
    canonical_model = json.loads(_read("docs/architecture/canonical-data-model.json"))
    app_contract = json.loads(_read("docs/architecture/app-data-contract.json"))
    for source in ("parties.customers", "parties.suppliers"):
        assert "parties.contacts" in canonical_model["source_mapping"][source]["targets"]
        assert "parties.contacts" in app_contract["legacy_relation_map"][source][
            "also_targets"
        ]
    cross_table_audit = provisioner.split(
        "def reconcile_cross_table_invariants", 1
    )[1].split("\ndef main", 1)[0]
    assert (
        "count(*) FILTER (WHERE EXISTS (\n"
        "                       SELECT 1 FROM core.audit_events audit"
        in cross_table_audit
    )
    assert "LEFT JOIN core.audit_events audit" not in cross_table_audit
    assert "resolve_fefo_dispatch_allocations" in provisioner
    assert "conversion.multiplier" in provisioner
    assert "def calculation_totals" in provisioner
    assert "artifact.status='consumed'" in provisioner
    assert "def assert_calculation_totals" in provisioner
    assert provisioner.count("assert_calculation_totals(") == 7
    assert "demo calculation reconciliation compared too few totals" in provisioner
    assert provisioner.count("returned.net_value_total,returned.gst_taxable_total") == 2
    assert provisioner.count("returned.recipient_assessed_tax_total") >= 2
    assert "row[3] != Decimal(expected_amount)" in provisioner
    assert "row[4] != Decimal(expected_amount)" in provisioner
    assert "executed demo sales dispatch quantities changed" in provisioner
    assert "conversion.conversion_factor" not in provisioner
    assert "ORDER BY batch.expires_on,batch.id" in provisioner
    assert 'dispatch_reconciliation["dispatch_lines"]' in provisioner
    assert 'invoice_reconciliation["dispatch_allocations"]' in provisioner
    assert 'ZoneInfo("Asia/Kolkata")' in provisioner
    assert '"adjustment_date": adjustment_date.isoformat()' in provisioner
    assert 'canonical-staging-cycle-count:' in provisioner
    assert 'f"cycle-count-sheet-{DEMO_RUN_ID}.json"' in provisioner
    assert 'f"inventory_cycle_count_sheet:{DEMO_RUN_ID}"' in provisioner
    assert '"allocated_base_billed_quantity": line["base_billed_quantity"]' in provisioner
    assert '"1000000.00", "INR"' in provisioner
    assert "maximum_amount, currency_code" in provisioner
    assert "demo-v2" in provisioner
    for grant_key in (
        "reviewer_access_grant",
        "operator_access_grant",
        "agent_grant",
        "legacy_approver_agent_grant",
    ):
        assert f'"{grant_key}"' in provisioner
    assert 'f"canonical-staging:{grant_key}:{IDS[\'org\']}:"' in provisioner
    assert 'f"{DEMO_RUN_ID}:{DEMO_RUN_ATTEMPT}"' in provisioner
    assert "SET status='suspended', row_version=row_version+1" in provisioner
    assert "status='active', row_version=agent_grants.row_version+1" in provisioner
    assert "erp_finance_commands.parse_portal_document" in provisioner
    assert "'imported'" in provisioner
    assert "portal lines require parser command provenance" not in provisioner
    portal_seed = provisioner.split("def seed_supplier_invoice_portal_evidence", 1)[1].split(
        "\ndef seed_purchase_return_portal_evidence", 1
    )[0]
    assert "SET CONSTRAINTS ALL DEFERRED" not in portal_seed
    assert "ON CONFLICT (org_id,registration_id,period_start,period_end) DO NOTHING" in portal_seed
    assert "demo GSTR-2B return period was not created or resolved" in portal_seed
    for operation in (
        "sales.dispatch.prepare",
        "sales.invoice.prepare",
        "sales.return.prepare",
        "procurement.purchase_order.prepare",
        "procurement.goods_receipt.prepare",
        "procurement.supplier_invoice.prepare",
        "procurement.purchase_return.prepare",
        "finance.customer_receipt.prepare",
        "finance.supplier_advance.prepare",
        "finance.supplier_payment.prepare",
        "inventory.adjustment.prepare",
    ):
        assert operation in provisioner
    for reconciliation in (
        "party_master_reconciliation",
        "purchase_order_reconciliation",
        "supplier_advance_reconciliation",
        "goods_receipt_reconciliation",
        "batch_release_reconciliation",
        "supplier_invoice_reconciliation",
        "supplier_payment_reconciliation",
        "sales_order_reconciliation",
        "sales_dispatch_reconciliation",
        "sales_invoice_reconciliation",
        "customer_receipt_reconciliation",
        "sales_return_reconciliation",
        "purchase_return_reconciliation",
        "inventory_adjustment_reconciliation",
        "cross_table_reconciliation",
        "unavailable_action_reconciliation",
    ):
        assert reconciliation in provisioner
    assert "import_gst_adjustment_rule_release" in provisioner
    assert "gst-council-return-of-goods-faq.pdf" in provisioner
    assert provisioner.count('"effective_to": ""') >= 2
    adjustment_import = provisioner.split("def import_adjustment_release", 1)[1].split(
        "\ndef seed_business_master", 1
    )[0]
    assert "ADJUSTMENT_SOURCE_PUBLICATION_DATE,\n                SOURCE_RETRIEVED_ON,\n                None," in adjustment_import
    assert '"gst_tax_treatment": "statutory"' in provisioner
    assert "supplier_challan_number" in provisioner
    receipt_payload = provisioner.split("def goods_receipt_payload", 1)[1].split(
        "\ndef seed_supplier_invoice_portal_evidence", 1
    )[0]
    assert '"free_quantity": "5"' in receipt_payload
    supplier_invoice_payload = provisioner.split("def supplier_invoice_payload", 1)[1].split(
        "\ndef supplier_payment_payload", 1
    )[0]
    assert '"free_quantity": "2.5"' in supplier_invoice_payload
    assert '"allocated_base_free_quantity": "2.5"' in supplier_invoice_payload
    assert 'DEMO_UI_FIXTURE_ID = f"{DEMO_RUN_ID}-{DEMO_RUN_ATTEMPT}"' in provisioner
    assert "def seed_supplier_invoice_ui_portal_evidence" in provisioner
    assert 'supplier_invoice_number = f"DEMO-UI-SUP-{DEMO_UI_FIXTURE_ID}"' in provisioner
    assert '"portal_document_line_id": portal_line_id' in provisioner
    assert "def live18_supplier_invoice_purchase_order_payload" in provisioner
    assert "def supplier_invoice_portal_economics" in provisioner
    assert "def _prepared_purchase_order_totals" in provisioner
    preflight_action = provisioner.split("def preflight_action", 1)[1].split(
        "\ndef exercise_action", 1
    )[0]
    assert "calculation.artifacts" not in preflight_action
    assert (
        "_prepared_purchase_order_totals(prepared, service_payload)"
        in preflight_action
    )
    assert '"taxable_amount": economics["gst_taxable_total"]' in provisioner
    assert "supplier_invoice_ui_purchase_order_payload" not in provisioner
    assert "supplier_invoice_ui_goods_receipt_payload" not in provisioner
    assert 'evidence_label="supplier-invoice-ui-fixture"' not in provisioner
    assert "def reconcile_supplier_invoice_ui_fixture" in provisioner
    assert "supplier_invoice_goods_receipt_id" not in provisioner
    assert "remaining_capitalized_value" not in provisioner
    assert "LIVE18_REVIEWED_SCALARS_JSON" in provisioner
    assert "demo supplier-invoice UI fixture portal row was already consumed" in provisioner
    assert '"supplier_invoice_ui_fixture": supplier_invoice_ui_fixture' in provisioner
    assert "dispatch_delivery_challan_number" in provisioner
    assert "purchase_return_delivery_challan_number" in provisioner
    assert "purchase_order.purchase_order_number" in provisioner
    assert "receipt.goods_receipt_number" in provisioner
    assert "balance.average_unit_cost AS moving_weighted_average" in provisioner
    assert "item.principal_amount AS original_amount" in provisioner
    assert "posted_allocation.open_item_id=item.id" in provisioner
    assert "GROUP BY purchase_order.org_id,purchase_order.id" in provisioner
    assert "GROUP BY payment.org_id,payment.id" in provisioner
    assert "jsonb_agg(line.id::text ORDER BY line.line_number)" in provisioner
    assert "array_agg(line.id" not in provisioner
    assert "purchase_order.order_number" not in provisioner
    assert "receipt.receipt_number" not in provisioner
    assert "balance.moving_weighted_average" not in provisioner
    assert "item.original_amount" not in provisioner
    assert "item.outstanding_amount" not in provisioner
    operational_provisioner = provisioner.split("_SAFE_FAILURE_ERROR_CODES", 1)[0]
    assert "COMMAND_ADAPTER_UNAVAILABLE" not in operational_provisioner
    assert '"unavailable_operation_count": 0' in provisioner
    assert 'response.status_code != 503' not in provisioner
    cross_table = provisioner.split("def reconcile_cross_table_invariants", 1)[1].split(
        "\ndef main", 1
    )[0]
    for required_relation in (
        "automation.command_requests",
        "automation.command_approvals",
        "core.audit_events",
        "calculation.artifacts",
        "finance.accounting_events",
        "finance.journal_entries",
        "finance.journal_lines",
        "finance.open_items",
        "finance.allocations",
        "inventory.stock_ledger_entries",
        "inventory.stock_balances",
        "tax.documents",
    ):
        assert required_relation in cross_table
    assert "transaction_debit_total<>transaction_credit_total" in cross_table
    assert "allocated_amount>principal_amount" in cross_table
    assert "ledger_quantity IS DISTINCT FROM balance_quantity" in cross_table
    assert "supply_type='intra_state'" in cross_table
    assert "supply_type='inter_state'" in cross_table
    assert provisioner.count("DEMOB1234C") == 1
    assert provisioner.count("DEMOC5678D") == 5
    assert provisioner.count("27DEMOC5678D1Z5") == 4
    assert "ON CONFLICT (org_id,registration_id,branch_id,effective_from) DO NOTHING" in provisioner
    assert "verify_organization_fiscal_tax_fact" in provisioner
    assert "2026::smallint" in provisioner
    assert "NULL::varchar" in provisioner
    assert "INSERT INTO tax.organization_fiscal_tax_facts" not in provisioner
    assert 'IDS["operator_auth_user"], IDS["org"]' in provisioner
    assert 'IDS["fiscal_fact_evidence"]' in provisioner
    supplier_marker = provisioner.index("88 Synthetic Wholesale Avenue")
    supplier_address = provisioner[
        provisioner.rfind("INSERT INTO parties.addresses", 0, supplier_marker):
        provisioner.index("INSERT INTO parties.tax_registrations", supplier_marker)
    ]
    assert "'registered'" in supplier_address
    assert "ON CONFLICT (org_id,id) DO UPDATE SET" in supplier_address
    fiscal_verification = provisioner.split("def verify_fiscal_tax_fact", 1)[1].split(
        "\ndef activate_demo_product", 1
    )[0]
    assert "set_config('app.request_id', %s, true)" in fiscal_verification
    reconciliation = provisioner.split("def reconcile", 1)[1].split("\ndef main", 1)[0]
    assert "order_row.subtotal" in reconciliation
    assert "order_row.gst_taxable_total" in reconciliation
    assert "order_row.gross_total" not in reconciliation
    assert "order_row.taxable_total" not in reconciliation
    assert "AS line_count" in reconciliation
    assert "GROUP BY order_row.id" not in reconciliation

    workflow = _read(".github/workflows/canonical-staging.yml")
    assert "CANONICAL_DEMO_API_URL=http://127.0.0.1:8090" in workflow
    assert "PYTHONPATH=backend PORT=8090 python3 -m uvicorn" in workflow
    assert "for attempt in 1 2 3 4 5" in workflow
    assert "def verify_role_with_retry(role, password, port):" in workflow
    assert "for attempt in range(1, 3):" in workflow
    assert "Canonical CI API traceback" not in workflow
    assert "Canonical CI API runtime diagnostic" not in workflow
    assert 'safe_ci_log_summary.py --label runtime "$api_log"' in workflow
    assert "postgresql://<redacted>@" not in workflow


def test_free_staging_reset_is_explicit_and_preserves_supabase_schemas():
    workflow = _read(".github/workflows/canonical-staging.yml")
    production_workflow = _read(".github/workflows/production-readiness.yml")

    assert "reset_disposable_data:" in workflow
    assert "if: inputs.reset_disposable_data == true" in workflow
    assert "Refuse any target except the reviewed free staging project" in workflow
    assert "DROP TABLE IF EXISTS public.alembic_version" in workflow
    assert "DROP EXTENSION IF EXISTS btree_gist" in workflow
    assert "GRANT %I TO %I" in workflow
    assert "DROP ROLE IF EXISTS erp_runtime" in workflow
    assert "to_regclass('auth.users') IS NOT NULL" in workflow
    assert "DROP SCHEMA auth" not in workflow
    assert "DROP SCHEMA storage" not in workflow
    assert "reset_canonical_staging:" in production_workflow
    assert (
        "(inputs.deploy_canonical_staging || inputs.provision_canonical_demo)"
        in production_workflow
    )
    assert "reset_disposable_data: ${{ inputs.reset_canonical_staging }}" in production_workflow
    assert "rotate_canonical_staging_roles:" in production_workflow
    assert "rotate_role_passwords: ${{ inputs.rotate_canonical_staging_roles }}" in production_workflow
    assert "refresh_canonical_staging_pooler:" in production_workflow
    assert "refresh_pooler_configuration: ${{ inputs.refresh_canonical_staging_pooler }}" in production_workflow
    assert "refresh_pooler_configuration:" in workflow
    refresh_step = workflow.split(
        "Refresh the reviewed free-tier Supavisor configuration", 1
    )[1].split("Reset canonical data", 1)[0]
    assert "if: inputs.refresh_pooler_configuration == true" in refresh_step
    assert '"default_pool_size":5' in refresh_step
    assert '"pool_mode":"transaction"' in refresh_step
    assert "/config/database/pooler" in refresh_step
    assert "sleep 125" in refresh_step
    assert "ALTER ROLE %I NOLOGIN" in workflow
    assert "pg_catalog.pg_terminate_backend(activity.pid)" in workflow
    assert "activity.usename IN" in workflow
    assert "restart_staging_database:" in workflow
    assert "if: inputs.restart_staging_database == true" in workflow
    assert '"https://api.supabase.com/v1/projects/$CANONICAL_STAGING_PROJECT_REF/restart"' in workflow
    restart_step = workflow.split("Restart the pinned free staging database", 1)[1].split(
        "Install the reviewed migration toolchain", 1
    )[0]
    assert "Supavisor can retain a failed auth-query circuit for up to two minutes" in restart_step
    assert "sleep 125" in restart_step
    assert "restart_canonical_staging:" in production_workflow
    assert "restart_staging_database: ${{ inputs.restart_canonical_staging }}" in production_workflow


def test_reset_emits_hashable_attestation_after_database_postconditions():
    workflow = _read(".github/workflows/canonical-staging.yml")
    postcondition = "SELECT count(*) FROM pg_namespace WHERE nspname IN ('core','sales','erp_security')"
    attestation = "reset-attestation"
    assert postcondition in workflow
    assert "staging-evidence/canonical-staging-reset.json" in workflow
    assert workflow.index(postcondition) < workflow.index(attestation)
    assert '--workflow-run-id "$GITHUB_RUN_ID"' in workflow
    assert '--reviewed-deploy-sha "$reviewed_deploy_sha"' in workflow


def test_registered_readiness_workflow_delegates_promotion_evidence():
    production = _read(".github/workflows/production-readiness.yml")
    evidence = _read(".github/workflows/canonical-application-promotion-evidence.yml")
    assert "capture_canonical_promotion_evidence:" in production
    assert "uses: ./.github/workflows/canonical-application-promotion-evidence.yml" in production
    assert "workflow_call:" in evidence
    assert "confirmation: CAPTURE_CANONICAL_PROMOTION_EVIDENCE" in production


def test_frontend_builds_use_the_reviewed_node_runtime():
    workflow = _read(".github/workflows/production-readiness.yml")
    blueprint = _read("render.yaml")
    package = _read("frontend/package.json")

    node_versions = re.findall(r'node-version: "([^"]+)"', workflow)
    assert len(node_versions) >= 3
    assert set(node_versions) == {"22"}
    assert 'key: NODE_VERSION\n        value: "22"' in blueprint
    assert '"node": ">=22 <25"' in package


def test_production_blockers_target_canonical_promotion_not_retired_bootstrap():
    workflow = _read(".github/workflows/production-readiness.yml")
    job = workflow.split("  production-blockers:", 1)[1].split(
        "  canonical-postgres15:", 1
    )[0]

    for required in (
        "schema_readiness.py --validate-authority",
        "validate_canonical_model.py",
        "check_canonical_artifacts.py",
        "package_canonical_baseline_migration.py",
        "app_data_contract_gate.py --contract-only",
        "mcp_operator_action_contract.py",
        "generate_canonical_baseline.py",
        "canonical_promotion_readiness.py",
        "tax_provider_operational_readiness.py",
        "test_implementation_audit.py",
    ):
        assert required in job

    for legacy_diagnostic in (
        "audit_schema.py",
        "transaction_integrity_audit.py",
        "contract_consistency_audit.py",
        "payment_idempotency_readiness.py",
    ):
        assert legacy_diagnostic not in job


def test_production_database_configuration_fails_closed():
    database = _read("backend/app/core/database.py")

    assert 'os.getenv("DATABASE_URL", "").strip()' in database
    assert "if is_production() and (" in database
    assert "DATABASE_URL must be explicitly configured in production" in database


def test_production_auth_and_origin_configuration_fails_closed():
    main = _read("backend/app/main.py")

    for name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "CORS_ORIGINS", "APP_URL"):
        assert name in main
    assert "Missing required production configuration" in main
    assert "CORS_ORIGINS cannot contain '*'" in main


def test_render_frontend_has_only_public_supabase_auth_configuration():
    blueprint = _read("render.yaml")
    frontend = blueprint.split("name: aasopharma-erp-pilot", 1)[1]

    assert "key: NODE_VERSION\n        value: \"22\"" in frontend

    for name in (
        "REACT_APP_API_BASE_URL",
        "REACT_APP_SUPABASE_URL",
        "REACT_APP_SUPABASE_ANON_KEY",
    ):
        block = frontend.split(f"key: {name}", 1)[1].split("- key:", 1)[0]
        assert "sync: false" in block, name
        assert "value:" not in block, name

    for forbidden in (
        "REACT_APP_SUPABASE_SERVICE_ROLE_KEY",
        "REACT_APP_DATABASE_URL",
        "REACT_APP_JWT_SECRET_KEY",
    ):
        assert forbidden not in frontend


def test_frontend_has_one_backend_origin_variable():
    sources = _read("frontend/src/config/apiBase.ts") + _read(
        "frontend/src/setupProxy.js"
    )

    assert "REACT_APP_API_BASE_URL" in sources
    for legacy in (
        "REACT_APP_API_URL",
        "REACT_APP_BACKEND_URL",
        "REACT_APP_BACKEND_API_URL",
        "RAILWAY_PUBLIC_DOMAIN",
        "__BACKEND_URL",
        "__PHARMA_API_BASE_URL",
    ):
        assert legacy not in sources


def test_frontend_clean_install_has_an_explicit_cra_peer_policy():
    npmrc = _read("frontend/.npmrc")
    package = _read("frontend/package.json")

    assert npmrc.strip() == "legacy-peer-deps=true"
    assert '"node": ">=22 <25"' in package
    assert '"jest-watch-typeahead"' not in package


def test_render_runbook_separates_supabase_and_google_redirects():
    runbook = _read("docs/deployment/render-pilot.md")

    assert "allow that exact origin as a redirect URL" in runbook
    assert "allow `http://localhost:3000`" in runbook
    assert "https://<project-ref>.supabase.co/auth/v1/callback" in runbook
    assert "Do not use wildcard production redirects" in runbook
    assert "master.org_users.auth_user_id" in runbook
    assert "email-only lookup" in runbook


def test_runtime_credentials_only_use_secret_manager_references():
    template = _read("deploy/cloud-run/service.template.yaml")
    secret_names = (
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SMTP_USER",
        "SMTP_PASSWORD",
    )

    for name in secret_names:
        block = template.split(f"- name: {name}", 1)[1].split("- name:", 1)[0]
        assert "valueFrom:" in block, name
        assert "secretKeyRef:" in block, name
        assert re.search(r"\n\s+value:", block) is None, name

    assert "SUPABASE_SERVICE_ROLE_KEY" not in template
    assert "- name: ENV" not in template


def test_cloudflare_pages_build_has_spa_fallback_and_public_api_config_only():
    redirects = _read("frontend/public/_redirects").strip()
    runbook = _read("docs/deployment/google-cloud-run-cloudflare-pages.md")

    assert redirects == "/* /index.html 200"
    assert "Root directory: `frontend`" in runbook
    assert "Build output: `build`" in runbook
    assert "Node version: `20`" in runbook
    assert "No secret belongs in a `REACT_APP_*` variable" in runbook


def test_mcp_shares_the_api_container_or_remains_an_explicit_release_gate():
    main = _read("backend/app/main.py")
    runbook = _read("docs/deployment/google-cloud-run-cloudflare-pages.md")

    if '"/mcp"' in main or "'/mcp'" in main:
        assert "same Cloud Run origin" in runbook
    else:
        assert "`/mcp` check must fail release if the transport is absent" in runbook
        assert "Do not expose\n`/mcp` publicly" in runbook


def test_production_runbook_matches_manual_render_and_fail_closed_migration() -> None:
    runbook = _read("docs/deployment/production.md")

    assert "Render auto-deploy is disabled" in runbook
    assert "deploy-render-pilot" in runbook
    assert "alembic downgrade -1" not in runbook
    assert "alembic downgrade abc123" not in runbook
    assert "no downgrade" in runbook


def test_canonical_staging_oauth_workflow_is_pinned_and_fail_closed() -> None:
    workflow = _read(".github/workflows/canonical-staging.yml")

    assert (
        'test "$CANONICAL_STAGING_PROJECT_REF" = rgihahbmkrmhitjdjvev'
        in workflow
    )
    assert "https://rgihahbmkrmhitjdjvev.supabase.co" in workflow
    redirect_authority = _read("backend/scripts/reconcile_supabase_auth_redirect.py")
    assert '"oauth_server_enabled": True' in redirect_authority
    assert '"oauth_server_allow_dynamic_registration": False' in redirect_authority
    assert '"oauth_server_authorization_path": "/oauth/consent"' in redirect_authority
    assert "for attempt in 1 2 3 4 5" in workflow
    assert "canonical-staging-oauth.json" in workflow
    assert "hosted_consent_origin: $hosted_consent_origin" in workflow
    assert "site_url: $site_url" not in workflow
    assert "provision_staging_mcp_oauth.py --mode client-only" in workflow
    assert "provision_staging_mcp_oauth.py --mode bind-existing-demo" in workflow
    assert "exercise_staging_mcp_oauth.py" in workflow
    bind_step = workflow[
        workflow.index("- name: Exercise hosted OAuth and MCP against the provisioned demo") :
    ]
    bind_step = bind_step[: bind_step.index("\n      - name:", 10)]
    bind = bind_step.index("provision_staging_mcp_oauth.py --mode bind-existing-demo")
    cleanup = bind_step.index(
        "if ! cleanup_oauth_role_membership; then", bind
    )
    exercise = bind_step.index("python3 backend/scripts/exercise_staging_mcp_oauth.py")
    assert "trap cleanup_oauth_role_on_exit EXIT" in bind_step
    assert (
        "revoke_staging_postgres_set_roles.sh migration-owner" in bind_step
    )
    assert bind < cleanup < exercise
    assert "timeout-minutes: 35" in workflow
    assert "SUPABASE_SERVICE_ROLE_KEY" not in workflow

    hosted_business_flow_step = workflow[
        workflow.index("- name: Exercise hosted OAuth and MCP against the provisioned demo"):
    ]
    hosted_business_flow_step = hosted_business_flow_step[
        : hosted_business_flow_step.index("\n      - name:", 10)
    ]
    assert (
        "if: inputs.provision_demo_data == true && inputs.deploy_render_pilot == true"
        in hosted_business_flow_step
    )

    provisioner = _read("backend/scripts/provision_staging_mcp_oauth.py")
    exercise = _read("backend/scripts/exercise_staging_mcp_oauth.py")
    assert 'PROJECT_REF = "rgihahbmkrmhitjdjvev"' in provisioner
    assert '"client_type": "public"' in provisioner
    assert '"token_endpoint_auth_method": "none"' in provisioner
    assert 'headers["apikey"] = token' in provisioner
    assert provisioner.count("include_api_key=True") == 6
    assert "if TEST_CALLBACK in (client.get(\"redirect_uris\") or ())" in provisioner
    assert 'client.get("name")' not in provisioner
    assert '"app_metadata": {' in provisioner
    assert '"organization_id": DEMO_ORG_ID' in provisioner
    assert "canonical-staging-mcp-access:" in provisioner
    assert "canonical-staging-mcp-agent:" in provisioner
    assert "SET status='suspended', row_version=row_version+1" in provisioner
    assert '"oauth_server_allow_dynamic_registration": False' in redirect_authority
    assert '"prompt": "consent"' in exercise
    assert "_revoke_existing_grant(" in exercise
    assert 'f"{ISSUER}/user/oauth/grants"' in exercise
    assert '_decide(session, denial_id, user_access_token, "deny")' in exercise
    assert '"method": "tools/list"' in exercise
    assert '"name": "erp_product_search"' in exercise
    assert '"erp_sales_order_get"' in exercise
    assert '"live_readback_tool"' in exercise
    assert '"live_readback_resource_id"' in exercise
    assert '"live_readback_exact_values"' in exercise
    assert '"live_read_tool_calls": (' in exercise
    assert '["erp_product_search", "erp_customer_search", "erp_sales_order_get"]' in exercise
    assert "CANONICAL_STAGING_MCP_EXERCISE_MODE" in workflow
    assert "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID" in workflow
    assert 'WEB_TEST_AUTH_USER_ENV = "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID"' in provisioner
    assert "web_bindings = cursor.fetchall()" in provisioner
    assert "if len(web_bindings) != 1:" in provisioner
    assert "web_auth_user_id == auth_user_id" in provisioner
    assert '"client-authority-only",' in provisioner
    assert '"client-only",' in provisioner
    assert '"bind-existing-demo",' in provisioner
    assert "Deferred demo grant binding until canonical demo provisioning" in provisioner
    assert "Canonical demo organization must exist before OAuth grant binding" in provisioner
    assert "canonical-staging-web-membership:" in provisioner
    assert "canonical-staging-web-access:" in provisioner
    assert workflow.index("--mode client-only") < workflow.index(
        "Provision and exercise the disposable demo organization"
    )
    assert workflow.index("Provision and exercise the disposable demo organization") < workflow.index(
        "--mode bind-existing-demo"
    )
    assert "boundary_only" in workflow
    assert "business_flow" in workflow
    assert 'exercise_mode not in {"boundary_only", "business_flow"}' in exercise
    assert exercise.index("if not business_flow:") < exercise.index(
        '"name": "erp_product_search"'
    )
    assert "for attempt in range(1, 6):" in exercise
    assert "MCP readiness failed after five checks" in exercise


def test_live18_is_opt_in_exact_sha_external_fixture_and_always_cleaned():
    workflow = _read(".github/workflows/production-readiness.yml")
    browser_spec = _read("frontend/e2e/live18/canonical-live18.spec.ts")
    playwright_config = _read("frontend/e2e/live18/playwright.config.ts")
    assert "run_live18:" in workflow
    assert "live18_provider:" in workflow
    assert "- render" in workflow
    assert "- railway" in workflow
    live18 = workflow.split("\n  live18-acceptance:", 1)[1]

    assert "github.event_name == 'workflow_dispatch' && inputs.run_live18" in live18
    assert "needs: [canonical-free-staging, railway-canonical-staging]" in live18
    assert "needs.canonical-free-staging.result == 'success'" in live18
    assert "needs.railway-canonical-staging.result" in live18
    assert "inputs.provision_canonical_demo }}' != true" in live18
    assert "same-run canonical demo provision" in live18
    recovery_step = "Recover stale Railway-direct identities before demo provisioning"
    demo_step = "Verify exact migration head and provision same-run demo over Railway direct IPv6"
    identity_step = "Provision disposable identities and MCP authority over Railway direct IPv6"
    always_clean_step = "Always clean Railway-direct temporary identities and authorities"
    assert live18.index(recovery_step) < live18.index(demo_step) < live18.index(identity_step)
    recovery = live18[
        live18.index(recovery_step):live18.index(demo_step)
    ]
    assert "live18_railway_database_phase.py cleanup-identities" in recovery
    assert 'touch "$LIVE18_RAILWAY_IDENTITY_ATTEMPTED_PATH"' in recovery
    assert 'rm -f "$LIVE18_RAILWAY_IDENTITY_ATTEMPTED_PATH"' not in recovery
    assert "Railway pre-demo recovery left disposable authority behind" in recovery
    assert "remaining_auth_identity_count" in recovery
    assert "remaining_active_temporary_grant_count" in recovery
    assert "remaining_denial_role_count" in recovery
    assert "remaining_active_denial_authority_count" in recovery
    assert "remaining_denial_auth_binding_count" in recovery
    assert '"api_origin": os.environ["LIVE18_API_ORIGIN"]' in live18
    assert 'scalar_path = Path(os.environ["LIVE18_REVIEWED_SCALARS_INPUT_PATH"])' in live18
    assert '"reviewed_scalars": reviewed_scalars' in live18
    railway_phase = _read("backend/scripts/live18_railway_database_phase.py")
    assert '"PHARMA_CANONICAL_LIVE_API_BASE_URL": _validated_railway_api_origin(' in railway_phase
    assert "def _validated_railway_api_origin(" in railway_phase
    assert "def _reviewed_scalar_environment_value(" in railway_phase
    assert '"LIVE18_REVIEWED_SCALARS_JSON": reviewed_scalar_json' in railway_phase
    assert railway_phase.count(
        "https://aasopharma-api-pilot-production.up.railway.app"
    ) == 1
    postgres_gate = _read("database/canonical/ci/run_alembic_postgres15_gate.sh")
    assert "check_live18_ephemeral_identity_terminal_cleanup.py" in postgres_gate
    assert live18.index(always_clean_step) > live18.index(identity_step)
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_DEPLOY_SHA"' in live18
    assert "verify_live18_deployment_sha.py" in live18
    assert '--provider "$LIVE18_PROVIDER"' in live18
    assert "build-metadata.json" in live18
    assert "aasopharma-api-pilot.onrender.com" in live18
    assert '$api+"/health"' in live18
    assert "vars.RAILWAY_FRONTEND_URL" in live18
    assert "vars.RAILWAY_API_URL" in live18
    assert "vars.RAILWAY_MCP_URL" in live18
    assert (
        'echo "LIVE18_FIXTURE_PATH=$RUNNER_TEMP/live18-reviewed-fixture.json"'
        in live18
    )
    assert (
        'echo "LIVE18_EVIDENCE_DIR=$RUNNER_TEMP/live18-evidence"'
        in live18
    )
    assert "secrets.LIVE18_REVIEWED_SCALARS_JSON" in live18
    assert "secrets.CANONICAL_DEMO_EXPENSE_RECEIPT_BASE64" in live18
    assert "secrets.CANONICAL_DEMO_EXPENSE_RECEIPT_SHA256" in live18
    assert 'printf \'%s\' "$LIVE18_REVIEWED_SCALARS_JSON" > "$LIVE18_REVIEWED_SCALARS_INPUT_PATH"' in live18
    assert ".values.expense_receipt_pdf_path=$path" in live18
    assert "has(\"expense_receipt_pdf_path\")|not" in live18
    assert 'sha256sum "$LIVE18_EXPENSE_RECEIPT_PATH"' in live18
    assert live18.index('sha256sum "$LIVE18_EXPENSE_RECEIPT_PATH"') < live18.index(
        "compile_live18_browser_fixture.py"
    )
    assert "compile_live18_browser_fixture.py" in live18
    assert "--readiness docs/testing/live18-ui-template-readiness.json" in live18
    assert live18.index("provision_ephemeral_canonical_live.py provision") < live18.index(
        "compile_live18_browser_fixture.py"
    )
    assert 'case "$LIVE18_FIXTURE_PATH" in "$GITHUB_WORKSPACE"/*)' in live18
    assert "provision --profile live18" in live18
    assert "LIVE18_DENIAL_ACCESS_TOKEN" in live18
    assert "LIVE18_EXPECTED_DENIAL_ORG_ID" in live18
    assert "LIVE18_RUN_TOKEN: ${{ github.run_id }}-${{ github.run_attempt }}" in live18
    assert "test \"$discovered\" -eq \"$expected\"" in live18
    assert "jq -r '.ready_count' ../docs/testing/live18-ui-template-readiness.json" in live18
    assert "e2e/live18/playwright.config.ts" in live18
    assert "test_browser_evidence_reconciliation.py" in live18
    assert "build_live18_artifact_manifest.py" in live18
    assert "${{ runner.temp }}/live18-upload/live18-evidence-manifest.json" in live18
    upload = live18.split(
        "- name: Upload scrubbed allowlisted live18 evidence only", 1
    )[1]
    assert "${{ runner.temp }}/live18-browser-identities.json" not in upload
    assert "${{ runner.temp }}/live18-playwright" not in upload
    assert "id: live18_browser" in live18
    assert "if: always() && steps.live18_browser.outcome != 'skipped'" in live18
    assert "maxFailures: 0" in playwright_config
    assert "trace: 'off'" in playwright_config
    assert "screenshot: 'off'" in playwright_config
    assert "video: 'off'" in playwright_config
    assert "completed-resources.json" in browser_spec
    assert "persistCompletedResource(contract.id, resourceId)" in browser_spec
    assert "...loadCompletedResources()" in browser_spec
    assert live18.index("provision_ephemeral_canonical_live.py cleanup") < live18.index(
        "provision_ephemeral_browser_identities.py cleanup"
    )
    assert live18.count("if: always()") >= 4
    assert 'rm -f "$LIVE18_FIXTURE_PATH" "$LIVE18_REVIEWED_SCALARS_INPUT_PATH" "$LIVE18_REVIEWED_SCALARS_PATH" "$LIVE18_EXPENSE_RECEIPT_PATH"' in live18
    assert "secrets.LIVE18_REQUESTER" not in live18
    assert "secrets.LIVE18_REVIEWER" not in live18
    assert "secrets.LIVE18_DENIAL_ACCESS_TOKEN" not in live18
