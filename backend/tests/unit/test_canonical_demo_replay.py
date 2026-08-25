from __future__ import annotations

import importlib.util
from contextlib import contextmanager
from pathlib import Path

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
    def __init__(self) -> None:
        self.executions: list[tuple[str, tuple]] = []

    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _traceback):
        return False

    def execute(self, statement: str, parameters: tuple) -> None:
        self.executions.append((statement, parameters))

    def fetchall(self):
        return [(7,)]


class _Connection:
    def __init__(self) -> None:
        self.cursor_value = _Cursor()

    def cursor(self) -> _Cursor:
        return self.cursor_value


def test_sales_order_uses_exact_database_address_identity_and_version() -> None:
    module = _module()
    connection = _Connection()

    row_version = module.selected_customer_delivery_address_row_version(connection)
    payload = module.sales_order_payload(row_version)

    assert payload["delivery_address_id"] == module.IDS["customer_address"]
    assert payload["delivery_address_row_version"] == "7"
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
    assert "idempotency_key_hash=%s" in cursor.executions[1][0]


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
