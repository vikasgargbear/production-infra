\set ON_ERROR_STOP on

BEGIN;

DO $automation_command_contract$
DECLARE bad_count integer; runtime_count integer; calculator_count integer;
  expected_runtime_count integer;
BEGIN
    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND (NOT procedure.prosecdef OR procedure.proconfig IS NULL
            OR NOT ('search_path=""'=ANY(procedure.proconfig)));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'automation functions require definer security and empty search_path';
    END IF;

    SELECT count(*) INTO runtime_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname IN ('approve_operator_command','execute_approved_command',
                                 'resolve_goods_receipt_prepare','persist_goods_receipt_prepare',
                                 'resolve_sales_dispatch_prepare','persist_sales_dispatch_prepare',
                                 'resolve_sales_invoice_prepare','resolve_purchase_order_prepare',
                                 'resolve_supplier_invoice_prepare','resolve_sales_return_prepare',
                                 'resolve_purchase_return_prepare',
                                 'resolve_customer_receipt_prepare','persist_customer_receipt_prepare',
                                 'resolve_customer_cheque_clearance_prepare','persist_customer_cheque_clearance_prepare',
                                 'resolve_customer_cheque_bounce_prepare','persist_customer_cheque_bounce_prepare',
                                 'resolve_supplier_payment_prepare','persist_supplier_payment_prepare',
                                 'resolve_supplier_advance_prepare','persist_supplier_advance_prepare',
                                 'resolve_inventory_transfer_prepare','persist_inventory_transfer_prepare',
                                 'resolve_inventory_adjustment_prepare','persist_inventory_adjustment_prepare',
                                 'resolve_inventory_destruction_prepare','persist_inventory_destruction_prepare',
                                 'execute_inventory_destruction_command',
                                 'resolve_adjustment_note_prepare','persist_adjustment_note_prepare',
                                 'resolve_bank_reconciliation_prepare','persist_bank_reconciliation_prepare',
                                 'execute_bank_reconciliation_command',
                                 'resolve_expense_claim_prepare','persist_expense_claim_prepare',
                                 'approve_expense_claim_command','execute_approved_expense_claim')
       AND pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE');
    expected_runtime_count:=CASE
      WHEN pg_catalog.to_regprocedure(
        'erp_automation_commands.execute_bank_reconciliation_command(uuid,uuid)'
      ) IS NULL THEN 21
      WHEN pg_catalog.to_regprocedure(
        'erp_automation_commands.execute_approved_expense_claim(uuid,uuid)'
      ) IS NULL THEN 28
      ELSE 36
    END;
    IF runtime_count<>expected_runtime_count THEN
        RAISE EXCEPTION 'expected % reviewed runtime automation commands, found %',expected_runtime_count,runtime_count;
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname NOT IN ('approve_operator_command','execute_approved_command',
                                     'resolve_goods_receipt_prepare','persist_goods_receipt_prepare',
                                     'resolve_sales_dispatch_prepare','persist_sales_dispatch_prepare',
                                     'resolve_sales_invoice_prepare','resolve_purchase_order_prepare',
                                     'resolve_supplier_invoice_prepare','resolve_sales_return_prepare',
                                     'resolve_purchase_return_prepare',
                                     'resolve_customer_receipt_prepare','persist_customer_receipt_prepare',
                                     'resolve_customer_cheque_clearance_prepare','persist_customer_cheque_clearance_prepare',
                                     'resolve_customer_cheque_bounce_prepare','persist_customer_cheque_bounce_prepare',
                                     'resolve_supplier_payment_prepare','persist_supplier_payment_prepare',
                                     'resolve_supplier_advance_prepare','persist_supplier_advance_prepare',
                                     'resolve_inventory_transfer_prepare','persist_inventory_transfer_prepare',
                                     'resolve_inventory_adjustment_prepare','persist_inventory_adjustment_prepare',
                                     'resolve_inventory_destruction_prepare','persist_inventory_destruction_prepare',
                                     'execute_inventory_destruction_command',
                                     'resolve_adjustment_note_prepare','persist_adjustment_note_prepare',
                                     'resolve_bank_reconciliation_prepare','persist_bank_reconciliation_prepare',
                                     'execute_bank_reconciliation_command',
                                     'resolve_expense_claim_prepare','persist_expense_claim_prepare',
                                     'approve_expense_claim_command','execute_approved_expense_claim')
       AND (pg_catalog.has_function_privilege('erp_runtime',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('erp_app',procedure.oid,'EXECUTE')
            OR pg_catalog.has_function_privilege('public',procedure.oid,'EXECUTE'));
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'private automation helper exposes execute privilege';
    END IF;

    SELECT count(*) INTO calculator_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
      AND procedure.proname IN ('resolve_sales_order_prepare','persist_sales_order_prepare',
                                 'resolve_sales_invoice_prepare','persist_sales_invoice_prepare',
                                 'resolve_purchase_order_prepare','persist_purchase_order_prepare',
                                 'resolve_supplier_invoice_prepare','persist_supplier_invoice_prepare',
                                 'resolve_sales_return_prepare','persist_sales_return_prepare',
                                 'resolve_purchase_return_prepare','persist_purchase_return_prepare')
       AND pg_catalog.has_function_privilege('erp_calculator',procedure.oid,'EXECUTE');
    IF calculator_count<>12 THEN
        RAISE EXCEPTION 'expected twelve reviewed calculator automation commands, found %',calculator_count;
    END IF;

    IF pg_catalog.to_regprocedure(
         'erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)'
       ) IS NOT NULL THEN
        IF pg_catalog.has_function_privilege(
             'erp_calculator',
             'erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)',
             'EXECUTE'
           ) IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'calculator lacks reviewed sales-invoice product-identity read privilege';
        END IF;
        IF pg_catalog.has_function_privilege(
             'erp_runtime',
             'erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)',
             'EXECUTE'
           )
           OR pg_catalog.has_function_privilege(
             'erp_app',
             'erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)',
             'EXECUTE'
           )
           OR pg_catalog.has_function_privilege(
             'public',
             'erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)',
             'EXECUTE'
           ) THEN
            RAISE EXCEPTION 'sales-invoice product identity read privilege is broader than calculator';
        END IF;
    END IF;

    SELECT count(*) INTO bad_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_automation_commands'
       AND procedure.proname NOT IN ('resolve_sales_order_prepare','persist_sales_order_prepare',
                                     'resolve_sales_invoice_prepare','persist_sales_invoice_prepare',
                                     'resolve_purchase_order_prepare','persist_purchase_order_prepare',
                                     'resolve_supplier_invoice_prepare','persist_supplier_invoice_prepare',
                                     'resolve_sales_return_prepare','persist_sales_return_prepare',
                                     'resolve_purchase_return_prepare','persist_purchase_return_prepare',
                                     'resolve_adjustment_note_prepare','persist_adjustment_note_prepare')
       AND procedure.oid IS DISTINCT FROM pg_catalog.to_regprocedure(
         'erp_automation_commands.resolve_sales_invoice_product_identities(uuid,jsonb)'
       )
       AND pg_catalog.has_function_privilege('erp_calculator',procedure.oid,'EXECUTE');
    IF bad_count<>0 THEN
        RAISE EXCEPTION 'calculator can execute an unreviewed automation helper';
    END IF;

    IF pg_catalog.has_table_privilege('erp_runtime','erp_automation_commands.execution_scopes','SELECT')
       OR pg_catalog.has_table_privilege('erp_runtime','erp_automation_commands.execution_scopes','INSERT')
       OR pg_catalog.has_table_privilege('erp_app','erp_automation_commands.execution_scopes','SELECT')
       OR pg_catalog.has_table_privilege('public','erp_automation_commands.execution_scopes','SELECT') THEN
        RAISE EXCEPTION 'runtime can forge or inspect automation execution ownership';
    END IF;

    IF pg_catalog.has_table_privilege('erp_runtime','erp_automation_commands.write_scopes','SELECT,INSERT,UPDATE,DELETE')
       OR pg_catalog.has_table_privilege('erp_app','erp_automation_commands.write_scopes','SELECT,INSERT,UPDATE,DELETE')
       OR pg_catalog.has_table_privilege('erp_calculator','erp_automation_commands.write_scopes','SELECT,INSERT,UPDATE,DELETE')
       OR pg_catalog.has_table_privilege('public','erp_automation_commands.write_scopes','SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'application or calculator can forge reviewed automation writes';
    END IF;

    IF (SELECT count(*) FROM pg_catalog.pg_trigger
         WHERE tgname IN ('agent_grant_capabilities_consent_guard',
                          'command_requests_exact_capability_guard',
                          'command_requests_prepare_scope_guard',
                          'command_requests_execution_guard',
                          'command_approvals_reviewed_write_guard')
           AND NOT tgisinternal)<>5 THEN
        RAISE EXCEPTION 'automation command trigger bindings are incomplete';
    END IF;
END
$automation_command_contract$;

ROLLBACK;
