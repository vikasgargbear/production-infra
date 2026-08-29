SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_automation_reads.sales_invoice_product_identity(
    organization_id uuid,
    sales_invoice_id uuid
)
RETURNS TABLE (
    product_id uuid,
    product_row_version bigint,
    product_code text,
    product_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
    WITH command_candidates AS MATERIALIZED (
        SELECT request.id AS command_request_id,
               request.org_id,
               request.branch_id,
               request.request_hash,
               request.preview_hash,
               pg_catalog.convert_from(request.preview_bytes, 'UTF8')::jsonb
                   AS preview,
               count(*) OVER () AS candidate_count
          FROM automation.command_requests AS request
          JOIN sales.invoices AS invoice
            ON invoice.org_id = request.org_id
           AND invoice.id = request.target_resource_id
           AND invoice.branch_id = request.branch_id
           AND invoice.status = 'posted'
         WHERE organization_id = erp_security.current_org_id()
           AND erp_security.current_membership_id() IS NOT NULL
           AND erp_security.current_actor_is_active()
           AND sales_invoice_id IS NOT NULL
           AND request.org_id = organization_id
           AND request.capability_code = 'sales.invoice.prepare'
           AND request.operation = 'sales.invoice.post'
           AND request.status = 'succeeded'
           AND request.target_resource_type = 'sales_invoice'
           AND request.target_resource_id = sales_invoice_id
           AND request.result_resource_type = 'sales_invoice'
           AND request.result_resource_id = sales_invoice_id
           AND request.response_status = 200
           AND erp_security.can_access_branch(request.branch_id)
           AND request.destination_branch_id IS NULL
           AND request.request_hash = pg_catalog.sha256(request.request_bytes)
           AND request.preview_hash = pg_catalog.sha256(request.preview_bytes)
           AND request.response_bytes IS NOT NULL
           AND request.response_hash = pg_catalog.sha256(request.response_bytes)
    ),
    envelope_command AS MATERIALIZED (
        SELECT candidate.*
          FROM command_candidates AS candidate
         WHERE candidate.candidate_count = 1
           AND candidate.preview->>'command_request_id'
                 = candidate.command_request_id::text
           AND candidate.preview->>'organization_id' = candidate.org_id::text
           AND candidate.preview->>'branch_id' = candidate.branch_id::text
           AND candidate.preview->>'capability_code' = 'sales.invoice.prepare'
           AND candidate.preview->>'operation' = 'sales.invoice.post'
           AND candidate.preview->>'target_resource_type' = 'sales_invoice'
           AND candidate.preview->>'target_resource_id' = sales_invoice_id::text
           AND candidate.preview->>'request_hash'
                 = pg_catalog.encode(candidate.request_hash, 'hex')
           AND pg_catalog.jsonb_typeof(
                 candidate.preview->'resolved_references'
               ) = 'array'
    ),
    product_references AS MATERIALIZED (
        SELECT NULLIF(reference.value->>'id', '')::uuid AS product_id,
               NULLIF(reference.value->>'row_version', '')::bigint
                   AS product_row_version,
               pg_catalog.btrim(reference.value->>'product_code') AS product_code,
               pg_catalog.btrim(reference.value->>'product_name') AS product_name
          FROM envelope_command AS command
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(
              command.preview->'resolved_references'
          ) AS reference(value)
         WHERE pg_catalog.jsonb_typeof(reference.value) = 'object'
           AND reference.value->>'resource_type' = 'product'
    ),
    reference_facts AS (
        SELECT reference.*,
               count(*) OVER (PARTITION BY reference.product_id)
                   AS product_reference_count,
               count(*) OVER () AS total_reference_count
          FROM product_references AS reference
    ),
    invoice_products AS MATERIALIZED (
        SELECT DISTINCT line.product_id
          FROM sales.invoice_lines AS line
         WHERE line.org_id = organization_id
           AND line.invoice_id = sales_invoice_id
    )
    SELECT reference.product_id, reference.product_row_version,
           reference.product_code, reference.product_name
      FROM reference_facts AS reference
     WHERE reference.product_reference_count = 1
       AND reference.product_row_version >= 1
       AND reference.product_code IS NOT NULL
       AND reference.product_code <> ''
       AND reference.product_name IS NOT NULL
       AND reference.product_name <> ''
       AND NOT EXISTS (
           SELECT 1
             FROM reference_facts AS invalid_reference
            WHERE invalid_reference.product_reference_count <> 1
               OR invalid_reference.product_row_version < 1
               OR invalid_reference.product_code IS NULL
               OR invalid_reference.product_code = ''
               OR invalid_reference.product_name IS NULL
               OR invalid_reference.product_name = ''
       )
       AND reference.total_reference_count = (
           SELECT count(*) FROM invoice_products
       )
       AND EXISTS (
           SELECT 1
             FROM invoice_products AS invoice_product
            WHERE invoice_product.product_id = reference.product_id
       )
       AND NOT EXISTS (
           SELECT 1
             FROM invoice_products AS invoice_product
             LEFT JOIN reference_facts AS expected
               ON expected.product_id = invoice_product.product_id
              AND expected.product_reference_count = 1
            WHERE expected.product_id IS NULL
       )
     ORDER BY reference.product_id
$function$;

ALTER FUNCTION erp_automation_reads.sales_invoice_product_identity(uuid,uuid)
    OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.sales_invoice_product_identity(uuid,uuid)
    FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.sales_invoice_product_identity(uuid,uuid)
    TO erp_runtime;

RESET ROLE;
