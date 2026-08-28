import importlib.util
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_ephemeral_canonical_live.py"
SPEC = importlib.util.spec_from_file_location("ephemeral_canonical_live", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_state_is_non_secret_and_mode_0600(tmp_path):
    path = tmp_path / "state.json"
    state = {
        "version": MODULE.STATE_VERSION,
        "project_ref": MODULE.EXPECTED_PROJECT_REF,
        "purpose": MODULE.PURPOSE,
        "client_id": "reviewed-public-client",
        "temporary_grants": {"requester": "id-1", "reviewer": "id-2"},
    }
    MODULE._write_state(path, state)

    assert MODULE._read_state(path) == state
    assert path.stat().st_mode & 0o777 == 0o600
    text = path.read_text()
    for forbidden in ("password", "access_token", "refresh_token", "service_role"):
        assert forbidden not in text


def test_state_refuses_another_project(tmp_path):
    path = tmp_path / "state.json"
    path.write_text(
        json.dumps(
            {
                "version": MODULE.STATE_VERSION,
                "project_ref": "aaaaaaaaaaaaaaaaaaaa",
                "purpose": MODULE.PURPOSE,
            }
        )
    )
    with pytest.raises(MODULE.CanonicalLiveIdentityError, match="state is invalid"):
        MODULE._read_state(path)


def test_capabilities_keep_requester_and_independent_reviewer_separate():
    requester = dict(MODULE.REQUESTER_CAPABILITIES)
    reviewer = dict(MODULE.REVIEWER_CAPABILITIES)

    assert requester["sales.return.prepare"] == "separate_approver"
    assert requester["procurement.purchase_return.prepare"] == "separate_approver"
    assert requester["inventory.adjustment.prepare"] == "separate_approver"
    assert requester["automation.command.execute"] == "actor_confirmation"
    assert set(reviewer) == {
        "automation.command.approve",
        "automation.command.status.get",
    }


def test_live18_capabilities_extend_only_the_live18_profile_from_generated_authority():
    ordinary = dict(MODULE.REQUESTER_CAPABILITIES)
    live18 = dict(MODULE.LIVE18_MCP_REQUESTER_CAPABILITIES)

    assert "finance.expense_claim.prepare" not in ordinary
    assert "inventory.destruction.prepare" not in ordinary
    assert "finance.expense_claim.prepare" not in live18
    assert live18["inventory.destruction.prepare"] == "separate_approver"
    assert len(MODULE.LIVE18_PREPARE_CAPABILITIES) == 21
    assert {
        "finance.adjustment_note.reversal.prepare",
        "finance.customer_cheque_bounce.prepare",
        "finance.customer_cheque_clearance.prepare",
        "procurement.purchase_return.reversal.prepare",
        "sales.return.reversal.prepare",
    }.issubset(dict(MODULE.LIVE18_PREPARE_CAPABILITIES))


def test_live23_fixture_resolution_requires_a_bounded_run_token_and_lineage() -> None:
    for invalid in ("local", "0-1", "1-0", "1" * 21 + "-1", "1-" + "1" * 11):
        with pytest.raises(MODULE.CanonicalLiveIdentityError, match="run token"):
            MODULE._resolve_fixture_identities(object(), invalid)

    source = SCRIPT.read_text(encoding="utf-8")
    for authority in (
        "interstate_customer_account_id",
        "interstate_delivery_address_id",
        "interstate_customer_gstin_id",
        "sez_customer_account_id",
        "sez_delivery_address_id",
        "sez_customer_gstin_id",
        "interstate_registration.taxpayer_type='regular'",
        "sez_registration.taxpayer_type IN ('sez_unit','sez_developer')",
        "state_code<>branch.state_code",
    ):
        assert authority in source


def test_live23_fixture_resolution_uses_the_same_run_demo_namespace() -> None:
    class Cursor:
        def __init__(self):
            self.parameters = None

        def execute(self, _query, parameters):
            self.parameters = parameters

        @staticmethod
        def fetchall():
            return [tuple(f"id-{index}" for index in range(19))]

    cursor = Cursor()

    resolved = MODULE._resolve_fixture_identities(cursor, "33019161460-1")

    cycle_count_authority = MODULE.canonical_live18_cycle_count_authority(
        MODULE.DEMO_ORG_ID, "33019161460", "1"
    )
    assert cursor.parameters[11:13] == (
        cycle_count_authority.attachment_id,
        cycle_count_authority.storage_object_path,
    )
    assert cursor.parameters[13].adapted == cycle_count_authority.sha256
    assert cursor.parameters[14:16] == (
        "LIVE23-INTER-33019161460-1",
        "LIVE23-SEZ-33019161460-1",
    )
    assert resolved["branch_id"] == "id-0"
    assert resolved["cycle_count_evidence_attachment_id"] == "id-12"


def test_live18_cycle_count_authority_is_attempt_scoped() -> None:
    first = MODULE.canonical_live18_cycle_count_authority(
        MODULE.DEMO_ORG_ID, "1234", "1"
    )
    replay = MODULE.canonical_live18_cycle_count_authority(
        MODULE.DEMO_ORG_ID, "1234", "1"
    )
    retry = MODULE.canonical_live18_cycle_count_authority(
        MODULE.DEMO_ORG_ID, "1234", "2"
    )

    assert first == replay
    assert first.attachment_id != retry.attachment_id
    assert first.storage_object_path != retry.storage_object_path
    assert first.sha256 != retry.sha256


def test_pkce_token_comes_from_real_authorization_code_exchange(monkeypatch):
    class LoginResponse:
        ok = True
        status_code = 200

        @staticmethod
        def json():
            return {"access_token": "user-access"}

    class Session:
        def __init__(self):
            self.headers = {}

        def post(self, *_args, **_kwargs):
            return LoginResponse()

    monkeypatch.setattr(MODULE.requests, "Session", Session)
    monkeypatch.setattr(MODULE, "_pkce", lambda: ("verifier", "challenge"))
    monkeypatch.setattr(MODULE, "_start_authorization", lambda *_args, **_kwargs: "auth-id")
    monkeypatch.setattr(MODULE, "_authorization_details", lambda *_args: {"authorization_id": "auth-id"})
    monkeypatch.setattr(MODULE, "_decide", lambda *_args: "https://callback/?code=one")
    monkeypatch.setattr(
        MODULE,
        "_exchange_token",
        lambda *_args, **_kwargs: {
            "access_token": "oauth-access",
            "refresh_token": "oauth-refresh",
        },
    )
    validated = []
    monkeypatch.setattr(
        MODULE,
        "_validate_oauth_access_token_claims",
        lambda token, **kwargs: validated.append((token, kwargs)),
    )

    assert MODULE._oauth_token("user@example", "password", "anon", "client") == (
        "oauth-access"
    )
    assert validated == [
        (
            "oauth-access",
            {
                "client_id": "client",
                "organization_id": MODULE.DEMO_ORG_ID,
            },
        )
    ]


FIXTURE_RUN_TOKEN = "33038267646-1"


def _authority_rows(*, temporary: bool):
    baseline_grants = MODULE._baseline_grants(FIXTURE_RUN_TOKEN)
    rows = []
    for role in ("requester", "reviewer"):
        membership_id = (
            MODULE.DEMO_OPERATOR_MEMBERSHIP_ID
            if role == "requester"
            else MODULE.DEMO_REVIEWER_MEMBERSHIP_ID
        )
        authority = MODULE.BASELINE_AUTHORITY[role]
        status = "suspended" if temporary else "active"
        for capability in authority["capabilities"]:
            rows.append(
                (
                    MODULE.DEMO_ORG_ID,
                    baseline_grants[role],
                    membership_id,
                    "reviewed-client",
                    authority["display_name"],
                    True,
                    "self_consent",
                    authority["consent_version"],
                    True,
                    membership_id,
                    True,
                    membership_id,
                    True,
                    status,
                    status == "active",
                    MODULE.DEMO_REVIEWER_MEMBERSHIP_ID,
                    MODULE.DEMO_REVIEWER_MEMBERSHIP_ID,
                    True,
                    7,
                    capability["capability_code"],
                    capability["operation_mode"],
                    capability["risk_class"],
                    capability["approval_policy"],
                    capability["maximum_amount"],
                    capability["currency_code"],
                    capability["allow_sensitive_read"],
                    capability["status"],
                )
            )
        if temporary:
            for capability in MODULE.LIVE18_TEMPORARY_CAPABILITY_BOUNDS[membership_id]:
                rows.append(
                    (
                        MODULE.DEMO_ORG_ID,
                        f"{1 if role == 'requester' else 2:08d}-0000-4000-8000-000000000000",
                        membership_id,
                        "reviewed-client",
                        f"Ephemeral canonical live {role}",
                        True,
                        "self_consent",
                        MODULE.MCP_TEMPORARY_CONSENT_VERSION,
                        True,
                        membership_id,
                        True,
                        MODULE.DEMO_REVIEWER_MEMBERSHIP_ID,
                        True,
                        "active",
                        True,
                        MODULE.DEMO_REVIEWER_MEMBERSHIP_ID,
                        MODULE.DEMO_REVIEWER_MEMBERSHIP_ID,
                        True,
                        1,
                        capability["capability_code"],
                        capability["operation_mode"],
                        capability["risk_class"],
                        capability["approval_policy"],
                        capability["maximum_amount"],
                        capability["currency_code"],
                        capability["allow_sensitive_read"],
                        capability["status"],
                    )
                )
    return sorted(rows, key=lambda row: (row[1], row[19]))


class _AuthorityCursor:
    def __init__(self, rows):
        self.rows = rows
        self.parameters = None

    def execute(self, _query, parameters):
        self.parameters = parameters

    def fetchall(self):
        return self.rows


def test_mcp_authority_snapshot_accepts_only_exact_baseline_or_same_run_pair():
    baseline_cursor = _AuthorityCursor(_authority_rows(temporary=False))
    baseline_versions, temporary_ids = MODULE._mcp_authority_snapshot(
        baseline_cursor, "reviewed-client", None, FIXTURE_RUN_TOKEN
    )
    assert set(baseline_versions) == set(
        MODULE._baseline_grants(FIXTURE_RUN_TOKEN).values()
    )
    assert temporary_ids == []

    run_token = "11111111-1111-4111-8111-111111111111"
    temporary_cursor = _AuthorityCursor(_authority_rows(temporary=True))
    _baseline_versions, temporary_ids = MODULE._mcp_authority_snapshot(
        temporary_cursor, "reviewed-client", run_token, FIXTURE_RUN_TOKEN
    )
    assert len(temporary_ids) == 2

    with pytest.raises(MODULE.CanonicalLiveIdentityError, match="same-run Auth anchor"):
        MODULE._mcp_authority_snapshot(
            _AuthorityCursor(_authority_rows(temporary=True)),
            "reviewed-client",
            None,
            FIXTURE_RUN_TOKEN,
        )


def test_mcp_authority_snapshot_rejects_capability_drift():
    rows = _authority_rows(temporary=True)
    drifted = list(rows[0])
    drifted[22] = "none"
    rows[0] = tuple(drifted)

    with pytest.raises(MODULE.CanonicalLiveIdentityError, match="drifted"):
        MODULE._mcp_authority_snapshot(
            _AuthorityCursor(rows),
            "reviewed-client",
            "11111111-1111-4111-8111-111111111111",
            FIXTURE_RUN_TOKEN,
        )


def test_mcp_baseline_ids_share_the_demo_run_scoped_authority():
    assert MODULE._baseline_grants(FIXTURE_RUN_TOKEN) == {
        "requester": "601d4ff7-08c0-5501-a2e0-51347f6501f5",
        "reviewer": "bf1b35d0-eecd-5d5e-be1a-397a3a22da0e",
    }
    assert MODULE._baseline_grants("33038267647-1") != MODULE._baseline_grants(
        FIXTURE_RUN_TOKEN
    )


def test_mcp_authority_mutations_bind_the_reviewed_audit_context():
    class Cursor:
        def __init__(self):
            self.executions = []

        def execute(self, query, parameters):
            self.executions.append((query, parameters))

    cursor = Cursor()
    request_id = "11111111-1111-4111-8111-111111111111"

    MODULE._set_mcp_audit_context(cursor, request_id)

    assert cursor.executions == [
        (
            "SELECT set_config(%s,%s,true)",
            ("app.org_id", MODULE.DEMO_ORG_ID),
        ),
        (
            "SELECT set_config(%s,%s,true)",
            ("app.membership_id", MODULE.DEMO_REVIEWER_MEMBERSHIP_ID),
        ),
        ("SELECT set_config(%s,%s,true)", ("app.request_id", request_id)),
    ]
    source = SCRIPT.read_text(encoding="utf-8")
    assert source.count("_set_mcp_audit_context(cursor,") == 4

    with pytest.raises(MODULE.CanonicalLiveIdentityError, match="request ID"):
        MODULE._set_mcp_audit_context(cursor, "not-a-uuid")


def test_live18_auth_records_require_exact_same_project_metadata(monkeypatch):
    monkeypatch.setattr(MODULE, "_auth_admin_authority", lambda _token: object())
    monkeypatch.setattr(
        MODULE,
        "_admin_request",
        lambda *_args, **_kwargs: {
            "users": [
                {
                    "id": "11111111-1111-4111-8111-111111111111",
                    "app_metadata": {
                        "purpose": MODULE.LIVE18_PURPOSE,
                        "ephemeral_run_token": "22222222-2222-4222-8222-222222222222",
                        "browser_role": "requester",
                        "org_id": MODULE.DEMO_ORG_ID,
                    },
                }
            ]
        },
    )

    assert MODULE._live18_auth_records("management-token") == {
        "11111111-1111-4111-8111-111111111111": (
            "requester",
            "22222222-2222-4222-8222-222222222222",
        )
    }
