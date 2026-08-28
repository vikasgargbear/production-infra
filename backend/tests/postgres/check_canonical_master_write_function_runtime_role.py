"""Prove canonical master writes use named functions as erp_runtime."""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


ORG_A = UUID("ed000000-0000-7000-8000-000000000001")
ORG_B = UUID("ed000000-0000-7000-8000-000000000002")
AUTH_A = UUID("ed000000-0000-7000-8000-000000000003")
AUTH_B = UUID("ed000000-0000-7000-8000-000000000004")
USER_A = UUID("ed000000-0000-7000-8000-000000000005")
USER_B = UUID("ed000000-0000-7000-8000-000000000006")
MEMBER_A = UUID("ed000000-0000-7000-8000-000000000007")
MEMBER_B = UUID("ed000000-0000-7000-8000-000000000008")
ROLE_A = UUID("ed000000-0000-7000-8000-000000000009")
ROLE_B = UUID("ed000000-0000-7000-8000-000000000010")
GRANT_A = UUID("ed000000-0000-7000-8000-000000000011")
GRANT_B = UUID("ed000000-0000-7000-8000-000000000012")
PARTY_A = UUID("ed000000-0000-7000-8000-000000000013")
PARTY_B = UUID("ed000000-0000-7000-8000-000000000014")
PRODUCT_A = UUID("ed000000-0000-7000-8000-000000000015")
PRODUCT_DELETE = UUID("ed000000-0000-7000-8000-000000000016")
PRODUCT_B = UUID("ed000000-0000-7000-8000-000000000017")
CUSTOMER_A = UUID("ed000000-0000-7000-8000-000000000018")
CUSTOMER_B = UUID("ed000000-0000-7000-8000-000000000019")
SUPPLIER_PARTY_A = UUID("ed000000-0000-7000-8000-000000000020")
SUPPLIER_PARTY_B = UUID("ed000000-0000-7000-8000-000000000021")
SUPPLIER_A = UUID("ed000000-0000-7000-8000-000000000022")
SUPPLIER_B = UUID("ed000000-0000-7000-8000-000000000023")
RECEIVABLE_A = UUID("ed000000-0000-7000-8000-000000000024")
RECEIVABLE_B = UUID("ed000000-0000-7000-8000-000000000025")
PAYABLE_A = UUID("ed000000-0000-7000-8000-000000000026")
PAYABLE_B = UUID("ed000000-0000-7000-8000-000000000027")


def _expect_denied(connection, statement: str, parameters: dict) -> None:
    savepoint = connection.begin_nested()
    try:
        connection.execute(text(statement), parameters)
    except DBAPIError:
        savepoint.rollback()
    else:
        savepoint.rollback()
        raise AssertionError("restricted runtime operation unexpectedly succeeded")


def _seed(connection) -> None:
    connection.execute(
        text("INSERT INTO auth.users(id) VALUES (:auth_a),(:auth_b)"),
        {"auth_a": AUTH_A, "auth_b": AUTH_B},
    )
    connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
    connection.exec_driver_sql("SET CONSTRAINTS ALL DEFERRED")
    tables = (
        "core.organizations",
        "core.users",
        "core.memberships",
        "core.roles",
        "core.role_permissions",
        "core.access_grants",
        "finance.accounts",
        "parties.parties",
        "parties.contacts",
        "parties.customer_accounts",
        "parties.supplier_accounts",
        "catalog.products",
    )
    for table_name in tables:
        connection.exec_driver_sql(f"ALTER TABLE {table_name} DISABLE TRIGGER USER")
    connection.execute(
        text(
            """
            INSERT INTO core.organizations(
              id,legal_name,registered_address_line1,registered_city,
              registered_state_code,registered_postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org_a,'Master Function Org A','1 Test Road','Mumbai','27','400001',
               'active',:member_a,:member_a),
              (:org_b,'Master Function Org B','2 Test Road','Pune','27','411001',
               'active',:member_b,:member_b);
            INSERT INTO core.users(id,auth_user_id,display_name,status)
            VALUES (:user_a,:auth_a,'Master A','active'),
                   (:user_b,:auth_b,'Master B','active');
            INSERT INTO core.memberships(
              org_id,id,user_id,status,joined_at,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:member_a,:user_a,'active',transaction_timestamp(),
                    :member_a,:member_a),
                   (:org_b,:member_b,:user_b,'active',transaction_timestamp(),
                    :member_b,:member_b);
            SET CONSTRAINTS ALL IMMEDIATE;
            INSERT INTO core.roles(
              org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:role_a,'master_a','Master A','active',:member_a,:member_a),
                   (:org_b,:role_b,'master_b','Master B','active',:member_b,:member_b);
            INSERT INTO core.role_permissions(
              org_id,role_id,permission_code,created_by_membership_id)
            VALUES (:org_a,:role_a,'catalog.product.manage',:member_a),
                   (:org_a,:role_a,'parties.party.manage',:member_a),
                   (:org_a,:role_a,'parties.customer.manage',:member_a),
                   (:org_a,:role_a,'parties.supplier.manage',:member_a),
                   (:org_b,:role_b,'catalog.product.manage',:member_b),
                   (:org_b,:role_b,'parties.party.manage',:member_b),
                   (:org_b,:role_b,'parties.customer.manage',:member_b),
                   (:org_b,:role_b,'parties.supplier.manage',:member_b);
            INSERT INTO core.access_grants(
              org_id,id,membership_id,role_id,scope_kind,valid_from_at,status,
              created_by_membership_id)
            VALUES (:org_a,:grant_a,:member_a,:role_a,'organization',
                    transaction_timestamp(),'active',:member_a),
                   (:org_b,:grant_b,:member_b,:role_b,'organization',
                    transaction_timestamp(),'active',:member_b);
            INSERT INTO parties.parties(
              org_id,id,party_kind,legal_name,pan,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:party_a,'organization','Party A',NULL,'active',:member_a,:member_a),
                   (:org_b,:party_b,'organization','Party B',NULL,'active',:member_b,:member_b),
                   (:org_a,:supplier_party_a,'organization','Supplier Party A',NULL,'active',:member_a,:member_a),
                   (:org_b,:supplier_party_b,'organization','Supplier Party B',NULL,'active',:member_b,:member_b);
            INSERT INTO finance.accounts(
              org_id,id,code,name,account_type,allows_party_posting,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:receivable_a,'AR-A','Receivable A','asset',true,'active',:member_a,:member_a),
                   (:org_b,:receivable_b,'AR-B','Receivable B','asset',true,'active',:member_b,:member_b),
                   (:org_a,:payable_a,'AP-A','Payable A','liability',true,'active',:member_a,:member_a),
                   (:org_b,:payable_b,'AP-B','Payable B','liability',true,'active',:member_b,:member_b);
            INSERT INTO parties.contacts(
              org_id,party_id,contact_kind,name,email,phone,is_primary,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:party_a,'business','Customer A','customer-a@example.test','9876543210',true,'active',:member_a,:member_a),
                   (:org_b,:party_b,'business','Customer B','customer-b@example.test','9876543211',true,'active',:member_b,:member_b),
                   (:org_a,:supplier_party_a,'business','Supplier A','supplier-a@example.test','9876543212',true,'active',:member_a,:member_a),
                   (:org_b,:supplier_party_b,'business','Supplier B','supplier-b@example.test','9876543213',true,'active',:member_b,:member_b);
            INSERT INTO parties.customer_accounts(
              org_id,id,party_id,customer_code,credit_limit,credit_days,
              default_receivable_account_id,status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:customer_a,:party_a,'TEST-CUST-A',100,7,:receivable_a,'active',:member_a,:member_a),
                   (:org_b,:customer_b,:party_b,'TEST-CUST-B',100,7,:receivable_b,'active',:member_b,:member_b);
            INSERT INTO parties.supplier_accounts(
              org_id,id,party_id,supplier_code,payment_days,default_payable_account_id,
              status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:supplier_a,:supplier_party_a,'TEST-SUP-A',30,:payable_a,'active',:member_a,:member_a),
                   (:org_b,:supplier_b,:supplier_party_b,'TEST-SUP-B',30,:payable_b,'active',:member_b,:member_b);
            INSERT INTO catalog.products(
              org_id,id,sku,product_kind,name,base_uom_code,hsn_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:product_a,'TEST-A-1','medicine','Draft A','EA','0000',
                    'draft',:member_a,:member_a),
                   (:org_a,:product_delete,'TEST-A-2','consumable','Delete A','EA','0000',
                    'draft',:member_a,:member_a),
                   (:org_b,:product_b,'TEST-B-1','medicine','Draft B','EA','0000',
                    'draft',:member_b,:member_b);
            """
        ),
        {
            "org_a": ORG_A,
            "org_b": ORG_B,
            "auth_a": AUTH_A,
            "auth_b": AUTH_B,
            "user_a": USER_A,
            "user_b": USER_B,
            "member_a": MEMBER_A,
            "member_b": MEMBER_B,
            "role_a": ROLE_A,
            "role_b": ROLE_B,
            "grant_a": GRANT_A,
            "grant_b": GRANT_B,
            "party_a": PARTY_A,
            "party_b": PARTY_B,
            "product_a": PRODUCT_A,
            "product_delete": PRODUCT_DELETE,
            "product_b": PRODUCT_B,
            "customer_a": CUSTOMER_A,
            "customer_b": CUSTOMER_B,
            "supplier_party_a": SUPPLIER_PARTY_A,
            "supplier_party_b": SUPPLIER_PARTY_B,
            "supplier_a": SUPPLIER_A,
            "supplier_b": SUPPLIER_B,
            "receivable_a": RECEIVABLE_A,
            "receivable_b": RECEIVABLE_B,
            "payable_a": PAYABLE_A,
            "payable_b": PAYABLE_B,
        },
    )
    for table_name in tables:
        connection.exec_driver_sql(f"ALTER TABLE {table_name} ENABLE TRIGGER USER")
    connection.exec_driver_sql("RESET ROLE")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            _seed(connection)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            principal = connection.execute(
                text(
                    "SELECT session_user,current_user,rolsuper,rolbypassrls "
                    "FROM pg_roles WHERE rolname=current_user"
                )
            ).one()
            assert tuple(principal) == ("erp_runtime", "erp_runtime", False, False)
            connection.execute(
                text(
                    "SELECT pg_catalog.set_config("
                    "'app.request_id',pg_catalog.gen_random_uuid()::text,true)"
                )
            )
            connection.execute(
                text("SELECT erp_security.activate_context(:auth,:org)"),
                {"auth": AUTH_A, "org": ORG_A},
            )

            _expect_denied(
                connection,
                "UPDATE catalog.products SET name='Direct' WHERE id=:id",
                {"id": PRODUCT_A},
            )
            _expect_denied(
                connection,
                "UPDATE parties.customer_accounts SET credit_days=99 WHERE id=:id",
                {"id": CUSTOMER_A},
            )
            customer_update_sql = """
                SELECT customer_account_id,updated_customer_name,updated_primary_email,
                       updated_pan,updated_credit_limit,updated_credit_days,
                       account_row_version,party_row_version,idempotency_replayed
                  FROM erp_master_commands.update_customer_account(
                    :org,:customer,:account_version,:party_version,
                    true,'Customer A Revised',false,NULL,false,NULL,
                    true,'customer-a-revised@example.test',false,NULL,
                    true,'ABCDE1234F',true,250.00,true,14,
                    pg_catalog.decode(:key,'hex'),transaction_timestamp()+interval '1 hour'
                  )
            """
            customer_parameters = {
                "org": ORG_A, "customer": CUSTOMER_A,
                "account_version": 1, "party_version": 1, "key": "11" * 32,
            }
            customer_updated = connection.execute(
                text(customer_update_sql), customer_parameters,
            ).one()
            assert customer_updated == (
                CUSTOMER_A, "Customer A Revised", "customer-a-revised@example.test",
                "ABCDE1234F", 250, 14, 2, 2, False,
            )
            customer_replay = connection.execute(
                text(customer_update_sql), customer_parameters,
            ).one()
            assert customer_replay[:-1] == customer_updated[:-1]
            assert customer_replay[-1] is True
            _expect_denied(
                connection,
                customer_update_sql,
                {**customer_parameters, "key": "12" * 32},
            )
            _expect_denied(
                connection,
                customer_update_sql,
                {
                    **customer_parameters, "customer": CUSTOMER_B,
                    "key": "13" * 32,
                },
            )
            _expect_denied(
                connection,
                "UPDATE parties.contacts SET email='direct@example.test' WHERE party_id=:party",
                {"party": PARTY_A},
            )

            _expect_denied(
                connection,
                "UPDATE parties.supplier_accounts SET payment_days=99 WHERE id=:id",
                {"id": SUPPLIER_A},
            )
            supplier_update_sql = """
                SELECT supplier_account_id,updated_supplier_name,updated_primary_phone,
                       updated_pan,updated_payment_days,account_row_version,
                       party_row_version,idempotency_replayed
                  FROM erp_master_commands.update_supplier_account(
                    :org,:supplier,:account_version,:party_version,
                    true,'Supplier A Revised',true,'9876543299',false,NULL,
                    false,NULL,true,'FGHIJ5678K',true,45,
                    pg_catalog.decode(:key,'hex'),transaction_timestamp()+interval '1 hour'
                  )
            """
            supplier_parameters = {
                "org": ORG_A, "supplier": SUPPLIER_A,
                "account_version": 1, "party_version": 1, "key": "21" * 32,
            }
            supplier_updated = connection.execute(
                text(supplier_update_sql), supplier_parameters,
            ).one()
            assert supplier_updated == (
                SUPPLIER_A, "Supplier A Revised", "9876543299",
                "FGHIJ5678K", 45, 2, 2, False,
            )
            supplier_replay = connection.execute(
                text(supplier_update_sql), supplier_parameters,
            ).one()
            assert supplier_replay[:-1] == supplier_updated[:-1]
            assert supplier_replay[-1] is True
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_master_commands.update_supplier_account(
                  :org,:supplier,2,2,false,NULL,true,NULL,true,NULL,
                  false,NULL,false,NULL,false,NULL,
                  pg_catalog.decode(:key,'hex'),transaction_timestamp()+interval '1 hour'
                )
                """,
                {"org": ORG_A, "supplier": SUPPLIER_A, "key": "24" * 32},
            )
            _expect_denied(
                connection,
                supplier_update_sql,
                {**supplier_parameters, "key": "22" * 32},
            )
            _expect_denied(
                connection,
                supplier_update_sql,
                {
                    **supplier_parameters, "supplier": SUPPLIER_B,
                    "key": "23" * 32,
                },
            )
            updated = connection.execute(
                text(
                    """
                    SELECT product_id,updated_product_name,new_row_version
                      FROM erp_master_commands.update_product_draft(
                        :org,:product,1,true,'Draft A Revised',false,NULL,false,NULL
                      )
                    """
                ),
                {"org": ORG_A, "product": PRODUCT_A},
            ).one()
            assert updated == (PRODUCT_A, "Draft A Revised", 2)
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_master_commands.update_product_draft(
                  :org,:product,1,true,'Stale',false,NULL,false,NULL
                )
                """,
                {"org": ORG_A, "product": PRODUCT_A},
            )
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_master_commands.update_product_draft(
                  :org,:product,1,true,'Cross tenant',false,NULL,false,NULL
                )
                """,
                {"org": ORG_A, "product": PRODUCT_B},
            )

            address = connection.execute(
                text(
                    """
                    SELECT address_id,row_version,idempotency_replayed
                      FROM erp_master_commands.create_party_address(
                        :org,:party,'billing','1 Canonical Road',NULL,NULL,
                        'Mumbai','27','400001',true
                      )
                    """
                ),
                {"org": ORG_A, "party": PARTY_A},
            ).one()
            assert address[1:] == (1, False)
            address_id = address[0]
            replay = connection.execute(
                text(
                    """
                    SELECT address_id,row_version,idempotency_replayed
                      FROM erp_master_commands.create_party_address(
                        :org,:party,'billing','1 Canonical Road',NULL,NULL,
                        'Mumbai','27','400001',true
                      )
                    """
                ),
                {"org": ORG_A, "party": PARTY_A},
            ).one()
            assert replay == (address_id, 1, True)
            auto_primary = connection.execute(
                text(
                    """
                    SELECT address_id,row_version,idempotency_replayed
                      FROM erp_master_commands.create_party_address(
                        :org,:party,'shipping','2 Canonical Road',NULL,NULL,
                        'Mumbai','27','400001',false
                      )
                    """
                ),
                {"org": ORG_A, "party": PARTY_A},
            ).one()
            auto_primary_replay = connection.execute(
                text(
                    """
                    SELECT address_id,row_version,idempotency_replayed
                      FROM erp_master_commands.create_party_address(
                        :org,:party,'shipping','2 Canonical Road',NULL,NULL,
                        'Mumbai','27','400001',false
                      )
                    """
                ),
                {"org": ORG_A, "party": PARTY_A},
            ).one()
            assert auto_primary[1:] == (1, False)
            assert auto_primary_replay == (auto_primary[0], 1, True)
            assert connection.scalar(
                text(
                    "SELECT count(*) FROM parties.addresses "
                    "WHERE org_id=:org AND party_id=:party "
                    "AND address_kind='shipping'"
                ),
                {"org": ORG_A, "party": PARTY_A},
            ) == 1
            _expect_denied(
                connection,
                "INSERT INTO parties.addresses(org_id,party_id,address_kind,line1,city,"
                "state_code,postal_code) VALUES(:org,:party,'other','Direct','Mumbai',"
                "'27','400001')",
                {"org": ORG_A, "party": PARTY_A},
            )
            changed = connection.execute(
                text(
                    """
                    SELECT address_id,row_version
                      FROM erp_master_commands.update_party_address(
                        :org,:party,:address,1,'billing','2 Canonical Road',NULL,NULL,
                        'Mumbai','27','400001',true
                      )
                    """
                ),
                {"org": ORG_A, "party": PARTY_A, "address": address_id},
            ).one()
            assert changed == (address_id, 2)
            _expect_denied(
                connection,
                "UPDATE parties.addresses SET city='Direct' WHERE id=:id",
                {"id": address_id},
            )
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_master_commands.create_party_address(
                  :org,:party,'billing','Cross tenant',NULL,NULL,'Pune','27','411001',true
                )
                """,
                {"org": ORG_A, "party": PARTY_B},
            )

            deleted = connection.execute(
                text(
                    "SELECT product_id FROM erp_master_commands.delete_product_draft("
                    ":org,:product,1)"
                ),
                {"org": ORG_A, "product": PRODUCT_DELETE},
            ).scalar_one()
            assert deleted == PRODUCT_DELETE
            _expect_denied(
                connection,
                "DELETE FROM catalog.products WHERE id=:id",
                {"id": PRODUCT_A},
            )
            assert connection.scalar(
                text("SELECT count(*) FROM catalog.products WHERE id=:id"),
                {"id": PRODUCT_B},
            ) == 0
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
