\set ON_ERROR_STOP on

BEGIN;

DO $compliance_command_contract$
DECLARE bad_count integer; runtime_count integer;
BEGIN
    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_compliance_commands'
       AND (NOT procedure.prosecdef OR procedure.proconfig IS NULL
            OR NOT ('search_path=""'=ANY(procedure.proconfig)));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'compliance command functions require definer security and empty search_path';
    END IF;

    SELECT count(*) INTO runtime_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_compliance_commands'
       AND procedure.proname IN (
         'activate_storage_rule','add_recall_batch','approve_destruction','approve_expense_claim','ingest_temperature_reading',
         'post_destruction','post_expense_claim','record_controlled_substance_entry',
         'post_recall_inventory_action','submit_expense_claim','verify_organization_fiscal_tax_fact',
         'post_withholding','reverse_withholding','post_withholding_deposit',
         'file_withholding_statement','import_withholding_certificate')
       AND pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE');
    IF runtime_count<>16 THEN
        RAISE EXCEPTION 'expected sixteen reviewed runtime compliance commands, found %',runtime_count;
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_compliance_commands'
       AND procedure.proname NOT IN (
         'activate_storage_rule','add_recall_batch','approve_destruction','approve_expense_claim','ingest_temperature_reading',
         'post_destruction','post_expense_claim','record_controlled_substance_entry',
         'post_recall_inventory_action','submit_expense_claim','verify_organization_fiscal_tax_fact',
         'post_withholding','reverse_withholding','post_withholding_deposit',
         'file_withholding_statement','import_withholding_certificate')
       AND (pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE'));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'private compliance helper exposes execute privilege';
    END IF;

    IF pg_catalog.has_table_privilege('erp_app','erp_compliance_commands.command_scopes','SELECT')
       OR pg_catalog.has_table_privilege('erp_app','erp_compliance_commands.command_scopes','INSERT')
       OR pg_catalog.has_table_privilege('erp_runtime','erp_compliance_commands.command_scopes','SELECT')
       OR pg_catalog.has_table_privilege('public','erp_compliance_commands.command_scopes','SELECT') THEN
        RAISE EXCEPTION 'runtime can forge or inspect compliance command provenance';
    END IF;

    IF (SELECT count(*) FROM pg_catalog.pg_trigger
         WHERE tgname IN ('destructions_command_guard_ct','temperature_readings_command_guard_ct',
                          'expense_claims_command_guard_ct','expense_claim_lines_command_guard_ct',
                          'controlled_substance_entries_command_guard_ct',
                          'recall_batches_command_guard_ct',
                          'organization_fiscal_tax_facts_command_guard_ct',
                          'withholdings_command_guard_ct','withholding_basis_lines_command_guard_ct',
                          'withholding_deposits_command_guard_ct','withholding_deposit_lines_command_guard_ct',
                          'withholding_statements_command_guard_ct','withholding_statement_lines_command_guard_ct',
                          'withholding_certificates_command_guard_ct','withholding_certificate_lines_command_guard_ct',
                          'destruction_inventory_documents_snapshot_ct',
                          'destruction_inventory_lines_snapshot_ct')
           AND NOT tgisinternal)<>17 THEN
        RAISE EXCEPTION 'compliance command trigger bindings are incomplete';
    END IF;
END
$compliance_command_contract$;

ROLLBACK;
