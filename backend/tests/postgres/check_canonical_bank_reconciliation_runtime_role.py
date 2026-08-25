"""Exercise exact bank reconciliation through the restricted PostgreSQL role.

The fixture is committed only inside the disposable PostgreSQL-15 gate database
so two independent runtime sessions can contend for the same approved command.
All business lifecycle calls run as ``erp_runtime``; seed-only trigger bypasses
run as ``erp_migration_owner`` before runtime authorization is selected.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from app.domain.operator_actions.contract import ACTION_POLICIES
from app.domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService


ORG = UUID("e8000000-0000-7000-8000-000000000001")
BRANCH = UUID("e8000000-0000-7000-8000-000000000002")
MAKER_AUTH = UUID("e8000000-0000-7000-8000-000000000003")
MAKER_USER = UUID("e8000000-0000-7000-8000-000000000004")
MAKER = UUID("e8000000-0000-7000-8000-000000000005")
CHECKER_AUTH = UUID("e8000000-0000-7000-8000-000000000006")
CHECKER_USER = UUID("e8000000-0000-7000-8000-000000000007")
CHECKER = UUID("e8000000-0000-7000-8000-000000000008")
MAKER_GRANT = UUID("e8000000-0000-7000-8000-000000000009")
CHECKER_GRANT = UUID("e8000000-0000-7000-8000-000000000010")
BANK_LEDGER = UUID("e8000000-0000-7000-8000-000000000011")
OFFSET_LEDGER = UUID("e8000000-0000-7000-8000-000000000012")
BANK_ACCOUNT = UUID("e8000000-0000-7000-8000-000000000013")
ATTACHMENT = UUID("e8000000-0000-7000-8000-000000000014")
STATEMENT = UUID("e8000000-0000-7000-8000-000000000015")
STATEMENT_LINE = UUID("e8000000-0000-7000-8000-000000000016")
JOURNAL = UUID("e8000000-0000-7000-8000-000000000017")
BANK_JOURNAL_LINE = UUID("e8000000-0000-7000-8000-000000000018")
OFFSET_JOURNAL_LINE = UUID("e8000000-0000-7000-8000-000000000019")

SEED_TABLES = (
    "core.permissions", "core.organizations", "core.users", "core.memberships",
    "core.branches", "core.roles", "core.role_permissions", "core.access_grants",
    "core.attachments", "automation.agent_grants",
    "automation.agent_grant_capabilities", "finance.accounts",
    "finance.bank_accounts", "finance.bank_statements",
    "finance.bank_statement_lines", "finance.journal_entries", "finance.journal_lines",
)


def _seed(session: Session) -> None:
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(text("INSERT INTO auth.users(id) VALUES (:maker),(:checker)"), {
        "maker": MAKER_AUTH, "checker": CHECKER_AUTH,
    })
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(text("SELECT set_config('app.org_id',:org,true),set_config('app.membership_id',:maker,true)"), {
        "org": str(ORG), "maker": str(MAKER),
    })
    for table_name in SEED_TABLES:
        session.execute(text(f"ALTER TABLE {table_name} DISABLE TRIGGER USER"))
    session.execute(text("""
        INSERT INTO core.organizations(
          id,legal_name,timezone,registered_address_line1,registered_city,
          registered_state_code,registered_postal_code,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES(:org,'Bank Reconciliation Runtime Org','Asia/Kolkata','1 Test Road',
          'Mumbai','27','400001','active',:maker,:maker);
        INSERT INTO core.users(id,auth_user_id,display_name,status)
        VALUES(:maker_user,:maker_auth,'Reconciliation Maker','active'),
              (:checker_user,:checker_auth,'Reconciliation Checker','active');
        INSERT INTO core.memberships(
          org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:maker,:maker_user,'active',transaction_timestamp(),:maker,:maker),
              (:org,:checker,:checker_user,'active',transaction_timestamp(),:maker,:maker);
        SET CONSTRAINTS ALL IMMEDIATE;

        INSERT INTO core.permissions(code,domain,action,risk_class,description,status)
        VALUES
          ('finance.bank_reconcile','finance','bank_reconcile','consequential_write','Reconcile exact bank evidence','active'),
          ('automation.command.approve','automation','command.approve','consequential_write','Approve exact command preview','active'),
          ('automation.command.execute','automation','command.execute','consequential_write','Execute approved command','active'),
          ('automation.command.view','automation','command.view','read_only','Read command evidence','active')
        ON CONFLICT(code) DO NOTHING;
        INSERT INTO core.branches(
          org_id,id,code,name,address_line1,city,state_code,postal_code,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:branch,'BANK-TEST','Bank Test Branch','1 Test Road','Mumbai','27','400001',
          'active',:maker,:maker);
        INSERT INTO core.roles(org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:maker_role,'bank_maker','Bank Maker','active',:maker,:maker),
              (:org,:checker_role,'bank_checker','Bank Checker','active',:maker,:maker);
        INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
        SELECT :org,:maker_role,code,:maker FROM unnest(ARRAY[
          'finance.bank_reconcile','automation.command.execute','automation.command.view']) code;
        INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
        VALUES(:org,:checker_role,'automation.command.approve',:maker);
        INSERT INTO core.access_grants(
          org_id,id,membership_id,role_id,scope_kind,branch_id,valid_from_at,status,created_by_membership_id)
        VALUES(:org,:maker_access,:maker,:maker_role,'branch',:branch,transaction_timestamp(),'active',:maker),
              (:org,:checker_access,:checker,:checker_role,'organization',NULL,transaction_timestamp(),'active',:maker);

        INSERT INTO automation.agent_grants(
          org_id,id,subject_membership_id,client_id,client_display_name,branch_id,
          authorization_mode,consent_version,consent_text_hash,consented_by_membership_id,
          consented_at,granted_by_membership_id,granted_at,expires_at,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:maker_grant,:maker,'bank-runtime-maker','Bank Runtime Maker',:branch,
          'self_consent','v1',decode(repeat('81',32),'hex'),:maker,transaction_timestamp(),
          :maker,transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:maker,:maker),
              (:org,:checker_grant,:checker,'bank-runtime-checker','Bank Runtime Checker',NULL,
          'self_consent','v1',decode(repeat('82',32),'hex'),:checker,transaction_timestamp(),
          :checker,transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:checker,:checker);
        INSERT INTO automation.agent_grant_capabilities(
          org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,
          maximum_amount,currency_code,created_by_membership_id)
        VALUES(:org,:maker_grant,'finance.bank_reconciliation.prepare','write','consequential_write',
                'separate_approver',168,'INR',:maker),
              (:org,:maker_grant,'automation.command.execute','write','consequential_write',
                'actor_confirmation',NULL,NULL,:maker),
              (:org,:maker_grant,'automation.command.status.get','read','read_only','none',NULL,NULL,:maker),
              (:org,:checker_grant,'automation.command.approve','write','consequential_write',
                'actor_confirmation',NULL,NULL,:checker);

        INSERT INTO finance.accounts(
          org_id,id,code,name,account_type,currency_code,allows_bank_reconciliation,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:bank_ledger,'1100','Runtime Bank','asset','INR',true,'active',:maker,:maker),
              (:org,:offset_ledger,'4100','Runtime Offset','income','INR',false,'active',:maker,:maker);
        INSERT INTO finance.bank_accounts(
          org_id,id,account_id,bank_name,account_holder_name,account_number_ciphertext,
          account_number_hash,ifsc,currency_code,status,created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:bank_account,:bank_ledger,'Runtime Bank','Runtime Org',decode('01','hex'),
          decode(repeat('83',32),'hex'),'ABCD0123456','INR','active',:maker,:maker);
        INSERT INTO core.attachments(
          org_id,id,storage_bucket,storage_object_path,original_filename,media_type,byte_size,
          sha256,evidence_kind,document_date,status,verified_at,created_by_membership_id)
        VALUES(:org,:attachment,'runtime','bank/statement.csv','statement.csv','text/csv',168,
          decode(repeat('84',32),'hex'),'bank_statement',current_date,'verified',transaction_timestamp(),:maker);
        INSERT INTO finance.bank_statements(
          org_id,id,bank_account_id,statement_reference,period_start,period_end,currency_code,
          opening_balance,closing_balance,source_attachment_id,source_sha256,status,
          created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:statement,:bank_account,'BANK-RUNTIME-1',current_date,current_date,'INR',0,168,
          :attachment,decode(repeat('84',32),'hex'),'imported',:maker,:maker);
        INSERT INTO finance.bank_statement_lines(
          org_id,id,bank_statement_id,line_number,transaction_date,value_date,direction,amount,
          running_balance,bank_reference,description,created_by_membership_id)
        VALUES(:org,:statement_line,:statement,1,current_date,current_date,'credit',168,168,
          'BANK-RUNTIME-JE-1','Exact runtime receipt',:maker);
        INSERT INTO finance.journal_entries(
          org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
          fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,
          functional_credit_total,status,posted_at,posted_by_membership_id,
          created_by_membership_id,updated_by_membership_id)
        VALUES(:org,:journal,'BANK-RUNTIME-JE-1',current_date,'Exact runtime bank journal','INR','INR',1,
          168,168,168,168,'posted',transaction_timestamp(),:maker,:maker,:maker);
        INSERT INTO finance.journal_lines(
          org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
          transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
        VALUES(:org,:bank_line,:journal,1,:bank_ledger,:branch,'Bank debit',168,0,168,0,:maker),
              (:org,:offset_line,:journal,2,:offset_ledger,:branch,'Offset credit',0,168,0,168,:maker);
    """), {
        "org": ORG, "branch": BRANCH,
        "maker_auth": MAKER_AUTH, "maker_user": MAKER_USER, "maker": MAKER,
        "checker_auth": CHECKER_AUTH, "checker_user": CHECKER_USER, "checker": CHECKER,
        "maker_role": UUID("e8000000-0000-7000-8000-000000000020"),
        "checker_role": UUID("e8000000-0000-7000-8000-000000000021"),
        "maker_access": UUID("e8000000-0000-7000-8000-000000000022"),
        "checker_access": UUID("e8000000-0000-7000-8000-000000000023"),
        "maker_grant": MAKER_GRANT, "checker_grant": CHECKER_GRANT,
        "bank_ledger": BANK_LEDGER, "offset_ledger": OFFSET_LEDGER,
        "bank_account": BANK_ACCOUNT, "attachment": ATTACHMENT,
        "statement": STATEMENT, "statement_line": STATEMENT_LINE,
        "journal": JOURNAL, "bank_line": BANK_JOURNAL_LINE, "offset_line": OFFSET_JOURNAL_LINE,
    })
    for table_name in SEED_TABLES:
        session.execute(text(f"ALTER TABLE {table_name} ENABLE TRIGGER USER"))
    session.execute(text("RESET ROLE"))


def _context(*, checker: bool = False) -> ActionContext:
    return ActionContext(
        auth_user_id=CHECKER_AUTH if checker else MAKER_AUTH,
        user_id=CHECKER_USER if checker else MAKER_USER,
        organization_id=ORG,
        membership_id=CHECKER if checker else MAKER,
        agent_grant_id=CHECKER_GRANT if checker else MAKER_GRANT,
        client_id="bank-runtime-checker" if checker else "bank-runtime-maker",
        operation_key="automation.command.approve" if checker else "finance.bank_reconciliation.prepare",
        permission="automation.command.approve" if checker else "finance.bank_reconcile",
        branch_ids=() if checker else (BRANCH,),
        organization_scope=checker,
    )


def _runtime_service(engine) -> tuple[SqlAlchemyOperatorActionService, object]:
    connection = engine.connect()
    connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
    connection.commit()
    factory = sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    return SqlAlchemyOperatorActionService(factory, runtime_principal_configured=True), connection


def _close_runtime_connection(connection) -> None:
    """Return a connection to the pool only after restoring its login authority."""

    if connection.in_transaction():
        connection.rollback()
    connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
    connection.commit()
    connection.close()


def _set_bank_row_version(engine, row_version: int) -> None:
    """Migration-only fault injection for execute-time source revalidation."""

    with engine.begin() as connection:
        connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
        connection.exec_driver_sql("ALTER TABLE finance.bank_accounts DISABLE TRIGGER USER")
        connection.execute(
            text("UPDATE finance.bank_accounts SET row_version=:version WHERE org_id=:org AND id=:bank"),
            {"version": row_version, "org": ORG, "bank": BANK_ACCOUNT},
        )
        connection.exec_driver_sql("ALTER TABLE finance.bank_accounts ENABLE TRIGGER USER")
        connection.exec_driver_sql("RESET ROLE")


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        with Session(engine) as seed_session, seed_session.begin():
            _seed(seed_session)

        maker_service, maker_connection = _runtime_service(engine)
        checker_service, checker_connection = _runtime_service(engine)
        try:
            payload = {
                "branch_id": BRANCH,
                "bank_statement_id": STATEMENT,
                "bank_statement_line_id": STATEMENT_LINE,
                "journal_entry_id": JOURNAL,
                "matched_amount": "168.00",
                "match_method": "reference_exact",
            }
            try:
                maker_service.prepare(
                    policy=ACTION_POLICIES["finance.bank_reconciliation.prepare"],
                    payload={**payload, "matched_amount": "167.99"},
                    idempotency_key="pg15-bank-partial-rejected",
                    context=_context(),
                )
            except OperatorActionError as error:
                assert error.code is ActionErrorCode.VALIDATION_FAILED
            else:
                raise AssertionError("partial bank reconciliation was accepted")

            prepared = maker_service.prepare(
                policy=ACTION_POLICIES["finance.bank_reconciliation.prepare"],
                payload=payload,
                idempotency_key="pg15-bank-exact-prepare",
                context=_context(),
            )
            assert prepared.financial_impact == ({
                "effect": "reconciliation_only", "currency_code": "INR",
                "statement_direction": "credit", "matched_amount": "168.00",
                "journal_debit_total": "168.00", "journal_credit_total": "168.00",
                "creates_journal": False,
            },)
            approved = checker_service.approve(
                command_request_id=prepared.command_request_id,
                preview_hash=prepared.preview_hash,
                idempotency_key="pg15-bank-independent-approval",
                context=_context(checker=True),
            )
            assert approved.status == "approved"
        finally:
            _close_runtime_connection(maker_connection)
            _close_runtime_connection(checker_connection)

        _set_bank_row_version(engine, 2)
        stale_service, stale_connection = _runtime_service(engine)
        try:
            try:
                stale_service.execute(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-bank-stale-source",
                    context=_context(),
                )
            except OperatorActionError as error:
                assert error.code is ActionErrorCode.VALIDATION_FAILED
            else:
                raise AssertionError("changed bank-account source version executed")
        finally:
            _close_runtime_connection(stale_connection)
        _set_bank_row_version(engine, 1)

        def execute_once(key: str):
            service, connection = _runtime_service(engine)
            try:
                return service.execute(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key=key,
                    context=_context(),
                )
            finally:
                _close_runtime_connection(connection)

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(execute_once, ("pg15-bank-execute-a", "pg15-bank-execute-b")))
        assert {result.resource_id for result in results} == {results[0].resource_id}
        assert all(result.status == "succeeded" for result in results)

        read_service, read_connection = _runtime_service(engine)
        try:
            readback = read_service.get_bank_reconciliation_readback(
                command_request_id=prepared.command_request_id,
                context=_context(),
            )
            assert readback["reconciliation_match_id"] == results[0].resource_id
            assert readback["matched_amount"] == Decimal("168.00")
            assert readback["journal_bank_debit"] == Decimal("168.00")
            assert readback["journal_bank_credit"] == Decimal("0.00")
            assert readback["bank_statement_status"] == "reconciled"
            assert readback["journal_status"] == "posted"
            assert readback["audit_event_count"] >= 2
            assert readback["outbox_event_count"] >= 2
            with Session(bind=read_connection) as runtime_session:
                assert runtime_session.scalar(text(
                    "SELECT count(*) FROM finance.reconciliation_matches WHERE org_id=:org AND bank_statement_line_id=:line"
                ), {"org": ORG, "line": STATEMENT_LINE}) == 1
                assert runtime_session.scalar(text(
                    "SELECT count(*) FROM finance.journal_lines WHERE org_id=:org AND journal_entry_id=:journal"
                ), {"org": ORG, "journal": JOURNAL}) == 2
                journal = runtime_session.execute(text("""
                    SELECT status,row_version,transaction_debit_total,transaction_credit_total,
                           functional_debit_total,functional_credit_total
                      FROM finance.journal_entries WHERE org_id=:org AND id=:journal
                """), {"org": ORG, "journal": JOURNAL}).one()
                assert tuple(journal) == (
                    "posted", 1, Decimal("168.00"), Decimal("168.00"),
                    Decimal("168.00"), Decimal("168.00"),
                )
                statement = runtime_session.execute(text("""
                    SELECT status,reconciled_by_membership_id,opening_balance,closing_balance
                      FROM finance.bank_statements WHERE org_id=:org AND id=:statement
                """), {"org": ORG, "statement": STATEMENT}).one()
                assert tuple(statement) == (
                    "reconciled", MAKER, Decimal("0.00"), Decimal("168.00")
                )
                try:
                    runtime_session.execute(text("""
                        INSERT INTO finance.reconciliation_matches(
                          org_id,bank_statement_line_id,journal_entry_id,matched_amount,currency_code,
                          match_method,matched_by_membership_id,created_by_membership_id)
                        VALUES(:org,:line,:journal,168,'INR','manual',:maker,:maker)
                    """), {"org": ORG, "line": STATEMENT_LINE, "journal": JOURNAL, "maker": MAKER})
                    runtime_session.flush()
                except DBAPIError:
                    runtime_session.rollback()
                else:
                    raise AssertionError("erp_runtime bypassed the reviewed reconciliation command")
        finally:
            _close_runtime_connection(read_connection)
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
