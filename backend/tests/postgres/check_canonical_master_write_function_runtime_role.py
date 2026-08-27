"""Prove product and address writes use named functions as erp_runtime."""

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
        "parties.parties",
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
                   (:org_b,:role_b,'catalog.product.manage',:member_b),
                   (:org_b,:role_b,'parties.party.manage',:member_b);
            INSERT INTO core.access_grants(
              org_id,id,membership_id,role_id,scope_kind,valid_from_at,status,
              created_by_membership_id)
            VALUES (:org_a,:grant_a,:member_a,:role_a,'organization',
                    transaction_timestamp(),'active',:member_a),
                   (:org_b,:grant_b,:member_b,:role_b,'organization',
                    transaction_timestamp(),'active',:member_b);
            INSERT INTO parties.parties(
              org_id,id,party_kind,legal_name,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:party_a,'organization','Party A','active',:member_a,:member_a),
                   (:org_b,:party_b,'organization','Party B','active',:member_b,:member_b);
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
