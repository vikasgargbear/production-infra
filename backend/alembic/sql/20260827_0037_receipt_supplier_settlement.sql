SET LOCAL ROLE erp_migration_owner;

ALTER TABLE finance.payments
  ADD COLUMN related_payment_id uuid,
  ADD COLUMN sales_order_id uuid,
  ADD COLUMN evidence_attachment_id uuid,
  ADD COLUMN instrument_number varchar(64),
  ADD COLUMN instrument_date date,
  ADD COLUMN drawee_bank_name varchar(256),
  ADD COLUMN account_payee_confirmed boolean;

ALTER TABLE finance.payments
  ADD CONSTRAINT payments_related_payment_fk
    FOREIGN KEY (org_id, related_payment_id) REFERENCES finance.payments (org_id, id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT payments_sales_order_fk
    FOREIGN KEY (org_id, sales_order_id) REFERENCES sales.orders (org_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT payments_evidence_attachment_fk
    FOREIGN KEY (org_id, evidence_attachment_id) REFERENCES core.attachments (org_id, id)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX payments_related_terminal_uq
  ON finance.payments (org_id, related_payment_id)
  WHERE related_payment_id IS NOT NULL AND status='posted';

ALTER TABLE finance.payments
  DROP CONSTRAINT payments_settlement_identity_ck,
  DROP CONSTRAINT payments_purpose_ck;

ALTER TABLE finance.payments
  ADD CONSTRAINT payments_settlement_identity_ck CHECK (
    (payment_method IN ('cash','cheque')
      AND payment_purpose IN ('commercial_settlement','customer_advance','cheque_bounce')
      AND bank_account_id IS NULL)
    OR (payment_method NOT IN ('cash','cheque') AND bank_account_id IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT payments_purpose_ck CHECK (
    payment_purpose IN ('commercial_settlement','customer_advance','supplier_advance',
      'withholding_deposit','cheque_clearance','cheque_bounce')
  ) NOT VALID,
  ADD CONSTRAINT payments_related_purpose_ck CHECK (
    (payment_purpose IN ('cheque_clearance','cheque_bounce') AND related_payment_id IS NOT NULL)
    OR (payment_purpose NOT IN ('cheque_clearance','cheque_bounce') AND related_payment_id IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT payments_customer_advance_order_ck CHECK (
    (payment_purpose='customer_advance' AND sales_order_id IS NOT NULL)
    OR (payment_purpose<>'customer_advance' AND sales_order_id IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT payments_instrument_evidence_ck CHECK (
    (payment_method='cheque' AND payment_purpose IN ('commercial_settlement','customer_advance')
      AND evidence_attachment_id IS NOT NULL AND instrument_number IS NOT NULL
      AND instrument_date IS NOT NULL AND drawee_bank_name IS NOT NULL
      AND account_payee_confirmed)
    OR (NOT (payment_method='cheque' AND payment_purpose IN ('commercial_settlement','customer_advance'))
      AND instrument_number IS NULL AND instrument_date IS NULL
      AND drawee_bank_name IS NULL AND account_payee_confirmed IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT payments_cash_evidence_ck CHECK (
    payment_method<>'cash' OR evidence_attachment_id IS NOT NULL
  ) NOT VALID;

CREATE OR REPLACE FUNCTION "erp_automation_commands"."assert_customer_receipt_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE; line_count integer;
BEGIN
  SELECT * INTO STRICT payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
  IF ROW(payment.payment_date,payment.direction,payment.party_id,payment.branch_id,payment.bank_account_id,
         payment.settlement_account_id,payment.payment_method,payment.payment_purpose,payment.currency_code,
         payment.amount,payment.functional_amount,payment.fx_rate,payment.external_reference,payment.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'receipt',(resolution->>'customer_party_id')::uuid,
         (resolution->>'branch_id')::uuid,(resolution->>'bank_account_id')::uuid,(resolution->>'settlement_account_id')::uuid,
         resolution->>'payment_method',CASE resolution->>'receipt_purpose' WHEN 'customer_advance' THEN 'customer_advance' ELSE 'commercial_settlement' END,
         'INR'::bpchar,(resolution->>'amount')::numeric,
         (resolution->>'amount')::numeric,1.000000::numeric,resolution->>'external_reference','approved')
     OR ROW(journal.posting_date,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,
         journal.functional_credit_total,journal.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'INR'::bpchar,'INR'::bpchar,1.000000::numeric,
         (resolution->>'amount')::numeric,(resolution->>'amount')::numeric,(resolution->>'amount')::numeric,
         (resolution->>'amount')::numeric,'draft') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt payment or journal draft changed'; END IF;
  SELECT count(*) INTO line_count FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
  IF line_count<>2 OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=1 AND account_id=(resolution->>'settlement_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id IS NULL
       AND transaction_debit=(resolution->>'amount')::numeric AND transaction_credit=0
       AND functional_debit=(resolution->>'amount')::numeric AND functional_credit=0)
     OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=2 AND account_id=(CASE WHEN resolution->>'receipt_purpose'='customer_advance'
         THEN resolution->>'customer_advance_account_id' ELSE resolution->>'accounts_receivable_account_id' END)::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id=(resolution->>'customer_party_id')::uuid
       AND transaction_debit=0 AND transaction_credit=(resolution->>'amount')::numeric
       AND functional_debit=0 AND functional_credit=(resolution->>'amount')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt exact two-line journal changed'; END IF;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."assert_customer_receipt_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."assert_customer_receipt_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."assert_supplier_payment_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE; line_count integer;
BEGIN
  SELECT * INTO STRICT payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
  SELECT * INTO STRICT journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
  IF ROW(payment.payment_date,payment.direction,payment.party_id,payment.branch_id,payment.bank_account_id,
         payment.settlement_account_id,payment.payment_method,payment.payment_purpose,payment.currency_code,
         payment.amount,payment.functional_amount,payment.fx_rate,payment.external_reference,payment.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'disbursement',(resolution->>'supplier_party_id')::uuid,
         (resolution->>'branch_id')::uuid,(resolution->>'bank_account_id')::uuid,(resolution->>'settlement_account_id')::uuid,
         resolution->>'payment_method','commercial_settlement','INR'::bpchar,(resolution->>'cash_amount')::numeric,
         (resolution->>'cash_amount')::numeric,1.000000::numeric,resolution->>'external_reference','approved')
     OR ROW(journal.posting_date,journal.transaction_currency,journal.functional_currency,journal.fx_rate,
         journal.transaction_debit_total,journal.transaction_credit_total,journal.functional_debit_total,
         journal.functional_credit_total,journal.status)
     IS DISTINCT FROM ROW((resolution->>'payment_date')::date,'INR'::bpchar,'INR'::bpchar,1.000000::numeric,
         (resolution->>'cash_amount')::numeric,(resolution->>'cash_amount')::numeric,
         (resolution->>'cash_amount')::numeric,(resolution->>'cash_amount')::numeric,'draft') THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment or journal draft changed'; END IF;
  SELECT count(*) INTO line_count FROM finance.journal_lines WHERE org_id=organization_id AND journal_entry_id=journal_id;
  IF line_count<>2 OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=1 AND account_id=(resolution->>'accounts_payable_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id=(resolution->>'supplier_party_id')::uuid
       AND transaction_debit=(resolution->>'cash_amount')::numeric AND transaction_credit=0
       AND functional_debit=(resolution->>'cash_amount')::numeric AND functional_credit=0)
     OR NOT EXISTS (SELECT 1 FROM finance.journal_lines WHERE org_id=organization_id
       AND journal_entry_id=journal_id AND line_number=2 AND account_id=(resolution->>'settlement_account_id')::uuid
       AND branch_id=(resolution->>'branch_id')::uuid AND party_id IS NULL
       AND transaction_debit=0 AND transaction_credit=(resolution->>'cash_amount')::numeric
       AND functional_debit=0 AND functional_credit=(resolution->>'cash_amount')::numeric) THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment exact two-line journal changed'; END IF;
END
$function$;

ALTER FUNCTION "erp_automation_commands"."assert_supplier_payment_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."assert_supplier_payment_draft"(organization_id uuid, payment_id uuid, journal_id uuid, resolution jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

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
        IF request_row.capability_code='finance.customer_receipt.prepare' THEN
          PERFORM erp_finance_commands.post_customer_receipt(organization_id,request_row.target_resource_id,
            (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid,
            current_resolution->'allocations',NULLIF(request_document->>'customer_advance_open_item_id','')::uuid);
        ELSE
          PERFORM erp_finance_commands.post_supplier_payment(organization_id,request_row.target_resource_id,
            (request_document->>'journal_id')::uuid,(request_document->>'event_id')::uuid,
            current_resolution->'settlement_components');
        END IF;
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
    ELSIF NEW.capability_code IN ('finance.adjustment_note.reversal.prepare','finance.customer_cheque_bounce.prepare','finance.customer_cheque_clearance.prepare','finance.customer_receipt.prepare','finance.supplier_advance.prepare','finance.supplier_payment.prepare','inventory.adjustment.prepare','inventory.destruction.prepare','inventory.transfer.prepare','procurement.goods_receipt.prepare','procurement.purchase_order.prepare','procurement.purchase_return.prepare','procurement.purchase_return.reversal.prepare','procurement.supplier_invoice.prepare','sales.dispatch.prepare','sales.invoice.prepare','sales.order.prepare','sales.return.prepare','sales.return.reversal.prepare') THEN
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

    expected_target_type := CASE NEW.capability_code WHEN 'sales.order.prepare' THEN 'sales_order' WHEN 'sales.dispatch.prepare' THEN 'dispatch' WHEN 'sales.invoice.prepare' THEN 'sales_invoice' WHEN 'sales.return.prepare' THEN 'sales_return' WHEN 'procurement.purchase_order.prepare' THEN 'purchase_order' WHEN 'procurement.goods_receipt.prepare' THEN 'goods_receipt' WHEN 'procurement.supplier_invoice.prepare' THEN 'supplier_invoice' WHEN 'procurement.purchase_return.prepare' THEN 'purchase_return' WHEN 'finance.customer_receipt.prepare' THEN 'payment' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'payment' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'payment' WHEN 'finance.supplier_payment.prepare' THEN 'payment' WHEN 'finance.supplier_advance.prepare' THEN 'payment' WHEN 'inventory.transfer.prepare' THEN 'inventory_document' WHEN 'inventory.adjustment.prepare' THEN 'inventory_document' WHEN 'inventory.destruction.prepare' THEN 'destruction' WHEN 'sales.return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note_reversal' ELSE NULL END;
    expected_operation := CASE NEW.capability_code WHEN 'sales.order.prepare' THEN 'sales.order.approve' WHEN 'sales.dispatch.prepare' THEN 'sales.dispatch.post' WHEN 'sales.invoice.prepare' THEN 'sales.invoice.post' WHEN 'sales.return.prepare' THEN 'sales.return.post' WHEN 'procurement.purchase_order.prepare' THEN 'procurement.purchase_order.approve' WHEN 'procurement.goods_receipt.prepare' THEN 'procurement.receipt.post' WHEN 'procurement.supplier_invoice.prepare' THEN 'procurement.supplier_invoice.post' WHEN 'procurement.purchase_return.prepare' THEN 'procurement.purchase_return.post' WHEN 'finance.customer_receipt.prepare' THEN 'finance.payment.post' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'finance.customer_cheque_clearance.post' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'finance.customer_cheque_bounce.post' WHEN 'finance.supplier_payment.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_advance.prepare' THEN 'finance.supplier_advance.post' WHEN 'inventory.transfer.prepare' THEN 'inventory.document.post' WHEN 'inventory.adjustment.prepare' THEN 'inventory.document.post' WHEN 'inventory.destruction.prepare' THEN 'compliance.destruction.post' WHEN 'sales.return.reversal.prepare' THEN 'sales.return.reversal.post' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'procurement.purchase_return.reversal.post' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'finance.adjustment_note.reversal.post' ELSE NULL END;
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
    target_type text := CASE capability_name WHEN 'sales.order.prepare' THEN 'sales_order' WHEN 'sales.dispatch.prepare' THEN 'dispatch' WHEN 'sales.invoice.prepare' THEN 'sales_invoice' WHEN 'sales.return.prepare' THEN 'sales_return' WHEN 'procurement.purchase_order.prepare' THEN 'purchase_order' WHEN 'procurement.goods_receipt.prepare' THEN 'goods_receipt' WHEN 'procurement.supplier_invoice.prepare' THEN 'supplier_invoice' WHEN 'procurement.purchase_return.prepare' THEN 'purchase_return' WHEN 'finance.customer_receipt.prepare' THEN 'payment' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'payment' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'payment' WHEN 'finance.supplier_payment.prepare' THEN 'payment' WHEN 'finance.supplier_advance.prepare' THEN 'payment' WHEN 'inventory.transfer.prepare' THEN 'inventory_document' WHEN 'inventory.adjustment.prepare' THEN 'inventory_document' WHEN 'inventory.destruction.prepare' THEN 'destruction' WHEN 'sales.return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'adjustment_note_reversal' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'adjustment_note_reversal' ELSE NULL END;
    operation_name text := CASE capability_name WHEN 'sales.order.prepare' THEN 'sales.order.approve' WHEN 'sales.dispatch.prepare' THEN 'sales.dispatch.post' WHEN 'sales.invoice.prepare' THEN 'sales.invoice.post' WHEN 'sales.return.prepare' THEN 'sales.return.post' WHEN 'procurement.purchase_order.prepare' THEN 'procurement.purchase_order.approve' WHEN 'procurement.goods_receipt.prepare' THEN 'procurement.receipt.post' WHEN 'procurement.supplier_invoice.prepare' THEN 'procurement.supplier_invoice.post' WHEN 'procurement.purchase_return.prepare' THEN 'procurement.purchase_return.post' WHEN 'finance.customer_receipt.prepare' THEN 'finance.payment.post' WHEN 'finance.customer_cheque_clearance.prepare' THEN 'finance.customer_cheque_clearance.post' WHEN 'finance.customer_cheque_bounce.prepare' THEN 'finance.customer_cheque_bounce.post' WHEN 'finance.supplier_payment.prepare' THEN 'finance.payment.post' WHEN 'finance.supplier_advance.prepare' THEN 'finance.supplier_advance.post' WHEN 'inventory.transfer.prepare' THEN 'inventory.document.post' WHEN 'inventory.adjustment.prepare' THEN 'inventory.document.post' WHEN 'inventory.destruction.prepare' THEN 'compliance.destruction.post' WHEN 'sales.return.reversal.prepare' THEN 'sales.return.reversal.post' WHEN 'procurement.purchase_return.reversal.prepare' THEN 'procurement.purchase_return.reversal.post' WHEN 'finance.adjustment_note.reversal.prepare' THEN 'finance.adjustment_note.reversal.post' ELSE NULL END;
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

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        payment_date date:=NULLIF(request_document->>'payment_date','')::date;
        customer_id uuid:=NULLIF(request_document->>'customer_account_id','')::uuid;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        settlement_id uuid; evidence_id uuid:=NULLIF(request_document->>'evidence_attachment_id','')::uuid;
        sales_order_id uuid:=NULLIF(request_document->>'sales_order_id','')::uuid;
        payment_amount numeric(20,2):=NULLIF(request_document->>'amount','')::numeric;
        method text:=request_document->>'payment_method'; purpose text:=request_document->>'receipt_purpose';
        reference text:=upper(NULLIF(pg_catalog.btrim(request_document->>'external_reference'),''));
        branch core.branches%ROWTYPE; customer parties.customer_accounts%ROWTYPE; party parties.parties%ROWTYPE;
        bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE; receivable finance.accounts%ROWTYPE;
        evidence core.attachments%ROWTYPE; sales_order sales.orders%ROWTYPE; cash_limit_setting core.settings%ROWTYPE;
        cash_rolling_setting core.settings%ROWTYPE; cash_days_setting core.settings%ROWTYPE;
        cash_prior numeric(20,2); customer_advance_prior numeric(20,2); customer_advance_account finance.accounts%ROWTYPE;
        requested jsonb; item finance.open_items%ROWTYPE; event finance.accounting_events%ROWTYPE; invoice sales.invoices%ROWTYPE;
        resolved_allocations jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        prior_allocated numeric(20,2); requested_total numeric(20,2):=0; allocation_count integer; duplicate_count integer;
        allocation_state_hash text;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR payment_id IS NULL OR branch_id IS NULL OR payment_date IS NULL OR customer_id IS NULL
     OR payment_amount<=0 OR method NOT IN ('cash','cheque','bank_transfer','card','upi')
     OR purpose NOT IN ('invoice_settlement','customer_advance')
     OR reference IS NULL OR pg_catalog.length(reference)>256
     OR pg_catalog.jsonb_typeof(request_document->'allocations')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'allocations') NOT BETWEEN 0 AND 500
     OR (purpose='invoice_settlement' AND pg_catalog.jsonb_array_length(request_document->'allocations')=0)
     OR (purpose='customer_advance' AND (pg_catalog.jsonb_array_length(request_document->'allocations')<>0 OR sales_order_id IS NULL))
     OR (purpose='invoice_settlement' AND sales_order_id IS NOT NULL)
     OR (method IN ('cash','cheque') AND bank_id IS NOT NULL)
     OR (method NOT IN ('cash','cheque') AND bank_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt method, purpose, and allocation identity are incomplete'; END IF;
  IF payment_date>CURRENT_DATE THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='customer receipt date cannot be in the future'; END IF;
  IF (SELECT count(DISTINCT value->>'open_item_id') FROM pg_catalog.jsonb_array_elements(request_document->'allocations'))
       <>pg_catalog.jsonb_array_length(request_document->'allocations') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt requires unique receivable allocations'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.customer_receipt.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer-receipt delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.allocate',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer-receipt verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT customer FROM parties.customer_accounts WHERE org_id=organization_id AND id=customer_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT party FROM parties.parties WHERE org_id=organization_id AND id=customer.party_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_id
    AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT receivable FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'accounts_receivable','asset','INR',true)
    AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_party_posting FOR SHARE;
  IF customer.default_receivable_account_id IS DISTINCT FROM receivable.id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer default receivable does not match canonical branch account role'; END IF;
  IF method IN ('bank_transfer','card','upi') THEN
    SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
      AND status='active' AND currency_code='INR' FOR SHARE;
    settlement_id:=bank.account_id;
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id
      AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_bank_reconciliation FOR SHARE;
  ELSIF method='cash' THEN
    settlement_id:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'cash_on_hand','asset','INR',false);
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id FOR SHARE;
    SELECT * INTO STRICT cash_limit_setting FROM core.settings WHERE org_id=organization_id AND branch_id=branch_id
      AND namespace='finance.cash_receipt_rules' AND key='max_single_amount' AND value_type='numeric'
      AND status='active' AND value_numeric>0 FOR SHARE;
    SELECT * INTO STRICT cash_rolling_setting FROM core.settings WHERE org_id=organization_id AND branch_id=branch_id
      AND namespace='finance.cash_receipt_rules' AND key='max_customer_rolling_amount' AND value_type='numeric'
      AND status='active' AND value_numeric>0 FOR SHARE;
    SELECT * INTO STRICT cash_days_setting FROM core.settings WHERE org_id=organization_id AND branch_id=branch_id
      AND namespace='finance.cash_receipt_rules' AND key='rolling_window_days' AND value_type='numeric'
      AND status='active' AND value_numeric=pg_catalog.trunc(value_numeric) AND value_numeric>0 FOR SHARE;
    SELECT coalesce(sum(existing.amount),0) INTO cash_prior FROM finance.payments existing
      WHERE existing.org_id=organization_id AND existing.party_id=party.id AND existing.branch_id=branch_id
        AND existing.payment_method='cash' AND existing.direction='receipt' AND existing.status='posted'
        AND existing.payment_date BETWEEN payment_date-cash_days_setting.value_numeric::integer+1 AND payment_date;
    IF payment_amount>cash_limit_setting.value_numeric OR cash_prior+payment_amount>cash_rolling_setting.value_numeric THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cash receipt exceeds effective canonical branch or customer aggregation rule'; END IF;
  ELSE
    IF request_document->>'instrument_number' IS NULL OR NULLIF(request_document->>'instrument_date','')::date IS NULL
       OR NULLIF(pg_catalog.btrim(request_document->>'drawee_bank_name'),'') IS NULL
       OR coalesce((request_document->>'account_payee_confirmed')::boolean,false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque receipt requires exact account-payee instrument evidence'; END IF;
    settlement_id:=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'cheques_in_hand','asset','INR',false);
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id FOR SHARE;
  END IF;
  IF purpose='customer_advance' THEN
    SELECT * INTO STRICT sales_order FROM sales.orders WHERE org_id=organization_id AND id=sales_order_id
      AND branch_id=branch_id AND customer_account_id=customer.id AND status IN ('approved','partially_fulfilled')
      AND currency_code='INR' AND tax_charge_mechanism='normal' AND supply_type IN ('intra_state','inter_state') FOR SHARE;
    IF EXISTS (SELECT 1 FROM sales.order_lines line WHERE line.org_id=organization_id AND line.order_id=sales_order.id
       AND line.line_kind<>'product') OR NOT EXISTS (SELECT 1 FROM sales.order_lines line
       WHERE line.org_id=organization_id AND line.order_id=sales_order.id AND line.line_kind='product') THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='customer advance is restricted to an approved goods-only sales order'; END IF;
    SELECT coalesce(sum(existing.amount),0) INTO customer_advance_prior FROM finance.payments existing
      WHERE existing.org_id=organization_id AND existing.sales_order_id=sales_order.id
        AND existing.payment_purpose='customer_advance' AND existing.status='posted'
        AND NOT EXISTS (SELECT 1 FROM finance.payments reversal WHERE reversal.org_id=existing.org_id
          AND reversal.reversal_of_payment_id=existing.id AND reversal.status='posted');
    IF customer_advance_prior+payment_amount>sales_order.grand_total THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer advance exceeds locked goods-order residual'; END IF;
    SELECT * INTO STRICT customer_advance_account FROM finance.accounts WHERE org_id=organization_id
      AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'customer_advance','liability','INR',true) FOR SHARE;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':customer-receipt:'||coalesce(bank.id::text,settlement.id::text)||':'||reference||':'||payment_date::text||':'||payment_amount::text,672009));
  SELECT count(*) INTO duplicate_count FROM finance.payments existing
   WHERE existing.org_id=organization_id AND existing.settlement_account_id=settlement.id
     AND upper(pg_catalog.btrim(existing.external_reference))=reference AND existing.payment_date=payment_date
     AND existing.amount=payment_amount AND existing.status<>'reversed' AND existing.id<>payment_id;
  IF duplicate_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='customer receipt bank reference, date, and amount already exist'; END IF;
  PERFORM 1 FROM finance.open_items candidate
   JOIN pg_catalog.jsonb_array_elements(request_document->'allocations') payload(value)
     ON candidate.id=(payload.value->>'open_item_id')::uuid
   WHERE candidate.org_id=organization_id ORDER BY candidate.id FOR UPDATE OF candidate;
  FOR requested IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'allocations') LOOP
    IF NULLIF(requested->>'allocation_id','')::uuid IS NULL OR NULLIF(requested->>'open_item_id','')::uuid IS NULL
       OR NULLIF(requested->>'amount','')::numeric<=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt allocation identity and positive amount are required'; END IF;
    SELECT * INTO STRICT item FROM finance.open_items WHERE org_id=organization_id
      AND id=(requested->>'open_item_id')::uuid AND item_side='receivable' AND party_id=party.id
      AND currency_code='INR' AND status='open' AND document_date<=payment_date FOR UPDATE;
    SELECT * INTO STRICT event FROM finance.accounting_events WHERE org_id=organization_id
      AND id=item.accounting_event_id AND event_type='sales_invoice' AND sales_invoice_id IS NOT NULL FOR SHARE;
    SELECT * INTO STRICT invoice FROM sales.invoices WHERE org_id=organization_id AND id=event.sales_invoice_id
      AND branch_id=branch.id AND customer_account_id=customer.id AND currency_code='INR' AND status='posted' FOR SHARE;
    PERFORM 1 FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id ORDER BY prior.id FOR SHARE;
    SELECT coalesce(sum(prior.amount),0),count(*) INTO prior_allocated,allocation_count FROM finance.allocations prior
     WHERE prior.org_id=organization_id AND prior.open_item_id=item.id AND prior.status='posted'
       AND prior.reversal_of_allocation_id IS NULL AND NOT EXISTS (
         SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=prior.org_id
           AND reversal.reversal_of_allocation_id=prior.id AND reversal.status='reversed');
    SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',prior.id,'payment_id',prior.payment_id,'withholding_id',prior.withholding_id,
          'adjustment_note_id',prior.adjustment_note_id,'purchase_order_advance_allocation_id',prior.purchase_order_advance_allocation_id,
          'amount',prior.amount::text,'status',prior.status,'reversal_of_allocation_id',prior.reversal_of_allocation_id)
        ORDER BY prior.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') INTO allocation_state_hash
      FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id;
    IF prior_allocated+(requested->>'amount')::numeric>item.principal_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt allocation exceeds live receivable balance'; END IF;
    requested_total:=requested_total+(requested->>'amount')::numeric;
    resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'allocation_id',requested->>'allocation_id','open_item_id',item.id,'invoice_id',invoice.id,
      'document_number',item.document_number,'principal_amount',item.principal_amount::text,
      'prior_allocated_amount',prior_allocated::text,'amount',(requested->>'amount')::numeric::text,
      'residual_after',(item.principal_amount-prior_allocated-(requested->>'amount')::numeric)::text));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'resource_type','receivable_allocation_state','id',item.id,'invoice_id',invoice.id,'invoice_row_version',invoice.row_version,
      'principal_amount',item.principal_amount::text,'status',item.status,'allocation_count',allocation_count,
      'active_allocated_amount',prior_allocated::text,'allocation_state_hash',allocation_state_hash));
  END LOOP;
  IF (purpose='invoice_settlement' AND requested_total<>payment_amount)
     OR (purpose='customer_advance' AND requested_total<>0) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='receipt allocations do not match the selected settlement purpose'; END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','customer_account','id',customer.id,'row_version',customer.row_version),
    pg_catalog.jsonb_build_object('resource_type','customer_party','id',party.id,'row_version',party.row_version),
    pg_catalog.jsonb_build_object('resource_type','accounts_receivable_role','id',receivable.id,'row_version',receivable.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_account','id',bank.id,'row_version',bank.row_version),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version),
    pg_catalog.jsonb_build_object('resource_type','receipt_evidence','id',evidence.id,
      'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','bank_receipt_collision','bank_account_id',bank.id,'external_reference',reference,
      'payment_date',payment_date,'amount',payment_amount::text,'candidate_count',duplicate_count))||source_versions;
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'payment_id',payment_id,'payment_date',payment_date,
    'customer_account_id',customer.id,'customer_party_id',party.id,'bank_account_id',bank.id,
    'settlement_account_id',settlement.id,'accounts_receivable_account_id',receivable.id,
    'customer_advance_account_id',customer_advance_account.id,'payment_method',method,'receipt_purpose',purpose,
    'sales_order_id',sales_order.id,'evidence_attachment_id',evidence.id,
    'instrument_number',request_document->>'instrument_number','instrument_date',request_document->>'instrument_date',
    'drawee_bank_name',request_document->>'drawee_bank_name','account_payee_confirmed',request_document->>'account_payee_confirmed',
    'external_reference',reference,'amount',payment_amount::text,'currency_code','INR','allocations',resolved_allocations,
    'legal_scope',pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','settlement',purpose,
      'supported_payment_methods',pg_catalog.jsonb_build_array('cash','cheque','bank_transfer','card','upi'),
      'cash','canonical_branch_rule_and_verified_evidence','cheque','account_payee_cheques_in_hand_until_named_terminal_action',
      'customer_deducted_tds','unavailable_seller_tds_receivable_form16a_26as_authority',
      'fx','unavailable','customer_advance','goods_order_liability_without_gst_document_or_invoice_allocation'),
    'source_versions',source_versions);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; payment_sequence_id uuid; journal_sequence_id uuid;
        payment_number text; journal_number text; fiscal_year integer; aggregate_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR payment_id IS NULL OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(payment_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32 OR pg_catalog.octet_length(request_bytes) NOT BETWEEN 2 AND 1048576
     OR pg_catalog.octet_length(resolved_bytes) NOT BETWEEN 2 AND 1048576 OR pg_catalog.octet_length(preview_bytes) NOT BETWEEN 2 AND 1048576 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt persistence envelope is invalid'; END IF;
  BEGIN request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
    preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer receipt persistence requires UTF-8 JSON'; END;
  current_resolution:="erp_automation_commands"."resolve_customer_receipt_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'payment_id' IS DISTINCT FROM payment_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text OR request_document->>'event_id' IS DISTINCT FROM event_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact'<>'[]'::jsonb OR preview_document->'tax_impact'<>'[]'::jsonb
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer receipt resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.customer_receipt.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='customer receipt idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'payment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.customer_receipt.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='customer_receipt'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    sales_order_id,evidence_attachment_id,instrument_number,instrument_date,drawee_bank_name,account_payee_confirmed,
    status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'payment_date')::date,'receipt',
    (resolved_document->>'customer_party_id')::uuid,(resolved_document->>'branch_id')::uuid,
    (resolved_document->>'bank_account_id')::uuid,(resolved_document->>'settlement_account_id')::uuid,
    resolved_document->>'payment_method',CASE resolved_document->>'receipt_purpose' WHEN 'customer_advance' THEN 'customer_advance' ELSE 'commercial_settlement' END,
    'INR',(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,1,resolved_document->>'external_reference',
    (resolved_document->>'sales_order_id')::uuid,(resolved_document->>'evidence_attachment_id')::uuid,
    resolved_document->>'instrument_number',(resolved_document->>'instrument_date')::date,
    resolved_document->>'drawee_bank_name',(resolved_document->>'account_payee_confirmed')::boolean,
    'approved',pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'payment_date')::date,
    'Customer receipt '||payment_number,'INR','INR',1,(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(resolved_document->>'settlement_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,NULL,'Customer receipt bank settlement',(resolved_document->>'amount')::numeric,0,
    (resolved_document->>'amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(CASE WHEN resolved_document->>'receipt_purpose'='customer_advance'
      THEN resolved_document->>'customer_advance_account_id' ELSE resolved_document->>'accounts_receivable_account_id' END)::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'customer_party_id')::uuid,
    CASE WHEN resolved_document->>'receipt_purpose'='customer_advance' THEN 'Customer goods advance liability' ELSE 'Customer receivable allocation' END,0,
    (resolved_document->>'amount')::numeric,0,(resolved_document->>'amount')::numeric);
  PERFORM "erp_automation_commands"."assert_customer_receipt_draft"(organization_id,payment_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        payment_date date:=NULLIF(request_document->>'payment_date','')::date;
        supplier_id uuid:=NULLIF(request_document->>'supplier_account_id','')::uuid;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        settlement_id uuid;
        gross numeric(20,2):=NULLIF(request_document->>'expected_gross_amount','')::numeric;
        method text:=request_document->>'payment_method';
        reference text:=upper(NULLIF(pg_catalog.btrim(request_document->>'external_reference'),''));
        branch core.branches%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE; party parties.parties%ROWTYPE;
        party_evidence core.attachments%ROWTYPE; bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE;
        payable finance.accounts%ROWTYPE; payment_fiscal_fact tax.organization_fiscal_tax_facts%ROWTYPE;
        payment_fiscal_evidence core.attachments%ROWTYPE; credit_fiscal_fact tax.organization_fiscal_tax_facts%ROWTYPE;
        credit_fiscal_evidence core.attachments%ROWTYPE; requested jsonb; item finance.open_items%ROWTYPE;
        event finance.accounting_events%ROWTYPE; invoice procurement.supplier_invoices%ROWTYPE;
        resolved_allocations jsonb:='[]'::jsonb; source_versions jsonb:='[]'::jsonb;
        prior_allocated numeric(20,2); requested_total numeric(20,2):=0; allocation_count integer;
        duplicate_count integer; allocation_state_hash text; applicable_advance_state_hash text; fiscal_year smallint;
BEGIN
  IF organization_id IS NULL OR membership_id IS NULL OR auth_user_id IS NULL OR application_user_id IS NULL
     OR grant_id IS NULL OR payment_id IS NULL OR branch_id IS NULL OR payment_date IS NULL OR supplier_id IS NULL
     OR bank_id IS NULL OR gross<=0 OR method NOT IN ('bank_transfer','upi')
     OR reference IS NULL OR pg_catalog.length(reference)>256
     OR pg_catalog.jsonb_typeof(request_document->'allocations')<>'array'
     OR pg_catalog.jsonb_array_length(request_document->'allocations') NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier-payment INR bank pilot input is incomplete'; END IF;
  IF payment_date>CURRENT_DATE THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='supplier payment date cannot be in the future'; END IF;
  IF (SELECT count(DISTINCT value->>'open_item_id') FROM pg_catalog.jsonb_array_elements(request_document->'allocations'))
       <>pg_catalog.jsonb_array_length(request_document->'allocations') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment requires unique payable allocations'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN core.organizations organization_row ON organization_row.id=membership.org_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND organization_row.status='active' AND organization_row.country_code='IN' AND organization_row.base_currency='INR'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code='finance.supplier_payment.prepare' AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-payment delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.allocate',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-payment verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch FROM core.branches WHERE org_id=organization_id AND id=branch_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT supplier FROM parties.supplier_accounts WHERE org_id=organization_id AND id=supplier_id AND status='active' FOR SHARE;
  SELECT * INTO STRICT party FROM parties.parties WHERE org_id=organization_id AND id=supplier.party_id AND status='active'
    AND tax_residency_status='resident' AND pan IS NOT NULL AND pan_verification_status='verified'
    AND tax_profile_verified_at IS NOT NULL AND tax_profile_verified_at<=pg_catalog.transaction_timestamp()
    AND tax_profile_evidence_attachment_id IS NOT NULL FOR SHARE;
  SELECT * INTO STRICT party_evidence FROM core.attachments WHERE org_id=organization_id
    AND id=party.tax_profile_evidence_attachment_id AND status IN ('verified','retained')
    AND verified_at IS NOT NULL AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',payment_date)>=4 THEN pg_catalog.date_part('year',payment_date)::smallint
                    ELSE (pg_catalog.date_part('year',payment_date)-1)::smallint END;
  SELECT * INTO STRICT payment_fiscal_fact FROM tax.organization_fiscal_tax_facts WHERE org_id=organization_id
    AND fiscal_year_start_year=fiscal_year AND status='active' AND payment_date BETWEEN effective_from AND effective_to
    AND prior_fiscal_year_turnover<=100000000 AND gst_tds_notified_deductor=false FOR SHARE;
  SELECT * INTO STRICT payment_fiscal_evidence FROM core.attachments WHERE org_id=organization_id
    AND id=payment_fiscal_fact.evidence_attachment_id AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT * INTO STRICT payable FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch.id,'accounts_payable','liability','INR',true)
    AND status='active' AND account_type='liability' AND currency_code='INR' AND allows_party_posting FOR SHARE;
  IF supplier.default_payable_account_id IS DISTINCT FROM payable.id THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier default payable does not match canonical branch account role'; END IF;
  SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
    AND status='active' AND currency_code='INR' FOR SHARE;
  settlement_id:=bank.account_id;
  SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=settlement_id
    AND status='active' AND account_type='asset' AND currency_code='INR'
    AND allows_bank_reconciliation FOR SHARE;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':supplier-payment-reference:'||bank.id::text||':'||reference,672011));
  SELECT count(*) INTO duplicate_count FROM finance.payments existing WHERE existing.org_id=organization_id
    AND existing.bank_account_id=bank.id AND upper(pg_catalog.btrim(existing.external_reference))=reference
    AND existing.reversal_of_payment_id IS NULL AND existing.id<>payment_id;
  IF duplicate_count<>0 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier payment bank reference was already consumed'; END IF;
  PERFORM 1 FROM finance.open_items candidate
   JOIN pg_catalog.jsonb_array_elements(request_document->'allocations') payload(value)
     ON candidate.id=(payload.value->>'open_item_id')::uuid
   WHERE candidate.org_id=organization_id ORDER BY candidate.id FOR UPDATE OF candidate;
  FOR requested IN SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'allocations') LOOP
    IF NULLIF(requested->>'allocation_id','')::uuid IS NULL OR NULLIF(requested->>'open_item_id','')::uuid IS NULL
       OR coalesce(NULLIF(requested->>'cash_amount','')::numeric,0)<0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier payment allocation identity and nonnegative cash amount are required'; END IF;
    SELECT * INTO STRICT item FROM finance.open_items WHERE org_id=organization_id
      AND id=(requested->>'open_item_id')::uuid AND item_side='payable' AND party_id=party.id
      AND currency_code='INR' AND status='open' AND document_date<=payment_date FOR UPDATE;
    SELECT * INTO STRICT event FROM finance.accounting_events WHERE org_id=organization_id
      AND id=item.accounting_event_id AND event_type='supplier_invoice' AND supplier_invoice_id IS NOT NULL FOR SHARE;
    SELECT * INTO STRICT invoice FROM procurement.supplier_invoices WHERE org_id=organization_id AND id=event.supplier_invoice_id
      AND branch_id=branch.id AND supplier_account_id=supplier.id AND currency_code='INR' AND status='posted'
      AND supply_type IN ('intra_state','inter_state') AND zero_rated_payment_mode='not_applicable'
      AND tax_charge_mechanism='normal' FOR SHARE;
    fiscal_year:=CASE WHEN pg_catalog.date_part('month',item.document_date)>=4
                      THEN pg_catalog.date_part('year',item.document_date)::smallint
                      ELSE (pg_catalog.date_part('year',item.document_date)-1)::smallint END;
    SELECT * INTO STRICT credit_fiscal_fact FROM tax.organization_fiscal_tax_facts WHERE org_id=organization_id
      AND fiscal_year_start_year=fiscal_year AND status='active' AND item.document_date BETWEEN effective_from AND effective_to
      AND prior_fiscal_year_turnover<=100000000 AND gst_tds_notified_deductor=false FOR SHARE;
    SELECT * INTO STRICT credit_fiscal_evidence FROM core.attachments WHERE org_id=organization_id
      AND id=credit_fiscal_fact.evidence_attachment_id AND status IN ('verified','retained') AND verified_at IS NOT NULL
      AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
    IF (SELECT count(*) FROM procurement.supplier_invoice_lines invoice_line WHERE invoice_line.org_id=organization_id
         AND invoice_line.supplier_invoice_id=invoice.id AND invoice_line.line_kind='product'
         AND invoice_line.withholding_nature_code='purchase_of_goods')=0
       OR EXISTS (SELECT 1 FROM procurement.supplier_invoice_lines invoice_line WHERE invoice_line.org_id=organization_id
         AND invoice_line.supplier_invoice_id=invoice.id
         AND (invoice_line.line_kind<>'product' OR invoice_line.withholding_nature_code IS DISTINCT FROM 'purchase_of_goods')) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier payment pilot supports only purchase-of-goods product invoices without charge withholding ambiguity'; END IF;
    PERFORM 1 FROM procurement.purchase_order_advance_allocations advance
     WHERE advance.org_id=organization_id AND EXISTS (
       SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
       JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
         ON receipt_allocation.org_id=invoice_line.org_id AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
       JOIN procurement.goods_receipt_lines receipt_line
         ON receipt_line.org_id=receipt_allocation.org_id AND receipt_line.id=receipt_allocation.goods_receipt_line_id
        AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
       WHERE invoice_line.org_id=organization_id AND invoice_line.supplier_invoice_id=invoice.id)
     ORDER BY advance.id FOR UPDATE OF advance;
    SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',advance.id,'purchase_order_line_id',advance.purchase_order_line_id,
          'gross_advance_amount',advance.gross_advance_amount::text,'status',advance.status,
          'reversal_of_allocation_id',advance.reversal_of_allocation_id,
          'applied',EXISTS (SELECT 1 FROM finance.accounting_events application
            WHERE application.org_id=advance.org_id AND application.purchase_order_advance_allocation_id=advance.id))
        ORDER BY advance.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') INTO applicable_advance_state_hash
      FROM procurement.purchase_order_advance_allocations advance
     WHERE advance.org_id=organization_id AND EXISTS (
       SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
       JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
         ON receipt_allocation.org_id=invoice_line.org_id AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
       JOIN procurement.goods_receipt_lines receipt_line
         ON receipt_line.org_id=receipt_allocation.org_id AND receipt_line.id=receipt_allocation.goods_receipt_line_id
        AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
       WHERE invoice_line.org_id=organization_id AND invoice_line.supplier_invoice_id=invoice.id);
    IF EXISTS (SELECT 1 FROM procurement.purchase_order_advance_allocations advance
       WHERE advance.org_id=organization_id AND advance.status='posted' AND advance.reversal_of_allocation_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM procurement.purchase_order_advance_allocations reversal
           WHERE reversal.org_id=advance.org_id AND reversal.reversal_of_allocation_id=advance.id AND reversal.status='reversed')
         AND NOT EXISTS (SELECT 1 FROM finance.accounting_events application
           WHERE application.org_id=advance.org_id AND application.purchase_order_advance_allocation_id=advance.id)
         AND EXISTS (SELECT 1 FROM procurement.supplier_invoice_lines invoice_line
           JOIN procurement.supplier_invoice_receipt_allocations receipt_allocation
             ON receipt_allocation.org_id=invoice_line.org_id AND receipt_allocation.supplier_invoice_line_id=invoice_line.id
           JOIN procurement.goods_receipt_lines receipt_line
             ON receipt_line.org_id=receipt_allocation.org_id AND receipt_line.id=receipt_allocation.goods_receipt_line_id
            AND receipt_line.purchase_order_line_id=advance.purchase_order_line_id
          WHERE invoice_line.org_id=organization_id AND invoice_line.supplier_invoice_id=invoice.id)) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier payment pilot cannot leave an applicable supplier advance unapplied'; END IF;
    PERFORM 1 FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id
      AND prior.payment_id IS DISTINCT FROM payment_id ORDER BY prior.id FOR UPDATE OF prior;
    IF EXISTS (SELECT 1 FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id
         AND prior.payment_id IS DISTINCT FROM payment_id AND prior.status='posted' AND prior.reversal_of_allocation_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=prior.org_id
           AND reversal.reversal_of_allocation_id=prior.id AND reversal.status='reversed')
         AND prior.payment_id IS NULL) THEN
      RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='supplier payment pilot cannot mix advance, withholding, or adjustment allocations'; END IF;
    SELECT coalesce(sum(prior.amount),0),count(*) INTO prior_allocated,allocation_count FROM finance.allocations prior
     WHERE prior.org_id=organization_id AND prior.open_item_id=item.id AND prior.payment_id IS NOT NULL
       AND prior.payment_id<>payment_id AND prior.status='posted' AND prior.reversal_of_allocation_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM finance.allocations reversal WHERE reversal.org_id=prior.org_id
         AND reversal.reversal_of_allocation_id=prior.id AND reversal.status='reversed');
    SELECT pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id',prior.id,'payment_id',prior.payment_id,'withholding_id',prior.withholding_id,
          'adjustment_note_id',prior.adjustment_note_id,'purchase_order_advance_allocation_id',prior.purchase_order_advance_allocation_id,
          'amount',prior.amount::text,'status',prior.status,'reversal_of_allocation_id',prior.reversal_of_allocation_id)
        ORDER BY prior.id),'[]'::jsonb)::text,'UTF8'),'sha256'),'hex') INTO allocation_state_hash
      FROM finance.allocations prior WHERE prior.org_id=organization_id AND prior.open_item_id=item.id
        AND prior.payment_id IS DISTINCT FROM payment_id;
    IF prior_allocated+coalesce((requested->>'cash_amount')::numeric,0)>item.principal_amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment allocation exceeds live payable balance'; END IF;
    requested_total:=requested_total+coalesce((requested->>'cash_amount')::numeric,0);
    resolved_allocations:=resolved_allocations||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'allocation_id',requested->>'allocation_id','open_item_id',item.id,'supplier_invoice_id',invoice.id,
      'document_number',item.document_number,'principal_amount',item.principal_amount::text,
      'prior_allocated_amount',prior_allocated::text,'cash_allocation_id',requested->>'allocation_id',
      'cash_amount',coalesce((requested->>'cash_amount')::numeric,0)::text,
      'residual_after',(item.principal_amount-prior_allocated-coalesce((requested->>'cash_amount')::numeric,0))::text));
    source_versions:=source_versions||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'resource_type','payable_allocation_state','id',item.id,'supplier_invoice_id',invoice.id,'invoice_row_version',invoice.row_version,
      'principal_amount',item.principal_amount::text,'status',item.status,'allocation_count',allocation_count,
      'active_cash_allocated_amount',prior_allocated::text,'allocation_state_hash',allocation_state_hash,
      'applicable_advance_state_hash',applicable_advance_state_hash),
      pg_catalog.jsonb_build_object('resource_type','invoice_credit_fiscal_tax_fact','id',credit_fiscal_fact.id,
        'supplier_invoice_id',invoice.id,'credit_date',item.document_date,
        'fiscal_year_start_year',credit_fiscal_fact.fiscal_year_start_year,
        'prior_fiscal_year_turnover',credit_fiscal_fact.prior_fiscal_year_turnover::text,
        'gst_tds_notified_deductor',credit_fiscal_fact.gst_tds_notified_deductor,
        'evidence_attachment_id',credit_fiscal_evidence.id,
        'evidence_sha256',pg_catalog.encode(credit_fiscal_evidence.sha256,'hex')));
  END LOOP;
  IF requested_total<>gross THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment components must exactly equal expected gross liability'; END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','branch','id',branch.id,'row_version',branch.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_account','id',supplier.id,'row_version',supplier.row_version),
    pg_catalog.jsonb_build_object('resource_type','supplier_party_tax_profile','id',party.id,'row_version',party.row_version,
      'pan_verification_status',party.pan_verification_status,'tax_residency_status',party.tax_residency_status,
      'evidence_attachment_id',party_evidence.id,'evidence_sha256',pg_catalog.encode(party_evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','payment_date_fiscal_tax_fact','id',payment_fiscal_fact.id,
      'payment_date',payment_date,'fiscal_year_start_year',payment_fiscal_fact.fiscal_year_start_year,
      'prior_fiscal_year_turnover',payment_fiscal_fact.prior_fiscal_year_turnover::text,
      'gst_tds_notified_deductor',payment_fiscal_fact.gst_tds_notified_deductor,
      'evidence_attachment_id',payment_fiscal_evidence.id,
      'evidence_sha256',pg_catalog.encode(payment_fiscal_evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','accounts_payable_role','id',payable.id,'row_version',payable.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_account','id',bank.id,'row_version',bank.row_version),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version),
    pg_catalog.jsonb_build_object('resource_type','bank_disbursement_collision','bank_account_id',bank.id,
      'external_reference',reference,'original_payment_candidate_count',duplicate_count))||source_versions;
  RETURN pg_catalog.jsonb_build_object('branch_id',branch.id,'payment_id',payment_id,'payment_date',payment_date,
    'supplier_account_id',supplier.id,'supplier_party_id',party.id,'bank_account_id',bank.id,
    'settlement_account_id',settlement.id,'accounts_payable_account_id',payable.id,'payment_method',method,
    'external_reference',reference,'gross_amount',gross::text,'cash_amount',gross::text,'withheld_amount','0.00',
    'currency_code','INR','allocations',resolved_allocations,'settlement_components',resolved_allocations,
    'legal_scope',pg_catalog.jsonb_build_object('country_code','IN','currency_code','INR','settlement','posted_supplier_invoice_payables_only',
      'supported_payment_methods',pg_catalog.jsonb_build_array('bank_transfer','upi'),
      'income_tax_withholding','not_applicable_verified_prior_fy_turnover_at_or_below_inr_10_crore',
      'gst_tds','not_applicable_verified_notified_deductor_false',
      'gross_liability_equals_bank_cash',true,'advance_withholding_adjustment_or_supplier_credit_netting','not_selected',
      'payment_reversal','unavailable_operator_action'),
    'source_versions',source_versions);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE request_document jsonb; resolved_document jsonb; current_resolution jsonb; preview_document jsonb;
        existing automation.command_requests%ROWTYPE; payment_sequence_id uuid; journal_sequence_id uuid;
        payment_number text; journal_number text; fiscal_year integer; aggregate_hash bytea;
BEGIN
  IF SESSION_USER<>'erp_runtime' OR payment_id IS NULL OR command_id IS NULL OR journal_id IS NULL OR event_id IS NULL
     OR pg_catalog.octet_length(key_hash)<>32 OR pg_catalog.octet_length(payment_sequence_key_hash)<>32
     OR pg_catalog.octet_length(journal_sequence_key_hash)<>32 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier payment persistence envelope is invalid'; END IF;
  request_document:=pg_catalog.convert_from(request_bytes,'UTF8')::jsonb;
  resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  preview_document:=pg_catalog.convert_from(preview_bytes,'UTF8')::jsonb;
  current_resolution:="erp_automation_commands"."resolve_supplier_payment_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,request_document);
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  IF current_resolution IS DISTINCT FROM resolved_document OR request_document->>'payment_id' IS DISTINCT FROM payment_id::text
     OR request_document->>'journal_id' IS DISTINCT FROM journal_id::text OR request_document->>'event_id' IS DISTINCT FROM event_id::text
     OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope'
     OR preview_document->'inventory_impact'<>'[]'::jsonb OR preview_document->'tax_impact'<>'[]'::jsonb
     OR preview_document->'calculation_ruleset'<>'[]'::jsonb THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier payment resolution or immutable preview changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.supplier_payment.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256')
       OR existing.preview_hash IS DISTINCT FROM extensions.digest(preview_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier payment idempotency key has different exact input'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  fiscal_year:=CASE WHEN pg_catalog.date_part('month',(resolved_document->>'payment_date')::date)>=4
    THEN pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer
    ELSE pg_catalog.date_part('year',(resolved_document->>'payment_date')::date)::integer-1 END;
  aggregate_hash:=extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256');
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.supplier_payment.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'gross_amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,aggregate_hash,expires_at);
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='supplier_payment'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'payment_date')::date,'disbursement',
    (resolved_document->>'supplier_party_id')::uuid,(resolved_document->>'branch_id')::uuid,
    (resolved_document->>'bank_account_id')::uuid,(resolved_document->>'settlement_account_id')::uuid,
    resolved_document->>'payment_method','commercial_settlement','INR',(resolved_document->>'cash_amount')::numeric,
    (resolved_document->>'cash_amount')::numeric,1,resolved_document->>'external_reference','approved',
    pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'payment_date')::date,
    'Supplier payment '||payment_number,'INR','INR',1,(resolved_document->>'cash_amount')::numeric,
    (resolved_document->>'cash_amount')::numeric,(resolved_document->>'cash_amount')::numeric,(resolved_document->>'cash_amount')::numeric,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(resolved_document->>'accounts_payable_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'supplier_party_id')::uuid,'Supplier payable settlement',
    (resolved_document->>'cash_amount')::numeric,0,(resolved_document->>'cash_amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(resolved_document->>'settlement_account_id')::uuid,
    (resolved_document->>'branch_id')::uuid,NULL,'Supplier payment bank settlement',0,
    (resolved_document->>'cash_amount')::numeric,0,(resolved_document->>'cash_amount')::numeric);
  PERFORM "erp_automation_commands"."assert_supplier_payment_draft"(organization_id,payment_id,journal_id,resolved_document);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_customer_cheque_action_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, action_payment_id uuid, action_kind text, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE branch_id uuid:=NULLIF(request_document->>'branch_id','')::uuid;
        original_id uuid:=NULLIF(request_document->>'original_payment_id','')::uuid;
        action_date date:=CASE action_kind WHEN 'clearance' THEN NULLIF(request_document->>'clearance_date','')::date
          ELSE NULLIF(request_document->>'bounce_date','')::date END;
        evidence_id uuid:=NULLIF(request_document->>'evidence_attachment_id','')::uuid;
        requested_version bigint:=NULLIF(request_document->>'original_payment_row_version','')::bigint;
        bank_id uuid:=NULLIF(request_document->>'bank_account_id','')::uuid;
        original finance.payments%ROWTYPE; bank finance.bank_accounts%ROWTYPE; settlement finance.accounts%ROWTYPE;
        evidence core.attachments%ROWTYPE; cheque_account finance.accounts%ROWTYPE; offset_account finance.accounts%ROWTYPE;
        capability_code text:='finance.customer_cheque_'||action_kind||'.prepare';
        operation_name text:='finance.customer_cheque_'||action_kind||'.post';
        terminal_count integer; compensating jsonb:='[]'::jsonb; source_versions jsonb;
BEGIN
  IF action_kind NOT IN ('clearance','bounce') OR action_payment_id IS NULL OR branch_id IS NULL OR original_id IS NULL
     OR action_date IS NULL OR evidence_id IS NULL OR requested_version IS NULL OR action_date>CURRENT_DATE
     OR (action_kind='clearance' AND (bank_id IS NULL OR NULLIF(pg_catalog.btrim(request_document->>'clearance_reference'),'') IS NULL))
     OR (action_kind='bounce' AND (bank_id IS NOT NULL OR request_document->>'reason_code' NOT IN
       ('funds_insufficient','signature_mismatch','account_closed','payment_stopped','instrument_invalid','other'))) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cheque terminal-action input is incomplete'; END IF;
  PERFORM 1 FROM core.memberships membership JOIN core.users user_row ON user_row.id=membership.user_id
    JOIN automation.agent_grants grant_row ON grant_row.org_id=membership.org_id AND grant_row.subject_membership_id=membership.id
    JOIN automation.agent_grant_capabilities capability ON capability.org_id=grant_row.org_id AND capability.agent_grant_id=grant_row.id
   WHERE membership.org_id=organization_id AND membership.id=membership_id AND membership.user_id=application_user_id
     AND membership.status='active' AND user_row.auth_user_id=auth_user_id AND user_row.status='active'
     AND grant_row.id=grant_id AND grant_row.client_id=caller_client_id AND grant_row.status='active'
     AND grant_row.expires_at>pg_catalog.transaction_timestamp() AND (grant_row.branch_id IS NULL OR grant_row.branch_id=branch_id)
     AND capability.capability_code=capability_code AND capability.operation_mode='write' AND capability.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cheque terminal-action delegated authority is inactive'; END IF;
  PERFORM erp_security.activate_context(auth_user_id,organization_id);
  IF erp_security.current_membership_id() IS DISTINCT FROM membership_id
     OR erp_security.can_access_branch(branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.payment.manage',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('finance.journal.post',branch_id) IS DISTINCT FROM true
     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cheque terminal-action permission is inactive'; END IF;
  SELECT * INTO STRICT original FROM finance.payments WHERE org_id=organization_id AND id=original_id
    AND branch_id=branch_id AND status='posted' AND direction='receipt' AND payment_method='cheque'
    AND payment_purpose IN ('commercial_settlement','customer_advance')
    AND account_payee_confirmed AND row_version=requested_version FOR UPDATE;
  IF action_date<original.payment_date OR (action_kind='bounce' AND original.payment_purpose='customer_advance'
     AND NOT EXISTS (SELECT 1 FROM finance.open_items item JOIN finance.accounting_events event
       ON event.org_id=item.org_id AND event.id=item.accounting_event_id
       WHERE event.org_id=organization_id AND event.payment_id=original.id AND item.item_side='payable' AND item.status='open')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque terminal action is stale or inconsistent with its open balance'; END IF;
  SELECT * INTO STRICT evidence FROM core.attachments WHERE org_id=organization_id AND id=evidence_id
    AND status IN ('verified','retained') AND verified_at IS NOT NULL
    AND verified_at<=pg_catalog.transaction_timestamp() FOR SHARE;
  SELECT count(*) INTO terminal_count FROM finance.payments terminal WHERE terminal.org_id=organization_id
    AND terminal.related_payment_id=original.id AND terminal.payment_purpose IN ('cheque_clearance','cheque_bounce')
    AND terminal.status='posted';
  IF terminal_count<>0 THEN RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cheque already has a posted terminal action'; END IF;
  SELECT * INTO STRICT cheque_account FROM finance.accounts WHERE org_id=organization_id
    AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,'cheques_in_hand','asset','INR',false)
    AND id=original.settlement_account_id FOR SHARE;
  IF action_kind='clearance' THEN
    SELECT * INTO STRICT bank FROM finance.bank_accounts WHERE org_id=organization_id AND id=bank_id
      AND status='active' AND currency_code='INR' FOR SHARE;
    SELECT * INTO STRICT settlement FROM finance.accounts WHERE org_id=organization_id AND id=bank.account_id
      AND status='active' AND account_type='asset' AND currency_code='INR' AND allows_bank_reconciliation FOR SHARE;
  ELSE
    settlement:=cheque_account;
    SELECT * INTO STRICT offset_account FROM finance.accounts WHERE org_id=organization_id
      AND id=erp_commercial_commands.resolve_role_account(organization_id,branch_id,
        CASE original.payment_purpose WHEN 'customer_advance' THEN 'customer_advance' ELSE 'accounts_receivable' END,
        CASE original.payment_purpose WHEN 'customer_advance' THEN 'liability' ELSE 'asset' END,'INR',true) FOR SHARE;
    IF original.payment_purpose='commercial_settlement' THEN
      SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'original_allocation_id',ordered.id,'open_item_id',ordered.open_item_id,
        'reversal_allocation_id',ids.value) ORDER BY ordered.id),'[]'::jsonb)
        INTO compensating FROM (
          SELECT allocation.id,allocation.open_item_id,row_number() OVER (ORDER BY allocation.id) AS ordinal
            FROM finance.allocations allocation
           WHERE allocation.org_id=organization_id AND allocation.payment_id=original.id AND allocation.status='posted'
             AND allocation.reversal_of_allocation_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.allocations reversal
               WHERE reversal.org_id=allocation.org_id AND reversal.reversal_of_allocation_id=allocation.id)
        ) ordered JOIN pg_catalog.jsonb_array_elements_text(request_document->'compensating_allocation_ids')
          WITH ORDINALITY ids(value,ordinal) USING (ordinal);
    ELSE
      SELECT pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('open_item_id',item.id,
        'allocation_id',request_document#>>'{compensating_allocation_ids,0}')) INTO compensating
       FROM finance.accounting_events event JOIN finance.open_items item
         ON item.org_id=event.org_id AND item.accounting_event_id=event.id
       WHERE event.org_id=organization_id AND event.payment_id=original.id AND item.item_side='payable' FOR UPDATE OF item;
    END IF;
  END IF;
  source_versions:=pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('resource_type','customer_cheque_receipt','id',original.id,'row_version',original.row_version,
      'status',original.status,'payment_purpose',original.payment_purpose,'amount',original.amount::text,
      'instrument_number',original.instrument_number,'instrument_date',original.instrument_date,
      'evidence_attachment_id',original.evidence_attachment_id),
    pg_catalog.jsonb_build_object('resource_type','terminal_action_collision','id',original.id,'candidate_count',terminal_count),
    pg_catalog.jsonb_build_object('resource_type','terminal_evidence','id',evidence.id,'sha256',pg_catalog.encode(evidence.sha256,'hex')),
    pg_catalog.jsonb_build_object('resource_type','settlement_account','id',settlement.id,'row_version',settlement.row_version));
  RETURN pg_catalog.jsonb_build_object('branch_id',branch_id,'payment_id',action_payment_id,'original_payment_id',original.id,
    'action_kind',action_kind,'operation',operation_name,'action_date',action_date,'customer_party_id',original.party_id,
    'bank_account_id',bank.id,'settlement_account_id',settlement.id,'cheques_in_hand_account_id',cheque_account.id,
    'offset_account_id',offset_account.id,'amount',original.amount::text,'currency_code','INR',
    'external_reference',CASE action_kind WHEN 'clearance' THEN upper(pg_catalog.btrim(request_document->>'clearance_reference'))
      ELSE original.external_reference||':BOUNCE:'||upper(request_document->>'reason_code') END,
    'evidence_attachment_id',evidence.id,'reason_code',request_document->>'reason_code',
    'compensating_allocations',compensating,
    'legal_scope',pg_catalog.jsonb_build_object('instrument','account_payee_cheque','terminal_action',action_kind,
      'allocation_effect',CASE action_kind WHEN 'bounce' THEN 'exact_compensating_reopen' ELSE 'none' END),
    'source_versions',source_versions);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_customer_cheque_action_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, action_payment_id uuid, action_kind text, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_customer_cheque_action_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, action_payment_id uuid, action_kind text, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN "erp_automation_commands"."resolve_customer_cheque_action_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,'clearance',request_document);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."resolve_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
  RETURN "erp_automation_commands"."resolve_customer_cheque_action_prepare"(organization_id,membership_id,auth_user_id,
    application_user_id,grant_id,caller_client_id,payment_id,'bounce',request_document);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."resolve_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."resolve_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
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
        payment_sequence_id uuid; journal_sequence_id uuid; original_journal_id uuid;
        payment_number text; journal_number text; fiscal_year integer;
BEGIN
  current_resolution:="erp_automation_commands"."resolve_customer_cheque_clearance_prepare"(organization_id,membership_id,
    auth_user_id,application_user_id,grant_id,caller_client_id,payment_id,request_document);
  IF current_resolution IS DISTINCT FROM resolved_document OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cheque clearance resolution changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.customer_cheque_clearance.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cheque clearance idempotency input changed'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.customer_cheque_clearance.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256'),expires_at);
  fiscal_year:=CASE WHEN extract(month FROM (resolved_document->>'action_date')::date)>=4
    THEN extract(year FROM (resolved_document->>'action_date')::date)::integer
    ELSE extract(year FROM (resolved_document->>'action_date')::date)::integer-1 END;
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='customer_receipt'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  IF 'clearance'='bounce' THEN SELECT journal_entry_id INTO STRICT original_journal_id FROM finance.accounting_events
    WHERE org_id=organization_id AND payment_id=(resolved_document->>'original_payment_id')::uuid FOR SHARE; END IF;
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    related_payment_id,evidence_attachment_id,memo,status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'action_date')::date,
    CASE 'clearance' WHEN 'bounce' THEN 'disbursement' ELSE 'receipt' END,(resolved_document->>'customer_party_id')::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'bank_account_id')::uuid,
    (resolved_document->>'settlement_account_id')::uuid,CASE 'clearance' WHEN 'bounce' THEN 'cheque' ELSE 'bank_transfer' END,
    'cheque_clearance','INR',(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,1,
    resolved_document->>'external_reference',(resolved_document->>'original_payment_id')::uuid,
    (resolved_document->>'evidence_attachment_id')::uuid,resolved_document->>'reason_code','approved',
    pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,
    reversal_of_journal_entry_id,reversal_reason,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'action_date')::date,'Customer cheque clearance',
    'INR','INR',1,(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,original_journal_id,
    CASE 'clearance' WHEN 'bounce' THEN resolved_document->>'reason_code' ELSE NULL END,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(CASE 'clearance' WHEN 'bounce' THEN resolved_document->>'offset_account_id'
      ELSE resolved_document->>'settlement_account_id' END)::uuid,(resolved_document->>'branch_id')::uuid,
      CASE 'clearance' WHEN 'bounce' THEN (resolved_document->>'customer_party_id')::uuid ELSE NULL END,'Cheque clearance debit',
      (resolved_document->>'amount')::numeric,0,(resolved_document->>'amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(resolved_document->>'cheques_in_hand_account_id')::uuid,
      (resolved_document->>'branch_id')::uuid,NULL,'Cheque clearance credit',0,(resolved_document->>'amount')::numeric,
      0,(resolved_document->>'amount')::numeric);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_automation_commands"."persist_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz)
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
        payment_sequence_id uuid; journal_sequence_id uuid; original_journal_id uuid;
        payment_number text; journal_number text; fiscal_year integer;
BEGIN
  current_resolution:="erp_automation_commands"."resolve_customer_cheque_bounce_prepare"(organization_id,membership_id,
    auth_user_id,application_user_id,grant_id,caller_client_id,payment_id,request_document);
  IF current_resolution IS DISTINCT FROM resolved_document OR preview_document->'source_versions' IS DISTINCT FROM resolved_document->'source_versions'
     OR preview_document->'legal_scope' IS DISTINCT FROM resolved_document->'legal_scope' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='cheque bounce resolution changed'; END IF;
  SELECT * INTO existing FROM automation.command_requests WHERE org_id=organization_id AND agent_grant_id=grant_id
    AND capability_code='finance.customer_cheque_bounce.prepare' AND idempotency_key_hash=key_hash FOR SHARE;
  IF FOUND THEN
    IF existing.target_resource_id IS DISTINCT FROM payment_id OR existing.request_hash IS DISTINCT FROM extensions.digest(request_bytes,'sha256') THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cheque bounce idempotency input changed'; END IF;
    RETURN pg_catalog.jsonb_build_object('command_request_id',existing.id,'expires_at',existing.expires_at,
      'preview_hash',pg_catalog.encode(existing.preview_hash,'hex'),'replayed',true);
  END IF;
  PERFORM pg_catalog.set_config('app.request_id',command_id::text,true);
  PERFORM "erp_automation_commands"."prepare_operator_command"(organization_id,command_id,grant_id,'finance.customer_cheque_bounce.prepare',
    (resolved_document->>'branch_id')::uuid,NULL,payment_id,(resolved_document->>'amount')::numeric,'INR',key_hash,
    request_bytes,preview_bytes,NULL,extensions.digest(pg_catalog.convert_to((resolved_document->'source_versions')::text,'UTF8'),'sha256'),expires_at);
  fiscal_year:=CASE WHEN extract(month FROM (resolved_document->>'action_date')::date)>=4
    THEN extract(year FROM (resolved_document->>'action_date')::date)::integer
    ELSE extract(year FROM (resolved_document->>'action_date')::date)::integer-1 END;
  SELECT id INTO STRICT payment_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='customer_receipt'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  SELECT id INTO STRICT journal_sequence_id FROM core.document_sequences WHERE org_id=organization_id
    AND branch_id=(resolved_document->>'branch_id')::uuid AND document_type='journal_entry'
    AND fiscal_year_start=pg_catalog.make_date(fiscal_year,4,1) AND status='active' FOR SHARE;
  payment_number:=erp_core_commands.allocate_document_number(organization_id,payment_sequence_id,payment_sequence_key_hash,expires_at);
  journal_number:=erp_core_commands.allocate_document_number(organization_id,journal_sequence_id,journal_sequence_key_hash,expires_at);
  IF 'bounce'='bounce' THEN SELECT journal_entry_id INTO STRICT original_journal_id FROM finance.accounting_events
    WHERE org_id=organization_id AND payment_id=(resolved_document->>'original_payment_id')::uuid FOR SHARE; END IF;
  INSERT INTO finance.payments(org_id,id,payment_number,payment_date,direction,party_id,branch_id,bank_account_id,
    settlement_account_id,payment_method,payment_purpose,currency_code,amount,functional_amount,fx_rate,external_reference,
    related_payment_id,evidence_attachment_id,memo,status,approved_at,approved_by_membership_id)
  VALUES(organization_id,payment_id,payment_number,(resolved_document->>'action_date')::date,
    CASE 'bounce' WHEN 'bounce' THEN 'disbursement' ELSE 'receipt' END,(resolved_document->>'customer_party_id')::uuid,
    (resolved_document->>'branch_id')::uuid,(resolved_document->>'bank_account_id')::uuid,
    (resolved_document->>'settlement_account_id')::uuid,CASE 'bounce' WHEN 'bounce' THEN 'cheque' ELSE 'bank_transfer' END,
    'cheque_bounce','INR',(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,1,
    resolved_document->>'external_reference',(resolved_document->>'original_payment_id')::uuid,
    (resolved_document->>'evidence_attachment_id')::uuid,resolved_document->>'reason_code','approved',
    pg_catalog.transaction_timestamp(),membership_id);
  INSERT INTO finance.journal_entries(org_id,id,journal_number,posting_date,description,transaction_currency,functional_currency,
    fx_rate,transaction_debit_total,transaction_credit_total,functional_debit_total,functional_credit_total,
    reversal_of_journal_entry_id,reversal_reason,status)
  VALUES(organization_id,journal_id,journal_number,(resolved_document->>'action_date')::date,'Customer cheque bounce',
    'INR','INR',1,(resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,
    (resolved_document->>'amount')::numeric,(resolved_document->>'amount')::numeric,original_journal_id,
    CASE 'bounce' WHEN 'bounce' THEN resolved_document->>'reason_code' ELSE NULL END,'draft');
  INSERT INTO finance.journal_lines(org_id,id,journal_entry_id,line_number,account_id,branch_id,party_id,description,
    transaction_debit,transaction_credit,functional_debit,functional_credit)
  VALUES
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,1,(CASE 'bounce' WHEN 'bounce' THEN resolved_document->>'offset_account_id'
      ELSE resolved_document->>'settlement_account_id' END)::uuid,(resolved_document->>'branch_id')::uuid,
      CASE 'bounce' WHEN 'bounce' THEN (resolved_document->>'customer_party_id')::uuid ELSE NULL END,'Cheque bounce debit',
      (resolved_document->>'amount')::numeric,0,(resolved_document->>'amount')::numeric,0),
   (organization_id,pg_catalog.gen_random_uuid(),journal_id,2,(resolved_document->>'cheques_in_hand_account_id')::uuid,
      (resolved_document->>'branch_id')::uuid,NULL,'Cheque bounce credit',0,(resolved_document->>'amount')::numeric,
      0,(resolved_document->>'amount')::numeric);
  RETURN pg_catalog.jsonb_build_object('command_request_id',command_id,'expires_at',expires_at,
    'preview_hash',pg_catalog.encode(extensions.digest(preview_bytes,'sha256'),'hex'),'replayed',false);
END
$function$;

ALTER FUNCTION "erp_automation_commands"."persist_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_automation_commands"."persist_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."apply_supplier_adjustment_credit"(organization_id uuid, adjustment_note_id uuid, source_open_item_id uuid, target_open_item_id uuid, allocation_id uuid, application_date date)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE note finance.adjustment_notes%ROWTYPE; source_item finance.open_items%ROWTYPE;
        target_item finance.open_items%ROWTYPE; actor uuid:=erp_security.current_membership_id();
        source_used numeric(20,2); target_used numeric(20,2); residual numeric(20,2);
BEGIN
    SELECT * INTO STRICT note FROM finance.adjustment_notes WHERE org_id=organization_id
      AND id=adjustment_note_id AND side='purchase' AND direction='debit' AND status='posted' FOR SHARE;
    SELECT * INTO STRICT source_item FROM finance.open_items WHERE org_id=organization_id
      AND id=source_open_item_id AND accounting_event_id IN (
        SELECT id FROM finance.accounting_events WHERE org_id=organization_id AND adjustment_note_id=note.id)
      AND item_side='receivable' AND status IN ('open','settled') FOR UPDATE;
    SELECT * INTO STRICT target_item FROM finance.open_items WHERE org_id=organization_id
      AND id=target_open_item_id AND item_side='payable' AND party_id=source_item.party_id
      AND currency_code=source_item.currency_code AND status IN ('open','settled') FOR UPDATE;
    IF note.branch_id IS DISTINCT FROM (
         SELECT invoice.branch_id FROM finance.accounting_events event
         JOIN procurement.supplier_invoices invoice ON invoice.org_id=event.org_id AND invoice.id=event.supplier_invoice_id
         WHERE event.org_id=organization_id AND event.id=target_item.accounting_event_id)
       OR source_item.currency_code<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier adjustment source and payable must share supplier, branch, and INR currency';
    END IF;
    IF application_date IS NULL OR application_date<note.note_date OR application_date>CURRENT_DATE THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='supplier adjustment application date is invalid'; END IF;
    SELECT coalesce(sum(a.amount),0) INTO source_used FROM finance.allocations a WHERE a.org_id=organization_id
      AND a.source_open_item_id=source_item.id AND a.status='posted' AND a.reversal_of_allocation_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
    SELECT coalesce(sum(a.amount),0) INTO target_used FROM finance.allocations a WHERE a.org_id=organization_id
      AND a.open_item_id=target_item.id AND a.status='posted' AND a.reversal_of_allocation_id IS NULL
      AND NOT EXISTS(SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
    residual:=source_item.principal_amount-source_used;
    IF residual<=0 OR residual>target_item.principal_amount-target_used THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier adjustment residual must be positive and fit the locked payable residual exactly';
    END IF;
    INSERT INTO finance.allocations(org_id,id,source_open_item_id,open_item_id,allocation_date,currency_code,
      amount,functional_amount,fx_rate,status,created_by_membership_id)
    VALUES(organization_id,allocation_id,source_item.id,target_item.id,application_date,'INR',residual,residual,1,'posted',actor);
    PERFORM "erp_finance_commands"."synchronize_open_item_status"(organization_id,source_item.id);
    PERFORM "erp_finance_commands"."synchronize_open_item_status"(organization_id,target_item.id);
    RETURN residual;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."apply_supplier_adjustment_credit"(organization_id uuid, adjustment_note_id uuid, source_open_item_id uuid, target_open_item_id uuid, allocation_id uuid, application_date date) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."apply_supplier_adjustment_credit"(organization_id uuid, adjustment_note_id uuid, source_open_item_id uuid, target_open_item_id uuid, allocation_id uuid, application_date date) FROM PUBLIC, "erp_app", "erp_runtime";

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
    INSERT INTO finance.allocations(org_id,id,source_open_item_id,open_item_id,allocation_date,
      currency_code,amount,functional_amount,fx_rate,status,created_by_membership_id)
    VALUES(organization_id,allocation_id,advance_item.id,invoice_item.id,invoice.invoice_date,'INR',advance.gross_advance_amount,
      advance.functional_gross_advance_amount,1,'posted',actor);
    PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,invoice_item.id);
    PERFORM erp_finance_commands.synchronize_open_item_status(organization_id,advance_item.id);
    RETURN advance_allocation_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."guard_payment_command"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
BEGIN
    IF TG_OP='DELETE' AND OLD.status<>'draft' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-draft payment evidence is retained';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','reversed') AND ROW(
       NEW.payment_number,NEW.payment_date,NEW.direction,NEW.party_id,NEW.branch_id,
       NEW.bank_account_id,NEW.settlement_account_id,
       NEW.payment_method,NEW.payment_purpose,NEW.currency_code,NEW.amount,NEW.functional_amount,NEW.fx_rate,
       NEW.external_reference,NEW.related_payment_id,NEW.sales_order_id,NEW.evidence_attachment_id,NEW.instrument_number,
       NEW.instrument_date,NEW.drawee_bank_name,NEW.account_payee_confirmed,
       NEW.reversal_of_payment_id,NEW.reversal_reason,
       NEW.approved_at,NEW.approved_by_membership_id,NEW.posted_at,NEW.posted_by_membership_id
    ) IS DISTINCT FROM ROW(
       OLD.payment_number,OLD.payment_date,OLD.direction,OLD.party_id,OLD.branch_id,
       OLD.bank_account_id,OLD.settlement_account_id,
       OLD.payment_method,OLD.payment_purpose,OLD.currency_code,OLD.amount,OLD.functional_amount,OLD.fx_rate,
       OLD.external_reference,OLD.related_payment_id,OLD.sales_order_id,OLD.evidence_attachment_id,OLD.instrument_number,
       OLD.instrument_date,OLD.drawee_bank_name,OLD.account_payee_confirmed,
       OLD.reversal_of_payment_id,OLD.reversal_reason,
       OLD.approved_at,OLD.approved_by_membership_id,OLD.posted_at,OLD.posted_by_membership_id
    ) THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted payment facts are immutable'; END IF;
    IF TG_OP='UPDATE' AND NEW.status IN ('posted','reversed') AND NEW.status IS DISTINCT FROM OLD.status
       AND NOT "erp_finance_commands"."scope_active"('payment',NEW.org_id,NEW.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment posting and reversal require the reviewed command';
    END IF;
    RETURN NEW;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."guard_payment_command"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."guard_payment_command"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."post_customer_receipt"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, receipt_allocations jsonb, customer_advance_open_item_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE payment finance.payments%ROWTYPE; item jsonb; target finance.open_items%ROWTYPE;
        actor uuid:=erp_security.current_membership_id(); allocated numeric(20,2):=0;
        active_total numeric(20,2); advance_account uuid;
BEGIN
    SELECT * INTO payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
    IF payment.id IS NULL OR payment.status<>'approved' OR payment.direction<>'receipt'
       OR payment.payment_purpose NOT IN ('commercial_settlement','customer_advance')
       OR pg_catalog.jsonb_typeof(receipt_allocations)<>'array' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt requires one approved typed receipt draft';
    END IF;
    IF payment.payment_purpose='customer_advance' THEN
      IF pg_catalog.jsonb_array_length(receipt_allocations)<>0 OR customer_advance_open_item_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer advance has zero invoice allocations and one exact liability open item';
      END IF;
      advance_account:=erp_commercial_commands.resolve_role_account(
        organization_id,payment.branch_id,'customer_advance','liability','INR',true);
      IF (SELECT count(*) FROM finance.journal_lines line WHERE line.org_id=organization_id
           AND line.journal_entry_id=journal_id AND line.account_id=advance_account
           AND line.branch_id=payment.branch_id AND line.party_id=payment.party_id
           AND line.transaction_credit=payment.amount AND line.transaction_debit=0)<>1 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer advance journal must credit canonical customer-advance liability';
      END IF;
    ELSE
      IF customer_advance_open_item_id IS NOT NULL OR pg_catalog.jsonb_array_length(receipt_allocations)=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invoice receipt requires explicit receivable allocations only';
      END IF;
    END IF;
    PERFORM "erp_finance_commands"."post_payment"(organization_id,payment_id,journal_id,event_id);
    IF payment.payment_purpose='customer_advance' THEN
      INSERT INTO finance.open_items(org_id,id,accounting_event_id,party_id,item_side,document_number,
        document_date,due_date,currency_code,principal_amount,functional_principal_amount,created_by_membership_id)
      VALUES(organization_id,customer_advance_open_item_id,event_id,payment.party_id,'payable',payment.payment_number,
        payment.payment_date,payment.payment_date,'INR',payment.amount,payment.functional_amount,actor);
      RETURN payment_id;
    END IF;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(receipt_allocations) ORDER BY value->>'open_item_id' LOOP
      SELECT * INTO STRICT target FROM finance.open_items WHERE org_id=organization_id
        AND id=(item->>'open_item_id')::uuid AND item_side='receivable' AND party_id=payment.party_id
        AND currency_code='INR' AND status IN ('open','settled') FOR UPDATE;
      SELECT coalesce(sum(a.amount),0) INTO active_total FROM finance.allocations a
       WHERE a.org_id=organization_id AND a.open_item_id=target.id AND a.status='posted'
         AND a.reversal_of_allocation_id IS NULL AND NOT EXISTS (
           SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id
            AND r.reversal_of_allocation_id=a.id AND r.status='reversed');
      IF NULLIF(item->>'allocation_id','')::uuid IS NULL OR (item->>'amount')::numeric<=0
         OR active_total+(item->>'amount')::numeric>target.principal_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt allocation exceeds locked receivable residual';
      END IF;
      INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
        amount,functional_amount,fx_rate,status,created_by_membership_id)
      VALUES(organization_id,(item->>'allocation_id')::uuid,payment_id,target.id,payment.payment_date,'INR',
        (item->>'amount')::numeric,(item->>'amount')::numeric,1,'posted',actor);
      PERFORM "erp_finance_commands"."synchronize_open_item_status"(organization_id,target.id);
      allocated:=allocated+(item->>'amount')::numeric;
    END LOOP;
    IF allocated<>payment.amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer receipt allocations must exactly equal posted receipt';
    END IF;
    RETURN payment_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."post_customer_receipt"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, receipt_allocations jsonb, customer_advance_open_item_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."post_customer_receipt"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, receipt_allocations jsonb, customer_advance_open_item_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."post_customer_cheque_clearance"(organization_id uuid, original_payment_id uuid, clearance_payment_id uuid, journal_id uuid, event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE original finance.payments%ROWTYPE; clearance finance.payments%ROWTYPE; cheque_account uuid;
BEGIN
    SELECT * INTO STRICT original FROM finance.payments WHERE org_id=organization_id
      AND id=original_payment_id FOR UPDATE;
    SELECT * INTO STRICT clearance FROM finance.payments WHERE org_id=organization_id
      AND id=clearance_payment_id FOR UPDATE;
    IF clearance.status='posted' AND clearance.related_payment_id=original.id
       AND EXISTS (SELECT 1 FROM finance.accounting_events event WHERE event.org_id=organization_id
         AND event.payment_id=clearance.id AND event.id=event_id AND event.journal_entry_id=journal_id) THEN
      RETURN clearance.id;
    END IF;
    IF original.status<>'posted' OR original.direction<>'receipt' OR original.payment_method<>'cheque'
       OR original.payment_purpose NOT IN ('commercial_settlement','customer_advance')
       OR original.account_payee_confirmed IS DISTINCT FROM true
       OR clearance.status<>'approved' OR clearance.payment_purpose<>'cheque_clearance'
       OR clearance.related_payment_id IS DISTINCT FROM original.id OR clearance.direction<>'receipt'
       OR clearance.party_id IS DISTINCT FROM original.party_id OR clearance.branch_id IS DISTINCT FROM original.branch_id
       OR clearance.amount IS DISTINCT FROM original.amount OR clearance.currency_code IS DISTINCT FROM original.currency_code
       OR clearance.payment_method NOT IN ('bank_transfer','upi')
       OR EXISTS (SELECT 1 FROM finance.payments terminal WHERE terminal.org_id=organization_id
          AND terminal.related_payment_id=original.id AND terminal.id<>clearance.id
          AND terminal.payment_purpose IN ('cheque_clearance','cheque_bounce') AND terminal.status='posted') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque clearance requires one unchanged posted account-payee instrument with no terminal action';
    END IF;
    cheque_account:=erp_commercial_commands.resolve_role_account(
      organization_id,original.branch_id,'cheques_in_hand','asset','INR',false);
    IF original.settlement_account_id IS DISTINCT FROM cheque_account
       OR NOT EXISTS (SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id
         AND line.journal_entry_id=journal_id AND line.account_id=cheque_account
         AND line.branch_id=original.branch_id AND line.transaction_credit=original.amount
         AND line.transaction_debit=0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque clearance must credit the canonical cheques-in-hand account';
    END IF;
    RETURN "erp_finance_commands"."post_payment"(organization_id,clearance.id,journal_id,event_id);
END
$function$;

ALTER FUNCTION "erp_finance_commands"."post_customer_cheque_clearance"(organization_id uuid, original_payment_id uuid, clearance_payment_id uuid, journal_id uuid, event_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."post_customer_cheque_clearance"(organization_id uuid, original_payment_id uuid, clearance_payment_id uuid, journal_id uuid, event_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."post_customer_cheque_bounce"(organization_id uuid, original_payment_id uuid, bounce_payment_id uuid, journal_id uuid, event_id uuid, compensating_allocations jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE original finance.payments%ROWTYPE; bounce finance.payments%ROWTYPE; item jsonb;
        cheque_account uuid; offset_account uuid; original_allocation finance.allocations%ROWTYPE;
        advance_item finance.open_items%ROWTYPE; original_journal_id uuid;
        actor uuid:=erp_security.current_membership_id();
BEGIN
    SELECT * INTO STRICT original FROM finance.payments WHERE org_id=organization_id
      AND id=original_payment_id FOR UPDATE;
    SELECT * INTO STRICT bounce FROM finance.payments WHERE org_id=organization_id
      AND id=bounce_payment_id FOR UPDATE;
    IF bounce.status='posted' AND bounce.related_payment_id=original.id
       AND EXISTS (SELECT 1 FROM finance.accounting_events event WHERE event.org_id=organization_id
         AND event.payment_id=bounce.id AND event.id=event_id AND event.journal_entry_id=journal_id) THEN
      IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(compensating_allocations) expected(value)
          WHERE NOT EXISTS (SELECT 1 FROM finance.allocations actual WHERE actual.org_id=organization_id
            AND actual.id=coalesce((expected.value->>'reversal_allocation_id')::uuid,(expected.value->>'allocation_id')::uuid))) THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='cheque bounce replay allocation evidence differs'; END IF;
      RETURN bounce.id;
    END IF;
    IF original.status<>'posted' OR original.direction<>'receipt' OR original.payment_method<>'cheque'
       OR original.payment_purpose NOT IN ('commercial_settlement','customer_advance') OR original.account_payee_confirmed IS DISTINCT FROM true
       OR bounce.status<>'approved' OR bounce.payment_purpose<>'cheque_bounce'
       OR bounce.related_payment_id IS DISTINCT FROM original.id OR bounce.direction<>'disbursement'
       OR bounce.party_id IS DISTINCT FROM original.party_id OR bounce.branch_id IS DISTINCT FROM original.branch_id
       OR bounce.amount IS DISTINCT FROM original.amount OR bounce.currency_code IS DISTINCT FROM original.currency_code
       OR bounce.payment_method<>'cheque'
       OR EXISTS (SELECT 1 FROM finance.payments terminal WHERE terminal.org_id=organization_id
          AND terminal.related_payment_id=original.id AND terminal.id<>bounce.id
          AND terminal.payment_purpose IN ('cheque_clearance','cheque_bounce') AND terminal.status='posted') THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque bounce requires one unchanged allocated cheque with no terminal action';
    END IF;
    cheque_account:=erp_commercial_commands.resolve_role_account(
      organization_id,original.branch_id,'cheques_in_hand','asset','INR',false);
    offset_account:=erp_commercial_commands.resolve_role_account(organization_id,original.branch_id,
      CASE WHEN original.payment_purpose='commercial_settlement' THEN 'accounts_receivable' ELSE 'customer_advance' END,
      CASE WHEN original.payment_purpose='commercial_settlement' THEN 'asset' ELSE 'liability' END,'INR',true);
    IF original.settlement_account_id IS DISTINCT FROM cheque_account
       OR bounce.settlement_account_id IS DISTINCT FROM cheque_account
       OR NOT EXISTS (SELECT 1 FROM finance.journal_lines line WHERE line.org_id=organization_id
          AND line.journal_entry_id=journal_id AND line.account_id=offset_account
          AND line.party_id=original.party_id AND line.branch_id=original.branch_id
          AND line.transaction_debit=original.amount AND line.transaction_credit=0) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque bounce must restore the canonical customer balance and credit cheques in hand';
    END IF;
    SELECT event.journal_entry_id INTO STRICT original_journal_id FROM finance.accounting_events event
      WHERE event.org_id=organization_id AND event.payment_id=original.id FOR SHARE;
    IF (SELECT reversal_of_journal_entry_id FROM finance.journal_entries
         WHERE org_id=organization_id AND id=journal_id FOR SHARE) IS DISTINCT FROM original_journal_id THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque bounce journal must identify the exact original receipt journal';
    END IF;
    PERFORM "erp_finance_commands"."post_payment"(organization_id,bounce.id,journal_id,event_id);
    PERFORM "erp_finance_commands"."mark_journal_reversed"(organization_id,original_journal_id,journal_id);
    IF original.payment_purpose='commercial_settlement' THEN
      IF pg_catalog.jsonb_typeof(compensating_allocations)<>'array' OR
         pg_catalog.jsonb_array_length(compensating_allocations)<>(SELECT count(*) FROM finance.allocations a
           WHERE a.org_id=organization_id AND a.payment_id=original.id AND a.status='posted'
             AND a.reversal_of_allocation_id IS NULL AND NOT EXISTS(SELECT 1 FROM finance.allocations r
               WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cheque bounce requires one exact reversal identity per live receipt allocation';
      END IF;
      FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(compensating_allocations) LOOP
        SELECT * INTO STRICT original_allocation FROM finance.allocations WHERE org_id=organization_id
          AND id=(item->>'original_allocation_id')::uuid AND payment_id=original.id AND status='posted'
          AND reversal_of_allocation_id IS NULL FOR UPDATE;
        INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
          amount,functional_amount,fx_rate,reversal_of_allocation_id,reversal_reason,status,reversed_at,
          reversed_by_membership_id,created_by_membership_id)
        VALUES(organization_id,(item->>'reversal_allocation_id')::uuid,original.id,original_allocation.open_item_id,
          bounce.payment_date,original_allocation.currency_code,original_allocation.amount,
          original_allocation.functional_amount,original_allocation.fx_rate,original_allocation.id,
          bounce.memo,'reversed',pg_catalog.transaction_timestamp(),actor,actor);
        PERFORM "erp_finance_commands"."synchronize_open_item_status"(organization_id,original_allocation.open_item_id);
      END LOOP;
    ELSE
      SELECT open_item.* INTO STRICT advance_item FROM finance.accounting_events event
       JOIN finance.open_items open_item ON open_item.org_id=event.org_id AND open_item.accounting_event_id=event.id
       WHERE event.org_id=organization_id AND event.payment_id=original.id AND open_item.item_side='payable' FOR UPDATE OF open_item;
      IF pg_catalog.jsonb_typeof(compensating_allocations)<>'array' OR pg_catalog.jsonb_array_length(compensating_allocations)<>1
         OR (compensating_allocations->0->>'open_item_id')::uuid IS DISTINCT FROM advance_item.id THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='advance cheque bounce requires the exact customer-advance open item';
      END IF;
      INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
        amount,functional_amount,fx_rate,status,created_by_membership_id)
      VALUES(organization_id,(compensating_allocations->0->>'allocation_id')::uuid,bounce.id,advance_item.id,
        bounce.payment_date,'INR',bounce.amount,bounce.functional_amount,1,'posted',actor);
      PERFORM "erp_finance_commands"."synchronize_open_item_status"(organization_id,advance_item.id);
    END IF;
    RETURN bounce.id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."post_customer_cheque_bounce"(organization_id uuid, original_payment_id uuid, bounce_payment_id uuid, journal_id uuid, event_id uuid, compensating_allocations jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."post_customer_cheque_bounce"(organization_id uuid, original_payment_id uuid, bounce_payment_id uuid, journal_id uuid, event_id uuid, compensating_allocations jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."post_supplier_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, settlement_components jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE payment finance.payments%ROWTYPE; component jsonb; target finance.open_items%ROWTYPE;
        actor uuid:=erp_security.current_membership_id(); cash_total numeric(20,2):=0;
        target_used numeric(20,2); credit_amount numeric(20,2); existing_event uuid;
BEGIN
    IF pg_catalog.jsonb_typeof(settlement_components)<>'array' OR pg_catalog.jsonb_array_length(settlement_components)=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier payment requires exact settlement component identities';
    END IF;
    SELECT * INTO STRICT payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
    SELECT id INTO existing_event FROM finance.accounting_events WHERE org_id=organization_id AND payment_id=payment_id;
    IF payment.status='posted' THEN
      IF existing_event IS DISTINCT FROM event_id OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(settlement_components) expected(value)
         WHERE (coalesce((expected.value->>'cash_amount')::numeric,0)>0 AND NOT EXISTS (
             SELECT 1 FROM finance.allocations actual WHERE actual.org_id=organization_id
              AND actual.id=(expected.value->>'cash_allocation_id')::uuid AND actual.payment_id=payment_id
              AND actual.open_item_id=(expected.value->>'open_item_id')::uuid
              AND actual.amount=(expected.value->>'cash_amount')::numeric AND actual.status='posted'))
            OR (expected.value ? 'withholding' AND NOT EXISTS (
             SELECT 1 FROM tax.withholdings actual WHERE actual.org_id=organization_id
              AND actual.id=(expected.value#>>'{withholding,withholding_id}')::uuid
              AND actual.open_item_id=(expected.value->>'open_item_id')::uuid
              AND actual.status='deducted'
              AND actual.withheld_amount=(expected.value#>>'{withholding,amount}')::numeric
              AND actual.deduction_trigger='credit'))
            OR (expected.value ? 'advance_application' AND NOT EXISTS (
             SELECT 1 FROM finance.accounting_events actual WHERE actual.org_id=organization_id
              AND actual.purchase_order_advance_allocation_id=(expected.value#>>'{advance_application,advance_allocation_id}')::uuid
              AND actual.id=(expected.value#>>'{advance_application,event_id}')::uuid))
            OR (expected.value ? 'adjustment_application' AND NOT EXISTS (
             SELECT 1 FROM finance.allocations actual WHERE actual.org_id=organization_id
              AND actual.id=(expected.value#>>'{adjustment_application,allocation_id}')::uuid
              AND actual.source_open_item_id=(expected.value#>>'{adjustment_application,source_open_item_id}')::uuid
              AND actual.open_item_id=(expected.value->>'open_item_id')::uuid))
      ) THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='supplier payment replay evidence differs from the approved component set';
      END IF;
      RETURN payment_id;
    END IF;
    IF payment.status<>'approved' OR payment.direction<>'disbursement'
       OR payment.payment_purpose<>'commercial_settlement' OR payment.currency_code<>'INR' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment requires approved INR commercial disbursement';
    END IF;
    PERFORM "erp_finance_commands"."post_payment"(organization_id,payment_id,journal_id,event_id);
    FOR component IN SELECT value FROM pg_catalog.jsonb_array_elements(settlement_components) ORDER BY value->>'open_item_id' LOOP
      SELECT * INTO STRICT target FROM finance.open_items WHERE org_id=organization_id
       AND id=(component->>'open_item_id')::uuid AND item_side='payable' AND party_id=payment.party_id
       AND currency_code='INR' AND status IN ('open','settled') FOR UPDATE;
      SELECT coalesce(sum(a.amount),0) INTO target_used FROM finance.allocations a WHERE a.org_id=organization_id
       AND a.open_item_id=target.id AND a.status='posted' AND a.reversal_of_allocation_id IS NULL
       AND NOT EXISTS(SELECT 1 FROM finance.allocations r WHERE r.org_id=a.org_id AND r.reversal_of_allocation_id=a.id);
      IF coalesce((component->>'cash_amount')::numeric,0)>0 THEN
        IF target_used+(component->>'cash_amount')::numeric>target.principal_amount THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier cash component exceeds locked payable residual'; END IF;
        INSERT INTO finance.allocations(org_id,id,payment_id,open_item_id,allocation_date,currency_code,
          amount,functional_amount,fx_rate,status,created_by_membership_id)
        VALUES(organization_id,(component->>'cash_allocation_id')::uuid,payment_id,target.id,payment.payment_date,'INR',
          (component->>'cash_amount')::numeric,(component->>'cash_amount')::numeric,1,'posted',actor);
        PERFORM "erp_finance_commands"."synchronize_open_item_status"(organization_id,target.id);
        cash_total:=cash_total+(component->>'cash_amount')::numeric;
      END IF;
      IF component ? 'withholding' THEN
        PERFORM 1 FROM tax.withholdings withholding
         JOIN finance.allocations allocation ON allocation.org_id=withholding.org_id
          AND allocation.withholding_id=withholding.id AND allocation.open_item_id=target.id
          AND allocation.status='posted' AND allocation.reversal_of_allocation_id IS NULL
         WHERE withholding.org_id=organization_id
          AND withholding.id=(component#>>'{withholding,withholding_id}')::uuid
          AND withholding.open_item_id=target.id AND withholding.status='deducted'
          AND withholding.deduction_trigger='credit'
          AND withholding.withheld_amount=(component#>>'{withholding,amount}')::numeric
          AND NOT EXISTS(SELECT 1 FROM tax.withholdings reversal
            WHERE reversal.org_id=withholding.org_id
             AND reversal.reversal_of_withholding_id=withholding.id);
        IF NOT FOUND THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice withholding must be exact pre-existing credit-time authority';
        END IF;
      END IF;
      IF component ? 'advance_application' THEN
        PERFORM "erp_finance_commands"."apply_supplier_advance"(organization_id,
          (component#>>'{advance_application,advance_allocation_id}')::uuid,
          (component#>>'{advance_application,supplier_invoice_line_id}')::uuid,target.id,
          (component#>>'{advance_application,allocation_id}')::uuid,
          (component#>>'{advance_application,journal_id}')::uuid,
          component#>>'{advance_application,journal_number}',
          (component#>>'{advance_application,event_id}')::uuid);
      END IF;
      IF component ? 'adjustment_application' THEN
        credit_amount:="erp_finance_commands"."apply_supplier_adjustment_credit"(organization_id,
          (component#>>'{adjustment_application,adjustment_note_id}')::uuid,
          (component#>>'{adjustment_application,source_open_item_id}')::uuid,target.id,
          (component#>>'{adjustment_application,allocation_id}')::uuid,payment.payment_date);
      END IF;
    END LOOP;
    IF cash_total<>payment.amount THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier payment cash components must exactly equal bank disbursement';
    END IF;
    RETURN payment_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."post_supplier_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, settlement_components jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."post_supplier_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, settlement_components jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE OR REPLACE FUNCTION "erp_finance_commands"."post_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE payment finance.payments%ROWTYPE; journal finance.journal_entries%ROWTYPE;
        settlement finance.accounts%ROWTYPE; bank finance.bank_accounts%ROWTYPE;
        actor uuid; posted_time timestamptz; existing_event uuid; settlement_line_count integer;
BEGIN
    IF organization_id IS DISTINCT FROM erp_security.current_org_id() THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment posting permission denied';
    END IF;
    actor:=erp_security.current_membership_id();
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(organization_id::text||payment_id::text,672001));
    SELECT * INTO payment FROM finance.payments WHERE org_id=organization_id AND id=payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='payment not found'; END IF;
    SELECT id INTO existing_event FROM finance.accounting_events WHERE org_id=organization_id AND payment_id=payment_id;
    IF payment.status='posted' AND existing_event=event_id THEN RETURN payment_id; END IF;
    IF payment.status<>'approved' OR payment.reversal_of_payment_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='only an approved original payment may be posted';
    END IF;
    IF NOT erp_security.can_access_branch(payment.branch_id)
       OR NOT erp_security.has_permission('finance.payment.manage',payment.branch_id)
       OR NOT erp_security.has_permission('finance.journal.post',payment.branch_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='payment branch permission denied';
    END IF;
    SELECT * INTO settlement FROM finance.accounts
     WHERE org_id=organization_id AND id=payment.settlement_account_id FOR SHARE;
    IF settlement.id IS NULL OR settlement.status<>'active' OR settlement.account_type<>'asset'
       OR settlement.currency_code<>payment.currency_code THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment settlement account must be an active matching-currency asset';
    END IF;
    IF payment.payment_method IN ('cash','cheque') THEN
      IF payment.bank_account_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cash or uncleared-cheque payment cannot reference a bank account';
      END IF;
    ELSE
      SELECT * INTO bank FROM finance.bank_accounts
       WHERE org_id=organization_id AND id=payment.bank_account_id FOR SHARE;
      IF bank.id IS NULL OR bank.status<>'active' OR bank.account_id<>settlement.id
         OR bank.currency_code<>payment.currency_code THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-cash payment bank identity must own the settlement account';
      END IF;
    END IF;
    IF payment.payment_purpose='supplier_advance'
       AND NOT "erp_finance_commands"."scope_active"('supplier_advance_payment',organization_id,payment_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier advance must use the typed gross-advance posting command';
    END IF;
    SELECT * INTO journal FROM finance.journal_entries WHERE org_id=organization_id AND id=journal_id FOR UPDATE;
    IF NOT FOUND OR journal.status<>'draft'
       OR (payment.payment_purpose<>'cheque_bounce' AND journal.reversal_of_journal_entry_id IS NOT NULL)
       OR (payment.payment_purpose='cheque_bounce' AND journal.reversal_of_journal_entry_id IS NULL)
       OR journal.transaction_currency<>payment.currency_code
       OR journal.transaction_debit_total<>payment.amount
       OR journal.functional_debit_total<>payment.functional_amount THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment journal does not exactly match payment amounts';
    END IF;
    SELECT count(*) INTO settlement_line_count FROM finance.journal_lines line
     WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
       AND line.branch_id=payment.branch_id AND line.account_id=payment.settlement_account_id
       AND ((payment.direction='receipt' AND line.transaction_debit=payment.amount
             AND line.transaction_credit=0 AND line.functional_debit=payment.functional_amount
             AND line.functional_credit=0)
         OR (payment.direction='disbursement' AND line.transaction_credit=payment.amount
             AND line.transaction_debit=0 AND line.functional_credit=payment.functional_amount
             AND line.functional_debit=0));
    IF settlement_line_count<>1 OR EXISTS(
      SELECT 1 FROM finance.journal_lines line
       WHERE line.org_id=organization_id AND line.journal_entry_id=journal_id
         AND line.branch_id<>payment.branch_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='payment journal settlement line or branch does not match payment';
    END IF;
    posted_time:=pg_catalog.transaction_timestamp();
    INSERT INTO "erp_finance_commands"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'payment',organization_id,payment_id);
    UPDATE finance.journal_entries SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
           updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=journal_id;
    UPDATE finance.payments SET status='posted',posted_at=posted_time,posted_by_membership_id=actor,
           updated_at=posted_time,updated_by_membership_id=actor,row_version=row_version+1
     WHERE org_id=organization_id AND id=payment_id;
    INSERT INTO finance.accounting_events(org_id,id,event_type,payment_id,journal_entry_id,
        occurred_at,source_posted_at,created_by_membership_id)
      VALUES(organization_id,event_id,'payment',payment_id,journal_id,posted_time,posted_time,actor);
    DELETE FROM "erp_finance_commands"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='payment' AND org_id=organization_id AND entity_id=payment_id;
    RETURN payment_id;
END
$function$;

ALTER FUNCTION "erp_finance_commands"."post_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_finance_commands"."post_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid) FROM PUBLIC, "erp_app", "erp_runtime";

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
        IF NOT FOUND THEN
          SELECT po_advance.* INTO advance FROM procurement.purchase_order_advance_allocations po_advance
            JOIN finance.accounting_events event ON event.org_id=po_advance.org_id
             AND event.payment_id=po_advance.payment_id AND event.event_type='payment'
           WHERE po_advance.org_id=NEW.org_id AND po_advance.prepayment_open_item_id=source_item.id
             AND event.id=source_item.accounting_event_id AND po_advance.status='posted'
             AND po_advance.reversal_of_allocation_id IS NULL FOR SHARE OF po_advance;
        END IF;
        IF (adjustment.id IS NULL AND advance.id IS NULL) OR source_item.status<>'open' OR source_item.id=item.id
           OR source_item.party_id<>item.party_id OR source_item.currency_code<>item.currency_code
           OR source_item.item_side=item.item_side
           OR (adjustment.id IS NOT NULL AND (adjustment.status<>'posted'
             OR adjustment.party_id<>source_item.party_id
             OR adjustment.counterparty_payable_amount<source_item.principal_amount))
           OR (advance.id IS NOT NULL AND (advance.gross_advance_amount<>source_item.principal_amount
             OR NOT EXISTS (SELECT 1 FROM parties.supplier_accounts supplier WHERE supplier.org_id=NEW.org_id
               AND supplier.id=advance.supplier_account_id AND supplier.party_id=item.party_id))) THEN
          RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='residual credit open item is incompatible with target open item';
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

GRANT EXECUTE ON FUNCTION "erp_automation_commands"."execute_approved_command"(organization_id uuid, command_request_id uuid) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_customer_receipt_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_supplier_payment_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."resolve_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, request_document jsonb) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_customer_cheque_clearance_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_automation_commands"."persist_customer_cheque_bounce_prepare"(organization_id uuid, membership_id uuid, auth_user_id uuid, application_user_id uuid, grant_id uuid, caller_client_id varchar, payment_id uuid, command_id uuid, journal_id uuid, event_id uuid, key_hash bytea, payment_sequence_key_hash bytea, journal_sequence_key_hash bytea, request_bytes bytea, resolved_bytes bytea, preview_bytes bytea, expires_at timestamptz) TO "erp_runtime";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."apply_supplier_adjustment_credit"(organization_id uuid, adjustment_note_id uuid, source_open_item_id uuid, target_open_item_id uuid, allocation_id uuid, application_date date) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."apply_supplier_advance"(organization_id uuid, advance_allocation_id uuid, supplier_invoice_line_id uuid, invoice_open_item_id uuid, allocation_id uuid, journal_id uuid, journal_number varchar, event_id uuid) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."post_customer_receipt"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, receipt_allocations jsonb, customer_advance_open_item_id uuid) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."post_customer_cheque_clearance"(organization_id uuid, original_payment_id uuid, clearance_payment_id uuid, journal_id uuid, event_id uuid) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."post_customer_cheque_bounce"(organization_id uuid, original_payment_id uuid, bounce_payment_id uuid, journal_id uuid, event_id uuid, compensating_allocations jsonb) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."post_supplier_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid, settlement_components jsonb) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_finance_commands"."post_payment"(organization_id uuid, payment_id uuid, journal_id uuid, event_id uuid) TO "erp_app";

RESET ROLE;
