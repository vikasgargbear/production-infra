\set ON_ERROR_STOP on

BEGIN;

DO $fixture$
DECLARE bad_count integer;
BEGIN
    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_commands'
       AND (NOT procedure.prosecdef
            OR procedure.proconfig IS NULL
            OR NOT ('search_path=""' = ANY(procedure.proconfig)));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'finance command functions must be definer functions with empty search_path';
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_commands'
       AND procedure.proname NOT IN (
          'import_bank_statement_lines','parse_portal_document','post_payment','post_supplier_advance_payment',
          'apply_supplier_advance',
          'resolve_reconciliation_item','reverse_payment','run_tax_reconciliation'
       )
       AND (pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE'));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'private finance command helper exposes an execute grant';
    END IF;

    IF pg_catalog.has_table_privilege('erp_app','erp_finance_commands.command_scopes','SELECT')
       OR pg_catalog.has_table_privilege('erp_app','erp_finance_commands.command_scopes','INSERT')
       OR pg_catalog.has_table_privilege('erp_runtime','erp_finance_commands.command_scopes','SELECT')
       OR pg_catalog.has_table_privilege('public','erp_finance_commands.command_scopes','SELECT') THEN
        RAISE EXCEPTION 'runtime role can forge or inspect finance command provenance';
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_trigger AS trigger
      JOIN pg_catalog.pg_proc AS procedure ON procedure.oid=trigger.tgfoid
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_commands'
       AND (NOT trigger.tgenabled::text='O' OR trigger.tgconstraint=0);
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'finance command bindings must be enabled constraint triggers';
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_finance_commands'
       AND procedure.proname IN (
          'import_bank_statement_lines','parse_portal_document','post_payment','post_supplier_advance_payment',
          'apply_supplier_advance',
          'resolve_reconciliation_item','reverse_payment','run_tax_reconciliation'
       )
       AND NOT pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE');
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'reviewed runtime finance command is not callable by erp_app';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_trigger
         WHERE tgname='return_documents_command_guard_ct' AND NOT tgisinternal) THEN
        RAISE EXCEPTION 'return document membership command guard is not installed';
    END IF;
END
$fixture$;

ROLLBACK;
