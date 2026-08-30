SET LOCAL ROLE erp_migration_owner;

CREATE TABLE automation.historical_migration_facts (
  org_id uuid NOT NULL,
  id uuid NOT NULL,
  dataset_id varchar(128) NOT NULL,
  source_kind varchar(32) NOT NULL,
  record_key varchar(256) NOT NULL,
  branch_id uuid NOT NULL,
  event_date date,
  party_key varchar(128),
  party_name text,
  product_id uuid,
  product_code varchar(128),
  product_name text,
  batch_number varchar(128),
  quantity numeric(20,6),
  taxable_amount numeric(20,2),
  tax_amount numeric(20,2),
  total_amount numeric(20,2),
  outstanding_amount numeric(20,2),
  inventory_value numeric(20,2),
  side varchar(16),
  selection_state varchar(64) NOT NULL,
  payload jsonb NOT NULL,
  row_sha256 bytea NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  imported_by_membership_id uuid NOT NULL,
  CONSTRAINT historical_migration_facts_pk PRIMARY KEY (org_id,id),
  CONSTRAINT historical_migration_facts_identity_uq
    UNIQUE (org_id,dataset_id,source_kind,record_key),
  CONSTRAINT historical_migration_facts_kind_ck CHECK (source_kind IN (
    'product','batch','party','sales_invoice','sales_invoice_line',
    'purchase_invoice','sales_return','purchase_return','opening_item'
  )),
  CONSTRAINT historical_migration_facts_side_ck CHECK (
    side IS NULL OR side IN ('receivable','payable')
  ),
  CONSTRAINT historical_migration_facts_payload_ck CHECK (
    pg_catalog.jsonb_typeof(payload)='object'
    AND pg_catalog.octet_length(pg_catalog.convert_to(payload::text,'UTF8'))
        BETWEEN 2 AND 131072
    AND pg_catalog.octet_length(row_sha256)=32
  ),
  CONSTRAINT historical_migration_facts_org_fk FOREIGN KEY (org_id)
    REFERENCES core.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT historical_migration_facts_branch_fk FOREIGN KEY (org_id,branch_id)
    REFERENCES core.branches(org_id,id),
  CONSTRAINT historical_migration_facts_product_fk FOREIGN KEY (org_id,product_id)
    REFERENCES catalog.products(org_id,id),
  CONSTRAINT historical_migration_facts_importer_fk FOREIGN KEY (
    org_id,imported_by_membership_id
  ) REFERENCES core.memberships(org_id,id)
);

CREATE INDEX historical_migration_facts_kind_date_idx
  ON automation.historical_migration_facts(org_id,source_kind,event_date,id);
CREATE INDEX historical_migration_facts_product_idx
  ON automation.historical_migration_facts(org_id,product_id,event_date,id)
  WHERE product_id IS NOT NULL;
CREATE INDEX historical_migration_facts_party_idx
  ON automation.historical_migration_facts(org_id,party_key,event_date,id)
  WHERE party_key IS NOT NULL;
CREATE INDEX historical_migration_facts_selection_idx
  ON automation.historical_migration_facts(org_id,selection_state,source_kind,id);

ALTER TABLE automation.historical_migration_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation.historical_migration_facts FORCE ROW LEVEL SECURITY;
CREATE POLICY historical_migration_facts_owner_scope
  ON automation.historical_migration_facts
  TO erp_migration_owner
  USING (
    org_id=erp_security.current_org_id()
    AND erp_security.current_actor_is_active()
    AND erp_security.can_access_branch(branch_id)
  )
  WITH CHECK (
    org_id=erp_security.current_org_id()
    AND erp_security.current_actor_is_active()
    AND erp_security.can_access_branch(branch_id)
  );

CREATE TRIGGER historical_migration_facts_audit
AFTER INSERT OR UPDATE OR DELETE ON automation.historical_migration_facts
FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();

CREATE FUNCTION erp_automation_commands.import_historical_migration_facts(
  organization_id uuid,
  facts jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; item jsonb; existing automation.historical_migration_facts%ROWTYPE;
        inserted_count integer:=0; replayed_count integer:=0; item_hash bytea;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.organization.manage',NULL::uuid
  );
  IF pg_catalog.jsonb_typeof(facts)<>'array'
     OR pg_catalog.jsonb_array_length(facts) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='historical migration import requires 1 to 500 facts';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(facts) LOOP
    IF item->>'source_kind' NOT IN (
         'product','batch','party','sales_invoice','sales_invoice_line',
         'purchase_invoice','sales_return','purchase_return','opening_item'
       )
       OR NULLIF(pg_catalog.btrim(item->>'dataset_id'),'') IS NULL
       OR NULLIF(pg_catalog.btrim(item->>'record_key'),'') IS NULL
       OR NULLIF(pg_catalog.btrim(item->>'selection_state'),'') IS NULL
       OR pg_catalog.jsonb_typeof(item->'payload')<>'object'
       OR pg_catalog.octet_length(pg_catalog.convert_to((item->'payload')::text,'UTF8'))
            NOT BETWEEN 2 AND 131072
       OR COALESCE(item->>'row_sha256','') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='historical migration fact is invalid';
    END IF;
    item_hash:=pg_catalog.decode(item->>'row_sha256','hex');
    SELECT * INTO existing
      FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id
       AND fact.dataset_id=item->>'dataset_id'
       AND fact.source_kind=item->>'source_kind'
       AND fact.record_key=item->>'record_key';
    IF FOUND THEN
      IF existing.id<>(item->>'id')::uuid
         OR existing.row_sha256 IS DISTINCT FROM item_hash THEN
        RAISE EXCEPTION USING ERRCODE='23505',
          MESSAGE='historical migration fact differs from its imported identity';
      END IF;
      replayed_count:=replayed_count+1;
      CONTINUE;
    END IF;
    INSERT INTO automation.historical_migration_facts(
      org_id,id,dataset_id,source_kind,record_key,branch_id,event_date,
      party_key,party_name,product_id,product_code,product_name,batch_number,
      quantity,taxable_amount,tax_amount,total_amount,outstanding_amount,
      inventory_value,side,selection_state,payload,row_sha256,
      imported_by_membership_id
    ) VALUES (
      organization_id,(item->>'id')::uuid,item->>'dataset_id',
      item->>'source_kind',item->>'record_key',(item->>'branch_id')::uuid,
      NULLIF(item->>'event_date','')::date,NULLIF(item->>'party_key',''),
      NULLIF(item->>'party_name',''),NULLIF(item->>'product_id','')::uuid,
      NULLIF(item->>'product_code',''),NULLIF(item->>'product_name',''),
      NULLIF(item->>'batch_number',''),NULLIF(item->>'quantity','')::numeric,
      NULLIF(item->>'taxable_amount','')::numeric,
      NULLIF(item->>'tax_amount','')::numeric,
      NULLIF(item->>'total_amount','')::numeric,
      NULLIF(item->>'outstanding_amount','')::numeric,
      NULLIF(item->>'inventory_value','')::numeric,NULLIF(item->>'side',''),
      item->>'selection_state',item->'payload',item_hash,actor_id
    );
    inserted_count:=inserted_count+1;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'inserted',inserted_count,'replayed',replayed_count,
    'accepted',inserted_count+replayed_count
  );
END
$function$;

CREATE FUNCTION erp_automation_reads.historical_migration_insights(
  organization_id uuid,
  branch_ids_filter uuid[],
  date_from_filter date,
  date_to_filter date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE result jsonb;
BEGIN
  -- The API route enforces the signed finance/report capability.  The
  -- security-definer boundary still requires an active tenant context and
  -- applies branch visibility below; no direct table privilege is granted.
  PERFORM erp_core_commands.assert_context(
    organization_id,NULL,NULL::uuid
  );
  IF date_from_filter IS NOT NULL AND date_to_filter IS NOT NULL
     AND date_to_filter<date_from_filter THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid insight period';
  END IF;
  WITH visible AS (
    SELECT * FROM automation.historical_migration_facts fact
     WHERE fact.org_id=organization_id
       AND (branch_ids_filter IS NULL OR fact.branch_id=ANY(branch_ids_filter))
       AND fact.selection_state NOT IN ('quarantined','archive-only')
       AND (date_from_filter IS NULL OR fact.event_date IS NULL
            OR fact.event_date>=date_from_filter)
       AND (date_to_filter IS NULL OR fact.event_date IS NULL
            OR fact.event_date<=date_to_filter)
  ), kinds AS (
    SELECT source_kind,count(*)::integer AS count FROM visible GROUP BY source_kind
  ), sales AS (
    SELECT count(*)::integer AS invoice_count,
           COALESCE(sum(taxable_amount),0)::numeric(20,2) AS taxable,
           COALESCE(sum(tax_amount),0)::numeric(20,2) AS tax,
           COALESCE(sum(total_amount),0)::numeric(20,2) AS total
      FROM visible WHERE source_kind='sales_invoice'
  ), purchases AS (
    SELECT count(*)::integer AS invoice_count,
           COALESCE(sum(taxable_amount),0)::numeric(20,2) AS taxable,
           COALESCE(sum(tax_amount),0)::numeric(20,2) AS tax,
           COALESCE(sum(total_amount),0)::numeric(20,2) AS total
      FROM visible WHERE source_kind='purchase_invoice'
  ), returns AS (
    SELECT count(*) FILTER (WHERE source_kind='sales_return')::integer AS sales_count,
           count(*) FILTER (WHERE source_kind='purchase_return')::integer AS purchase_count,
           COALESCE(sum(total_amount) FILTER (WHERE source_kind='sales_return'),0)::numeric(20,2)
             AS sales_total,
           COALESCE(sum(total_amount) FILTER (WHERE source_kind='purchase_return'),0)::numeric(20,2)
             AS purchase_total
      FROM visible WHERE source_kind IN ('sales_return','purchase_return')
  ), outstanding AS (
    SELECT COALESCE(sum(outstanding_amount) FILTER (WHERE side='receivable'),0)::numeric(20,2)
             AS receivable,
           COALESCE(sum(outstanding_amount) FILTER (WHERE side='payable'),0)::numeric(20,2)
             AS payable,
           COALESCE(sum(outstanding_amount) FILTER (
             WHERE side='receivable' AND event_date<erp_core_commands.current_organization_business_date()
           ),0)::numeric(20,2) AS overdue_receivable,
           count(*)::integer AS item_count
      FROM visible WHERE source_kind='opening_item'
  ), inventory AS (
    SELECT count(*)::integer AS batch_count,
           COALESCE(sum(quantity),0)::numeric(20,6) AS quantity,
           COALESCE(sum(inventory_value),0)::numeric(20,2) AS value,
           count(*) FILTER (
             WHERE event_date<=erp_core_commands.current_organization_business_date()+90
           )::integer AS near_expiry_batches,
           COALESCE(sum(inventory_value) FILTER (
             WHERE event_date<=erp_core_commands.current_organization_business_date()+90
           ),0)::numeric(20,2) AS near_expiry_value
      FROM visible WHERE source_kind='batch'
  ), monthly AS (
    SELECT date_trunc('month',event_date)::date AS month,
           count(*)::integer AS invoices,
           sum(total_amount)::numeric(20,2) AS total
      FROM visible
     WHERE source_kind='sales_invoice' AND event_date IS NOT NULL
     GROUP BY date_trunc('month',event_date)
     ORDER BY month
  ), top_products AS (
    SELECT COALESCE(product_name,product_code,'Unresolved product') AS name,
           sum(COALESCE(quantity,0))::numeric(20,6) AS quantity,
           sum(COALESCE(total_amount,0))::numeric(20,2) AS total
      FROM visible WHERE source_kind='sales_invoice_line'
     GROUP BY COALESCE(product_name,product_code,'Unresolved product')
     ORDER BY total DESC,name LIMIT 10
  ), top_customers AS (
    SELECT COALESCE(party_name,party_key,'Unresolved customer') AS name,
           count(*)::integer AS invoices,
           sum(COALESCE(total_amount,0))::numeric(20,2) AS total
      FROM visible WHERE source_kind='sales_invoice'
     GROUP BY COALESCE(party_name,party_key,'Unresolved customer')
     ORDER BY total DESC,name LIMIT 10
  )
  SELECT pg_catalog.jsonb_build_object(
    'contract_version','1.0.0','definition_version','historical-observed-v1',
    'currency_code','INR','date_from',date_from_filter,'date_to',date_to_filter,
    'coverage',COALESCE((SELECT jsonb_object_agg(source_kind,count) FROM kinds),'{}'::jsonb),
    'sales',(SELECT jsonb_build_object(
      'invoice_count',invoice_count,'taxable',taxable::text,
      'tax',tax::text,'total',total::text
    ) FROM sales),
    'purchases',(SELECT jsonb_build_object(
      'invoice_count',invoice_count,'taxable',taxable::text,
      'tax',tax::text,'total',total::text
    ) FROM purchases),
    'returns',(SELECT jsonb_build_object(
      'sales_count',sales_count,'purchase_count',purchase_count,
      'sales_total',sales_total::text,'purchase_total',purchase_total::text
    ) FROM returns),
    'outstanding',(SELECT jsonb_build_object(
      'receivable',receivable::text,'payable',payable::text,
      'overdue_receivable',overdue_receivable::text,'item_count',item_count
    ) FROM outstanding),
    'inventory',(SELECT jsonb_build_object(
      'batch_count',batch_count,'quantity',quantity::text,'value',value::text,
      'near_expiry_batches',near_expiry_batches,
      'near_expiry_value',near_expiry_value::text
    ) FROM inventory),
    'monthly_sales',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'month',month,'invoices',invoices,'total',total::text
    ) ORDER BY month) FROM monthly),'[]'::jsonb),
    'top_products',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name',name,'quantity',quantity::text,'total',total::text
    )) FROM top_products),'[]'::jsonb),
    'top_customers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'name',name,'invoices',invoices,'total',total::text
    )) FROM top_customers),'[]'::jsonb),
    'limitations',jsonb_build_array(
      'Historical migration facts are non-posting and do not alter canonical ledgers or stock.',
      'Profit and margin are unavailable until purchase-line cost mapping is complete.',
      'Staged batch quantities are migration evidence, not saleable stock until product review and opening-stock posting.'
    )
  ) INTO result;
  RETURN result;
END
$function$;

ALTER FUNCTION erp_automation_commands.import_historical_migration_facts(uuid,jsonb)
  OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.historical_migration_insights(uuid,uuid[],date,date)
  OWNER TO erp_migration_owner;

REVOKE ALL ON TABLE automation.historical_migration_facts
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_commands.import_historical_migration_facts(uuid,jsonb)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
REVOKE ALL ON FUNCTION erp_automation_reads.historical_migration_insights(uuid,uuid[],date,date)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_commands.import_historical_migration_facts(uuid,jsonb)
  TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.historical_migration_insights(uuid,uuid[],date,date)
  TO erp_runtime;

RESET ROLE;
