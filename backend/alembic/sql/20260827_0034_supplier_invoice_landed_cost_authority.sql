SET LOCAL ROLE erp_migration_owner;

ALTER TABLE procurement.supplier_invoice_lines
  ADD COLUMN landed_cost_allocation_method text;

ALTER TABLE procurement.supplier_invoice_lines
  ADD CONSTRAINT supplier_invoice_lines_landed_cost_allocation_ck CHECK (
    (inventory_cost_treatment='capitalize'
      AND landed_cost_allocation_method IN ('direct','quantity_weighted','value_weighted'))
    OR (inventory_cost_treatment='expense'
      AND landed_cost_allocation_method IS NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION "erp_trade_commands_v2"."total_landed_cost_pool"(p_org_id uuid, p_supplier_invoice_line_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE source procurement.supplier_invoice_lines%ROWTYPE;
        invoice_status text;
        allocated_billed numeric(20,6);
        allocated_free numeric(20,6);
        receipt_cost numeric;
BEGIN
    SELECT line.* INTO source
      FROM procurement.supplier_invoice_lines AS line
      JOIN procurement.supplier_invoices AS invoice
        ON invoice.org_id=line.org_id AND invoice.id=line.supplier_invoice_id
     WHERE line.org_id=p_org_id AND line.id=p_supplier_invoice_line_id
     FOR SHARE OF line, invoice;
    SELECT invoice.status INTO invoice_status
      FROM procurement.supplier_invoices AS invoice
     WHERE invoice.org_id=p_org_id AND invoice.id=source.supplier_invoice_id;
    IF source.id IS NULL OR invoice_status NOT IN ('approved','posted') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed cost requires an approved or posted supplier invoice line';
    END IF;
    IF source.inventory_cost_treatment<>'capitalize' THEN
        RETURN 0;
    END IF;
    IF source.line_kind='charge' THEN
        RETURN source.net_value_amount;
    END IF;

    SELECT COALESCE(sum(allocation.allocated_base_billed_quantity),0),
           COALESCE(sum(allocation.allocated_base_free_quantity),0),
           COALESCE(sum(pg_catalog.round(
               (allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity)
               * receipt.unit_cost, 2
           )),0)
      INTO allocated_billed,allocated_free,receipt_cost
      FROM procurement.supplier_invoice_receipt_allocations AS allocation
      JOIN procurement.goods_receipt_lines AS receipt
        ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
     WHERE allocation.org_id=p_org_id
       AND allocation.supplier_invoice_line_id=p_supplier_invoice_line_id;
    IF allocated_billed IS DISTINCT FROM source.base_billed_quantity
       OR allocated_free IS DISTINCT FROM source.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized product cost requires complete receipt allocation';
    END IF;
    RETURN source.net_value_amount-receipt_cost;
END
$function$;

ALTER FUNCTION "erp_trade_commands_v2"."total_landed_cost_pool"(uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_trade_commands_v2"."total_landed_cost_pool"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_trade_commands_v2"."eligible_landed_cost_pool"(p_org_id uuid, p_supplier_invoice_line_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE source procurement.supplier_invoice_lines%ROWTYPE;
        total_pool numeric(20,2); source_basis numeric; remaining_basis numeric;
        target_count bigint; exact_source_provenance boolean;
BEGIN
    SELECT * INTO STRICT source FROM procurement.supplier_invoice_lines
     WHERE org_id=p_org_id AND id=p_supplier_invoice_line_id FOR SHARE;
    total_pool:=erp_trade_commands_v2.total_landed_cost_pool(p_org_id,p_supplier_invoice_line_id);
    IF total_pool=0 OR source.inventory_cost_treatment<>'capitalize' THEN RETURN 0; END IF;
    IF source.landed_cost_allocation_method NOT IN ('direct','quantity_weighted','value_weighted') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized supplier line lacks a reviewed landed-cost allocation method';
    END IF;

    WITH raw_targets AS (
      SELECT receipt.location_id,receipt.product_id,receipt.batch_id,
             receipt.id AS goods_receipt_line_id,
             allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity AS allocated_quantity,
             receipt.base_accepted_quantity+receipt.base_free_quantity AS receipt_quantity,
             pg_catalog.round((allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity)*receipt.unit_cost,2) AS allocated_value
        FROM procurement.supplier_invoice_receipt_allocations allocation
        JOIN procurement.supplier_invoice_lines product_line
          ON product_line.org_id=allocation.org_id AND product_line.id=allocation.supplier_invoice_line_id
        JOIN procurement.goods_receipt_lines receipt
          ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
       WHERE allocation.org_id=p_org_id
         AND product_line.supplier_invoice_id=source.supplier_invoice_id
         AND (source.line_kind='charge' OR product_line.id=source.id)
    ), targets AS (
      SELECT location_id,product_id,batch_id,sum(allocated_quantity) AS allocated_quantity,
             sum(allocated_value) AS allocated_value,
             bool_and(allocated_quantity=receipt_quantity) AS fully_allocated_receipt,
             array_agg(goods_receipt_line_id) AS goods_receipt_line_ids
        FROM raw_targets GROUP BY location_id,product_id,batch_id
    )
    SELECT count(*),bool_and(target.fully_allocated_receipt AND NOT EXISTS (
             SELECT 1
               FROM inventory.stock_ledger_entries AS entry
               JOIN inventory.inventory_document_lines AS document_line
                 ON document_line.org_id=entry.org_id
                AND document_line.id=entry.inventory_document_line_id
              WHERE entry.org_id=p_org_id
                AND entry.location_id=target.location_id
                AND entry.product_id=target.product_id
                AND entry.batch_id=target.batch_id
                AND entry.quantity_delta>0
                AND NOT (document_line.goods_receipt_line_id=ANY(target.goods_receipt_line_ids))
           )),
           CASE source.landed_cost_allocation_method
             WHEN 'value_weighted' THEN sum(target.allocated_value)
             ELSE sum(target.allocated_quantity)
           END,
           CASE source.landed_cost_allocation_method
             WHEN 'value_weighted' THEN sum(pg_catalog.round(
               LEAST(target.allocated_quantity,COALESCE(balance.on_hand_quantity,0))
               * target.allocated_value/target.allocated_quantity,2))
             ELSE sum(LEAST(target.allocated_quantity,COALESCE(balance.on_hand_quantity,0)))
           END
      INTO target_count,exact_source_provenance,source_basis,remaining_basis
      FROM targets target
      LEFT JOIN inventory.stock_balances balance
        ON balance.org_id=p_org_id AND balance.location_id=target.location_id
       AND balance.product_id=target.product_id AND balance.batch_id=target.batch_id;
    IF target_count=0 OR source_basis<=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized supplier line has no exact receipt allocation basis';
    END IF;
    IF exact_source_provenance IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost remaining stock is ambiguous because receipt stock is partial or co-mingled';
    END IF;
    IF source.landed_cost_allocation_method='direct' AND target_count<>1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='direct landed-cost allocation requires exactly one receipt stock identity';
    END IF;
    IF remaining_basis<=0 THEN RETURN 0; END IF;
    RETURN pg_catalog.round(total_pool*remaining_basis/source_basis,2);
END
$function$;

ALTER FUNCTION "erp_trade_commands_v2"."eligible_landed_cost_pool"(uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_trade_commands_v2"."eligible_landed_cost_pool"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_trade_commands_v2"."consumed_landed_cost_pool"(p_org_id uuid, p_supplier_invoice_line_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    RETURN erp_trade_commands_v2.total_landed_cost_pool(p_org_id,p_supplier_invoice_line_id)
         - erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,p_supplier_invoice_line_id);
END
$function$;

ALTER FUNCTION "erp_trade_commands_v2"."consumed_landed_cost_pool"(uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_trade_commands_v2"."consumed_landed_cost_pool"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_trade_commands_v2"."assert_landed_cost_document"(p_org_id uuid, p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE doc inventory.inventory_documents%ROWTYPE;
        source_line record;
        bad_count bigint;
        source_count bigint;
        expected_count bigint;
        pool numeric;
        locked_supplier_invoice_id uuid;
BEGIN
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=p_org_id AND id=p_document_id FOR UPDATE;
    IF doc.status NOT IN ('approved','posted') OR doc.document_type<>'cost_adjustment'
       OR doc.supplier_invoice_id IS NULL
       OR doc.costing_method_snapshot<>'moving_weighted_average' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost command requires an approved or posted typed MWA cost adjustment';
    END IF;
    SELECT id INTO locked_supplier_invoice_id FROM procurement.supplier_invoices
     WHERE org_id=p_org_id AND id=doc.supplier_invoice_id AND status='posted'
     FOR SHARE;
    IF locked_supplier_invoice_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost source supplier invoice is not posted';
    END IF;
    SELECT count(*) INTO source_count FROM inventory.inventory_document_lines
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF source_count=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost document has no allocation lines';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_org_id::text||':landed-cost:'||p_document_id::text,82410617)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key,82410618))
      FROM (
        SELECT DISTINCT p_org_id::text||':'||line.from_location_id::text||':'||line.product_id::text||':'||line.batch_id::text AS lock_key
          FROM inventory.inventory_document_lines AS line
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
         ORDER BY lock_key
      ) AS locked;
    PERFORM balance.location_id
      FROM inventory.stock_balances AS balance
      JOIN (
        SELECT DISTINCT from_location_id,product_id,batch_id
          FROM inventory.inventory_document_lines
         WHERE org_id=p_org_id AND inventory_document_id=p_document_id
      ) AS target
        ON target.from_location_id=balance.location_id
       AND target.product_id=balance.product_id AND target.batch_id=balance.batch_id
     WHERE balance.org_id=p_org_id
     ORDER BY balance.location_id,balance.product_id,balance.batch_id
     FOR UPDATE OF balance;

    SELECT count(*) INTO bad_count
      FROM inventory.inventory_document_lines AS line
      JOIN inventory.batches AS batch
        ON batch.org_id=line.org_id AND batch.id=line.batch_id
      JOIN inventory.locations AS location
        ON location.org_id=line.org_id AND location.id=line.from_location_id
      LEFT JOIN inventory.stock_balances AS balance
        ON balance.org_id=line.org_id AND balance.location_id=line.from_location_id
       AND balance.product_id=line.product_id AND balance.batch_id=line.batch_id
      JOIN procurement.supplier_invoice_lines AS supplier_line
        ON supplier_line.org_id=line.org_id AND supplier_line.id=line.supplier_invoice_line_id
     WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
       AND (line.movement_kind<>'value_adjustment'
         OR supplier_line.supplier_invoice_id IS DISTINCT FROM doc.supplier_invoice_id
         OR supplier_line.inventory_cost_treatment<>'capitalize'
         OR batch.product_id IS DISTINCT FROM line.product_id
         OR location.branch_id IS DISTINCT FROM doc.branch_id
         OR balance.on_hand_quantity IS NULL OR balance.on_hand_quantity<=0
         OR balance.inventory_value+line.extended_cost<0
         OR (line.cost_allocation_method='quantity_weighted'
             AND line.cost_allocation_basis_quantity IS DISTINCT FROM balance.on_hand_quantity)
         OR (line.cost_allocation_method='value_weighted'
             AND line.cost_allocation_basis_value IS DISTINCT FROM
               balance.inventory_value-COALESCE((
                 SELECT sum(entry.value_delta) FROM inventory.stock_ledger_entries entry
                  WHERE entry.org_id=line.org_id AND entry.inventory_document_id=line.inventory_document_id
                    AND entry.location_id=line.from_location_id AND entry.product_id=line.product_id
                    AND entry.batch_id=line.batch_id AND entry.entry_kind='value_adjustment'
               ),0))
         OR NOT EXISTS (
             SELECT 1
               FROM procurement.supplier_invoice_receipt_allocations AS allocation
               JOIN procurement.goods_receipt_lines AS receipt
                 ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
               JOIN procurement.supplier_invoice_lines AS allocated_line
                 ON allocated_line.org_id=allocation.org_id AND allocated_line.id=allocation.supplier_invoice_line_id
              WHERE allocation.org_id=line.org_id
                AND allocated_line.supplier_invoice_id=doc.supplier_invoice_id
                AND receipt.product_id=line.product_id
                AND receipt.batch_id=line.batch_id
                AND receipt.location_id=line.from_location_id
                AND (supplier_line.line_kind='charge'
                     OR allocated_line.id=supplier_line.id)
         ));
    IF bad_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost target is not positive on-hand stock from the supplier invoice receipt lineage';
    END IF;

    FOR source_line IN
        SELECT supplier_line.id,
               count(line.id) AS allocation_count,
               min(line.cost_allocation_method) AS allocation_method,
               max(line.cost_allocation_method) AS max_allocation_method,
               sum(line.cost_allocation_weight) AS weight_total
          FROM procurement.supplier_invoice_lines AS supplier_line
          JOIN inventory.inventory_document_lines AS line
            ON line.org_id=supplier_line.org_id AND line.supplier_invoice_line_id=supplier_line.id
         WHERE supplier_line.org_id=p_org_id
           AND supplier_line.supplier_invoice_id=doc.supplier_invoice_id
           AND line.inventory_document_id=p_document_id
         GROUP BY supplier_line.id
         ORDER BY supplier_line.id
    LOOP
        pool := erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,source_line.id);
        IF pool=0 OR source_line.allocation_method IS DISTINCT FROM source_line.max_allocation_method
           OR source_line.weight_total IS DISTINCT FROM 1
           OR (source_line.allocation_method='direct' AND source_line.allocation_count<>1) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost source pool, method, or exact weight total is invalid';
        END IF;

        SELECT count(*) INTO bad_count
          FROM (
            SELECT line.id,line.line_number,line.extended_cost,line.cost_allocation_method,
                   line.cost_allocation_weight,
                   CASE line.cost_allocation_method
                     WHEN 'quantity_weighted' THEN line.cost_allocation_basis_quantity
                     WHEN 'value_weighted' THEN line.cost_allocation_basis_value
                     ELSE 1
                   END AS basis,
                   sum(CASE line.cost_allocation_method
                         WHEN 'quantity_weighted' THEN line.cost_allocation_basis_quantity
                         WHEN 'value_weighted' THEN line.cost_allocation_basis_value
                         ELSE 1
                       END) OVER () AS basis_total,
                   row_number() OVER (ORDER BY line.line_number,line.id) AS allocation_position,
                   count(*) OVER () AS allocation_total
              FROM inventory.inventory_document_lines AS line
             WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
               AND line.supplier_invoice_line_id=source_line.id
          ) AS allocation
         WHERE allocation.cost_allocation_weight IS DISTINCT FROM
                 CASE WHEN allocation.cost_allocation_method='direct' THEN 1
                      WHEN allocation.allocation_position<allocation.allocation_total
                      THEN pg_catalog.round(allocation.basis/allocation.basis_total,12)
                      ELSE 1-COALESCE((
                          SELECT sum(pg_catalog.round(prior.basis/prior.basis_total,12))
                            FROM (
                              SELECT CASE earlier.cost_allocation_method
                                       WHEN 'quantity_weighted' THEN earlier.cost_allocation_basis_quantity
                                       WHEN 'value_weighted' THEN earlier.cost_allocation_basis_value
                                       ELSE 1
                                     END AS basis,
                                     sum(CASE earlier.cost_allocation_method
                                           WHEN 'quantity_weighted' THEN earlier.cost_allocation_basis_quantity
                                           WHEN 'value_weighted' THEN earlier.cost_allocation_basis_value
                                           ELSE 1
                                         END) OVER () AS basis_total,
                                     row_number() OVER (ORDER BY earlier.line_number,earlier.id) AS position
                                FROM inventory.inventory_document_lines AS earlier
                               WHERE earlier.org_id=p_org_id
                                 AND earlier.inventory_document_id=p_document_id
                                 AND earlier.supplier_invoice_line_id=source_line.id
                            ) AS prior
                           WHERE prior.position<allocation.allocation_total
                      ),0) END
            OR allocation.extended_cost IS DISTINCT FROM
                 CASE WHEN allocation.allocation_position<allocation.allocation_total
                      THEN pg_catalog.round(pool*allocation.cost_allocation_weight,2)
                      ELSE pool-COALESCE((
                          SELECT sum(pg_catalog.round(pool*prior.cost_allocation_weight,2))
                            FROM (
                              SELECT earlier.cost_allocation_weight,
                                     row_number() OVER (ORDER BY earlier.line_number,earlier.id) AS position
                                FROM inventory.inventory_document_lines AS earlier
                               WHERE earlier.org_id=p_org_id
                                 AND earlier.inventory_document_id=p_document_id
                                 AND earlier.supplier_invoice_line_id=source_line.id
                            ) AS prior
                           WHERE prior.position<allocation.allocation_total
                      ),0) END;
        IF bad_count<>0 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost weights or deterministic final-paise allocation do not match the eligible pool';
        END IF;
    END LOOP;

    SELECT count(*) INTO source_count
      FROM (
        SELECT DISTINCT supplier_invoice_line_id
          FROM inventory.inventory_document_lines
         WHERE org_id=p_org_id AND inventory_document_id=p_document_id
      ) AS sources;
    SELECT count(*) INTO expected_count
      FROM procurement.supplier_invoice_lines AS line
     WHERE line.org_id=p_org_id AND line.supplier_invoice_id=doc.supplier_invoice_id
       AND line.inventory_cost_treatment='capitalize'
       AND erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,line.id)<>0;
    IF source_count<>expected_count THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost document does not allocate every and only nonzero capitalized source pool';
    END IF;
END
$function$;

ALTER FUNCTION "erp_trade_commands_v2"."assert_landed_cost_document"(uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_trade_commands_v2"."assert_landed_cost_document"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_trade_commands_v2"."prepare_supplier_invoice_landed_cost_adjustment"(p_org_id uuid, p_supplier_invoice_id uuid, p_document_id uuid, p_actor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE invoice procurement.supplier_invoices%ROWTYPE;
        source_line procurement.supplier_invoice_lines%ROWTYPE; target record;
        pool numeric(20,2); basis numeric; basis_total numeric;
        weight numeric(20,12); allocated_weight numeric(20,12):=0;
        allocated_value numeric(20,2):=0; line_value numeric(20,2);
        line_number integer:=0; target_count bigint; target_position bigint;
        document_value numeric(20,2);
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    SELECT * INTO STRICT invoice FROM procurement.supplier_invoices
     WHERE org_id=p_org_id AND id=p_supplier_invoice_id AND status IN ('approved','posted') FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('procurement.invoice.post',invoice.branch_id);
    IF p_document_id IS NULL OR EXISTS (
      SELECT 1 FROM inventory.inventory_documents
       WHERE org_id=p_org_id AND supplier_invoice_id=p_supplier_invoice_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier invoice landed-cost document identity already exists';
    END IF;
    PERFORM balance.location_id
      FROM inventory.stock_balances AS balance
      JOIN (
        SELECT DISTINCT receipt.location_id,receipt.product_id,receipt.batch_id
          FROM procurement.supplier_invoice_receipt_allocations AS allocation
          JOIN procurement.supplier_invoice_lines AS supplier_line
            ON supplier_line.org_id=allocation.org_id
           AND supplier_line.id=allocation.supplier_invoice_line_id
          JOIN procurement.goods_receipt_lines AS receipt
            ON receipt.org_id=allocation.org_id
           AND receipt.id=allocation.goods_receipt_line_id
         WHERE supplier_line.org_id=p_org_id
           AND supplier_line.supplier_invoice_id=p_supplier_invoice_id
      ) AS source_target
        ON source_target.location_id=balance.location_id
       AND source_target.product_id=balance.product_id
       AND source_target.batch_id=balance.batch_id
     WHERE balance.org_id=p_org_id
     ORDER BY balance.location_id,balance.product_id,balance.batch_id
     FOR UPDATE OF balance;
    SELECT COALESCE(sum(pg_catalog.abs(erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,line.id))),0)
      INTO document_value FROM procurement.supplier_invoice_lines line
     WHERE line.org_id=p_org_id AND line.supplier_invoice_id=p_supplier_invoice_id
       AND line.inventory_cost_treatment='capitalize';
    IF document_value=0 THEN RETURN NULL; END IF;

    INSERT INTO inventory.inventory_documents(
      org_id,id,branch_id,physical_movement_required,document_type,document_number,
      fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
      total_abs_base_quantity,total_value,supplier_invoice_id,approved_at,approved_by_membership_id
    ) VALUES (
      p_org_id,p_document_id,invoice.branch_id,false,'cost_adjustment',invoice.supplier_invoice_number,
      invoice.fiscal_year,invoice.supplier_invoice_date,'approved','supplier_invoice_landed_cost',
      invoice.currency_code,'moving_weighted_average',0,document_value,p_supplier_invoice_id,
      pg_catalog.transaction_timestamp(),p_actor_id
    );

    FOR source_line IN SELECT * FROM procurement.supplier_invoice_lines
      WHERE org_id=p_org_id AND supplier_invoice_id=p_supplier_invoice_id
        AND inventory_cost_treatment='capitalize' ORDER BY line_number,id
    LOOP
      pool:=erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,source_line.id);
      IF pool=0 THEN CONTINUE; END IF;
      allocated_weight:=0; allocated_value:=0;
      WITH raw_targets AS (
        SELECT receipt.location_id,receipt.product_id,receipt.batch_id,receipt.uom_code,
               allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity AS allocated_quantity
          FROM procurement.supplier_invoice_receipt_allocations allocation
          JOIN procurement.supplier_invoice_lines product_line
            ON product_line.org_id=allocation.org_id AND product_line.id=allocation.supplier_invoice_line_id
          JOIN procurement.goods_receipt_lines receipt
            ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
         WHERE allocation.org_id=p_org_id AND product_line.supplier_invoice_id=p_supplier_invoice_id
           AND (source_line.line_kind='charge' OR product_line.id=source_line.id)
      ), targets AS (
        SELECT location_id,product_id,batch_id,min(uom_code) AS uom_code,sum(allocated_quantity) AS allocated_quantity
          FROM raw_targets GROUP BY location_id,product_id,batch_id
      )
      SELECT count(*),sum(CASE source_line.landed_cost_allocation_method
               WHEN 'value_weighted' THEN balance.inventory_value ELSE balance.on_hand_quantity END)
        INTO target_count,basis_total FROM targets stock_target
        JOIN inventory.stock_balances balance ON balance.org_id=p_org_id
         AND balance.location_id=stock_target.location_id
         AND balance.product_id=stock_target.product_id
         AND balance.batch_id=stock_target.batch_id
       WHERE balance.on_hand_quantity>0;
      IF target_count=0 OR basis_total<=0 OR
         (source_line.landed_cost_allocation_method='direct' AND target_count<>1) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost source has no exact positive reviewed allocation basis';
      END IF;

      target_position:=0;
      FOR target IN
        WITH raw_targets AS (
          SELECT receipt.location_id,receipt.product_id,receipt.batch_id,receipt.uom_code,
                 allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity AS allocated_quantity
            FROM procurement.supplier_invoice_receipt_allocations allocation
            JOIN procurement.supplier_invoice_lines product_line
              ON product_line.org_id=allocation.org_id AND product_line.id=allocation.supplier_invoice_line_id
            JOIN procurement.goods_receipt_lines receipt
              ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
           WHERE allocation.org_id=p_org_id AND product_line.supplier_invoice_id=p_supplier_invoice_id
             AND (source_line.line_kind='charge' OR product_line.id=source_line.id)
        ), targets AS (
          SELECT location_id,product_id,batch_id,min(uom_code) AS uom_code,sum(allocated_quantity) AS allocated_quantity
            FROM raw_targets GROUP BY location_id,product_id,batch_id
        )
        SELECT stock_target.*,balance.on_hand_quantity,balance.inventory_value,balance.average_unit_cost
          FROM targets stock_target JOIN inventory.stock_balances balance ON balance.org_id=p_org_id
           AND balance.location_id=stock_target.location_id
           AND balance.product_id=stock_target.product_id
           AND balance.batch_id=stock_target.batch_id
         WHERE balance.on_hand_quantity>0
         ORDER BY stock_target.location_id,stock_target.product_id,stock_target.batch_id
         FOR UPDATE OF balance
      LOOP
        target_position:=target_position+1;
        basis:=CASE source_line.landed_cost_allocation_method
          WHEN 'value_weighted' THEN target.inventory_value ELSE target.on_hand_quantity END;
        weight:=CASE WHEN source_line.landed_cost_allocation_method='direct' THEN 1
          WHEN target_position<target_count THEN pg_catalog.round(basis/basis_total,12)
          ELSE 1-allocated_weight END;
        line_value:=CASE WHEN target_position<target_count THEN pg_catalog.round(pool*weight,2)
          ELSE pool-allocated_value END;
        line_number:=line_number+1;
        INSERT INTO inventory.inventory_document_lines(
          org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,uom_code,
          entered_quantity,base_quantity,from_location_id,unit_cost,extended_cost,
          cost_allocation_method,cost_allocation_basis_quantity,cost_allocation_basis_value,
          cost_allocation_weight,supplier_invoice_line_id
        ) VALUES (
          p_org_id,pg_catalog.gen_random_uuid(),p_document_id,line_number,'value_adjustment',
          target.product_id,target.batch_id,target.uom_code,0,0,target.location_id,
          target.average_unit_cost,line_value,source_line.landed_cost_allocation_method,
          CASE WHEN source_line.landed_cost_allocation_method='quantity_weighted' THEN target.on_hand_quantity END,
          CASE WHEN source_line.landed_cost_allocation_method='value_weighted' THEN target.inventory_value END,
          weight,source_line.id
        );
        allocated_weight:=allocated_weight+weight; allocated_value:=allocated_value+line_value;
      END LOOP;
      IF allocated_weight<>1 OR allocated_value<>pool THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost allocation residual did not reconcile exactly';
      END IF;
    END LOOP;
    RETURN p_document_id;
END
$function$;

ALTER FUNCTION "erp_trade_commands_v2"."prepare_supplier_invoice_landed_cost_adjustment"(uuid,uuid,uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_trade_commands_v2"."prepare_supplier_invoice_landed_cost_adjustment"(uuid,uuid,uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."resolve_role_account"(organization_id uuid, target_branch_id uuid, role_key varchar, expected_type text, currency char, require_party boolean)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE setting_value text; account_id uuid; account finance.accounts%ROWTYPE;
        setting_count bigint;
BEGIN
    SELECT count(*),min(value_text) INTO setting_count,setting_value FROM core.settings
     WHERE org_id=organization_id AND status='active' AND namespace='finance.account_roles'
       AND key=role_key AND value_type='text' AND core.settings.branch_id=target_branch_id;
    IF setting_count>1 THEN
        RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='active branch finance account-role mapping is ambiguous';
    END IF;
    IF setting_count=0 THEN
        SELECT count(*),min(value_text) INTO setting_count,setting_value FROM core.settings
         WHERE org_id=organization_id AND status='active' AND namespace='finance.account_roles'
           AND key=role_key AND value_type='text' AND core.settings.branch_id IS NULL;
        IF setting_count>1 THEN
            RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='active organization finance account-role mapping is ambiguous';
        END IF;
    END IF;
    IF setting_value IS NULL OR setting_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='active finance account-role UUID setting is missing';
    END IF;
    PERFORM id FROM core.settings
     WHERE org_id=organization_id AND status='active' AND namespace='finance.account_roles'
       AND key=role_key AND value_type='text'
       AND (branch_id=target_branch_id OR (branch_id IS NULL AND setting_count=1))
     ORDER BY branch_id NULLS LAST,id FOR SHARE;
    account_id:=setting_value::uuid;
    SELECT * INTO account FROM finance.accounts
     WHERE org_id=organization_id AND id=account_id FOR SHARE;
    IF account.id IS NULL OR account.status<>'active' OR account.account_type<>expected_type
       OR account.currency_code<>currency OR account.allows_party_posting IS DISTINCT FROM require_party THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='finance account-role target is inactive or incompatible';
    END IF;
    RETURN account_id;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."resolve_role_account"(uuid,uuid,varchar,text,char,boolean) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."resolve_role_account"(uuid,uuid,varchar,text,char,boolean) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_supplier_invoice"(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, request_id uuid, command_request_id uuid, tax_document_id uuid, journal_id uuid, journal_number varchar, event_id uuid, open_item_id uuid, inventory_document_id uuid, inventory_key_hash bytea, inventory_request_hash bytea, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE header procurement.supplier_invoices%ROWTYPE; artifact calculation.artifacts%ROWTYPE; line record;
        claim_id uuid; replay_id uuid; input_doc jsonb; output_doc jsonb; consumed bytea;
        party_id uuid; party_account uuid; party_default_account uuid; posted_time timestamptz:=pg_catalog.transaction_timestamp();
        line_no integer:=2; component_amount numeric(20,2); consumed_variance numeric(20,2); role_account uuid; role_key varchar;
        total_debit numeric(20,2); total_credit numeric(20,2); tax_effective date; source_hash bytea; noncreditable_tax numeric(20,2);
        eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0; eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0;
        inventory_value numeric(20,2):=0; inventory_entries bigint:=0; product_lines boolean:=false; allocated_lines boolean:=false;
        line_snapshot jsonb; registration_scope_count bigint;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT header FROM procurement.supplier_invoices WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('procurement.invoice.post',header.branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,actor_id,'procurement.supplier_invoice.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='commercial replay mismatch'; END IF; RETURN replay_id; END IF;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb;
    output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.supplier_invoice_id IS DISTINCT FROM resource_id OR artifact.engine_version IS DISTINCT FROM output_doc->>'engine_version'
       OR artifact.ruleset_version IS DISTINCT FROM output_doc->>'ruleset_version' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation artifact metadata mismatch'; END IF;
    PERFORM "erp_commercial_commands".assert_supplier_invoice_artifact(organization_id,resource_id,input_doc,output_doc);

    SELECT account.party_id,account.default_payable_account_id INTO party_id,party_default_account
      FROM parties.supplier_accounts account WHERE account.org_id=organization_id AND account.id=header.supplier_account_id AND account.status='active' FOR SHARE;
    IF party_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial party account is inactive'; END IF;
    party_account:="erp_commercial_commands".resolve_role_account(organization_id,header.branch_id,'accounts_payable','liability',header.currency_code,true);
    IF party_default_account IS DISTINCT FROM party_account THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='party default ledger differs from active branch account-role mapping'; END IF;
    PERFORM 1 FROM tax.registrations registration WHERE registration.org_id=organization_id AND registration.id=header.buyer_tax_registration_id
      AND registration.status='active' AND registration.effective_from<=header.supplier_invoice_date
      AND (registration.effective_to IS NULL OR registration.effective_to>=header.supplier_invoice_date) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document tax registration is not active on document date'; END IF;
    SELECT count(*) INTO registration_scope_count FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=header.buyer_tax_registration_id
       AND association.branch_id=header.branch_id AND association.status='active'
       AND association.effective_from<=header.supplier_invoice_date
       AND (association.effective_to IS NULL OR association.effective_to>=header.supplier_invoice_date);
    IF registration_scope_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document requires exactly one effective branch registration association'; END IF;
    PERFORM 1 FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=header.buyer_tax_registration_id
       AND association.branch_id=header.branch_id AND association.status='active'
       AND association.effective_from<=header.supplier_invoice_date
       AND (association.effective_to IS NULL OR association.effective_to>=header.supplier_invoice_date) FOR SHARE;
    SELECT min(version.effective_from) INTO tax_effective FROM procurement.supplier_invoice_lines tax_line JOIN tax.tax_code_versions version ON version.id=tax_line.tax_code_version_id
      WHERE tax_line.org_id=organization_id AND tax_line.supplier_invoice_id=resource_id AND version.status='active'
        AND version.effective_from<=header.supplier_invoice_date AND (version.effective_to IS NULL OR version.effective_to>=header.supplier_invoice_date)
      HAVING count(DISTINCT version.ruleset_version)=1 AND min(version.ruleset_version)=header.calculation_ruleset_version
        AND count(*)=(SELECT count(*) FROM procurement.supplier_invoice_lines expected WHERE expected.org_id=organization_id AND expected.supplier_invoice_id=resource_id);
    IF tax_effective IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice tax ruleset is not uniform'; END IF;

    IF inventory_document_id IS NOT NULL THEN
          inventory_document_id:=erp_trade_commands_v2.prepare_supplier_invoice_landed_cost_adjustment(
            organization_id,resource_id,inventory_document_id,actor_id);
        END IF;
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'procurement.supplier_invoice.post','supplier_invoice',resource_id,
      header.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed calculation changed'; END IF;

    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
      transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,header.supplier_invoice_date,'supplier_invoice',header.currency_code,'INR',1,
      header.grand_total,header.grand_total,header.grand_total,header.grand_total,'draft',actor_id,actor_id);
    PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,1,party_account,header.branch_id,party_id,
      'Supplier payable',0,header.grand_total,actor_id);
    FOR line IN SELECT * FROM procurement.supplier_invoice_lines WHERE org_id=organization_id AND supplier_invoice_id=resource_id ORDER BY line_number,id LOOP
        PERFORM "erp_commercial_commands".assert_line_account(organization_id,line.net_value_account_id,CASE WHEN line.inventory_cost_treatment='capitalize' THEN 'asset' ELSE 'expense' END,header.currency_code);
        noncreditable_tax:=CASE WHEN line.itc_eligibility='eligible' THEN 0 ELSE line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount END;
        IF line.itc_eligibility='eligible' THEN
          eligible_cgst:=eligible_cgst+line.cgst_amount; eligible_sgst:=eligible_sgst+line.sgst_amount;
          eligible_igst:=eligible_igst+line.igst_amount; eligible_cess:=eligible_cess+line.cess_amount;
        END IF;
        PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,line_no,line.net_value_account_id,header.branch_id,NULL,
          'Supplier invoice net value and noncreditable tax',line.net_value_amount+noncreditable_tax,0,actor_id); line_no:=line_no+1;
        IF line.inventory_cost_treatment='capitalize' THEN
          consumed_variance:=erp_trade_commands_v2.consumed_landed_cost_pool(organization_id,line.id);
          IF consumed_variance<>0 THEN
            role_account:=erp_commercial_commands.resolve_role_account(
              organization_id,header.branch_id,'purchase_price_variance','expense',header.currency_code,false);
            PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,
              'Consumed supplier price or landed-cost variance',
              CASE WHEN consumed_variance>0 THEN consumed_variance ELSE 0 END,
              CASE WHEN consumed_variance<0 THEN -consumed_variance ELSE 0 END,actor_id); line_no:=line_no+1;
            PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,line_no,line.net_value_account_id,header.branch_id,NULL,
              'Reclassify consumed variance out of inventory',
              CASE WHEN consumed_variance<0 THEN -consumed_variance ELSE 0 END,
              CASE WHEN consumed_variance>0 THEN consumed_variance ELSE 0 END,actor_id); line_no:=line_no+1;
          END IF;
        END IF;
    END LOOP;
    NULL;
    FOR role_key,component_amount IN SELECT * FROM (VALUES
      ('input_cgst'::varchar,eligible_cgst),
      ('input_sgst'::varchar,eligible_sgst),
      ('input_igst'::varchar,eligible_igst),
      ('input_cess'::varchar,eligible_cess)) AS component(role_key,amount)
    LOOP
      IF component_amount>0 AND component_amount>0 THEN
        role_account:="erp_commercial_commands".resolve_role_account(organization_id,header.branch_id,role_key,'asset',header.currency_code,false);
        PERFORM "erp_commercial_commands".add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Eligible input tax',component_amount,0,actor_id); line_no:=line_no+1;
      END IF;
    END LOOP;

    IF header.tax_charge_mechanism='reverse_charge' THEN
      FOR role_key,component_amount IN SELECT * FROM (VALUES
        ('rcm_cgst_payable'::varchar,header.cgst_total),('rcm_sgst_payable'::varchar,header.sgst_total),
        ('rcm_igst_payable'::varchar,header.igst_total),('rcm_cess_payable'::varchar,header.cess_total)) AS component(role_key,amount)
      LOOP
        IF component_amount>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'liability',header.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Self-assessed reverse-charge liability',0,component_amount,actor_id); line_no:=line_no+1;
        END IF;
      END LOOP;
    END IF;

    IF header.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN header.rounding_adjustment>0 THEN 'rounding_loss' ELSE 'rounding_gain' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,header.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Signed rounding adjustment',
        CASE WHEN header.rounding_adjustment>0 THEN abs(header.rounding_adjustment) ELSE 0 END,
        CASE WHEN header.rounding_adjustment<0 THEN abs(header.rounding_adjustment) ELSE 0 END,actor_id); line_no:=line_no+1;
    END IF;
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO total_debit,total_credit
      FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF total_debit<>total_credit OR total_debit=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial journal does not exactly balance'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=total_debit,transaction_credit_total=total_credit,
      functional_debit_total=total_debit,functional_credit_total=total_credit,status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,
      updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE procurement.supplier_invoices SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,
      updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=resource_id AND status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='invoice posting state changed'; END IF;
    IF inventory_document_id IS NOT NULL THEN
          PERFORM erp_trade_commands_v2.post_landed_cost_adjustment(
            organization_id,inventory_document_id,actor_id,inventory_key_hash,inventory_request_hash,expires_at);
        END IF;
    SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(source_line) ORDER BY source_line.line_number,source_line.id) INTO line_snapshot
      FROM procurement.supplier_invoice_lines source_line WHERE source_line.org_id=organization_id AND source_line.supplier_invoice_id=resource_id;
    source_hash:=extensions.digest(pg_catalog.convert_to((pg_catalog.to_jsonb(header)||pg_catalog.jsonb_build_object('lines',line_snapshot,'artifact',pg_catalog.encode(artifact.output_sha256,'hex')))::text,'UTF8'),'sha256');
    INSERT INTO tax.documents(org_id,id,registration_id,supplier_invoice_id,document_class,document_number,document_date,direction,
      counterparty_party_id,counterparty_gstin,place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
      tax_liability_party,document_effect,currency_code,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,
      self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,tax_ruleset_version,tax_ruleset_effective_date,source_hash,posted_at,created_by_membership_id)
    VALUES(organization_id,tax_document_id,header.buyer_tax_registration_id,resource_id,'supplier_invoice',header.supplier_invoice_number,header.supplier_invoice_date,'inward',
      party_id,header.supplier_gstin_snapshot,header.place_of_supply_state_code,header.supply_type,header.zero_rated_payment_mode,header.tax_charge_mechanism,
      CASE WHEN header.tax_charge_mechanism='normal' THEN 'supplier' ELSE 'recipient' END,'original',header.currency_code,
      header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,
      CASE WHEN 'inward'='inward' AND header.tax_charge_mechanism='reverse_charge' THEN header.recipient_assessed_tax_total ELSE 0 END,
      header.rounding_adjustment,header.grand_total,header.calculation_ruleset_version,tax_effective,source_hash,posted_time,actor_id);
    INSERT INTO finance.accounting_events(org_id,id,event_type,supplier_invoice_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'supplier_invoice',resource_id,journal_id,posted_time,posted_time,actor_id);
    INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,
      principal_amount,functional_principal_amount,status,created_by_membership_id)
    VALUES(organization_id,open_item_id,event_id,party_id,'payable',header.supplier_invoice_number,header.supplier_invoice_date,
      header.due_date,header.currency_code,header.grand_total,header.grand_total,'open',actor_id);
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'procurement.supplier_invoices',resource_id);
    RETURN resource_id;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_supplier_invoice"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_supplier_invoice"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_commercial_commands"."post_supplier_invoice"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) TO "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE requested_branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        requested_supplier_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        requested_registration_id uuid:=NULLIF(request_document->>'supplier_tax_registration_id','')::uuid;
        requested_portal_line_id uuid:=NULLIF(request_document->>'portal_document_line_id','')::uuid;
        invoice_date date:=NULLIF(request_document->>'invoice_date','')::date;
        received_date date:=NULLIF(request_document->>'received_date','')::date;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        buyer_registration tax.registrations%ROWTYPE; buyer_scope tax.registration_branches%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE; supplier_party parties.parties%ROWTYPE;
        supplier_registration parties.tax_registrations%ROWTYPE; supplier_address parties.addresses%ROWTYPE;
        portal_line tax.portal_document_lines%ROWTYPE; portal_document tax.portal_documents%ROWTYPE;
        portal_period tax.return_periods%ROWTYPE; inventory_account finance.accounts%ROWTYPE;
        payable_account finance.accounts%ROWTYPE; input_cgst_account finance.accounts%ROWTYPE;
        input_sgst_account finance.accounts%ROWTYPE; input_igst_account finance.accounts%ROWTYPE;
        input_cess_account finance.accounts%ROWTYPE; rounding_gain_account finance.accounts%ROWTYPE;
        rounding_loss_account finance.accounts%ROWTYPE; variance_account finance.accounts%ROWTYPE;
        receipt_line procurement.goods_receipt_lines%ROWTYPE; receipt procurement.goods_receipts%ROWTYPE;
        balance inventory.stock_balances%ROWTYPE;
        order_line procurement.purchase_order_lines%ROWTYPE; purchase_order procurement.purchase_orders%ROWTYPE;
        product catalog.products%ROWTYPE;
        tax_version tax.tax_code_versions%ROWTYPE; tax_release core.reference_data_releases%ROWTYPE;
        profile catalog.commercial_charge_tax_profiles%ROWTYPE; expense_account finance.accounts%ROWTYPE;
        requested_line jsonb; requested_allocation jsonb; resolved_allocations jsonb;
        resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        resolved_receipt_ids jsonb:='[]'::jsonb; source_purchase_order_id uuid;
        base_billed numeric(20,6); base_free numeric(20,6); prior_billed numeric(20,6); prior_free numeric(20,6);
        receipt_cost numeric(20,2); line_product_id uuid; line_purchase_order_line_id uuid;
        line_uom text; line_factor numeric(20,6);
        ruleset_version text; supply_type text; candidate_count integer; address_count integer;
        allocation_count integer; distinct_allocation_count integer; foreign_positive_count integer;
        exact_receipt_source_provenance boolean;
BEGIN
    IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
       OR grant_id IS NULL OR supplier_invoice_id IS NULL OR requested_branch_id IS NULL
       OR requested_supplier_id IS NULL OR requested_registration_id IS NULL OR requested_portal_line_id IS NULL
       OR invoice_date IS NULL OR received_date<invoice_date OR pg_catalog.btrim(COALESCE(request_document->>'supplier_invoice_number',''))=''
       OR request_document->>'tax_charge_mechanism'<>'normal'
       OR request_document->>'zero_rated_payment_mode'<>'not_applicable'
       OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
       OR pg_catalog.jsonb_typeof(request_document->'goods_receipt_ids')<>'array'
       OR pg_catalog.jsonb_array_length(request_document->'goods_receipt_ids')<1
       OR pg_catalog.jsonb_typeof(COALESCE(request_document->'expense_charge_lines','[]'::jsonb))<>'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-invoice input is incomplete or outside the domestic normal-charge pilot'; END IF;
    SELECT count(*),count(DISTINCT line.value->>'goods_receipt_line_id')
      INTO allocation_count,distinct_allocation_count
      FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value);
    IF allocation_count<>distinct_allocation_count OR allocation_count=0
       OR (SELECT count(*) FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids'))
          <>(SELECT count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids')) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice requires unique receipt lines and a unique exact GRN set'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
      WHERE line.value->>'product_inventory_cost_treatment'<>'capitalize'
         OR line.value->>'landed_cost_allocation_method' NOT IN ('direct','quantity_weighted','value_weighted')
         OR line.value->>'itc_eligibility'<>'eligible'
         OR line.value->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17')
       OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(request_document->'expense_charge_lines','[]'::jsonb)) line(value)
      WHERE line.value->>'charge_inventory_cost_treatment' NOT IN ('expense','capitalize')
         OR (line.value->>'charge_inventory_cost_treatment'='capitalize'
             AND line.value->>'landed_cost_allocation_method' NOT IN ('direct','quantity_weighted','value_weighted'))
         OR (line.value->>'charge_inventory_cost_treatment'='expense'
             AND line.value ? 'landed_cost_allocation_method')
         OR line.value->>'itc_eligibility'<>'eligible'
         OR line.value->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17'
         OR line.value->>'expense_charge_code' NOT IN ('freight','packing','insurance','handling')) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier-invoice requires reviewed ITC and explicit product or charge landed-cost treatment'; END IF;
    PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
      JOIN core.organizations organization_row ON organization_row.id=membership.org_id
      JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
      JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
     WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
       AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
       AND organization_row.status='active' AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id
       AND grant_row.status='active' AND grant_row.expires_at>pg_catalog.transaction_timestamp()
       AND (grant_row.branch_id IS NULL OR grant_row.branch_id=requested_branch_id)
       AND capability.capability_code='procurement.supplier_invoice.prepare'
       AND capability.operation_mode='write' AND capability.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice delegated authority is inactive'; END IF;
    PERFORM erp_security.activate_context(auth_user_id,organization_id);
    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('procurement.supplier_invoice.create',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('procurement.invoice.post',requested_branch_id) IS DISTINCT FROM true
       OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
       OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice cross-domain permission is inactive'; END IF;
    SELECT * INTO STRICT organization FROM core.organizations WHERE id=organization_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=requested_branch_id AND status='active' FOR SHARE;
    IF organization.country_code<>'IN' OR organization.base_currency<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier-invoice pilot supports only Indian INR organizations'; END IF;
    SELECT count(*) INTO candidate_count FROM tax.registration_branches association JOIN tax.registrations registration
      ON registration.org_id=association.org_id AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date AND (association.effective_to IS NULL OR association.effective_to>=invoice_date)
       AND registration.state_code=branch.state_code AND registration.registration_type='regular' AND registration.status='active'
       AND registration.effective_from<=invoice_date AND (registration.effective_to IS NULL OR registration.effective_to>=invoice_date);
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='buyer requires one exact effective regular branch GST registration'; END IF;
    SELECT registration.* INTO STRICT buyer_registration FROM tax.registration_branches association JOIN tax.registrations registration
      ON registration.org_id=association.org_id AND registration.id=association.registration_id
     WHERE association.org_id=organization_id AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date AND (association.effective_to IS NULL OR association.effective_to>=invoice_date)
       AND registration.state_code=branch.state_code AND registration.registration_type='regular' AND registration.status='active'
       AND registration.effective_from<=invoice_date AND (registration.effective_to IS NULL OR registration.effective_to>=invoice_date)
     FOR SHARE OF association,registration;
    SELECT * INTO STRICT buyer_scope FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=buyer_registration.id
       AND association.branch_id=branch.id AND association.status='active'
       AND association.effective_from<=invoice_date AND (association.effective_to IS NULL OR association.effective_to>=invoice_date) FOR SHARE;
    SELECT * INTO STRICT supplier FROM parties.supplier_accounts
     WHERE org_id=organization_id AND id=requested_supplier_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT supplier_party FROM parties.parties
     WHERE org_id=organization_id AND id=supplier.party_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT supplier_registration FROM parties.tax_registrations
     WHERE org_id=organization_id AND id=requested_registration_id AND party_id=supplier.party_id
       AND registration_type='GSTIN' AND status='active' AND verified_at IS NOT NULL
       AND taxpayer_type IN ('regular','casual') AND (valid_from IS NULL OR valid_from<=invoice_date)
       AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    SELECT count(*) INTO address_count FROM parties.addresses WHERE org_id=organization_id AND party_id=supplier.party_id
       AND address_kind='registered' AND is_primary AND status='active' AND state_code=supplier_registration.state_code
       AND valid_from<=invoice_date AND (valid_until IS NULL OR valid_until>=invoice_date);
    IF address_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier GSTIN requires one exact effective registered address'; END IF;
    SELECT * INTO STRICT supplier_address FROM parties.addresses WHERE org_id=organization_id AND party_id=supplier.party_id
       AND address_kind='registered' AND is_primary AND status='active' AND state_code=supplier_registration.state_code
       AND valid_from<=invoice_date AND (valid_until IS NULL OR valid_until>=invoice_date) FOR SHARE;
    IF supplier_address.country_code<>'IN' THEN RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='import supplier invoices remain fail-closed'; END IF;
    supply_type:=CASE WHEN buyer_registration.state_code=supplier_registration.state_code THEN 'intra_state' ELSE 'inter_state' END;
    SELECT * INTO STRICT portal_line FROM tax.portal_document_lines
     WHERE org_id=organization_id AND id=requested_portal_line_id AND document_type='invoice'
       AND supplier_gstin=supplier_registration.registration_number
       AND invoice_number=request_document->>'supplier_invoice_number' AND invoice_date=invoice_date
       AND place_of_supply_state_code=buyer_registration.state_code FOR SHARE;
    SELECT * INTO STRICT portal_document FROM tax.portal_documents
     WHERE org_id=organization_id AND id=portal_line.portal_document_id AND registration_id=buyer_registration.id
       AND portal_document_type='gstr2b' AND status='parsed' AND parsed_at IS NOT NULL FOR SHARE;
    SELECT * INTO STRICT portal_period FROM tax.return_periods
     WHERE org_id=organization_id AND id=portal_document.return_period_id AND registration_id=buyer_registration.id
       AND period_start<=invoice_date AND period_end>=invoice_date FOR SHARE;
    SELECT count(*) INTO candidate_count FROM tax.portal_document_lines line JOIN tax.portal_documents document
      ON document.org_id=line.org_id AND document.id=line.portal_document_id
     WHERE line.org_id=organization_id AND line.supplier_gstin=supplier_registration.registration_number
       AND line.invoice_number=request_document->>'supplier_invoice_number' AND line.invoice_date=invoice_date
       AND line.document_type='invoice' AND document.registration_id=buyer_registration.id
       AND document.portal_document_type='gstr2b' AND document.status='parsed';
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier invoice requires one unique parsed GSTR-2B row'; END IF;
    SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'inventory_asset','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT payable_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'accounts_payable','liability','INR',true) FOR SHARE;
    IF supplier.default_payable_account_id IS DISTINCT FROM payable_account.id THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier default payable account differs from the reviewed branch account role'; END IF;
    SELECT * INTO STRICT input_cgst_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_cgst','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT input_sgst_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_sgst','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT input_igst_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_igst','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT input_cess_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'input_cess','asset','INR',false) FOR SHARE;
    SELECT * INTO STRICT rounding_gain_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'rounding_gain','income','INR',false) FOR SHARE;
    SELECT * INTO STRICT rounding_loss_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'rounding_loss','expense','INR',false) FOR SHARE;
    SELECT * INTO STRICT variance_account FROM finance.accounts WHERE org_id=organization_id
       AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'purchase_price_variance','expense','INR',false) FOR SHARE;
    source_versions:=pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
      pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
      pg_catalog.jsonb_build_object('resource_type','buyer_tax_registration','id',buyer_registration.id,'row_version',buyer_registration.row_version),
      pg_catalog.jsonb_build_object('resource_type','buyer_registration_branch','registration_id',buyer_scope.registration_id,'branch_id',buyer_scope.branch_id,'effective_from',buyer_scope.effective_from,'effective_to',buyer_scope.effective_to),
      pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version,'payment_days',supplier.payment_days),
      pg_catalog.jsonb_build_object('resource_type','supplier_party','id',supplier_party.id,'row_version',supplier_party.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_tax_registration','id',supplier_registration.id,'row_version',supplier_registration.row_version,'registration_number',supplier_registration.registration_number,'taxpayer_type',supplier_registration.taxpayer_type,'verified_at',supplier_registration.verified_at),
      pg_catalog.jsonb_build_object('resource_type','supplier_registered_address','id',supplier_address.id,'row_version',supplier_address.row_version),
      pg_catalog.jsonb_build_object('resource_type','gstr2b_portal_document','id',portal_document.id,'status',portal_document.status,'parsed_at',portal_document.parsed_at,'source_sha256',pg_catalog.encode(portal_document.source_sha256,'hex')),
      pg_catalog.jsonb_build_object('resource_type','gstr2b_portal_line','id',portal_line.id,'source_row_hash',pg_catalog.encode(portal_line.source_row_hash,'hex')),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','accounts_payable','id',payable_account.id,'row_version',payable_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_cgst','id',input_cgst_account.id,'row_version',input_cgst_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_sgst','id',input_sgst_account.id,'row_version',input_sgst_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_igst','id',input_igst_account.id,'row_version',input_igst_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','input_cess','id',input_cess_account.id,'row_version',input_cess_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','rounding_gain','id',rounding_gain_account.id,'row_version',rounding_gain_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','rounding_loss','id',rounding_loss_account.id,'row_version',rounding_loss_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','purchase_price_variance','id',variance_account.id,'row_version',variance_account.row_version));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        organization_id::text||':supplier-receipt:'||locked.goods_receipt_line_id,630195401))
      FROM (
        SELECT DISTINCT line.value->>'goods_receipt_line_id' AS goods_receipt_line_id
          FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
         ORDER BY goods_receipt_line_id
      ) locked;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
      IF NULLIF(requested_line->>'line_id','')::uuid IS NULL OR NULLIF(requested_line->>'allocation_id','')::uuid IS NULL
         OR NULLIF(requested_line->>'goods_receipt_line_id','')::uuid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier product line requires identity and one explicit receipt line'; END IF;
      base_billed:=0; base_free:=0; receipt_cost:=0; line_product_id:=NULL; line_purchase_order_line_id:=NULL;
      line_uom:=NULL; line_factor:=NULL; resolved_allocations:='[]'::jsonb;
      FOR requested_allocation IN SELECT pg_catalog.jsonb_build_object(
        'allocation_id',requested_line->>'allocation_id',
        'goods_receipt_line_id',requested_line->>'goods_receipt_line_id',
        'allocated_base_billed_quantity',requested_line->>'allocated_base_billed_quantity',
        'allocated_base_free_quantity',requested_line->>'allocated_base_free_quantity') LOOP
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||':supplier-receipt:'||(requested_allocation->>'goods_receipt_line_id'),630195401));
        SELECT line.* INTO STRICT receipt_line FROM procurement.goods_receipt_lines line JOIN procurement.goods_receipts header
          ON header.org_id=line.org_id AND header.id=line.goods_receipt_id
         WHERE line.org_id=organization_id AND line.id=NULLIF(requested_allocation->>'goods_receipt_line_id','')::uuid
           AND header.status='posted' AND header.branch_id=branch.id AND header.supplier_account_id=supplier.id
           AND line.purchase_order_line_id IS NOT NULL FOR SHARE OF line,header;
        SELECT * INTO STRICT receipt FROM procurement.goods_receipts
         WHERE org_id=organization_id AND id=receipt_line.goods_receipt_id AND status='posted' FOR SHARE;
        SELECT * INTO STRICT balance FROM inventory.stock_balances
         WHERE org_id=organization_id AND location_id=receipt_line.location_id
           AND product_id=receipt_line.product_id AND batch_id=receipt_line.batch_id FOR SHARE;
        SELECT * INTO STRICT order_line FROM procurement.purchase_order_lines
         WHERE org_id=organization_id AND id=receipt_line.purchase_order_line_id AND line_kind='product' FOR SHARE;
        SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders
         WHERE org_id=organization_id AND id=order_line.purchase_order_id
           AND branch_id=branch.id AND supplier_account_id=supplier.id
           AND status IN ('partially_received','received') FOR SHARE;
        IF source_purchase_order_id IS NULL THEN source_purchase_order_id:=purchase_order.id;
        ELSIF source_purchase_order_id IS DISTINCT FROM purchase_order.id THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice receipt allocations must belong to one purchase order'; END IF;
        IF receipt_line.uom_code IS DISTINCT FROM order_line.uom_code THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted receipt UOM differs from its locked purchase-order line'; END IF;
        SELECT * INTO STRICT product FROM catalog.products
         WHERE org_id=organization_id AND id=receipt_line.product_id AND id=order_line.product_id
           AND product_kind IN ('medicine','medical_device','consumable') AND status='active' FOR SHARE;
        IF line_product_id IS NULL THEN line_product_id:=product.id; line_purchase_order_line_id:=order_line.id;
          line_uom:=receipt_line.uom_code; line_factor:=order_line.uom_conversion_factor;
        ELSIF ROW(line_product_id,line_purchase_order_line_id,line_uom,line_factor)
          IS DISTINCT FROM ROW(product.id,order_line.id,receipt_line.uom_code,order_line.uom_conversion_factor) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='one supplier invoice line cannot mix PO line, product, or UOM receipt facts'; END IF;
        PERFORM allocation.id
          FROM procurement.supplier_invoice_receipt_allocations allocation
          JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id
         WHERE allocation.org_id=organization_id AND allocation.goods_receipt_line_id=receipt_line.id
           AND invoice_line.supplier_invoice_id<>supplier_invoice_id
         ORDER BY allocation.id FOR SHARE OF allocation,invoice_line;
        prior_billed:=COALESCE((SELECT sum(allocation.allocated_base_billed_quantity)
          FROM procurement.supplier_invoice_receipt_allocations allocation JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id
         WHERE allocation.org_id=organization_id AND allocation.goods_receipt_line_id=receipt_line.id
           AND invoice_line.supplier_invoice_id<>supplier_invoice_id),0);
        prior_free:=COALESCE((SELECT sum(allocation.allocated_base_free_quantity)
          FROM procurement.supplier_invoice_receipt_allocations allocation JOIN procurement.supplier_invoice_lines invoice_line
            ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id
         WHERE allocation.org_id=organization_id AND allocation.goods_receipt_line_id=receipt_line.id
           AND invoice_line.supplier_invoice_id<>supplier_invoice_id),0);
        IF (requested_allocation->>'allocated_base_billed_quantity')::numeric<0
           OR (requested_allocation->>'allocated_base_free_quantity')::numeric<0
           OR (requested_allocation->>'allocated_base_billed_quantity')::numeric+(requested_allocation->>'allocated_base_free_quantity')::numeric<=0
           OR prior_billed+(requested_allocation->>'allocated_base_billed_quantity')::numeric>receipt_line.base_accepted_quantity
           OR prior_free+(requested_allocation->>'allocated_base_free_quantity')::numeric>receipt_line.base_free_quantity THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice exceeds separate posted receipt billed or free ceiling'; END IF;
        SELECT count(*) INTO foreign_positive_count
          FROM inventory.stock_ledger_entries AS entry
          JOIN inventory.inventory_document_lines AS document_line
            ON document_line.org_id=entry.org_id
           AND document_line.id=entry.inventory_document_line_id
         WHERE entry.org_id=organization_id
           AND entry.location_id=receipt_line.location_id
           AND entry.product_id=receipt_line.product_id
           AND entry.batch_id=receipt_line.batch_id
           AND entry.quantity_delta>0
           AND document_line.goods_receipt_line_id IS DISTINCT FROM receipt_line.id;
        exact_receipt_source_provenance:=
          (requested_allocation->>'allocated_base_billed_quantity')::numeric
            IS NOT DISTINCT FROM receipt_line.base_accepted_quantity
          AND (requested_allocation->>'allocated_base_free_quantity')::numeric
            IS NOT DISTINCT FROM receipt_line.base_free_quantity
          AND foreign_positive_count=0;
        base_billed:=base_billed+(requested_allocation->>'allocated_base_billed_quantity')::numeric;
        base_free:=base_free+(requested_allocation->>'allocated_base_free_quantity')::numeric;
        receipt_cost:=receipt_cost+pg_catalog.round(((requested_allocation->>'allocated_base_billed_quantity')::numeric+
          (requested_allocation->>'allocated_base_free_quantity')::numeric)*receipt_line.unit_cost,2);
        resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(requested_allocation||pg_catalog.jsonb_build_object(
          'goods_receipt_id',receipt.id,'goods_receipt_row_version',receipt.row_version,'goods_receipt_line_row_id',receipt_line.id,
          'product_id',product.id,'receipt_unit_cost',receipt_line.unit_cost::text,'receipt_base_accepted_quantity',receipt_line.base_accepted_quantity::text,
          'receipt_base_free_quantity',receipt_line.base_free_quantity::text,'prior_allocated_base_billed_quantity',prior_billed::text,
          'prior_allocated_base_free_quantity',prior_free::text,'location_id',receipt_line.location_id,'batch_id',receipt_line.batch_id,
          'stock_on_hand_quantity',balance.on_hand_quantity::text,'stock_inventory_value',balance.inventory_value::text,
          'stock_average_unit_cost',balance.average_unit_cost::text,'stock_row_version',balance.row_version,
          'exact_receipt_source_provenance',exact_receipt_source_provenance));
        resolved_receipt_ids:=resolved_receipt_ids||pg_catalog.jsonb_build_array(receipt.id::text);
        source_versions:=source_versions||pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('resource_type','purchase_order','id',purchase_order.id,'row_version',purchase_order.row_version,'status',purchase_order.status),
          pg_catalog.jsonb_build_object('resource_type','purchase_order_line','id',order_line.id,'purchase_order_id',purchase_order.id),
          pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version,'status',receipt.status),
          pg_catalog.jsonb_build_object('resource_type','goods_receipt_line','id',receipt_line.id,'goods_receipt_line_id',receipt_line.id,'base_accepted_quantity',receipt_line.base_accepted_quantity::text,'base_free_quantity',receipt_line.base_free_quantity::text,'unit_cost',receipt_line.unit_cost::text),
          pg_catalog.jsonb_build_object('resource_type','stock_balance','location_id',receipt_line.location_id,'product_id',receipt_line.product_id,
            'batch_id',receipt_line.batch_id,'row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity::text,
            'inventory_value',balance.inventory_value::text,'average_unit_cost',balance.average_unit_cost::text),
          pg_catalog.jsonb_build_object('resource_type','receipt_invoice_ceiling','goods_receipt_line_id',receipt_line.id,'allocated_base_billed_quantity',prior_billed::text,'allocated_base_free_quantity',prior_free::text));
      END LOOP;
      IF base_billed IS DISTINCT FROM pg_catalog.round((requested_line->>'billed_quantity')::numeric*line_factor,6)
         OR base_free IS DISTINCT FROM pg_catalog.round((requested_line->>'free_quantity')::numeric*line_factor,6) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice billed and free quantities do not reconcile exact receipt base allocations'; END IF;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE code=product.hsn_code AND code_kind='hsn'
       AND status='active' AND taxability='taxable' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice tax rulesets differ'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','product','line_id',requested_line->>'line_id',
        'purchase_order_line_id',line_purchase_order_line_id,'product_id',product.id,'hsn_code',product.hsn_code,'uom_code',line_uom,'multiplier',line_factor::text,
        'tax_code_version_id',tax_version.id,'taxability','taxable','gst_rate',tax_version.igst_rate::text,'cess_rate',tax_version.cess_rate::text,
        'ruleset_version',tax_version.ruleset_version,'net_value_account_id',inventory_account.id,'inventory_cost_treatment','capitalize',
        'landed_cost_allocation_method',requested_line->>'landed_cost_allocation_method',
        'itc_eligibility','eligible','receipt_cost',receipt_cost::text,'receipt_allocations',resolved_allocations,'input',requested_line));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'resource_type','supplier_invoice_product_tax','product_id',product.id,'product_row_version',product.row_version,
        'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,'tax_release_id',tax_release.id,
        'tax_release_ruleset_version',tax_release.ruleset_version));
    END LOOP;
    FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(request_document->'expense_charge_lines','[]'::jsonb)) LOOP
      SELECT * INTO STRICT profile FROM catalog.commercial_charge_tax_profiles WHERE org_id=organization_id
       AND direction='procurement' AND charge_code=requested_line->>'expense_charge_code' AND status='active'
       AND effective_from<=invoice_date AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_version FROM tax.tax_code_versions WHERE id=profile.tax_code_version_id AND code_kind='sac'
       AND status='active' AND taxability='taxable' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      SELECT * INTO STRICT tax_release FROM core.reference_data_releases WHERE id=tax_version.release_id
       AND dataset_kind='hsn_sac_tax' AND status='active' AND effective_from<=invoice_date
       AND (effective_to IS NULL OR effective_to>=invoice_date) FOR SHARE;
      IF requested_line->>'charge_inventory_cost_treatment'='capitalize' THEN
        IF NULLIF(requested_line->>'net_value_account_id','')::uuid IS DISTINCT FROM inventory_account.id THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized supplier charge account differs from the canonical inventory role'; END IF;
        expense_account:=inventory_account;
      ELSE
        SELECT * INTO STRICT expense_account FROM finance.accounts WHERE org_id=organization_id
         AND id=NULLIF(requested_line->>'net_value_account_id','')::uuid AND account_type='expense'
         AND currency_code='INR' AND status='active' AND NOT allows_party_posting FOR SHARE;
      END IF;
      IF ruleset_version IS NULL THEN ruleset_version:=tax_version.ruleset_version;
      ELSIF ruleset_version<>tax_version.ruleset_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice tax rulesets differ'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',pg_catalog.jsonb_array_length(resolved_lines)+1,'line_kind','charge','line_id',requested_line->>'line_id',
        'charge_code',profile.charge_code,'sac_code',tax_version.code,'tax_code_version_id',tax_version.id,
        'taxability','taxable','gst_rate',tax_version.igst_rate::text,'cess_rate',tax_version.cess_rate::text,
        'ruleset_version',tax_version.ruleset_version,'net_value_account_id',expense_account.id,
        'inventory_cost_treatment',requested_line->>'charge_inventory_cost_treatment',
        'landed_cost_allocation_method',requested_line->>'landed_cost_allocation_method',
        'itc_eligibility','eligible','input',requested_line||pg_catalog.jsonb_build_object(
          'charge_code',profile.charge_code,'price_basis',requested_line->>'expense_price_basis',
          'document_discount_eligible',requested_line->'expense_document_discount_eligible')));
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','commercial_charge_tax_profile','id',profile.id,'row_version',profile.row_version,'charge_code',profile.charge_code),
        pg_catalog.jsonb_build_object('resource_type','supplier_invoice_charge_tax','charge_code',profile.charge_code,
          'tax_code_version_id',tax_version.id,'tax_version_number',tax_version.version_number,
          'tax_release_id',tax_release.id,'tax_release_ruleset_version',tax_release.ruleset_version),
        pg_catalog.jsonb_build_object('resource_type','finance_account','id',expense_account.id,'row_version',expense_account.row_version,'account_type',expense_account.account_type));
    END LOOP;
    IF EXISTS (
      (SELECT value FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids') requested(value)
       EXCEPT SELECT value FROM pg_catalog.jsonb_array_elements_text(resolved_receipt_ids) resolved(value))
      UNION ALL
      (SELECT value FROM pg_catalog.jsonb_array_elements_text(resolved_receipt_ids) resolved(value)
       EXCEPT SELECT value FROM pg_catalog.jsonb_array_elements_text(request_document->'goods_receipt_ids') requested(value))
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='requested GRN header set differs from the exact receipt allocation lineage'; END IF;
    RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'supplier_account_id',supplier.id,
      'purchase_order_id',source_purchase_order_id,'goods_receipt_ids',request_document->'goods_receipt_ids',
      'supplier_party_id',supplier_party.id,'supplier_tax_registration_id',supplier_registration.id,
      'supplier_gstin',supplier_registration.registration_number,'supplier_legal_name',supplier_registration.registered_legal_name,
      'supplier_address',pg_catalog.concat_ws(', ',supplier_address.line1,supplier_address.line2,supplier_address.city,supplier_address.state_code,supplier_address.postal_code),
      'buyer_tax_registration_id',buyer_registration.id,'buyer_gstin',buyer_registration.gstin,
      'buyer_legal_name',organization.legal_name,'buyer_address',pg_catalog.concat_ws(', ',branch.address_line1,branch.address_line2,branch.city,branch.state_code,branch.postal_code),
      'invoice_date',invoice_date,'received_date',received_date,'due_date',invoice_date+supplier.payment_days,
      'supply_type',supply_type,'zero_rated_payment_mode','not_applicable','tax_charge_mechanism','normal',
      'place_of_supply_state_code',buyer_registration.state_code,'portal_document_line_id',portal_line.id,
      'portal_taxable_amount',portal_line.taxable_amount::text,'portal_cgst_amount',portal_line.cgst_amount::text,
      'portal_sgst_amount',portal_line.sgst_amount::text,'portal_igst_amount',portal_line.igst_amount::text,
      'portal_cess_amount',portal_line.cess_amount::text,'ruleset_version',ruleset_version,'lines',resolved_lines,
      'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','normal_charge',true,
        'posted_grn_match_required',true,'gstr2b_required',true,'itc_business_use_attestation_required',true,
        'landed_cost_supported',true,'landed_cost_methods',pg_catalog.jsonb_build_array('direct','quantity_weighted','value_weighted'),
        'consumed_variance_role','purchase_price_variance','import_supported',false,'sez_supported',false,'reverse_charge_supported',false),
      'source_versions',source_versions);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, request_document jsonb) TO "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, request_document jsonb) TO "erp_calculator";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb; allocation jsonb;
        existing automation.command_requests%ROWTYPE; aggregate_hash bytea; claim_id uuid; replay_id uuid;
        requested_total numeric(20,2);
BEGIN
    IF SESSION_USER<>'erp_calculator' OR supplier_invoice_id IS NULL OR command_id IS NULL OR artifact_id IS NULL
       OR request_id IS NULL OR tax_document_id IS NULL OR journal_id IS NULL OR event_id IS NULL OR open_item_id IS NULL
       OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(sequence_key_hash)<>32 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-invoice persistence envelope is invalid'; END IF;
    request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
    input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
    output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
    current_resolution:="erp_automation_commands"."resolve_supplier_invoice_prepare"(organization_id,membership_id,auth_user_id,application_user_id,
      grant_id,caller_client_id,supplier_invoice_id,request_document);
    PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
    IF current_resolution IS DISTINCT FROM resolved_document OR output_document->>'operation'<>'procurement.supplier_invoice.post'
       OR output_document->>'resource_type'<>'supplier_invoice' OR output_document->>'resource_id'<>supplier_invoice_id::text
       OR preview_document->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17'
       OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
       OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope' THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier-invoice resolution, calculation, or ITC attestation changed'; END IF;
    totals:=output_document->'totals';
    IF (totals->>'gst_taxable_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_taxable_amount')::numeric
       OR (totals->>'cgst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_cgst_amount')::numeric
       OR (totals->>'sgst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_sgst_amount')::numeric
       OR (totals->>'igst_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_igst_amount')::numeric
       OR (totals->>'cess_total')::numeric IS DISTINCT FROM (resolved_document->>'portal_cess_amount')::numeric THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculated supplier invoice GST components differ from the unique GSTR-2B evidence'; END IF;
    SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
      AND capability_code='procurement.supplier_invoice.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
    IF FOUND THEN
      IF existing.target_resource_id IS DISTINCT FROM supplier_invoice_id
         OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
         OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier-invoice idempotency key has different exact input'; END IF;
      RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
        'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
    END IF;
    requested_total:=(totals->>'grand_total')::numeric;
    INSERT INTO procurement.supplier_invoices(org_id,id,branch_id,supplier_account_id,buyer_tax_registration_id,
      supplier_tax_registration_id,supplier_invoice_number,supplier_invoice_date,received_date,due_date,fiscal_year,status,
      supply_type,zero_rated_payment_mode,tax_charge_mechanism,place_of_supply_state_code,calculation_ruleset_version,
      document_discount_kind,document_discount_basis,document_discount_value,supplier_legal_name_snapshot,supplier_gstin_snapshot,
      supplier_address_snapshot,buyer_legal_name_snapshot,buyer_gstin_snapshot,buyer_address_snapshot,currency_code,
      subtotal,discount_total,charges_total,net_value_total,gst_taxable_total,cgst_total,sgst_total,igst_total,cess_total,
      recipient_assessed_tax_total,rounding_policy,rounding_adjustment,grand_total)
    VALUES(organization_id,supplier_invoice_id,(resolved_document->>'branch_id')::uuid,(resolved_document->>'supplier_account_id')::uuid,
      (resolved_document->>'buyer_tax_registration_id')::uuid,(resolved_document->>'supplier_tax_registration_id')::uuid,
      request_document->>'supplier_invoice_number',(resolved_document->>'invoice_date')::date,(resolved_document->>'received_date')::date,
      (resolved_document->>'due_date')::date,CASE WHEN pg_catalog.date_part('month',(resolved_document->>'invoice_date')::date)>=4
        THEN pg_catalog.date_part('year',(resolved_document->>'invoice_date')::date)::integer
        ELSE pg_catalog.date_part('year',(resolved_document->>'invoice_date')::date)::integer-1 END,'approved',
      resolved_document->>'supply_type','not_applicable','normal',resolved_document->>'place_of_supply_state_code',output_document->>'ruleset_version',
      request_document->'document_discount'->>'document_discount_kind',request_document->'document_discount'->>'document_discount_basis',
      (request_document->'document_discount'->>'document_discount_value')::numeric,resolved_document->>'supplier_legal_name',
      resolved_document->>'supplier_gstin',resolved_document->>'supplier_address',resolved_document->>'buyer_legal_name',
      resolved_document->>'buyer_gstin',resolved_document->>'buyer_address','INR',(totals->>'subtotal')::numeric,
      (totals->>'discount_total')::numeric,(totals->>'charges_total')::numeric,(totals->>'net_value_total')::numeric,
      (totals->>'gst_taxable_total')::numeric,(totals->>'cgst_total')::numeric,(totals->>'sgst_total')::numeric,
      (totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,(totals->>'recipient_assessed_tax_total')::numeric,
      request_document->>'rounding_policy',(totals->>'rounding_adjustment')::numeric,requested_total);
    FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
      SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines') WHERE value->>'line_id'=resolved_line->>'line_id';
      INSERT INTO procurement.supplier_invoice_lines(org_id,id,supplier_invoice_id,line_number,line_kind,purchase_order_line_id,
        product_id,charge_code,uom_code,uom_conversion_factor,billed_quantity,free_quantity,base_billed_quantity,base_free_quantity,
        free_supply_tax_treatment,quoted_unit_rate,price_basis,tax_charge_mechanism,gross_amount,line_discount_kind,line_discount_basis,
        line_discount_value,document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,
        document_taxable_discount_amount,net_value_amount,gst_taxable_value,tax_classification_code_snapshot,tax_code_version_id,
        taxability_snapshot,inventory_cost_treatment,landed_cost_allocation_method,net_value_account_id,withholding_nature_code,itc_eligibility,cgst_rate,sgst_rate,igst_rate,cess_rate,
        cgst_amount,sgst_amount,igst_amount,cess_amount,line_total)
      VALUES(organization_id,(resolved_line->>'line_id')::uuid,supplier_invoice_id,(resolved_line->>'line_number')::integer,
        resolved_line->>'line_kind',NULLIF(resolved_line->>'purchase_order_line_id','')::uuid,
        NULLIF(resolved_line->>'product_id','')::uuid,resolved_line->>'charge_code',resolved_line->>'uom_code',
        NULLIF(resolved_line->>'multiplier','')::numeric,NULLIF(resolved_line->'input'->>'billed_quantity','')::numeric,
        NULLIF(resolved_line->'input'->>'free_quantity','')::numeric,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->>'billed_quantity')::numeric*(resolved_line->>'multiplier')::numeric END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->>'free_quantity')::numeric*(resolved_line->>'multiplier')::numeric END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->>'free_supply_tax_treatment' END,
        NULLIF(resolved_line->'input'->>'quoted_unit_rate','')::numeric,resolved_line->'input'->>'price_basis','normal',
        (calculated_line->>'gross_amount')::numeric,CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_kind' ELSE 'none' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->'input'->'line_discount'->>'line_discount_basis' ELSE 'price_value' END,
        CASE WHEN resolved_line->>'line_kind'='product' THEN (resolved_line->'input'->'line_discount'->>'line_discount_value')::numeric ELSE 0 END,
        (resolved_line->'input'->>'document_discount_eligible')::boolean,(calculated_line->>'line_discount_amount')::numeric,
        (calculated_line->>'line_taxable_discount_amount')::numeric,(calculated_line->>'document_discount_amount')::numeric,
        (calculated_line->>'document_taxable_discount_amount')::numeric,(calculated_line->>'net_value_amount')::numeric,
        (calculated_line->>'gst_taxable_value')::numeric,CASE WHEN resolved_line->>'line_kind'='product' THEN resolved_line->>'hsn_code' ELSE resolved_line->>'sac_code' END,
        (resolved_line->>'tax_code_version_id')::uuid,'taxable',resolved_line->>'inventory_cost_treatment',
        NULLIF(resolved_line->>'landed_cost_allocation_method',''),
        (resolved_line->>'net_value_account_id')::uuid,
        CASE WHEN resolved_line->>'line_kind'='product' THEN 'purchase_of_goods' END,
        'eligible',(calculated_line->>'cgst_rate')::numeric,
        (calculated_line->>'sgst_rate')::numeric,(calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,
        (calculated_line->>'cgst_amount')::numeric,(calculated_line->>'sgst_amount')::numeric,(calculated_line->>'igst_amount')::numeric,
        (calculated_line->>'cess_amount')::numeric,(calculated_line->>'line_total')::numeric);
      IF resolved_line->>'line_kind'='product' THEN
        FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_line->'receipt_allocations') LOOP
          INSERT INTO procurement.supplier_invoice_receipt_allocations(org_id,id,supplier_invoice_line_id,goods_receipt_line_id,
            allocated_base_billed_quantity,allocated_base_free_quantity)
          VALUES(organization_id,(allocation->>'allocation_id')::uuid,(resolved_line->>'line_id')::uuid,
            (allocation->>'goods_receipt_line_id')::uuid,(allocation->>'allocated_base_billed_quantity')::numeric,
            (allocation->>'allocated_base_free_quantity')::numeric);
        END LOOP;
      END IF;
    END LOOP;
    PERFORM erp_commercial_commands.assert_supplier_invoice_artifact(organization_id,supplier_invoice_id,input_document,output_document);
    aggregate_hash:="erp_automation_commands"."aggregate_version_hash"('supplier_invoice',supplier_invoice_id,1);
    PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'procurement.supplier_invoice.prepare',
      (resolved_document->>'branch_id')::uuid,NULL,supplier_invoice_id,requested_total,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,membership_id,
      'procurement.supplier_invoice.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
    IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier-invoice prepare replay reached completed execution'; END IF;
    PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,
      'procurement.supplier_invoice.post','supplier_invoice',supplier_invoice_id,1,request_id,command_id,claim_id,
      extensions.digest(request_bytes,'sha256'),calculation_input_bytes,calculation_output_bytes,output_document->>'engine_version',
      output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at);
    RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
      'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_supplier_invoice_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, supplier_invoice_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz) TO "erp_calculator";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."execute_approved_command"(organization_id uuid, command_request_id uuid)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
    actor_id uuid := NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid;
    request_context uuid := NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid;
    command_context uuid := NULLIF(pg_catalog.current_setting('app.command_request_id',true),'')::uuid;
    request_row automation.command_requests%ROWTYPE;
    grant_row automation.agent_grants%ROWTYPE;
    capability automation.agent_grant_capabilities%ROWTYPE;
    calculation_artifact calculation.artifacts%ROWTYPE;
    sales_order sales.orders%ROWTYPE;
    purchase_order procurement.purchase_orders%ROWTYPE;
    goods_receipt procurement.goods_receipts%ROWTYPE;
    supplier_invoice procurement.supplier_invoices%ROWTYPE;
    sales_invoice sales.invoices%ROWTYPE;
    sales_return sales.returns%ROWTYPE;
    purchase_return procurement.purchase_returns%ROWTYPE;
    payment finance.payments%ROWTYPE;
    inventory_document inventory.inventory_documents%ROWTYPE;
    valuation_journal finance.journal_entries%ROWTYPE;
    application_membership core.memberships%ROWTYPE;
    application_user core.users%ROWTYPE;
    preview_document jsonb;
    request_document jsonb;
    current_resolution jsonb;
    resolved_allocation jsonb;
    inventory_document_id uuid;
    valuation_sequence_id uuid;
    valuation_journal_number text;
    invoice_journal_number text;
    approval_count integer;
    response_document jsonb;
    response_body bytea;
    posted_allocation_count integer;
    posted_allocation_total numeric(20,2);
    approving_membership_id uuid;
    approval_decided_at timestamptz;
    count_gain_ledger_count integer;
    count_gain_ledger_value numeric(20,2);
    transfer_out_count integer;
    transfer_in_count integer;
    transfer_quantity_net numeric(20,6);
    transfer_value_net numeric(20,2);
BEGIN
    IF organization_id IS DISTINCT FROM NULLIF(pg_catalog.current_setting('app.org_id',true),'')::uuid
       OR actor_id IS NULL OR request_context IS NULL
       OR command_context IS DISTINCT FROM command_request_id
       OR erp_security.has_permission('automation.command.execute',NULL::uuid) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='automation execution context or permission is invalid';
    END IF;
    SELECT * INTO request_row FROM automation.command_requests
     WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='command request not found';
    END IF;
    IF request_row.status='succeeded' THEN
        RETURN request_row.response_bytes;
    END IF;
    IF request_row.status NOT IN ('prepared','pending_approval','approved')
       OR request_row.expires_at<=pg_catalog.transaction_timestamp()
       OR request_row.requested_by_membership_id IS DISTINCT FROM actor_id THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='command request is not executable';
    END IF;
    SELECT * INTO grant_row FROM automation.agent_grants
     WHERE org_id=organization_id AND id=request_row.agent_grant_id FOR UPDATE;
    SELECT * INTO capability FROM automation.agent_grant_capabilities
     WHERE org_id=organization_id AND agent_grant_id=request_row.agent_grant_id
       AND capability_code=request_row.capability_code FOR SHARE;
    IF grant_row.status<>'active' OR grant_row.expires_at<=pg_catalog.transaction_timestamp()
       OR grant_row.subject_membership_id IS DISTINCT FROM actor_id
       OR capability.status<>'active'
       OR capability.operation_mode IS DISTINCT FROM request_row.operation_mode
       OR capability.risk_class IS DISTINCT FROM request_row.risk_class
       OR capability.approval_policy IS DISTINCT FROM request_row.approval_policy
       OR (request_row.operation='automation.agent_grant.revoke'
           AND request_row.branch_id IS DISTINCT FROM grant_row.branch_id)
       OR (request_row.operation<>'automation.agent_grant.revoke' AND
           (request_row.branch_id IS NULL
            OR erp_security.can_access_branch(request_row.branch_id) IS DISTINCT FROM true
            OR erp_security.has_permission('automation.command.execute',request_row.branch_id) IS DISTINCT FROM true
            OR (request_row.destination_branch_id IS NOT NULL AND
                (erp_security.can_access_branch(request_row.destination_branch_id) IS DISTINCT FROM true
                 OR erp_security.has_permission('automation.command.execute',request_row.destination_branch_id) IS DISTINCT FROM true))
            OR (grant_row.branch_id IS NOT NULL AND
                (request_row.branch_id IS DISTINCT FROM grant_row.branch_id
                 OR request_row.destination_branch_id IS NOT NULL)))) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='grant or exact capability consent changed before execution';
    END IF;
    IF request_row.request_hash IS DISTINCT FROM extensions.digest(request_row.request_bytes,'sha256')
       OR request_row.preview_hash IS DISTINCT FROM extensions.digest(request_row.preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='command request, preview, calculation, or aggregate version changed';
    END IF;
    preview_document:=pg_catalog.convert_from(request_row.preview_bytes,'UTF8')::jsonb;
    request_document:=pg_catalog.convert_from(request_row.request_bytes,'UTF8')::jsonb;
    -- aggregate authority: exact_execute_aggregate_bindings_v2
    IF request_row.operation='automation.agent_grant.revoke' THEN
        IF request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                request_row.target_resource_type,request_row.target_resource_id,grant_row.row_version
           ) OR request_row.target_row_version IS DISTINCT FROM grant_row.row_version
           OR request_row.calculation_hash IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='grant revocation aggregate changed';
        END IF;
    ELSIF request_row.operation='sales.order.approve' THEN
        SELECT * INTO STRICT sales_order FROM sales.orders
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND sales_order_id=request_row.target_resource_id FOR UPDATE;
        IF request_row.capability_code<>'sales.order.prepare'
           OR request_row.target_resource_type<>'sales_order'
           OR request_row.target_row_version IS DISTINCT FROM sales_order.row_version
           OR sales_order.status<>'submitted'
           OR sales_order.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'sales_order',sales_order.id,sales_order.row_version
           )
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'sales.order.approve'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM sales_order.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales order or exact calculation evidence changed';
        END IF;
    ELSIF request_row.operation='procurement.purchase_order.approve' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT purchase_order FROM procurement.purchase_orders
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND purchase_order_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_purchase_order_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.purchase_order.prepare'
           OR request_row.target_resource_type<>'purchase_order'
           OR request_row.target_row_version IS DISTINCT FROM purchase_order.row_version
           OR purchase_order.status<>'submitted' OR purchase_order.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'purchase_order_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'purchase_order',purchase_order.id,purchase_order.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'procurement.purchase_order.approve'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM purchase_order.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase order supplier, GST, UOM, tax, charge, or calculation source changed';
        END IF;
        PERFORM erp_trade_commands_v2.assert_purchase_order_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
    ELSIF request_row.operation='procurement.receipt.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT goods_receipt FROM procurement.goods_receipts
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND goods_receipt_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_goods_receipt_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.goods_receipt.prepare'
           OR request_row.target_resource_type<>'goods_receipt'
           OR request_row.target_row_version IS DISTINCT FROM goods_receipt.row_version
           OR goods_receipt.status<>'approved' OR goods_receipt.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'goods_receipt_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='goods receipt PO, ceiling, batch, MRP, QC, licence, location, or cost source changed'; END IF;
        PERFORM "erp_automation_commands"."assert_goods_receipt_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,request_document,current_resolution);
    ELSIF request_row.operation='procurement.supplier_invoice.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT supplier_invoice FROM procurement.supplier_invoices
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND supplier_invoice_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_supplier_invoice_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.supplier_invoice.prepare'
           OR request_row.target_resource_type<>'supplier_invoice'
           OR request_row.target_row_version IS DISTINCT FROM supplier_invoice.row_version
           OR supplier_invoice.status<>'approved'
           OR supplier_invoice.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'supplier_invoice_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR preview_document->>'itc_eligibility_basis'<>'taxable_resale_not_blocked_under_section_17'
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR current_resolution->'goods_receipt_ids' IS DISTINCT FROM request_document->'goods_receipt_ids'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'supplier_invoice',supplier_invoice.id,supplier_invoice.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'procurement.supplier_invoice.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM supplier_invoice.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash
           OR EXISTS (SELECT 1 FROM inventory.inventory_documents document
                WHERE document.org_id=organization_id AND document.supplier_invoice_id=request_row.target_resource_id) THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier invoice GRN, ceiling, GST, portal, ITC, account, or calculation source changed'; END IF;
        PERFORM erp_commercial_commands.assert_supplier_invoice_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
    ELSIF request_row.operation='sales.dispatch.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        current_resolution:="erp_automation_commands"."resolve_sales_dispatch_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND sales_dispatch_id=request_row.target_resource_id FOR UPDATE;
        IF request_row.capability_code<>'sales.dispatch.prepare'
           OR request_row.target_resource_type<>'dispatch'
           OR request_row.target_row_version<>1
           OR request_row.calculation_hash IS NOT NULL
           OR request_document->>'dispatch_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256') THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales dispatch order, batch, FEFO, stock, logistics, or valuation source changed';
        END IF;
        PERFORM "erp_automation_commands"."assert_sales_dispatch_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,request_document,current_resolution);
    ELSIF request_row.operation='sales.invoice.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT sales_invoice FROM sales.invoices
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND sales_invoice_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_sales_invoice_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        SELECT id INTO inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND sales_invoice_id=request_row.target_resource_id FOR UPDATE;
        IF request_row.capability_code<>'sales.invoice.prepare'
           OR request_row.target_resource_type<>'sales_invoice'
           OR request_row.target_row_version IS DISTINCT FROM sales_invoice.row_version
           OR sales_invoice.status<>'draft' OR sales_invoice.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'invoice_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'inventory_document_id','')::uuid IS DISTINCT FROM inventory_document_id
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'sales_invoice',sales_invoice.id,sales_invoice.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued'
           OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'sales.invoice.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM sales_invoice.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales invoice legal, tax, fulfillment, stock, cost, account, or calculation source changed';
        END IF;
        PERFORM "erp_automation_commands"."assert_sales_invoice_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,current_resolution);
    ELSIF request_row.operation='sales.return.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT sales_return FROM sales.returns
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND sales_return_id=request_row.target_resource_id FOR UPDATE;
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND sales_return_id=request_row.target_resource_id
           AND document_type='sales_return_receipt' FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_sales_return_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'sales.return.prepare'
           OR request_row.target_resource_type<>'sales_return'
           OR request_row.target_row_version IS DISTINCT FROM sales_return.row_version
           OR sales_return.status<>'draft' OR sales_return.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'sales_return_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'sales_return',sales_return.id,sales_return.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued' OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'sales.return.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM sales_return.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='sales return invoice, dispatch, batch, quarantine, GST rule, evidence, prior return, account, or calculation source changed';
        END IF;
        PERFORM erp_commercial_commands.assert_sales_return_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
        PERFORM "erp_automation_commands"."assert_sales_return_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,current_resolution);
    ELSIF request_row.operation='procurement.purchase_return.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT purchase_return FROM procurement.purchase_returns
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND purchase_return_id=request_row.target_resource_id FOR UPDATE;
        SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
         WHERE org_id=organization_id AND purchase_return_id=request_row.target_resource_id
           AND document_type='purchase_return_issue' FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_purchase_return_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'procurement.purchase_return.prepare'
           OR request_row.target_resource_type<>'purchase_return'
           OR request_row.target_row_version IS DISTINCT FROM purchase_return.row_version
           OR purchase_return.status<>'submitted' OR purchase_return.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'purchase_return_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'purchase_return',purchase_return.id,purchase_return.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued' OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'procurement.purchase_return.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM purchase_return.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase return invoice, receipt allocation, batch, location, stock, GST rule, portal evidence, payable, prior return, account, logistics, or calculation source changed';
        END IF;
        PERFORM erp_commercial_commands.assert_purchase_return_artifact(
          organization_id,request_row.target_resource_id,
          pg_catalog.convert_from(calculation_artifact.input_bytes,'UTF8')::jsonb,
          pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb);
        PERFORM "erp_automation_commands"."assert_purchase_return_draft"(
          organization_id,request_row.target_resource_id,inventory_document_id,current_resolution);
    ELSIF request_row.operation='finance.payment.post' AND request_row.capability_code='finance.customer_receipt.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_customer_receipt_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.direction<>'receipt' OR payment.payment_purpose<>'commercial_settlement'
           OR payment.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'payment_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt customer, bank, reference, invoice, open-item, allocation, or account source changed'; END IF;
        PERFORM "erp_automation_commands"."assert_customer_receipt_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSIF request_row.operation='finance.payment.post' AND request_row.capability_code='finance.supplier_payment.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_supplier_payment_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.direction<>'disbursement' OR payment.payment_purpose<>'commercial_settlement'
           OR payment.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'payment_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment supplier, PAN, fiscal fact, bank, reference, invoice, payable, allocation, or account source changed'; END IF;
        PERFORM "erp_automation_commands"."assert_supplier_payment_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSIF request_row.operation='finance.supplier_advance.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT payment FROM finance.payments
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_supplier_advance_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'finance.supplier_advance.prepare'
           OR request_row.target_resource_type<>'payment' OR request_row.target_row_version IS DISTINCT FROM payment.row_version
           OR payment.status<>'approved' OR payment.direction<>'disbursement' OR payment.payment_purpose<>'supplier_advance'
           OR payment.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'payment_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier advance supplier, PAN, fiscal fact, PO line, prior advance, bank, reference, or account source changed'; END IF;
        PERFORM "erp_automation_commands"."assert_supplier_advance_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSIF request_row.operation='inventory.document.post' AND request_row.capability_code='inventory.transfer.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT inventory_document FROM inventory.inventory_documents
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_inventory_transfer_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'inventory_document'
           OR request_row.target_row_version IS DISTINCT FROM inventory_document.row_version
           OR inventory_document.status<>'submitted' OR inventory_document.document_type<>'transfer'
           OR inventory_document.reason_code<>'inter_branch_transfer'
           OR inventory_document.branch_id IS DISTINCT FROM request_row.branch_id
           OR inventory_document.destination_branch_id IS DISTINCT FROM request_row.destination_branch_id
           OR request_document->>'inventory_document_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='transfer branch, location, FEFO batch, available balance, MWA, recall, pending movement, or logistics source changed'; END IF;
        PERFORM "erp_automation_commands"."assert_inventory_transfer_draft"(
          organization_id,request_row.target_resource_id,current_resolution);
    ELSIF request_row.operation='inventory.document.post' AND request_row.capability_code='inventory.adjustment.prepare' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT inventory_document FROM inventory.inventory_documents
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT valuation_journal FROM finance.journal_entries
         WHERE org_id=organization_id AND id=(request_document->>'journal_id')::uuid FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_inventory_adjustment_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.target_resource_type<>'inventory_document'
           OR request_row.target_row_version IS DISTINCT FROM inventory_document.row_version
           OR inventory_document.status<>'submitted' OR inventory_document.document_type<>'stock_count'
           OR inventory_document.reason_code<>'cycle_count' OR inventory_document.branch_id IS DISTINCT FROM request_row.branch_id
           OR request_document->>'inventory_document_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR NULLIF(request_document->>'journal_id','')::uuid IS NULL OR NULLIF(request_document->>'event_id','')::uuid IS NULL
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
           OR request_row.calculation_hash IS NOT NULL THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cycle-count evidence, lot, location, balance, MWA, licence, recall, pending movement, or account source changed'; END IF;
        PERFORM "erp_automation_commands"."assert_inventory_adjustment_draft"(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,current_resolution);
    ELSE
        IF request_row.target_row_version<>1
           OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
                pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256'
           ) OR (request_row.calculation_hash IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM calculation.artifacts AS artifact
                 WHERE artifact.org_id=organization_id
                   AND artifact.command_request_id=request_row.id
                   AND artifact.authority_hash=request_row.calculation_hash
                   AND artifact.status='issued'
                   AND artifact.expires_at>pg_catalog.transaction_timestamp()
           )) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='operator preview source or calculation evidence changed';
        END IF;
    END IF;
    IF EXISTS (
        SELECT 1 FROM automation.command_approvals AS approval
         WHERE approval.org_id=organization_id
           AND approval.command_request_id=command_request_id
           AND approval.decision='rejected'
           AND approval.preview_hash=request_row.preview_hash
           AND approval.aggregate_version_hash=request_row.aggregate_version_hash
    ) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command has an exact-preview rejection';
    END IF;
    SELECT count(*) INTO approval_count
      FROM automation.command_approvals AS approval
     WHERE approval.org_id=organization_id
       AND approval.command_request_id=command_request_id
       AND approval.decision='approved'
       AND approval.preview_hash=request_row.preview_hash
       AND approval.aggregate_version_hash=request_row.aggregate_version_hash
       AND approval.valid_until_at>pg_catalog.transaction_timestamp()
       AND (request_row.approval_policy<>'actor_confirmation'
            OR approval.approver_membership_id=request_row.requested_by_membership_id)
       AND (request_row.approval_policy='actor_confirmation'
            OR approval.approver_membership_id<>request_row.requested_by_membership_id)
       AND (request_row.approval_policy<>'human_compliance_approver'
            OR approval.authentication_strength='mfa');
    IF approval_count<request_row.required_approval_count THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='unexpired exact-preview approval quorum is incomplete';
    END IF;
    INSERT INTO "erp_automation_commands"."execution_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),organization_id,command_request_id);
    IF request_row.status<>'approved' THEN
        UPDATE automation.command_requests
           SET status='approved',row_version=row_version+1
         WHERE org_id=organization_id AND id=command_request_id;
    END IF;
    UPDATE automation.command_requests
       SET status='executing',execution_started_at=pg_catalog.transaction_timestamp(),
           row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id AND status='approved';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='command begin boundary lost ownership';
    END IF;
    CASE request_row.operation
      WHEN 'automation.agent_grant.revoke' THEN
        IF request_row.target_resource_type<>'agent_grant'
           OR request_row.target_resource_id IS DISTINCT FROM request_row.agent_grant_id
           OR request_row.request_reason IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed grant revocation handler binding is invalid';
        END IF;
        UPDATE automation.agent_grants
           SET status='revoked',revoked_at=pg_catalog.transaction_timestamp(),
               revoked_by_membership_id=actor_id,revocation_reason=request_row.request_reason,
               updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
               row_version=row_version+1
         WHERE org_id=organization_id AND id=request_row.target_resource_id
           AND status='active' AND row_version=request_row.target_row_version;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='grant changed before typed revocation handler';
        END IF;
      WHEN 'sales.order.approve' THEN
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_trade_commands_v2.approve_sales_order(
            organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
            calculation_artifact.request_id,request_row.id,request_row.idempotency_key_hash,
            request_row.request_hash,
            least(request_row.expires_at,calculation_artifact.expires_at)
        );
      WHEN 'procurement.purchase_order.approve' THEN
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_trade_commands_v2.approve_purchase_order(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,request_row.idempotency_key_hash,
          request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'procurement.receipt.post' THEN
        PERFORM erp_trade_commands.post_goods_receipt(
          organization_id,request_row.target_resource_id,inventory_document_id,actor_id,
          request_row.idempotency_key_hash,request_row.request_hash,request_row.expires_at);
      WHEN 'procurement.supplier_invoice.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(supplier_invoice.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':supplier-invoice-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_supplier_invoice(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,
          (request_document->>'tax_document_id')::uuid,(request_document->>'journal_id')::uuid,
          invoice_journal_number,(request_document->>'event_id')::uuid,(request_document->>'open_item_id')::uuid,
          (request_document->>'inventory_document_id')::uuid,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':landed-cost','UTF8'),'sha256'),
          extensions.digest(request_row.request_hash||pg_catalog.convert_to(':landed-cost','UTF8'),'sha256'),
          request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'sales.dispatch.post' THEN
        PERFORM erp_trade_commands.post_dispatch(
          organization_id,request_row.target_resource_id,inventory_document_id,actor_id,
          request_row.idempotency_key_hash,request_row.request_hash,request_row.expires_at);
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         JOIN sales.dispatches dispatch ON dispatch.org_id=sequence.org_id
           AND dispatch.id=request_row.target_resource_id AND dispatch.branch_id=sequence.branch_id
         WHERE sequence.org_id=organization_id AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(dispatch.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE OF sequence;
        valuation_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':dispatch-valuation-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM erp_commercial_commands.post_dispatch_inventory_valuation(
          organization_id,inventory_document_id,actor_id,
          (request_document->>'valuation_journal_id')::uuid,valuation_journal_number,
          (request_document->>'valuation_event_id')::uuid,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':dispatch-valuation','UTF8'),'sha256'),
          extensions.digest(request_row.request_hash||pg_catalog.convert_to(':dispatch-valuation','UTF8'),'sha256'),
          request_row.expires_at);
      WHEN 'sales.invoice.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(sales_invoice.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':sales-invoice-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_sales_invoice(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,
          (request_document->>'tax_document_id')::uuid,(request_document->>'journal_id')::uuid,
          invoice_journal_number,(request_document->>'event_id')::uuid,(request_document->>'open_item_id')::uuid,
          inventory_document_id,request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'sales.return.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(sales_return.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':sales-return-journal','UTF8'),'sha256'),
          request_row.expires_at);
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_sales_return(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,(request_document->>'adjustment_note_id')::uuid,
          sales_return.return_number,NULLIF(request_document->>'tax_document_id','')::uuid,
          (request_document->>'journal_id')::uuid,invoice_journal_number,(request_document->>'event_id')::uuid,
          (request_document->>'allocation_id')::uuid,(request_document->>'residual_open_item_id')::uuid,
          inventory_document_id,request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'procurement.purchase_return.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(purchase_return.fiscal_year,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':purchase-return-journal','UTF8'),'sha256'),
          request_row.expires_at);
        UPDATE procurement.purchase_returns
           SET status='approved',updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id
         WHERE org_id=organization_id AND id=request_row.target_resource_id
           AND status='submitted' AND row_version=request_row.target_row_version;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='purchase-return approval transition lost its submitted state'; END IF;
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_purchase_return(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,(request_document->>'adjustment_note_id')::uuid,
          purchase_return.purchase_return_number,NULLIF(request_document->>'tax_document_id','')::uuid,
          (request_document->>'journal_id')::uuid,invoice_journal_number,(request_document->>'event_id')::uuid,
          (request_document->>'allocation_id')::uuid,(request_document->>'residual_open_item_id')::uuid,
          inventory_document_id,request_row.idempotency_key_hash,request_row.request_hash,
          least(request_row.expires_at,calculation_artifact.expires_at));
      WHEN 'finance.payment.post' THEN
        IF request_row.capability_code NOT IN ('finance.customer_receipt.prepare','finance.supplier_payment.prepare') THEN
          RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='finance payment operation has no reviewed capability-specific dispatcher'; END IF;
        PERFORM erp_finance_commands.post_payment(organization_id,request_row.target_resource_id,
          (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid);
        FOR resolved_allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(current_resolution->'allocations') LOOP
          INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
            amount,functional_amount,fx_rate,status,created_by_membership_id)
          VALUES(organization_id,(resolved_allocation->>'allocation_id')::uuid,request_row.target_resource_id,
            (resolved_allocation->>'open_item_id')::uuid,payment.payment_date,'INR',
            (resolved_allocation->>'amount')::numeric,(resolved_allocation->>'amount')::numeric,1,'posted',actor_id);
        END LOOP;
        SELECT count(*),coalesce(sum(allocation.amount),0) INTO posted_allocation_count,posted_allocation_total
          FROM finance.allocations allocation WHERE allocation.org_id=organization_id
           AND allocation.payment_id=request_row.target_resource_id AND allocation.status='posted';
        IF posted_allocation_count<>pg_catalog.jsonb_array_length(current_resolution->'allocations')
           OR posted_allocation_total<>payment.amount OR EXISTS (
             SELECT 1 FROM finance.allocations allocation
              WHERE allocation.org_id=organization_id AND allocation.payment_id=request_row.target_resource_id
                AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(current_resolution->'allocations') expected(value)
                  WHERE (expected.value->>'allocation_id')::uuid=allocation.id
                    AND (expected.value->>'open_item_id')::uuid=allocation.open_item_id
                    AND (expected.value->>'amount')::numeric=allocation.amount)) THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE=CASE request_row.capability_code
            WHEN 'finance.supplier_payment.prepare' THEN 'supplier payment posted allocation set differs from approved preview'
            ELSE 'customer receipt posted allocation set differs from approved preview' END; END IF;
      WHEN 'finance.supplier_advance.post' THEN
        PERFORM erp_finance_commands.post_supplier_advance_payment(
          organization_id,request_row.target_resource_id,(request_document->>'journal_id')::uuid,
          (request_document->>'event_id')::uuid,current_resolution->'allocations');
      WHEN 'inventory.document.post' THEN
        IF request_row.capability_code NOT IN ('inventory.transfer.prepare','inventory.adjustment.prepare') THEN
          RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='inventory document operation has no reviewed capability-specific dispatcher'; END IF;
        IF request_row.capability_code='inventory.transfer.prepare' THEN
          SELECT approval.approver_membership_id,approval.decided_at
            INTO STRICT approving_membership_id,approval_decided_at
            FROM automation.command_approvals approval
           WHERE approval.org_id=organization_id AND approval.command_request_id=request_row.id
             AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
             AND approval.aggregate_version_hash=request_row.aggregate_version_hash
             AND approval.valid_until_at>pg_catalog.transaction_timestamp()
             AND approval.approver_membership_id=request_row.requested_by_membership_id
           ORDER BY approval.decided_at,approval.id LIMIT 1 FOR SHARE;
        ELSE
          SELECT approval.approver_membership_id,approval.decided_at
            INTO STRICT approving_membership_id,approval_decided_at
            FROM automation.command_approvals approval
           WHERE approval.org_id=organization_id AND approval.command_request_id=request_row.id
             AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
             AND approval.aggregate_version_hash=request_row.aggregate_version_hash
             AND approval.valid_until_at>pg_catalog.transaction_timestamp()
             AND approval.approver_membership_id<>request_row.requested_by_membership_id
           ORDER BY approval.decided_at,approval.id LIMIT 1 FOR SHARE;
        END IF;
        UPDATE inventory.inventory_documents SET status='approved',approved_at=approval_decided_at,
          approved_by_membership_id=approving_membership_id,updated_at=pg_catalog.transaction_timestamp(),
          updated_by_membership_id=actor_id,row_version=row_version+1
         WHERE org_id=organization_id AND id=request_row.target_resource_id AND status='submitted';
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='inventory approval transition lost its lock'; END IF;
        PERFORM erp_trade_commands.post_locked_document(organization_id,request_row.target_resource_id,actor_id);
        IF request_row.capability_code='inventory.transfer.prepare' THEN
          SELECT count(*) FILTER (WHERE entry.entry_kind='transfer_out'),
                 count(*) FILTER (WHERE entry.entry_kind='transfer_in'),
                 coalesce(sum(entry.quantity_delta),0),coalesce(sum(entry.value_delta),0)
            INTO transfer_out_count,transfer_in_count,transfer_quantity_net,transfer_value_net
            FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id
             AND entry.inventory_document_id=request_row.target_resource_id;
          IF transfer_out_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR transfer_in_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR transfer_quantity_net<>0 OR transfer_value_net<>0
             OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(current_resolution->'lines') expected(value)
                  WHERE NOT EXISTS(SELECT 1 FROM inventory.stock_ledger_entries source_entry
                    JOIN inventory.stock_ledger_entries destination_entry
                      ON destination_entry.org_id=source_entry.org_id
                     AND destination_entry.inventory_document_line_id=source_entry.inventory_document_line_id
                   WHERE source_entry.org_id=organization_id
                     AND source_entry.inventory_document_id=request_row.target_resource_id
                     AND source_entry.inventory_document_line_id=(expected.value->>'inventory_document_line_id')::uuid
                     AND destination_entry.inventory_document_id=request_row.target_resource_id
                     AND source_entry.entry_kind='transfer_out' AND destination_entry.entry_kind='transfer_in'
                     AND source_entry.branch_id=(current_resolution->>'source_branch_id')::uuid
                     AND destination_entry.branch_id=(current_resolution->>'destination_branch_id')::uuid
                     AND source_entry.location_id=(current_resolution->>'source_location_id')::uuid
                     AND destination_entry.location_id=(current_resolution->>'destination_location_id')::uuid
                     AND source_entry.product_id=(expected.value->>'product_id')::uuid
                     AND destination_entry.product_id=(expected.value->>'product_id')::uuid
                     AND source_entry.batch_id=(expected.value->>'batch_id')::uuid
                     AND destination_entry.batch_id=(expected.value->>'batch_id')::uuid
                     AND source_entry.quantity_delta=-(expected.value->>'base_quantity')::numeric
                     AND destination_entry.quantity_delta=(expected.value->>'base_quantity')::numeric
                     AND source_entry.unit_cost=(expected.value->>'unit_cost')::numeric
                     AND destination_entry.unit_cost=(expected.value->>'unit_cost')::numeric
                     AND source_entry.value_delta=-(expected.value->>'extended_cost')::numeric
                     AND destination_entry.value_delta=(expected.value->>'extended_cost')::numeric)) THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted transfer ledger is not the exact balanced approved quantity and valuation'; END IF;
        ELSE
          SELECT count(*),coalesce(sum(entry.value_delta),0) INTO count_gain_ledger_count,count_gain_ledger_value
            FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id
             AND entry.inventory_document_id=request_row.target_resource_id AND entry.entry_kind='count_gain';
          IF count_gain_ledger_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR count_gain_ledger_value<>(current_resolution->>'total_value')::numeric THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted count-gain ledger differs from the approved MWA preview'; END IF;
          UPDATE finance.journal_entries SET status='posted',posted_at=pg_catalog.transaction_timestamp(),
            posted_by_membership_id=actor_id,updated_at=pg_catalog.transaction_timestamp(),
            updated_by_membership_id=actor_id,row_version=row_version+1
           WHERE org_id=organization_id AND id=(request_document->>'journal_id')::uuid AND status='draft'
             AND transaction_debit_total=count_gain_ledger_value AND transaction_credit_total=count_gain_ledger_value
             AND functional_debit_total=count_gain_ledger_value AND functional_credit_total=count_gain_ledger_value;
          IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cycle-count valuation journal changed before atomic posting'; END IF;
          INSERT INTO finance.accounting_events(org_id,id,event_type,inventory_document_id,journal_entry_id,
            occurred_at,source_posted_at,created_by_membership_id)
          SELECT organization_id,(request_document->>'event_id')::uuid,'inventory_valuation',document.id,
            (request_document->>'journal_id')::uuid,document.posted_at,document.posted_at,actor_id
            FROM inventory.inventory_documents document WHERE document.org_id=organization_id
             AND document.id=request_row.target_resource_id AND document.status='posted';
        END IF;
      ELSE
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='operation has no reviewed typed dispatcher';
    END CASE;
    response_document := pg_catalog.jsonb_build_object(
        'command_request_id',command_request_id,
        'operation',request_row.operation,
        'resource_id',request_row.target_resource_id,
        'resource_type',request_row.target_resource_type,
        'status','succeeded'
    );
    response_body := pg_catalog.convert_to(response_document::text,'UTF8');
    UPDATE automation.command_requests
       SET status='succeeded',completed_at=pg_catalog.transaction_timestamp(),
           result_resource_type=request_row.target_resource_type,
           result_resource_id=request_row.target_resource_id,response_status=200,
           response_media_type='application/vnd.aasopharma.command-result+json',
           response_bytes=response_body,response_hash=extensions.digest(response_body,'sha256'),
           row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id AND status='executing';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='command finish boundary lost ownership';
    END IF;
    DELETE FROM "erp_automation_commands"."execution_scopes" AS scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.org_id=request_row.org_id
       AND scope.command_request_id=request_row.id;
    RETURN response_body;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."execute_approved_command"(organization_id uuid, command_request_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."execute_approved_command"(organization_id uuid, command_request_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."execute_approved_command"(organization_id uuid, command_request_id uuid) TO "erp_runtime";

RESET ROLE;
