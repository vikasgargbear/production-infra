"""Prove branch-scoped evidence lifecycle and forced RLS as erp_runtime."""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


ORG_A = UUID("ec000000-0000-7000-8000-000000000001")
ORG_B = UUID("ec000000-0000-7000-8000-000000000002")
BRANCH_A = UUID("ec000000-0000-7000-8000-000000000003")
BRANCH_A_HIDDEN = UUID("ec000000-0000-7000-8000-000000000004")
BRANCH_B = UUID("ec000000-0000-7000-8000-000000000005")
AUTH_A = UUID("ec000000-0000-7000-8000-000000000006")
AUTH_B = UUID("ec000000-0000-7000-8000-000000000007")
USER_A = UUID("ec000000-0000-7000-8000-000000000008")
USER_B = UUID("ec000000-0000-7000-8000-000000000009")
MEMBER_A = UUID("ec000000-0000-7000-8000-000000000010")
MEMBER_B = UUID("ec000000-0000-7000-8000-000000000011")
ROLE_A = UUID("ec000000-0000-7000-8000-000000000012")
ROLE_B = UUID("ec000000-0000-7000-8000-000000000013")
GRANT_A = UUID("ec000000-0000-7000-8000-000000000014")
GRANT_B = UUID("ec000000-0000-7000-8000-000000000015")
PENDING = UUID("ec000000-0000-7000-8000-000000000016")
REJECTED = UUID("ec000000-0000-7000-8000-000000000017")
CUSTOMER_RECEIPT = UUID("ec000000-0000-7000-8000-000000000018")


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
    for table_name in (
        "core.organizations", "core.users", "core.memberships", "core.branches",
        "core.roles", "core.role_permissions", "core.access_grants",
    ):
        connection.exec_driver_sql(f"ALTER TABLE {table_name} DISABLE TRIGGER USER")
    connection.execute(
        text(
            """
            INSERT INTO core.organizations(
              id,legal_name,registered_address_line1,registered_city,
              registered_state_code,registered_postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org_a,'Evidence Org A','1 Test Road','Mumbai','27','400001','active',:member_a,:member_a),
              (:org_b,'Evidence Org B','2 Test Road','Pune','27','411001','active',:member_b,:member_b);
            INSERT INTO core.users(id,auth_user_id,display_name,status)
            VALUES (:user_a,:auth_a,'Evidence A','active'),
                   (:user_b,:auth_b,'Evidence B','active');
            INSERT INTO core.memberships(
              org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:member_a,:user_a,'active',transaction_timestamp(),:member_a,:member_a),
                   (:org_b,:member_b,:user_b,'active',transaction_timestamp(),:member_b,:member_b);
            SET CONSTRAINTS ALL IMMEDIATE;
            INSERT INTO core.branches(
              org_id,id,code,name,address_line1,city,state_code,postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org_a,:branch_a,'A','Branch A','1 Test Road','Mumbai','27','400001','active',:member_a,:member_a),
              (:org_a,:branch_a_hidden,'AH','Hidden A','2 Test Road','Mumbai','27','400002','active',:member_a,:member_a),
              (:org_b,:branch_b,'B','Branch B','3 Test Road','Pune','27','411001','active',:member_b,:member_b);
            INSERT INTO core.roles(
              org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org_a,:role_a,'evidence_a','Evidence A','active',:member_a,:member_a),
                   (:org_b,:role_b,'evidence_b','Evidence B','active',:member_b,:member_b);
            INSERT INTO core.role_permissions(
              org_id,role_id,permission_code,created_by_membership_id)
            VALUES (:org_a,:role_a,'core.attachment.manage',:member_a),
                   (:org_a,:role_a,'finance.expense.manage',:member_a),
                   (:org_a,:role_a,'finance.payment.manage',:member_a),
                   (:org_b,:role_b,'core.attachment.manage',:member_b),
                   (:org_b,:role_b,'finance.expense.manage',:member_b),
                   (:org_b,:role_b,'finance.payment.manage',:member_b);
            INSERT INTO core.access_grants(
              org_id,id,membership_id,role_id,scope_kind,branch_id,
              valid_from_at,status,created_by_membership_id)
            VALUES (:org_a,:grant_a,:member_a,:role_a,'branch',:branch_a,
                    transaction_timestamp(),'active',:member_a),
                   (:org_b,:grant_b,:member_b,:role_b,'branch',:branch_b,
                    transaction_timestamp(),'active',:member_b);
            """
        ),
        {
            "org_a": ORG_A, "org_b": ORG_B,
            "branch_a": BRANCH_A, "branch_a_hidden": BRANCH_A_HIDDEN,
            "branch_b": BRANCH_B, "auth_a": AUTH_A, "auth_b": AUTH_B,
            "user_a": USER_A, "user_b": USER_B,
            "member_a": MEMBER_A, "member_b": MEMBER_B,
            "role_a": ROLE_A, "role_b": ROLE_B,
            "grant_a": GRANT_A, "grant_b": GRANT_B,
        },
    )
    for table_name in (
        "core.organizations", "core.users", "core.memberships", "core.branches",
        "core.roles", "core.role_permissions", "core.access_grants",
    ):
        connection.exec_driver_sql(f"ALTER TABLE {table_name} ENABLE TRIGGER USER")
    connection.exec_driver_sql("RESET ROLE")


def _direct_insert_sql() -> str:
    return """
        INSERT INTO core.attachments(
          org_id,branch_id,id,storage_bucket,storage_object_path,original_filename,
          media_type,byte_size,sha256,evidence_kind,document_date,retention_until,status)
        VALUES(
          :org_id,:branch_id,:attachment_id,'canonical-evidence-private-v1',
          :object_path,'receipt.pdf','application/pdf',38,decode(:digest,'hex'),
          'expense_receipt',current_date,current_date+365,'pending_upload')
    """


def _parameters(org_id: UUID, branch_id: UUID, attachment_id: UUID, byte: str) -> dict:
    digest = byte * 64
    return {
        "org_id": org_id,
        "branch_id": branch_id,
        "attachment_id": attachment_id,
        "digest": digest,
        "object_path": f"{org_id}/{branch_id}/expense_receipt/{digest}.pdf",
    }


def _initiate(connection, parameters: dict):
    return connection.execute(
        text(
            """
            SELECT attachment_id,attachment_status,idempotency_replayed
              FROM erp_core_commands.initiate_expense_receipt_attachment(
                :org_id,:branch_id,:attachment_id,'canonical-evidence-private-v1',
                :object_path,'receipt.pdf',38,decode(:digest,'hex'),
                current_date,current_date+365
              )
            """
        ),
        parameters,
    ).one()


def _transition(connection, attachment_id: UUID, target_status: str):
    return connection.execute(
        text(
            """
            SELECT attachment_id,attachment_status,idempotency_replayed
              FROM erp_core_commands.transition_expense_receipt_attachment(
                :org_id,:branch_id,:attachment_id,:target_status
              )
            """
        ),
        {
            "org_id": ORG_A,
            "branch_id": BRANCH_A,
            "attachment_id": attachment_id,
            "target_status": target_status,
        },
    ).one()


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
            rls = connection.execute(
                text(
                    "SELECT relrowsecurity,relforcerowsecurity FROM pg_class "
                    "WHERE oid='core.attachments'::regclass"
                )
            ).one()
            assert tuple(rls) == (True, True)

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
            pending_parameters = _parameters(ORG_A, BRANCH_A, PENDING, "a")
            _expect_denied(connection, _direct_insert_sql(), pending_parameters)
            assert _initiate(connection, pending_parameters) == (
                PENDING,
                "pending_upload",
                False,
            )
            assert _initiate(connection, pending_parameters) == (
                PENDING,
                "pending_upload",
                True,
            )
            assert connection.scalar(
                text("SELECT count(*) FROM core.attachments WHERE id=:id"), {"id": PENDING}
            ) == 1
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_core_commands.initiate_expense_receipt_attachment(
                  :org_id,:branch_id,:attachment_id,'canonical-evidence-private-v1',
                  :object_path,'receipt.pdf',38,decode(:digest,'hex'),
                  current_date,current_date+365
                )
                """,
                _parameters(ORG_A, BRANCH_A_HIDDEN, REJECTED, "b"),
            )

            _expect_denied(
                connection,
                "UPDATE core.attachments SET status='verified' WHERE id=:id",
                {"id": PENDING},
            )
            assert _transition(connection, PENDING, "verified") == (
                PENDING,
                "verified",
                False,
            )
            assert _transition(connection, PENDING, "verified") == (
                PENDING,
                "verified",
                True,
            )
            assert connection.execute(
                text("SELECT status,verified_at IS NOT NULL FROM core.attachments WHERE id=:id"),
                {"id": PENDING},
            ).one() == ("verified", True)
            _expect_denied(
                connection,
                "UPDATE core.attachments SET original_filename='changed.pdf' WHERE id=:id",
                {"id": PENDING},
            )
            _expect_denied(
                connection, "DELETE FROM core.attachments WHERE id=:id", {"id": PENDING}
            )

            rejected_parameters = _parameters(ORG_A, BRANCH_A, REJECTED, "b")
            assert _initiate(connection, rejected_parameters) == (
                REJECTED,
                "pending_upload",
                False,
            )
            assert _transition(connection, REJECTED, "rejected") == (
                REJECTED,
                "rejected",
                False,
            )
            assert connection.scalar(
                text("SELECT status FROM core.attachments WHERE id=:id"), {"id": REJECTED}
            ) == "rejected"

            customer_digest = "c" * 64
            customer_parameters = {
                "org_id": ORG_A, "branch_id": BRANCH_A,
                "attachment_id": CUSTOMER_RECEIPT, "digest": customer_digest,
                "object_path": (
                    f"{ORG_A}/{BRANCH_A}/customer_receipt_evidence/"
                    f"{customer_digest}.pdf"
                ),
            }
            assert connection.execute(text("""
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.initiate_customer_receipt_attachment(
                    :org_id,:branch_id,:attachment_id,'canonical-evidence-private-v1',
                    :object_path,'customer-receipt.pdf',38,decode(:digest,'hex'),
                    current_date,current_date+365
                  )
            """), customer_parameters).one() == (
                CUSTOMER_RECEIPT, "pending_upload", False,
            )
            assert connection.execute(text("""
                SELECT attachment_id,attachment_status,idempotency_replayed
                  FROM erp_core_commands.transition_customer_receipt_attachment(
                    :org_id,:branch_id,:attachment_id,'verified'
                  )
            """), customer_parameters).one() == (
                CUSTOMER_RECEIPT, "verified", False,
            )
            assert connection.execute(text("""
                SELECT evidence_kind,status,verified_at IS NOT NULL
                  FROM core.attachments WHERE id=:attachment_id
            """), customer_parameters).one() == (
                "customer_receipt_evidence", "verified", True,
            )
            hidden_customer = dict(customer_parameters)
            hidden_customer.update({
                "branch_id": BRANCH_A_HIDDEN,
                "attachment_id": UUID("ec000000-0000-7000-8000-000000000019"),
                "object_path": (
                    f"{ORG_A}/{BRANCH_A_HIDDEN}/customer_receipt_evidence/"
                    f"{customer_digest}.pdf"
                ),
            })
            _expect_denied(connection, """
                SELECT * FROM erp_core_commands.initiate_customer_receipt_attachment(
                  :org_id,:branch_id,:attachment_id,'canonical-evidence-private-v1',
                  :object_path,'customer-receipt.pdf',38,decode(:digest,'hex'),
                  current_date,current_date+365
                )
            """, hidden_customer)

            _expect_denied(
                connection,
                "UPDATE core.attachments SET legal_hold=true WHERE id=:id",
                {"id": PENDING},
            )

            connection.execute(
                text("SELECT erp_security.activate_context(:auth,:org)"),
                {"auth": AUTH_B, "org": ORG_B},
            )
            assert connection.scalar(
                text("SELECT count(*) FROM core.attachments WHERE id=:id"), {"id": PENDING}
            ) == 0
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_core_commands.initiate_expense_receipt_attachment(
                  :org_id,:branch_id,:attachment_id,'canonical-evidence-private-v1',
                  :object_path,'receipt.pdf',38,decode(:digest,'hex'),
                  current_date,current_date+365
                )
                """,
                _parameters(ORG_A, BRANCH_A, PENDING, "d"),
            )
        finally:
            transaction.rollback()
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            engine.dispose()


if __name__ == "__main__":
    main()
