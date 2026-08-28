from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/canonical-manual-acceptance.yml"


def test_manual_acceptance_reuses_data_and_binds_exact_authority() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "OPEN_CANONICAL_MANUAL_ACCEPTANCE" in source
    assert "CLOSE_CANONICAL_MANUAL_ACCEPTANCE" in source
    assert "group: canonical-staging-live-browser-identities" in source
    assert 'test "$(git rev-parse HEAD)" = "$REVIEWED_SHA"' in source
    assert 'os.environ.get("RAILWAY_GIT_COMMIT_SHA") != value["expected_sha"]' in source
    assert "_set_session_authority_state" in source
    assert "refusing manual authority against production" in source
    assert "runtime_inherits_session_authority" in source
    assert "${{ runner.temp }}" not in source
    assert 'SSH_PRIVATE_KEY=$RUNNER_TEMP/canonical-manual-' in source
    assert 'matching_instance_ids+=("$candidate")' in source
    assert 'test "${#matching_instance_ids[@]}" -eq 1' in source
    assert "Waiting for the exact API instance and SSH key" in source

    # Opening or closing the ACL boundary must never become a data lifecycle
    # operation. Test data persists until a separate, explicitly reviewed reset.
    for forbidden in (
        "reset-boundary",
        "provision-demo",
        "cleanup-identities",
        "DROP SCHEMA",
        "TRUNCATE ",
        "DELETE FROM",
    ):
        assert forbidden not in source


def test_manual_acceptance_does_not_put_database_password_in_command_arguments() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert '--arg password "$SUPABASE_DB_PASSWORD"' in source
    assert 'python -c "$remote_code" < "$request" > "$response"' in source
    assert "--database-url" not in source
