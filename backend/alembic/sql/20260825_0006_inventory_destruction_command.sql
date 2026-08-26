SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_inventory_destruction_prepare"(
  organization_id uuid, membership_id uuid, auth_user_id uuid,
  application_user_id uuid, grant_id uuid, caller_client_id varchar,
  destruction_id uuid, inventory_document_id uuid, request_document jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        destruction_date date:=NULLIF(request_document->>'destruction_date','')::date;
        confirmed_at timestamptz:=NULLIF(request_document->>'physical_destruction_confirmed_at','')::timestamptz;
        location_id uuid:=NULLIF(request_document->>'location_id','')::uuid;
        certificate_id uuid:=NULLIF(request_document->>'certificate_attachment_id','')::uuid;
        organization core.organizations%ROWTYPE; branch core.branches%ROWTYPE;
        location inventory.locations%ROWTYPE; certificate core.attachments%ROWTYPE;
        product catalog.products%ROWTYPE; conversion catalog.uom_conversions%ROWTYPE;
        batch inventory.batches%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        last_ledger inventory.stock_ledger_entries%ROWTYPE;
        inventory_account finance.accounts%ROWTYPE; loss_account finance.accounts%ROWTYPE;
        requested_line jsonb; allocation jsonb; resolved_lines jsonb:='[]'::jsonb;
        source_versions jsonb:='[]'::jsonb; base_quantity numeric(20,6);
        extended_cost numeric(20,2); total_base numeric(20,6):=0;
        total_value numeric(20,2):=0; line_no integer:=0; pending_count integer;
        medicine_count integer:=0; license_type_count integer; license_sources jsonb;
        conversion_version_hash text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL
     OR application_user_id IS NULL OR grant_id IS NULL OR destruction_id IS NULL
     OR inventory_document_id IS NULL OR branch_id IS NULL OR destruction_date IS NULL
     OR confirmed_at IS NULL OR location_id IS NULL OR certificate_id IS NULL
     OR request_document->>'method_code'<>'licensed_incineration'
     OR request_document->>'reason_code' NOT IN ('expired','damaged','quality_rejected')
     OR request_document->>'itc_treatment'<>'not_applicable_unregistered'
     OR btrim(COALESCE(request_document->>'reason',''))=''
     OR btrim(COALESCE(request_document->>'authority_reference',''))=''
     OR btrim(COALESCE(request_document->>'witness_name',''))=''
     OR btrim(COALESCE(request_document->>'witness_credential',''))=''
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='certified destruction input is incomplete';
  END IF;
  SELECT * INTO STRICT organization FROM core.organizations
   WHERE id=organization_id AND status='active' AND country_code='IN'
     AND base_currency='INR' FOR SHARE;
  IF destruction_date IS DISTINCT FROM (confirmed_at AT TIME ZONE organization.timezone)::date
     OR destruction_date IS DISTINCT FROM (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
     OR confirmed_at>pg_catalog.transaction_timestamp()
     OR confirmed_at<pg_catalog.transaction_timestamp()-interval '24 hours' THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='destruction must be witnessed recently and recorded on the organization business date';
  END IF;
  IF EXISTS(SELECT 1 FROM tax.registrations registration
      WHERE registration.org_id=organization_id AND registration.status='active'
        AND registration.effective_from<=destruction_date
        AND (registration.effective_to IS NULL OR registration.effective_to>=destruction_date)) THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='GST-registered destruction requires a reviewed Section 17(5)(h) ITC reversal command';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') item(value)
      WHERE pg_catalog.jsonb_typeof(item.value->'batch_allocations')<>'array'
         OR pg_catalog.jsonb_array_length(item.value->'batch_allocations') NOT BETWEEN 1 AND 500)
     OR (SELECT count(DISTINCT item.value->>'batch_id')
           FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
           CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value))
        <> (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
           CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='destruction requires unique explicit manufacturer batches';
  END IF;
  PERFORM 1 FROM core.memberships membership
    JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id
      AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id
      AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id
     AND membership.user_id=application_user_id AND membership.status='active'
     AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id
     AND grant_row.status='active' AND grant_row.expires_at>pg_catalog.transaction_timestamp()
     AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='inventory.destruction.prepare'
     AND capability.operation_mode='write' AND capability.risk_class='consequential_write'
     AND capability.approval_policy='separate_approver' AND capability.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='destruction delegated authority is inactive';
  END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.destruction.create',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('compliance.destruction.manage',NULL::uuid) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='destruction context or cross-domain permission is inactive';
  END IF;
  SELECT * INTO STRICT branch FROM core.branches
   WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT location FROM inventory.locations candidate
   WHERE candidate.org_id=organization_id AND candidate.id=location_id
     AND candidate.branch_id=branch.id AND candidate.status='active'
     AND candidate.location_type IN ('quarantine','damaged')
     AND NOT candidate.allows_sale AND NOT candidate.allows_negative_stock
     AND candidate.temperature_min_c IS NULL AND candidate.temperature_max_c IS NULL FOR SHARE;
  SELECT * INTO STRICT certificate FROM core.attachments
   WHERE org_id=organization_id AND id=certificate_id
     AND evidence_kind='inventory_destruction_certificate'
     AND status IN ('verified','retained') AND verified_at IS NOT NULL
     AND verified_at<=pg_catalog.transaction_timestamp()
     AND document_date=destruction_date AND retention_until IS NOT NULL
     AND retention_until>=destruction_date AND sha256 IS NOT NULL FOR SHARE;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':inventory-destruction-certificate:'||certificate.id::text,727119));
  IF EXISTS(SELECT 1 FROM automation.command_requests prior
      WHERE prior.org_id=organization_id AND prior.capability_code='inventory.destruction.prepare'
        AND prior.target_resource_id<>destruction_id AND prior.status NOT IN ('failed','expired','cancelled')
        AND pg_catalog.convert_from(prior.request_bytes,'UTF8')::jsonb->>'certificate_attachment_id'=certificate.id::text) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='destruction certificate was already consumed by another command';
  END IF;
  SELECT * INTO STRICT inventory_account FROM finance.accounts
   WHERE org_id=organization_id
     AND id=erp_commercial_commands.resolve_role_account(
       organization_id,branch.id,'inventory_asset','asset','INR',false)
     AND status='active' AND NOT allows_party_posting FOR SHARE;
  SELECT * INTO STRICT loss_account FROM finance.accounts
   WHERE org_id=organization_id
     AND id=erp_commercial_commands.resolve_role_account(
       organization_id,branch.id,'inventory_destruction_loss','expense','INR',false)
     AND status='active' AND NOT allows_party_posting FOR SHARE;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','id',location.id,'row_version',location.row_version),
    pg_catalog.jsonb_build_object('resource_type','destruction_certificate','id',certificate.id,
      'status',certificate.status,'evidence_kind',certificate.evidence_kind,
      'document_date',certificate.document_date,'verified_at',certificate.verified_at,
      'retention_until',certificate.retention_until,'sha256',pg_catalog.encode(certificate.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset',
      'id',inventory_account.id,'row_version',inventory_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_destruction_loss',
      'id',loss_account.id,'row_version',loss_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','gst_registration_state','active_count',0));
  PERFORM balance.batch_id FROM inventory.stock_balances balance
    JOIN (SELECT DISTINCT (item.value->>'batch_id')::uuid batch_id
      FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value)) requested
      ON requested.batch_id=balance.batch_id
   WHERE balance.org_id=organization_id AND balance.branch_id=branch.id
     AND balance.location_id=location.id ORDER BY balance.batch_id FOR UPDATE OF balance;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    SELECT * INTO STRICT product FROM catalog.products
     WHERE org_id=organization_id AND id=(requested_line->>'product_id')::uuid
       AND status='active' AND cold_chain_required=false
       AND COALESCE(drug_schedule,'NONE') NOT IN ('H','H1','X')
       AND COALESCE(ndps_regulated,false)=false FOR SHARE;
    IF product.product_kind='medicine' THEN medicine_count:=medicine_count+1; END IF;
    SELECT * INTO STRICT conversion FROM catalog.uom_conversions
     WHERE org_id=organization_id AND id=(requested_line->>'uom_conversion_id')::uuid
       AND product_id=product.id AND status='active' AND to_uom_code=product.base_uom_code
       AND multiplier>0 AND valid_from<=destruction_date
       AND (valid_until IS NULL OR valid_until>=destruction_date) FOR SHARE;
    conversion_version_hash:=pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to(pg_catalog.to_jsonb(conversion)::text,'UTF8'),'sha256'),'hex');
    FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations') LOOP
      line_no:=line_no+1;
      IF NULLIF(allocation->>'inventory_document_line_id','')::uuid IS NULL
         OR NULLIF(allocation->>'batch_id','')::uuid IS NULL
         OR NULLIF(allocation->>'entered_quantity','')::numeric<=0
         OR (allocation->>'entered_quantity')::numeric<>pg_catalog.round((allocation->>'entered_quantity')::numeric,6) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='destruction batch and positive six-decimal quantity are required';
      END IF;
      SELECT * INTO STRICT batch FROM inventory.batches
       WHERE org_id=organization_id AND id=(allocation->>'batch_id')::uuid
         AND product_id=product.id AND lot_kind='manufacturer_batch'
         AND status IN ('quarantined','blocked','expired') AND expires_on IS NOT NULL
         AND mrp>0 AND mrp_uom_conversion_id IS NOT NULL FOR SHARE;
      IF request_document->>'reason_code'='expired' AND batch.expires_on>destruction_date THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='expired destruction requires an expired manufacturer batch';
      ELSIF request_document->>'reason_code'<>'expired' AND batch.status NOT IN ('quarantined','blocked') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='damage or quality destruction requires blocked or quarantined stock';
      END IF;
      IF EXISTS(SELECT 1 FROM compliance.recall_batches recall_batch
          JOIN compliance.recalls recall ON recall.org_id=recall_batch.org_id
            AND recall.id=recall_batch.recall_id
         WHERE recall_batch.org_id=organization_id AND recall_batch.batch_id=batch.id
           AND recall.status IN ('initiated','in_progress')) THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='recalled stock requires a recall-linked destruction command';
      END IF;
      SELECT * INTO STRICT balance FROM inventory.stock_balances stock_balance
       WHERE stock_balance.org_id=organization_id AND stock_balance.branch_id=branch.id
         AND stock_balance.location_id=location.id AND stock_balance.product_id=product.id
         AND stock_balance.batch_id=batch.id AND stock_balance.on_hand_quantity>0
         AND stock_balance.inventory_value>0 AND stock_balance.average_unit_cost>0 FOR UPDATE;
      SELECT * INTO STRICT last_ledger FROM inventory.stock_ledger_entries entry
       WHERE entry.org_id=organization_id AND entry.id=balance.last_ledger_entry_id
         AND entry.branch_id=branch.id AND entry.location_id=location.id
         AND entry.product_id=product.id AND entry.batch_id=batch.id FOR SHARE;
      SELECT count(*) INTO pending_count FROM inventory.inventory_document_lines pending_line
        JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id
          AND pending.id=pending_line.inventory_document_id
       WHERE pending_line.org_id=organization_id AND pending.id<>inventory_document_id
         AND pending.status IN ('draft','submitted','approved')
         AND pending_line.product_id=product.id AND pending_line.batch_id=batch.id
         AND location.id IN (pending_line.from_location_id,pending_line.to_location_id);
      IF pending_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='destruction batch has a pending inventory movement';
      END IF;
      base_quantity:=pg_catalog.round((allocation->>'entered_quantity')::numeric*conversion.multiplier,6);
      IF base_quantity IS DISTINCT FROM balance.on_hand_quantity THEN
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='bounded destruction requires the full locked batch-location balance';
      END IF;
      extended_cost:=balance.inventory_value;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',line_no,'inventory_document_line_id',allocation->>'inventory_document_line_id',
        'product_id',product.id,'batch_id',batch.id,'batch_number',batch.batch_number,
        'expires_on',batch.expires_on,'uom_conversion_id',conversion.id,
        'selected_uom_code',conversion.from_uom_code,'uom_code',product.base_uom_code,
        'uom_multiplier',conversion.multiplier::text,'entered_quantity',allocation->>'entered_quantity',
        'base_quantity',base_quantity::text,'unit_cost',balance.average_unit_cost::text,
        'extended_cost',extended_cost::text));
      total_base:=total_base+base_quantity; total_value:=total_value+extended_cost;
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version,
          'drug_schedule',product.drug_schedule,'ndps_regulated',product.ndps_regulated,
          'cold_chain_required',product.cold_chain_required),
        pg_catalog.jsonb_build_object('resource_type','uom_conversion','id',conversion.id,
          'version_hash',conversion_version_hash,'multiplier',conversion.multiplier::text,
          'valid_from',conversion.valid_from,'valid_until',conversion.valid_until),
        pg_catalog.jsonb_build_object('resource_type','inventory_batch','id',batch.id,
          'row_version',batch.row_version,'status',batch.status,'expires_on',batch.expires_on),
        pg_catalog.jsonb_build_object('resource_type','stock_balance','id',last_ledger.id,
          'row_version',balance.row_version,'branch_id',branch.id,'location_id',location.id,
          'product_id',product.id,'batch_id',batch.id,'on_hand_quantity',balance.on_hand_quantity::text,
          'inventory_value',balance.inventory_value::text,'average_unit_cost',balance.average_unit_cost::text,
          'last_ledger_entry_id',balance.last_ledger_entry_id,'last_ledger_posted_at',last_ledger.posted_at),
        pg_catalog.jsonb_build_object('resource_type','pending_inventory_document_state',
          'batch_id',batch.id,'active_count',pending_count));
    END LOOP;
  END LOOP;
  IF medicine_count>0 THEN
    SELECT count(DISTINCT license.license_type_code),
           pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'resource_type','destruction_branch_wholesale_license','id',license.id,
             'row_version',license.row_version,'license_type_code',license.license_type_code,
             'evidence_attachment_id',license.evidence_attachment_id,
             'evidence_status',attachment.status,'evidence_sha256',pg_catalog.encode(attachment.sha256,'hex'))
             ORDER BY license.license_type_code,license.id)
      INTO license_type_count,license_sources
      FROM compliance.licenses license JOIN core.attachments attachment
        ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
     WHERE license.org_id=organization_id AND license.branch_id=branch.id
       AND license.license_type_code IN ('drug_wholesale_form_20b','drug_wholesale_form_21b')
       AND license.status='active' AND license.valid_from<=destruction_date
       AND (license.valid_until IS NULL OR license.valid_until>=destruction_date)
       AND license.next_verification_due_on>=destruction_date
       AND attachment.status IN ('verified','retained') AND attachment.verified_at IS NOT NULL;
    IF license_type_count<>2 THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='destruction branch lacks verified effective Forms 20B and 21B custody evidence';
    END IF;
    source_versions:=source_versions||license_sources;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'destruction_id',destruction_id,'inventory_document_id',inventory_document_id,
    'branch_id',branch.id,'destruction_date',destruction_date,'physical_destruction_confirmed_at',confirmed_at,
    'location_id',location.id,'method_code',request_document->>'method_code',
    'reason_code',request_document->>'reason_code','reason',request_document->>'reason',
    'authority_reference',request_document->>'authority_reference','witness_name',request_document->>'witness_name',
    'witness_credential',request_document->>'witness_credential','certificate_attachment_id',certificate.id,
    'inventory_asset_account_id',inventory_account.id,
    'inventory_destruction_loss_account_id',loss_account.id,'lines',resolved_lines,
    'total_base_quantity',total_base::text,'total_value',total_value::text,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object(
      'country','IN','currency','INR','approval_policy','separate_approver',
      'physical_action','completed_and_certified','valuation','locked_moving_weighted_average',
      'gst_scope','organization_has_no_active_gst_registration','itc_treatment','not_applicable_unregistered',
      'supported_method','licensed_incineration','supported_quantity','full_batch_location_balance_only',
      'unsupported_fail_closed',pg_catalog.jsonb_build_array(
        'gst_registered_or_itc_reversal','partial_batch','backdated_or_future','cold_chain',
        'schedule_h_h1_x_or_ndps','recall_linked','saleable_location','uncertified','reversal')));
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_inventory_destruction_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,jsonb) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_inventory_destruction_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,jsonb) FROM PUBLIC,"erp_app","erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_inventory_destruction_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,jsonb) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."assert_inventory_destruction_draft"(
  organization_id uuid, destruction_id uuid, inventory_document_id uuid,
  journal_id uuid, resolved_document jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE destruction compliance.destructions%ROWTYPE;
        document inventory.inventory_documents%ROWTYPE;
        journal finance.journal_entries%ROWTYPE;
BEGIN
  SELECT * INTO STRICT destruction FROM compliance.destructions
   WHERE org_id=organization_id AND id=destruction_id FOR SHARE;
  SELECT * INTO STRICT document FROM inventory.inventory_documents
   WHERE org_id=organization_id AND id=inventory_document_id FOR SHARE;
  SELECT * INTO STRICT journal FROM finance.journal_entries
   WHERE org_id=organization_id AND id=journal_id FOR SHARE;
  IF ROW(destruction.inventory_document_id,destruction.destruction_date,destruction.method_code,
         destruction.reason_code,destruction.reason,destruction.authority_reference,
         destruction.witness_name,destruction.witness_credential,destruction.certificate_attachment_id,
         destruction.status,destruction.created_by_membership_id)
     IS DISTINCT FROM ROW(inventory_document_id,(resolved_document->>'destruction_date')::date,
       resolved_document->>'method_code',resolved_document->>'reason_code',resolved_document->>'reason',
       resolved_document->>'authority_reference',resolved_document->>'witness_name',
       resolved_document->>'witness_credential',(resolved_document->>'certificate_attachment_id')::uuid,
       'submitted',erp_security.current_membership_id())
     OR ROW(document.branch_id,document.document_type,document.document_date,document.status,
         document.reason_code,document.currency_code,document.costing_method_snapshot,
         document.total_abs_base_quantity,document.total_value,document.destruction_id,
         document.physical_movement_required,document.destination_branch_id,document.reverses_document_id)
     IS DISTINCT FROM ROW((resolved_document->>'branch_id')::uuid,'destruction',
       (resolved_document->>'destruction_date')::date,'submitted',resolved_document->>'reason_code',
       'INR'::bpchar,'moving_weighted_average',(resolved_document->>'total_base_quantity')::numeric,
       (resolved_document->>'total_value')::numeric,destruction_id,false,NULL::uuid,NULL::uuid)
     OR (SELECT count(*) FROM inventory.inventory_document_lines line
          WHERE line.org_id=organization_id AND line.inventory_document_id=inventory_document_id)
        <>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR EXISTS(SELECT 1 FROM inventory.inventory_document_lines line
          WHERE line.org_id=organization_id AND line.inventory_document_id=inventory_document_id
            AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') expected(value)
              WHERE (expected.value->>'inventory_document_line_id')::uuid=line.id
                AND (expected.value->>'line_number')::integer=line.line_number
                AND line.movement_kind='issue'
                AND (expected.value->>'product_id')::uuid=line.product_id
                AND (expected.value->>'batch_id')::uuid=line.batch_id
                AND expected.value->>'uom_code'=line.uom_code
                AND (expected.value->>'entered_quantity')::numeric=line.entered_quantity
                AND (expected.value->>'base_quantity')::numeric=line.base_quantity
                AND (resolved_document->>'location_id')::uuid=line.from_location_id
                AND line.to_location_id IS NULL
                AND (expected.value->>'unit_cost')::numeric=line.unit_cost
                AND (expected.value->>'extended_cost')::numeric=line.extended_cost)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared destruction stock snapshot differs from approved preview';
  END IF;
  IF ROW(journal.posting_date,journal.status,journal.transaction_currency,journal.functional_currency,
         journal.fx_rate,journal.transaction_debit_total,journal.transaction_credit_total,
         journal.functional_debit_total,journal.functional_credit_total)
     IS DISTINCT FROM ROW((resolved_document->>'destruction_date')::date,'draft','INR'::bpchar,
       'INR'::bpchar,1::numeric,(resolved_document->>'total_value')::numeric,
       (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
       (resolved_document->>'total_value')::numeric)
     OR (SELECT count(*) FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id)<>2
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id AND line.line_number=1
            AND line.account_id=(resolved_document->>'inventory_destruction_loss_account_id')::uuid
            AND line.branch_id=(resolved_document->>'branch_id')::uuid AND line.party_id IS NULL
            AND line.transaction_debit=(resolved_document->>'total_value')::numeric
            AND line.transaction_credit=0 AND line.functional_debit=(resolved_document->>'total_value')::numeric
            AND line.functional_credit=0)
     OR NOT EXISTS(SELECT 1 FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id AND line.line_number=2
            AND line.account_id=(resolved_document->>'inventory_asset_account_id')::uuid
            AND line.branch_id=(resolved_document->>'branch_id')::uuid AND line.party_id IS NULL
            AND line.transaction_debit=0 AND line.transaction_credit=(resolved_document->>'total_value')::numeric
            AND line.functional_debit=0 AND line.functional_credit=(resolved_document->>'total_value')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared destruction loss journal differs from approved preview';
  END IF;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."assert_inventory_destruction_draft"(uuid,uuid,uuid,uuid,jsonb) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."assert_inventory_destruction_draft"(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC,"erp_app","erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_inventory_destruction_prepare"(
  organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid,
  grant_id uuid, caller_client_id varchar, destruction_id uuid, inventory_document_id uuid,
  command_id uuid, journal_id uuid, event_id uuid, key_hash bytea,
  destruction_sequence_key_hash bytea, journal_sequence_key_hash bytea,
  request_bytes bytea, resolved_bytes bytea,
  preview_bytes bytea, expires_at timestamptz
)
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
        aggregate_hash bytea; destruction_sequence_id uuid; journal_sequence_id uuid;
        destruction_number text; journal_number text; fiscal_year integer; resolved_line jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR command_id IS NULL OR destruction_id IS NULL
     OR inventory_document_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32
     OR pg_catalog.octet_length(destruction_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32
     OR expires_at<=pg_catalog.transaction_timestamp()
     OR request_document->>'destruction_id' IS DISTINCT FROM destruction_id::text
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text
     OR request_document->>'event_id' IS DISTINCT FROM event_id::text THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='destruction runtime persistence boundary is invalid';
  END IF;
  current_resolution:="erp_automation_commands"."resolve_inventory_destruction_prepare"(
    organization_id,membership_id,auth_user_id,application_user_id,grant_id,
    caller_client_id,destruction_id,inventory_document_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document
     OR preview_document->>'operation'<>'compliance.destruction.post'
     OR preview_document->>'capability_code'<>'inventory.destruction.prepare'
     OR preview_document->>'target_resource_type'<>'destruction'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM destruction_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction resolution or immutable preview changed';
  END IF;
  SELECT * INTO existing FROM automation.command_requests
   WHERE org_id=organization_id AND agent_grant_id=grant_id
     AND capability_code='inventory.destruction.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM destruction_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='destruction idempotency key has different exact input';
    END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,
      'expires_at',existing.expires_at,'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'destruction_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'destruction_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'destruction_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "erp_automation_commands"."prepare_operator_command"(
    organization_id,command_id,grant_id,'inventory.destruction.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,destruction_id,
    (resolved_document->>'total_value')::numeric,'INR',key_hash,request_bytes,
    preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT destruction_sequence_id FROM core.document_sequences
   WHERE org_id=organization_id AND branch_id=(resolved_document->>'branch_id')::uuid
     AND document_type='destruction' AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
     AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences
   WHERE org_id=organization_id AND branch_id=(resolved_document->>'branch_id')::uuid
     AND document_type='journal_entry' AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
     AND status='active' FOR SHARE;
  destruction_number:=erp_core_commands.allocate_document_number(
    organization_id,destruction_sequence_id,destruction_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(
    organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO compliance.destructions(
    org_id,id,destruction_number,inventory_document_id,destruction_date,method_code,
    reason_code,reason,authority_reference,witness_name,witness_credential,
    certificate_attachment_id,status)
  VALUES(organization_id,destruction_id,destruction_number,inventory_document_id,
    (resolved_document->>'destruction_date')::date,resolved_document->>'method_code',
    resolved_document->>'reason_code',resolved_document->>'reason',
    resolved_document->>'authority_reference',resolved_document->>'witness_name',
    resolved_document->>'witness_credential',(resolved_document->>'certificate_attachment_id')::uuid,'draft');
  INSERT INTO inventory.inventory_documents(
    org_id,id,branch_id,physical_movement_required,document_type,document_number,
    fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,
    total_abs_base_quantity,total_value,destruction_id)
  VALUES(organization_id,inventory_document_id,(resolved_document->>'branch_id')::uuid,false,
    'destruction',destruction_number,fiscal_year,(resolved_document->>'destruction_date')::date,
    'submitted',resolved_document->>'reason_code','INR','moving_weighted_average',
    (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric,destruction_id);
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    INSERT INTO inventory.inventory_document_lines(
      org_id,id,inventory_document_id,line_number,movement_kind,product_id,batch_id,
      uom_code,entered_quantity,base_quantity,from_location_id,unit_cost,extended_cost)
    VALUES(organization_id,(resolved_line->>'inventory_document_line_id')::uuid,
      inventory_document_id,(resolved_line->>'line_number')::integer,'issue',
      (resolved_line->>'product_id')::uuid,(resolved_line->>'batch_id')::uuid,
      resolved_line->>'uom_code',(resolved_line->>'entered_quantity')::numeric,
      (resolved_line->>'base_quantity')::numeric,(resolved_document->>'location_id')::uuid,
      (resolved_line->>'unit_cost')::numeric,(resolved_line->>'extended_cost')::numeric);
  END LOOP;
  INSERT INTO finance.journal_entries(
    org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'destruction_date')::date,
    'Certified inventory destruction '||destruction_number,'INR','INR',1,
    (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,
    (resolved_document->>'total_value')::numeric,(resolved_document->>'total_value')::numeric,'draft');
  INSERT INTO finance.journal_lines(
    org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
    (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,
      (resolved_document->>'inventory_destruction_loss_account_id')::uuid,
      (resolved_document->>'branch_id')::uuid,'Certified inventory destruction loss',
      (resolved_document->>'total_value')::numeric,0,(resolved_document->>'total_value')::numeric,0),
    (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,
      (resolved_document->>'inventory_asset_account_id')::uuid,
      (resolved_document->>'branch_id')::uuid,'Inventory asset removed by certified destruction',
      0,(resolved_document->>'total_value')::numeric,0,(resolved_document->>'total_value')::numeric);
  UPDATE compliance.destructions SET status='submitted',updated_at=pg_catalog.transaction_timestamp(),
    updated_by_membership_id=membership_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=destruction_id AND status='draft';
  PERFORM "erp_automation_commands"."assert_inventory_destruction_draft"(
    organization_id,destruction_id,inventory_document_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_inventory_destruction_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_inventory_destruction_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz) FROM PUBLIC,"erp_app","erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_inventory_destruction_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_compliance_commands"."post_destruction"(
  organization_id uuid, destruction_id uuid, actor_id uuid, key_hash bytea,
  request_hash bytea, expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE destruction compliance.destructions%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
        certificate core.attachments%ROWTYPE; claim_id uuid; replay_id uuid; posted_time timestamptz;
BEGIN
  PERFORM "erp_compliance_commands"."assert_context"(
    organization_id,actor_id,'compliance.destruction.manage',NULL::uuid);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id
    FROM "erp_compliance_commands"."claim"(
      organization_id,actor_id,'compliance.destruction.post',key_hash,request_hash,expires_at);
  IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(organization_id::text||':destruction:'||destruction_id::text,8164102));
  SELECT * INTO STRICT destruction FROM compliance.destructions
   WHERE org_id=organization_id AND id=destruction_id FOR UPDATE;
  SELECT * INTO STRICT document FROM inventory.inventory_documents
   WHERE org_id=organization_id AND id=destruction.inventory_document_id FOR UPDATE;
  SELECT * INTO STRICT certificate FROM core.attachments
   WHERE org_id=organization_id AND id=destruction.certificate_attachment_id FOR SHARE;
  PERFORM "erp_compliance_commands"."assert_context"(
    organization_id,actor_id,'inventory.document.post',document.branch_id);
  IF destruction.status<>'approved' OR document.status<>'approved'
     OR document.document_type<>'destruction' OR document.destruction_id IS DISTINCT FROM destruction.id
     OR document.recall_id IS NOT NULL OR certificate.evidence_kind<>'inventory_destruction_certificate'
     OR certificate.status NOT IN ('verified','retained')
     OR EXISTS(SELECT 1 FROM tax.registrations registration
        WHERE registration.org_id=organization_id AND registration.status='active'
          AND registration.effective_from<=destruction.destruction_date
          AND (registration.effective_to IS NULL OR registration.effective_to>=destruction.destruction_date)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only the exact approved non-GST certified destruction may post';
  END IF;
  posted_time:=pg_catalog.transaction_timestamp();
  INSERT INTO "erp_compliance_commands"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'destruction_posted',organization_id,destruction_id);
  UPDATE compliance.destructions SET status='posted',posted_at=posted_time,
    posted_by_membership_id=actor_id,updated_at=posted_time,updated_by_membership_id=actor_id,
    row_version=row_version+1 WHERE org_id=organization_id AND id=destruction_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='destruction posting lost its lock'; END IF;
  PERFORM erp_trade_commands.post_locked_document(organization_id,document.id,actor_id);
  DELETE FROM "erp_compliance_commands"."command_scopes"
   WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current()
     AND scope='destruction_posted' AND org_id=organization_id AND entity_id=destruction_id;
  PERFORM "erp_compliance_commands"."finish_claim"(
    organization_id,claim_id,'compliance.destructions',destruction_id);
  RETURN destruction_id;
END
$function$;

ALTER FUNCTION "erp_compliance_commands"."post_destruction"(uuid,uuid,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_compliance_commands"."post_destruction"(uuid,uuid,uuid,bytea,bytea,timestamptz) FROM PUBLIC,"erp_app","erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_compliance_commands"."post_destruction"(uuid,uuid,uuid,bytea,bytea,timestamptz) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."execute_inventory_destruction_command"(
  organization_id uuid, command_request_id uuid
)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid:=NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid;
        command_context uuid:=NULLIF(pg_catalog.current_setting('app.command_request_id',true),'')::uuid;
        request_row automation.command_requests%ROWTYPE; grant_row automation.agent_grants%ROWTYPE;
        requester core.memberships%ROWTYPE; requester_user core.users%ROWTYPE;
        destruction compliance.destructions%ROWTYPE; document inventory.inventory_documents%ROWTYPE;
        approval automation.command_approvals%ROWTYPE; request_document jsonb; preview_document jsonb;
        current_resolution jsonb; journal_id uuid; event_id uuid; ledger_count bigint;
        ledger_quantity numeric(20,6); ledger_value numeric(20,2); response_document jsonb;
        response_bytes bytea; posted_id uuid;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR actor_id IS NULL OR command_context IS DISTINCT FROM command_request_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='destruction execution context is invalid';
  END IF;
  SELECT * INTO STRICT request_row FROM automation.command_requests
   WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
  IF request_row.capability_code<>'inventory.destruction.prepare'
     OR request_row.operation<>'compliance.destruction.post'
     OR request_row.target_resource_type<>'destruction'
     OR request_row.status NOT IN ('prepared','pending_approval','approved','succeeded') THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='command is not a typed destruction operation';
  END IF;
  IF request_row.status='succeeded' THEN RETURN request_row.response_bytes; END IF;
  IF request_row.expires_at<=pg_catalog.transaction_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='destruction command expired before execution';
  END IF;
  SELECT * INTO STRICT grant_row FROM automation.agent_grants
   WHERE org_id=organization_id AND id=request_row.agent_grant_id
     AND subject_membership_id=actor_id AND status='active'
     AND expires_at>pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT requester FROM core.memberships
   WHERE org_id=organization_id AND id=request_row.requested_by_membership_id
     AND id=actor_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT requester_user FROM core.users
   WHERE id=requester.user_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT approval FROM automation.command_approvals
   WHERE org_id=organization_id AND command_request_id=request_row.id
     AND decision='approved' AND preview_hash=request_row.preview_hash
     AND aggregate_version_hash=request_row.aggregate_version_hash
     AND valid_until_at>pg_catalog.transaction_timestamp()
     AND approver_membership_id<>request_row.requested_by_membership_id
   ORDER BY decided_at,id LIMIT 1 FOR SHARE;
  request_document:=pg_catalog.convert_from(request_row.request_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(request_row.preview_bytes,'UTF8')::jsonb;
  journal_id:=(request_document->>'journal_id')::uuid;
  event_id:=(request_document->>'event_id')::uuid;
  SELECT * INTO STRICT destruction FROM compliance.destructions
   WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
  SELECT * INTO STRICT document FROM inventory.inventory_documents
   WHERE org_id=organization_id AND id=destruction.inventory_document_id FOR UPDATE;
  current_resolution:="erp_automation_commands"."resolve_inventory_destruction_prepare"(
    organization_id,requester.id,requester_user.auth_user_id,requester.user_id,
    grant_row.id,grant_row.client_id,destruction.id,document.id,request_document);
  IF request_row.target_row_version IS DISTINCT FROM 1 OR destruction.row_version<>2
     OR destruction.status<>'submitted' OR document.status<>'submitted'
     OR request_document->>'destruction_id' IS DISTINCT FROM destruction.id::text
     OR request_document->>'inventory_document_id' IS DISTINCT FROM document.id::text
     OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
     OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
     OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
       pg_catalog.convert_to((current_resolution->'source_versions')::text,'UTF8'),'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction certificate, stock, regulation, account, or batch source changed';
  END IF;
  PERFORM "erp_automation_commands"."assert_inventory_destruction_draft"(
    organization_id,destruction.id,document.id,journal_id,current_resolution);
  INSERT INTO "erp_automation_commands"."execution_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),organization_id,command_request_id);
  IF request_row.status<>'approved' THEN
    UPDATE automation.command_requests SET status='approved',row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id;
  END IF;
  UPDATE automation.command_requests SET status='executing',
    execution_started_at=pg_catalog.transaction_timestamp(),row_version=row_version+1
   WHERE org_id=organization_id AND id=command_request_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction command lost execution ownership'; END IF;
  UPDATE inventory.inventory_documents SET status='approved',approved_at=approval.decided_at,
    approved_by_membership_id=approval.approver_membership_id,
    updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=document.id AND status='submitted';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction inventory approval lost submitted state'; END IF;
  INSERT INTO "erp_compliance_commands"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'destruction_approved',organization_id,destruction.id);
  UPDATE compliance.destructions SET status='approved',approved_at=approval.decided_at,
    approved_by_membership_id=approval.approver_membership_id,
    updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=destruction.id AND status='submitted';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction approval lost submitted state'; END IF;
  DELETE FROM "erp_compliance_commands"."command_scopes"
   WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current()
     AND scope='destruction_approved' AND org_id=organization_id AND entity_id=destruction.id;
  posted_id:="erp_compliance_commands"."post_destruction"(
    organization_id,destruction.id,actor_id,
    extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':post','UTF8'),'sha256'),
    extensions.digest(request_row.request_hash||pg_catalog.convert_to(':post','UTF8'),'sha256'),request_row.expires_at);
  SELECT count(*),COALESCE(sum(-entry.quantity_delta),0),COALESCE(sum(-entry.value_delta),0)
    INTO ledger_count,ledger_quantity,ledger_value
    FROM inventory.stock_ledger_entries entry
   WHERE entry.org_id=organization_id AND entry.inventory_document_id=document.id
     AND entry.entry_kind='issue';
  IF posted_id IS DISTINCT FROM destruction.id
     OR ledger_count<>pg_catalog.jsonb_array_length(current_resolution->'lines')
     OR ledger_quantity<>(current_resolution->>'total_base_quantity')::numeric
     OR ledger_value<>(current_resolution->>'total_value')::numeric
     OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(current_resolution->'lines') expected(value)
       WHERE NOT EXISTS(SELECT 1 FROM inventory.stock_ledger_entries entry
        WHERE entry.org_id=organization_id AND entry.inventory_document_id=document.id
          AND entry.inventory_document_line_id=(expected.value->>'inventory_document_line_id')::uuid
          AND entry.entry_kind='issue' AND entry.location_id=(current_resolution->>'location_id')::uuid
          AND entry.product_id=(expected.value->>'product_id')::uuid
          AND entry.batch_id=(expected.value->>'batch_id')::uuid
          AND entry.quantity_delta=-(expected.value->>'base_quantity')::numeric
          AND entry.unit_cost=(expected.value->>'unit_cost')::numeric
          AND entry.value_delta=-(expected.value->>'extended_cost')::numeric)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted destruction ledger differs from exact approved quantity and value';
  END IF;
  UPDATE finance.journal_entries SET status='posted',posted_at=pg_catalog.transaction_timestamp(),
    posted_by_membership_id=actor_id,updated_at=pg_catalog.transaction_timestamp(),
    updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=journal_id AND status='draft'
     AND transaction_debit_total=ledger_value AND transaction_credit_total=ledger_value
     AND functional_debit_total=ledger_value AND functional_credit_total=ledger_value;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction loss journal changed before atomic posting'; END IF;
  INSERT INTO finance.accounting_events(
    org_id,id,event_type,inventory_document_id,journal_entry_id,occurred_at,
    source_posted_at,created_by_membership_id)
  VALUES(organization_id,event_id,'inventory_valuation',document.id,journal_id,
    pg_catalog.transaction_timestamp(),pg_catalog.transaction_timestamp(),actor_id);
  response_document:=pg_catalog.jsonb_build_object(
    'command_request_id',command_request_id,'operation',request_row.operation,
    'resource_id',destruction.id,'resource_type','destruction','status','succeeded');
  response_bytes:=pg_catalog.convert_to(response_document::text,'UTF8');
  UPDATE automation.command_requests SET status='succeeded',
    result_resource_type='destruction',result_resource_id=destruction.id,
    response_status=200,response_media_type='application/vnd.aasopharma.command-result+json',
    response_bytes=response_bytes,response_hash=extensions.digest(response_bytes,'sha256'),
    completed_at=pg_catalog.transaction_timestamp(),row_version=row_version+1
   WHERE org_id=organization_id AND id=command_request_id AND status='executing';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='destruction command lost terminal ownership'; END IF;
  DELETE FROM "erp_automation_commands"."execution_scopes" scope
   WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
     AND scope.transaction_id=pg_catalog.txid_current()
     AND scope.org_id=organization_id AND scope.command_request_id=command_request_id;
  RETURN response_bytes;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."execute_inventory_destruction_command"(uuid,uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."execute_inventory_destruction_command"(uuid,uuid) FROM PUBLIC,"erp_app","erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."execute_inventory_destruction_command"(uuid,uuid) TO "erp_runtime";

RESET ROLE;
