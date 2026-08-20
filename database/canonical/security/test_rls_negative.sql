-- Disposable PostgreSQL 15 contract test.
-- Preconditions: canonical baseline and canonical_rls.sql have been applied.
-- Run as the migration executor/superuser. Nothing below is committed.

BEGIN;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO auth.users (id)
VALUES
    ('90000000-0000-7000-8000-000000000001'),
    ('90000000-0000-7000-8000-000000000002'),
    ('90000000-0000-7000-8000-000000000003');

SET LOCAL ROLE "erp_migration_owner";

INSERT INTO core.users (id, auth_user_id, display_name, status)
VALUES
    (
        '30000000-0000-7000-8000-000000000001',
        '90000000-0000-7000-8000-000000000001',
        'RLS actor A', 'active'
    ),
    (
        '30000000-0000-7000-8000-000000000002',
        '90000000-0000-7000-8000-000000000002',
        'RLS actor B', 'active'
    ),
    (
        '30000000-0000-7000-8000-000000000003',
        '90000000-0000-7000-8000-000000000003',
        'Disabled RLS actor', 'disabled'
    );

INSERT INTO core.organizations (
    id, legal_name, registered_address_line1, registered_city,
    registered_state_code, registered_postal_code, status,
    created_by_membership_id, updated_by_membership_id
)
VALUES
    (
        '10000000-0000-7000-8000-000000000001', 'RLS Org A', 'One Test Road',
        'Mumbai', '27', '400001', 'active',
        '20000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001'
    ),
    (
        '10000000-0000-7000-8000-000000000002', 'RLS Org B', 'Two Test Road',
        'Pune', '27', '411001', 'active',
        '20000000-0000-7000-8000-000000000002',
        '20000000-0000-7000-8000-000000000002'
    );

INSERT INTO core.memberships (
    org_id, id, user_id, status, joined_at,
    created_by_membership_id, updated_by_membership_id
)
VALUES
    (
        '10000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001',
        '30000000-0000-7000-8000-000000000001', 'active', transaction_timestamp(),
        '20000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001'
    ),
    (
        '10000000-0000-7000-8000-000000000002',
        '20000000-0000-7000-8000-000000000002',
        '30000000-0000-7000-8000-000000000002', 'active', transaction_timestamp(),
        '20000000-0000-7000-8000-000000000002',
        '20000000-0000-7000-8000-000000000002'
    ),
    (
        '10000000-0000-7000-8000-000000000002',
        '20000000-0000-7000-8000-000000000003',
        '30000000-0000-7000-8000-000000000003', 'active', transaction_timestamp(),
        '20000000-0000-7000-8000-000000000002',
        '20000000-0000-7000-8000-000000000002'
    );

INSERT INTO core.branches (
    org_id, id, code, name, address_line1, city, state_code, postal_code,
    created_by_membership_id, updated_by_membership_id
)
VALUES
    (
        '10000000-0000-7000-8000-000000000001',
        '40000000-0000-7000-8000-000000000001', 'A1', 'Allowed branch',
        'One Branch Road', 'Mumbai', '27', '400001',
        '20000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001'
    ),
    (
        '10000000-0000-7000-8000-000000000001',
        '40000000-0000-7000-8000-000000000002', 'A2', 'Denied branch',
        'Two Branch Road', 'Mumbai', '27', '400002',
        '20000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001'
    );

INSERT INTO core.roles (
    org_id, id, code, name, status,
    created_by_membership_id, updated_by_membership_id
)
VALUES (
    '10000000-0000-7000-8000-000000000001',
    '50000000-0000-7000-8000-000000000001', 'branch_settings',
    'Branch settings manager', 'active',
    '20000000-0000-7000-8000-000000000001',
    '20000000-0000-7000-8000-000000000001'
);

INSERT INTO core.permissions (code, domain, action, risk_class, description)
VALUES ('core.settings.manage', 'core', 'settings.manage', 'consequential_write', 'Manage ERP settings');

INSERT INTO core.role_permissions (
    org_id, role_id, permission_code, created_by_membership_id
)
VALUES (
    '10000000-0000-7000-8000-000000000001',
    '50000000-0000-7000-8000-000000000001',
    'core.settings.manage',
    '20000000-0000-7000-8000-000000000001'
);

INSERT INTO core.access_grants (
    org_id, id, membership_id, role_id, scope_kind, branch_id,
    valid_from_at, status, created_by_membership_id
)
VALUES (
    '10000000-0000-7000-8000-000000000001',
    '60000000-0000-7000-8000-000000000001',
    '20000000-0000-7000-8000-000000000001',
    '50000000-0000-7000-8000-000000000001', 'branch',
    '40000000-0000-7000-8000-000000000001',
    transaction_timestamp(), 'active',
    '20000000-0000-7000-8000-000000000001'
);

INSERT INTO core.settings (
    org_id, id, scope_kind, branch_id, namespace, key, value_type, value_text,
    created_by_membership_id, updated_by_membership_id
)
VALUES
    (
        '10000000-0000-7000-8000-000000000001',
        '70000000-0000-7000-8000-000000000001', 'branch',
        '40000000-0000-7000-8000-000000000001', 'rls_test', 'allowed', 'text', 'before',
        '20000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001'
    ),
    (
        '10000000-0000-7000-8000-000000000001',
        '70000000-0000-7000-8000-000000000002', 'branch',
        '40000000-0000-7000-8000-000000000002', 'rls_test', 'other_branch', 'text', 'secret-a2',
        '20000000-0000-7000-8000-000000000001',
        '20000000-0000-7000-8000-000000000001'
    ),
    (
        '10000000-0000-7000-8000-000000000002',
        '70000000-0000-7000-8000-000000000003', 'organization',
        NULL, 'rls_test', 'other_org', 'text', 'secret-b',
        '20000000-0000-7000-8000-000000000002',
        '20000000-0000-7000-8000-000000000002'
    );

RESET ROLE;
SET LOCAL ROLE "erp_runtime";

DO $test$
BEGIN
    PERFORM set_config('app.org_id', '', true);
    PERFORM set_config('app.membership_id', '', true);
    IF (SELECT count(*) FROM core.settings) <> 0 THEN
        RAISE EXCEPTION 'missing context exposed tenant rows';
    END IF;

    PERFORM set_config('app.org_id', '10000000-0000-7000-8000-000000000001', true);
    PERFORM set_config('app.membership_id', '', true);
    IF (SELECT count(*) FROM core.settings) <> 0 THEN
        RAISE EXCEPTION 'missing membership exposed tenant rows';
    END IF;

    PERFORM set_config('app.membership_id', '20000000-0000-7000-8000-000000000002', true);
    IF (SELECT count(*) FROM core.settings) <> 0 THEN
        RAISE EXCEPTION 'cross-organization membership spoof exposed tenant rows';
    END IF;

    PERFORM set_config('app.org_id', 'not-a-uuid', true);
    IF erp_security.current_org_id() IS NOT NULL OR (SELECT count(*) FROM core.settings) <> 0 THEN
        RAISE EXCEPTION 'malformed organization context did not fail closed';
    END IF;

    BEGIN
        PERFORM erp_security.activate_context(
            '10000000-0000-7000-8000-000000000001',
            '20000000-0000-7000-8000-000000000001'
        );
        RAISE EXCEPTION 'legacy organization plus membership activation unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        PERFORM erp_security.activate_context(
            '90000000-0000-7000-8000-000000000002',
            '10000000-0000-7000-8000-000000000001'
        );
        RAISE EXCEPTION 'authenticated user activated another user membership';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        PERFORM erp_security.activate_context(
            '90000000-0000-7000-8000-000000000003',
            '10000000-0000-7000-8000-000000000002'
        );
        RAISE EXCEPTION 'disabled authenticated user activated a membership';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    PERFORM erp_security.activate_context(
        '90000000-0000-7000-8000-000000000001',
        '10000000-0000-7000-8000-000000000001'
    );
    IF current_setting('app.auth_user_id', true) <> '90000000-0000-7000-8000-000000000001'
       OR current_setting('app.user_id', true) <> '30000000-0000-7000-8000-000000000001'
       OR current_setting('app.membership_id', true) <> '20000000-0000-7000-8000-000000000001'
       OR current_setting('app.org_id', true) <> '10000000-0000-7000-8000-000000000001'
       OR erp_security.current_user_id() <> '30000000-0000-7000-8000-000000000001' THEN
        RAISE EXCEPTION 'authenticated activation did not bind the exact resolved identity';
    END IF;
    IF (SELECT count(*) FROM core.settings) <> 1 THEN
        RAISE EXCEPTION 'matching actor did not receive exactly its granted branch';
    END IF;
    IF (SELECT count(*) FROM core.organizations) <> 1 THEN
        RAISE EXCEPTION 'organization visibility is not current-organization only';
    END IF;
    IF (SELECT count(*) FROM core.users) <> 1 THEN
        RAISE EXCEPTION 'global user visibility crossed organization boundary';
    END IF;
    IF (SELECT count(*) FROM core.permissions WHERE code = 'core.settings.manage') <> 1 THEN
        RAISE EXCEPTION 'global reference SELECT was not granted';
    END IF;
END;
$test$;

DO $test$
DECLARE
    affected bigint;
BEGIN
    UPDATE core.settings
       SET value_text = 'must-not-change'
     WHERE id = '70000000-0000-7000-8000-000000000002';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'branch-scoped actor updated another branch';
    END IF;

    UPDATE core.settings
       SET value_text = 'allowed-change'
     WHERE id = '70000000-0000-7000-8000-000000000001';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'branch permission did not authorize matching-branch update';
    END IF;

    BEGIN
        INSERT INTO core.settings (
            org_id, id, scope_kind, namespace, key, value_type, value_text,
            created_by_membership_id, updated_by_membership_id
        ) VALUES (
            '10000000-0000-7000-8000-000000000002',
            '70000000-0000-7000-8000-000000000004', 'organization',
            'rls_test', 'spoof_insert', 'text', 'denied',
            '20000000-0000-7000-8000-000000000002',
            '20000000-0000-7000-8000-000000000002'
        );
        RAISE EXCEPTION 'cross-organization insert unexpectedly succeeded';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$test$;

RESET ROLE;
ROLLBACK;
