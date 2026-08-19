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
                "payment idempotency fails closed on internal_notes, but the live schema is not baselined",
            ))
    non_create_payment_mutations = (
        "async def cancel_payment",
        "async def create_bank_reconciliation",
        "async def allocate_payment",
    )
    if any(
        'alias="X-Idempotency-Key"' not in payment_routes.split(method, 1)[1].split(
            "@router.", 1
        )[0]
        for method in non_create_payment_mutations
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
            "finance services require financial.allocations, but bootstrap DDL defines payment_allocations",
        ))
    allocation_service = _read("backend/app/api/services/finance/allocation/service.py")
    allocation_routes = _read("backend/app/api/routes/finance/allocation/routes.py")
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
    sql_sources = "\n".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in (REPOSITORY_ROOT / "database").rglob("*.sql")
    )
    if (
        "trg_update_reference_paid_amount" in application_finance
        and "CREATE TRIGGER trg_update_reference_paid_amount" not in sql_sources
    ):
        issues.append(IntegrityIssue(
            "ALLOCATION_TRIGGER_NOT_REPRODUCIBLE",
            "application correctness depends on trg_update_reference_paid_amount, but no checked-in SQL defines it",
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
