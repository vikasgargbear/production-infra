BEGIN;

DO $expense_claim_command_contract$
DECLARE runtime_count integer; exposed_helper_count integer; primitive_count integer;
BEGIN
    SELECT count(*) INTO runtime_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname IN (
         'resolve_expense_claim_prepare',
         'persist_expense_claim_prepare',
         'approve_expense_claim_command',
         'execute_approved_expense_claim'
       )
       AND procedure.prosecdef
       AND procedure.proconfig IS NOT NULL
       AND 'search_path=""'=ANY(procedure.proconfig)
       AND pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
       AND NOT pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
       AND NOT pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE');
    IF runtime_count<>4 THEN
        RAISE EXCEPTION 'expected four reviewed runtime expense-claim commands, found %',runtime_count;
    END IF;

    SELECT count(*) INTO exposed_helper_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname='assert_expense_claim_draft'
       AND (pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
         OR pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
         OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE'));
    IF exposed_helper_count<>0 THEN
        RAISE EXCEPTION 'private expense-claim assertion exposes execute privilege';
    END IF;

    SELECT count(*) INTO primitive_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_compliance_commands'
       AND procedure.proname IN ('submit_expense_claim','approve_expense_claim','post_expense_claim')
       AND procedure.prosecdef
       AND pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE');
    IF primitive_count<>3 THEN
        RAISE EXCEPTION 'reviewed compliance expense primitives are unavailable to runtime';
    END IF;
END
$expense_claim_command_contract$;

ROLLBACK;
