\set ON_ERROR_STOP on

BEGIN;

DO $test$
DECLARE
    command_count integer;
    insecure_count integer;
    sales_return_body text;
    purchase_return_body text;
    sales_invoice_body text;
    dispatch_valuation_body text;
    adjustment_body text;
    adjustment_assertion_body text;
BEGIN
    IF pg_catalog.to_regnamespace('erp_commercial_commands') IS NULL THEN
        RAISE EXCEPTION 'commercial runtime authority was not installed';
    END IF;

    SELECT count(*) INTO command_count
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands'
       AND procedure.proname IN ('post_sales_invoice','post_supplier_invoice','post_sales_return','post_purchase_return','post_adjustment_note');
    IF command_count<>5 THEN
        RAISE EXCEPTION 'expected five typed commercial posting commands, found %',command_count;
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc procedure
        JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
        WHERE namespace.nspname='erp_commercial_commands'
          AND procedure.proname='post_taxable_advance_tax_document'
    ) THEN
        RAISE EXCEPTION 'service-advance tax writer must remain absent until a typed taxable-advance owner exists';
    END IF;

    SELECT count(*) INTO insecure_count
     FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands'
       AND (
           NOT ('search_path=""'=ANY(coalesce(procedure.proconfig,'{}'::text[])))
           OR (procedure.proname IN ('guard_posted_sales_invoice_lines',
                                     'guard_posted_supplier_invoice_lines',
                                     'guard_posted_sales_return_lines',
                                     'guard_posted_purchase_return_lines')
               AND procedure.prosecdef)
           OR (procedure.proname NOT IN ('guard_posted_sales_invoice_lines',
                                         'guard_posted_supplier_invoice_lines',
                                         'guard_posted_sales_return_lines',
                                         'guard_posted_purchase_return_lines')
               AND NOT procedure.prosecdef)
       );
    IF insecure_count<>0 THEN
        RAISE EXCEPTION 'commercial functions do not match reviewed security modes and empty fixed search_path';
    END IF;

    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT sales_return_body
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands' AND procedure.proname='post_sales_return';
    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT purchase_return_body
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands' AND procedure.proname='post_purchase_return';
    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT sales_invoice_body
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands' AND procedure.proname='post_sales_invoice';
    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT dispatch_valuation_body
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands' AND procedure.proname='post_dispatch_inventory_valuation';
    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT adjustment_body
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands' AND procedure.proname='post_adjustment_note';
    SELECT pg_catalog.pg_get_functiondef(procedure.oid) INTO STRICT adjustment_assertion_body
      FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
     WHERE namespace.nspname='erp_commercial_commands' AND procedure.proname='assert_adjustment_note_artifact';

    IF pg_catalog.strpos(sales_return_body, 'rounding_adjustment>0')=0
       OR pg_catalog.strpos(sales_return_body, 'rounding_adjustment<0')=0
       OR pg_catalog.strpos(sales_return_body, 'rounding_gain')=0
       OR pg_catalog.strpos(sales_return_body, 'rounding_loss')=0 THEN
        RAISE EXCEPTION 'sales return command does not cover positive and negative rounding reversals';
    END IF;
    IF pg_catalog.strpos(sales_return_body, 'gst_tax_treatment')=0
       OR pg_catalog.strpos(sales_return_body, 'gst_adjustment_rule_versions')=0
       OR pg_catalog.strpos(sales_return_body, 'recipient ITC-reversal evidence')=0
       OR pg_catalog.strpos(sales_return_body, 'registration_branches')=0 THEN
        RAISE EXCEPTION 'sales return command lacks statutory/commercial GST, evidence, or effective branch-registration authority';
    END IF;
    IF pg_catalog.strpos(purchase_return_body, 'rcm_igst_payable')=0
       OR pg_catalog.strpos(purchase_return_body, 'Reverse-charge liability reversal')=0 THEN
        RAISE EXCEPTION 'purchase return command does not reverse component-wise RCM liability';
    END IF;
    IF pg_catalog.strpos(purchase_return_body, 'supplier_credit_note_portal_line_id')=0
       OR pg_catalog.strpos(purchase_return_body, 'supplier GST credit-note portal evidence differs from purchase return')=0
       OR pg_catalog.strpos(purchase_return_body, 'commercial-only adjustment cannot alter GST')=0 THEN
        RAISE EXCEPTION 'purchase return command conflates buyer debit note with supplier statutory GST credit-note evidence';
    END IF;
    IF pg_catalog.strpos(purchase_return_body, 'purchase_return_inventory_variance')=0
       OR pg_catalog.strpos(purchase_return_body, 'inventory_value')=0 THEN
        RAISE EXCEPTION 'purchase return command does not reconcile changed MWA cost';
    END IF;
    IF pg_catalog.strpos(sales_invoice_body, 'allocated dispatch lacks exactly one posted inventory-valuation accounting event')=0 THEN
        RAISE EXCEPTION 'allocated invoice command does not fail closed on missing dispatch valuation';
    END IF;
    IF pg_catalog.strpos(dispatch_valuation_body, 'Dispatch COGS from posted stock ledger')=0
       OR pg_catalog.strpos(dispatch_valuation_body, 'cost_of_goods_sold')=0
       OR pg_catalog.strpos(dispatch_valuation_body, 'inventory_asset')=0 THEN
        RAISE EXCEPTION 'dispatch valuation command does not use posted ledger and explicit account roles';
    END IF;
    IF pg_catalog.strpos(adjustment_body, 'finance.adjustment_note.post')=0
       OR pg_catalog.strpos(adjustment_body, 'rcm_igst_payable')=0
       OR pg_catalog.strpos(adjustment_body, 'adjustment open item does not belong to the original invoice event')=0
       OR pg_catalog.strpos(adjustment_body, 'consume_artifact')=0 THEN
        RAISE EXCEPTION 'generic adjustment command lacks typed calculation, RCM, or open-item authority';
    END IF;
    IF pg_catalog.strpos(adjustment_body, 'gst_adjustment_rule_versions')=0
       OR pg_catalog.strpos(adjustment_body, 'counterparty_portal_document_line_id')=0
       OR pg_catalog.strpos(adjustment_body, 'gst_tax_treatment')=0 THEN
        RAISE EXCEPTION 'generic adjustment command lacks effective GST-rule, counterparty-portal, or statutory/commercial separation';
    END IF;
    IF pg_catalog.strpos(adjustment_assertion_body, 'SELECT DISTINCT sales_invoice_line_id,supplier_invoice_line_id')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'cumulative adjustment exceeds original plus increases or residual is inexact')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'cumulative adjustment header or payable exceeds original plus increases')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'positive_rounding')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'negative_rounding')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'ceiling.cgst')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'ceiling.sgst')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'ceiling.igst')=0
       OR pg_catalog.strpos(adjustment_assertion_body, 'ceiling.cess')=0 THEN
        RAISE EXCEPTION 'generic adjustment assertion lacks typed line, residual, tax-component, rounding, or payable ceilings';
    END IF;
END
$test$;

ROLLBACK;
