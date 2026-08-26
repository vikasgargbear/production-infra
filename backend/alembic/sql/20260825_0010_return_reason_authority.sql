-- Return reason authority is the effective reviewed GST adjustment rule release.
-- The prior purchase-return pilot duplicated two reason codes in its resolver input gate.
SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_purchase_return_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, purchase_return_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE requested_branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        supplier_invoice_id uuid:=NULLIF(request_document->>'original_supplier_invoice_id','')::uuid;
        return_date date:=NULLIF(request_document->>'return_date','')::date;
        logistics jsonb:=request_document->'logistics'; transport_mode text:=logistics->>'transport_mode';
        transporter_party_id uuid:=NULLIF(logistics->>'transporter_party_id','')::uuid;
        invoice procurement.supplier_invoices%ROWTYPE; original_tax tax.documents%ROWTYPE;
        supplier parties.supplier_accounts%ROWTYPE; supplier_party parties.parties%ROWTYPE;
        supplier_registration parties.tax_registrations%ROWTYPE; destination parties.addresses%ROWTYPE;
        branch core.branches%ROWTYPE; transporter parties.parties%ROWTYPE; transporter_registration parties.tax_registrations%ROWTYPE;
        rule tax.gst_adjustment_rule_versions%ROWTYPE; rule_release core.reference_data_releases%ROWTYPE;
        portal_line tax.portal_document_lines%ROWTYPE; portal_document tax.portal_documents%ROWTYPE;
        original_artifact calculation.artifacts%ROWTYPE; original_open finance.open_items%ROWTYPE; original_event finance.accounting_events%ROWTYPE;
        requested_line jsonb; source procurement.supplier_invoice_lines%ROWTYPE;
        invoice_allocation procurement.supplier_invoice_receipt_allocations%ROWTYPE;
        receipt_line procurement.goods_receipt_lines%ROWTYPE; receipt procurement.goods_receipts%ROWTYPE;
        receipt_document inventory.inventory_documents%ROWTYPE; receipt_inventory_line inventory.inventory_document_lines%ROWTYPE;
        batch inventory.batches%ROWTYPE; source_location inventory.locations%ROWTYPE; balance inventory.stock_balances%ROWTYPE;
        inventory_account finance.accounts%ROWTYPE; variance_account finance.accounts%ROWTYPE;
        resolved_lines jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb; prior_state jsonb;
        requested_billed numeric(20,6); requested_free numeric(20,6); base_billed numeric(20,6); base_free numeric(20,6);
        prior_billed numeric(20,6); prior_free numeric(20,6); line_number integer:=0; candidate_count integer;
        is_final boolean; legal_scope jsonb; adjustment_deadline date; original_output jsonb;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR purchase_return_id IS NULL OR requested_branch_id IS NULL OR supplier_invoice_id IS NULL
     OR return_date IS NULL OR request_document->>'return_source_kind'<>'invoiced'
     OR request_document->>'gst_tax_treatment' NOT IN ('statutory','commercial_only')
     OR NULLIF(request_document->>'supplier_destination_address_id','')::uuid IS NULL
     OR pg_catalog.jsonb_typeof(logistics)<>'object' OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-return invoiced pilot input is incomplete'; END IF;
  IF transport_mode NOT IN ('road','rail','air','ship','multimodal','in_person')
     OR NULLIF(logistics->>'distance_km','')::numeric<0
     OR (transport_mode='road' AND (NULLIF(logistics->>'vehicle_number','') IS NULL OR logistics->>'vehicle_type' NOT IN ('regular','over_dimensional_cargo')))
     OR (transport_mode<>'road' AND (NULLIF(logistics->>'vehicle_number','') IS NOT NULL OR NULLIF(logistics->>'vehicle_type','') IS NOT NULL))
     OR (transport_mode IN ('rail','air','ship','multimodal') AND (NULLIF(logistics->>'transport_document_number','') IS NULL OR NULLIF(logistics->>'transport_document_date','')::date IS NULL))
     OR ((NULLIF(logistics->>'transport_document_number','') IS NULL) IS DISTINCT FROM (NULLIF(logistics->>'transport_document_date','') IS NULL))
     OR (transport_mode='in_person' AND (transporter_party_id IS NOT NULL OR NULLIF(logistics->>'transport_document_number','') IS NOT NULL))
     OR (transport_mode<>'in_person' AND transporter_party_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return logistics fields do not match the selected transport mode'; END IF;
  IF (SELECT count(DISTINCT value->>'goods_receipt_line_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines'))
       <>pg_catalog.jsonb_array_length(request_document->'lines') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return pilot requires unique receipt lines and supplier-invoice sources'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp()
     AND (grant_row.branch_id IS NULL OR grant_row.branch_id=requested_branch_id)
     AND capability.capability_code='procurement.purchase_return.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-return delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('procurement.purchase_return.create',requested_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('procurement.return.post',requested_branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-return verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=requested_branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT invoice FROM procurement.supplier_invoices WHERE org_id=organization_id AND id=supplier_invoice_id
    AND branch_id=requested_branch_id AND status='posted' AND currency_code='INR' AND supply_type IN ('intra_state','inter_state')
    AND zero_rated_payment_mode='not_applicable' AND tax_charge_mechanism='normal' FOR UPDATE;
  IF return_date<invoice.supplier_invoice_date THEN RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='purchase return cannot precede supplier invoice'; END IF;
  SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=invoice.supplier_account_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT supplier_party FROM parties.parties WHERE org_id=organization_id AND id=supplier.party_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT destination FROM parties.addresses WHERE org_id=organization_id
    AND id=(request_document->>'supplier_destination_address_id')::uuid AND party_id=supplier.party_id
    AND address_kind IN ('registered','shipping','warehouse') AND status='active'
    AND (valid_from IS NULL OR valid_from<=return_date) AND (valid_until IS NULL OR valid_until>=return_date) FOR SHARE;
  IF transporter_party_id IS NOT NULL THEN
    SELECT * INTO STRICT transporter FROM parties.parties WHERE org_id=organization_id AND id=transporter_party_id
      AND status='active' FOR SHARE;
    SELECT * INTO transporter_registration FROM parties.tax_registrations WHERE org_id=organization_id AND party_id=transporter.id
      AND registration_type='GSTIN' AND status='active' AND (valid_from IS NULL OR valid_from<=return_date)
      AND (valid_until IS NULL OR valid_until>=return_date) ORDER BY id LIMIT 1 FOR SHARE;
  END IF;
  SELECT tax_document.* INTO STRICT original_tax FROM tax.documents tax_document
   WHERE tax_document.org_id=organization_id AND tax_document.supplier_invoice_id=invoice.id
     AND tax_document.direction='inward' AND tax_document.document_effect='original' FOR SHARE;
  SELECT * INTO STRICT supplier_registration FROM parties.tax_registrations WHERE org_id=organization_id
    AND id=invoice.supplier_tax_registration_id AND party_id=supplier.party_id AND registration_type='GSTIN'
    AND registration_number=original_tax.counterparty_gstin AND status='active' AND verified_at IS NOT NULL
    AND taxpayer_type IN ('regular','casual') AND (valid_from IS NULL OR valid_from<=return_date)
    AND (valid_until IS NULL OR valid_until>=return_date) FOR SHARE;
  SELECT artifact.* INTO STRICT original_artifact FROM calculation.artifacts artifact
   WHERE artifact.org_id=organization_id AND artifact.supplier_invoice_id=invoice.id
     AND artifact.operation='procurement.supplier_invoice.post' AND artifact.status='consumed' FOR SHARE;
  SELECT * INTO STRICT original_event FROM finance.accounting_events event
   WHERE event.org_id=organization_id AND event.supplier_invoice_id=invoice.id FOR SHARE;
  SELECT * INTO STRICT original_open FROM finance.open_items open_item
   WHERE open_item.org_id=organization_id AND open_item.accounting_event_id=original_event.id FOR UPDATE;
  SELECT count(*) INTO candidate_count FROM tax.gst_adjustment_rule_versions adjustment_rule
   WHERE adjustment_rule.status='active' AND adjustment_rule.side='purchase' AND adjustment_rule.direction='debit'
     AND adjustment_rule.document_effect='decrease' AND adjustment_rule.reason_code=request_document->>'reason_code'
     AND adjustment_rule.tax_effect=request_document->>'gst_tax_treatment' AND adjustment_rule.effective_from<=return_date
     AND (adjustment_rule.effective_to IS NULL OR adjustment_rule.effective_to>=return_date);
  IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='purchase return requires one exact effective GST adjustment authority matching treatment'; END IF;
  SELECT * INTO STRICT rule FROM tax.gst_adjustment_rule_versions adjustment_rule
   WHERE adjustment_rule.status='active' AND adjustment_rule.side='purchase' AND adjustment_rule.direction='debit'
     AND adjustment_rule.document_effect='decrease' AND adjustment_rule.reason_code=request_document->>'reason_code'
     AND adjustment_rule.tax_effect=request_document->>'gst_tax_treatment' AND adjustment_rule.effective_from<=return_date
     AND (adjustment_rule.effective_to IS NULL OR adjustment_rule.effective_to>=return_date) FOR SHARE;
  SELECT * INTO STRICT rule_release FROM core.reference_data_releases WHERE id=rule.release_id AND status='active' FOR SHARE;
  IF rule.tax_effect='statutory' THEN
    IF NULLIF(request_document->>'supplier_credit_note_portal_line_id','')::uuid IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory purchase return requires exact supplier GSTR-2B credit-note evidence'; END IF;
    SELECT line.* INTO STRICT portal_line FROM tax.portal_document_lines line JOIN tax.portal_documents parent
      ON parent.org_id=line.org_id AND parent.id=line.portal_document_id
     WHERE line.org_id=organization_id AND line.id=(request_document->>'supplier_credit_note_portal_line_id')::uuid
       AND parent.portal_document_type='gstr2b' AND parent.status='parsed' AND parent.registration_id=original_tax.registration_id
       AND line.document_type='credit_note' AND line.supplier_gstin=original_tax.counterparty_gstin
       AND line.place_of_supply_state_code=original_tax.place_of_supply_state_code FOR SHARE OF line,parent;
    SELECT * INTO STRICT portal_document FROM tax.portal_documents WHERE org_id=organization_id AND id=portal_line.portal_document_id FOR SHARE;
    SELECT count(*) INTO candidate_count FROM tax.portal_document_lines line JOIN tax.portal_documents parent
      ON parent.org_id=line.org_id AND parent.id=line.portal_document_id
     WHERE line.org_id=organization_id AND parent.portal_document_type='gstr2b' AND parent.status='parsed'
       AND parent.registration_id=original_tax.registration_id AND line.document_type='credit_note'
       AND ROW(line.supplier_gstin,line.invoice_number,line.invoice_date,line.place_of_supply_state_code)
         IS NOT DISTINCT FROM ROW(portal_line.supplier_gstin,portal_line.invoice_number,portal_line.invoice_date,portal_line.place_of_supply_state_code);
    IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='supplier credit note is ambiguous across parsed GSTR-2B evidence'; END IF;
    IF rule.deadline_policy='days_after_original' THEN adjustment_deadline:=invoice.supplier_invoice_date+rule.deadline_days;
    ELSIF rule.deadline_policy='november_30_following_fy' THEN
      adjustment_deadline:=pg_catalog.make_date(pg_catalog.date_part('year',invoice.supplier_invoice_date)::integer+
        CASE WHEN pg_catalog.date_part('month',invoice.supplier_invoice_date)>=4 THEN 1 ELSE 0 END,11,30);
    END IF;
    IF adjustment_deadline IS NOT NULL AND return_date>adjustment_deadline THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory purchase return is after the exact effective-rule deadline'; END IF;
  ELSIF NULLIF(request_document->>'supplier_credit_note_portal_line_id','') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only purchase return forbids supplier portal credit-note evidence';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||invoice.id::text,734821));
  SELECT pg_catalog.jsonb_build_object(
    'products',coalesce(pg_catalog.jsonb_agg(item ORDER BY item->>'line_id'),'[]'::jsonb),'charges','[]'::jsonb,
    'rounding_adjustment',coalesce((SELECT sum(prior.rounding_adjustment) FROM procurement.purchase_returns prior
      WHERE prior.org_id=organization_id AND prior.supplier_invoice_id=invoice.id AND prior.status='posted'),0)::text)
    INTO prior_state FROM (
      SELECT pg_catalog.jsonb_build_object('line_id',allocation.supplier_invoice_line_id,'value_basis',min(line.reversal_value_basis),
        'reversed_billed_quantity',sum(line.billed_quantity)::text,'reversed_free_quantity',sum(line.free_quantity)::text,
        'reversed_base_billed_quantity',sum(line.base_billed_quantity)::text,'reversed_base_free_quantity',sum(line.base_free_quantity)::text,
        'gross_price_amount',sum((calculated.value->>'gross_amount')::numeric)::text,
        'line_discount_amount',sum((calculated.value->>'line_discount_amount')::numeric)::text,
        'document_discount_amount',sum((calculated.value->>'document_discount_amount')::numeric)::text,
        'net_value_amount',sum(line.net_value_amount)::text,'gst_taxable_value',sum(line.gst_taxable_value)::text,
        'cgst_amount',sum(line.cgst_amount)::text,'sgst_amount',sum(line.sgst_amount)::text,
        'igst_amount',sum(line.igst_amount)::text,'cess_amount',sum(line.cess_amount)::text) item
      FROM procurement.purchase_return_lines line JOIN procurement.purchase_returns parent
        ON parent.org_id=line.org_id AND parent.id=line.purchase_return_id AND parent.status='posted'
      JOIN procurement.supplier_invoice_receipt_allocations allocation
        ON allocation.org_id=line.org_id AND allocation.id=line.supplier_invoice_receipt_allocation_id
      JOIN calculation.artifacts artifact ON artifact.org_id=parent.org_id AND artifact.purchase_return_id=parent.id AND artifact.status='consumed'
      JOIN LATERAL pg_catalog.jsonb_array_elements(pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb->'lines') calculated(value)
        ON calculated.value->>'line_id'=allocation.supplier_invoice_line_id::text
      WHERE line.org_id=organization_id AND parent.supplier_invoice_id=invoice.id
        AND allocation.supplier_invoice_line_id IN (
          SELECT source_allocation.supplier_invoice_line_id FROM pg_catalog.jsonb_array_elements(request_document->'lines') requested(value)
          JOIN procurement.supplier_invoice_receipt_allocations source_allocation ON source_allocation.org_id=organization_id
            AND source_allocation.id=(requested.value->>'supplier_invoice_receipt_allocation_id')::uuid)
      GROUP BY allocation.supplier_invoice_line_id
    ) prior_items;
  SELECT * INTO STRICT inventory_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'inventory_asset','asset','INR',false) FOR SHARE;
  SELECT * INTO STRICT variance_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,invoice.branch_id,'purchase_return_inventory_variance','expense','INR',false) FOR SHARE;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_party','id',supplier_party.id,'row_version',supplier_party.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_invoice','id',invoice.id,'row_version',invoice.row_version),
    pg_catalog.jsonb_build_object('resource_type','original_tax_document','id',original_tax.id,'source_hash',pg_catalog.encode(original_tax.source_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','original_calculation_artifact','id',original_artifact.id,'authority_hash',pg_catalog.encode(original_artifact.authority_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_tax_registration','id',supplier_registration.id,'row_version',supplier_registration.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_destination_address','id',destination.id,'row_version',destination.row_version),
    pg_catalog.jsonb_build_object('resource_type','original_payable_event','id',original_event.id,'source_posted_at',original_event.source_posted_at),
    pg_catalog.jsonb_build_object('resource_type','original_payable_open_item','id',original_open.id,'principal_amount',original_open.principal_amount,'status',original_open.status),
    pg_catalog.jsonb_build_object('resource_type','original_payable_allocation_state','open_item_id',original_open.id,
      'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item) ORDER BY item.id)
        FROM finance.allocations item WHERE item.org_id=organization_id AND item.open_item_id=original_open.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_invoice_adjustment_state','supplier_invoice_id',invoice.id,
      'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'headers',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(note) ORDER BY note.id) FROM finance.adjustment_notes note
          WHERE note.org_id=organization_id AND note.supplier_invoice_id=invoice.id AND note.status='posted'),'[]'::jsonb),
        'lines',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(line) ORDER BY line.id) FROM finance.adjustment_note_lines line
          JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
          WHERE note.org_id=organization_id AND note.supplier_invoice_id=invoice.id AND note.status='posted'),'[]'::jsonb))::text,'UTF8'),'sha256'),'hex')),
    pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule','id',rule.id,'release_id',rule.release_id,'rule_version',rule.rule_version),
    pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule_release','id',rule_release.id,'dataset_sha256',pg_catalog.encode(rule_release.dataset_sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','inventory_asset','id',inventory_account.id,'row_version',inventory_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','purchase_return_inventory_variance','id',variance_account.id,'row_version',variance_account.row_version),
    pg_catalog.jsonb_build_object('resource_type','purchase_return_prior_state','supplier_invoice_id',invoice.id,
      'source_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(prior_state::text,'UTF8'),'sha256'),'hex')));
  IF transporter_party_id IS NOT NULL THEN source_versions:=source_versions||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','transporter','id',transporter.id,'row_version',transporter.row_version)); END IF;
  IF rule.tax_effect='statutory' THEN source_versions:=source_versions||pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','supplier_credit_note_portal_document','id',portal_document.id,'source_hash',pg_catalog.encode(portal_document.source_sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','supplier_credit_note_portal_line','id',portal_line.id,'source_hash',pg_catalog.encode(portal_line.source_row_hash,'hex'))); END IF;
  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    line_number:=line_number+1;
    IF NULLIF(requested_line->>'supplier_invoice_receipt_allocation_id','')::uuid IS NULL
       OR pg_catalog.jsonb_typeof(requested_line->'batch_allocation')<>'object' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='purchase-return line requires one invoice allocation and batch'; END IF;
    requested_billed:=(requested_line->>'billed_quantity')::numeric; requested_free:=(requested_line->>'free_quantity')::numeric;
    IF requested_billed<0 OR requested_free<0 OR requested_billed+requested_free<=0
       OR (requested_line#>>'{batch_allocation,billed_quantity}')::numeric IS DISTINCT FROM requested_billed
       OR (requested_line#>>'{batch_allocation,free_quantity}')::numeric IS DISTINCT FROM requested_free THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return batch quantities must be positive and reconcile separately'; END IF;
    SELECT * INTO STRICT invoice_allocation FROM procurement.supplier_invoice_receipt_allocations WHERE org_id=organization_id
      AND id=(requested_line->>'supplier_invoice_receipt_allocation_id')::uuid
      AND goods_receipt_line_id=(requested_line->>'goods_receipt_line_id')::uuid FOR UPDATE;
    SELECT invoice_line.* INTO STRICT source FROM procurement.supplier_invoice_lines invoice_line
     WHERE invoice_line.org_id=organization_id AND invoice_line.id=invoice_allocation.supplier_invoice_line_id
       AND invoice_line.supplier_invoice_id=invoice.id AND invoice_line.line_kind='product'
       AND invoice_line.inventory_cost_treatment='capitalize' AND invoice_line.itc_eligibility='eligible'
       AND invoice_line.tax_charge_mechanism='normal' FOR SHARE;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(request_document->'lines') other(value)
      JOIN procurement.supplier_invoice_receipt_allocations other_allocation ON other_allocation.org_id=organization_id
        AND other_allocation.id=(other.value->>'supplier_invoice_receipt_allocation_id')::uuid
      WHERE other.value IS DISTINCT FROM requested_line AND other_allocation.supplier_invoice_line_id=source.id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return pilot requires one unique supplier invoice line per command'; END IF;
    SELECT * INTO STRICT receipt_line FROM procurement.goods_receipt_lines WHERE org_id=organization_id
      AND id=invoice_allocation.goods_receipt_line_id AND product_id=source.product_id AND uom_code=source.uom_code FOR SHARE;
    SELECT * INTO STRICT receipt FROM procurement.goods_receipts WHERE org_id=organization_id AND id=receipt_line.goods_receipt_id
      AND status='posted' AND branch_id=invoice.branch_id AND supplier_account_id=invoice.supplier_account_id FOR SHARE;
    SELECT * INTO STRICT receipt_document FROM inventory.inventory_documents WHERE org_id=organization_id
      AND goods_receipt_id=receipt.id AND document_type='purchase_receipt' AND status='posted' FOR SHARE;
    SELECT * INTO STRICT receipt_inventory_line FROM inventory.inventory_document_lines WHERE org_id=organization_id
      AND inventory_document_id=receipt_document.id AND goods_receipt_line_id=receipt_line.id
      AND product_id=receipt_line.product_id AND batch_id=receipt_line.batch_id AND to_location_id=receipt_line.location_id FOR SHARE;
    SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id AND id=receipt_line.batch_id
      AND id=(requested_line#>>'{batch_allocation,batch_id}')::uuid AND product_id=source.product_id
      AND lot_kind='manufacturer_batch' AND status='released' AND released_at IS NOT NULL
      AND expires_on IS NOT NULL AND return_date<expires_on FOR SHARE;
    SELECT * INTO STRICT source_location FROM inventory.locations WHERE org_id=organization_id
      AND id=receipt_line.location_id AND id=(requested_line->>'from_location_id')::uuid AND branch_id=invoice.branch_id
      AND status='active' AND allows_sale=true AND location_type IN ('saleable','cold_storage') FOR SHARE;
    SELECT * INTO STRICT balance FROM inventory.stock_balances WHERE org_id=organization_id
      AND location_id=source_location.id AND product_id=source.product_id AND batch_id=batch.id FOR UPDATE;
    base_billed:=pg_catalog.round(requested_billed*source.uom_conversion_factor,6);
    base_free:=pg_catalog.round(requested_free*source.uom_conversion_factor,6);
    IF base_billed+base_free>balance.on_hand_quantity OR balance.average_unit_cost<=0 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return exact receipt location lacks sufficient valued stock'; END IF;
    SELECT coalesce(sum(line.base_billed_quantity),0),coalesce(sum(line.base_free_quantity),0) INTO prior_billed,prior_free
      FROM procurement.purchase_return_lines line JOIN procurement.purchase_returns parent
        ON parent.org_id=line.org_id AND parent.id=line.purchase_return_id
     WHERE line.org_id=organization_id AND line.supplier_invoice_receipt_allocation_id=invoice_allocation.id AND parent.status='posted';
    IF prior_billed+base_billed>invoice_allocation.allocated_base_billed_quantity
       OR prior_free+base_free>invoice_allocation.allocated_base_free_quantity THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase-return billed or free quantity exceeds supplier invoice receipt allocation'; END IF;
    is_final:=((SELECT coalesce(sum(returned.base_billed_quantity),0) FROM procurement.purchase_return_lines returned
      JOIN procurement.purchase_returns parent ON parent.org_id=returned.org_id AND parent.id=returned.purchase_return_id
      JOIN procurement.supplier_invoice_receipt_allocations allocated ON allocated.org_id=returned.org_id AND allocated.id=returned.supplier_invoice_receipt_allocation_id
      WHERE returned.org_id=organization_id AND allocated.supplier_invoice_line_id=source.id AND parent.status='posted')+base_billed=source.base_billed_quantity
      AND (SELECT coalesce(sum(returned.base_free_quantity),0) FROM procurement.purchase_return_lines returned
      JOIN procurement.purchase_returns parent ON parent.org_id=returned.org_id AND parent.id=returned.purchase_return_id
      JOIN procurement.supplier_invoice_receipt_allocations allocated ON allocated.org_id=returned.org_id AND allocated.id=returned.supplier_invoice_receipt_allocation_id
      WHERE returned.org_id=organization_id AND allocated.supplier_invoice_line_id=source.id AND parent.status='posted')+base_free=source.base_free_quantity);
    resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_number',line_number,'line_id',requested_line->>'line_id','goods_receipt_line_id',receipt_line.id,
      'supplier_invoice_line_id',source.id,'supplier_invoice_receipt_allocation_id',invoice_allocation.id,
      'product_id',source.product_id,'batch_id',batch.id,'from_location_id',source_location.id,'uom_code',source.uom_code,
      'uom_conversion_factor',source.uom_conversion_factor,'billed_quantity',requested_billed,'free_quantity',requested_free,
      'base_billed_quantity',base_billed,'base_free_quantity',base_free,'final_residual',is_final,
      'unit_cost',balance.average_unit_cost,'extended_cost',pg_catalog.round((base_billed+base_free)*balance.average_unit_cost,2),
      'source',pg_catalog.to_jsonb(source),'input',requested_line));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','supplier_invoice_line','id',source.id,'invoice_row_version',invoice.row_version),
      pg_catalog.jsonb_build_object('resource_type','supplier_invoice_receipt_allocation','id',invoice_allocation.id,
        'allocated_base_billed_quantity',invoice_allocation.allocated_base_billed_quantity,'allocated_base_free_quantity',invoice_allocation.allocated_base_free_quantity,
        'prior_returned_base_billed_quantity',prior_billed,'prior_returned_base_free_quantity',prior_free),
      pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version),
      pg_catalog.jsonb_build_object('resource_type','goods_receipt_line','id',receipt_line.id,'extended_cost',receipt_line.extended_cost),
      pg_catalog.jsonb_build_object('resource_type','original_purchase_receipt_line','id',receipt_inventory_line.id,'unit_cost',receipt_inventory_line.unit_cost),
      pg_catalog.jsonb_build_object('resource_type','batch','id',batch.id,'row_version',batch.row_version,'expires_on',batch.expires_on),
      pg_catalog.jsonb_build_object('resource_type','source_location','id',source_location.id,'row_version',source_location.row_version),
      pg_catalog.jsonb_build_object('resource_type','stock_balance','location_id',balance.location_id,'product_id',balance.product_id,
        'batch_id',balance.batch_id,'row_version',balance.row_version,'on_hand_quantity',balance.on_hand_quantity,'average_unit_cost',balance.average_unit_cost));
  END LOOP;
  original_output:=pg_catalog.convert_from(original_artifact.output_bytes,'UTF8')::jsonb;
  legal_scope:=pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','return_source_kind','invoiced',
    'tax_charge_mechanism','normal','gst_tax_treatment',rule.tax_effect,'physical_stock','released_unexpired_original_grn_location',
    'posted_return_reversal','unavailable','uninvoiced_return','unavailable');
  RETURN pg_catalog.jsonb_build_object('branch_id',invoice.branch_id,'supplier_account_id',invoice.supplier_account_id,
    'supplier_invoice_id',invoice.id,'return_date',return_date,'reason_code',rule.reason_code,'return_source_kind','invoiced',
    'gst_adjustment_rule_version_id',rule.id,'gst_tax_treatment',rule.tax_effect,'zero_rated_payment_mode',invoice.zero_rated_payment_mode,
    'tax_charge_mechanism',invoice.tax_charge_mechanism,'rounding_policy',invoice.rounding_policy,
    'ruleset_version',invoice.calculation_ruleset_version,'original_calculation_input',pg_catalog.convert_from(original_artifact.input_bytes,'UTF8')::jsonb,
    'original_calculation_output',original_output,'prior_state',prior_state,'lines',resolved_lines,
    'portal_taxable_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.taxable_amount END,
    'portal_cgst_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.cgst_amount END,
    'portal_sgst_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.sgst_amount END,
    'portal_igst_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.igst_amount END,
    'portal_cess_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.cess_amount END,
    'portal_total_amount',CASE WHEN rule.tax_effect='statutory' THEN portal_line.total_amount END,
    'origin',pg_catalog.jsonb_build_object('line1',branch.address_line1,'line2',branch.address_line2,'city',branch.city,'state_code',branch.state_code,'pincode',branch.postal_code),
    'destination',pg_catalog.jsonb_build_object('address_id',destination.id,'line1',destination.line1,'line2',destination.line2,'city',destination.city,'state_code',destination.state_code,'pincode',destination.postal_code),
    'transport_mode',transport_mode,'distance_km',(logistics->>'distance_km')::numeric::text,'transporter_party_id',transporter_party_id,
    'transporter_name',transporter.legal_name,'transporter_gstin',transporter_registration.registration_number,
    'vehicle_number',NULLIF(logistics->>'vehicle_number',''),'vehicle_type',NULLIF(logistics->>'vehicle_type',''),
    'transport_document_number',NULLIF(logistics->>'transport_document_number',''),
    'transport_document_date',NULLIF(logistics->>'transport_document_date','')::date,
    'source_versions',source_versions,'legal_scope',legal_scope);
END
$function$;
ALTER FUNCTION "erp_automation_commands"."resolve_purchase_return_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, purchase_return_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";
