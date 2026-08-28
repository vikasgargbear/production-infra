"""PostgreSQL 15 catalog gate for supplier-invoice landed-cost authority."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text


PRIVATE_FUNCTIONS = (
    "erp_trade_commands_v2.landed_cost_lineage_from_receipts(uuid,jsonb)",
    "erp_trade_commands_v2.landed_cost_receipt_lineage_state(uuid,uuid,numeric,numeric)",
    "erp_trade_commands_v2.landed_cost_lineage_state(uuid,uuid)",
    "erp_trade_commands_v2.total_landed_cost_pool(uuid,uuid)",
    "erp_trade_commands_v2.eligible_landed_cost_pool(uuid,uuid)",
    "erp_trade_commands_v2.consumed_landed_cost_pool(uuid,uuid)",
    "erp_trade_commands_v2.prepare_supplier_invoice_landed_cost_adjustment(uuid,uuid,uuid,uuid)",
)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.begin() as connection:
            assert connection.scalar(text("SHOW server_version_num")).startswith("15")
            assert connection.scalar(text(
                """
                SELECT count(*)=1
                  FROM information_schema.columns
                 WHERE table_schema='procurement'
                   AND table_name='supplier_invoice_lines'
                   AND column_name='landed_cost_allocation_method'
                   AND data_type='text'
                """
            )) is True
            check_row = connection.execute(text(
                """
                SELECT pg_catalog.pg_get_constraintdef(oid), convalidated
                  FROM pg_catalog.pg_constraint
                 WHERE conrelid='procurement.supplier_invoice_lines'::regclass
                   AND conname='supplier_invoice_lines_landed_cost_allocation_ck'
                """
            )).one()
            check, validated = check_row
            assert validated is False
            assert all(token in check for token in (
                "direct", "quantity_weighted", "value_weighted", "inventory_cost_treatment",
            ))

            for signature in PRIVATE_FUNCTIONS:
                assert connection.scalar(text(
                    "SELECT pg_catalog.pg_get_userbyid(proowner) "
                    "FROM pg_catalog.pg_proc WHERE oid=CAST(:signature AS regprocedure)"
                ), {"signature": signature}) == "erp_migration_owner"
                assert connection.scalar(text(
                    "SELECT has_function_privilege('erp_runtime', CAST(:signature AS regprocedure), 'EXECUTE')"
                ), {"signature": signature}) is False

            eligible = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_trade_commands_v2.eligible_landed_cost_pool(uuid,uuid)'::regprocedure"
            ))
            assert "landed_cost_lineage_state" in eligible
            assert "source_identity_count" in eligible
            assert "remaining_quantity_basis" in eligible

            lineage = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_trade_commands_v2.landed_cost_lineage_from_receipts(uuid,jsonb)'::regprocedure"
            ))
            for token in (
                "supplier_invoice_landed_cost_lineage_v1",
                "transfer_line_ids", "goods_receipt_line_ids",
                "stock_row_version", "last_ledger_entry_id",
                "lineage_transfers", "running_quantity<0",
                "transfer lineage is unbalanced, malformed, or unlinked",
            ):
                assert token in lineage

            persisted_lineage = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_trade_commands_v2.landed_cost_lineage_state(uuid,uuid)'::regprocedure"
            ))
            assert "supplier_invoice_receipt_allocations" in persisted_lineage
            assert "landed_cost_lineage_from_receipts" in persisted_lineage

            receipt_lineage = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_trade_commands_v2.landed_cost_receipt_lineage_state(uuid,uuid,numeric,numeric)'::regprocedure"
            ))
            assert "landed_cost_lineage_from_receipts" in receipt_lineage
            assert "allocated_base_billed_quantity" in receipt_lineage
            assert "allocated_base_free_quantity" in receipt_lineage

            commercial = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_commercial_commands.post_supplier_invoice(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,character varying,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamp with time zone)'::regprocedure"
            ))
            assert commercial.index("prepare_supplier_invoice_landed_cost_adjustment") < commercial.index(
                "INSERT INTO finance.journal_entries"
            ) < commercial.index("consumed_landed_cost_pool") < commercial.index(
                "post_landed_cost_adjustment"
            )
            assert "transaction_debit<>transaction_credit" not in commercial
            assert "commercial journal does not exactly balance" in commercial

            resolver = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_automation_commands.resolve_supplier_invoice_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'::regprocedure"
            ))
            for token in (
                "landed_cost_receipt_lineage_state", "purchase_price_variance",
                "landed_cost_stock_target", "last_ledger_entry_id",
                "supplier invoice exceeds separate posted receipt billed or free ceiling",
            ):
                assert token in resolver

            role_resolver = connection.scalar(text(
                "SELECT prosrc FROM pg_catalog.pg_proc WHERE oid="
                "'erp_commercial_commands.resolve_role_account(uuid,uuid,character varying,text,character,boolean)'::regprocedure"
            ))
            assert "setting_count>1" in role_resolver
            assert "account-role mapping is ambiguous" in role_resolver
            assert "account-role UUID setting is missing" in role_resolver
            assert "finance.account_roles" in role_resolver
            assert "setting_value::uuid" in role_resolver
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
