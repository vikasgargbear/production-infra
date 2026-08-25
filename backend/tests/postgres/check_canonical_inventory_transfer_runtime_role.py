"""Exercise transfer eligibility and readback through the real runtime DB role.

The fixture is transaction-local and always rolls back. It proves useful rows,
exact paired ledger evidence, tenant isolation, and two-branch authorization.
"""

from __future__ import annotations

import os
from uuid import UUID

from fastapi import HTTPException
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
AUTH_USER = UUID("d3000000-0000-7000-8000-000000000010")
OTHER_ORG = UUID("d4000000-0000-7000-8000-000000000001")


TABLES_WITH_USER_TRIGGERS = (
    "core.organizations", "core.users", "core.memberships", "core.branches",
    "core.roles", "core.access_grants", "core.reference_data_releases",
    "parties.parties", "catalog.products", "catalog.uom_conversions",
    "inventory.locations", "inventory.batches", "inventory.inventory_documents",
    "inventory.inventory_document_lines", "inventory.stock_ledger_entries",
    "inventory.stock_balances",
)


def _seed(session: Session) -> None:
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(
        text("INSERT INTO auth.users(id) VALUES (:auth_user)"),
        {"auth_user": AUTH_USER},
    )
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(text("""
        SELECT set_config('app.org_id', :org, true),
               set_config('app.membership_id', :membership, true),
               set_config('app.request_id', 'd3000000-0000-7000-8000-000000000099', true)
    """), {"org": str(ORG), "membership": str(MEMBERSHIP)})
    for table_name in TABLES_WITH_USER_TRIGGERS:
        session.execute(text(f"ALTER TABLE {table_name} DISABLE TRIGGER USER"))

    session.execute(text("""
        INSERT INTO core.organizations(
          id,legal_name,timezone,registered_address_line1,registered_city,
          registered_state_code,registered_postal_code,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES
          (:org,'Transfer Runtime Org','UTC','1 Source Road','Mumbai','27','400001','active',:membership,:membership),
          (:other_org,'Other Runtime Org','UTC','1 Other Road','Pune','27','411001','active',:other_membership,:other_membership);
        INSERT INTO core.users(id,auth_user_id,display_name,status)
        VALUES (:user_id,:auth_user,'Transfer Runtime Actor','active'),
               (:other_user,NULL,'Other Runtime Actor','active');
        INSERT INTO core.memberships(
          org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
        VALUES (:org,:membership,:user_id,'active',transaction_timestamp(),:membership,:membership),
               (:other_org,:other_membership,:other_user,'active',transaction_timestamp(),:other_membership,:other_membership);
        SET CONSTRAINTS ALL IMMEDIATE;

        INSERT INTO catalog.units_of_measure(code,name,symbol,dimension,decimal_places,status)
        VALUES ('EA','Each','ea','count',6,'active') ON CONFLICT (code) DO NOTHING;
        INSERT INTO core.branches(
          org_id,id,code,name,address_line1,city,state_code,postal_code,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES
          (:org,:source_branch,'SRC','Source Branch','1 Source Road','Mumbai','27','400001','active',:membership,:membership),
          (:org,:destination_branch,'DST','Destination Branch','1 Destination Road','Pune','27','411001','active',:membership,:membership);
        INSERT INTO core.roles(org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
        VALUES (:org,:role_id,'transfer_reader','Transfer Reader','active',:membership,:membership);
        INSERT INTO core.access_grants(
          org_id,id,membership_id,role_id,scope_kind,valid_from_at,status,created_by_membership_id)
        VALUES (:org,:grant_id,:membership,:role_id,'organization',transaction_timestamp(),'active',:membership);
        INSERT INTO core.reference_data_releases(
          id,dataset_kind,ruleset_version,source_authority,source_uri,
          source_storage_bucket,source_storage_object_path,source_media_type,source_document_sha256,
          dataset_storage_bucket,dataset_storage_object_path,dataset_media_type,dataset_sha256,
          record_count,publication_date,effective_from,reviewed_by_user_id,reviewed_at,status)
        VALUES (:release_id,'hsn_sac_tax','transfer-runtime-v1','gstn','https://example.invalid/hsn',
          'fixture','source.json','application/json',decode(repeat('11',32),'hex'),
          'fixture','dataset.json','application/json',decode(repeat('22',32),'hex'),
          1,current_date-1,current_date-1,:user_id,transaction_timestamp(),'active');
        INSERT INTO parties.parties(
          org_id,id,party_kind,legal_name,status,created_by_membership_id,updated_by_membership_id)
        VALUES (:org,:manufacturer,'organization','Fixture Manufacturer','active',:membership,:membership);
        INSERT INTO catalog.products(
          org_id,id,sku,product_kind,name,manufacturer_party_id,base_uom_code,hsn_code,
          drug_schedule,requires_prescription,ndps_regulated,regulatory_ruleset_version,
          cold_chain_required,status,hsn_release_id,created_by_membership_id,updated_by_membership_id)
        VALUES (:org,:product,'TRANSFER-SKU','consumable','Transfer Fixture Product',:manufacturer,
          'EA','3004','NONE',false,false,'transfer-runtime-v1',false,'active',:release_id,:membership,:membership);
        INSERT INTO catalog.uom_conversions(
          org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,created_by_membership_id)
        VALUES (:org,:conversion,:product,'EA','EA',1.000000,current_date-1,'active',:membership);
        INSERT INTO inventory.locations(
          org_id,id,branch_id,code,name,location_type,status,allows_sale,allows_negative_stock,
          created_by_membership_id,updated_by_membership_id)
        VALUES
          (:org,:source_location,:source_branch,'SRC-SALE','Source Saleable','saleable','active',true,false,:membership,:membership),
          (:org,:destination_location,:destination_branch,'DST-SALE','Destination Saleable','saleable','active',true,false,:membership,:membership);
        INSERT INTO inventory.batches(
          org_id,id,product_id,batch_number,lot_kind,manufactured_on,expires_on,mrp,
          mrp_uom_conversion_id,status,released_at,released_by_membership_id,
          created_by_membership_id,updated_by_membership_id)
        VALUES (:org,:batch_id,:product,'FEFO-1','manufacturer_batch',current_date-30,current_date+365,
          20.00,:conversion,'released',transaction_timestamp(),:membership,:membership,:membership);
        INSERT INTO inventory.inventory_documents(
          org_id,id,branch_id,destination_branch_id,physical_movement_required,
          origin_address_line1,origin_city,origin_state_code,origin_pincode,
          destination_address_line1,destination_city,destination_state_code,destination_pincode,
          transport_mode,distance_km,movement_started_at,document_type,document_number,
          fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
          total_abs_base_quantity,total_value,approved_at,approved_by_membership_id,
          posted_at,posted_by_membership_id,created_by_membership_id,updated_by_membership_id)
        VALUES (:org,:document,:source_branch,:destination_branch,true,
          '1 Source Road','Mumbai','27','400001','1 Destination Road','Pune','27','411001',
          'in_person',0.00,transaction_timestamp(),'transfer','ST-RUNTIME-1',
          extract(year from current_date)::smallint,current_date,'posted','inter_branch_transfer','INR',
          'moving_weighted_average',1.000000,10.00,transaction_timestamp(),:membership,
          transaction_timestamp(),:membership,:membership,:membership);
        INSERT INTO inventory.inventory_document_lines(
          org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,uom_code,
          entered_quantity,base_quantity,from_location_id,to_location_id,unit_cost,extended_cost,
          created_by_membership_id)
        VALUES (:org,:line_id,:document,1,'transfer',:product,:batch_id,'EA',1.000000,1.000000,
          :source_location,:destination_location,10.0000,10.00,:membership);
        INSERT INTO inventory.stock_ledger_entries(
          org_id,id,branch_id,inventory_document_id,inventory_document_line_id,entry_kind,
          location_id,product_id,batch_id,quantity_delta,unit_cost,value_delta,posted_at,posted_by_membership_id)
        VALUES
          (:org,:out_ledger,:source_branch,:document,:line_id,'transfer_out',:source_location,
            :product,:batch_id,-1.000000,10.0000,-10.00,transaction_timestamp(),:membership),
          (:org,:in_ledger,:destination_branch,:document,:line_id,'transfer_in',:destination_location,
            :product,:batch_id,1.000000,10.0000,10.00,transaction_timestamp(),:membership);
        INSERT INTO inventory.stock_balances(
          org_id,branch_id,location_id,product_id,batch_id,on_hand_quantity,inventory_value,
          average_unit_cost,last_ledger_entry_id)
        VALUES
          (:org,:source_branch,:source_location,:product,:batch_id,4.000000,40.00,10.0000,:out_ledger),
          (:org,:destination_branch,:destination_location,:product,:batch_id,1.000000,10.00,10.0000,:in_ledger);
    """), {
        "org": ORG, "other_org": OTHER_ORG, "membership": MEMBERSHIP,
        "other_membership": UUID("d4000000-0000-7000-8000-000000000002"),
        "user_id": UUID("d3000000-0000-7000-8000-000000000011"),
        "other_user": UUID("d4000000-0000-7000-8000-000000000003"),
        "auth_user": AUTH_USER, "source_branch": SOURCE_BRANCH,
        "destination_branch": DESTINATION_BRANCH,
        "role_id": UUID("d3000000-0000-7000-8000-000000000012"),
        "grant_id": UUID("d3000000-0000-7000-8000-000000000013"),
        "release_id": UUID("d3000000-0000-7000-8000-000000000014"),
        "manufacturer": UUID("d3000000-0000-7000-8000-000000000015"),
        "product": PRODUCT, "conversion": CONVERSION,
        "source_location": SOURCE_LOCATION, "destination_location": DESTINATION_LOCATION,
        "batch_id": UUID("d3000000-0000-7000-8000-000000000016"),
        "document": DOCUMENT, "line_id": UUID("d3000000-0000-7000-8000-000000000017"),
        "out_ledger": UUID("d3000000-0000-7000-8000-000000000018"),
        "in_ledger": UUID("d3000000-0000-7000-8000-000000000019"),
    })
    for table_name in TABLES_WITH_USER_TRIGGERS:
        session.execute(text(f"ALTER TABLE {table_name} ENABLE TRIGGER USER"))


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            transaction = session.begin()
            try:
                _seed(session)
                session.execute(text("RESET ROLE"))
                session.execute(text('SET LOCAL ROLE "erp_runtime"'))
                assert session.scalar(text("SELECT current_user")) == "erp_runtime"
                assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15

                business_date = session.scalar(text("SELECT transaction_timestamp()::date"))
                user = {"org_id": str(ORG), "auth_user_id": str(AUTH_USER)}
                eligible = transfers.get_eligible_transfer_batches(
                    source_branch_id=SOURCE_BRANCH, source_location_id=SOURCE_LOCATION,
                    destination_branch_id=DESTINATION_BRANCH,
                    destination_location_id=DESTINATION_LOCATION,
                    product_id=PRODUCT, uom_conversion_id=CONVERSION,
                    transfer_date=business_date, db=session, current_user=user,
                )
                assert len(eligible) == 1
                assert eligible[0]["available_base_quantity"] == "4.000000"
                assert eligible[0]["average_unit_cost"] == "10.0000"
                assert eligible[0]["inventory_value"] == "40.00"
                assert eligible[0]["is_default"] is True

                session.execute(text("RESET ROLE"))
                session.execute(text("""
                    UPDATE catalog.products SET ndps_regulated=true
                     WHERE org_id=:org AND id=:product
                """), {"org": ORG, "product": PRODUCT})
                session.execute(text('SET LOCAL ROLE "erp_runtime"'))
                regulated = transfers.get_eligible_transfer_batches(
                    source_branch_id=SOURCE_BRANCH, source_location_id=SOURCE_LOCATION,
                    destination_branch_id=DESTINATION_BRANCH,
                    destination_location_id=DESTINATION_LOCATION,
                    product_id=PRODUCT, uom_conversion_id=CONVERSION,
                    transfer_date=business_date, db=session, current_user=user,
                )
                assert regulated == [], "NDPS-regulated stock entered the ordinary transfer route"
                session.execute(text("RESET ROLE"))
                session.execute(text("""
                    UPDATE catalog.products SET ndps_regulated=false
                     WHERE org_id=:org AND id=:product
                """), {"org": ORG, "product": PRODUCT})
                session.execute(text('SET LOCAL ROLE "erp_runtime"'))

                response = transfers.get_transfer_readback(DOCUMENT, db=session, current_user=user)
                readback = transfers.TransferReadbackResponse(**response)
                assert readback.total_abs_base_quantity == "1.000000"
                assert readback.total_value == "10.00"
                assert len(readback.lines) == 1
                line = readback.lines[0]
                assert line.transfer_out_branch_id == SOURCE_BRANCH
                assert line.transfer_in_branch_id == DESTINATION_BRANCH
                assert line.transfer_out_location_id == SOURCE_LOCATION
                assert line.transfer_in_location_id == DESTINATION_LOCATION
                assert line.transfer_out_quantity == "-1.000000"
                assert line.transfer_in_quantity == "1.000000"
                assert line.transfer_out_value == "-10.00"
                assert line.transfer_in_value == "10.00"

                assert session.scalar(text(
                    "SELECT count(*) FROM core.organizations WHERE id=:other_org"
                ), {"other_org": OTHER_ORG}) == 0

                session.execute(text("RESET ROLE"))
                session.execute(text("""
                    UPDATE core.access_grants
                       SET scope_kind='branch',branch_id=:source_branch
                     WHERE org_id=:org AND membership_id=:membership
                """), {"org": ORG, "membership": MEMBERSHIP, "source_branch": SOURCE_BRANCH})
                session.execute(text("RESET ROLE"))
                session.execute(text('SET LOCAL ROLE "erp_runtime"'))
                denied = transfers.get_eligible_transfer_batches(
                    source_branch_id=SOURCE_BRANCH, source_location_id=SOURCE_LOCATION,
                    destination_branch_id=DESTINATION_BRANCH,
                    destination_location_id=DESTINATION_LOCATION,
                    product_id=PRODUCT, uom_conversion_id=CONVERSION,
                    transfer_date=business_date, db=session, current_user=user,
                )
                assert denied == []
                try:
                    transfers.get_transfer_readback(DOCUMENT, db=session, current_user=user)
                except HTTPException as error:
                    assert error.status_code == 404
                else:
                    raise AssertionError("source-only actor read destination transfer evidence")
            finally:
                transaction.rollback()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
