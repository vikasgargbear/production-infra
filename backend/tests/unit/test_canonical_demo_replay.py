from __future__ import annotations

import importlib.util
from contextlib import contextmanager
from datetime import date
from pathlib import Path
from uuid import UUID

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/provision_canonical_demo.py"


def _module():
    spec = importlib.util.spec_from_file_location("canonical_demo_replay", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _Cursor:
    def __init__(self, rows=None) -> None:
        self.executions: list[tuple[str, tuple]] = []
        self.rows = [(7,)] if rows is None else rows

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return False

    def execute(self, statement: str, parameters: tuple) -> None:
        self.executions.append((statement, parameters))

    def fetchall(self):
        return self.rows


class _Connection:
    def __init__(self) -> None:
        self.cursor_value = _Cursor()

    def cursor(self) -> _Cursor:
        return self.cursor_value


def test_sales_order_uses_exact_database_address_identity_and_version() -> None:
    module = _module()
    connection = _Connection()

    row_version = module.selected_customer_delivery_address_row_version(connection)
    payload = module.sales_order_payload(
        row_version,
        business_date=date(2026, 8, 26),
        delivery_offset_days="2",
    )

    assert payload["delivery_address_id"] == module.IDS["customer_address"]
    assert payload["delivery_address_row_version"] == "7"
    assert payload["order_date"] == "2026-08-26"
    assert payload["requested_delivery_date"] == "2026-08-28"
    assert "shipping_address_id" not in payload
    assert "place_of_supply_state_code" not in payload
    authority_sql = connection.cursor_value.executions[1][0]
    assert "SELECT address.row_version" in authority_sql
    assert "address.valid_from" in authority_sql
    assert "address.valid_until" in authority_sql

    invoice_payload = module.sales_invoice_payload([], row_version)
    assert invoice_payload["delivery_address_id"] == module.IDS["customer_address"]
    assert invoice_payload["delivery_address_row_version"] == "7"
    assert "place_of_supply_state_code" not in invoice_payload


def test_reviewed_web_operator_ids_are_stable_and_separate_from_demo_users() -> None:
    module = _module()
    auth_user_id = "a4c0f185-77ee-4dbb-8288-6ae5d4526593"

    first = module.reviewed_web_operator_ids(auth_user_id)
    second = module.reviewed_web_operator_ids(auth_user_id)

    assert first == second
    assert first["auth_user_id"] == auth_user_id
    assert len({UUID(value) for value in first.values()}) == 4
    assert first["user_id"] not in {
        module.IDS["reviewer_user"],
        module.IDS["operator_user"],
    }


@pytest.mark.parametrize(
    "auth_user_id",
    ["not-a-uuid", "d3000000-0000-7000-8000-000000000002", "d3000000-0000-7000-8000-000000000022"],
)
def test_reviewed_web_operator_ids_reject_invalid_or_fixture_authority(
    auth_user_id: str,
) -> None:
    module = _module()

    with pytest.raises((ValueError, RuntimeError)):
        module.reviewed_web_operator_ids(auth_user_id)


def test_existing_itc_authority_reuses_content_identity_across_ui_runs() -> None:
    module = _module()
    release_id = "d3400000-0000-7000-8000-000000000001"
    rule_id = "d3400000-0000-7000-8000-000000000002"
    dataset_sha256 = bytes.fromhex("ab" * 32)
    connection = _Connection()
    connection.cursor_value = _Cursor([(release_id, rule_id, dataset_sha256)])

    authority = module.resolve_existing_itc_reversal_authority(
        connection, b"reviewed CBIC source bytes"
    )

    assert authority == module.ExistingItcReversalAuthority(
        release_id=release_id,
        rule_version_id=rule_id,
        dataset_sha256=dataset_sha256,
    )
    assert module.IDS["destruction_itc_rule_release"] == release_id
    assert module.IDS["destruction_itc_rule_version"] == rule_id
    statement, parameters = connection.cursor_value.executions[0]
    assert "release.source_document_sha256=%s" in statement
    assert "release.dataset_kind='gst_itc_reversal_rules'" in statement
    assert "rule.rule_version=%s" in statement
    assert len(parameters) == 7


def test_existing_itc_authority_fails_closed_when_ambiguous() -> None:
    module = _module()
    row = (
        "d3400000-0000-7000-8000-000000000001",
        "d3400000-0000-7000-8000-000000000002",
        bytes.fromhex("cd" * 32),
    )
    connection = _Connection()
    connection.cursor_value = _Cursor([row, row])

    with pytest.raises(RuntimeError, match="ambiguous"):
        module.resolve_existing_itc_reversal_authority(
            connection, b"reviewed CBIC source bytes"
        )


def test_regulatory_identity_is_content_scoped_not_ui_run_scoped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITHUB_RUN_ID", "1001")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "1")
    first = _module()
    monkeypatch.setenv("GITHUB_RUN_ID", "2002")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "3")
    second = _module()

    assert first.IDS["destruction_itc_rule_release"] == second.IDS[
        "destruction_itc_rule_release"
    ]
    assert first.IDS["destruction_itc_rule_version"] == second.IDS[
        "destruction_itc_rule_version"
    ]
    assert first.IDS["destruction_certificate_evidence"] != second.IDS[
        "destruction_certificate_evidence"
    ]


def test_grant_identity_is_unique_per_workflow_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITHUB_RUN_ID", "3003")
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "1")
    first = _module()
    monkeypatch.setenv("GITHUB_RUN_ATTEMPT", "2")
    second = _module()

    assert first.IDS["org"] == second.IDS["org"]
    for key in (
        "reviewer_access_grant",
        "operator_access_grant",
        "agent_grant",
        "legacy_approver_agent_grant",
    ):
        assert first.IDS[key] != second.IDS[key]


def test_replay_reconciliation_accepts_only_valid_forward_order_states() -> None:
    module = _module()
    assert module.PURCHASE_ORDER_RECONCILABLE_STATUSES == {
        "approved", "partially_received", "received",
    }
    assert module.SALES_ORDER_RECONCILABLE_STATUSES == {
        "approved", "partially_fulfilled", "fulfilled",
    }
    source = SCRIPT.read_text()
    goods_receipt_reconciliation = source.split(
        "def reconcile_goods_receipt", 1
    )[1].split("\ndef release_received_batch", 1)[0]
    assert "inventory.stock_ledger_entries" in goods_receipt_reconciliation
    assert "balance.on_hand_quantity" not in goods_receipt_reconciliation
    assert "balance.inventory_value" not in goods_receipt_reconciliation
    assert "ledger.quantity_delta AS posted_quantity_delta" in goods_receipt_reconciliation
    cross_table = source.split(
        "def reconcile_cross_table_invariants", 1
    )[1].split("\ndef main", 1)[0]
    assert "expected_command_count = len(command_ids)" in cross_table
    assert "min(command.created_at) AS first_command_at" in cross_table
    assert "requires 12" not in cross_table


def test_existing_command_is_loaded_before_mutable_preflight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _module()
    command_id = "d3000000-0000-7000-8000-000000000083"
    resource_id = "d3000000-0000-7000-8000-000000000084"
    cursor = _Cursor()
    cursor.fetchall = lambda: [(command_id, "succeeded", "b" * 64, resource_id)]
    connection = _Connection()
    connection.cursor_value = cursor

    @contextmanager
    def fake_database_connection(environment_variable: str):
        assert environment_variable == "ERP_RUNTIME_DATABASE_URL"
        yield connection

    monkeypatch.setattr(module, "database_connection", fake_database_connection)
    result = module.existing_demo_command(
        "procurement.purchase_order.prepare",
        {"idempotency_key": "reviewed-preflight-replay"},
    )

    assert result == {
        "command_request_id": command_id,
        "status": "succeeded",
        "preview_hash": f"sha256:{'b' * 64}",
        "resource_id": resource_id,
    }
    assert "erp_automation_reads.requester_command_by_idempotency" in cursor.executions[1][0]
    assert cursor.executions[1][1][1:3] == (
        "procurement.purchase_order.prepare",
        module.CLIENT_ID,
    )


@pytest.mark.parametrize("sales_order", [False, True])
def test_completed_command_resume_is_read_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    sales_order: bool,
) -> None:
    module = _module()
    command_id = "d3000000-0000-7000-8000-000000000081"
    resource_id = "d3000000-0000-7000-8000-000000000082"
    preview_hash = f"sha256:{'a' * 64}"
    calls: list[tuple[str, str]] = []

    def fake_api_call(method, path, *_args, **_kwargs):
        calls.append((method, path))
        assert method == "GET"
        return {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "status": "succeeded",
            "resource_id": resource_id,
        }

    monkeypatch.setattr(module, "api_call", fake_api_call)
    monkeypatch.setattr(module, "existing_demo_command", lambda *_args: {
        "command_request_id": command_id,
        "preview_hash": preview_hash,
        "status": "succeeded",
        "resource_id": resource_id,
    })
    payload = {"idempotency_key": "reviewed-replay-key"}
    if sales_order:
        evidence = module.exercise_sales_order(tmp_path, payload)
    else:
        evidence = module.exercise_action(
            tmp_path,
            "procurement.purchase_order.prepare",
            "procurement.order.manage",
            payload,
        )

    assert evidence["executed"]["resource_id"] == resource_id
    assert evidence["approved"] is None
    assert calls == [
        ("GET", f"/api/internal/mcp/commands/{command_id}"),
    ]
