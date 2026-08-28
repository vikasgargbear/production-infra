from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from scripts import manage_persistent_pilot_web_authority as authority


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW = ROOT / ".github/workflows/canonical-persistent-pilot-authority.yml"


class _Cursor:
    def __init__(self) -> None:
        self.calls = []
        self.many_calls = []

    def execute(self, sql, params=()) -> None:
        self.calls.append((str(sql), tuple(params)))

    def executemany(self, sql, params) -> None:
        self.many_calls.append((str(sql), list(params)))


def _target() -> authority.Target:
    return authority.Target(
        project_ref="rgihahbmkrmhitjdjvev",
        organization_id=uuid4(),
        auth_user_id=uuid4(),
        canonical_user_id=uuid4(),
        authority_nonce="12345:1:open",
    )


def test_purchase_authority_is_short_lived_bounded_and_exact() -> None:
    assert authority.AUTHORITY_HOURS == 8
    assert authority.MAXIMUM_AMOUNT == "10000.00"
    assert authority.WEB_CLIENT_ID == "aasopharma-erp-web"
    assert authority.WRITE_CAPABILITIES == (
        ("procurement.purchase_order.prepare", "actor_confirmation"),
        ("procurement.goods_receipt.prepare", "actor_confirmation"),
        ("procurement.supplier_invoice.prepare", "actor_confirmation"),
        ("procurement.purchase_return.prepare", "separate_approver"),
        ("finance.supplier_payment.prepare", "actor_confirmation"),
        ("finance.supplier_advance.prepare", "separate_approver"),
        ("automation.command.approve", "actor_confirmation"),
        ("automation.command.execute", "actor_confirmation"),
    )


def test_target_rejects_production_and_name_based_discovery(monkeypatch) -> None:
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", "staging-ref")
    monkeypatch.setenv("CANONICAL_PRODUCTION_PROJECT_REFS", "prod-one,staging-ref")
    monkeypatch.setenv("PERSISTENT_PILOT_AUTHORITY_NONCE", "1:1:open")
    with pytest.raises(authority.AuthorityError, match="refuses a production project"):
        authority._target_from_environment()

    source = (ROOT / "backend/scripts/manage_persistent_pilot_web_authority.py").read_text(
        encoding="utf-8"
    )
    for forbidden in ("email", "legal_name", "display_name", "org_name"):
        assert f"WHERE {forbidden}" not in source


def test_open_creates_one_exact_run_scoped_grant(monkeypatch) -> None:
    cursor, target, membership_id = _Cursor(), _target(), uuid4()
    expires_at = datetime(2026, 8, 29, 12, tzinfo=timezone.utc)
    expected_grant_id = UUID(
        str(
            authority.uuid5(
                authority.NAMESPACE_URL,
                f"persistent-pilot-web-authority:{target.organization_id}:"
                f"{target.auth_user_id}:{target.authority_nonce}",
            )
        )
    )
    active_calls = iter(([], [(str(expected_grant_id), authority.CONSENT_VERSION, expires_at)]))
    monkeypatch.setattr(authority, "_active_grants", lambda *_args: next(active_calls))
    monkeypatch.setattr(
        authority,
        "_capability_rows",
        lambda *_args: authority._expected_capability_rows(),
    )

    receipt = authority._open(cursor, target, membership_id)

    assert receipt["state"] == "open"
    assert receipt["agent_grant_id"] == str(expected_grant_id)
    assert receipt["capability_count"] == 9
    assert len(cursor.many_calls) == 1
    write_rows = cursor.many_calls[0][1]
    assert len(write_rows) == 8
    assert {row[2] for row in write_rows} == {
        capability for capability, _approval in authority.WRITE_CAPABILITIES
    }
    assert {row[4] for row in write_rows} == {authority.MAXIMUM_AMOUNT}
    flattened_sql = "\n".join(sql for sql, _params in cursor.calls)
    assert "make_interval(hours => %s)" in flattened_sql
    assert "INSERT INTO core.organizations" not in flattened_sql
    assert "INSERT INTO core.memberships" not in flattened_sql


def test_close_only_suspends_the_reviewed_active_grant(monkeypatch) -> None:
    cursor, target, membership_id, grant_id = _Cursor(), _target(), uuid4(), uuid4()
    expires_at = datetime(2026, 8, 29, 12, tzinfo=timezone.utc)
    active_calls = iter(
        (
            [(str(grant_id), authority.CONSENT_VERSION, expires_at)],
            [],
        )
    )
    monkeypatch.setattr(authority, "_active_grants", lambda *_args: next(active_calls))

    receipt = authority._close(cursor, target, membership_id)

    assert receipt["state"] == "closed"
    assert receipt["agent_grant_id"] == str(grant_id)
    update_sql, update_params = next(
        (sql, params) for sql, params in cursor.calls if "UPDATE automation.agent_grants" in sql
    )
    assert "status='suspended'" in update_sql
    assert update_params == (membership_id, target.organization_id, grant_id)


def test_workflow_never_resets_data_and_requires_exact_deployment() -> None:
    source = WORKFLOW.read_text(encoding="utf-8")

    assert "OPEN_PERSISTENT_PILOT_WEB_AUTHORITY" in source
    assert "CLOSE_PERSISTENT_PILOT_WEB_AUTHORITY" in source
    assert "CANONICAL_STAGING_WEB_TEST_AUTH_USER_ID" in source
    assert "Require one exact deployed SHA before opening writes" in source
    assert '.git_commit == $sha' in source
    assert "manage_persistent_pilot_web_authority.py" in source
    assert "refusing persistent pilot authority against production" in source.lower()
    for forbidden in (
        "reset-boundary",
        "provision-demo",
        "cleanup-identities",
        "DROP SCHEMA",
        "TRUNCATE ",
        "DELETE FROM",
    ):
        assert forbidden not in source
