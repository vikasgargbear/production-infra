"""Exercise canonical-demo aggregation and setting replay on PostgreSQL 15.

The fixture extracts the receipt-ceiling SQL from the production provisioner,
uses two independent supplier-invoice allocations, and proves the exact
remaining quantities/value.  It also executes the real typed setting
replacement command twice, verifies its idempotency lineage, and simulates a
later run after the 30-day grant window to prove fresh access/agent authority
is issued without rewriting terminal evidence. Every row is rolled back and
the script refuses to choose a database itself.
"""

from __future__ import annotations

import hashlib
import json
import os
from decimal import Decimal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import psycopg2
from psycopg2.extras import register_uuid
from sqlalchemy.engine import make_url

from scripts import provision_canonical_demo as fixture


register_uuid()


ORG = UUID("fa000000-0000-7000-8000-000000000001")
MEMBERSHIP = UUID("fa000000-0000-7000-8000-000000000002")
GOODS_RECEIPT = UUID("fa000000-0000-7000-8000-000000000003")
GOODS_RECEIPT_LINE = UUID("fa000000-0000-7000-8000-000000000004")
PORTAL_DOCUMENT = UUID("fa000000-0000-7000-8000-000000000005")
PORTAL_LINE = UUID("fa000000-0000-7000-8000-000000000006")
INVOICE_NUMBER = "PG15-MULTI-ALLOCATION"
INVOICE_DATE = "2026-08-25"


def _connect():
    url = make_url(os.environ["DATABASE_URL"])
    return psycopg2.connect(
        host=url.host,
        port=url.port or 5432,
        dbname=url.database,
        user=url.username,
        password=url.password or "",
    )


def _receipt_ceiling_sql() -> str:
    return next(
        value
        for value in fixture.reconcile_supplier_invoice_ui_fixture.__code__.co_consts
        if isinstance(value, str) and "WITH receipt_ceiling AS (" in value
    )


def _assert_numeric_multi_allocation_ceiling() -> None:
    tables = (
        "procurement.goods_receipts",
        "procurement.goods_receipt_lines",
        "procurement.supplier_invoice_receipt_allocations",
        "tax.portal_documents",
        "tax.portal_document_lines",
    )
    connection = _connect()
    try:
        with connection.cursor() as cursor:
            for table in tables:
                cursor.execute(f"ALTER TABLE {table} DISABLE TRIGGER ALL")
            try:
                cursor.execute(
                    """
                    INSERT INTO procurement.goods_receipts(
                      org_id,id,branch_id,supplier_account_id,goods_receipt_number,
                      fiscal_year,received_at,supplier_challan_number,
                      supplier_challan_date,status,posted_at,posted_by_membership_id,
                      created_by_membership_id,updated_by_membership_id)
                    VALUES (%s,%s,%s,%s,'PG15-GRN-0001',2026,
                      transaction_timestamp(),'PG15-CHALLAN-0001',DATE '2026-08-25',
                      'posted',transaction_timestamp(),%s,%s,%s)
                    """,
                    (
                        ORG,
                        GOODS_RECEIPT,
                        uuid4(),
                        uuid4(),
                        MEMBERSHIP,
                        MEMBERSHIP,
                        MEMBERSHIP,
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO procurement.goods_receipt_lines(
                      org_id,id,goods_receipt_id,line_number,product_id,batch_id,
                      location_id,uom_code,received_quantity,accepted_quantity,
                      rejected_quantity,free_quantity,base_accepted_quantity,
                      base_free_quantity,qc_status,unit_cost,extended_cost,
                      created_by_membership_id)
                    VALUES (%s,%s,%s,1,%s,%s,%s,'EA',50,50,0,2.5,50,2.5,
                      'accepted',95.2381,5000.00,%s)
                    """,
                    (
                        ORG,
                        GOODS_RECEIPT_LINE,
                        GOODS_RECEIPT,
                        uuid4(),
                        uuid4(),
                        uuid4(),
                        MEMBERSHIP,
                    ),
                )
                cursor.executemany(
                    """
                    INSERT INTO procurement.supplier_invoice_receipt_allocations(
                      org_id,id,supplier_invoice_line_id,goods_receipt_line_id,
                      allocated_base_billed_quantity,allocated_base_free_quantity,
                      created_by_membership_id)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    """,
                    (
                        (
                            ORG,
                            uuid4(),
                            uuid4(),
                            GOODS_RECEIPT_LINE,
                            Decimal("10"),
                            Decimal("0.5"),
                            MEMBERSHIP,
                        ),
                        (
                            ORG,
                            uuid4(),
                            uuid4(),
                            GOODS_RECEIPT_LINE,
                            Decimal("5"),
                            Decimal("0.25"),
                            MEMBERSHIP,
                        ),
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO tax.portal_documents(
                      org_id,id,registration_id,return_period_id,
                      portal_document_type,portal_generation_date,
                      source_attachment_id,source_sha256,status,parsed_at,
                      created_by_membership_id)
                    VALUES (%s,%s,%s,%s,'gstr2b',DATE '2026-08-25',%s,
                      decode(repeat('ab',32),'hex'),'parsed',transaction_timestamp(),%s)
                    """,
                    (ORG, PORTAL_DOCUMENT, uuid4(), uuid4(), uuid4(), MEMBERSHIP),
                )
                cursor.execute(
                    """
                    INSERT INTO tax.portal_document_lines(
                      org_id,id,portal_document_id,line_number,supplier_gstin,
                      counterparty_name,invoice_number,invoice_date,document_type,
                      place_of_supply_state_code,taxable_amount,cgst_amount,
                      sgst_amount,igst_amount,cess_amount,total_amount,
                      portal_reference,source_row_hash,created_by_membership_id)
                    VALUES (%s,%s,%s,1,'27DEMOC5678D1Z5','PG15 Supplier',%s,%s,
                      'invoice','27',5000,300,300,0,0,5600,'PG15-GSTR2B',
                      decode(repeat('cd',32),'hex'),%s)
                    """,
                    (
                        ORG,
                        PORTAL_LINE,
                        PORTAL_DOCUMENT,
                        INVOICE_NUMBER,
                        INVOICE_DATE,
                        MEMBERSHIP,
                    ),
                )
            finally:
                for table in reversed(tables):
                    cursor.execute(f"ALTER TABLE {table} ENABLE TRIGGER ALL")

            cursor.execute(
                _receipt_ceiling_sql(),
                (
                    ORG,
                    GOODS_RECEIPT,
                    GOODS_RECEIPT_LINE,
                    ORG,
                    INVOICE_NUMBER,
                    INVOICE_DATE,
                    ORG,
                    PORTAL_LINE,
                ),
            )
            row = cursor.fetchone()
            assert row is not None
            values = dict(zip((column.name for column in cursor.description), row))
            assert values["goods_receipt_id"] == GOODS_RECEIPT
            assert values["goods_receipt_line_id"] == GOODS_RECEIPT_LINE
            assert values["remaining_base_billed_quantity"] == Decimal("35.000000")
            assert values["remaining_base_free_quantity"] == Decimal("1.750000")
            assert values["remaining_capitalized_value"] == Decimal("3500.00")
            assert values["candidate_count"] == 1
            assert values["portal_document_line_id"] == str(PORTAL_LINE)
            assert values["consumed_count"] == 0
    finally:
        connection.rollback()
        connection.close()


def _configure_fixture_ids() -> None:
    namespace = uuid4()
    for key in tuple(fixture.IDS):
        fixture.IDS[key] = str(uuid5(namespace, key))
    fixture.CLIENT_ID = f"pg15-demo-replay-{namespace}"


def _set_owner_context(cursor) -> None:
    cursor.execute('SET LOCAL ROLE "erp_migration_owner"')
    for setting, value in (
        ("app.org_id", fixture.IDS["org"]),
        ("app.membership_id", fixture.IDS["reviewer_membership"]),
        ("app.user_id", fixture.IDS["reviewer_user"]),
        ("app.auth_user_id", fixture.IDS["reviewer_auth_user"]),
        ("app.request_id", fixture.IDS["request"]),
    ):
        cursor.execute("SELECT set_config(%s,%s,true)", (setting, value))


def _restore_user_triggers(control, tables: list[str]) -> None:
    """Attempt every restoration and prove no reviewed trigger remains disabled."""

    errors: list[tuple[str, BaseException]] = []
    try:
        with control.cursor() as cursor:
            for table in reversed(tables):
                try:
                    cursor.execute(f"ALTER TABLE {table} ENABLE TRIGGER USER")
                    cursor.execute(
                        """
                        SELECT count(*)
                          FROM pg_catalog.pg_trigger
                         WHERE tgrelid=%s::regclass
                           AND NOT tgisinternal AND tgenabled<>'O'
                        """,
                        (table,),
                    )
                    if cursor.fetchone() != (0,):
                        raise AssertionError(
                            f"{table} retained a disabled user trigger"
                        )
                except BaseException as exc:
                    errors.append((table, exc))
                    # Each autocommit statement is independent, but normalize
                    # connection state before attempting the remaining tables.
                    try:
                        control.rollback()
                    except BaseException as rollback_error:
                        errors.append((f"{table} rollback", rollback_error))
    finally:
        control.close()
    if errors:
        detail = "; ".join(
            f"{table}: {type(error).__name__}" for table, error in errors
        )
        raise RuntimeError(
            f"Could not restore PostgreSQL user triggers: {detail}"
        ) from errors[0][1]


def _assert_setting_replacement_replay() -> None:
    _configure_fixture_ids()
    source_id = uuid4()
    replacement_id = uuid4()
    connection = _connect()
    try:
        fixture.bootstrap_identity(connection, organization_pan="ZZZZZ9999Z")
        with connection.cursor() as cursor:
            _set_owner_context(cursor)
            cursor.execute(
                """
                INSERT INTO core.settings(
                  org_id,id,scope_kind,branch_id,namespace,key,value_type,
                  value_text,status,created_by_membership_id,
                  updated_by_membership_id)
                VALUES (%s,%s,'organization',NULL,'finance.account_roles',
                  'pg15_reimbursement_fixture','text','old-account','active',%s,%s)
                """,
                (
                    fixture.IDS["org"],
                    source_id,
                    fixture.IDS["reviewer_membership"],
                    fixture.IDS["reviewer_membership"],
                ),
            )
            request = json.dumps(
                {
                    "operation": "core.setting.replace",
                    "organization_id": fixture.IDS["org"],
                    "setting_id": str(source_id),
                    "replacement_id": str(replacement_id),
                    "expected_row_version": 1,
                    "value_type": "text",
                    "value_text": "new-account",
                },
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
            key_hash = hashlib.sha256(request).digest()
            statement = """
                SELECT erp_core_commands.replace_setting(
                  %s,%s,%s,1,'text','new-account',NULL,NULL,NULL,NULL,%s,
                  transaction_timestamp()+interval '24 hours')
            """
            parameters = (
                fixture.IDS["org"],
                source_id,
                replacement_id,
                psycopg2.Binary(key_hash),
            )
            cursor.execute(statement, parameters)
            assert cursor.fetchone() == (replacement_id,)
            cursor.execute(statement, parameters)
            assert cursor.fetchone() == (replacement_id,)
            cursor.execute(
                """
                SELECT id,status,row_version,value_text
                  FROM core.settings
                 WHERE org_id=%s AND id IN (%s,%s)
                 ORDER BY id
                """,
                (fixture.IDS["org"], source_id, replacement_id),
            )
            assert set(cursor.fetchall()) == {
                (source_id, "retired", 2, "old-account"),
                (replacement_id, "active", 1, "new-account"),
            }
            cursor.execute(
                """
                SELECT count(*),min(status),min(resource_type),min(resource_id::text)
                  FROM core.idempotency_keys
                 WHERE org_id=%s AND actor_membership_id=%s
                   AND operation='core.setting.replace'
                   AND idempotency_key_hash=%s
                """,
                (
                    fixture.IDS["org"],
                    fixture.IDS["reviewer_membership"],
                    psycopg2.Binary(key_hash),
                ),
            )
            assert cursor.fetchone() == (
                1,
                "succeeded",
                "core.settings",
                str(replacement_id),
            )
    finally:
        connection.rollback()
        connection.close()


def _assert_deterministic_authority_renews_after_expiry() -> None:
    """A later run issues new grants without mutating terminal evidence."""

    _configure_fixture_ids()
    trigger_tables = (
        "core.access_grants",
        "automation.agent_grants",
    )
    control = _connect()
    control.autocommit = True
    disabled_trigger_tables: list[str] = []
    connection = None
    try:
        # Trigger state is DDL and must be established before the rollback-only
        # fixture transaction creates deferred trigger events. Keep FK/system
        # triggers enabled and restore every successfully changed table even if
        # a later disable, fixture assertion, or rollback fails.
        with control.cursor() as cursor:
            for table in trigger_tables:
                cursor.execute(f"ALTER TABLE {table} DISABLE TRIGGER USER")
                disabled_trigger_tables.append(table)
            cursor.execute(
                """
                SELECT count(*),bool_and(relrowsecurity),bool_and(relforcerowsecurity)
                  FROM pg_catalog.pg_class
                 WHERE oid=ANY(ARRAY[%s::regclass,%s::regclass])
                """,
                trigger_tables,
            )
            if cursor.fetchone() != (2, True, True):
                raise AssertionError(
                    "grant-window simulation requires forced RLS on both relations"
                )

        connection = _connect()
        fixture.bootstrap_identity(connection, organization_pan="XXXXX7777X")
        prior_access_ids = (
            fixture.IDS["reviewer_access_grant"],
            fixture.IDS["operator_access_grant"],
        )
        prior_agent_ids = (
            fixture.IDS["agent_grant"],
            fixture.IDS["legacy_approver_agent_grant"],
        )
        with connection.cursor() as cursor:
            # The lifecycle guard permits expiry only after the validity window.
            # Set the clock-bound column with triggers disabled solely to model a
            # grant whose real 30-day window elapsed between workflow attempts.
            cursor.execute(
                """
                UPDATE core.access_grants
                   SET valid_from_at=transaction_timestamp()-interval '61 days',
                       expires_at=transaction_timestamp()-interval '31 days',
                       status='expired',row_version=row_version+1
                 WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                """,
                (fixture.IDS["org"], list(prior_access_ids)),
            )
            assert cursor.rowcount == 2
            cursor.execute(
                """
                UPDATE automation.agent_grants
                   SET created_at=transaction_timestamp()-interval '62 days',
                       consented_at=transaction_timestamp()-interval '61 days',
                       granted_at=transaction_timestamp()-interval '61 days',
                       expires_at=transaction_timestamp()-interval '31 days',
                       status='expired'
                 WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                """,
                (fixture.IDS["org"], list(prior_agent_ids)),
            )
            assert cursor.rowcount == 2

        for grant_key in (
            "reviewer_access_grant",
            "operator_access_grant",
            "agent_grant",
            "legacy_approver_agent_grant",
        ):
            fixture.IDS[grant_key] = str(
                uuid5(
                    NAMESPACE_URL,
                    f"canonical-staging:{grant_key}:{fixture.IDS['org']}:future-run:2",
                )
            )
        renewed_access_ids = (
            fixture.IDS["reviewer_access_grant"],
            fixture.IDS["operator_access_grant"],
        )
        renewed_agent_ids = (
            fixture.IDS["agent_grant"],
            fixture.IDS["legacy_approver_agent_grant"],
        )
        # bootstrap_identity seeds Supabase auth as the session owner before it
        # switches to erp_migration_owner. The first bootstrap's SET LOCAL ROLE
        # remains active for this shared rollback-only transaction, so restore
        # the session role before replaying the complete bootstrap boundary.
        with connection.cursor() as cursor:
            cursor.execute("RESET ROLE")
        fixture.bootstrap_identity(connection, organization_pan="XXXXX7777X")
        with connection.cursor() as cursor:
            _set_owner_context(cursor)
            cursor.execute(
                """
                SELECT count(*),bool_and(status='active'),
                       bool_and(valid_from_at<=transaction_timestamp()),
                       bool_and(expires_at>=transaction_timestamp()+interval '29 days')
                  FROM core.access_grants
                 WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                """,
                (fixture.IDS["org"], list(renewed_access_ids)),
            )
            assert cursor.fetchone() == (2, True, True, True)
            cursor.execute(
                """
                SELECT count(*),bool_and(status='expired'),
                       bool_and(expires_at<transaction_timestamp())
                  FROM core.access_grants
                 WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                """,
                (fixture.IDS["org"], list(prior_access_ids)),
            )
            assert cursor.fetchone() == (2, True, True)
            cursor.execute(
                """
                SELECT count(*),bool_and(status='active'),
                       bool_and(granted_at<=transaction_timestamp()),
                       bool_and(expires_at>=transaction_timestamp()+interval '29 days')
                  FROM automation.agent_grants
                 WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                """,
                (fixture.IDS["org"], list(renewed_agent_ids)),
            )
            assert cursor.fetchone() == (2, True, True, True)
            cursor.execute(
                """
                SELECT count(*),bool_and(status='expired'),
                       bool_and(expires_at<transaction_timestamp())
                  FROM automation.agent_grants
                 WHERE org_id=%s AND id=ANY(CAST(%s AS uuid[]))
                """,
                (fixture.IDS["org"], list(prior_agent_ids)),
            )
            assert cursor.fetchone() == (2, True, True)
    finally:
        try:
            if connection is not None:
                try:
                    connection.rollback()
                finally:
                    connection.close()
        finally:
            _restore_user_triggers(control, disabled_trigger_tables)


def _assert_itc_reversal_authority_replays_across_ui_runs() -> None:
    _configure_fixture_ids()
    source = b"reviewed PostgreSQL ITC reversal authority"
    first_release_id = fixture.IDS["destruction_itc_rule_release"]
    first_rule_id = fixture.IDS["destruction_itc_rule_version"]
    connection = _connect()
    try:
        fixture.bootstrap_identity(connection, organization_pan="YYYYY8888Y")
        dataset_bytes = fixture.itc_reversal_dataset_bytes(connection)
        source_sha256 = hashlib.sha256(source).digest()
        dataset_sha256 = hashlib.sha256(dataset_bytes).digest()
        with connection.cursor() as cursor:
            cursor.execute("RESET ROLE")
            cursor.execute("ALTER TABLE core.reference_data_releases DISABLE TRIGGER ALL")
            cursor.execute("ALTER TABLE tax.itc_reversal_rule_versions DISABLE TRIGGER ALL")
            try:
                cursor.execute(
                    """
                    INSERT INTO core.reference_data_releases(
                      id,dataset_kind,ruleset_version,source_authority,source_uri,
                      source_storage_bucket,source_storage_object_path,source_media_type,
                      source_document_sha256,dataset_storage_bucket,
                      dataset_storage_object_path,dataset_media_type,dataset_sha256,
                      record_count,publication_date,effective_from,effective_to,
                      supersedes_release_id,reviewed_by_user_id,reviewed_at,status)
                    VALUES (%s,'gst_itc_reversal_rules',%s,'cbic',%s,
                      'pg15-fixture','itc-source.pdf','application/pdf',%s,
                      'pg15-fixture','itc-dataset.json','application/json',%s,
                      1,%s,%s,NULL,NULL,%s,transaction_timestamp(),'active')
                    """,
                    (
                        first_release_id,
                        fixture.ITC_REVERSAL_RULESET_VERSION,
                        fixture.ITC_REVERSAL_SOURCE_URI,
                        psycopg2.Binary(source_sha256),
                        psycopg2.Binary(dataset_sha256),
                        fixture.ITC_REVERSAL_SOURCE_PUBLICATION_DATE,
                        fixture.ITC_REVERSAL_EFFECTIVE_FROM,
                        fixture.IDS["reviewer_user"],
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO tax.itc_reversal_rule_versions(
                      id,release_id,rule_code,rule_version,legal_section,event_kind,
                      gstr3b_table_code,gstr3b_row_code,effective_from,effective_to,status)
                    VALUES (%s,%s,'CGST_SECTION_17_5_H_GOODS_DESTROYED',%s,
                      '17(5)(h)','goods_destroyed','4','B(1)',%s,NULL,'active')
                    """,
                    (
                        first_rule_id,
                        first_release_id,
                        fixture.ITC_REVERSAL_RULESET_VERSION,
                        fixture.ITC_REVERSAL_EFFECTIVE_FROM,
                    ),
                )
            finally:
                cursor.execute("ALTER TABLE tax.itc_reversal_rule_versions ENABLE TRIGGER ALL")
                cursor.execute("ALTER TABLE core.reference_data_releases ENABLE TRIGGER ALL")

        fixture.IDS["destruction_itc_rule_release"] = str(uuid4())
        fixture.IDS["destruction_itc_rule_version"] = str(uuid4())
        authority = fixture.resolve_existing_itc_reversal_authority(
            connection, source
        )
        assert authority is not None
        assert authority.release_id == first_release_id
        assert authority.rule_version_id == first_rule_id
        assert fixture.IDS["destruction_itc_rule_release"] == first_release_id
        assert fixture.IDS["destruction_itc_rule_version"] == first_rule_id
        replay_dataset = fixture.itc_reversal_dataset_bytes(connection)
        assert hashlib.sha256(replay_dataset).digest() == authority.dataset_sha256

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT count(*),count(DISTINCT rule.release_id),count(DISTINCT rule.id)
                  FROM tax.itc_reversal_rule_versions rule
                  JOIN core.reference_data_releases release ON release.id=rule.release_id
                 WHERE release.dataset_kind='gst_itc_reversal_rules'
                   AND release.status='active' AND rule.status='active'
                """
            )
            assert cursor.fetchone() == (1, 1, 1)
    finally:
        connection.rollback()
        connection.close()


def main() -> None:
    _assert_numeric_multi_allocation_ceiling()
    _assert_setting_replacement_replay()
    _assert_deterministic_authority_renews_after_expiry()
    _assert_itc_reversal_authority_replays_across_ui_runs()


if __name__ == "__main__":
    main()
