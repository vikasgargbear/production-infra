import os
import re
import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/revoke_staging_postgres_set_roles.sh"
WORKFLOW = ROOT / ".github/workflows/canonical-staging.yml"


def _run_cleanup(tmp_path: Path, mode: str, scenario: str) -> subprocess.CompletedProcess[str]:
    fake_bin = tmp_path / f"bin-{mode}-{scenario}"
    fake_bin.mkdir()
    calls = tmp_path / f"calls-{mode}-{scenario}"
    psql = fake_bin / "psql"
    psql.write_text(
        """#!/usr/bin/env bash
set -euo pipefail
readback=false
query=""
while test "$#" -gt 0; do
  case "$1" in
    -Atq) readback=true; shift ;;
    -c) query=$2; shift 2 ;;
    *) shift ;;
  esac
done
if test "$readback" = false; then
  printf 'grant:%s\n' "$query" >> "$FAKE_PSQL_CALLS"
  grant_count=$(grep -c '^grant:' "$FAKE_PSQL_CALLS" || true)
  test "$FAKE_PSQL_SCENARIO" != grant_fail
  if test "$FAKE_PSQL_SCENARIO" = grant_fail_once && test "$grant_count" = 1; then
    exit 1
  fi
  exit
fi
printf '%s\n' readback >> "$FAKE_PSQL_CALLS"
readback_count=$(grep -c '^readback$' "$FAKE_PSQL_CALLS" || true)
test "$FAKE_PSQL_SCENARIO" != readback_fail
if test "$FAKE_PSQL_SCENARIO" = readback_fail_once && test "$readback_count" = 1; then
  exit 1
fi
if test "$FAKE_PSQL_SCENARIO" = wrong_state || { test "$FAKE_PSQL_SCENARIO" = wrong_state_once && test "$readback_count" = 1; }; then
  printf '%s\n' '2|2|2|2|2|1|2'
elif test "$FAKE_PSQL_SCENARIO" = indirect_path; then
  printf '%s\n' '2|2|2|2|2|1|1'
elif test "$FAKE_PSQL_SCENARIO" = superuser; then
  printf '%s\n' '2|2|2|2|0|0|0'
elif [[ "$query" == *erp_runtime* ]]; then
  printf '%s\n' '2|2|2|2|2|2|2'
else
  printf '%s\n' '1|1|1|1|1|1|1'
fi
""",
        encoding="utf-8",
    )
    psql.chmod(0o755)
    fake_sleep = fake_bin / "sleep"
    fake_sleep.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    fake_sleep.chmod(0o755)
    return subprocess.run(
        ["bash", str(SCRIPT), mode],
        cwd=ROOT,
        env={
            **os.environ,
            "PATH": f"{fake_bin}:{os.environ['PATH']}",
            "PSYCOPG_DATABASE_URL": "postgresql://secret:must-not-leak@localhost/db",
            "FAKE_PSQL_CALLS": str(calls),
            "FAKE_PSQL_SCENARIO": scenario,
        },
        capture_output=True,
        text=True,
        check=False,
    )


def _calls(tmp_path: Path, mode: str, scenario: str) -> list[str]:
    path = tmp_path / f"calls-{mode}-{scenario}"
    return path.read_text(encoding="utf-8").splitlines() if path.exists() else []


def _workflow_function(name: str) -> str:
    workflow = WORKFLOW.read_text(encoding="utf-8")
    match = re.search(
        rf"(?ms)^(?P<indent> +){re.escape(name)}\(\) \{{\n.*?^(?P=indent)\}}",
        workflow,
    )
    assert match is not None, f"workflow function not found: {name}"
    return textwrap.dedent(match.group(0))


def test_staging_role_cleanup_attests_exact_catalog_state(tmp_path: Path) -> None:
    expected_grants = {
        "migration-owner": (
            "grant:GRANT erp_migration_owner TO postgres "
            "WITH ADMIN FALSE, SET FALSE, INHERIT FALSE"
        ),
        "migration-owner-runtime": (
            "grant:GRANT erp_migration_owner, erp_runtime TO postgres "
            "WITH ADMIN FALSE, SET FALSE, INHERIT FALSE"
        ),
    }
    for mode, expected_grant in expected_grants.items():
        result = _run_cleanup(tmp_path, mode, "success")
        assert result.returncode == 0, result.stderr
        calls = _calls(tmp_path, mode, "success")
        assert calls == [expected_grant, "readback"]


def test_staging_role_cleanup_fails_closed_without_leaking_database_url(
    tmp_path: Path,
) -> None:
    for scenario in (
        "grant_fail",
        "readback_fail",
        "wrong_state",
        "indirect_path",
        "superuser",
    ):
        result = _run_cleanup(tmp_path, "migration-owner-runtime", scenario)
        assert result.returncode != 0
        calls = _calls(tmp_path, "migration-owner-runtime", scenario)
        assert sum(call.startswith("grant:") for call in calls) == 3
        assert calls.count("readback") == (0 if scenario == "grant_fail" else 3)
        assert "secret" not in result.stdout
        assert "secret" not in result.stderr


def test_staging_role_cleanup_retries_the_whole_idempotent_boundary(
    tmp_path: Path,
) -> None:
    for scenario in ("grant_fail_once", "readback_fail_once", "wrong_state_once"):
        result = _run_cleanup(tmp_path, "migration-owner-runtime", scenario)
        assert result.returncode == 0, result.stderr
        calls = _calls(tmp_path, "migration-owner-runtime", scenario)
        assert sum(call.startswith("grant:") for call in calls) == 2
        assert calls.count("readback") == (
            1 if scenario == "grant_fail_once" else 2
        )


def test_staging_role_cleanup_rejects_unreviewed_role_sets(tmp_path: Path) -> None:
    result = _run_cleanup(tmp_path, "arbitrary-role", "success")
    assert result.returncode == 2
    assert "unsupported staging PostgreSQL role-cleanup mode" in result.stderr


def test_workflow_exit_wrappers_preserve_primary_failure_and_surface_cleanup_failure(
    tmp_path: Path,
) -> None:
    wrappers = {
        "cleanup_alembic_on_exit": "cleanup_alembic_membership",
        "cleanup_fixture_roles_on_exit": "cleanup_role_membership",
        "cleanup_demo_role_on_exit": "cleanup_demo_role_membership",
        "cleanup_demo_on_exit": "cleanup_demo_role_membership",
    }
    for wrapper, role_cleanup in wrappers.items():
        function = _workflow_function(wrapper)
        for cleanup_rc, expected_rc in ((0, 7), (1, 1)):
            trace = tmp_path / f"{wrapper}-{cleanup_rc}.trace"
            script = f"""
set -uo pipefail
{role_cleanup}() {{ printf '%s\\n' role >> "$TRACE"; return "$CLEANUP_RC"; }}
cleanup_demo_api() {{ printf '%s\\n' api >> "$TRACE"; }}
{function}
trap {wrapper} EXIT
exit 7
"""
            result = subprocess.run(
                ["bash", "-c", script],
                cwd=ROOT,
                env={
                    **os.environ,
                    "CLEANUP_RC": str(cleanup_rc),
                    "TRACE": str(trace),
                },
                capture_output=True,
                text=True,
                check=False,
            )
            assert result.returncode == expected_rc, result.stderr
            calls = trace.read_text(encoding="utf-8").splitlines()
            assert calls == (["api", "role"] if wrapper == "cleanup_demo_on_exit" else ["role"])
