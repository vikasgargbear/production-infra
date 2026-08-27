SET LOCAL ROLE erp_migration_owner;

ALTER TABLE finance.allocations
  ADD COLUMN source_open_item_id uuid;

ALTER TABLE finance.allocations
  ADD CONSTRAINT allocations_source_open_item_fk
  FOREIGN KEY (org_id, source_open_item_id)
  REFERENCES finance.open_items (org_id, id) ON DELETE RESTRICT;

ALTER TABLE finance.allocations
  DROP CONSTRAINT allocations_exact_source_ck;

ALTER TABLE finance.allocations
  ADD CONSTRAINT allocations_exact_source_ck CHECK (
    num_nonnulls(payment_id, withholding_id, adjustment_note_id,
      purchase_order_advance_allocation_id, source_open_item_id) = 1
  );

CREATE INDEX allocations_source_open_item_idx
  ON finance.allocations (org_id, source_open_item_id, allocation_date, id)
  WHERE source_open_item_id IS NOT NULL;

CREATE OR REPLACE FUNCTION "erp_automation_commands"."assert_inventory_adjustment_draft"(organization_id uuid, inventory_document_id uuid, journal_id uuid, resolved_document jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE document inventory.inventory_documents%ROWTYPE; journal finance.journal_entries%ROWTYPE;
BEGIN
  SELECT * INTO STRICT document FROM inventory.inventory_documents WHERE org_id=organization_id AND id=inventory_document_id FOR SHARE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR SHARE;
  IF ROW(document.branch_id,document.document_type,document.document_date,document.status,document.reason_code,
         document.currency_code,document.costing_method_snapshot,document.total_abs_base_quantity,document.total_value,
         document.physical_movement_required,document.destination_branch_id,document.reverses_document_id)
     IS DISTINCT FROM ROW((resolved_document->>'branch_id')::uuid,'stock_count',(resolved_document->>'adjustment_date')::date,
         'submitted','cycle_count','INR'::bpchar,'moving_weighted_average',
         (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric,false,NULL::uuid,NULL::uuid)
     OR (SELECT count(*) FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id)<>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR EXISTS(SELECT 1 FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id AND NOT EXISTS(
            SELECT 1 FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') expected(value)
             WHERE (expected.value->>'inventory_document_line_id')::uuid=line.id
               AND (expected.value->>'line_number')::integer=line.line_number AND line.movement_kind='count_adjustment'
               AND (expected.value->>'product_id')::uuid=line.product_id AND (expected.value->>'batch_id')::uuid=line.batch_id
               AND expected.value->>'uom_code'=line.uom_code
               AND pg_catalog.abs((expected.value->>'variance_base_quantity')::numeric)=line.entered_quantity
               AND pg_catalog.abs((expected.value->>'variance_base_quantity')::numeric)=line.base_quantity
               AND (resolved_document->>'location_id')::uuid=line.from_location_id AND line.to_location_id IS NULL
               AND (expected.value->>'system_base_quantity')::numeric=line.system_quantity
               AND (expected.value->>'counted_base_quantity')::numeric=line.counted_quantity
               AND (expected.value->>'variance_base_quantity')::numeric=line.variance_quantity
               AND (expected.value->>'unit_cost')::numeric=line.unit_cost
               AND (expected.value->>'extended_cost')::numeric=line.extended_cost)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared cycle-count inventory draft differs from approved preview'; END IF;
  IF ROW(journal.posting_date,journal.status,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,journal.functional_credit_total)
     IS DISTINCT FROM ROW((resolved_document->>'adjustment_date')::date,'draft','INR'::bpchar,'INR'::bpchar,1::numeric,
       (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
       (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric)
     OR (SELECT count(*) FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id)<>2
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
       AND line.line_number=1 AND line.account_id=CASE resolved_document->>'variance_effect'
         WHEN 'gain' THEN (resolved_document->>'inventory_asset_account_id')::uuid
         ELSE (resolved_document->>'inventory_variance_account_id')::uuid END
       AND line.branch_id=(resolved_document->>'branch_id')::uuid AND line.party_id IS NULL
       AND line.transaction_debit=(resolved_document->>'total_value')::numeric AND line.transaction_credit=0
       AND line.functional_debit=(resolved_document->>'total_value')::numeric AND line.functional_credit=0)
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
       AND line.line_number=2 AND line.account_id=CASE resolved_document->>'variance_effect'
         WHEN 'gain' THEN (resolved_document->>'inventory_variance_account_id')::uuid
         ELSE (resolved_document->>'inventory_asset_account_id')::uuid END
       AND line.branch_id=(resolved_document->>'branch_id')::uuid AND line.party_id IS NULL
       AND line.transaction_debit=0 AND line.transaction_credit=(resolved_document->>'total_value')::numeric
       AND line.functional_debit=0 AND line.functional_credit=(resolved_document->>'total_value')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared cycle-count valuation journal differs from approved preview'; END IF;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."assert_inventory_adjustment_draft"(organization_id uuid, inventory_document_id uuid, journal_id uuid, resolved_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."assert_inventory_adjustment_draft"(organization_id uuid, inventory_document_id uuid, journal_id uuid, resolved_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        adjustment_date date:=NULLIF(request_document->>'adjustment_date','')::date;
        counted_at timestamptz:=NULLIF(request_document->>'counted_at','')::timestamptz;
        counted_by uuid:=NULLIF(request_document->>'counted_by_membership_id','')::uuid;
        location_id uuid:=NULLIF(request_document->>'location_id','')::uuid;
        evidence_id uuid:=NULLIF(request_document->>'evidence_attachment_id','')::uuid;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        location inventory.locations%ROWTYPE; evidence core.attachments%ROWTYPE;
        product catalog.products%ROWTYPE; conversion catalog.uom_conversions%ROWTYPE;
        batch inventory.batches%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        last_ledger inventory.stock_ledger_entries%ROWTYPE;
        inventory_account finance.accounts%ROWTYPE; variance_account finance.accounts%ROWTYPE;
        requested_line jsonb; requested_count jsonb; resolved_lines jsonb:='[]'::jsonb;
        source_versions jsonb:='[]'::jsonb; counted_base numeric(20,6);
        variance_base numeric(20,6); extended_cost numeric(20,2);
        total_base numeric(20,6):=0; total_value numeric(20,2):=0;
        pending_count integer; recall_count integer; line_no integer:=0;
        medicine_count integer:=0; license_type_count integer; license_sources jsonb;
        conversion_version_hash text; variance_effect text; line_effect text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR inventory_document_id IS NULL OR branch_id IS NULL OR adjustment_date IS NULL
     OR counted_at IS NULL OR counted_by IS NULL OR location_id IS NULL OR evidence_id IS NULL
     OR request_document->>'reason_code'<>'cycle_count'
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cycle-count input is incomplete'; END IF;
  SELECT * INTO STRICT organization FROM core.organizations WHERE id=organization_id AND status='active'
    AND country_code='IN' AND base_currency='INR' FOR SHARE;
  IF adjustment_date IS DISTINCT FROM (counted_at AT TIME ZONE organization.timezone)::date
     OR adjustment_date IS DISTINCT FROM (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
     OR counted_at>pg_catalog.transaction_timestamp()
     OR counted_at<pg_catalog.transaction_timestamp()-interval '24 hours' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='cycle count must be recent, nonfuture, and posted on the organization business date'; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') item(value)
      WHERE pg_catalog.jsonb_typeof(item.value->'batch_counts')<>'array'
         OR pg_catalog.jsonb_array_length(item.value->'batch_counts') NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='every cycle-count product requires one or more exact lot counts'; END IF;
  IF (SELECT count(DISTINCT count_row.value->>'batch_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_counts') count_row(value))
     <> (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_counts') count_row(value)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='each manufacturer batch may appear only once in a cycle count'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='inventory.adjustment.prepare' AND capability.operation_mode='write'
     AND capability.risk_class='consequential_write' AND capability.approval_policy='separate_approver'
     AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cycle-count delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.adjustment.create',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cycle-count verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT location FROM inventory.locations AS candidate_location
   WHERE candidate_location.org_id=organization_id AND candidate_location.id=location_id
    AND candidate_location.branch_id=branch.id AND candidate_location.status='active'
    AND candidate_location.location_type='saleable' AND candidate_location.allows_sale
    AND NOT candidate_location.allows_negative_stock AND candidate_location.temperature_min_c IS NULL
    AND candidate_location.temperature_max_c IS NULL FOR SHARE;
  SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_id
    AND evidence_kind='inventory_cycle_count_sheet' AND status IN ('verified','retained')
    AND verified_at IS NOT NULL AND verified_at<=pg_catalog.transaction_timestamp()
    AND document_date=adjustment_date AND retention_until IS NOT NULL AND retention_until>=adjustment_date
    AND sha256 IS NOT NULL FOR SHARE;
  PERFORM 1 FROM core.memberships counter WHERE counter.org_id=organization_id AND counter.id=counted_by
    AND counter.status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='physical counter membership is inactive'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':inventory-cycle-count-evidence:'||evidence.id::text,727118));
  IF EXISTS(SELECT 1 FROM automation.command_requests prior
      WHERE prior.org_id=organization_id AND prior.capability_code='inventory.adjustment.prepare'
        AND prior.target_resource_id<>inventory_document_id AND prior.status NOT IN ('failed','expired','cancelled')
        AND pg_catalog.convert_from(prior.request_bytes,'UTF8')::jsonb->>'evidence_attachment_id'=evidence.id::text) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cycle-count sheet was already consumed by another command'; END IF;
  SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'inventory_asset','asset','INR',false)
    AND status='active' AND account_type='asset' AND currency_code='INR' AND NOT allows_party_posting FOR SHARE;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','id',location.id,'row_version',location.row_version),
    pg_catalog.jsonb_build_object('resource_type','physical_count_attachment','id',evidence.id,'status',evidence.status,
      'evidence_kind',evidence.evidence_kind,'document_date',evidence.document_date,'verified_at',evidence.verified_at,
      'retention_until',evidence.retention_until,'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','membership','role','physical_counter','id',counted_by),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version));
  PERFORM balance.batch_id FROM inventory.stock_balances balance
    JOIN (SELECT DISTINCT (count_row.value->>'batch_id')::uuid batch_id
      FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_counts') count_row(value)) requested
      ON requested.batch_id=balance.batch_id
   WHERE balance.org_id=organization_id AND balance.branch_id=branch.id AND balance.location_id=location.id
   ORDER BY balance.batch_id FOR UPDATE OF balance;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    IF NULLIF(requested_line->>'product_id','')::uuid IS NULL OR NULLIF(requested_line->>'uom_conversion_id','')::uuid IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cycle-count product and effective UOM conversion are required'; END IF;
    SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id
      AND id=(requested_line->>'product_id')::uuid AND status='active' AND cold_chain_required=false
      AND COALESCE(drug_schedule,'NONE') NOT IN ('H','H1','X') AND COALESCE(ndps_regulated,false)=false FOR SHARE;
    IF product.product_kind='medicine' THEN medicine_count:=medicine_count+1; END IF;
    SELECT * INTO STRICT conversion FROM catalog.uom_conversions WHERE org_id=organization_id
      AND id=(requested_line->>'uom_conversion_id')::uuid AND product_id=product.id AND status='active'
      AND from_uom_code<>to_uom_code AND to_uom_code=product.base_uom_code AND multiplier>0
      AND valid_from<=adjustment_date AND (valid_until IS NULL OR valid_until>=adjustment_date) FOR SHARE;
    conversion_version_hash:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.to_jsonb(conversion)::text,'UTF8'),'sha256'),'hex');
    FOR requested_count IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_counts') LOOP
      line_no:=line_no+1;
      IF NULLIF(requested_count->>'inventory_document_line_id','')::uuid IS NULL
         OR NULLIF(requested_count->>'batch_id','')::uuid IS NULL
         OR NULLIF(requested_count->>'stock_balance_row_version','')::bigint IS NULL
         OR NULLIF(requested_count->>'counted_quantity','')::numeric<0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cycle-count lot, expected stock version, and nonnegative count are required'; END IF;
      SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id
        AND id=(requested_count->>'batch_id')::uuid AND product_id=product.id AND lot_kind='manufacturer_batch'
        AND status='released' AND released_at IS NOT NULL AND released_at<=counted_at
        AND expires_on IS NOT NULL AND expires_on>adjustment_date AND mrp>0 AND mrp_uom_conversion_id IS NOT NULL FOR SHARE;
      SELECT count(*) INTO recall_count FROM compliance.recall_batches recall_batch
        JOIN compliance.recalls recall ON recall.org_id=recall_batch.org_id AND recall.id=recall_batch.recall_id
       WHERE recall_batch.org_id=organization_id AND recall_batch.batch_id=batch.id
         AND recall.status IN ('initiated','in_progress') AND recall_batch.status IN ('identified','quarantined');
      IF recall_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recalled lot cannot be cycle-counted into available stock'; END IF;
      SELECT * INTO STRICT balance FROM inventory.stock_balances AS stock_balance
       WHERE stock_balance.org_id=organization_id AND stock_balance.branch_id=branch.id
        AND stock_balance.location_id=location.id AND stock_balance.product_id=product.id
        AND stock_balance.batch_id=batch.id AND stock_balance.on_hand_quantity>0
        AND stock_balance.inventory_value>0 AND stock_balance.average_unit_cost>0
        AND stock_balance.row_version=(requested_count->>'stock_balance_row_version')::bigint FOR UPDATE;
      SELECT * INTO STRICT last_ledger FROM inventory.stock_ledger_entries AS ledger_entry
       WHERE ledger_entry.org_id=organization_id AND ledger_entry.id=balance.last_ledger_entry_id
        AND ledger_entry.branch_id=branch.id AND ledger_entry.location_id=location.id
        AND ledger_entry.product_id=product.id AND ledger_entry.batch_id=batch.id
        AND ledger_entry.posted_at<=counted_at FOR SHARE;
      SELECT count(*) INTO pending_count FROM inventory.inventory_document_lines pending_line
        JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id AND pending.id=pending_line.inventory_document_id
       WHERE pending_line.org_id=organization_id AND pending.id<>inventory_document_id
         AND pending.status IN ('draft','submitted','approved') AND pending_line.product_id=product.id
         AND pending_line.batch_id=batch.id AND location.id IN (pending_line.from_location_id,pending_line.to_location_id);
      IF pending_count<>0 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='cycle-count lot has a pending inventory source or movement document'; END IF;
      counted_base:=pg_catalog.round((requested_count->>'counted_quantity')::numeric*conversion.multiplier,6);
      variance_base:=counted_base-balance.on_hand_quantity;
      extended_cost:=CASE WHEN pg_catalog.abs(variance_base)=balance.on_hand_quantity
        THEN balance.inventory_value
        ELSE pg_catalog.round(pg_catalog.abs(variance_base)*balance.average_unit_cost,2) END;
      IF variance_base=0 OR extended_cost<=0 OR counted_base<0 THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='cycle count requires one nonzero valued variance'; END IF;
      line_effect:=CASE WHEN variance_base>0 THEN 'gain' ELSE 'loss' END;
      IF variance_effect IS NULL THEN variance_effect:=line_effect;
      ELSIF variance_effect<>line_effect THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='one cycle-count command cannot mix gain and loss variances'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',line_no,'inventory_document_line_id',requested_count->>'inventory_document_line_id',
        'product_id',product.id,'batch_id',batch.id,'uom_conversion_id',conversion.id,'uom_code',product.base_uom_code,
        'selected_uom_code',conversion.from_uom_code,'uom_multiplier',conversion.multiplier::text,
        'counted_quantity',(requested_count->>'counted_quantity'),'system_base_quantity',balance.on_hand_quantity::text,
        'counted_base_quantity',counted_base::text,'variance_base_quantity',variance_base::text,
        'unit_cost',balance.average_unit_cost::text,'extended_cost',extended_cost::text));
      total_base:=total_base+pg_catalog.abs(variance_base); total_value:=total_value+extended_cost;
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version,
          'drug_schedule',product.drug_schedule,'ndps_regulated',product.ndps_regulated,'cold_chain_required',product.cold_chain_required),
        pg_catalog.jsonb_build_object('resource_type','uom_conversion','id',conversion.id,'version_hash',conversion_version_hash,
          'from_uom_code',conversion.from_uom_code,'to_uom_code',conversion.to_uom_code,'multiplier',conversion.multiplier::text,
          'valid_from',conversion.valid_from,'valid_until',conversion.valid_until),
        pg_catalog.jsonb_build_object('resource_type','inventory_batch','id',batch.id,'row_version',batch.row_version,
          'status',batch.status,'expires_on',batch.expires_on,'mrp',batch.mrp::text,'mrp_uom_conversion_id',batch.mrp_uom_conversion_id),
        pg_catalog.jsonb_build_object('resource_type','stock_balance','branch_id',branch.id,
          'location_id',location.id,'product_id',product.id,'batch_id',batch.id,'row_version',balance.row_version,
          'on_hand_quantity',balance.on_hand_quantity::text,'inventory_value',balance.inventory_value::text,
          'average_unit_cost',balance.average_unit_cost::text,'last_ledger_entry_id',balance.last_ledger_entry_id,
          'last_ledger_posted_at',last_ledger.posted_at),
        pg_catalog.jsonb_build_object('resource_type','active_recall_state','batch_id',batch.id,'active_count',recall_count),
        pg_catalog.jsonb_build_object('resource_type','pending_inventory_document_state','batch_id',batch.id,'active_count',pending_count));
    END LOOP;
  END LOOP;
  SELECT * INTO STRICT variance_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,
      CASE variance_effect WHEN 'gain' THEN 'inventory_count_gain' ELSE 'inventory_count_loss' END,
      CASE variance_effect WHEN 'gain' THEN 'income' ELSE 'expense' END,'INR',false)
    AND status='active' AND account_type=CASE variance_effect WHEN 'gain' THEN 'income' ELSE 'expense' END
    AND currency_code='INR' AND NOT allows_party_posting FOR SHARE;
  source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'resource_type','finance_account','role',CASE variance_effect WHEN 'gain' THEN 'inventory_count_gain' ELSE 'inventory_count_loss' END,
    'id',variance_account.id,'row_version',variance_account.row_version));
  IF medicine_count>0 THEN
    SELECT count(DISTINCT license.license_type_code),
           pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'resource_type','counting_branch_wholesale_license','id',license.id,'row_version',license.row_version,
             'license_type_code',license.license_type_code,'evidence_attachment_id',license.evidence_attachment_id,
             'evidence_status',attachment.status,'evidence_sha256',pg_catalog.encode(attachment.sha256,'hex'),
             'next_verification_due_on',license.next_verification_due_on) ORDER BY license.license_type_code,license.id)
      INTO license_type_count,license_sources
      FROM compliance.licenses license JOIN core.attachments attachment
        ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
     WHERE license.org_id=organization_id AND license.branch_id=branch.id
       AND license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')
       AND license.status='active' AND license.valid_from<=adjustment_date
       AND (license.valid_until IS NULL OR license.valid_until>=adjustment_date)
       AND license.next_verification_due_on>=adjustment_date
       AND attachment.status IN ('verified','retained') AND attachment.verified_at IS NOT NULL
       AND attachment.verified_at<=pg_catalog.transaction_timestamp();
    IF license_type_count<>2 THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='counting branch lacks verified effective Forms 20B and 21B wholesale custody evidence'; END IF;
    source_versions:=source_versions||license_sources;
  END IF;
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'adjustment_date',adjustment_date,
    'counted_at',counted_at,'counted_by_membership_id',counted_by,'location_id',location.id,
    'evidence_attachment_id',evidence.id,'inventory_asset_account_id',inventory_account.id,
    'inventory_variance_account_id',variance_account.id,'variance_effect',variance_effect,'lines',resolved_lines,
    'total_base_quantity',total_base::text,'total_value',total_value::text,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','reason','cycle_count',
      'supported_effect','homogeneous_gain_or_loss','variance_effect',variance_effect,'valuation','current_moving_weighted_average',
      'tax_effect','no_supply_no_gst_no_itc_claim_or_reversal','physical_movement_required',false,
      'unsupported_fail_closed',pg_catalog.jsonb_build_array('zero_or_mixed_variance','backdated_count',
        'cold_chain_or_controlled_product','active_recall','pending_inventory_source','reversal')));
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, document_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
        resolved_document jsonb:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
        preview_document jsonb:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
        current_resolution jsonb; existing automation.command_requests%ROWTYPE;
        aggregate_hash bytea; document_sequence_id uuid; journal_sequence_id uuid;
        document_number text; journal_number text; fiscal_year integer; resolved_line jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR expires_at<=pg_catalog.transaction_timestamp()
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text
     OR request_document->>'event_id' IS DISTINCT FROM event_id::text THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cycle-count runtime persistence boundary is invalid'; END IF;
  current_resolution:="erp_automation_commands"."resolve_inventory_adjustment_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,inventory_document_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document
     OR preview_document->>'operation'<>'inventory.document.post'
     OR preview_document->>'capability_code'<>'inventory.adjustment.prepare'
     OR preview_document->>'target_resource_type'<>'inventory_document'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM inventory_document_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cycle-count resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='inventory.adjustment.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM inventory_document_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cycle-count idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'adjustment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'adjustment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'adjustment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'inventory.adjustment.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,inventory_document_id,(resolved_document->>'total_value')::numeric,'INR',
    key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT document_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='stock_count'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  document_number:=erp_core_commands.allocate_document_number(organization_id,document_sequence_id,document_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO inventory.inventory_documents(org_id,id,branch_id,physical_movement_required,document_type,document_number,
    fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,total_abs_base_quantity,total_value)
  VALUES(organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,false,'stock_count',document_number,
    fiscal_year,(resolved_document->>'adjustment_date')::date,'submitted','cycle_count','INR','moving_weighted_average',
    (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric);
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,
      product_id,batch_id,uom_code,entered_quantity,base_quantity,from_location_id,system_quantity,counted_quantity,
      variance_quantity,unit_cost,extended_cost)
    VALUES(organization_id,(resolved_line->>'inventory_document_line_id')::uuid,inventory_document_id,
      (resolved_line->>'line_number')::integer,'count_adjustment',(resolved_line->>'product_id')::uuid,
      (resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',pg_catalog.abs((resolved_line->>'variance_base_quantity')::numeric),
      pg_catalog.abs((resolved_line->>'variance_base_quantity')::numeric),(resolved_document->>'location_id')::uuid,
      (resolved_line->>'system_base_quantity')::numeric,(resolved_line->>'counted_base_quantity')::numeric,
      (resolved_line->>'variance_base_quantity')::numeric,(resolved_line->>'unit_cost')::numeric,
      (resolved_line->>'extended_cost')::numeric);
  END LOOP;
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'adjustment_date')::date,
    'Physical cycle-count '||(resolved_document->>'variance_effect')||' '||document_number,'INR','INR',1,(resolved_document->>'total_value')::numeric,
    (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
    (resolved_document->>'total_value')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
    (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,CASE resolved_document->>'variance_effect'
        WHEN 'gain' THEN (resolved_document->>'inventory_asset_account_id')::uuid
        ELSE (resolved_document->>'inventory_variance_account_id')::uuid END,
      (resolved_document->>'branch_id')::uuid,'Cycle-count '||(resolved_document->>'variance_effect')||' debit',
      (resolved_document->>'total_value')::numeric,0,(resolved_document->>'total_value')::numeric,0),
    (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,CASE resolved_document->>'variance_effect'
        WHEN 'gain' THEN (resolved_document->>'inventory_variance_account_id')::uuid
        ELSE (resolved_document->>'inventory_asset_account_id')::uuid END,
      (resolved_document->>'branch_id')::uuid,'Cycle-count '||(resolved_document->>'variance_effect')||' credit',0,(resolved_document->>'total_value')::numeric,
      0,(resolved_document->>'total_value')::numeric);
  PERFORM "erp_automation_commands"."assert_inventory_adjustment_draft"(organization_id,inventory_document_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, document_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_inventory_adjustment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, document_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

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
    count_variance_ledger_count integer;
    count_variance_ledger_value numeric(20,2);
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
          PERFORM erp_finance_commands.synchronize_open_item_status(
            organization_id,(resolved_allocation->>'open_item_id')::uuid);
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
          SELECT count(*),coalesce(sum(pg_catalog.abs(entry.value_delta)),0)
            INTO count_variance_ledger_count,count_variance_ledger_value
            FROM inventory.stock_ledger_entries entry WHERE entry.org_id=organization_id
             AND entry.inventory_document_id=request_row.target_resource_id
             AND entry.entry_kind=CASE current_resolution->>'variance_effect'
               WHEN 'gain' THEN 'count_gain' ELSE 'count_loss' END;
          IF count_variance_ledger_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
             OR count_variance_ledger_value<>(current_resolution->>'total_value')::numeric THEN
            RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted count-variance ledger differs from the approved MWA preview'; END IF;
          UPDATE finance.journal_entries SET status='posted',posted_at=pg_catalog.transaction_timestamp(),
            posted_by_membership_id=actor_id,updated_at=pg_catalog.transaction_timestamp(),
            updated_by_membership_id=actor_id,row_version=row_version+1
           WHERE org_id=organization_id AND id=(request_document->>'journal_id')::uuid AND status='draft'
             AND transaction_debit_total=count_variance_ledger_value AND transaction_credit_total=count_variance_ledger_value
             AND functional_debit_total=count_variance_ledger_value AND functional_credit_total=count_variance_ledger_value;
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

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_adjustment_note"(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, request_id uuid, command_request_id uuid, tax_document_id uuid, journal_id uuid, journal_number varchar, event_id uuid, allocation_id uuid, new_open_item_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE note finance.adjustment_notes%ROWTYPE; artifact calculation.artifacts%ROWTYPE; original_tax tax.documents%ROWTYPE;
        adjustment_rule tax.gst_adjustment_rule_versions%ROWTYPE; portal_line tax.portal_document_lines%ROWTYPE;
        original_open finance.open_items%ROWTYPE; line record; input_doc jsonb; output_doc jsonb; consumed bytea;
        claim_id uuid; replay_id uuid; branch_id uuid; party_account uuid; posting_account uuid; role_account uuid; role_key varchar;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); line_no integer:=2; component_amount numeric(20,2);
        debit_total numeric(20,2); credit_total numeric(20,2); outstanding numeric(20,2); applied numeric(20,2); residual numeric(20,2);
        noncreditable numeric(20,2); eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0;
        eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0; tax_required boolean;
        original_document_date date; adjustment_deadline date; tax_number varchar(64); tax_date date;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT note FROM finance.adjustment_notes WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF note.status<>'approved' OR note.sales_return_id IS NOT NULL OR note.purchase_return_id IS NOT NULL
       OR note.reversal_of_adjustment_note_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generic posting requires an approved non-return adjustment note'; END IF;
    IF note.side='sales' THEN
      SELECT invoice.branch_id,invoice.invoice_date INTO STRICT branch_id,original_document_date FROM sales.invoices invoice
       WHERE invoice.org_id=organization_id AND invoice.id=note.sales_invoice_id AND invoice.status='posted' FOR SHARE;
    ELSE
      SELECT invoice.branch_id,invoice.supplier_invoice_date INTO STRICT branch_id,original_document_date FROM procurement.supplier_invoices invoice
       WHERE invoice.org_id=organization_id AND invoice.id=note.supplier_invoice_id AND invoice.status='posted' FOR SHARE;
    END IF;
    PERFORM erp_trade_commands.assert_permission('finance.adjustment_note.manage',branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      organization_id,actor_id,'finance.adjustment_note.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='adjustment replay mismatch'; END IF; RETURN replay_id; END IF;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.adjustment_note_id<>resource_id OR artifact.operation<>'finance.adjustment_note.post' OR artifact.aggregate_version<>note.row_version THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed adjustment artifact metadata differs'; END IF;
    PERFORM erp_commercial_commands.assert_adjustment_note_artifact(organization_id,resource_id,input_doc,output_doc);
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'finance.adjustment_note.post','adjustment_note',resource_id,note.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed adjustment calculation changed'; END IF;
    SELECT document.* INTO STRICT original_tax FROM tax.documents document WHERE document.org_id=organization_id
      AND ((note.side='sales' AND document.sales_invoice_id=note.sales_invoice_id) OR (note.side='purchase' AND document.supplier_invoice_id=note.supplier_invoice_id))
      AND document.document_effect='original' FOR SHARE;
    SELECT * INTO STRICT adjustment_rule FROM tax.gst_adjustment_rule_versions rule
     WHERE rule.id=note.gst_adjustment_rule_version_id AND rule.status='active'
       AND rule.side=note.side AND rule.direction=note.direction AND rule.document_effect=note.document_effect
       AND rule.reason_code=note.reason_code AND rule.effective_from<=note.note_date
       AND (rule.effective_to IS NULL OR rule.effective_to>=note.note_date) FOR SHARE;
    IF adjustment_rule.tax_effect IS DISTINCT FROM note.gst_tax_treatment THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment GST treatment differs from effective reviewed rule'; END IF;
    tax_required:=adjustment_rule.tax_effect='statutory';
    IF tax_required<>(tax_document_id IS NOT NULL) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment tax-document identity differs from statutory treatment'; END IF;
    IF NOT tax_required AND (note.gst_taxable_value<>0 OR note.cgst_amount<>0 OR note.sgst_amount<>0 OR note.igst_amount<>0 OR note.cess_amount<>0 OR note.recipient_assessed_tax_amount<>0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only adjustment cannot alter GST'; END IF;
    IF adjustment_rule.deadline_policy='days_after_original' THEN
      adjustment_deadline:=original_document_date+adjustment_rule.deadline_days;
    ELSIF adjustment_rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date((pg_catalog.date_part('year',original_document_date)::integer+
        CASE WHEN pg_catalog.date_part('month',original_document_date)>=4 THEN 1 ELSE 0 END),11,30);
      SELECT least(adjustment_deadline,min(filing.filed_at::date)) INTO adjustment_deadline
        FROM tax.returns filing JOIN tax.return_periods period ON period.org_id=filing.org_id AND period.id=filing.return_period_id
       WHERE filing.org_id=organization_id AND period.registration_id=original_tax.registration_id
         AND filing.return_type='gstr9' AND filing.status='filed'
         AND period.period_start<=original_document_date AND period.period_end>=original_document_date;
    END IF;
    IF tax_required AND adjustment_deadline IS NOT NULL AND note.note_date>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory adjustment is after the effective-rule deadline'; END IF;
    IF tax_required AND note.side='sales' AND note.document_effect='decrease' THEN
      PERFORM 1 FROM core.attachments evidence
       WHERE evidence.org_id=organization_id AND evidence.id=note.recipient_itc_reversal_evidence_attachment_id
         AND evidence.status IN ('verified','retained') AND evidence.verified_at IS NOT NULL
         AND evidence.verified_at<=note.recipient_itc_reversal_confirmed_at FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires verified recipient ITC-reversal evidence'; END IF;
    END IF;
    IF tax_required AND note.side='purchase' AND (note.document_effect='decrease' OR adjustment_rule.portal_evidence_required) THEN
      SELECT source.* INTO STRICT portal_line FROM tax.portal_document_lines source
        JOIN tax.portal_documents document ON document.org_id=source.org_id AND document.id=source.portal_document_id
          AND document.status='parsed' AND document.portal_document_type IN ('gstr2a','gstr2b')
       WHERE source.org_id=organization_id AND source.id=note.counterparty_portal_document_line_id
         AND source.document_type=CASE WHEN note.document_effect='decrease' THEN 'credit_note' ELSE 'debit_note' END
       FOR SHARE OF source,document;
      IF portal_line.supplier_gstin IS DISTINCT FROM original_tax.counterparty_gstin
         OR portal_line.place_of_supply_state_code IS DISTINCT FROM original_tax.place_of_supply_state_code
         OR ROW(portal_line.taxable_amount,portal_line.cgst_amount,portal_line.sgst_amount,portal_line.igst_amount,portal_line.cess_amount,portal_line.total_amount)
            IS DISTINCT FROM ROW(note.gst_taxable_value,note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,
              note.gst_taxable_value+note.cgst_amount+note.sgst_amount+note.igst_amount+note.cess_amount) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier portal adjustment evidence differs from accounting note'; END IF;
    END IF;
    tax_number:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_number ELSE note.note_number END;
    tax_date:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_date ELSE note.note_date END;
    SELECT item.* INTO STRICT original_open FROM finance.open_items item WHERE item.org_id=organization_id AND item.id=note.adjusts_open_item_id
      AND item.party_id=note.party_id AND item.currency_code=note.currency_code FOR UPDATE;
    PERFORM 1 FROM finance.accounting_events source_event WHERE source_event.org_id=organization_id
      AND source_event.id=original_open.accounting_event_id
      AND ((note.side='sales' AND source_event.sales_invoice_id=note.sales_invoice_id)
        OR (note.side='purchase' AND source_event.supplier_invoice_id=note.supplier_invoice_id)) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment open item does not belong to the original invoice event'; END IF;
    SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted'
      AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id)),0)
      INTO outstanding FROM finance.allocations allocation WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
    IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,
      transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,note.note_date,'Adjustment note',note.currency_code,'INR',1,0,0,0,0,'draft',actor_id,actor_id);
    party_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,CASE WHEN note.side='sales' THEN 'accounts_receivable' ELSE 'accounts_payable' END,
      CASE WHEN note.side='sales' THEN 'asset' ELSE 'liability' END,note.currency_code,true);
    PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,1,party_account,branch_id,note.party_id,'Adjustment counterparty',
      CASE WHEN (note.side='sales')=(note.document_effect='increase') THEN note.counterparty_payable_amount ELSE 0 END,
      CASE WHEN (note.side='sales')<>(note.document_effect='increase') THEN note.counterparty_payable_amount ELSE 0 END,actor_id);
    FOR line IN SELECT adjustment_line.*,sales_line.revenue_account_id,supplier_line.net_value_account_id
      FROM finance.adjustment_note_lines adjustment_line
      LEFT JOIN sales.invoice_lines sales_line ON sales_line.org_id=adjustment_line.org_id AND sales_line.id=adjustment_line.sales_invoice_line_id
      LEFT JOIN procurement.supplier_invoice_lines supplier_line ON supplier_line.org_id=adjustment_line.org_id AND supplier_line.id=adjustment_line.supplier_invoice_line_id
     WHERE adjustment_line.org_id=organization_id AND adjustment_line.adjustment_note_id=resource_id ORDER BY adjustment_line.line_number LOOP
      posting_account:=coalesce(line.account_id,line.revenue_account_id,line.net_value_account_id);
      PERFORM erp_commercial_commands.assert_line_account(organization_id,posting_account,
        CASE WHEN note.side='sales' THEN 'income' WHEN line.inventory_cost_treatment='capitalize' THEN 'asset' ELSE 'expense' END,note.currency_code);
      noncreditable:=CASE WHEN note.side='purchase' AND line.itc_eligibility<>'eligible' THEN line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount ELSE 0 END;
      IF note.side='purchase' AND line.itc_eligibility='eligible' THEN eligible_cgst:=eligible_cgst+line.cgst_amount; eligible_sgst:=eligible_sgst+line.sgst_amount; eligible_igst:=eligible_igst+line.igst_amount; eligible_cess:=eligible_cess+line.cess_amount; END IF;
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,posting_account,branch_id,NULL,'Adjustment net value',
        CASE WHEN (note.side='purchase')=(note.document_effect='increase') THEN line.net_value_amount+noncreditable ELSE 0 END,
        CASE WHEN (note.side='purchase')<>(note.document_effect='increase') THEN line.net_value_amount+noncreditable ELSE 0 END,actor_id); line_no:=line_no+1;
    END LOOP;
    FOR role_key,component_amount IN SELECT * FROM (VALUES
      (CASE WHEN note.side='sales' THEN 'output_cgst' ELSE 'input_cgst' END,CASE WHEN note.side='sales' THEN note.cgst_amount ELSE eligible_cgst END),
      (CASE WHEN note.side='sales' THEN 'output_sgst' ELSE 'input_sgst' END,CASE WHEN note.side='sales' THEN note.sgst_amount ELSE eligible_sgst END),
      (CASE WHEN note.side='sales' THEN 'output_igst' ELSE 'input_igst' END,CASE WHEN note.side='sales' THEN note.igst_amount ELSE eligible_igst END),
      (CASE WHEN note.side='sales' THEN 'output_cess' ELSE 'input_cess' END,CASE WHEN note.side='sales' THEN note.cess_amount ELSE eligible_cess END)) x(role,amount) LOOP
      IF component_amount>0 AND (note.side='purchase' OR note.tax_charge_mechanism='normal') THEN
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,role_key,CASE WHEN note.side='sales' THEN 'liability' ELSE 'asset' END,note.currency_code,false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,branch_id,NULL,'Adjustment tax',
          CASE WHEN (note.side='purchase')=(note.document_effect='increase') THEN component_amount ELSE 0 END,
          CASE WHEN (note.side='purchase')<>(note.document_effect='increase') THEN component_amount ELSE 0 END,actor_id); line_no:=line_no+1;
      END IF;
    END LOOP;
    IF note.side='purchase' AND note.tax_charge_mechanism='reverse_charge' THEN
      FOR role_key,component_amount IN SELECT * FROM (VALUES ('rcm_cgst_payable',note.cgst_amount),('rcm_sgst_payable',note.sgst_amount),('rcm_igst_payable',note.igst_amount),('rcm_cess_payable',note.cess_amount)) x(role,amount) LOOP
        IF component_amount>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,role_key,'liability',note.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,branch_id,NULL,'Adjustment RCM liability',
            CASE WHEN note.document_effect='decrease' THEN component_amount ELSE 0 END,CASE WHEN note.document_effect='increase' THEN component_amount ELSE 0 END,actor_id); line_no:=line_no+1; END IF;
      END LOOP;
    END IF;
    IF note.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN (note.side='sales')=(note.rounding_adjustment>0) THEN 'rounding_gain' ELSE 'rounding_loss' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,note.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,branch_id,NULL,'Adjustment rounding',
        CASE WHEN (role_key='rounding_loss')=(note.document_effect='increase') THEN abs(note.rounding_adjustment) ELSE 0 END,
        CASE WHEN (role_key='rounding_gain')=(note.document_effect='increase') THEN abs(note.rounding_adjustment) ELSE 0 END,actor_id);
    END IF;
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO debit_total,credit_total FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF debit_total<>credit_total OR debit_total=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment journal is not balanced'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=debit_total,transaction_credit_total=credit_total,functional_debit_total=debit_total,functional_credit_total=credit_total,
      status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE finance.adjustment_notes SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=resource_id AND status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment posting state changed'; END IF;
    IF tax_required THEN
    INSERT INTO tax.documents(org_id,id,registration_id,adjustment_note_id,document_class,document_number,document_date,direction,counterparty_party_id,counterparty_gstin,
      place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,tax_liability_party,document_effect,adjusts_tax_document_id,currency_code,
      net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,
      tax_ruleset_version,tax_ruleset_effective_date,source_hash,posted_at,created_by_membership_id)
    VALUES(organization_id,tax_document_id,original_tax.registration_id,resource_id,'adjustment_note',tax_number,tax_date,original_tax.direction,note.party_id,
      original_tax.counterparty_gstin,original_tax.place_of_supply_state_code,original_tax.supply_type,note.zero_rated_payment_mode,note.tax_charge_mechanism,
      original_tax.tax_liability_party,note.document_effect,original_tax.id,note.currency_code,note.net_value_amount,note.gst_taxable_value,note.cgst_amount,note.sgst_amount,
      note.igst_amount,note.cess_amount,CASE WHEN note.side='purchase' AND note.tax_charge_mechanism='reverse_charge' THEN note.recipient_assessed_tax_amount ELSE 0 END,
      note.rounding_adjustment,note.counterparty_payable_amount,note.calculation_ruleset_version,original_tax.tax_ruleset_effective_date,
      extensions.digest(pg_catalog.convert_to((output_doc||pg_catalog.jsonb_build_object('adjustment_note_id',resource_id))::text,'UTF8'),'sha256'),posted_time,actor_id);
    END IF;
    INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'adjustment_note',resource_id,journal_id,posted_time,posted_time,actor_id);
    IF note.document_effect='decrease' THEN
      applied:=least(note.counterparty_payable_amount,outstanding); residual:=note.counterparty_payable_amount-applied;
      IF applied>0 THEN
        IF allocation_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='decrease allocation identity is required'; END IF;
        INSERT INTO finance.allocations(org_id,id,adjustment_note_id,open_item_id,allocation_date,currency_code,amount,functional_amount,status,created_by_membership_id)
        VALUES(organization_id,allocation_id,resource_id,original_open.id,note.note_date,note.currency_code,applied,applied,'posted',actor_id);
        PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,original_open.id);
      END IF;
      IF residual>0 THEN INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id)
        VALUES(organization_id,new_open_item_id,event_id,note.party_id,CASE WHEN note.side='sales' THEN 'payable' ELSE 'receivable' END,note.note_number,note.note_date,note.note_date,note.currency_code,residual,residual,'open',actor_id); END IF;
    ELSE
      IF allocation_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='increase adjustment cannot allocate the original open item'; END IF;
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id)
      VALUES(organization_id,new_open_item_id,event_id,note.party_id,CASE WHEN note.side='sales' THEN 'receivable' ELSE 'payable' END,note.note_number,note.note_date,note.note_date,note.currency_code,note.counterparty_payable_amount,note.counterparty_payable_amount,'open',actor_id);
    END IF;
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'finance.adjustment_notes',resource_id);
    RETURN resource_id;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_adjustment_note"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_adjustment_note"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_purchase_return"(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, request_id uuid, command_request_id uuid, adjustment_note_id uuid, adjustment_note_number varchar, tax_document_id uuid, journal_id uuid, journal_number varchar, event_id uuid, allocation_id uuid, residual_open_item_id uuid, inventory_document_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE header procurement.purchase_returns%ROWTYPE; original procurement.supplier_invoices%ROWTYPE; artifact calculation.artifacts%ROWTYPE;
        original_tax tax.documents%ROWTYPE; original_open finance.open_items%ROWTYPE; posting_line record;
        adjustment_rule tax.gst_adjustment_rule_versions%ROWTYPE; supplier_portal_line tax.portal_document_lines%ROWTYPE;
        claim_id uuid; replay_id uuid; input_doc jsonb; output_doc jsonb; consumed bytea; party_id uuid; party_account uuid;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); invoiced boolean; inventory_required boolean; tax_required boolean;
        line_no integer:=1; component_amount numeric(20,2); role_account uuid; role_key varchar; debit_total numeric(20,2); credit_total numeric(20,2);
        eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0; eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0;
        inventory_value numeric(20,2):=0; inventory_entries bigint:=0; expected_inventory_value numeric(20,2):=0; variance_value numeric(20,2):=0;
        outstanding numeric(20,2); applied numeric(20,2); residual numeric(20,2); original_event_id uuid; adjustment_deadline date;
        registration_scope_count bigint;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT header FROM procurement.purchase_returns WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF header.status<>'approved' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return is not in the required posting state'; END IF;
    PERFORM erp_trade_commands.assert_permission('procurement.return.post',header.branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,actor_id,'procurement.purchase_return.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='commercial replay mismatch'; END IF; RETURN replay_id; END IF;
    invoiced:=header.return_source_kind='invoiced';
    IF invoiced THEN
      SELECT * INTO STRICT original FROM procurement.supplier_invoices WHERE org_id=organization_id AND id=header.supplier_invoice_id FOR UPDATE;
      SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND supplier_invoice_id=header.supplier_invoice_id FOR SHARE;
    END IF;
    SELECT * INTO STRICT adjustment_rule FROM tax.gst_adjustment_rule_versions rule
     WHERE rule.id=header.gst_adjustment_rule_version_id AND rule.status='active'
       AND rule.side='purchase' AND rule.direction='debit'
       AND rule.document_effect='decrease' AND rule.reason_code=header.reason_code
       AND rule.effective_from<=header.return_date
       AND (rule.effective_to IS NULL OR rule.effective_to>=header.return_date) FOR SHARE;
    IF adjustment_rule.tax_effect IS DISTINCT FROM header.gst_tax_treatment THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return GST treatment differs from effective reviewed adjustment rule'; END IF;
    tax_required:=adjustment_rule.tax_effect='statutory';
    IF tax_required AND NOT invoiced THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='uninvoiced return cannot be a statutory GST adjustment'; END IF;
    IF NOT tax_required AND (header.gst_taxable_total<>0 OR header.cgst_total<>0 OR header.sgst_total<>0 OR header.igst_total<>0 OR header.cess_total<>0 OR header.recipient_assessed_tax_total<>0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only return cannot alter GST'; END IF;
    IF invoiced AND adjustment_rule.deadline_policy='days_after_original' THEN
      adjustment_deadline:=original.supplier_invoice_date+adjustment_rule.deadline_days;
    ELSIF invoiced AND adjustment_rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date((pg_catalog.date_part('year',original.supplier_invoice_date)::integer+
        CASE WHEN pg_catalog.date_part('month',original.supplier_invoice_date)>=4 THEN 1 ELSE 0 END),11,30);
      SELECT least(adjustment_deadline,min(filing.filed_at::date)) INTO adjustment_deadline
        FROM tax.returns filing JOIN tax.return_periods period ON period.org_id=filing.org_id AND period.id=filing.return_period_id
       WHERE filing.org_id=organization_id AND period.registration_id=original_tax.registration_id
         AND filing.return_type='gstr9' AND filing.status='filed'
         AND period.period_start<=original.supplier_invoice_date AND period.period_end>=original.supplier_invoice_date;
    END IF;
    IF tax_required AND adjustment_deadline IS NOT NULL AND header.return_date>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory GST adjustment is after the effective-rule deadline'; END IF;
    IF tax_required THEN
      SELECT portal_line.* INTO STRICT supplier_portal_line
        FROM tax.portal_document_lines portal_line
        JOIN tax.portal_documents portal_document ON portal_document.org_id=portal_line.org_id
          AND portal_document.id=portal_line.portal_document_id AND portal_document.status='parsed'
          AND portal_document.portal_document_type IN ('gstr2a','gstr2b')
       WHERE portal_line.org_id=organization_id AND portal_line.id=header.supplier_credit_note_portal_line_id
         AND portal_line.document_type='credit_note' FOR SHARE OF portal_line,portal_document;
      IF supplier_portal_line.supplier_gstin IS DISTINCT FROM original_tax.counterparty_gstin
         OR supplier_portal_line.place_of_supply_state_code IS DISTINCT FROM original_tax.place_of_supply_state_code
         OR ROW(supplier_portal_line.taxable_amount,supplier_portal_line.cgst_amount,supplier_portal_line.sgst_amount,
                supplier_portal_line.igst_amount,supplier_portal_line.cess_amount,supplier_portal_line.total_amount)
            IS DISTINCT FROM ROW(header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,
                header.cess_total,header.gst_taxable_total+header.cgst_total+header.sgst_total+header.igst_total+header.cess_total) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier GST credit-note portal evidence differs from purchase return'; END IF;
    END IF;
    IF tax_required THEN
      SELECT count(*) INTO registration_scope_count
        FROM tax.registrations registration
        JOIN tax.registration_branches association
          ON association.org_id=registration.org_id
         AND association.registration_id=registration.id
       WHERE registration.org_id=organization_id
         AND registration.id=original_tax.registration_id
         AND registration.status='active'
         AND registration.effective_from<=header.return_date
         AND (registration.effective_to IS NULL OR registration.effective_to>=header.return_date)
         AND association.branch_id=header.branch_id
         AND association.status='active'
         AND association.effective_from<=header.return_date
         AND (association.effective_to IS NULL OR association.effective_to>=header.return_date);
      IF registration_scope_count<>1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory return requires exactly one active branch GST registration association on return date';
      END IF;
      PERFORM 1
        FROM tax.registrations registration
        JOIN tax.registration_branches association
          ON association.org_id=registration.org_id
         AND association.registration_id=registration.id
       WHERE registration.org_id=organization_id
         AND registration.id=original_tax.registration_id
         AND registration.status='active'
         AND registration.effective_from<=header.return_date
         AND (registration.effective_to IS NULL OR registration.effective_to>=header.return_date)
         AND association.branch_id=header.branch_id
         AND association.status='active'
         AND association.effective_from<=header.return_date
         AND (association.effective_to IS NULL OR association.effective_to>=header.return_date)
       FOR SHARE OF registration,association;
    END IF;
    SELECT account.party_id INTO STRICT party_id FROM parties.supplier_accounts account WHERE account.org_id=organization_id AND account.id=header.supplier_account_id AND account.status='active' FOR SHARE;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.purchase_return_id IS DISTINCT FROM resource_id OR artifact.operation<>'procurement.purchase_return.post' OR artifact.aggregate_version<>header.row_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed return artifact metadata mismatch'; END IF;
    PERFORM erp_commercial_commands.assert_purchase_return_artifact(organization_id,resource_id,input_doc,output_doc);
    inventory_required:=true; IF inventory_document_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase return inventory issue is required'; END IF;
    IF tax_required<>(tax_document_id IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return tax-document identity does not match statutory GST treatment'; END IF;
    IF inventory_document_id IS NOT NULL THEN
      PERFORM erp_commercial_commands.post_owned_inventory_document(
        organization_id,inventory_document_id,actor_id,'purchase_return',resource_id,header.branch_id);
      SELECT coalesce(sum(CASE WHEN entry.entry_kind='issue' THEN -entry.value_delta ELSE entry.value_delta END),0),count(*)
        INTO inventory_value,inventory_entries FROM inventory.stock_ledger_entries entry
       WHERE entry.org_id=organization_id AND entry.inventory_document_id=inventory_document_id
         AND entry.entry_kind IN ('issue');
      IF inventory_entries=0 OR inventory_value<=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return inventory document has no authoritative posted ledger value'; END IF;
    END IF;
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'procurement.purchase_return.post','purchase_return',resource_id,header.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed return calculation changed'; END IF;
    IF invoiced THEN
      SELECT open_item.* INTO STRICT original_open FROM finance.accounting_events event JOIN finance.open_items open_item ON open_item.org_id=event.org_id AND open_item.accounting_event_id=event.id WHERE event.org_id=organization_id AND event.supplier_invoice_id=header.supplier_invoice_id FOR UPDATE OF open_item;
      original_event_id:=original_open.accounting_event_id;
      SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted'
        AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id
          AND reversal.reversal_of_allocation_id=allocation.id)),0)
        INTO outstanding FROM finance.allocations allocation
       WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
      IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
    ELSE outstanding:=0; END IF;
    INSERT INTO finance.adjustment_notes(org_id,id,note_number,note_date,side,direction,party_id,sales_invoice_id,supplier_invoice_id,sales_return_id,purchase_return_id,adjusts_open_item_id,counterparty_portal_document_line_id,gst_adjustment_rule_version_id,gst_tax_treatment,recipient_itc_reversal_evidence_attachment_id,recipient_itc_reversal_confirmed_at,zero_rated_payment_mode,tax_charge_mechanism,currency_code,document_effect,rounding_policy,document_discount_kind,document_discount_basis,document_discount_value,calculation_ruleset_version,gross_price_amount,discount_amount,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,reason_code,reason,status,approved_at,approved_by_membership_id,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,adjustment_note_id,adjustment_note_number,header.return_date,'purchase','debit',party_id,NULL,header.supplier_invoice_id,NULL,resource_id,CASE WHEN invoiced THEN original_open.id ELSE NULL END,header.supplier_credit_note_portal_line_id,header.gst_adjustment_rule_version_id,header.gst_tax_treatment,NULL,NULL,header.zero_rated_payment_mode,header.tax_charge_mechanism,coalesce(original.currency_code,'INR'),'decrease',header.rounding_policy,'none','price_value',0,header.calculation_ruleset_version,(output_doc#>>'{totals,subtotal}')::numeric,(output_doc#>>'{totals,discount_total}')::numeric,header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,header.recipient_assessed_tax_total,header.rounding_adjustment,header.grand_total,header.reason_code,'Posted return','approved',posted_time,actor_id,actor_id,actor_id);
    INSERT INTO finance.adjustment_note_lines(org_id,id,adjustment_note_id,line_number,line_kind,product_id,account_id,sales_invoice_line_id,supplier_invoice_line_id,charge_code,quoted_amount,description,uom_code,billed_quantity,free_quantity,uom_conversion_factor,base_billed_quantity,base_free_quantity,free_supply_tax_treatment,quoted_unit_rate,price_basis,gross_amount,line_discount_kind,line_discount_basis,line_discount_value,document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,final_residual,gst_tax_treatment,discount_amount,net_value_amount,gst_taxable_value,hsn_sac_code,tax_code_version_id,taxability_snapshot,inventory_cost_treatment,itc_eligibility,tax_charge_mechanism,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,line_total,tax_ruleset_version,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),adjustment_note_id,return_adjustment_line.line_number,'product',return_adjustment_line.product_id,NULL,NULL,invoice_source.id,NULL,NULL,'Return adjustment',CASE WHEN invoiced THEN invoice_source.uom_code ELSE source.uom_code END,return_adjustment_line.billed_quantity,return_adjustment_line.free_quantity,return_adjustment_line.uom_conversion_factor,return_adjustment_line.base_billed_quantity,return_adjustment_line.base_free_quantity,return_adjustment_line.free_supply_tax_treatment,return_adjustment_line.quoted_unit_rate,return_adjustment_line.price_basis,(calculated.item->>'gross_amount')::numeric,'none','price_value',0,false,(calculated.item->>'line_discount_amount')::numeric,(calculated.item->>'line_taxable_discount_amount')::numeric,(calculated.item->>'document_discount_amount')::numeric,(calculated.item->>'document_taxable_discount_amount')::numeric,return_adjustment_line.final_residual,header.gst_tax_treatment,(calculated.item->>'line_discount_amount')::numeric+(calculated.item->>'document_discount_amount')::numeric,return_adjustment_line.net_value_amount,return_adjustment_line.gst_taxable_value,return_adjustment_line.hsn_code_snapshot,return_adjustment_line.tax_code_version_id,return_adjustment_line.taxability_snapshot,invoice_source.inventory_cost_treatment,invoice_source.itc_eligibility,return_adjustment_line.tax_charge_mechanism,return_adjustment_line.cgst_rate,return_adjustment_line.sgst_rate,return_adjustment_line.igst_rate,return_adjustment_line.cess_rate,return_adjustment_line.cgst_amount,return_adjustment_line.sgst_amount,return_adjustment_line.igst_amount,return_adjustment_line.cess_amount,CASE WHEN return_adjustment_line.tax_charge_mechanism='reverse_charge' THEN return_adjustment_line.cgst_amount+return_adjustment_line.sgst_amount+return_adjustment_line.igst_amount+return_adjustment_line.cess_amount ELSE 0 END,return_adjustment_line.line_total,header.calculation_ruleset_version,actor_id
      FROM procurement.purchase_return_lines return_adjustment_line
      JOIN pg_catalog.jsonb_array_elements(output_doc->'lines') calculated(item) ON calculated.item->>'line_id'=coalesce((SELECT allocation.supplier_invoice_line_id::text FROM procurement.supplier_invoice_receipt_allocations allocation WHERE allocation.org_id=return_adjustment_line.org_id AND allocation.id=return_adjustment_line.supplier_invoice_receipt_allocation_id),return_adjustment_line.goods_receipt_line_id::text)
      JOIN procurement.goods_receipt_lines source ON source.org_id=return_adjustment_line.org_id AND source.id=return_adjustment_line.goods_receipt_line_id
      LEFT JOIN procurement.supplier_invoice_receipt_allocations invoice_allocation ON invoice_allocation.org_id=return_adjustment_line.org_id AND invoice_allocation.id=return_adjustment_line.supplier_invoice_receipt_allocation_id LEFT JOIN procurement.supplier_invoice_lines invoice_source ON invoice_source.org_id=invoice_allocation.org_id AND invoice_source.id=invoice_allocation.supplier_invoice_line_id
     WHERE return_adjustment_line.org_id=organization_id AND return_adjustment_line.purchase_return_id=resource_id;
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,header.return_date,'purchase_return',coalesce(original.currency_code,'INR'),'INR',1,header.grand_total,header.grand_total,header.grand_total,header.grand_total,'draft',actor_id,actor_id);
    IF invoiced THEN
      party_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'accounts_payable','liability',original.currency_code,true);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,party_account,header.branch_id,party_id,'Payable debit',header.grand_total,0,actor_id); line_no:=line_no+1;
      FOR posting_line IN SELECT return_line.net_value_amount,return_line.cgst_amount,return_line.sgst_amount,return_line.igst_amount,return_line.cess_amount,invoice_line.net_value_account_id,invoice_line.itc_eligibility,invoice_line.inventory_cost_treatment FROM procurement.purchase_return_lines return_line JOIN procurement.supplier_invoice_receipt_allocations allocation ON allocation.org_id=return_line.org_id AND allocation.id=return_line.supplier_invoice_receipt_allocation_id JOIN procurement.supplier_invoice_lines invoice_line ON invoice_line.org_id=allocation.org_id AND invoice_line.id=allocation.supplier_invoice_line_id WHERE return_line.org_id=organization_id AND return_line.purchase_return_id=resource_id ORDER BY return_line.line_number LOOP
        PERFORM erp_commercial_commands.assert_line_account(organization_id,posting_line.net_value_account_id,CASE WHEN posting_line.inventory_cost_treatment='capitalize' THEN 'asset' ELSE 'expense' END,original.currency_code);
        component_amount:=posting_line.net_value_amount+CASE WHEN posting_line.itc_eligibility='eligible' THEN 0 ELSE posting_line.cgst_amount+posting_line.sgst_amount+posting_line.igst_amount+posting_line.cess_amount END;
        IF posting_line.itc_eligibility='eligible' THEN eligible_cgst:=eligible_cgst+posting_line.cgst_amount; eligible_sgst:=eligible_sgst+posting_line.sgst_amount; eligible_igst:=eligible_igst+posting_line.igst_amount; eligible_cess:=eligible_cess+posting_line.cess_amount; END IF;
        IF posting_line.inventory_cost_treatment='capitalize' THEN
          role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',original.currency_code,false);
          IF posting_line.net_value_account_id<>role_account THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized supplier line is not mapped to inventory asset role'; END IF;
          expected_inventory_value:=expected_inventory_value+component_amount;
        ELSE
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,posting_line.net_value_account_id,header.branch_id,NULL,'Supplier expense reversal',0,component_amount,actor_id); line_no:=line_no+1;
        END IF;
      END LOOP;
      IF expected_inventory_value>0 THEN
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',original.currency_code,false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Returned inventory at posted MWA ledger value',0,inventory_value,actor_id); line_no:=line_no+1;
        variance_value:=expected_inventory_value-inventory_value;
        IF variance_value<>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'purchase_return_inventory_variance','expense',original.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Purchase return inventory variance',CASE WHEN variance_value<0 THEN abs(variance_value) ELSE 0 END,CASE WHEN variance_value>0 THEN variance_value ELSE 0 END,actor_id); line_no:=line_no+1;
        END IF;
      ELSIF inventory_value<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expensed supplier return cannot silently move valued inventory'; END IF;
    ELSE
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'goods_received_not_invoiced','liability','INR',false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,party_id,'Uninvoiced receipt liability reversal',header.grand_total,0,actor_id); line_no:=line_no+1;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset','INR',false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Inventory returned at posted MWA ledger value',0,inventory_value,actor_id); line_no:=line_no+1;
      variance_value:=header.grand_total-inventory_value;
      IF variance_value<>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'purchase_return_inventory_variance','expense','INR',false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Uninvoiced purchase return inventory variance',CASE WHEN variance_value<0 THEN abs(variance_value) ELSE 0 END,CASE WHEN variance_value>0 THEN variance_value ELSE 0 END,actor_id); line_no:=line_no+1;
      END IF;
    END IF;
    FOR role_key,component_amount IN SELECT * FROM (VALUES ('input_cgst'::varchar,eligible_cgst),('input_sgst'::varchar,eligible_sgst),('input_igst'::varchar,eligible_igst),('input_cess'::varchar,eligible_cess)) x(role_key,amount) LOOP
      IF invoiced AND component_amount>0 THEN
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'asset',coalesce(original.currency_code,'INR'),false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Tax reversal',0,component_amount,actor_id); line_no:=line_no+1;
      END IF;
    END LOOP;
    IF invoiced AND header.tax_charge_mechanism='reverse_charge' THEN
      FOR role_key,component_amount IN SELECT * FROM (VALUES ('rcm_cgst_payable'::varchar,header.cgst_total),('rcm_sgst_payable'::varchar,header.sgst_total),('rcm_igst_payable'::varchar,header.igst_total),('rcm_cess_payable'::varchar,header.cess_total)) component(role_key,amount) LOOP
        IF component_amount>0 THEN role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'liability',original.currency_code,false);
          PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Reverse-charge liability reversal',component_amount,0,actor_id); line_no:=line_no+1;
        END IF;
      END LOOP;
    END IF;
    IF invoiced AND header.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN header.rounding_adjustment>0 THEN 'rounding_loss' ELSE 'rounding_gain' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Rounding reversal',
        CASE WHEN header.rounding_adjustment<0 THEN abs(header.rounding_adjustment) ELSE 0 END,
        CASE WHEN header.rounding_adjustment>0 THEN abs(header.rounding_adjustment) ELSE 0 END,actor_id); line_no:=line_no+1;
    END IF;
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO debit_total,credit_total FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF debit_total<>credit_total OR debit_total=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return journal is not balanced'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=debit_total,transaction_credit_total=credit_total,functional_debit_total=debit_total,functional_credit_total=credit_total,status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE procurement.purchase_returns SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=resource_id AND status='approved';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='return posting state changed'; END IF;
    UPDATE finance.adjustment_notes SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=adjustment_note_id;

    IF tax_required THEN
      INSERT INTO tax.documents(org_id,id,registration_id,adjustment_note_id,document_class,document_number,document_date,direction,
        counterparty_party_id,counterparty_gstin,place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
        tax_liability_party,document_effect,adjusts_tax_document_id,currency_code,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,
        igst_amount,cess_amount,self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,tax_ruleset_version,tax_ruleset_effective_date,
        source_hash,posted_at,created_by_membership_id)
      VALUES(organization_id,tax_document_id,original_tax.registration_id,adjustment_note_id,'adjustment_note',supplier_portal_line.invoice_number,supplier_portal_line.invoice_date,
        original_tax.direction,party_id,original_tax.counterparty_gstin,original_tax.place_of_supply_state_code,original_tax.supply_type,
        header.zero_rated_payment_mode,header.tax_charge_mechanism,original_tax.tax_liability_party,'decrease',original_tax.id,original_tax.currency_code,
        header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,
        CASE WHEN original_tax.direction='inward' AND header.tax_charge_mechanism='reverse_charge' THEN header.recipient_assessed_tax_total ELSE 0 END,
        header.rounding_adjustment,header.grand_total,header.calculation_ruleset_version,original_tax.tax_ruleset_effective_date,
        extensions.digest(pg_catalog.convert_to((output_doc||pg_catalog.jsonb_build_object('return_id',resource_id))::text,'UTF8'),'sha256'),posted_time,actor_id);
    ELSIF tax_document_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only return cannot create tax document'; END IF;
    INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id) VALUES(organization_id,event_id,'adjustment_note',adjustment_note_id,journal_id,posted_time,posted_time,actor_id);
    IF invoiced THEN
      applied:=least(header.grand_total,outstanding); residual:=header.grand_total-applied;
      IF applied>0 THEN INSERT INTO finance.allocations(org_id,id,adjustment_note_id,open_item_id,allocation_date,currency_code,amount,functional_amount,status,created_by_membership_id) VALUES(organization_id,allocation_id,adjustment_note_id,original_open.id,header.return_date,original_open.currency_code,applied,applied,'posted',actor_id); END IF;
      IF applied>0 THEN PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,original_open.id); END IF;
      IF residual>0 THEN INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id) VALUES(organization_id,residual_open_item_id,event_id,party_id,'receivable',adjustment_note_number,header.return_date,header.return_date,original_open.currency_code,residual,residual,'open',actor_id); END IF;
    END IF;
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'procurement.purchase_returns',resource_id);
    RETURN resource_id;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_purchase_return"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_purchase_return"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_sales_return"(organization_id uuid, resource_id uuid, artifact_id uuid, actor_id uuid, request_id uuid, command_request_id uuid, adjustment_note_id uuid, adjustment_note_number varchar, tax_document_id uuid, journal_id uuid, journal_number varchar, event_id uuid, allocation_id uuid, residual_open_item_id uuid, inventory_document_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE header sales.returns%ROWTYPE; original sales.invoices%ROWTYPE; artifact calculation.artifacts%ROWTYPE;
        original_tax tax.documents%ROWTYPE; original_open finance.open_items%ROWTYPE; posting_line record;
        adjustment_rule tax.gst_adjustment_rule_versions%ROWTYPE; supplier_portal_line tax.portal_document_lines%ROWTYPE;
        claim_id uuid; replay_id uuid; input_doc jsonb; output_doc jsonb; consumed bytea; party_id uuid; party_account uuid;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); invoiced boolean; inventory_required boolean; tax_required boolean;
        line_no integer:=1; component_amount numeric(20,2); role_account uuid; role_key varchar; debit_total numeric(20,2); credit_total numeric(20,2);
        eligible_cgst numeric(20,2):=0; eligible_sgst numeric(20,2):=0; eligible_igst numeric(20,2):=0; eligible_cess numeric(20,2):=0;
        inventory_value numeric(20,2):=0; inventory_entries bigint:=0; expected_inventory_value numeric(20,2):=0; variance_value numeric(20,2):=0;
        outstanding numeric(20,2); applied numeric(20,2); residual numeric(20,2); original_event_id uuid; adjustment_deadline date;
        registration_scope_count bigint;
BEGIN
    PERFORM erp_trade_commands.assert_context(organization_id,actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM request_id THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial request context mismatch'; END IF;
    SELECT * INTO STRICT header FROM sales.returns WHERE org_id=organization_id AND id=resource_id FOR UPDATE;
    IF header.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return is not in the required posting state'; END IF;
    PERFORM erp_trade_commands.assert_permission('sales.return.post',header.branch_id);
    IF NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance journal permission denied'; END IF;
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,actor_id,'sales.return.post',key_hash,request_hash,expires_at);
    IF replay_id IS NOT NULL THEN IF replay_id<>resource_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='commercial replay mismatch'; END IF; RETURN replay_id; END IF;
    SELECT * INTO STRICT original FROM sales.invoices WHERE org_id=organization_id AND id=header.invoice_id FOR UPDATE; invoiced:=true;
    SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND sales_invoice_id=header.invoice_id FOR SHARE;
    SELECT * INTO STRICT adjustment_rule FROM tax.gst_adjustment_rule_versions rule
     WHERE rule.id=header.gst_adjustment_rule_version_id AND rule.status='active'
       AND rule.side='sales' AND rule.direction='credit'
       AND rule.document_effect='decrease' AND rule.reason_code=header.reason_code
       AND rule.effective_from<=header.return_date
       AND (rule.effective_to IS NULL OR rule.effective_to>=header.return_date) FOR SHARE;
    IF adjustment_rule.tax_effect IS DISTINCT FROM header.gst_tax_treatment THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return GST treatment differs from effective reviewed adjustment rule'; END IF;
    tax_required:=adjustment_rule.tax_effect='statutory';
    IF tax_required AND NOT invoiced THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='uninvoiced return cannot be a statutory GST adjustment'; END IF;
    IF NOT tax_required AND (header.gst_taxable_total<>0 OR header.cgst_total<>0 OR header.sgst_total<>0 OR header.igst_total<>0 OR header.cess_total<>0 OR header.recipient_assessed_tax_total<>0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only return cannot alter GST'; END IF;
    IF invoiced AND adjustment_rule.deadline_policy='days_after_original' THEN
      adjustment_deadline:=original.invoice_date+adjustment_rule.deadline_days;
    ELSIF invoiced AND adjustment_rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date((pg_catalog.date_part('year',original.invoice_date)::integer+
        CASE WHEN pg_catalog.date_part('month',original.invoice_date)>=4 THEN 1 ELSE 0 END),11,30);
      SELECT least(adjustment_deadline,min(filing.filed_at::date)) INTO adjustment_deadline
        FROM tax.returns filing JOIN tax.return_periods period ON period.org_id=filing.org_id AND period.id=filing.return_period_id
       WHERE filing.org_id=organization_id AND period.registration_id=original_tax.registration_id
         AND filing.return_type='gstr9' AND filing.status='filed'
         AND period.period_start<=original.invoice_date AND period.period_end>=original.invoice_date;
    END IF;
    IF tax_required AND adjustment_deadline IS NOT NULL AND header.return_date>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory GST adjustment is after the effective-rule deadline'; END IF;
    IF tax_required THEN
      PERFORM 1 FROM core.attachments evidence
       WHERE evidence.org_id=organization_id AND evidence.id=header.recipient_itc_reversal_evidence_attachment_id
         AND evidence.status IN ('verified','retained') AND evidence.verified_at IS NOT NULL
         AND evidence.verified_at<=header.recipient_itc_reversal_confirmed_at FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires verified recipient ITC-reversal evidence'; END IF;
    END IF;
    IF tax_required THEN
      SELECT count(*) INTO registration_scope_count
        FROM tax.registrations registration
        JOIN tax.registration_branches association
          ON association.org_id=registration.org_id
         AND association.registration_id=registration.id
       WHERE registration.org_id=organization_id
         AND registration.id=original_tax.registration_id
         AND registration.status='active'
         AND registration.effective_from<=header.return_date
         AND (registration.effective_to IS NULL OR registration.effective_to>=header.return_date)
         AND association.branch_id=header.branch_id
         AND association.status='active'
         AND association.effective_from<=header.return_date
         AND (association.effective_to IS NULL OR association.effective_to>=header.return_date);
      IF registration_scope_count<>1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory return requires exactly one active branch GST registration association on return date';
      END IF;
      PERFORM 1
        FROM tax.registrations registration
        JOIN tax.registration_branches association
          ON association.org_id=registration.org_id
         AND association.registration_id=registration.id
       WHERE registration.org_id=organization_id
         AND registration.id=original_tax.registration_id
         AND registration.status='active'
         AND registration.effective_from<=header.return_date
         AND (registration.effective_to IS NULL OR registration.effective_to>=header.return_date)
         AND association.branch_id=header.branch_id
         AND association.status='active'
         AND association.effective_from<=header.return_date
         AND (association.effective_to IS NULL OR association.effective_to>=header.return_date)
       FOR SHARE OF registration,association;
    END IF;
    SELECT account.party_id INTO STRICT party_id FROM parties.customer_accounts account WHERE account.org_id=organization_id AND account.id=header.customer_account_id AND account.status='active' FOR SHARE;
    SELECT * INTO STRICT artifact FROM calculation.artifacts WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
    input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
    IF artifact.sales_return_id IS DISTINCT FROM resource_id OR artifact.operation<>'sales.return.post' OR artifact.aggregate_version<>header.row_version THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed return artifact metadata mismatch'; END IF;
    PERFORM erp_commercial_commands.assert_sales_return_artifact(organization_id,resource_id,input_doc,output_doc);
    SELECT EXISTS(SELECT 1 FROM sales.return_lines WHERE org_id=organization_id AND return_id=resource_id AND disposition='return_to_stock') INTO inventory_required;
    IF inventory_required<>(inventory_document_id IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return inventory receipt ownership mismatch'; END IF;
    IF tax_required<>(tax_document_id IS NOT NULL) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return tax-document identity does not match statutory GST treatment'; END IF;
    IF inventory_document_id IS NOT NULL THEN
      PERFORM erp_commercial_commands.post_owned_inventory_document(
        organization_id,inventory_document_id,actor_id,'sales_return',resource_id,header.branch_id);
      SELECT coalesce(sum(CASE WHEN entry.entry_kind='issue' THEN -entry.value_delta ELSE entry.value_delta END),0),count(*)
        INTO inventory_value,inventory_entries FROM inventory.stock_ledger_entries entry
       WHERE entry.org_id=organization_id AND entry.inventory_document_id=inventory_document_id
         AND entry.entry_kind IN ('receipt');
      IF inventory_entries=0 OR inventory_value<=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return inventory document has no authoritative posted ledger value'; END IF;
    END IF;
    consumed:=erp_calculation_authority.consume_artifact(organization_id,artifact_id,'sales.return.post','sales_return',resource_id,header.row_version,request_id,command_request_id,claim_id);
    IF pg_catalog.convert_from(consumed,'UTF8')::jsonb IS DISTINCT FROM output_doc THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed return calculation changed'; END IF;
    IF invoiced THEN
      SELECT open_item.* INTO STRICT original_open FROM finance.accounting_events event JOIN finance.open_items open_item ON open_item.org_id=event.org_id AND open_item.accounting_event_id=event.id WHERE event.org_id=organization_id AND event.sales_invoice_id=header.invoice_id FOR UPDATE OF open_item;
      original_event_id:=original_open.accounting_event_id;
      SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted'
        AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id
          AND reversal.reversal_of_allocation_id=allocation.id)),0)
        INTO outstanding FROM finance.allocations allocation
       WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
      IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
    ELSE outstanding:=0; END IF;
    INSERT INTO finance.adjustment_notes(org_id,id,note_number,note_date,side,direction,party_id,sales_invoice_id,supplier_invoice_id,sales_return_id,purchase_return_id,adjusts_open_item_id,counterparty_portal_document_line_id,gst_adjustment_rule_version_id,gst_tax_treatment,recipient_itc_reversal_evidence_attachment_id,recipient_itc_reversal_confirmed_at,zero_rated_payment_mode,tax_charge_mechanism,currency_code,document_effect,rounding_policy,document_discount_kind,document_discount_basis,document_discount_value,calculation_ruleset_version,gross_price_amount,discount_amount,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,reason_code,reason,status,approved_at,approved_by_membership_id,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,adjustment_note_id,adjustment_note_number,header.return_date,'sales','credit',party_id,header.invoice_id,NULL,resource_id,NULL,CASE WHEN invoiced THEN original_open.id ELSE NULL END,NULL,header.gst_adjustment_rule_version_id,header.gst_tax_treatment,header.recipient_itc_reversal_evidence_attachment_id,header.recipient_itc_reversal_confirmed_at,header.zero_rated_payment_mode,header.tax_charge_mechanism,coalesce(original.currency_code,'INR'),'decrease',header.rounding_policy,'none','price_value',0,header.calculation_ruleset_version,(output_doc#>>'{totals,subtotal}')::numeric,(output_doc#>>'{totals,discount_total}')::numeric,header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,header.recipient_assessed_tax_total,header.rounding_adjustment,header.grand_total,header.reason_code,'Posted return','approved',posted_time,actor_id,actor_id,actor_id);
    INSERT INTO finance.adjustment_note_lines(org_id,id,adjustment_note_id,line_number,line_kind,product_id,account_id,sales_invoice_line_id,supplier_invoice_line_id,charge_code,quoted_amount,description,uom_code,billed_quantity,free_quantity,uom_conversion_factor,base_billed_quantity,base_free_quantity,free_supply_tax_treatment,quoted_unit_rate,price_basis,gross_amount,line_discount_kind,line_discount_basis,line_discount_value,document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,final_residual,gst_tax_treatment,discount_amount,net_value_amount,gst_taxable_value,hsn_sac_code,tax_code_version_id,taxability_snapshot,inventory_cost_treatment,itc_eligibility,tax_charge_mechanism,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,cess_amount,recipient_assessed_tax_amount,line_total,tax_ruleset_version,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),adjustment_note_id,return_adjustment_line.line_number,'product',return_adjustment_line.product_id,NULL,return_adjustment_line.invoice_line_id,NULL,NULL,NULL,'Return adjustment',source.uom_code,return_adjustment_line.billed_quantity,return_adjustment_line.free_quantity,return_adjustment_line.uom_conversion_factor,return_adjustment_line.base_billed_quantity,return_adjustment_line.base_free_quantity,return_adjustment_line.free_supply_tax_treatment,return_adjustment_line.quoted_unit_rate,return_adjustment_line.price_basis,(calculated.item->>'gross_amount')::numeric,'none','price_value',0,false,(calculated.item->>'line_discount_amount')::numeric,(calculated.item->>'line_taxable_discount_amount')::numeric,(calculated.item->>'document_discount_amount')::numeric,(calculated.item->>'document_taxable_discount_amount')::numeric,return_adjustment_line.final_residual,header.gst_tax_treatment,(calculated.item->>'line_discount_amount')::numeric+(calculated.item->>'document_discount_amount')::numeric,return_adjustment_line.net_value_amount,return_adjustment_line.gst_taxable_value,return_adjustment_line.hsn_code_snapshot,return_adjustment_line.tax_code_version_id,return_adjustment_line.taxability_snapshot,NULL,NULL,return_adjustment_line.tax_charge_mechanism,return_adjustment_line.cgst_rate,return_adjustment_line.sgst_rate,return_adjustment_line.igst_rate,return_adjustment_line.cess_rate,return_adjustment_line.cgst_amount,return_adjustment_line.sgst_amount,return_adjustment_line.igst_amount,return_adjustment_line.cess_amount,CASE WHEN return_adjustment_line.tax_charge_mechanism='reverse_charge' THEN return_adjustment_line.cgst_amount+return_adjustment_line.sgst_amount+return_adjustment_line.igst_amount+return_adjustment_line.cess_amount ELSE 0 END,return_adjustment_line.line_total,header.calculation_ruleset_version,actor_id
      FROM sales.return_lines return_adjustment_line
      JOIN pg_catalog.jsonb_array_elements(output_doc->'lines') calculated(item) ON calculated.item->>'line_id'=return_adjustment_line.invoice_line_id::text
      JOIN sales.invoice_lines source ON source.org_id=return_adjustment_line.org_id AND source.id=return_adjustment_line.invoice_line_id

     WHERE return_adjustment_line.org_id=organization_id AND return_adjustment_line.return_id=resource_id;
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,header.return_date,'sales_return',coalesce(original.currency_code,'INR'),'INR',1,header.grand_total,header.grand_total,header.grand_total,header.grand_total,'draft',actor_id,actor_id);
    party_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'accounts_receivable','asset',original.currency_code,true);
    PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,party_account,header.branch_id,party_id,'Receivable credit',0,header.grand_total,actor_id); line_no:=line_no+1;
    FOR posting_line IN SELECT return_line.net_value_amount,invoice_line.revenue_account_id FROM sales.return_lines return_line JOIN sales.invoice_lines invoice_line ON invoice_line.org_id=return_line.org_id AND invoice_line.id=return_line.invoice_line_id WHERE return_line.org_id=organization_id AND return_line.return_id=resource_id ORDER BY return_line.line_number LOOP
      PERFORM erp_commercial_commands.assert_line_account(organization_id,posting_line.revenue_account_id,'income',original.currency_code);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,posting_line.revenue_account_id,header.branch_id,NULL,'Revenue reversal',posting_line.net_value_amount,0,actor_id); line_no:=line_no+1;
    END LOOP;
    IF inventory_value>0 THEN
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'inventory_asset','asset',original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Returned inventory from posted ledger',inventory_value,0,actor_id); line_no:=line_no+1;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,'cost_of_goods_sold','expense',original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'COGS reversal from posted ledger',0,inventory_value,actor_id); line_no:=line_no+1;
    END IF;
    FOR role_key,component_amount IN SELECT * FROM (VALUES ('output_cgst'::varchar,header.cgst_total),('output_sgst'::varchar,header.sgst_total),('output_igst'::varchar,header.igst_total),('output_cess'::varchar,header.cess_total)) x(role_key,amount) LOOP
      IF invoiced AND component_amount>0 AND header.tax_charge_mechanism='normal' THEN
        role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,'liability',coalesce(original.currency_code,'INR'),false);
        PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Tax reversal',component_amount,0,actor_id); line_no:=line_no+1;
      END IF;
    END LOOP;

    IF invoiced AND header.rounding_adjustment<>0 THEN
      role_key:=CASE WHEN header.rounding_adjustment>0 THEN 'rounding_gain' ELSE 'rounding_loss' END;
      role_account:=erp_commercial_commands.resolve_role_account(organization_id,header.branch_id,role_key,CASE WHEN role_key='rounding_gain' THEN 'income' ELSE 'expense' END,original.currency_code,false);
      PERFORM erp_commercial_commands.add_journal_line(organization_id,journal_id,line_no,role_account,header.branch_id,NULL,'Rounding reversal',
        CASE WHEN header.rounding_adjustment>0 THEN abs(header.rounding_adjustment) ELSE 0 END,
        CASE WHEN header.rounding_adjustment<0 THEN abs(header.rounding_adjustment) ELSE 0 END,actor_id); line_no:=line_no+1;
    END IF;
    SELECT coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0) INTO debit_total,credit_total FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
    IF debit_total<>credit_total OR debit_total=0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return journal is not balanced'; END IF;
    UPDATE finance.journal_entries SET transaction_debit_total=debit_total,transaction_credit_total=credit_total,functional_debit_total=debit_total,functional_credit_total=credit_total,status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=journal_id;
    UPDATE sales.returns SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=resource_id AND status='draft';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='return posting state changed'; END IF;
    UPDATE finance.adjustment_notes SET status='posted',posted_at=posted_time,posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,row_version=row_version+1 WHERE org_id=organization_id AND id=adjustment_note_id;

    IF tax_required THEN
      INSERT INTO tax.documents(org_id,id,registration_id,adjustment_note_id,document_class,document_number,document_date,direction,
        counterparty_party_id,counterparty_gstin,place_of_supply_state_code,supply_type,zero_rated_payment_mode,tax_charge_mechanism,
        tax_liability_party,document_effect,adjusts_tax_document_id,currency_code,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,
        igst_amount,cess_amount,self_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,tax_ruleset_version,tax_ruleset_effective_date,
        source_hash,posted_at,created_by_membership_id)
      VALUES(organization_id,tax_document_id,original_tax.registration_id,adjustment_note_id,'adjustment_note',header.return_number,header.return_date,
        original_tax.direction,party_id,original_tax.counterparty_gstin,original_tax.place_of_supply_state_code,original_tax.supply_type,
        header.zero_rated_payment_mode,header.tax_charge_mechanism,original_tax.tax_liability_party,'decrease',original_tax.id,original_tax.currency_code,
        header.net_value_total,header.gst_taxable_total,header.cgst_total,header.sgst_total,header.igst_total,header.cess_total,
        CASE WHEN original_tax.direction='inward' AND header.tax_charge_mechanism='reverse_charge' THEN header.recipient_assessed_tax_total ELSE 0 END,
        header.rounding_adjustment,header.grand_total,header.calculation_ruleset_version,original_tax.tax_ruleset_effective_date,
        extensions.digest(pg_catalog.convert_to((output_doc||pg_catalog.jsonb_build_object('return_id',resource_id))::text,'UTF8'),'sha256'),posted_time,actor_id);
    ELSIF tax_document_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only return cannot create tax document'; END IF;
    INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,occurred_at,source_posted_at,created_by_membership_id) VALUES(organization_id,event_id,'adjustment_note',adjustment_note_id,journal_id,posted_time,posted_time,actor_id);
    IF invoiced THEN
      applied:=least(header.grand_total,outstanding); residual:=header.grand_total-applied;
      IF applied>0 THEN INSERT INTO finance.allocations(org_id,id,adjustment_note_id,open_item_id,allocation_date,currency_code,amount,functional_amount,status,created_by_membership_id) VALUES(organization_id,allocation_id,adjustment_note_id,original_open.id,header.return_date,original_open.currency_code,applied,applied,'posted',actor_id); END IF;
      IF applied>0 THEN PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,original_open.id); END IF;
      IF residual>0 THEN INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,currency_code,principal_amount,functional_principal_amount,status,created_by_membership_id) VALUES(organization_id,residual_open_item_id,event_id,party_id,'payable',adjustment_note_number,header.return_date,header.return_date,original_open.currency_code,residual,residual,'open',actor_id); END IF;
    END IF;
    PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'sales.returns',resource_id);
    RETURN resource_id;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_sales_return"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_sales_return"(uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE advance procurement.purchase_order_advance_allocations%ROWTYPE;
        invoice_line procurement.supplier_invoice_lines%ROWTYPE;
        invoice procurement.supplier_invoices%ROWTYPE; advance_item finance.open_items%ROWTYPE;
        invoice_item finance.open_items%ROWTYPE; actor uuid; payable_account uuid; prepayment_account uuid;
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); existing_event uuid;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR NOT erp_security.has_permission('finance.payment.manage',NULL::uuid)
       OR NOT erp_security.has_permission('finance.journal.post',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier advance application permission denied';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||advance_allocation_id::text,672003));
    SELECT id INTO existing_event FROM finance.accounting_events
     WHERE org_id=organization_id AND purchase_order_advance_allocation_id=advance_allocation_id;
    IF existing_event=event_id THEN RETURN advance_allocation_id; END IF;
    IF existing_event IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier advance was already applied'; END IF;
    SELECT * INTO STRICT advance FROM procurement.purchase_order_advance_allocations
     WHERE org_id=organization_id AND id=advance_allocation_id FOR UPDATE;
    SELECT * INTO STRICT advance_item FROM finance.open_items
     WHERE org_id=organization_id AND id=advance.prepayment_open_item_id FOR UPDATE;
    SELECT * INTO STRICT invoice_line FROM procurement.supplier_invoice_lines
     WHERE org_id=organization_id AND id=supplier_invoice_line_id FOR SHARE;
    SELECT * INTO STRICT invoice FROM procurement.supplier_invoices
     WHERE org_id=organization_id AND id=invoice_line.supplier_invoice_id FOR SHARE;
    SELECT * INTO STRICT invoice_item FROM finance.open_items
     WHERE org_id=organization_id AND id=invoice_open_item_id FOR UPDATE;
    IF advance.status<>'posted' OR advance.reversal_of_allocation_id IS NOT NULL
       OR advance_item.status<>'open' OR advance_item.item_side<>'receivable'
       OR advance_item.principal_amount<>advance.gross_advance_amount
       OR invoice.status<>'posted' OR invoice_line.line_kind<>'product'
       OR invoice_line.purchase_order_line_id IS DISTINCT FROM advance.purchase_order_line_id
       OR invoice.supplier_account_id IS DISTINCT FROM advance.supplier_account_id
       OR invoice.branch_id IS DISTINCT FROM advance.branch_id
       OR invoice_item.status<>'open' OR invoice_item.item_side<>'payable'
       OR invoice_item.party_id IS DISTINCT FROM advance_item.party_id
       OR invoice_item.currency_code<>'INR' OR invoice_item.principal_amount<advance.gross_advance_amount
       OR invoice_line.net_value_amount<advance.gross_advance_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance and posted invoice provenance do not match';
    END IF;
    IF EXISTS (SELECT 1 FROM tax.withholding_basis_lines invoice_basis
                WHERE invoice_basis.org_id=organization_id
                  AND invoice_basis.supplier_invoice_line_id=supplier_invoice_line_id)
       AND advance.withholding_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice line already has withholding basis for an earlier paid advance';
    END IF;
    payable_account:=erp_commercial_commands.resolve_role_account(
      organization_id,advance.branch_id,'accounts_payable','liability','INR',true);
    prepayment_account:=erp_commercial_commands.resolve_role_account(
      organization_id,advance.branch_id,'supplier_prepayment','asset','INR',true);
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,
      transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,
      functional_debit_total,functional_credit_total,status,created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,journal_id,journal_number,invoice.invoice_date,'Supplier advance application','INR','INR',1,
      advance.gross_advance_amount,advance.gross_advance_amount,advance.functional_gross_advance_amount,
      advance.functional_gross_advance_amount,'draft',actor,actor);
    INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,
      description,transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
    VALUES
      (organization_id,gen_random_uuid(),journal_id,1,payable_account,advance.branch_id,advance_item.party_id,
       'Apply supplier prepayment',advance.gross_advance_amount,0,advance.functional_gross_advance_amount,0,actor),
      (organization_id,gen_random_uuid(),journal_id,2,prepayment_account,advance.branch_id,advance_item.party_id,
       'Clear supplier prepayment',0,advance.gross_advance_amount,0,advance.functional_gross_advance_amount,actor);
    UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
      updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,purchase_order_advance_allocation_id,journal_entry_id,
      occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,event_id,'supplier_advance_application',advance.id,journal_id,posted_time,invoice.posted_at,actor);
    INSERT INTO finance.allocations(org_id,id,purchase_order_advance_allocation_id,open_item_id,allocation_date,
      currency_code,amount,functional_amount,fx_rate,status,created_by_membership_id)
    VALUES(organization_id,allocation_id,advance.id,invoice_item.id,invoice.invoice_date,'INR',advance.gross_advance_amount,
      advance.functional_gross_advance_amount,1,'posted',actor);
    PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,invoice_item.id);
    UPDATE finance.open_items SET status='settled',settled_at=posted_time
     WHERE org_id=organization_id AND id=advance_item.id AND status='open';
    RETURN advance_allocation_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."mark_journal_reversed"(organization_id uuid, original_journal_id uuid, reversal_journal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE original finance.journal_entries%ROWTYPE; reversal finance.journal_entries%ROWTYPE;
        actor uuid:=erp_security.current_membership_id();
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id() OR actor IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='journal reversal organization or actor context is invalid';
    END IF;
    SELECT * INTO STRICT original FROM finance.journal_entries
     WHERE org_id=organization_id AND id=original_journal_id FOR UPDATE;
    SELECT * INTO STRICT reversal FROM finance.journal_entries
     WHERE org_id=organization_id AND id=reversal_journal_id FOR SHARE;
    IF original.status='reversed' THEN
      IF reversal.status='posted' AND reversal.reversal_of_journal_entry_id=original.id THEN RETURN; END IF;
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal reversal replay differs from posted evidence';
    END IF;
    IF original.status<>'posted' OR reversal.status<>'posted'
       OR reversal.reversal_of_journal_entry_id IS DISTINCT FROM original.id
       OR ROW(reversal.transaction_currency,reversal.functional_currency,reversal.fx_rate,
              reversal.transaction_debit_total,reversal.transaction_credit_total,
              reversal.functional_debit_total,reversal.functional_credit_total)
          IS DISTINCT FROM ROW(original.transaction_currency,original.functional_currency,original.fx_rate,
              original.transaction_credit_total,original.transaction_debit_total,
              original.functional_credit_total,original.functional_debit_total)
       OR EXISTS (SELECT 1 FROM finance.journal_lines old_line
          FULL JOIN finance.journal_lines new_line
            ON new_line.org_id=organization_id AND new_line.journal_entry_id=reversal.id
           AND new_line.line_number=old_line.line_number
         WHERE old_line.org_id=organization_id AND old_line.journal_entry_id=original.id
           AND (new_line.id IS NULL OR ROW(new_line.account_id,new_line.branch_id,new_line.party_id,
                  new_line.transaction_debit,new_line.transaction_credit,new_line.functional_debit,new_line.functional_credit)
             IS DISTINCT FROM ROW(old_line.account_id,old_line.branch_id,old_line.party_id,
                  old_line.transaction_credit,old_line.transaction_debit,old_line.functional_credit,old_line.functional_debit)))
       OR (SELECT count(*) FROM finance.journal_lines
            WHERE org_id=organization_id AND journal_entry_id=reversal.id)
          <> (SELECT count(*) FROM finance.journal_lines
            WHERE org_id=organization_id AND journal_entry_id=original.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal reversal command requires an exact posted sign inversion';
    END IF;
    UPDATE finance.journal_entries SET status='reversed',updated_at=pg_catalog.transaction_timestamp(),
      updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=original.id AND status='posted';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='original journal changed before reversal transition'; END IF;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."mark_journal_reversed"(organization_id uuid, original_journal_id uuid, reversal_journal_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."mark_journal_reversed"(organization_id uuid, original_journal_id uuid, reversal_journal_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."reverse_payment"(organization_id uuid, original_payment_id uuid, reversal_payment_id uuid, reversal_payment_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE original finance.payments%ROWTYPE; original_journal finance.journal_entries%ROWTYPE;
        actor uuid; reversed_time timestamptz; existing uuid; advance record; allocation_item record;
        reversal_withholding_id uuid; reversal_open_item_id uuid;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR reason IS NULL OR pg_catalog.btrim(reason)='' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment reversal permission or reason missing';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||original_payment_id::text,672002));
    SELECT * INTO original FROM finance.payments WHERE org_id=organization_id AND id=original_payment_id FOR UPDATE;
    SELECT id INTO existing FROM finance.payments WHERE org_id=organization_id AND reversal_of_payment_id=original_payment_id;
    IF existing=reversal_payment_id AND original.status='reversed' THEN RETURN reversal_payment_id; END IF;
    IF original.status<>'posted' OR original.reversal_of_payment_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an unreversed posted payment may be reversed';
    END IF;
    IF NOT erp_security.can_access_branch(original.branch_id)
       OR NOT erp_security.has_permission('finance.payment.manage',original.branch_id)
       OR NOT erp_security.has_permission('finance.journal.post',original.branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment reversal branch permission denied';
    END IF;
    IF original.payment_purpose='withholding_deposit' AND EXISTS(
      SELECT 1 FROM tax.withholding_deposits deposit
       WHERE deposit.org_id=organization_id AND deposit.payment_id=original_payment_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory deposit payment is retained after challan allocation; use a typed refund deposit correction';
    END IF;
    SELECT journal.* INTO original_journal FROM finance.accounting_events event
      JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
     WHERE event.org_id=organization_id AND event.payment_id=original_payment_id FOR UPDATE OF journal;
    IF original_journal.status<>'posted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original payment journal is not posted'; END IF;
    reversed_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "erp_finance_commands"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'payment',organization_id,original_payment_id),
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'payment',organization_id,reversal_payment_id);
    INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,
      bank_account_id,settlement_account_id,
      payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,memo,
      reversal_of_payment_id,reversal_reason,status,approved_at,approved_by_membership_id,
      created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,reversal_payment_id,reversal_payment_number,original.payment_date,
      CASE original.direction WHEN 'receipt' THEN 'disbursement' ELSE 'receipt' END,
      original.party_id,original.branch_id,original.bank_account_id,original.settlement_account_id,
      original.payment_method,original.payment_purpose,original.currency_code,
      original.amount,original.functional_amount,original.fx_rate,original.external_reference,
      original.memo,original_payment_id,reason,'approved',reversed_time,actor,actor,actor);
    INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,
      transaction_currency,functional_currency,fx_rate,transaction_debit_total,transaction_credit_total,
      functional_debit_total,functional_credit_total,reversal_of_journal_entry_id,reversal_reason,status,
      created_by_membership_id,updated_by_membership_id)
    VALUES(organization_id,reversal_journal_id,reversal_journal_number,original_journal.posting_date,
      'Payment reversal: '||reason,original_journal.transaction_currency,original_journal.functional_currency,
      original_journal.fx_rate,original_journal.transaction_credit_total,original_journal.transaction_debit_total,
      original_journal.functional_credit_total,original_journal.functional_debit_total,
      original_journal.id,reason,'draft',actor,actor);
    INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,
      description,transaction_debit,transaction_credit,functional_debit,functional_credit,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),reversal_journal_id,line_number,account_id,branch_id,party_id,
      description,transaction_credit,transaction_debit,functional_credit,functional_debit,actor
      FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=original_journal.id ORDER BY line_number;
    UPDATE finance.journal_entries SET status='posted',posted_at=reversed_time,posted_by_membership_id=actor,
      updated_at=reversed_time,updated_by_membership_id=actor,row_version=row_version+1
      WHERE org_id=organization_id AND id=reversal_journal_id;
    PERFORM "erp_finance_commands"."mark_journal_reversed"(
      organization_id,original_journal.id,reversal_journal_id);
    UPDATE finance.payments SET status='posted',posted_at=reversed_time,posted_by_membership_id=actor,
      updated_at=reversed_time,updated_by_membership_id=actor,row_version=row_version+1
      WHERE org_id=organization_id AND id=reversal_payment_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,payment_id,journal_entry_id,
      occurred_at,source_posted_at,created_by_membership_id)
    VALUES(organization_id,reversal_event_id,'payment',reversal_payment_id,reversal_journal_id,
      reversed_time,reversed_time,actor);
    INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
      amount,functional_amount,fx_rate,reversal_of_allocation_id,reversal_reason,status,reversed_at,
      reversed_by_membership_id,created_by_membership_id)
    SELECT organization_id,gen_random_uuid(),allocation.payment_id,allocation.open_item_id,
      original.payment_date,allocation.currency_code,allocation.amount,allocation.functional_amount,
      allocation.fx_rate,allocation.id,reason,'reversed',reversed_time,actor,actor
      FROM finance.allocations allocation
     WHERE allocation.org_id=organization_id AND allocation.payment_id=original_payment_id
       AND allocation.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal
                        WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id);
    FOR allocation_item IN SELECT DISTINCT allocation.open_item_id
      FROM finance.allocations allocation
     WHERE allocation.org_id=organization_id AND allocation.payment_id=original_payment_id LOOP
      PERFORM erp_finance_commands.synchronize_open_item_status(
        organization_id,allocation_item.open_item_id);
    END LOOP;
    FOR advance IN SELECT * FROM procurement.purchase_order_advance_allocations a
      WHERE a.org_id=organization_id AND a.payment_id=original_payment_id AND a.status='posted' FOR UPDATE LOOP
      PERFORM erp_compliance_commands.assert_advance_withholding_reversible(organization_id,advance.id);
      reversal_withholding_id:=NULL;
      IF advance.withholding_id IS NOT NULL THEN
        reversal_withholding_id:=gen_random_uuid();
        PERFORM erp_compliance_commands.reverse_withholding(
          organization_id,advance.withholding_id,reversal_withholding_id,actor,gen_random_uuid(),gen_random_uuid(),NULL::uuid,
          reason,extensions.digest(pg_catalog.convert_to('advance-reversal:'||advance.id::text,'UTF8'),'sha256'),
          extensions.digest(pg_catalog.convert_to(reason||':'||advance.id::text,'UTF8'),'sha256'),reversed_time+interval '1 hour');
      END IF;
      reversal_open_item_id:=gen_random_uuid();
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,document_date,due_date,
        currency_code,principal_amount,functional_principal_amount,status,reversed_at,created_by_membership_id)
      VALUES(organization_id,reversal_open_item_id,reversal_event_id,original.party_id,'receivable',reversal_payment_number,
        original.payment_date,original.payment_date,'INR',advance.gross_advance_amount,advance.gross_advance_amount,'reversed',reversed_time,actor);
      INSERT INTO procurement.purchase_order_advance_allocations(org_id,id,payment_id,purchase_order_line_id,supplier_account_id,
        branch_id,cash_disbursed_amount,withheld_amount,gross_advance_amount,functional_gross_advance_amount,allocation_date,
        prepayment_open_item_id,withholding_id,reversal_of_allocation_id,reversal_reason,status,created_by_membership_id)
      VALUES(organization_id,gen_random_uuid(),reversal_payment_id,advance.purchase_order_line_id,advance.supplier_account_id,
        advance.branch_id,advance.cash_disbursed_amount,advance.withheld_amount,advance.gross_advance_amount,
        advance.functional_gross_advance_amount,original.payment_date,reversal_open_item_id,reversal_withholding_id,
        advance.id,reason,'reversed',actor);
      UPDATE finance.open_items SET status='reversed',reversed_at=reversed_time
       WHERE org_id=organization_id AND id=advance.prepayment_open_item_id AND status='open';
    END LOOP;
    UPDATE finance.payments SET status='reversed',updated_at=reversed_time,
      updated_by_membership_id=actor,row_version=row_version+1
      WHERE org_id=organization_id AND id=original_payment_id;
    DELETE FROM "erp_finance_commands"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='payment' AND org_id=organization_id
      AND entity_id IN (original_payment_id,reversal_payment_id);
    RETURN reversal_payment_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."reverse_payment"(organization_id uuid, original_payment_id uuid, reversal_payment_id uuid, reversal_payment_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reason text) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."reverse_payment"(organization_id uuid, original_payment_id uuid, reversal_payment_id uuid, reversal_payment_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reason text) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."synchronize_open_item_status"(organization_id uuid, open_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE item finance.open_items%ROWTYPE; active_total numeric(20,2);
BEGIN
    SELECT * INTO STRICT item FROM finance.open_items
     WHERE org_id=organization_id AND id=open_item_id FOR UPDATE;
    IF item.status='reversed' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reversed open item cannot be settled or reopened';
    END IF;
    SELECT coalesce(sum(allocation.amount),0) INTO active_total
      FROM finance.allocations allocation
     WHERE allocation.org_id=organization_id
       AND (allocation.open_item_id=open_item_id OR allocation.source_open_item_id=open_item_id)
       AND allocation.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal
         WHERE reversal.org_id=allocation.org_id
           AND reversal.reversal_of_allocation_id=allocation.id);
    IF active_total>item.principal_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item is overallocated';
    END IF;
    UPDATE finance.open_items
       SET status=CASE WHEN active_total=item.principal_amount THEN 'settled' ELSE 'open' END,
           settled_at=CASE WHEN active_total=item.principal_amount
             THEN coalesce(item.settled_at,pg_catalog.transaction_timestamp()) ELSE NULL END
     WHERE org_id=organization_id AND id=open_item_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."synchronize_open_item_status"(organization_id uuid, open_item_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."synchronize_open_item_status"(organization_id uuid, open_item_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_invariants"."guard_allocation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE item finance.open_items%ROWTYPE; payment finance.payments%ROWTYPE; withholding tax.withholdings%ROWTYPE;
        adjustment finance.adjustment_notes%ROWTYPE; advance procurement.purchase_order_advance_allocations%ROWTYPE;
        source_item finance.open_items%ROWTYPE; original finance.allocations%ROWTYPE;
        allocated numeric(20,2); source_allocated numeric(20,2);
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocations are append-only'; END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text||NEW.open_item_id::text,671002));
    SELECT * INTO item FROM finance.open_items WHERE org_id=NEW.org_id AND id=NEW.open_item_id FOR UPDATE;
    IF NOT FOUND OR item.status='reversed' OR item.currency_code<>NEW.currency_code THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocation requires a compatible live open item';
    END IF;
    IF NEW.reversal_of_allocation_id IS NOT NULL THEN
        SELECT * INTO original FROM finance.allocations WHERE org_id=NEW.org_id AND id=NEW.reversal_of_allocation_id FOR UPDATE;
        IF NOT FOUND OR original.status<>'posted' OR ROW(NEW.payment_id,NEW.withholding_id,NEW.adjustment_note_id,NEW.purchase_order_advance_allocation_id,NEW.source_open_item_id,NEW.open_item_id,
           NEW.currency_code,NEW.amount,NEW.functional_amount,NEW.fx_rate) IS DISTINCT FROM ROW(original.payment_id,
           original.withholding_id,original.adjustment_note_id,original.purchase_order_advance_allocation_id,original.source_open_item_id,original.open_item_id,original.currency_code,original.amount,original.functional_amount,original.fx_rate) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='allocation reversal must copy the original settlement facts';
        END IF;
        IF original.adjustment_note_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment allocation reversal requires the reviewed compensating-note command';
        END IF;
    ELSIF NEW.payment_id IS NOT NULL THEN
        SELECT * INTO payment FROM finance.payments WHERE org_id=NEW.org_id AND id=NEW.payment_id FOR UPDATE;
        IF NOT FOUND OR payment.status<>'posted' OR payment.party_id<>item.party_id OR payment.currency_code<>item.currency_code
           OR (payment.direction='receipt') IS DISTINCT FROM (item.item_side='receivable') THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment is incompatible with open item';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations AS a
         WHERE a.org_id=NEW.org_id AND a.payment_id=NEW.payment_id AND a.status='posted'
           AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>payment.amount THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment over-allocation'; END IF;
    ELSIF NEW.adjustment_note_id IS NOT NULL THEN
        SELECT * INTO adjustment FROM finance.adjustment_notes WHERE org_id=NEW.org_id AND id=NEW.adjustment_note_id FOR UPDATE;
        IF NOT FOUND OR adjustment.status<>'posted' OR adjustment.adjusts_open_item_id<>item.id
           OR adjustment.party_id<>item.party_id OR adjustment.currency_code<>item.currency_code THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment note is incompatible with open item';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations AS a
         WHERE a.org_id=NEW.org_id AND a.adjustment_note_id=NEW.adjustment_note_id AND a.status='posted'
           AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>adjustment.counterparty_payable_amount THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment note over-allocation';
        END IF;
    ELSIF NEW.purchase_order_advance_allocation_id IS NOT NULL THEN
        SELECT * INTO advance FROM procurement.purchase_order_advance_allocations
         WHERE org_id=NEW.org_id AND id=NEW.purchase_order_advance_allocation_id FOR UPDATE;
        IF NOT FOUND OR advance.status<>'posted' OR item.item_side<>'payable' OR item.currency_code<>'INR'
           OR NOT EXISTS(SELECT 1 FROM parties.supplier_accounts supplier WHERE supplier.org_id=NEW.org_id
                         AND supplier.id=advance.supplier_account_id AND supplier.party_id=item.party_id) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance is incompatible with payable';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations a
         WHERE a.org_id=NEW.org_id AND a.purchase_order_advance_allocation_id=advance.id AND a.status='posted'
           AND NOT EXISTS(SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>advance.gross_advance_amount THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance over-application'; END IF;
    ELSIF NEW.source_open_item_id IS NOT NULL THEN
        SELECT * INTO source_item FROM finance.open_items
         WHERE org_id=NEW.org_id AND id=NEW.source_open_item_id FOR UPDATE;
        SELECT note.* INTO adjustment FROM finance.accounting_events event
          JOIN finance.adjustment_notes note
            ON note.org_id=event.org_id AND note.id=event.adjustment_note_id
         WHERE event.org_id=NEW.org_id AND event.id=source_item.accounting_event_id
           AND event.event_type='adjustment_note' FOR SHARE OF note;
        IF NOT FOUND OR source_item.status<>'open' OR source_item.id=item.id
           OR source_item.party_id<>item.party_id OR source_item.currency_code<>item.currency_code
           OR source_item.item_side=item.item_side OR adjustment.status<>'posted'
           OR adjustment.party_id<>source_item.party_id
           OR adjustment.counterparty_payable_amount<source_item.principal_amount THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='residual adjustment open item is incompatible with target open item';
        END IF;
        SELECT coalesce(sum(a.amount),0) INTO source_allocated FROM finance.allocations a
         WHERE a.org_id=NEW.org_id AND a.source_open_item_id=source_item.id AND a.status='posted'
           AND NOT EXISTS (SELECT 1 FROM finance.allocations r
             WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
        IF source_allocated>source_item.principal_amount THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='residual adjustment open item over-allocation';
        END IF;
    ELSE
        SELECT * INTO withholding FROM tax.withholdings WHERE org_id=NEW.org_id AND id=NEW.withholding_id FOR UPDATE;
        IF NOT FOUND OR withholding.status<>'deducted' OR withholding.open_item_id<>item.id
           OR withholding.counterparty_party_id<>item.party_id OR withholding.currency_code<>item.currency_code
           OR NEW.amount<>withholding.withheld_amount THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding is incompatible with open item';
        END IF;
    END IF;
    SELECT coalesce(sum(a.amount),0) INTO allocated FROM finance.allocations AS a
     WHERE a.org_id=NEW.org_id AND a.open_item_id=NEW.open_item_id AND a.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
    IF NEW.reversal_of_allocation_id IS NULL AND allocated>item.principal_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item over-allocation';
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_finance_invariants"."guard_allocation"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_invariants"."guard_allocation"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_invariants"."guard_journal_entry"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE line_count bigint; td numeric(20,2); tc numeric(20,2); fd numeric(20,2); fc numeric(20,2); original finance.journal_entries%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal must be composed from draft';
    END IF;
    IF TG_OP = 'DELETE' AND OLD.status <> 'draft' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'non-draft journal is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('posted','reversed','cancelled') AND ROW(
       NEW.journal_number,NEW.posting_date,NEW.transaction_currency,NEW.functional_currency,NEW.fx_rate,
       NEW.transaction_debit_total,NEW.transaction_credit_total,NEW.functional_debit_total,
       NEW.functional_credit_total,NEW.reversal_of_journal_entry_id,NEW.posted_at,NEW.posted_by_membership_id
    ) IS DISTINCT FROM ROW(
       OLD.journal_number,OLD.posting_date,OLD.transaction_currency,OLD.functional_currency,OLD.fx_rate,
       OLD.transaction_debit_total,OLD.transaction_credit_total,OLD.functional_debit_total,
       OLD.functional_credit_total,OLD.reversal_of_journal_entry_id,OLD.posted_at,OLD.posted_by_membership_id
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted journal financial fields are immutable'; END IF;
    IF TG_OP='UPDATE' AND ((OLD.status='draft' AND NEW.status NOT IN ('draft','posted','cancelled'))
       OR (OLD.status='posted' AND NEW.status NOT IN ('posted','reversed'))
       OR (OLD.status IN ('reversed','cancelled') AND NEW.status<>OLD.status)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid journal lifecycle transition';
    END IF;
    IF NEW.status = 'posted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'posted') THEN
        SELECT count(*),coalesce(sum(transaction_debit),0),coalesce(sum(transaction_credit),0),
               coalesce(sum(functional_debit),0),coalesce(sum(functional_credit),0)
          INTO line_count,td,tc,fd,fc FROM finance.journal_lines
         WHERE org_id=NEW.org_id AND journal_entry_id=NEW.id;
        IF line_count < 2 OR ROW(td,tc,fd,fc) IS DISTINCT FROM ROW(NEW.transaction_debit_total,
           NEW.transaction_credit_total,NEW.functional_debit_total,NEW.functional_credit_total)
           OR td<>tc OR fd<>fc OR EXISTS (
             SELECT 1 FROM finance.journal_lines WHERE org_id=NEW.org_id AND journal_entry_id=NEW.id
              AND (functional_debit<>round(transaction_debit*NEW.fx_rate,2)
                   OR functional_credit<>round(transaction_credit*NEW.fx_rate,2))) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal lines do not exactly balance and reconcile to header/fx';
        END IF;
        IF NEW.reversal_of_journal_entry_id IS NOT NULL THEN
            SELECT * INTO original FROM finance.journal_entries WHERE org_id=NEW.org_id AND id=NEW.reversal_of_journal_entry_id FOR UPDATE;
            IF NOT FOUND OR original.status<>'posted' OR original.transaction_currency<>NEW.transaction_currency
               OR original.functional_currency<>NEW.functional_currency OR original.fx_rate<>NEW.fx_rate
               OR EXISTS (SELECT 1 FROM finance.journal_lines AS old_line FULL JOIN finance.journal_lines AS new_line
                    ON new_line.org_id=NEW.org_id AND new_line.journal_entry_id=NEW.id AND new_line.line_number=old_line.line_number
                   WHERE old_line.org_id=NEW.org_id AND old_line.journal_entry_id=original.id
                     AND (new_line.id IS NULL OR ROW(new_line.account_id,new_line.branch_id,new_line.party_id,new_line.transaction_debit,new_line.transaction_credit,new_line.functional_debit,new_line.functional_credit)
                       IS DISTINCT FROM ROW(old_line.account_id,old_line.branch_id,old_line.party_id,old_line.transaction_credit,old_line.transaction_debit,old_line.functional_credit,old_line.functional_debit)))
               OR (SELECT count(*) FROM finance.journal_lines WHERE org_id=NEW.org_id AND journal_entry_id=NEW.id)
                  <> (SELECT count(*) FROM finance.journal_lines WHERE org_id=NEW.org_id AND journal_entry_id=original.id) THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal reversal is not an exact sign inversion';
            END IF;
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND NEW.status='reversed' AND OLD.status<>'reversed'
       AND NOT EXISTS (SELECT 1 FROM finance.journal_entries AS reversal WHERE reversal.org_id=NEW.org_id
                        AND reversal.reversal_of_journal_entry_id=NEW.id AND reversal.status='posted') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='journal can be reversed only by a posted compensating journal';
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_finance_invariants"."guard_journal_entry"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_invariants"."guard_journal_entry"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_invariants"."guard_open_item"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE allocated numeric(20,2); event_journal_status text;
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open items are retained'; END IF;
    IF TG_OP='INSERT' AND (NEW.status<>'open' OR NEW.settled_at IS NOT NULL OR NEW.reversed_at IS NOT NULL) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new open item must start open';
    END IF;
    IF TG_OP='UPDATE' AND ROW(NEW.accounting_event_id,NEW.party_id,NEW.item_side,NEW.currency_code,
       NEW.principal_amount,NEW.functional_principal_amount) IS DISTINCT FROM ROW(OLD.accounting_event_id,
       OLD.party_id,OLD.item_side,OLD.currency_code,OLD.principal_amount,OLD.functional_principal_amount) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item financial facts are immutable';
    END IF;
    SELECT coalesce(sum(a.amount),0) INTO allocated FROM finance.allocations AS a
     WHERE a.org_id=NEW.org_id
       AND (a.open_item_id=NEW.id OR a.source_open_item_id=NEW.id) AND a.status='posted'
       AND NOT EXISTS (SELECT 1 FROM finance.allocations AS r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
    IF allocated>NEW.principal_amount OR (NEW.status='settled') IS DISTINCT FROM (allocated=NEW.principal_amount) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item status does not match active allocation total';
    END IF;
    IF NEW.status='reversed' THEN
        SELECT journal.status INTO event_journal_status FROM finance.accounting_events AS event
        JOIN finance.journal_entries AS journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id
        WHERE event.org_id=NEW.org_id AND event.id=NEW.accounting_event_id;
        IF event_journal_status IS DISTINCT FROM 'reversed' THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='open item reversal requires a reversed source journal';
        END IF;
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_finance_invariants"."guard_open_item"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_invariants"."guard_open_item"() FROM PUBLIC, "erp_app", "erp_runtime";

RESET ROLE;
