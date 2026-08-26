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
    assert live18["finance.expense_claim.prepare"] == "separate_approver"
    assert live18["inventory.destruction.prepare"] == "separate_approver"
    assert len(MODULE.LIVE18_PREPARE_CAPABILITIES) == 17


def test_live23_fixture_resolution_requires_a_bounded_run_token_and_lineage() -> None:
    with pytest.raises(MODULE.CanonicalLiveIdentityError, match="run token"):
        MODULE._resolve_fixture_identities(object(), "local")

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

    assert MODULE._oauth_token("user@example", "password", "anon", "client") == (
        "oauth-access"
    )
