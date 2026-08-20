-- Canonical ERP runtime roles and row-level security
-- REVIEWED, NOT APPLIED. Include only after the canonical baseline tables exist.
-- canonical_catalog_sha256: ed41ed6c81bc3c3657975dc33ce531d673318d7c907e07257ab8ca319dc21264
-- PostgreSQL 15+; execute as a role allowed to create roles and transfer ownership.

BEGIN;

CREATE ROLE "erp_migration_owner" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT BYPASSRLS;
CREATE ROLE "erp_app" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
CREATE ROLE "erp_runtime" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
GRANT "erp_app" TO "erp_runtime";
REVOKE "erp_migration_owner" FROM "erp_app", "erp_runtime";
REVOKE CREATE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "extensions" TO "erp_migration_owner";
CREATE SCHEMA "erp_security" AUTHORIZATION "erp_migration_owner";
REVOKE ALL ON SCHEMA "erp_security" FROM PUBLIC;
GRANT USAGE ON SCHEMA "erp_security" TO "erp_app";

ALTER SCHEMA "automation" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "automation" FROM PUBLIC;
GRANT USAGE ON SCHEMA "automation" TO "erp_app";
ALTER SCHEMA "calculation" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "calculation" FROM PUBLIC;
GRANT USAGE ON SCHEMA "calculation" TO "erp_app";
ALTER SCHEMA "catalog" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "catalog" FROM PUBLIC;
GRANT USAGE ON SCHEMA "catalog" TO "erp_app";
ALTER SCHEMA "compliance" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "compliance" FROM PUBLIC;
GRANT USAGE ON SCHEMA "compliance" TO "erp_app";
ALTER SCHEMA "core" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "core" FROM PUBLIC;
GRANT USAGE ON SCHEMA "core" TO "erp_app";
ALTER SCHEMA "finance" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "finance" FROM PUBLIC;
GRANT USAGE ON SCHEMA "finance" TO "erp_app";
ALTER SCHEMA "hr" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "hr" FROM PUBLIC;
GRANT USAGE ON SCHEMA "hr" TO "erp_app";
ALTER SCHEMA "inventory" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "inventory" FROM PUBLIC;
GRANT USAGE ON SCHEMA "inventory" TO "erp_app";
ALTER SCHEMA "parties" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "parties" FROM PUBLIC;
GRANT USAGE ON SCHEMA "parties" TO "erp_app";
ALTER SCHEMA "procurement" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "procurement" FROM PUBLIC;
GRANT USAGE ON SCHEMA "procurement" TO "erp_app";
ALTER SCHEMA "sales" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "sales" FROM PUBLIC;
GRANT USAGE ON SCHEMA "sales" TO "erp_app";
ALTER SCHEMA "tax" OWNER TO "erp_migration_owner";
REVOKE ALL ON SCHEMA "tax" FROM PUBLIC;
GRANT USAGE ON SCHEMA "tax" TO "erp_app";

ALTER TABLE "automation"."agent_grant_capabilities" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "automation"."agent_grant_capabilities" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "automation"."agent_grants" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "automation"."agent_grants" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "automation"."command_approvals" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "automation"."command_approvals" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "automation"."command_requests" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "automation"."command_requests" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "calculation"."artifacts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "calculation"."artifacts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."categories" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."categories" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."commercial_charge_tax_profiles" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."commercial_charge_tax_profiles" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."ingredients" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."ingredients" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."product_ingredients" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."product_ingredients" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."products" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."products" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."units_of_measure" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."units_of_measure" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "catalog"."uom_conversions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "catalog"."uom_conversions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."controlled_movement_rule_versions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."controlled_movement_rule_versions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."controlled_substance_entries" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."controlled_substance_entries" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."destructions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."destructions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."licenses" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."licenses" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."recall_batches" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."recall_batches" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."recalls" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."recalls" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."storage_rule_versions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."storage_rule_versions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "compliance"."temperature_readings" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "compliance"."temperature_readings" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."access_grants" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."access_grants" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."attachments" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."attachments" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."audit_events" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."audit_events" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."branches" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."branches" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."data_retention_cases" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."data_retention_cases" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."document_sequences" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."document_sequences" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."idempotency_keys" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."idempotency_keys" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."memberships" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."memberships" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."organizations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."organizations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."outbox_events" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."outbox_events" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."permissions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."permissions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."reference_data_releases" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."reference_data_releases" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."role_permissions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."role_permissions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."roles" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."roles" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."settings" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."settings" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "core"."users" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "core"."users" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."accounting_events" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."accounting_events" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."accounts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."accounts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."adjustment_note_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."adjustment_note_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."adjustment_notes" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."adjustment_notes" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."allocations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."allocations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."bank_accounts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."bank_accounts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."bank_statement_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."bank_statement_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."bank_statements" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."bank_statements" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."expense_claim_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."expense_claim_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."expense_claims" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."expense_claims" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."journal_entries" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."journal_entries" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."journal_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."journal_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."open_items" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."open_items" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."payments" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."payments" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "finance"."reconciliation_matches" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "finance"."reconciliation_matches" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "hr"."departments" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "hr"."departments" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "hr"."employees" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "hr"."employees" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."batches" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."batches" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."inventory_document_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."inventory_document_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."inventory_documents" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."inventory_documents" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."locations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."locations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."reservations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."reservations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."stock_balances" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."stock_balances" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "inventory"."stock_ledger_entries" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "inventory"."stock_ledger_entries" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "parties"."addresses" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "parties"."addresses" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "parties"."contacts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "parties"."contacts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "parties"."customer_accounts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "parties"."customer_accounts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "parties"."parties" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "parties"."parties" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "parties"."supplier_accounts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "parties"."supplier_accounts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "parties"."tax_registrations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "parties"."tax_registrations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."goods_receipt_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."goods_receipt_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."goods_receipts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."goods_receipts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."purchase_order_advance_allocations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."purchase_order_advance_allocations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."purchase_order_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."purchase_order_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."purchase_orders" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."purchase_orders" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."purchase_return_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."purchase_return_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."purchase_returns" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."purchase_returns" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."supplier_invoice_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."supplier_invoice_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."supplier_invoice_receipt_allocations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."supplier_invoice_receipt_allocations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "procurement"."supplier_invoices" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "procurement"."supplier_invoices" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."dispatch_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."dispatch_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."dispatches" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."dispatches" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."invoice_dispatch_allocations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."invoice_dispatch_allocations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."invoice_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."invoice_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."invoices" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."invoices" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."order_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."order_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."orders" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."orders" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."return_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."return_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "sales"."returns" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "sales"."returns" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."documents" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."documents" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."einvoice_rule_versions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."einvoice_rule_versions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."einvoices" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."einvoices" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."eway_bills" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."eway_bills" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."gst_adjustment_rule_versions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."gst_adjustment_rule_versions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."organization_fiscal_tax_facts" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."organization_fiscal_tax_facts" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."portal_document_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."portal_document_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."portal_documents" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."portal_documents" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."reconciliation_items" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."reconciliation_items" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."reconciliation_runs" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."reconciliation_runs" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."registration_branches" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."registration_branches" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."registrations" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."registrations" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."return_documents" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."return_documents" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."return_periods" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."return_periods" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."returns" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."returns" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."tax_code_versions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."tax_code_versions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_basis_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_basis_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_certificate_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_certificate_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_certificates" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_certificates" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_deposit_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_deposit_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_deposits" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_deposits" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_rule_versions" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_rule_versions" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_statement_lines" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_statement_lines" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholding_statements" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholding_statements" FROM PUBLIC, "erp_app", "erp_runtime";
ALTER TABLE "tax"."withholdings" OWNER TO "erp_migration_owner";
REVOKE ALL ON TABLE "tax"."withholdings" FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_security"."current_org_id"()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    value text;
BEGIN
    value := pg_catalog.current_setting('app.org_id', true);
    IF value IS NULL OR pg_catalog.btrim(value) = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN value::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$function$;
CREATE FUNCTION "erp_security"."current_membership_id"()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
DECLARE
    value text;
BEGIN
    value := pg_catalog.current_setting('app.membership_id', true);
    IF value IS NULL OR pg_catalog.btrim(value) = '' THEN
        RETURN NULL;
    END IF;
    BEGIN
        RETURN value::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RETURN NULL;
    END;
END;
$function$;
CREATE FUNCTION "erp_security"."is_active_membership"(organization_id uuid, membership_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT organization_id IS NOT NULL
       AND membership_id IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM core.memberships AS membership
              JOIN core.organizations AS organization
                ON organization.id = membership.org_id
             WHERE membership.org_id = organization_id
               AND membership.id = membership_id
               AND membership.status = 'active'
               AND membership.joined_at IS NOT NULL
               AND membership.revoked_at IS NULL
               AND organization.status = 'active'
       );
$function$;
CREATE FUNCTION "erp_security"."current_actor_is_active"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
        erp_security.current_org_id(),
        erp_security.current_membership_id()
    );
$function$;
CREATE FUNCTION "erp_security"."activate_context"(verified_auth_user_id uuid, requested_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
DECLARE
    resolved_user_id uuid;
    resolved_membership_id uuid;
BEGIN
    IF verified_auth_user_id IS NULL OR requested_organization_id IS NULL THEN
        RAISE EXCEPTION 'invalid or inactive ERP authenticated organization membership'
            USING ERRCODE = '42501';
    END IF;

    BEGIN
        SELECT user_row.id, membership.id
          INTO STRICT resolved_user_id, resolved_membership_id
          FROM core.users AS user_row
          JOIN core.memberships AS membership
            ON membership.user_id = user_row.id
          JOIN core.organizations AS organization
            ON organization.id = membership.org_id
         WHERE user_row.auth_user_id = verified_auth_user_id
           AND user_row.status = 'active'
           AND membership.org_id = requested_organization_id
           AND membership.status = 'active'
           AND membership.joined_at IS NOT NULL
           AND membership.revoked_at IS NULL
           AND organization.status = 'active';
    EXCEPTION
        WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
            RAISE EXCEPTION 'invalid or inactive ERP authenticated organization membership'
                USING ERRCODE = '42501';
    END;

    PERFORM pg_catalog.set_config('app.auth_user_id', verified_auth_user_id::text, true);
    PERFORM pg_catalog.set_config('app.user_id', resolved_user_id::text, true);
    PERFORM pg_catalog.set_config('app.org_id', requested_organization_id::text, true);
    PERFORM pg_catalog.set_config('app.membership_id', resolved_membership_id::text, true);
END;
$function$;
CREATE FUNCTION "erp_security"."current_user_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT membership.user_id
      FROM core.memberships AS membership
     WHERE membership.org_id = erp_security.current_org_id()
       AND membership.id = erp_security.current_membership_id()
       AND membership.status = 'active'
       AND erp_security.current_actor_is_active();
$function$;
CREATE FUNCTION "erp_security"."can_access_branch"(target_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND (
            target_branch_id IS NULL
            OR EXISTS (
                SELECT 1
                  FROM core.access_grants AS grant_row
                  JOIN core.roles AS role_row
                    ON role_row.org_id = grant_row.org_id
                   AND role_row.id = grant_row.role_id
                 WHERE grant_row.org_id = erp_security.current_org_id()
                   AND grant_row.membership_id = erp_security.current_membership_id()
                   AND grant_row.status = 'active'
                   AND role_row.status = 'active'
                   AND grant_row.valid_from_at <= pg_catalog.transaction_timestamp()
                   AND (grant_row.expires_at IS NULL OR grant_row.expires_at > pg_catalog.transaction_timestamp())
                   AND (
                        grant_row.scope_kind = 'organization'
                        OR (grant_row.scope_kind = 'branch' AND grant_row.branch_id = target_branch_id)
                   )
            )
       );
$function$;
CREATE FUNCTION "erp_security"."has_permission"(permission_code text, target_branch_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND EXISTS (
            SELECT 1
              FROM core.access_grants AS grant_row
              JOIN core.roles AS role_row
                ON role_row.org_id = grant_row.org_id
               AND role_row.id = grant_row.role_id
              JOIN core.role_permissions AS role_permission
                ON role_permission.org_id = role_row.org_id
               AND role_permission.role_id = role_row.id
              JOIN core.permissions AS permission_row
                ON permission_row.code = role_permission.permission_code
             WHERE grant_row.org_id = erp_security.current_org_id()
               AND grant_row.membership_id = erp_security.current_membership_id()
               AND grant_row.status = 'active'
               AND role_row.status = 'active'
               AND permission_row.status = 'active'
               AND role_permission.permission_code = permission_code
               AND grant_row.valid_from_at <= pg_catalog.transaction_timestamp()
               AND (grant_row.expires_at IS NULL OR grant_row.expires_at > pg_catalog.transaction_timestamp())
               AND (
                    (target_branch_id IS NULL AND grant_row.scope_kind = 'organization')
                    OR (
                        target_branch_id IS NOT NULL
                        AND (
                            grant_row.scope_kind = 'organization'
                            OR (grant_row.scope_kind = 'branch' AND grant_row.branch_id = target_branch_id)
                        )
                    )
               )
       );
$function$;
CREATE FUNCTION "erp_security"."can_view_user"(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
SET row_security = off
AS $function$
    SELECT erp_security.is_active_membership(
               erp_security.current_org_id(), erp_security.current_membership_id()
           )
       AND EXISTS (
            SELECT 1
              FROM core.memberships AS actor_membership
              JOIN core.memberships AS target_membership
                ON target_membership.org_id = actor_membership.org_id
             WHERE actor_membership.org_id = erp_security.current_org_id()
               AND actor_membership.id = erp_security.current_membership_id()
               AND actor_membership.status = 'active'
               AND target_membership.user_id = target_user_id
       );
$function$;

ALTER FUNCTION "erp_security"."is_active_membership"(uuid, uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."is_active_membership"(uuid, uuid) FROM PUBLIC, "erp_app", "erp_runtime";
ALTER FUNCTION "erp_security"."current_org_id"() OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."current_org_id"() FROM PUBLIC;
ALTER FUNCTION "erp_security"."current_membership_id"() OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."current_membership_id"() FROM PUBLIC;
ALTER FUNCTION "erp_security"."current_actor_is_active"() OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."current_actor_is_active"() FROM PUBLIC;
ALTER FUNCTION "erp_security"."activate_context"(uuid, uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."activate_context"(uuid, uuid) FROM PUBLIC;
ALTER FUNCTION "erp_security"."current_user_id"() OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."current_user_id"() FROM PUBLIC;
ALTER FUNCTION "erp_security"."can_access_branch"(uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."can_access_branch"(uuid) FROM PUBLIC;
ALTER FUNCTION "erp_security"."has_permission"(text, uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."has_permission"(text, uuid) FROM PUBLIC;
ALTER FUNCTION "erp_security"."can_view_user"(uuid) OWNER TO "erp_migration_owner";
REVOKE ALL ON FUNCTION "erp_security"."can_view_user"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "erp_security"."current_org_id"() TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."current_membership_id"() TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."current_actor_is_active"() TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."activate_context"(uuid, uuid) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."current_user_id"() TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."can_access_branch"(uuid) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."has_permission"(text, uuid) TO "erp_app";
GRANT EXECUTE ON FUNCTION "erp_security"."can_view_user"(uuid) TO "erp_app";

ALTER TABLE "automation"."agent_grant_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation"."agent_grant_capabilities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "automation"."agent_grant_capabilities" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "automation"."agent_grant_capabilities" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('automation.agent_grant.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "automation"."agent_grant_capabilities" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('automation.agent_grant.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('automation.agent_grant.manage', NULL::uuid));
ALTER TABLE "automation"."agent_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation"."agent_grants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "automation"."agent_grants" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "automation"."agent_grants" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('automation.agent_grant.manage', "branch_id"));
CREATE POLICY "erp_update" ON "automation"."agent_grants" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('automation.agent_grant.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('automation.agent_grant.manage', "branch_id"));
ALTER TABLE "automation"."command_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation"."command_approvals" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "automation"."command_approvals" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "automation"."command_approvals" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('automation.command.approve', NULL::uuid));
ALTER TABLE "automation"."command_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "automation"."command_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "automation"."command_requests" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "automation"."command_requests" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('automation.command.execute', "branch_id"));
CREATE POLICY "erp_update" ON "automation"."command_requests" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('automation.command.execute', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('automation.command.execute', "branch_id"));
ALTER TABLE "calculation"."artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calculation"."artifacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "calculation"."artifacts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
ALTER TABLE "catalog"."categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog"."categories" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."categories" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "catalog"."categories" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.category.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "catalog"."categories" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.category.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.category.manage', NULL::uuid));
ALTER TABLE "catalog"."commercial_charge_tax_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog"."commercial_charge_tax_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."commercial_charge_tax_profiles" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "catalog"."commercial_charge_tax_profiles" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "catalog"."commercial_charge_tax_profiles" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
ALTER TABLE "catalog"."ingredients" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."ingredients" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "catalog"."product_ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog"."product_ingredients" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."product_ingredients" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "catalog"."product_ingredients" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "catalog"."product_ingredients" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
ALTER TABLE "catalog"."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog"."products" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."products" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "catalog"."products" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "catalog"."products" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
ALTER TABLE "catalog"."units_of_measure" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."units_of_measure" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "catalog"."uom_conversions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "catalog"."uom_conversions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "catalog"."uom_conversions" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "catalog"."uom_conversions" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "catalog"."uom_conversions" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('catalog.product.manage', NULL::uuid));
ALTER TABLE "compliance"."controlled_movement_rule_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."controlled_movement_rule_versions" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "compliance"."controlled_substance_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."controlled_substance_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."controlled_substance_entries" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "compliance"."controlled_substance_entries" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.controlled_substance.post', NULL::uuid));
ALTER TABLE "compliance"."destructions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."destructions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."destructions" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "compliance"."destructions" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.destruction.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "compliance"."destructions" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.destruction.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.destruction.manage', NULL::uuid));
ALTER TABLE "compliance"."licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."licenses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."licenses" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "compliance"."licenses" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('compliance.license.manage', "branch_id"));
CREATE POLICY "erp_update" ON "compliance"."licenses" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('compliance.license.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('compliance.license.manage', "branch_id"));
ALTER TABLE "compliance"."recall_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."recall_batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."recall_batches" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "compliance"."recall_batches" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.recall.execute', NULL::uuid));
CREATE POLICY "erp_update" ON "compliance"."recall_batches" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.recall.execute', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.recall.execute', NULL::uuid));
ALTER TABLE "compliance"."recalls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."recalls" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."recalls" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "compliance"."recalls" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.recall.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "compliance"."recalls" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.recall.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.recall.manage', NULL::uuid));
ALTER TABLE "compliance"."storage_rule_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."storage_rule_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."storage_rule_versions" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "compliance"."storage_rule_versions" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.license.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "compliance"."storage_rule_versions" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.license.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('compliance.license.manage', NULL::uuid));
ALTER TABLE "compliance"."temperature_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "compliance"."temperature_readings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "compliance"."temperature_readings" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "compliance"."temperature_readings" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.temperature.ingest', NULL::uuid));
ALTER TABLE "core"."access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."access_grants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."access_grants" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "core"."access_grants" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('core.access.manage', "branch_id"));
CREATE POLICY "erp_update" ON "core"."access_grants" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('core.access.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('core.access.manage', "branch_id"));
ALTER TABLE "core"."attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."attachments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."attachments" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."attachments" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.attachment.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."attachments" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.attachment.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.attachment.manage', NULL::uuid));
ALTER TABLE "core"."audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."audit_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."audit_events" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."audit_events" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.audit.append', NULL::uuid));
ALTER TABLE "core"."branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."branches" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("id"));
CREATE POLICY "erp_insert" ON "core"."branches" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("id") AND erp_security.has_permission('core.branch.manage', "id"));
CREATE POLICY "erp_update" ON "core"."branches" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("id") AND erp_security.has_permission('core.branch.manage', "id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("id") AND erp_security.has_permission('core.branch.manage', "id"));
ALTER TABLE "core"."data_retention_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."data_retention_cases" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."data_retention_cases" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."data_retention_cases" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.retention.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."data_retention_cases" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.retention.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.retention.manage', NULL::uuid));
ALTER TABLE "core"."document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."document_sequences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."document_sequences" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "core"."document_sequences" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('internal.sequence.allocate', "branch_id"));
CREATE POLICY "erp_update" ON "core"."document_sequences" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('internal.sequence.allocate', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('internal.sequence.allocate', "branch_id"));
ALTER TABLE "core"."idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."idempotency_keys" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."idempotency_keys" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.idempotency.claim', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."idempotency_keys" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.idempotency.claim', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.idempotency.claim', NULL::uuid));
ALTER TABLE "core"."memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."memberships" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."memberships" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."memberships" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."memberships" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid));
ALTER TABLE "core"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."organizations" FOR SELECT TO "erp_app" USING ("id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_update" ON "core"."organizations" FOR UPDATE TO "erp_app" USING ("id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.organization.manage', NULL::uuid)) WITH CHECK ("id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.organization.manage', NULL::uuid));
ALTER TABLE "core"."outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."outbox_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."outbox_events" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."outbox_events" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.outbox.deliver', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."outbox_events" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.outbox.deliver', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.outbox.deliver', NULL::uuid));
ALTER TABLE "core"."permissions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."permissions" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "core"."reference_data_releases" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."reference_data_releases" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "core"."role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."role_permissions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."role_permissions" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."role_permissions" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid));
CREATE POLICY "erp_delete" ON "core"."role_permissions" FOR DELETE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid));
ALTER TABLE "core"."roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."roles" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "core"."roles" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."roles" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('core.access.manage', NULL::uuid));
ALTER TABLE "core"."settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."settings" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "core"."settings" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('core.settings.manage', "branch_id"));
CREATE POLICY "erp_update" ON "core"."settings" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('core.settings.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('core.settings.manage', "branch_id"));
ALTER TABLE "core"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "core"."users" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "core"."users" FOR SELECT TO "erp_app" USING (erp_security.can_view_user("id"));
CREATE POLICY "erp_insert" ON "core"."users" FOR INSERT TO "erp_app" WITH CHECK (erp_security.current_actor_is_active() AND erp_security.has_permission('core.user.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "core"."users" FOR UPDATE TO "erp_app" USING (erp_security.can_view_user("id") AND erp_security.has_permission('core.user.manage', NULL::uuid)) WITH CHECK (erp_security.can_view_user("id") AND erp_security.has_permission('core.user.manage', NULL::uuid));
ALTER TABLE "finance"."accounting_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."accounting_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."accounting_events" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."accounting_events" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.accounting.post', NULL::uuid));
ALTER TABLE "finance"."accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."accounts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."accounts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.account.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."accounts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.account.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.account.manage', NULL::uuid));
ALTER TABLE "finance"."adjustment_note_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."adjustment_note_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."adjustment_note_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."adjustment_note_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.adjustment_note.edit', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."adjustment_note_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.adjustment_note.edit', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.adjustment_note.edit', NULL::uuid));
ALTER TABLE "finance"."adjustment_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."adjustment_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."adjustment_notes" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."adjustment_notes" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.adjustment_note.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."adjustment_notes" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.adjustment_note.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.adjustment_note.manage', NULL::uuid));
ALTER TABLE "finance"."allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."allocations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."allocations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.payment.allocate', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."allocations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.payment.allocate', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.payment.allocate', NULL::uuid));
ALTER TABLE "finance"."bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."bank_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."bank_accounts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."bank_accounts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_account.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."bank_accounts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_account.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_account.manage', NULL::uuid));
ALTER TABLE "finance"."bank_statement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."bank_statement_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."bank_statement_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."bank_statement_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.bank_statement.parse', NULL::uuid));
ALTER TABLE "finance"."bank_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."bank_statements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."bank_statements" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."bank_statements" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_statement.import', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."bank_statements" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_statement.import', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_statement.import', NULL::uuid));
ALTER TABLE "finance"."expense_claim_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."expense_claim_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."expense_claim_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."expense_claim_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.expense.edit', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."expense_claim_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.expense.edit', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.expense.edit', NULL::uuid));
ALTER TABLE "finance"."expense_claims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."expense_claims" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."expense_claims" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."expense_claims" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.expense.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."expense_claims" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.expense.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.expense.manage', NULL::uuid));
ALTER TABLE "finance"."journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."journal_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."journal_entries" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."journal_entries" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.journal.post', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."journal_entries" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.journal.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.journal.post', NULL::uuid));
ALTER TABLE "finance"."journal_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."journal_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."journal_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "finance"."journal_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.journal.edit', "branch_id"));
CREATE POLICY "erp_update" ON "finance"."journal_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.journal.edit', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.journal.edit', "branch_id"));
ALTER TABLE "finance"."open_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."open_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."open_items" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."open_items" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.open_item.post', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."open_items" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.open_item.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.open_item.post', NULL::uuid));
ALTER TABLE "finance"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."payments" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "finance"."payments" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.payment.manage', "branch_id"));
CREATE POLICY "erp_update" ON "finance"."payments" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.payment.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.payment.manage', "branch_id"));
ALTER TABLE "finance"."reconciliation_matches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "finance"."reconciliation_matches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "finance"."reconciliation_matches" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "finance"."reconciliation_matches" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_reconcile', NULL::uuid));
CREATE POLICY "erp_update" ON "finance"."reconciliation_matches" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_reconcile', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('finance.bank_reconcile', NULL::uuid));
ALTER TABLE "hr"."departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr"."departments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "hr"."departments" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "hr"."departments" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('hr.department.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "hr"."departments" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('hr.department.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('hr.department.manage', NULL::uuid));
ALTER TABLE "hr"."employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hr"."employees" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "hr"."employees" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "hr"."employees" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('hr.employee.manage', "branch_id"));
CREATE POLICY "erp_update" ON "hr"."employees" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('hr.employee.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('hr.employee.manage', "branch_id"));
ALTER TABLE "inventory"."batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."batches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."batches" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "inventory"."batches" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('inventory.batch.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "inventory"."batches" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('inventory.batch.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('inventory.batch.manage', NULL::uuid));
ALTER TABLE "inventory"."inventory_document_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."inventory_document_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."inventory_document_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "inventory"."inventory_document_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('inventory.document.post', NULL::uuid));
CREATE POLICY "erp_update" ON "inventory"."inventory_document_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('inventory.document.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('inventory.document.post', NULL::uuid));
ALTER TABLE "inventory"."inventory_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."inventory_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."inventory_documents" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "inventory"."inventory_documents" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.document.post', "branch_id"));
CREATE POLICY "erp_update" ON "inventory"."inventory_documents" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.document.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.document.post', "branch_id"));
ALTER TABLE "inventory"."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."locations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."locations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "inventory"."locations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.location.manage', "branch_id"));
CREATE POLICY "erp_update" ON "inventory"."locations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.location.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.location.manage', "branch_id"));
ALTER TABLE "inventory"."reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."reservations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."reservations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "inventory"."reservations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.reservation.manage', "branch_id"));
CREATE POLICY "erp_update" ON "inventory"."reservations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.reservation.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.reservation.manage', "branch_id"));
ALTER TABLE "inventory"."stock_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."stock_balances" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."stock_balances" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "inventory"."stock_balances" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.projector.write', "branch_id"));
CREATE POLICY "erp_update" ON "inventory"."stock_balances" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.projector.write', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.projector.write', "branch_id"));
CREATE POLICY "erp_delete" ON "inventory"."stock_balances" FOR DELETE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.projector.write', "branch_id"));
ALTER TABLE "inventory"."stock_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory"."stock_ledger_entries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "inventory"."stock_ledger_entries" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "inventory"."stock_ledger_entries" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('inventory.document.post', "branch_id"));
ALTER TABLE "parties"."addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties"."addresses" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "parties"."addresses" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "parties"."addresses" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "parties"."addresses" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid));
ALTER TABLE "parties"."contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties"."contacts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "parties"."contacts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "parties"."contacts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "parties"."contacts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid));
ALTER TABLE "parties"."customer_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties"."customer_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "parties"."customer_accounts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "parties"."customer_accounts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.customer.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "parties"."customer_accounts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.customer.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.customer.manage', NULL::uuid));
ALTER TABLE "parties"."parties" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties"."parties" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "parties"."parties" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "parties"."parties" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "parties"."parties" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.party.manage', NULL::uuid));
ALTER TABLE "parties"."supplier_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties"."supplier_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "parties"."supplier_accounts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "parties"."supplier_accounts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.supplier.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "parties"."supplier_accounts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.supplier.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.supplier.manage', NULL::uuid));
ALTER TABLE "parties"."tax_registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "parties"."tax_registrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "parties"."tax_registrations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "parties"."tax_registrations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.tax_registration.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "parties"."tax_registrations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.tax_registration.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('parties.tax_registration.manage', NULL::uuid));
ALTER TABLE "procurement"."goods_receipt_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."goods_receipt_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."goods_receipt_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "procurement"."goods_receipt_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.receipt.post', NULL::uuid));
CREATE POLICY "erp_update" ON "procurement"."goods_receipt_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.receipt.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.receipt.post', NULL::uuid));
ALTER TABLE "procurement"."goods_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."goods_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."goods_receipts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "procurement"."goods_receipts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.receipt.post', "branch_id"));
CREATE POLICY "erp_update" ON "procurement"."goods_receipts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.receipt.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.receipt.post', "branch_id"));
ALTER TABLE "procurement"."purchase_order_advance_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."purchase_order_advance_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."purchase_order_advance_allocations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "procurement"."purchase_order_advance_allocations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.payment.manage', "branch_id"));
CREATE POLICY "erp_update" ON "procurement"."purchase_order_advance_allocations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.payment.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('finance.payment.manage', "branch_id"));
ALTER TABLE "procurement"."purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."purchase_order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."purchase_order_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "procurement"."purchase_order_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.order.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "procurement"."purchase_order_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.order.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.order.manage', NULL::uuid));
ALTER TABLE "procurement"."purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."purchase_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."purchase_orders" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "procurement"."purchase_orders" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.order.manage', "branch_id"));
CREATE POLICY "erp_update" ON "procurement"."purchase_orders" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.order.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.order.manage', "branch_id"));
ALTER TABLE "procurement"."purchase_return_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."purchase_return_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."purchase_return_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "procurement"."purchase_return_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.return.post', NULL::uuid));
CREATE POLICY "erp_update" ON "procurement"."purchase_return_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.return.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.return.post', NULL::uuid));
ALTER TABLE "procurement"."purchase_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."purchase_returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."purchase_returns" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "procurement"."purchase_returns" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.return.post', "branch_id"));
CREATE POLICY "erp_update" ON "procurement"."purchase_returns" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.return.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.return.post', "branch_id"));
ALTER TABLE "procurement"."supplier_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."supplier_invoice_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."supplier_invoice_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "procurement"."supplier_invoice_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.invoice.post', NULL::uuid));
CREATE POLICY "erp_update" ON "procurement"."supplier_invoice_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.invoice.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.invoice.post', NULL::uuid));
ALTER TABLE "procurement"."supplier_invoice_receipt_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."supplier_invoice_receipt_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."supplier_invoice_receipt_allocations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "procurement"."supplier_invoice_receipt_allocations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.invoice.post', NULL::uuid));
CREATE POLICY "erp_update" ON "procurement"."supplier_invoice_receipt_allocations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.invoice.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('procurement.invoice.post', NULL::uuid));
ALTER TABLE "procurement"."supplier_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "procurement"."supplier_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "procurement"."supplier_invoices" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "procurement"."supplier_invoices" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.invoice.post', "branch_id"));
CREATE POLICY "erp_update" ON "procurement"."supplier_invoices" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.invoice.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('procurement.invoice.post', "branch_id"));
ALTER TABLE "sales"."dispatch_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."dispatch_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."dispatch_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "sales"."dispatch_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.dispatch.post', NULL::uuid));
CREATE POLICY "erp_update" ON "sales"."dispatch_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.dispatch.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.dispatch.post', NULL::uuid));
ALTER TABLE "sales"."dispatches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."dispatches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."dispatches" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "sales"."dispatches" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.dispatch.post', "branch_id"));
CREATE POLICY "erp_update" ON "sales"."dispatches" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.dispatch.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.dispatch.post', "branch_id"));
ALTER TABLE "sales"."invoice_dispatch_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."invoice_dispatch_allocations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."invoice_dispatch_allocations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "sales"."invoice_dispatch_allocations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.invoice.post', NULL::uuid));
CREATE POLICY "erp_update" ON "sales"."invoice_dispatch_allocations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.invoice.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.invoice.post', NULL::uuid));
ALTER TABLE "sales"."invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."invoice_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."invoice_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "sales"."invoice_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.invoice.post', NULL::uuid));
CREATE POLICY "erp_update" ON "sales"."invoice_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.invoice.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.invoice.post', NULL::uuid));
ALTER TABLE "sales"."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."invoices" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "sales"."invoices" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.invoice.post', "branch_id"));
CREATE POLICY "erp_update" ON "sales"."invoices" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.invoice.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.invoice.post', "branch_id"));
ALTER TABLE "sales"."order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."order_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "sales"."order_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.order.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "sales"."order_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.order.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.order.manage', NULL::uuid));
ALTER TABLE "sales"."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."orders" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "sales"."orders" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.order.manage', "branch_id"));
CREATE POLICY "erp_update" ON "sales"."orders" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.order.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.order.manage', "branch_id"));
ALTER TABLE "sales"."return_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."return_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."return_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "sales"."return_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.return.post', NULL::uuid));
CREATE POLICY "erp_update" ON "sales"."return_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.return.post', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('sales.return.post', NULL::uuid));
ALTER TABLE "sales"."returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales"."returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "sales"."returns" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "sales"."returns" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.return.post', "branch_id"));
CREATE POLICY "erp_update" ON "sales"."returns" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.return.post', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('sales.return.post', "branch_id"));
ALTER TABLE "tax"."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."documents" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."documents" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.tax_document.post', NULL::uuid));
ALTER TABLE "tax"."einvoice_rule_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."einvoice_rule_versions" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "tax"."einvoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."einvoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."einvoices" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
ALTER TABLE "tax"."eway_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."eway_bills" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."eway_bills" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
ALTER TABLE "tax"."gst_adjustment_rule_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."gst_adjustment_rule_versions" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "tax"."organization_fiscal_tax_facts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."organization_fiscal_tax_facts" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."organization_fiscal_tax_facts" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."organization_fiscal_tax_facts" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.registration.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."organization_fiscal_tax_facts" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.registration.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.registration.manage', NULL::uuid));
ALTER TABLE "tax"."portal_document_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."portal_document_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."portal_document_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."portal_document_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.tax.portal.parse', NULL::uuid));
ALTER TABLE "tax"."portal_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."portal_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."portal_documents" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."portal_documents" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.portal.import', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."portal_documents" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.portal.import', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.portal.import', NULL::uuid));
ALTER TABLE "tax"."reconciliation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."reconciliation_items" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."reconciliation_items" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."reconciliation_items" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.tax.reconciliation.write', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."reconciliation_items" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.tax.reconciliation.write', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('internal.tax.reconciliation.write', NULL::uuid));
ALTER TABLE "tax"."reconciliation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."reconciliation_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."reconciliation_runs" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."reconciliation_runs" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.reconciliation.run', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."reconciliation_runs" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.reconciliation.run', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.reconciliation.run', NULL::uuid));
ALTER TABLE "tax"."registration_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."registration_branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."registration_branches" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id"));
CREATE POLICY "erp_insert" ON "tax"."registration_branches" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('tax.registration.manage', "branch_id"));
CREATE POLICY "erp_update" ON "tax"."registration_branches" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('tax.registration.manage', "branch_id")) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.can_access_branch("branch_id") AND erp_security.has_permission('tax.registration.manage', "branch_id"));
ALTER TABLE "tax"."registrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."registrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."registrations" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."registrations" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.registration.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."registrations" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.registration.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.registration.manage', NULL::uuid));
ALTER TABLE "tax"."return_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."return_documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."return_documents" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."return_documents" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return.compose', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."return_documents" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return.compose', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return.compose', NULL::uuid));
ALTER TABLE "tax"."return_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."return_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."return_periods" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."return_periods" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return_period.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."return_periods" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return_period.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return_period.manage', NULL::uuid));
ALTER TABLE "tax"."returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."returns" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."returns" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return.file', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."returns" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return.file', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.return.file', NULL::uuid));
ALTER TABLE "tax"."tax_code_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."tax_code_versions" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "tax"."withholding_basis_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_basis_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_basis_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_basis_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholding_certificate_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_certificate_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_certificate_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_certificate_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholding_certificate_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholding_certificates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_certificates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_certificates" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_certificates" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholding_certificates" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholding_deposit_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_deposit_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_deposit_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_deposit_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholding_deposit_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholding_deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_deposits" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_deposits" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_deposits" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholding_deposits" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholding_rule_versions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_rule_versions" FOR SELECT TO "erp_app" USING (true);
ALTER TABLE "tax"."withholding_statement_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_statement_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_statement_lines" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_statement_lines" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholding_statement_lines" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholding_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholding_statements" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholding_statements" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholding_statements" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholding_statements" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
ALTER TABLE "tax"."withholdings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tax"."withholdings" FORCE ROW LEVEL SECURITY;
CREATE POLICY "erp_select" ON "tax"."withholdings" FOR SELECT TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active());
CREATE POLICY "erp_insert" ON "tax"."withholdings" FOR INSERT TO "erp_app" WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));
CREATE POLICY "erp_update" ON "tax"."withholdings" FOR UPDATE TO "erp_app" USING ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid)) WITH CHECK ("org_id" = erp_security.current_org_id() AND erp_security.current_actor_is_active() AND erp_security.has_permission('tax.withholding.manage', NULL::uuid));

GRANT SELECT, INSERT, UPDATE ON TABLE "automation"."agent_grant_capabilities" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "automation"."agent_grants" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "automation"."command_approvals" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "automation"."command_requests" TO "erp_app";
GRANT SELECT ON TABLE "calculation"."artifacts" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "catalog"."categories" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "catalog"."commercial_charge_tax_profiles" TO "erp_app";
GRANT SELECT ON TABLE "catalog"."ingredients" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "catalog"."product_ingredients" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "catalog"."products" TO "erp_app";
GRANT SELECT ON TABLE "catalog"."units_of_measure" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "catalog"."uom_conversions" TO "erp_app";
GRANT SELECT ON TABLE "compliance"."controlled_movement_rule_versions" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "compliance"."controlled_substance_entries" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "compliance"."destructions" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "compliance"."licenses" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "compliance"."recall_batches" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "compliance"."recalls" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "compliance"."storage_rule_versions" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "compliance"."temperature_readings" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."access_grants" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."attachments" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "core"."audit_events" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."branches" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."data_retention_cases" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."document_sequences" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."idempotency_keys" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."memberships" TO "erp_app";
GRANT SELECT, UPDATE ON TABLE "core"."organizations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."outbox_events" TO "erp_app";
GRANT SELECT ON TABLE "core"."permissions" TO "erp_app";
GRANT SELECT ON TABLE "core"."reference_data_releases" TO "erp_app";
GRANT SELECT, INSERT, DELETE ON TABLE "core"."role_permissions" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."roles" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."settings" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "core"."users" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "finance"."accounting_events" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."accounts" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."adjustment_note_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."adjustment_notes" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."allocations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."bank_accounts" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "finance"."bank_statement_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."bank_statements" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."expense_claim_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."expense_claims" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."journal_entries" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."journal_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."open_items" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."payments" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "finance"."reconciliation_matches" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "hr"."departments" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "hr"."employees" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "inventory"."batches" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "inventory"."inventory_document_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "inventory"."inventory_documents" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "inventory"."locations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "inventory"."reservations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "inventory"."stock_balances" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "inventory"."stock_ledger_entries" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "parties"."addresses" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "parties"."contacts" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "parties"."customer_accounts" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "parties"."parties" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "parties"."supplier_accounts" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "parties"."tax_registrations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."goods_receipt_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."goods_receipts" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."purchase_order_advance_allocations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."purchase_order_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."purchase_orders" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."purchase_return_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."purchase_returns" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."supplier_invoice_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."supplier_invoice_receipt_allocations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "procurement"."supplier_invoices" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."dispatch_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."dispatches" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."invoice_dispatch_allocations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."invoice_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."invoices" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."order_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."orders" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."return_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "sales"."returns" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "tax"."documents" TO "erp_app";
GRANT SELECT ON TABLE "tax"."einvoice_rule_versions" TO "erp_app";
GRANT SELECT ON TABLE "tax"."einvoices" TO "erp_app";
GRANT SELECT ON TABLE "tax"."eway_bills" TO "erp_app";
GRANT SELECT ON TABLE "tax"."gst_adjustment_rule_versions" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."organization_fiscal_tax_facts" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "tax"."portal_document_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."portal_documents" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."reconciliation_items" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."reconciliation_runs" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."registration_branches" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."registrations" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."return_documents" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."return_periods" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."returns" TO "erp_app";
GRANT SELECT ON TABLE "tax"."tax_code_versions" TO "erp_app";
GRANT SELECT, INSERT ON TABLE "tax"."withholding_basis_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholding_certificate_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholding_certificates" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholding_deposit_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholding_deposits" TO "erp_app";
GRANT SELECT ON TABLE "tax"."withholding_rule_versions" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholding_statement_lines" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholding_statements" TO "erp_app";
GRANT SELECT, INSERT, UPDATE ON TABLE "tax"."withholdings" TO "erp_app";

ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "automation" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "calculation" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "catalog" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "compliance" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "core" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "finance" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "hr" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "inventory" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "parties" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "procurement" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "sales" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "tax" REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE "erp_migration_owner" IN SCHEMA "erp_security" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
