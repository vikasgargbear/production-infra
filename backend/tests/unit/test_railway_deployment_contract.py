import json
import os
import re
import subprocess
import textwrap
from fnmatch import fnmatch
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
RAILWAY_SCHEMA = "https://railway.com/railway.schema.json"
SINGAPORE_REGION = "asia-southeast1-eqsg3a"
MCP_DOCKER_COMMAND = (
    "exec uvicorn aasopharma_mcp.server:create_app --factory --host 0.0.0.0 "
    "--port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"
)
MCP_RAILWAY_START_COMMAND = f'/bin/sh -c "{MCP_DOCKER_COMMAND}"'


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


def _control_manifest() -> dict:
    return json.loads(
        (ROOT / "deploy/control-plane/canonical-staging.json").read_text(
            encoding="utf-8"
        )
    )


def test_active_railway_mcp_origin_is_the_reviewed_public_service() -> None:
    assert _control_manifest()["providers"]["railway"]["services"]["mcp"][
        "origin"
    ] == "https://aasopharma-mcp-pilot-production.up.railway.app"


def _workflow_run_script(step_name: str, next_step_name: str) -> str:
    workflow = _workflow()
    section = workflow.split(f"- name: {step_name}", 1)[1].split(
        f"- name: {next_step_name}", 1
    )[0]
    run_block = section.split("run: |", 1)[1]
    return textwrap.dedent(run_block)


def test_no_ambiguous_repository_root_railway_manifest_exists() -> None:
    assert not (ROOT / "railway.json").exists()

    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "railway up\n" not in readme
    assert "Do not run an unqualified local `railway up`" in readme
    for service in ("api", "mcp", "frontend"):
        assert (ROOT / "deploy/railway" / f"{service}.railway.json").is_file()


def test_each_railway_service_is_a_single_singapore_docker_replica() -> None:
    expected_dockerfiles = {
        "api": "/deploy/railway/api.Dockerfile",
        "mcp": "/deploy/railway/mcp.Dockerfile",
        "frontend": "/frontend/Dockerfile",
    }

    expected_start_commands = {
        "api": None,
        "mcp": MCP_RAILWAY_START_COMMAND,
        "frontend": None,
    }
    expected_ipv6 = {
        "api": True,
        "mcp": False,
        "frontend": False,
    }

    for service, dockerfile in expected_dockerfiles.items():
        config = _config(service)
        assert config["$schema"] == RAILWAY_SCHEMA
        assert config["build"]["builder"] == "DOCKERFILE"
        assert config["build"]["dockerfilePath"] == dockerfile
        assert config["deploy"]["startCommand"] == expected_start_commands[service]
        assert config["deploy"]["ipv6EgressEnabled"] is expected_ipv6[service]
        assert config["deploy"]["sleepApplication"] is True
        assert config["deploy"]["multiRegionConfig"] == {
            SINGAPORE_REGION: {"numReplicas": 1}
        }

    mcp_dockerfile = (ROOT / "deploy/railway/mcp.Dockerfile").read_text(
        encoding="utf-8"
    )
    mcp_cmd = next(
        json.loads(line.removeprefix("CMD "))
        for line in mcp_dockerfile.splitlines()
        if line.startswith("CMD ")
    )
    assert mcp_cmd == ["sh", "-c", MCP_DOCKER_COMMAND]


def test_railway_healthchecks_match_service_readiness_boundaries() -> None:
    assert _config("api")["deploy"]["healthcheckPath"] == "/health"
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
    assert "for marker in api mcp frontend; do" in workflow
    assert '> "deploy/railway/$marker.force-deploy"' in workflow
    assert 'DEPLOYMENT_NONCE: ${{ github.run_id }}:${{ github.run_attempt }}' in workflow

    dockerfiles = {
        "api": ROOT / "deploy/railway/api.Dockerfile",
        "mcp": ROOT / "deploy/railway/mcp.Dockerfile",
        "frontend": ROOT / "frontend/Dockerfile",
    }
    for service, dockerfile in dockerfiles.items():
        contents = dockerfile.read_text(encoding="utf-8")
        assert markers[service].removeprefix("/") in contents


def test_api_watches_every_packaged_migration_authority_input() -> None:
    patterns = set(_config("api")["build"]["watchPatterns"])
    assert {
        "/backend/**",
        "/database/schema-authority.json",
        "/database/canonical/domains/_contract.json",
        "/deploy/control-plane/**",
        "/deploy/railway/api.*",
    } <= patterns


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
    assert "mcp_start_command=$(jq -er" not in config_step
    assert 'test "$actual_start" = "python start.py"' not in config_step
    assert 'test -z "$actual_start"' in config_step
    assert 'service_matches "$RAILWAY_API_SERVICE" /deploy/railway/api.railway.json' in config_step
    assert 'service_matches "$RAILWAY_MCP_SERVICE" /deploy/railway/mcp.railway.json' in config_step
    assert 'service_matches "$RAILWAY_FRONTEND_SERVICE" /deploy/railway/frontend.railway.json' in config_step
    assert f'multiRegionConfig == {{"{SINGAPORE_REGION}":{{"numReplicas":1}}}}' in config_step
    assert "exit 1" in config_step


def test_workflow_sets_the_reviewed_sha_without_variable_deploys() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert variable_step.count("railway variable set \\") == 1
    assert "--skip-deploys" in variable_step
    assert "for attempt in $(seq 1 4)" in variable_step
    assert "timeout --signal=TERM 45s railway variable set" in variable_step
    assert "provider output was suppressed" in variable_step
    assert 'Railway variable transport is not ready for $service/$key' in variable_step
    assert 'echo "$value"' not in variable_step
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


def test_workflow_reconciles_one_reviewed_oauth_authority_before_deploy() -> None:
    workflow = _workflow()
    authority = "Reconcile the reviewed staging MCP OAuth client authority"
    variables = "Populate canonical service variables without triggering stale deploys"
    upload = "Force-upload the exact source tree"

    assert (
        workflow.index("Fail closed on Railway service configuration drift")
        < workflow.index(authority)
        < workflow.index(variables)
        < workflow.index(upload)
    )
    authority_step = workflow[workflow.index(authority) : workflow.index(variables)]
    assert "provision_staging_mcp_oauth.py" in authority_step
    assert "--mode client-authority-only" in authority_step
    assert "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}" in authority_step
    assert "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID" not in authority_step

    variable_step = workflow[workflow.index(variables) : workflow.index(upload)]
    assert 'test -n "$MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS"' in variable_step
    assert "disabled-unissued-canonical-staging" in variable_step
    assert ".reviewed_sha == $sha" in variable_step
    assert ".client_id == $client_id" in variable_step
    assert '.provisioning_mode == "client-authority-only"' in variable_step
    assert ".test_identity_reconciled == false" in variable_step
    assert "RAILWAY_OAUTH_EVIDENCE_SHA256" in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS' in variable_step
    assert 'set_variable "$RAILWAY_MCP_SERVICE" MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS' in variable_step
    assert "vars.MCP_OAUTH_PRE_REGISTERED_CLIENT_IDS" not in workflow
    assert "railway-oauth-evidence/canonical-staging-oauth-client.json" in workflow
    assert "evidence_sha256:$oauth_evidence_sha256" in workflow


def test_workflow_verifies_manifest_owned_api_ipv6_without_live_mutation() -> None:
    workflow = _workflow()
    ipv6_step = workflow[
        workflow.index(
            "Verify manifest-owned API outbound IPv6 and a clean staged boundary"
        ) :
        workflow.index("Fail closed on Railway service configuration drift")
    ]

    assert "@railway/cli@5.43.4" in workflow
    assert "@railway/cli@4.30.2" not in workflow
    assert 'railway outbound-network ipv6 status \\' in ipv6_step
    assert "railway outbound-network ipv6 enable" not in ipv6_step
    assert '--service "$RAILWAY_API_SERVICE"' in ipv6_step
    assert '--service "$RAILWAY_MCP_SERVICE"' not in ipv6_step
    assert '--service "$RAILWAY_FRONTEND_SERVICE"' not in ipv6_step
    assert ".service.name == $service" in ipv6_step
    assert ".environment.id == $environment" in ipv6_step
    assert ".ipv6.enabled == true" in ipv6_step
    assert ".ipv6.staged == false" in ipv6_step
    assert ".deploy.ipv6EgressEnabled == true" in ipv6_step
    assert ipv6_step.count(".deploy.ipv6EgressEnabled == false") == 2
    assert "environmentStagedChanges" in ipv6_step
    assert ".data.environmentStagedChanges.patch == {}" in ipv6_step
    assert "environmentPatchCommitStaged" not in ipv6_step
    assert "sleep " not in ipv6_step
    assert "Railway has staged configuration outside the reviewed source manifests" in ipv6_step


def test_workflow_uses_direct_isolated_roles_with_a_staging_pool_budget() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert "deployment_control.py export-github-env" in workflow
    assert _control_manifest()["supabase"]["database"]["host"] == (
        "db.rgihahbmkrmhitjdjvev.supabase.co"
    )
    assert "SUPABASE_POOLER_HOST:" not in workflow
    assert "SUPABASE_SESSION_POOLER_PORT:" not in workflow
    for principal in ("erp_runtime", "erp_calculator", "erp_tax_provider"):
        assert f'postgresql://{principal}:$(encode' in variable_step
    assert "@${SUPABASE_DIRECT_DATABASE_HOST}:5432/postgres" in variable_step
    assert variable_step.count("gssencmode=disable") == 3
    assert '.${CANONICAL_STAGING_PROJECT_REF}:' not in variable_step
    assert (
        'set_variable "$RAILWAY_API_SERVICE" DATABASE_TRANSPORT_REQUIREMENT '
        '"$CANONICAL_APPLICATION_DATABASE_TRANSPORT"'
    ) in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" DATABASE_POOL_SIZE 3' in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" DATABASE_MAX_OVERFLOW 1' in variable_step
    assert 'set_variable "$RAILWAY_MCP_SERVICE" DATABASE_' not in variable_step
    assert 'set_variable "$RAILWAY_FRONTEND_SERVICE" DATABASE_' not in variable_step


def test_railway_lane_has_no_render_or_supavisor_transport_dependency() -> None:
    workflow = _workflow().lower()

    assert "render" not in workflow
    assert "supavisor" not in workflow
    assert "pooler" not in workflow
    assert ":6543" not in workflow
    assert "supabase_direct_ipv6" in workflow


def test_workflow_exposes_a_railway_only_exact_sha_dispatch() -> None:
    workflow = _workflow()

    assert "workflow_dispatch:" in workflow
    assert "Exact reviewed application SHA to upload to all Railway pilot services" in workflow
    assert "ref: ${{ inputs.reviewed_sha }}" in workflow
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in workflow


def test_railway_never_receives_render_evidence_storage_credentials() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_ENABLED false' in variable_step
    assert "EVIDENCE_STORAGE_SERVER_API_KEY" not in workflow
    assert "EVIDENCE_STORAGE_SERVICE_PASSWORD" not in workflow
    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_ENABLED true' not in variable_step
    assert 'set_variable "$RAILWAY_MCP_SERVICE" EVIDENCE_STORAGE' not in variable_step
    assert 'set_variable "$RAILWAY_FRONTEND_SERVICE" EVIDENCE_STORAGE' not in variable_step
    assert "--skip-deploys" in variable_step
    assert '--stdin "$key"' in variable_step


def test_workflow_uploads_fresh_source_and_polls_exact_deployment_ids() -> None:
    workflow = _workflow()
    assert 'python3 "$GITHUB_WORKSPACE/backend/scripts/railway_upload_diagnostic.py"' in workflow
    assert 'python "$GITHUB_WORKSPACE/backend/scripts/railway_upload_diagnostic.py"' not in workflow

    assert "group: railway-canonical-staging-pilot" in workflow
    assert "cancel-in-progress: false" in workflow
    assert "timeout-minutes: 45" in workflow
    up_commands = re.findall(r"^\s+if railway up .+$", workflow, flags=re.MULTILINE)
    assert len(up_commands) == 1
    for command in up_commands:
        assert "--detach --json" in command
        assert "railway up ." not in command
    assert '--environment "$RAILWAY_ENVIRONMENT_ID"' in workflow
    assert '--project "$RAILWAY_PROJECT_ID"' in workflow
    assert '--message "$message"' in workflow
    assert 'upload_service api "$RAILWAY_API_SERVICE"' in workflow
    assert 'upload_service mcp "$RAILWAY_MCP_SERVICE"' in workflow
    assert 'upload_service frontend "$RAILWAY_FRONTEND_SERVICE"' in workflow
    assert 'echo "api_deployment_id=$(<api-deployment-id)"' in workflow
    assert 'echo "mcp_deployment_id=$(<mcp-deployment-id)"' in workflow
    assert 'echo "frontend_deployment_id=$(<frontend-deployment-id)"' in workflow
    assert "value: ${{ jobs.deploy.outputs.mcp_deployment_id }}" in workflow
    assert "value: ${{ jobs.deploy.outputs.frontend_deployment_id }}" in workflow
    assert workflow.index('upload_service api "$RAILWAY_API_SERVICE"') < workflow.index(
        'upload_service mcp "$RAILWAY_MCP_SERVICE"'
    ) < workflow.index('upload_service frontend "$RAILWAY_FRONTEND_SERVICE"')
    assert "api_pid" not in workflow
    assert "mcp_pid" not in workflow
    assert "frontend_pid" not in workflow

    assert "upload_failure_kind()" in workflow
    assert "upload_diagnostic()" in workflow
    assert '"$GITHUB_WORKSPACE/backend/scripts/railway_upload_diagnostic.py"' in workflow
    assert "structured_upload_error()" not in workflow
    assert "earliest_retry_utc=$earliest_retry_utc" in workflow
    assert "empty_cli_response" in workflow
    assert "transient_transport" in workflow
    assert "invalid_success_payload" in workflow
    assert "max_attempts=2" in workflow
    assert "for recovery_attempt in $(seq 1 6)" in workflow
    assert 'sleep 5' in workflow
    assert 'sleep "$((attempt * 2))"' in workflow
    assert "Railway source upload failed" in workflow
    assert 'local message="canonical staging $REVIEWED_SHA $DEPLOYMENT_NONCE $label"' in workflow
    assert 'recover_accepted_upload "$label" "$service" "$message"' in workflow
    assert '.meta.cliMessage == $message' in workflow
    assert "ambiguous_recovered_deployments" in workflow
    assert "recovery_query_failed" in workflow
    assert "invalid_recovery_payload" in workflow
    assert "deployment_id_from_payload()" in workflow
    assert "expected exactly one Railway deployment UUID document" in workflow
    assert 'test("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")' in workflow
    assert "service=$label attempt=$attempt exit_code=$exit_code code=$diagnostic_code" in workflow
    assert "kind=$failure_kind classifier_kind=$diagnosed_kind" in workflow
    assert "provider_code=$provider_code http_status=$http_status" in workflow
    assert "stdout_bytes=$stdout_bytes stdout_sha256=$stdout_sha256 stdout_shape=$stdout_shape" in workflow
    assert "stderr_bytes=$stderr_bytes stderr_sha256=$stderr_sha256" in workflow
    upload_step = workflow[
        workflow.index("Force-upload the exact source tree") :
        workflow.index("Require each exact upload to become the active deployment")
    ]
    assert "sed -E" not in upload_step
    assert 'cat "$stdout_file"' not in upload_step
    assert 'cat "$stderr_file"' not in upload_step
    assert "grep -Eqi" not in upload_step
    assert 'keys:' not in upload_step
    assert 'upload_service api "$RAILWAY_API_SERVICE" ||' not in upload_step
    assert 'upload_service mcp "$RAILWAY_MCP_SERVICE" ||' not in upload_step
    assert 'upload_service frontend "$RAILWAY_FRONTEND_SERVICE" ||' not in upload_step

    assert "railway redeploy" not in workflow
    assert "deployment_id_from_payload api-deploy.json > api-deployment-id" in workflow
    assert "deployment_id_from_payload mcp-deploy.json > mcp-deployment-id" in workflow
    assert "deployment_id_from_payload frontend-deploy.json > frontend-deployment-id" in workflow
    assert "deployment_status()" in workflow
    assert "deployment_list_json()" in workflow
    assert 'deployment_poll_deadline=$((SECONDS + 1800))' in workflow
    assert "for attempt in $(seq 1 180)" in workflow
    assert 'test "$attempt" = 180' in workflow
    assert 'api=$api_deployment_id:$api_status' in workflow
    assert 'mcp=$mcp_deployment_id:$mcp_status' in workflow
    assert 'frontend=$frontend_deployment_id:$frontend_status' in workflow
    assert 'timeout --signal=TERM "${query_timeout}s" railway deployment list' in workflow
    assert 'jq -e \'type == "array"\'' in workflow
    assert "after bounded attempts" in workflow
    assert "QUERY_UNAVAILABLE" in workflow
    assert "select(.id == $id)" in workflow
    assert (
        "FAILED|CRASHED|SKIPPED|REMOVED|REMOVING|CANCELLED" in workflow
    )
    assert "fail_on_terminal_status()" in workflow
    assert 'service=$service_label deployment=$deployment_id status=$service_status' in workflow
    assert "require_deployment_contract()" in workflow
    assert workflow.count('meta.rootDirectory // "/"') == 1
    assert ".meta.configFile == $config_file" in workflow
    assert ".meta.cliMessage == $message" in workflow
    assert 'local expected_message=$7' in workflow
    assert 'local expected_ipv6=$8' in workflow
    assert '--arg message "$expected_message"' in workflow
    assert '--argjson expected_ipv6 "$expected_ipv6"' in workflow
    assert ".meta.fileServiceManifest.build.builder" in workflow
    assert ".meta.fileServiceManifest.build.dockerfilePath" in workflow
    assert ".meta.fileServiceManifest.deploy.startCommand" in workflow
    assert ".meta.serviceManifest.build.builder" in workflow
    assert ".meta.serviceManifest.build.dockerfilePath" in workflow
    assert ".meta.serviceManifest.deploy.startCommand" in workflow
    assert 'require_deployment_contract "$RAILWAY_API_SERVICE" "$api_deployment_id" /deploy/railway/api.railway.json /deploy/railway/api.Dockerfile /health "" "$api_deployment_message" true' in workflow
    assert 'require_deployment_contract "$RAILWAY_MCP_SERVICE" "$mcp_deployment_id" /deploy/railway/mcp.railway.json /deploy/railway/mcp.Dockerfile /health "$mcp_start_command" "$mcp_deployment_message" false' in workflow
    assert 'require_deployment_contract "$RAILWAY_FRONTEND_SERVICE" "$frontend_deployment_id" /deploy/railway/frontend.railway.json /frontend/Dockerfile /health "" "$frontend_deployment_message" false' in workflow
    assert ".meta.serviceManifest.deploy.healthcheckPath" in workflow
    assert ".meta.serviceManifest.deploy.ipv6EgressEnabled == $expected_ipv6" in workflow
    assert workflow.count('multiRegionConfig == {"asia-southeast1-eqsg3a":{"numReplicas":1}}') == 3
    assert ".meta.fileServiceManifest.deploy.sleepApplication == true" in workflow
    assert ".meta.serviceManifest.deploy.sleepApplication == true" in workflow


def test_exact_deployment_poll_accepts_reviewed_sleeping_artifacts() -> None:
    workflow = _workflow()
    poll = workflow[
        workflow.index("Require each exact upload to become the active deployment") :
        workflow.index("Prove exact Railway authority remains closed before demo provisioning")
    ]

    assert "deployment_is_materialized" in poll
    assert "SUCCESS|SLEEPING) return 0" in poll
    assert 'deployment_is_materialized "$api_status"' in poll
    assert 'deployment_is_materialized "$mcp_status"' in poll
    assert 'deployment_is_materialized "$frontend_status"' in poll
    assert poll.index('deployment_is_materialized "$api_status"') < poll.index(
        'require_deployment_contract "$RAILWAY_API_SERVICE"'
    )
    assert "did not reach a materialized state before timeout" in poll


def test_exact_deployment_poll_recovers_from_malformed_provider_response(
    tmp_path: Path,
) -> None:
    script = _workflow_run_script(
        "Require each exact upload to become the active deployment",
        "Prove exact Railway authority remains closed before demo provisioning",
    )
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    state_dir = tmp_path / "state"
    state_dir.mkdir()
    railway = fake_bin / "railway"
    railway.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
test "$1" = deployment
test "$2" = list
shift 2
service=""
while test "$#" -gt 0; do
  case "$1" in
    --service) service=$2; shift 2 ;;
    *) shift ;;
  esac
done
count_file="$FAKE_RAILWAY_STATE/count-$service"
count=0
test ! -f "$count_file" || count=$(<"$count_file")
count=$((count + 1))
printf '%s\n' "$count" > "$count_file"
printf 'list %s\n' "$service" >> "$FAKE_RAILWAY_STATE/calls"
if test "$service" = api-service && test "$count" = 1; then
  printf '%s\n' 'Failed to fetch: error decoding response body' >&2
  printf '%s\n' 'not-json'
  exit 4
fi
case "$service" in
  api-service)
    id=11111111-1111-4111-8111-111111111111
    config=/deploy/railway/api.railway.json
    dockerfile=/deploy/railway/api.Dockerfile
        health=/health
    start=""
    ipv6=true
    message=$(<api-deployment-message)
    ;;
  mcp-service)
    id=22222222-2222-4222-8222-222222222222
    config=/deploy/railway/mcp.railway.json
    dockerfile=/deploy/railway/mcp.Dockerfile
    health=/health
    start=$FAKE_MCP_START_COMMAND
    ipv6=false
    message=$(<mcp-deployment-message)
    ;;
  frontend-service)
    id=33333333-3333-4333-8333-333333333333
    config=/deploy/railway/frontend.railway.json
    dockerfile=/frontend/Dockerfile
    health=/health
    start=""
    ipv6=false
    message=$(<frontend-deployment-message)
    ;;
  *) exit 44 ;;
esac
jq -cn \
  --arg id "$id" \
  --arg config "$config" \
  --arg dockerfile "$dockerfile" \
  --arg health "$health" \
  --arg start "$start" \
  --arg message "$message" \
  --argjson ipv6 "$ipv6" \
  '[{id:$id,status:"SUCCESS",meta:{rootDirectory:"/",configFile:$config,cliMessage:$message,fileServiceManifest:{build:{builder:"DOCKERFILE",dockerfilePath:$dockerfile},deploy:{startCommand:$start,multiRegionConfig:{"asia-southeast1-eqsg3a":{numReplicas:1}},sleepApplication:true}},serviceManifest:{build:{builder:"DOCKERFILE",dockerfilePath:$dockerfile},deploy:{startCommand:$start,healthcheckPath:$health,ipv6EgressEnabled:$ipv6,multiRegionConfig:{"asia-southeast1-eqsg3a":{numReplicas:1}},sleepApplication:true}}}}]'
""",
        encoding="utf-8",
    )
    railway.chmod(0o755)
    fake_sleep = fake_bin / "sleep"
    fake_sleep.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    fake_sleep.chmod(0o755)
    fake_timeout = fake_bin / "timeout"
    fake_timeout.write_text(
        "#!/usr/bin/env bash\n"
        "test \"$1\" = --signal=TERM\n"
        "shift 2\n"
        "exec \"$@\"\n",
        encoding="utf-8",
    )
    fake_timeout.chmod(0o755)

    deployment_ids = {
        "api": "11111111-1111-4111-8111-111111111111",
        "mcp": "22222222-2222-4222-8222-222222222222",
        "frontend": "33333333-3333-4333-8333-333333333333",
    }
    for label, deployment_id in deployment_ids.items():
        (tmp_path / f"{label}-deployment-id").write_text(
            deployment_id, encoding="utf-8"
        )
        (tmp_path / f"{label}-deployment-message").write_text(
            f"exact-{label}-message", encoding="utf-8"
        )
    (tmp_path / "deploy/railway").mkdir(parents=True)
    (tmp_path / "deploy/railway/mcp.railway.json").write_text(
        json.dumps({"deploy": {"startCommand": MCP_RAILWAY_START_COMMAND}}),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["bash", "-c", script],
        cwd=tmp_path,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "RUNNER_TEMP": str(state_dir),
            "RAILWAY_API_SERVICE": "api-service",
            "RAILWAY_MCP_SERVICE": "mcp-service",
            "RAILWAY_FRONTEND_SERVICE": "frontend-service",
            "RAILWAY_ENVIRONMENT_ID": "environment-id",
            "FAKE_RAILWAY_STATE": str(state_dir),
            "FAKE_MCP_START_COMMAND": MCP_RAILWAY_START_COMMAND,
        },
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Railway deployment query is not ready for api-service" in result.stderr
    calls = (state_dir / "calls").read_text(encoding="utf-8").splitlines()
    assert calls.count("list api-service") == 3
    assert calls.count("list mcp-service") == 2
    assert calls.count("list frontend-service") == 2


def test_exact_upload_shell_recovers_without_duplicates_and_fails_fast(
    tmp_path: Path,
) -> None:
    script = _workflow_run_script(
        "Force-upload the exact source tree to all three Railway services",
        "Require each exact upload to become the active deployment",
    )
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    railway = fake_bin / "railway"
    railway.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
command=$1
shift
if test "$command" = up; then
  service=""
  message=""
  while test "$#" -gt 0; do
    case "$1" in
      --service) service=$2; shift 2 ;;
      --message) message=$2; shift 2 ;;
      *) shift ;;
    esac
  done
  printf 'up %s\\n' "$service" >> "$FAKE_RAILWAY_STATE/calls"
  count_file="$FAKE_RAILWAY_STATE/count-$service"
  count=0
  test ! -f "$count_file" || count=$(<"$count_file")
  count=$((count + 1))
  printf '%s\\n' "$count" > "$count_file"
  printf '%s' "$message" > "$FAKE_RAILWAY_STATE/message-$service"
  if test "$FAKE_RAILWAY_SCENARIO" = nonretry_api && test "$service" = api-service; then
    printf '%s\\n' 'configuration invalid SECRET_SHOULD_NOT_APPEAR' >&2
    exit 9
  fi
  if test "$FAKE_RAILWAY_SCENARIO" = json502_api && test "$service" = api-service && test "$count" = 1; then
    printf '%s\n' '{"code":"UPLOAD_FAILED","error":"Failed to upload code with status code 502 Bad Gateway","hint":"retry"}'
    exit 1
  fi
  if test "$FAKE_RAILWAY_SCENARIO" = json403_api && test "$service" = api-service; then
    printf '%s\n' '{"code":"UPLOAD_FAILED","error":"Failed to upload code with status code 403 Forbidden","hint":"check access"}'
    exit 1
  fi
  if test "$FAKE_RAILWAY_SCENARIO" = secretcode_api && test "$service" = api-service; then
    printf '%s\n' '{"code":"SECRET_SHOULD_NOT_APPEAR","error":"ERROR_SECRET_SHOULD_NOT_APPEAR","hint":"HINT_SECRET_SHOULD_NOT_APPEAR"}'
    exit 1
  fi
  if test "$FAKE_RAILWAY_SCENARIO" = unmatched_upload_error_api && test "$service" = api-service; then
    printf '%s\n' '{"code":"UPLOAD_FAILED","error":"ERROR_SECRET_SHOULD_NOT_APPEAR","hint":"HINT_SECRET_SHOULD_NOT_APPEAR"}'
    exit 1
  fi
  if test "$FAKE_RAILWAY_SCENARIO" = peak_window_api && test "$service" = api-service; then
    printf '%s\n' '{"code":"UPLOAD_FAILED","error":"Free-tier deploys to asia-southeast1-eqsg3a are not available during peak hours (8 AM – 8 PM Asia/Singapore). Please try again later or upgrade your plan.","hint":"HINT_SECRET_SHOULD_NOT_APPEAR"}'
    exit 1
  fi
  if test "$FAKE_RAILWAY_SCENARIO" = multidoc_api && test "$service" = api-service; then
    printf '%s\\n%s\\n' '{"deploymentId":"11111111-1111-4111-8111-111111111111"}' '{"deploymentId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'
    exit 0
  fi
  if test "$service" = api-service && test "$count" = 1; then
    case "$FAKE_RAILWAY_SCENARIO" in
      recover_api|retry_api|ambiguous_api) exit 1 ;;
    esac
  fi
  case "$service" in
    api-service) deployment_id=11111111-1111-4111-8111-111111111111 ;;
    mcp-service) deployment_id=22222222-2222-4222-8222-222222222222 ;;
    frontend-service) deployment_id=33333333-3333-4333-8333-333333333333 ;;
    *) exit 44 ;;
  esac
  jq -cn --arg deployment_id "$deployment_id" '{deploymentId:$deployment_id}'
  exit 0
fi
if test "$command" = deployment && test "$1" = list; then
  shift
  service=""
  while test "$#" -gt 0; do
    case "$1" in
      --service) service=$2; shift 2 ;;
      *) shift ;;
    esac
  done
  printf 'list %s\\n' "$service" >> "$FAKE_RAILWAY_STATE/calls"
  message=$(<"$FAKE_RAILWAY_STATE/message-$service")
  case "$FAKE_RAILWAY_SCENARIO" in
    recover_api)
      jq -cn --arg message "$message" '[{id:"11111111-1111-4111-8111-111111111111",meta:{cliMessage:$message}}]'
      ;;
    ambiguous_api)
      jq -cn --arg message "$message" '[{id:"11111111-1111-4111-8111-111111111111",meta:{cliMessage:$message}},{id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",meta:{cliMessage:$message}}]'
      ;;
    *) printf '%s\\n' '[]' ;;
  esac
  exit 0
fi
exit 45
""",
        encoding="utf-8",
    )
    railway.chmod(0o755)
    fake_sleep = fake_bin / "sleep"
    fake_sleep.write_text(
        "#!/usr/bin/env bash\nprintf 'sleep %s\\n' \"$1\" >> \"$FAKE_RAILWAY_STATE/calls\"\n",
        encoding="utf-8",
    )
    fake_sleep.chmod(0o755)

    def run_scenario(name: str) -> tuple[subprocess.CompletedProcess[str], list[str]]:
        scenario_dir = tmp_path / name
        (scenario_dir / "deploy/railway").mkdir(parents=True)
        state_dir = scenario_dir / "state"
        state_dir.mkdir()
        output_path = scenario_dir / "github-output"
        env = {
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "REVIEWED_SHA": "1" * 40,
            "DEPLOYMENT_NONCE": "123:1",
            "RAILWAY_API_SERVICE": "api-service",
            "RAILWAY_MCP_SERVICE": "mcp-service",
            "RAILWAY_FRONTEND_SERVICE": "frontend-service",
            "RAILWAY_ENVIRONMENT_ID": "environment-id",
            "RAILWAY_PROJECT_ID": "project-id",
            "GITHUB_OUTPUT": str(output_path),
            "GITHUB_WORKSPACE": str(ROOT),
            "FAKE_RAILWAY_STATE": str(state_dir),
            "FAKE_RAILWAY_SCENARIO": name,
        }
        result = subprocess.run(
            ["bash", "-c", script],
            cwd=scenario_dir,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        calls_path = state_dir / "calls"
        calls = calls_path.read_text(encoding="utf-8").splitlines()
        return result, calls

    success, success_calls = run_scenario("success")
    assert success.returncode == 0, success.stderr
    assert success_calls == ["up api-service", "up mcp-service", "up frontend-service"]

    recovered, recovered_calls = run_scenario("recover_api")
    assert recovered.returncode == 0, recovered.stderr
    assert recovered_calls == [
        "up api-service",
        "list api-service",
        "up mcp-service",
        "up frontend-service",
    ]

    retried, retried_calls = run_scenario("retry_api")
    assert retried.returncode == 0, retried.stderr
    assert retried_calls.count("up api-service") == 2
    assert retried_calls.count("list api-service") == 6
    assert retried_calls[-2:] == ["up mcp-service", "up frontend-service"]

    json_502, json_502_calls = run_scenario("json502_api")
    assert json_502.returncode == 0, json_502.stderr
    assert json_502_calls.count("up api-service") == 2
    assert json_502_calls.count("list api-service") == 6
    assert "provider_code=UPLOAD_FAILED http_status=502" in json_502.stdout
    assert json_502_calls[-2:] == ["up mcp-service", "up frontend-service"]

    json_403, json_403_calls = run_scenario("json403_api")
    assert json_403.returncode != 0
    assert json_403_calls == ["up api-service"]
    assert "provider_code=UPLOAD_FAILED http_status=403" in json_403.stdout

    secret_code, secret_code_calls = run_scenario("secretcode_api")
    assert secret_code.returncode != 0
    assert secret_code_calls == ["up api-service"]
    assert "provider_code=UNCLASSIFIED http_status=NONE" in secret_code.stdout
    assert "SECRET_SHOULD_NOT_APPEAR" not in secret_code.stdout
    assert "SECRET_SHOULD_NOT_APPEAR" not in secret_code.stderr

    unmatched, unmatched_calls = run_scenario("unmatched_upload_error_api")
    assert unmatched.returncode != 0
    assert unmatched_calls == ["up api-service"]
    assert "provider_code=UPLOAD_FAILED http_status=NONE" in unmatched.stdout
    assert "SECRET_SHOULD_NOT_APPEAR" not in unmatched.stdout
    assert "SECRET_SHOULD_NOT_APPEAR" not in unmatched.stderr

    peak_window, peak_window_calls = run_scenario("peak_window_api")
    assert peak_window.returncode != 0
    assert peak_window_calls == ["up api-service"]
    assert "code=free_tier_peak_window" in peak_window.stdout
    assert "kind=scheduled_provider_window" in peak_window.stdout
    assert "region=asia-southeast1-eqsg3a" in peak_window.stdout
    assert "earliest_retry_utc=" in peak_window.stdout
    assert "earliest_retry_utc=NONE" not in peak_window.stdout
    assert "list api-service" not in peak_window_calls
    assert not any(call.startswith("sleep ") for call in peak_window_calls)
    assert "SECRET_SHOULD_NOT_APPEAR" not in peak_window.stdout
    assert "SECRET_SHOULD_NOT_APPEAR" not in peak_window.stderr

    for failing_name in (
        "nonretry_api",
        "ambiguous_api",
        "multidoc_api",
    ):
        failed, failed_calls = run_scenario(failing_name)
        assert failed.returncode != 0
        assert "up mcp-service" not in failed_calls
        assert "up frontend-service" not in failed_calls
        assert "SECRET_SHOULD_NOT_APPEAR" not in failed.stdout
        assert "SECRET_SHOULD_NOT_APPEAR" not in failed.stderr
        assert "stdout_sha256=" in failed.stdout
        assert "stderr_sha256=" in failed.stdout


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

    # Pre-reset wake-up and liveness probes use fail-with-body; the deliberate
    # maintenance readiness probe captures its expected HTTP 503 explicitly.
    assert workflow.count("curl --fail-with-body") == 2
    assert "--write-out '%{http_code}'" in workflow
    assert 'test "$status" = 503' in workflow
    assert '.status == "maintenance"' in workflow
    assert "Verify exact API maintenance and database isolation before demo provisioning" in workflow
    assert "fetch()" in workflow
    assert workflow.count(" &\n") >= 6
    assert '.status == "healthy" and .git_commit == $sha' in workflow
    assert '.status == "ok" and .git_commit == $sha' in workflow
    assert workflow.count('.status == "ready"') == 2
    assert workflow.count('.database.transport == "supabase_direct"') == 2
    assert workflow.count('.database.principal == "erp_runtime"') == 2
    assert workflow.count(".database.principal_isolated == true") == 2
    assert workflow.count(".database.migration_owner_member == false") == 2
    assert workflow.count(".database.row_security == true") == 2
    assert workflow.count(".database.ip_version == 6") == 2
    assert '.service == "aasopharma-erp" and .git_commit == $sha' in workflow
    assert "deployment_id:$api_deployment_id" in workflow
    assert "deployment_id:$mcp_deployment_id" in workflow
    assert "deployment_id:$frontend_deployment_id" in workflow


def test_workflow_binds_frontend_origin_to_registered_railway_domain() -> None:
    workflow = _workflow()

    assert '"origin_suffix": ".up.railway.app"' in (
        ROOT / "deploy/control-plane/canonical-staging.json"
    ).read_text(encoding="utf-8")
    assert "deployment_control.py preflight" in workflow
    assert "railway domain list" in workflow
    assert '--service "$RAILWAY_FRONTEND_SERVICE"' in workflow
    assert '[.. | objects | .domain? // empty] | index($domain) != null' in workflow
    assert "SUPABASE_ACCESS_TOKEN:" in workflow
    assert "reconcile_supabase_auth_redirect.py" in workflow
