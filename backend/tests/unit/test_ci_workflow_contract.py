from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
READINESS = (ROOT / ".github/workflows/production-readiness.yml").read_text(
    encoding="utf-8"
)
FAST_DEPLOY = (ROOT / ".github/workflows/railway-pilot-fast-deploy.yml").read_text(
    encoding="utf-8"
)
PILOT_MIGRATION = (
    ROOT / ".github/workflows/railway-pilot-in-place-migration.yml"
).read_text(encoding="utf-8")
RAILWAY_CERTIFICATION = (
    ROOT / ".github/workflows/railway-canonical-staging.yml"
).read_text(encoding="utf-8")
VERSION = (ROOT / ".github/workflows/version-bump.yml").read_text(encoding="utf-8")


def test_pr_checks_are_path_planned_and_superseded_runs_cancel() -> None:
    assert "python backend/scripts/ci_change_plan.py" in READINESS
    assert "github.event.pull_request.number || github.run_id" in READINESS
    assert "cancel-in-progress: ${{ github.event_name == 'pull_request' }}" in READINESS
    assert "name: PR readiness" in READINESS
    assert "push:\n    branches: [main]" not in READINESS


def test_release_certification_is_explicit_and_requires_live18() -> None:
    assert "release_certification:" in READINESS
    assert 'test "$RUN_LIVE18" = true' in READINESS
    assert 'test "$DEPLOY_CANONICAL_STAGING" = true' in READINESS
    live18 = READINESS.split("\n  live18-acceptance:", 1)[1]
    assert "inputs.release_certification && inputs.run_live18" in live18


def test_normal_main_delivery_is_service_scoped_and_non_resetting() -> None:
    assert "name: Railway pilot fast deploy" in FAST_DEPLOY
    assert "cancel-in-progress: true" in FAST_DEPLOY
    assert "strategy:\n      fail-fast: false" in FAST_DEPLOY
    assert 'matrix.component }} is unchanged' in FAST_DEPLOY
    assert "reset" not in FAST_DEPLOY.lower()
    assert "canonical-staging" in FAST_DEPLOY


def test_persistent_pilot_migration_is_explicit_bounded_and_non_resetting() -> None:
    assert "MIGRATE_PERSISTENT_PILOT_IN_PLACE" in PILOT_MIGRATION
    assert "ref: ${{ inputs.reviewed_sha }}" in PILOT_MIGRATION
    assert "cancel-in-progress: false" in PILOT_MIGRATION
    assert "uses: ./.github/workflows/railway-canonical-staging.yml" in PILOT_MIGRATION
    assert "reset_disposable_data: false" in PILOT_MIGRATION
    assert "github_environment: canonical-staging" in PILOT_MIGRATION
    assert "secrets: inherit" in PILOT_MIGRATION
    assert "verify_staging_direct_roles.py" not in PILOT_MIGRATION
    assert "railway_reset_control_plane.py open-fence" in PILOT_MIGRATION
    assert 'reset_disposable_data: false' in PILOT_MIGRATION
    assert 'provision-demo' not in PILOT_MIGRATION
    assert 'fixtures' not in PILOT_MIGRATION.lower()


def test_persistent_pilot_ssh_cleanup_attests_eventual_removal() -> None:
    cleanup = PILOT_MIGRATION.split(
        "- name: Remove the run-scoped Railway SSH key", 1
    )[1]

    assert "cleanup_failed=0" in cleanup
    assert "ssh-add -d \"$PILOT_SSH_PRIVATE_KEY\"" in cleanup
    assert "for attempt in $(seq 1 30); do" in cleanup
    assert "absent_observations=$((absent_observations + 1))" in cleanup
    assert 'test "$absent_observations" -eq 2' in cleanup
    assert "Run-scoped Railway pilot SSH key remained after cleanup" in cleanup
    assert 'exit "$cleanup_failed"' in cleanup


def test_certification_reuses_exact_sha_and_has_separate_authority() -> None:
    assert "default: canonical-certification" in RAILWAY_CERTIFICATION
    assert "environment: ${{ inputs.github_environment }}" in RAILWAY_CERTIFICATION
    assert "reused_exact_sha=true" in RAILWAY_CERTIFICATION
    assert "reused-exact-sha" in RAILWAY_CERTIFICATION
    assert "github_environment: canonical-certification" in READINESS
    assert READINESS.count("\n    environment: canonical-certification") == 4


def test_release_tagging_is_not_an_automatic_merge_job() -> None:
    assert "workflow_dispatch:" in VERSION
    assert "pull_request:" not in VERSION
    assert "release_sha:" in VERSION
