import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


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
    assert 'text("SELECT 1")' in main
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
    )[1].split("Reconcile reviewed command definitions", 1)[0]
    assert "inputs.rotate_role_passwords == true || inputs.reset_disposable_data == true" in role_provisioning
    assert "inputs.provision_demo_data" not in role_provisioning
    assert "ROTATE_ROLE_PASSWORDS: ${{ inputs.rotate_role_passwords || inputs.reset_disposable_data }}" in workflow
    assert 'rotate_passwords = os.environ["ROTATE_ROLE_PASSWORDS"].lower() == "true"' in workflow
    assert "SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=%s" in workflow
    assert "if rotate_passwords" in workflow
    assert 'sql.SQL("ALTER ROLE {} LOGIN PASSWORD %s")' in workflow
    assert 'sql.SQL("ALTER ROLE {} LOGIN")' in workflow
    assert "elif posture[0] is not True" in workflow
    assert '"erp_regulatory_importer": os.environ["ERP_REGULATORY_IMPORTER_PASSWORD"]' in workflow
    assert "for attempt in range(1, 6)" in workflow
    assert "range(1, 61)" not in workflow
    assert "range(1, 19)" not in workflow
    assert "seq 1 60" not in workflow
    assert 'os.environ["PSYCOPG_DATABASE_URL"], connect_timeout=5' in workflow
    assert "if attempt < 5" in workflow
    assert "restart_requested" not in workflow
    assert "Canonical staging restart deferred" not in workflow
    assert "def verify_role(role, password, port)" in workflow
    assert 'canary_role = "erp_runtime"' in workflow
    assert "verify_role(canary_role, canary_password, session_port)" in workflow
    assert "verify_role(canary_role, canary_password, transaction_port)" in workflow
    assert "for role, password in expected_roles.items()" in workflow
    assert "for attempt in range(1, 3)" not in workflow
    assert "connect_timeout=5&application_name=canonical_staging_verify" in workflow
    assert "Transaction pooler selected after session-mode canary failed" in workflow
    assert "CANONICAL_ACTIVE_POOLER_PORT" in workflow
    assert "CANONICAL_ACTIVE_POOLER_MODE" in workflow
    assert 'port="$CANONICAL_ACTIVE_POOLER_PORT"' in workflow
    assert "${CANONICAL_ACTIVE_POOLER_PORT}/postgres" in workflow
    assert 'pooler_mode: $pooler_mode' in workflow
    assert "/database/query\"" not in workflow
    reconciliation = workflow.split(
        "Reconcile reviewed command definitions on pre-cutover staging", 1
    )[1].split("Verify baseline topology", 1)[0]
    assert "/database/query/read-only" in reconciliation
    assert "Control plane verified reviewed command definitions are already current" in reconciliation
    assert ".core_current? == true and .automation_current? == true" in reconciliation
    assert ".trade_current? == true and .compliance_current? == true" in reconciliation
    assert ".plumbing_current? == true" in reconciliation
    assert reconciliation.count("CREATE OR REPLACE FUNCTION") == 1
    assert '"erp_core_commands"."allocate_document_number"' in reconciliation
    assert '"erp_automation_commands"."execute_approved_command"' in reconciliation
    assert '"erp_trade_commands"."finish_claim"' in reconciliation
    assert '"erp_compliance_commands"."finish_claim"' in reconciliation
    assert '"erp_plumbing"."enqueue_state_outbox"' in reconciliation
    assert 'artifact.get("platform_enforcements")' in reconciliation
    assert "terminal_response_body" in reconciliation
    assert "outbox_aggregate_id" in reconciliation
    assert '"t|t|t|t|t"' in reconciliation
    assert "SET ROLE erp_migration_owner" in reconciliation
    assert "GRANT erp_migration_owner TO postgres WITH SET TRUE" in reconciliation
    assert "GRANT erp_migration_owner TO postgres WITH SET FALSE" in reconciliation
    assert "--single-transaction" in reconciliation
    assert "pg_catalog.greatest(" in reconciliation
    assert "pg_catalog.least(" in reconciliation
    assert "isolated_role_count" in workflow
    assert "unsafe_role_count" in workflow
    baseline_query = workflow.split("baseline_query=$(cat", 1)[1].split("SQL\n", 1)[0]
    assert "rolsuper OR rolcreaterole OR rolbypassrls" in baseline_query
    assert "NOT rolcanlogin" not in baseline_query
    assert "Run canonical rollback fixtures on live free staging" in workflow
    assert "PGCONNECT_TIMEOUT=15" in workflow
    assert "statement_timeout=120000" in workflow
    assert "lock_timeout=15000" in workflow
    assert "test \"$fixture_count\" = 14" in workflow
    assert (
        "GRANT erp_migration_owner, erp_runtime TO postgres WITH SET TRUE"
        in workflow
    )
    assert (
        "GRANT erp_migration_owner, erp_runtime TO postgres WITH SET FALSE"
        in workflow
    )
    assert 'mutation_boundary: "BEGIN_ROLLBACK_or_read_only"' in workflow


def test_demo_runtime_computes_activation_hash_without_extensions_access():
    provisioner = _read("backend/scripts/provision_canonical_demo.py")
    assert '"sales.order.manage"' in provisioner
    assert '"internal.sequence.allocate"' in provisioner
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
    assert '"2000.00", "INR"' in provisioner
    assert "maximum_amount, currency_code" in provisioner
    assert "demo-v2" in provisioner

    workflow = _read(".github/workflows/canonical-staging.yml")
    assert "CANONICAL_DEMO_API_URL=http://127.0.0.1:8090" in workflow
    assert "PYTHONPATH=backend PORT=8090 python3 -m uvicorn" in workflow
    assert "for attempt in 1 2 3 4 5" in workflow
    assert "Canonical CI API traceback" in workflow
    assert "postgresql://<redacted>@" in workflow


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
    assert "reset_disposable_data: ${{ inputs.reset_canonical_staging }}" in production_workflow
    assert "ALTER ROLE %I NOLOGIN" in workflow
    assert "pg_catalog.pg_terminate_backend(activity.pid)" in workflow
    assert "activity.usename IN" in workflow
    assert "restart_staging_database:" in workflow
    assert "if: inputs.restart_staging_database == true" in workflow
    assert '"https://api.supabase.com/v1/projects/$CANONICAL_STAGING_PROJECT_REF/restart"' in workflow
    assert "restart_canonical_staging:" in production_workflow
    assert "restart_staging_database: ${{ inputs.restart_canonical_staging }}" in production_workflow


def test_frontend_builds_use_the_reviewed_node_runtime():
    workflow = _read(".github/workflows/production-readiness.yml")
    blueprint = _read("render.yaml")
    package = _read("frontend/package.json")

    assert 'node-version: "20"' not in workflow
    assert workflow.count('node-version: "22"') == 3
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
