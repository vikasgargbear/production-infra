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
       AND (NOT procedure.prosecdef OR NOT coalesce(procedure.proconfig,'{}'::text[]) @> ARRAY['search_path=']);
    IF insecure_count<>0 THEN
        RAISE EXCEPTION 'commercial functions must be security definer with an empty fixed search_path';
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

    IF pg_catalog.position('rounding_adjustment>0' IN sales_return_body)=0
       OR pg_catalog.position('rounding_adjustment<0' IN sales_return_body)=0
       OR pg_catalog.position('rounding_gain' IN sales_return_body)=0
       OR pg_catalog.position('rounding_loss' IN sales_return_body)=0 THEN
        RAISE EXCEPTION 'sales return command does not cover positive and negative rounding reversals';
    END IF;
    IF pg_catalog.position('gst_tax_treatment' IN sales_return_body)=0
       OR pg_catalog.position('gst_adjustment_rule_versions' IN sales_return_body)=0
       OR pg_catalog.position('recipient ITC-reversal evidence' IN sales_return_body)=0
       OR pg_catalog.position('registration_branches' IN sales_return_body)=0 THEN
        RAISE EXCEPTION 'sales return command lacks statutory/commercial GST, evidence, or effective branch-registration authority';
    END IF;
    IF pg_catalog.position('rcm_igst_payable' IN purchase_return_body)=0
       OR pg_catalog.position('Reverse-charge liability reversal' IN purchase_return_body)=0 THEN
        RAISE EXCEPTION 'purchase return command does not reverse component-wise RCM liability';
    END IF;
    IF pg_catalog.position('supplier_credit_note_portal_line_id' IN purchase_return_body)=0
       OR pg_catalog.position('supplier GST credit-note portal evidence differs from purchase return' IN purchase_return_body)=0
       OR pg_catalog.position('commercial-only adjustment cannot alter GST' IN purchase_return_body)=0 THEN
        RAISE EXCEPTION 'purchase return command conflates buyer debit note with supplier statutory GST credit-note evidence';
    END IF;
    IF pg_catalog.position('purchase_return_inventory_variance' IN purchase_return_body)=0
       OR pg_catalog.position('inventory_value' IN purchase_return_body)=0 THEN
        RAISE EXCEPTION 'purchase return command does not reconcile changed MWA cost';
    END IF;
    IF pg_catalog.position('allocated dispatch lacks exactly one posted inventory-valuation accounting event' IN sales_invoice_body)=0 THEN
        RAISE EXCEPTION 'allocated invoice command does not fail closed on missing dispatch valuation';
    END IF;
    IF pg_catalog.position('Dispatch COGS from posted stock ledger' IN dispatch_valuation_body)=0
       OR pg_catalog.position('cost_of_goods_sold' IN dispatch_valuation_body)=0
       OR pg_catalog.position('inventory_asset' IN dispatch_valuation_body)=0 THEN
        RAISE EXCEPTION 'dispatch valuation command does not use posted ledger and explicit account roles';
    END IF;
    IF pg_catalog.position('finance.adjustment_note.post' IN adjustment_body)=0
       OR pg_catalog.position('rcm_igst_payable' IN adjustment_body)=0
       OR pg_catalog.position('adjustment open item does not belong to the original invoice event' IN adjustment_body)=0
       OR pg_catalog.position('consume_artifact' IN adjustment_body)=0 THEN
        RAISE EXCEPTION 'generic adjustment command lacks typed calculation, RCM, or open-item authority';
    END IF;
    IF pg_catalog.position('gst_adjustment_rule_versions' IN adjustment_body)=0
       OR pg_catalog.position('counterparty_portal_document_line_id' IN adjustment_body)=0
       OR pg_catalog.position('gst_tax_treatment' IN adjustment_body)=0 THEN
        RAISE EXCEPTION 'generic adjustment command lacks effective GST-rule, counterparty-portal, or statutory/commercial separation';
    END IF;
    IF pg_catalog.position('SELECT DISTINCT sales_invoice_line_id,supplier_invoice_line_id' IN adjustment_assertion_body)=0
       OR pg_catalog.position('cumulative adjustment exceeds original plus increases or residual is inexact' IN adjustment_assertion_body)=0
       OR pg_catalog.position('cumulative adjustment header or payable exceeds original plus increases' IN adjustment_assertion_body)=0
       OR pg_catalog.position('positive_rounding' IN adjustment_assertion_body)=0
       OR pg_catalog.position('negative_rounding' IN adjustment_assertion_body)=0
       OR pg_catalog.position('ceiling.cgst' IN adjustment_assertion_body)=0
       OR pg_catalog.position('ceiling.sgst' IN adjustment_assertion_body)=0
       OR pg_catalog.position('ceiling.igst' IN adjustment_assertion_body)=0
       OR pg_catalog.position('ceiling.cess' IN adjustment_assertion_body)=0 THEN
        RAISE EXCEPTION 'generic adjustment assertion lacks typed line, residual, tax-component, rounding, or payable ceilings';
    END IF;
END
$test$;

ROLLBACK;
