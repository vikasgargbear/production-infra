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
    CONTRACT_VERSION,
    EvidenceInventory,
    EvidenceResetCleanupError,
    MAX_EXACT_KEYS,
    execute_cleanup,
    load_inventory,
    validated_cleanup_keys,
)


TODAY = date(2026, 8, 26)
ORG = "00000000-0000-7000-8000-000000000001"
BRANCH = "00000000-0000-7000-8000-000000000002"
KEY = f"{ORG}/{BRANCH}/expense_receipt/{'a' * 64}.pdf"
API_KEY = "sb_secret_" + "e" * 48


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

    receipt = execute_cleanup(
        project_ref=CANONICAL_STAGING_PROJECT_REF,
        api_key=API_KEY,
        inventory=_inventory(),
        observed_bucket_count=lambda: 0,
        transport=httpx.MockTransport(handler),
    )

    assert len(requests) == 1
    assert requests[0].method == "DELETE"
    assert requests[0].url.path == f"/storage/v1/object/{BUCKET}"
    assert json.loads(requests[0].content) == {"prefixes": [KEY]}
    assert requests[0].headers["apikey"] == API_KEY
    assert "authorization" not in requests[0].headers
    assert receipt["contract_version"] == CONTRACT_VERSION
    assert receipt["state"] == "empty"
    assert receipt["reconciled_object_count"] == 1
    assert receipt["deleted_object_count"] == 1
    assert receipt["remaining_object_count"] == 0
    assert receipt["retention_in_force_deleted_count"] == 0
    serialized = json.dumps(receipt)
    assert API_KEY not in serialized
    assert KEY not in serialized
    assert ORG not in serialized
    assert BRANCH not in serialized


def test_empty_bucket_needs_no_api_call_or_placeholder_credential():
    receipt = execute_cleanup(
        project_ref=CANONICAL_STAGING_PROJECT_REF,
        api_key="",
        inventory=_inventory(storage_keys=(), attachments=()),
        observed_bucket_count=lambda: 0,
        transport=httpx.MockTransport(
            lambda _request: pytest.fail("empty cleanup must not call Storage")
        ),
    )
    assert receipt["deleted_object_count"] == 0
    assert receipt["reconciled_object_count"] == 0
    assert receipt["remaining_object_count"] == 0
    assert receipt["object_key_set_sha256"] == (
        "37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570"
    )


def test_nonempty_reconciled_inventory_requires_the_supported_credential():
    with pytest.raises(
        EvidenceResetCleanupError,
        match="bucket-restricted Supabase secret API key",
    ):
        execute_cleanup(
            project_ref=CANONICAL_STAGING_PROJECT_REF,
            api_key="",
            inventory=_inventory(),
            observed_bucket_count=lambda: pytest.fail(
                "cleanup must fail before claiming an empty postcondition"
            ),
            transport=httpx.MockTransport(
                lambda _request: pytest.fail(
                    "cleanup must not use an unsupported credential fallback"
                )
            ),
        )


def test_receipt_counts_explicit_disposable_retention_override():
    receipt = execute_cleanup(
        project_ref=CANONICAL_STAGING_PROJECT_REF,
        api_key=API_KEY,
        inventory=_inventory(
            attachments=(
                _attachment(
                    status="retained",
                    retention_until=TODAY + timedelta(days=365),
                ),
            )
        ),
        observed_bucket_count=lambda: 0,
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json={})),
    )

    assert receipt["retention_in_force_deleted_count"] == 1


@pytest.mark.parametrize("status", [400, 401, 403, 404, 500])
def test_storage_api_failure_is_classified_without_response_body(status):
    with pytest.raises(EvidenceResetCleanupError, match=f"http_status={status}"):
        execute_cleanup(
            project_ref=CANONICAL_STAGING_PROJECT_REF,
            api_key=API_KEY,
            inventory=_inventory(),
            observed_bucket_count=lambda: 1,
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(
                    status, text="do-not-leak-provider-response"
                )
            ),
        )


def test_nonempty_postcondition_refuses_success_receipt():
    with pytest.raises(EvidenceResetCleanupError, match="remaining=1"):
        execute_cleanup(
            project_ref=CANONICAL_STAGING_PROJECT_REF,
            api_key=API_KEY,
            inventory=_inventory(),
            observed_bucket_count=lambda: 1,
            transport=httpx.MockTransport(
                lambda _request: httpx.Response(200, json={})
            ),
        )


@pytest.mark.parametrize(
    "project_ref",
    ["jfrairkkzxwkhbtqejnz", "not-a-project", ""],
)
def test_cleanup_is_pinned_to_the_reviewed_staging_project(project_ref):
    with pytest.raises(EvidenceResetCleanupError, match="reviewed canonical staging"):
        execute_cleanup(
            project_ref=project_ref,
            api_key=API_KEY,
            inventory=_inventory(storage_keys=(), attachments=()),
            observed_bucket_count=lambda: 0,
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
    assert cleanup < reset < migration < provision
    assert (
        "Provision restricted evidence cleanup authority before the disposable reset"
        not in workflow
    )
    cleanup_step = workflow[cleanup:reset]
    assert "cleanup_staging_evidence_storage.py" in cleanup_step
    assert "provision_canonical_evidence_storage_key.py" not in cleanup_step
    assert (
        "EVIDENCE_STORAGE_SERVER_API_KEY: "
        "${{ secrets.EVIDENCE_STORAGE_SERVER_API_KEY }}"
    ) in workflow
    assert "DELETE FROM storage.objects" not in workflow
    assert "canonical-evidence-storage-reset-cleanup.json" in cleanup_step
    provision_step = workflow[provision:workflow.index(
        "Prove canonical evidence storage least privilege"
    )]
    assert "if: inputs.deploy_render_pilot == true" in provision_step
    assert "inputs.reset_disposable_data" not in provision_step
