"""Execute signed cycle-count gain/loss lifecycles on disposable PostgreSQL 15.

This gate deliberately uses real canonical rows and ``erp_runtime`` for every
prepare/approve/execute/readback. It requires a fresh disposable database so
each service phase commits with PostgreSQL's declared constraint timing.
"""

from __future__ import annotations

import importlib.util
import os
from decimal import Decimal
from pathlib import Path
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from app.domain.operator_actions.contract import ACTION_POLICIES
from app.domain.operator_actions.models import ActionContext, OperatorActionError
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "_transfer_lifecycle_fixture",
    HERE / "check_canonical_inventory_transfer_lifecycle_runtime_role.py",
)
assert SPEC and SPEC.loader
TRANSFER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TRANSFER)

ORG = TRANSFER.ORG
BRANCH = TRANSFER.SOURCE_BRANCH
LOCATION = TRANSFER.SOURCE_LOCATION
PRODUCT = TRANSFER.PRODUCT
CONVERSION = UUID("e3000000-0000-7000-8000-000000000059")
BATCH = TRANSFER.BATCH
REQUESTER = TRANSFER.MEMBERSHIP
REQUESTER_USER = TRANSFER.USER
REQUESTER_AUTH = TRANSFER.AUTH_USER
REQUESTER_GRANT = TRANSFER.AGENT_GRANT
OTHER_ORG = TRANSFER.OTHER_ORG
APPROVER = UUID("e3000000-0000-7000-8000-000000000060")
APPROVER_USER = UUID("e3000000-0000-7000-8000-000000000061")
APPROVER_AUTH = UUID("e3000000-0000-7000-8000-000000000062")
APPROVER_GRANT = UUID("e3000000-0000-7000-8000-000000000063")
ASSET_ACCOUNT = UUID("e3000000-0000-7000-8000-000000000064")
GAIN_ACCOUNT = UUID("e3000000-0000-7000-8000-000000000065")
LOSS_ACCOUNT = UUID("e3000000-0000-7000-8000-000000000066")
LOSS_EVIDENCE = UUID("e3000000-0000-7000-8000-000000000067")
GAIN_EVIDENCE = UUID("e3000000-0000-7000-8000-000000000068")
STALE_EVIDENCE = UUID("e3000000-0000-7000-8000-000000000069")


def _extend_fixture(session, business_date) -> None:
    # ``auth.users`` is owned by Supabase in production.  The disposable PG15
    # bootstrap leaves it under the bootstrap principal, so create the second
    # synthetic identity before adopting the migration-owner role.
    session.execute(text("INSERT INTO auth.users(id) VALUES (:id)"), {"id": APPROVER_AUTH})
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(text("SELECT set_config('app.org_id',:org,true),set_config('app.membership_id',:member,true)"),
                    {"org": str(ORG), "member": str(REQUESTER)})
    tables = (
        "core.users", "core.memberships", "core.permissions", "core.roles",
        "core.role_permissions", "core.access_grants", "core.document_sequences",
        "core.settings", "core.attachments", "automation.agent_grants",
        "automation.agent_grant_capabilities", "finance.accounts",
        "catalog.uom_conversions",
    )
    for table_name in tables:
        session.execute(text(f"ALTER TABLE {table_name} DISABLE TRIGGER USER"))
    session.execute(text("""
      INSERT INTO core.users(id,auth_user_id,display_name,status)
      VALUES (:approver_user,:approver_auth,'Cycle Count Approver','active');
      INSERT INTO core.memberships(org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:approver,:approver_user,'active',transaction_timestamp(),:requester,:requester);
      INSERT INTO core.permissions(code,domain,action,risk_class,description,status) VALUES
        ('inventory.adjustment.create','inventory','adjustment.create','consequential_write','Create exact cycle count','active'),
        ('finance.adjustment_note.manage','finance','adjustment_note.manage','consequential_write','Manage exact adjustment notes','active'),
        ('finance.journal.post','finance','journal.post','consequential_write','Post balanced journal','active')
      ON CONFLICT (code) DO NOTHING;
      INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
      SELECT :org,:requester_role,code,:requester FROM unnest(ARRAY[
        'inventory.adjustment.create','finance.adjustment_note.manage','finance.journal.post'
      ]::text[]) code ON CONFLICT DO NOTHING;
      INSERT INTO core.roles(org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:approver_role,'cycle_count_approver','Cycle Count Approver','active',:requester,:requester);
      INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
      VALUES (:org,:approver_role,'automation.command.approve',:requester);
      INSERT INTO core.access_grants(org_id,id,membership_id,role_id,scope_kind,branch_id,valid_from_at,status,created_by_membership_id)
      VALUES (:org,:approver_access,:approver,:approver_role,'organization',NULL,transaction_timestamp(),'active',:requester);
      UPDATE automation.agent_grant_capabilities SET approval_policy='separate_approver'
       WHERE org_id=:org AND agent_grant_id=:requester_grant AND capability_code='automation.command.approve';
      INSERT INTO automation.agent_grant_capabilities(
        org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,maximum_amount,currency_code,created_by_membership_id)
      VALUES (:org,:requester_grant,'inventory.adjustment.prepare','write','consequential_write','separate_approver',1000,'INR',:requester),
             (:org,:requester_grant,'finance.journal.post','write','consequential_write','actor_confirmation',1000,'INR',:requester);
      INSERT INTO automation.agent_grants(
        org_id,id,subject_membership_id,client_id,client_display_name,branch_id,authorization_mode,
        consent_version,consent_text_hash,consented_by_membership_id,consented_at,granted_by_membership_id,
        granted_at,expires_at,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:approver_grant,:approver,'cycle-count-approver','Cycle Count Approver',NULL,'self_consent',
        'v1',decode(repeat('61',32),'hex'),:approver,transaction_timestamp(),:approver,transaction_timestamp(),
        transaction_timestamp()+interval '1 hour','active',:approver,:approver);
      INSERT INTO automation.agent_grant_capabilities(
        org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,maximum_amount,currency_code,created_by_membership_id)
      VALUES (:org,:approver_grant,'automation.command.approve','write','consequential_write','actor_confirmation',NULL,NULL,:approver);
      INSERT INTO finance.accounts(org_id,id,code,name,account_type,currency_code,allows_party_posting,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,:asset,'1300','Inventory Asset','asset','INR',false,'active',:requester,:requester),
             (:org,:gain,'4800','Inventory Count Gain','income','INR',false,'active',:requester,:requester),
             (:org,:loss,'6800','Inventory Count Loss','expense','INR',false,'active',:requester,:requester);
      INSERT INTO catalog.units_of_measure(code,name,symbol,dimension,decimal_places,status)
      VALUES ('COUNT','Count unit','count','count',6,'active') ON CONFLICT (code) DO NOTHING;
      INSERT INTO catalog.uom_conversions(
        org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,created_by_membership_id)
      VALUES (:org,:conversion,:product,'COUNT','EA',1.000000,:business_date,'active',:requester);
      INSERT INTO core.settings(org_id,id,scope_kind,branch_id,namespace,key,value_type,value_text,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,gen_random_uuid(),'organization',NULL,'finance.account_roles','inventory_asset','text',CAST(:asset AS text),'active',:requester,:requester),
             (:org,gen_random_uuid(),'organization',NULL,'finance.account_roles','inventory_count_gain','text',CAST(:gain AS text),'active',:requester,:requester),
             (:org,gen_random_uuid(),'organization',NULL,'finance.account_roles','inventory_count_loss','text',CAST(:loss AS text),'active',:requester,:requester);
      INSERT INTO core.document_sequences(org_id,id,branch_id,document_type,fiscal_year_start,prefix,padding,next_value,status,created_by_membership_id,updated_by_membership_id)
      VALUES (:org,gen_random_uuid(),:branch,'stock_count',make_date(CASE WHEN extract(month from CAST(:business_date AS date))>=4 THEN extract(year from CAST(:business_date AS date))::int ELSE extract(year from CAST(:business_date AS date))::int-1 END,4,1),'CNT-',5,1,'active',:requester,:requester),
             (:org,gen_random_uuid(),:branch,'journal_entry',make_date(CASE WHEN extract(month from CAST(:business_date AS date))>=4 THEN extract(year from CAST(:business_date AS date))::int ELSE extract(year from CAST(:business_date AS date))::int-1 END,4,1),'JRN-',5,1,'active',:requester,:requester);
      INSERT INTO core.attachments(org_id,branch_id,id,storage_bucket,storage_object_path,original_filename,media_type,byte_size,sha256,evidence_kind,document_date,retention_until,status,verified_at,created_by_membership_id)
      VALUES (:org,:branch,:loss_evidence,'fixture','count/loss.pdf','loss.pdf','application/pdf',100,decode(repeat('71',32),'hex'),'inventory_cycle_count_sheet',:business_date,:business_date+3650,'verified',transaction_timestamp(),:requester),
             (:org,:branch,:gain_evidence,'fixture','count/gain.pdf','gain.pdf','application/pdf',100,decode(repeat('72',32),'hex'),'inventory_cycle_count_sheet',:business_date,:business_date+3650,'verified',transaction_timestamp(),:requester),
             (:org,:branch,:stale_evidence,'fixture','count/stale.pdf','stale.pdf','application/pdf',100,decode(repeat('73',32),'hex'),'inventory_cycle_count_sheet',:business_date,:business_date+3650,'verified',transaction_timestamp(),:requester);
    """), {
        "org": ORG, "approver": APPROVER, "approver_user": APPROVER_USER, "approver_auth": APPROVER_AUTH,
        "requester": REQUESTER, "requester_role": UUID("e3000000-0000-7000-8000-000000000014"),
        "approver_role": UUID("e3000000-0000-7000-8000-000000000070"),
        "approver_access": UUID("e3000000-0000-7000-8000-000000000071"),
        "requester_grant": REQUESTER_GRANT, "approver_grant": APPROVER_GRANT,
        "asset": ASSET_ACCOUNT, "gain": GAIN_ACCOUNT, "loss": LOSS_ACCOUNT,
        "conversion": CONVERSION, "product": PRODUCT,
        "branch": BRANCH, "business_date": business_date,
        "loss_evidence": LOSS_EVIDENCE, "gain_evidence": GAIN_EVIDENCE, "stale_evidence": STALE_EVIDENCE,
    })
    # Drain deferred foreign-key events before changing trigger state again.
    session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    for table_name in tables:
        session.execute(text(f"ALTER TABLE {table_name} ENABLE TRIGGER USER"))
    session.execute(text("RESET ROLE"))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))


def _context(*, approver: bool = False, org: UUID = ORG) -> ActionContext:
    return ActionContext(
        auth_user_id=APPROVER_AUTH if approver else REQUESTER_AUTH,
        user_id=APPROVER_USER if approver else REQUESTER_USER,
        organization_id=org,
        membership_id=APPROVER if approver else REQUESTER,
        agent_grant_id=APPROVER_GRANT if approver else REQUESTER_GRANT,
        client_id="cycle-count-approver" if approver else "transfer-lifecycle",
        operation_key="automation.command.approve" if approver else "inventory.adjustment.prepare",
        permission="automation.command.approve" if approver else "inventory.adjustment.create",
        branch_ids=(BRANCH,), organization_scope=True,
    )


def _payload(session, *, counted: str, evidence: UUID) -> dict:
    session.execute(
        text("SELECT erp_security.activate_context(:auth,:org)"),
        {"auth": REQUESTER_AUTH, "org": ORG},
    )
    row_version = session.scalar(text("""
      SELECT row_version FROM inventory.stock_balances
       WHERE org_id=:org AND branch_id=:branch AND location_id=:location AND product_id=:product AND batch_id=:batch
    """), {"org": ORG, "branch": BRANCH, "location": LOCATION, "product": PRODUCT, "batch": BATCH})
    return {
        "branch_id": BRANCH, "adjustment_date": session.scalar(text("SELECT current_date")),
        "counted_at": session.scalar(text("SELECT transaction_timestamp()")),
        "counted_by_membership_id": REQUESTER, "location_id": LOCATION,
        "reason_code": "cycle_count", "evidence_attachment_id": evidence,
        "lines": [{"product_id": PRODUCT, "uom_conversion_id": CONVERSION,
                   "batch_counts": [{"batch_id": BATCH, "counted_quantity": counted,
                                      "stock_balance_row_version": row_version}]}],
    }


def _post(service, runtime_sessions, counted: str, evidence: UUID, suffix: str):
    with runtime_sessions() as session, session.begin():
        payload = _payload(session, counted=counted, evidence=evidence)
    prepared = service.prepare(policy=ACTION_POLICIES["inventory.adjustment.prepare"], payload=payload,
                               idempotency_key=f"pg15-count-{suffix}-prepare", context=_context())
    service.approve(command_request_id=prepared.command_request_id, preview_hash=prepared.preview_hash,
                    idempotency_key=f"pg15-count-{suffix}-approve", context=_context(approver=True))
    executed = service.execute(command_request_id=prepared.command_request_id, preview_hash=prepared.preview_hash,
                               idempotency_key=f"pg15-count-{suffix}-execute", context=_context())
    return prepared, executed


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                sessions = sessionmaker(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
                with sessions.begin() as session:
                    TRANSFER._seed(session)
                    business_date = session.scalar(text("SELECT current_date"))
                    _extend_fixture(session, business_date)
                outer.commit()
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                assert int(connection.scalar(text("SHOW server_version_num"))) // 10000 == 15
                connection.commit()
                service = SqlAlchemyOperatorActionService(sessions, runtime_principal_configured=True)

                loss_preview, loss = _post(service, sessions, "4.000000", LOSS_EVIDENCE, "loss")
                assert loss_preview.inventory_impact[0]["variance_base_quantity"] == "-1.000000"
                gain_preview, gain = _post(service, sessions, "6.000000", GAIN_EVIDENCE, "gain")
                assert gain_preview.inventory_impact[0]["variance_base_quantity"] == "2.000000"
                replay = service.execute(command_request_id=gain_preview.command_request_id,
                    preview_hash=gain_preview.preview_hash, idempotency_key="pg15-count-gain-replay", context=_context())
                assert replay.resource_id == gain.resource_id and replay.idempotency_replayed

                # A malformed approved fixture proves the posting authority itself
                # locks the exact lot and rolls the whole statement back rather than
                # allowing a negative projection. Runtime never performs table DML.
                insufficient_document = UUID("e3000000-0000-7000-8000-000000000080")
                insufficient_line = UUID("e3000000-0000-7000-8000-000000000081")
                connection.exec_driver_sql('RESET SESSION AUTHORIZATION')
                connection.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
                connection.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
                connection.execute(text("ALTER TABLE inventory.inventory_documents DISABLE TRIGGER USER"))
                connection.execute(text("ALTER TABLE inventory.inventory_document_lines DISABLE TRIGGER USER"))
                connection.execute(text("""
                  INSERT INTO inventory.inventory_documents(
                    org_id,id,branch_id,physical_movement_required,document_type,document_number,fiscal_year,
                    document_date,status,reason_code,currency_code,costing_method_snapshot,total_abs_base_quantity,
                    total_value,approved_at,approved_by_membership_id,created_by_membership_id,updated_by_membership_id)
                  VALUES (:org,:document,:branch,false,'stock_count','CNT-INSUFFICIENT',extract(year from current_date)::smallint,
                    current_date,'approved','cycle_count','INR','moving_weighted_average',7.000000,70.00,
                    transaction_timestamp(),:requester,:requester,:requester);
                  INSERT INTO inventory.inventory_document_lines(
                    org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,uom_code,
                    entered_quantity,base_quantity,from_location_id,system_quantity,counted_quantity,
                    variance_quantity,unit_cost,extended_cost,created_by_membership_id)
                  VALUES (:org,:line,:document,1,'count_adjustment',:product,:batch,'EA',7.000000,7.000000,
                    :location,6.000000,-1.000000,-7.000000,10.0000,70.00,:requester)
                """), {"org": ORG, "document": insufficient_document, "line": insufficient_line,
                       "branch": BRANCH, "requester": REQUESTER, "product": PRODUCT,
                       "batch": BATCH, "location": LOCATION})
                connection.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
                connection.execute(text("ALTER TABLE inventory.inventory_document_lines ENABLE TRIGGER USER"))
                connection.execute(text("ALTER TABLE inventory.inventory_documents ENABLE TRIGGER USER"))
                connection.execute(text("RESET ROLE"))
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                connection.commit()
                with sessions() as session, session.begin():
                    session.execute(text("SELECT erp_security.activate_context(:auth,:org)"),
                                    {"auth": REQUESTER_AUTH, "org": ORG})
                    try:
                        with session.begin_nested():
                            session.execute(text("SELECT erp_trade_commands.post_locked_document(:org,:document,:actor)"),
                                            {"org": ORG, "document": insufficient_document, "actor": REQUESTER})
                    except DBAPIError as error:
                        assert "insufficient" in str(error).lower() or "negative" in str(error).lower()
                    else:
                        raise AssertionError("insufficient exact lot stock posted")
                    assert session.scalar(text("SELECT count(*) FROM inventory.stock_ledger_entries WHERE org_id=:org AND inventory_document_id=:document"),
                                          {"org": ORG, "document": insufficient_document}) == 0
                    assert session.scalar(text("SELECT on_hand_quantity FROM inventory.stock_balances WHERE org_id=:org AND batch_id=:batch"),
                                          {"org": ORG, "batch": BATCH}) == Decimal("6.000000")

                connection.exec_driver_sql('RESET SESSION AUTHORIZATION')
                connection.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
                connection.execute(text("ALTER TABLE inventory.inventory_documents DISABLE TRIGGER USER"))
                connection.execute(text("ALTER TABLE inventory.inventory_document_lines DISABLE TRIGGER USER"))
                connection.execute(
                    text("DELETE FROM inventory.inventory_document_lines WHERE org_id=:org AND inventory_document_id=:document"),
                    {"org": ORG, "document": insufficient_document},
                )
                connection.execute(
                    text("DELETE FROM inventory.inventory_documents WHERE org_id=:org AND id=:document"),
                    {"org": ORG, "document": insufficient_document},
                )
                connection.execute(text("ALTER TABLE inventory.inventory_document_lines ENABLE TRIGGER USER"))
                connection.execute(text("ALTER TABLE inventory.inventory_documents ENABLE TRIGGER USER"))
                connection.execute(text("RESET ROLE"))
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                connection.commit()

                with sessions.begin() as session:
                    session.execute(
                        text("SELECT erp_security.activate_context(:auth,:org)"),
                        {"auth": REQUESTER_AUTH, "org": ORG},
                    )
                    evidence = session.execute(text("""
                      SELECT document.status,document.total_abs_base_quantity,document.total_value,
                             ledger.entry_kind,ledger.quantity_delta,ledger.value_delta,
                             balance.on_hand_quantity,balance.inventory_value,
                             journal.status,journal.transaction_debit_total,journal.transaction_credit_total
                        FROM inventory.inventory_documents document
                        JOIN inventory.stock_ledger_entries ledger ON ledger.org_id=document.org_id AND ledger.inventory_document_id=document.id
                        JOIN inventory.stock_balances balance ON balance.org_id=ledger.org_id AND balance.branch_id=ledger.branch_id
                         AND balance.location_id=ledger.location_id AND balance.product_id=ledger.product_id AND balance.batch_id=ledger.batch_id
                        JOIN finance.accounting_events event ON event.org_id=document.org_id AND event.inventory_document_id=document.id
                        JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
                       WHERE document.org_id=:org AND document.id=:document
                    """), {"org": ORG, "document": gain.resource_id}).one()
                    assert tuple(evidence) == ("posted", Decimal("2.000000"), Decimal("20.00"), "count_gain",
                        Decimal("2.000000"), Decimal("20.00"), Decimal("6.000000"), Decimal("60.00"),
                        "posted", Decimal("20.00"), Decimal("20.00"))
                    stale_payload = _payload(session, counted="5.000000", evidence=STALE_EVIDENCE)
                stale = service.prepare(policy=ACTION_POLICIES["inventory.adjustment.prepare"], payload=stale_payload,
                    idempotency_key="pg15-count-stale-prepare", context=_context())
                service.approve(command_request_id=stale.command_request_id, preview_hash=stale.preview_hash,
                    idempotency_key="pg15-count-stale-approve", context=_context(approver=True))
                connection.exec_driver_sql('RESET SESSION AUTHORIZATION')
                connection.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
                connection.execute(text("UPDATE inventory.stock_balances SET row_version=row_version+1 WHERE org_id=:org AND batch_id=:batch"),
                                   {"org": ORG, "batch": BATCH})
                connection.execute(text("RESET ROLE"))
                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                connection.commit()
                try:
                    service.execute(command_request_id=stale.command_request_id, preview_hash=stale.preview_hash,
                        idempotency_key="pg15-count-stale-execute", context=_context())
                except OperatorActionError:
                    pass
                else:
                    raise AssertionError("stale stock row version executed")
                stale_document_id = uuid5(
                    NAMESPACE_URL,
                    f"aasopharma:{ORG}:{REQUESTER}:inventory.adjustment.prepare:"
                    "pg15-count-stale-prepare:inventory_document_id",
                )
                assert connection.scalar(text("""
                  SELECT count(*) FROM inventory.stock_ledger_entries
                   WHERE org_id=:org AND inventory_document_id=:document
                """), {"org": ORG, "document": stale_document_id}) == 0
                try:
                    service.prepare(policy=ACTION_POLICIES["inventory.adjustment.prepare"], payload=stale_payload,
                        idempotency_key="pg15-count-cross-tenant", context=_context(org=OTHER_ORG))
                except OperatorActionError:
                    pass
                else:
                    raise AssertionError("cross-tenant cycle count prepared")
                print(
                    "inventory-adjustment PostgreSQL 15 lifecycle passed: "
                    f"loss={loss.resource_id} gain={gain.resource_id} "
                    "balance_quantity=6.000000 balance_value=60.00"
                )
            finally:
                if outer.is_active:
                    outer.rollback()
                if connection.in_transaction():
                    connection.rollback()
                connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
                connection.commit()
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
