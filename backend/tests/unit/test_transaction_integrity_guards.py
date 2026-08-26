import json
import re
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

from app.api.services.finance.journal.service import JournalService
from app.api.services.finance.allocation.service import AllocationService
from app.api.services.finance.payment.service import PaymentService
from scripts.audit import transaction_integrity_audit as transaction_audit


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
    legacy_service = (
        REPOSITORY_ROOT / "backend/app/api/services/sales/invoice/invoice_service.py"
    )
    triggers = _read("database/04-triggers/11_core_operations_triggers.sql")
    commands = _read(
        "database/canonical/commands_automation/generate_automation_commands.py"
    )

    assert not legacy_service.exists()
    assert "CREATE OR REPLACE FUNCTION update_inventory_on_sale()" not in triggers
    assert "trigger_inventory_update_on_sale" not in triggers
    assert "trigger_inventory_update_on_cancellation" not in triggers
    assert '"persist_sales_invoice_prepare"' in commands
    assert "inventory.stock_ledger_entries" in commands
    assert "inventory.stock_balances" in commands
    assert "finance.accounting_events" in commands
    assert "tax_classification_code_snapshot" in commands
    assert "tax_code_version_id" in commands


def test_stock_out_decision_locks_the_tenant_batch():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "record_stock_movement")

    assert "AND org_id = :org_id" in method
    assert "FOR UPDATE" in method
    assert method.count("org_id = :org_id") >= 2


def test_legacy_stock_movement_write_is_retired_in_favor_of_canonical_commands():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "record_stock_movement")
    command_route = _read("backend/app/api/routes/web_operator_actions.py")

    assert "org_id is required to record a stock movement" in method
    assert "Product not found or access denied" in method
    assert "Location not found or access denied" in method
    assert "Batch not found or access denied" in method
    assert not (
        REPOSITORY_ROOT / "backend/app/api/routes/inventory/stock/routes.py"
    ).exists()
    assert '"/inventory-adjustment/eligibility"' in command_route
    assert '"/inventory-adjustment/commands/{command_request_id}/readback"' in command_route
    assert "erp_automation_reads.command_authority_context" in command_route
    assert 'operation = "automation.command.execute"' in command_route


def test_invoice_batch_deduction_is_atomic_and_cannot_go_negative():
    source = _read("backend/app/api/services/inventory/inventory_service.py")
    method = _method_source(source, "bulk_update_batch_quantities")

    assert "WITH requested(batch_id, quantity)" in method
    assert "batch.quantity_available >= requested.quantity" in method
    assert "RETURNING batch.batch_id" in method
    assert "insufficient or inaccessible stock" in method


def test_canonical_invoice_command_owns_billed_and_free_quantity():
    commands = _read(
        "database/canonical/commands_automation/generate_automation_commands.py"
    )

    assert "base_billed_quantity" in commands
    assert "base_free_quantity" in commands
    assert "(allocation->>'base_billed_quantity')::numeric+" in commands
    assert "(allocation->>'base_free_quantity')::numeric" in commands


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


def test_allocation_creation_rebuilds_all_financial_projections():
    class Result:
        def __init__(self, *, scalar=None, rowcount=1):
            self._scalar = scalar
            self.rowcount = rowcount

        def scalar(self):
            return self._scalar

    class Database:
        def __init__(self):
            self.calls = []
            self.results = iter([
                Result(scalar=17),
                Result(),
                Result(),
                Result(),
            ])

        def execute(self, statement, params):
            self.calls.append((str(statement), params))
            return next(self.results)

    db = Database()
    allocation_id = AllocationService.create_allocation(
        db,
        org_id="org-1",
        payment_id=10,
        invoice_id=20,
        amount=Decimal("40.00"),
        invoice_number="INV-20",
        user_id=7,
    )

    assert allocation_id == 17
    statements = "\n".join(statement for statement, _ in db.calls)
    assert "UPDATE financial.payments payment" in statements
    assert "UPDATE sales.invoices invoice" in statements
    assert "UPDATE financial.customer_outstanding outstanding" in statements
    assert "SUM(a.allocated_amount)" in statements
    assert "allocation_status = 'active'" in statements
    assert "trg_update_reference_paid_amount" not in statements


def test_bulk_payment_allocation_cannot_exceed_locked_payment_balance(monkeypatch):
    class Result:
        def __init__(self, row=None):
            self._row = row

        def first(self):
            return self._row

    class Database:
        def __init__(self):
            self.calls = []
            self.results = iter([
                Result(SimpleNamespace(
                    payment_id=10,
                    payment_amount=Decimal("100.00"),
                    allocated_amount=Decimal("20.00"),
                    party_id=5,
                    party_type="customer",
                    payment_type="receipt",
                )),
                Result(SimpleNamespace(
                    invoice_id=21,
                    invoice_number="INV-21",
                    customer_id=5,
                    final_amount=Decimal("100.00"),
                    paid_amount=Decimal("0.00"),
                )),
                Result(),
                Result(SimpleNamespace(
                    invoice_id=22,
                    invoice_number="INV-22",
                    customer_id=5,
                    final_amount=Decimal("100.00"),
                    paid_amount=Decimal("0.00"),
                )),
                Result(),
                Result(SimpleNamespace(unallocated_amount=Decimal("0.00"))),
            ])

        def execute(self, statement, params):
            self.calls.append((str(statement), params))
            return next(self.results)

    reconciled = []
    monkeypatch.setattr(
        AllocationService,
        "reconcile_allocation_projections",
        staticmethod(lambda _db, org_id, payment_id, invoice_id: reconciled.append(
            (org_id, payment_id, invoice_id)
        )),
    )
    db = Database()
    result = PaymentService.allocate_payment_to_invoices(
        db,
        org_id="org-1",
        payment_id=10,
        allocations=[
            {"invoice_id": 21, "amount": "50.00"},
            {"invoice_id": 22, "amount": "50.00"},
        ],
        user_id=7,
    )

    inserted = [
        params["allocated_amount"]
        for statement, params in db.calls
        if "INSERT INTO financial.allocations" in statement
    ]
    assert inserted == [Decimal("50.00"), Decimal("30.00")]
    assert sum(inserted) == Decimal("80.00")
    assert result["total_allocated"] == Decimal("80.00")
    assert reconciled == [("org-1", 10, 21), ("org-1", 10, 22)]


def test_unmounted_finance_mutation_routes_are_retired():
    for relative_path in (
        "backend/app/api/routes/finance/allocation/routes.py",
        "backend/app/api/routes/finance/expenses/routes.py",
        "backend/app/api/routes/finance/journal/routes.py",
        "backend/app/api/routes/finance/payments/routes.py",
    ):
        assert not (REPOSITORY_ROOT / relative_path).exists()


def test_all_payment_balance_decisions_lock_rows():
    source = _read("backend/app/api/services/finance/payment/service.py")

    for method_name in ("record_payment", "cancel_payment", "allocate_payment_to_invoices"):
        assert "FOR UPDATE" in _method_source(source, method_name), method_name


def test_retired_payment_routes_cannot_reintroduce_temporary_idempotency():
    service = _read("backend/app/api/services/finance/payment/service.py")
    tables = _read("database/02-tables/06_financial_tables.sql")

    assert not (
        REPOSITORY_ROOT / "backend/app/api/routes/finance/payments/routes.py"
    ).exists()
    assert "pg_advisory_xact_lock" in service
    assert "internal_notes LIKE :marker_pattern" in service
    assert "claim.pending_marker" in service
    assert "claim.completed_marker(public_response)" in service
    assert "internal_notes TEXT" in tables


def test_legacy_credit_and_debit_note_writes_are_replaced_by_reviewed_commands():
    command_route = _read("backend/app/api/routes/web_operator_actions.py")
    command_contract = _read("backend/app/domain/operator_actions/contract.py")
    readback = _read("backend/app/api/routes/canonical_adjustment_note_reads.py")

    assert not (
        REPOSITORY_ROOT / "backend/app/api/routes/finance/credit_notes/routes.py"
    ).exists()
    assert 'if operation_key == "finance.adjustment_note.prepare"' in command_contract
    assert '@router.post("/{command_type}/prepare"' in command_route
    assert 'operation = "automation.command.approve"' in command_route
    assert 'operation = "automation.command.execute"' in command_route
    assert 'prefix="/canonical/adjustment-notes"' in readback
    assert "WHERE note.org_id=:org_id AND note.id=:note_id" in readback


def test_retired_journal_route_cannot_bypass_draft_service_ordering():
    service = _read("backend/app/api/services/finance/journal/service.py")

    assert not (
        REPOSITORY_ROOT / "backend/app/api/routes/finance/journal/routes.py"
    ).exists()
    assert "'draft', :is_reversal, :reversal_of_journal_id" in service
    assert "def post_journal_entry" in service


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


def test_release_audit_distinguishes_retired_capture_from_canonical_evidence():
    codes = {issue.code for issue in transaction_audit.collect_issues()}
    assert codes == {"CANONICAL_TRANSACTION_LIVE_EVIDENCE_MISSING"}


def _canonical_live_evidence(module, git_sha: str) -> dict:
    return {
        "schema_version": module.EVIDENCE_SCHEMA_VERSION,
        "project_ref": module.CANONICAL_STAGING_PROJECT_REF,
        "git_commit": git_sha,
        "alembic_revision": module._canonical_head_revision(REPOSITORY_ROOT),
        "captured_at": "2026-08-25T12:00:00+00:00",
        "runtime_role": {
            "session_user": "erp_runtime",
            "superuser": False,
            "bypass_rls": False,
            "owns_business_relations": False,
        },
        "transaction_checks": {
            "payment_idempotency_unique": True,
            "allocation_table_present": True,
            "allocation_projection_owner": "canonical_database_invariant",
            "bank_reconciliation_contract": "bank_statements_and_reconciliation_matches",
            "posted_journal_immutability": True,
            "order_invoice_generation_owner": "canonical_command_functions",
            "grn_inventory_effect_owner": "canonical_command_functions",
            "finance_rls_enabled_and_forced": True,
        },
    }


def test_release_audit_accepts_fresh_exact_sha_canonical_evidence(tmp_path):
    git_sha = "a" * 40
    evidence_path = tmp_path / "transaction-integrity.json"
    evidence_path.write_text(
        json.dumps(_canonical_live_evidence(transaction_audit, git_sha)), encoding="utf-8"
    )

    assert transaction_audit.collect_issues(
        live_evidence_path=evidence_path,
        expected_git_sha=git_sha,
    ) == []


def test_release_audit_rejects_retired_project_and_stale_sha_evidence(tmp_path):
    evidence = _canonical_live_evidence(transaction_audit, "b" * 40)
    evidence["project_ref"] = transaction_audit.RETIRED_SOURCE_PROJECT_REF
    evidence_path = tmp_path / "transaction-integrity.json"
    evidence_path.write_text(json.dumps(evidence), encoding="utf-8")

    codes = {
        issue.code
        for issue in transaction_audit.collect_issues(
            live_evidence_path=evidence_path,
            expected_git_sha="a" * 40,
        )
    }

    assert codes == {
        "CANONICAL_TRANSACTION_EVIDENCE_WRONG_PROJECT",
        "CANONICAL_TRANSACTION_EVIDENCE_STALE_SHA",
    }
