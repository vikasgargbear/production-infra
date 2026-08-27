"""Exercise sales address readback from immutable command request evidence."""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Optional
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.api.routes.internal.mcp_canonical_reads import CanonicalDelegation
from app.api.routes.internal.mcp_canonical_resolution_reads import (
    canonical_sales_invoice_get,
    canonical_sales_order_get,
)
from app.api.routes.internal.mcp_contract import PLANNED_RESOLUTION_READ_POLICIES


ORG = UUID("f0250000-0000-7000-8000-000000000001")
OTHER_ORG = UUID("f0250000-0000-7000-8000-000000000002")
AUTH = UUID("f0250000-0000-7000-8000-000000000003")
USER = UUID("f0250000-0000-7000-8000-000000000004")
MEMBERSHIP = UUID("f0250000-0000-7000-8000-000000000005")
BRANCH = UUID("f0250000-0000-7000-8000-000000000006")
OTHER_BRANCH = UUID("f0250000-0000-7000-8000-000000000007")
ROLE = UUID("f0250000-0000-7000-8000-000000000008")
ACCESS_GRANT = UUID("f0250000-0000-7000-8000-000000000009")
AGENT_GRANT = UUID("f0250000-0000-7000-8000-000000000010")
CUSTOMER = UUID("f0250000-0000-7000-8000-000000000011")
ADDRESS = UUID("f0250000-0000-7000-8000-000000000012")
ORDER = UUID("f0250000-0000-7000-8000-000000000013")
INVOICE = UUID("f0250000-0000-7000-8000-000000000014")
OTHER_ORDER = UUID("f0250000-0000-7000-8000-000000000015")
OTHER_INVOICE = UUID("f0250000-0000-7000-8000-000000000016")
ORDER_COMMAND = UUID("f0250000-0000-7000-8000-000000000017")
INVOICE_COMMAND = UUID("f0250000-0000-7000-8000-000000000018")
INVOICE_LINE = UUID("f0250000-0000-7000-8000-000000000019")
INVENTORY_LINE = UUID("f0250000-0000-7000-8000-000000000020")
OTHER_INVENTORY_LINE = UUID("f0250000-0000-7000-8000-000000000021")
BATCH = UUID("f0250000-0000-7000-8000-000000000022")
DUPLICATE_COMMAND = UUID("f0250000-0000-7000-8000-000000000023")
DUPLICATE_LINE_INVOICE = UUID("f0250000-0000-7000-8000-000000000024")
DUPLICATE_COMMAND_INVOICE = UUID("f0250000-0000-7000-8000-000000000025")
SECOND_DUPLICATE_COMMAND = UUID("f0250000-0000-7000-8000-000000000026")


def _context(operation: str) -> CanonicalDelegation:
    return CanonicalDelegation(
        auth_user_id=AUTH,
        user_id=USER,
        organization_id=ORG,
        membership_id=MEMBERSHIP,
        agent_grant_id=AGENT_GRANT,
        client_id="pg15-address-evidence",
        policy=PLANNED_RESOLUTION_READ_POLICIES[operation],
        branch_id=BRANCH,
        allow_sensitive_read=False,
    )


def _expect_insufficient_privilege(
    session: Session, statement: str, params: Optional[dict] = None
) -> None:
    try:
        with session.begin_nested():
            session.execute(text(statement), params or {})
    except DBAPIError as exc:
        assert getattr(exc.orig, "pgcode", None) == "42501"
    else:
        raise AssertionError("erp_runtime retained forbidden raw command-table access")


def _seed(session: Session) -> date:
    business_date = session.scalar(text("SELECT CURRENT_DATE"))
    assert isinstance(business_date, date)
    session.execute(text("SET LOCAL session_replication_role=replica"))
    session.execute(text("INSERT INTO auth.users(id) VALUES (:auth)"), {"auth": AUTH})
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(
        text(
            """
            INSERT INTO core.organizations(
              id,legal_name,registered_address_line1,registered_city,
              registered_state_code,registered_postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,'Address Evidence','1 Test Road','Mumbai','27','400001','active',:member,:member),
              (:other_org,'Other Evidence','2 Test Road','Pune','27','411001','active',:member,:member);
            INSERT INTO core.users(id,auth_user_id,display_name,status)
            VALUES(:user,:auth,'Address Reader','active');
            INSERT INTO core.memberships(
              org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:member,:user,'active',transaction_timestamp(),:member,:member);
            INSERT INTO core.branches(
              org_id,id,code,name,address_line1,city,state_code,postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:branch,'MAIN','Main','1 Test Road','Mumbai','27','400001','active',:member,:member),
              (:other_org,:other_branch,'OTHER','Other','2 Test Road','Pune','27','411001','active',:member,:member);
            INSERT INTO core.roles(
              org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
            VALUES(:org,:role,'address_reader','Address Reader','active',:member,:member);
            INSERT INTO core.access_grants(
              org_id,id,membership_id,role_id,scope_kind,branch_id,valid_from_at,status,
              created_by_membership_id)
            VALUES(:org,:access_grant,:member,:role,'branch',:branch,
                   transaction_timestamp(),'active',:member);
            """
        ),
        {
            "org": ORG, "other_org": OTHER_ORG, "auth": AUTH, "user": USER,
            "member": MEMBERSHIP, "branch": BRANCH, "other_branch": OTHER_BRANCH,
            "role": ROLE, "access_grant": ACCESS_GRANT,
        },
    )
    session.execute(
        text(
            """
            INSERT INTO sales.orders(
              org_id,id,branch_id,customer_account_id,order_number,fiscal_year,order_date,
              requested_delivery_date,status,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
              billing_address_id,shipping_address_id,currency_code,
              calculation_ruleset_version,document_discount_kind,document_discount_basis,
              document_discount_value,rounding_policy,approved_at,approved_by_membership_id,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:order,:branch,:customer,'SO-RLS',2026,:business_date,:business_date,'approved',
               'intra_state','not_applicable','normal',:address,:address,'INR','test-v1',
               'none','price_value',0,'none',transaction_timestamp(),:member,:member,:member),
              (:other_org,:other_order,:other_branch,:customer,'SO-OTHER',2026,
               :business_date,:business_date,
               'approved','intra_state','not_applicable','normal',:address,:address,'INR',
               'test-v1','none','price_value',0,'none',transaction_timestamp(),:member,:member,:member);
            INSERT INTO sales.invoices(
              org_id,id,branch_id,customer_account_id,seller_tax_registration_id,
              invoice_number,fiscal_year,invoice_date,invoice_type,status,supply_type,
              zero_rated_payment_mode,tax_charge_mechanism,place_of_supply_state_code,
              calculation_ruleset_version,document_discount_kind,document_discount_basis,
              document_discount_value,seller_legal_name_snapshot,seller_gstin_snapshot,
              seller_address_snapshot,buyer_legal_name_snapshot,buyer_address_snapshot,
              currency_code,rounding_policy,posted_at,posted_by_membership_id,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:invoice,:branch,:customer,:address,'INV-RLS',2026,CURRENT_DATE,
               'tax_invoice','posted','intra_state','not_applicable','normal','27','test-v1',
               'none','price_value',0,'Seller','27ABCDE1234F1Z5','Seller Address','Buyer',
               'Buyer Address','INR','none',transaction_timestamp(),:member,:member,:member),
              (:other_org,:other_invoice,:other_branch,:customer,:address,'INV-OTHER',2026,
               CURRENT_DATE,'tax_invoice','posted','intra_state','not_applicable','normal','27',
               'test-v1','none','price_value',0,'Seller','27ABCDE1234F1Z5','Seller Address',
               'Buyer','Buyer Address','INR','none',transaction_timestamp(),:member,:member,:member);
            """
        ),
        {
            "org": ORG, "other_org": OTHER_ORG, "order": ORDER,
            "other_order": OTHER_ORDER, "invoice": INVOICE,
            "other_invoice": OTHER_INVOICE, "branch": BRANCH,
            "other_branch": OTHER_BRANCH, "customer": CUSTOMER,
            "address": ADDRESS, "member": MEMBERSHIP,
            "business_date": business_date,
        },
    )
    for command_id, resource_id, capability, operation, resource_type in (
        (ORDER_COMMAND, ORDER, "sales.order.prepare", "sales.order.approve", "sales_order"),
        (INVOICE_COMMAND, INVOICE, "sales.invoice.prepare", "sales.invoice.post", "sales_invoice"),
        (
            DUPLICATE_COMMAND,
            DUPLICATE_LINE_INVOICE,
            "sales.invoice.prepare",
            "sales.invoice.post",
            "sales_invoice",
        ),
        (
            UUID("f0250000-0000-7000-8000-000000000027"),
            DUPLICATE_COMMAND_INVOICE,
            "sales.invoice.prepare",
            "sales.invoice.post",
            "sales_invoice",
        ),
        (
            SECOND_DUPLICATE_COMMAND,
            DUPLICATE_COMMAND_INVOICE,
            "sales.invoice.prepare",
            "sales.invoice.post",
            "sales_invoice",
        ),
    ):
        session.execute(
            text(
                """
                WITH evidence AS (
                  SELECT pg_catalog.convert_to(CAST(:document AS jsonb)::text,'UTF8')
                           AS request_bytes,
                    pg_catalog.convert_to('{}','UTF8') AS response_bytes
                )
                INSERT INTO automation.command_requests(
                  org_id,id,agent_grant_id,requested_by_membership_id,capability_code,
                  operation,operation_mode,branch_id,requested_amount,currency_code,
                  target_resource_type,target_resource_id,target_row_version,
                  serializer_version,idempotency_key_hash,request_media_type,request_bytes,
                  request_hash,preview_media_type,preview_bytes,preview_hash,
                  aggregate_version_hash,risk_class,approval_policy,required_approval_count,
                  status,expires_at,execution_started_at,completed_at,result_resource_type,
                  result_resource_id,response_status,response_media_type,response_bytes,response_hash)
                SELECT :org,:command,:agent_grant,:member,:capability,:operation,'write',
                       :branch,0,'INR',:resource_type,:resource,1,'test-v1',
                       :idempotency_key_hash,'application/json',request_bytes,
                       pg_catalog.sha256(request_bytes),'application/json',response_bytes,
                       pg_catalog.sha256(response_bytes),decode(repeat('26',32),'hex'),
                       'consequential_write','actor_confirmation',1,'succeeded',
                       transaction_timestamp()+interval '1 hour',transaction_timestamp(),
                       transaction_timestamp(),:resource_type,:resource,200,'application/json',
                       response_bytes,pg_catalog.sha256(response_bytes)
                  FROM evidence
                """
            ),
            {
                "org": ORG, "command": command_id, "agent_grant": AGENT_GRANT,
                "member": MEMBERSHIP, "capability": capability,
                "operation": operation, "branch": BRANCH,
                "resource_type": resource_type, "resource": resource_id,
                "idempotency_key_hash": command_id.bytes * 2,
                "document": json.dumps(
                    {
                        "delivery_address_id": str(ADDRESS),
                        "delivery_address_row_version": "7",
                        "lines": [
                            {
                                "line_id": str(INVOICE_LINE),
                                "fulfillment_source": "direct_issue",
                                "batch_allocations": [
                                    {
                                        "inventory_line_id": str(inventory_line),
                                        "batch_id": str(BATCH),
                                        "billed_quantity": "1.000000",
                                        "free_quantity": "0",
                                    }
                                ],
                            }
                            for inventory_line in (
                                (INVENTORY_LINE, OTHER_INVENTORY_LINE)
                                if resource_id == DUPLICATE_LINE_INVOICE
                                else (INVENTORY_LINE,)
                            )
                        ],
                    }
                    if resource_type == "sales_invoice"
                    else {
                        "delivery_address_id": str(ADDRESS),
                        "delivery_address_row_version": "7",
                        "order_date": business_date.isoformat(),
                        "requested_delivery_date": business_date.isoformat(),
                    },
                    separators=(",", ":"),
                    sort_keys=True,
                ),
            },
        )
    session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    session.execute(text("RESET ROLE"))
    session.execute(text("SET LOCAL session_replication_role=origin"))
    return business_date


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            transaction = session.begin()
            try:
                assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
                business_date = _seed(session)
                session.execute(text('SET SESSION AUTHORIZATION "erp_runtime"'))
                session.execute(
                    text("SELECT erp_security.activate_context(:auth,:org)"),
                    {"auth": AUTH, "org": ORG},
                )

                authority = session.execute(
                    text(
                        """
                        SELECT id, capability_code, operation, branch_id,
                               destination_branch_id,
                               target_resource_id, result_resource_id
                          FROM erp_automation_reads.command_authority_context(
                               :org_id, :command_request_id)
                        """
                    ),
                    {"org_id": ORG, "command_request_id": INVOICE_COMMAND},
                ).one()
                assert tuple(authority) == (
                    INVOICE_COMMAND,
                    "sales.invoice.prepare",
                    "sales.invoice.post",
                    BRANCH,
                    None,
                    INVOICE,
                    INVOICE,
                )
                for statement in (
                    "SELECT id FROM automation.command_requests WHERE false",
                    "UPDATE automation.command_requests SET status=status WHERE false",
                    "INSERT INTO automation.command_requests "
                    "SELECT * FROM automation.command_requests WHERE false",
                ):
                    _expect_insufficient_privilege(session, statement)
                _expect_insufficient_privilege(
                    session,
                    "SELECT * FROM erp_automation_reads.command_authority_context("
                    ":org_id, :command_request_id)",
                    {"org_id": OTHER_ORG, "command_request_id": INVOICE_COMMAND},
                )

                order = canonical_sales_order_get(
                    ORDER, None, None, _context("sales.orders.get"), session
                ).document
                assert order is not None
                assert order.order_date == business_date
                assert order.requested_delivery_date == business_date
                assert order.delivery_address_id == ADDRESS
                assert order.delivery_address_row_version == 7

                invoice = canonical_sales_invoice_get(
                    INVOICE, None, None, _context("sales.invoices.get"), session
                ).document
                assert invoice is not None
                assert invoice.delivery_address_id == ADDRESS
                assert invoice.delivery_address_row_version == 7

                direct_issue_sql = text(
                    """
                    SELECT command_request_id, invoice_line_id,
                           inventory_document_line_id, batch_id,
                           billed_quantity, free_quantity,
                           evidenced_allocation_count
                      FROM erp_automation_reads.sales_invoice_direct_issue_provenance(
                           :org_id, :branch_id, :invoice_id)
                    """
                )
                direct_issue = session.execute(
                    direct_issue_sql,
                    {"org_id": ORG, "branch_id": BRANCH, "invoice_id": INVOICE},
                ).one()
                assert tuple(direct_issue[:4]) == (
                    INVOICE_COMMAND, INVOICE_LINE, INVENTORY_LINE, BATCH
                )
                assert tuple(str(value) for value in direct_issue[4:6]) == (
                    "1.000000", "0.000000"
                )
                assert direct_issue.evidenced_allocation_count == 1
                assert session.execute(
                    direct_issue_sql,
                    {"org_id": OTHER_ORG, "branch_id": BRANCH, "invoice_id": INVOICE},
                ).fetchall() == []

                assert session.execute(
                    direct_issue_sql,
                    {
                        "org_id": ORG,
                        "branch_id": BRANCH,
                        "invoice_id": DUPLICATE_LINE_INVOICE,
                    },
                ).fetchall() == []
                assert session.execute(
                    direct_issue_sql,
                    {
                        "org_id": ORG,
                        "branch_id": BRANCH,
                        "invoice_id": DUPLICATE_COMMAND_INVOICE,
                    },
                ).fetchall() == []

                assert canonical_sales_order_get(
                    OTHER_ORDER, None, None, _context("sales.orders.get"), session
                ).match_state == "not_found"
                assert canonical_sales_invoice_get(
                    OTHER_INVOICE, None, None, _context("sales.invoices.get"), session
                ).match_state == "not_found"
            finally:
                transaction.rollback()
                session.execute(text("RESET SESSION AUTHORIZATION"))
                session.commit()
    finally:
        engine.dispose()
    print("Canonical sales address evidence runtime-role acceptance passed")


if __name__ == "__main__":
    main()
