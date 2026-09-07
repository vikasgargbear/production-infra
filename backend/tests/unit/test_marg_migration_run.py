"""Exercise whole-run validation, committed recovery, and exact reconciliation."""

from copy import deepcopy
from unittest.mock import Mock
from uuid import UUID

import pytest

from scripts import apply_reviewed_historical_inventory as operator


ORG = UUID("11111111-1111-4111-8111-111111111111")
BRANCH = UUID("22222222-2222-4222-8222-222222222222")
LOCATION = UUID("33333333-3333-4333-8333-333333333333")
DATASET = "marg-reviewed-test"


def fact(key, kind="party", **fields):
    return {"source_kind": kind, "record_key": key, "selection_state": "reviewed",
            "payload": {}, **fields}


def request_value(*batches):
    batches = batches or ([fact("party-a")], [fact("party-b")])
    target = {"organization_id": ORG, "branch_id": BRANCH,
              "location_id": LOCATION, "dataset_id": DATASET}
    return {**target, "migration_bundle": {
        "schema_version": "aasopharma.marg-migration.v1", **target,
        "import_requests": [{"dataset_id": DATASET, "branch_id": str(BRANCH),
                             "confirmation": f"IMPORT-HISTORY:{ORG}:{DATASET}",
                             "facts": batch} for batch in batches],
        "exclusions": {"unresolved_returns": 2},
    }}


@pytest.mark.parametrize("field", ["organization_id", "branch_id", "location_id", "dataset_id"])
def test_rejects_wrong_bundle_target_before_any_transaction(monkeypatch, field):
    value = request_value()
    value["migration_bundle"][field] = "another-target"
    transaction = Mock()
    monkeypatch.setattr(operator, "_transaction", transaction)
    with pytest.raises(ValueError, match=field):
        operator._migrate(object(), value)
    transaction.assert_not_called()


@pytest.mark.parametrize("field,bad_value", [
    ("branch_id", str(LOCATION)), ("dataset_id", "another-dataset"),
    ("confirmation", f"IMPORT-HISTORY:{LOCATION}:{DATASET}"),
])
def test_invalid_later_batch_prevents_first_batch_commit(monkeypatch, field, bad_value):
    value = request_value()
    value["migration_bundle"]["import_requests"][1][field] = bad_value
    transaction = Mock()
    monkeypatch.setattr(operator, "_transaction", transaction)
    with pytest.raises(ValueError):
        operator._migrate(object(), value)
    transaction.assert_not_called()


def test_duplicate_source_identity_across_batches_prevents_all_writes(monkeypatch):
    value = request_value([fact("same")], [fact("same")])
    transaction = Mock()
    monkeypatch.setattr(operator, "_transaction", transaction)
    with pytest.raises(ValueError, match="repeats a source record identity"):
        operator._migrate(object(), value)
    transaction.assert_not_called()


class MemoryConnection:
    """Model transaction boundaries; canonical command behavior is mocked separately."""

    def __init__(self):
        self.committed = {}
        self.pending = {}
        self.commits = 0
        self.rollbacks = 0

    def __enter__(self):
        self.pending = deepcopy(self.committed)
        return self

    def __exit__(self, exc_type, *_):
        if exc_type is None:
            self.committed = deepcopy(self.pending)
            self.commits += 1
        else:
            self.pending = deepcopy(self.committed)

    def cursor(self):
        cursor = Mock()
        cursor.__enter__ = Mock(return_value=cursor)
        cursor.__exit__ = Mock(return_value=False)
        return cursor

    def rollback(self):
        self.pending = deepcopy(self.committed)
        self.rollbacks += 1


def test_resume_preserves_committed_chunks_and_replays_without_duplicates(monkeypatch):
    connection = MemoryConnection()
    value = request_value([fact("product-a", "product")], [fact("party-b")])
    for name in ("_attest_reviewed_database", "_enter_migration_owner",
                 "_activate_reviewed_user", "_leave_migration_owner"):
        monkeypatch.setattr(operator, name, Mock())
    attempted = []
    fail_once = [True]

    def import_command(cursor, batch):
        rows = batch["import_request"]["facts"]
        for row in rows:
            key = (row["source_kind"], row["record_key"])
            attempted.append(key)
            connection.pending.setdefault(key, row)
            if row["record_key"] == "party-b" and fail_once[0]:
                fail_once[0] = False
                raise RuntimeError("connection interrupted during second batch")
        return {"accepted": len(rows)}

    monkeypatch.setattr(operator, "_import_batch", import_command)
    phases = []
    monkeypatch.setattr(operator, "_promote_parties", lambda *_: (
        phases.append("parties") or {"complete": True, "parties_remaining": 0, "openings_remaining": 0}))
    monkeypatch.setattr(operator, "_prepare_tax", lambda *_: phases.append("tax"))
    monkeypatch.setattr(operator, "_promote_products", lambda *_: (
        phases.append("products") or {"complete": True, "products_remaining": 0}))
    monkeypatch.setattr(operator, "_reconcile_migration", lambda *_: (
        phases.append("reconcile") or {"inventory": {"bound_products": 1}}))

    with pytest.raises(RuntimeError, match="second batch"):
        operator._migrate(connection, value)
    assert set(connection.committed) == {("product", "product-a")}
    assert connection.commits == 1
    assert connection.rollbacks == 1
    assert phases == []

    result, status = operator._migrate(connection, value)
    assert result["complete"] is True
    assert result["accepted"] == 2
    assert result["exclusions"] == {"unresolved_returns": 2}
    assert status == {"bound_products": 1}
    assert phases == ["parties", "tax", "products", "reconcile"]
    assert set(connection.committed) == {("product", "product-a"), ("party", "party-b")}
    assert attempted.count(("product", "product-a")) == 2
    assert connection.commits == 7  # Initial chunk, two replays, four final phases.


@pytest.mark.parametrize("remaining", [[4, 4], [4, 5]])
def test_convergence_stops_when_canonical_remaining_does_not_decrease(remaining):
    step = Mock(side_effect=[{"complete": False, "left": n} for n in remaining])
    with pytest.raises(ValueError, match="stopped making progress"):
        operator._converge(step, ("left",), "Test migration")
    assert step.call_count == 2


def test_false_completion_receipt_is_rejected():
    with pytest.raises(ValueError, match="inconsistent completion"):
        operator._converge(lambda: {"complete": True, "left": 1}, ("left",), "Migration")


@pytest.fixture
def reconciliation(monkeypatch):
    value = request_value([
        fact("batch-a", "batch", event_date="2026-09-01", product_code="P1",
             batch_number="B1", quantity="1.250000", inventory_value="12.34"),
        fact("opening-a", "opening_item", event_date="2026-09-01",
             outstanding_amount="34.56", side="receivable"),
    ])
    inventory = {"source_products": 0, "bound_products": 0, "source_batches": 1,
                 "bound_batches": 1, "opening_quantity": "1.250000", "ledger_quantity": "1.250000",
                 "opening_value": "12.34", "ledger_value": "12.34"}
    parties = {"source_parties": 0, "bound_parties": 0, "source_openings": 1,
               "posted_openings": 1, "receivable": "34.56", "payable": "0.00"}
    cursor = Mock()
    cursor.fetchall.return_value = [("batch", 1), ("opening_item", 1)]
    monkeypatch.setattr(operator, "_status", lambda *_: inventory)
    monkeypatch.setattr(operator, "_operational_status", lambda *_: parties)
    return value, cursor, inventory, parties


def test_reconciliation_accepts_exact_fractional_stock_and_money(reconciliation):
    value, cursor, inventory, parties = reconciliation
    result = operator._reconcile_migration(cursor, value, operator._migration_requests(value))
    assert result["inventory"] == inventory
    assert result["parties"] == parties
    assert cursor.execute.call_args.args[1] == (str(ORG), DATASET)


@pytest.mark.parametrize("surface,field,bad_value,message", [
    ("inventory", "ledger_quantity", "1.249999", "stock quantity"),
    ("inventory", "ledger_value", "12.33", "stock value"),
    ("inventory", "opening_value", "12.35", "stock value"),
    ("inventory", "bound_batches", 0, "source_batches"),
    ("parties", "posted_openings", 0, "Opening balance"),
    ("parties", "receivable", "34.55", "receivable"),
])
def test_reconciliation_rejects_incomplete_or_mismatched_ledger(
    reconciliation, surface, field, bad_value, message,
):
    value, cursor, inventory, parties = reconciliation
    {"inventory": inventory, "parties": parties}[surface][field] = bad_value
    with pytest.raises(ValueError, match=message):
        operator._reconcile_migration(cursor, value, operator._migration_requests(value))


def test_reconciliation_rejects_unexpected_source_rows(reconciliation):
    value, cursor, *_ = reconciliation
    cursor.fetchall.return_value = [("batch", 2), ("opening_item", 1)]
    with pytest.raises(ValueError, match="source counts differ"):
        operator._reconcile_migration(cursor, value, operator._migration_requests(value))
