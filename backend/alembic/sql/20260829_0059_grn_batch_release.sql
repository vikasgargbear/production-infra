SET LOCAL ROLE erp_migration_owner;

CREATE TABLE erp_trade_commands.command_scopes (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  scope text NOT NULL,
  org_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  PRIMARY KEY (backend_pid,transaction_id,scope,org_id,entity_id)
);
ALTER TABLE erp_trade_commands.command_scopes OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE erp_trade_commands.command_scopes FROM PUBLIC,erp_app,erp_runtime;

CREATE OR REPLACE FUNCTION "erp_trade_invariants"."guard_batch"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    mrp_conversion_count integer;
    validate_mrp_conversion boolean;
    organization_timezone text;
BEGIN
    validate_mrp_conversion:=TG_OP='INSERT';
    IF TG_OP='UPDATE' THEN
        validate_mrp_conversion:=ROW(
            NEW.product_id, NEW.mrp, NEW.mrp_uom_conversion_id, NEW.created_at
        ) IS DISTINCT FROM ROW(
            OLD.product_id, OLD.mrp, OLD.mrp_uom_conversion_id, OLD.created_at
        );
    END IF;
    IF validate_mrp_conversion THEN
        SELECT timezone INTO STRICT organization_timezone
          FROM core.organizations
         WHERE id=NEW.org_id AND status='active' FOR SHARE;
        SELECT count(*) INTO mrp_conversion_count
          FROM catalog.uom_conversions AS conversion
          JOIN catalog.products AS product
            ON product.org_id=conversion.org_id
           AND product.id=conversion.product_id
         WHERE conversion.org_id=NEW.org_id
           AND conversion.id=NEW.mrp_uom_conversion_id
           AND conversion.product_id=NEW.product_id
           AND conversion.to_uom_code=product.base_uom_code
           AND conversion.status='active'
           AND conversion.valid_from<=(NEW.created_at AT TIME ZONE organization_timezone)::date
           AND (conversion.valid_until IS NULL OR conversion.valid_until>=(NEW.created_at AT TIME ZONE organization_timezone)::date);
        IF mrp_conversion_count<>1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='batch MRP requires the effective marketed-pack to base-UOM conversion for its product';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF (
            OLD.status = 'quarantined' AND NEW.status NOT IN ('quarantined','released','blocked','recalled','expired')
            OR OLD.status = 'released' AND NEW.status NOT IN ('released','blocked','recalled','expired','exhausted')
            OR OLD.status = 'blocked' AND NEW.status NOT IN ('blocked','released','recalled','expired')
            OR OLD.status IN ('recalled','expired','exhausted') AND NEW.status IS DISTINCT FROM OLD.status
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid batch lifecycle transition';
        END IF;
        IF OLD.status='released' AND NEW.status='blocked'
           AND NOT EXISTS (
             SELECT 1 FROM erp_compliance_commands.command_scopes scope
              WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
                AND scope.transaction_id=pg_catalog.txid_current()
                AND scope.scope='temperature_batch_block'
                AND scope.org_id=NEW.org_id AND scope.entity_id=NEW.id
           ) THEN
          RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='released batch blocking requires exact cold-chain command provenance';
        END IF;
        IF OLD.status='quarantined' AND NEW.status='released'
           AND NOT EXISTS (
             SELECT 1 FROM erp_trade_commands.command_scopes scope
              WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
                AND scope.transaction_id=pg_catalog.txid_current()
                AND scope.scope='goods_receipt_batch_release'
                AND scope.org_id=NEW.org_id AND scope.entity_id=NEW.id
           ) THEN
          RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='batch release requires exact posted goods-receipt command provenance';
        END IF;
        IF ROW(
            NEW.product_id, NEW.batch_number, NEW.lot_kind,
            NEW.manufactured_on, NEW.expires_on, NEW.mrp, NEW.mrp_uom_conversion_id
        ) IS DISTINCT FROM ROW(
            OLD.product_id, OLD.batch_number, OLD.lot_kind,
            OLD.manufactured_on, OLD.expires_on, OLD.mrp, OLD.mrp_uom_conversion_id
        ) AND EXISTS (
            SELECT 1 FROM inventory.stock_ledger_entries AS entry
             WHERE entry.org_id = OLD.org_id AND entry.batch_id = OLD.id
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted batch identity, MRP, and marketed-pack basis are immutable';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION "erp_trade_commands"."post_goods_receipt"(p_org_id uuid, p_goods_receipt_id uuid, p_inventory_document_id uuid, p_actor_id uuid, p_idempotency_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE claim_id uuid; replay_id uuid; source procurement.goods_receipts%ROWTYPE;
        v_purchase_order_id uuid; purchase_order_count integer; remaining_count integer;
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      p_org_id,p_actor_id,'procurement.receipt.post',p_idempotency_key_hash,p_request_hash,p_expires_at
    );
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO STRICT source FROM procurement.goods_receipts WHERE org_id=p_org_id AND id=p_goods_receipt_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('procurement.receipt.post',source.branch_id);
    PERFORM erp_trade_commands.assert_permission('inventory.document.post',source.branch_id);
    SELECT count(DISTINCT line.purchase_order_id)
      INTO purchase_order_count
      FROM procurement.goods_receipt_lines receipt_line
      JOIN procurement.purchase_order_lines line ON line.org_id=receipt_line.org_id
       AND line.id=receipt_line.purchase_order_line_id
     WHERE receipt_line.org_id=p_org_id AND receipt_line.goods_receipt_id=p_goods_receipt_id;
    SELECT line.purchase_order_id INTO v_purchase_order_id
      FROM procurement.goods_receipt_lines receipt_line
      JOIN procurement.purchase_order_lines line ON line.org_id=receipt_line.org_id
       AND line.id=receipt_line.purchase_order_line_id
     WHERE receipt_line.org_id=p_org_id AND receipt_line.goods_receipt_id=p_goods_receipt_id
     LIMIT 1;
    PERFORM 1 FROM procurement.purchase_orders purchase_order
     WHERE purchase_order.org_id=p_org_id AND purchase_order.id=v_purchase_order_id
       AND purchase_order.branch_id=source.branch_id
       AND purchase_order.supplier_account_id=source.supplier_account_id
       AND purchase_order.status IN ('approved','partially_received')
     FOR UPDATE;
    IF purchase_order_count<>1 OR NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods receipt must own lines from one exact receivable purchase order';
    END IF;
    IF EXISTS (
      SELECT 1 FROM procurement.purchase_order_lines ordered
       WHERE ordered.org_id=p_org_id AND ordered.purchase_order_id=v_purchase_order_id
         AND ordered.line_kind='product' AND (
           COALESCE((SELECT sum(receipt_line.base_accepted_quantity)
                       FROM procurement.goods_receipt_lines receipt_line
                       JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                        AND receipt.id=receipt_line.goods_receipt_id
                      WHERE receipt_line.org_id=ordered.org_id
                        AND receipt_line.purchase_order_line_id=ordered.id
                        AND (receipt.status='posted' OR receipt.id=p_goods_receipt_id)),0)>ordered.base_billed_quantity
           OR COALESCE((SELECT sum(receipt_line.base_free_quantity)
                          FROM procurement.goods_receipt_lines receipt_line
                          JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                           AND receipt.id=receipt_line.goods_receipt_id
                         WHERE receipt_line.org_id=ordered.org_id
                           AND receipt_line.purchase_order_line_id=ordered.id
                           AND (receipt.status='posted' OR receipt.id=p_goods_receipt_id)),0)>ordered.base_free_quantity
         )
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods receipt exceeds the locked accepted billed or free purchase-order ceiling';
    END IF;
    IF source.status<>'approved' OR NOT EXISTS (
        SELECT 1 FROM inventory.inventory_documents doc WHERE doc.org_id=p_org_id AND doc.id=p_inventory_document_id
          AND doc.goods_receipt_id=p_goods_receipt_id AND doc.document_type='purchase_receipt' AND doc.status='approved'
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='goods receipt requires one approved typed inventory receipt'; END IF;
    PERFORM erp_trade_commands.post_locked_document(p_org_id,p_inventory_document_id,p_actor_id);
    INSERT INTO erp_trade_commands.command_scopes(
      backend_pid,transaction_id,scope,org_id,entity_id
    )
    SELECT pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'goods_receipt_batch_release',
           receipt_line.org_id,receipt_line.batch_id
      FROM procurement.goods_receipt_lines receipt_line
      JOIN inventory.locations location
        ON location.org_id=receipt_line.org_id AND location.id=receipt_line.location_id
      JOIN inventory.batches batch
        ON batch.org_id=receipt_line.org_id AND batch.id=receipt_line.batch_id
     WHERE receipt_line.org_id=p_org_id
       AND receipt_line.goods_receipt_id=p_goods_receipt_id
       AND receipt_line.qc_status IN ('accepted','partial')
       AND receipt_line.base_accepted_quantity+receipt_line.base_free_quantity>0
       AND location.status='active'
       AND location.location_type IN ('saleable','cold_storage')
       AND batch.status='quarantined'
    ON CONFLICT DO NOTHING;
    UPDATE inventory.batches batch
       SET status='released',released_at=pg_catalog.transaction_timestamp(),
           released_by_membership_id=p_actor_id,
           updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=p_actor_id,
           row_version=batch.row_version+1
      FROM erp_trade_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='goods_receipt_batch_release'
       AND scope.org_id=p_org_id
       AND batch.org_id=scope.org_id AND batch.id=scope.entity_id
       AND batch.status='quarantined';
    DELETE FROM erp_trade_commands.command_scopes
     WHERE backend_pid=pg_catalog.pg_backend_pid()
       AND transaction_id=pg_catalog.txid_current()
       AND scope='goods_receipt_batch_release' AND org_id=p_org_id;
    UPDATE procurement.goods_receipts SET status='posted',posted_at=pg_catalog.transaction_timestamp(),posted_by_membership_id=p_actor_id,
      updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=p_actor_id,row_version=row_version+1
      WHERE org_id=p_org_id AND id=p_goods_receipt_id AND status='approved';
    SELECT count(*) INTO remaining_count
      FROM procurement.purchase_order_lines ordered
     WHERE ordered.org_id=p_org_id AND ordered.purchase_order_id=v_purchase_order_id
       AND ordered.line_kind='product' AND (
         COALESCE((SELECT sum(receipt_line.base_accepted_quantity)
                     FROM procurement.goods_receipt_lines receipt_line
                     JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                      AND receipt.id=receipt_line.goods_receipt_id
                    WHERE receipt_line.org_id=ordered.org_id
                      AND receipt_line.purchase_order_line_id=ordered.id
                      AND receipt.status='posted'),0)<ordered.base_billed_quantity
         OR COALESCE((SELECT sum(receipt_line.base_free_quantity)
                        FROM procurement.goods_receipt_lines receipt_line
                        JOIN procurement.goods_receipts receipt ON receipt.org_id=receipt_line.org_id
                         AND receipt.id=receipt_line.goods_receipt_id
                       WHERE receipt_line.org_id=ordered.org_id
                         AND receipt_line.purchase_order_line_id=ordered.id
                         AND receipt.status='posted'),0)<ordered.base_free_quantity
       );
    UPDATE procurement.purchase_orders
       SET status=CASE WHEN remaining_count=0 THEN 'received' ELSE 'partially_received' END,
           updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=p_actor_id,
           row_version=row_version+1
     WHERE org_id=p_org_id AND id=v_purchase_order_id AND status IN ('approved','partially_received');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase order receipt lifecycle changed during posting';
    END IF;
    PERFORM erp_trade_commands.finish_claim(p_org_id,claim_id,'procurement.goods_receipts',p_goods_receipt_id);
    RETURN p_goods_receipt_id;
END
$function$;

ALTER FUNCTION erp_trade_invariants.guard_batch() OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_trade_invariants.guard_batch() FROM PUBLIC,erp_app,erp_runtime;
ALTER FUNCTION erp_trade_commands.post_goods_receipt(
  uuid,uuid,uuid,uuid,bytea,bytea,timestamptz
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_trade_commands.post_goods_receipt(
  uuid,uuid,uuid,uuid,bytea,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_trade_commands.post_goods_receipt(
  uuid,uuid,uuid,uuid,bytea,bytea,timestamptz
) TO erp_app,erp_runtime;

RESET ROLE;
