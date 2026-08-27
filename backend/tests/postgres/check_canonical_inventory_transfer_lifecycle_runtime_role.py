"""Execute the canonical transfer command lifecycle as ``erp_runtime``.

Seed data is installed by the migration principal, but prepare, approval,
execution, replay, and all evidence reads run with ``SESSION_USER`` set to the
real restricted runtime role.  Service sessions join an outer transaction by
savepoint so the complete fixture is rolled back.
"""

from __future__ import annotations

import os
from decimal import Decimal
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.domain.operator_actions.contract import ACTION_POLICIES
from app.domain.operator_actions.models import (
    ActionContext,
    ActionErrorCode,
    OperatorActionError,
)
from app.infrastructure.operator_actions.service import SqlAlchemyOperatorActionService


ORG = UUID("e3000000-0000-7000-8000-000000000001")
SOURCE_BRANCH = UUID("e3000000-0000-7000-8000-000000000002")
DESTINATION_BRANCH = UUID("e3000000-0000-7000-8000-000000000003")
SOURCE_LOCATION = UUID("e3000000-0000-7000-8000-000000000004")
DESTINATION_LOCATION = UUID("e3000000-0000-7000-8000-000000000005")
PRODUCT = UUID("e3000000-0000-7000-8000-000000000006")
CONVERSION = UUID("e3000000-0000-7000-8000-000000000007")
BATCH = UUID("e3000000-0000-7000-8000-000000000008")
MEMBERSHIP = UUID("e3000000-0000-7000-8000-000000000009")
AUTH_USER = UUID("e3000000-0000-7000-8000-000000000010")
USER = UUID("e3000000-0000-7000-8000-000000000011")
AGENT_GRANT = UUID("e3000000-0000-7000-8000-000000000012")
LIMITED_AGENT_GRANT = UUID("e3000000-0000-7000-8000-000000000013")
OTHER_ORG = UUID("e4000000-0000-7000-8000-000000000001")


TABLES_WITH_USER_TRIGGERS = (
    "core.permissions",
    "core.organizations",
    "core.users",
    "core.memberships",
    "core.branches",
    "core.roles",
    "core.role_permissions",
    "core.access_grants",
    "core.document_sequences",
    "core.reference_data_releases",
    "automation.agent_grants",
    "automation.agent_grant_capabilities",
    "parties.parties",
    "catalog.products",
    "catalog.uom_conversions",
    "inventory.locations",
    "inventory.batches",
    "inventory.inventory_documents",
    "inventory.inventory_document_lines",
    "inventory.stock_ledger_entries",
    "inventory.stock_balances",
)


def _seed(session: Session) -> None:
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))
    session.execute(text("INSERT INTO auth.users(id) VALUES (:auth_user)"), {"auth_user": AUTH_USER})
    session.execute(text('SET LOCAL ROLE "erp_migration_owner"'))
    session.execute(
        text("""
            SELECT set_config('app.org_id', :org, true),
                   set_config('app.membership_id', :membership, true),
                   set_config('app.request_id', 'e3000000-0000-7000-8000-000000000099', true)
        """),
        {"org": str(ORG), "membership": str(MEMBERSHIP)},
    )
    for table_name in TABLES_WITH_USER_TRIGGERS:
        session.execute(text(f"ALTER TABLE {table_name} DISABLE TRIGGER USER"))

    session.execute(
        text("""
            INSERT INTO core.organizations(
              id,legal_name,timezone,registered_address_line1,registered_city,
              registered_state_code,registered_postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,'Transfer Lifecycle Org','UTC','1 Source Road','Mumbai','27','400001','active',:membership,:membership),
              (:other_org,'Hidden Transfer Org','UTC','1 Hidden Road','Pune','27','411001','active',:other_membership,:other_membership);
            INSERT INTO core.users(id,auth_user_id,display_name,status)
            VALUES (:user_id,:auth_user,'Transfer Lifecycle Actor','active'),
                   (:other_user,NULL,'Hidden Actor','active');
            INSERT INTO core.memberships(
              org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:membership,:user_id,'active',transaction_timestamp(),:membership,:membership),
                   (:other_org,:other_membership,:other_user,'active',transaction_timestamp(),:other_membership,:other_membership);
            SET CONSTRAINTS ALL IMMEDIATE;

            INSERT INTO core.permissions(code,domain,action,risk_class,description,status)
            VALUES
              ('inventory.transfer.create','inventory','transfer.create','consequential_write','Create an inter-branch stock transfer','active'),
              ('inventory.document.post','inventory','document.post','consequential_write','Post an inventory document','active'),
              ('automation.command.approve','automation','command.approve','consequential_write','Approve an exact command preview','active'),
              ('automation.command.execute','automation','command.execute','consequential_write','Execute an approved command','active')
            ON CONFLICT (code) DO NOTHING;
            INSERT INTO catalog.units_of_measure(code,name,symbol,dimension,decimal_places,status)
            VALUES ('EA','Each','ea','count',6,'active') ON CONFLICT (code) DO NOTHING;
            INSERT INTO core.branches(
              org_id,id,code,name,address_line1,city,state_code,postal_code,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:source_branch,'LIFE-SRC','Lifecycle Source','1 Source Road','Mumbai','27','400001','active',:membership,:membership),
              (:org,:destination_branch,'LIFE-DST','Lifecycle Destination','1 Destination Road','Pune','27','411001','active',:membership,:membership);
            INSERT INTO core.roles(org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:role_id,'transfer_lifecycle','Transfer Lifecycle','active',:membership,:membership);
            INSERT INTO core.role_permissions(org_id,role_id,permission_code,created_by_membership_id)
            SELECT :org,:role_id,permission_code,:membership
              FROM unnest(ARRAY[
                'inventory.transfer.create','inventory.document.post',
                'automation.command.approve','automation.command.execute'
              ]::text[]) AS permission_code;
            INSERT INTO core.access_grants(
              org_id,id,membership_id,role_id,scope_kind,branch_id,valid_from_at,status,created_by_membership_id)
            VALUES
              (:org,:access_grant,:membership,:role_id,'organization',NULL,transaction_timestamp(),'active',:membership),
              (:org,:limited_access_grant,:membership,:role_id,'branch',:source_branch,transaction_timestamp(),'active',:membership);

            INSERT INTO automation.agent_grants(
              org_id,id,subject_membership_id,client_id,client_display_name,branch_id,
              authorization_mode,consent_version,consent_text_hash,consented_by_membership_id,
              consented_at,granted_by_membership_id,granted_at,expires_at,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:agent_grant,:membership,'transfer-lifecycle','Transfer Lifecycle',NULL,
                'self_consent','v1',decode(repeat('31',32),'hex'),:membership,transaction_timestamp(),
                :membership,transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:membership,:membership),
              (:org,:limited_agent_grant,:membership,'transfer-limited','Transfer Limited',:source_branch,
                'self_consent','v1',decode(repeat('32',32),'hex'),:membership,transaction_timestamp(),
                :membership,transaction_timestamp(),transaction_timestamp()+interval '1 hour','active',:membership,:membership);
            INSERT INTO automation.agent_grant_capabilities(
              org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,
              maximum_amount,currency_code,created_by_membership_id)
            SELECT :org,:agent_grant,capability_code,'write','consequential_write','actor_confirmation',
                   1000.00,'INR',:membership
              FROM unnest(ARRAY[
                'inventory.transfer.prepare','automation.command.approve','automation.command.execute'
              ]::text[]) AS capability_code;
            INSERT INTO automation.agent_grant_capabilities(
              org_id,agent_grant_id,capability_code,operation_mode,risk_class,approval_policy,
              maximum_amount,currency_code,created_by_membership_id)
            VALUES (:org,:limited_agent_grant,'inventory.transfer.prepare','write',
                    'consequential_write','actor_confirmation',1000.00,'INR',:membership);

            INSERT INTO core.document_sequences(
              org_id,id,branch_id,document_type,fiscal_year_start,prefix,padding,next_value,status,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:sequence_id,:source_branch,'stock_transfer',
              make_date(CASE WHEN extract(month from current_date)>=4 THEN extract(year from current_date)::int
                             ELSE extract(year from current_date)::int-1 END,4,1),
              'LIFE-ST-',4,1,'active',:membership,:membership);
            INSERT INTO core.reference_data_releases(
              id,dataset_kind,ruleset_version,source_authority,source_uri,
              source_storage_bucket,source_storage_object_path,source_media_type,source_document_sha256,
              dataset_storage_bucket,dataset_storage_object_path,dataset_media_type,dataset_sha256,
              record_count,publication_date,effective_from,reviewed_by_user_id,reviewed_at,status)
            SELECT :release_id,'hsn_sac_tax','transfer-lifecycle-v1','gstn','https://example.invalid/hsn',
              'fixture','source.json','application/json',decode(repeat('41',32),'hex'),
              'fixture','dataset.json','application/json',decode(repeat('42',32),'hex'),
              1,current_date-1,current_date-1,:user_id,transaction_timestamp(),'active'
            WHERE NOT EXISTS (
              SELECT 1 FROM core.reference_data_releases
               WHERE dataset_kind='hsn_sac_tax' AND status='active'
            );
            INSERT INTO parties.parties(
              org_id,id,party_kind,legal_name,status,created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:manufacturer,'organization','Lifecycle Manufacturer','active',:membership,:membership);
            INSERT INTO catalog.products(
              org_id,id,sku,product_kind,name,manufacturer_party_id,base_uom_code,hsn_code,
              drug_schedule,requires_prescription,ndps_regulated,regulatory_ruleset_version,
              cold_chain_required,status,hsn_release_id,created_by_membership_id,updated_by_membership_id)
            SELECT :org,:product,'LIFECYCLE-SKU','consumable','Lifecycle Product',:manufacturer,
              'EA','3004','NONE',false,false,release.ruleset_version,false,'active',release.id,:membership,:membership
              FROM core.reference_data_releases AS release
             WHERE release.dataset_kind='hsn_sac_tax' AND release.status='active';
            INSERT INTO catalog.uom_conversions(
              org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,created_by_membership_id)
            VALUES (:org,:conversion,:product,'EA','EA',1.000000,current_date-1,'active',:membership);
            INSERT INTO inventory.locations(
              org_id,id,branch_id,code,name,location_type,status,allows_sale,allows_negative_stock,
              created_by_membership_id,updated_by_membership_id)
            VALUES
              (:org,:source_location,:source_branch,'LIFE-SALE','Lifecycle Saleable','saleable','active',true,false,:membership,:membership),
              (:org,:destination_location,:destination_branch,'LIFE-DEST','Lifecycle Destination','saleable','active',true,false,:membership,:membership);
            INSERT INTO inventory.batches(
              org_id,id,product_id,batch_number,lot_kind,manufactured_on,expires_on,mrp,
              mrp_uom_conversion_id,status,released_at,released_by_membership_id,
              created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:batch,:product,'LIFE-FEFO-1','manufacturer_batch',current_date-30,current_date+365,
              20.00,:conversion,'released',transaction_timestamp(),:membership,:membership,:membership);

            INSERT INTO inventory.inventory_documents(
              org_id,id,branch_id,physical_movement_required,document_type,document_number,
              fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
              total_abs_base_quantity,total_value,approved_at,approved_by_membership_id,
              posted_at,posted_by_membership_id,created_by_membership_id,updated_by_membership_id)
            VALUES (:org,:opening_document,:source_branch,false,'opening_receipt','LIFE-OPEN-1',
              extract(year from current_date)::smallint,current_date,'posted','opening_balance','INR',
              'moving_weighted_average',5.000000,50.00,transaction_timestamp(),:membership,
              transaction_timestamp(),:membership,:membership,:membership);
            INSERT INTO inventory.inventory_document_lines(
              org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,uom_code,
              entered_quantity,base_quantity,to_location_id,unit_cost,extended_cost,created_by_membership_id)
            VALUES (:org,:opening_line,:opening_document,1,'receipt',:product,:batch,'EA',
              5.000000,5.000000,:source_location,10.0000,50.00,:membership);
            INSERT INTO inventory.stock_ledger_entries(
              org_id,id,branch_id,inventory_document_id,inventory_document_line_id,entry_kind,
              location_id,product_id,batch_id,quantity_delta,unit_cost,value_delta,posted_at,posted_by_membership_id)
            VALUES (:org,:opening_ledger,:source_branch,:opening_document,:opening_line,'receipt',
              :source_location,:product,:batch,5.000000,10.0000,50.00,transaction_timestamp(),:membership);
            INSERT INTO inventory.stock_balances(
              org_id,branch_id,location_id,product_id,batch_id,on_hand_quantity,inventory_value,
              average_unit_cost,last_ledger_entry_id)
            VALUES (:org,:source_branch,:source_location,:product,:batch,5.000000,50.00,10.0000,:opening_ledger);
        """),
        {
            "org": ORG,
            "other_org": OTHER_ORG,
            "membership": MEMBERSHIP,
            "other_membership": UUID("e4000000-0000-7000-8000-000000000002"),
            "user_id": USER,
            "other_user": UUID("e4000000-0000-7000-8000-000000000003"),
            "auth_user": AUTH_USER,
            "source_branch": SOURCE_BRANCH,
            "destination_branch": DESTINATION_BRANCH,
            "role_id": UUID("e3000000-0000-7000-8000-000000000014"),
            "access_grant": UUID("e3000000-0000-7000-8000-000000000015"),
            "limited_access_grant": UUID("e3000000-0000-7000-8000-000000000016"),
            "agent_grant": AGENT_GRANT,
            "limited_agent_grant": LIMITED_AGENT_GRANT,
            "sequence_id": UUID("e3000000-0000-7000-8000-000000000017"),
            "release_id": UUID("e3000000-0000-7000-8000-000000000018"),
            "manufacturer": UUID("e3000000-0000-7000-8000-000000000019"),
            "product": PRODUCT,
            "conversion": CONVERSION,
            "source_location": SOURCE_LOCATION,
            "destination_location": DESTINATION_LOCATION,
            "batch": BATCH,
            "opening_document": UUID("e3000000-0000-7000-8000-000000000020"),
            "opening_line": UUID("e3000000-0000-7000-8000-000000000021"),
            "opening_ledger": UUID("e3000000-0000-7000-8000-000000000022"),
        },
    )
    for table_name in TABLES_WITH_USER_TRIGGERS:
        session.execute(text(f"ALTER TABLE {table_name} ENABLE TRIGGER USER"))
    session.execute(text("RESET ROLE"))
    session.execute(text("SET CONSTRAINTS ALL DEFERRED"))


def _context(*, grant_id: UUID = AGENT_GRANT, limited: bool = False) -> ActionContext:
    return ActionContext(
        auth_user_id=AUTH_USER,
        user_id=USER,
        organization_id=ORG,
        membership_id=MEMBERSHIP,
        agent_grant_id=grant_id,
        client_id="transfer-limited" if limited else "transfer-lifecycle",
        operation_key="inventory.transfer.prepare",
        permission="inventory.transfer.create",
        branch_ids=(SOURCE_BRANCH,) if limited else (SOURCE_BRANCH, DESTINATION_BRANCH),
        organization_scope=not limited,
    )


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.connect() as connection:
            outer = connection.begin()
            try:
                seed_sessions = sessionmaker(
                    bind=connection,
                    join_transaction_mode="create_savepoint",
                )
                with seed_sessions.begin() as seed_session:
                    _seed(seed_session)

                business_date = connection.scalar(text("""
                    SELECT (transaction_timestamp() AT TIME ZONE timezone)::date
                      FROM core.organizations WHERE id=:org
                """), {"org": ORG})

                connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
                principal = connection.execute(
                    text("SELECT session_user,current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")
                ).one()
                assert tuple(principal) == ("erp_runtime", "erp_runtime", False, False)

                runtime_sessions = sessionmaker(
                    bind=connection,
                    expire_on_commit=False,
                    join_transaction_mode="create_savepoint",
                )
                service = SqlAlchemyOperatorActionService(
                    runtime_sessions,
                    runtime_principal_configured=True,
                )
                payload = {
                    "source_branch_id": SOURCE_BRANCH,
                    "destination_branch_id": DESTINATION_BRANCH,
                    "source_location_id": SOURCE_LOCATION,
                    "destination_location_id": DESTINATION_LOCATION,
                    "transfer_date": business_date,
                    "lines": [{
                        "product_id": PRODUCT,
                        "uom_conversion_id": CONVERSION,
                        "batch_allocations": [{"batch_id": BATCH, "entered_quantity": "2.000000"}],
                    }],
                    "logistics": {"transport_mode": "in_person", "distance_km": "0.00"},
                }
                context = _context()
                prepared = service.prepare(
                    policy=ACTION_POLICIES["inventory.transfer.prepare"],
                    payload=payload,
                    idempotency_key="pg15-transfer-lifecycle-prepare",
                    context=context,
                )
                assert prepared.command_type == "inventory.document.post"
                assert prepared.inventory_impact[0]["base_quantity"] == "2.000000"
                assert prepared.inventory_impact[0]["unit_cost"] == "10.0000"
                assert prepared.inventory_impact[0]["value"] == "20.00"

                approved = service.approve(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-transfer-lifecycle-approve",
                    context=context,
                )
                assert approved.status == "approved"
                executed = service.execute(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-transfer-lifecycle-execute",
                    context=context,
                )
                assert executed.status == "succeeded"
                assert executed.resource_type == "inventory_document"
                assert executed.idempotency_replayed is False
                replayed = service.execute(
                    command_request_id=prepared.command_request_id,
                    preview_hash=prepared.preview_hash,
                    idempotency_key="pg15-transfer-lifecycle-execute-replay",
                    context=context,
                )
                assert replayed.resource_id == executed.resource_id
                assert replayed.idempotency_replayed is True

                with runtime_sessions() as session, session.begin():
                    document = session.execute(text("""
                        SELECT branch_id,destination_branch_id,status,total_abs_base_quantity,total_value
                          FROM inventory.inventory_documents WHERE org_id=:org AND id=:document
                    """), {"org": ORG, "document": executed.resource_id}).one()
                    assert tuple(document) == (
                        SOURCE_BRANCH, DESTINATION_BRANCH, "posted", Decimal("2.000000"), Decimal("20.00")
                    )
                    ledgers = session.execute(text("""
                        SELECT entry_kind,branch_id,location_id,quantity_delta,unit_cost,value_delta
                          FROM inventory.stock_ledger_entries
                         WHERE org_id=:org AND inventory_document_id=:document
                         ORDER BY entry_kind
                    """), {"org": ORG, "document": executed.resource_id}).all()
                    assert [tuple(row) for row in ledgers] == [
                        ("transfer_in", DESTINATION_BRANCH, DESTINATION_LOCATION,
                         Decimal("2.000000"), Decimal("10.0000"), Decimal("20.00")),
                        ("transfer_out", SOURCE_BRANCH, SOURCE_LOCATION,
                         Decimal("-2.000000"), Decimal("10.0000"), Decimal("-20.00")),
                    ]
                    balances = session.execute(text("""
                        SELECT branch_id,location_id,on_hand_quantity,inventory_value,average_unit_cost
                          FROM inventory.stock_balances
                         WHERE org_id=:org AND product_id=:product AND batch_id=:batch
                         ORDER BY branch_id
                    """), {"org": ORG, "product": PRODUCT, "batch": BATCH}).all()
                    assert {tuple(row) for row in balances} == {
                        (SOURCE_BRANCH, SOURCE_LOCATION, Decimal("3.000000"), Decimal("30.00"), Decimal("10.0000")),
                        (DESTINATION_BRANCH, DESTINATION_LOCATION, Decimal("2.000000"), Decimal("20.00"), Decimal("10.0000")),
                    }
                    assert session.scalar(text("""
                        SELECT count(*) FROM inventory.stock_ledger_entries
                         WHERE org_id=:org AND inventory_document_id=:document
                    """), {"org": ORG, "document": executed.resource_id}) == 2
                    assert session.scalar(
                        text("SELECT count(*) FROM core.organizations WHERE id=:other_org"),
                        {"other_org": OTHER_ORG},
                    ) == 0

                try:
                    service.prepare(
                        policy=ACTION_POLICIES["inventory.transfer.prepare"],
                        payload=payload,
                        idempotency_key="pg15-transfer-branch-denied",
                        context=_context(grant_id=LIMITED_AGENT_GRANT, limited=True),
                    )
                except OperatorActionError as error:
                    assert error.code in {ActionErrorCode.SCOPE_DENIED, ActionErrorCode.BRANCH_DENIED}
                else:
                    raise AssertionError("source-only runtime grant prepared an inter-branch transfer")
            finally:
                if outer.is_active:
                    outer.rollback()
                connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
