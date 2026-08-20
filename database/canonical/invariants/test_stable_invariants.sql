\set ON_ERROR_STOP on
-- Preconditions: a complete canonical baseline, including all reviewed mapping
-- fragments, has been applied to the disposable PostgreSQL 15 canonical_ci DB.

BEGIN;

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000001');

SET CONSTRAINTS ALL DEFERRED;
SELECT set_config('app.org_id', '00000000-0000-0000-0000-000000000010', true);
SELECT set_config('app.request_id', '00000000-0000-0000-0000-000000000011', true);

-- The first organization and its actor membership form a deferred FK cycle.
-- This fixture rolls back, so suppress only the foundational organization's
-- user triggers while leaving every tested mutation fully guarded.
ALTER TABLE core.organizations DISABLE TRIGGER USER;
INSERT INTO core.organizations (
    id, legal_name, registered_address_line1, registered_city,
    registered_state_code, registered_postal_code, status,
    created_by_membership_id, updated_by_membership_id
) VALUES (
    '00000000-0000-0000-0000-000000000010', 'Invariant Fixture Org',
    '1 Test Road', 'Pune', '27', '411001', 'active',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003'
);

INSERT INTO core.users (id, auth_user_id, display_name)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Invariant Fixture'
);

INSERT INTO core.memberships (
    org_id, id, user_id, status, joined_at,
    created_by_membership_id, updated_by_membership_id
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    'active', transaction_timestamp(),
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003'
);
SET CONSTRAINTS ALL IMMEDIATE;

SELECT set_config('app.membership_id', '00000000-0000-0000-0000-000000000003', true);

INSERT INTO core.branches (
    org_id, id, code, name, address_line1, city, state_code, postal_code, status
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000004',
    'FIXTURE', 'Fixture Branch', '1 Test Road', 'Pune', '27', '411001', 'closed'
);

DO $test$
BEGIN
    BEGIN
        UPDATE core.branches
           SET status = 'active'
         WHERE id = '00000000-0000-0000-0000-000000000004';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'closed branch reactivation was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE core.users
           SET status = 'anonymized'
         WHERE id = '00000000-0000-0000-0000-000000000002';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'anonymized user retained Auth mapping';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

DO $test$
DECLARE
    first_claim core.idempotency_keys%ROWTYPE;
    replayed_claim core.idempotency_keys%ROWTYPE;
BEGIN
    first_claim := core.claim_idempotency_key(
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000003',
        'fixture.create', decode(repeat('11', 32), 'hex'),
        decode(repeat('22', 32), 'hex'), transaction_timestamp() + interval '1 hour'
    );
    replayed_claim := core.claim_idempotency_key(
        '00000000-0000-0000-0000-000000000010',
        '00000000-0000-0000-0000-000000000003',
        'fixture.create', decode(repeat('11', 32), 'hex'),
        decode(repeat('22', 32), 'hex'), transaction_timestamp() + interval '1 hour'
    );
    IF first_claim.id IS DISTINCT FROM replayed_claim.id THEN
        RAISE EXCEPTION 'equal idempotency request did not replay its owned row';
    END IF;
    BEGIN
        PERFORM core.claim_idempotency_key(
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000003',
            'fixture.create', decode(repeat('11', 32), 'hex'),
            decode(repeat('33', 32), 'hex'), transaction_timestamp() + interval '1 hour'
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'different idempotency request reused a claim';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    UPDATE core.idempotency_keys
       SET status = 'succeeded', completed_at = transaction_timestamp(),
           response_status = 201, response_media_type = 'application/json',
           response_body = convert_to('{"ok":true}', 'UTF8'),
           response_hash = decode(repeat('44', 32), 'hex')
     WHERE id = first_claim.id;
    BEGIN
        UPDATE core.idempotency_keys SET response_status = 200 WHERE id = first_claim.id;
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'terminal idempotency response mutated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO core.outbox_events (
    org_id, id, event_type, aggregate_type, aggregate_id,
    media_type, payload_bytes, payload_hash
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000020',
    'fixture.created', 'fixture', '00000000-0000-0000-0000-000000000021',
    'application/json', convert_to('{"id":1}', 'UTF8'), decode(repeat('55', 32), 'hex')
);
UPDATE core.outbox_events
   SET status = 'claimed', attempt_count = 1, claimed_at = transaction_timestamp()
 WHERE id = '00000000-0000-0000-0000-000000000020';
UPDATE core.outbox_events
   SET status = 'published', published_at = transaction_timestamp()
 WHERE id = '00000000-0000-0000-0000-000000000020';
DO $test$
BEGIN
    BEGIN
        UPDATE core.outbox_events
           SET payload_bytes = convert_to('{"id":2}', 'UTF8')
         WHERE id = '00000000-0000-0000-0000-000000000020';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'terminal outbox payload mutated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO core.attachments (
    org_id, id, storage_bucket, storage_object_path, original_filename,
    media_type, byte_size, sha256, evidence_kind, legal_hold, status, verified_at
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000030',
    'evidence', 'fixture/immutable.pdf', 'immutable.pdf', 'application/pdf', 128,
    decode(repeat('66', 32), 'hex'), 'fixture', true, 'verified', transaction_timestamp()
);
DO $test$
BEGIN
    BEGIN
        UPDATE core.attachments SET byte_size = 129
         WHERE id = '00000000-0000-0000-0000-000000000030';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'verified attachment mutated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
    BEGIN
        DELETE FROM core.attachments
         WHERE id = '00000000-0000-0000-0000-000000000030';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'legal-hold attachment deleted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO parties.parties (org_id, id, party_kind, legal_name, status)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000040',
    'organization', 'Fixture Party', 'active'
);
INSERT INTO parties.addresses (
    org_id, id, party_id, address_kind, line1, city, state_code,
    postal_code, is_primary, valid_from, valid_until
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000041',
    '00000000-0000-0000-0000-000000000040',
    'billing', '1 Test Road', 'Pune', '27', '411001', true, DATE '2026-01-01', DATE '2026-12-31'
);
DO $test$
BEGIN
    BEGIN
        INSERT INTO parties.addresses (
            org_id, id, party_id, address_kind, line1, city, state_code,
            postal_code, is_primary, valid_from, valid_until
        ) VALUES (
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000042',
            '00000000-0000-0000-0000-000000000040',
            'billing', '2 Test Road', 'Pune', '27', '411001', true, DATE '2026-12-31', NULL
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'overlapping primary address was accepted';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO parties.tax_registrations (
    org_id, id, party_id, registration_type, registration_number,
    registered_legal_name, verified_at, status
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000043',
    '00000000-0000-0000-0000-000000000040',
    'PAN', 'ABCDE1234F', 'Fixture Party', transaction_timestamp(), 'active'
);
DO $test$
BEGIN
    BEGIN
        UPDATE parties.tax_registrations SET registered_legal_name = 'Changed'
         WHERE id = '00000000-0000-0000-0000-000000000043';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'verified tax identity mutated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO catalog.products (
    org_id, id, sku, product_kind, name, base_uom_code, hsn_code,
    drug_schedule, requires_prescription, ndps_regulated,
    regulatory_ruleset_version
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000050',
    'FIXTURE-MED', 'medicine', 'Fixture Medicine', 'EA', '3004', 'NONE', false, false,
    'fixture-not-applicable-v1'
);
INSERT INTO catalog.ingredients (
    id, canonical_name, normalized_name, drugs_rules_schedule, ndps_classification,
    classification_ruleset_version
) VALUES (
    '00000000-0000-0000-0000-000000000051',
    'Fixture Ingredient', 'fixture ingredient', 'NONE', 'NONE',
    'fixture-classification-v1'
);
INSERT INTO catalog.uom_conversions (
    org_id, id, product_id, from_uom_code, to_uom_code, multiplier,
    valid_from, valid_until
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000052',
    '00000000-0000-0000-0000-000000000050', 'EA', 'KG', 1,
    DATE '2026-01-01', DATE '2026-12-31'
);
INSERT INTO catalog.product_ingredients (
    org_id, product_id, ingredient_id, sequence_number, ingredient_role,
    strength_value, strength_uom_code, basis_quantity, basis_uom_code,
    valid_from, valid_until
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000050',
    '00000000-0000-0000-0000-000000000051', 1, 'active', 1, 'MG', 1, 'EA',
    DATE '2026-01-01', DATE '2026-12-31'
);
DO $test$
BEGIN
    BEGIN
        INSERT INTO catalog.uom_conversions (
            org_id, product_id, from_uom_code, to_uom_code, multiplier,
            valid_from, valid_until
        ) VALUES (
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000050', 'EA', 'KG', 2,
            DATE '2026-06-01', NULL
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'overlapping UOM conversion was accepted';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
    BEGIN
        INSERT INTO catalog.product_ingredients (
            org_id, product_id, ingredient_id, sequence_number, ingredient_role,
            strength_value, strength_uom_code, basis_quantity, basis_uom_code,
            valid_from, valid_until
        ) VALUES (
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000050',
            '00000000-0000-0000-0000-000000000051', 2, 'active', 2, 'MG', 1, 'EA',
            DATE '2026-06-01', NULL
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'overlapping product composition was accepted';
    EXCEPTION WHEN exclusion_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO hr.departments (org_id, id, code, name)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000060', 'FIXTURE', 'Fixture Department'
);
INSERT INTO hr.employees (
    org_id, id, employee_number, branch_id, department_id, legal_name,
    display_name, job_title, employment_start_date, status
) VALUES
(
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000061', 'FIX-1',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000060',
    'Employee One', 'Employee One', 'Manager', DATE '2026-01-01', 'active'
),
(
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000062', 'FIX-2',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000060',
    'Employee Two', 'Employee Two', 'Analyst', DATE '2026-01-01', 'active'
);
UPDATE hr.employees
   SET manager_employee_id = '00000000-0000-0000-0000-000000000061'
 WHERE id = '00000000-0000-0000-0000-000000000062';
DO $test$
BEGIN
    BEGIN
        UPDATE hr.employees
           SET manager_employee_id = '00000000-0000-0000-0000-000000000062'
         WHERE id = '00000000-0000-0000-0000-000000000061';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'employee reporting cycle was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

INSERT INTO automation.agent_grants (
    org_id, id, subject_membership_id, client_id, client_display_name,
    authorization_mode, consent_version, consent_text_hash,
    consented_by_membership_id, consented_at,
    granted_by_membership_id, granted_at, expires_at, status
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000070',
    '00000000-0000-0000-0000-000000000003',
    'fixture-client', 'Fixture Client', 'self_consent', 'v1', decode(repeat('77', 32), 'hex'),
    '00000000-0000-0000-0000-000000000003', transaction_timestamp(),
    '00000000-0000-0000-0000-000000000003', transaction_timestamp(),
    transaction_timestamp() + interval '1 hour', 'active'
);
INSERT INTO automation.agent_grant_capabilities (
    org_id, agent_grant_id, capability_code, operation_mode,
    risk_class, approval_policy
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000070',
    'fixture.write', 'write', 'consequential_write', 'separate_approver'
);
INSERT INTO automation.command_requests (
    org_id, id, agent_grant_id, requested_by_membership_id,
    capability_code, operation, idempotency_key_hash,
    request_media_type, request_bytes, request_hash,
    preview_media_type, preview_bytes, preview_hash,
    risk_class, approval_policy, required_approval_count, expires_at
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000070',
    '00000000-0000-0000-0000-000000000003',
    'fixture.write', 'fixture.create', decode(repeat('81', 32), 'hex'),
    'application/json', convert_to('{}', 'UTF8'), decode(repeat('82', 32), 'hex'),
    'application/json', convert_to('{}', 'UTF8'), decode(repeat('83', 32), 'hex'),
    'consequential_write', 'separate_approver', 1, transaction_timestamp() + interval '30 minutes'
);
DO $test$
BEGIN
    BEGIN
        INSERT INTO automation.command_approvals (
            org_id, command_request_id, approver_membership_id, decision,
            preview_hash, authentication_strength, valid_until_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000010',
            '00000000-0000-0000-0000-000000000071',
            '00000000-0000-0000-0000-000000000003', 'approved',
            decode(repeat('84', 32), 'hex'), 'reauthenticated',
            transaction_timestamp() + interval '15 minutes'
        );
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'approval for stale preview was accepted';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;
INSERT INTO automation.command_approvals (
    org_id, id, command_request_id, approver_membership_id, decision,
    preview_hash, authentication_strength, valid_until_at
) VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000072',
    '00000000-0000-0000-0000-000000000071',
    '00000000-0000-0000-0000-000000000003', 'approved',
    decode(repeat('83', 32), 'hex'), 'reauthenticated',
    transaction_timestamp() + interval '15 minutes'
);
DO $test$
BEGIN
    BEGIN
        UPDATE automation.command_requests
           SET preview_hash = decode(repeat('85', 32), 'hex')
         WHERE id = '00000000-0000-0000-0000-000000000071';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'approved command snapshot mutated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    UPDATE automation.agent_grants
       SET status = 'revoked', revoked_at = transaction_timestamp(),
           revoked_by_membership_id = '00000000-0000-0000-0000-000000000003',
           revocation_reason = 'fixture'
     WHERE id = '00000000-0000-0000-0000-000000000070';
    BEGIN
        UPDATE automation.command_requests
           SET status = 'executing', execution_started_at = transaction_timestamp()
         WHERE id = '00000000-0000-0000-0000-000000000071';
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'revoked agent grant executed a command';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;
END
$test$;

ROLLBACK;
