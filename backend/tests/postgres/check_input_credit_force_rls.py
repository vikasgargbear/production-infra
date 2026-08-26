"""Prove forced tenant RLS and reviewed mutation posture for input-credit lineage."""

from __future__ import annotations

import os
from uuid import UUID

import psycopg2
from psycopg2 import sql
from psycopg2.extras import register_uuid


register_uuid()


ORG_A = UUID("f0240000-0000-7000-8000-000000000001")
ORG_B = UUID("f0240000-0000-7000-8000-000000000002")
AUTH_A = UUID("f0240000-0000-7000-8000-000000000003")
AUTH_B = UUID("f0240000-0000-7000-8000-000000000004")
USER_A = UUID("f0240000-0000-7000-8000-000000000005")
USER_B = UUID("f0240000-0000-7000-8000-000000000006")
MEMBER_A = UUID("f0240000-0000-7000-8000-000000000007")
MEMBER_B = UUID("f0240000-0000-7000-8000-000000000008")
LOT_A = UUID("f0240000-0000-7000-8000-000000000009")
LOT_B = UUID("f0240000-0000-7000-8000-000000000010")
EVENT_A = UUID("f0240000-0000-7000-8000-000000000011")
EVENT_B = UUID("f0240000-0000-7000-8000-000000000012")
APPLICATION_A = UUID("f0240000-0000-7000-8000-000000000013")
APPLICATION_B = UUID("f0240000-0000-7000-8000-000000000014")

RELATIONS = (
    "input_credit_lots",
    "input_credit_reversal_events",
    "input_credit_applications",
)

MUTATION_FUNCTIONS = (
    "capture_input_credit_stock_movement",
    "capture_supplier_invoice_input_credit_lots",
    "capture_tax_document_input_credit_lots",
    "consume_input_credit_lots",
    "create_supplier_invoice_input_credit_lots",
    "post_destruction_input_credit_reversal",
    "reserve_destruction_input_credit",
    "restore_sales_return_input_credit_lots",
)


def _expect_denied(cursor, statement: str, parameters: tuple[object, ...]) -> None:
    cursor.execute("SAVEPOINT expected_denial")
    try:
        cursor.execute(statement, parameters)
    except psycopg2.Error as exc:
        cursor.execute("ROLLBACK TO SAVEPOINT expected_denial")
        assert exc.pgcode == "42501"
    else:
        cursor.execute("ROLLBACK TO SAVEPOINT expected_denial")
        raise AssertionError("direct runtime mutation unexpectedly succeeded")
    finally:
        cursor.execute("RELEASE SAVEPOINT expected_denial")


def _seed(cursor) -> None:
    cursor.execute("SET LOCAL session_replication_role=replica")
    cursor.execute(
        "INSERT INTO auth.users(id) VALUES (%s),(%s)",
        (AUTH_A, AUTH_B),
    )
    cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
    cursor.execute("SET CONSTRAINTS ALL DEFERRED")
    cursor.execute(
        """
        INSERT INTO core.organizations(
          id,legal_name,registered_address_line1,registered_city,
          registered_state_code,registered_postal_code,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES
          (%s,'FORCE RLS A','1 Test Road','Mumbai','27','400001','active',%s,%s),
          (%s,'FORCE RLS B','2 Test Road','Pune','27','411001','active',%s,%s);
        INSERT INTO core.users(id,auth_user_id,display_name,status)
        VALUES (%s,%s,'FORCE RLS A','active'),(%s,%s,'FORCE RLS B','active');
        INSERT INTO core.memberships(
          org_id,id,user_id,status,joined_at,
          created_by_membership_id,updated_by_membership_id)
        VALUES
          (%s,%s,%s,'active',transaction_timestamp(),%s,%s),
          (%s,%s,%s,'active',transaction_timestamp(),%s,%s);
        """,
        (
            ORG_A, MEMBER_A, MEMBER_A, ORG_B, MEMBER_B, MEMBER_B,
            USER_A, AUTH_A, USER_B, AUTH_B,
            ORG_A, MEMBER_A, USER_A, MEMBER_A, MEMBER_A,
            ORG_B, MEMBER_B, USER_B, MEMBER_B, MEMBER_B,
        ),
    )
    for org_id, member_id, lot_id, event_id, application_id, suffix in (
        (ORG_A, MEMBER_A, LOT_A, EVENT_A, APPLICATION_A, "a"),
        (ORG_B, MEMBER_B, LOT_B, EVENT_B, APPLICATION_B, "b"),
    ):
        cursor.execute(
            """
            INSERT INTO tax.input_credit_lots(
              org_id,id,registration_id,supplier_invoice_id,supplier_invoice_line_id,
              supplier_invoice_receipt_allocation_id,goods_receipt_line_id,batch_id,
              acquired_on,acquired_base_quantity,eligible_cgst_amount,eligible_sgst_amount,
              eligible_igst_amount,eligible_cess_amount,remaining_base_quantity,
              remaining_cgst_amount,remaining_sgst_amount,remaining_igst_amount,
              remaining_cess_amount,lineage_status,source_hash,
              created_by_membership_id,updated_by_membership_id)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,CURRENT_DATE,10,6,6,0,0,10,6,6,0,0,
                   'exact',decode(repeat(%s,32),'hex'),%s,%s)
            """,
            (
                org_id, lot_id, UUID(f"f0240000-0000-7000-8000-00000000002{suffix}"),
                UUID(f"f0240000-0000-7000-8000-00000000003{suffix}"),
                UUID(f"f0240000-0000-7000-8000-00000000004{suffix}"),
                UUID(f"f0240000-0000-7000-8000-00000000005{suffix}"),
                UUID(f"f0240000-0000-7000-8000-00000000006{suffix}"),
                UUID(f"f0240000-0000-7000-8000-00000000007{suffix}"),
                "24", member_id, member_id,
            ),
        )
        cursor.execute(
            """
            INSERT INTO tax.input_credit_reversal_events(
              org_id,id,destruction_id,registration_id,return_period_id,gstr3b_return_id,
              rule_version_id,evidence_attachment_id,journal_entry_id,
              reversal_expense_account_id,input_cgst_account_id,input_sgst_account_id,
              input_igst_account_id,input_cess_account_id,physical_destruction_confirmed_at,
              cgst_amount,sgst_amount,igst_amount,cess_amount,status,created_by_membership_id)
            VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                   transaction_timestamp(),1,1,0,0,'draft',%s)
            """,
            (org_id, event_id, *(UUID(int=event_id.int + offset) for offset in range(1, 13)), member_id),
        )
        cursor.execute(
            """
            INSERT INTO tax.input_credit_applications(
              org_id,id,input_credit_lot_id,application_kind,application_direction,
              applied_base_quantity,applied_cgst_amount,applied_sgst_amount,
              applied_igst_amount,applied_cess_amount,source_lot_row_version,status,
              created_by_membership_id)
            VALUES(%s,%s,%s,'sale_consumption','consume',1,0.6,0.6,0,0,1,'reserved',%s)
            """,
            (org_id, application_id, lot_id, member_id),
        )
    cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
    cursor.execute("RESET ROLE")
    cursor.execute("SET LOCAL session_replication_role=origin")


def _assert_visible_ids(cursor, expected: tuple[UUID, UUID, UUID]) -> None:
    assert len(RELATIONS) == len(expected)
    for relation, identifier in zip(RELATIONS, expected):
        cursor.execute(
            sql.SQL("SELECT id FROM tax.{} ORDER BY id").format(sql.Identifier(relation))
        )
        assert cursor.fetchall() == [(identifier,)]


def main() -> None:
    database_url = os.environ["DATABASE_URL"].replace(
        "postgresql+psycopg2://", "postgresql://", 1
    )
    with psycopg2.connect(database_url) as connection:
        connection.autocommit = False
        with connection.cursor() as cursor:
            cursor.execute("SHOW server_version_num")
            assert int(cursor.fetchone()[0]) // 10000 == 15
            _seed(cursor)

            cursor.execute(
                """
                SELECT relation.relname,owner_role.rolname,relation.relrowsecurity,
                       relation.relforcerowsecurity
                  FROM pg_catalog.pg_class relation
                  JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
                  JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=relation.relowner
                 WHERE namespace.nspname='tax' AND relation.relname=ANY(%s)
                 ORDER BY relation.relname
                """,
                (list(RELATIONS),),
            )
            assert cursor.fetchall() == [
                (name, "erp_migration_owner", True, True) for name in sorted(RELATIONS)
            ]
            cursor.execute(
                "SELECT rolcanlogin,rolbypassrls FROM pg_roles "
                "WHERE rolname='erp_migration_owner'"
            )
            assert cursor.fetchone() == (False, True)
            cursor.execute(
                """
                SELECT procedure.proname,owner_role.rolname,procedure.prosecdef,
                       'search_path=""'=ANY(COALESCE(procedure.proconfig,ARRAY[]::text[])),
                       has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
                  FROM pg_catalog.pg_proc procedure
                  JOIN pg_catalog.pg_namespace namespace
                    ON namespace.oid=procedure.pronamespace
                  JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=procedure.proowner
                 WHERE namespace.nspname='erp_compliance_commands'
                   AND procedure.proname=ANY(%s)
                 ORDER BY procedure.proname
                """,
                (list(MUTATION_FUNCTIONS),),
            )
            assert cursor.fetchall() == [
                (name, "erp_migration_owner", True, True, False)
                for name in sorted(MUTATION_FUNCTIONS)
            ]
            cursor.execute('SET SESSION AUTHORIZATION "erp_runtime"')
            cursor.execute(
                "SELECT session_user,current_user,rolsuper,rolbypassrls "
                "FROM pg_roles WHERE rolname=current_user"
            )
            assert cursor.fetchone() == ("erp_runtime", "erp_runtime", False, False)

            cursor.execute("SELECT erp_security.activate_context(%s,%s)", (AUTH_A, ORG_A))
            _assert_visible_ids(cursor, (LOT_A, EVENT_A, APPLICATION_A))
            cursor.execute("SELECT erp_security.activate_context(%s,%s)", (AUTH_B, ORG_B))
            _assert_visible_ids(cursor, (LOT_B, EVENT_B, APPLICATION_B))

            for relation in RELATIONS:
                _expect_denied(
                    cursor,
                    sql.SQL("INSERT INTO tax.{}(org_id) VALUES(%s)").format(
                        sql.Identifier(relation)
                    ).as_string(cursor),
                    (ORG_B,),
                )
                _expect_denied(
                    cursor,
                    sql.SQL("UPDATE tax.{} SET org_id=org_id WHERE org_id=%s").format(
                        sql.Identifier(relation)
                    ).as_string(cursor),
                    (ORG_B,),
                )
                _expect_denied(
                    cursor,
                    sql.SQL("DELETE FROM tax.{} WHERE org_id=%s").format(
                        sql.Identifier(relation)
                    ).as_string(cursor),
                    (ORG_B,),
                )

            cursor.execute("RESET SESSION AUTHORIZATION")
            connection.rollback()
    print("Input-credit FORCE RLS PostgreSQL 15 acceptance passed")


if __name__ == "__main__":
    main()
