\set ON_ERROR_STOP on

BEGIN;

DO $trade_posting_contract$
DECLARE runtime_execute integer; unexpected_writers integer; trigger_count integer;
BEGIN
    SELECT count(*) INTO runtime_execute
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_trade_commands_v2'
       AND proc.proname='post_landed_cost_adjustment'
       AND pg_catalog.has_function_privilege('erp_runtime',proc.oid,'EXECUTE');
    IF runtime_execute<>1 THEN
        RAISE EXCEPTION 'expected one public landed-cost command, found %',runtime_execute;
    END IF;

    SELECT count(*) INTO runtime_execute
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_trade_commands_v2'
       AND proc.proname IN ('approve_purchase_order','approve_sales_order')
       AND pg_catalog.has_function_privilege('erp_runtime',proc.oid,'EXECUTE');
    IF runtime_execute<>2 THEN
        RAISE EXCEPTION 'expected two public commercial approval commands, found %',runtime_execute;
    END IF;

    SELECT count(*) INTO unexpected_writers
      FROM pg_catalog.pg_proc AS proc
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=proc.pronamespace
     WHERE namespace.nspname='erp_trade_commands_v2'
       AND proc.proname IN ('emit_entry','project_entry');
    IF unexpected_writers<>0 THEN
        RAISE EXCEPTION 'trade posting follow-up created % duplicate ledger writers/projectors',unexpected_writers;
    END IF;

    SELECT count(*) INTO trigger_count FROM pg_catalog.pg_trigger
     WHERE tgname IN (
       'landed_cost_allocations_exact_ct','stock_ledger_landed_cost_mwa_v2_guard',
       'inventory_documents_source_owner_v2_ct','dispatch_inventory_owner_v2_ct',
       'invoice_inventory_owner_v2_ct','sales_return_inventory_owner_v2_ct',
       'goods_receipt_inventory_owner_v2_ct','purchase_return_inventory_owner_v2_ct',
       'destruction_inventory_owner_v2_ct','supplier_invoice_inventory_owner_v2_ct'
       ,'guard_approved_purchase_order_lines','guard_purchase_order_approval'
       ,'guard_approved_sales_order_lines','guard_sales_order_approval'
     ) AND NOT tgisinternal;
    IF trigger_count<>14 THEN
        RAISE EXCEPTION 'expected fourteen trade posting guards, found %',trigger_count;
    END IF;

    IF pg_catalog.has_function_privilege(
        'erp_runtime',
        'erp_trade_commands_v2.assert_landed_cost_document(uuid,uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'runtime can execute a private landed-cost verifier';
    END IF;
    IF pg_catalog.has_function_privilege(
        'erp_runtime',
        'erp_trade_commands_v2.assert_sales_order_artifact(uuid,uuid,jsonb,jsonb)',
        'EXECUTE'
    ) OR pg_catalog.has_function_privilege(
        'erp_runtime',
        'erp_trade_commands_v2.assert_purchase_order_artifact(uuid,uuid,jsonb,jsonb)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'runtime can execute a private calculation verifier';
    END IF;
END
$trade_posting_contract$;

ROLLBACK;
