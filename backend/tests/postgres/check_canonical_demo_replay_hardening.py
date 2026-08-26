"""Exercise canonical-demo setting and deterministic-authority replay on PostgreSQL 15.

The fixture executes the real typed setting replacement command twice,
verifies its idempotency lineage, and simulates a later run after the 30-day
grant window to prove fresh access/agent authority is issued without rewriting
terminal evidence. Every row is rolled back and the script refuses to choose a
database itself.
"""

from __future__ import annotations

import hashlib
import json
import os
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import psycopg2
from psycopg2.extras import register_uuid
from sqlalchemy.engine import make_url

from scripts import provision_canonical_demo as fixture


register_uuid()



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


def _assert_bootstrap_repairs_stale_auth_bindings() -> None:
    """A crash-bound ephemeral binding cannot block the next demo bootstrap."""

    _configure_fixture_ids()
    stale_reviewer_auth_user = uuid4()
    stale_operator_auth_user = uuid4()
    connection = _connect()
    try:
        fixture.bootstrap_identity(connection, organization_pan="VVVVV6666V")
        with connection.cursor() as cursor:
            cursor.execute("RESET ROLE")
            cursor.execute(
                "INSERT INTO auth.users(id) VALUES (%s),(%s)",
                (stale_reviewer_auth_user, stale_operator_auth_user),
            )
            _set_owner_context(cursor)
            cursor.execute(
                """
                UPDATE core.users
                   SET auth_user_id=CASE id
                         WHEN %s::uuid THEN %s::uuid
                         WHEN %s::uuid THEN %s::uuid
                       END,
                       updated_at=transaction_timestamp(),row_version=row_version+1
                 WHERE id IN (%s::uuid,%s::uuid)
                """,
                (
                    fixture.IDS["reviewer_user"],
                    stale_reviewer_auth_user,
                    fixture.IDS["operator_user"],
                    stale_operator_auth_user,
                    fixture.IDS["reviewer_user"],
                    fixture.IDS["operator_user"],
                ),
            )
            assert cursor.rowcount == 2
            cursor.execute(
                "SELECT max(chain_sequence) FROM core.audit_events WHERE org_id=%s",
                (fixture.IDS["org"],),
            )
            prior_audit_sequence = cursor.fetchone()[0]
            assert isinstance(prior_audit_sequence, int)
            # Model a fresh owner connection. bootstrap_identity supplies the
            # organization/request audit boundary before repairing core.users;
            # it must not depend on the stale membership being activatable.
            for setting in (
                "app.auth_user_id",
                "app.user_id",
                "app.membership_id",
            ):
                cursor.execute("SELECT set_config(%s,'',true)", (setting,))
            cursor.execute("RESET ROLE")

        fixture.bootstrap_identity(connection, organization_pan="VVVVV6666V")
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id::text,auth_user_id::text,status
                  FROM core.users
                 WHERE id IN (%s::uuid,%s::uuid)
                 ORDER BY id
                """,
                (fixture.IDS["reviewer_user"], fixture.IDS["operator_user"]),
            )
            assert set(cursor.fetchall()) == {
                (
                    fixture.IDS["reviewer_user"],
                    fixture.IDS["reviewer_auth_user"],
                    "active",
                ),
                (
                    fixture.IDS["operator_user"],
                    fixture.IDS["operator_auth_user"],
                    "active",
                ),
            }
            cursor.execute(
                """
                SELECT count(*),bool_and(actor_kind='migration'),
                       bool_and(actor_membership_id IS NULL),
                       bool_and(request_id=%s::uuid)
                  FROM core.audit_events
                 WHERE org_id=%s AND resource_type='core.users'
                   AND resource_id IN (%s::uuid,%s::uuid)
                   AND mutation_kind='update'
                   AND request_id=%s::uuid
                   AND chain_sequence>%s
                """,
                (
                    fixture.IDS["request"],
                    fixture.IDS["org"],
                    fixture.IDS["reviewer_user"],
                    fixture.IDS["operator_user"],
                    fixture.IDS["request"],
                    prior_audit_sequence,
                ),
            )
            audit = cursor.fetchone()
            assert audit[0] >= 2
            assert audit[1:] == (True, True, True), audit
            cursor.execute("RESET ROLE")
            cursor.execute(
                "SELECT count(*) FROM auth.users WHERE id IN (%s,%s)",
                (stale_reviewer_auth_user, stale_operator_auth_user),
            )
            assert cursor.fetchone() == (2,)
    finally:
        connection.rollback()
        connection.close()


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
    _assert_bootstrap_repairs_stale_auth_bindings()
    _assert_setting_replacement_replay()
    _assert_deterministic_authority_renews_after_expiry()
    _assert_itc_reversal_authority_replays_across_ui_runs()


if __name__ == "__main__":
    main()
