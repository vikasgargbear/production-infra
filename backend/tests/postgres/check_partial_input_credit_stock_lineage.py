"""Prove partial ITC lineage does not block fungible batch stock movement."""

from __future__ import annotations

import os
from decimal import Decimal

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


ORG = "ef230000-0000-7000-8000-000000000001"
OTHER_ORG = "ef230000-0000-7000-8000-000000000002"
BATCH = "ef230000-0000-7000-8000-000000000003"
LOT = "ef230000-0000-7000-8000-000000000004"
OTHER_LOT = "ef230000-0000-7000-8000-000000000005"
ACTOR = "ef230000-0000-7000-8000-000000000006"
RETURN_LEDGER = "ef230000-0000-7000-8000-000000000007"


def _seed_lot(session: Session, *, org_id: str, lot_id: str) -> None:
    session.execute(
        text(
            """
            INSERT INTO tax.input_credit_lots(
              org_id,id,registration_id,supplier_invoice_id,supplier_invoice_line_id,
              supplier_invoice_receipt_allocation_id,goods_receipt_line_id,batch_id,
              acquired_on,acquired_base_quantity,eligible_cgst_amount,eligible_sgst_amount,
              eligible_igst_amount,eligible_cess_amount,remaining_base_quantity,
              remaining_cgst_amount,remaining_sgst_amount,remaining_igst_amount,
              remaining_cess_amount,lineage_status,source_hash,
              created_by_membership_id,updated_by_membership_id)
            VALUES(
              :org_id,:lot_id,'ef230000-0000-7000-8000-000000000010',
              'ef230000-0000-7000-8000-000000000011',
              'ef230000-0000-7000-8000-000000000012',
              'ef230000-0000-7000-8000-000000000013',
              'ef230000-0000-7000-8000-000000000014',:batch_id,
              DATE '2026-08-20',12.5,75,75,0,0,12.5,75,75,0,0,'exact',
              decode(repeat('23',32),'hex'),:actor_id,:actor_id)
            """
        ),
        {
            "org_id": org_id,
            "lot_id": lot_id,
            "batch_id": BATCH,
            "actor_id": ACTOR,
        },
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            # Fixture-only FK/trigger bypass lets this regression isolate the
            # post-0021 lineage functions without inventing a complete invoice
            # and receipt graph. The transaction is always rolled back.
            session.execute(text("SET LOCAL session_replication_role=replica"))
            _seed_lot(session, org_id=ORG, lot_id=LOT)
            _seed_lot(session, org_id=OTHER_ORG, lot_id=OTHER_LOT)

            applied = session.scalar(
                text(
                    """
                    SELECT erp_compliance_commands.consume_input_credit_lots(
                      :org_id,:batch_id,14,'sale_consumption',NULL,:actor_id)
                    """
                ),
                {"org_id": ORG, "batch_id": BATCH, "actor_id": ACTOR},
            )
            assert applied == Decimal("12.500000")
            assert session.execute(
                text(
                    """
                    SELECT remaining_base_quantity,remaining_cgst_amount,
                           remaining_sgst_amount,row_version
                      FROM tax.input_credit_lots WHERE org_id=:org_id AND id=:lot_id
                    """
                ),
                {"org_id": ORG, "lot_id": LOT},
            ).one() == (Decimal("0.000000"), Decimal("0.00"), Decimal("0.00"), 2)
            assert session.execute(
                text(
                    """
                    SELECT count(*),sum(applied_base_quantity),sum(applied_cgst_amount),
                           sum(applied_sgst_amount)
                      FROM tax.input_credit_applications
                     WHERE org_id=:org_id AND input_credit_lot_id=:lot_id
                       AND application_kind='sale_consumption'
                    """
                ),
                {"org_id": ORG, "lot_id": LOT},
            ).one() == (1, Decimal("12.500000"), Decimal("75.00"), Decimal("75.00"))

            assert session.scalar(
                text(
                    """
                    SELECT erp_compliance_commands.consume_input_credit_lots(
                      :org_id,:batch_id,1.5,'sale_consumption',NULL,:actor_id)
                    """
                ),
                {"org_id": ORG, "batch_id": BATCH, "actor_id": ACTOR},
            ) == Decimal("0.000000")

            restored = session.scalar(
                text(
                    """
                    SELECT erp_compliance_commands.restore_sales_return_input_credit_lots(
                      :org_id,:batch_id,14,:ledger_id,:actor_id)
                    """
                ),
                {
                    "org_id": ORG,
                    "batch_id": BATCH,
                    "ledger_id": RETURN_LEDGER,
                    "actor_id": ACTOR,
                },
            )
            assert restored == Decimal("12.500000")
            assert session.execute(
                text(
                    """
                    SELECT remaining_base_quantity,remaining_cgst_amount,
                           remaining_sgst_amount,row_version
                      FROM tax.input_credit_lots WHERE org_id=:org_id AND id=:lot_id
                    """
                ),
                {"org_id": ORG, "lot_id": LOT},
            ).one() == (Decimal("12.500000"), Decimal("75.00"), Decimal("75.00"), 3)
            assert session.scalar(
                text(
                    """
                    SELECT erp_compliance_commands.restore_sales_return_input_credit_lots(
                      :org_id,:batch_id,1.5,:ledger_id,:actor_id)
                    """
                ),
                {
                    "org_id": ORG,
                    "batch_id": BATCH,
                    "ledger_id": RETURN_LEDGER,
                    "actor_id": ACTOR,
                },
            ) == Decimal("0.000000")

            # No branch of either function may inspect or mutate another tenant.
            assert session.execute(
                text(
                    """
                    SELECT remaining_base_quantity,remaining_cgst_amount,
                           remaining_sgst_amount,row_version
                      FROM tax.input_credit_lots WHERE org_id=:org_id AND id=:lot_id
                    """
                ),
                {"org_id": OTHER_ORG, "lot_id": OTHER_LOT},
            ).one() == (Decimal("12.500000"), Decimal("75.00"), Decimal("75.00"), 1)

            session.rollback()
        print("Partial input-credit stock-lineage PostgreSQL 15 acceptance passed")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
