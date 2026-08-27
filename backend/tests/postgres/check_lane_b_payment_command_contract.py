"""Prove Lane B named payment authorities and write fences on PostgreSQL 15."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


PUBLIC_FUNCTIONS = (
    "erp_finance_commands.post_customer_receipt(uuid,uuid,uuid,uuid,jsonb,uuid)",
    "erp_finance_commands.post_customer_cheque_clearance(uuid,uuid,uuid,uuid)",
    "erp_finance_commands.post_customer_cheque_bounce(uuid,uuid,uuid,uuid,jsonb)",
    "erp_finance_commands.post_supplier_payment(uuid,uuid,uuid,uuid,jsonb)",
    "erp_finance_commands.apply_supplier_advance(uuid,uuid,uuid,uuid,uuid,uuid,character varying,uuid)",
    "erp_finance_commands.apply_supplier_adjustment_credit(uuid,uuid,uuid,uuid,uuid,date)",
)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            version = int(session.scalar(text("SHOW server_version_num")))
            assert 150000 <= version < 160000
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            for table_name in (
                "finance.payments",
                "finance.allocations",
                "finance.open_items",
                "finance.journal_entries",
                "finance.journal_lines",
                "finance.accounting_events",
            ):
                for privilege in ("INSERT", "UPDATE", "DELETE"):
                    assert session.scalar(
                        text(
                            "SELECT has_table_privilege(current_user,:table_name,:privilege)"
                        ),
                        {"table_name": table_name, "privilege": privilege},
                    ) is False
            for signature in PUBLIC_FUNCTIONS:
                assert session.scalar(
                    text("SELECT to_regprocedure(:signature) IS NOT NULL"),
                    {"signature": signature},
                ) is True
                assert session.scalar(
                    text(
                        "SELECT has_function_privilege(current_user,:signature,'EXECUTE')"
                    ),
                    {"signature": signature},
                ) is True
            for helper in (
                "erp_finance_commands.synchronize_open_item_status(uuid,uuid)",
                "erp_finance_commands.mark_journal_reversed(uuid,uuid,uuid)",
            ):
                assert session.scalar(
                    text("SELECT has_function_privilege(current_user,:helper,'EXECUTE')"),
                    {"helper": helper},
                ) is False

            bounce = session.scalar(text("""
                SELECT pg_get_functiondef(
                  'erp_finance_commands.post_customer_cheque_bounce(uuid,uuid,uuid,uuid,jsonb)'::regprocedure
                )
            """))
            assert "mark_journal_reversed" in bounce
            assert "reversal_of_allocation_id" in bounce
            assert "synchronize_open_item_status" in bounce
            assert "original.id" in bounce

            supplier = session.scalar(text("""
                SELECT pg_get_functiondef(
                  'erp_finance_commands.post_supplier_payment(uuid,uuid,uuid,uuid,jsonb)'::regprocedure
                )
            """))
            assert "supplier payment replay evidence differs" in supplier
            assert "pre-existing credit-time authority" in supplier
            assert "erp_compliance_commands.post_withholding" not in supplier
            assert "source_open_item_id" in supplier
            session.rollback()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
