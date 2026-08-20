-- Canonical trigger-plumbing foundations
-- REVIEWED FOUNDATION ONLY: no trigger_plumbing blocker is resolved by this file.
-- canonical_catalog_sha256: 72ba19903909d9802288bc710683ca5ef9e4fa3fe42c756516580cc69d441e1f
-- Apply only after a disposable canonical baseline and security contract exist.

BEGIN;

CREATE SCHEMA erp_plumbing AUTHORIZATION erp_migration_owner;
REVOKE ALL ON SCHEMA erp_plumbing FROM PUBLIC, erp_app, erp_runtime;

CREATE TABLE erp_plumbing.trigger_bindings (
    source_table regclass NOT NULL,
    binding_kind text NOT NULL CHECK (binding_kind IN ('immutability','audit','outbox')),
    trigger_name name NOT NULL,
    contract_sha256 varchar(64) NOT NULL CHECK (contract_sha256 ~ '^[0-9a-f]{64}$'),
    installed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (source_table, binding_kind, trigger_name)
);
ALTER TABLE erp_plumbing.trigger_bindings OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE erp_plumbing.trigger_bindings FROM PUBLIC, erp_app, erp_runtime;

CREATE FUNCTION erp_plumbing.reject_row_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $reject_row_mutation$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = 'integrity_constraint_violation',
        MESSAGE = pg_catalog.format('%s rejects %s; use its reviewed reversal or supersession command', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, TG_OP);
END
$reject_row_mutation$;

CREATE FUNCTION erp_plumbing.enqueue_outbox_event(
    p_organization_id uuid,
    p_event_type varchar(128),
    p_aggregate_type varchar(64),
    p_aggregate_id uuid,
    p_event_version integer,
    p_media_type varchar(128),
    p_payload_bytes bytea,
    p_payload_hash bytea,
    p_available_at timestamptz DEFAULT transaction_timestamp()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $enqueue_outbox_event$
DECLARE
    event_id uuid;
    existing core.outbox_events%ROWTYPE;
BEGIN
    INSERT INTO core.outbox_events (
        org_id, event_type, aggregate_type, aggregate_id, event_version,
        media_type, payload_bytes, payload_hash, available_at
    ) VALUES (
        p_organization_id, p_event_type, p_aggregate_type, p_aggregate_id, p_event_version,
        p_media_type, p_payload_bytes, p_payload_hash, p_available_at
    )
    ON CONFLICT ON CONSTRAINT outbox_events_aggregate_version_uq DO NOTHING
    RETURNING id INTO event_id;

    IF event_id IS NOT NULL THEN
        RETURN event_id;
    END IF;

    SELECT * INTO STRICT existing
    FROM core.outbox_events AS event
    WHERE event.org_id = p_organization_id
      AND event.aggregate_type = p_aggregate_type
      AND event.aggregate_id = p_aggregate_id
      AND event.event_type = p_event_type
      AND event.event_version = p_event_version;

    IF existing.media_type IS DISTINCT FROM p_media_type
       OR existing.payload_bytes IS DISTINCT FROM p_payload_bytes
       OR existing.payload_hash IS DISTINCT FROM p_payload_hash THEN
        RAISE EXCEPTION USING
            ERRCODE = 'unique_violation',
            MESSAGE = 'outbox aggregate version was reused with a different payload';
    END IF;
    RETURN existing.id;
END
$enqueue_outbox_event$;

ALTER FUNCTION erp_plumbing.reject_row_mutation() OWNER TO erp_migration_owner;
ALTER FUNCTION erp_plumbing.enqueue_outbox_event(uuid, varchar, varchar, uuid, integer, varchar, bytea, bytea, timestamptz) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_plumbing.reject_row_mutation() FROM PUBLIC, erp_app, erp_runtime;
REVOKE ALL ON FUNCTION erp_plumbing.enqueue_outbox_event(uuid, varchar, varchar, uuid, integer, varchar, bytea, bytea, timestamptz) FROM PUBLIC, erp_app, erp_runtime;

COMMIT;
