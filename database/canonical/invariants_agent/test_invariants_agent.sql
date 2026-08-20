\set ON_ERROR_STOP on
-- Preconditions: the complete canonical baseline and every reviewed mapping
-- have been applied to a disposable PostgreSQL 15 database.

BEGIN;

-- Bootstrap the circular organization/membership fixture as the disposable
-- database superuser. Runtime tests below restore every trigger.
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id) VALUES
    ('10000000-0000-0000-0000-000000000001'),
    ('10000000-0000-0000-0000-000000000002');
INSERT INTO core.users (id, auth_user_id, display_name) VALUES
    ('10000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Command Subject'),
    ('10000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000002', 'Command Approver');

SET CONSTRAINTS ALL DEFERRED;
INSERT INTO core.organizations (
    id, legal_name, registered_address_line1, registered_city,
    registered_state_code, registered_postal_code, status,
    created_by_membership_id, updated_by_membership_id
) VALUES (
    '10000000-0000-0000-0000-000000000020', 'Follow-up Invariant Org',
    '1 Review Road', 'Pune', '27', '411001', 'active',
    '10000000-0000-0000-0000-000000000021',
    '10000000-0000-0000-0000-000000000021'
);
INSERT INTO core.memberships (
    org_id, id, user_id, status, joined_at,
    created_by_membership_id, updated_by_membership_id
) VALUES
    ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000021',
     '10000000-0000-0000-0000-000000000011', 'active', transaction_timestamp(),
     '10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021'),
    ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000022',
     '10000000-0000-0000-0000-000000000012', 'active', transaction_timestamp(),
     '10000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000021');
SET CONSTRAINTS ALL IMMEDIATE;

SELECT set_config('app.org_id', '10000000-0000-0000-0000-000000000020', true);
SELECT set_config('app.membership_id', '10000000-0000-0000-0000-000000000021', true);
SELECT set_config('app.request_id', '10000000-0000-0000-0000-000000000099', true);

INSERT INTO core.roles (
    org_id, id, code, name, status, created_by_membership_id, updated_by_membership_id
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000030',
    'fixture_approver', 'Fixture Approver', 'active',
    '10000000-0000-0000-0000-000000000021',
    '10000000-0000-0000-0000-000000000021'
);
INSERT INTO core.role_permissions (
    org_id, role_id, permission_code, created_by_membership_id
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000030',
    'automation.command.approve',
    '10000000-0000-0000-0000-000000000021'
);
INSERT INTO core.access_grants (
    org_id, id, membership_id, role_id, scope_kind, status,
    created_by_membership_id
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000031',
    '10000000-0000-0000-0000-000000000022',
    '10000000-0000-0000-0000-000000000030',
    'organization', 'active',
    '10000000-0000-0000-0000-000000000021'
);

SET LOCAL session_replication_role = origin;

DO $seed_audit$
DECLARE
    fixture_org constant uuid := '10000000-0000-0000-0000-000000000020';
    fixture_actor constant uuid := '10000000-0000-0000-0000-000000000021';
    fixture_resource constant uuid := '10000000-0000-0000-0000-000000000041';
    before_hash constant bytea := decode(repeat('11', 32), 'hex');
    first_after_hash constant bytea := decode(repeat('11', 32), 'hex');
    second_after_hash constant bytea := decode(repeat('22', 32), 'hex');
    canonical_event jsonb;
    first_evidence_hash bytea;
BEGIN
    canonical_event := pg_catalog.jsonb_build_object(
        'version', 'pg-jsonb-sha256-v1', 'org_id', fixture_org,
        'chain_sequence', 1, 'request_id', '10000000-0000-0000-0000-000000000042'::uuid,
        'command_request_id', NULL, 'actor_membership_id', fixture_actor,
        'actor_kind', 'membership', 'event_type', 'fixture.created',
        'resource_type', 'fixture', 'resource_id', fixture_resource,
        'mutation_kind', 'insert', 'before_state_hash', NULL,
        'after_state_hash', pg_catalog.encode(first_after_hash, 'hex'),
        'previous_event_hash', NULL
    );
    first_evidence_hash := pg_catalog.sha256(pg_catalog.convert_to(canonical_event::text, 'UTF8'));
    INSERT INTO core.audit_events (
        org_id, id, chain_sequence, actor_membership_id, actor_kind, event_type,
        resource_type, resource_id, request_id, mutation_kind, summary,
        evidence_version, after_state_hash, evidence_hash
    ) VALUES (
        fixture_org, '10000000-0000-0000-0000-000000000040', 1,
        fixture_actor, 'membership', 'fixture.created', 'fixture', fixture_resource,
        '10000000-0000-0000-0000-000000000042', 'insert', 'first event',
        'pg-jsonb-sha256-v1', first_after_hash, first_evidence_hash
    );

    canonical_event := pg_catalog.jsonb_build_object(
        'version', 'pg-jsonb-sha256-v1', 'org_id', fixture_org,
        'chain_sequence', 2, 'request_id', '10000000-0000-0000-0000-000000000044'::uuid,
        'command_request_id', NULL, 'actor_membership_id', fixture_actor,
        'actor_kind', 'membership', 'event_type', 'fixture.updated',
        'resource_type', 'fixture', 'resource_id', fixture_resource,
        'mutation_kind', 'update', 'before_state_hash', pg_catalog.encode(before_hash, 'hex'),
        'after_state_hash', pg_catalog.encode(second_after_hash, 'hex'),
        'previous_event_hash', pg_catalog.encode(first_evidence_hash, 'hex')
    );
    INSERT INTO core.audit_events (
        org_id, id, chain_sequence, actor_membership_id, actor_kind, event_type,
        resource_type, resource_id, request_id, mutation_kind, summary,
        evidence_version, before_state_hash, after_state_hash, evidence_hash,
        previous_event_hash
    ) VALUES (
        fixture_org, '10000000-0000-0000-0000-000000000043', 2,
        fixture_actor, 'membership', 'fixture.updated', 'fixture', fixture_resource,
        '10000000-0000-0000-0000-000000000044', 'update', 'second event',
        'pg-jsonb-sha256-v1', before_hash, second_after_hash,
        pg_catalog.sha256(pg_catalog.convert_to(canonical_event::text, 'UTF8')),
        first_evidence_hash
    );
END
$seed_audit$;
DO $test$
DECLARE
    first_hash bytea;
    second_previous bytea;
    first_sequence bigint;
    second_sequence bigint;
BEGIN
    SELECT evidence_hash, chain_sequence INTO first_hash, first_sequence FROM core.audit_events
     WHERE id = '10000000-0000-0000-0000-000000000040';
    SELECT previous_event_hash, chain_sequence INTO second_previous, second_sequence FROM core.audit_events
     WHERE id = '10000000-0000-0000-0000-000000000043';
    IF pg_catalog.octet_length(first_hash) <> 32
       OR second_previous IS DISTINCT FROM first_hash
       OR first_sequence <> 1 OR second_sequence <> 2 THEN
        RAISE EXCEPTION 'audit chain was not computed';
    END IF;
    BEGIN
        UPDATE core.audit_events SET summary = 'tampered'
         WHERE id = '10000000-0000-0000-0000-000000000040';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'audit update was accepted';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        NULL;
    END;
END
$test$;

INSERT INTO parties.parties (org_id, id, party_kind, legal_name, status)
VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000050',
    'organization', 'Fixture Manufacturer', 'draft'
);

-- Regulated references are importer-only in production. This rolled-back
-- fixture seeds the minimum FK authority without claiming an official import.
ALTER TABLE core.reference_data_releases DISABLE TRIGGER USER;
-- A repeatable live fixture may run after staging has imported reviewed
-- authority. Temporarily retire any active rows that would occupy the same
-- partial-unique slots; the outer rollback restores them unchanged.
UPDATE core.reference_data_releases
   SET status = 'superseded'
 WHERE dataset_kind IN ('ingredient_classification', 'hsn_sac_tax')
   AND status = 'active';
INSERT INTO core.reference_data_releases (
    id, dataset_kind, ruleset_version, source_authority, source_uri,
    source_storage_bucket, source_storage_object_path, source_media_type,
    source_document_sha256, dataset_storage_bucket, dataset_storage_object_path,
    dataset_media_type, dataset_sha256, record_count, publication_date,
    effective_from, reviewed_by_user_id, reviewed_at, status
) VALUES
(
    '10000000-0000-0000-0000-000000000054', 'ingredient_classification',
    'fixture-classification-v1', 'cdsco', 'https://cdsco.gov.in/fixture',
    'fixture', 'regulated/source.json', 'application/json', decode(repeat('91', 32), 'hex'),
    'fixture', 'regulated/dataset.json', 'application/json', decode(repeat('92', 32), 'hex'),
    1, DATE '2026-01-01', DATE '2026-01-01',
    '10000000-0000-0000-0000-000000000011', transaction_timestamp(), 'active'
),
(
    '10000000-0000-0000-0000-000000000055', 'hsn_sac_tax',
    'fixture-tax-v1', 'cbic', 'https://cbic-gst.gov.in/fixture',
    'fixture', 'regulated/tax-source.json', 'application/json', decode(repeat('93', 32), 'hex'),
    'fixture', 'regulated/tax-dataset.json', 'application/json', decode(repeat('94', 32), 'hex'),
    1, DATE '2026-01-01', DATE '2026-01-01',
    '10000000-0000-0000-0000-000000000011', transaction_timestamp(), 'active'
);
ALTER TABLE catalog.ingredients DISABLE TRIGGER USER;
INSERT INTO catalog.ingredients (
    id, release_id, canonical_name, normalized_name, drugs_rules_schedule,
    ndps_classification, classification_ruleset_version, effective_from
) VALUES (
    '10000000-0000-0000-0000-000000000051',
    '10000000-0000-0000-0000-000000000054', 'Fixture Ingredient',
    'fixture ingredient', 'NONE', 'NONE', 'fixture-classification-v1', DATE '2026-01-01'
);
INSERT INTO catalog.products (
    org_id, id, sku, product_kind, name, manufacturer_party_id,
    base_uom_code, hsn_code, drug_schedule, requires_prescription,
    ndps_regulated, regulatory_ruleset_version, hsn_release_id, status
) VALUES
    ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000052',
     'FIXTURE-VALID', 'medicine', 'Fixture Medicine',
     '10000000-0000-0000-0000-000000000050', 'EA', '3004', 'NONE', false, false,
     'fixture-not-applicable-v1', '10000000-0000-0000-0000-000000000055', 'draft'),
    ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000053',
     'FIXTURE-EMPTY', 'medicine', 'Empty Medicine',
     '10000000-0000-0000-0000-000000000050', 'EA', '3004', 'NONE', false, false,
     'fixture-not-applicable-v1', '10000000-0000-0000-0000-000000000055', 'draft');
INSERT INTO catalog.product_ingredients (
    org_id, product_id, ingredient_id, sequence_number, ingredient_role,
    strength_value, strength_uom_code, basis_quantity, basis_uom_code
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000052',
    '10000000-0000-0000-0000-000000000051', 1, 'active', 10, 'MG', 1, 'EA'
);
-- Product activation itself has a separate reviewed rollback suite. Keep that
-- command boundary out of this lower-level composition/first-use fixture.
ALTER TABLE catalog.products
    DISABLE TRIGGER products_regulatory_classification_guard;
UPDATE catalog.products SET status = 'active'
 WHERE id = '10000000-0000-0000-0000-000000000052';
DO $test$
BEGIN
    BEGIN
        UPDATE catalog.products SET status = 'active'
         WHERE id = '10000000-0000-0000-0000-000000000053';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'medicine without composition was activated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    UPDATE catalog.products SET first_used_at = transaction_timestamp()
     WHERE id = '10000000-0000-0000-0000-000000000052';
    BEGIN
        UPDATE catalog.products SET hsn_code = '300490'
         WHERE id = '10000000-0000-0000-0000-000000000052';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'post-first-use HSN mutation was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    BEGIN
        DELETE FROM catalog.product_ingredients
         WHERE product_id = '10000000-0000-0000-0000-000000000052';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'post-first-use composition mutation was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO automation.agent_grants (
    org_id, id, subject_membership_id, client_id, client_display_name,
    authorization_mode, consent_version, consent_text_hash,
    consented_by_membership_id, consented_at, granted_by_membership_id,
    granted_at, expires_at, status
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000060',
    '10000000-0000-0000-0000-000000000021', 'fixture-client', 'Fixture Client',
    'self_consent', 'v1', decode(repeat('33', 32), 'hex'),
    '10000000-0000-0000-0000-000000000021', transaction_timestamp(),
    '10000000-0000-0000-0000-000000000021', transaction_timestamp(),
    transaction_timestamp() + interval '1 hour', 'active'
);
INSERT INTO automation.agent_grant_capabilities (
    org_id, agent_grant_id, capability_code, operation_mode,
    risk_class, approval_policy
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000060',
    'fixture.write', 'write', 'consequential_write', 'separate_approver'
);

-- This fixture exercises the lower-level approval invariants with a synthetic
-- operation. Reviewed prepare/approval authority has its own rollback suite.
ALTER TABLE automation.command_requests
    DISABLE TRIGGER command_requests_exact_capability_guard;
ALTER TABLE automation.command_requests
    DISABLE TRIGGER command_requests_prepare_scope_guard;
ALTER TABLE automation.command_requests
    DISABLE TRIGGER command_requests_execution_guard;
ALTER TABLE automation.command_approvals
    DISABLE TRIGGER command_approvals_reviewed_write_guard;
INSERT INTO automation.command_requests (
    org_id, id, agent_grant_id, requested_by_membership_id,
    capability_code, operation, operation_mode,
    target_resource_type, target_resource_id, target_row_version,
    serializer_version, idempotency_key_hash,
    request_media_type, request_bytes, request_hash,
    preview_media_type, preview_bytes, preview_hash,
    aggregate_version_hash,
    risk_class, approval_policy, required_approval_count, expires_at
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000060',
    '10000000-0000-0000-0000-000000000021',
    'fixture.write', 'fixture.create', 'write',
    'fixture', '10000000-0000-0000-0000-000000000062', 1,
    'fixture-v1', decode(repeat('44', 32), 'hex'),
    'application/json', convert_to('{}', 'UTF8'), decode(repeat('55', 32), 'hex'),
    'application/json', convert_to('{}', 'UTF8'), decode(repeat('66', 32), 'hex'),
    decode(repeat('69', 32), 'hex'),
    'consequential_write', 'separate_approver', 1,
    transaction_timestamp() + interval '30 minutes'
);
DO $test$
BEGIN
    BEGIN
        INSERT INTO automation.command_approvals (
            org_id, command_request_id, approver_membership_id, decision,
            preview_hash, aggregate_version_hash, authentication_strength,
            idempotency_key_hash, valid_until_at
        ) VALUES (
            '10000000-0000-0000-0000-000000000020',
            '10000000-0000-0000-0000-000000000061',
            '10000000-0000-0000-0000-000000000021', 'approved',
            decode(repeat('66', 32), 'hex'), decode(repeat('69', 32), 'hex'),
            'reauthenticated', decode(repeat('67', 32), 'hex'),
            transaction_timestamp() + interval '15 minutes'
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'same-subject separate approval was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;
INSERT INTO automation.command_approvals (
    org_id, command_request_id, approver_membership_id, decision,
    preview_hash, aggregate_version_hash, authentication_strength,
    idempotency_key_hash, valid_until_at
) VALUES (
    '10000000-0000-0000-0000-000000000020',
    '10000000-0000-0000-0000-000000000061',
    '10000000-0000-0000-0000-000000000022', 'approved',
    decode(repeat('66', 32), 'hex'), decode(repeat('69', 32), 'hex'),
    'reauthenticated', decode(repeat('68', 32), 'hex'),
    transaction_timestamp() + interval '15 minutes'
);

UPDATE core.organizations SET status = 'closed'
 WHERE id = '10000000-0000-0000-0000-000000000020';
DO $test$
BEGIN
    BEGIN
        UPDATE core.organizations SET trade_name = 'mutated after closure'
         WHERE id = '10000000-0000-0000-0000-000000000020';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'closed organization mutation was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

ROLLBACK;
