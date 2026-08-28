\set ON_ERROR_STOP on

BEGIN;

DO $core_command_contract$
DECLARE runtime_commands integer; exposed_helpers integer; guard_triggers integer;
BEGIN
    SELECT count(*) INTO runtime_commands
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_core_commands'
       AND proc.proname IN (
         'allocate_document_number','replace_setting','change_customer_terms','change_supplier_terms',
         'complete_retention_case','resolve_auth_organization','onboard_organization',
         'create_organization_invitation','accept_organization_invitation'
       )
       AND proc.prosecdef
       AND pg_catalog.has_function_privilege('erp_app',proc.oid,'EXECUTE');
    IF runtime_commands<>9 THEN
        RAISE EXCEPTION 'expected nine private-definer core commands, found %',runtime_commands;
    END IF;

    SELECT count(*) INTO exposed_helpers
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_core_commands'
       AND proc.proname NOT IN (
         'allocate_document_number','replace_setting','change_customer_terms','change_supplier_terms',
         'complete_retention_case','resolve_auth_organization','onboard_organization',
         'create_organization_invitation','accept_organization_invitation'
       )
       AND pg_catalog.has_function_privilege('erp_app',proc.oid,'EXECUTE');
    IF exposed_helpers<>0 THEN
        RAISE EXCEPTION 'erp_app can execute % private core helpers',exposed_helpers;
    END IF;

    SELECT count(*) INTO guard_triggers
      FROM pg_catalog.pg_trigger
     WHERE tgname IN (
       'access_grants_lifecycle_guard','document_sequences_command_guard','settings_version_guard',
       'parties_lifecycle_identity_guard','customer_accounts_lifecycle_guard',
       'supplier_accounts_lifecycle_guard','data_retention_cases_command_guard'
     ) AND NOT tgisinternal;
    IF guard_triggers<>7 THEN
        RAISE EXCEPTION 'expected seven core command guards, found %',guard_triggers;
    END IF;

    IF pg_catalog.has_table_privilege('erp_app','erp_core_commands.command_scopes','SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'erp_app has direct access to core command provenance';
    END IF;
END
$core_command_contract$;

ROLLBACK;
