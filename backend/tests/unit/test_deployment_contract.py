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
    assert 'test "$pooler_port" = 6543' in workflow
    assert "SUPABASE_POOLER_HOST" in workflow
    assert "SUPABASE_POOLER_PORT" in workflow
    assert "pooler.supabase.com:5432" not in workflow
    assert "for attempt in $(seq 1 8)" in workflow
    assert "Supabase pooler unavailable; retrying baseline connection" in workflow
    assert "OperationalError|econnrefused|connection refused" in workflow
    assert 'if [ "$baseline_applied" != true ]' in workflow
    assert "rotate_role_passwords:" in workflow
    assert "if: inputs.rotate_role_passwords == true" in workflow
    assert "Run canonical rollback fixtures on live free staging" in workflow
    assert "test \"$fixture_count\" = 14" in workflow
    assert "REVOKE erp_migration_owner, erp_runtime FROM postgres" in workflow
    assert 'mutation_boundary: "BEGIN_ROLLBACK_or_read_only"' in workflow


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
