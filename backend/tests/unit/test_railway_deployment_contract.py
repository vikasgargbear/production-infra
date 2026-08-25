import json
import re
from fnmatch import fnmatch
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RAILWAY_SCHEMA = "https://railway.com/railway.schema.json"


def _config(name: str) -> dict:
    return json.loads(
        (ROOT / "deploy/railway" / f"{name}.railway.json").read_text(
            encoding="utf-8"
        )
    )


def _workflow() -> str:
    return (ROOT / ".github/workflows/railway-canonical-staging.yml").read_text(
        encoding="utf-8"
    )


def test_each_railway_service_uses_its_dockerfile_and_plan_default_region() -> None:
    expected_dockerfiles = {
        "api": "/deploy/railway/api.Dockerfile",
        "mcp": "/deploy/railway/mcp.Dockerfile",
        "frontend": "/frontend/Dockerfile",
    }

    expected_start_commands = {
        "api": None,
        "mcp": "exec uvicorn aasopharma_mcp.server:create_app --factory --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'",
        "frontend": None,
    }

    for service, dockerfile in expected_dockerfiles.items():
        config = _config(service)
        assert config["$schema"] == RAILWAY_SCHEMA
        assert config["build"]["builder"] == "DOCKERFILE"
        assert config["build"]["dockerfilePath"] == dockerfile
        assert config["deploy"]["startCommand"] == expected_start_commands[service]
        assert config["deploy"]["sleepApplication"] is True
        assert "multiRegionConfig" not in config["deploy"]

    mcp_dockerfile = (ROOT / "deploy/railway/mcp.Dockerfile").read_text(
        encoding="utf-8"
    )
    mcp_cmd = next(
        json.loads(line.removeprefix("CMD "))
        for line in mcp_dockerfile.splitlines()
        if line.startswith("CMD ")
    )
    assert mcp_cmd == ["sh", "-c", expected_start_commands["mcp"]]


def test_railway_healthchecks_match_service_readiness_boundaries() -> None:
    assert _config("api")["deploy"]["healthcheckPath"] == "/ready"
    assert _config("mcp")["deploy"]["healthcheckPath"] == "/health"
    assert _config("frontend")["deploy"]["healthcheckPath"] == "/health"


def test_force_deploy_markers_are_watched_and_bound_into_exact_images() -> None:
    markers = {
        "api": "/deploy/railway/api.force-deploy",
        "mcp": "/deploy/railway/mcp.force-deploy",
        "frontend": "/deploy/railway/frontend.force-deploy",
    }

    for service, marker in markers.items():
        patterns = _config(service)["build"]["watchPatterns"]
        assert any(fnmatch(marker, pattern) for pattern in patterns)

    workflow = _workflow()
    for marker in markers.values():
        assert f"> {marker.removeprefix('/')}" in workflow
    assert 'DEPLOYMENT_NONCE: ${{ github.run_id }}:${{ github.run_attempt }}' in workflow

    dockerfiles = {
        "api": ROOT / "deploy/railway/api.Dockerfile",
        "mcp": ROOT / "deploy/railway/mcp.Dockerfile",
        "frontend": ROOT / "frontend/Dockerfile",
    }
    for service, dockerfile in dockerfiles.items():
        contents = dockerfile.read_text(encoding="utf-8")
        assert markers[service].removeprefix("/") in contents


def test_frontend_container_builds_once_and_serves_spa_with_healthcheck() -> None:
    dockerfile = (ROOT / "frontend/Dockerfile").read_text(encoding="utf-8")
    caddyfile = (ROOT / "frontend/Caddyfile").read_text(encoding="utf-8")

    assert "FROM node:22-alpine AS build" in dockerfile
    assert "ARG RAILWAY_GIT_COMMIT_SHA" in dockerfile
    assert "npm run test:ci -- --runInBand" in dockerfile
    assert "CI=false npm run build" in dockerfile
    assert "FROM caddy:2.10.2-alpine" in dockerfile
    assert "COPY . ." in dockerfile
    assert "COPY --from=build /workspace/frontend/build /srv" in dockerfile
    assert "handle /health" in caddyfile
    assert "try_files {path} /index.html" in caddyfile


def test_workflow_fails_closed_on_service_configuration_drift() -> None:
    workflow = _workflow()

    assert "railway environment edit" not in workflow
    assert workflow.index("Fail closed on Railway service configuration drift") < workflow.index(
        "Populate canonical service variables without triggering stale deploys"
    )
    assert '(.services[$id].source.rootDirectory // "/") == "/"' in workflow
    assert "railway-service-config.json" in workflow
    assert "Railway service configuration drift" in workflow
    assert "will not trigger an unbound intermediate deployment" in workflow
    config_step = workflow[
        workflow.index("Fail closed on Railway service configuration drift") :
        workflow.index("Populate canonical service variables without triggering stale deploys")
    ]
    assert "mcp_start_command=$(jq -er" in config_step
    assert 'test "$actual_start" = "python start.py"' in config_step
    assert 'test "$actual_start" = "$expected_start"' in config_step
    assert 'service_matches "$RAILWAY_API_SERVICE" /deploy/railway/api.railway.json ""' in config_step
    assert 'service_matches "$RAILWAY_MCP_SERVICE" /deploy/railway/mcp.railway.json "$mcp_start_command"' in config_step
    assert 'service_matches "$RAILWAY_FRONTEND_SERVICE" /deploy/railway/frontend.railway.json ""' in config_step
    assert "exit 1" in config_step


def test_workflow_sets_the_reviewed_sha_without_variable_deploys() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert variable_step.count("railway variable set \\") == 1
    assert "--skip-deploys" in variable_step
    assert variable_step.count(
        'RAILWAY_GIT_COMMIT_SHA "$REVIEWED_SHA"'
    ) == 3
    for service in (
        "$RAILWAY_API_SERVICE",
        "$RAILWAY_MCP_SERVICE",
        "$RAILWAY_FRONTEND_SERVICE",
    ):
        assert (
            f'set_variable "{service}" RAILWAY_GIT_COMMIT_SHA "$REVIEWED_SHA"'
            in variable_step
        )


def test_workflow_exposes_a_railway_only_exact_sha_dispatch() -> None:
    workflow = _workflow()

    assert "workflow_dispatch:" in workflow
    assert "Exact reviewed application SHA to upload to all Railway pilot services" in workflow
    assert "ref: ${{ inputs.reviewed_sha }}" in workflow
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in workflow


def test_production_readiness_dispatch_can_select_railway_without_database_or_render() -> None:
    production = (
        ROOT / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")

    assert "deploy_railway_staging:" in production
    assert "railway_reviewed_sha:" in production
    assert (
        "((inputs.deploy_canonical_staging && inputs.live18_provider == 'railway') ||"
        in production
    )
    assert (
        "reviewed_sha: ${{ inputs.deploy_railway_staging && "
        "inputs.railway_reviewed_sha || inputs.canonical_staging_render_sha }}"
        in production
    )
    canonical_job = production.split("  canonical-free-staging:", 1)[1].split(
        "  railway-canonical-staging:", 1
    )[0]
    assert "inputs.deploy_railway_staging" not in canonical_job


def test_evidence_storage_is_explicit_restricted_and_fail_closed() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert "EVIDENCE_STORAGE_SERVER_JWT:" in workflow
    assert "required: false" in workflow.split("EVIDENCE_STORAGE_SERVER_JWT:", 1)[1].splitlines()[1]
    assert "evidence_storage_enabled=${EVIDENCE_STORAGE_ENABLED:-false}" in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_ENABLED false' in variable_step
    assert 'test "$EVIDENCE_STORAGE_EXPECTED_PROJECT_REF" = "$CANONICAL_STAGING_PROJECT_REF"' in variable_step
    assert 'test -n "$EVIDENCE_STORAGE_SERVER_JWT"' in variable_step
    assert 'test "$evidence_role" = erp_evidence_storage' in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_SERVER_JWT "$EVIDENCE_STORAGE_SERVER_JWT"' in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_ENABLED true' in variable_step
    assert "EVIDENCE_STORAGE_ENABLED must be exactly true or false" in variable_step
    assert 'set_variable "$RAILWAY_MCP_SERVICE" EVIDENCE_STORAGE' not in variable_step
    assert 'set_variable "$RAILWAY_FRONTEND_SERVICE" EVIDENCE_STORAGE' not in variable_step
    assert "--skip-deploys" in variable_step
    assert '--stdin "$key"' in variable_step


def test_workflow_uploads_fresh_source_and_polls_exact_deployment_ids() -> None:
    workflow = _workflow()

    assert "group: railway-canonical-staging-pilot" in workflow
    assert "cancel-in-progress: false" in workflow
    assert "timeout-minutes: 45" in workflow
    up_commands = re.findall(r"^\s+railway up .+$", workflow, flags=re.MULTILINE)
    assert len(up_commands) == 3
    for command in up_commands:
        assert "--detach --json" in command
        assert '--environment "$RAILWAY_ENVIRONMENT_ID"' in command
        assert '--project "$RAILWAY_PROJECT_ID"' in command
        assert ' --message "$message"' in command
        assert "railway up ." not in command

    assert "railway redeploy" not in workflow
    assert workflow.count(".deploymentId") == 3
    assert "deployment_status()" in workflow
    assert "select(.id == $id)" in workflow
    assert (
        "FAILED|CRASHED|SKIPPED|REMOVED|REMOVING|CANCELLED" in workflow
    )
    assert "service_status" in workflow
    assert "require_deployment_contract()" in workflow
    assert workflow.count('meta.rootDirectory // "/"') == 1
    assert ".meta.configFile == $config_file" in workflow
    assert ".meta.cliMessage == $message" in workflow
    assert ".meta.fileServiceManifest.build.builder" in workflow
    assert ".meta.fileServiceManifest.build.dockerfilePath" in workflow
    assert ".meta.fileServiceManifest.deploy.startCommand" in workflow
    assert ".meta.serviceManifest.build.builder" in workflow
    assert ".meta.serviceManifest.build.dockerfilePath" in workflow
    assert ".meta.serviceManifest.deploy.startCommand" in workflow
    assert 'require_deployment_contract "$RAILWAY_MCP_SERVICE" "$mcp_deployment_id" /deploy/railway/mcp.railway.json /deploy/railway/mcp.Dockerfile /health "$mcp_start_command"' in workflow
    assert ".meta.serviceManifest.deploy.healthcheckPath" in workflow
    assert ".meta.serviceManifest.deploy.sleepApplication == true" in workflow


def test_workflow_requires_all_public_health_and_readiness_boundaries() -> None:
    workflow = _workflow()

    for endpoint in (
        '$RAILWAY_API_URL/health',
        '$RAILWAY_API_URL/ready',
        '$RAILWAY_MCP_URL/health',
        '$RAILWAY_MCP_URL/ready',
        '$RAILWAY_FRONTEND_URL/health',
        '$RAILWAY_FRONTEND_URL/build-metadata.json',
    ):
        assert endpoint in workflow

    assert workflow.count("curl --fail-with-body") == 1
    assert "fetch()" in workflow
    assert workflow.count(" &\n") >= 6
    assert '.status == "healthy" and .git_commit == $sha' in workflow
    assert '.status == "ok" and .git_commit == $sha' in workflow
    assert workflow.count('.status == "ready"') == 2
    assert '.service == "aasopharma-erp" and .git_commit == $sha' in workflow
    assert "deployment_id:$api_deployment_id" in workflow
    assert "deployment_id:$mcp_deployment_id" in workflow
    assert "deployment_id:$frontend_deployment_id" in workflow
