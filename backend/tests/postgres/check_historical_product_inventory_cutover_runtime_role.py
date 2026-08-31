"""Prove historical product/opening-stock cutover through erp_runtime."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "master_write_fixture",
    HERE / "check_canonical_master_write_function_runtime_role.py",
)
assert SPEC and SPEC.loader
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)

BRANCH = UUID("ee000000-0000-7000-8000-000000000001")
LOCATION = UUID("ee000000-0000-7000-8000-000000000002")
INVENTORY_ACCOUNT = UUID("ee000000-0000-7000-8000-000000000003")
EQUITY_ACCOUNT = UUID("ee000000-0000-7000-8000-000000000004")
TAX_RELEASE = UUID("ee000000-0000-7000-8000-000000000005")
TAX_VERSION = UUID("ee000000-0000-7000-8000-000000000006")
INGREDIENT_RELEASE = UUID("ee000000-0000-7000-8000-000000000007")
INGREDIENT = UUID("ee000000-0000-7000-8000-000000000008")
DATASET = "marg-product-stock-runtime-v1"


def _expect_denied(connection, statement: str, parameters: dict) -> None:
    savepoint = connection.begin_nested()
    try:
        connection.execute(text(statement), parameters)
    except DBAPIError:
        savepoint.rollback()
    else:
        savepoint.rollback()
        raise AssertionError("cutover boundary unexpectedly accepted invalid authority")


def _fact(
    identity: str,
    kind: str,
    record_key: str,
    *,
    product_code: str,
    product_name: str,
    quantity: str,
    inventory_value: str,
    event_date: str,
    payload: dict,
    batch_number: str | None = None,
    selection_state: str = "reviewed",
    product_id: str | None = None,
) -> dict:
    return {
        "id": identity,
        "dataset_id": DATASET,
        "source_kind": kind,
        "record_key": record_key,
        "branch_id": str(BRANCH),
        "event_date": event_date,
        "product_code": product_code,
        "product_name": product_name,
        "product_id": product_id,
        "batch_number": batch_number,
        "quantity": quantity,
        "inventory_value": inventory_value,
        "selection_state": selection_state,
        "payload": payload,
        "row_sha256": hashlib.sha256(record_key.encode()).hexdigest(),
    }


def _seed_cutover_authority(connection) -> None:
    connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
    connection.execute(
        text(
            "SELECT pg_catalog.set_config('app.org_id',:org,true),"
            "pg_catalog.set_config('app.membership_id',:member,true),"
            "pg_catalog.set_config('app.auth_user_id',:auth,true),"
            "pg_catalog.set_config('app.request_id',pg_catalog.gen_random_uuid()::text,true)"
        ),
        {
            "org": str(fixture.ORG_A),
            "member": str(fixture.MEMBER_A),
            "auth": str(fixture.AUTH_A),
        },
    )
    for table in (
        "core.reference_data_releases", "tax.tax_code_versions", "catalog.ingredients"
    ):
        connection.exec_driver_sql(f"ALTER TABLE {table} DISABLE TRIGGER USER")
    connection.execute(
        text(
            """
            UPDATE core.reference_data_releases
               SET status='retired'
             WHERE dataset_kind IN ('hsn_sac_tax','ingredient_classification')
               AND status='active'
            """
        )
    )
    connection.execute(
        text(
            """
            INSERT INTO core.role_permissions(
              org_id,role_id,permission_code,created_by_membership_id
            ) VALUES (:org,:role,'core.organization.manage',:member);
            INSERT INTO core.branches(
              org_id,id,code,name,address_line1,city,state_code,postal_code,status,
              created_by_membership_id,updated_by_membership_id
            ) VALUES (
              :org,:branch,'MARG','MARG Cutover','1 Import Road','Mumbai','27',
              '400001','active',:member,:member
            );
            INSERT INTO inventory.locations(
              org_id,id,branch_id,code,name,location_type,status,allows_sale,
              allows_negative_stock,created_by_membership_id,updated_by_membership_id
            ) VALUES (
              :org,:location,:branch,'SALE','Saleable','saleable','active',true,
              false,:member,:member
            );
            INSERT INTO core.master_code_sequences(
              org_id,id,code_kind,prefix,padding,next_value,status,
              created_by_membership_id,updated_by_membership_id
            ) VALUES (
              :org,pg_catalog.gen_random_uuid(),'product','PROD-',6,1,'active',
              :member,:member
            );
            INSERT INTO finance.accounts(
              org_id,id,code,name,account_type,status,
              created_by_membership_id,updated_by_membership_id
            ) VALUES
              (:org,:inventory,'INV','Inventory','asset','active',:member,:member),
              (:org,:equity,'OPEN-EQ','Opening equity','equity','active',:member,:member);
            INSERT INTO core.settings(
              org_id,id,scope_kind,namespace,key,value_type,value_text,status,
              created_by_membership_id,updated_by_membership_id
            ) VALUES
              (:org,pg_catalog.gen_random_uuid(),'organization','finance.account_roles',
               'inventory_asset','text',:inventory_text,'active',:member,:member),
              (:org,pg_catalog.gen_random_uuid(),'organization','finance.account_roles',
               'opening_balance_equity','text',:equity_text,'active',:member,:member);
            INSERT INTO catalog.units_of_measure(
              code,name,symbol,dimension,decimal_places,status
            ) VALUES ('PCS','Pieces','pcs','count',6,'active'),
                     ('MG','Milligrams','mg','mass',6,'active')
            ON CONFLICT (code) DO NOTHING;
            INSERT INTO core.reference_data_releases(
              id,dataset_kind,ruleset_version,source_authority,source_uri,
              source_storage_bucket,source_storage_object_path,source_media_type,
              source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
              dataset_sha256,record_count,publication_date,effective_from,
              reviewed_by_user_id,reviewed_at,status
            ) VALUES (
              :tax_release,'hsn_sac_tax','marg-tax-v1','gstn','https://gst.gov.in/marg-test',
              'evidence','marg/source','application/json',pg_catalog.decode(repeat('11',32),'hex'),
              'evidence','marg/dataset',pg_catalog.decode(repeat('12',32),'hex'),1,
              DATE '2026-01-01',DATE '2026-01-01',:user,pg_catalog.transaction_timestamp(),'active'
            );
            INSERT INTO core.reference_data_releases(
              id,dataset_kind,ruleset_version,source_authority,source_uri,
              source_storage_bucket,source_storage_object_path,source_media_type,
              source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
              dataset_sha256,record_count,publication_date,effective_from,
              reviewed_by_user_id,reviewed_at,status
            ) VALUES (
              :ingredient_release,'ingredient_classification','ingredient-v1','cdsco',
              'https://cdsco.gov.in/ingredient-test','evidence','ingredient/source',
              'application/json',pg_catalog.decode(repeat('13',32),'hex'),'evidence',
              'ingredient/dataset',pg_catalog.decode(repeat('14',32),'hex'),1,
              DATE '2026-01-01',DATE '2026-01-01',:user,pg_catalog.transaction_timestamp(),'active'
            );
            INSERT INTO tax.tax_code_versions(
              id,release_id,code,code_kind,version_number,description,effective_from,
              taxability,default_supply_type,cgst_rate,sgst_rate,igst_rate,cess_rate,
              ruleset_version,status
            ) VALUES (
              :tax_version,:tax_release,'3004','hsn',1,'Medicaments',DATE '2026-01-01',
              'taxable','goods',6,6,12,0,'marg-tax-v1','active'
            );
            INSERT INTO catalog.ingredients(
              id,release_id,canonical_name,normalized_name,drugs_rules_schedule,
              ndps_classification,classification_ruleset_version,effective_from,status
            ) VALUES (
              :ingredient,:ingredient_release,'Paracetamol','paracetamol','NONE','NONE',
              'ingredient-v1',DATE '2026-01-01','active'
            );
            """
        ),
        {
            "org": fixture.ORG_A,
            "role": fixture.ROLE_A,
            "member": fixture.MEMBER_A,
            "user": fixture.USER_A,
            "branch": BRANCH,
            "location": LOCATION,
            "inventory": INVENTORY_ACCOUNT,
            "equity": EQUITY_ACCOUNT,
            "inventory_text": str(INVENTORY_ACCOUNT),
            "equity_text": str(EQUITY_ACCOUNT),
            "tax_release": TAX_RELEASE,
            "tax_version": TAX_VERSION,
            "ingredient_release": INGREDIENT_RELEASE,
            "ingredient": INGREDIENT,
        },
    )
    for table in (
        "core.reference_data_releases", "tax.tax_code_versions", "catalog.ingredients"
    ):
        connection.exec_driver_sql(f"ALTER TABLE {table} ENABLE TRIGGER USER")
    connection.exec_driver_sql("RESET ROLE")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            _seed_cutover_authority(connection)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.execute(
                text(
                    "SELECT erp_security.activate_context(:auth,:org),"
                    "pg_catalog.set_config('app.request_id',pg_catalog.gen_random_uuid()::text,true)"
                ),
                {"auth": fixture.AUTH_A, "org": fixture.ORG_A},
            )
            product_payload = {
                "source_product_code": "MARG-100",
                "source_company": "Imported Manufacturer Limited",
                "product_kind": "medicine",
                "base_uom_code": "PCS",
                "hsn_code": "3004",
                "gst_rate": "12.000000",
                "hsn_gst_candidate_unique": True,
                "batch_reconciliation_status": "exact",
            }
            batch_payload = {
                "mrp": "120.00",
                "unit_cost": "100.00",
                "base_uom_code": "PCS",
                "mrp_uom_code": "PCS",
                "mrp_uom_multiplier": "1.000000",
            }
            existing_product = connection.execute(
                text(
                    "SELECT product_id FROM erp_master_commands.create_product_draft("
                    ":org,'Imported Medicine 100',NULL,'medicine',"
                    "pg_catalog.decode(repeat('21',32),'hex'),transaction_timestamp()+interval '1 hour')"
                ),
                {"org": fixture.ORG_A},
            ).scalar_one()
            facts = [
                _fact(
                    "ee000000-0000-7000-8000-000000000010", "product", "product:MARG-100",
                    product_code="MARG-100", product_name="Imported Medicine 100",
                    quantity="10.000000", inventory_value="1000.00", event_date="2026-08-01",
                    payload=product_payload, product_id=str(existing_product),
                ),
                _fact(
                    "ee000000-0000-7000-8000-000000000011", "batch", "batch:MARG-100:B1",
                    product_code="MARG-100", product_name="Imported Medicine 100",
                    batch_number="B1", quantity="10.000000", inventory_value="1000.00",
                    event_date="2028-08-01", payload=batch_payload,
                ),
                _fact(
                    "ee000000-0000-7000-8000-000000000012", "product", "product:MARG-NEG",
                    product_code="MARG-NEG", product_name="Imported Negative Medicine",
                    quantity="-2.000000", inventory_value="-200.00", event_date="2026-08-01",
                    payload={**product_payload, "source_product_code": "MARG-NEG", "batch_reconciliation_status": "none"},
                ),
                _fact(
                    "ee000000-0000-7000-8000-000000000013", "batch", "batch:MARG-100:EXPIRED",
                    product_code="MARG-100", product_name="Imported Medicine 100",
                    batch_number="OLD", quantity="1.000000", inventory_value="50.00",
                    event_date="2025-08-01", payload=batch_payload, selection_state="quarantined",
                ),
            ]
            imported = connection.execute(
                text(
                    "SELECT erp_automation_commands.import_historical_migration_facts("
                    ":org,CAST(:facts AS jsonb))"
                ),
                {"org": fixture.ORG_A, "facts": json.dumps(facts)},
            ).scalar_one()
            assert imported == {"inserted": 4, "replayed": 0, "accepted": 4}

            result = connection.execute(
                text(
                    "SELECT erp_automation_commands.promote_historical_product_inventory_batch("
                    ":org,:dataset,:location,100)"
                ),
                {"org": fixture.ORG_A, "dataset": DATASET, "location": LOCATION},
            ).scalar_one()
            assert result == {
                "products_created": 2,
                "products_replayed": 0,
                "products_remaining": 0,
                "negative_products_clamped": 1,
                "batches_bound": 1,
                "openings_posted": 1,
                "complete": True,
            }
            rows = connection.execute(
                text(
                    "SELECT product.name,product.status,product.setup_review_required,"
                    "product.dosage_form,product.strength_display "
                    "FROM catalog.products product WHERE product.org_id=:org "
                    "AND product.name LIKE 'Imported %' "
                    "ORDER BY product.name"
                ),
                {"org": fixture.ORG_A},
            ).all()
            assert rows == [
                ("Imported Medicine 100", "active", True, None, None),
                ("Imported Negative Medicine", "active", True, None, None),
            ]
            assert connection.execute(
                text(
                    "SELECT count(*) FROM catalog.products WHERE org_id=:org "
                    "AND name='Imported Medicine 100'"
                ),
                {"org": fixture.ORG_A},
            ).scalar_one() == 1
            batch = connection.execute(
                text(
                    "SELECT batch.status,batch.released_at IS NOT NULL,"
                    "batch.released_by_membership_id FROM inventory.batches batch "
                    "WHERE batch.org_id=:org AND batch.batch_number='B1'"
                ),
                {"org": fixture.ORG_A},
            ).one()
            assert batch == ("released", True, fixture.MEMBER_A)
            assert connection.execute(
                text(
                    "SELECT COALESCE(sum(quantity_delta),0),COALESCE(sum(value_delta),0) "
                    "FROM inventory.stock_ledger_entries WHERE org_id=:org"
                ),
                {"org": fixture.ORG_A},
            ).one() == (10, 1000)
            assert connection.execute(
                text(
                    "SELECT transaction_debit_total,transaction_credit_total,status "
                    "FROM finance.journal_entries WHERE org_id=:org AND journal_number LIKE 'MIG-INV-%'"
                ),
                {"org": fixture.ORG_A},
            ).one() == (1000, 1000, "posted")
            status = connection.execute(
                text(
                    "SELECT erp_automation_reads.historical_product_inventory_cutover_status("
                    ":org,:dataset)"
                ),
                {"org": fixture.ORG_A, "dataset": DATASET},
            ).scalar_one()
            assert status["bound_products"] == 2
            assert status["bound_batches"] == 1
            assert status["quarantined_batches"] == 1
            assert status["opening_quantity"] == status["ledger_quantity"] == "10.000000"
            assert status["opening_value"] == status["ledger_value"] == "1000.00"
            replay = connection.execute(
                text(
                    "SELECT erp_automation_commands.promote_historical_product_inventory_batch("
                    ":org,:dataset,:location,100)"
                ),
                {"org": fixture.ORG_A, "dataset": DATASET, "location": LOCATION},
            ).scalar_one()
            assert replay["complete"] is True
            assert replay["products_created"] == replay["openings_posted"] == 0
            _expect_denied(
                connection,
                "SELECT erp_automation_commands.promote_historical_product_inventory_batch("
                ":org,:dataset,:location,100)",
                {"org": fixture.ORG_B, "dataset": DATASET, "location": LOCATION},
            )
            ordinary = connection.execute(
                text(
                    "SELECT product_id FROM erp_master_commands.create_product_draft("
                    ":org,'Ordinary Incomplete Medicine',NULL,'medicine',"
                    "pg_catalog.decode(repeat('31',32),'hex'),transaction_timestamp()+interval '1 hour')"
                ),
                {"org": fixture.ORG_A},
            ).one()
            _expect_denied(
                connection,
                "SELECT * FROM erp_master_commands.activate_configured_product("
                ":org,:product,:version,NULL,pg_catalog.decode(repeat('32',32),'hex'),"
                "transaction_timestamp()+interval '1 hour')",
                {"org": fixture.ORG_A, "product": ordinary[0], "version": 1},
            )
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
