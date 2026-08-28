"""Execute the canonical goods-receipt detail read as the runtime DB role."""

from __future__ import annotations

import os
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes.canonical_goods_receipts import (
    _canonical_goods_receipt_detail,
    _canonical_purchase_order_receipt_context,
)


ORG_ID = UUID("d3000000-0000-7000-8000-000000000001")
RECEIPT_ID = UUID("d3000000-0000-7000-8000-000000000099")
PURCHASE_ORDER_ID = UUID("d3000000-0000-7000-8000-000000000098")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            session.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert session.scalar(text("SELECT current_user")) == "erp_runtime"
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.goods_receipts', 'SELECT')"
            )) is True
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'inventory.stock_ledger_entries', 'SELECT')"
            )) is True
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'inventory.stock_balances', 'SELECT')"
            )) is True
            assert session.scalar(text(
                "SELECT has_table_privilege(current_user, "
                "'procurement.purchase_orders', 'SELECT')"
            )) is True

            try:
                _canonical_purchase_order_receipt_context(
                    session, ORG_ID, PURCHASE_ORDER_ID
                )
            except HTTPException as missing:
                assert missing.status_code == 404
            else:
                raise AssertionError(
                    "empty canonical database unexpectedly returned a purchase order"
                )

            try:
                _canonical_goods_receipt_detail(session, ORG_ID, RECEIPT_ID)
            except HTTPException as missing:
                assert missing.status_code == 404
            else:
                raise AssertionError(
                    "empty canonical database unexpectedly returned a goods receipt"
                )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
