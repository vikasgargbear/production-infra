CREATE OR REPLACE FUNCTION erp_automation_commands.promote_historical_product_inventory_batch(
  organization_id uuid,
  reviewed_dataset_id varchar,
  opening_location_id uuid,
  batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; product_fact automation.historical_migration_facts%ROWTYPE;
  batch_fact automation.historical_migration_facts%ROWTYPE;
  product_identifier uuid; manufacturer_identifier uuid; tax_release_identifier uuid; tax_version_identifier uuid;
  identity_conversion_id uuid; batch_identifier uuid; line_identifier uuid;
  document_identifier uuid; journal_identifier uuid; event_identifier uuid;
  branch_identifier uuid; inventory_account_id uuid; equity_account_id uuid;
  raw_quantity numeric(20,6); derived_quantity numeric(20,6);
  raw_value numeric(20,2); derived_value numeric(20,2);
  batch_quantity numeric(20,6); batch_value numeric(20,2);
  batch_count integer; line_number integer; matching_count integer;
  matching_product_count integer;
  source_code text; manufacturer_label text; base_uom text; source_hsn text;
  source_gst numeric(9,6); opening_date date; fiscal_year integer;
  product_created integer:=0; zero_clamped integer:=0; openings_posted integer:=0;
  batches_bound integer:=0; products_remaining integer; replayed integer:=0;
  command_time timestamptz:=pg_catalog.transaction_timestamp();
  created_product record; created_manufacturer record;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.organization.manage',NULL::uuid
  );
  SET CONSTRAINTS ALL DEFERRED;
  IF NULLIF(pg_catalog.btrim(reviewed_dataset_id),'') IS NULL
     OR batch_size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='historical product cutover request is invalid';
  END IF;
  SELECT location.branch_id INTO STRICT branch_identifier
    FROM inventory.locations location
   WHERE location.org_id=organization_id AND location.id=opening_location_id
     AND location.status='active' AND location.allows_sale
     AND NOT location.allows_negative_stock FOR SHARE;
  IF NOT erp_security.can_access_branch(branch_identifier) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='opening inventory location is outside branch scope';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':historical-product-inventory:'||reviewed_dataset_id,730073
  ));
  inventory_account_id:=erp_commercial_commands.resolve_role_account(
    organization_id,branch_identifier,'inventory_asset','asset','INR',false
  );
  SELECT account.id INTO equity_account_id
    FROM core.settings setting JOIN finance.accounts account
      ON account.org_id=setting.org_id AND account.id=setting.value_text::uuid
   WHERE setting.org_id=organization_id AND setting.namespace='finance.account_roles'
     AND setting.key='opening_balance_equity' AND setting.status='active'
     AND setting.branch_id IS NULL AND account.status='active' AND account.account_type='equity';
  IF equity_account_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='opening balance equity account role is unavailable';
  END IF;

  FOR product_fact IN
    SELECT fact.* FROM automation.historical_migration_facts fact
    LEFT JOIN automation.historical_product_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='product' AND fact.selection_state='reviewed'
     AND binding.source_fact_id IS NULL
   ORDER BY fact.id LIMIT batch_size
  LOOP
    source_code:=COALESCE(NULLIF(pg_catalog.btrim(product_fact.product_code),''),
      NULLIF(pg_catalog.btrim(product_fact.payload->>'source_product_code'),''));
    manufacturer_label:=NULLIF(pg_catalog.btrim(product_fact.payload->>'source_company'),'');
    base_uom:=NULLIF(pg_catalog.btrim(product_fact.payload->>'base_uom_code'),'');
    source_hsn:=NULLIF(pg_catalog.btrim(product_fact.payload->>'hsn_code'),'');
    source_gst:=NULLIF(product_fact.payload->>'gst_rate','')::numeric;
    raw_quantity:=COALESCE(product_fact.quantity,0);
    raw_value:=COALESCE(product_fact.inventory_value,0);
    derived_quantity:=greatest(raw_quantity,0);
    derived_value:=CASE WHEN raw_quantity>0 THEN greatest(raw_value,0) ELSE 0 END;
    opening_date:=product_fact.event_date;
    IF source_code IS NULL OR NULLIF(pg_catalog.btrim(product_fact.product_name),'') IS NULL
       OR manufacturer_label IS NULL OR base_uom IS NULL OR source_hsn IS NULL
       OR source_hsn !~ '^[0-9]{4,8}$' OR source_gst IS NULL OR source_gst<0
       OR opening_date IS NULL
       OR COALESCE(product_fact.payload->>'product_kind','medicine')<>'medicine'
       OR COALESCE((product_fact.payload->>'hsn_gst_candidate_unique')::boolean,false) IS DISTINCT FROM true
       OR (raw_quantity>0 AND COALESCE(product_fact.payload->>'batch_reconciliation_status','')<>'exact') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reviewed historical product fact is incomplete or ambiguous';
    END IF;
    PERFORM 1 FROM catalog.units_of_measure unit
     WHERE unit.code=base_uom AND unit.status='active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='historical product base UOM is unavailable';
    END IF;
    SELECT count(*),(min(party.id::text))::uuid
      INTO matching_count,manufacturer_identifier
      FROM catalog.manufacturers manufacturer JOIN parties.parties party
        ON party.org_id=manufacturer.org_id AND party.id=manufacturer.party_id
     WHERE manufacturer.org_id=organization_id AND manufacturer.status='active'
       AND party.status='active'
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
           pg_catalog.lower(manufacturer_label);
    IF matching_count>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical manufacturer label is ambiguous';
    ELSIF matching_count=0 THEN
      SELECT * INTO STRICT created_manufacturer
        FROM erp_master_commands.create_product_manufacturer(
          organization_id,manufacturer_label,
          extensions.digest(pg_catalog.convert_to(
            reviewed_dataset_id||':manufacturer:'||pg_catalog.lower(manufacturer_label),'UTF8'
          ),'sha256'),command_time+interval '1 hour'
        );
      manufacturer_identifier:=created_manufacturer.manufacturer_party_id;
    END IF;
    IF product_fact.product_id IS NOT NULL THEN
      SELECT product.id INTO product_identifier
        FROM catalog.products product
       WHERE product.org_id=organization_id
         AND product.id=product_fact.product_id
         AND product.status='draft'
         AND pg_catalog.lower(pg_catalog.btrim(product.name))=
             pg_catalog.lower(pg_catalog.btrim(product_fact.product_name))
       FOR UPDATE;
      IF product_identifier IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514',
          MESSAGE='reviewed historical product does not identify its existing draft';
      END IF;
    ELSE
      SELECT count(*),(min(product.id::text))::uuid
        INTO matching_product_count,product_identifier
        FROM catalog.products product
       WHERE product.org_id=organization_id AND product.status='draft'
         AND pg_catalog.lower(pg_catalog.btrim(product.name))=
             pg_catalog.lower(pg_catalog.btrim(product_fact.product_name));
      IF matching_product_count>1 THEN
        RAISE EXCEPTION USING ERRCODE='23514',
          MESSAGE='reviewed historical product name matches multiple drafts';
      ELSIF matching_product_count=0 THEN
        SELECT * INTO STRICT created_product
          FROM erp_master_commands.create_product_draft(
            organization_id,product_fact.product_name,NULL,'medicine',
            extensions.digest(pg_catalog.convert_to(
              reviewed_dataset_id||':product:'||source_code,'UTF8'
            ),'sha256'),command_time+interval '1 hour'
          );
        product_identifier:=created_product.product_id;
      END IF;
    END IF;
    IF EXISTS (
      SELECT 1 FROM automation.historical_product_bindings binding
       WHERE binding.org_id=organization_id AND binding.product_id=product_identifier
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23505',
        MESSAGE='historical product draft is already bound to another source fact';
    END IF;
    tax_version_identifier:=erp_automation_commands.install_source_product_tax(
      organization_id,reviewed_dataset_id,product_fact.id,product_identifier);
    SELECT release_id INTO STRICT tax_release_identifier FROM tax.tax_code_versions
      WHERE id=tax_version_identifier;
    identity_conversion_id:=pg_catalog.gen_random_uuid();
    INSERT INTO catalog.uom_conversions(
      org_id,id,product_id,from_uom_code,to_uom_code,multiplier,valid_from,status,
      created_by_membership_id
    ) VALUES (
      organization_id,identity_conversion_id,product_identifier,base_uom,base_uom,1,
      opening_date,'active',actor_id
    );
    INSERT INTO erp_regulatory_commands.command_scopes VALUES (
      pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'product_activation',
      product_identifier
    );
    UPDATE catalog.products product SET
      manufacturer_party_id=manufacturer_identifier,base_uom_code=base_uom,
      hsn_code=source_hsn,hsn_release_id=tax_release_identifier,
      setup_review_required=true,status='active',updated_at=command_time,
      updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE product.org_id=organization_id AND product.id=product_identifier
       AND product.status='draft';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='historical product draft changed before binding';
    END IF;
    INSERT INTO automation.historical_product_bindings(
      org_id,dataset_id,source_product_code,source_fact_id,product_id,
      manufacturer_label,hsn_code,gst_rate,raw_quantity,derived_quantity,
      raw_inventory_value,derived_inventory_value,setup_review_required,
      created_by_membership_id
    ) VALUES (
      organization_id,reviewed_dataset_id,source_code,product_fact.id,product_identifier,
      manufacturer_label,source_hsn,source_gst,raw_quantity,derived_quantity,
      raw_value,derived_value,true,actor_id
    );
    IF NOT EXISTS (
      SELECT 1 FROM automation.historical_product_bindings binding
       WHERE binding.org_id=organization_id AND binding.product_id=product_identifier
         AND binding.source_fact_id=product_fact.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='historical product activation lacks immutable source binding';
    END IF;
    DELETE FROM erp_regulatory_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='product_activation' AND scope.target_id=product_identifier;
    product_created:=product_created+1;
    IF derived_quantity=0 THEN
      IF EXISTS (
        SELECT 1 FROM automation.historical_migration_facts fact
         WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
           AND fact.source_kind='batch' AND fact.product_code=source_code
           AND fact.selection_state='reviewed' AND COALESCE(fact.quantity,0)>0
      ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='zero opening product owns reviewed positive batches'; END IF;
      IF raw_quantity<0 THEN zero_clamped:=zero_clamped+1; END IF;
      CONTINUE;
    END IF;
    IF derived_value<=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='positive historical stock requires positive exact value';
    END IF;
    SELECT count(*),COALESCE(sum(fact.quantity),0),COALESCE(sum(fact.inventory_value),0)
      INTO batch_count,batch_quantity,batch_value
      FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
       AND fact.source_kind='batch' AND fact.product_code=source_code
       AND fact.selection_state='reviewed';
    IF batch_count=0 OR batch_quantity IS DISTINCT FROM derived_quantity
       OR batch_value IS DISTINCT FROM derived_value THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical batch quantity or value does not reconcile exact product opening';
    END IF;
    IF EXISTS (
      SELECT 1 FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='batch' AND fact.product_code=source_code
         AND fact.selection_state='reviewed'
         AND (COALESCE(fact.quantity,0)<=0 OR COALESCE(fact.inventory_value,0)<=0
           OR fact.event_date IS NULL OR fact.event_date<=opening_date
           OR NULLIF(pg_catalog.btrim(fact.batch_number),'') IS NULL
           OR NULLIF(fact.payload->>'mrp','')::numeric<=0
           OR NULLIF(fact.payload->>'unit_cost','')::numeric<0
           OR fact.payload->>'base_uom_code' IS DISTINCT FROM base_uom
           OR fact.payload->>'mrp_uom_code' IS DISTINCT FROM base_uom
           OR NULLIF(fact.payload->>'mrp_uom_multiplier','')::numeric IS DISTINCT FROM 1
           OR pg_catalog.round(fact.quantity*NULLIF(fact.payload->>'unit_cost','')::numeric,2)
                IS DISTINCT FROM fact.inventory_value)
    ) OR EXISTS (
      SELECT 1 FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='batch' AND fact.product_code=source_code
         AND fact.selection_state='reviewed'
       GROUP BY pg_catalog.lower(pg_catalog.btrim(fact.batch_number))
      HAVING count(DISTINCT ROW(fact.event_date,fact.payload->>'mrp',
        fact.payload->>'base_uom_code',fact.payload->>'mrp_uom_code',
        fact.payload->>'mrp_uom_multiplier'))<>1
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='historical batch is expired, incomplete, negative, or conflicting';
    END IF;
    document_identifier:=pg_catalog.gen_random_uuid();
    journal_identifier:=pg_catalog.gen_random_uuid();
    event_identifier:=pg_catalog.gen_random_uuid();
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',opening_date)>=4
      THEN pg_catalog.date_part('year',opening_date)::integer
      ELSE pg_catalog.date_part('year',opening_date)::integer-1 END;
    INSERT INTO inventory.inventory_documents(
      org_id,id,branch_id,physical_movement_required,document_type,document_number,
      fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
      total_abs_base_quantity,total_value,approved_at,approved_by_membership_id,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,document_identifier,branch_identifier,false,'opening_receipt',
      pg_catalog.left('MIG-OPEN-'||pg_catalog.replace(product_fact.id::text,'-',''),64),
      fiscal_year,opening_date,'approved','historical_marg_opening','INR',
      'moving_weighted_average',derived_quantity,derived_value,command_time,actor_id,
      actor_id,actor_id
    );
    line_number:=0;
    FOR batch_fact IN
      SELECT fact.* FROM automation.historical_migration_facts fact
       WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
         AND fact.source_kind='batch' AND fact.product_code=source_code
         AND fact.selection_state='reviewed'
       ORDER BY pg_catalog.lower(pg_catalog.btrim(fact.batch_number)),fact.id
    LOOP
      SELECT binding.batch_id INTO batch_identifier
        FROM automation.historical_batch_bindings binding
        JOIN automation.historical_migration_facts prior
          ON prior.org_id=binding.org_id AND prior.id=binding.source_batch_fact_id
       WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
         AND binding.source_product_code=source_code
         AND pg_catalog.lower(pg_catalog.btrim(prior.batch_number))=
             pg_catalog.lower(pg_catalog.btrim(batch_fact.batch_number))
       LIMIT 1;
      IF batch_identifier IS NULL THEN
        batch_identifier:=pg_catalog.gen_random_uuid();
        INSERT INTO inventory.batches(
          org_id,id,product_id,batch_number,lot_kind,manufactured_on,expires_on,mrp,
          mrp_uom_conversion_id,status,released_at,released_by_membership_id,
          created_by_membership_id,updated_by_membership_id
        ) VALUES (
          organization_id,batch_identifier,product_identifier,
          pg_catalog.btrim(batch_fact.batch_number),'manufacturer_batch',
          NULLIF(batch_fact.payload->>'manufactured_on','')::date,batch_fact.event_date,
          (batch_fact.payload->>'mrp')::numeric,identity_conversion_id,'quarantined',NULL,
          NULL,actor_id,actor_id
        );
      END IF;
      line_number:=line_number+1;
      line_identifier:=pg_catalog.gen_random_uuid();
      INSERT INTO inventory.inventory_document_lines(
        org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
        uom_code,entered_quantity,base_quantity,to_location_id,unit_cost,extended_cost,
        created_by_membership_id
      ) VALUES (
        organization_id,line_identifier,document_identifier,line_number,'receipt',
        product_identifier,batch_identifier,base_uom,batch_fact.quantity,batch_fact.quantity,
        opening_location_id,(batch_fact.payload->>'unit_cost')::numeric,
        batch_fact.inventory_value,actor_id
      );
      INSERT INTO automation.historical_batch_bindings(
        org_id,dataset_id,source_batch_fact_id,source_product_code,batch_id,
        inventory_document_line_id,created_by_membership_id
      ) VALUES (
        organization_id,reviewed_dataset_id,batch_fact.id,source_code,batch_identifier,
        line_identifier,actor_id
      );
      batches_bound:=batches_bound+1;
    END LOOP;
    PERFORM erp_trade_commands.post_locked_document(
      organization_id,document_identifier,actor_id
    );
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    INSERT INTO erp_trade_commands.command_scopes(
      backend_pid,transaction_id,scope,org_id,entity_id
    ) SELECT pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),
      'goods_receipt_batch_release',binding.org_id,binding.batch_id
      FROM automation.historical_batch_bindings binding
     WHERE binding.org_id=organization_id AND binding.dataset_id=reviewed_dataset_id
       AND binding.source_product_code=source_code
    ON CONFLICT DO NOTHING;
    UPDATE inventory.batches batch SET
      status='released',released_at=command_time,released_by_membership_id=actor_id,
      updated_at=command_time,updated_by_membership_id=actor_id,
      row_version=batch.row_version+1
      FROM erp_trade_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='goods_receipt_batch_release'
       AND scope.org_id=organization_id
       AND batch.org_id=scope.org_id AND batch.id=scope.entity_id
       AND batch.status='quarantined';
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    DELETE FROM erp_trade_commands.command_scopes scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='goods_receipt_batch_release'
       AND scope.org_id=organization_id;
    INSERT INTO finance.journal_entries(
      org_id,id,journal_number,posting_date,description,transaction_currency,
      functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,
      functional_debit_total,functional_credit_total,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,journal_identifier,
      pg_catalog.left('MIG-INV-'||pg_catalog.replace(product_fact.id::text,'-',''),64),
      opening_date,'Historical MARG opening inventory '||source_code,'INR','INR',1,
      derived_value,derived_value,derived_value,derived_value,'draft',actor_id,actor_id
    );
    INSERT INTO finance.journal_lines(
      org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
      transaction_debit,transaction_credit,functional_debit,functional_credit,
      created_by_membership_id
    ) VALUES
    (organization_id,pg_catalog.gen_random_uuid(),journal_identifier,1,inventory_account_id,
      branch_identifier,'Historical opening inventory '||source_code,
      derived_value,0,derived_value,0,actor_id),
    (organization_id,pg_catalog.gen_random_uuid(),journal_identifier,2,equity_account_id,
      branch_identifier,'Historical opening inventory offset '||source_code,
      0,derived_value,0,derived_value,actor_id);
    SET CONSTRAINTS ALL IMMEDIATE;
    SET CONSTRAINTS ALL DEFERRED;
    UPDATE finance.journal_entries SET status='posted',posted_at=command_time,
      posted_by_membership_id=actor_id,updated_at=command_time,
      updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_identifier AND status='draft';
    INSERT INTO finance.accounting_events(
      org_id,id,event_type,inventory_document_id,journal_entry_id,occurred_at,
      source_posted_at,created_by_membership_id
    ) SELECT organization_id,event_identifier,'inventory_valuation',document_identifier,
      journal_identifier,command_time,document.posted_at,actor_id
      FROM inventory.inventory_documents document
     WHERE document.org_id=organization_id AND document.id=document_identifier
       AND document.status='posted';
    INSERT INTO automation.historical_inventory_openings(
      org_id,dataset_id,source_product_fact_id,product_id,branch_id,location_id,
      inventory_document_id,journal_entry_id,accounting_event_id,quantity,
      inventory_value,created_by_membership_id
    ) VALUES (
      organization_id,reviewed_dataset_id,product_fact.id,product_identifier,
      branch_identifier,opening_location_id,document_identifier,journal_identifier,
      event_identifier,derived_quantity,derived_value,actor_id
    );
    openings_posted:=openings_posted+1;
  END LOOP;
  SELECT count(*) INTO products_remaining
    FROM automation.historical_migration_facts fact
    LEFT JOIN automation.historical_product_bindings binding
      ON binding.org_id=fact.org_id AND binding.source_fact_id=fact.id
   WHERE fact.org_id=organization_id AND fact.dataset_id=reviewed_dataset_id
     AND fact.source_kind='product' AND fact.selection_state='reviewed'
     AND binding.source_fact_id IS NULL;
  SET CONSTRAINTS ALL IMMEDIATE;
  RETURN pg_catalog.jsonb_build_object(
    'products_created',product_created,'products_replayed',replayed,
    'products_remaining',products_remaining,'negative_products_clamped',zero_clamped,
    'batches_bound',batches_bound,'openings_posted',openings_posted,
    'complete',products_remaining=0
  );
END
$function$;
