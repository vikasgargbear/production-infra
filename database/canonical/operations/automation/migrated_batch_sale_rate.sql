-- Read imported prices through their immutable product/batch bindings. Never
-- reinterpret cost or MRP as a sale price, or a pack quote as a base-unit quote.
CREATE INDEX historical_sale_rate_lookup_idx
    ON automation.historical_migration_facts
    (org_id,dataset_id,product_code,batch_number,branch_id,event_date DESC,record_key)
    WHERE source_kind='sales_invoice_line';

CREATE FUNCTION erp_automation_reads.migrated_batch_sale_rate(
    organization_id uuid, selected_batch_id uuid, selected_branch_id uuid, as_of_date date
)
RETURNS TABLE (sale_price_per_unit text, sale_price_source text, sale_price_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = on
AS $function$
BEGIN
    PERFORM erp_core_commands.assert_context(organization_id, NULL, NULL::uuid);
    IF NOT erp_security.can_access_branch(selected_branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sale-rate branch is not accessible';
    END IF;
    RETURN QUERY
    WITH bound AS (
        SELECT product.base_uom_code, binding.dataset_id, binding.source_product_code,
               batch_fact.payload AS batch_payload, product_fact.payload AS product_payload,
               batch_fact.batch_number, batch_fact.event_date AS batch_date,
               product_fact.event_date AS product_date
          FROM inventory.batches batch
          JOIN catalog.products product ON product.org_id=batch.org_id AND product.id=batch.product_id
          JOIN automation.historical_batch_bindings batch_binding
            ON batch_binding.org_id=batch.org_id AND batch_binding.batch_id=batch.id
          JOIN automation.historical_product_bindings binding
            ON binding.org_id=batch.org_id AND binding.product_id=product.id
           AND binding.dataset_id=batch_binding.dataset_id
           AND binding.source_product_code=batch_binding.source_product_code
          JOIN automation.historical_migration_facts batch_fact
            ON batch_fact.org_id=batch.org_id AND batch_fact.id=batch_binding.source_batch_fact_id
          JOIN automation.historical_migration_facts product_fact
            ON product_fact.org_id=binding.org_id AND product_fact.id=binding.source_fact_id
         WHERE batch.org_id=organization_id AND batch.id=selected_batch_id
           AND batch_fact.branch_id=selected_branch_id
           AND product_fact.branch_id=selected_branch_id
    ), candidates AS (
        SELECT 0 AS priority, b.batch_payload->>'sale_price_per_unit' AS rate,
               b.batch_payload->>'sale_price_uom_code' AS uom,
               'migrated_batch_price'::text AS source, NULL::date AS observed_date,
               ''::text AS tie_breaker, b.base_uom_code
          FROM bound b
         WHERE b.batch_payload->>'sale_price_basis'='tax_exclusive'
        UNION ALL
        SELECT 1, b.product_payload->>'sale_price_per_unit',
               b.product_payload->>'sale_price_uom_code',
               'migrated_product_price', NULL::date, '', b.base_uom_code
          FROM bound b
         WHERE b.product_payload->>'sale_price_basis'='tax_exclusive'
        UNION ALL
        SELECT 2, line.payload->>'quoted_unit_rate', line.payload->>'uom_code',
               'last_imported_sale', line.event_date, line.record_key, b.base_uom_code
          FROM bound b
          JOIN automation.historical_migration_facts line
            ON line.org_id=organization_id AND line.dataset_id=b.dataset_id
           AND line.product_code=b.source_product_code AND line.batch_number=b.batch_number
           AND line.branch_id=selected_branch_id AND line.source_kind='sales_invoice_line'
           AND line.selection_state IN ('included','reviewed')
           AND line.event_date<=as_of_date AND line.quantity>0
          JOIN automation.historical_migration_facts invoice
            ON invoice.org_id=line.org_id AND invoice.dataset_id=line.dataset_id
           AND invoice.branch_id=line.branch_id AND invoice.source_kind='sales_invoice'
           AND invoice.record_key=line.payload->>'source_invoice_id'
           AND invoice.selection_state IN ('included','reviewed')
           AND invoice.event_date=line.event_date
         WHERE line.payload->>'price_basis'='tax_exclusive'
    )
    SELECT c.rate, c.source, c.observed_date
      FROM candidates c
     WHERE c.uom=c.base_uom_code
       AND c.rate ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'
     ORDER BY c.priority, c.observed_date DESC NULLS LAST, c.tie_breaker
     LIMIT 1;
END
$function$;

ALTER FUNCTION erp_automation_reads.migrated_batch_sale_rate(uuid,uuid,uuid,date) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.migrated_batch_sale_rate(uuid,uuid,uuid,date)
    FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_reads.migrated_batch_sale_rate(uuid,uuid,uuid,date) TO erp_runtime;
