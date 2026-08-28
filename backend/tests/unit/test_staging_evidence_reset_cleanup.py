from __future__ import annotations

from datetime import date, timedelta
import json
from pathlib import Path

import httpx
import pytest

from scripts.cleanup_staging_evidence_storage import (
    AttachmentRecord,
    BUCKET,
    CANONICAL_STAGING_PROJECT_REF,
    CLOSE_WRITER_SQL,
    CONTRACT_VERSION,
    EvidenceInventory,
    EvidenceResetCleanupError,
    MAX_EXACT_KEYS,
    WriterClosure,
    close_writer_authority,
    execute_fenced_cleanup,
    load_inventory,
    open_writer_authority,
    validated_cleanup_keys,
)
from app.infrastructure.evidence_storage_credentials import (
    EvidenceCredentialUnavailable,
)


TODAY = date(2026, 8, 26)
ORG = "00000000-0000-7000-8000-000000000001"
BRANCH = "00000000-0000-7000-8000-000000000002"
KEY = f"{ORG}/{BRANCH}/expense_receipt/{'a' * 64}.pdf"
PUBLISHABLE_KEY = "sb_publishable_" + "e" * 48
ACCESS_TOKEN = "validated-service-token"
CLOSED_AT = "2026-08-26T12:00:00Z"


def _attachment(
    key: str = KEY,
    *,
    status: str = "pending_upload",
    legal_hold: bool = False,
    retention_until: date | None = TODAY - timedelta(days=1),
) -> AttachmentRecord:
    return AttachmentRecord(
        object_key=key,
        status=status,
        legal_hold=legal_hold,
        retention_until=retention_until,
    )


def _inventory(
    *,
    storage_keys: tuple[str, ...] = (KEY,),
    attachments: tuple[AttachmentRecord, ...] | None = None,
) -> EvidenceInventory:
    return EvidenceInventory(
        database_date=TODAY,
        storage_object_keys=storage_keys,
        attachments=attachments if attachments is not None else (_attachment(),),
    )


def _closure(
    *,
    observed: int = 0,
    terminated: int = 0,
    role_installed: bool = True,
) -> WriterClosure:
    return WriterClosure(
        membership_open=False,
        role_posture_safe=True,
        unexpected_member_count=0,
        inherited_role_count=0,
        observed_authenticator_session_count=observed,
        terminated_authenticator_session_count=terminated,
        remaining_preclosure_authenticator_session_count=0,
        verified_at=CLOSED_AT,
        role_installed=role_installed,
        role_absence_verified=not role_installed,
    )


def _run_cleanup(
    inventory: EvidenceInventory,
    *,
    token_provider_factory=None,
    final_storage_keys: tuple[str, ...] = (),
    final_attachments: tuple[AttachmentRecord, ...] | None = None,
    transport: httpx.BaseTransport | None = None,
    events: list[str] | None = None,
    closure: WriterClosure | None = None,
) -> dict[str, object]:
    observed = events if events is not None else []
    final_inventory = EvidenceInventory(
        database_date=inventory.database_date,
        storage_object_keys=final_storage_keys,
        attachments=(
            inventory.attachments
            if final_attachments is None
            else final_attachments
        ),
    )
    inventories = iter((inventory, final_inventory))

    class TokenProvider:
        def authorization_headers(self):
            return {
                "apikey": PUBLISHABLE_KEY,
                "Authorization": f"Bearer {ACCESS_TOKEN}",
            }

        def invalidate(self, _rejected_token):
            return None

    def close_writer() -> WriterClosure:
        observed.append("close")
        return closure or _closure()

    return execute_fenced_cleanup(
        project_ref=CANONICAL_STAGING_PROJECT_REF,
        load_current_inventory=lambda: next(inventories),
        open_writer=lambda: observed.append("open"),
        close_writer=close_writer,
        token_provider_factory=token_provider_factory or TokenProvider,
        transport=transport,
    )


def test_admin_inventory_reads_exact_bucket_keys_and_canonical_metadata():
    executed: list[tuple[str, tuple[object, ...] | None]] = []
    result_sets = iter(
        [
            [(TODAY,)],
            [(KEY,)],
            [(KEY, "pending_upload", False, TODAY - timedelta(days=1))],
        ]
    )

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, sql, parameters=None):
            executed.append((sql, parameters))
            if sql.startswith("SET TRANSACTION"):
                self.rows = []
                return
            self.rows = next(result_sets)

        def fetchone(self):
            return self.rows[0] if self.rows else None

        def fetchall(self):
            return self.rows

    class Connection:
        commits = 0

        def cursor(self):
            return Cursor()

        def commit(self):
            self.commits += 1

    connection = Connection()
    inventory = load_inventory(connection)

    assert inventory == _inventory()
    assert connection.commits == 1
    assert executed[0] == (
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
        None,
    )
    assert "FROM storage.objects WHERE bucket_id=%s" in executed[2][0]
    assert executed[2][1] == (BUCKET,)
    assert "FROM core.attachments" in executed[3][0]
    assert "WHERE storage_bucket=%s" in executed[3][0]
    assert executed[3][1] == (BUCKET,)


def test_writer_closure_revokes_before_terminating_hosted_authenticator_sessions():
    executed: list[tuple[str, tuple[object, ...] | None]] = []

    class Cursor:
        def __init__(self, rows, singletons=()):
            self.rows = list(rows)
            self.singletons = list(singletons)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, sql, parameters=None):
            executed.append((sql, parameters))

        def fetchall(self):
            return self.rows

        def fetchone(self):
            return self.singletons.pop(0) if self.singletons else None

    class Connection:
        commits = 0

        def __init__(self):
            self.cursors = iter(
                (
                    Cursor((), ((True, True, 0, 0),)),
                    Cursor(()),
                    Cursor(((101,), (102,)), ((True,), (False,), (0,))),
                    Cursor((), ((False, True, 0, 0),)),
                )
            )

        def cursor(self):
            return next(self.cursors)

        def commit(self):
            self.commits += 1

    connection = Connection()
    closure = close_writer_authority(connection)

    revoke_index = executed.index((CLOSE_WRITER_SQL, None))
    terminate_indexes = [
        index
        for index, (sql, _parameters) in enumerate(executed)
        if "pg_terminate_backend" in sql
    ]
    assert terminate_indexes and min(terminate_indexes) > revoke_index
    assert closure.membership_open is False
    assert closure.observed_authenticator_session_count == 2
    assert closure.terminated_authenticator_session_count == 1
    assert closure.remaining_preclosure_authenticator_session_count == 0
    assert closure.role_installed is True
    assert closure.role_absence_verified is False
    assert connection.commits == 4


def test_writer_closure_preserves_sessions_when_installed_membership_is_closed():
    executed: list[tuple[str, tuple[object, ...] | None]] = []

    class Cursor:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, sql, parameters=None):
            executed.append((sql, parameters))

        def fetchone(self):
            return (False, True, 0, 0)

    class Connection:
        commits = 0

        def cursor(self):
            return Cursor()

        def commit(self):
            self.commits += 1

    closure = close_writer_authority(Connection())

    assert all(sql != CLOSE_WRITER_SQL for sql, _parameters in executed)
    assert all("pg_stat_activity" not in sql for sql, _parameters in executed)
    assert all("pg_terminate_backend" not in sql for sql, _parameters in executed)
    assert closure.role_installed is True
    assert closure.role_absence_verified is False
    assert closure.membership_open is False
    assert closure.observed_authenticator_session_count == 0
    assert closure.terminated_authenticator_session_count == 0


def test_writer_closure_proves_absent_first_install_role_without_revoke():
    executed: list[tuple[str, tuple[object, ...] | None]] = []

    class Cursor:
        def __init__(self, rows=(), singletons=()):
            self.rows = list(rows)
            self.singletons = list(singletons)

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, sql, parameters=None):
            executed.append((sql, parameters))

        def fetchall(self):
            return self.rows

        def fetchone(self):
            return self.singletons.pop(0) if self.singletons else None

    class Connection:
        def __init__(self):
            self.cursors = iter((Cursor(),))

        def cursor(self):
            return next(self.cursors)

        def commit(self):
            return None

    closure = close_writer_authority(Connection())

    assert all(sql != CLOSE_WRITER_SQL for sql, _parameters in executed)
    assert all("pg_stat_activity" not in sql for sql, _parameters in executed)
    assert all("pg_terminate_backend" not in sql for sql, _parameters in executed)
    assert closure.role_installed is False
    assert closure.role_absence_verified is True
    assert closure.role_posture_safe is True
    assert closure.membership_open is False
    assert closure.observed_authenticator_session_count == 0
    assert closure.terminated_authenticator_session_count == 0


def test_writer_open_is_exact_and_verified():
    executed: list[str] = []

    class Cursor:
        def __init__(self, row=None):
            self.row = row

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, sql, _parameters=None):
            executed.append(sql)

        def fetchone(self):
            return self.row

    class Connection:
        def __init__(self):
            self.cursors = iter((Cursor(), Cursor((True,))))

        def cursor(self):
            return next(self.cursors)

        def commit(self):
            return None

    open_writer_authority(Connection())
    assert executed[0] == "GRANT erp_evidence_storage TO authenticator"
    assert "pg_has_role" in executed[1]


def test_exact_expired_rejected_object_is_a_cleanup_candidate():
    assert validated_cleanup_keys(_inventory()) == (KEY,)


def test_empty_inventory_is_reconciled_without_inventing_a_key():
    assert validated_cleanup_keys(_inventory(storage_keys=(), attachments=())) == ()


@pytest.mark.parametrize(
    ("storage_keys", "attachments", "reason"),
    [
        ((KEY,), (), "storage_only_count=1"),
        ((), (_attachment(),), "metadata_only_count=1"),
        ((KEY, KEY), (_attachment(),), "duplicate_storage=1"),
        ((KEY,), (_attachment(), _attachment()), "duplicate_metadata=1"),
    ],
)
def test_one_to_one_reconciliation_refuses_orphans_and_duplicates(
    storage_keys, attachments, reason
):
    with pytest.raises(EvidenceResetCleanupError, match=reason):
        validated_cleanup_keys(
            _inventory(storage_keys=storage_keys, attachments=attachments)
        )


@pytest.mark.parametrize(
    ("attachment", "reason"),
    [
        (_attachment(legal_hold=True), "legal_hold=1"),
        (_attachment(retention_until=None), "missing_retention=1"),
        (_attachment(status="not-canonical"), "invalid_status=1"),
    ],
)
def test_legal_retention_and_lifecycle_protection_always_fail_closed(
    attachment, reason
):
    with pytest.raises(EvidenceResetCleanupError, match=reason):
        validated_cleanup_keys(_inventory(attachments=(attachment,)))


@pytest.mark.parametrize("status", ["pending_upload", "verified", "quarantined", "retained"])
def test_explicit_disposable_reset_accepts_every_canonical_nonheld_status(status):
    attachment = _attachment(
        status=status,
        retention_until=TODAY + timedelta(days=365),
    )
    assert validated_cleanup_keys(_inventory(attachments=(attachment,))) == (KEY,)


def test_invalid_object_shape_is_refused_even_when_metadata_matches():
    invalid = "outside-reviewed-shape/file.pdf"
    with pytest.raises(EvidenceResetCleanupError, match="invalid object key"):
        validated_cleanup_keys(
            _inventory(
                storage_keys=(invalid,),
                attachments=(_attachment(invalid),),
            )
        )


def test_cleanup_refuses_more_than_one_bounded_exact_request():
    keys = tuple(
        f"{ORG}/{BRANCH}/expense_receipt/{index:064x}.pdf"
        for index in range(MAX_EXACT_KEYS + 1)
    )
    attachments = tuple(_attachment(key) for key in keys)
    with pytest.raises(EvidenceResetCleanupError, match="exact-key bound"):
        validated_cleanup_keys(
            _inventory(storage_keys=keys, attachments=attachments)
        )


def test_cleanup_sends_one_exact_key_set_with_only_restricted_apikey():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"message": "Successfully deleted"})

    events: list[str] = []
    receipt = _run_cleanup(
        _inventory(),
        transport=httpx.MockTransport(handler),
        events=events,
        closure=_closure(observed=2, terminated=2),
    )

    assert len(requests) == 1
    assert requests[0].method == "DELETE"
    assert requests[0].url.path == f"/storage/v1/object/{BUCKET}"
    assert json.loads(requests[0].content) == {"prefixes": [KEY]}
    assert requests[0].headers["apikey"] == PUBLISHABLE_KEY
    assert requests[0].headers["authorization"] == f"Bearer {ACCESS_TOKEN}"
    assert receipt["contract_version"] == CONTRACT_VERSION
    assert receipt["state"] == "empty"
    assert receipt["reconciled_object_count"] == 1
    assert receipt["deleted_object_count"] == 1
    assert receipt["remaining_object_count"] == 0
    assert receipt["retention_in_force_deleted_count"] == 0
    assert receipt["evidence_writer_membership_open"] is False
    assert receipt["observed_authenticator_session_count"] == 2
    assert receipt["terminated_authenticator_session_count"] == 2
    assert receipt["evidence_writer_closed_at"] == CLOSED_AT
    assert events == ["close", "open", "close"]
    serialized = json.dumps(receipt)
    assert PUBLISHABLE_KEY not in serialized
    assert ACCESS_TOKEN not in serialized
    assert KEY not in serialized
    assert ORG not in serialized
    assert BRANCH not in serialized


def test_empty_bucket_needs_no_api_call_or_placeholder_credential():
    events: list[str] = []
    receipt = _run_cleanup(
        _inventory(storage_keys=(), attachments=()),
        token_provider_factory=lambda: pytest.fail(
            "empty cleanup must not resolve a service credential"
        ),
        transport=httpx.MockTransport(
            lambda _request: pytest.fail("empty cleanup must not call Storage")
        ),
        events=events,
    )
    assert receipt["deleted_object_count"] == 0
    assert receipt["reconciled_object_count"] == 0
    assert receipt["remaining_object_count"] == 0
    assert receipt["object_key_set_sha256"] == (
        "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570"
    )
    assert events == ["close"]


def test_empty_first_install_accepts_only_explicitly_verified_role_absence():
    receipt = _run_cleanup(
        _inventory(storage_keys=(), attachments=()),
        token_provider_factory=lambda: pytest.fail(
            "empty first install must not resolve a credential"
        ),
        closure=_closure(role_installed=False),
    )

    assert receipt["evidence_writer_role_installed"] is False
    assert receipt["evidence_writer_role_absence_verified"] is True


def test_absent_writer_role_refuses_even_reconciled_nonempty_evidence():
    events: list[str] = []
    with pytest.raises(
        EvidenceResetCleanupError,
        match="role is absent but evidence inventory is not empty",
    ):
        _run_cleanup(
            _inventory(),
            events=events,
            closure=_closure(role_installed=False),
            token_provider_factory=lambda: pytest.fail(
                "an absent writer role must fail before credentials"
            ),
        )
    assert events == ["close"]


def test_ambiguous_writer_installation_state_fails_closed():
    ambiguous = WriterClosure(
        membership_open=False,
        role_posture_safe=True,
        unexpected_member_count=0,
        inherited_role_count=0,
        observed_authenticator_session_count=0,
        terminated_authenticator_session_count=0,
        remaining_preclosure_authenticator_session_count=0,
        verified_at=CLOSED_AT,
        role_installed=False,
        role_absence_verified=False,
    )
    with pytest.raises(
        EvidenceResetCleanupError,
        match="installation state is ambiguous",
    ):
        _run_cleanup(
            _inventory(storage_keys=(), attachments=()),
            closure=ambiguous,
        )


def test_cleanup_invalidates_one_rejected_service_token_and_retries_once():
    requests: list[httpx.Request] = []
    invalidated: list[str] = []

    class RotatingProvider:
        calls = 0

        def authorization_headers(self):
            self.calls += 1
            token = f"service-token-{self.calls}"
            return {
                "apikey": PUBLISHABLE_KEY,
                "Authorization": f"Bearer {token}",
            }

        def invalidate(self, rejected_token):
            invalidated.append(rejected_token)

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(401 if len(requests) == 1 else 204)

    receipt = _run_cleanup(
        _inventory(),
        token_provider_factory=RotatingProvider,
        transport=httpx.MockTransport(handler),
    )
    assert len(requests) == 2
    assert invalidated == ["service-token-1"]
    assert receipt["state"] == "empty"


def test_nonempty_reconciled_inventory_requires_the_supported_credential():
    with pytest.raises(
        EvidenceResetCleanupError,
        match="reviewed service-user token provider",
    ):
        _run_cleanup(
            _inventory(),
            token_provider_factory=lambda: (_ for _ in ()).throw(
                EvidenceCredentialUnavailable("not configured")
            ),
            transport=httpx.MockTransport(
                lambda _request: pytest.fail(
                    "cleanup must not use an unsupported credential fallback"
                )
            ),
        )


def test_receipt_counts_explicit_disposable_retention_override():
    receipt = _run_cleanup(
        _inventory(
            attachments=(
                _attachment(
                    status="retained",
                    retention_until=TODAY + timedelta(days=365),
                ),
            )
        ),
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={})),
    )

    assert receipt["retention_in_force_deleted_count"] == 1


@pytest.mark.parametrize("status", [400, 401, 403, 404, 500])
def test_storage_api_failure_is_classified_without_response_body(status):
    with pytest.raises(EvidenceResetCleanupError, match=f"http_status={status}"):
        _run_cleanup(
            _inventory(),
            final_storage_keys=(KEY,),
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    status, text="do-not-leak-provider-response"
                )
            ),
        )


def test_nonempty_postcondition_refuses_success_receipt():
    with pytest.raises(EvidenceResetCleanupError, match="remaining=1"):
        _run_cleanup(
            _inventory(),
            final_storage_keys=(KEY,),
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(200, json={})
            ),
        )


def test_write_after_initial_snapshot_is_caught_after_writer_closure():
    events: list[str] = []
    with pytest.raises(EvidenceResetCleanupError, match="remaining=1"):
        _run_cleanup(
            _inventory(storage_keys=(), attachments=()),
        final_storage_keys=(KEY,),
            events=events,
        )
    assert events == ["close"]


def test_metadata_write_after_initial_snapshot_is_caught_after_writer_closure():
    events: list[str] = []
    with pytest.raises(EvidenceResetCleanupError, match="metadata changed"):
        _run_cleanup(
            _inventory(storage_keys=(), attachments=()),
            final_attachments=(_attachment(),),
            events=events,
        )
    assert events == ["close"]


def test_storage_failure_always_leaves_writer_closed():
    events: list[str] = []
    with pytest.raises(EvidenceResetCleanupError, match="http_status=500"):
        _run_cleanup(
            _inventory(),
            events=events,
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(500, text="private-provider-body")
            ),
        )
    assert events == ["close", "open", "close"]


def test_verified_closure_preserves_the_primary_inventory_failure():
    events: list[str] = []
    with pytest.raises(EvidenceResetCleanupError, match="metadata changed") as caught:
        _run_cleanup(
            _inventory(storage_keys=(), attachments=()),
            final_attachments=(_attachment(),),
            events=events,
        )

    assert str(caught.value) == (
        "canonical evidence metadata changed during restricted cleanup"
    )
    assert events == ["close"]


def test_cleanup_rerun_from_an_already_closed_writer_is_idempotent():
    events: list[str] = []
    receipt = _run_cleanup(
        _inventory(storage_keys=(), attachments=()),
        events=events,
        closure=_closure(observed=0, terminated=0),
    )
    assert events == ["close"]
    assert receipt["evidence_writer_membership_open"] is False
    assert receipt["terminated_authenticator_session_count"] == 0


@pytest.mark.parametrize(
    "project_ref",
    ["jfrairkkzxwkhbtqejnz", "not-a-project", ""],
)
def test_cleanup_is_pinned_to_the_reviewed_staging_project(project_ref):
    with pytest.raises(EvidenceResetCleanupError, match="reviewed canonical staging"):
        execute_fenced_cleanup(
            project_ref=project_ref,
            load_current_inventory=lambda: _inventory(
                storage_keys=(), attachments=()
            ),
            open_writer=lambda: pytest.fail("invalid project must not open writer"),
            close_writer=lambda: pytest.fail("invalid project must not close writer"),
            token_provider_factory=lambda: pytest.fail(
                "invalid project must not resolve credentials"
            ),
        )


def test_workflow_decouples_empty_cleanup_from_post_reset_runtime_provisioning():
    workflow = (
        Path(__file__).resolve().parents[3]
        / ".github/workflows/canonical-staging.yml"
    ).read_text(encoding="utf-8")
    cleanup = workflow.index(
        "Remove reconciled unprotected evidence objects before the disposable reset"
    )
    reset = workflow.index("Reset canonical data on the pinned disposable project")
    migration = workflow.index("Apply or verify the approved canonical migration head")
    provision = workflow.index("Provision canonical private evidence storage")
    railway_retired = workflow.index(
        "Prove the competing Railway authority is retired before lifecycle changes"
    )
    render_quiesced = workflow.index(
        "Quiesce reviewed Render clients before deployment or database lifecycle changes"
    )
    pre_cleanup_provision = workflow.index(
        "Provision restricted evidence cleanup authority before the disposable reset"
    )
    assert (
        railway_retired
        < render_quiesced
        < pre_cleanup_provision
        < cleanup
        < migration
        < reset
        < provision
    )
    pre_cleanup_step = workflow[pre_cleanup_provision:cleanup]
    assert "provision_canonical_evidence_storage_identity.py" in pre_cleanup_step
    assert "canonical-evidence-storage.sql" not in pre_cleanup_step
    assert "GRANT erp_evidence_storage TO authenticator" not in pre_cleanup_step
    assert "hook_exists" in pre_cleanup_step
    assert 'test "$object_count" = 0' in pre_cleanup_step
    cleanup_step = workflow[cleanup:reset]
    assert "cleanup_staging_evidence_storage.py" in cleanup_step
    assert "provision_canonical_evidence_storage_key.py" not in cleanup_step
    assert "EVIDENCE_STORAGE_SERVER_API_KEY" not in workflow
    assert "${{ secrets.EVIDENCE_STORAGE_SERVICE_PASSWORD }}" not in workflow
    assert "EVIDENCE_STORAGE_SERVICE_AUTH_USER_ID" in workflow
    assert "DELETE FROM storage.objects" not in workflow
    assert "canonical-evidence-storage-reset-cleanup.json" in cleanup_step
    assert "canonical-evidence-reset-cleanup-v2" in cleanup_step
    assert ".evidence_writer_membership_open == false" in cleanup_step
    assert ".evidence_writer_role_installed == true" in cleanup_step
    assert ".evidence_writer_role_absence_verified == true" in cleanup_step
    assert "check_staging_evidence_reset_first_install.py" in (
        Path(__file__).resolve().parents[3]
        / "database/canonical/ci/run_alembic_postgres15_gate.sh"
    ).read_text(encoding="utf-8")
    assert "REVOKE erp_evidence_storage FROM authenticator" in (
        Path(__file__).resolve().parents[2]
        / "scripts/cleanup_staging_evidence_storage.py"
    ).read_text(encoding="utf-8")
    provision_step = workflow[provision:workflow.index(
        "Prove canonical evidence storage least privilege"
    )]
    assert "if: inputs.deploy_render_pilot == true" in provision_step
    assert "inputs.reset_disposable_data" not in provision_step
    assert "canonical-evidence-storage.sql" in provision_step
    assert "GRANT erp_evidence_storage TO authenticator" not in workflow[:provision]
