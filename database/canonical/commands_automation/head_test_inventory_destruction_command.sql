BEGIN;

DO $inventory_destruction_command_contract$
DECLARE runtime_count integer; exposed_helper_count integer;
BEGIN
    SELECT count(*) INTO runtime_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname IN (
         'resolve_inventory_destruction_prepare',
         'persist_inventory_destruction_prepare',
         'execute_inventory_destruction_command'
       )
       AND procedure.prosecdef
       AND procedure.proconfig IS NOT NULL
       AND 'search_path=""'=ANY(procedure.proconfig)
       AND pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE');
    IF runtime_count<>3 THEN
        RAISE EXCEPTION 'expected three reviewed runtime inventory destruction commands, found %',runtime_count;
    END IF;

    SELECT count(*) INTO exposed_helper_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname='assert_inventory_destruction_draft'
       AND (pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
         OR pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
         OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE'));
    IF exposed_helper_count<>0 THEN
        RAISE EXCEPTION 'private inventory destruction assertion exposes execute privilege';
    END IF;

    IF NOT pg_catalog.has_function_privilege(
      'erp_runtime',
      'erp_compliance_commands.post_destruction(uuid,uuid,uuid,bytea,bytea,timestamptz)',
      'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'runtime inventory destruction posting primitive is unavailable';
    END IF;
END
$inventory_destruction_command_contract$;

ROLLBACK;
