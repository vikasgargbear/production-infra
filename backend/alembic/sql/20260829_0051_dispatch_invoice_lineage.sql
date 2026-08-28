-- Align posted sales-dispatch provenance with the canonical command resource type.
-- Alembic owns the transaction. This script must not be run directly.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    definition text;
    old_scope constant text := $old_scope$           AND request.target_resource_type = 'sales_dispatch'
           AND request.target_resource_id = dispatch_id
           AND request.result_resource_type = 'sales_dispatch'$old_scope$;
    new_scope constant text := $new_scope$           /* canonical_dispatch_invoice_lineage_v1 */
           AND request.target_resource_type = 'dispatch'
           AND request.target_resource_id = dispatch_id
           AND request.result_resource_type = 'dispatch'$new_scope$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
        'erp_automation_reads.sales_dispatch_post_provenance(uuid,uuid)'::regprocedure
    ) INTO STRICT definition;

    IF pg_catalog.strpos(definition,'canonical_dispatch_invoice_lineage_v1')>0
       AND pg_catalog.strpos(definition,old_scope)=0 THEN
        RETURN;
    END IF;
    IF pg_catalog.strpos(definition,old_scope)=0
       OR pg_catalog.length(definition)-pg_catalog.length(
            pg_catalog.replace(definition,old_scope,'')
          )<>pg_catalog.length(old_scope) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-dispatch provenance differs from the reviewed dispatch-lineage precondition';
    END IF;

    definition:=pg_catalog.replace(definition,old_scope,new_scope);
    IF pg_catalog.strpos(definition,'canonical_dispatch_invoice_lineage_v1')=0
       OR pg_catalog.strpos(definition,old_scope)>0 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-dispatch provenance migration did not produce the reviewed definition';
    END IF;
    EXECUTE definition;
END
$migration$;

RESET ROLE;
