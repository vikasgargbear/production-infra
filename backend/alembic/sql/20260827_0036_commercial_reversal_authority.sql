SET LOCAL ROLE erp_migration_owner;

CREATE TABLE erp_commercial_commands.reversal_scopes (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  org_id uuid NOT NULL,
  original_resource_id uuid NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id, org_id, original_resource_id)
);

ALTER TABLE erp_commercial_commands.reversal_scopes OWNER TO erp_migration_owner;
REVOKE ALL ON TABLE erp_commercial_commands.reversal_scopes
  FROM PUBLIC, erp_app, erp_runtime;

DROP INDEX finance.allocations_adjustment_note_uq;
CREATE UNIQUE INDEX allocations_adjustment_note_uq
  ON finance.allocations (org_id, adjustment_note_id)
  WHERE adjustment_note_id IS NOT NULL AND reversal_of_allocation_id IS NULL;

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
    ELSIF NEW.capability_code IN ('finance.adjustment_note.reversal.prepare','finance.customer_receipt.prepare','finance.supplier_advance.prepare','finance.supplier_payment.prepare','inventory.adjustment.prepare','inventory.destruction.prepare','inventory.transfer.prepare','procurement.goods_receipt.prepare','procurement.purchase_order.prepare','procurement.purchase_return.prepare','procurement.purchase_return.reversal.prepare','procurement.supplier_invoice.prepare','sales.dispatch.prepare','sales.invoice.prepare','sales.order.prepare','sales.return.prepare','sales.return.reversal.prepare') THEN
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

    expected_target_type := CASE NEW.capability_code WHEN 'sales.order.prepare' THEN 'sales_order' WHEN 'sales.dispatch.prepare' THEN 'dispatch' WHEN 'sales.invoice.prepare' THEN 'sales_invoice' WHEN 'sales.return.prepare' THEN 'sales_return' WHEN 'procurement.purchase_order.prepare' THEN 'purchase_order' WHEN 'procurement.goods_receipt.prepare' THEN 'goods_receipt' WHEN 'procurement.supplier_invoice.prepare' THEN 'supplier_invoice' WHEN 'procurement.purchase_return.prepare' THEN 'purchase_return' WHEN 'finance.customer_receipt.prepare' THEN 'payment' WHEN 'finance.supplier_payment.prepare' THEN 'payment' WHEN 'finance.supplier_advance.prepare' THEN 'payment' WHEN 'inventory.transfer.prepare' THEN 'inventory_document' WHEN 'inventory.adjustment.prepare' THEN 'inventory_document' WHEN 'inventory.destruction.prepare' THEN 'destruction' WHEN 'sales.return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note_reversal' ELSE NULL END;
    expected_operation := CASE NEW.capability_code WHEN 'sales.order.prepare' THEN 'sales.order.approve' WHEN 'sales.dispatch.prepare' THEN 'sales.dispatch.post' WHEN 'sales.invoice.prepare' THEN 'sales.invoice.post' WHEN 'sales.return.prepare' THEN 'sales.return.post' WHEN 'procurement.purchase_order.prepare' THEN 'procurement.purchase_order.approve' WHEN 'procurement.goods_receipt.prepare' THEN 'procurement.receipt.post' WHEN 'procurement.supplier_invoice.prepare' THEN 'procurement.supplier_invoice.post' WHEN 'procurement.purchase_return.prepare' THEN 'procurement.purchase_return.post' WHEN 'finance.customer_receipt.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_payment.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_advance.prepare' THEN 'finance.supplier_advance.post' WHEN 'inventory.transfer.prepare' THEN 'inventory.document.post' WHEN 'inventory.adjustment.prepare' THEN 'inventory.document.post' WHEN 'inventory.destruction.prepare' THEN 'compliance.destruction.post' WHEN 'sales.return.reversal.prepare' THEN 'sales.return.reversal.post' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'procurement.purchase_return.reversal.post' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'finance.adjustment_note.reversal.post' ELSE NULL END;
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
             'sales.return.prepare','procurement.purchase_return.prepare'
           ) AND
           NULLIF(preview_document->>'calculation_artifact_id','')::uuid IS NULL)
       OR (NEW.capability_code IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare'
           ) AND
           NEW.aggregate_version_hash IS DISTINCT FROM "erp_automation_commands"."aggregate_version_hash"(
               NEW.target_resource_type,NEW.target_resource_id,NEW.target_row_version
           ))
       OR (NEW.capability_code NOT IN (
             'sales.order.prepare','procurement.purchase_order.prepare',
             'sales.invoice.prepare','procurement.supplier_invoice.prepare',
             'sales.return.prepare','procurement.purchase_return.prepare'
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

ALTER FUNCTION "erp_automation_commands"."guard_command_request_match"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."guard_command_request_match"() FROM PUBLIC, "erp_app", "erp_runtime";

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
    target_type text := CASE capability_name WHEN 'sales.order.prepare' THEN 'sales_order' WHEN 'sales.dispatch.prepare' THEN 'dispatch' WHEN 'sales.invoice.prepare' THEN 'sales_invoice' WHEN 'sales.return.prepare' THEN 'sales_return' WHEN 'procurement.purchase_order.prepare' THEN 'purchase_order' WHEN 'procurement.goods_receipt.prepare' THEN 'goods_receipt' WHEN 'procurement.supplier_invoice.prepare' THEN 'supplier_invoice' WHEN 'procurement.purchase_return.prepare' THEN 'purchase_return' WHEN 'finance.customer_receipt.prepare' THEN 'payment' WHEN 'finance.supplier_payment.prepare' THEN 'payment' WHEN 'finance.supplier_advance.prepare' THEN 'payment' WHEN 'inventory.transfer.prepare' THEN 'inventory_document' WHEN 'inventory.adjustment.prepare' THEN 'inventory_document' WHEN 'inventory.destruction.prepare' THEN 'destruction' WHEN 'sales.return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note_reversal' ELSE NULL END;
    operation_name text := CASE capability_name WHEN 'sales.order.prepare' THEN 'sales.order.approve' WHEN 'sales.dispatch.prepare' THEN 'sales.dispatch.post' WHEN 'sales.invoice.prepare' THEN 'sales.invoice.post' WHEN 'sales.return.prepare' THEN 'sales.return.post' WHEN 'procurement.purchase_order.prepare' THEN 'procurement.purchase_order.approve' WHEN 'procurement.goods_receipt.prepare' THEN 'procurement.receipt.post' WHEN 'procurement.supplier_invoice.prepare' THEN 'procurement.supplier_invoice.post' WHEN 'procurement.purchase_return.prepare' THEN 'procurement.purchase_return.post' WHEN 'finance.customer_receipt.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_payment.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_advance.prepare' THEN 'finance.supplier_advance.post' WHEN 'inventory.transfer.prepare' THEN 'inventory.document.post' WHEN 'inventory.adjustment.prepare' THEN 'inventory.document.post' WHEN 'inventory.destruction.prepare' THEN 'compliance.destruction.post' WHEN 'sales.return.reversal.prepare' THEN 'sales.return.reversal.post' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'procurement.purchase_return.reversal.post' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'finance.adjustment_note.reversal.post' ELSE NULL END;
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

ALTER FUNCTION "erp_automation_commands"."prepare_operator_command"(organization_id uuid, command_id uuid, grant_id uuid, capability_name varchar, source_branch_id uuid, destination_branch_id uuid, target_id uuid, requested_amount numeric, currency_code char(3), key_hash bytea, request_bytes bytea, preview_bytes bytea, calculation_hash bytea, aggregate_hash bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."prepare_operator_command"(organization_id uuid, command_id uuid, grant_id uuid, capability_name varchar, source_branch_id uuid, destination_branch_id uuid, target_id uuid, requested_amount numeric, currency_code char(3), key_hash bytea, request_bytes bytea, preview_bytes bytea, calculation_hash bytea, aggregate_hash bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."reversal_scope_active"(organization_id uuid, original_resource_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN EXISTS(SELECT 1 FROM "erp_commercial_commands"."reversal_scopes" scope
    WHERE scope.backend_pid=pg_catalog.pg_backend_pid() AND scope.transaction_id=pg_catalog.txid_current()
      AND scope.org_id=organization_id AND scope.original_resource_id=original_resource_id);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."reversal_scope_active"(uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."reversal_scope_active"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."resolve_commercial_reversal_prepare"(organization_id uuid, reversal_kind text, original_resource_id uuid, expected_row_version bigint, reversal_date date, reason text, amendment_evidence_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE note finance.adjustment_notes%ROWTYPE; source_version bigint; branch_id uuid;
        tax_document tax.documents%ROWTYPE; reported_count bigint; inventory_document_id uuid;
BEGIN
  IF organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR reversal_kind NOT IN ('sales_return','purchase_return','adjustment_note')
     OR reason IS NULL OR pg_catalog.btrim(reason)='' OR reversal_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial reversal prepare context is invalid'; END IF;
  IF reversal_kind='sales_return' THEN
    SELECT row_version,branch_id INTO STRICT source_version,branch_id FROM sales.returns
     WHERE org_id=organization_id AND id=original_resource_id AND status='posted' FOR UPDATE;
    SELECT * INTO STRICT note FROM finance.adjustment_notes
     WHERE org_id=organization_id AND sales_return_id=original_resource_id AND status='posted' FOR SHARE;
    SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
     WHERE org_id=organization_id AND sales_return_id=original_resource_id
       AND document_type='sales_return_receipt' AND status='posted' FOR SHARE;
  ELSIF reversal_kind='purchase_return' THEN
    SELECT row_version,branch_id INTO STRICT source_version,branch_id FROM procurement.purchase_returns
     WHERE org_id=organization_id AND id=original_resource_id AND status='posted' FOR UPDATE;
    SELECT * INTO STRICT note FROM finance.adjustment_notes
     WHERE org_id=organization_id AND purchase_return_id=original_resource_id AND status='posted' FOR SHARE;
    SELECT id INTO STRICT inventory_document_id FROM inventory.inventory_documents
     WHERE org_id=organization_id AND purchase_return_id=original_resource_id
       AND document_type='purchase_return_issue' AND status='posted' FOR SHARE;
  ELSE
    SELECT * INTO STRICT note FROM finance.adjustment_notes
     WHERE org_id=organization_id AND id=original_resource_id AND status='posted'
       AND sales_return_id IS NULL AND purchase_return_id IS NULL FOR UPDATE;
    source_version:=note.row_version;
    SELECT coalesce(invoice.branch_id,supplier.branch_id) INTO STRICT branch_id
      FROM finance.adjustment_notes source
      LEFT JOIN sales.invoices invoice ON invoice.org_id=source.org_id AND invoice.id=source.sales_invoice_id
      LEFT JOIN procurement.supplier_invoices supplier ON supplier.org_id=source.org_id AND supplier.id=source.supplier_invoice_id
     WHERE source.org_id=organization_id AND source.id=note.id;
  END IF;
  IF source_version IS DISTINCT FROM expected_row_version OR reversal_date<note.note_date
     OR EXISTS(SELECT 1 FROM finance.adjustment_notes reversal
       WHERE reversal.org_id=organization_id AND reversal.reversal_of_adjustment_note_id=note.id) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='posted commercial source changed or was already reversed'; END IF;
  IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.adjustment_note.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial reversal branch permission denied'; END IF;
  SELECT * INTO tax_document FROM tax.documents
   WHERE org_id=organization_id AND adjustment_note_id=note.id FOR SHARE;
  SELECT count(*) INTO reported_count FROM tax.return_documents membership
   WHERE membership.org_id=organization_id AND membership.tax_document_id=tax_document.id;
  IF reported_count>0 THEN
    PERFORM 1 FROM core.attachments evidence WHERE evidence.org_id=organization_id
      AND evidence.id=amendment_evidence_attachment_id
      AND evidence.evidence_kind='statutory_amendment_or_counter_note'
      AND evidence.status IN ('verified','retained') AND evidence.verified_at IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reported return or note requires explicit verified amendment or counter-note evidence'; END IF;
  ELSIF amendment_evidence_attachment_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='unreported return or note must use direct counter-document reversal without amendment evidence';
  END IF;
  IF EXISTS(SELECT 1 FROM finance.open_items residual
      WHERE residual.org_id=organization_id
        AND residual.accounting_event_id=(SELECT event.id FROM finance.accounting_events event
          WHERE event.org_id=organization_id AND event.adjustment_note_id=note.id)
        AND EXISTS(SELECT 1 FROM finance.allocations allocation WHERE allocation.org_id=organization_id
          AND (allocation.source_open_item_id=residual.id OR allocation.open_item_id=residual.id)
          AND allocation.status='posted' AND NOT EXISTS(SELECT 1 FROM finance.allocations reversal
            WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id))) THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='commercial reversal is blocked because residual credit or debit was consumed'; END IF;
  RETURN pg_catalog.jsonb_build_object('reversal_kind',reversal_kind,'original_resource_id',original_resource_id,
    'original_adjustment_note_id',note.id,'expected_row_version',source_version,'branch_id',branch_id,
    'inventory_document_id',inventory_document_id,'original_tax_document_id',tax_document.id,
    'counterparty_payable_amount',note.counterparty_payable_amount,
    'reported_return_membership_count',reported_count,'reversal_date',reversal_date,'reason',reason,
    'amendment_evidence_attachment_id',amendment_evidence_attachment_id,
    'source_versions',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('resource_type',reversal_kind,'id',original_resource_id,'row_version',source_version),
      pg_catalog.jsonb_build_object('resource_type','adjustment_note','id',note.id,'row_version',note.row_version)),
    'legal_scope',pg_catalog.jsonb_build_object('correction_kind','compensating_counter_document',
      'reported',reported_count>0,'deletion',false,'requires_exact_stock_lineage',reversal_kind<>'adjustment_note'));
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."resolve_commercial_reversal_prepare"(uuid,text,uuid,bigint,date,text,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."resolve_commercial_reversal_prepare"(uuid,text,uuid,bigint,date,text,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."prepare_sales_return_reversal"(organization_id uuid, original_resource_id uuid, expected_row_version bigint, reversal_date date, reason text, amendment_evidence_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN erp_commercial_commands.resolve_commercial_reversal_prepare(
    organization_id,'sales_return',original_resource_id,expected_row_version,reversal_date,reason,amendment_evidence_attachment_id);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."prepare_sales_return_reversal"(uuid,uuid,bigint,date,text,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."prepare_sales_return_reversal"(uuid,uuid,bigint,date,text,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."prepare_purchase_return_reversal"(organization_id uuid, original_resource_id uuid, expected_row_version bigint, reversal_date date, reason text, amendment_evidence_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN erp_commercial_commands.resolve_commercial_reversal_prepare(
    organization_id,'purchase_return',original_resource_id,expected_row_version,reversal_date,reason,amendment_evidence_attachment_id);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."prepare_purchase_return_reversal"(uuid,uuid,bigint,date,text,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."prepare_purchase_return_reversal"(uuid,uuid,bigint,date,text,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."prepare_adjustment_note_reversal"(organization_id uuid, original_resource_id uuid, expected_row_version bigint, reversal_date date, reason text, amendment_evidence_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN erp_commercial_commands.resolve_commercial_reversal_prepare(
    organization_id,'adjustment_note',original_resource_id,expected_row_version,reversal_date,reason,amendment_evidence_attachment_id);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."prepare_adjustment_note_reversal"(uuid,uuid,bigint,date,text,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."prepare_adjustment_note_reversal"(uuid,uuid,bigint,date,text,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."persist_commercial_reversal_prepare"(organization_id uuid, reversal_kind text, original_resource_id uuid, reversal_adjustment_note_id uuid, command_request_id uuid, grant_id uuid, key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
        resolved_document jsonb:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
        preview_document jsonb:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
        current_resolution jsonb; capability_name text; persisted_id uuid;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR reversal_kind NOT IN ('sales_return','purchase_return','adjustment_note')
     OR request_document->>'original_resource_id' IS DISTINCT FROM original_resource_id::text
     OR request_document->>'reversal_adjustment_note_id' IS DISTINCT FROM reversal_adjustment_note_id::text THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial reversal persistence boundary is invalid'; END IF;
  current_resolution:=erp_commercial_commands.resolve_commercial_reversal_prepare(organization_id,reversal_kind,
    original_resource_id,(request_document->>'expected_row_version')::bigint,
    (request_document->>'reversal_date')::date,request_document->>'reason',
    NULLIF(request_document->>'amendment_evidence_attachment_id','')::uuid);
  capability_name:=CASE reversal_kind WHEN 'sales_return' THEN 'sales.return.reversal.prepare'
    WHEN 'purchase_return' THEN 'procurement.purchase_return.reversal.prepare'
    ELSE 'finance.adjustment_note.reversal.prepare' END;
  IF current_resolution IS DISTINCT FROM resolved_document
     OR preview_document->>'capability_code' IS DISTINCT FROM capability_name
     OR preview_document->>'target_resource_id' IS DISTINCT FROM reversal_adjustment_note_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='commercial reversal resolution or immutable preview changed'; END IF;
  PERFORM pg_catalog.set_config('app.request_id',command_request_id::text,true);
  persisted_id:=erp_automation_commands.prepare_operator_command(organization_id,command_request_id,grant_id,
    capability_name,(resolved_document->>'branch_id')::uuid,NULL,reversal_adjustment_note_id,
    (resolved_document->>'counterparty_payable_amount')::numeric,'INR',key_hash,request_bytes,preview_bytes,NULL,
    extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256'),expires_at);
  RETURN pg_catalog.jsonb_build_object('command_request_id',persisted_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),
    'replayed',persisted_id IS DISTINCT FROM command_request_id);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."persist_commercial_reversal_prepare"(uuid,text,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."persist_commercial_reversal_prepare"(uuid,text,uuid,uuid,uuid,uuid,bytea,bytea,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_commercial_reversal"(organization_id uuid, reversal_kind text, original_resource_id uuid, expected_row_version bigint, reversal_adjustment_note_id uuid, reversal_note_number varchar, reversal_inventory_document_id uuid, reversal_inventory_document_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reversal_tax_document_id uuid, reversal_date date, reason text, amendment_evidence_attachment_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE preview jsonb; note finance.adjustment_notes%ROWTYPE; original_event finance.accounting_events%ROWTYPE;
        original_journal finance.journal_entries%ROWTYPE; original_inventory inventory.inventory_documents%ROWTYPE;
        original_tax tax.documents%ROWTYPE; claim_id uuid; replay_id uuid; actor uuid:=erp_security.current_membership_id();
        posted_time timestamptz:=pg_catalog.transaction_timestamp(); allocation record; residual record;
BEGIN
  preview:=erp_commercial_commands.resolve_commercial_reversal_prepare(organization_id,reversal_kind,
    original_resource_id,expected_row_version,reversal_date,reason,amendment_evidence_attachment_id);
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
    organization_id,actor,reversal_kind||'.reversal.post',key_hash,request_hash,expires_at);
  IF replay_id IS NOT NULL THEN
    IF replay_id IS DISTINCT FROM reversal_adjustment_note_id THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='commercial reversal replay differs'; END IF;
    RETURN replay_id;
  END IF;
  SELECT * INTO STRICT note FROM finance.adjustment_notes
   WHERE org_id=organization_id AND id=(preview->>'original_adjustment_note_id')::uuid FOR UPDATE;
  SELECT event.* INTO STRICT original_event FROM finance.accounting_events event
   WHERE event.org_id=organization_id AND event.adjustment_note_id=note.id FOR SHARE;
  SELECT * INTO STRICT original_journal FROM finance.journal_entries
   WHERE org_id=organization_id AND id=original_event.journal_entry_id AND status='posted' FOR UPDATE;
  INSERT INTO erp_commercial_commands.reversal_scopes
  SELECT pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),organization_id,scope_id
    FROM (VALUES(original_resource_id),(note.id)) scope(scope_id) ON CONFLICT DO NOTHING;
  INSERT INTO finance.adjustment_notes
  SELECT (pg_catalog.jsonb_populate_record(NULL::finance.adjustment_notes,
    pg_catalog.to_jsonb(note)||pg_catalog.jsonb_build_object(
      'id',reversal_adjustment_note_id,'note_number',reversal_note_number,'note_date',reversal_date,
      'direction',CASE note.direction WHEN 'credit' THEN 'debit' ELSE 'credit' END,
      'sales_return_id',NULL,'purchase_return_id',NULL,'document_effect','increase',
      'reason','Reversal: '||reason,'reversal_of_adjustment_note_id',note.id,'status','approved',
      'approved_at',posted_time,'approved_by_membership_id',actor,'posted_at',NULL,'posted_by_membership_id',NULL,
      'created_at',posted_time,'created_by_membership_id',actor,'updated_at',posted_time,
      'updated_by_membership_id',actor,'row_version',1))).*;
  INSERT INTO finance.adjustment_note_lines
  SELECT (pg_catalog.jsonb_populate_record(NULL::finance.adjustment_note_lines,
    pg_catalog.to_jsonb(line)||pg_catalog.jsonb_build_object('id',pg_catalog.gen_random_uuid(),
      'adjustment_note_id',reversal_adjustment_note_id,'created_at',posted_time,'created_by_membership_id',actor))).*
    FROM finance.adjustment_note_lines line WHERE line.org_id=organization_id AND line.adjustment_note_id=note.id;
  INSERT INTO finance.journal_entries
  SELECT (pg_catalog.jsonb_populate_record(NULL::finance.journal_entries,
    pg_catalog.to_jsonb(original_journal)||pg_catalog.jsonb_build_object('id',reversal_journal_id,
      'journal_number',reversal_journal_number,'posting_date',reversal_date,'description','Commercial reversal: '||reason,
      'transaction_debit_total',original_journal.transaction_credit_total,
      'transaction_credit_total',original_journal.transaction_debit_total,
      'functional_debit_total',original_journal.functional_credit_total,
      'functional_credit_total',original_journal.functional_debit_total,
      'reversal_of_journal_entry_id',original_journal.id,'reversal_reason',reason,'status','draft',
      'posted_at',NULL,'posted_by_membership_id',NULL,'created_at',posted_time,'created_by_membership_id',actor,
      'updated_at',posted_time,'updated_by_membership_id',actor,'row_version',1))).*;
  INSERT INTO finance.journal_lines
  SELECT (pg_catalog.jsonb_populate_record(NULL::finance.journal_lines,
    pg_catalog.to_jsonb(line)||pg_catalog.jsonb_build_object('id',pg_catalog.gen_random_uuid(),
      'journal_entry_id',reversal_journal_id,'transaction_debit',line.transaction_credit,
      'transaction_credit',line.transaction_debit,'functional_debit',line.functional_credit,
      'functional_credit',line.functional_debit,'created_at',posted_time,'created_by_membership_id',actor))).*
    FROM finance.journal_lines line WHERE line.org_id=organization_id AND line.journal_entry_id=original_journal.id;
  IF reversal_kind<>'adjustment_note' THEN
    SELECT * INTO STRICT original_inventory FROM inventory.inventory_documents
     WHERE org_id=organization_id AND id=(preview->>'inventory_document_id')::uuid AND status='posted' FOR UPDATE;
    INSERT INTO inventory.inventory_documents
    SELECT (pg_catalog.jsonb_populate_record(NULL::inventory.inventory_documents,
      pg_catalog.to_jsonb(original_inventory)||pg_catalog.jsonb_build_object('id',reversal_inventory_document_id,
        'document_type','reversal','document_number',reversal_inventory_document_number,'document_date',reversal_date,
        'status','approved','sales_return_id',NULL,'purchase_return_id',NULL,'reverses_document_id',original_inventory.id,
        'approved_at',posted_time,'approved_by_membership_id',actor,'posted_at',NULL,'posted_by_membership_id',NULL,
        'created_at',posted_time,'created_by_membership_id',actor,'updated_at',posted_time,
        'updated_by_membership_id',actor,'row_version',1))).*;
    INSERT INTO inventory.inventory_document_lines
    SELECT (pg_catalog.jsonb_populate_record(NULL::inventory.inventory_document_lines,
      pg_catalog.to_jsonb(line)||pg_catalog.jsonb_build_object('id',pg_catalog.gen_random_uuid(),
        'inventory_document_id',reversal_inventory_document_id,'created_at',posted_time,
        'created_by_membership_id',actor))).*
      FROM inventory.inventory_document_lines line
     WHERE line.org_id=organization_id AND line.inventory_document_id=original_inventory.id;
    PERFORM erp_trade_commands.post_locked_document(organization_id,reversal_inventory_document_id,actor,posted_time);
  ELSIF reversal_inventory_document_id IS NOT NULL OR reversal_inventory_document_number IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='standalone note reversal cannot create inventory evidence';
  END IF;
  SELECT * INTO original_tax FROM tax.documents WHERE org_id=organization_id AND adjustment_note_id=note.id FOR SHARE;
  IF original_tax.id IS NOT NULL THEN
    IF reversal_tax_document_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='statutory reversal requires counter tax-document identity'; END IF;
    INSERT INTO tax.documents
    SELECT (pg_catalog.jsonb_populate_record(NULL::tax.documents,
      pg_catalog.to_jsonb(original_tax)||pg_catalog.jsonb_build_object('id',reversal_tax_document_id,
        'adjustment_note_id',reversal_adjustment_note_id,'document_number',reversal_note_number,
        'document_date',reversal_date,'document_effect','increase','adjusts_tax_document_id',original_tax.id,
        'source_hash',extensions.digest(pg_catalog.convert_to(note.id::text||':'||reason,'UTF8'),'sha256'),
        'posted_at',posted_time,'created_at',posted_time,'created_by_membership_id',actor))).*;
  ELSIF reversal_tax_document_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='commercial-only reversal cannot create tax evidence';
  END IF;
  UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
    updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
   WHERE org_id=organization_id AND id=reversal_journal_id AND status='draft';
  UPDATE finance.adjustment_notes SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
    updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
   WHERE org_id=organization_id AND id=reversal_adjustment_note_id AND status='approved';
  INSERT INTO finance.accounting_events(org_id,id,event_type,adjustment_note_id,journal_entry_id,
    occurred_at,source_posted_at,created_by_membership_id)
  VALUES(organization_id,reversal_event_id,'adjustment_note',reversal_adjustment_note_id,reversal_journal_id,
    posted_time,posted_time,actor);
  FOR allocation IN SELECT original.* FROM finance.allocations original
    WHERE original.org_id=organization_id AND original.adjustment_note_id=note.id
      AND original.status='posted' AND original.reversal_of_allocation_id IS NULL FOR UPDATE LOOP
    INSERT INTO finance.allocations
    SELECT (pg_catalog.jsonb_populate_record(NULL::finance.allocations,
      pg_catalog.to_jsonb(allocation)||pg_catalog.jsonb_build_object('id',pg_catalog.gen_random_uuid(),
        'reversal_of_allocation_id',allocation.id,'reversal_reason',reason,'status','reversed',
        'reversed_at',posted_time,'reversed_by_membership_id',actor,'created_at',posted_time,
        'created_by_membership_id',actor))).*;
    PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,allocation.open_item_id);
  END LOOP;
  FOR residual IN SELECT item.* FROM finance.open_items item
    WHERE item.org_id=organization_id AND item.accounting_event_id=original_event.id FOR UPDATE LOOP
    IF EXISTS(SELECT 1 FROM finance.allocations active WHERE active.org_id=organization_id
       AND (active.source_open_item_id=residual.id OR active.open_item_id=residual.id)
       AND active.status='posted' AND NOT EXISTS(SELECT 1 FROM finance.allocations reversed
         WHERE reversed.org_id=active.org_id AND reversed.reversal_of_allocation_id=active.id)) THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='commercial reversal residual was consumed'; END IF;
  END LOOP;
  PERFORM erp_finance_commands.mark_journal_reversed(organization_id,original_journal.id,reversal_journal_id);
  UPDATE finance.open_items SET status='reversed',reversed_at=posted_time
   WHERE org_id=organization_id AND accounting_event_id=original_event.id AND status='open';
  UPDATE finance.adjustment_notes SET status='reversed',updated_at=posted_time,
    updated_by_membership_id=actor,row_version=row_version+1 WHERE org_id=organization_id AND id=note.id AND status='posted';
  IF reversal_kind='sales_return' THEN
    UPDATE sales.returns SET status='reversed',updated_at=posted_time,updated_by_membership_id=actor,
      row_version=row_version+1 WHERE org_id=organization_id AND id=original_resource_id AND status='posted';
  ELSIF reversal_kind='purchase_return' THEN
    UPDATE procurement.purchase_returns SET status='reversed',updated_at=posted_time,updated_by_membership_id=actor,
      row_version=row_version+1 WHERE org_id=organization_id AND id=original_resource_id AND status='posted';
  END IF;
  DELETE FROM erp_commercial_commands.reversal_scopes scope WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
    AND scope.transaction_id=pg_catalog.txid_current() AND scope.org_id=organization_id
    AND scope.original_resource_id IN (original_resource_id,note.id);
  PERFORM erp_trade_commands.finish_claim(organization_id,claim_id,'finance.adjustment_notes',reversal_adjustment_note_id);
  RETURN reversal_adjustment_note_id;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_commercial_reversal"(uuid,text,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_commercial_reversal"(uuid,text,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_sales_return_reversal"(organization_id uuid, original_resource_id uuid, expected_row_version bigint, reversal_adjustment_note_id uuid, reversal_note_number varchar, reversal_inventory_document_id uuid, reversal_inventory_document_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reversal_tax_document_id uuid, reversal_date date, reason text, amendment_evidence_attachment_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN erp_commercial_commands.post_commercial_reversal(organization_id,'sales_return',original_resource_id,
    expected_row_version,reversal_adjustment_note_id,reversal_note_number,reversal_inventory_document_id,
    reversal_inventory_document_number,reversal_journal_id,reversal_journal_number,reversal_event_id,
    reversal_tax_document_id,reversal_date,reason,amendment_evidence_attachment_id,key_hash,request_hash,expires_at);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_sales_return_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_sales_return_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_purchase_return_reversal"(organization_id uuid, original_resource_id uuid, expected_row_version bigint, reversal_adjustment_note_id uuid, reversal_note_number varchar, reversal_inventory_document_id uuid, reversal_inventory_document_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reversal_tax_document_id uuid, reversal_date date, reason text, amendment_evidence_attachment_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN erp_commercial_commands.post_commercial_reversal(organization_id,'purchase_return',original_resource_id,
    expected_row_version,reversal_adjustment_note_id,reversal_note_number,reversal_inventory_document_id,
    reversal_inventory_document_number,reversal_journal_id,reversal_journal_number,reversal_event_id,
    reversal_tax_document_id,reversal_date,reason,amendment_evidence_attachment_id,key_hash,request_hash,expires_at);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_purchase_return_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_purchase_return_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."post_adjustment_note_reversal"(organization_id uuid, original_resource_id uuid, expected_row_version bigint, reversal_adjustment_note_id uuid, reversal_note_number varchar, reversal_inventory_document_id uuid, reversal_inventory_document_number varchar, reversal_journal_id uuid, reversal_journal_number varchar, reversal_event_id uuid, reversal_tax_document_id uuid, reversal_date date, reason text, amendment_evidence_attachment_id uuid, key_hash bytea, request_hash bytea, expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN erp_commercial_commands.post_commercial_reversal(organization_id,'adjustment_note',original_resource_id,
    expected_row_version,reversal_adjustment_note_id,reversal_note_number,reversal_inventory_document_id,
    reversal_inventory_document_number,reversal_journal_id,reversal_journal_number,reversal_event_id,
    reversal_tax_document_id,reversal_date,reason,amendment_evidence_attachment_id,key_hash,request_hash,expires_at);
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."post_adjustment_note_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."post_adjustment_note_reversal"(uuid,uuid,bigint,uuid,varchar,uuid,varchar,uuid,varchar,uuid,uuid,date,text,uuid,bytea,bytea,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."execute_approved_commercial_reversal"(organization_id uuid, command_request_id uuid)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE command automation.command_requests%ROWTYPE; request_document jsonb; actor uuid:=erp_security.current_membership_id();
        approval_count bigint; reversal_kind text; fiscal_year integer; note_sequence uuid; journal_sequence uuid;
        inventory_sequence uuid; note_number text; journal_number text; inventory_number text; result_id uuid;
        response_document jsonb; response_body bytea;
BEGIN
  IF organization_id IS DISTINCT FROM erp_security.current_org_id()
     OR NULLIF(pg_catalog.current_setting('app.command_request_id',true),'')::uuid IS DISTINCT FROM command_request_id
     OR actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='commercial reversal execute context is invalid'; END IF;
  SELECT * INTO STRICT command FROM automation.command_requests
   WHERE org_id=organization_id AND id=command_request_id FOR UPDATE;
  IF command.status='succeeded' THEN RETURN command.response_bytes; END IF;
  IF command.status<>'approved' OR command.requested_by_membership_id IS DISTINCT FROM actor
     OR command.expires_at<=pg_catalog.transaction_timestamp()
     OR command.request_hash IS DISTINCT FROM extensions.digest(command.request_bytes,'sha256')
     OR command.preview_hash IS DISTINCT FROM extensions.digest(command.preview_bytes,'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='commercial reversal command is not exactly executable'; END IF;
  SELECT count(*) INTO approval_count FROM automation.command_approvals approval
   WHERE approval.org_id=organization_id AND approval.command_request_id=command.id
     AND approval.decision='approved' AND approval.preview_hash=command.preview_hash
     AND approval.aggregate_version_hash=command.aggregate_version_hash
     AND approval.valid_until_at>pg_catalog.transaction_timestamp()
     AND approval.approver_membership_id<>command.requested_by_membership_id;
  IF approval_count<1 THEN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='commercial reversal lacks independent immutable approval'; END IF;
  request_document:=pg_catalog.convert_from(command.request_bytes,'UTF8')::jsonb;
  reversal_kind:=CASE command.capability_code WHEN 'sales.return.reversal.prepare' THEN 'sales_return'
    WHEN 'procurement.purchase_return.reversal.prepare' THEN 'purchase_return'
    WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note' ELSE NULL END;
  IF reversal_kind IS NULL THEN RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='command is not a typed commercial reversal'; END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(request_document->>'reversal_date')::date)>=4
    THEN pg_catalog.date_part('year',(request_document->>'reversal_date')::date)::integer
    ELSE pg_catalog.date_part('year',(request_document->>'reversal_date')::date)::integer-1 END;
  SELECT id INTO STRICT note_sequence FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=command.branch_id AND document_type='adjustment_note'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=command.branch_id AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  note_number:=erp_core_commands.allocate_document_number(organization_id,note_sequence,
    extensions.digest(command.idempotency_key_hash||pg_catalog.convert_to(':reversal-note','UTF8'),'sha256'),command.expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence,
    extensions.digest(command.idempotency_key_hash||pg_catalog.convert_to(':reversal-journal','UTF8'),'sha256'),command.expires_at);
  IF reversal_kind<>'adjustment_note' THEN
    SELECT id INTO STRICT inventory_sequence FROM core.document_sequences WHERE org_id=organization_id
      AND branch_id=command.branch_id AND document_type='inventory_reversal'
      AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
    inventory_number:=erp_core_commands.allocate_document_number(organization_id,inventory_sequence,
      extensions.digest(command.idempotency_key_hash||pg_catalog.convert_to(':inventory-reversal','UTF8'),'sha256'),command.expires_at);
  END IF;
  IF reversal_kind='sales_return' THEN
    result_id:=erp_commercial_commands.post_sales_return_reversal(organization_id,
      (request_document->>'original_resource_id')::uuid,(request_document->>'expected_row_version')::bigint,
      command.target_resource_id,note_number,(request_document->>'reversal_inventory_document_id')::uuid,inventory_number,
      (request_document->>'reversal_journal_id')::uuid,journal_number,(request_document->>'reversal_event_id')::uuid,
      NULLIF(request_document->>'reversal_tax_document_id','')::uuid,(request_document->>'reversal_date')::date,
      request_document->>'reason',NULLIF(request_document->>'amendment_evidence_attachment_id','')::uuid,
      command.idempotency_key_hash,command.request_hash,command.expires_at);
  ELSIF reversal_kind='purchase_return' THEN
    result_id:=erp_commercial_commands.post_purchase_return_reversal(organization_id,
      (request_document->>'original_resource_id')::uuid,(request_document->>'expected_row_version')::bigint,
      command.target_resource_id,note_number,(request_document->>'reversal_inventory_document_id')::uuid,inventory_number,
      (request_document->>'reversal_journal_id')::uuid,journal_number,(request_document->>'reversal_event_id')::uuid,
      NULLIF(request_document->>'reversal_tax_document_id','')::uuid,(request_document->>'reversal_date')::date,
      request_document->>'reason',NULLIF(request_document->>'amendment_evidence_attachment_id','')::uuid,
      command.idempotency_key_hash,command.request_hash,command.expires_at);
  ELSE
    result_id:=erp_commercial_commands.post_adjustment_note_reversal(organization_id,
      (request_document->>'original_resource_id')::uuid,(request_document->>'expected_row_version')::bigint,
      command.target_resource_id,note_number,NULL,NULL,(request_document->>'reversal_journal_id')::uuid,journal_number,
      (request_document->>'reversal_event_id')::uuid,NULLIF(request_document->>'reversal_tax_document_id','')::uuid,
      (request_document->>'reversal_date')::date,request_document->>'reason',
      NULLIF(request_document->>'amendment_evidence_attachment_id','')::uuid,
      command.idempotency_key_hash,command.request_hash,command.expires_at);
  END IF;
  response_document:=pg_catalog.jsonb_build_object('command_request_id',command.id,'operation',command.operation,
    'resource_id',result_id,'resource_type','adjustment_note_reversal','status','succeeded');
  response_body:=pg_catalog.convert_to(response_document::text,'UTF8');
  UPDATE automation.command_requests SET status='succeeded',completed_at=pg_catalog.transaction_timestamp(),
    result_resource_type='adjustment_note_reversal',result_resource_id=result_id,response_status=200,
    response_media_type='application/vnd.aasopharma.command-result+json',response_bytes=response_body,
    response_hash=extensions.digest(response_body,'sha256'),row_version=row_version+1
   WHERE org_id=organization_id AND id=command.id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='commercial reversal finish boundary lost ownership'; END IF;
  RETURN response_body;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."execute_approved_commercial_reversal"(uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."execute_approved_commercial_reversal"(uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."guard_adjustment_note_companions"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE artifact calculation.artifacts%ROWTYPE; event_id uuid; companion_count bigint;
        allocation_total numeric(20,2); residual_total numeric(20,2); input_doc jsonb; output_doc jsonb;
BEGIN
    IF TG_OP='DELETE' THEN
      IF OLD.status IN ('posted','reversed') THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment note is retained'; END IF;
      RETURN OLD;
    END IF;
    IF NEW.status='reversed' AND OLD.status IS DISTINCT FROM 'reversed' THEN
      IF erp_commercial_commands.reversal_scope_active(NEW.org_id,NEW.id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment reversal requires a separate reviewed compensating-note command';
      END IF;
      RETURN NEW;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted or terminal adjustment evidence is immutable';
    END IF;
    IF NEW.status='posted' THEN
      IF NEW.sales_return_id IS NULL AND NEW.purchase_return_id IS NULL THEN
        IF NEW.reversal_of_adjustment_note_id IS NOT NULL THEN
          IF erp_commercial_commands.reversal_scope_active(NEW.org_id,NEW.reversal_of_adjustment_note_id) IS DISTINCT FROM true THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='linked adjustment reversal requires the reviewed compensating-note command';
          END IF;
        ELSE
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO companion_count,artifact.id FROM calculation.artifacts
         WHERE org_id=NEW.org_id AND adjustment_note_id=NEW.id AND operation='finance.adjustment_note.post' AND status='consumed';
        IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generic adjustment requires exactly one consumed typed calculation artifact'; END IF;
        SELECT * INTO STRICT artifact FROM calculation.artifacts stored WHERE stored.org_id=NEW.org_id AND stored.id=artifact.id;
        input_doc:=pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb; output_doc:=pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb;
        PERFORM erp_commercial_commands.assert_adjustment_note_artifact(NEW.org_id,NEW.id,input_doc,output_doc);
        END IF;
      END IF;
      SELECT count(*) INTO companion_count FROM tax.documents WHERE org_id=NEW.org_id AND adjustment_note_id=NEW.id AND document_class='adjustment_note';
      IF companion_count<>(CASE WHEN NEW.gst_tax_treatment='statutory' THEN 1 ELSE 0 END) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment tax-document ownership differs'; END IF;
      SELECT count(*),(pg_catalog.array_agg(event.id))[1] INTO companion_count,event_id FROM finance.accounting_events event
       JOIN finance.journal_entries journal ON journal.org_id=event.org_id AND journal.id=event.journal_entry_id AND journal.status='posted'
       WHERE event.org_id=NEW.org_id AND event.adjustment_note_id=NEW.id AND event.event_type='adjustment_note';
      IF companion_count<>1 THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted adjustment requires exactly one accounting event and journal'; END IF;
      IF NEW.sales_return_id IS NULL AND NEW.purchase_return_id IS NULL THEN
        IF NEW.reversal_of_adjustment_note_id IS NOT NULL THEN RETURN NEW; END IF;
        SELECT coalesce(sum(amount),0) INTO allocation_total FROM finance.allocations
         WHERE org_id=NEW.org_id AND adjustment_note_id=NEW.id AND status='posted';
        SELECT coalesce(sum(principal_amount),0) INTO residual_total FROM finance.open_items
         WHERE org_id=NEW.org_id AND accounting_event_id=event_id AND status<>'reversed';
        IF (NEW.document_effect='increase' AND (allocation_total<>0 OR residual_total<>NEW.counterparty_payable_amount))
           OR (NEW.document_effect='decrease' AND allocation_total+residual_total<>NEW.counterparty_payable_amount) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment allocation and residual open-item effects differ'; END IF;
      END IF;
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."guard_adjustment_note_companions"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."guard_adjustment_note_companions"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."guard_purchase_return_state"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return evidence is retained';
    END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new return must start in draft'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.status='posted' AND NEW.status='reversed' THEN
      IF erp_commercial_commands.reversal_scope_active(NEW.org_id,NEW.id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return reversal requires a reviewed compensating command for tax, finance, allocation, and inventory effects';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status IN ('posted','reversed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted or terminal return evidence is immutable';
    END IF;
    IF OLD.status<>NEW.status AND NOT ((OLD.status='draft' AND NEW.status IN ('submitted','cancelled')) OR (OLD.status='submitted' AND NEW.status IN ('approved','cancelled')) OR (OLD.status='approved' AND NEW.status IN ('posted','cancelled'))) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid return lifecycle transition';
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."guard_purchase_return_state"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."guard_purchase_return_state"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."guard_sales_return_state"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return evidence is retained';
    END IF;
    IF TG_OP='INSERT' THEN
      IF NEW.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='new return must start in draft'; END IF;
      RETURN NEW;
    END IF;
    IF OLD.status='posted' AND NEW.status='reversed' THEN
      IF erp_commercial_commands.reversal_scope_active(NEW.org_id,NEW.id) IS DISTINCT FROM true THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='return reversal requires a reviewed compensating command for tax, finance, allocation, and inventory effects';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.status IN ('posted','reversed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted or terminal return evidence is immutable';
    END IF;
    IF OLD.status<>NEW.status AND NOT ((OLD.status='draft' AND NEW.status IN ('posted','cancelled'))) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid return lifecycle transition';
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."guard_sales_return_state"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."guard_sales_return_state"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_commercial_commands"."guard_tax_document_source"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE sales_header sales.invoices%ROWTYPE; supplier_header procurement.supplier_invoices%ROWTYPE;
        note finance.adjustment_notes%ROWTYPE; original tax.documents%ROWTYPE; portal_line tax.portal_document_lines%ROWTYPE;
        expected_party uuid; expected_effective date; expected_number varchar(64); expected_date date;
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted tax documents are immutable'; END IF;
    IF NEW.sales_invoice_id IS NOT NULL THEN
      SELECT * INTO sales_header FROM sales.invoices WHERE org_id=NEW.org_id AND id=NEW.sales_invoice_id FOR SHARE;
      SELECT party_id INTO expected_party FROM parties.customer_accounts WHERE org_id=NEW.org_id AND id=sales_header.customer_account_id FOR SHARE;
      SELECT min(version.effective_from) INTO expected_effective FROM sales.invoice_lines line
       JOIN tax.tax_code_versions version ON version.id=line.tax_code_version_id
       WHERE line.org_id=NEW.org_id AND line.invoice_id=sales_header.id;
      IF sales_header.status<>'posted' OR NEW.document_class<>'sales_invoice' OR NEW.document_effect<>'original'
         OR ROW(NEW.registration_id,NEW.document_number,NEW.document_date,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,NEW.tax_liability_party,NEW.currency_code,
                NEW.net_value_amount,NEW.gst_taxable_value,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,
                NEW.self_assessed_tax_amount,NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
            IS DISTINCT FROM ROW(sales_header.seller_tax_registration_id,sales_header.invoice_number,sales_header.invoice_date,'outward',expected_party,
                sales_header.buyer_gstin_snapshot,sales_header.place_of_supply_state_code,sales_header.supply_type,sales_header.zero_rated_payment_mode,
                sales_header.tax_charge_mechanism,CASE WHEN sales_header.tax_charge_mechanism='normal' THEN 'supplier' ELSE 'recipient' END,sales_header.currency_code,sales_header.net_value_total,sales_header.gst_taxable_total,
                sales_header.cgst_total,sales_header.sgst_total,sales_header.igst_total,sales_header.cess_total,0::numeric,
                sales_header.rounding_adjustment,sales_header.grand_total,sales_header.calculation_ruleset_version,expected_effective) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales tax document differs from posted invoice'; END IF;
    ELSIF NEW.supplier_invoice_id IS NOT NULL THEN
      SELECT * INTO supplier_header FROM procurement.supplier_invoices WHERE org_id=NEW.org_id AND id=NEW.supplier_invoice_id FOR SHARE;
      SELECT party_id INTO expected_party FROM parties.supplier_accounts WHERE org_id=NEW.org_id AND id=supplier_header.supplier_account_id FOR SHARE;
      SELECT min(version.effective_from) INTO expected_effective FROM procurement.supplier_invoice_lines line
       JOIN tax.tax_code_versions version ON version.id=line.tax_code_version_id
       WHERE line.org_id=NEW.org_id AND line.supplier_invoice_id=supplier_header.id;
      IF supplier_header.status<>'posted' OR NEW.document_class<>'supplier_invoice' OR NEW.document_effect<>'original'
         OR ROW(NEW.registration_id,NEW.document_number,NEW.document_date,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,NEW.tax_liability_party,NEW.currency_code,
                NEW.net_value_amount,NEW.gst_taxable_value,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,
                NEW.self_assessed_tax_amount,NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
            IS DISTINCT FROM ROW(supplier_header.buyer_tax_registration_id,supplier_header.supplier_invoice_number,supplier_header.supplier_invoice_date,'inward',expected_party,
                supplier_header.supplier_gstin_snapshot,supplier_header.place_of_supply_state_code,supplier_header.supply_type,supplier_header.zero_rated_payment_mode,
                supplier_header.tax_charge_mechanism,CASE WHEN supplier_header.tax_charge_mechanism='normal' THEN 'supplier' ELSE 'recipient' END,supplier_header.currency_code,supplier_header.net_value_total,supplier_header.gst_taxable_total,
                supplier_header.cgst_total,supplier_header.sgst_total,supplier_header.igst_total,supplier_header.cess_total,
                supplier_header.recipient_assessed_tax_total,supplier_header.rounding_adjustment,supplier_header.grand_total,
                supplier_header.calculation_ruleset_version,expected_effective) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier tax document differs from posted invoice'; END IF;
    ELSE
      SELECT * INTO note FROM finance.adjustment_notes WHERE org_id=NEW.org_id AND id=NEW.adjustment_note_id FOR SHARE;
      SELECT * INTO original FROM tax.documents WHERE org_id=NEW.org_id AND id=NEW.adjusts_tax_document_id FOR SHARE;
      IF note.reversal_of_adjustment_note_id IS NOT NULL THEN
        IF erp_commercial_commands.reversal_scope_active(NEW.org_id,note.reversal_of_adjustment_note_id) IS DISTINCT FROM true
           OR note.status NOT IN ('approved','posted') OR note.gst_tax_treatment<>'statutory'
           OR original.adjustment_note_id IS DISTINCT FROM note.reversal_of_adjustment_note_id
           OR NEW.document_effect<>'increase' OR NEW.document_class<>'adjustment_note'
           OR ROW(NEW.registration_id,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                  NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,
                  NEW.tax_liability_party,NEW.currency_code,NEW.net_value_amount,NEW.gst_taxable_value,
                  NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,NEW.self_assessed_tax_amount,
                  NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
              IS DISTINCT FROM ROW(original.registration_id,original.direction,original.counterparty_party_id,original.counterparty_gstin,
                  original.place_of_supply_state_code,original.supply_type,original.zero_rated_payment_mode,original.tax_charge_mechanism,
                  original.tax_liability_party,original.currency_code,original.net_value_amount,original.gst_taxable_value,
                  original.cgst_amount,original.sgst_amount,original.igst_amount,original.cess_amount,original.self_assessed_tax_amount,
                  original.rounding_adjustment,original.counterparty_payable_amount,original.tax_ruleset_version,original.tax_ruleset_effective_date) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='counter tax document differs from exact reported adjustment lineage';
        END IF;
        RETURN NEW;
      END IF;
      IF note.counterparty_portal_document_line_id IS NOT NULL THEN
        SELECT * INTO STRICT portal_line FROM tax.portal_document_lines source
         WHERE source.org_id=NEW.org_id AND source.id=note.counterparty_portal_document_line_id FOR SHARE;
      END IF;
      expected_number:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_number ELSE note.note_number END;
      expected_date:=CASE WHEN portal_line.id IS NOT NULL THEN portal_line.invoice_date ELSE note.note_date END;
      IF note.status<>'posted' OR note.gst_tax_treatment<>'statutory' OR NEW.document_class<>'adjustment_note' OR NEW.document_effect<>note.document_effect
         OR original.id IS NULL OR original.document_effect<>'original'
         OR (note.side='sales' AND original.sales_invoice_id IS DISTINCT FROM note.sales_invoice_id)
         OR (note.side='purchase' AND original.supplier_invoice_id IS DISTINCT FROM note.supplier_invoice_id)
         OR ROW(NEW.registration_id,NEW.document_number,NEW.document_date,NEW.direction,NEW.counterparty_party_id,NEW.counterparty_gstin,
                NEW.place_of_supply_state_code,NEW.supply_type,NEW.zero_rated_payment_mode,NEW.tax_charge_mechanism,NEW.tax_liability_party,
                NEW.currency_code,NEW.net_value_amount,NEW.gst_taxable_value,NEW.cgst_amount,NEW.sgst_amount,NEW.igst_amount,NEW.cess_amount,
                NEW.self_assessed_tax_amount,NEW.rounding_adjustment,NEW.counterparty_payable_amount,NEW.tax_ruleset_version,NEW.tax_ruleset_effective_date)
            IS DISTINCT FROM ROW(original.registration_id,expected_number,expected_date,original.direction,note.party_id,original.counterparty_gstin,
                original.place_of_supply_state_code,original.supply_type,note.zero_rated_payment_mode,note.tax_charge_mechanism,original.tax_liability_party,
                note.currency_code,note.net_value_amount,note.gst_taxable_value,note.cgst_amount,note.sgst_amount,note.igst_amount,note.cess_amount,
                CASE WHEN note.side='purchase' AND note.tax_charge_mechanism='reverse_charge' THEN note.recipient_assessed_tax_amount ELSE 0 END,
                note.rounding_adjustment,note.counterparty_payable_amount,note.calculation_ruleset_version,original.tax_ruleset_effective_date) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment tax document differs from posted note or original context'; END IF;
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_commercial_commands"."guard_tax_document_source"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_commercial_commands"."guard_tax_document_source"() FROM PUBLIC, "erp_app", "erp_runtime";

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
            PERFORM 1 FROM finance.adjustment_notes reversal_note
             WHERE reversal_note.org_id=NEW.org_id
               AND reversal_note.reversal_of_adjustment_note_id=original.adjustment_note_id
               AND reversal_note.status='posted' FOR SHARE;
            IF NOT FOUND THEN
              RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment allocation reversal requires posted compensating-note evidence';
            END IF;
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

RESET ROLE;
