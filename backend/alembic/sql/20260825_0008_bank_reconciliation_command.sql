SET LOCAL ROLE erp_migration_owner;

DO $migration$
DECLARE
  guard_definition text;
  prepare_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.guard_command_request_match()'::pg_catalog.regprocedure)
    INTO STRICT guard_definition;
  IF pg_catalog.strpos(guard_definition, '''finance.bank_reconciliation.prepare''')<>0
     OR pg_catalog.strpos(guard_definition,
       'ELSIF NEW.capability_code IN (''finance.adjustment_note.prepare'',''finance.customer_receipt.prepare''')=0
     OR pg_catalog.strpos(guard_definition,
       'WHEN ''finance.adjustment_note.prepare'' THEN ''adjustment_note'' WHEN ''finance.customer_receipt.prepare''')=0
     OR pg_catalog.strpos(guard_definition,
       'WHEN ''finance.adjustment_note.prepare'' THEN ''finance.adjustment_note.post'' WHEN ''finance.customer_receipt.prepare''')=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='bank reconciliation migration requires the exact reviewed adjustment-note command guard';
  END IF;
  guard_definition:=pg_catalog.replace(guard_definition,
    'ELSIF NEW.capability_code IN (''finance.adjustment_note.prepare'',''finance.customer_receipt.prepare''',
    'ELSIF NEW.capability_code IN (''finance.adjustment_note.prepare'',''finance.bank_reconciliation.prepare'',''finance.customer_receipt.prepare''');
  guard_definition:=pg_catalog.replace(guard_definition,
    'WHEN ''finance.adjustment_note.prepare'' THEN ''adjustment_note'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.adjustment_note.prepare'' THEN ''adjustment_note'' WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.customer_receipt.prepare''');
  guard_definition:=pg_catalog.replace(guard_definition,
    'WHEN ''finance.adjustment_note.prepare'' THEN ''finance.adjustment_note.post'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.adjustment_note.prepare'' THEN ''finance.adjustment_note.post'' WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.customer_receipt.prepare''');
  EXECUTE guard_definition;

  SELECT pg_catalog.pg_get_functiondef(
    'erp_automation_commands.prepare_operator_command(uuid,uuid,uuid,character varying,uuid,uuid,uuid,numeric,character,bytea,bytea,bytea,bytea,bytea,timestamp with time zone)'::pg_catalog.regprocedure)
    INTO STRICT prepare_definition;
  IF pg_catalog.strpos(prepare_definition, '''finance.bank_reconciliation.prepare''')<>0
     OR pg_catalog.strpos(prepare_definition,
       'WHEN ''finance.adjustment_note.prepare'' THEN ''adjustment_note'' WHEN ''finance.customer_receipt.prepare''')=0
     OR pg_catalog.strpos(prepare_definition,
       'WHEN ''finance.adjustment_note.prepare'' THEN ''finance.adjustment_note.post'' WHEN ''finance.customer_receipt.prepare''')=0 THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='bank reconciliation migration requires the exact reviewed adjustment-note generic prepare boundary';
  END IF;
  prepare_definition:=pg_catalog.replace(prepare_definition,
    'WHEN ''finance.adjustment_note.prepare'' THEN ''adjustment_note'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.adjustment_note.prepare'' THEN ''adjustment_note'' WHEN ''finance.bank_reconciliation.prepare'' THEN ''reconciliation_match'' WHEN ''finance.customer_receipt.prepare''');
  prepare_definition:=pg_catalog.replace(prepare_definition,
    'WHEN ''finance.adjustment_note.prepare'' THEN ''finance.adjustment_note.post'' WHEN ''finance.customer_receipt.prepare''',
    'WHEN ''finance.adjustment_note.prepare'' THEN ''finance.adjustment_note.post'' WHEN ''finance.bank_reconciliation.prepare'' THEN ''finance.bank_reconciliation.match'' WHEN ''finance.customer_receipt.prepare''');
  EXECUTE prepare_definition;
END
$migration$;

CREATE OR REPLACE FUNCTION erp_automation_commands.resolve_bank_reconciliation_prepare(
  organization_id uuid, membership_id uuid, auth_user_id uuid,
  application_user_id uuid, grant_id uuid, caller_client_id varchar,
  reconciliation_match_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
  statement_id uuid:=NULLIF(request_document->>'bank_statement_id','')::uuid;
  statement_line_id uuid:=NULLIF(request_document->>'bank_statement_line_id','')::uuid;
  journal_id uuid:=NULLIF(request_document->>'journal_entry_id','')::uuid;
  requested_amount numeric(20,2):=NULLIF(request_document->>'matched_amount','')::numeric;
  requested_method text:=request_document->>'match_method';
  bank finance.bank_accounts%ROWTYPE;
  statement finance.bank_statements%ROWTYPE;
  statement_line finance.bank_statement_lines%ROWTYPE;
  journal finance.journal_entries%ROWTYPE;
  ledger finance.accounts%ROWTYPE;
  bank_journal_line finance.journal_lines%ROWTYPE;
  bank_line_count integer;
  active_statement_matches integer;
  active_journal_matches integer;
  expected_debit numeric(20,2);
  expected_credit numeric(20,2);
  source_versions jsonb;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL
     OR application_user_id IS NULL OR grant_id IS NULL OR reconciliation_match_id IS NULL
     OR branch_id IS NULL OR statement_id IS NULL OR statement_line_id IS NULL OR journal_id IS NULL
     OR requested_amount IS NULL OR requested_amount<=0
     OR requested_amount<>pg_catalog.round(requested_amount,2)
     OR requested_method NOT IN ('manual','reference_exact') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='bank reconciliation exact-match input is incomplete or invalid';
  END IF;
  PERFORM 1 FROM core.memberships membership
    JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row
      ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability
      ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id
     AND membership.user_id=application_user_id AND membership.status='active'
     AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN'
     AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id
     AND grant_row.status='active' AND grant_row.expires_at>pg_catalog.transaction_timestamp()
     AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.bank_reconciliation.prepare'
     AND capability.operation_mode='write' AND capability.risk_class='consequential_write'
     AND capability.approval_policy='separate_approver' AND capability.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='bank reconciliation delegated authority is inactive';
  END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.bank_reconcile',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='bank reconciliation branch permission is inactive';
  END IF;
  SELECT * INTO STRICT statement FROM finance.bank_statements
   WHERE org_id=organization_id AND id=statement_id AND status IN ('imported','reconciling')
     AND currency_code='INR' FOR SHARE;
  SELECT * INTO STRICT bank FROM finance.bank_accounts
   WHERE org_id=organization_id AND id=statement.bank_account_id AND status='active'
     AND currency_code=statement.currency_code FOR SHARE;
  SELECT * INTO STRICT ledger FROM finance.accounts
   WHERE org_id=organization_id AND id=bank.account_id AND status='active'
     AND account_type='asset' AND allows_bank_reconciliation FOR SHARE;
  SELECT * INTO STRICT statement_line FROM finance.bank_statement_lines
   WHERE org_id=organization_id AND id=statement_line_id
     AND bank_statement_id=statement.id FOR SHARE;
  SELECT * INTO STRICT journal FROM finance.journal_entries
   WHERE org_id=organization_id AND id=journal_id AND status='posted'
     AND transaction_currency=statement.currency_code
     AND functional_currency='INR' AND fx_rate=1
     AND transaction_debit_total=transaction_credit_total
     AND functional_debit_total=functional_credit_total
     AND posting_date=statement_line.transaction_date FOR SHARE;
  SELECT count(*) INTO bank_line_count FROM finance.journal_lines line
   WHERE line.org_id=organization_id AND line.journal_entry_id=journal.id
     AND line.account_id=bank.account_id;
  IF bank_line_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted journal must contain exactly one line for the statement bank ledger';
  END IF;
  SELECT * INTO STRICT bank_journal_line FROM finance.journal_lines
   WHERE org_id=organization_id AND journal_entry_id=journal.id
     AND account_id=bank.account_id FOR SHARE;
  expected_debit:=CASE statement_line.direction WHEN 'credit' THEN statement_line.amount ELSE 0 END;
  expected_credit:=CASE statement_line.direction WHEN 'debit' THEN statement_line.amount ELSE 0 END;
  IF requested_amount IS DISTINCT FROM statement_line.amount
     OR bank_journal_line.branch_id IS DISTINCT FROM branch_id
     OR bank_journal_line.transaction_debit IS DISTINCT FROM expected_debit
     OR bank_journal_line.transaction_credit IS DISTINCT FROM expected_credit
     OR bank_journal_line.functional_debit IS DISTINCT FROM expected_debit
     OR bank_journal_line.functional_credit IS DISTINCT FROM expected_credit
     OR (requested_method='reference_exact' AND
         NULLIF(pg_catalog.btrim(statement_line.bank_reference),'') IS DISTINCT FROM journal.journal_number) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='statement and posted bank-ledger journal are not one exact full match';
  END IF;
  SELECT count(*) INTO active_statement_matches FROM finance.reconciliation_matches matched
   WHERE matched.org_id=organization_id AND matched.bank_statement_line_id=statement_line.id
     AND matched.status='matched' AND NOT EXISTS (
       SELECT 1 FROM finance.reconciliation_matches reversal
        WHERE reversal.org_id=matched.org_id AND reversal.reversal_of_match_id=matched.id);
  SELECT count(*) INTO active_journal_matches FROM finance.reconciliation_matches matched
   WHERE matched.org_id=organization_id AND matched.journal_entry_id=journal.id
     AND matched.status='matched' AND NOT EXISTS (
       SELECT 1 FROM finance.reconciliation_matches reversal
        WHERE reversal.org_id=matched.org_id AND reversal.reversal_of_match_id=matched.id);
  IF active_statement_matches<>0 OR active_journal_matches<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='statement line or journal already has an active reconciliation match';
  END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','bank_statement','role','statement','id',statement.id,'row_version',statement.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_statement_line','role','statement_line','id',statement_line.id,
      'immutable_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        statement_line.bank_statement_id,statement_line.line_number,statement_line.transaction_date,
        statement_line.value_date,statement_line.direction,statement_line.amount,
        statement_line.bank_reference,statement_line.description)::text,'UTF8'),'sha256'),'hex')),
    pg_catalog.jsonb_build_object('resource_type','bank_account','role','bank_account','id',bank.id,'row_version',bank.row_version),
    pg_catalog.jsonb_build_object('resource_type','finance_account','role','bank_ledger','id',ledger.id,'row_version',ledger.row_version),
    pg_catalog.jsonb_build_object('resource_type','journal_entry','role','posted_journal','id',journal.id,'row_version',journal.row_version),
    pg_catalog.jsonb_build_object('resource_type','journal_line','role','bank_ledger_line','id',bank_journal_line.id,
      'immutable_hash',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_array(
        bank_journal_line.journal_entry_id,bank_journal_line.line_number,bank_journal_line.account_id,
        bank_journal_line.branch_id,bank_journal_line.transaction_debit,bank_journal_line.transaction_credit,
        bank_journal_line.functional_debit,bank_journal_line.functional_credit)::text,'UTF8'),'sha256'),'hex')));
  RETURN pg_catalog.jsonb_build_object(
    'branch_id',branch_id,'bank_statement_id',statement.id,'bank_statement_line_id',statement_line.id,
    'bank_account_id',bank.id,'bank_ledger_account_id',ledger.id,'journal_entry_id',journal.id,
    'journal_bank_line_id',bank_journal_line.id,'statement_direction',statement_line.direction,
    'matched_amount',requested_amount::text,'currency_code','INR',
    'journal_debit_total',journal.transaction_debit_total::text,
    'journal_credit_total',journal.transaction_credit_total::text,
    'match_method',requested_method,'source_versions',source_versions,
    'legal_scope',pg_catalog.jsonb_build_object('country','IN','currency','INR','effect','reconciliation_only',
      'journal_mutation',false,'statement_line_mutation',false,'partial_match',false,'reversal',false,
      'unsupported_fail_closed',pg_catalog.jsonb_build_array('partial_match','foreign_currency','date_mismatch',
        'multi_bank_line_journal','already_matched_owner','reversal','automatic_tolerance')));
END
$function$;
ALTER FUNCTION erp_automation_commands.resolve_bank_reconciliation_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.resolve_bank_reconciliation_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.resolve_bank_reconciliation_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb) TO erp_runtime;

CREATE OR REPLACE FUNCTION erp_automation_commands.persist_bank_reconciliation_prepare(
  organization_id uuid, membership_id uuid, auth_user_id uuid,
  application_user_id uuid, grant_id uuid, caller_client_id varchar,
  reconciliation_match_id uuid, command_id uuid, key_hash bytea,
  request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb; resolved_document jsonb; preview_document jsonb;
  current_resolution jsonb; existing automation.command_requests%ROWTYPE;
  aggregate_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR reconciliation_match_id IS NULL OR command_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32
     OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='bank reconciliation prepare envelope is invalid';
  END IF;
  BEGIN
    request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='bank reconciliation prepare requires UTF-8 JSON';
  END;
  current_resolution:=erp_automation_commands.resolve_bank_reconciliation_prepare(
    organization_id,membership_id,auth_user_id,application_user_id,grant_id,caller_client_id,
    reconciliation_match_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document
     OR request_document->>'reconciliation_match_id' IS DISTINCT FROM reconciliation_match_id::text
     OR preview_document->>'operation'<>'finance.bank_reconciliation.match'
     OR preview_document->>'target_resource_type'<>'reconciliation_match'
     OR preview_document->>'target_resource_id' IS DISTINCT FROM reconciliation_match_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact' IS DISTINCT FROM '[]'::jsonb
     OR preview_document->'tax_impact' IS DISTINCT FROM '[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank reconciliation resolution or preview changed';
  END IF;
  SELECT * INTO existing FROM automation.command_requests
   WHERE org_id=organization_id AND agent_grant_id=grant_id
     AND capability_code='finance.bank_reconciliation.prepare'
     AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM reconciliation_match_id
       OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='bank reconciliation idempotency key has different exact input';
    END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM erp_automation_commands.prepare_operator_command(
    organization_id,command_id,grant_id,'finance.bank_reconciliation.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,reconciliation_match_id,
    (resolved_document->>'matched_amount')::numeric,'INR',key_hash,request_bytes,
    preview_bytes,NULL,aggregate_hash,expires_at);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;
ALTER FUNCTION erp_automation_commands.persist_bank_reconciliation_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.persist_bank_reconciliation_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.persist_bank_reconciliation_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) TO erp_runtime;

CREATE OR REPLACE FUNCTION erp_automation_commands.execute_bank_reconciliation_command(
  organization_id uuid, command_request_id uuid)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_row automation.command_requests%ROWTYPE; grant_row automation.agent_grants%ROWTYPE;
  membership core.memberships%ROWTYPE; user_row core.users%ROWTYPE; request_document jsonb;
  preview_document jsonb; current_resolution jsonb; approval_count integer; actor_id uuid;
  statement_id uuid; statement_line_id uuid; journal_id uuid; match_id uuid;
  response_document jsonb; response_body bytea; fully_matched integer; total_lines integer;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR NULLIF(pg_catalog.current_setting('app.command_request_id',true),'')::uuid IS DISTINCT FROM command_request_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='bank reconciliation execution context is invalid';
  END IF;
  SELECT * INTO STRICT request_row FROM automation.command_requests
   WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
  IF request_row.capability_code<>'finance.bank_reconciliation.prepare'
     OR request_row.operation<>'finance.bank_reconciliation.match'
     OR request_row.target_resource_type<>'reconciliation_match' THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='command is not a reviewed bank reconciliation';
  END IF;
  IF request_row.status='succeeded' THEN RETURN request_row.response_bytes; END IF;
  IF request_row.status NOT IN ('prepared','approved') OR request_row.expires_at<=pg_catalog.transaction_timestamp()
     OR request_row.request_hash IS DISTINCT FROM extensions.digest(request_row.request_bytes,'sha256')
     OR request_row.preview_hash IS DISTINCT FROM extensions.digest(request_row.preview_bytes,'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank reconciliation command is stale, expired, or changed';
  END IF;
  actor_id:=erp_security.current_membership_id();
  IF actor_id IS DISTINCT FROM request_row.requested_by_membership_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='bank reconciliation execution requires its maker';
  END IF;
  SELECT * INTO STRICT grant_row FROM automation.agent_grants
   WHERE org_id=organization_id AND id=request_row.agent_grant_id AND status='active'
     AND expires_at>pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT membership FROM core.memberships
   WHERE org_id=organization_id AND id=actor_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT user_row FROM core.users
   WHERE id=membership.user_id AND status='active' FOR SHARE;
  BEGIN
    request_document:=pg_catalog.convert_from(request_row.request_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(request_row.preview_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank reconciliation command payload is invalid';
  END;
  statement_id:=(request_document->>'bank_statement_id')::uuid;
  statement_line_id:=(request_document->>'bank_statement_line_id')::uuid;
  journal_id:=(request_document->>'journal_entry_id')::uuid;
  match_id:=request_row.target_resource_id;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||':'||statement_line_id::text,7901));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||':'||journal_id::text,7902));
  current_resolution:=erp_automation_commands.resolve_bank_reconciliation_prepare(
    organization_id,actor_id,user_row.auth_user_id,membership.user_id,grant_row.id,grant_row.client_id,
    match_id,request_document);
  IF current_resolution->'source_versions' IS DISTINCT FROM preview_document->'source_versions'
     OR current_resolution->'legal_scope' IS DISTINCT FROM preview_document->'legal_scope'
     OR request_row.aggregate_version_hash IS DISTINCT FROM extensions.digest(
       pg_catalog.convert_to((current_resolution->'source_versions')::text,'UTF8'),'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank statement, journal, bank ledger, branch, or matching evidence changed';
  END IF;
  SELECT count(*) INTO approval_count FROM automation.command_approvals approval
   WHERE approval.org_id=organization_id AND approval.command_request_id=command_request_id
     AND approval.decision='approved' AND approval.preview_hash=request_row.preview_hash
     AND approval.aggregate_version_hash=request_row.aggregate_version_hash
     AND approval.valid_until_at>pg_catalog.transaction_timestamp()
     AND approval.approver_membership_id<>request_row.requested_by_membership_id;
  IF approval_count<1 THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='bank reconciliation independent exact-preview approval is incomplete';
  END IF;
  INSERT INTO erp_automation_commands.execution_scopes VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),organization_id,command_request_id);
  IF request_row.status='prepared' THEN
    UPDATE automation.command_requests SET status='approved',row_version=row_version+1
     WHERE org_id=organization_id AND id=command_request_id AND status='prepared';
  END IF;
  UPDATE automation.command_requests SET status='executing',execution_started_at=pg_catalog.transaction_timestamp(),
    row_version=row_version+1 WHERE org_id=organization_id AND id=command_request_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank reconciliation begin boundary lost ownership'; END IF;
  INSERT INTO finance.reconciliation_matches(org_id,id,bank_statement_line_id,journal_entry_id,
    matched_amount,currency_code,match_method,matched_by_membership_id,status,created_by_membership_id)
  VALUES(organization_id,match_id,statement_line_id,journal_id,
    (current_resolution->>'matched_amount')::numeric,'INR',current_resolution->>'match_method',actor_id,'matched',actor_id);
  UPDATE finance.bank_statements SET status='reconciling',reconciled_at=NULL,
    reconciled_by_membership_id=NULL,updated_at=pg_catalog.transaction_timestamp(),
    updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=statement_id AND status='imported';
  SELECT count(*) INTO total_lines FROM finance.bank_statement_lines line
   WHERE line.org_id=organization_id AND line.bank_statement_id=statement_id;
  SELECT count(*) INTO fully_matched FROM finance.bank_statement_lines line
   WHERE line.org_id=organization_id AND line.bank_statement_id=statement_id AND EXISTS(
     SELECT 1 FROM finance.reconciliation_matches matched
      WHERE matched.org_id=line.org_id AND matched.bank_statement_line_id=line.id
        AND matched.status='matched' AND matched.matched_amount=line.amount
        AND NOT EXISTS(SELECT 1 FROM finance.reconciliation_matches reversal
          WHERE reversal.org_id=matched.org_id AND reversal.reversal_of_match_id=matched.id));
  UPDATE finance.bank_statements SET status=CASE WHEN total_lines>0 AND fully_matched=total_lines THEN 'reconciled' ELSE 'reconciling' END,
    reconciled_at=CASE WHEN total_lines>0 AND fully_matched=total_lines THEN pg_catalog.transaction_timestamp() ELSE NULL END,
    reconciled_by_membership_id=CASE WHEN total_lines>0 AND fully_matched=total_lines THEN actor_id ELSE NULL END,
    updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=statement_id AND status='reconciling';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank statement reconciliation lifecycle changed'; END IF;
  response_document:=pg_catalog.jsonb_build_object('command_request_id',command_request_id,
    'operation',request_row.operation,'resource_id',match_id,'resource_type','reconciliation_match','status','succeeded');
  response_body:=pg_catalog.convert_to(response_document::text,'UTF8');
  UPDATE automation.command_requests SET status='succeeded',completed_at=pg_catalog.transaction_timestamp(),
    result_resource_type='reconciliation_match',result_resource_id=match_id,response_status=200,
    response_media_type='application/vnd.aasopharma.command-result+json',response_bytes=response_body,
    response_hash=extensions.digest(response_body,'sha256'),row_version=row_version+1
   WHERE org_id=organization_id AND id=command_request_id AND status='executing';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='bank reconciliation finish boundary lost ownership'; END IF;
  DELETE FROM erp_automation_commands.execution_scopes AS active_scope
   WHERE active_scope.backend_pid=pg_catalog.pg_backend_pid()
    AND active_scope.transaction_id=pg_catalog.txid_current() AND active_scope.org_id=organization_id
    AND active_scope.command_request_id=command_request_id;
  RETURN response_body;
END
$function$;
ALTER FUNCTION erp_automation_commands.execute_bank_reconciliation_command(uuid,uuid) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.execute_bank_reconciliation_command(uuid,uuid) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.execute_bank_reconciliation_command(uuid,uuid) TO erp_runtime;

DROP POLICY IF EXISTS erp_insert ON finance.reconciliation_matches;
DROP POLICY IF EXISTS erp_update ON finance.reconciliation_matches;
REVOKE INSERT,UPDATE ON finance.reconciliation_matches FROM erp_app;
DROP TRIGGER IF EXISTS finance_reconciliation_matches_outbox_trg ON finance.reconciliation_matches;
CREATE TRIGGER finance_reconciliation_matches_outbox_trg
AFTER INSERT ON finance.reconciliation_matches FOR EACH ROW
EXECUTE FUNCTION erp_plumbing.enqueue_state_outbox('reconciliation_match','matched,reversed');
