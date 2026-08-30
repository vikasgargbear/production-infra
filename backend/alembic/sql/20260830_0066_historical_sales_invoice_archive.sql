SET LOCAL ROLE erp_migration_owner;

CREATE FUNCTION erp_automation_reads.historical_sales_invoice_archive(
    organization_id uuid,
    branch_ids_filter uuid[],
    search_filter text,
    offset_filter integer,
    limit_filter integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
#variable_conflict use_variable
DECLARE result jsonb;
BEGIN
    PERFORM erp_core_commands.assert_context(
        organization_id,NULL,NULL::uuid
    );
    IF offset_filter < 0 OR limit_filter NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION USING ERRCODE='22023',
          MESSAGE='historical invoice archive pagination is invalid';
    END IF;

    WITH visible_invoices AS MATERIALIZED (
        SELECT fact.*,
               COALESCE(
                 NULLIF(fact.payload->>'invoice_number',''),fact.record_key
               ) AS invoice_number
          FROM automation.historical_migration_facts AS fact
         WHERE fact.org_id=organization_id
           AND (branch_ids_filter IS NULL
                OR fact.branch_id=ANY(branch_ids_filter))
           AND fact.source_kind='sales_invoice'
           AND fact.selection_state NOT IN ('quarantined','archive-only')
           AND (
             search_filter=''
             OR pg_catalog.lower(COALESCE(
                  NULLIF(fact.payload->>'invoice_number',''),fact.record_key
                )) LIKE '%'||search_filter||'%'
             OR pg_catalog.lower(COALESCE(
                  NULLIF(fact.party_name,''),NULLIF(fact.party_key,''),''
                )) LIKE '%'||search_filter||'%'
           )
    ), page AS MATERIALIZED (
        SELECT invoice.*
          FROM visible_invoices AS invoice
         ORDER BY invoice.event_date DESC,invoice.invoice_number,invoice.record_key
         OFFSET offset_filter LIMIT limit_filter
    ), page_items AS (
        SELECT invoice.record_key,
               invoice.invoice_number,
               invoice.event_date AS invoice_date,
               COALESCE(
                 NULLIF(invoice.party_name,''),NULLIF(invoice.party_key,''),
                 'Unresolved customer'
               ) AS customer_name,
               (
                 SELECT count(*)::integer
                   FROM automation.historical_migration_facts AS line
                  WHERE line.org_id=invoice.org_id
                    AND line.branch_id=invoice.branch_id
                    AND line.source_kind='sales_invoice_line'
                    AND line.selection_state NOT IN ('quarantined','archive-only')
                    AND line.payload->>'source_invoice_id'=invoice.record_key
               ) AS line_count,
               COALESCE(invoice.taxable_amount,0)::numeric(20,2) AS taxable_amount,
               COALESCE(invoice.tax_amount,0)::numeric(20,2) AS tax_amount,
               COALESCE(invoice.total_amount,0)::numeric(20,2) AS total_amount
          FROM page AS invoice
    )
    SELECT pg_catalog.jsonb_build_object(
      'items',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'record_key',item.record_key,
          'invoice_number',item.invoice_number,
          'invoice_date',item.invoice_date,
          'customer_name',item.customer_name,
          'line_count',item.line_count,
          'taxable_amount',item.taxable_amount::text,
          'tax_amount',item.tax_amount::text,
          'total_amount',item.total_amount::text
        ) ORDER BY item.invoice_date DESC,item.invoice_number,item.record_key)
          FROM page_items AS item
      ),'[]'::jsonb),
      'total',(SELECT count(*)::integer FROM visible_invoices),
      'offset',offset_filter,
      'limit',limit_filter
    ) INTO result;
    RETURN result;
END
$function$;

ALTER FUNCTION erp_automation_reads.historical_sales_invoice_archive(
    uuid,uuid[],text,integer,integer
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.historical_sales_invoice_archive(
    uuid,uuid[],text,integer,integer
) FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_sales_invoice_archive(
    uuid,uuid[],text,integer,integer
) TO erp_runtime;

RESET ROLE;
