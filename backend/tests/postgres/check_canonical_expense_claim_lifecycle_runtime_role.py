"""Execute the verified-receipt expense-claim lifecycle as ``erp_runtime``.

The fixture seeds only authority/reference facts as the migration owner. Claimant
prepare, independent approval, posting, replay, and authoritative evidence reads
all run with the real restricted runtime principal and are rolled back together.
"""

from __future__ import annotations

import os
import inspect
from decimal import Decimal
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes import web_operator_actions
from app.api.routes.internal import mcp_actions
from app.domain.operator_actions.contract import ACTION_POLICIES
from app.domain.operator_actions.models import ActionContext, ActionErrorCode, OperatorActionError
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService
from app.infrastructure.operator_actions.expense_claim import READBACK_EXPENSE_CLAIM_SQL


ORG = UUID("ee000000-0000-7000-8000-000000000001")
BRANCH = UUID("ee000000-0000-7000-8000-000000000002")
CLAIMANT = UUID("ee000000-0000-7000-8000-000000000003")
CLAIMANT_USER = UUID("ee000000-0000-7000-8000-000000000004")
CLAIMANT_AUTH = UUID("ee000000-0000-7000-8000-000000000005")
APPROVER = UUID("ee000000-0000-7000-8000-000000000006")
APPROVER_USER = UUID("ee000000-0000-7000-8000-000000000007")
APPROVER_AUTH = UUID("ee000000-0000-7000-8000-000000000008")
CLAIMANT_GRANT = UUID("ee000000-0000-7000-8000-000000000009")
APPROVER_GRANT = UUID("ee000000-0000-7000-8000-000000000010")
EXPENSE_ACCOUNT = UUID("ee000000-0000-7000-8000-000000000011")
REIMBURSEMENT_ACCOUNT = UUID("ee000000-0000-7000-8000-000000000012")
RECEIPT = UUID("ee000000-0000-7000-8000-000000000013")
UNVERIFIED_RECEIPT = UUID("ee000000-0000-7000-8000-000000000014")
CROSS_BRANCH = UUID("ee000000-0000-7000-8000-000000000030")
CROSS_BRANCH_RECEIPT = UUID("ee000000-0000-7000-8000-000000000031")
OTHER_ORG = UUID("ef000000-0000-7000-8000-000000000001")

TABLES_WITH_USER_TRIGGERS = (
    "core.permissions", "core.organizations", "core.users", "core.memberships",
    "core.branches", "core.roles", "core.role_permissions", "core.access_grants",
    "core.document_sequences", "core.attachments", "automation.agent_grants",
    "automation.agent_grant_capabilities", "finance.accounts",
)


def _seed(session: Session) -> None:
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(
        text("INSERT INTO auth.users(id) VALUES (:claimant_auth),(:approver_auth)"),
        {"claimant_auth": CLAIMANT_AUTH, "approver_auth": APPROVER_AUTH},
    )
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(
        text("""
            SELECT set_config('app.org_id',:org,true),
                   set_config('app.membership_id',:claimant,true),
                   set_config('app.request_id','ee000000-0000-7000-8000-000000000099',true)
        """),
        {"org": str(ORG), "claimant": str(CLAIMANT)},
    )
    for table_name in TABLES_WITH_USER_TRIGGERS:
        session.execute(text(f"ALTER TABLE {table_name} DISABLE TRIGGER USER"))
    session.execute(
        text("""
            INSERT INTO core.organizations(
              id,legal_name,registered_address_line1,registered_city,registered_state_code,
              registered_postal_code,status,created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,'Expense Claim Lifecycle Org','1 Test Road','Mumbai','27','400001','active',:claimant,:claimant),
              (:other_org,'Hidden Expense Org','2 Hidden Road','Pune','27','411001','active',:other_member,:other_member);
            INSERT INTO core.users(id,auth_user_id,display_name,status)
            VALUES (:claimant_user,:claimant_auth,'Expense Claimant','active'),
                   (:approver_user,:approver_auth,'Expense Approver','active'),
                   (:other_user,NULL,'Hidden Member','active');
            INSERT INTO core.memberships(
              org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:claimant,:claimant_user,'active',transaction_timestamp(),:claimant,:claimant),
                   (:org,:approver,:approver_user,'active',transaction_timestamp(),:approver,:approver),
                   (:other_org,:other_member,:other_user,'active',transaction_timestamp(),:other_member,:other_member);
            SET CONSTRAINTS ALL IMMEDIATE;

            INSERT INTO core.permissions(code,domain,action,risk_class,description,status)
            VALUES
              ('finance.expense.manage','finance','expense.manage','consequential_write','Manage exact expense claims','active'),
              ('finance.journal.post','finance','journal.post','consequential_write','Post exact journals','active'),
              ('automation.command.approve','automation','command.approve','consequential_write','Approve exact commands','active'),
              ('automation.command.execute','automation','command.execute','consequential_write','Execute exact commands','active')
            ON CONFLICT (code) DO NOTHING;
            INSERT INTO core.branches(
              org_id,id,code,name,address_line1,city,state_code,postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:branch,'EXP-LIFE','Expense Lifecycle','1 Test Road','Mumbai','27','400001','active',:claimant,:claimant),
              (:org,:cross_branch,'EXP-OTHER','Other Expense Branch','2 Test Road','Mumbai','27','400002','active',:claimant,:claimant);
            INSERT INTO core.roles(org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:claimant_role,'expense_claimant','Expense Claimant','active',:claimant,:claimant),
                   (:org,:approver_role,'expense_approver','Expense Approver','active',:approver,:approver);
            INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
            SELECT :org,:claimant_role,permission_code,:claimant FROM unnest(ARRAY[
              'finance.expense.manage','finance.journal.post','automation.command.approve','automation.command.execute'
            ]::text[]) permission_code;
            INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
            SELECT :org,:approver_role,permission_code,:approver FROM unnest(ARRAY[
              'finance.expense.manage','automation.command.approve'
            ]::text[]) permission_code;
            INSERT INTO core.access_grants(
              org_id,id,membership_id,role_id,scope_kind,valid_from_at,status,created_by_membership_id)
            VALUES (:org,:claimant_access,:claimant,:claimant_role,'organization',transaction_timestamp(),'active',:claimant),
                   (:org,:approver_access,:approver,:approver_role,'organization',transaction_timestamp(),'active',:approver);

            INSERT INTO automation.agent_grants(
              org_id,id,subject_membership_id,client_id,client_display_name,authorization_mode,
              consent_version,consent_text_hash,consented_by_membership_id,consented_at,
              granted_by_membership_id,granted_at,expires_at,status,created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:claimant_grant,:claimant,'expense-claim-lifecycle','Expense Claim Lifecycle','self_consent',
               'v1',decode(repeat('61',32),'hex'),:claimant,transaction_timestamp(),:claimant,
               transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:claimant,:claimant),
              (:org,:approver_grant,:approver,'expense-approval-lifecycle','Expense Approval Lifecycle','self_consent',
               'v1',decode(repeat('62',32),'hex'),:approver,transaction_timestamp(),:approver,
               transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:approver,:approver);
            INSERT INTO automation.agent_grant_capabilities(
              org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,
              maximum_amount,currency_code,created_by_membership_id)
            VALUES
              (:org,:claimant_grant,'finance.expense_claim.prepare','write','consequential_write','separate_approver',1000,'INR',:claimant),
              (:org,:claimant_grant,'automation.command.approve','write','consequential_write','actor_confirmation',NULL,NULL,:claimant),
              (:org,:claimant_grant,'automation.command.execute','write','consequential_write','actor_confirmation',NULL,NULL,:claimant),
              (:org,:approver_grant,'automation.command.approve','write','consequential_write','actor_confirmation',NULL,NULL,:approver);

            INSERT INTO core.document_sequences(
              org_id,id,branch_id,document_type,fiscal_year_start,prefix,padding,next_value,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:claim_sequence,:branch,'expense_claim',
               make_date(CASE WHEN extract(month from current_date)>=4 THEN extract(year from current_date)::int ELSE extract(year from current_date)::int-1 END,4,1),
               'EXP-',5,1,'active',:claimant,:claimant),
              (:org,:journal_sequence,:branch,'journal_entry',
               make_date(CASE WHEN extract(month from current_date)>=4 THEN extract(year from current_date)::int ELSE extract(year from current_date)::int-1 END,4,1),
               'JRN-',5,1,'active',:claimant,:claimant);
            INSERT INTO finance.accounts(
              org_id,id,code,name,account_type,currency_code,allows_party_posting,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:expense_account,'6100','Employee Travel Expense','expense','INR',false,'active',:claimant,:claimant),
                   (:org,:reimbursement_account,'2200','Member Reimbursements Payable','liability','INR',false,'active',:claimant,:claimant);
            INSERT INTO core.attachments(
              org_id,branch_id,id,storage_bucket,storage_object_path,original_filename,media_type,byte_size,
              sha256,evidence_kind,document_date,retention_until,status,verified_at,created_by_membership_id)
            VALUES
              (:org,:branch,:receipt,'evidence','expense/verified-receipt.pdf','receipt.pdf','application/pdf',1680,
               decode(repeat('71',32),'hex'),'expense_receipt',:business_date,:business_date+3650,'verified',transaction_timestamp(),:claimant),
              (:org,:branch,:unverified_receipt,'evidence','expense/pending-receipt.pdf','pending.pdf','application/pdf',1680,
               decode(repeat('72',32),'hex'),'expense_receipt',:business_date,:business_date+3650,'pending_upload',NULL,:claimant),
              (:org,:cross_branch,:cross_branch_receipt,'evidence','expense/cross-branch-receipt.pdf','cross-branch.pdf','application/pdf',1680,
               decode(repeat('73',32),'hex'),'expense_receipt',:business_date,:business_date+3650,'verified',transaction_timestamp(),:claimant);
        """),
        {
            "org": ORG, "other_org": OTHER_ORG, "branch": BRANCH,
            "cross_branch": CROSS_BRANCH,
            "claimant": CLAIMANT, "claimant_user": CLAIMANT_USER, "claimant_auth": CLAIMANT_AUTH,
            "approver": APPROVER, "approver_user": APPROVER_USER, "approver_auth": APPROVER_AUTH,
            "other_member": UUID("ef000000-0000-7000-8000-000000000002"),
            "other_user": UUID("ef000000-0000-7000-8000-000000000003"),
            "claimant_role": UUID("ee000000-0000-7000-8000-000000000015"),
            "approver_role": UUID("ee000000-0000-7000-8000-000000000016"),
            "claimant_access": UUID("ee000000-0000-7000-8000-000000000017"),
            "approver_access": UUID("ee000000-0000-7000-8000-000000000018"),
            "claimant_grant": CLAIMANT_GRANT, "approver_grant": APPROVER_GRANT,
            "claim_sequence": UUID("ee000000-0000-7000-8000-000000000019"),
            "journal_sequence": UUID("ee000000-0000-7000-8000-000000000020"),
            "expense_account": EXPENSE_ACCOUNT, "reimbursement_account": REIMBURSEMENT_ACCOUNT,
            "receipt": RECEIPT, "unverified_receipt": UNVERIFIED_RECEIPT,
            "cross_branch_receipt": CROSS_BRANCH_RECEIPT,
            "business_date": session.scalar(text(
                "SELECT (transaction_timestamp() AT TIME ZONE 'Asia/Kolkata')::date"
            )),
        },
    )
    for table_name in TABLES_WITH_USER_TRIGGERS:
        session.execute(text(f"ALTER TABLE {table_name} ENABLE TRIGGER USER"))
    session.execute(text("RESET ROLE"))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))


def _context(*, approver: bool = False) -> ActionContext:
    return ActionContext(
        auth_user_id=APPROVER_AUTH if approver else CLAIMANT_AUTH,
        user_id=APPROVER_USER if approver else CLAIMANT_USER,
        organization_id=ORG,
        membership_id=APPROVER if approver else CLAIMANT,
        agent_grant_id=APPROVER_GRANT if approver else CLAIMANT_GRANT,
        client_id="expense-approval-lifecycle" if approver else "expense-claim-lifecycle",
        operation_key="automation.command.approve" if approver else "finance.expense_claim.prepare",
        permission="automation.command.approve" if approver else "finance.expense.manage",
        branch_ids=(),
        organization_scope=True,
    )


def _payload(business_date, receipt_id: UUID = RECEIPT) -> dict:
    return {
        "branch_id": BRANCH,
        "claim_date": business_date,
        "period_start": business_date,
        "period_end": business_date,
        "purpose": "Verified customer-site travel reimbursement",
        "reimbursement_account_id": REIMBURSEMENT_ACCOUNT,
        "tax_treatment": "non_creditable_gross_expense",
        "lines": [{
            "expense_date": business_date,
            "expense_account_id": EXPENSE_ACCOUNT,
            "description": "Local transport to customer site",
            "merchant_name": "Verified Taxi Operator",
            "receipt_attachment_id": receipt_id,
            "claimed_amount": "168.00",
        }],
    }


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                seed_sessions = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")
                with seed_sessions.begin() as seed_session:
                    _seed(seed_session)
                business_date = connection.scalar(text(
                    "SELECT (transaction_timestamp() AT TIME ZONE timezone)::date FROM core.organizations WHERE id=:org"
                ), {"org": ORG})

                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                principal = connection.execute(text(
                    "SELECT session_user,current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"
                )).one()
                assert tuple(principal) == ("erp_runtime", "erp_runtime", False, False)
                runtime_sessions = sessionmaker(
                    bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
                )
                service = SqlAlchemyOperatorActionService(runtime_sessions, runtime_principal_configured=True)

                prepared = service.prepare(
                    policy=ACTION_POLICIES["finance.expense_claim.prepare"],
                    payload=_payload(business_date), idempotency_key="pg15-expense-prepare",
                    context=_context(),
                )
                assert prepared.command_type == "finance.expense_claim.post"
                assert prepared.financial_impact[-1]["amount"] == "168.00"

                try:
                    service.approve(
                        command_request_id=prepared.command_request_id,
                        preview_hash=prepared.preview_hash,
                        idempotency_key="pg15-expense-self-approval",
                        context=_context(),
                    )
                except OperatorActionError as error:
                    assert error.code is ActionErrorCode.SCOPE_DENIED
                else:
                    raise AssertionError("claimant approved their own expense claim")

                approved = service.approve(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-expense-independent-approval",
                    context=_context(approver=True),
                )
                assert approved.status == "approved"
                executed = service.execute(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-expense-execute", context=_context(),
                )
                assert executed.status == "succeeded"
                assert executed.resource_type == "expense_claim"
                assert executed.idempotency_replayed is False
                replayed = service.execute(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-expense-execute-replay", context=_context(),
                )
                assert replayed.resource_id == executed.resource_id
                assert replayed.idempotency_replayed is True

                with runtime_sessions() as session, session.begin():
                    claim = session.execute(text("""
                        SELECT status,claimant_membership_id,approved_by_membership_id,
                               claimed_amount,approved_amount
                          FROM finance.expense_claims WHERE org_id=:org AND id=:claim
                    """), {"org": ORG, "claim": executed.resource_id}).one()
                    assert tuple(claim) == ("posted", CLAIMANT, APPROVER, Decimal("168.00"), Decimal("168.00"))
                    lines = session.execute(text("""
                        SELECT line.claimed_amount,line.approved_amount,line.receipt_attachment_id
                          FROM finance.expense_claim_lines line
                         WHERE line.org_id=:org AND line.expense_claim_id=:claim
                    """), {"org": ORG, "claim": executed.resource_id}).all()
                    assert [tuple(row) for row in lines] == [(Decimal("168.00"), Decimal("168.00"), RECEIPT)]
                    journal = session.execute(text("""
                        SELECT journal.status,journal.transaction_debit_total,journal.transaction_credit_total,
                               sum(line.transaction_debit),sum(line.transaction_credit)
                          FROM finance.accounting_events event
                          JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
                          JOIN finance.journal_lines line ON line.org_id=journal.org_id AND line.journal_entry_id=journal.id
                         WHERE event.org_id=:org AND event.expense_claim_id=:claim AND event.event_type='expense_claim'
                         GROUP BY journal.status,journal.transaction_debit_total,journal.transaction_credit_total
                    """), {"org": ORG, "claim": executed.resource_id}).one()
                    assert tuple(journal) == ("posted", Decimal("168.00"), Decimal("168.00"), Decimal("168.00"), Decimal("168.00"))
                    assert session.scalar(text(
                        "SELECT count(*) FROM finance.accounting_events WHERE org_id=:org AND expense_claim_id=:claim"
                    ), {"org": ORG, "claim": executed.resource_id}) == 1
                    assert session.scalar(text(
                        "SELECT count(*) FROM core.organizations WHERE id=:other_org"
                    ), {"other_org": OTHER_ORG}) == 0

                connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                connection.execute(
                    text("SELECT erp_security.activate_context(:auth_user_id,:org_id)"),
                    {"auth_user_id": CLAIMANT_AUTH, "org_id": ORG},
                )
                for function in (
                    web_operator_actions.expense_claim_readback,
                    mcp_actions.expense_claim_readback,
                ):
                    assert "get_expense_claim_readback" in inspect.getsource(function)
                readback = connection.execute(
                    READBACK_EXPENSE_CLAIM_SQL,
                    {"org_id": ORG, "command_request_id": prepared.command_request_id},
                ).mappings().all()
                assert len(readback) == 1
                assert readback[0]["expense_claim_id"] == executed.resource_id
                assert readback[0]["journal_line_debit_total"] == Decimal("168.00")
                assert readback[0]["journal_line_credit_total"] == Decimal("168.00")
                connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')

                try:
                    service.prepare(
                        policy=ACTION_POLICIES["finance.expense_claim.prepare"],
                        payload=_payload(business_date, UNVERIFIED_RECEIPT),
                        idempotency_key="pg15-expense-unverified-receipt", context=_context(),
                    )
                except OperatorActionError as error:
                    assert error.code is ActionErrorCode.VALIDATION_FAILED
                else:
                    raise AssertionError("unverified receipt reached an expense claim command")

                try:
                    service.prepare(
                        policy=ACTION_POLICIES["finance.expense_claim.prepare"],
                        payload=_payload(business_date, CROSS_BRANCH_RECEIPT),
                        idempotency_key="pg15-expense-cross-branch-receipt",
                        context=_context(),
                    )
                except OperatorActionError as error:
                    assert error.code is ActionErrorCode.VALIDATION_FAILED
                else:
                    raise AssertionError("cross-branch receipt reached an expense claim command")
            finally:
                if outer.is_active:
                    outer.rollback()
                connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
