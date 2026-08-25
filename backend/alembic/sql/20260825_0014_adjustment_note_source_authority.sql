-- Hash-bound incremental migration: adjustment notes inherit exact source policy.
-- Alembic owns the transaction. This script must not be run directly.

SET LOCAL ROLE erp_migration_owner;

ALTER FUNCTION erp_automation_commands.resolve_adjustment_note_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb
) RENAME TO resolve_adjustment_note_prepare_unchecked_v0013;

REVOKE ALL ON FUNCTION erp_automation_commands.resolve_adjustment_note_prepare_unchecked_v0013(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb
) FROM PUBLIC, erp_app, erp_runtime, erp_calculator;

CREATE FUNCTION erp_automation_commands.resolve_adjustment_note_prepare(
  organization_id uuid,
  membership_id uuid,
  auth_user_id uuid,
  application_user_id uuid,
  grant_id uuid,
  caller_client_id varchar,
  adjustment_note_id uuid,
  request_document jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
DECLARE
  resolved jsonb;
  source_side text;
  source_document_id uuid;
  source_rounding_policy text;
  source_document_discount_kind text;
  source_document_discount_basis text;
  source_document_discount_value numeric(20,6);
  source_supply_type text;
  source_zero_rated_payment_mode text;
  source_tax_charge_mechanism text;
  requested_line jsonb;
  sales_line sales.invoice_lines%ROWTYPE;
  supplier_line procurement.supplier_invoice_lines%ROWTYPE;
BEGIN
  -- The reviewed v0013 resolver performs tenant, grant, permission, branch,
  -- source-state, open-item, GST-rule and quantity checks before this wrapper
  -- inspects any source row. It is private after this migration, so callers
  -- cannot bypass the exact source-policy checks below.
  resolved := erp_automation_commands.resolve_adjustment_note_prepare_unchecked_v0013(
    organization_id,
    membership_id,
    auth_user_id,
    application_user_id,
    grant_id,
    caller_client_id,
    adjustment_note_id,
    request_document
  );

  source_side := resolved->>'side';
  source_document_id := (resolved->>'original_document_id')::uuid;

  IF request_document ?| ARRAY[
    'currency_code',
    'supply_type',
    'zero_rated_payment_mode',
    'tax_charge_mechanism',
    'calculation_ruleset_version',
    'tax_code_version_id',
    'taxability_snapshot',
    'cgst_rate',
    'sgst_rate',
    'igst_rate',
    'cess_rate'
  ] THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='adjustment-note supply and tax authority must be derived from the original document';
  END IF;

  IF source_side='sales' THEN
    SELECT
      invoice.rounding_policy,
      invoice.document_discount_kind,
      invoice.document_discount_basis,
      invoice.document_discount_value,
      invoice.supply_type,
      invoice.zero_rated_payment_mode,
      invoice.tax_charge_mechanism
    INTO STRICT
      source_rounding_policy,
      source_document_discount_kind,
      source_document_discount_basis,
      source_document_discount_value,
      source_supply_type,
      source_zero_rated_payment_mode,
      source_tax_charge_mechanism
    FROM sales.invoices invoice
    WHERE invoice.org_id=organization_id AND invoice.id=source_document_id
    FOR SHARE;
  ELSIF source_side='purchase' THEN
    SELECT
      invoice.rounding_policy,
      invoice.document_discount_kind,
      invoice.document_discount_basis,
      invoice.document_discount_value,
      invoice.supply_type,
      invoice.zero_rated_payment_mode,
      invoice.tax_charge_mechanism
    INTO STRICT
      source_rounding_policy,
      source_document_discount_kind,
      source_document_discount_basis,
      source_document_discount_value,
      source_supply_type,
      source_zero_rated_payment_mode,
      source_tax_charge_mechanism
    FROM procurement.supplier_invoices invoice
    WHERE invoice.org_id=organization_id AND invoice.id=source_document_id
    FOR SHARE;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='adjustment-note source side is outside the reviewed authority';
  END IF;

  IF request_document->>'rounding_policy' IS DISTINCT FROM source_rounding_policy
     OR pg_catalog.jsonb_typeof(request_document->'document_discount') IS DISTINCT FROM 'object'
     OR request_document#>>'{document_discount,document_discount_kind}' IS DISTINCT FROM source_document_discount_kind
     OR request_document#>>'{document_discount,document_discount_basis}' IS DISTINCT FROM source_document_discount_basis
     OR (request_document#>>'{document_discount,document_discount_value}')::numeric
          IS DISTINCT FROM source_document_discount_value THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='adjustment-note header calculation policy differs from the original document';
  END IF;

  IF resolved->>'supply_type' IS DISTINCT FROM source_supply_type
     OR resolved->>'zero_rated_payment_mode' IS DISTINCT FROM source_zero_rated_payment_mode
     OR resolved->>'tax_charge_mechanism' IS DISTINCT FROM source_tax_charge_mechanism THEN
    RAISE EXCEPTION USING
      ERRCODE='23514',
      MESSAGE='adjustment-note resolved supply or tax policy differs from the original document';
  END IF;

  FOR requested_line IN
    SELECT value FROM pg_catalog.jsonb_array_elements(request_document->'lines')
  LOOP
    IF requested_line ?| ARRAY[
      'uom_code',
      'uom_conversion_factor',
      'tax_charge_mechanism',
      'tax_classification_code_snapshot',
      'tax_code_version_id',
      'taxability_snapshot',
      'cgst_rate',
      'sgst_rate',
      'igst_rate',
      'cess_rate'
    ] THEN
      RAISE EXCEPTION USING
        ERRCODE='23514',
        MESSAGE='adjustment-note line tax authority must be derived from the original line';
    END IF;

    IF source_side='sales' THEN
      SELECT * INTO STRICT sales_line
      FROM sales.invoice_lines line
      WHERE line.org_id=organization_id
        AND line.invoice_id=source_document_id
        AND line.id=(requested_line->>'original_line_id')::uuid
        AND line.line_kind='product'
      FOR SHARE;

      IF (requested_line->>'quoted_unit_rate')::numeric IS DISTINCT FROM sales_line.quoted_unit_rate
         OR requested_line->>'price_basis' IS DISTINCT FROM sales_line.price_basis
         OR requested_line->>'free_supply_tax_treatment' IS DISTINCT FROM sales_line.free_supply_tax_treatment
         OR requested_line#>>'{line_discount,line_discount_kind}' IS DISTINCT FROM sales_line.line_discount_kind
         OR requested_line#>>'{line_discount,line_discount_basis}' IS DISTINCT FROM sales_line.line_discount_basis
         OR (requested_line#>>'{line_discount,line_discount_value}')::numeric IS DISTINCT FROM sales_line.line_discount_value
         OR (requested_line->>'document_discount_eligible')::boolean IS DISTINCT FROM sales_line.document_discount_eligible THEN
        RAISE EXCEPTION USING
          ERRCODE='23514',
          MESSAGE='adjustment-note line pricing or discount policy differs from the original sales invoice line';
      END IF;
    ELSE
      SELECT * INTO STRICT supplier_line
      FROM procurement.supplier_invoice_lines line
      WHERE line.org_id=organization_id
        AND line.supplier_invoice_id=source_document_id
        AND line.id=(requested_line->>'original_line_id')::uuid
        AND line.line_kind='product'
      FOR SHARE;

      IF (requested_line->>'quoted_unit_rate')::numeric IS DISTINCT FROM supplier_line.quoted_unit_rate
         OR requested_line->>'price_basis' IS DISTINCT FROM supplier_line.price_basis
         OR requested_line->>'free_supply_tax_treatment' IS DISTINCT FROM supplier_line.free_supply_tax_treatment
         OR requested_line#>>'{line_discount,line_discount_kind}' IS DISTINCT FROM supplier_line.line_discount_kind
         OR requested_line#>>'{line_discount,line_discount_basis}' IS DISTINCT FROM supplier_line.line_discount_basis
         OR (requested_line#>>'{line_discount,line_discount_value}')::numeric IS DISTINCT FROM supplier_line.line_discount_value
         OR (requested_line->>'document_discount_eligible')::boolean IS DISTINCT FROM supplier_line.document_discount_eligible THEN
        RAISE EXCEPTION USING
          ERRCODE='23514',
          MESSAGE='adjustment-note line pricing or discount policy differs from the original supplier invoice line';
      END IF;
    END IF;
  END LOOP;

  RETURN resolved;
END
$function$;

ALTER FUNCTION erp_automation_commands.resolve_adjustment_note_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_automation_commands.resolve_adjustment_note_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb
) FROM PUBLIC, erp_app;

GRANT EXECUTE ON FUNCTION erp_automation_commands.resolve_adjustment_note_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb
) TO erp_runtime, erp_calculator;
