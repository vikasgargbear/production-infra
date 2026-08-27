"""Verify return source/readback authority as restricted PostgreSQL roles.

This environment-gated check performs no prepare, approval, execute, or write.
"""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


RUNTIME_FUNCTIONS = (
    ("erp_automation_commands", "resolve_sales_return_prepare"),
    ("erp_commercial_commands", "post_sales_return"),
    ("erp_automation_commands", "resolve_purchase_return_prepare"),
    ("erp_commercial_commands", "post_purchase_return"),
)

CALCULATOR_FUNCTIONS = (
    ("erp_automation_commands", "persist_sales_return_prepare"),
    ("erp_automation_commands", "persist_purchase_return_prepare"),
)

PROJECTION_TABLES = (
    ("sales", "invoices"),
    ("sales", "invoice_lines"),
    ("sales", "invoice_dispatch_allocations"),
    ("sales", "returns"),
    ("sales", "return_lines"),
    ("procurement", "supplier_invoices"),
    ("procurement", "supplier_invoice_lines"),
    ("procurement", "supplier_invoice_receipt_allocations"),
    ("procurement", "goods_receipts"),
    ("procurement", "goods_receipt_lines"),
    ("procurement", "purchase_returns"),
    ("procurement", "purchase_return_lines"),
    ("inventory", "batches"),
    ("inventory", "locations"),
    ("inventory", "stock_balances"),
    ("inventory", "inventory_documents"),
    ("inventory", "inventory_document_lines"),
    ("inventory", "stock_ledger_entries"),
    ("tax", "documents"),
    ("tax", "portal_documents"),
    ("tax", "portal_document_lines"),
    ("core", "attachments"),
    ("finance", "adjustment_notes"),
    ("finance", "allocations"),
    ("finance", "open_items"),
    ("finance", "accounting_events"),
    ("finance", "journal_entries"),
    ("finance", "journal_lines"),
)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15

            for schema_name, function_name in RUNTIME_FUNCTIONS:
                rows = session.execute(
                    text(
                        """
                        SELECT procedure.prosecdef AS security_definer,
                               has_function_privilege(current_user, procedure.oid, 'EXECUTE') AS executable
                          FROM pg_proc AS procedure
                          JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
                         WHERE namespace.nspname=:schema_name
                           AND procedure.proname=:function_name
                        """
                    ),
                    {"schema_name": schema_name, "function_name": function_name},
                ).mappings().all()
                assert len(rows) == 1, f"missing or overloaded {schema_name}.{function_name}"
                assert rows[0]["security_definer"] is True
                assert rows[0]["executable"] is True

            for schema_name, function_name in CALCULATOR_FUNCTIONS:
                rows = session.execute(
                    text(
                        """
                        SELECT procedure.prosecdef AS security_definer,
                               has_function_privilege('erp_runtime', procedure.oid, 'EXECUTE') AS runtime_executable,
                               has_function_privilege('erp_calculator', procedure.oid, 'EXECUTE') AS calculator_executable
                          FROM pg_proc AS procedure
                          JOIN pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
                         WHERE namespace.nspname=:schema_name
                           AND procedure.proname=:function_name
                        """
                    ),
                    {"schema_name": schema_name, "function_name": function_name},
                ).mappings().all()
                assert len(rows) == 1, f"missing or overloaded {schema_name}.{function_name}"
                assert rows[0]["security_definer"] is True
                assert rows[0]["runtime_executable"] is False
                assert rows[0]["calculator_executable"] is True

            for schema_name, table_name in PROJECTION_TABLES:
                assert session.scalar(
                    text(
                        "SELECT has_table_privilege(current_user, "
                        "format('%I.%I', :schema_name, :table_name), 'SELECT')"
                    ),
                    {"schema_name": schema_name, "table_name": table_name},
                ) is True, f"erp_runtime cannot read {schema_name}.{table_name}"

            constraints = session.execute(
                text(
                    """
                    SELECT candidate_constraint.conname AS constraint_name
                      FROM pg_catalog.pg_constraint AS candidate_constraint
                      JOIN pg_catalog.pg_class AS relation
                        ON relation.oid=candidate_constraint.conrelid
                      JOIN pg_catalog.pg_namespace AS namespace
                        ON namespace.oid=relation.relnamespace
                     WHERE namespace.nspname='finance'
                       AND relation.relname='journal_entries'
                       AND candidate_constraint.contype='c'
                    """
                )
            ).scalars().all()
            assert "journal_entries_balanced_ck" in constraints
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
