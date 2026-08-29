\set ON_ERROR_STOP on

BEGIN;

DO $trade_command_contract$
DECLARE runtime_commands integer; private_runtime_execute integer;
BEGIN
    SELECT count(*) INTO runtime_commands
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_trade_commands'
       AND proc.proname IN ('post_inventory_document','post_dispatch','post_goods_receipt')
       AND pg_catalog.has_function_privilege('erp_runtime',proc.oid,'EXECUTE');
    IF runtime_commands<>3 THEN
        RAISE EXCEPTION 'expected three runtime trade commands, found %',runtime_commands;
    END IF;

    SELECT count(*) INTO private_runtime_execute
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_trade_commands'
       AND proc.proname NOT IN ('post_inventory_document','post_dispatch','post_goods_receipt')
       AND pg_catalog.has_function_privilege('erp_runtime',proc.oid,'EXECUTE');
    IF private_runtime_execute<>0 THEN
        RAISE EXCEPTION 'runtime can execute % private trade helpers',private_runtime_execute;
    END IF;

    IF pg_catalog.has_table_privilege('erp_app','erp_trade_commands.command_scopes','SELECT')
       OR pg_catalog.has_table_privilege('erp_app','erp_trade_commands.command_scopes','INSERT')
       OR pg_catalog.has_table_privilege('erp_runtime','erp_trade_commands.command_scopes','SELECT')
       OR pg_catalog.has_table_privilege('erp_runtime','erp_trade_commands.command_scopes','INSERT')
       OR pg_catalog.has_table_privilege('public','erp_trade_commands.command_scopes','SELECT') THEN
        RAISE EXCEPTION 'trade batch-release scopes are externally forgeable';
    END IF;

    IF (SELECT count(*) FROM pg_catalog.pg_trigger
         WHERE tgname IN ('stock_ledger_command_owner_guard','stock_balances_projector_owner_guard')
           AND NOT tgisinternal)<>2 THEN
        RAISE EXCEPTION 'inventory mutation-owner guards are absent';
    END IF;
END
$trade_command_contract$;

DO $batch_release_provenance$
DECLARE guard_definition text;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
        'erp_trade_invariants.guard_batch()'::pg_catalog.regprocedure
    ) INTO guard_definition;
    IF pg_catalog.strpos(guard_definition, 'goods_receipt_batch_release')=0
       OR pg_catalog.strpos(
         guard_definition,
         'batch release requires exact posted goods-receipt command provenance'
       )=0 THEN
        RAISE EXCEPTION 'batch release does not require exact posted-GRN provenance';
    END IF;
END
$batch_release_provenance$;

SET CONSTRAINTS ALL DEFERRED;

INSERT INTO auth.users (id)
VALUES ('91000000-0000-7000-8000-000000000007');

SET LOCAL ROLE "erp_migration_owner";

SELECT pg_catalog.set_config(
    'app.org_id','91000000-0000-7000-8000-000000000002',true
);
SELECT pg_catalog.set_config(
    'app.request_id','91000000-0000-7000-8000-000000000008',true
);

ALTER TABLE core.organizations DISABLE TRIGGER USER;
INSERT INTO core.organizations (
    id,legal_name,registered_address_line1,registered_city,registered_state_code,
    registered_postal_code,status,created_by_membership_id,updated_by_membership_id
) VALUES (
    '91000000-0000-7000-8000-000000000002','Trade permission org','One Test Road',
    'Mumbai','27','400001','active','91000000-0000-7000-8000-000000000003',
    '91000000-0000-7000-8000-000000000003'
);

INSERT INTO core.users (id,auth_user_id,display_name,status)
VALUES (
    '91000000-0000-7000-8000-000000000001',
    '91000000-0000-7000-8000-000000000007',
    'Trade permission actor','active'
);

INSERT INTO core.memberships (
    org_id,id,user_id,status,joined_at,created_by_membership_id,updated_by_membership_id
) VALUES (
    '91000000-0000-7000-8000-000000000002','91000000-0000-7000-8000-000000000003',
    '91000000-0000-7000-8000-000000000001','active',transaction_timestamp(),
    '91000000-0000-7000-8000-000000000003','91000000-0000-7000-8000-000000000003'
);

INSERT INTO core.branches (
    org_id,id,code,name,address_line1,city,state_code,postal_code,
    created_by_membership_id,updated_by_membership_id
) VALUES (
    '91000000-0000-7000-8000-000000000002','91000000-0000-7000-8000-000000000004',
    'T1','Trade permission branch','One Branch Road','Mumbai','27','400001',
    '91000000-0000-7000-8000-000000000003','91000000-0000-7000-8000-000000000003'
);

INSERT INTO core.roles (
    org_id,id,code,name,status,created_by_membership_id,updated_by_membership_id
) VALUES (
    '91000000-0000-7000-8000-000000000002','91000000-0000-7000-8000-000000000005',
    'trade_poster','Trade poster','active','91000000-0000-7000-8000-000000000003',
    '91000000-0000-7000-8000-000000000003'
);

INSERT INTO core.role_permissions (org_id,role_id,permission_code,created_by_membership_id)
VALUES (
    '91000000-0000-7000-8000-000000000002','91000000-0000-7000-8000-000000000005',
    'inventory.document.post','91000000-0000-7000-8000-000000000003'
);

INSERT INTO core.access_grants (
    org_id,id,membership_id,role_id,scope_kind,branch_id,valid_from_at,status,
    created_by_membership_id
) VALUES (
    '91000000-0000-7000-8000-000000000002','91000000-0000-7000-8000-000000000006',
    '91000000-0000-7000-8000-000000000003','91000000-0000-7000-8000-000000000005',
    'branch','91000000-0000-7000-8000-000000000004',transaction_timestamp(),
    'active','91000000-0000-7000-8000-000000000003'
);

SELECT erp_security.activate_context(
    '91000000-0000-7000-8000-000000000007',
    '91000000-0000-7000-8000-000000000002'
);
SELECT erp_trade_commands.assert_permission(
    'inventory.document.post','91000000-0000-7000-8000-000000000004'
);

UPDATE core.access_grants
   SET status='revoked',revoked_at=transaction_timestamp(),
       revoked_by_membership_id='91000000-0000-7000-8000-000000000003',
       revocation_reason='permission regression fixture',row_version=row_version+1
 WHERE org_id='91000000-0000-7000-8000-000000000002'
   AND id='91000000-0000-7000-8000-000000000006';

DO $revoked_permission$
BEGIN
    BEGIN
        PERFORM erp_trade_commands.assert_permission(
            'inventory.document.post','91000000-0000-7000-8000-000000000004'
        );
        RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='revoked trade permission remained executable';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END
$revoked_permission$;

DO $permission_time_gate$
DECLARE permission_definition text;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
        'erp_security.has_permission(text,uuid)'::pg_catalog.regprocedure
    ) INTO permission_definition;
    IF pg_catalog.strpos(permission_definition, 'grant_row.status = ''active''')=0
       OR pg_catalog.strpos(permission_definition, 'grant_row.expires_at > pg_catalog.transaction_timestamp()')=0 THEN
        RAISE EXCEPTION 'trade permission authority does not reject revoked or expired grants';
    END IF;
END
$permission_time_gate$;

ROLLBACK;
