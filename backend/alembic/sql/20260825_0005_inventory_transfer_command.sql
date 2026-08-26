SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE source_branch_id uuid:=NULLIF(request_document->>'source_branch_id','')::uuid;
        destination_branch_id uuid:=NULLIF(request_document->>'destination_branch_id','')::uuid;
        source_location_id uuid:=NULLIF(request_document->>'source_location_id','')::uuid;
        destination_location_id uuid:=NULLIF(request_document->>'destination_location_id','')::uuid;
        transfer_date date:=NULLIF(request_document->>'transfer_date','')::date;
        organization core.organizations%ROWTYPE;
        source_branch core.branches%ROWTYPE; destination_branch core.branches%ROWTYPE;
        source_location inventory.locations%ROWTYPE; destination_location inventory.locations%ROWTYPE;
        product catalog.products%ROWTYPE; conversion catalog.uom_conversions%ROWTYPE;
        batch inventory.batches%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        transporter parties.parties%ROWTYPE; requested_line jsonb; allocation jsonb;
        resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        base_quantity numeric(20,6); extended_cost numeric(20,2);
        total_quantity numeric(20,6):=0; total_value numeric(20,2):=0;
        earliest_expiry date; line_number integer:=0; recall_count integer;
        pending_count integer; transporter_name text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR inventory_document_id IS NULL OR source_branch_id IS NULL
     OR destination_branch_id IS NULL OR source_branch_id=destination_branch_id
     OR source_location_id IS NULL OR destination_location_id IS NULL OR source_location_id=destination_location_id
     OR transfer_date IS NULL
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500
     OR pg_catalog.jsonb_typeof(request_document->'logistics')<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='inter-branch transfer input is incomplete'; END IF;
  SELECT * INTO STRICT organization FROM core.organizations
   WHERE id=organization_id AND status='active' AND country_code='IN' AND base_currency='INR' FOR SHARE;
  IF transfer_date IS DISTINCT FROM (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='inter-branch transfer must use the organization business date'; END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value))
     <> (SELECT count(DISTINCT item.value->>'batch_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(line.value->'batch_allocations') item(value)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='each manufacturer batch may appear only once in a transfer'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND grant_row.branch_id IS NULL
     AND capability.capability_code='inventory.transfer.prepare' AND capability.operation_mode='write'
     AND capability.risk_class='consequential_write' AND capability.approval_policy='actor_confirmation'
     AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='inter-branch transfer delegated authority is inactive or branch-limited'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(source_branch_id) IS DISTINCT FROM true
     OR erp_security.can_access_branch(destination_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.transfer.create',source_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.transfer.create',destination_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',source_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('inventory.document.post',destination_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',source_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',destination_branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='inter-branch transfer context or two-branch permission is inactive'; END IF;
  SELECT * INTO STRICT source_branch FROM core.branches WHERE org_id=organization_id AND id=source_branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT destination_branch FROM core.branches WHERE org_id=organization_id AND id=destination_branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT source_location FROM inventory.locations WHERE org_id=organization_id AND id=source_location_id
    AND branch_id=source_branch.id AND status='active' AND location_type='saleable' AND allows_sale
    AND NOT allows_negative_stock FOR SHARE;
  SELECT * INTO STRICT destination_location FROM inventory.locations WHERE org_id=organization_id AND id=destination_location_id
    AND branch_id=destination_branch.id AND status='active' AND location_type='saleable' AND allows_sale
    AND NOT allows_negative_stock FOR SHARE;
  IF ROW(source_location.temperature_min_c,source_location.temperature_max_c)
     IS DISTINCT FROM ROW(destination_location.temperature_min_c,destination_location.temperature_max_c) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='transfer locations require identical storage temperature bounds'; END IF;
  IF NULLIF(request_document#>>'{logistics,transport_mode}','') IS NULL
     OR request_document#>>'{logistics,transport_mode}' NOT IN ('road','rail','air','ship','multimodal','in_person')
     OR NULLIF(request_document#>>'{logistics,distance_km}','') IS NULL
     OR (request_document#>>'{logistics,distance_km}')::numeric<0
     OR (request_document#>>'{logistics,distance_km}')::numeric<>pg_catalog.round((request_document#>>'{logistics,distance_km}')::numeric,2) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer logistics mode and exact distance are invalid'; END IF;
  IF NULLIF(request_document#>>'{logistics,transporter_party_id}','') IS NOT NULL THEN
    SELECT * INTO STRICT transporter FROM parties.parties WHERE org_id=organization_id
      AND id=(request_document#>>'{logistics,transporter_party_id}')::uuid AND status='active' FOR SHARE;
    transporter_name:=transporter.legal_name;
  ELSIF request_document#>>'{logistics,transport_mode}'<>'in_person' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-person transfer requires an active canonical transporter';
  END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','role','source','id',source_branch.id,'row_version',source_branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','branch','role','destination','id',destination_branch.id,'row_version',destination_branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','role','source','id',source_location.id,'row_version',source_location.row_version),
    pg_catalog.jsonb_build_object('resource_type','inventory_location','role','destination','id',destination_location.id,'row_version',destination_location.row_version));
  IF transporter.id IS NOT NULL THEN
    source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'resource_type','transporter_party','id',transporter.id,'row_version',transporter.row_version,'legal_name',transporter.legal_name));
  END IF;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    IF NULLIF(requested_line->>'product_id','')::uuid IS NULL OR NULLIF(requested_line->>'uom_conversion_id','')::uuid IS NULL
       OR pg_catalog.jsonb_typeof(requested_line->'batch_allocations')<>'array'
       OR pg_catalog.jsonb_array_length(requested_line->'batch_allocations') NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='each transfer product requires an effective UOM and batch allocation'; END IF;
    SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id
      AND id=(requested_line->>'product_id')::uuid AND status='active'
      AND cold_chain_required=false AND ndps_regulated=false FOR SHARE;
    SELECT * INTO STRICT conversion FROM catalog.uom_conversions WHERE org_id=organization_id
      AND id=(requested_line->>'uom_conversion_id')::uuid AND product_id=product.id AND status='active'
      AND to_uom_code=product.base_uom_code AND multiplier>0 AND valid_from<=transfer_date
      AND (valid_until IS NULL OR valid_until>=transfer_date) FOR SHARE;
    SELECT min(eligible_batch.expires_on) INTO earliest_expiry
      FROM inventory.batches eligible_batch JOIN inventory.stock_balances eligible_balance
        ON eligible_balance.org_id=eligible_batch.org_id AND eligible_balance.batch_id=eligible_batch.id
       AND eligible_balance.product_id=eligible_batch.product_id
     WHERE eligible_batch.org_id=organization_id AND eligible_batch.product_id=product.id
       AND eligible_batch.status='released' AND eligible_batch.released_at IS NOT NULL AND eligible_batch.expires_on>transfer_date
       AND eligible_balance.branch_id=source_branch.id AND eligible_balance.location_id=source_location.id
       AND eligible_balance.on_hand_quantity>0
       AND NOT EXISTS (SELECT 1 FROM compliance.recall_batches rb JOIN compliance.recalls active_recall
         ON active_recall.org_id=rb.org_id AND active_recall.id=rb.recall_id
        WHERE rb.org_id=eligible_batch.org_id AND rb.batch_id=eligible_batch.id
          AND active_recall.status IN ('initiated','in_progress') AND rb.status IN ('identified','quarantined'))
       AND NOT EXISTS (SELECT 1 FROM inventory.inventory_document_lines pending_line
         JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id
          AND pending.id=pending_line.inventory_document_id
        WHERE pending_line.org_id=eligible_batch.org_id AND pending.id<>inventory_document_id
          AND pending.status IN ('draft','submitted','approved') AND pending_line.batch_id=eligible_batch.id
          AND source_location.id IN (pending_line.from_location_id,pending_line.to_location_id));
    IF earliest_expiry IS NULL THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='no released nonexpired source stock is eligible'; END IF;
    FOR allocation IN SELECT value FROM pg_catalog.jsonb_array_elements(requested_line->'batch_allocations') LOOP
      line_number:=line_number+1;
      IF NULLIF(allocation->>'inventory_document_line_id','')::uuid IS NULL
         OR NULLIF(allocation->>'batch_id','')::uuid IS NULL
         OR NULLIF(allocation->>'entered_quantity','')::numeric<=0
         OR (allocation->>'entered_quantity')::numeric<>pg_catalog.round((allocation->>'entered_quantity')::numeric,6) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer batch and positive six-decimal quantity are required'; END IF;
      SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id
        AND id=(allocation->>'batch_id')::uuid AND product_id=product.id AND lot_kind='manufacturer_batch'
        AND status='released' AND released_at IS NOT NULL AND expires_on=earliest_expiry FOR SHARE;
      SELECT count(*) INTO recall_count FROM compliance.recall_batches recall_batch JOIN compliance.recalls recall
        ON recall.org_id=recall_batch.org_id AND recall.id=recall_batch.recall_id
       WHERE recall_batch.org_id=organization_id AND recall_batch.batch_id=batch.id
         AND recall.status IN ('initiated','in_progress') AND recall_batch.status IN ('identified','quarantined');
      IF recall_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='recalled batch cannot be transferred'; END IF;
      SELECT * INTO STRICT balance FROM inventory.stock_balances stock_balance
       WHERE stock_balance.org_id=organization_id AND stock_balance.branch_id=source_branch.id
         AND stock_balance.location_id=source_location.id AND stock_balance.product_id=product.id
         AND stock_balance.batch_id=batch.id AND stock_balance.on_hand_quantity>0
         AND stock_balance.inventory_value>=0 AND stock_balance.average_unit_cost>=0 FOR UPDATE;
      base_quantity:=pg_catalog.round((allocation->>'entered_quantity')::numeric*conversion.multiplier,6);
      IF base_quantity<=0 OR base_quantity>balance.on_hand_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='transfer quantity exceeds locked available source stock'; END IF;
      extended_cost:=CASE WHEN base_quantity=balance.on_hand_quantity THEN balance.inventory_value
                          ELSE pg_catalog.round(base_quantity*balance.average_unit_cost,2) END;
      SELECT count(*) INTO pending_count FROM inventory.inventory_document_lines pending_line
        JOIN inventory.inventory_documents pending ON pending.org_id=pending_line.org_id AND pending.id=pending_line.inventory_document_id
       WHERE pending_line.org_id=organization_id AND pending.id<>inventory_document_id
         AND pending.status IN ('draft','submitted','approved') AND pending_line.batch_id=batch.id
         AND source_location.id IN (pending_line.from_location_id,pending_line.to_location_id);
      IF pending_count<>0 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='source batch has a pending inventory movement'; END IF;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'line_number',line_number,'inventory_document_line_id',allocation->>'inventory_document_line_id',
        'product_id',product.id,'batch_id',batch.id,'batch_number',batch.batch_number,'expires_on',batch.expires_on,
        'uom_conversion_id',conversion.id,'selected_uom_code',conversion.from_uom_code,'uom_code',product.base_uom_code,
        'uom_multiplier',conversion.multiplier::text,'entered_quantity',allocation->>'entered_quantity',
        'base_quantity',base_quantity::text,'source_available_base_quantity',balance.on_hand_quantity::text,
        'unit_cost',balance.average_unit_cost::text,'extended_cost',extended_cost::text));
      total_quantity:=total_quantity+base_quantity; total_value:=total_value+extended_cost;
      source_versions:=source_versions||pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('resource_type','product','id',product.id,'row_version',product.row_version),
        pg_catalog.jsonb_build_object('resource_type','uom_conversion','id',conversion.id,'multiplier',conversion.multiplier::text,
          'valid_from',conversion.valid_from,'valid_until',conversion.valid_until),
        pg_catalog.jsonb_build_object('resource_type','inventory_batch','id',batch.id,'row_version',batch.row_version,
          'status',batch.status,'released_at',batch.released_at,'expires_on',batch.expires_on),
        pg_catalog.jsonb_build_object('resource_type','stock_balance','id',balance.last_ledger_entry_id,'row_version',balance.row_version,
          'branch_id',source_branch.id,'location_id',source_location.id,'product_id',product.id,'batch_id',batch.id,
          'on_hand_quantity',balance.on_hand_quantity::text,'inventory_value',balance.inventory_value::text,
          'average_unit_cost',balance.average_unit_cost::text,'last_ledger_entry_id',balance.last_ledger_entry_id),
        pg_catalog.jsonb_build_object('resource_type','active_recall_state','batch_id',batch.id,'active_count',recall_count),
        pg_catalog.jsonb_build_object('resource_type','pending_inventory_document_state','batch_id',batch.id,'active_count',pending_count));
    END LOOP;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object(
    'source_branch_id',source_branch.id,'source_branch_name',source_branch.name,
    'destination_branch_id',destination_branch.id,'destination_branch_name',destination_branch.name,
    'source_location_id',source_location.id,'source_location_name',source_location.name,
    'destination_location_id',destination_location.id,'destination_location_name',destination_location.name,
    'transfer_date',transfer_date,'lines',resolved_lines,'total_base_quantity',total_quantity::text,
    'total_value',total_value::text,'transporter_name',transporter_name,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','movement','inter_branch_atomic',
      'approval_policy','actor_confirmation','batch_policy','strict_fefo_earliest_expiry_tier','tax_supply_created',false));
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, request_document jsonb) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."assert_inventory_transfer_draft"(organization_id uuid, inventory_document_id uuid, resolved_document jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE document inventory.inventory_documents%ROWTYPE;
BEGIN
  SELECT * INTO STRICT document FROM inventory.inventory_documents WHERE org_id=organization_id AND id=inventory_document_id FOR SHARE;
  IF ROW(document.branch_id,document.destination_branch_id,document.document_type,document.document_date,document.status,
         document.reason_code,document.currency_code,document.costing_method_snapshot,document.total_abs_base_quantity,document.total_value,
         document.physical_movement_required)
     IS DISTINCT FROM ROW((resolved_document->>'source_branch_id')::uuid,(resolved_document->>'destination_branch_id')::uuid,
       'transfer',(resolved_document->>'transfer_date')::date,'submitted','inter_branch_transfer','INR'::bpchar,
       'moving_weighted_average',(resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric,true)
     OR (SELECT count(*) FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id)<>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR EXISTS(SELECT 1 FROM inventory.inventory_document_lines line WHERE line.org_id=organization_id
          AND line.inventory_document_id=inventory_document_id AND NOT EXISTS(
            SELECT 1 FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') expected(value)
             WHERE (expected.value->>'inventory_document_line_id')::uuid=line.id
               AND (expected.value->>'line_number')::integer=line.line_number AND line.movement_kind='transfer'
               AND (expected.value->>'product_id')::uuid=line.product_id AND (expected.value->>'batch_id')::uuid=line.batch_id
               AND expected.value->>'uom_code'=line.uom_code
               AND (expected.value->>'base_quantity')::numeric=line.entered_quantity
               AND (expected.value->>'base_quantity')::numeric=line.base_quantity
               AND (resolved_document->>'source_location_id')::uuid=line.from_location_id
               AND (resolved_document->>'destination_location_id')::uuid=line.to_location_id
               AND (expected.value->>'unit_cost')::numeric=line.unit_cost
               AND (expected.value->>'extended_cost')::numeric=line.extended_cost)) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='prepared inter-branch transfer differs from approved preview'; END IF;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."assert_inventory_transfer_draft"(organization_id uuid, inventory_document_id uuid, resolved_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."assert_inventory_transfer_draft"(organization_id uuid, inventory_document_id uuid, resolved_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, key_hash bytea, document_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
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
        aggregate_hash bytea; sequence_id uuid; document_number text; fiscal_year integer; resolved_line jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR command_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
     OR expires_at<=pg_catalog.transaction_timestamp()
     OR request_document->>'inventory_document_id' IS DISTINCT FROM inventory_document_id::text THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='inter-branch transfer persistence envelope is invalid'; END IF;
  current_resolution:="erp_automation_commands"."resolve_inventory_transfer_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,inventory_document_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR preview_document->>'operation'<>'inventory.document.post'
     OR preview_document->>'capability_code'<>'inventory.transfer.prepare'
     OR preview_document->>'target_resource_type'<>'inventory_document'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM inventory_document_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='inter-branch transfer resolution or preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='inventory.transfer.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM inventory_document_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='inter-branch transfer idempotency key has different input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'transfer_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'transfer_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'transfer_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'inventory.transfer.prepare',
    (resolved_document->>'source_branch_id')::uuid,(resolved_document->>'destination_branch_id')::uuid,
    inventory_document_id,(resolved_document->>'total_value')::numeric,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'source_branch_id')::uuid AND document_type='stock_transfer'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  document_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,document_sequence_key_hash,expires_at);
  INSERT INTO inventory.inventory_documents(org_id,id,branch_id,destination_branch_id,physical_movement_required,
    origin_address_line1,origin_address_line2,origin_city,origin_state_code,origin_pincode,
    destination_address_line1,destination_address_line2,destination_city,destination_state_code,destination_pincode,
    transport_mode,distance_km,transporter_party_id,transporter_name_snapshot,vehicle_number_snapshot,vehicle_type_snapshot,
    transport_document_number_snapshot,transport_document_date,movement_started_at,document_type,document_number,
    fiscal_year,document_date,status,reason_code,currency_code,costing_method_snapshot,total_abs_base_quantity,total_value)
  SELECT organization_id,inventory_document_id,source.id,destination.id,true,
    source.address_line1,source.address_line2,source.city,source.state_code,source.postal_code,
    destination.address_line1,destination.address_line2,destination.city,destination.state_code,destination.postal_code,
    request_document#>>'{logistics,transport_mode}',(request_document#>>'{logistics,distance_km}')::numeric,
    NULLIF(request_document#>>'{logistics,transporter_party_id}','')::uuid,resolved_document->>'transporter_name',
    request_document#>>'{logistics,vehicle_number}',request_document#>>'{logistics,vehicle_type}',
    request_document#>>'{logistics,transport_document_number}',NULLIF(request_document#>>'{logistics,transport_document_date}','')::date,
    pg_catalog.transaction_timestamp(),'transfer',document_number,fiscal_year,(resolved_document->>'transfer_date')::date,
    'submitted','inter_branch_transfer','INR','moving_weighted_average',
    (resolved_document->>'total_base_quantity')::numeric,(resolved_document->>'total_value')::numeric
   FROM core.branches source JOIN core.branches destination ON destination.org_id=source.org_id
   WHERE source.org_id=organization_id AND source.id=(resolved_document->>'source_branch_id')::uuid
     AND destination.id=(resolved_document->>'destination_branch_id')::uuid;
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    INSERT INTO inventory.inventory_document_lines(org_id,id,inventory_document_id,line_number,movement_kind,
      product_id,batch_id,uom_code,entered_quantity,base_quantity,from_location_id,to_location_id,unit_cost,extended_cost)
    VALUES(organization_id,(resolved_line->>'inventory_document_line_id')::uuid,inventory_document_id,
      (resolved_line->>'line_number')::integer,'transfer',(resolved_line->>'product_id')::uuid,
      (resolved_line->>'batch_id')::uuid,resolved_line->>'uom_code',(resolved_line->>'base_quantity')::numeric,
      (resolved_line->>'base_quantity')::numeric,(resolved_document->>'source_location_id')::uuid,
      (resolved_document->>'destination_location_id')::uuid,(resolved_line->>'unit_cost')::numeric,
      (resolved_line->>'extended_cost')::numeric);
  END LOOP;
  PERFORM "erp_automation_commands"."assert_inventory_transfer_draft"(organization_id,inventory_document_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, key_hash bytea, document_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, key_hash bytea, document_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_inventory_transfer_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, inventory_document_id uuid, command_id uuid, key_hash bytea, document_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) TO "erp_runtime";

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
           OR EXISTS (
                SELECT 1 FROM pg_catalog.jsonb_array_elements(current_resolution->'lines') resolved(value)
                JOIN LATERAL (
                  SELECT output.value FROM pg_catalog.jsonb_array_elements(
                    pg_catalog.convert_from(calculation_artifact.output_bytes,'UTF8')::jsonb->'lines') output(value)
                   WHERE output.value->>'line_id'=resolved.value->>'line_id'
                ) calculated ON true
               WHERE resolved.value->>'line_kind'='product'
                 AND (calculated.value->>'net_value_amount')::numeric
                     IS DISTINCT FROM (resolved.value->>'receipt_cost')::numeric)
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
          NULL::uuid,NULL::bytea,NULL::bytea,request_row.idempotency_key_hash,request_row.request_hash,
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
