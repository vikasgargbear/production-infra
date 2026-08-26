"""Compile every canonical supplier-invoice projection as ``erp_runtime``.

The gate intentionally uses an impossible tenant/resource identity.  Its job is
to prove the deployed runtime role can parse and execute every UUID-only read
without privileged ownership or a legacy compatibility relation.
"""

from __future__ import annotations

import inspect
import os
from datetime import date
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_supplier_invoice_reads as reads


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
RESOURCE_ID = UUID("d3000000-0000-7000-8000-000000000099")


def _sql(function, marker: str) -> str:
    return next(
        value
        for value in function.__code__.co_consts
        if isinstance(value, str) and marker in value
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user"
            )) is False
            for table_name in (
                "procurement.goods_receipts",
                "procurement.goods_receipt_lines",
                "procurement.purchase_orders",
                "procurement.purchase_order_lines",
                "procurement.supplier_invoices",
                "procurement.supplier_invoice_lines",
                "procurement.supplier_invoice_receipt_allocations",
                "parties.supplier_accounts",
                "parties.parties",
                "parties.tax_registrations",
                "parties.addresses",
                "tax.registrations",
                "tax.registration_branches",
                "tax.portal_documents",
                "tax.portal_document_lines",
                "tax.return_periods",
                "tax.documents",
                "finance.accounting_events",
                "finance.open_items",
                "finance.journal_entries",
                "finance.journal_lines",
                "finance.accounts",
                "inventory.inventory_documents",
                "inventory.inventory_document_lines",
                "inventory.stock_ledger_entries",
                "catalog.products",
                "core.branches",
            ):
                assert session.scalar(text(
                    "SELECT has_table_privilege(current_user, :table_name, 'SELECT')"
                ), {"table_name": table_name}) is True
            assert session.scalar(text(
                "SELECT has_table_privilege("
                "current_user, 'automation.command_requests', 'SELECT')"
            )) is False
            assert session.scalar(text(
                "SELECT has_function_privilege("
                "current_user, "
                "'erp_automation_reads.supplier_invoice_portal_provenance(uuid,uuid)', "
                "'EXECUTE')"
            )) is True

            base = {
                "org_id": ORG_ID,
                "goods_receipt_id": RESOURCE_ID,
                "supplier_invoice_id": RESOURCE_ID,
                "purchase_order_id": RESOURCE_ID,
                "supplier_invoice_number": "RUNTIME-NOT-FOUND",
                "invoice_date": date(2026, 8, 25),
                "buyer_tax_registration_id": RESOURCE_ID,
                "supplier_gstin": "27ABCDE1234F1Z5",
                "journal_entry_id": RESOURCE_ID,
                "limit": 1,
            }
            statements = (
                (_sql(reads.eligible_receipts, "SELECT receipt.id AS goods_receipt_id"), base),
                (_sql(reads.supplier_invoice_context, "SELECT receipt.branch_id"), base),
                (_sql(reads.supplier_invoice_context, "SELECT supplier_registration.id"), base),
                (_sql(reads.supplier_invoice_context, "SELECT document.id AS portal_document_id"), base),
                (_sql(reads.supplier_invoice_context, "SELECT receipt.id AS goods_receipt_id, receipt.goods_receipt_number"), base),
                (_sql(reads.supplier_invoice_context, "SELECT order_line.id AS purchase_order_line_id"), base),
                (_sql(reads.supplier_invoice_context, "SELECT count(*) AS count"), base),
                (_sql(reads.posted_supplier_invoice, "SELECT invoice.id AS supplier_invoice_id"), base),
                (_sql(reads.posted_supplier_invoice, "SELECT line.id AS supplier_invoice_line_id"), base),
                (_sql(reads.posted_supplier_invoice, "SELECT allocation.supplier_invoice_line_id"), base),
                (_sql(reads.posted_supplier_invoice, "SELECT line.id AS journal_line_id"), base),
            )
            for sql, params in statements:
                session.execute(text(sql), params).fetchall()

            source = inspect.getsource(reads)
            assert "purchases." not in source
            assert "supplier_invoice_items" not in source
            assert "::integer" not in source
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
