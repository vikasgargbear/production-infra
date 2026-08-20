-- Generated canonical plumbing review artifact; baseline mapping is authoritative.
BEGIN;

DO $audit_crypto_preflight$
BEGIN
    IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'undefined_function', MESSAGE = 'extensions.digest(bytea,text) from pgcrypto is required';
    END IF;
END
$audit_crypto_preflight$;

CREATE SCHEMA "erp_plumbing" AUTHORIZATION "erp_migration_owner";

REVOKE ALL ON SCHEMA "erp_plumbing" FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_plumbing"."audit_row_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $audit_function$
DECLARE
    before_row jsonb;
    after_row jsonb;
    resource_row jsonb;
    event_org_id uuid;
    event_resource_id uuid;
    event_actor_id uuid;
    event_request_id uuid;
    event_command_id uuid;
    event_actor_kind text;
    event_source_ip inet;
    regulatory_import_scope boolean;
    provider_completion_scope boolean;
    before_hash bytea;
    after_hash bytea;
    prior_hash bytea;
    next_chain_sequence bigint;
    canonical_event jsonb;
BEGIN
    before_row := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN pg_catalog.to_jsonb(OLD) ELSE NULL END;
    after_row := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN pg_catalog.to_jsonb(NEW) ELSE NULL END;
    resource_row := COALESCE(after_row, before_row);
    event_org_id := COALESCE(
        NULLIF(resource_row ->> 'org_id', '')::uuid,
        CASE WHEN TG_TABLE_SCHEMA = 'core' AND TG_TABLE_NAME = 'organizations'
             THEN NULLIF(resource_row ->> 'id', '')::uuid END,
        NULLIF(pg_catalog.current_setting('app.org_id', true), '')::uuid
    );
    IF event_org_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audited mutation lacks organization context';
    END IF;
    event_request_id := NULLIF(pg_catalog.current_setting('app.request_id', true), '')::uuid;
    IF event_request_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'audited mutation lacks request id';
    END IF;
    event_actor_id := NULLIF(pg_catalog.current_setting('app.membership_id', true), '')::uuid;
    regulatory_import_scope := SESSION_USER = 'erp_regulatory_importer'
      AND event_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM erp_regulatory_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope='reference_import'
      );
    provider_completion_scope := SESSION_USER = 'erp_tax_provider'
      AND event_request_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM erp_tax_provider_commands.command_scopes AS scope
         WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
           AND scope.transaction_id=pg_catalog.txid_current()
           AND scope.scope='provider_complete'
      );
    IF event_actor_id IS NULL
       AND NOT pg_catalog.pg_has_role(SESSION_USER, 'erp_migration_owner', 'MEMBER')
       AND NOT regulatory_import_scope
       AND NOT provider_completion_scope THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'runtime audited mutation lacks actor membership';
    END IF;
    event_actor_kind := CASE
      WHEN event_actor_id IS NOT NULL THEN 'membership'
      WHEN regulatory_import_scope THEN 'system'
      WHEN provider_completion_scope THEN 'system'
      ELSE 'migration'
    END;
    event_command_id := NULLIF(pg_catalog.current_setting('app.command_request_id', true), '')::uuid;
    event_source_ip := NULLIF(pg_catalog.current_setting('app.source_ip', true), '')::inet;
    event_resource_id := CASE
        WHEN COALESCE(resource_row ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (resource_row ->> 'id')::uuid ELSE NULL END;
    before_hash := CASE WHEN before_row IS NULL THEN NULL ELSE extensions.digest(pg_catalog.convert_to(before_row::text, 'UTF8'), 'sha256') END;
    after_hash := CASE WHEN after_row IS NULL THEN NULL ELSE extensions.digest(pg_catalog.convert_to(after_row::text, 'UTF8'), 'sha256') END;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(event_org_id::text, 9042026));
    SELECT event.chain_sequence + 1, event.evidence_hash INTO next_chain_sequence, prior_hash
      FROM core.audit_events AS event
     WHERE event.org_id = event_org_id
     ORDER BY event.chain_sequence DESC
     LIMIT 1
     FOR UPDATE;
    next_chain_sequence := COALESCE(next_chain_sequence, 1);
    canonical_event := pg_catalog.jsonb_build_object(
        'version', 'pg-jsonb-sha256-v1', 'org_id', event_org_id,
        'chain_sequence', next_chain_sequence, 'request_id', event_request_id,
        'command_request_id', event_command_id, 'actor_membership_id', event_actor_id,
        'actor_kind', event_actor_kind, 'event_type', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || pg_catalog.lower(TG_OP),
        'resource_type', TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, 'resource_id', event_resource_id,
        'mutation_kind', pg_catalog.lower(TG_OP), 'before_state_hash', pg_catalog.encode(before_hash, 'hex'),
        'after_state_hash', pg_catalog.encode(after_hash, 'hex'), 'previous_event_hash', pg_catalog.encode(prior_hash, 'hex')
    );
    INSERT INTO core.audit_events (
        org_id, chain_sequence, actor_membership_id, actor_kind, event_type, resource_type, resource_id,
        request_id, command_request_id, mutation_kind, summary, evidence_version,
        before_state_hash, after_state_hash, evidence_hash, previous_event_hash, source_ip, user_agent
    ) VALUES (
        event_org_id, next_chain_sequence, event_actor_id, event_actor_kind,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || '.' || pg_catalog.lower(TG_OP),
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, event_resource_id, event_request_id,
        event_command_id, pg_catalog.lower(TG_OP), pg_catalog.lower(TG_OP) || ' ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        'pg-jsonb-sha256-v1', before_hash, after_hash,
        extensions.digest(pg_catalog.convert_to(canonical_event::text, 'UTF8'), 'sha256'),
        prior_hash, event_source_ip, NULLIF(pg_catalog.current_setting('app.user_agent', true), '')
    );
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$audit_function$;

ALTER FUNCTION "erp_plumbing"."audit_row_mutation"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_plumbing"."audit_row_mutation"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE TRIGGER "automation_agent_grant_capabilities_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "automation"."agent_grant_capabilities" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "automation_agent_grants_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "automation"."agent_grants" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "automation_command_approvals_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "automation"."command_approvals" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "automation_command_requests_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "automation"."command_requests" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "calculation_artifacts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "calculation"."artifacts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "catalog_categories_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "catalog"."categories" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "catalog_commercial_charge_tax_profiles_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "catalog"."commercial_charge_tax_profiles" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "catalog_product_ingredients_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "catalog"."product_ingredients" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "catalog_products_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "catalog"."products" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "catalog_uom_conversions_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "catalog"."uom_conversions" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_controlled_substance_entries_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."controlled_substance_entries" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_destructions_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."destructions" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_licenses_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."licenses" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_recall_batches_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."recall_batches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_recalls_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."recalls" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_storage_rule_versions_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."storage_rule_versions" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "compliance_temperature_readings_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."temperature_readings" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_access_grants_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."access_grants" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_attachments_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."attachments" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_branches_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."branches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_data_retention_cases_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."data_retention_cases" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_document_sequences_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."document_sequences" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_idempotency_keys_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."idempotency_keys" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_memberships_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."memberships" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_organizations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."organizations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_outbox_events_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."outbox_events" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_role_permissions_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."role_permissions" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_roles_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."roles" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_settings_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."settings" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "core_users_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "core"."users" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_accounting_events_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."accounting_events" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_accounts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."accounts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_adjustment_note_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."adjustment_note_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_adjustment_notes_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."adjustment_notes" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_allocations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_bank_accounts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."bank_accounts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_bank_statement_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."bank_statement_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_bank_statements_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."bank_statements" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_expense_claim_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."expense_claim_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_expense_claims_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."expense_claims" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_journal_entries_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."journal_entries" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_journal_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."journal_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_open_items_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."open_items" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_payments_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."payments" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "finance_reconciliation_matches_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "finance"."reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "hr_departments_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "hr"."departments" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "hr_employees_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "hr"."employees" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "inventory_batches_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."batches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "inventory_inventory_document_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."inventory_document_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "inventory_inventory_documents_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."inventory_documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "inventory_locations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."locations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "inventory_reservations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."reservations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "inventory_stock_ledger_entries_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "parties_addresses_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "parties"."addresses" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "parties_contacts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "parties"."contacts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "parties_customer_accounts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "parties"."customer_accounts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "parties_parties_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "parties"."parties" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "parties_supplier_accounts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "parties"."supplier_accounts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "parties_tax_registrations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "parties"."tax_registrations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_goods_receipt_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."goods_receipt_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_goods_receipts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."goods_receipts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_purchase_order_advance_allocations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_order_advance_allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_purchase_order_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_order_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_purchase_orders_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_orders" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_purchase_return_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_return_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_purchase_returns_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_returns" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_supplier_invoice_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."supplier_invoice_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_supplier_invoice_receipt_allocations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."supplier_invoice_receipt_allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "procurement_supplier_invoices_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."supplier_invoices" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_dispatch_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."dispatch_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_dispatches_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."dispatches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_invoice_dispatch_allocations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."invoice_dispatch_allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_invoice_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."invoice_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_invoices_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."invoices" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_order_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."order_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_orders_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."orders" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_return_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."return_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "sales_returns_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "sales"."returns" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_documents_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_einvoices_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."einvoices" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_eway_bills_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."eway_bills" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_organization_fiscal_tax_facts_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."organization_fiscal_tax_facts" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_portal_document_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."portal_document_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_portal_documents_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."portal_documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_reconciliation_items_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."reconciliation_items" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_reconciliation_runs_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."reconciliation_runs" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_registration_branches_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."registration_branches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_registrations_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."registrations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_return_documents_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."return_documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_return_periods_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."return_periods" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_returns_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."returns" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_basis_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_basis_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_certificate_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_certificate_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_certificates_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_certificates" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_deposit_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_deposit_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_deposits_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_deposits" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_statement_lines_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_statement_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholding_statements_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholding_statements" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE TRIGGER "tax_withholdings_audit_trg" AFTER INSERT OR UPDATE OR DELETE ON "tax"."withholdings" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."audit_row_mutation"();

CREATE FUNCTION "erp_plumbing"."reject_row_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $immutable_function$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME || ' is immutable; append a reversal or supersession';
END
$immutable_function$;

ALTER FUNCTION "erp_plumbing"."reject_row_mutation"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_plumbing"."reject_row_mutation"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE TRIGGER "automation_command_approvals_immutable_trg" BEFORE UPDATE OR DELETE ON "automation"."command_approvals" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "compliance_controlled_substance_entries_immutable_trg" BEFORE UPDATE OR DELETE ON "compliance"."controlled_substance_entries" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "compliance_temperature_readings_immutable_trg" BEFORE UPDATE OR DELETE ON "compliance"."temperature_readings" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "core_attachments_immutable_trg" BEFORE UPDATE OR DELETE ON "core"."attachments" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "core_audit_events_immutable_trg" BEFORE UPDATE OR DELETE ON "core"."audit_events" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "finance_accounting_events_immutable_trg" BEFORE UPDATE OR DELETE ON "finance"."accounting_events" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "finance_allocations_immutable_trg" BEFORE UPDATE OR DELETE ON "finance"."allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "finance_bank_statement_lines_immutable_trg" BEFORE UPDATE OR DELETE ON "finance"."bank_statement_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "finance_reconciliation_matches_immutable_trg" BEFORE UPDATE OR DELETE ON "finance"."reconciliation_matches" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "inventory_stock_ledger_entries_immutable_trg" BEFORE UPDATE OR DELETE ON "inventory"."stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "procurement_supplier_invoice_receipt_allocations_immutable_trg" BEFORE UPDATE OR DELETE ON "procurement"."supplier_invoice_receipt_allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "sales_invoice_dispatch_allocations_immutable_trg" BEFORE UPDATE OR DELETE ON "sales"."invoice_dispatch_allocations" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_documents_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_portal_document_lines_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."portal_document_lines" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_reconciliation_items_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."reconciliation_items" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_return_documents_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."return_documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_withholding_certificates_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."withholding_certificates" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_withholding_deposits_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."withholding_deposits" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE TRIGGER "tax_withholding_statements_immutable_trg" BEFORE UPDATE OR DELETE ON "tax"."withholding_statements" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."reject_row_mutation"();

CREATE FUNCTION "erp_plumbing"."enqueue_state_outbox"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $outbox_function$
DECLARE
    row_data jsonb := pg_catalog.to_jsonb(NEW);
    old_data jsonb := CASE WHEN TG_OP = 'UPDATE' THEN pg_catalog.to_jsonb(OLD) ELSE NULL END;
    row_status text := row_data ->> 'status';
    outbox_aggregate_id uuid := (row_data ->> 'id')::uuid;
    outbox_event_version bigint := COALESCE(NULLIF(row_data ->> 'row_version', '')::bigint, 1);
    outbox_event_type text;
    outbox_payload bytea;
BEGIN
    IF pg_catalog.strpos(',' || TG_ARGV[1] || ',', ',' || row_status || ',') = 0 THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND old_data ->> 'status' IS NOT DISTINCT FROM row_status THEN
        RETURN NEW;
    END IF;
    outbox_event_type := TG_ARGV[0] || '.' || row_status;
    outbox_payload := pg_catalog.convert_to(pg_catalog.jsonb_build_object(
        'event_type', outbox_event_type, 'aggregate_type', TG_ARGV[0],
        'aggregate_id', outbox_aggregate_id, 'event_version', outbox_event_version,
        'organization_id', row_data ->> 'org_id', 'status', row_status
    )::text, 'UTF8');
    INSERT INTO core.outbox_events (
        org_id, event_type, aggregate_type, aggregate_id, event_version,
        media_type, payload_bytes, payload_hash
    ) VALUES (
        (row_data ->> 'org_id')::uuid, outbox_event_type, TG_ARGV[0], outbox_aggregate_id,
        outbox_event_version, 'application/json', outbox_payload,
        extensions.digest(outbox_payload, 'sha256')
    ) ON CONFLICT (org_id, aggregate_type, aggregate_id, event_type, event_version) DO NOTHING;
    RETURN NEW;
END
$outbox_function$;

ALTER FUNCTION "erp_plumbing"."enqueue_state_outbox"() OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_plumbing"."enqueue_state_outbox"() FROM PUBLIC, "erp_app", "erp_runtime";

CREATE TRIGGER "automation_command_requests_outbox_trg" AFTER INSERT OR UPDATE OF status ON "automation"."command_requests" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('command', 'succeeded,failed');

CREATE TRIGGER "compliance_recalls_outbox_trg" AFTER INSERT OR UPDATE OF status ON "compliance"."recalls" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('recall', 'in_progress,closed,cancelled');

CREATE TRIGGER "finance_journal_entries_outbox_trg" AFTER INSERT OR UPDATE OF status ON "finance"."journal_entries" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('journal_entry', 'posted,reversed');

CREATE TRIGGER "finance_payments_outbox_trg" AFTER INSERT OR UPDATE OF status ON "finance"."payments" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('payment', 'posted,reversed,cancelled');

CREATE TRIGGER "inventory_inventory_documents_outbox_trg" AFTER INSERT OR UPDATE OF status ON "inventory"."inventory_documents" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('inventory_document', 'posted,reversed');

CREATE TRIGGER "procurement_purchase_returns_outbox_trg" AFTER INSERT OR UPDATE OF status ON "procurement"."purchase_returns" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('purchase_return', 'posted,reversed');

CREATE TRIGGER "procurement_supplier_invoices_outbox_trg" AFTER INSERT OR UPDATE OF status ON "procurement"."supplier_invoices" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('supplier_invoice', 'posted,reversed');

CREATE TRIGGER "sales_invoices_outbox_trg" AFTER INSERT OR UPDATE OF status ON "sales"."invoices" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('sales_invoice', 'posted,reversed');

CREATE TRIGGER "sales_returns_outbox_trg" AFTER INSERT OR UPDATE OF status ON "sales"."returns" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('sales_return', 'posted,reversed');

CREATE TRIGGER "tax_einvoices_outbox_trg" AFTER INSERT OR UPDATE OF status ON "tax"."einvoices" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('einvoice', 'generated,failed,cancelled');

CREATE TRIGGER "tax_eway_bills_outbox_trg" AFTER INSERT OR UPDATE OF status ON "tax"."eway_bills" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('eway_bill', 'generated,failed,cancelled,expired');

CREATE TRIGGER "tax_returns_outbox_trg" AFTER INSERT OR UPDATE OF status ON "tax"."returns" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('tax_return', 'filed,rejected,superseded');

CREATE TRIGGER "tax_withholdings_outbox_trg" AFTER INSERT OR UPDATE OF status ON "tax"."withholdings" FOR EACH ROW EXECUTE FUNCTION "erp_plumbing"."enqueue_state_outbox"('withholding', 'deducted,reversed');

COMMIT;
