from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_identity_prepare_and_render_reconciliation_are_non_destructive() -> None:
    staging = _read(".github/workflows/canonical-staging.yml")
    prepare = _read("backend/scripts/provision_canonical_evidence_storage_identity.py")

    assert staging.count("--phase prepare") == 2
    assert staging.count("--evidence-credential-cutover-phase prepare") == 2
    assert "retire_canonical_evidence_storage_credential.py" not in staging
    assert "def inspect_retired_custom_api_key" in prepare
    inspected = prepare.split("def inspect_retired_custom_api_key", 1)[1].split(
        "def _append_environment", 1
    )[0]
    assert 'client.management("DELETE"' not in inspected
    assert '"state": "prepared"' in prepare
    assert '"legacy_secret_api_key_retained"' in prepare


def test_retirement_follows_exact_sha_browser_and_database_reconciliation() -> None:
    readiness = _read(".github/workflows/production-readiness.yml")

    deploy = readiness.index("Bind live18 to the exact reviewed deployed SHA")
    browser = readiness.index("Run the exact-SHA live18 desktop browser certification")
    reconciliation = readiness.index(
        "Reconcile every template-ready browser resource through MCP and PostgreSQL"
    )
    retirement = readiness.index(
        "Retire the legacy evidence credential after exact-SHA backend proof"
    )
    assert deploy < browser < reconciliation < retirement
    retirement_step = readiness[retirement:].split("- name:", 2)[0]
    assert "steps.live18_reconciliation.outcome == 'success'" in retirement_step
    assert "--prepare-receipt" in retirement_step
    assert "--proof-receipt" in retirement_step
    assert "--reviewed-sha \"$REVIEWED_DEPLOY_SHA\"" in retirement_step


def test_retirement_command_is_separate_from_auth_hook_rollout() -> None:
    retirement = _read(
        "backend/scripts/retire_canonical_evidence_storage_credential.py"
    )

    assert "reconcile_hook_config" not in retirement
    assert "hook_custom_access_token" not in retirement
    assert retirement.index("retire_render_environment(") < retirement.index(
        "retire_supabase_key("
    )
    assert "LEGACY_KEY_CHANGED_AFTER_PREPARE" in retirement
    assert '"mutation_state": mutation_state' in retirement
