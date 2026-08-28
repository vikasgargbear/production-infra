-- Canonical member expense claim: verified receipts, separate approval, exact posting.

SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
  guard_definition text;
  prepare_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.guard_command_request_match()'::pg_catalog.regprocedure)
    INTO STRICT guard_definition;
  IF pg_catalog.strpos(guard_definition, '''finance.expense_claim.prepare''')<>0
     OR pg_catalog.strpos(guard_definition,
       'ELSIF NEW.capability_code IN (''finance.adjustment_note.prepare'',''finance.bank_reconciliation.prepare'',''finance.customer_receipt.prepare''')=0
     OR pg_catalog.strpos(guard_definition,
       'WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.customer_receipt.prepare''')=0
     OR pg_catalog.strpos(guard_definition,
       'WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.customer_receipt.prepare''')=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='expense claim migration requires the exact reviewed bank-reconciliation command guard';
  END IF;
  guard_definition:=pg_catalog.replace(guard_definition,
    'ELSIF NEW.capability_code IN (''finance.adjustment_note.prepare'',''finance.bank_reconciliation.prepare'',''finance.customer_receipt.prepare''',
    'ELSIF NEW.capability_code IN (''finance.adjustment_note.prepare'',''finance.bank_reconciliation.prepare'',''finance.customer_receipt.prepare'',''finance.expense_claim.prepare''');
  guard_definition:=pg_catalog.replace(guard_definition,
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.expense_claim.prepare'' THEN ''expense_claim'' WHEN ''finance.customer_receipt.prepare''');
  guard_definition:=pg_catalog.replace(guard_definition,
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.expense_claim.prepare'' THEN ''finance.expense_claim.post'' WHEN ''finance.customer_receipt.prepare''');
  EXECUTE guard_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.prepare_operator_command(uuid,uuid,uuid,character varying,uuid,uuid,uuid,numeric,character,bytea,bytea,bytea,bytea,bytea,timestamp with time zone)'::pg_catalog.regprocedure)
    INTO STRICT prepare_definition;
  IF pg_catalog.strpos(prepare_definition, '''finance.expense_claim.prepare''')<>0
     OR pg_catalog.strpos(prepare_definition,
       'WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.customer_receipt.prepare''')=0
     OR pg_catalog.strpos(prepare_definition,
       'WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.customer_receipt.prepare''')=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='expense claim migration requires the exact reviewed bank-reconciliation generic prepare boundary';
  END IF;
  prepare_definition:=pg_catalog.replace(prepare_definition,
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.expense_claim.prepare'' THEN ''expense_claim'' WHEN ''finance.customer_receipt.prepare''');
  prepare_definition:=pg_catalog.replace(prepare_definition,
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.expense_claim.prepare'' THEN ''finance.expense_claim.post'' WHEN ''finance.customer_receipt.prepare''');
  EXECUTE prepare_definition;
END
$migration$;

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_expense_claim_prepare"(
  organization_id uuid, membership_id uuid, auth_user_id uuid,
  application_user_id uuid, grant_id uuid, caller_client_id varchar,
  expense_claim_id uuid, request_document jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  organization core.organizations%ROWTYPE;
  branch core.branches%ROWTYPE;
  reimbursement_account finance.accounts%ROWTYPE;
  employee hr.employees%ROWTYPE;
  requested_line jsonb;
  expense_account finance.accounts%ROWTYPE;
  receipt core.attachments%ROWTYPE;
  branch_id uuid := NULLIF(request_document->>'branch_id','')::uuid;
  claim_date date := NULLIF(request_document->>'claim_date','')::date;
  period_start date := NULLIF(request_document->>'period_start','')::date;
  period_end date := NULLIF(request_document->>'period_end','')::date;
  reimbursement_account_id uuid := NULLIF(request_document->>'reimbursement_account_id','')::uuid;
  claimed_total numeric(20,2) := 0;
  line_number integer := 0;
  resolved_lines jsonb := '[]'::jsonb;
  source_versions jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR organization_id IS NULL OR membership_id IS NULL
     OR auth_user_id IS NULL OR application_user_id IS NULL OR grant_id IS NULL
     OR expense_claim_id IS NULL OR branch_id IS NULL OR claim_date IS NULL
     OR period_start IS NULL OR period_end IS NULL OR reimbursement_account_id IS NULL
     OR NULLIF(pg_catalog.btrim(request_document->>'purpose'),'') IS NULL
     OR request_document->>'tax_treatment'<>'non_creditable_gross_expense'
     OR pg_catalog.jsonb_typeof(request_document->'lines')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense claim input is incomplete';
  END IF;

  SELECT * INTO STRICT organization FROM core.organizations
   WHERE id=organization_id AND status='active' AND country_code='IN'
     AND base_currency='INR' AND timezone='Asia/Kolkata' FOR SHARE;
  IF period_end<period_start OR period_end-period_start>92
     OR claim_date<period_end
     OR claim_date<>(pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='expense claim must cover at most 93 days and be submitted on the current India business date';
  END IF;

  PERFORM 1 FROM core.memberships membership
    JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN automation.agent_grants grant_row
      ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability
      ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id
     AND membership.user_id=application_user_id AND membership.status='active'
     AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id
     AND grant_row.status='active' AND grant_row.expires_at>pg_catalog.transaction_timestamp()
     AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.expense_claim.prepare'
     AND capability.operation_mode='write' AND capability.risk_class='consequential_write'
     AND capability.approval_policy='separate_approver' AND capability.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim delegated authority is inactive';
  END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.expense.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim cross-domain permission is inactive';
  END IF;

  SELECT * INTO STRICT branch FROM core.branches
   WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO employee FROM hr.employees
   WHERE org_id=organization_id AND membership_id=membership_id FOR SHARE;
  IF FOUND AND (employee.status<>'active' OR employee.branch_id IS DISTINCT FROM branch_id
                OR employee.employment_start_date>period_end
                OR (employee.employment_end_date IS NOT NULL AND employee.employment_end_date<period_start)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='linked employee is not active for this branch and claim period';
  END IF;
  SELECT * INTO STRICT reimbursement_account FROM finance.accounts
   WHERE org_id=organization_id AND id=reimbursement_account_id AND status='active'
     AND account_type='liability' AND currency_code='INR' AND NOT allows_party_posting FOR SHARE;

  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','organization','id',organization.id,'row_version',organization.row_version),
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','membership','role','claimant','id',membership_id),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','member_reimbursement_liability',
      'id',reimbursement_account.id,'row_version',reimbursement_account.row_version));
  IF employee.id IS NOT NULL THEN
    source_versions:=source_versions||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','employee','role','claimant','id',employee.id,
        'row_version',employee.row_version,'branch_id',employee.branch_id,'status',employee.status));
  END IF;

  IF (SELECT count(DISTINCT item.value->>'receipt_attachment_id')
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') item(value))
     <> pg_catalog.jsonb_array_length(request_document->'lines') THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='each expense receipt may appear only once in a claim';
  END IF;

  FOR requested_line IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines') LOOP
    line_number:=line_number+1;
    IF pg_catalog.jsonb_typeof(requested_line)<>'object'
       OR NULLIF(requested_line->>'expense_claim_line_id','')::uuid IS NULL
       OR NULLIF(requested_line->>'expense_account_id','')::uuid IS NULL
       OR NULLIF(requested_line->>'receipt_attachment_id','')::uuid IS NULL
       OR NULLIF(requested_line->>'expense_date','')::date NOT BETWEEN period_start AND period_end
       OR NULLIF(pg_catalog.btrim(requested_line->>'description'),'') IS NULL
       OR NULLIF(pg_catalog.btrim(requested_line->>'merchant_name'),'') IS NULL
       OR NULLIF(requested_line->>'claimed_amount','')::numeric<=0
       OR (requested_line->>'claimed_amount')::numeric<>pg_catalog.round((requested_line->>'claimed_amount')::numeric,2) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense claim line identity, date, description, merchant, or amount is invalid';
    END IF;
    SELECT * INTO STRICT expense_account FROM finance.accounts
     WHERE org_id=organization_id AND id=(requested_line->>'expense_account_id')::uuid
       AND status='active' AND account_type='expense' AND currency_code='INR'
       AND NOT allows_party_posting FOR SHARE;
    SELECT * INTO STRICT receipt FROM core.attachments
     WHERE org_id=organization_id AND id=(requested_line->>'receipt_attachment_id')::uuid
       AND evidence_kind='expense_receipt' AND status IN ('verified','retained')
       AND verified_at IS NOT NULL AND verified_at<=pg_catalog.transaction_timestamp()
       AND document_date=(requested_line->>'expense_date')::date
       AND retention_until IS NOT NULL AND retention_until>=claim_date
       AND byte_size>0 AND pg_catalog.octet_length(sha256)=32 FOR SHARE;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text||':expense-receipt:'||receipt.id::text,727119));
    IF EXISTS(
      SELECT 1 FROM finance.expense_claim_lines prior_line
      JOIN finance.expense_claims prior_claim
        ON prior_claim.org_id=prior_line.org_id AND prior_claim.id=prior_line.expense_claim_id
       WHERE prior_line.org_id=organization_id AND prior_line.receipt_attachment_id=receipt.id
         AND prior_line.expense_claim_id<>expense_claim_id
         AND prior_claim.status NOT IN ('rejected','cancelled')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='expense receipt was already consumed by another claim';
    END IF;
    claimed_total:=claimed_total+(requested_line->>'claimed_amount')::numeric;
    resolved_lines:=resolved_lines||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'line_number',line_number,'expense_claim_line_id',requested_line->>'expense_claim_line_id',
      'expense_date',requested_line->>'expense_date','expense_account_id',expense_account.id,
      'description',requested_line->>'description','merchant_name',requested_line->>'merchant_name',
      'receipt_attachment_id',receipt.id,'claimed_amount',pg_catalog.to_char((requested_line->>'claimed_amount')::numeric,'FM999999999999999990.00')));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type','finance_account','role','expense','id',expense_account.id,
        'row_version',expense_account.row_version),
      pg_catalog.jsonb_build_object('resource_type','expense_receipt','id',receipt.id,'status',receipt.status,
        'document_date',receipt.document_date,'verified_at',receipt.verified_at,'retention_until',receipt.retention_until,
        'sha256',pg_catalog.encode(receipt.sha256,'hex')));
  END LOOP;

  IF claimed_total<=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense claim total must be positive';
  END IF;
  IF EXISTS(
    SELECT 1 FROM automation.agent_grant_capabilities capability
     WHERE capability.org_id=organization_id AND capability.agent_grant_id=grant_id
       AND capability.capability_code='finance.expense_claim.prepare'
       AND ((capability.maximum_amount IS NOT NULL AND claimed_total>capability.maximum_amount)
         OR (capability.currency_code IS NOT NULL AND capability.currency_code<>'INR'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim exceeds the active INR delegation limit';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'branch_id',branch.id,'claim_date',claim_date,'period_start',period_start,'period_end',period_end,
    'claimant_membership_id',membership_id,'purpose',request_document->>'purpose','currency_code','INR',
    'reimbursement_account_id',reimbursement_account.id,'claimed_amount',pg_catalog.to_char(claimed_total,'FM999999999999999990.00'),
    'lines',resolved_lines,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR',
      'tax_treatment','non_creditable_gross_expense','gst_input_tax_claimed','0.00','withholding_amount','0.00',
      'approval','separate_full_claim_approval','unsupported_fail_closed',pg_catalog.jsonb_build_array(
        'partial_approval','gst_input_tax_credit','withholding','foreign_currency','mileage_or_per_diem',
        'cash_advance','unverified_or_reused_receipt','backdated_submission')));
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_expense_claim_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_expense_claim_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb) FROM PUBLIC, "erp_app", "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_expense_claim_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."assert_expense_claim_draft"(
  organization_id uuid, expense_claim_id uuid, journal_id uuid, resolution jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE claim finance.expense_claims%ROWTYPE;
BEGIN
  SELECT * INTO STRICT claim FROM finance.expense_claims
   WHERE org_id=organization_id AND id=expense_claim_id FOR SHARE;
  IF claim.claimant_membership_id IS DISTINCT FROM (resolution->>'claimant_membership_id')::uuid
     OR claim.claim_date IS DISTINCT FROM (resolution->>'claim_date')::date
     OR claim.period_start IS DISTINCT FROM (resolution->>'period_start')::date
     OR claim.period_end IS DISTINCT FROM (resolution->>'period_end')::date
     OR claim.currency_code<>'INR' OR claim.claimed_amount<>(resolution->>'claimed_amount')::numeric
     OR claim.purpose IS DISTINCT FROM resolution->>'purpose'
     OR claim.status NOT IN ('draft','submitted')
     OR (claim.status='submitted' AND claim.submitted_at IS NULL)
     OR (SELECT count(*) FROM finance.expense_claim_lines line
          WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id)
        <>pg_catalog.jsonb_array_length(resolution->'lines')
     OR EXISTS(
       SELECT 1 FROM pg_catalog.jsonb_array_elements(resolution->'lines') expected(value)
        WHERE NOT EXISTS(
          SELECT 1 FROM finance.expense_claim_lines line
           WHERE line.org_id=organization_id AND line.expense_claim_id=expense_claim_id
             AND line.id=(expected.value->>'expense_claim_line_id')::uuid
             AND line.line_number=(expected.value->>'line_number')::integer
             AND line.expense_date=(expected.value->>'expense_date')::date
             AND line.expense_account_id=(expected.value->>'expense_account_id')::uuid
             AND line.description=expected.value->>'description'
             AND line.merchant_name=expected.value->>'merchant_name'
             AND line.receipt_attachment_id=(expected.value->>'receipt_attachment_id')::uuid
             AND line.claimed_amount=(expected.value->>'claimed_amount')::numeric
             AND line.approved_amount IS NULL AND line.taxable_amount=0 AND line.tax_amount=0))
     OR NOT EXISTS(
       SELECT 1 FROM finance.journal_entries journal
        WHERE journal.org_id=organization_id AND journal.id=journal_id AND journal.status='draft'
          AND journal.posting_date=claim.claim_date AND journal.transaction_currency='INR'
          AND journal.functional_currency='INR' AND journal.fx_rate=1
          AND journal.transaction_debit_total=claim.claimed_amount
          AND journal.transaction_credit_total=claim.claimed_amount
          AND journal.functional_debit_total=claim.claimed_amount
          AND journal.functional_credit_total=claim.claimed_amount)
     OR EXISTS(
       WITH expected AS (
         SELECT (item.value->>'expense_account_id')::uuid account_id,
                sum((item.value->>'claimed_amount')::numeric) amount
           FROM pg_catalog.jsonb_array_elements(resolution->'lines') item(value)
          GROUP BY (item.value->>'expense_account_id')::uuid
       ), actual AS (
         SELECT line.account_id,sum(line.transaction_debit) amount
           FROM finance.journal_lines line
          WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
            AND line.transaction_credit=0
          GROUP BY line.account_id
       )
       SELECT 1 FROM expected FULL JOIN actual USING(account_id)
        WHERE expected.amount IS DISTINCT FROM actual.amount)
     OR NOT EXISTS(
       SELECT 1 FROM finance.journal_lines line
        WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
          AND line.account_id=(resolution->>'reimbursement_account_id')::uuid
          AND line.branch_id=(resolution->>'branch_id')::uuid AND line.party_id IS NULL
          AND line.transaction_debit=0 AND line.transaction_credit=claim.claimed_amount
          AND line.functional_debit=0 AND line.functional_credit=claim.claimed_amount) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim or exact reimbursement journal changed';
  END IF;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."assert_expense_claim_draft"(uuid,uuid,uuid,jsonb) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."assert_expense_claim_draft"(uuid,uuid,uuid,jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_expense_claim_prepare"(
  organization_id uuid, membership_id uuid, auth_user_id uuid,
  application_user_id uuid, grant_id uuid, caller_client_id varchar,
  expense_claim_id uuid, command_id uuid, journal_id uuid, event_id uuid,
  key_hash bytea, claim_sequence_key_hash bytea, journal_sequence_key_hash bytea,
  request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  request_document jsonb;
  resolved_document jsonb;
  current_resolution jsonb;
  preview_document jsonb;
  existing automation.command_requests%ROWTYPE;
  aggregate_hash bytea;
  claim_sequence_id uuid;
  journal_sequence_id uuid;
  claim_number text;
  journal_number text;
  fiscal_year integer;
  resolved_line jsonb;
  journal_line_number integer := 0;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR expense_claim_id IS NULL OR command_id IS NULL
     OR journal_id IS NULL OR event_id IS NULL OR pg_catalog.octet_length(key_hash)<>32
     OR pg_catalog.octet_length(claim_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32
     OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576
     OR expires_at<=pg_catalog.transaction_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim runtime persistence boundary is invalid';
  END IF;
  BEGIN
    request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense claim persistence requires UTF-8 JSON';
  END;
  IF request_document->>'expense_claim_id' IS DISTINCT FROM expense_claim_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text
     OR request_document->>'event_id' IS DISTINCT FROM event_id::text THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense claim generated identities changed';
  END IF;
  current_resolution:="erp_automation_commands"."resolve_expense_claim_prepare"(
    organization_id,membership_id,auth_user_id,application_user_id,grant_id,
    caller_client_id,expense_claim_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document
     OR preview_document->>'operation'<>'finance.expense_claim.post'
     OR preview_document->>'capability_code'<>'finance.expense_claim.prepare'
     OR preview_document->>'target_resource_type'<>'expense_claim'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM expense_claim_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact'<>'[]'::jsonb
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb
     OR preview_document->'tax_impact' IS DISTINCT FROM pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('gst_input_tax_claimed','0.00','withholding_amount','0.00',
            'treatment','non_creditable_gross_expense')) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim resolution or immutable preview changed';
  END IF;
  SELECT * INTO existing FROM automation.command_requests
   WHERE org_id=organization_id AND agent_grant_id=grant_id
     AND capability_code='finance.expense_claim.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM expense_claim_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='expense claim idempotency key has different exact input';
    END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'claim_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'claim_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'claim_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "erp_automation_commands"."prepare_operator_command"(
    organization_id,command_id,grant_id,'finance.expense_claim.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,expense_claim_id,
    (resolved_document->>'claimed_amount')::numeric,'INR',key_hash,request_bytes,
    preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT claim_sequence_id FROM core.document_sequences
   WHERE org_id=organization_id AND branch_id=(resolved_document->>'branch_id')::uuid
     AND document_type='expense_claim' AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
     AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences
   WHERE org_id=organization_id AND branch_id=(resolved_document->>'branch_id')::uuid
     AND document_type='journal_entry' AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1)
     AND status='active' FOR SHARE;
  claim_number:=erp_core_commands.allocate_document_number(
    organization_id,claim_sequence_id,claim_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(
    organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO finance.expense_claims(
    org_id,id,claim_number,claimant_membership_id,claim_date,period_start,period_end,
    currency_code,claimed_amount,purpose,status)
  VALUES(organization_id,expense_claim_id,claim_number,membership_id,
    (resolved_document->>'claim_date')::date,(resolved_document->>'period_start')::date,
    (resolved_document->>'period_end')::date,'INR',(resolved_document->>'claimed_amount')::numeric,
    resolved_document->>'purpose','draft');
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    INSERT INTO finance.expense_claim_lines(
      org_id,id,expense_claim_id,line_number,expense_date,expense_account_id,
      description,merchant_name,receipt_attachment_id,claimed_amount,taxable_amount,tax_amount)
    VALUES(organization_id,(resolved_line->>'expense_claim_line_id')::uuid,expense_claim_id,
      (resolved_line->>'line_number')::integer,(resolved_line->>'expense_date')::date,
      (resolved_line->>'expense_account_id')::uuid,resolved_line->>'description',resolved_line->>'merchant_name',
      (resolved_line->>'receipt_attachment_id')::uuid,(resolved_line->>'claimed_amount')::numeric,0,0);
  END LOOP;
  INSERT INTO finance.journal_entries(
    org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,
    functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'claim_date')::date,
    'Member expense claim '||claim_number,'INR','INR',1,(resolved_document->>'claimed_amount')::numeric,
    (resolved_document->>'claimed_amount')::numeric,(resolved_document->>'claimed_amount')::numeric,
    (resolved_document->>'claimed_amount')::numeric,'draft');
  FOR resolved_line IN SELECT value FROM pg_catalog.jsonb_array_elements(resolved_document->'lines') LOOP
    journal_line_number:=journal_line_number+1;
    INSERT INTO finance.journal_lines(
      org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
      transaction_debit,transaction_credit,functional_debit,functional_credit)
    VALUES(organization_id,pg_catalog.gen_random_uuid(),journal_id,journal_line_number,
      (resolved_line->>'expense_account_id')::uuid,(resolved_document->>'branch_id')::uuid,
      'Claimed gross member expense: '||(resolved_line->>'description'),
      (resolved_line->>'claimed_amount')::numeric,0,(resolved_line->>'claimed_amount')::numeric,0);
  END LOOP;
  journal_line_number:=journal_line_number+1;
  INSERT INTO finance.journal_lines(
    org_id,id,journal_entry_id,line_number,account_id,branch_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES(organization_id,pg_catalog.gen_random_uuid(),journal_id,journal_line_number,
    (resolved_document->>'reimbursement_account_id')::uuid,(resolved_document->>'branch_id')::uuid,
    'Member reimbursement payable',0,(resolved_document->>'claimed_amount')::numeric,
    0,(resolved_document->>'claimed_amount')::numeric);
  PERFORM "erp_automation_commands"."assert_expense_claim_draft"(
    organization_id,expense_claim_id,journal_id,resolved_document);
  PERFORM erp_compliance_commands.submit_expense_claim(
    organization_id,expense_claim_id,membership_id,
    extensions.digest(key_hash||pg_catalog.convert_to(':submit','UTF8'),'sha256'),
    extensions.digest(resolved_bytes,'sha256'),expires_at);
  PERFORM "erp_automation_commands"."assert_expense_claim_draft"(
    organization_id,expense_claim_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_expense_claim_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_expense_claim_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_expense_claim_prepare"(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."approve_expense_claim_command"(
  organization_id uuid, command_request_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  approver_id uuid := erp_security.current_membership_id();
  command automation.command_requests%ROWTYPE;
  grant_row automation.agent_grants%ROWTYPE;
  requester core.memberships%ROWTYPE;
  requester_user core.users%ROWTYPE;
  approver core.memberships%ROWTYPE;
  approver_user core.users%ROWTYPE;
  request_document jsonb;
  preview_document jsonb;
  current_resolution jsonb;
  decisions jsonb;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR approver_id IS NULL OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim approval context is invalid';
  END IF;
  SELECT * INTO STRICT command FROM automation.command_requests
   WHERE org_id=organization_id AND id=command_request_id
     AND capability_code='finance.expense_claim.prepare'
     AND operation='finance.expense_claim.post' AND target_resource_type='expense_claim'
     AND status IN ('prepared','pending_approval','approved')
     AND expires_at>pg_catalog.transaction_timestamp() FOR UPDATE;
  IF command.approval_policy<>'separate_approver'
     OR command.requested_by_membership_id=approver_id
     OR NOT EXISTS(
       SELECT 1 FROM automation.command_approvals approval
        WHERE approval.org_id=organization_id AND approval.command_request_id=command.id
          AND approval.approver_membership_id=approver_id AND approval.decision='approved'
          AND approval.preview_hash=command.preview_hash
          AND approval.aggregate_version_hash=command.aggregate_version_hash
          AND approval.valid_until_at>pg_catalog.transaction_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim requires an unexpired exact-preview independent approval';
  END IF;
  SELECT * INTO STRICT grant_row FROM automation.agent_grants
   WHERE org_id=organization_id AND id=command.agent_grant_id FOR SHARE;
  SELECT * INTO STRICT requester FROM core.memberships
   WHERE org_id=organization_id AND id=command.requested_by_membership_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT requester_user FROM core.users
   WHERE id=requester.user_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT approver FROM core.memberships
   WHERE org_id=organization_id AND id=approver_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT approver_user FROM core.users
   WHERE id=approver.user_id AND status='active' FOR SHARE;
  request_document:=pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(command.preview_bytes,'UTF8')::jsonb;
  current_resolution:="erp_automation_commands"."resolve_expense_claim_prepare"(
    organization_id,requester.id,requester_user.auth_user_id,requester_user.id,
    grant_row.id,grant_row.client_id,command.target_resource_id,request_document);
  PERFORM erp_security.activate_context(approver_user.auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM approver_id
     OR erp_security.has_permission('finance.expense.manage',command.branch_id) IS DISTINCT FROM true
     OR current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
     OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
     OR command.aggregate_version_hash IS DISTINCT FROM extensions.digest(
          pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim evidence or approval authority changed';
  END IF;
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'line_id',item.value->>'expense_claim_line_id',
           'approved_amount',item.value->>'claimed_amount')
           ORDER BY (item.value->>'line_number')::integer)
    INTO decisions FROM pg_catalog.jsonb_array_elements(current_resolution->'lines') item(value);
  PERFORM erp_compliance_commands.approve_expense_claim(
    organization_id,command.target_resource_id,approver_id,decisions,
    extensions.digest(command.idempotency_key_hash||pg_catalog.convert_to(':expense-approval','UTF8'),'sha256'),
    command.preview_hash,command.expires_at);
  RETURN command.target_resource_id;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."approve_expense_claim_command"(uuid,uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."approve_expense_claim_command"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."approve_expense_claim_command"(uuid,uuid) TO "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."execute_approved_expense_claim"(
  organization_id uuid, command_request_id uuid
)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  actor_id uuid := erp_security.current_membership_id();
  request_context uuid := NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid;
  command_context uuid := NULLIF(pg_catalog.current_setting('app.command_request_id',true),'')::uuid;
  command automation.command_requests%ROWTYPE;
  grant_row automation.agent_grants%ROWTYPE;
  capability automation.agent_grant_capabilities%ROWTYPE;
  membership core.memberships%ROWTYPE;
  user_row core.users%ROWTYPE;
  claim finance.expense_claims%ROWTYPE;
  request_document jsonb;
  preview_document jsonb;
  current_resolution jsonb;
  approval_count integer;
  response_document jsonb;
  response_body bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR actor_id IS NULL OR request_context IS NULL OR command_context IS DISTINCT FROM command_request_id
     OR erp_security.has_permission('automation.command.execute',NULL::uuid) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim execution context is invalid';
  END IF;
  SELECT * INTO command FROM automation.command_requests
   WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='expense claim command not found'; END IF;
  IF command.status='succeeded' THEN RETURN command.response_bytes; END IF;
  IF command.status NOT IN ('prepared','pending_approval','approved')
     OR command.expires_at<=pg_catalog.transaction_timestamp()
     OR command.requested_by_membership_id IS DISTINCT FROM actor_id
     OR command.capability_code<>'finance.expense_claim.prepare'
     OR command.operation<>'finance.expense_claim.post'
     OR command.target_resource_type<>'expense_claim'
     OR command.approval_policy<>'separate_approver' THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='expense claim command is not executable';
  END IF;
  SELECT * INTO STRICT grant_row FROM automation.agent_grants
   WHERE org_id=organization_id AND id=command.agent_grant_id FOR UPDATE;
  SELECT * INTO STRICT capability FROM automation.agent_grant_capabilities
   WHERE org_id=organization_id AND agent_grant_id=command.agent_grant_id
     AND capability_code=command.capability_code FOR SHARE;
  IF grant_row.status<>'active' OR grant_row.expires_at<=pg_catalog.transaction_timestamp()
     OR grant_row.subject_membership_id IS DISTINCT FROM actor_id
     OR capability.status<>'active' OR capability.operation_mode<>command.operation_mode
     OR capability.risk_class<>command.risk_class OR capability.approval_policy<>command.approval_policy
     OR (capability.maximum_amount IS NOT NULL AND command.requested_amount>capability.maximum_amount)
     OR (capability.currency_code IS NOT NULL AND command.currency_code<>capability.currency_code)
     OR command.branch_id IS NULL OR erp_security.can_access_branch(command.branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',command.branch_id) IS DISTINCT FROM true
     OR (grant_row.branch_id IS NOT NULL AND command.branch_id IS DISTINCT FROM grant_row.branch_id)
     OR command.destination_branch_id IS NOT NULL
     OR command.request_hash IS DISTINCT FROM extensions.digest(command.request_bytes,'sha256')
     OR command.preview_hash IS DISTINCT FROM extensions.digest(command.preview_bytes,'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim grant, capability, branch, or exact bytes changed';
  END IF;
  SELECT * INTO STRICT membership FROM core.memberships
   WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT user_row FROM core.users
   WHERE id=membership.user_id AND status='active' FOR SHARE;
  request_document:=pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(command.preview_bytes,'UTF8')::jsonb;
  current_resolution:="erp_automation_commands"."resolve_expense_claim_prepare"(
    organization_id,membership.id,user_row.auth_user_id,user_row.id,grant_row.id,
    grant_row.client_id,command.target_resource_id,request_document);
  IF current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
     OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
     OR command.aggregate_version_hash IS DISTINCT FROM extensions.digest(
          pg_catalog.convert_to((preview_document->'source_versions')::text,'UTF8'),'sha256')
     OR command.calculation_hash IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim receipt, account, member, or branch evidence changed';
  END IF;
  SELECT * INTO STRICT claim FROM finance.expense_claims
   WHERE org_id=organization_id AND id=command.target_resource_id FOR UPDATE;
  IF claim.status<>'approved' OR claim.claimant_membership_id<>actor_id
     OR claim.approved_by_membership_id IS NULL OR claim.approved_by_membership_id=actor_id
     OR claim.approved_amount IS DISTINCT FROM claim.claimed_amount
     OR EXISTS(SELECT 1 FROM finance.expense_claim_lines line
                WHERE line.org_id=organization_id AND line.expense_claim_id=claim.id
                  AND line.approved_amount IS DISTINCT FROM line.claimed_amount) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim lacks exact full independent approval';
  END IF;
  IF EXISTS(
    SELECT 1 FROM automation.command_approvals approval
     WHERE approval.org_id=organization_id AND approval.command_request_id=command.id
       AND approval.decision='rejected' AND approval.preview_hash=command.preview_hash
       AND approval.aggregate_version_hash=command.aggregate_version_hash) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim command has an exact-preview rejection';
  END IF;
  SELECT count(*) INTO approval_count FROM automation.command_approvals approval
   WHERE approval.org_id=organization_id AND approval.command_request_id=command.id
     AND approval.decision='approved' AND approval.preview_hash=command.preview_hash
     AND approval.aggregate_version_hash=command.aggregate_version_hash
     AND approval.valid_until_at>pg_catalog.transaction_timestamp()
     AND approval.approver_membership_id=claim.approved_by_membership_id
     AND approval.approver_membership_id<>command.requested_by_membership_id;
  IF approval_count<command.required_approval_count THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense claim exact-preview approval quorum is incomplete';
  END IF;
  INSERT INTO "erp_automation_commands"."execution_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),organization_id,command_request_id);
  IF command.status<>'approved' THEN
    UPDATE automation.command_requests SET status='approved',row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id;
  END IF;
  UPDATE automation.command_requests
     SET status='executing',execution_started_at=pg_catalog.transaction_timestamp(),row_version=row_version+1
   WHERE org_id=organization_id AND id=command_request_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim execution lost command ownership'; END IF;
  PERFORM erp_compliance_commands.post_expense_claim(
    organization_id,command.target_resource_id,(request_document->>'journal_id')::uuid,
    (request_document->>'event_id')::uuid,actor_id,
    extensions.digest(command.idempotency_key_hash||pg_catalog.convert_to(':expense-post','UTF8'),'sha256'),
    command.preview_hash,command.expires_at);
  response_document:=pg_catalog.jsonb_build_object(
    'command_request_id',command.id,'operation',command.operation,'resource_id',command.target_resource_id,
    'resource_type',command.target_resource_type,'status','succeeded');
  response_body:=pg_catalog.convert_to(response_document::text,'UTF8');
  UPDATE automation.command_requests SET status='succeeded',completed_at=pg_catalog.transaction_timestamp(),
    result_resource_type=command.target_resource_type,result_resource_id=command.target_resource_id,
    response_status=200,response_media_type='application/vnd.aasopharma.command-result+json',
    response_bytes=response_body,response_hash=extensions.digest(response_body,'sha256'),row_version=row_version+1
   WHERE org_id=organization_id AND id=command_request_id AND status='executing';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='expense claim finish boundary lost ownership'; END IF;
  DELETE FROM "erp_automation_commands"."execution_scopes" scope
   WHERE scope.backend_pid=pg_catalog.pg_backend_pid() AND scope.transaction_id=pg_catalog.txid_current()
     AND scope.org_id=organization_id AND scope.command_request_id=command_request_id;
  RETURN response_body;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."execute_approved_expense_claim"(uuid,uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_automation_commands"."execute_approved_expense_claim"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."execute_approved_expense_claim"(uuid,uuid) TO "erp_runtime";

RESET ROLE;
