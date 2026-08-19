import importlib.util
import re
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

from app.api.services.finance.journal.service import JournalService


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def _method_source(source: str, method_name: str) -> str:
    match = re.search(
        rf"^    def {re.escape(method_name)}\(.*?(?=^    (?:@staticmethod\n    )?def |\Z)",
        source,
        re.MULTILINE | re.DOTALL,
    )
    assert match, f"method {method_name} not found"
    return match.group(0)


def test_stock_movement_has_one_balance_mutation_owner():
    trigger_source = _read("database/04-triggers/02_inventory_triggers.sql")
    movement_function = trigger_source.split(
        "CREATE OR REPLACE FUNCTION track_inventory_movement()", 1
    )[1].split("$$ LANGUAGE plpgsql;", 1)[0]

    assert "UPDATE inventory.location_wise_stock" not in movement_function
    assert "INSERT INTO inventory.location_wise_stock" not in movement_function
    assert "apply the same movement a second time" in movement_function


def test_invoice_stock_has_one_application_owner():
    service = _read("backend/app/api/services/sales/invoice/invoice_service.py")
    triggers = _read("database/04-triggers/11_core_operations_triggers.sql")

    assert "InventoryService.bulk_update_batch_quantities" in service
    assert "InventoryService.bulk_insert_movements" in service
    assert "def cancel_invoice" in service
    assert "UPDATE inventory.batches" in _method_source(service, "cancel_invoice")
    assert "UPDATE inventory.location_wise_stock" in _method_source(service, "cancel_invoice")
    assert "CREATE OR REPLACE FUNCTION update_inventory_on_sale()" not in triggers
    assert "trigger_inventory_update_on_sale" not in triggers
    assert "trigger_inventory_update_on_cancellation" not in triggers
    assert "Invoice creation and cancellation mutate inventory in InvoiceService" in triggers


def test_stock_out_decision_locks_the_tenant_batch():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "record_stock_movement")

    assert "AND org_id = :org_id" in method
    assert "FOR UPDATE" in method
    assert method.count("org_id = :org_id") >= 2


def test_stock_movement_validates_tenant_owned_references():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "record_stock_movement")
    route = _read("backend/app/api/routes/inventory/stock/routes.py")

    assert "org_id is required to record a stock movement" in method
    assert "Product not found or access denied" in method
    assert "Location not found or access denied" in method
    assert "Batch not found or access denied" in method
    assert '"org_id": context.org_id' in route
    assert '"created_by": context.user_id' in route
    movement_route = route.split("async def record_stock_movement", 1)[1].split(
        "@router.get", 1
    )[0]
    assert "db.commit()" in movement_route


def test_invoice_batch_deduction_is_atomic_and_cannot_go_negative():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "bulk_update_batch_quantities")

    assert "WITH requested(batch_id, quantity)" in method
    assert "batch.quantity_available >= requested.quantity" in method
    assert "RETURNING batch.batch_id" in method
    assert "insufficient or inaccessible stock" in method


def test_invoice_stock_ledgers_use_total_physical_quantity_including_free_units():
    source = _read("backend/app/api/services/sales/invoice/invoice_service.py")
    creation = _method_source(source, "create_invoice_with_items")

    assert '"quantity": item_data["quantity"]' in creation
    assert '"base_quantity": item_data["quantity"]' in creation


def test_location_stock_out_is_locked_and_guarded_against_negative_balance():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "bulk_update_location_wise_stock")

    assert "FOR UPDATE" in method
    assert "quantity_available >= :quantity" in method
    assert "location stock is missing" in method


def test_manual_allocation_locks_payment_and_tenant_invoice():
    source = _read("backend/app/api/services/finance/allocation/service.py")
    payment_method = _method_source(source, "get_payment")
    invoice_method = _method_source(source, "get_invoice")

    assert "FOR UPDATE" in payment_method
    assert "org_id = :org_id" in invoice_method
    assert "FOR UPDATE" in invoice_method


def test_finance_mutations_require_rbac_and_compensating_reversal():
    allocation_routes = _read("backend/app/api/routes/finance/allocation/routes.py")
    journal_routes = _read("backend/app/api/routes/finance/journal/routes.py")

    assert allocation_routes.count('PermissionChecker("finance", "edit")') >= 3
    assert 'PermissionChecker("finance", "delete")' in allocation_routes
    assert 'PermissionChecker("finance", "create")' in journal_routes
    assert 'PermissionChecker("finance", "approve")' in journal_routes
    assert "Compensating journal posted successfully" in journal_routes


def test_all_payment_balance_decisions_lock_rows():
    source = _read("backend/app/api/services/finance/payment/service.py")

    for method_name in ("record_payment", "cancel_payment", "allocate_payment_to_invoices"):
        assert "FOR UPDATE" in _method_source(source, method_name), method_name


def test_payment_creation_has_durable_locked_idempotency():
    routes = _read("backend/app/api/routes/finance/payments/routes.py")
    service = _read("backend/app/api/services/finance/payment/service.py")
    tables = _read("database/02-tables/06_financial_tables.sql")

    assert routes.count('alias="X-Idempotency-Key"') >= 3
    assert "X-Idempotency-Replayed" in routes
    assert "IdempotencyConflictError" in routes
    assert "pg_advisory_xact_lock" in service
    assert "internal_notes LIKE :marker_pattern" in service
    assert "claim.pending_marker" in service
    assert "claim.completed_marker(public_response)" in service
    assert "internal_notes TEXT" in tables


def test_credit_and_debit_note_writes_commit_and_require_create_permission():
    routes = _read("backend/app/api/routes/finance/credit_notes/routes.py")

    assert routes.count('PermissionChecker("finance", "create")') >= 2
    assert routes.count("db.commit()") >= 2
    assert 'note_data["branch_id"] = context.primary_branch_id' in routes


def test_journal_is_draft_until_all_lines_are_inserted():
    service = _read("backend/app/api/services/finance/journal/service.py")
    route = _read("backend/app/api/routes/finance/journal/routes.py")

    assert "'draft', :is_reversal, :reversal_of_journal_id" in service
    assert "def post_journal_entry" in service
    assert route.index("JournalService.insert_journal_line") < route.index(
        "JournalService.post_journal_entry"
    )


def test_journal_reversal_posts_one_linked_compensating_entry():
    service = _read("backend/app/api/services/finance/journal/service.py")
    reversal = _method_source(service, "reverse_journal_entry")

    assert "FOR UPDATE" in reversal
    assert '"reversal_of_journal_id": journal_id' in reversal
    assert '"debit_amount": line.credit_amount' in reversal
    assert '"credit_amount": line.debit_amount' in reversal
    assert "JournalService.post_journal_entry" in reversal
    assert "UPDATE financial.journal_entries" not in reversal


def test_journal_reversal_swaps_debits_and_credits_before_posting():
    class Result:
        def __init__(self, *, first=None, scalar=None, rows=None):
            self._first = first
            self._scalar = scalar
            self._rows = rows or []

        def first(self):
            return self._first

        def scalar(self):
            return self._scalar

        def fetchall(self):
            return self._rows

    class Database:
        def __init__(self):
            self.calls = []
            self.results = iter([
                Result(first=SimpleNamespace(
                    journal_id=7, journal_number="JV-7", branch_id=3
                )),
                Result(scalar=None),
                Result(rows=[
                    SimpleNamespace(
                        account_code="CASH", account_name="Cash",
                        debit_amount=Decimal("100.00"), credit_amount=Decimal("0"),
                        line_narration="Receipt",
                    ),
                    SimpleNamespace(
                        account_code="SALES", account_name="Sales",
                        debit_amount=Decimal("0"), credit_amount=Decimal("100.00"),
                        line_narration="Revenue",
                    ),
                ]),
                Result(scalar=8),
                Result(),
                Result(),
                Result(scalar=8),
            ])

        def execute(self, statement, params):
            self.calls.append((str(statement), params))
            return next(self.results)

    db = Database()
    reversal_id = JournalService.reverse_journal_entry(
        db=db,
        org_id="org-1",
        journal_id=7,
        journal_number="JV-8",
        reversal_date=date(2026, 8, 19),
        reason="Incorrect account",
        created_by=11,
    )

    assert reversal_id == 8
    header = db.calls[3][1]
    assert header["is_reversal"] is True
    assert header["reversal_of_journal_id"] == 7
    first_line = db.calls[4][1]
    second_line = db.calls[5][1]
    assert first_line["debit_amount"] == Decimal("0")
    assert first_line["credit_amount"] == Decimal("100.00")
    assert second_line["debit_amount"] == Decimal("100.00")
    assert second_line["credit_amount"] == Decimal("0")
    assert "SET entry_status = 'posted'" in db.calls[6][0]


def test_posted_journal_lines_are_database_immutable():
    triggers = _read("database/04-triggers/01_financial_triggers.sql")

    assert "trigger_protect_posted_journal_lines" in triggers
    assert "entry_status IN ('posted', 'reversed')" in triggers
    assert "BEFORE INSERT OR UPDATE OR DELETE ON financial.journal_entry_lines" in triggers


def test_posted_journal_headers_reject_edits_and_deletes():
    triggers = _read("database/04-triggers/01_financial_triggers.sql")

    assert "trigger_protect_posted_journal_entries" in triggers
    assert "BEFORE UPDATE OR DELETE ON financial.journal_entries" in triggers
    assert "OLD.entry_status IN ('posted', 'reversed')" in triggers


def test_release_audit_detects_unresolved_integrity_blockers():
    audit_path = REPOSITORY_ROOT / "backend/scripts/audit/transaction_integrity_audit.py"
    spec = importlib.util.spec_from_file_location("transaction_integrity_audit", audit_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    codes = {issue.code for issue in module.collect_issues()}
    assert "PAYMENT_IDEMPOTENCY_MISSING" not in codes
    assert "PAYMENT_IDEMPOTENCY_SCHEMA_UNVERIFIED" in codes
    assert "PAYMENT_MUTATION_IDEMPOTENCY_INCOMPLETE" in codes
    assert "INVOICE_STOCK_OWNERSHIP_CONFLICT" not in codes
    assert "POSTED_JOURNAL_HEADER_MUTABLE" not in codes
    assert "JOURNAL_REVERSAL_NOT_COMPENSATING" not in codes
    assert "JOURNAL_MUTATION_NOT_COMMITTED" not in codes
    assert "JOURNAL_SCHEMA_CONTRACT_MISMATCH" not in codes
    assert "ALLOCATION_TABLE_UNBASELINED" in codes
    assert "ALLOCATION_TENANT_SCOPE_MISSING" not in codes
    assert "ALLOCATION_MUTATION_NOT_COMMITTED" not in codes
    assert "ALLOCATION_TRIGGER_NOT_REPRODUCIBLE" in codes
    assert "CALCULATION_OWNER_DUPLICATED" not in codes
    assert "STOCK_DOUBLE_MUTATION" not in codes
