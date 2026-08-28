-- Bind the FEFO quantity calculation to the SQL UOM row, not the PL/pgSQL
-- ``conversion`` record variable. Alembic owns this transaction.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    definition text;
    definition_sha256 text;
    old_requested constant text := $old$      WITH requested AS (
        SELECT (line.value->>'product_id')::uuid product_id,(allocation.value->>'batch_id')::uuid batch_id,
          sum(pg_catalog.round(((allocation.value->>'billed_quantity')::numeric+(allocation.value->>'free_quantity')::numeric)*conversion.multiplier,6)) requested_base
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        JOIN catalog.uom_conversions conversion ON conversion.org_id=organization_id AND conversion.id=(line.value->>'uom_conversion_id')::uuid
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(COALESCE(line.value->'batch_allocations','[]'::jsonb)) allocation(value)
        WHERE line.value->>'fulfillment_source'='direct_issue'
        GROUP BY (line.value->>'product_id')::uuid,(allocation.value->>'batch_id')::uuid
      ), totals AS (SELECT product_id,sum(requested_base) requested_base FROM requested GROUP BY product_id),
      /* sales_invoice_fefo_expiry_date_equivalence_v1 */$old$;
    new_requested constant text := $new$      WITH requested AS (
        SELECT (line.value->>'product_id')::uuid product_id,(allocation.value->>'batch_id')::uuid batch_id,
          sum(pg_catalog.round(((allocation.value->>'billed_quantity')::numeric+(allocation.value->>'free_quantity')::numeric)*requested_conversion.multiplier,6)) requested_base
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        JOIN catalog.uom_conversions requested_conversion
          ON requested_conversion.org_id=organization_id
         AND requested_conversion.id=(line.value->>'uom_conversion_id')::uuid
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(COALESCE(line.value->'batch_allocations','[]'::jsonb)) allocation(value)
        WHERE line.value->>'fulfillment_source'='direct_issue'
        GROUP BY (line.value->>'product_id')::uuid,(allocation.value->>'batch_id')::uuid
      ), totals AS (SELECT product_id,sum(requested_base) requested_base FROM requested GROUP BY product_id),
      /* sales_invoice_fefo_expiry_date_equivalence_v3 */$new$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
      'erp_automation_commands.resolve_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'::regprocedure
    ) INTO STRICT definition;
    definition_sha256:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(definition,'UTF8'),'sha256'),'hex');

    IF definition_sha256='1c3e7b3c0be0312bf18eda68ae177604a960734ffe87a6b56a8d6331068e21e1'
       AND pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v3')>0
       AND pg_catalog.strpos(definition,old_requested)=0 THEN
        RETURN;
    END IF;
    IF pg_catalog.length(definition)-pg_catalog.length(
         pg_catalog.replace(definition,old_requested,''))<>pg_catalog.length(old_requested) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-invoice FEFO UOM source differs from the reviewed migration precondition';
    END IF;

    definition:=pg_catalog.replace(definition,old_requested,new_requested);
    definition:=pg_catalog.replace(definition,'      eligible AS (','      fefo_eligible AS (');
    definition:=pg_catalog.replace(definition,'FROM eligible JOIN totals USING(product_id)','FROM fefo_eligible JOIN totals USING(product_id)');
    definition:=pg_catalog.replace(definition,'eligible.expiry_requested','fefo_eligible.expiry_requested');
    definition:=pg_catalog.replace(definition,'eligible.prior_available','fefo_eligible.prior_available');
    definition:=pg_catalog.replace(definition,'eligible.expiry_available','fefo_eligible.expiry_available');
    IF pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v3')=0
       OR pg_catalog.strpos(definition,'JOIN catalog.uom_conversions conversion ON conversion.org_id=organization_id')>0 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-invoice FEFO UOM migration did not produce the reviewed definition';
    END IF;
    EXECUTE definition;
END
$migration$;

RESET ROLE;
