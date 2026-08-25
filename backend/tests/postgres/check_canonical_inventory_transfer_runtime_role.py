"""Compile transfer-specific FEFO and exact readback SQL as erp_app."""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_inventory_transfers as transfers


ORG = UUID("d3000000-0000-7000-8000-000000000001")
SOURCE_BRANCH = UUID("d3000000-0000-7000-8000-000000000002")
DESTINATION_BRANCH = UUID("d3000000-0000-7000-8000-000000000003")
SOURCE_LOCATION = UUID("d3000000-0000-7000-8000-000000000004")
DESTINATION_LOCATION = UUID("d3000000-0000-7000-8000-000000000005")
PRODUCT = UUID("d3000000-0000-7000-8000-000000000006")
CONVERSION = UUID("d3000000-0000-7000-8000-000000000007")
DOCUMENT = UUID("d3000000-0000-7000-8000-000000000008")
MEMBERSHIP = UUID("d3000000-0000-7000-8000-000000000009")


def _sql(function, marker: str) -> str:
    return next(value for value in function.__code__.co_consts if isinstance(value, str) and marker in value)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session, session.begin():
            session.execute(text('SET LOCAL ROLE "erp_app"'))
            assert session.scalar(text("SELECT current_user")) == "erp_app"
            assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
            session.execute(text("""
                SELECT set_config('app.org_id', :org, true),
                       set_config('app.membership_id', :membership, true)
            """), {"org": str(ORG), "membership": str(MEMBERSHIP)})
            eligible = session.execute(text(_sql(transfers.get_eligible_transfer_batches, "WITH scope AS")), {
                "org_id": ORG, "source_branch_id": SOURCE_BRANCH, "source_location_id": SOURCE_LOCATION,
                "destination_branch_id": DESTINATION_BRANCH, "destination_location_id": DESTINATION_LOCATION,
                "product_id": PRODUCT, "uom_conversion_id": CONVERSION, "transfer_date": "2026-08-25",
            }).fetchall()
            assert eligible == []
            header = session.execute(text(_sql(transfers.get_transfer_readback, "FROM inventory.inventory_documents")), {
                "org_id": ORG, "id": DOCUMENT,
            }).fetchall()
            assert header == []
            lines = session.execute(text(_sql(transfers.get_transfer_readback, "FROM inventory.inventory_document_lines")), {
                "org_id": ORG, "id": DOCUMENT,
            }).fetchall()
            assert lines == []
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
