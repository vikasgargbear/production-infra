import importlib.util
import json
import sys
from pathlib import Path
from uuid import UUID

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_ephemeral_browser_identities.py"
SCRIPTS = str(SCRIPT.parent)
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)
SPEC = importlib.util.spec_from_file_location("ephemeral_browser_identities", SCRIPT)
identities = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(identities)


def _environment(monkeypatch, tmp_path: Path) -> tuple[Path, Path]:
    state_path = tmp_path / "ephemeral-state.json"
    github_env = tmp_path / "github-env"
    github_env.write_text("", encoding="utf-8")
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", identities.EXPECTED_PROJECT_REF)
    monkeypatch.setenv("SUPABASE_URL", identities.SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "management-token")
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "database-password")
    monkeypatch.setenv("GITHUB_ENV", str(github_env))
    monkeypatch.setattr(identities, "_validate_target", lambda token: None)
    monkeypatch.setattr(
        identities, "_service_role_key", lambda token: "temporary-service-key"
    )
    return state_path, github_env


def _assert_state_has_no_credentials(state_path: Path) -> dict:
    state_text = state_path.read_text(encoding="utf-8")
    state = json.loads(state_text)
    assert "@canonical-staging" not in state_text
    assert "password" not in state_text.lower()
    assert "service" not in state_text.lower()
    assert "management-token" not in state_text
    assert "database-password" not in state_text
    assert "temporary-service-key" not in state_text
    return state


def test_refuses_every_project_except_the_pinned_staging_project(monkeypatch):
    monkeypatch.setenv("CANONICAL_STAGING_PROJECT_REF", "production-project")
    monkeypatch.setenv("SUPABASE_URL", identities.SUPABASE_URL)
    monkeypatch.setattr(
        identities,
        "_request_json",
        lambda *args, **kwargs: pytest.fail("network must not run for a rejected ref"),
    )

    with pytest.raises(identities.EphemeralIdentityError, match="Refusing"):
        identities._validate_target("management-token")


def test_auth_creation_requires_confirmed_identity(monkeypatch):
    monkeypatch.setattr(
        identities,
        "_admin_request",
        lambda *args, **kwargs: {
            "id": "d4000000-0000-7000-8000-000000000001",
            "email_confirmed_at": None,
        },
    )

    with pytest.raises(identities.EphemeralIdentityError, match="not confirmed"):
        identities._create_auth_user(
            "service-key",
            purpose=identities.TWO_USER_PURPOSE,
            role="requester",
            run_token="run-token",
            email="masked@example.invalid",
            password="masked-password",
        )


def test_error_annotations_redact_management_and_database_secrets(monkeypatch):
    monkeypatch.setenv("SUPABASE_ACCESS_TOKEN", "private-management-token")
    monkeypatch.setenv("SUPABASE_DB_PASSWORD", "private-database-password")

    annotation = identities._redacted_annotation(
        RuntimeError("private-management-token private-database-password")
    )

    assert "private-management-token" not in annotation
    assert "private-database-password" not in annotation
    assert annotation == "[REDACTED] [REDACTED]"


def test_provision_exports_credentials_only_to_masked_same_job_environment(
    monkeypatch, tmp_path, capsys
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    created = iter(
        (
            "d4000000-0000-7000-8000-000000000001",
            "d4000000-0000-7000-8000-000000000002",
        )
    )
    monkeypatch.setattr(
        identities, "_create_auth_user", lambda *args, **kwargs: next(created)
    )

    def provision_database(token, path, state, profile):
        assert profile == identities.PROFILE_TWO_USER
        state["database_provisioned"] = True
        identities._write_state(path, state)
        return None

    monkeypatch.setattr(identities, "_provision_database", provision_database)

    identities.provision(state_path)

    state = _assert_state_has_no_credentials(state_path)
    assert state_path.stat().st_mode & 0o777 == 0o600
    assert [entry["role"] for entry in state["auth_users"]] == [
        "requester",
        "reviewer",
    ]
    assert len({entry["auth_user_id"] for entry in state["auth_users"]}) == 2
    exported = github_env.read_text(encoding="utf-8")
    for key in (
        "PLAYWRIGHT_LIVE_REQUESTER_EMAIL",
        "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD",
        "PLAYWRIGHT_LIVE_REVIEWER_EMAIL",
        "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD",
    ):
        assert exported.count(f"{key}=") == 1
    requester_email = next(
        line.split("=", 1)[1]
        for line in exported.splitlines()
        if line.startswith("PLAYWRIGHT_LIVE_REQUESTER_EMAIL=")
    )
    reviewer_email = next(
        line.split("=", 1)[1]
        for line in exported.splitlines()
        if line.startswith("PLAYWRIGHT_LIVE_REVIEWER_EMAIL=")
    )
    assert requester_email != reviewer_email
    output = capsys.readouterr().out
    for value in (
        "temporary-service-key",
        requester_email,
        reviewer_email,
    ):
        assert f"::add-mask::{value}" in output


def test_partial_second_user_failure_remains_fully_cleanable(
    monkeypatch, tmp_path
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    first_user_id = "d4000000-0000-7000-8000-000000000001"
    calls = 0

    def create(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return first_user_id
        raise identities.EphemeralIdentityError("synthetic second-user failure")

    monkeypatch.setattr(identities, "_create_auth_user", create)
    with pytest.raises(identities.EphemeralIdentityError, match="second-user"):
        identities.provision(state_path)

    state = _assert_state_has_no_credentials(state_path)
    assert state["auth_users"] == [
        {"role": "requester", "auth_user_id": first_user_id}
    ]

    database_cleanup = []
    deleted = []
    monkeypatch.setattr(
        identities, "_cleanup_database", lambda token, value: database_cleanup.append(value)
    )
    monkeypatch.setattr(
        identities,
        "_list_run_auth_user_ids",
        lambda key, run_token, purpose: {first_user_id},
    )
    monkeypatch.setattr(
        identities, "_delete_auth_user", lambda key, user_id: deleted.append(user_id)
    )

    identities.cleanup(state_path)

    assert len(database_cleanup) == 1
    assert deleted == [first_user_id]
    assert not state_path.exists()
    cleared = github_env.read_text(encoding="utf-8")
    assert "PLAYWRIGHT_LIVE_REQUESTER_PASSWORD=\n" in cleared
    assert "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD=\n" in cleared


def test_auth_users_are_deleted_even_when_database_cleanup_fails(
    monkeypatch, tmp_path
):
    state_path, _ = _environment(monkeypatch, tmp_path)
    run_token = "d4000000-0000-7000-8000-000000000099"
    auth_user_id = "d4000000-0000-7000-8000-000000000001"
    identities._write_state(
        state_path,
        {
            "version": identities.STATE_VERSION,
            "project_ref": identities.EXPECTED_PROJECT_REF,
            "purpose": identities.TWO_USER_PURPOSE,
            "run_token": run_token,
            "auth_users": [{"role": "requester", "auth_user_id": auth_user_id}],
            "prior_bindings": [],
            "prior_active_grants": [],
            "temporary_grants": {},
            "database_provisioned": False,
        },
    )
    monkeypatch.setattr(
        identities,
        "_cleanup_database",
        lambda *args: (_ for _ in ()).throw(RuntimeError("synthetic DB failure")),
    )
    monkeypatch.setattr(
        identities, "_list_run_auth_user_ids", lambda *args: {auth_user_id}
    )
    deleted = []
    monkeypatch.setattr(
        identities, "_delete_auth_user", lambda key, user_id: deleted.append(user_id)
    )

    with pytest.raises(identities.EphemeralIdentityError, match="database cleanup"):
        identities.cleanup(state_path)

    assert deleted == [auth_user_id]
    assert state_path.exists(), "state must remain available for a cleanup retry"


def test_cleanup_without_state_is_successful_and_clears_same_job_credentials(
    monkeypatch, tmp_path, capsys
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    github_env.write_text(
        "PLAYWRIGHT_LIVE_EMAIL=temporary@example.invalid\n"
        "PLAYWRIGHT_LIVE_PASSWORD=temporary-password\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(
        identities,
        "_validate_target",
        lambda token: pytest.fail("cleanup without state must not call external services"),
    )

    identities.cleanup(state_path)

    assert "No ephemeral browser identity state was present" in capsys.readouterr().out
    cleared = github_env.read_text(encoding="utf-8")
    assert cleared.endswith(
        "PLAYWRIGHT_LIVE_REVIEWER_EMAIL=\n"
        "PLAYWRIGHT_LIVE_REVIEWER_PASSWORD=\n"
    )
    assert "PLAYWRIGHT_LIVE_EMAIL=\n" in cleared
    assert "PLAYWRIGHT_LIVE_PASSWORD=\n" in cleared


def test_browser_grants_have_exact_minimum_maker_checker_capabilities():
    assert identities.LOCK_KEY == "canonical-staging-live-browser-identities"
    requester = {capability[0] for capability in identities.REQUESTER_CAPABILITIES}
    reviewer = {capability[0] for capability in identities.REVIEWER_CAPABILITIES}

    assert requester == {
        "sales.return.prepare",
        "procurement.purchase_return.prepare",
        "inventory.adjustment.prepare",
        "automation.command.execute",
        "automation.command.status.get",
    }
    assert reviewer == {
        "automation.command.approve",
        "automation.command.status.get",
    }
    assert "automation.command.approve" not in requester
    assert "automation.command.execute" not in reviewer
    assert set(identities.REQUESTER_PERMISSIONS) == {
        "sales.return.create",
        "procurement.purchase_return.create",
        "inventory.adjustment.create",
        "automation.command.execute",
        "automation.command.view",
    }
    assert set(identities.REVIEWER_PERMISSIONS) == {
        "automation.command.approve",
        "automation.command.view",
    }
    assert len(identities.IDENTITIES) == 2
    assert len({entry[2] for entry in identities.IDENTITIES}) == 2
    for _, user_id, membership_id in identities.IDENTITIES:
        UUID(user_id)
        UUID(membership_id)


def test_core_operator_profile_exports_one_ephemeral_login_and_derived_fixture(
    monkeypatch, tmp_path
):
    state_path, github_env = _environment(monkeypatch, tmp_path)
    auth_user_id = "d4000000-0000-7000-8000-000000000001"
    fixture = json.dumps({"branch_id": "d3000000-0000-7000-8000-000000000005"})
    monkeypatch.setattr(
        identities, "_create_auth_user", lambda *args, **kwargs: auth_user_id
    )

    def provision_database(token, path, state, profile):
        assert profile == identities.PROFILE_CORE_OPERATOR
        assert list(state["temporary_grants"]) == ["operator"]
        state["database_provisioned"] = True
        identities._write_state(path, state)
        return fixture

    monkeypatch.setattr(identities, "_provision_database", provision_database)

    identities.provision(state_path, identities.PROFILE_CORE_OPERATOR)

    state = _assert_state_has_no_credentials(state_path)
    assert state["purpose"] == identities.CORE_OPERATOR_PURPOSE
    assert state["auth_users"] == [
        {"role": "operator", "auth_user_id": auth_user_id}
    ]
    exported = github_env.read_text(encoding="utf-8")
    assert "PLAYWRIGHT_LIVE_EMAIL=" in exported
    assert "PLAYWRIGHT_LIVE_PASSWORD=" in exported
    assert f"PLAYWRIGHT_SALES_CHAIN_FIXTURE={fixture}\n" in exported
    assert "PLAYWRIGHT_LIVE_OPERATOR_" not in exported
    assert "PLAYWRIGHT_LIVE_REQUESTER_" not in exported
    assert "PLAYWRIGHT_LIVE_REVIEWER_" not in exported


def test_core_operator_capabilities_cover_unified_writes_and_keep_separate_approval():
    capabilities = {
        capability: approval
        for capability, _, _, approval in identities.CORE_OPERATOR_CAPABILITIES
    }

    assert set(capabilities) == {
        "sales.order.prepare",
        "sales.dispatch.prepare",
        "sales.invoice.prepare",
        "procurement.purchase_order.prepare",
        "procurement.goods_receipt.prepare",
        "procurement.supplier_invoice.prepare",
        "finance.customer_receipt.prepare",
        "finance.supplier_payment.prepare",
        "sales.return.prepare",
        "inventory.adjustment.prepare",
        "automation.command.approve",
        "automation.command.execute",
        "automation.command.status.get",
    }
    for capability in (
        "sales.return.prepare",
        "inventory.adjustment.prepare",
    ):
        assert capabilities[capability] == "separate_approver"
    assert capabilities["automation.command.approve"] == "actor_confirmation"
    assert len(identities.CORE_IDENTITIES) == 1
    assert identities.CORE_IDENTITIES[0][2] == identities.DEMO_OPERATOR_MEMBERSHIP_ID
    assert len(identities.CORE_OPERATOR_PERMISSIONS) == len(
        set(identities.CORE_OPERATOR_PERMISSIONS)
    )
    assert {
        "automation.command.approve",
        "automation.command.execute",
        "automation.command.view",
        "catalog.product.manage",
        "parties.party.manage",
        "parties.customer.manage",
        "parties.supplier.manage",
        "inventory.document.post",
        "inventory.reservation.manage",
        "finance.journal.post",
        "finance.payment.allocate",
    }.issubset(identities.CORE_OPERATOR_PERMISSIONS)


def test_core_fixture_is_resolved_from_available_live_fefo_stock():
    class Cursor:
        sql = ""
        parameters = ()

        def execute(self, sql, parameters):
            self.sql = sql
            self.parameters = parameters

        def fetchall(self):
            return [(
                "d3000000-0000-7000-8000-000000000005",
                "d3000000-0000-7000-8000-000000000011",
                "d3000000-0000-7000-8000-000000000015",
                "d3000000-0000-7000-8000-000000000016",
                "d5000000-0000-7000-8000-000000000001",
                "27",
            )]

    cursor = Cursor()
    fixture = json.loads(identities._resolve_core_sales_fixture(cursor))

    assert "inventory.available_quantity" in cursor.sql
    assert "location.allows_sale" in cursor.sql
    assert "NOT location.allows_negative_stock" in cursor.sql
    assert "ORDER BY batch.expires_on" in cursor.sql
    assert fixture["expected_fefo_batch_id"] == "d5000000-0000-7000-8000-000000000001"
    assert fixture["billed_quantity"] == "1.000000"
    assert fixture["unit_rate"] == "84.0000"
