"""Exercise tenant-owned master code allocation on disposable PostgreSQL 15.

The fixture binds the restricted runtime principal to the typed customer,
supplier, and product creation commands.  It proves that allocation is atomic
under concurrency, idempotency is exact, failed creates roll back both the
claim and the number, and neither tenant context nor direct table writes can be
used to forge or rewrite an assigned code.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import os
from threading import Barrier
from uuid import UUID, uuid4

import psycopg2
from psycopg2 import Binary
from psycopg2.extras import register_uuid
from sqlalchemy.engine import make_url


register_uuid()


ORG = UUID("ac270000-0000-7000-8000-000000000001")
OTHER_ORG = UUID("ac270000-0000-7000-8000-000000000002")
USER = UUID("ac270000-0000-7000-8000-000000000003")
AUTH_USER = UUID("ac270000-0000-7000-8000-000000000004")
MEMBERSHIP = UUID("ac270000-0000-7000-8000-000000000005")
ROLE = UUID("ac270000-0000-7000-8000-000000000006")
ACCESS_GRANT = UUID("ac270000-0000-7000-8000-000000000007")
RECEIVABLE_ACCOUNT = UUID("ac270000-0000-7000-8000-000000000008")
PAYABLE_ACCOUNT = UUID("ac270000-0000-7000-8000-000000000009")
OTHER_USER = UUID("ac270000-0000-7000-8000-000000000010")
OTHER_MEMBERSHIP = UUID("ac270000-0000-7000-8000-000000000011")
BRANCH = UUID("ac270000-0000-7000-8000-000000000012")
BRANCH_USER = UUID("ac270000-0000-7000-8000-000000000013")
BRANCH_AUTH_USER = UUID("ac270000-0000-7000-8000-000000000014")
BRANCH_MEMBERSHIP = UUID("ac270000-0000-7000-8000-000000000015")
BRANCH_ACCESS_GRANT = UUID("ac270000-0000-7000-8000-000000000016")
COLLISION_ORG = UUID("ac270000-0000-7000-8000-000000000017")
COLLISION_MEMBERSHIP = UUID("ac270000-0000-7000-8000-000000000018")

SEED_TRIGGER_TABLES = (
    "core.organizations",
    "core.users",
    "core.branches",
    "core.roles",
    "core.role_permissions",
    "core.access_grants",
    "finance.accounts",
)


def _admin_dsn() -> str:
    if os.getenv("CANONICAL_CI_ALLOW_DISPOSABLE") != "1":
        raise RuntimeError("master-code acceptance requires explicit disposable opt-in")
    url = make_url(os.environ["DATABASE_URL"])
    if url.host not in {"127.0.0.1", "localhost"}:
        raise RuntimeError("master-code acceptance requires an exact loopback host")
    if url.database != "canonical_alembic_ci":
        raise RuntimeError("master-code acceptance requires canonical_alembic_ci")
    return (
        f"host={url.host} port={url.port or 5432} dbname={url.database} "
        f"user={url.username} password={url.password or ''}"
    )


def _digest(label: str) -> Binary:
    return Binary(hashlib.sha256(label.encode("utf-8")).digest())


def _activate_runtime(
    cursor,
    organization_id: UUID = ORG,
    auth_user_id: UUID = AUTH_USER,
) -> None:
    cursor.execute('SET SESSION AUTHORIZATION "erp_runtime"')
    cursor.execute(
        "SELECT erp_security.activate_context(%s,%s)",
        (auth_user_id, organization_id),
    )
    cursor.execute(
        "SELECT set_config('app.request_id',%s,true)",
        (str(uuid4()),),
    )


def _seed(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute("SHOW server_version_num")
        assert int(cursor.fetchone()[0]) // 10000 == 15
        cursor.execute(
            "INSERT INTO auth.users(id) VALUES (%s),(%s)",
            (AUTH_USER, BRANCH_AUTH_USER),
        )
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")
        cursor.execute(
            "SELECT set_config('app.request_id',%s,true)", (str(uuid4()),)
        )
        for table in SEED_TRIGGER_TABLES:
            cursor.execute(f"ALTER TABLE {table} DISABLE TRIGGER USER")
        try:
            cursor.execute(
                """
                INSERT INTO core.organizations(
                  id,legal_name,registered_address_line1,registered_city,
                  registered_state_code,registered_postal_code,status,
                  created_by_membership_id,updated_by_membership_id)
                VALUES
                  (%s,'PG15 Master Code Acceptance','1 Atomic Road','Mumbai',
                   '27','400001','active',%s,%s),
                  (%s,'PG15 Hidden Tenant','2 Tenant Road','Pune',
                   '27','411001','active',%s,%s),
                  (%s,'PG15 Collision Tenant','3 Collision Road','Pune',
                   '27','411002','active',%s,%s);
                INSERT INTO core.users(id,auth_user_id,display_name,status)
                VALUES (%s,%s,'Master Code Runtime Actor','active'),
                       (%s,NULL,'Hidden Tenant Actor','active'),
                       (%s,%s,'Branch-only Master Actor','active');
                INSERT INTO core.memberships(
                  org_id,id,user_id,status,joined_at,
                  created_by_membership_id,updated_by_membership_id)
                VALUES
                  (%s,%s,%s,'active',transaction_timestamp(),%s,%s),
                  (%s,%s,%s,'active',transaction_timestamp(),%s,%s),
                  (%s,%s,%s,'active',transaction_timestamp(),%s,%s),
                  (%s,%s,%s,'invited',NULL,%s,%s);
                SET CONSTRAINTS ALL IMMEDIATE;
                SELECT set_config('app.org_id',%s,true),
                       set_config('app.membership_id',%s,true),
                       set_config('app.auth_user_id',%s,true),
                       set_config('app.request_id',%s,true);

                INSERT INTO core.roles(
                  org_id,id,code,name,status,
                  created_by_membership_id,updated_by_membership_id)
                VALUES (%s,%s,'master_code_acceptance','Master Code Acceptance',
                        'active',%s,%s);
                INSERT INTO core.role_permissions(
                  org_id,role_id,permission_code,created_by_membership_id)
                SELECT %s,%s,permission_code,%s
                  FROM unnest(ARRAY[
                    'parties.customer.manage','parties.supplier.manage',
                    'catalog.product.manage','core.organization.manage'
                  ]::text[]) AS permission_code;
                INSERT INTO core.branches(
                  org_id,id,code,name,address_line1,city,state_code,postal_code,
                  status,created_by_membership_id,updated_by_membership_id)
                VALUES (%s,%s,'PG27-BR','PG15 Branch Scope','1 Atomic Road',
                        'Mumbai','27','400001','active',%s,%s);
                INSERT INTO core.access_grants(
                  org_id,id,membership_id,role_id,scope_kind,valid_from_at,
                  branch_id,status,created_by_membership_id)
                VALUES
                  (%s,%s,%s,%s,'organization',transaction_timestamp(),NULL,
                   'active',%s),
                  (%s,%s,%s,%s,'branch',transaction_timestamp(),%s,
                   'active',%s);

                INSERT INTO finance.accounts(
                  org_id,id,code,name,account_type,currency_code,
                  allows_party_posting,allows_bank_reconciliation,status,
                  created_by_membership_id,updated_by_membership_id)
                VALUES
                  (%s,%s,'1100-PG27','PG15 trade receivables','asset','INR',
                   true,false,'active',%s,%s),
                  (%s,%s,'2100-PG27','PG15 trade payables','liability','INR',
                   true,false,'active',%s,%s);
                """,
                (
                    ORG, MEMBERSHIP, MEMBERSHIP,
                    OTHER_ORG, OTHER_MEMBERSHIP, OTHER_MEMBERSHIP,
                    COLLISION_ORG, COLLISION_MEMBERSHIP, COLLISION_MEMBERSHIP,
                    USER, AUTH_USER, OTHER_USER, BRANCH_USER, BRANCH_AUTH_USER,
                    ORG, MEMBERSHIP, USER, MEMBERSHIP, MEMBERSHIP,
                    OTHER_ORG, OTHER_MEMBERSHIP, OTHER_USER,
                    OTHER_MEMBERSHIP, OTHER_MEMBERSHIP,
                    ORG, BRANCH_MEMBERSHIP, BRANCH_USER,
                    BRANCH_MEMBERSHIP, BRANCH_MEMBERSHIP,
                    COLLISION_ORG, COLLISION_MEMBERSHIP, OTHER_USER,
                    COLLISION_MEMBERSHIP, COLLISION_MEMBERSHIP,
                    str(ORG), str(MEMBERSHIP), str(AUTH_USER), str(uuid4()),
                    ORG, ROLE, MEMBERSHIP, MEMBERSHIP,
                    ORG, ROLE, MEMBERSHIP,
                    ORG, BRANCH, MEMBERSHIP, MEMBERSHIP,
                    ORG, ACCESS_GRANT, MEMBERSHIP, ROLE, MEMBERSHIP,
                    ORG, BRANCH_ACCESS_GRANT, BRANCH_MEMBERSHIP, ROLE,
                    BRANCH, MEMBERSHIP,
                    ORG, RECEIVABLE_ACCOUNT, MEMBERSHIP, MEMBERSHIP,
                    ORG, PAYABLE_ACCOUNT, MEMBERSHIP, MEMBERSHIP,
                ),
            )
        finally:
            for table in reversed(SEED_TRIGGER_TABLES):
                cursor.execute(f"ALTER TABLE {table} ENABLE TRIGGER USER")


def _create_product(
    admin_dsn: str,
    name: str,
    key: str,
    *,
    auth_user_id: UUID = AUTH_USER,
):
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        _activate_runtime(cursor, auth_user_id=auth_user_id)
        cursor.execute(
            """
            SELECT * FROM erp_master_commands.create_product_draft(
              %s,%s,NULL,'medicine',%s,transaction_timestamp()+interval '1 hour')
            """,
            (ORG, name, _digest(key)),
        )
        return cursor.fetchone()


def _create_customer(admin_dsn: str, name: str, key: str):
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        _activate_runtime(cursor)
        cursor.execute(
            """
            SELECT * FROM erp_master_commands.create_customer(
              %s,%s,'organization','9876502701',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,
              NULL,0,0,%s,transaction_timestamp()+interval '1 hour')
            """,
            (ORG, name, _digest(key)),
        )
        return cursor.fetchone()


def _create_supplier(admin_dsn: str, name: str, key: str):
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        _activate_runtime(cursor)
        cursor.execute(
            """
            SELECT * FROM erp_master_commands.create_supplier(
              %s,%s,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,0,
              %s,transaction_timestamp()+interval '1 hour')
            """,
            (ORG, name, _digest(key)),
        )
        return cursor.fetchone()


def _assert_onboarding_is_exact_and_replay_safe(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        _activate_runtime(cursor)
        cursor.execute(
            "SELECT erp_master_commands.provision_organization_code_sequences(%s)",
            (ORG,),
        )
        assert cursor.fetchone() == (3,)
        cursor.execute(
            "SELECT erp_master_commands.provision_organization_code_sequences(%s)",
            (ORG,),
        )
        assert cursor.fetchone() == (3,)
        connection.commit()

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT code_kind,prefix,suffix,padding,next_value,status
              FROM core.master_code_sequences
             WHERE org_id=%s
             ORDER BY code_kind
            """,
            (ORG,),
        )
        assert cursor.fetchall() == [
            ("customer", "CUST-", "", 6, 1, "active"),
            ("product", "PROD-", "", 6, 1, "active"),
            ("supplier", "SUP-", "", 6, 1, "active"),
        ]


def _assert_onboarding_rejects_future_code_collision(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            "SELECT set_config('app.org_id',%s,true),"
            "set_config('app.membership_id',%s,true),"
            "set_config('app.request_id',%s,true)",
            (str(COLLISION_ORG), str(COLLISION_MEMBERSHIP), str(uuid4())),
        )
        cursor.execute("ALTER TABLE catalog.products DISABLE TRIGGER USER")
        cursor.execute(
            """
            INSERT INTO catalog.products(
              org_id,sku,product_kind,name,base_uom_code,hsn_code,
              cold_chain_required,status,created_by_membership_id,
              updated_by_membership_id)
            VALUES (%s,'PROD-000001','medicine','Legacy Collision Product',
                    'EA','0000',false,'draft',%s,%s)
            """,
            (COLLISION_ORG, COLLISION_MEMBERSHIP, COLLISION_MEMBERSHIP),
        )
        cursor.execute("ALTER TABLE catalog.products ENABLE TRIGGER USER")
        connection.commit()

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            "SELECT set_config('app.request_id',%s,true)", (str(uuid4()),)
        )
        try:
            cursor.execute(
                """
                UPDATE core.memberships
                   SET status='active',joined_at=transaction_timestamp(),
                       updated_at=transaction_timestamp(),row_version=row_version+1
                 WHERE org_id=%s AND id=%s AND status='invited'
                """,
                (COLLISION_ORG, COLLISION_MEMBERSHIP),
            )
        except psycopg2.Error as error:
            assert error.pgcode == "23505"
            connection.rollback()
        else:
            raise AssertionError("organization onboarding accepted a future code collision")

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
              (SELECT status FROM core.memberships
                WHERE org_id=%s AND id=%s),
              (SELECT count(*) FROM core.master_code_sequences WHERE org_id=%s)
            """,
            (COLLISION_ORG, COLLISION_MEMBERSHIP, COLLISION_ORG),
        )
        assert cursor.fetchone() == ("invited", 0)


def _assert_concurrent_product_allocation(admin_dsn: str) -> list[tuple]:
    def create(index: int):
        return _create_product(
            admin_dsn,
            f"PG15 Concurrent Product {index:02d}",
            f"pg15-concurrent-product-{index:02d}",
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(create, range(1, 17)))
    assert len({row[0] for row in rows}) == 16
    assert {row[1] for row in rows} == {
        f"PROD-{value:06d}" for value in range(1, 17)
    }
    assert all(row[2] is False for row in rows)
    return rows


def _assert_replay_and_conflict(admin_dsn: str) -> tuple[tuple, tuple]:
    customer = _create_customer(
        admin_dsn, "PG15 Exact Replay Customer", "pg15-customer-replay"
    )
    replay = _create_customer(
        admin_dsn, "PG15 Exact Replay Customer", "pg15-customer-replay"
    )
    assert replay[:3] == customer[:3]
    assert customer[2] == "CUST-000001"
    assert customer[3] is False and replay[3] is True

    try:
        _create_customer(
            admin_dsn, "PG15 Changed Replay Customer", "pg15-customer-replay"
        )
    except psycopg2.Error as error:
        assert error.pgcode == "23505"
    else:
        raise AssertionError("changed request reused an idempotency key")

    supplier = _create_supplier(
        admin_dsn, "PG15 Canonical Supplier", "pg15-supplier-create"
    )
    assert supplier[2:] == ("SUP-000001", False)
    return customer, supplier


def _assert_same_key_concurrent_replay(admin_dsn: str) -> tuple:
    barrier = Barrier(8)

    def create(_: int):
        barrier.wait()
        return _create_customer(
            admin_dsn,
            "PG15 Concurrent Replay Customer",
            "pg15-customer-concurrent-replay",
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(create, range(8)))
    assert len({row[0] for row in rows}) == 1
    assert len({row[1] for row in rows}) == 1
    assert {row[2] for row in rows} == {"CUST-000002"}
    assert sum(row[3] is False for row in rows) == 1
    assert sum(row[3] is True for row in rows) == 7
    return rows[0]


def _assert_normalized_duplicate_name_race(admin_dsn: str) -> tuple:
    barrier = Barrier(2)

    def create(arguments: tuple[str, str]):
        barrier.wait()
        try:
            return "created", _create_product(admin_dsn, *arguments)
        except psycopg2.Error as error:
            return "rejected", error.pgcode

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(create, (
            (" PG15 Normalized Product ", "pg15-normalized-product-a"),
            ("pg15 normalized product", "pg15-normalized-product-b"),
        )))
    created = [value for status, value in outcomes if status == "created"]
    rejected = [value for status, value in outcomes if status == "rejected"]
    assert len(created) == 1 and rejected == ["23505"], outcomes
    assert created[0][1:] == ("PROD-000018", False)
    return created[0]


def _assert_failed_create_rolls_back_number_and_claim(admin_dsn: str) -> tuple:
    name = "PG15 Forced Rollback Product"
    key = "pg15-forced-rollback-product"
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            """
            CREATE FUNCTION pg_temp.reject_master_code_acceptance()
            RETURNS trigger LANGUAGE plpgsql AS $body$
            BEGIN
              IF NEW.name='PG15 Forced Rollback Product' THEN
                RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='forced fixture rollback';
              END IF;
              RETURN NEW;
            END
            $body$;
            CREATE TRIGGER reject_master_code_acceptance
            BEFORE INSERT ON catalog.products
            FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_master_code_acceptance();
            """
        )
        connection.commit()
        _activate_runtime(cursor)
        try:
            cursor.execute(
                """
                SELECT * FROM erp_master_commands.create_product_draft(
                  %s,%s,NULL,'medicine',%s,
                  transaction_timestamp()+interval '1 hour')
                """,
                (ORG, name, _digest(key)),
            )
        except psycopg2.Error as error:
            assert error.pgcode == "P0001"
            connection.rollback()
        else:
            raise AssertionError("fault-injected product create succeeded")

        cursor.execute("RESET SESSION AUTHORIZATION")
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            """
            SELECT next_value FROM core.master_code_sequences
             WHERE org_id=%s AND code_kind='product'
            """,
            (ORG,),
        )
        assert cursor.fetchone() == (17,)
        cursor.execute(
            """
            SELECT
              (SELECT count(*) FROM core.idempotency_keys
                WHERE org_id=%s AND operation='catalog.product_draft.create'
                  AND idempotency_key_hash=%s),
              (SELECT count(*) FROM catalog.products
                WHERE org_id=%s AND name='PG15 Forced Rollback Product')
            """,
            (ORG, _digest(key), ORG),
        )
        assert cursor.fetchone() == (0, 0)
        cursor.execute("DROP TRIGGER reject_master_code_acceptance ON catalog.products")
        connection.commit()

    created = _create_product(admin_dsn, name, key)
    assert created[1:] == ("PROD-000017", False)
    return created


def _assert_tenant_and_write_boundaries(
    admin_dsn: str,
    product: tuple,
    customer: tuple,
    supplier: tuple,
) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        _activate_runtime(cursor)
        for statement, parameters, expected_code in (
            (
                "SELECT next_value FROM core.master_code_sequences "
                "WHERE org_id=%s AND code_kind='product'",
                (ORG,),
                "42501",
            ),
            (
                "INSERT INTO core.master_code_sequences("
                "org_id,code_kind,prefix,suffix,padding,next_value,status) "
                "VALUES(%s,'product','FORGED-','',5,1,'active')",
                (ORG,),
                "42501",
            ),
            (
                "UPDATE core.master_code_sequences SET next_value=1 "
                "WHERE org_id=%s AND code_kind='product'",
                (ORG,),
                "42501",
            ),
            (
                "SELECT erp_master_commands.provision_organization_code_sequences(%s)",
                (OTHER_ORG,),
                "42501",
            ),
            (
                "UPDATE catalog.products SET sku='FORGED' WHERE org_id=%s AND id=%s",
                (ORG, product[0]),
                "42501",
            ),
            (
                "UPDATE parties.customer_accounts SET customer_code='FORGED' "
                "WHERE org_id=%s AND id=%s",
                (ORG, customer[0]),
                "42501",
            ),
            (
                "UPDATE parties.supplier_accounts SET supplier_code='FORGED' "
                "WHERE org_id=%s AND id=%s",
                (ORG, supplier[0]),
                "42501",
            ),
            (
                "INSERT INTO catalog.products("
                "org_id,sku,product_kind,name,base_uom_code,hsn_code,status) "
                "VALUES(%s,'FORGED','medicine','Forged Direct Product','EA','0000','draft')",
                (ORG,),
                "42501",
            ),
        ):
            try:
                cursor.execute(statement, parameters)
            except psycopg2.Error as error:
                assert error.pgcode == expected_code
                connection.rollback()
                _activate_runtime(cursor)
            else:
                raise AssertionError(f"erp_runtime executed direct master write: {statement}")

        try:
            cursor.execute(
                """
                SELECT * FROM erp_master_commands.create_product_draft(
                  %s,'PG15 Cross Tenant Product',NULL,'medicine',%s,
                  transaction_timestamp()+interval '1 hour')
                """,
                (OTHER_ORG, _digest("pg15-cross-tenant")),
            )
        except psycopg2.Error as error:
            assert error.pgcode == "42501"
            connection.rollback()
        else:
            raise AssertionError("runtime actor created a product in another tenant")

    try:
        _create_product(
            admin_dsn,
            "PG15 Branch-only Global Product",
            "pg15-branch-only-global-product",
            auth_user_id=BRANCH_AUTH_USER,
        )
    except psycopg2.Error as error:
        assert error.pgcode == "42501"
    else:
        raise AssertionError("branch-only actor used an organization-global master command")

    # Owners cannot silently rewrite codes either: immutability is a data
    # invariant, not merely an application-role privilege convention.
    for table, column, resource_id in (
        ("catalog.products", "sku", product[0]),
        ("parties.customer_accounts", "customer_code", customer[0]),
        ("parties.supplier_accounts", "supplier_code", supplier[0]),
    ):
        with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
            cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
            cursor.execute(
                "SELECT set_config('app.org_id',%s,true),"
                "set_config('app.membership_id',%s,true),"
                "set_config('app.request_id',%s,true)",
                (str(ORG), str(MEMBERSHIP), str(uuid4())),
            )
            try:
                cursor.execute(
                    f"UPDATE {table} SET {column}='FORGED',row_version=row_version+1 "
                    "WHERE org_id=%s AND id=%s",
                    (ORG, resource_id),
                )
                connection.commit()
            except psycopg2.Error as error:
                assert error.pgcode == "23514"
                connection.rollback()
            else:
                raise AssertionError(f"migration owner rewrote immutable {table}.{column}")


def _assert_catalog_contract(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
              has_table_privilege('erp_runtime','core.master_code_sequences','SELECT'),
              has_table_privilege('erp_runtime','core.master_code_sequences','INSERT'),
              has_table_privilege('erp_runtime','core.master_code_sequences','UPDATE'),
              has_table_privilege('erp_runtime','catalog.products','INSERT'),
              has_table_privilege('erp_runtime','parties.customer_accounts','INSERT'),
              has_table_privilege('erp_runtime','parties.supplier_accounts','INSERT'),
              has_function_privilege(
                'erp_runtime',
                'erp_master_commands.create_product_draft(uuid,text,text,text,bytea,timestamptz)',
                'EXECUTE'),
              has_function_privilege(
                'erp_runtime',
                'erp_master_commands.create_customer(uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz)',
                'EXECUTE'),
              has_function_privilege(
                'erp_runtime',
                'erp_master_commands.create_supplier(uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz)',
                'EXECUTE'),
              has_function_privilege(
                'erp_runtime',
                'erp_master_commands.provision_organization_code_sequences(uuid)',
                'EXECUTE'),
              NOT has_function_privilege(
                'erp_app',
                'erp_master_commands.provision_organization_code_sequences(uuid)',
                'EXECUTE'),
              (SELECT NOT rolsuper AND NOT rolbypassrls
                 FROM pg_catalog.pg_roles WHERE rolname='erp_runtime'),
              (SELECT relrowsecurity AND relforcerowsecurity
                 FROM pg_catalog.pg_class
                WHERE oid='core.master_code_sequences'::regclass),
              EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger
                 WHERE tgrelid='core.memberships'::regclass
                   AND tgname='zz_memberships_master_code_onboarding_trg'
                   AND NOT tgisinternal
              )
            """
        )
        assert cursor.fetchone() == (
            False, False, False, False, False, False,
            True, True, True, True, True, True, True, True,
        )


def _assert_inactive_and_overflow_fail_closed(admin_dsn: str) -> None:
    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            "SELECT set_config('app.org_id',%s,true),"
            "set_config('app.membership_id',%s,true),"
            "set_config('app.auth_user_id',%s,true),"
            "set_config('app.request_id',%s,true)",
            (str(ORG), str(MEMBERSHIP), str(AUTH_USER), str(uuid4())),
        )
        cursor.execute(
            """
            UPDATE core.master_code_sequences
               SET status='closed',updated_at=transaction_timestamp(),
                   updated_by_membership_id=%s,row_version=row_version+1
             WHERE org_id=%s AND code_kind='customer' AND status='active'
            """,
            (MEMBERSHIP, ORG),
        )
        assert cursor.rowcount == 1

    inactive_key = "pg15-inactive-customer-sequence"
    try:
        _create_customer(admin_dsn, "PG15 Inactive Config Customer", inactive_key)
    except psycopg2.Error as error:
        assert error.pgcode == "P0002"
    else:
        raise AssertionError("customer create used a closed code sequence")

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
        cursor.execute(
            "SELECT set_config('app.org_id',%s,true),"
            "set_config('app.membership_id',%s,true),"
            "set_config('app.auth_user_id',%s,true),"
            "set_config('app.request_id',%s,true)",
            (str(ORG), str(MEMBERSHIP), str(AUTH_USER), str(uuid4())),
        )
        cursor.execute("ALTER TABLE core.master_code_sequences DISABLE TRIGGER USER")
        cursor.execute(
            """
            UPDATE core.master_code_sequences
               SET prefix='OVERFLOW-',suffix='',padding=18,
                   next_value=1000000000000000000,
                   updated_at=transaction_timestamp(),
                   updated_by_membership_id=%s,row_version=row_version+1
             WHERE org_id=%s AND code_kind='product' AND status='active'
            """,
            (MEMBERSHIP, ORG),
        )
        assert cursor.rowcount == 1
        cursor.execute("ALTER TABLE core.master_code_sequences ENABLE TRIGGER USER")

    overflow_key = "pg15-overflow-product-sequence"
    try:
        _create_product(admin_dsn, "PG15 Overflow Product", overflow_key)
    except psycopg2.Error as error:
        assert error.pgcode == "22003"
    else:
        raise AssertionError("overflowing product sequence allocated a code")

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT
              (SELECT status||':'||next_value::text
                 FROM core.master_code_sequences
                WHERE org_id=%s AND code_kind='customer'),
              (SELECT next_value
                 FROM core.master_code_sequences
                WHERE org_id=%s AND code_kind='product'),
              (SELECT count(*) FROM core.idempotency_keys
                WHERE org_id=%s AND idempotency_key_hash IN (%s,%s))
            """,
            (ORG, ORG, ORG, _digest(inactive_key), _digest(overflow_key)),
        )
        assert cursor.fetchone() == (
            "closed:3", 1000000000000000000, 0,
        )


def main() -> None:
    admin_dsn = _admin_dsn()
    _seed(admin_dsn)
    _assert_catalog_contract(admin_dsn)
    _assert_onboarding_is_exact_and_replay_safe(admin_dsn)
    _assert_onboarding_rejects_future_code_collision(admin_dsn)
    concurrent_products = _assert_concurrent_product_allocation(admin_dsn)
    customer, supplier = _assert_replay_and_conflict(admin_dsn)
    _assert_same_key_concurrent_replay(admin_dsn)
    rollback_product = _assert_failed_create_rolls_back_number_and_claim(admin_dsn)
    normalized_product = _assert_normalized_duplicate_name_race(admin_dsn)
    _assert_tenant_and_write_boundaries(
        admin_dsn,
        rollback_product,
        customer,
        supplier,
    )

    with psycopg2.connect(admin_dsn) as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT code_kind,next_value FROM core.master_code_sequences
             WHERE org_id=%s ORDER BY code_kind
            """,
            (ORG,),
        )
        assert cursor.fetchall() == [
            ("customer", 3), ("product", 19), ("supplier", 2)
        ]
        cursor.execute(
            """
            SELECT count(*),count(DISTINCT sku)
              FROM catalog.products WHERE org_id=%s AND id=ANY(%s)
            """,
            (
                ORG,
                [row[0] for row in concurrent_products]
                + [rollback_product[0], normalized_product[0]],
            ),
        )
        assert cursor.fetchone() == (18, 18)
    _assert_inactive_and_overflow_fail_closed(admin_dsn)


if __name__ == "__main__":
    main()
