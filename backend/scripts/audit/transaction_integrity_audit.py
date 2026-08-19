#!/usr/bin/env python3
"""Fail-closed static release audit for high-risk ERP transaction ownership."""

from dataclasses import dataclass
import json
from pathlib import Path
from typing import List


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class IntegrityIssue:
    code: str
    message: str


def _read(relative_path: str) -> str:
    return (REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8")


def collect_issues() -> List[IntegrityIssue]:
    issues: List[IntegrityIssue] = []
    live_evidence = json.loads(_read("database/live-schema-evidence.json"))
    live_transactions = live_evidence["transaction_safety"]

    inventory_trigger = _read("database/04-triggers/02_inventory_triggers.sql")
    movement_function = inventory_trigger.split(
        "CREATE OR REPLACE FUNCTION track_inventory_movement()", 1
    )[1].split("$$ LANGUAGE plpgsql;", 1)[0]
    if (
        "UPDATE inventory.location_wise_stock" in movement_function
        or "INSERT INTO inventory.location_wise_stock" in movement_function
    ):
        issues.append(IntegrityIssue(
            "STOCK_DOUBLE_MUTATION",
            "track_inventory_movement and application services both mutate location stock",
        ))

    sales_trigger = _read("database/04-triggers/11_core_operations_triggers.sql")
    sale_function = ""
    if "CREATE OR REPLACE FUNCTION update_inventory_on_sale()" in sales_trigger:
        sale_function = sales_trigger.split(
            "CREATE OR REPLACE FUNCTION update_inventory_on_sale()", 1
        )[1].split("$$ LANGUAGE plpgsql;", 1)[0]
    invoice_service = _read("backend/app/api/services/sales/invoice/invoice_service.py")
    if (
        "InventoryService.bulk_update_batch_quantities" in invoice_service
        and "InventoryService.bulk_insert_movements" in invoice_service
        and sale_function
        and (
            "UPDATE inventory.batches" in sale_function
            or "UPDATE inventory.location_wise_stock" in sale_function
            or "INSERT INTO inventory.inventory_movements" in sale_function
        )
    ):
        issues.append(IntegrityIssue(
            "INVOICE_STOCK_OWNERSHIP_CONFLICT",
            "invoice creation and update_inventory_on_sale both mutate stock and write movements",
        ))

    payment_routes = _read("backend/app/api/routes/finance/payments/routes.py")
    payment_service = _read("backend/app/api/services/finance/payment/service.py")
    payment_idempotency_guards = (
        payment_routes.count('alias="X-Idempotency-Key"') >= 3
        and "pg_advisory_xact_lock" in payment_service
        and "internal_notes LIKE :marker_pattern" in payment_service
        and "claim.completed_marker(public_response)" in payment_service
        and "IdempotencyConflictError" in payment_routes
        and "X-Idempotency-Replayed" in payment_routes
    )
    if not payment_idempotency_guards:
        issues.append(IntegrityIssue(
            "PAYMENT_IDEMPOTENCY_MISSING",
            "payment creation routes lack a locked, durable request key and replay contract",
        ))
    else:
        schema_authority = json.loads(_read("database/schema-authority.json"))
        if schema_authority.get("readiness_state") != "baselined":
            issues.append(IntegrityIssue(
                "PAYMENT_IDEMPOTENCY_SCHEMA_UNVERIFIED",
                "live capture confirms internal_notes, but no reviewed migration baseline owns its durable idempotency contract",
            ))
    allocation_routes = _read("backend/app/api/routes/finance/allocation/routes.py")
    mutation_contracts = (
        (payment_routes, "cancel_payment", "payment.cancel"),
        (payment_routes, "create_bank_reconciliation", "payment.reconcile"),
        (payment_routes, "allocate_payment", "payment.allocate"),
        (allocation_routes, "allocate_payment", "payment.allocate"),
        (allocation_routes, "allocate_payment_bulk", "payment.allocate"),
        (allocation_routes, "auto_allocate_payment", "payment.allocate"),
        (allocation_routes, "delete_allocation", "payment.allocate"),
    )
    def mutation_is_guarded(source: str, method: str, operation: str) -> bool:
        body = source.split(f"async def {method}", 1)[1].split("@router.", 1)[0]
        durable_guard = (
            f'operation="{operation}"' in body
            or (
                "_require_allocation_idempotency(idempotency_key)" in body
                and f'operation="{operation}"' in source
            )
        )
        return 'alias="X-Idempotency-Key"' in body and durable_guard

    if any(
        not mutation_is_guarded(source, method, operation)
        for source, method, operation in mutation_contracts
    ):
        issues.append(IntegrityIssue(
            "PAYMENT_MUTATION_IDEMPOTENCY_INCOMPLETE",
            "payment cancellation, reconciliation, or allocation still lacks replayable idempotency",
        ))

    finance_triggers = _read("database/04-triggers/01_financial_triggers.sql")
    if "trigger_protect_posted_journal_lines" not in finance_triggers:
        issues.append(IntegrityIssue(
            "POSTED_JOURNAL_LINES_MUTABLE",
            "posted journal lines have no database immutability trigger",
        ))
    if "trigger_protect_posted_journal_entries" not in finance_triggers:
        issues.append(IntegrityIssue(
            "POSTED_JOURNAL_HEADER_MUTABLE",
            "posted journal headers can still be edited or deleted directly",
        ))

    journal_service = _read("backend/app/api/services/finance/journal/service.py")
    journal_routes = _read("backend/app/api/routes/finance/journal/routes.py")
    reversal_method = journal_service.split("def reverse_journal_entry", 1)[1]
    if not all(token in reversal_method for token in (
        '"reversal_of_journal_id": journal_id',
        '"debit_amount": line.credit_amount',
        '"credit_amount": line.debit_amount',
        "JournalService.post_journal_entry",
    )):
        issues.append(IntegrityIssue(
            "JOURNAL_REVERSAL_NOT_COMPENSATING",
            "journal reversal changes status without posting opposite debit and credit lines",
        ))
    create_journal_route = journal_routes.split(
        "async def create_journal_entry", 1
    )[1].split("async def get_journal_entries", 1)[0]
    if "db.commit()" not in create_journal_route:
        issues.append(IntegrityIssue(
            "JOURNAL_MUTATION_NOT_COMMITTED",
            "journal creation posts in-session but the request closes without committing",
        ))

    financial_tables = _read("database/02-tables/06_financial_tables.sql")
    if all(token in journal_service for token in (
        "account_level",
        "journal_id, account_id, account_code",
        "reversed_reason = :reason",
    )) and all(token not in financial_tables for token in (
        "account_level",
        "account_id INTEGER NOT NULL REFERENCES financial.chart_of_accounts",
        "reversed_reason TEXT",
    )):
        issues.append(IntegrityIssue(
            "JOURNAL_SCHEMA_CONTRACT_MISMATCH",
            "journal service reads or writes columns absent from checked-in financial tables",
        ))

    application_finance = "\n".join([
        _read("backend/app/api/services/finance/payment/service.py"),
        _read("backend/app/api/services/finance/allocation/service.py"),
    ])
    if (
        "financial.allocations" in application_finance
        and "CREATE TABLE financial.allocations" not in financial_tables
    ):
        issues.append(IntegrityIssue(
            "ALLOCATION_TABLE_UNBASELINED",
            "live financial.allocations exists, but migration history is unavailable and bootstrap DDL defines payment_allocations",
        ))
    if set(live_transactions.get("allocation_projection_owners", [])) == {
        "database_triggers",
        "application_service",
    }:
        issues.append(IntegrityIssue(
            "LIVE_ALLOCATION_PROJECTION_OWNERSHIP_CONFLICT",
            "live allocation triggers and the application both update financial projections",
        ))
    allocation_service = _read("backend/app/api/services/finance/allocation/service.py")
    unscoped_allocation_reads = (
        "def get_payment_allocations" in allocation_service
        and "FROM financial.allocations\n            WHERE payment_id = :payment_id" in allocation_service
        and "def get_invoice_summary" in allocation_service
        and "FROM sales.invoices WHERE invoice_id = :invoice_id" in allocation_service
    )
    if unscoped_allocation_reads:
        issues.append(IntegrityIssue(
            "ALLOCATION_TENANT_SCOPE_MISSING",
            "allocation read paths accept global IDs without an org predicate or tenant-owned join",
        ))
    allocate_route = allocation_routes.split(
        "async def allocate_payment", 1
    )[1].split("async def allocate_payment_bulk", 1)[0]
    if "db.commit()" not in allocate_route:
        issues.append(IntegrityIssue(
            "ALLOCATION_MUTATION_NOT_COMMITTED",
            "manual allocation returns success but the request closes without committing",
        ))
    projection_reconciliation = all(
        "AllocationService.reconcile_allocation_projections" in method
        for method in (
            allocation_service.split("def create_allocation", 1)[1].split(
                "def get_payment_status", 1
            )[0],
            allocation_service.split("def delete_allocation", 1)[1].split(
                "def get_unallocated_payments", 1
            )[0],
            payment_service.split("def allocate_payment_to_invoices", 1)[1].split(
                "def process_bank_reconciliation", 1
            )[0],
        )
    )
    if not projection_reconciliation:
        issues.append(IntegrityIssue(
            "ALLOCATION_PROJECTION_RECONCILIATION_MISSING",
            "allocation writes do not explicitly reconcile payment, invoice, and outstanding projections",
        ))

    reconciliation_method = payment_service.split(
        "def process_bank_reconciliation", 1
    )[1].split("def create_general_payment", 1)[0]
    if all(token in reconciliation_method for token in (
        "financial.bank_reconciliations",
        "bank_account",
        "opening_balance",
        "financial.unmatched_transactions",
    )) and not live_transactions.get(
        "bank_reconciliation_service_contract_matches_live", True
    ):
        issues.append(IntegrityIssue(
            "BANK_RECONCILIATION_SCHEMA_UNBASELINED",
            "live bank reconciliation and payment columns do not match the application service contract",
        ))

    if not live_transactions.get("live_journal_immutability_triggers_present", True):
        issues.append(IntegrityIssue(
            "LIVE_JOURNAL_IMMUTABILITY_NOT_DEPLOYED",
            "live journal tables lack the checked-in posted-header and posted-line immutability triggers",
        ))
    if set(live_transactions.get("order_invoice_generation_owners", [])) == {
        "database_trigger",
        "application_service",
    }:
        issues.append(IntegrityIssue(
            "LIVE_ORDER_INVOICE_OWNERSHIP_CONFLICT",
            "live order delivery trigger and application conversion paths can both generate invoices",
        ))
    if set(live_transactions.get("grn_inventory_effect_owners", [])) == {
        "database_trigger",
        "application_service",
    }:
        issues.append(IntegrityIssue(
            "LIVE_GRN_INVENTORY_OWNERSHIP_CONFLICT",
            "live GRN trigger and application paths can both apply inventory effects",
        ))

    component_calculator_imports = []
    for path in (REPOSITORY_ROOT / "frontend/src/components").rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx"}:
            continue
        if "EnterpriseCalculator" in path.read_text(encoding="utf-8", errors="ignore"):
            component_calculator_imports.append(str(path.relative_to(REPOSITORY_ROOT)))
    if component_calculator_imports:
        issues.append(IntegrityIssue(
            "CALCULATION_OWNER_DUPLICATED",
            "active frontend components bypass backend calculation previews: "
            + ", ".join(component_calculator_imports),
        ))

    return issues


def main() -> int:
    issues = collect_issues()
    print("=== Transaction Integrity Audit ===")
    if not issues:
        print("PASS: no high-risk transaction ownership conflicts found")
        return 0

    for issue in issues:
        print(f"FAIL [{issue.code}] {issue.message}")
    print(f"\n{len(issues)} release blocker(s)")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
