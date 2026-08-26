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


def _workflow_run_script(step_name: str, next_step_name: str) -> str:
    workflow = _workflow()
    section = workflow.split(f"- name: {step_name}", 1)[1].split(
        f"- name: {next_step_name}", 1
    )[0]
    run_block = section.split("run: |", 1)[1]
    return textwrap.dedent(run_block)


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

    for service, dockerfile in expected_dockerfiles.items():
        config = _config(service)
        assert config["$schema"] == RAILWAY_SCHEMA
        assert config["build"]["builder"] == "DOCKERFILE"
        assert config["build"]["dockerfilePath"] == dockerfile
        assert config["deploy"]["startCommand"] == expected_start_commands[service]
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


def test_api_watches_every_packaged_migration_authority_input() -> None:
    patterns = set(_config("api")["build"]["watchPatterns"])
    assert {
        "/backend/**",
        "/database/schema-authority.json",
        "/database/canonical/domains/_contract.json",
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


def test_workflow_enables_only_api_ipv6_and_commits_the_exact_staged_patch() -> None:
    workflow = _workflow()
    ipv6_step = workflow[
        workflow.index("Require API outbound IPv6 without absorbing other staged changes") :
        workflow.index("Fail closed on Railway service configuration drift")
    ]

    assert "@railway/cli@5.43.4" in workflow
    assert "@railway/cli@4.30.2" not in workflow
    assert 'railway outbound-network ipv6 status \\' in ipv6_step
    assert 'railway outbound-network ipv6 enable \\' in ipv6_step
    assert '--service "$RAILWAY_API_SERVICE"' in ipv6_step
    assert '--service "$RAILWAY_MCP_SERVICE"' not in ipv6_step
    assert '--service "$RAILWAY_FRONTEND_SERVICE"' not in ipv6_step
    assert ".service.name == $service" in ipv6_step
    assert ".environment.id == $environment" in ipv6_step
    assert ".ipv6.staged == false" in ipv6_step
    assert "normalize_staged_patch" in ipv6_step
    assert "startCommand: null" in ipv6_step
    assert "ipv6EgressEnabled: true" in ipv6_step
    assert "railway-staged-expected.json" in ipv6_step
    assert "railway-staged-reviewed.json" in ipv6_step
    assert "environmentPatchCommitStaged" in ipv6_step
    assert "skipDeploys: true" in ipv6_step
    assert "Converge MCP dashboard override and API direct IPv6 transport" in ipv6_step
    assert ".ipv6.enabled == true and .ipv6.staged == false" in ipv6_step
    assert "railway-staged-after.json" in ipv6_step
    assert "'. == {}' railway-staged-after.json" in ipv6_step
    assert "Railway has unrelated staged configuration" in ipv6_step


def test_workflow_uses_direct_isolated_roles_with_a_staging_pool_budget() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert "SUPABASE_DIRECT_DATABASE_HOST: db.rgihahbmkrmhitjdjvev.supabase.co" in workflow
    assert "SUPABASE_POOLER_HOST:" not in workflow
    assert "SUPABASE_SESSION_POOLER_PORT:" not in workflow
    for principal in ("erp_runtime", "erp_calculator", "erp_tax_provider"):
        assert f'postgresql://{principal}:$(encode' in variable_step
    assert "@${SUPABASE_DIRECT_DATABASE_HOST}:5432/postgres" in variable_step
    assert '.${CANONICAL_STAGING_PROJECT_REF}:' not in variable_step
    assert (
        'set_variable "$RAILWAY_API_SERVICE" DATABASE_TRANSPORT_REQUIREMENT '
        "supabase_direct_ipv6"
    ) in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" DATABASE_POOL_SIZE 3' in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" DATABASE_MAX_OVERFLOW 1' in variable_step
    assert 'set_variable "$RAILWAY_MCP_SERVICE" DATABASE_' not in variable_step
    assert 'set_variable "$RAILWAY_FRONTEND_SERVICE" DATABASE_' not in variable_step


def test_workflow_exposes_a_railway_only_exact_sha_dispatch() -> None:
    workflow = _workflow()

    assert "workflow_dispatch:" in workflow
    assert "Exact reviewed application SHA to upload to all Railway pilot services" in workflow
    assert "ref: ${{ inputs.reviewed_sha }}" in workflow
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in workflow


def test_evidence_storage_is_explicit_restricted_and_fail_closed() -> None:
    workflow = _workflow()
    variable_step = workflow[
        workflow.index("Populate canonical service variables without triggering stale deploys") :
        workflow.index("Force-upload the exact source tree")
    ]

    assert "EVIDENCE_STORAGE_SERVER_API_KEY:" in workflow
    assert "required: false" in workflow.split("EVIDENCE_STORAGE_SERVER_API_KEY:", 1)[1].splitlines()[1]
    assert "evidence_storage_enabled=${EVIDENCE_STORAGE_ENABLED:-false}" in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_ENABLED false' in variable_step
    assert 'test "$EVIDENCE_STORAGE_EXPECTED_PROJECT_REF" = "$CANONICAL_STAGING_PROJECT_REF"' in variable_step
    assert 'test -n "$EVIDENCE_STORAGE_SERVER_API_KEY"' in variable_step
    assert 'sb_secret_*)' in variable_step
    assert 'set_variable "$RAILWAY_API_SERVICE" EVIDENCE_STORAGE_SERVER_API_KEY "$EVIDENCE_STORAGE_SERVER_API_KEY"' in variable_step
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
    assert workflow.index('upload_service api "$RAILWAY_API_SERVICE"') < workflow.index(
        'upload_service mcp "$RAILWAY_MCP_SERVICE"'
    ) < workflow.index('upload_service frontend "$RAILWAY_FRONTEND_SERVICE"')
    assert "api_pid" not in workflow
    assert "mcp_pid" not in workflow
    assert "frontend_pid" not in workflow

    assert "upload_failure_kind()" in workflow
    assert "structured_upload_error()" in workflow
    assert 'def safe_code:' in workflow
    assert 'else "UNCLASSIFIED" end' in workflow
    for safe_code in (
        "UPLOAD_FAILED",
        "RATELIMITED",
        "FETCH_ERROR",
        "UNAUTHORIZED",
        "INVALID_TOKEN",
        "GRAPHQL_ERROR",
    ):
        assert f'. == "{safe_code}"' in workflow
    assert '^Failed to upload code with status code ' in workflow
    assert '[[ "$http_status" =~ ^5[0-9]{2}$ ]]' in workflow
    assert "empty_cli_response" in workflow
    assert "transient_transport" in workflow
    assert "non_retryable" in workflow
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
    assert "service=$label attempt=$attempt exit_code=$exit_code kind=$failure_kind" in workflow
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
    assert "select(.id == $id)" in workflow
    assert (
        "FAILED|CRASHED|SKIPPED|REMOVED|REMOVING|CANCELLED" in workflow
    )
    assert "service_status" in workflow
    assert "require_deployment_contract()" in workflow
    assert workflow.count('meta.rootDirectory // "/"') == 1
    assert ".meta.configFile == $config_file" in workflow
    assert ".meta.cliMessage == $message" in workflow
    assert 'local expected_message=$7' in workflow
    assert '--arg message "$expected_message"' in workflow
    assert ".meta.fileServiceManifest.build.builder" in workflow
    assert ".meta.fileServiceManifest.build.dockerfilePath" in workflow
    assert ".meta.fileServiceManifest.deploy.startCommand" in workflow
    assert ".meta.serviceManifest.build.builder" in workflow
    assert ".meta.serviceManifest.build.dockerfilePath" in workflow
    assert ".meta.serviceManifest.deploy.startCommand" in workflow
    assert 'require_deployment_contract "$RAILWAY_MCP_SERVICE" "$mcp_deployment_id" /deploy/railway/mcp.railway.json /deploy/railway/mcp.Dockerfile /health "$mcp_start_command"' in workflow
    assert ".meta.serviceManifest.deploy.healthcheckPath" in workflow
    assert ".meta.serviceManifest.deploy.sleepApplication == true" in workflow


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

    assert workflow.count("curl --fail-with-body") == 1
    assert "fetch()" in workflow
    assert workflow.count(" &\n") >= 6
    assert '.status == "healthy" and .git_commit == $sha' in workflow
    assert '.status == "ok" and .git_commit == $sha' in workflow
    assert workflow.count('.status == "ready"') == 2
    assert '.database.transport == "supabase_direct"' in workflow
    assert '.database.principal == "erp_runtime"' in workflow
    assert ".database.principal_isolated == true" in workflow
    assert ".database.migration_owner_member == false" in workflow
    assert ".database.row_security == true" in workflow
    assert ".database.ip_version == 6" in workflow
    assert '.service == "aasopharma-erp" and .git_commit == $sha' in workflow
    assert "deployment_id:$api_deployment_id" in workflow
    assert "deployment_id:$mcp_deployment_id" in workflow
    assert "deployment_id:$frontend_deployment_id" in workflow


def test_workflow_binds_frontend_origin_to_registered_railway_domain() -> None:
    workflow = _workflow()

    assert "Railway frontend URL must be one exact Railway HTTPS origin" in workflow
    assert "railway domain list" in workflow
    assert '--service "$RAILWAY_FRONTEND_SERVICE"' in workflow
    assert '[.. | objects | .domain? // empty] | index($domain) != null' in workflow
    assert "SUPABASE_ACCESS_TOKEN:" in workflow
    assert "reconcile_supabase_auth_redirect.py" in workflow
