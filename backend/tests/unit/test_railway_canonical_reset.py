from __future__ import annotations

from contextlib import contextmanager
import json
from pathlib import Path

import pytest

import scripts.railway_canonical_reset as RESET


ROOT = Path(__file__).resolve().parents[3]
SHA = "a" * 40
PROJECT_REF = "rgihahbmkrmhitjdjvev"
PRODUCTION_REFS = "not-the-staging-project"


def _cleanup_receipt() -> dict[str, object]:
    return {
        "contract_version": "canonical-evidence-reset-cleanup-v2",
        "state": "empty",
        "project_ref": PROJECT_REF,
        "bucket": "canonical-evidence-private-v1",
        "database_date": "2026-08-27",
        "reconciled_object_count": 2,
        "deleted_object_count": 2,
        "remaining_object_count": 0,
        "object_key_set_sha256": "b" * 64,
        "legal_hold_count": 0,
        "evidence_writer_membership_open": False,
        "evidence_writer_role_installed": True,
        "evidence_writer_role_absence_verified": False,
        "evidence_writer_role_posture_safe": True,
        "evidence_writer_unexpected_member_count": 0,
        "evidence_writer_inherited_role_count": 0,
        "observed_authenticator_session_count": 1,
        "terminated_authenticator_session_count": 1,
        "remaining_preclosure_authenticator_session_count": 0,
        "evidence_writer_closed_at": "2026-08-27T00:00:00Z",
        "retention_in_force_deleted_count": 2,
        "completed_at": "2026-08-27T00:00:01Z",
    }


def _write_cleanup_receipt(path: Path, **overrides: object) -> Path:
    payload = {**_cleanup_receipt(), **overrides}
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _transport_receipt() -> dict[str, object]:
    return {
        "mode": RESET.CONTROL_TRANSPORT_GITHUB_IPV4,
        "role": "postgres",
        "host": f"db.{PROJECT_REF}.supabase.co",
        "port": 5432,
        "database": "postgres",
        "network_family": 4,
        "ipv4_answer_count": 1,
        "selected_ipv4_address": "verified-not-persisted",
        "row_security": True,
        "migration_owner_member": False,
    }


class _Connection:
    def __init__(self):
        self._context_depth = 0
        self.closed = False

    def __enter__(self):
        if self._context_depth:
            raise RESET.psycopg2.ProgrammingError(
                "the connection cannot be re-entered recursively"
            )
        self._context_depth += 1
        return self

    def __exit__(self, *_args):
        self._context_depth -= 1
        return False

    def close(self):
        self.closed = True


def _common_stubs(monkeypatch: pytest.MonkeyPatch, calls: list[str]) -> None:
    monkeypatch.setattr(RESET, "_validate_boundary", lambda **_kwargs: calls.append("validate"))
    monkeypatch.setattr(
        RESET,
        "_admin_database_url",
        lambda **_kwargs: ("postgresql://redacted", _transport_receipt()),
    )

    @contextmanager
    def delegation(_database_url: str, *, project_ref: str):
        assert project_ref == PROJECT_REF
        calls.append("delegate")
        try:
            yield
        finally:
            calls.append("revoke")

    monkeypatch.setattr(RESET, "_temporary_owner_delegation", delegation)
    monkeypatch.setattr(RESET.psycopg2, "connect", lambda _url: _Connection())
    monkeypatch.setattr(
        RESET,
        "verify_post_cleanup_role_state",
        lambda *_args, **_kwargs: {
            "migration_owner_authority_semantics": "explicit_pg_auth_members_paths",
            "postgres_migration_owner_set": False,
            "postgres_migration_owner_usage": False,
            "verification_principal_superuser": False,
        },
    )


def test_reset_closes_fence_then_quiesces_sessions_and_resets(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[str] = []
    _common_stubs(monkeypatch, calls)
    monkeypatch.setattr(RESET, "load_reset_authority", lambda: "authority")

    def fence(_database_url: str, *, action: str, commit_sha: str):
        calls.append(f"fence:{action}:{commit_sha}")
        return {"state": "closed"}

    monkeypatch.setattr(RESET, "apply_fence", fence)
    monkeypatch.setattr(
        RESET,
        "_terminate_isolated_sessions",
        lambda _url: calls.append("terminate") or {
            "targeted_session_count": 2,
            "terminated_session_count": 2,
            "remaining_targeted_session_count": 0,
        },
    )

    def execute(_connection, *, authority, project_ref, expected_evidence_object_count):
        assert authority == "authority"
        assert project_ref == PROJECT_REF
        assert expected_evidence_object_count == 0
        calls.append("reset")
        return {
            "disposable_row_count_after_reset": 0,
            "evidence_storage_object_count_after_reset": 0,
        }

    monkeypatch.setattr(RESET, "execute_reset", execute)
    receipt = RESET.reset_disposable_staging(
        expected_sha=SHA,
        project_ref=PROJECT_REF,
        production_project_refs=PRODUCTION_REFS,
        password="secret",
        evidence_cleanup_receipt_path=_write_cleanup_receipt(
            tmp_path / "cleanup.json"
        ),
    )

    assert calls == [
        "validate",
        "delegate",
        f"fence:close:{SHA}",
        "terminate",
        "reset",
        "revoke",
    ]
    assert receipt["post_reset_fence_state"] == "closed"
    assert receipt["session_quiescence"]["remaining_targeted_session_count"] == 0
    assert receipt["transport"]["selected_ipv4_address"] == "verified-not-persisted"
    assert receipt["evidence_cleanup"]["deleted_object_count"] == 2
    assert len(receipt["evidence_cleanup"]["receipt_sha256"]) == 64
    assert "1.1.1.1" not in json.dumps(receipt)


def test_reset_failure_revokes_owner_and_does_not_open_fence(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[str] = []
    _common_stubs(monkeypatch, calls)
    monkeypatch.setattr(RESET, "load_reset_authority", lambda: "authority")
    monkeypatch.setattr(
        RESET,
        "apply_fence",
        lambda *_args, **_kwargs: calls.append("fence:close") or {"state": "closed"},
    )
    monkeypatch.setattr(
        RESET,
        "_terminate_isolated_sessions",
        lambda _url: calls.append("terminate") or {
            "targeted_session_count": 0,
            "terminated_session_count": 0,
            "remaining_targeted_session_count": 0,
        },
    )
    monkeypatch.setattr(
        RESET,
        "execute_reset",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected")),
    )

    with pytest.raises(RuntimeError, match="injected"):
        RESET.reset_disposable_staging(
            expected_sha=SHA,
            project_ref=PROJECT_REF,
            production_project_refs=PRODUCTION_REFS,
            password="secret",
            evidence_cleanup_receipt_path=_write_cleanup_receipt(
                tmp_path / "cleanup.json"
            ),
        )

    assert calls[-1] == "revoke"
    assert not any(item == "fence:open" for item in calls)


def test_invalid_cleanup_receipt_fails_after_fence_and_before_reset(
    monkeypatch, tmp_path: Path
) -> None:
    calls: list[str] = []
    _common_stubs(monkeypatch, calls)
    monkeypatch.setattr(RESET, "load_reset_authority", lambda: "authority")
    monkeypatch.setattr(
        RESET,
        "apply_fence",
        lambda *_args, **_kwargs: calls.append("fence:close") or {"state": "closed"},
    )
    monkeypatch.setattr(
        RESET,
        "_terminate_isolated_sessions",
        lambda _url: calls.append("terminate") or {},
    )
    monkeypatch.setattr(
        RESET,
        "execute_reset",
        lambda *_args, **_kwargs: calls.append("reset") or {},
    )

    with pytest.raises(
        RESET.RailwayCanonicalResetError, match="empty closed boundary"
    ):
        RESET.reset_disposable_staging(
            expected_sha=SHA,
            project_ref=PROJECT_REF,
            production_project_refs=PRODUCTION_REFS,
            password="secret",
            evidence_cleanup_receipt_path=_write_cleanup_receipt(
                tmp_path / "cleanup.json", remaining_object_count=1
            ),
        )

    assert calls == ["validate", "delegate", "fence:close", "revoke"]


def test_prepare_reset_fences_quiesces_and_upgrades_exact_head(monkeypatch) -> None:
    calls: list[str] = []
    _common_stubs(monkeypatch, calls)
    monkeypatch.setattr(RESET, "load_reset_authority", lambda: "authority")
    monkeypatch.setattr(
        RESET,
        "apply_fence",
        lambda *_args, **_kwargs: calls.append("fence:close") or {"state": "closed"},
    )
    monkeypatch.setattr(
        RESET,
        "_terminate_isolated_sessions",
        lambda _url: calls.append("terminate") or {
            "targeted_session_count": 1,
            "terminated_session_count": 1,
            "remaining_targeted_session_count": 0,
        },
    )
    monkeypatch.setattr(
        RESET,
        "_upgrade_exact_migration_head",
        lambda *_args, **_kwargs: calls.append("migrate")
        or {
            "alembic_head": "20260827_0030",
            "auth_schema_present": True,
            "storage_schema_present": True,
        },
    )

    receipt = RESET.prepare_reset_boundary(
        expected_sha=SHA,
        project_ref=PROJECT_REF,
        production_project_refs=PRODUCTION_REFS,
        password="secret",
    )

    assert calls == [
        "validate",
        "delegate",
        "fence:close",
        "terminate",
        "migrate",
        "revoke",
    ]
    assert receipt["action"] == "prepare-reset"
    assert receipt["migration"]["alembic_head"] == "20260827_0030"


def test_migration_upgrade_runs_exact_head_twice_then_verifies(monkeypatch) -> None:
    runs: list[tuple[tuple[str, ...], Path, str]] = []

    def run(command, *, cwd, env, check):
        assert check is True
        runs.append((tuple(command), cwd, env["DATABASE_URL"]))

    monkeypatch.setattr(RESET.subprocess, "run", run)
    monkeypatch.setattr(RESET.psycopg2, "connect", lambda _url: _Connection())
    monkeypatch.setattr(
        RESET,
        "verify_reset_boundary",
        lambda *_args, **_kwargs: {"alembic_head": "20260827_0030"},
    )

    receipt = RESET._upgrade_exact_migration_head(
        "postgresql://redacted", authority="authority", project_ref=PROJECT_REF
    )

    assert len(runs) == 2
    assert runs[0][0][-2:] == ("upgrade", "head")
    assert runs[0] == runs[1]
    assert runs[0][2] == "postgresql+psycopg2://redacted"
    assert receipt["alembic_head"] == "20260827_0030"


def test_open_fence_is_a_separate_post_deploy_action(monkeypatch) -> None:
    calls: list[str] = []
    _common_stubs(monkeypatch, calls)
    monkeypatch.setattr(
        RESET,
        "apply_fence",
        lambda _url, *, action, commit_sha: calls.append(f"fence:{action}")
        or {"state": action},
    )

    receipt = RESET.open_fence_after_deploy(
        expected_sha=SHA,
        project_ref=PROJECT_REF,
        production_project_refs=PRODUCTION_REFS,
        password="secret",
    )

    assert calls == ["validate", "delegate", "fence:open", "revoke"]
    assert receipt["action"] == "open-fence"
    assert receipt["write_fence"]["state"] == "open"


def test_failure_compensation_closes_fence(monkeypatch) -> None:
    calls: list[str] = []
    _common_stubs(monkeypatch, calls)
    monkeypatch.setattr(
        RESET,
        "apply_fence",
        lambda _url, *, action, commit_sha: calls.append(f"fence:{action}")
        or {"state": action},
    )

    receipt = RESET.close_fence_after_failure(
        expected_sha=SHA,
        project_ref=PROJECT_REF,
        production_project_refs=PRODUCTION_REFS,
        password="secret",
    )

    assert calls == ["validate", "delegate", "fence:close", "revoke"]
    assert receipt["action"] == "close-fence"
    assert receipt["write_fence"]["state"] == "close"


def test_boundary_rejects_non_railway_and_production(monkeypatch) -> None:
    manifest = {
        "deployment": {"selected_provider": "render"},
        "providers": {"render": {"authority": "active"}},
        "supabase": {"project_ref": PROJECT_REF},
    }
    monkeypatch.setattr(RESET, "load_manifest", lambda _path: manifest)
    monkeypatch.setattr(RESET, "active_provider_name", lambda _manifest: "render")
    with pytest.raises(RESET.RailwayCanonicalResetError, match="sole active"):
        RESET._validate_boundary(
            expected_sha=SHA,
            project_ref=PROJECT_REF,
            production_project_refs=PRODUCTION_REFS,
        )

    monkeypatch.setattr(RESET, "active_provider_name", lambda _manifest: "railway")
    with pytest.raises(RESET.RailwayCanonicalResetError, match="production"):
        RESET._validate_boundary(
            expected_sha=SHA,
            project_ref=PROJECT_REF,
            production_project_refs=PROJECT_REF,
        )


def test_workflow_orders_reset_fence_and_exact_deployment() -> None:
    workflow = (
        ROOT / ".github/workflows/railway-canonical-staging.yml"
    ).read_text(encoding="utf-8")
    production = (
        ROOT / ".github/workflows/production-readiness.yml"
    ).read_text(encoding="utf-8")

    register_key = workflow.index("Register one run-scoped Railway reset SSH key")
    reset = workflow.index(
        "Execute the reviewed reset source inside Railway direct IPv6"
    )
    deploy = workflow.index("Force-upload the exact source tree")
    prove = workflow.index("Prove exact Railway authority remains closed before demo provisioning")
    api_isolation = workflow.index(
        "Verify exact API maintenance and database isolation before demo provisioning"
    )
    public_readiness = workflow.index("Verify all public services publish the reviewed SHA")
    prove_open = workflow.index("Prove selected provider authority and inactive standbys")
    oauth = workflow.index("Reconcile the exact Railway frontend OAuth redirect")
    reclose = workflow.index("Re-close writes after any certification failure")
    remove_source = workflow.index("Remove the run-scoped Railway reset source")
    remove_key = workflow.index("Remove the run-scoped Railway reset SSH key")
    upload = workflow.index("name: railway-canonical-staging-")
    assert (
        register_key < reset < deploy < prove < api_isolation
        < public_readiness < prove_open < oauth < upload < reclose
        < remove_source < remove_key
    )
    reset_block = workflow[reset:deploy]
    assert "git archive --format=tar.gz" in reset_block
    assert 'test "$upload_result" = "UPLOAD_OK:$source_sha256"' in reset_block
    assert "railway_reset_control_plane.py close-fence" in reset_block
    assert "railway_reset_control_plane.py prepare-boundary" in reset_block
    assert "railway_reset_control_plane.py reset-boundary" in reset_block
    assert 'execution_source:"reviewed_source_archive"' in reset_block
    assert 'action="close-fence"' in reset_block
    assert 'action="prepare-boundary"' in reset_block
    assert "verify_response(reset_response" in reset_block
    prepare_call = reset_block.index(
        "railway_reset_control_plane.py prepare-boundary"
    )
    reset_guard = reset_block.index(
        "if test '${{ inputs.reset_disposable_data }}' = true; then"
    )
    assert prepare_call < reset_guard < reset_block.index(
        "railway_reset_control_plane.py reset-boundary"
    )
    execute_step_header = reset_block.split("run: |", 1)[0]
    assert "if: inputs.reset_disposable_data" not in execute_step_header
    register_block = workflow[register_key:reset]
    assert 'eval "$(ssh-agent -s)"' in register_block
    assert 'ssh-add "$RAILWAY_RESET_SSH_PRIVATE_KEY"' in register_block
    assert '--key "$fingerprint"' in register_block
    assert 'select(.status == "SUCCESS" and .deploymentStopped == false)' in reset_block
    assert 'select(.instances[0].status == "RUNNING")' in reset_block
    assert "for attempt in $(seq 1 12); do" in reset_block
    assert 'printf "%s|%s" "$1" "$RAILWAY_GIT_COMMIT_SHA"' in reset_block
    assert "timeout --signal=TERM 20s railway ssh" in reset_block
    assert "8388608" in reset_block
    assert "UPLOAD_OK:" in reset_block
    assert "timeout --signal=TERM 60s railway ssh" in reset_block
    assert "after 12 attempts" in reset_block
    reset_transport = reset_block[
        reset_block.index("reset_request_sha256=") : reset_block.index(
            'touch "$RAILWAY_RESET_FENCE_CLOSED"',
            reset_block.index("reset_request_sha256="),
        )
    ]
    assert "for attempt in $(seq 1 3); do" in reset_transport
    assert (
        'attempt_receipt="$RUNNER_TEMP/railway-reset-control-attempt-$attempt.json"'
        in reset_transport
    )
    assert '< "$reset_request" > "$attempt_receipt" || reset_rc=$?' in reset_transport
    assert 'test "$reset_rc" -eq 255' in reset_transport
    assert 'verify_reset_receipt "$attempt_receipt"' in reset_transport
    assert (
        'mv -f "$attempt_receipt" \\\n                railway-reset-evidence/railway-reset-control.json'
        in reset_transport
    )
    assert 'if test "$reset_rc" -ne 255; then' in reset_transport
    assert "Railway reset failed with non-transport status" in reset_transport
    assert "reattest_reset_host" in reset_transport
    assert '--arg deployment "$RAILWAY_RESET_BOOTSTRAP_DEPLOYMENT_ID"' in reset_transport
    assert '--arg instance "$RAILWAY_RESET_BOOTSTRAP_INSTANCE_ID"' in reset_transport
    assert 'test "$observed_host_sha" != "$RAILWAY_RESET_BOOTSTRAP_HOST_SHA"' in reset_transport
    assert (
        'test "$(sha256sum "$reset_request" | cut -d\' \' -f1)" = \\\n              "$reset_request_sha256"'
        in reset_transport
    )
    assert ">> \"$attempt_receipt\"" not in reset_transport
    preclose_marker = reset_block.index('touch "$RAILWAY_RESET_FENCE_CLOSED"')
    uncertain_marker = reset_block.index('rm -f "$RAILWAY_RESET_FENCE_CLOSED"')
    reset_call = reset_block.index("railway_reset_control_plane.py reset-boundary")
    verified_marker = reset_block.rindex('touch "$RAILWAY_RESET_FENCE_CLOSED"')
    assert preclose_marker < uncertain_marker < reset_call < verified_marker
    assert reset_block.count("evidence_writer_closure") >= 1
    assert "DELETE FROM storage.objects" not in workflow
    assert "--fence closed" in workflow[prove:public_readiness]
    assert "railway_reset_control_plane.py open-fence" not in workflow
    assert "defer_write_fence_open:" not in workflow
    assert "defer_write_fence_open:" not in production
    assert 'DEFER_WRITE_FENCE_OPEN: "true"' in workflow
    public_block = workflow[public_readiness:prove_open]
    assert 'test "$DEFER_WRITE_FENCE_OPEN" = true' in public_block
    assert "lifecycle_status=maintenance" in public_block
    assert "fence_state=closed" in public_block
    prove_block = workflow[prove_open:oauth]
    assert '--fence "$fence_state"' in prove_block
    assert "railway_reset_control_plane.py close-fence" in workflow[reclose:remove_source]
    assert "if: failure()" in workflow[reclose:]
    compensation = workflow[reclose:remove_source]
    assert 'test -f "$RAILWAY_RESET_FENCE_CLOSED"' in compensation
    assert 'test ! -f "$RAILWAY_RESET_FENCE_OPENED"' in compensation
    assert "railway-reset-bootstrap-instance-id" in compensation
    assert "reviewed_source_archive" in compensation
    assert "exact_railway_deployment" in compensation
    assert "Write-fence closure is unattested" in compensation
    assert "find \"$root\" -depth -delete" in workflow[remove_source:remove_key]
    assert "railway ssh keys remove" in workflow[remove_key:]
    assert "Waiting for Railway SSH key removal" in workflow[remove_key:]
    assert 'test "$key_removed" != true' in workflow[remove_key:]
    assert 'ssh-add -d "$RAILWAY_RESET_SSH_PRIVATE_KEY"' in workflow[remove_key:]
    assert 'absent_observations=$((absent_observations + 1))' in workflow[remove_key:]
    assert "ssh-add -D" in workflow[remove_key:]
    assert "ssh-agent -k" in workflow[remove_key:]
    assert "manage_render_pilot_lifecycle.py" not in workflow
    assert "reset_disposable_data: ${{ inputs.reset_canonical_staging }}" in production

    live18 = production.split("\n  live18-acceptance:", 1)[1]
    demo_step = live18.split(
        "Verify exact migration head and provision same-run demo over Railway direct IPv6",
        1,
    )[1].split("Build the masked exact erp_runtime connection", 1)[0]
    assert "Railway direct demo did not open exact-SHA canonical session authority" in demo_step
    assert 'write_fence.get("state") == "open"' in demo_step
    assert "--provenance-only" in live18[: live18.index(demo_step)]
    assert "--provenance-only" not in demo_step
    assert demo_step.count("verify_live18_deployment_sha.py") == 1
    assert '--api-deployment-id "$RAILWAY_API_DEPLOYMENT_ID"' in demo_step
    assert '--mcp-deployment-id "$RAILWAY_MCP_DEPLOYMENT_ID"' in demo_step
    assert '--frontend-deployment-id "$RAILWAY_FRONTEND_DEPLOYMENT_ID"' in demo_step
    assert "for attempt in $(seq 1 30); do" in demo_step
    assert "Railway did not become ready after canonical session authority opened" in demo_step


def test_railway_reset_reuses_version_safe_role_cleanup_authority() -> None:
    source = (ROOT / "backend/scripts/railway_canonical_reset.py").read_text(
        encoding="utf-8"
    )
    assert source.count("pg_has_role(") == 1
    assert "pg_has_role(current_user,'erp_migration_owner','MEMBER')" in source
    assert "pg_has_role(current_user,'erp_migration_owner','SET')" not in source
    assert "return verify_post_cleanup_role_state(" in source
    assert "_verify_owner_cleanup(database_url, project_ref=project_ref)" in source


def test_owner_delegation_recovery_is_serialized_and_explicit() -> None:
    source = (ROOT / "backend/scripts/railway_canonical_reset.py").read_text(
        encoding="utf-8"
    )
    control = (ROOT / "backend/scripts/railway_reset_control_plane.py").read_text(
        encoding="utf-8"
    )
    assert "OWNER_DELEGATION_LOCK_KEY" in source
    assert "pg_catalog.pg_advisory_lock(%s)" in source
    assert "pg_catalog.pg_advisory_unlock(%s)" in source
    assert "with _owner_delegation_lock(database_url):" in source
    assert source.count("recover_stale_owner_delegation=True") == 3
    assert control.count("recover_stale_owner_delegation=True") == 3
    assert 'WITH INHERIT FALSE, SET FALSE' in source


def test_database_failure_codes_are_stage_bound_without_error_text() -> None:
    class InjectedDatabaseError(Exception):
        pgcode = "42501"

    error = InjectedDatabaseError("secret relation and query details")

    assert RESET._database_failure_code(error) == (
        "InjectedDatabaseError:sqlstate_42501"
    )
    assert "secret" not in RESET._database_failure_code(error)


@pytest.mark.parametrize(
    ("message", "expected_code"),
    [
        (
            "canonical managed role set is incomplete",
            "managed_role_set_incomplete",
        ),
        (
            "canonical managed role credential set is incomplete",
            "credential_set_incomplete",
        ),
        (
            "postgres retains temporary migration-owner delegation",
            "migration_owner_delegation_present",
        ),
        (
            "canonical login-role password presence is incomplete",
            "login_role_password_missing",
        ),
        (
            "canonical NOLOGIN roles retain stored passwords",
            "nonlogin_role_password_present",
        ),
        (
            "unsafe canonical role posture: erp_runtime",
            "unsafe_role_posture_erp_runtime",
        ),
    ],
)
def test_role_cleanup_failure_codes_are_specific_and_credential_free(
    message: str, expected_code: str
) -> None:
    error = RESET.ResetAuthorityError(message)
    assert RESET._role_cleanup_failure_code(error) == expected_code


def test_role_cleanup_failure_code_rejects_unclassified_message_content() -> None:
    error = RESET.ResetAuthorityError("unexpected sensitive diagnostic")
    assert (
        RESET._role_cleanup_failure_code(error)
        == "unclassified_reset_authority_error"
    )


def test_temporary_owner_delegation_does_not_reenter_verifier_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []
    connection = _Connection()
    monkeypatch.setattr(
        RESET,
        "_set_owner_delegation",
        lambda _database_url, *, enabled: calls.append(
            "delegate" if enabled else "revoke"
        ),
    )
    monkeypatch.setattr(RESET.psycopg2, "connect", lambda _url: connection)

    @contextmanager
    def owner_lock(_database_url: str):
        calls.append("lock")
        try:
            yield
        finally:
            calls.append("unlock")

    monkeypatch.setattr(RESET, "_owner_delegation_lock", owner_lock)

    def verify(candidate, *, project_ref):
        assert candidate is connection
        assert project_ref == PROJECT_REF
        with candidate:
            calls.append("verify")

    monkeypatch.setattr(RESET, "verify_post_cleanup_role_state", verify)

    with RESET._temporary_owner_delegation(
        "postgresql://redacted", project_ref=PROJECT_REF
    ):
        calls.append("body")

    assert calls == ["lock", "delegate", "body", "revoke", "verify", "unlock"]
    assert connection.closed is True
