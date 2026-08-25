-- Reconcile a direct invoice line to the aggregate of its linked batch issue
-- lines. Alembic owns this transaction.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    definition text;
    definition_sha256 text;
    old_lineage constant text := $old$             (doc.sales_invoice_id IS NOT NULL AND invoice_line.invoice_id=doc.sales_invoice_id
              AND invoice_line.line_kind='product' AND invoice_line.product_id=line.product_id
              AND invoice_line.uom_code=line.uom_code
              AND invoice_line.base_billed_quantity+invoice_line.base_free_quantity=line.base_quantity)$old$;
    new_lineage constant text := $new$             /* sales_invoice_multibatch_inventory_lineage_v1 */
             (doc.sales_invoice_id IS NOT NULL AND invoice_line.invoice_id=doc.sales_invoice_id
              AND invoice_line.line_kind='product' AND invoice_line.product_id=line.product_id
              AND invoice_line.uom_code=line.uom_code
              AND invoice_line.base_billed_quantity+invoice_line.base_free_quantity=(
                SELECT sum(sibling.base_quantity)
                  FROM inventory.inventory_document_lines sibling
                 WHERE sibling.org_id=line.org_id
                   AND sibling.inventory_document_id=line.inventory_document_id
                   AND sibling.sales_invoice_line_id=invoice_line.id))$new$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
      'erp_trade_commands.assert_inventory_document(uuid,uuid)'::regprocedure
    ) INTO STRICT definition;
    definition_sha256:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(definition,'UTF8'),'sha256'),'hex');

    IF definition_sha256='7ded2c77a3a18d3ef9ca37d5366c16656c56ed44b12929e47fda3ba3f7be5a5b'
       AND pg_catalog.strpos(definition,'sales_invoice_multibatch_inventory_lineage_v1')>0
       AND pg_catalog.strpos(definition,old_lineage)=0 THEN
        RETURN;
    END IF;
    IF pg_catalog.length(definition)-pg_catalog.length(
         pg_catalog.replace(definition,old_lineage,''))<>pg_catalog.length(old_lineage) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-invoice inventory lineage differs from the reviewed migration precondition';
    END IF;

    definition:=pg_catalog.replace(definition,old_lineage,new_lineage);
    IF pg_catalog.strpos(definition,'sales_invoice_multibatch_inventory_lineage_v1')=0
       OR pg_catalog.strpos(definition,'sibling.sales_invoice_line_id=invoice_line.id')=0 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-invoice inventory lineage migration did not produce the reviewed definition';
    END IF;
    EXECUTE definition;
END
$migration$;

RESET ROLE;
