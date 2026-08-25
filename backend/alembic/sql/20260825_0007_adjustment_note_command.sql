CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        original_id uuid:=NULLIF(request_document->>'original_document_id','')::uuid;
        note_date date:=NULLIF(request_document->>'note_date','')::date;
        side text:=request_document->>'side'; direction text:=request_document->>'direction';
        treatment text:=request_document->>'gst_tax_treatment'; reason_code text:=request_document->>'reason_code';
        sales_header sales.invoices%ROWTYPE; purchase_header procurement.supplier_invoices%ROWTYPE;
        sales_line sales.invoice_lines%ROWTYPE; purchase_line procurement.supplier_invoice_lines%ROWTYPE;
        customer parties.customer_accounts%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE;
        original_tax tax.documents%ROWTYPE; original_artifact calculation.artifacts%ROWTYPE;
        original_event finance.accounting_events%ROWTYPE; original_open finance.open_items%ROWTYPE;
        rule tax.gst_adjustment_rule_versions%ROWTYPE; release core.reference_data_releases%ROWTYPE;
        evidence core.attachments%ROWTYPE; portal_line tax.portal_document_lines%ROWTYPE;
        account finance.accounts%ROWTYPE; requested jsonb; resolved_lines jsonb:='[]'::jsonb;
        sources jsonb:='[]'::jsonb; party_id uuid; branch_row_version bigint; document_row_version bigint;
        document_date date; supply_type text; zero_mode text; charge_mechanism text; ruleset text;
        prior_billed numeric(20,6); prior_free numeric(20,6); outstanding numeric(20,2);
        allocation_hash text; candidate_count integer; rate numeric(9,6); line_number integer:=0;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR adjustment_note_id IS NULL OR branch_id IS NULL OR original_id IS NULL OR note_date IS NULL
     OR treatment NOT IN ('statutory','commercial_only') OR reason_code IS NULL
     OR NOT ((side='sales' AND direction='credit') OR (side='purchase' AND direction='debit'))
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='adjustment-note input is incomplete or outside sales-credit/purchase-debit scope'; END IF;
  IF (SELECT count(*) FROM pg_catalog.jsonb_array_elements(request_document->'lines')) <>
     (SELECT count(DISTINCT value->>'original_line_id') FROM pg_catalog.jsonb_array_elements(request_document->'lines')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment-note original line identities must be unique'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.adjustment_note.prepare' AND capability.operation_mode='write'
     AND capability.approval_policy='separate_approver' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='adjustment-note delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.adjustment_note.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',NULL::uuid) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='adjustment-note verified context or cross-domain permission is inactive'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||original_id::text,734821));
  IF side='sales' THEN
    SELECT invoice.* INTO STRICT sales_header FROM sales.invoices invoice WHERE invoice.org_id=organization_id AND invoice.id=original_id
      AND invoice.branch_id=branch_id AND invoice.status='posted' AND invoice.invoice_type='tax_invoice' AND invoice.currency_code='INR'
      AND invoice.tax_charge_mechanism='normal' FOR UPDATE;
    document_date:=sales_header.invoice_date; branch_row_version:=(SELECT row_version FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE);
    document_row_version:=sales_header.row_version; supply_type:=sales_header.supply_type; zero_mode:=sales_header.zero_rated_payment_mode;
    charge_mechanism:=sales_header.tax_charge_mechanism; ruleset:=sales_header.calculation_ruleset_version;
    SELECT * INTO STRICT customer FROM parties.customer_accounts WHERE org_id=organization_id AND id=sales_header.customer_account_id AND status='active' FOR SHARE;
    party_id:=customer.party_id;
    SELECT * INTO STRICT account FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(
      organization_id,branch_id,'accounts_receivable','asset','INR',true) FOR SHARE;
    IF customer.default_receivable_account_id IS DISTINCT FROM account.id THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receivable account differs from canonical branch role'; END IF;
    SELECT * INTO STRICT original_event FROM finance.accounting_events WHERE org_id=organization_id AND sales_invoice_id=original_id AND event_type='sales_invoice' FOR SHARE;
  ELSE
    SELECT invoice.* INTO STRICT purchase_header FROM procurement.supplier_invoices invoice WHERE invoice.org_id=organization_id AND invoice.id=original_id
      AND invoice.branch_id=branch_id AND invoice.status='posted' AND invoice.currency_code='INR' AND invoice.tax_charge_mechanism='normal' FOR UPDATE;
    document_date:=purchase_header.supplier_invoice_date; branch_row_version:=(SELECT row_version FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE);
    document_row_version:=purchase_header.row_version; supply_type:=purchase_header.supply_type; zero_mode:=purchase_header.zero_rated_payment_mode;
    charge_mechanism:=purchase_header.tax_charge_mechanism; ruleset:=purchase_header.calculation_ruleset_version;
    SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=purchase_header.supplier_account_id AND status='active' FOR SHARE;
    party_id:=supplier.party_id;
    SELECT * INTO STRICT account FROM finance.accounts WHERE org_id=organization_id AND id=erp_commercial_commands.resolve_role_account(
      organization_id,branch_id,'accounts_payable','liability','INR',true) FOR SHARE;
    IF supplier.default_payable_account_id IS DISTINCT FROM account.id THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payable account differs from canonical branch role'; END IF;
    SELECT * INTO STRICT original_event FROM finance.accounting_events WHERE org_id=organization_id AND supplier_invoice_id=original_id AND event_type='supplier_invoice' FOR SHARE;
  END IF;
  IF note_date<document_date OR zero_mode<>'not_applicable' THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='adjustment note must follow a domestic non-zero-rated original'; END IF;
  SELECT * INTO STRICT original_tax FROM tax.documents WHERE org_id=organization_id AND document_effect='original'
    AND ((side='sales' AND sales_invoice_id=original_id) OR (side='purchase' AND supplier_invoice_id=original_id)) FOR SHARE;
  SELECT * INTO STRICT original_artifact FROM calculation.artifacts WHERE org_id=organization_id AND status='consumed'
    AND ((side='sales' AND sales_invoice_id=original_id AND operation='sales.invoice.post')
      OR (side='purchase' AND supplier_invoice_id=original_id AND operation='procurement.supplier_invoice.post')) FOR SHARE;
  SELECT * INTO STRICT original_open FROM finance.open_items WHERE org_id=organization_id AND accounting_event_id=original_event.id
    AND party_id=party_id AND item_side=CASE WHEN side='sales' THEN 'receivable' ELSE 'payable' END AND currency_code='INR' FOR UPDATE;
  SELECT original_open.principal_amount-coalesce(sum(allocation.amount) FILTER (WHERE allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id AND reversal.status='reversed')),0),
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',allocation.id,'amount',allocation.amount::text,'status',allocation.status,'reversal_of_allocation_id',allocation.reversal_of_allocation_id)
      ORDER BY allocation.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex')
    INTO outstanding,allocation_hash FROM finance.allocations allocation WHERE allocation.org_id=organization_id AND allocation.open_item_id=original_open.id;
  IF outstanding<0 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='original open item is overallocated'; END IF;
  SELECT count(*) INTO candidate_count FROM tax.gst_adjustment_rule_versions candidate WHERE candidate.status='active'
    AND candidate.side=side AND candidate.direction=direction AND candidate.document_effect='decrease'
    AND candidate.reason_code=reason_code AND candidate.tax_effect=treatment AND candidate.effective_from<=note_date
    AND (candidate.effective_to IS NULL OR candidate.effective_to>=note_date);
  IF candidate_count<>1 THEN RAISE EXCEPTION USING ERRCODE='21000', MESSAGE='adjustment note requires one exact effective reviewed GST rule'; END IF;
  SELECT * INTO STRICT rule FROM tax.gst_adjustment_rule_versions candidate WHERE candidate.status='active'
    AND candidate.side=side AND candidate.direction=direction AND candidate.document_effect='decrease'
    AND candidate.reason_code=reason_code AND candidate.tax_effect=treatment AND candidate.effective_from<=note_date
    AND (candidate.effective_to IS NULL OR candidate.effective_to>=note_date) FOR SHARE;
  SELECT * INTO STRICT release FROM core.reference_data_releases WHERE id=rule.release_id AND status='active' FOR SHARE;
  IF treatment='statutory' AND side='sales' THEN
    IF sales_header.customer_tax_registration_id IS NULL OR NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','')::uuid IS NULL
       OR NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','')::timestamptz IS NULL
       OR (request_document->>'recipient_itc_reversal_confirmed_at')::timestamptz>pg_catalog.transaction_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statutory sales credit requires registered buyer and past ITC-reversal confirmation'; END IF;
    SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id
      AND id=(request_document->>'recipient_itc_reversal_evidence_attachment_id')::uuid AND evidence_kind='recipient_itc_reversal'
      AND status IN ('verified','retained') AND verified_at IS NOT NULL
      AND verified_at<=(request_document->>'recipient_itc_reversal_confirmed_at')::timestamptz FOR SHARE;
  ELSIF treatment='statutory' AND side='purchase' THEN
    SELECT source.* INTO STRICT portal_line FROM tax.portal_document_lines source JOIN tax.portal_documents document
      ON document.org_id=source.org_id AND document.id=source.portal_document_id AND document.status='parsed'
      AND document.portal_document_type IN ('gstr2a','gstr2b') WHERE source.org_id=organization_id
      AND source.id=NULLIF(request_document->>'counterparty_portal_document_line_id','')::uuid
      AND source.document_type='credit_note' AND source.supplier_gstin=original_tax.counterparty_gstin FOR SHARE OF source,document;
  ELSIF NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','') IS NOT NULL
     OR NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','') IS NOT NULL
     OR NULLIF(request_document->>'counterparty_portal_document_line_id','') IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial-only adjustment forbids statutory evidence';
  END IF;
  sources:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch_id,'row_version',branch_row_version),
    pg_catalog.jsonb_build_object('resource_type',CASE WHEN side='sales' THEN 'sales_invoice' ELSE 'supplier_invoice' END,'id',original_id,'row_version',document_row_version),
    pg_catalog.jsonb_build_object('resource_type','original_tax_document','id',original_tax.id,'source_hash',pg_catalog.encode(original_tax.source_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','original_calculation_artifact','id',original_artifact.id,'authority_hash',pg_catalog.encode(original_artifact.authority_hash,'hex')),
    pg_catalog.jsonb_build_object('resource_type','original_open_item','id',original_open.id,'principal_amount',original_open.principal_amount::text,
      'outstanding_amount',outstanding::text,'status',original_open.status,'allocation_state_hash',allocation_hash),
    pg_catalog.jsonb_build_object('resource_type','gst_adjustment_rule','id',rule.id,'release_id',release.id,'rule_version',rule.rule_version,'tax_effect',rule.tax_effect),
    pg_catalog.jsonb_build_object('resource_type','party_account_role','id',account.id,'row_version',account.row_version));
  IF evidence.id IS NOT NULL THEN sources:=sources||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('resource_type','recipient_itc_reversal_evidence','id',evidence.id,'sha256',pg_catalog.encode(evidence.sha256,'hex'))); END IF;
  IF portal_line.id IS NOT NULL THEN sources:=sources||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('resource_type','counterparty_portal_document_line','id',portal_line.id,'portal_document_id',portal_line.portal_document_id)); END IF;
  FOR requested IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    line_number:=line_number+1;
    IF NULLIF(requested->>'line_id','')::uuid IS NULL OR NULLIF(requested->>'original_line_id','')::uuid IS NULL
       OR coalesce((requested->>'billed_quantity')::numeric,0)+coalesce((requested->>'free_quantity')::numeric,0)<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='adjustment line requires identities and positive quantity'; END IF;
    IF side='sales' THEN
      SELECT * INTO STRICT sales_line FROM sales.invoice_lines WHERE org_id=organization_id AND id=(requested->>'original_line_id')::uuid
        AND invoice_id=original_id AND line_kind='product' FOR SHARE;
      SELECT coalesce(sum(line.billed_quantity),0),coalesce(sum(line.free_quantity),0) INTO prior_billed,prior_free
        FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
       WHERE line.org_id=organization_id AND line.sales_invoice_line_id=sales_line.id AND note.status='posted' AND note.document_effect='decrease';
      IF prior_billed+(requested->>'billed_quantity')::numeric>sales_line.billed_quantity OR prior_free+(requested->>'free_quantity')::numeric>sales_line.free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales credit quantity exceeds remaining original invoice quantity'; END IF;
      rate:=CASE WHEN supply_type='intra_state' THEN sales_line.cgst_rate+sales_line.sgst_rate ELSE sales_line.igst_rate END;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line_number',line_number,'line_kind','product','line_id',requested->>'line_id',
        'original_line_id',sales_line.id,'product_id',sales_line.product_id,'account_id',sales_line.revenue_account_id,'uom_code',sales_line.uom_code,
        'multiplier',sales_line.uom_conversion_factor::text,'hsn_code',sales_line.tax_classification_code_snapshot,'tax_code_version_id',sales_line.tax_code_version_id,
        'taxability',sales_line.taxability_snapshot,'gst_rate',rate::text,'cess_rate',sales_line.cess_rate::text,
        'inventory_cost_treatment',NULL,'itc_eligibility',NULL,'input',requested));
    ELSE
      SELECT * INTO STRICT purchase_line FROM procurement.supplier_invoice_lines WHERE org_id=organization_id AND id=(requested->>'original_line_id')::uuid
        AND supplier_invoice_id=original_id AND line_kind='product' FOR SHARE;
      SELECT coalesce(sum(line.billed_quantity),0),coalesce(sum(line.free_quantity),0) INTO prior_billed,prior_free
        FROM finance.adjustment_note_lines line JOIN finance.adjustment_notes note ON note.org_id=line.org_id AND note.id=line.adjustment_note_id
       WHERE line.org_id=organization_id AND line.supplier_invoice_line_id=purchase_line.id AND note.status='posted' AND note.document_effect='decrease';
      IF prior_billed+(requested->>'billed_quantity')::numeric>purchase_line.billed_quantity OR prior_free+(requested->>'free_quantity')::numeric>purchase_line.free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase debit quantity exceeds remaining original supplier-invoice quantity'; END IF;
      rate:=CASE WHEN supply_type='intra_state' THEN purchase_line.cgst_rate+purchase_line.sgst_rate ELSE purchase_line.igst_rate END;
      resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('line_number',line_number,'line_kind','product','line_id',requested->>'line_id',
        'original_line_id',purchase_line.id,'product_id',purchase_line.product_id,'account_id',purchase_line.net_value_account_id,'uom_code',purchase_line.uom_code,
        'multiplier',purchase_line.uom_conversion_factor::text,'hsn_code',purchase_line.tax_classification_code_snapshot,'tax_code_version_id',purchase_line.tax_code_version_id,
        'taxability',purchase_line.taxability_snapshot,'gst_rate',rate::text,'cess_rate',purchase_line.cess_rate::text,
        'inventory_cost_treatment',purchase_line.inventory_cost_treatment,'itc_eligibility',purchase_line.itc_eligibility,'input',requested));
    END IF;
  END LOOP;
  RETURN pg_catalog.jsonb_build_object('adjustment_note_id',adjustment_note_id,'branch_id',branch_id,'side',side,'direction',direction,
    'document_effect','decrease','original_document_id',original_id,'original_open_item_id',original_open.id,
    'original_open_item_outstanding',outstanding::text,'party_id',party_id,'note_date',note_date,'reason_code',reason_code,
    'gst_adjustment_rule_version_id',rule.id,'gst_tax_treatment',treatment,'supply_type',supply_type,
    'zero_rated_payment_mode',zero_mode,'tax_charge_mechanism',charge_mechanism,'ruleset_version',ruleset,'rounding_policy',request_document->>'rounding_policy',
    'lines',resolved_lines,'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','supported_pair',side||'_'||direction,
      'original_document_status','posted','original_open_item_lineage',true,'return_linked_notes','owned_by_return_commands',
      'increases_reversals_charges_foreign_currency_reverse_charge','unavailable'), 'source_versions',sources);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, request_document jsonb) TO "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, request_document jsonb) TO "erp_calculator";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        input_document jsonb; output_document jsonb; totals jsonb; resolved_line jsonb; calculated_line jsonb;
        existing automation.command_requests%ROWTYPE; sequence_id uuid; note_number text; fiscal_year integer;
        total numeric(20,2); aggregate_hash bytea; claim_id uuid; replay_id uuid;
BEGIN
  IF SESSION_USER<>'erp_calculator' OR adjustment_note_id IS NULL OR command_id IS NULL OR artifact_id IS NULL OR request_id IS NULL
     OR journal_id IS NULL OR event_id IS NULL OR allocation_id IS NULL OR residual_open_item_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(sequence_key_hash)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='adjustment-note persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb; resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb; input_document:=pg_catalog.convert_from(calculation_input_bytes,'UTF8')::jsonb;
  output_document:=pg_catalog.convert_from(calculation_output_bytes,'UTF8')::jsonb;
  current_resolution:=erp_automation_commands.resolve_adjustment_note_prepare(organization_id,membership_id,auth_user_id,application_user_id,
    grant_id,caller_client_id,adjustment_note_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',request_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'adjustment_note_id' IS DISTINCT FROM adjustment_note_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->>'calculation_artifact_id' IS DISTINCT FROM artifact_id::text
     OR input_document->>'operation'<>'finance.adjustment_note.post' OR input_document->>'resource_type'<>'adjustment_note'
     OR input_document->>'resource_id'<>adjustment_note_id::text OR output_document->>'operation'<>'finance.adjustment_note.post'
     OR output_document->>'resource_id'<>adjustment_note_id::text OR output_document->>'gst_tax_treatment' IS DISTINCT FROM resolved_document->>'gst_tax_treatment'
     OR output_document->>'ruleset_version' IS DISTINCT FROM resolved_document->>'ruleset_version'
     OR pg_catalog.jsonb_array_length(output_document->'lines')<>pg_catalog.jsonb_array_length(resolved_document->'lines')
     OR (resolved_document->>'gst_tax_treatment'='statutory')<>(tax_document_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment-note resolution, legal scope, calculation, or tax identity changed'; END IF;
  IF resolved_document->>'side'='purchase' AND resolved_document->>'gst_tax_treatment'='statutory' AND NOT EXISTS (
    SELECT 1 FROM tax.portal_document_lines portal WHERE portal.org_id=organization_id
      AND portal.id=(request_document->>'counterparty_portal_document_line_id')::uuid
      AND ROW(portal.taxable_amount,portal.cgst_amount,portal.sgst_amount,portal.igst_amount,portal.cess_amount,portal.total_amount)
       IS NOT DISTINCT FROM ROW((output_document#>>'{totals,gst_taxable_total}')::numeric,(output_document#>>'{totals,cgst_total}')::numeric,
        (output_document#>>'{totals,sgst_total}')::numeric,(output_document#>>'{totals,igst_total}')::numeric,
        (output_document#>>'{totals,cess_total}')::numeric,(output_document#>>'{totals,gst_taxable_total}')::numeric+
        (output_document#>>'{totals,cgst_total}')::numeric+(output_document#>>'{totals,sgst_total}')::numeric+
        (output_document#>>'{totals,igst_total}')::numeric+(output_document#>>'{totals,cess_total}')::numeric)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier portal credit-note totals differ from canonical calculation'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.adjustment_note.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM adjustment_note_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='adjustment-note idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  totals:=output_document->'totals'; total:=(totals->>'grand_total')::numeric;
  IF total<=0 OR (resolved_document->>'gst_tax_treatment'='commercial_only' AND
     ((totals->>'gst_taxable_total')::numeric<>0 OR (totals->>'cgst_total')::numeric<>0 OR (totals->>'sgst_total')::numeric<>0
       OR (totals->>'igst_total')::numeric<>0 OR (totals->>'cess_total')::numeric<>0)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment-note total or commercial-only GST output is invalid'; END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'note_date')::date)>=4 THEN pg_catalog.date_part('year',(resolved_document->>'note_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'note_date')::date)::integer-1 END;
  SELECT id INTO STRICT sequence_id FROM core.document_sequences WHERE org_id=organization_id AND branch_id=(resolved_document->>'branch_id')::uuid
    AND document_type='adjustment_note' AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  note_number:=erp_core_commands.allocate_document_number(organization_id,sequence_id,sequence_key_hash,expires_at);
  INSERT INTO finance.adjustment_notes(org_id,id,note_number,note_date,side,direction,party_id,sales_invoice_id,supplier_invoice_id,
    adjusts_open_item_id,counterparty_portal_document_line_id,gst_adjustment_rule_version_id,gst_tax_treatment,
    recipient_itc_reversal_evidence_attachment_id,recipient_itc_reversal_confirmed_at,zero_rated_payment_mode,tax_charge_mechanism,
    currency_code,document_effect,rounding_policy,document_discount_kind,document_discount_basis,document_discount_value,
    calculation_ruleset_version,gross_price_amount,discount_amount,net_value_amount,gst_taxable_value,cgst_amount,sgst_amount,igst_amount,
    cess_amount,recipient_assessed_tax_amount,rounding_adjustment,counterparty_payable_amount,reason_code,reason,status,
    created_by_membership_id,updated_by_membership_id)
  VALUES(organization_id,adjustment_note_id,note_number,(resolved_document->>'note_date')::date,resolved_document->>'side',resolved_document->>'direction',
    (resolved_document->>'party_id')::uuid,CASE WHEN resolved_document->>'side'='sales' THEN (resolved_document->>'original_document_id')::uuid END,
    CASE WHEN resolved_document->>'side'='purchase' THEN (resolved_document->>'original_document_id')::uuid END,
    (resolved_document->>'original_open_item_id')::uuid,NULLIF(request_document->>'counterparty_portal_document_line_id','')::uuid,
    (resolved_document->>'gst_adjustment_rule_version_id')::uuid,resolved_document->>'gst_tax_treatment',
    NULLIF(request_document->>'recipient_itc_reversal_evidence_attachment_id','')::uuid,NULLIF(request_document->>'recipient_itc_reversal_confirmed_at','')::timestamptz,
    resolved_document->>'zero_rated_payment_mode',resolved_document->>'tax_charge_mechanism','INR','decrease',request_document->>'rounding_policy',
    request_document->'document_discount'->>'document_discount_kind',request_document->'document_discount'->>'document_discount_basis',
    (request_document->'document_discount'->>'document_discount_value')::numeric,resolved_document->>'ruleset_version',(totals->>'subtotal')::numeric,
    (totals->>'discount_total')::numeric,(totals->>'net_value_total')::numeric,(totals->>'gst_taxable_total')::numeric,
    (totals->>'cgst_total')::numeric,(totals->>'sgst_total')::numeric,(totals->>'igst_total')::numeric,(totals->>'cess_total')::numeric,
    (totals->>'recipient_assessed_tax_total')::numeric,(totals->>'rounding_adjustment')::numeric,total,resolved_document->>'reason_code',
    request_document->>'reason','draft',membership_id,membership_id);
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    SELECT value INTO STRICT calculated_line FROM pg_catalog.jsonb_array_elements(output_document->'lines') WHERE value->>'line_id'=resolved_line->>'line_id';
    INSERT INTO finance.adjustment_note_lines(org_id,id,adjustment_note_id,line_number,line_kind,product_id,account_id,sales_invoice_line_id,
      supplier_invoice_line_id,description,uom_code,billed_quantity,free_quantity,uom_conversion_factor,base_billed_quantity,base_free_quantity,
      free_supply_tax_treatment,quoted_unit_rate,price_basis,gross_amount,line_discount_kind,line_discount_basis,line_discount_value,
      document_discount_eligible,line_discount_amount,line_taxable_discount_amount,document_discount_amount,document_taxable_discount_amount,
      final_residual,gst_tax_treatment,discount_amount,net_value_amount,gst_taxable_value,hsn_sac_code,tax_code_version_id,taxability_snapshot,
      inventory_cost_treatment,itc_eligibility,tax_charge_mechanism,cgst_rate,sgst_rate,igst_rate,cess_rate,cgst_amount,sgst_amount,igst_amount,
      cess_amount,recipient_assessed_tax_amount,line_total,tax_ruleset_version,created_by_membership_id)
    VALUES(organization_id,(resolved_line->>'line_id')::uuid,adjustment_note_id,(resolved_line->>'line_number')::integer,'product',
      (resolved_line->>'product_id')::uuid,(resolved_line->>'account_id')::uuid,CASE WHEN resolved_document->>'side'='sales' THEN (resolved_line->>'original_line_id')::uuid END,
      CASE WHEN resolved_document->>'side'='purchase' THEN (resolved_line->>'original_line_id')::uuid END,request_document->>'reason',resolved_line->>'uom_code',
      (resolved_line#>>'{input,billed_quantity}')::numeric,(resolved_line#>>'{input,free_quantity}')::numeric,(resolved_line->>'multiplier')::numeric,
      (resolved_line#>>'{input,billed_quantity}')::numeric*(resolved_line->>'multiplier')::numeric,
      (resolved_line#>>'{input,free_quantity}')::numeric*(resolved_line->>'multiplier')::numeric,resolved_line#>>'{input,free_supply_tax_treatment}',
      (resolved_line#>>'{input,quoted_unit_rate}')::numeric,resolved_line#>>'{input,price_basis}',(calculated_line->>'gross_amount')::numeric,
      resolved_line#>>'{input,line_discount,line_discount_kind}',resolved_line#>>'{input,line_discount,line_discount_basis}',
      (resolved_line#>>'{input,line_discount,line_discount_value}')::numeric,(resolved_line#>>'{input,document_discount_eligible}')::boolean,
      (calculated_line->>'line_discount_amount')::numeric,(calculated_line->>'line_taxable_discount_amount')::numeric,
      (calculated_line->>'document_discount_amount')::numeric,(calculated_line->>'document_taxable_discount_amount')::numeric,false,
      resolved_document->>'gst_tax_treatment',(calculated_line->>'line_discount_amount')::numeric+(calculated_line->>'document_discount_amount')::numeric,
      (calculated_line->>'net_value_amount')::numeric,(calculated_line->>'gst_taxable_value')::numeric,resolved_line->>'hsn_code',
      (resolved_line->>'tax_code_version_id')::uuid,resolved_line->>'taxability',NULLIF(resolved_line->>'inventory_cost_treatment',''),
      NULLIF(resolved_line->>'itc_eligibility',''),resolved_document->>'tax_charge_mechanism',(calculated_line->>'cgst_rate')::numeric,
      (calculated_line->>'sgst_rate')::numeric,(calculated_line->>'igst_rate')::numeric,(calculated_line->>'cess_rate')::numeric,
      (calculated_line->>'cgst_amount')::numeric,(calculated_line->>'sgst_amount')::numeric,(calculated_line->>'igst_amount')::numeric,
      (calculated_line->>'cess_amount')::numeric,(calculated_line->>'recipient_assessed_tax_amount')::numeric,(calculated_line->>'line_total')::numeric,
      resolved_document->>'ruleset_version',membership_id);
  END LOOP;
  IF (SELECT count(*) FROM finance.adjustment_note_lines persisted WHERE persisted.org_id=organization_id AND persisted.adjustment_note_id=adjustment_note_id)
       <>pg_catalog.jsonb_array_length(resolved_document->'lines') THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment-note persisted line cardinality differs'; END IF;
  aggregate_hash:="erp_automation_commands"."aggregate_version_hash"('adjustment_note',adjustment_note_id,1);
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.adjustment_note.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,adjustment_note_id,total,'INR',key_hash,request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(organization_id,membership_id,
    'finance.adjustment_note.post',key_hash,extensions.digest(request_bytes,'sha256'),expires_at);
  IF replay_id IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='adjustment-note prepare replay reached completed execution claim'; END IF;
  PERFORM erp_calculation_authority.issue_artifact(artifact_id,(resolved_document->>'branch_id')::uuid,'finance.adjustment_note.post','adjustment_note',
    adjustment_note_id,1,request_id,command_id,claim_id,extensions.digest(request_bytes,'sha256'),calculation_input_bytes,calculation_output_bytes,
    output_document->>'engine_version',output_document->>'ruleset_version','aasopharma-jcs-decimal-v1',expires_at);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_adjustment_note_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, adjustment_note_id uuid, command_id uuid, artifact_id uuid, request_id uuid, tax_document_id uuid, journal_id uuid, event_id uuid, allocation_id uuid, residual_open_item_id uuid, key_hash bytea, sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, calculation_input_bytes bytea, calculation_output_bytes bytea, expires_at timestamptz) TO "erp_calculator";

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
    adjustment_note finance.adjustment_notes%ROWTYPE;
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
    ELSIF request_row.operation='finance.adjustment_note.post' THEN
        SELECT * INTO STRICT application_membership FROM core.memberships
         WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT application_user FROM core.users
         WHERE id=application_membership.user_id AND status='active' FOR SHARE;
        SELECT * INTO STRICT adjustment_note FROM finance.adjustment_notes
         WHERE org_id=organization_id AND id=request_row.target_resource_id FOR UPDATE;
        SELECT * INTO STRICT calculation_artifact FROM calculation.artifacts
         WHERE org_id=organization_id AND command_request_id=request_row.id
           AND adjustment_note_id=request_row.target_resource_id FOR UPDATE;
        current_resolution:="erp_automation_commands"."resolve_adjustment_note_prepare"(
          organization_id,actor_id,application_user.auth_user_id,application_membership.user_id,
          grant_row.id,grant_row.client_id,request_row.target_resource_id,request_document);
        IF request_row.capability_code<>'finance.adjustment_note.prepare'
           OR request_row.target_resource_type<>'adjustment_note'
           OR request_row.target_row_version IS DISTINCT FROM adjustment_note.row_version
           OR adjustment_note.status<>'draft' OR adjustment_note.sales_return_id IS NOT NULL
           OR adjustment_note.purchase_return_id IS NOT NULL OR adjustment_note.reversal_of_adjustment_note_id IS NOT NULL
           OR request_document->>'adjustment_note_id' IS DISTINCT FROM request_row.target_resource_id::text
           OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
           OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
           OR request_row.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                'adjustment_note',adjustment_note.id,adjustment_note.row_version)
           OR request_row.calculation_hash IS DISTINCT FROM calculation_artifact.authority_hash
           OR calculation_artifact.status<>'issued' OR calculation_artifact.expires_at<=pg_catalog.transaction_timestamp()
           OR calculation_artifact.operation<>'finance.adjustment_note.post'
           OR calculation_artifact.aggregate_version IS DISTINCT FROM adjustment_note.row_version
           OR calculation_artifact.actor_membership_id IS DISTINCT FROM actor_id
           OR calculation_artifact.request_sha256 IS DISTINCT FROM request_row.request_hash THEN
          RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment note original invoice, open item, GST rule, evidence, line ceiling, account, or calculation source changed';
        END IF;
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
      WHEN 'finance.adjustment_note.post' THEN
        SELECT sequence.id INTO STRICT valuation_sequence_id FROM core.document_sequences sequence
         WHERE sequence.org_id=organization_id AND sequence.branch_id=request_row.branch_id
           AND sequence.document_type='journal_entry'
           AND sequence.fiscal_year_start=pg_catalog.make_date(
             CASE WHEN pg_catalog.date_part('month',adjustment_note.note_date)>=4
               THEN pg_catalog.date_part('year',adjustment_note.note_date)::integer
               ELSE pg_catalog.date_part('year',adjustment_note.note_date)::integer-1 END,4,1)
           AND sequence.status='active' FOR SHARE;
        invoice_journal_number:=erp_core_commands.allocate_document_number(
          organization_id,valuation_sequence_id,
          extensions.digest(request_row.idempotency_key_hash||pg_catalog.convert_to(':adjustment-note-journal','UTF8'),'sha256'),
          request_row.expires_at);
        SELECT approval.approver_membership_id,approval.decided_at
          INTO STRICT approving_membership_id,approval_decided_at
          FROM automation.command_approvals approval
         WHERE approval.org_id=organization_id AND approval.command_request_id=request_row.id
           AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
           AND approval.aggregate_version_hash=request_row.aggregate_version_hash
           AND approval.valid_until_at>pg_catalog.transaction_timestamp()
           AND approval.approver_membership_id<>request_row.requested_by_membership_id
         ORDER BY approval.decided_at,approval.id LIMIT 1 FOR SHARE;
        UPDATE finance.adjustment_notes SET status='approved',approved_at=approval_decided_at,
          approved_by_membership_id=approving_membership_id,updated_at=pg_catalog.transaction_timestamp(),
          updated_by_membership_id=actor_id
         WHERE org_id=organization_id AND id=request_row.target_resource_id AND status='draft'
           AND row_version=request_row.target_row_version;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='adjustment-note approval transition lost its draft state'; END IF;
        PERFORM pg_catalog.set_config('app.request_id',calculation_artifact.request_id::text,true);
        PERFORM erp_commercial_commands.post_adjustment_note(
          organization_id,request_row.target_resource_id,calculation_artifact.id,actor_id,
          calculation_artifact.request_id,request_row.id,NULLIF(request_document->>'tax_document_id','')::uuid,
          (request_document->>'journal_id')::uuid,invoice_journal_number,(request_document->>'event_id')::uuid,
          (request_document->>'allocation_id')::uuid,(request_document->>'residual_open_item_id')::uuid,
          request_row.idempotency_key_hash,request_row.request_hash,
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
