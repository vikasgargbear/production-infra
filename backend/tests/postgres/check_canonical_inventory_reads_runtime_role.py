"""Seed and execute canonical Stock Hub reads as the restricted PostgreSQL runtime role."""

from __future__ import annotations

import os
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.api.routes import canonical_inventory_reads as reads


ORG_ID = UUID("e3100000-0000-7000-8000-000000000001")
BRANCH_ID = UUID("e3100000-0000-7000-8000-000000000002")
MEMBERSHIP_ID = UUID("e3100000-0000-7000-8000-000000000003")
AUTH_USER_ID = UUID("e3100000-0000-7000-8000-000000000004")
OTHER_ORG_ID = UUID("e3200000-0000-7000-8000-000000000001")
OTHER_BRANCH_ID = UUID("e3200000-0000-7000-8000-000000000002")
OTHER_MEMBERSHIP_ID = UUID("e3200000-0000-7000-8000-000000000003")
OTHER_AUTH_USER_ID = UUID("e3200000-0000-7000-8000-000000000004")


def _seed(session: Session) -> None:
    session.execute(text("SET LOCAL session_replication_role=replica"))
    session.execute(text("""
        INSERT INTO core.organizations(
          id,legal_name,registered_address_line1,registered_city,registered_state_code,
          registered_postal_code,status,created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,'Stock Read Tenant','1 Test Road','Pune','27','411001','active',:member,:member),
          (:other_org,'Denied Stock Tenant','2 Test Road','Pune','27','411002','active',:other_member,:other_member);
        INSERT INTO core.users(id,auth_user_id,display_name,status) VALUES
          ('e3100000-0000-7000-8000-000000000005',:auth,'Stock Reader','active'),
          ('e3200000-0000-7000-8000-000000000005',:other_auth,'Other Reader','active');
        INSERT INTO core.memberships(
          org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,:member,'e3100000-0000-7000-8000-000000000005','active',transaction_timestamp(),:member,:member),
          (:other_org,:other_member,'e3200000-0000-7000-8000-000000000005','active',transaction_timestamp(),:other_member,:other_member);
        INSERT INTO core.roles(
          org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000006','STOCK_READ','Stock read','active',:member,:member),
          (:other_org,'e3200000-0000-7000-8000-000000000006','STOCK_READ','Stock read','active',:other_member,:other_member);
        INSERT INTO core.access_grants(
          org_id,id,membership_id,role_id,scope_kind,status,created_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000007',:member,'e3100000-0000-7000-8000-000000000006','organization','active',:member),
          (:other_org,'e3200000-0000-7000-8000-000000000007',:other_member,'e3200000-0000-7000-8000-000000000006','organization','active',:other_member);
        INSERT INTO core.branches(
          org_id,id,code,name,address_line1,city,state_code,postal_code,status,
          created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,:branch,'MAIN','Main','1 Test Road','Pune','27','411001','active',:member,:member),
          (:other_org,:other_branch,'OTHER','Other','2 Test Road','Pune','27','411002','active',:other_member,:other_member);
        INSERT INTO inventory.locations(
          org_id,id,branch_id,code,name,location_type,status,allows_sale,
          allows_negative_stock,temperature_min_c,temperature_max_c,
          created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000011',:branch,'SALE','Saleable','saleable','active',true,false,-20.000000,25.500000,:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000012',:branch,'TRANSIT','Transit','transit','active',false,false,NULL,NULL,:member,:member),
          (:other_org,'e3200000-0000-7000-8000-000000000011',:other_branch,'SALE','Saleable','saleable','active',true,false,NULL,NULL,:other_member,:other_member);
        INSERT INTO catalog.products(
          org_id,id,sku,product_kind,name,base_uom_code,hsn_code,drug_schedule,
          requires_prescription,ndps_regulated,regulatory_ruleset_version,
          manufacturer_party_id,hsn_release_id,status,created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000021','P-1','medicine','Product One','EA','3004','NONE',false,false,'test','e3100000-0000-7000-8000-000000000091','e3100000-0000-7000-8000-000000000092','active',:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000022','P-2','medicine','Product Two','EA','3004','NONE',false,false,'test','e3100000-0000-7000-8000-000000000091','e3100000-0000-7000-8000-000000000092','active',:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000023','P-3','medicine','Product Three','EA','3004','NONE',false,false,'test','e3100000-0000-7000-8000-000000000091','e3100000-0000-7000-8000-000000000092','active',:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000024','P-4','medicine','Negative Product','EA','3004','NONE',false,false,'test','e3100000-0000-7000-8000-000000000091','e3100000-0000-7000-8000-000000000092','active',:member,:member),
          (:other_org,'e3200000-0000-7000-8000-000000000021','OTHER','medicine','Other Product','EA','3004','NONE',false,false,'test','e3200000-0000-7000-8000-000000000091','e3200000-0000-7000-8000-000000000092','active',:other_member,:other_member);
        INSERT INTO inventory.batches(
          org_id,id,product_id,batch_number,manufactured_on,expires_on,mrp,
          mrp_uom_conversion_id,status,released_at,released_by_membership_id,
          created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000031','e3100000-0000-7000-8000-000000000021','B-1','2026-01-01','2027-01-01',15,'e3100000-0000-7000-8000-000000000093','released','2026-01-02',:member,:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000032','e3100000-0000-7000-8000-000000000022','B-2','2026-01-01','2027-01-01',25,'e3100000-0000-7000-8000-000000000094','released','2026-01-02',:member,:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000033','e3100000-0000-7000-8000-000000000023','B-3','2026-01-01','2027-01-01',35,'e3100000-0000-7000-8000-000000000095','released','2026-01-02',:member,:member,:member),
          (:org,'e3100000-0000-7000-8000-000000000034','e3100000-0000-7000-8000-000000000024','B-NEG','2026-01-01','2027-01-01',35,'e3100000-0000-7000-8000-000000000096','released','2026-01-02',:member,:member,:member),
          (:other_org,'e3200000-0000-7000-8000-000000000031','e3200000-0000-7000-8000-000000000021','OTHER-B','2026-01-01','2027-01-01',15,'e3200000-0000-7000-8000-000000000093','released','2026-01-02',:other_member,:other_member,:other_member);
        INSERT INTO inventory.inventory_documents(
          org_id,id,branch_id,document_type,document_number,fiscal_year,document_date,
          status,reason_code,costing_method_snapshot,total_abs_base_quantity,total_value,
          approved_at,approved_by_membership_id,posted_at,posted_by_membership_id,
          created_by_membership_id,updated_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000041',:branch,'adjustment','STOCK-1',2026,'2026-08-24','posted','test','moving_weighted_average',23,240,'2026-08-24',:member,'2026-08-24',:member,:member,:member),
          (:other_org,'e3200000-0000-7000-8000-000000000041',:other_branch,'adjustment','OTHER-1',2026,'2026-08-24','posted','test','moving_weighted_average',1,10,'2026-08-24',:other_member,'2026-08-24',:other_member,:other_member,:other_member);
        INSERT INTO inventory.stock_ledger_entries(
          org_id,id,branch_id,inventory_document_id,inventory_document_line_id,
          entry_kind,location_id,product_id,batch_id,quantity_delta,unit_cost,
          value_delta,reverses_entry_id,posted_at,posted_by_membership_id
        ) VALUES
          (:org,'e3100000-0000-7000-8000-000000000051',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000061','receipt','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000021','e3100000-0000-7000-8000-000000000031',10,10,100,NULL,'2026-08-24 09:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000052',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000062','transfer_out','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000021','e3100000-0000-7000-8000-000000000031',-2,10,-20,NULL,'2026-08-24 10:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000053',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000063','transfer_in','e3100000-0000-7000-8000-000000000012','e3100000-0000-7000-8000-000000000021','e3100000-0000-7000-8000-000000000031',2,10,20,NULL,'2026-08-24 10:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000054',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000064','value_adjustment','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000021','e3100000-0000-7000-8000-000000000031',0,10.5,5,NULL,'2026-08-24 11:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000055',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000065','reversal','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000021','e3100000-0000-7000-8000-000000000031',0,10,-5,'e3100000-0000-7000-8000-000000000054','2026-08-24 12:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000056',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000066','receipt','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000022','e3100000-0000-7000-8000-000000000032',3,20,60,NULL,'2026-08-24 13:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000057',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000067','receipt','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000023','e3100000-0000-7000-8000-000000000033',4,30,120,NULL,'2026-08-24 14:00Z',:member),
          (:org,'e3100000-0000-7000-8000-000000000058',:branch,'e3100000-0000-7000-8000-000000000041','e3100000-0000-7000-8000-000000000068','issue','e3100000-0000-7000-8000-000000000011','e3100000-0000-7000-8000-000000000024','e3100000-0000-7000-8000-000000000034',-2,20,-40,NULL,'2026-08-24 15:00Z',:member),
          (:other_org,'e3200000-0000-7000-8000-000000000051',:other_branch,'e3200000-0000-7000-8000-000000000041','e3200000-0000-7000-8000-000000000061','receipt','e3200000-0000-7000-8000-000000000011','e3200000-0000-7000-8000-000000000021','e3200000-0000-7000-8000-000000000031',1,10,10,NULL,'2026-08-24 09:00Z',:other_member),
          (:other_org,'e3200000-0000-7000-8000-000000000052',:other_branch,'e3200000-0000-7000-8000-000000000041','e3200000-0000-7000-8000-000000000062','reversal','e3200000-0000-7000-8000-000000000011','e3200000-0000-7000-8000-000000000021','e3200000-0000-7000-8000-000000000031',-1,9,-9,'e3200000-0000-7000-8000-000000000051','2026-08-24 10:00Z',:other_member);
    """), {
        "org": ORG_ID, "branch": BRANCH_ID, "member": MEMBERSHIP_ID,
        "auth": AUTH_USER_ID, "other_org": OTHER_ORG_ID,
        "other_branch": OTHER_BRANCH_ID, "other_member": OTHER_MEMBERSHIP_ID,
        "other_auth": OTHER_AUTH_USER_ID,
    })
    session.execute(text("SET LOCAL session_replication_role=origin"))


def _all_pages(load, **params):
    cursor = None
    first = None
    items = []
    seen = set()
    while True:
        page = load(limit=1, cursor=cursor, **params)
        first = first or page
        assert page.scope == first.scope
        assert page.as_of == first.as_of
        assert page.business_date == first.business_date
        assert page.total_count == first.total_count
        assert page.summary == first.summary
        items.extend(page.items)
        if page.next_cursor is None:
            break
        assert page.next_cursor not in seen
        seen.add(page.next_cursor)
        cursor = page.next_cursor
    assert len(items) == first.total_count
    return first, items


def _exercise(session: Session) -> None:
    user = {"org_id": str(ORG_ID), "auth_user_id": str(AUTH_USER_ID)}
    context = reads.inventory_context(user=user, db=session)
    assert [branch.branch_id for branch in context.branches] == [BRANCH_ID]
    saleable, transit = context.branches[0].locations
    assert saleable.location_type == "saleable"
    assert saleable.location_status == "active"
    assert saleable.allows_sale is True
    assert saleable.allows_negative_stock is False
    assert str(saleable.temperature_min_c) == "-20.000000"
    assert str(saleable.temperature_max_c) == "25.500000"
    assert transit.location_type == "transit"
    assert transit.allows_sale is False

    current, products = _all_pages(
        lambda **page: reads.current_stock(
            branch_id=BRANCH_ID, location_id=None, search=None,
            user=user, db=session, **page,
        )
    )
    assert [row.product_code for row in products] == ["P-1", "P-2", "P-3", "P-4"]
    assert str(current.summary.total_quantity) == "15.000000"
    assert str(current.summary.total_value) == "240.00"
    assert current.summary.batch_count == 4
    assert current.summary.positive_stock_batch_count == 3
    assert current.summary.exhausted_batch_count == 0
    assert current.summary.negative_stock_batch_count == 1
    negative_product = next(row for row in products if row.product_code == "P-4")
    assert str(negative_product.total_quantity) == "-2.000000"
    assert str(negative_product.total_value) == "-40.00"
    assert negative_product.batch_count == negative_product.negative_stock_batch_count == 1

    batches, batch_rows = _all_pages(
        lambda **page: reads.batches(
            branch_id=BRANCH_ID, location_id=None, product_id=None, search=None,
            user=user, db=session, **page,
        )
    )
    assert batches.summary.batch_count == 4
    assert batches.summary.positive_stock_count == 3
    assert batches.summary.negative_stock_count == 1
    assert str(batches.summary.total_quantity) == "15.000000"
    assert str(batches.summary.total_value) == "240.00"
    assert all(row.is_saleable for row in batch_rows if row.batch_number != "B-NEG")
    assert str(batch_rows[0].total_value) == "100.00"
    negative_batch = next(row for row in batch_rows if row.batch_number == "B-NEG")
    assert str(negative_batch.total_quantity) == "-2.000000"
    assert str(negative_batch.total_value) == "-40.00"
    assert negative_batch.is_saleable is False

    _, transit_batches = _all_pages(
        lambda **page: reads.batches(
            branch_id=BRANCH_ID,
            location_id=UUID("e3100000-0000-7000-8000-000000000012"),
            product_id=None,
            search=None,
            user=user,
            db=session,
            **page,
        )
    )
    assert len(transit_batches) == 1
    assert transit_batches[0].batch_number == "B-1"
    assert transit_batches[0].is_saleable is False

    movements, movement_rows = _all_pages(
        lambda **page: reads.movements(
            branch_id=BRANCH_ID, location_id=None, product_id=None, batch_id=None,
            date_from=None, date_to=None, user=user, db=session, **page,
        )
    )
    assert movements.summary.movement_count == 8
    assert str(movements.summary.net_quantity_delta) == "15.000000"
    assert str(movements.summary.net_value_delta) == "240.00"
    assert len({row.movement_id for row in movement_rows}) == 8
    adjustment = next(row for row in movement_rows if row.entry_kind == "value_adjustment")
    reversal = next(row for row in movement_rows if row.entry_kind == "reversal")
    assert str(adjustment.quantity_delta) == "0.000000"
    assert str(adjustment.value_delta) == "5.00"
    assert str(reversal.value_delta) == "-5.00"
    assert reversal.reversal_reconciled is True

    try:
        reads.current_stock(
            branch_id=OTHER_BRANCH_ID, location_id=None, search=None,
            limit=1, cursor=None, user=user, db=session,
        )
    except HTTPException as denied:
        assert denied.status_code == 403
    else:
        raise AssertionError("cross-tenant branch was visible to the stock reader")

    other = {"org_id": str(OTHER_ORG_ID), "auth_user_id": str(OTHER_AUTH_USER_ID)}
    try:
        reads.movements(
            branch_id=OTHER_BRANCH_ID, location_id=None, product_id=None, batch_id=None,
            date_from=None, date_to=None, limit=10, cursor=None, user=other, db=session,
        )
    except ValidationError as bad_reversal:
        assert "reversal_reconciled" in str(bad_reversal)
    else:
        raise AssertionError("bad reversal was exposed as reconciled")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            transaction = session.begin()
            try:
                assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
                _seed(session)
                session.execute(text('SET LOCAL ROLE "erp_runtime"'))
                assert session.scalar(text("SELECT current_user")) == "erp_runtime"
                assert session.scalar(text(
                    "SELECT rolsuper OR rolbypassrls FROM pg_catalog.pg_roles "
                    "WHERE rolname=current_user"
                )) is False
                for table_name in ("stock_balances", "stock_ledger_entries"):
                    policy = session.execute(text("""
                        SELECT policy.qual, class.relrowsecurity, class.relforcerowsecurity
                          FROM pg_catalog.pg_policies policy
                          JOIN pg_catalog.pg_class class ON class.relname=policy.tablename
                          JOIN pg_catalog.pg_namespace namespace ON namespace.oid=class.relnamespace
                           AND namespace.nspname=policy.schemaname
                         WHERE policy.schemaname='inventory' AND policy.tablename=:table_name
                           AND policy.policyname='erp_select'
                    """), {"table_name": table_name}).one()
                    assert policy.relrowsecurity and policy.relforcerowsecurity
                    assert "can_access_branch" in policy.qual
                _exercise(session)
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
