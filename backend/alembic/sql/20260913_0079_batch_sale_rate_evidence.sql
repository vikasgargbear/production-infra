SET LOCAL ROLE erp_migration_owner;
CREATE OR REPLACE FUNCTION "erp_automation_commands"."guard_command_request_match"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
    grant_row automation.agent_grants%ROWTYPE;
    capability automation.agent_grant_capabilities%ROWTYPE;
    request_document jsonb;
    preview_document jsonb;
    expected_request jsonb;
    expected_preview jsonb;
    expected_target_type text;
    expected_operation text;
    source_versions jsonb;
BEGIN
    IF NEW.status<>'prepared' OR NEW.row_version<>1
       OR NEW.execution_started_at IS NOT NULL OR NEW.completed_at IS NOT NULL
       OR NEW.response_bytes IS NOT NULL OR NEW.result_resource_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new command request must be an unexecuted prepared snapshot';
    END IF;
    SELECT * INTO grant_row FROM automation.agent_grants
     WHERE org_id=NEW.org_id AND id=NEW.agent_grant_id FOR SHARE;
    SELECT * INTO capability FROM automation.agent_grant_capabilities
     WHERE org_id=NEW.org_id AND agent_grant_id=NEW.agent_grant_id
       AND capability_code=NEW.capability_code FOR SHARE;
    IF grant_row.id IS NULL OR capability.capability_code IS NULL
       OR grant_row.status<>'active' OR grant_row.expires_at<=pg_catalog.transaction_timestamp()
       OR grant_row.subject_membership_id IS DISTINCT FROM NEW.requested_by_membership_id
       OR capability.status<>'active'
       OR NEW.operation_mode IS DISTINCT FROM capability.operation_mode
       OR NEW.risk_class IS DISTINCT FROM capability.risk_class
       OR NEW.approval_policy IS DISTINCT FROM capability.approval_policy
       OR NEW.required_approval_count<>1
       OR NEW.expires_at<=pg_catalog.transaction_timestamp()
       OR NEW.expires_at>grant_row.expires_at THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command request exceeds its active exact capability consent';
    END IF;
    IF NEW.operation='automation.agent_grant.revoke' THEN
        IF NEW.branch_id IS DISTINCT FROM grant_row.branch_id
           OR NEW.destination_branch_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='grant revocation branch scope changed';
        END IF;
    ELSIF NEW.capability_code IN ('finance.adjustment_note.prepare','finance.adjustment_note.reversal.prepare','finance.bank_reconciliation.prepare','finance.customer_cheque_bounce.prepare','finance.customer_cheque_clearance.prepare','finance.customer_receipt.prepare','finance.expense_claim.prepare','finance.supplier_advance.prepare','finance.supplier_payment.prepare','inventory.adjustment.prepare','inventory.batch_sale_rate.prepare','inventory.destruction.prepare','inventory.transfer.prepare','procurement.goods_receipt.prepare','procurement.purchase_order.prepare','procurement.purchase_return.prepare','procurement.purchase_return.reversal.prepare','procurement.supplier_invoice.prepare','sales.dispatch.prepare','sales.invoice.prepare','sales.order.prepare','sales.return.prepare','sales.return.reversal.prepare') THEN
        IF NEW.branch_id IS NULL
           OR erp_security.can_access_branch(NEW.branch_id) IS DISTINCT FROM true
           OR (NEW.destination_branch_id IS NOT NULL
               AND erp_security.can_access_branch(NEW.destination_branch_id) IS DISTINCT FROM true)
           OR (grant_row.branch_id IS NOT NULL AND
               (NEW.branch_id IS DISTINCT FROM grant_row.branch_id
                OR NEW.destination_branch_id IS NOT NULL))
           OR (NEW.capability_code='inventory.transfer.prepare' AND
               (NEW.destination_branch_id IS NULL OR NEW.destination_branch_id=NEW.branch_id))
           OR (NEW.capability_code<>'inventory.transfer.prepare' AND NEW.destination_branch_id IS NOT NULL) THEN
            RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command branches exceed the active grant or actor access';
        END IF;
    ELSE
        RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='operation has no reviewed prepare boundary';
    END IF;
    IF NEW.requested_amount IS NOT NULL AND (
          capability.maximum_amount IS NULL
          OR NEW.requested_amount>capability.maximum_amount
          OR NEW.currency_code IS DISTINCT FROM capability.currency_code
       ) OR NEW.requested_amount IS NULL AND NEW.currency_code IS NOT NULL
       OR NEW.requests_sensitive_read AND NOT capability.allow_sensitive_read THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='command amount, currency, or sensitive-read intent exceeds consent';
    END IF;
    IF NEW.serializer_version<>'aasopharma-pg-jsonb-v1'
       OR NEW.request_media_type<>'application/vnd.aasopharma.command+json'
       OR NEW.preview_media_type<>'application/vnd.aasopharma.command-preview+json'
       OR NEW.request_hash IS DISTINCT FROM extensions.digest(NEW.request_bytes,'sha256')
       OR NEW.preview_hash IS DISTINCT FROM extensions.digest(NEW.preview_bytes,'sha256') THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='command serializer, media type, or exact-byte hash is invalid';
    END IF;
    BEGIN
        request_document := pg_catalog.convert_from(NEW.request_bytes,'UTF8')::jsonb;
        preview_document := pg_catalog.convert_from(NEW.preview_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='command request and preview must be UTF-8 JSON';
    END;
    IF NEW.operation='automation.agent_grant.revoke' THEN
        IF NEW.operation_mode<>'write' OR NEW.target_resource_type<>'agent_grant'
           OR NEW.target_resource_id IS DISTINCT FROM NEW.agent_grant_id
           OR NEW.target_row_version IS DISTINCT FROM grant_row.row_version
           OR NEW.requested_amount IS NOT NULL OR NEW.currency_code IS NOT NULL
           OR NEW.requests_sensitive_read OR NEW.calculation_hash IS NOT NULL
           OR NEW.request_reason IS NULL OR pg_catalog.btrim(NEW.request_reason)='' THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='incomplete typed grant revocation';
        END IF;
        expected_request := pg_catalog.jsonb_build_object(
            'agent_grant_id',NEW.agent_grant_id,
            'branch_id',NEW.branch_id,
            'operation',NEW.operation,
            'organization_id',NEW.org_id,
            'reason',NEW.request_reason,
            'serializer_version',NEW.serializer_version,
            'target_row_version',NEW.target_row_version
        );
        expected_preview := pg_catalog.jsonb_build_object(
            'effect','revoke_agent_grant',
            'operation',NEW.operation,
            'organization_id',NEW.org_id,
            'reason',NEW.request_reason,
            'serializer_version',NEW.serializer_version,
            'target_resource_id',NEW.target_resource_id,
            'target_resource_type',NEW.target_resource_type,
            'target_row_version',NEW.target_row_version
        );
        IF request_document IS DISTINCT FROM expected_request
           OR preview_document IS DISTINCT FROM expected_preview
           OR NEW.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
                NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version
           ) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='grant revocation envelope differs from persisted facts';
        END IF;
        RETURN NEW;
    END IF;

    expected_target_type := CASE NEW.capability_code WHEN 'sales.order.prepare' THEN 'sales_order' WHEN 'sales.dispatch.prepare' THEN 'dispatch' WHEN 'sales.invoice.prepare' THEN 'sales_invoice' WHEN 'sales.return.prepare' THEN 'sales_return' WHEN 'procurement.purchase_order.prepare' THEN 'purchase_order' WHEN 'procurement.goods_receipt.prepare' THEN 'goods_receipt' WHEN 'procurement.supplier_invoice.prepare' THEN 'supplier_invoice' WHEN 'procurement.purchase_return.prepare' THEN 'purchase_return' WHEN 'finance.customer_receipt.prepare' THEN 'payment' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'payment' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'payment' WHEN 'finance.supplier_payment.prepare' THEN 'payment' WHEN 'finance.supplier_advance.prepare' THEN 'payment' WHEN 'finance.adjustment_note.prepare' THEN 'adjustment_note' WHEN 'finance.bank_reconciliation.prepare' THEN 'reconciliation_match' WHEN 'finance.expense_claim.prepare' THEN 'expense_claim' WHEN 'inventory.transfer.prepare' THEN 'inventory_document' WHEN 'inventory.adjustment.prepare' THEN 'inventory_document' WHEN 'inventory.destruction.prepare' THEN 'destruction' WHEN 'sales.return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'inventory.batch_sale_rate.prepare' THEN 'batch_sale_rate_review' ELSE NULL END;
    expected_operation := CASE NEW.capability_code WHEN 'sales.order.prepare' THEN 'sales.order.approve' WHEN 'sales.dispatch.prepare' THEN 'sales.dispatch.post' WHEN 'sales.invoice.prepare' THEN 'sales.invoice.post' WHEN 'sales.return.prepare' THEN 'sales.return.post' WHEN 'procurement.purchase_order.prepare' THEN 'procurement.purchase_order.approve' WHEN 'procurement.goods_receipt.prepare' THEN 'procurement.receipt.post' WHEN 'procurement.supplier_invoice.prepare' THEN 'procurement.supplier_invoice.post' WHEN 'procurement.purchase_return.prepare' THEN 'procurement.purchase_return.post' WHEN 'finance.customer_receipt.prepare' THEN 'finance.payment.post' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'finance.customer_cheque_clearance.post' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'finance.customer_cheque_bounce.post' WHEN 'finance.supplier_payment.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_advance.prepare' THEN 'finance.supplier_advance.post' WHEN 'finance.adjustment_note.prepare' THEN 'finance.adjustment_note.post' WHEN 'finance.bank_reconciliation.prepare' THEN 'finance.bank_reconciliation.match' WHEN 'finance.expense_claim.prepare' THEN 'finance.expense_claim.post' WHEN 'inventory.transfer.prepare' THEN 'inventory.document.post' WHEN 'inventory.adjustment.prepare' THEN 'inventory.document.post' WHEN 'inventory.destruction.prepare' THEN 'compliance.destruction.post' WHEN 'sales.return.reversal.prepare' THEN 'sales.return.reversal.post' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'procurement.purchase_return.reversal.post' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'finance.adjustment_note.reversal.post' WHEN 'inventory.batch_sale_rate.prepare' THEN 'inventory.batch_sale_rate.record' ELSE NULL END;
    source_versions := preview_document->'source_versions';
    IF expected_target_type IS NULL OR expected_operation IS NULL
       OR NEW.operation IS DISTINCT FROM expected_operation OR NEW.operation_mode<>'write'
       OR NEW.target_resource_type IS DISTINCT FROM expected_target_type
       OR NEW.target_row_version<>1 OR NEW.requests_sensitive_read
       OR pg_catalog.jsonb_typeof(request_document)<>'object'
       OR pg_catalog.jsonb_typeof(preview_document)<>'object'
       OR pg_catalog.jsonb_typeof(source_versions)<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'resolved_references')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'calculation_ruleset')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'inventory_impact')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'financial_impact')<>'array'
       OR pg_catalog.jsonb_typeof(preview_document->'tax_impact')<>'array'
       OR preview_document->>'command_request_id' IS DISTINCT FROM NEW.id::text
       OR preview_document->>'capability_code' IS DISTINCT FROM NEW.capability_code
       OR preview_document->>'operation' IS DISTINCT FROM NEW.operation
       OR preview_document->>'organization_id' IS DISTINCT FROM NEW.org_id::text
       OR preview_document->>'target_resource_type' IS DISTINCT FROM NEW.target_resource_type
       OR preview_document->>'target_resource_id' IS DISTINCT FROM NEW.target_resource_id::text
       OR preview_document->>'branch_id' IS DISTINCT FROM NEW.branch_id::text
       OR NULLIF(preview_document->>'destination_branch_id','')::uuid IS DISTINCT FROM NEW.destination_branch_id
       OR preview_document->>'request_hash' IS DISTINCT FROM pg_catalog.encode(NEW.request_hash,'hex')
       OR (NEW.capability_code IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare','finance.adjustment_note.prepare'
           ) AND
           NULLIF(preview_document->>'calculation_artifact_id','')::uuid IS NULL)
       OR (NEW.capability_code IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare','finance.adjustment_note.prepare'
           ) AND
           NEW.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
               NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version
           ))
       OR (NEW.capability_code NOT IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare','finance.adjustment_note.prepare'
           ) AND
           NEW.aggregate_version_hash IS DISTINCT FROM extensions.digest(
               pg_catalog.convert_to(source_versions::text,'UTF8'),'sha256'
           ))
       OR (NEW.calculation_hash IS NULL) IS DISTINCT FROM
          (NULLIF(preview_document->>'calculation_hash','') IS NULL)
       OR (NEW.calculation_hash IS NOT NULL AND
           preview_document->>'calculation_hash' IS DISTINCT FROM pg_catalog.encode(NEW.calculation_hash,'hex'))
       OR COALESCE(request_document->>'branch_id',request_document->>'source_branch_id') IS DISTINCT FROM NEW.branch_id::text
       OR NULLIF(request_document->>'destination_branch_id','')::uuid IS DISTINCT FROM NEW.destination_branch_id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='operator command envelope differs from exact typed persisted facts';
    END IF;
    RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION "erp_automation_commands"."prepare_operator_command"(organization_id uuid, command_id uuid, grant_id uuid, capability_name varchar, source_branch_id uuid, destination_branch_id uuid, target_id uuid, requested_amount numeric, currency_code char(3), key_hash bytea, request_bytes bytea, preview_bytes bytea, calculation_hash bytea, aggregate_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
    actor_id uuid := erp_security.current_membership_id();
    grant_row automation.agent_grants%ROWTYPE;
    capability automation.agent_grant_capabilities%ROWTYPE;
    existing automation.command_requests%ROWTYPE;
    request_hash bytea := extensions.digest(request_bytes,'sha256');
    preview_hash bytea := extensions.digest(preview_bytes,'sha256');
    preview_document jsonb;
    target_type text := CASE capability_name WHEN 'sales.order.prepare' THEN 'sales_order' WHEN 'sales.dispatch.prepare' THEN 'dispatch' WHEN 'sales.invoice.prepare' THEN 'sales_invoice' WHEN 'sales.return.prepare' THEN 'sales_return' WHEN 'procurement.purchase_order.prepare' THEN 'purchase_order' WHEN 'procurement.goods_receipt.prepare' THEN 'goods_receipt' WHEN 'procurement.supplier_invoice.prepare' THEN 'supplier_invoice' WHEN 'procurement.purchase_return.prepare' THEN 'purchase_return' WHEN 'finance.customer_receipt.prepare' THEN 'payment' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'payment' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'payment' WHEN 'finance.supplier_payment.prepare' THEN 'payment' WHEN 'finance.supplier_advance.prepare' THEN 'payment' WHEN 'finance.adjustment_note.prepare' THEN 'adjustment_note' WHEN 'finance.bank_reconciliation.prepare' THEN 'reconciliation_match' WHEN 'finance.expense_claim.prepare' THEN 'expense_claim' WHEN 'inventory.transfer.prepare' THEN 'inventory_document' WHEN 'inventory.adjustment.prepare' THEN 'inventory_document' WHEN 'inventory.destruction.prepare' THEN 'destruction' WHEN 'sales.return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'inventory.batch_sale_rate.prepare' THEN 'batch_sale_rate_review' ELSE NULL END;
    operation_name text := CASE capability_name WHEN 'sales.order.prepare' THEN 'sales.order.approve' WHEN 'sales.dispatch.prepare' THEN 'sales.dispatch.post' WHEN 'sales.invoice.prepare' THEN 'sales.invoice.post' WHEN 'sales.return.prepare' THEN 'sales.return.post' WHEN 'procurement.purchase_order.prepare' THEN 'procurement.purchase_order.approve' WHEN 'procurement.goods_receipt.prepare' THEN 'procurement.receipt.post' WHEN 'procurement.supplier_invoice.prepare' THEN 'procurement.supplier_invoice.post' WHEN 'procurement.purchase_return.prepare' THEN 'procurement.purchase_return.post' WHEN 'finance.customer_receipt.prepare' THEN 'finance.payment.post' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'finance.customer_cheque_clearance.post' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'finance.customer_cheque_bounce.post' WHEN 'finance.supplier_payment.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_advance.prepare' THEN 'finance.supplier_advance.post' WHEN 'finance.adjustment_note.prepare' THEN 'finance.adjustment_note.post' WHEN 'finance.bank_reconciliation.prepare' THEN 'finance.bank_reconciliation.match' WHEN 'finance.expense_claim.prepare' THEN 'finance.expense_claim.post' WHEN 'inventory.transfer.prepare' THEN 'inventory.document.post' WHEN 'inventory.adjustment.prepare' THEN 'inventory.document.post' WHEN 'inventory.destruction.prepare' THEN 'compliance.destruction.post' WHEN 'sales.return.reversal.prepare' THEN 'sales.return.reversal.post' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'procurement.purchase_return.reversal.post' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'finance.adjustment_note.reversal.post' WHEN 'inventory.batch_sale_rate.prepare' THEN 'inventory.batch_sale_rate.record' ELSE NULL END;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id()
       OR actor_id IS NULL OR target_type IS NULL OR operation_name IS NULL
       OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL
       OR erp_security.has_permission('automation.command.execute',source_branch_id) IS DISTINCT FROM true
       OR (destination_branch_id IS NOT NULL AND
           erp_security.has_permission('automation.command.execute',destination_branch_id) IS DISTINCT FROM true) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='operator prepare context or permission is invalid';
    END IF;
    IF pg_catalog.octet_length(key_hash)<>32
       OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(aggregate_hash)<>32
       OR (calculation_hash IS NOT NULL AND pg_catalog.octet_length(calculation_hash)<>32) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operator prepare envelope size or hash is invalid';
    END IF;
    BEGIN
        preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operator preview must be UTF-8 JSON';
    END;
    SELECT * INTO STRICT grant_row FROM automation.agent_grants
     WHERE org_id=organization_id AND id=grant_id FOR SHARE;
    SELECT * INTO STRICT capability FROM automation.agent_grant_capabilities
     WHERE org_id=organization_id AND agent_grant_id=grant_id
       AND capability_code=capability_name FOR SHARE;
    SELECT * INTO existing FROM automation.command_requests
     WHERE org_id=organization_id AND agent_grant_id=grant_id
       AND capability_code=capability_name AND idempotency_key_hash=key_hash;
    IF FOUND THEN
        IF existing.request_hash IS DISTINCT FROM request_hash
           OR existing.preview_hash IS DISTINCT FROM preview_hash
           OR existing.target_resource_id IS DISTINCT FROM target_id THEN
            RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='operator prepare idempotency key has different exact input';
        END IF;
        RETURN existing.id;
    END IF;
    PERFORM pg_catalog.set_config('app.command_request_id',command_id::text,true);
    INSERT INTO "erp_automation_commands"."write_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'prepare',organization_id,command_id);
    INSERT INTO automation.command_requests(
        org_id,id,agent_grant_id,requested_by_membership_id,capability_code,operation,
        operation_mode,branch_id,destination_branch_id,requested_amount,currency_code,
        requests_sensitive_read,target_resource_type,target_resource_id,target_row_version,
        serializer_version,idempotency_key_hash,request_media_type,request_bytes,request_hash,
        preview_media_type,preview_bytes,preview_hash,calculation_hash,aggregate_version_hash,
        risk_class,approval_policy,required_approval_count,status,expires_at)
    VALUES(
        organization_id,command_id,grant_id,actor_id,capability_name,operation_name,
        'write',source_branch_id,destination_branch_id,requested_amount,currency_code,
        false,target_type,target_id,1,'aasopharma-pg-jsonb-v1',key_hash,
        'application/vnd.aasopharma.command+json',request_bytes,request_hash,
        'application/vnd.aasopharma.command-preview+json',preview_bytes,preview_hash,
        calculation_hash,aggregate_hash,capability.risk_class,capability.approval_policy,1,
        'prepared',expires_at);
    DELETE FROM "erp_automation_commands"."write_scopes" AS scope
     WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
       AND scope.transaction_id=pg_catalog.txid_current()
       AND scope.scope='prepare' AND scope.org_id=organization_id
       AND scope.command_request_id=command_id;
    RETURN command_id;
END
$function$;
-- One domain-owned selling-rate history shared by import and operator review.
-- Historical source facts, stock valuation and posted documents are never rewritten.
CREATE TABLE inventory.batch_sale_rate_evidence (
  org_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  version bigint NOT NULL CHECK (version>0),
  sale_rate numeric(20,4) NOT NULL CHECK (sale_rate>=0 AND sale_rate<'Infinity'::numeric),
  uom_code varchar(16) NOT NULL,
  price_basis text NOT NULL CHECK (price_basis='tax_exclusive'),
  effective_from date NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('operator_review','migration_source')),
  source_evidence jsonb NOT NULL CHECK (jsonb_typeof(source_evidence)='object'),
  command_request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  created_by_membership_id uuid NOT NULL,
  PRIMARY KEY (org_id,id),
  UNIQUE (org_id,branch_id,batch_id,version),
  UNIQUE (org_id,command_request_id,batch_id),
  FOREIGN KEY (org_id) REFERENCES core.organizations(id),
  FOREIGN KEY (org_id,branch_id) REFERENCES core.branches(org_id,id),
  FOREIGN KEY (org_id,batch_id) REFERENCES inventory.batches(org_id,id),
  FOREIGN KEY (org_id,command_request_id) REFERENCES automation.command_requests(org_id,id),
  FOREIGN KEY (org_id,created_by_membership_id) REFERENCES core.memberships(org_id,id)
);
ALTER TABLE inventory.batch_sale_rate_evidence OWNER TO erp_migration_owner;
ALTER TABLE inventory.batch_sale_rate_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory.batch_sale_rate_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY batch_sale_rate_owner ON inventory.batch_sale_rate_evidence TO erp_migration_owner
 USING (org_id=erp_security.current_org_id() AND erp_security.can_access_branch(branch_id))
 WITH CHECK (org_id=erp_security.current_org_id() AND erp_security.can_access_branch(branch_id));
REVOKE ALL ON inventory.batch_sale_rate_evidence FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER batch_sale_rate_immutable BEFORE UPDATE OR DELETE ON inventory.batch_sale_rate_evidence
 FOR EACH ROW EXECUTE FUNCTION erp_plumbing.reject_row_mutation();
CREATE TRIGGER batch_sale_rate_audit AFTER INSERT ON inventory.batch_sale_rate_evidence
 FOR EACH ROW EXECUTE FUNCTION erp_plumbing.audit_row_mutation();

CREATE FUNCTION erp_automation_commands.resolve_batch_sale_rate(
 organization_id uuid, grant_id uuid, request_document jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
#variable_conflict use_variable
DECLARE actor uuid; branch uuid:=(request_document->>'branch_id')::uuid;
 item jsonb; batch inventory.batches%ROWTYPE; product catalog.products%ROWTYPE;
 fact automation.historical_migration_facts%ROWTYPE; sale automation.historical_migration_facts%ROWTYPE; latest_version bigint;
 versions jsonb:='[]'; seen uuid[]:='{}'; evidence jsonb;
BEGIN
 actor:=erp_core_commands.assert_context(organization_id,'catalog.product.manage',branch);
 IF SESSION_USER<>'erp_runtime' OR branch IS NULL OR
    jsonb_typeof(request_document->'lines') IS DISTINCT FROM 'array' OR
    jsonb_array_length(request_document->'lines') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate review requires 1–100 exact batches';
 END IF;
 PERFORM 1 FROM automation.agent_grants g JOIN automation.agent_grant_capabilities c
 ON c.org_id=g.org_id AND c.agent_grant_id=g.id
 WHERE g.org_id=organization_id AND g.id=grant_id AND g.subject_membership_id=actor
 AND g.status='active' AND g.expires_at>transaction_timestamp()
 AND (g.branch_id IS NULL OR g.branch_id=branch) AND c.status='active'
 AND c.capability_code='inventory.batch_sale_rate.prepare' AND c.operation_mode='write'
 AND c.risk_class='consequential_write' AND c.approval_policy='actor_confirmation' FOR SHARE OF g,c;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate capability is not active'; END IF;
 PERFORM 1 FROM core.branches WHERE org_id=organization_id AND id=branch AND status='active';
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate branch is unavailable'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(request_document->'lines') ORDER BY value->>'batch_id' LOOP
   IF (item->>'batch_id')::uuid=ANY(seen) OR
      COALESCE(item->>'sale_rate','') !~ '^(0|[1-9][0-9]{0,15})([.][0-9]{1,4})?$' OR
      item->>'price_basis' IS DISTINCT FROM 'tax_exclusive' OR
      COALESCE(item->>'expected_rate_version','') !~ '^[0-9]+$' OR
      COALESCE(item->>'batch_row_version','') !~ '^[1-9][0-9]*$' OR
      NULLIF(item->>'effective_from','') IS NULL OR
      COALESCE(item->>'effective_from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
      item->>'source_kind' NOT IN ('operator_review','migration_source') OR item->>'source_kind' IS NULL THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate value, version or basis is invalid';
   END IF;
   seen:=array_append(seen,(item->>'batch_id')::uuid);
   PERFORM pg_advisory_xact_lock(hashtextextended(organization_id::text||':'||branch::text||':'||(item->>'batch_id'),7909));
   SELECT * INTO STRICT batch FROM inventory.batches WHERE org_id=organization_id AND id=(item->>'batch_id')::uuid FOR SHARE;
   SELECT * INTO STRICT product FROM catalog.products WHERE org_id=organization_id AND id=batch.product_id FOR SHARE;
   IF batch.row_version IS DISTINCT FROM (item->>'batch_row_version')::bigint OR
      product.base_uom_code IS DISTINCT FROM item->>'uom_code' THEN
     RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate batch or base unit changed';
   END IF;
   SELECT COALESCE(max(version),0) INTO latest_version FROM inventory.batch_sale_rate_evidence
   WHERE org_id=organization_id AND branch_id=branch AND batch_id=batch.id;
   IF latest_version<>(item->>'expected_rate_version')::bigint THEN
     RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate version changed; review the latest rate';
   END IF;
   evidence:=item->'source_evidence';
   IF jsonb_typeof(evidence) IS DISTINCT FROM 'object' OR COALESCE(btrim(evidence->>'reason'),'')='' THEN
     RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate review reason is required';
   END IF;
   IF item->>'source_kind'='migration_source' THEN
     -- Imported-source provenance means an authenticated operator reviewed the
     -- supplied source unit/basis and corroborating immutable sale. External
     -- file digests are audit references, not server-verified file attestations.
     IF (item->>'sale_rate')::numeric<=0 THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Imported selling rates must be positive';
     END IF;
     SELECT f.* INTO STRICT fact FROM automation.historical_batch_bindings b
     JOIN automation.historical_migration_facts f ON f.org_id=b.org_id AND f.id=b.source_batch_fact_id
     WHERE b.org_id=organization_id AND b.batch_id=batch.id
       AND f.id=(evidence->>'source_batch_fact_id')::uuid AND f.branch_id=branch;
     IF encode(fact.row_sha256,'hex') IS DISTINCT FROM evidence->>'source_batch_row_sha256' OR
        COALESCE(evidence->>'source_file_sha256','') !~ '^[0-9a-f]{64}$' OR
        COALESCE(btrim(evidence->>'source_record_key'),'')='' OR
        fact.selection_state NOT IN ('reviewed','included') THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate source must match the immutable imported batch evidence';
     END IF;
     SELECT l.* INTO STRICT sale FROM automation.historical_migration_facts l
       JOIN automation.historical_migration_facts invoice ON invoice.org_id=l.org_id AND invoice.dataset_id=l.dataset_id
        AND invoice.branch_id=l.branch_id AND invoice.source_kind='sales_invoice'
        AND invoice.event_date=l.event_date
        AND invoice.record_key=l.payload->>'source_invoice_id' AND invoice.selection_state IN ('reviewed','included')
       WHERE l.org_id=organization_id AND l.dataset_id=fact.dataset_id AND l.branch_id=branch
        AND l.source_kind='sales_invoice_line' AND l.record_key=evidence->>'source_sales_line_record_key'
        AND l.id=(evidence->>'source_sales_line_fact_id')::uuid
        AND l.product_code=fact.product_code AND l.batch_number=fact.batch_number
        AND l.selection_state IN ('reviewed','included') AND l.event_date<=(item->>'effective_from')::date;
     IF encode(sale.row_sha256,'hex') IS DISTINCT FROM evidence->>'source_sales_line_row_sha256' OR
        sale.payload->>'quoted_unit_rate' IS NULL OR (sale.payload->>'quoted_unit_rate')::numeric<>(item->>'sale_rate')::numeric OR
        (sale.payload->>'billed_quantity')::numeric IS NULL OR (sale.payload->>'billed_quantity')::numeric<=0 OR
        (sale.payload->>'gross_amount')::numeric IS DISTINCT FROM round((sale.payload->>'billed_quantity')::numeric*(item->>'sale_rate')::numeric,2) OR
        (sale.payload->>'line_discount')::numeric IS NULL OR (sale.payload->>'line_discount')::numeric<0 OR
        (sale.payload->>'line_discount')::numeric>(sale.payload->>'gross_amount')::numeric OR
        (sale.payload->>'tax_rate')::numeric IS NULL OR (sale.payload->>'tax_rate')::numeric<0 OR
        (sale.payload->>'tax_amount')::numeric IS DISTINCT FROM round(((sale.payload->>'gross_amount')::numeric-(sale.payload->>'line_discount')::numeric)*(sale.payload->>'tax_rate')::numeric/100,2) OR
        (sale.payload->>'line_total')::numeric IS DISTINCT FROM (sale.payload->>'gross_amount')::numeric-(sale.payload->>'line_discount')::numeric+(sale.payload->>'tax_amount')::numeric THEN
       RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate source must match an exact tax-exclusive historical sale line';
     END IF;
   END IF;
   versions:=versions||jsonb_build_array(jsonb_build_object('resource_type','batch','id',batch.id,
       'row_version',batch.row_version,'rate_version',latest_version,'product_id',product.id,'uom_code',product.base_uom_code));
 END LOOP;
 RETURN jsonb_build_object('source_versions',versions,'lines',request_document->'lines','branch_id',branch);
END $function$;

CREATE FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(
 organization_id uuid, grant_id uuid, command_id uuid, key_hash bytea, request_bytes bytea, expires_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb:=convert_from(request_bytes,'UTF8')::jsonb; resolved jsonb; preview jsonb;
 old automation.command_requests%ROWTYPE; result_id uuid;
BEGIN
 PERFORM erp_core_commands.assert_context(organization_id,'catalog.product.manage',(request_document->>'branch_id')::uuid);
 PERFORM pg_advisory_xact_lock(hashtextextended(organization_id::text||':'||grant_id::text||':'||encode(key_hash,'hex'),7910));
 SELECT * INTO old FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
 AND capability_code='inventory.batch_sale_rate.prepare' AND idempotency_key_hash=key_hash;
 IF FOUND THEN
   IF old.requested_by_membership_id IS DISTINCT FROM erp_security.current_membership_id() OR
      old.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256') THEN
     RAISE EXCEPTION USING ERRCODE='23505',MESSAGE='Selling-rate replay input differs';
   END IF;
   RETURN jsonb_build_object('command_request_id',old.id,'preview_hash',encode(old.preview_hash,'hex'),
       'expires_at',old.expires_at,'preview',convert_from(old.preview_bytes,'UTF8')::jsonb);
 END IF;
 resolved:=erp_automation_commands.resolve_batch_sale_rate(organization_id,grant_id,request_document);
 preview:=jsonb_build_object('command_request_id',command_id,'capability_code','inventory.batch_sale_rate.prepare',
   'operation','inventory.batch_sale_rate.record','organization_id',organization_id,'branch_id',request_document->>'branch_id',
   'target_resource_type','batch_sale_rate_review','target_resource_id',command_id,
   'source_versions',resolved->'source_versions','resolved_references',resolved->'lines',
   'request_hash',encode(extensions.digest(request_bytes,'sha256'),'hex'),'calculation_ruleset','[]'::jsonb,
   'inventory_impact','[]'::jsonb,'financial_impact','[]'::jsonb,'tax_impact','[]'::jsonb,'selling_rates',resolved->'lines');
 result_id:=erp_automation_commands.prepare_operator_command(organization_id,command_id,grant_id,
   'inventory.batch_sale_rate.prepare',(request_document->>'branch_id')::uuid,NULL,command_id,NULL,NULL,
   key_hash,request_bytes,convert_to(preview::text,'UTF8'),NULL,
   extensions.digest(convert_to((resolved->'source_versions')::text,'UTF8'),'sha256'),expires_at);
 RETURN jsonb_build_object('command_request_id',result_id,'preview_hash',encode(extensions.digest(convert_to(preview::text,'UTF8'),'sha256'),'hex'),
   'expires_at',expires_at,'preview',preview);
END $function$;

CREATE FUNCTION erp_automation_commands.execute_batch_sale_rate(organization_id uuid, command_request_id uuid)
RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
#variable_conflict use_variable
DECLARE request automation.command_requests%ROWTYPE; resolved jsonb; item jsonb; response bytea; reviewed jsonb;
BEGIN
 IF SESSION_USER<>'erp_runtime' OR organization_id IS DISTINCT FROM erp_security.current_org_id() OR
    NULLIF(current_setting('app.command_request_id',true),'')::uuid IS DISTINCT FROM command_request_id THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate execution context differs';
 END IF;
 SELECT * INTO STRICT request FROM automation.command_requests WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
 IF request.operation<>'inventory.batch_sale_rate.record' OR request.capability_code<>'inventory.batch_sale_rate.prepare' OR
    request.requested_by_membership_id IS DISTINCT FROM erp_security.current_membership_id() THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate command is not owned by this actor';
 END IF;
 PERFORM erp_core_commands.assert_context(organization_id,'automation.command.execute',request.branch_id);
 IF request.status='succeeded' THEN RETURN request.response_bytes; END IF;
 IF request.status NOT IN ('prepared','approved') OR request.expires_at<=transaction_timestamp() OR
    request.request_hash IS DISTINCT FROM extensions.digest(request.request_bytes,'sha256') OR
    request.preview_hash IS DISTINCT FROM extensions.digest(request.preview_bytes,'sha256') THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate command expired or changed';
 END IF;
 resolved:=erp_automation_commands.resolve_batch_sale_rate(organization_id,request.agent_grant_id,convert_from(request.request_bytes,'UTF8')::jsonb);
 reviewed:=convert_from(request.preview_bytes,'UTF8')::jsonb;
 IF resolved->'source_versions' IS DISTINCT FROM reviewed->'source_versions' OR
    request.aggregate_version_hash IS DISTINCT FROM extensions.digest(convert_to((resolved->'source_versions')::text,'UTF8'),'sha256') OR
    resolved->'lines' IS DISTINCT FROM reviewed->'selling_rates' THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Selling-rate evidence changed after review';
 END IF;
 PERFORM 1 FROM automation.command_approvals a WHERE a.org_id=organization_id AND a.command_request_id=command_request_id
 AND a.decision='rejected' AND a.preview_hash=request.preview_hash AND a.aggregate_version_hash=request.aggregate_version_hash;
 IF FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate review was rejected'; END IF;
 PERFORM 1 FROM automation.command_approvals a WHERE a.org_id=organization_id AND a.command_request_id=command_request_id
 AND a.decision='approved' AND a.preview_hash=request.preview_hash AND a.aggregate_version_hash=request.aggregate_version_hash
 AND a.approver_membership_id=request.requested_by_membership_id AND request.required_approval_count=1
 AND request.approval_policy='actor_confirmation' AND a.valid_until_at>transaction_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Selling-rate exact review approval is required'; END IF;
 INSERT INTO erp_automation_commands.execution_scopes VALUES(pg_backend_pid(),txid_current(),organization_id,command_request_id);
 IF request.status='prepared' THEN
   UPDATE automation.command_requests SET status='approved',row_version=row_version+1 WHERE org_id=organization_id AND id=command_request_id;
 END IF;
 UPDATE automation.command_requests SET status='executing',execution_started_at=transaction_timestamp(),row_version=row_version+1
 WHERE org_id=organization_id AND id=command_request_id;
 FOR item IN SELECT value FROM jsonb_array_elements(resolved->'lines') LOOP
   INSERT INTO inventory.batch_sale_rate_evidence(org_id,branch_id,batch_id,version,sale_rate,uom_code,price_basis,
      effective_from,source_kind,source_evidence,command_request_id,created_by_membership_id)
   VALUES(organization_id,request.branch_id,(item->>'batch_id')::uuid,(item->>'expected_rate_version')::bigint+1,
      (item->>'sale_rate')::numeric,item->>'uom_code',item->>'price_basis',(item->>'effective_from')::date,
      item->>'source_kind',item->'source_evidence',command_request_id,request.requested_by_membership_id);
 END LOOP;
 response:=convert_to(jsonb_build_object('command_request_id',command_request_id,'operation',request.operation,
   'resource_id',command_request_id,'resource_type','batch_sale_rate_review','status','succeeded')::text,'UTF8');
 UPDATE automation.command_requests SET status='succeeded',completed_at=transaction_timestamp(),result_resource_type='batch_sale_rate_review',
   result_resource_id=command_request_id,response_status=200,response_media_type='application/vnd.aasopharma.command-result+json',
   response_bytes=response,response_hash=extensions.digest(response,'sha256'),row_version=row_version+1
 WHERE org_id=organization_id AND id=command_request_id;
 DELETE FROM erp_automation_commands.execution_scopes s WHERE s.backend_pid=pg_backend_pid() AND s.transaction_id=txid_current()
 AND s.org_id=organization_id AND s.command_request_id=command_request_id;
 RETURN response;
END $function$;

CREATE FUNCTION erp_automation_reads.batch_sale_rate_review(organization_id uuid, command_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
BEGIN
 PERFORM erp_core_commands.assert_context(organization_id,'catalog.product.manage',NULL);
 RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'batch_id',batch_id,'branch_id',branch_id,
 'version',version,'sale_rate',sale_rate::text,'uom_code',uom_code,'price_basis',price_basis,
 'effective_from',effective_from,'source_kind',source_kind,'source_evidence',source_evidence) ORDER BY batch_id)
 FROM inventory.batch_sale_rate_evidence WHERE org_id=organization_id AND command_request_id=command_id),'[]'::jsonb);
END $function$;

ALTER FUNCTION erp_automation_commands.resolve_batch_sale_rate(uuid,uuid,jsonb) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(uuid,uuid,uuid,bytea,bytea,timestamptz) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_commands.execute_batch_sale_rate(uuid,uuid) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_automation_reads.batch_sale_rate_review(uuid,uuid) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.resolve_batch_sale_rate(uuid,uuid,jsonb) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(uuid,uuid,uuid,bytea,bytea,timestamptz) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_commands.execute_batch_sale_rate(uuid,uuid) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_automation_reads.batch_sale_rate_review(uuid,uuid) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.persist_batch_sale_rate_prepare(uuid,uuid,uuid,bytea,bytea,timestamptz),
 erp_automation_commands.execute_batch_sale_rate(uuid,uuid),erp_automation_reads.batch_sale_rate_review(uuid,uuid) TO erp_runtime;

CREATE FUNCTION erp_automation_reads.batch_sale_rate_context(organization_id uuid, selected_branch_id uuid, page_limit integer, page_offset integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' SET row_security=on AS $function$
BEGIN
 PERFORM erp_core_commands.assert_context(organization_id,'catalog.product.manage',selected_branch_id);
 IF selected_branch_id IS NULL OR page_limit IS NULL OR page_offset IS NULL OR page_limit NOT BETWEEN 1 AND 100 OR page_offset<0 THEN
   RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Selling-rate context pagination or branch is invalid';
 END IF;
 RETURN jsonb_build_object('organization_id',organization_id,'branch_id',selected_branch_id,'rows',COALESCE((
 SELECT jsonb_agg(row_to_json(rows)) FROM (
 SELECT b.id AS batch_id,b.row_version AS batch_row_version,
   COALESCE((SELECT max(version) FROM inventory.batch_sale_rate_evidence e
      WHERE e.org_id=organization_id AND e.branch_id=selected_branch_id AND e.batch_id=b.id),0) AS expected_rate_version,
   p.base_uom_code AS uom_code,f.product_code AS source_product_code,f.batch_number AS source_batch_number,
   f.id AS source_batch_fact_id,encode(f.row_sha256,'hex') AS source_batch_row_sha256,f.dataset_id,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'record_key',l.record_key,'row_sha256',encode(l.row_sha256,'hex'),
     'quoted_unit_rate',l.payload->>'quoted_unit_rate','event_date',l.event_date,'payload',l.payload) ORDER BY l.event_date DESC,l.record_key)
     FROM (SELECT l.* FROM automation.historical_migration_facts l WHERE l.org_id=organization_id AND l.dataset_id=f.dataset_id
      AND l.branch_id=selected_branch_id AND l.product_code=f.product_code AND l.batch_number=f.batch_number
      AND l.source_kind='sales_invoice_line' AND l.selection_state IN ('reviewed','included')
      ORDER BY l.event_date DESC,l.record_key LIMIT 100) l),'[]'::jsonb) AS sale_proofs
 FROM inventory.batches b JOIN catalog.products p ON p.org_id=b.org_id AND p.id=b.product_id
 LEFT JOIN automation.historical_batch_bindings binding ON binding.org_id=b.org_id AND binding.batch_id=b.id
 LEFT JOIN automation.historical_migration_facts f ON f.org_id=b.org_id AND f.id=binding.source_batch_fact_id AND f.branch_id=selected_branch_id
 WHERE b.org_id=organization_id AND (f.id IS NOT NULL OR EXISTS (
    SELECT 1 FROM inventory.stock_balances balance WHERE balance.org_id=b.org_id AND balance.batch_id=b.id AND balance.branch_id=selected_branch_id))
 ORDER BY b.id LIMIT page_limit OFFSET page_offset
 ) rows),'[]'::jsonb));
END $function$;
ALTER FUNCTION erp_automation_reads.batch_sale_rate_context(uuid,uuid,integer,integer) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.batch_sale_rate_context(uuid,uuid,integer,integer) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_reads.batch_sale_rate_context(uuid,uuid,integer,integer) TO erp_runtime;

CREATE OR REPLACE FUNCTION erp_automation_reads.migrated_batch_sale_rate(
    organization_id uuid, selected_batch_id uuid, selected_branch_id uuid, as_of_date date
)
RETURNS TABLE (sale_price_per_unit text, sale_price_source text, sale_price_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = on
AS $function$
BEGIN
    PERFORM erp_core_commands.assert_context(organization_id, NULL, NULL::uuid);
    IF NOT erp_security.can_access_branch(selected_branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Sale-rate branch is not accessible';
    END IF;
    RETURN QUERY
    WITH saved AS (
        SELECT e.sale_rate::text AS rate, 'reviewed_batch_price'::text AS source, e.effective_from
          FROM inventory.batch_sale_rate_evidence e
          JOIN inventory.batches b ON b.org_id=e.org_id AND b.id=e.batch_id
          JOIN catalog.products p ON p.org_id=b.org_id AND p.id=b.product_id AND p.base_uom_code=e.uom_code
         WHERE e.org_id=organization_id AND e.batch_id=selected_batch_id
           AND e.branch_id=selected_branch_id AND e.effective_from<=as_of_date
         ORDER BY e.version DESC LIMIT 1
    ), bound AS (
        SELECT product.base_uom_code, binding.dataset_id, binding.source_product_code,
               batch_fact.payload AS batch_payload, product_fact.payload AS product_payload,
               batch_fact.batch_number, batch_fact.event_date AS batch_date,
               product_fact.event_date AS product_date
          FROM inventory.batches batch
          JOIN catalog.products product ON product.org_id=batch.org_id AND product.id=batch.product_id
          JOIN automation.historical_batch_bindings batch_binding
            ON batch_binding.org_id=batch.org_id AND batch_binding.batch_id=batch.id
          JOIN automation.historical_product_bindings binding
            ON binding.org_id=batch.org_id AND binding.product_id=product.id
           AND binding.dataset_id=batch_binding.dataset_id
           AND binding.source_product_code=batch_binding.source_product_code
          JOIN automation.historical_migration_facts batch_fact
            ON batch_fact.org_id=batch.org_id AND batch_fact.id=batch_binding.source_batch_fact_id
          JOIN automation.historical_migration_facts product_fact
            ON product_fact.org_id=binding.org_id AND product_fact.id=binding.source_fact_id
         WHERE batch.org_id=organization_id AND batch.id=selected_batch_id
           AND batch_fact.branch_id=selected_branch_id
           AND product_fact.branch_id=selected_branch_id
    ), candidates AS (
        SELECT 0 AS priority, b.batch_payload->>'sale_price_per_unit' AS rate,
               b.batch_payload->>'sale_price_uom_code' AS uom,
               'migrated_batch_price'::text AS source, NULL::date AS observed_date,
               ''::text AS tie_breaker, b.base_uom_code
          FROM bound b
         WHERE b.batch_payload->>'sale_price_basis'='tax_exclusive'
        UNION ALL
        SELECT 1, b.product_payload->>'sale_price_per_unit',
               b.product_payload->>'sale_price_uom_code',
               'migrated_product_price', NULL::date, '', b.base_uom_code
          FROM bound b
         WHERE b.product_payload->>'sale_price_basis'='tax_exclusive'
        UNION ALL
        SELECT 2, line.payload->>'quoted_unit_rate', line.payload->>'uom_code',
               'last_imported_sale', line.event_date, line.record_key, b.base_uom_code
          FROM bound b
          JOIN automation.historical_migration_facts line
            ON line.org_id=organization_id AND line.dataset_id=b.dataset_id
           AND line.product_code=b.source_product_code AND line.batch_number=b.batch_number
           AND line.branch_id=selected_branch_id AND line.source_kind='sales_invoice_line'
           AND line.selection_state IN ('included','reviewed')
           AND line.event_date<=as_of_date AND line.quantity>0
          JOIN automation.historical_migration_facts invoice
            ON invoice.org_id=line.org_id AND invoice.dataset_id=line.dataset_id
           AND invoice.branch_id=line.branch_id AND invoice.source_kind='sales_invoice'
           AND invoice.record_key=line.payload->>'source_invoice_id'
           AND invoice.selection_state IN ('included','reviewed')
           AND invoice.event_date=line.event_date
         WHERE line.payload->>'price_basis'='tax_exclusive'
    )
    SELECT picked.rate,picked.source,picked.observed_date FROM (
      SELECT -1 AS priority,s.rate,s.source,s.effective_from AS observed_date,''::text AS tie_breaker FROM saved s
      UNION ALL
      SELECT c.priority,c.rate,c.source,c.observed_date,c.tie_breaker FROM candidates c
     WHERE c.uom=c.base_uom_code
       AND c.rate ~ '^[0-9]{1,16}([.][0-9]{1,4})?$'
     ) picked ORDER BY picked.priority,picked.observed_date DESC NULLS LAST,picked.tie_breaker
     LIMIT 1;
END
$function$;

ALTER FUNCTION erp_automation_reads.migrated_batch_sale_rate(uuid,uuid,uuid,date) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_reads.migrated_batch_sale_rate(uuid,uuid,uuid,date)
    FROM PUBLIC,erp_app,erp_runtime,erp_calculator;
GRANT EXECUTE ON FUNCTION erp_automation_reads.migrated_batch_sale_rate(uuid,uuid,uuid,date) TO erp_runtime;

RESET ROLE;
