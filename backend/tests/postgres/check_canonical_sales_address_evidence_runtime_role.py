"""Exercise sales address readback from immutable command request evidence."""

from __future__ import annotations

import os
from uuid import UUID

from sqlalchemy import create_engine, text
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


def _seed(session: Session) -> None:
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
              status,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
              billing_address_id,shipping_address_id,currency_code,
              calculation_ruleset_version,document_discount_kind,document_discount_basis,
              document_discount_value,rounding_policy,approved_at,approved_by_membership_id,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:order,:branch,:customer,'SO-RLS',2026,CURRENT_DATE,'approved',
               'intra_state','not_applicable','normal',:address,:address,'INR','test-v1',
               'none','price_value',0,'none',transaction_timestamp(),:member,:member,:member),
              (:other_org,:other_order,:other_branch,:customer,'SO-OTHER',2026,CURRENT_DATE,
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
        },
    )
    for command_id, resource_id, capability, operation, resource_type in (
        (ORDER_COMMAND, ORDER, "sales.order.prepare", "sales.order.approve", "sales_order"),
        (INVOICE_COMMAND, INVOICE, "sales.invoice.prepare", "sales.invoice.post", "sales_invoice"),
    ):
        session.execute(
            text(
                """
                WITH evidence AS (
                  SELECT pg_catalog.convert_to(pg_catalog.jsonb_build_object(
                    'delivery_address_id',CAST(:address AS text),
                    'delivery_address_row_version','7')::text,'UTF8') AS request_bytes,
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
                       decode(repeat('25',32),'hex'),'application/json',request_bytes,
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
                "address": ADDRESS,
            },
        )
    session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    session.execute(text("RESET ROLE"))
    session.execute(text("SET LOCAL session_replication_role=origin"))


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with Session(engine) as session:
            transaction = session.begin()
            try:
                assert int(session.scalar(text("SHOW server_version_num"))) // 10000 == 15
                _seed(session)
                session.execute(text('SET SESSION AUTHORIZATION "erp_runtime"'))
                session.execute(
                    text("SELECT erp_security.activate_context(:auth,:org)"),
                    {"auth": AUTH, "org": ORG},
                )

                order = canonical_sales_order_get(
                    ORDER, None, None, _context("sales.orders.get"), session
                ).document
                assert order is not None
                assert order.delivery_address_id == ADDRESS
                assert order.delivery_address_row_version == 7

                invoice = canonical_sales_invoice_get(
                    INVOICE, None, None, _context("sales.invoices.get"), session
                ).document
                assert invoice is not None
                assert invoice.delivery_address_id == ADDRESS
                assert invoice.delivery_address_row_version == 7

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
