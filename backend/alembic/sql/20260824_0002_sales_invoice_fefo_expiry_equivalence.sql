-- Hash-bound incremental migration: sales-invoice FEFO expiry equivalence.
-- Alembic owns the transaction. This script must not be run directly.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
    definition text;
    old_fefo constant text := $old_fefo$      eligible AS (
        SELECT stock.product_id,stock.batch_id,stock.on_hand_quantity,batch_row.expires_on,
          coalesce(sum(stock.on_hand_quantity) OVER (PARTITION BY stock.product_id ORDER BY batch_row.expires_on,stock.batch_id
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_available
        FROM inventory.stock_balances stock JOIN inventory.batches batch_row ON batch_row.org_id=stock.org_id AND batch_row.id=stock.batch_id
        JOIN totals ON totals.product_id=stock.product_id WHERE stock.org_id=organization_id AND stock.location_id=from_location_id
          AND stock.on_hand_quantity>0 AND batch_row.lot_kind='manufacturer_batch' AND batch_row.status='released'
          AND batch_row.released_at IS NOT NULL AND batch_row.expires_on IS NOT NULL AND invoice_date<batch_row.expires_on)
      SELECT count(*) INTO bad_count FROM eligible JOIN totals USING(product_id) LEFT JOIN requested USING(product_id,batch_id)
       WHERE coalesce(requested.requested_base,0) IS DISTINCT FROM
         greatest(least(totals.requested_base-eligible.prior_available,eligible.on_hand_quantity),0);$old_fefo$;
    new_fefo constant text := $new_fefo$      /* sales_invoice_fefo_expiry_date_equivalence_v1 */
      eligible_lots AS (
        SELECT stock.product_id,stock.batch_id,stock.on_hand_quantity,batch_row.expires_on
        FROM inventory.stock_balances stock JOIN inventory.batches batch_row ON batch_row.org_id=stock.org_id AND batch_row.id=stock.batch_id
        JOIN totals ON totals.product_id=stock.product_id WHERE stock.org_id=organization_id AND stock.location_id=from_location_id
          AND stock.on_hand_quantity>0 AND batch_row.lot_kind='manufacturer_batch' AND batch_row.status='released'
          AND batch_row.released_at IS NOT NULL AND batch_row.expires_on IS NOT NULL AND invoice_date<batch_row.expires_on),
      expiry_groups AS (
        SELECT eligible_lot.product_id,eligible_lot.expires_on,
          sum(eligible_lot.on_hand_quantity) expiry_available,
          coalesce(sum(requested.requested_base),0) expiry_requested
        FROM eligible_lots eligible_lot
        LEFT JOIN requested ON requested.product_id=eligible_lot.product_id AND requested.batch_id=eligible_lot.batch_id
        GROUP BY eligible_lot.product_id,eligible_lot.expires_on),
      eligible AS (
        SELECT expiry_group.product_id,expiry_group.expires_on,
          expiry_group.expiry_available,expiry_group.expiry_requested,
          coalesce(sum(expiry_group.expiry_available) OVER (
            PARTITION BY expiry_group.product_id ORDER BY expiry_group.expires_on
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) prior_available
        FROM expiry_groups expiry_group)
      SELECT count(*) INTO bad_count FROM eligible JOIN totals USING(product_id)
       WHERE eligible.expiry_requested IS DISTINCT FROM
         greatest(least(totals.requested_base-eligible.prior_available,eligible.expiry_available),0);$new_fefo$;
BEGIN
    SELECT pg_catalog.pg_get_functiondef(
        'erp_automation_commands.resolve_sales_invoice_prepare(uuid,uuid,uuid,uuid,uuid,character varying,uuid,jsonb)'::regprocedure
    ) INTO STRICT definition;

    IF (pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v1')>0
        OR pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v2')>0
        OR pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v3')>0)
       AND pg_catalog.strpos(definition,old_fefo)=0 THEN
        RETURN;
    END IF;
    IF pg_catalog.strpos(definition,old_fefo)=0
       OR pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_fefo,''))
          <>pg_catalog.length(old_fefo) THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-invoice FEFO source differs from the reviewed migration precondition';
    END IF;

    definition:=pg_catalog.replace(definition,old_fefo,new_fefo);
    IF pg_catalog.strpos(definition,'sales_invoice_fefo_expiry_date_equivalence_v1')=0
       OR pg_catalog.strpos(definition,'ORDER BY batch_row.expires_on,stock.batch_id')>0 THEN
        RAISE EXCEPTION USING ERRCODE='55000',
          MESSAGE='sales-invoice FEFO migration did not produce the reviewed definition';
    END IF;
    EXECUTE definition;
END
$migration$;

RESET ROLE;
