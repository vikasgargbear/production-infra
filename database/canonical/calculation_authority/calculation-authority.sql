-- Canonical calculation artifact authority
-- REVIEWED, NOT APPLIED. Generated; do not edit.

BEGIN;

DO $calculation_crypto_preflight$
BEGIN
    IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='undefined_function', MESSAGE='extensions.digest(bytea,text) from pgcrypto is required';
    END IF;
END
$calculation_crypto_preflight$;

CREATE SCHEMA "erp_calculation_authority" AUTHORIZATION "erp_migration_owner";

REVOKE ALL ON SCHEMA "erp_calculation_authority" FROM PUBLIC, "erp_app", "erp_runtime";

CREATE ROLE "erp_calculator" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

REVOKE "erp_migration_owner", "erp_app" FROM "erp_calculator";

REVOKE ALL ON TABLE "calculation"."artifacts" FROM PUBLIC, "erp_app", "erp_runtime", "erp_calculator";

GRANT USAGE ON SCHEMA "erp_calculation_authority" TO "erp_calculator";

CREATE FUNCTION "erp_calculation_authority"."artifact_hash"(p_artifact calculation.artifacts)
RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
SELECT extensions.digest(
    pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
            'authority_version',p_artifact.authority_version,
            'org_id',p_artifact.org_id,
            'artifact_id',p_artifact.id,
            'branch_id',p_artifact.branch_id,
            'operation',p_artifact.operation,
            'sales_order_id',p_artifact.sales_order_id,
            'sales_invoice_id',p_artifact.sales_invoice_id,
            'sales_return_id',p_artifact.sales_return_id,
            'purchase_order_id',p_artifact.purchase_order_id,
            'supplier_invoice_id',p_artifact.supplier_invoice_id,
            'purchase_return_id',p_artifact.purchase_return_id,
            'adjustment_note_id',p_artifact.adjustment_note_id,
            'aggregate_version',p_artifact.aggregate_version,
            'actor_membership_id',p_artifact.actor_membership_id,
            'request_id',p_artifact.request_id,
            'command_request_id',p_artifact.command_request_id,
            'idempotency_key_id',p_artifact.idempotency_key_id,
            'request_sha256',pg_catalog.encode(p_artifact.request_sha256,'hex'),
            'input_media_type',p_artifact.input_media_type,
            'input_sha256',pg_catalog.encode(p_artifact.input_sha256,'hex'),
            'output_media_type',p_artifact.output_media_type,
            'output_sha256',pg_catalog.encode(p_artifact.output_sha256,'hex'),
            'engine_version',p_artifact.engine_version,
            'ruleset_version',p_artifact.ruleset_version,
            'serializer_version',p_artifact.serializer_version,
            'calculator_principal',p_artifact.calculator_principal,
            'attestation_method',p_artifact.attestation_method,
            'issued_at',p_artifact.issued_at,
            'expires_at',p_artifact.expires_at
        )::text,
        'UTF8'
    ),
    'sha256'
)
$function$;

ALTER FUNCTION "erp_calculation_authority"."artifact_hash"(calculation.artifacts) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_calculation_authority"."artifact_hash"(calculation.artifacts) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_calculation_authority"."aggregate_version_hash"(p_resource_type varchar, p_resource_id uuid, p_row_version bigint)
RETURNS bytea
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
SELECT extensions.digest(
    pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
            'resource_id',p_resource_id,
            'resource_type',p_resource_type,
            'row_version',p_row_version
        )::text,
        'UTF8'
    ),
    'sha256'
)
$function$;

ALTER FUNCTION "erp_calculation_authority"."aggregate_version_hash"(varchar,uuid,bigint) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_calculation_authority"."aggregate_version_hash"(varchar,uuid,bigint) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_calculation_authority"."assert_output_schema"(p_document jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    expected_top text[] := ARRAY['aggregate_version','currency_code','engine_version','gst_tax_treatment','lines','operation','resource_id','resource_type','ruleset_version','schema','schema_version','serializer_version','totals'];
    expected_line text[] := ARRAY['cess_amount','cess_rate','cgst_amount','cgst_rate','document_discount_amount','document_taxable_discount_amount','final_residual','gross_amount','gst_taxable_value','igst_amount','igst_rate','line_discount_amount','line_id','line_kind','line_taxable_discount_amount','line_total','net_value_amount','recipient_assessed_tax_amount','sgst_amount','sgst_rate'];
    expected_totals text[] := ARRAY['cess_total','cgst_total','charges_total','discount_total','grand_total','gst_taxable_total','igst_total','net_value_total','pre_round_total','recipient_assessed_tax_total','rounding_adjustment','sgst_total','subtotal'];
    decimal_pattern text := '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$';
    line jsonb;
    field record;
BEGIN
    IF pg_catalog.jsonb_typeof(p_document)<>'object'
       OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document) AS keys(key)) IS DISTINCT FROM expected_top
       OR p_document->>'schema'<>'aasopharma.trade-calculation-output'
       OR p_document->>'schema_version'<>'1'
       OR p_document->>'serializer_version'<>'aasopharma-jcs-decimal-v1'
       OR p_document->>'currency_code'<>'INR'
       OR pg_catalog.jsonb_typeof(p_document->'aggregate_version')<>'number'
       OR p_document->>'gst_tax_treatment' NOT IN ('statutory','commercial_only')
       OR (p_document->>'aggregate_version') !~ '^[1-9][0-9]*$'
       OR pg_catalog.jsonb_typeof(p_document->'lines')<>'array'
       OR pg_catalog.jsonb_array_length(p_document->'lines')=0
       OR pg_catalog.jsonb_typeof(p_document->'totals')<>'object'
       OR pg_catalog.jsonb_typeof(p_document->'operation')<>'string'
       OR pg_catalog.jsonb_typeof(p_document->'resource_type')<>'string'
       OR pg_catalog.jsonb_typeof(p_document->'resource_id')<>'string'
       OR pg_catalog.jsonb_typeof(p_document->'engine_version')<>'string'
       OR pg_catalog.jsonb_typeof(p_document->'ruleset_version')<>'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation output top-level schema is invalid';
    END IF;
    IF (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document->'totals') AS keys(key)) IS DISTINCT FROM expected_totals THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation output totals schema is invalid';
    END IF;
    FOR field IN SELECT key,value FROM pg_catalog.jsonb_each(p_document->'totals') LOOP
        IF pg_catalog.jsonb_typeof(field.value)<>'string' OR (field.value #>> '{}') !~ decimal_pattern THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation output totals must be decimal strings';
        END IF;
    END LOOP;
    FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'lines') LOOP
        IF pg_catalog.jsonb_typeof(line)<>'object'
           OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(line) AS keys(key)) IS DISTINCT FROM expected_line
           OR pg_catalog.jsonb_typeof(line->'line_id')<>'string'
           OR (line->>'line_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           OR line->>'line_kind' NOT IN ('product','charge')
           OR pg_catalog.jsonb_typeof(line->'final_residual')<>'boolean' THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation output line schema is invalid';
        END IF;
        FOR field IN SELECT key,value FROM pg_catalog.jsonb_each(line)
          WHERE key NOT IN ('line_id','line_kind','final_residual')
        LOOP
            IF pg_catalog.jsonb_typeof(field.value)<>'string' OR (field.value #>> '{}') !~ decimal_pattern THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation output line values must be decimal strings';
            END IF;
        END LOOP;
    END LOOP;
END
$function$;

ALTER FUNCTION "erp_calculation_authority"."assert_output_schema"(jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_calculation_authority"."assert_output_schema"(jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_calculation_authority"."assert_input_schema"(p_document jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    expected_top text[] := ARRAY['aggregate_version','calculation_kind','document','operation','original','resource_id','resource_type','reversal','schema','schema_version','serializer_version'];
    expected_document text[] := ARRAY['charges','document_discount','gst_tax_treatment','gst_type','products','rounding_policy','tax_charge_mechanism','zero_rated_mode'];
    expected_product text[] := ARRAY['base_billed_quantity','base_free_quantity','billed_quantity','cess_rate','document_discount_eligible','free_quantity','free_supply_tax_treatment','gst_rate','line_discount','line_id','price_basis','quoted_unit_rate','tax_charge_mechanism','taxability_snapshot','uom_conversion_factor'];
    expected_charge text[] := ARRAY['cess_rate','charge_code','document_discount_eligible','gst_rate','line_id','price_basis','quoted_amount','tax_charge_mechanism','taxability_snapshot'];
    expected_discount text[] := ARRAY['basis','kind','value'];
    expected_reversal text[] := ARRAY['charges','gst_tax_treatment','prior_state','products'];
    expected_product_reversal text[] := ARRAY['final_residual','line_id','reversed_base_billed_quantity','reversed_base_free_quantity','reversed_billed_quantity','reversed_free_quantity','value_basis'];
    expected_charge_reversal text[] := ARRAY['final_residual','line_id','ratio'];
    expected_prior_product text[] := ARRAY['cess_amount','cgst_amount','document_discount_amount','gross_price_amount','gst_taxable_value','igst_amount','line_discount_amount','line_id','net_value_amount','reversed_base_billed_quantity','reversed_base_free_quantity','reversed_billed_quantity','reversed_free_quantity','sgst_amount','value_basis'];
    expected_prior_charge text[] := ARRAY['cess_amount','cgst_amount','document_discount_amount','gross_price_amount','gst_taxable_value','igst_amount','line_id','net_value_amount','reversed_ratio','sgst_amount'];
    expected_prior text[] := ARRAY['charges','products','rounding_adjustment'];
    decimal_pattern text := '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$';
    item jsonb;
    field record;
BEGIN
    IF pg_catalog.jsonb_typeof(p_document)<>'object'
       OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document) AS keys(key)) IS DISTINCT FROM expected_top
       OR p_document->>'schema'<>'aasopharma.trade-calculation-input'
       OR p_document->>'schema_version'<>'1'
       OR p_document->>'serializer_version'<>'aasopharma-jcs-decimal-v1'
       OR pg_catalog.jsonb_typeof(p_document->'aggregate_version')<>'number'
       OR (p_document->>'aggregate_version') !~ '^[1-9][0-9]*$'
       OR pg_catalog.jsonb_typeof(p_document->'operation')<>'string'
       OR pg_catalog.jsonb_typeof(p_document->'resource_type')<>'string'
       OR pg_catalog.jsonb_typeof(p_document->'resource_id')<>'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation input top-level schema is invalid';
    END IF;
    IF p_document->>'calculation_kind'='document' THEN
        IF pg_catalog.jsonb_typeof(p_document->'document')<>'object'
           OR p_document->'original'<>'null'::jsonb OR p_document->'reversal'<>'null'::jsonb
           OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document->'document') AS keys(key)) IS DISTINCT FROM expected_document
           OR pg_catalog.jsonb_typeof(p_document->'document'->'products')<>'array'
           OR pg_catalog.jsonb_array_length(p_document->'document'->'products')=0
           OR pg_catalog.jsonb_typeof(p_document->'document'->'charges')<>'array'
           OR p_document->'document'->>'gst_tax_treatment' NOT IN ('statutory','commercial_only')
           OR pg_catalog.jsonb_typeof(p_document->'document'->'gst_type')<>'string'
           OR pg_catalog.jsonb_typeof(p_document->'document'->'rounding_policy')<>'string'
           OR pg_catalog.jsonb_typeof(p_document->'document'->'tax_charge_mechanism')<>'string'
           OR pg_catalog.jsonb_typeof(p_document->'document'->'zero_rated_mode')<>'string'
           OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document->'document'->'document_discount') AS keys(key)) IS DISTINCT FROM expected_discount
           OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_document->'document'->'document_discount') AS member(key,value) WHERE pg_catalog.jsonb_typeof(value)<>'string')
           OR (p_document->'document'->'document_discount'->>'value') !~ decimal_pattern THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='document calculation input schema is invalid';
        END IF;
        FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'document'->'products') LOOP
            IF pg_catalog.jsonb_typeof(item)<>'object'
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item) AS keys(key)) IS DISTINCT FROM expected_product
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item->'line_discount') AS keys(key)) IS DISTINCT FROM expected_discount
               OR pg_catalog.jsonb_typeof(item->'document_discount_eligible')<>'boolean'
               OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(item) AS member(key,value) WHERE key NOT IN ('document_discount_eligible','line_discount') AND pg_catalog.jsonb_typeof(value)<>'string')
               OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(item->'line_discount') AS member(key,value) WHERE pg_catalog.jsonb_typeof(value)<>'string')
               OR (item->'line_discount'->>'value') !~ decimal_pattern THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product calculation input schema is invalid';
            END IF;
            FOR field IN SELECT key,value FROM pg_catalog.jsonb_each(item)
              WHERE key IN ('base_billed_quantity','base_free_quantity','billed_quantity','cess_rate','free_quantity','gst_rate','quoted_unit_rate','uom_conversion_factor')
            LOOP
                IF pg_catalog.jsonb_typeof(field.value)<>'string' OR (field.value #>> '{}') !~ decimal_pattern THEN
                    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product calculation numerics must be decimal strings';
                END IF;
            END LOOP;
        END LOOP;
        FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'document'->'charges') LOOP
            IF pg_catalog.jsonb_typeof(item)<>'object'
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item) AS keys(key)) IS DISTINCT FROM expected_charge
               OR pg_catalog.jsonb_typeof(item->'document_discount_eligible')<>'boolean'
               OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(item) AS member(key,value) WHERE key<>'document_discount_eligible' AND pg_catalog.jsonb_typeof(value)<>'string') THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='charge calculation input schema is invalid';
            END IF;
            FOR field IN SELECT key,value FROM pg_catalog.jsonb_each(item)
              WHERE key IN ('cess_rate','gst_rate','quoted_amount')
            LOOP
                IF pg_catalog.jsonb_typeof(field.value)<>'string' OR (field.value #>> '{}') !~ decimal_pattern THEN
                    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='charge calculation numerics must be decimal strings';
                END IF;
            END LOOP;
        END LOOP;
    ELSIF p_document->>'calculation_kind'='reversal' THEN
        IF p_document->'document'<>'null'::jsonb
           OR pg_catalog.jsonb_typeof(p_document->'original')<>'object'
           OR pg_catalog.jsonb_typeof(p_document->'reversal')<>'object'
           OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document->'reversal') AS keys(key)) IS DISTINCT FROM expected_reversal
           OR p_document->'reversal'->>'gst_tax_treatment' NOT IN ('statutory','commercial_only')
           OR pg_catalog.jsonb_typeof(p_document->'reversal'->'products')<>'array'
           OR pg_catalog.jsonb_array_length(p_document->'reversal'->'products')=0
           OR pg_catalog.jsonb_typeof(p_document->'reversal'->'charges')<>'array'
           OR pg_catalog.jsonb_typeof(p_document->'reversal'->'prior_state')<>'object'
           OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_document->'reversal'->'prior_state') AS keys(key)) IS DISTINCT FROM expected_prior
           OR pg_catalog.jsonb_typeof(p_document->'reversal'->'prior_state'->'products')<>'array'
           OR pg_catalog.jsonb_typeof(p_document->'reversal'->'prior_state'->'charges')<>'array'
           OR pg_catalog.jsonb_typeof(p_document->'reversal'->'prior_state'->'rounding_adjustment')<>'string'
           OR (p_document->'reversal'->'prior_state'->>'rounding_adjustment') !~ decimal_pattern THEN
            RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reversal calculation input schema is invalid';
        END IF;
        PERFORM erp_calculation_authority.assert_output_schema(p_document->'original');
        FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'reversal'->'products') LOOP
            IF pg_catalog.jsonb_typeof(item)<>'object'
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item) AS keys(key)) IS DISTINCT FROM expected_product_reversal
               OR pg_catalog.jsonb_typeof(item->'final_residual')<>'boolean'
               OR item->>'value_basis' NOT IN ('billed_quantity','base_quantity')
               OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(item) AS member(key,value) WHERE key<>'final_residual' AND pg_catalog.jsonb_typeof(value)<>'string') THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product reversal input schema is invalid';
            END IF;
            FOR field IN SELECT key,value FROM pg_catalog.jsonb_each(item)
              WHERE key IN ('reversed_base_billed_quantity','reversed_base_free_quantity','reversed_billed_quantity','reversed_free_quantity')
            LOOP
                IF pg_catalog.jsonb_typeof(field.value)<>'string' OR (field.value #>> '{}') !~ decimal_pattern THEN
                    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product reversal numerics must be decimal strings';
                END IF;
            END LOOP;
        END LOOP;
        FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'reversal'->'charges') LOOP
            IF pg_catalog.jsonb_typeof(item)<>'object'
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item) AS keys(key)) IS DISTINCT FROM expected_charge_reversal
               OR pg_catalog.jsonb_typeof(item->'final_residual')<>'boolean'
               OR pg_catalog.jsonb_typeof(item->'line_id')<>'string'
               OR pg_catalog.jsonb_typeof(item->'ratio')<>'string'
               OR (item->>'ratio') !~ decimal_pattern THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='charge reversal input schema is invalid';
            END IF;
        END LOOP;
        FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'reversal'->'prior_state'->'products') LOOP
            IF pg_catalog.jsonb_typeof(item)<>'object'
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item) AS keys(key)) IS DISTINCT FROM expected_prior_product
               OR item->>'value_basis' NOT IN ('billed_quantity','base_quantity')
               OR pg_catalog.jsonb_typeof(item->'line_id')<>'string'
               OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(item) member WHERE key NOT IN ('line_id','value_basis')
                            AND (pg_catalog.jsonb_typeof(value)<>'string' OR (value #>> '{}') !~ decimal_pattern)) THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='prior product reversal schema is invalid';
            END IF;
        END LOOP;
        FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'reversal'->'prior_state'->'charges') LOOP
            IF pg_catalog.jsonb_typeof(item)<>'object'
               OR (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(item) AS keys(key)) IS DISTINCT FROM expected_prior_charge
               OR pg_catalog.jsonb_typeof(item->'line_id')<>'string'
               OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(item) member WHERE key<>'line_id'
                            AND (pg_catalog.jsonb_typeof(value)<>'string' OR (value #>> '{}') !~ decimal_pattern)) THEN
                RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='prior charge reversal schema is invalid';
            END IF;
        END LOOP;
    ELSE
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported calculation input kind';
    END IF;
END
$function$;

ALTER FUNCTION "erp_calculation_authority"."assert_input_schema"(jsonb) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_calculation_authority"."assert_input_schema"(jsonb) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_calculation_authority"."issue_artifact"(p_artifact_id uuid, p_branch_id uuid, p_operation varchar, p_resource_type varchar, p_resource_id uuid, p_aggregate_version bigint, p_request_id uuid, p_command_request_id uuid, p_idempotency_key_id uuid, p_request_sha256 bytea, p_input_bytes bytea, p_output_bytes bytea, p_engine_version varchar, p_ruleset_version varchar, p_serializer_version varchar, p_expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    tenant_id uuid := NULLIF(pg_catalog.current_setting('app.org_id',true),'')::uuid;
    actor_id uuid := NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid;
    candidate calculation.artifacts%ROWTYPE;
    existing calculation.artifacts%ROWTYPE;
    actual_branch_id uuid;
    actual_version bigint;
    actual_status text;
    input_document jsonb;
    output_document jsonb;
    version_hash bytea;
BEGIN
    IF SESSION_USER<>'erp_calculator' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='only the authenticated calculator principal may issue artifacts';
    END IF;
    IF tenant_id IS NULL OR actor_id IS NULL OR p_artifact_id IS NULL
       OR p_branch_id IS NULL OR p_resource_id IS NULL OR p_request_id IS NULL
       OR p_idempotency_key_id IS NULL OR p_aggregate_version<=0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation artifact binding is incomplete';
    END IF;
    PERFORM 1 FROM core.memberships
     WHERE org_id=tenant_id AND id=actor_id AND status='active';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active calculation actor is required';
    END IF;
    PERFORM 1
      FROM core.branches AS branch
     WHERE branch.org_id=tenant_id AND branch.id=p_branch_id AND branch.status='active'
       AND EXISTS (
           SELECT 1 FROM core.access_grants AS grant_row
            WHERE grant_row.org_id=tenant_id
              AND grant_row.membership_id=actor_id
              AND grant_row.status='active'
              AND grant_row.valid_from_at<=pg_catalog.transaction_timestamp()
              AND (grant_row.expires_at IS NULL OR grant_row.expires_at>pg_catalog.transaction_timestamp())
              AND (grant_row.branch_id IS NULL OR grant_row.branch_id=p_branch_id)
       );
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='calculation branch is outside actor scope';
    END IF;
    IF p_expires_at<=pg_catalog.transaction_timestamp()
       OR p_expires_at>pg_catalog.transaction_timestamp()+interval '24 hours' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation artifact expiry must be within 24 hours';
    END IF;
    IF pg_catalog.octet_length(p_request_sha256)<>32
       OR pg_catalog.octet_length(p_input_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.octet_length(p_output_bytes) NOT BETWEEN 2 AND 1048576
       OR pg_catalog.btrim(p_engine_version)=''
       OR pg_catalog.btrim(p_ruleset_version)=''
       OR p_serializer_version<>'aasopharma-jcs-decimal-v1' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation bytes, hashes, or versions are invalid';
    END IF;
    BEGIN
        input_document := pg_catalog.convert_from(p_input_bytes,'UTF8')::jsonb;
        output_document := pg_catalog.convert_from(p_output_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation envelopes must be valid UTF-8 JSON';
    END;
    IF pg_catalog.jsonb_typeof(input_document)<>'object'
       OR pg_catalog.jsonb_typeof(output_document)<>'object' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='calculation envelopes must be JSON objects';
    END IF;
    PERFORM erp_calculation_authority.assert_input_schema(input_document);
    PERFORM erp_calculation_authority.assert_output_schema(output_document);
    IF input_document->>'operation'<>p_operation
       OR input_document->>'resource_type'<>p_resource_type
       OR input_document->>'resource_id'<>p_resource_id::text
       OR (input_document->>'aggregate_version')::bigint<>p_aggregate_version
       OR input_document->>'serializer_version'<>p_serializer_version
       OR output_document->>'operation'<>p_operation
       OR output_document->>'resource_type'<>p_resource_type
       OR output_document->>'resource_id'<>p_resource_id::text
       OR (output_document->>'aggregate_version')::bigint<>p_aggregate_version
       OR output_document->>'engine_version'<>p_engine_version
       OR output_document->>'ruleset_version'<>p_ruleset_version
       OR output_document->>'serializer_version'<>p_serializer_version THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation envelope metadata differs from authority binding';
    END IF;
    PERFORM 1 FROM core.idempotency_keys
     WHERE org_id=tenant_id AND id=p_idempotency_key_id
       AND actor_membership_id=actor_id AND operation=p_operation
       AND request_hash=p_request_sha256 AND status='claimed'
       AND expires_at>pg_catalog.transaction_timestamp()
     FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation requires the matching live idempotency claim';
    END IF;

    CASE p_resource_type
      WHEN 'sales_order' THEN
        IF p_operation<>'sales.order.approve' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status
          FROM sales.orders WHERE org_id=tenant_id AND id=p_resource_id FOR SHARE;
        candidate.sales_order_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales order is not submitted'; END IF;
      WHEN 'sales_invoice' THEN
        IF p_operation<>'sales.invoice.post' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status
          FROM sales.invoices WHERE org_id=tenant_id AND id=p_resource_id FOR SHARE;
        candidate.sales_invoice_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales invoice is not draft'; END IF;
      WHEN 'sales_return' THEN
        IF p_operation<>'sales.return.post' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status
          FROM sales.returns WHERE org_id=tenant_id AND id=p_resource_id FOR SHARE;
        candidate.sales_return_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return is not draft'; END IF;
      WHEN 'purchase_order' THEN
        IF p_operation<>'procurement.purchase_order.approve' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status
          FROM procurement.purchase_orders WHERE org_id=tenant_id AND id=p_resource_id FOR SHARE;
        candidate.purchase_order_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase order is not submitted'; END IF;
      WHEN 'supplier_invoice' THEN
        IF p_operation<>'procurement.supplier_invoice.post' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status
          FROM procurement.supplier_invoices WHERE org_id=tenant_id AND id=p_resource_id FOR SHARE;
        candidate.supplier_invoice_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice is not approved'; END IF;
      WHEN 'purchase_return' THEN
        IF p_operation<>'procurement.purchase_return.post' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status
          FROM procurement.purchase_returns WHERE org_id=tenant_id AND id=p_resource_id FOR SHARE;
        candidate.purchase_return_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase return is not submitted'; END IF;
      WHEN 'adjustment_note' THEN
        IF p_operation<>'finance.adjustment_note.post' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='operation and typed aggregate differ'; END IF;
        SELECT coalesce(sales_invoice.branch_id,supplier_invoice.branch_id),note.row_version,note.status
          INTO actual_branch_id,actual_version,actual_status
          FROM finance.adjustment_notes note
          LEFT JOIN sales.invoices sales_invoice ON sales_invoice.org_id=note.org_id AND sales_invoice.id=note.sales_invoice_id
          LEFT JOIN procurement.supplier_invoices supplier_invoice ON supplier_invoice.org_id=note.org_id AND supplier_invoice.id=note.supplier_invoice_id
         WHERE note.org_id=tenant_id AND note.id=p_resource_id FOR SHARE OF note;
        candidate.adjustment_note_id := p_resource_id;
        IF actual_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment note is not approved'; END IF;
      ELSE
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported calculation aggregate type';
    END CASE;
    IF actual_branch_id IS DISTINCT FROM p_branch_id
       OR actual_version IS DISTINCT FROM p_aggregate_version THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='calculation aggregate branch or version changed';
    END IF;
    version_hash := erp_calculation_authority.aggregate_version_hash(
        p_resource_type,p_resource_id,p_aggregate_version
    );
    IF p_command_request_id IS NOT NULL THEN
        PERFORM 1 FROM automation.command_requests
         WHERE org_id=tenant_id AND id=p_command_request_id
           AND requested_by_membership_id=actor_id AND operation=p_operation
           AND request_hash=p_request_sha256
           AND aggregate_version_hash=version_hash
           AND calculation_hash IS NULL
           AND status IN ('prepared','pending_approval','approved')
           AND expires_at>pg_catalog.transaction_timestamp()
         FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='agent command does not match calculation binding';
        END IF;
    END IF;

    candidate.org_id := tenant_id;
    candidate.id := p_artifact_id;
    candidate.branch_id := p_branch_id;
    candidate.operation := p_operation;
    candidate.aggregate_version := p_aggregate_version;
    candidate.actor_membership_id := actor_id;
    candidate.request_id := p_request_id;
    candidate.command_request_id := p_command_request_id;
    candidate.idempotency_key_id := p_idempotency_key_id;
    candidate.request_sha256 := p_request_sha256;
    candidate.input_media_type := 'application/vnd.aasopharma.calculation-input+json';
    candidate.input_bytes := p_input_bytes;
    candidate.input_sha256 := extensions.digest(p_input_bytes,'sha256');
    candidate.output_media_type := 'application/vnd.aasopharma.calculation-output+json';
    candidate.output_bytes := p_output_bytes;
    candidate.output_sha256 := extensions.digest(p_output_bytes,'sha256');
    candidate.engine_version := p_engine_version;
    candidate.ruleset_version := p_ruleset_version;
    candidate.serializer_version := p_serializer_version;
    candidate.calculator_principal := SESSION_USER;
    candidate.attestation_method := 'postgresql_session_user_v1';
    candidate.authority_version := '1';
    candidate.status := 'issued';
    candidate.issued_at := pg_catalog.transaction_timestamp();
    candidate.expires_at := p_expires_at;
    candidate.authority_hash := erp_calculation_authority.artifact_hash(candidate);

    SELECT * INTO existing FROM calculation.artifacts
     WHERE org_id=tenant_id AND idempotency_key_id=p_idempotency_key_id FOR SHARE;
    IF existing.id IS NOT NULL THEN
        IF existing.id=p_artifact_id AND existing.branch_id=p_branch_id
           AND existing.operation=p_operation AND existing.aggregate_version=p_aggregate_version
           AND existing.actor_membership_id=actor_id AND existing.request_id=p_request_id
           AND existing.command_request_id IS NOT DISTINCT FROM p_command_request_id
           AND existing.request_sha256=p_request_sha256
           AND existing.input_bytes=p_input_bytes AND existing.output_bytes=p_output_bytes
           AND existing.engine_version=p_engine_version
           AND existing.ruleset_version=p_ruleset_version
           AND existing.serializer_version=p_serializer_version
           AND existing.calculator_principal='erp_calculator'
           AND existing.attestation_method='postgresql_session_user_v1'
           AND existing.expires_at=p_expires_at
           AND existing.authority_hash=erp_calculation_authority.artifact_hash(existing) THEN
            RETURN existing.id;
        END IF;
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='idempotency claim already binds a different calculation artifact';
    END IF;

    INSERT INTO calculation.artifacts SELECT candidate.*;
    IF p_command_request_id IS NOT NULL THEN
        PERFORM erp_automation_commands.link_calculation_artifact(
            tenant_id,p_command_request_id,candidate.id,candidate.authority_hash
        );
    END IF;
    RETURN candidate.id;
END
$function$;

ALTER FUNCTION "erp_calculation_authority"."issue_artifact"(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid,bytea,bytea,bytea,varchar,varchar,varchar,timestamptz) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_calculation_authority"."issue_artifact"(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid,bytea,bytea,bytea,varchar,varchar,varchar,timestamptz) FROM PUBLIC, "erp_app", "erp_runtime";

CREATE FUNCTION "erp_calculation_authority"."consume_artifact"(p_org_id uuid, p_artifact_id uuid, p_operation varchar, p_resource_type varchar, p_resource_id uuid, p_aggregate_version bigint, p_request_id uuid, p_command_request_id uuid, p_idempotency_key_id uuid)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    tenant_id uuid := NULLIF(pg_catalog.current_setting('app.org_id',true),'')::uuid;
    actor_id uuid := NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid;
    artifact calculation.artifacts%ROWTYPE;
    actual_branch_id uuid;
    actual_version bigint;
    actual_status text;
    typed_resource_id uuid;
    version_hash bytea;
BEGIN
    IF tenant_id IS DISTINCT FROM p_org_id OR actor_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='calculation consumption tenant or actor context is invalid';
    END IF;
    SELECT * INTO STRICT artifact FROM calculation.artifacts
     WHERE org_id=p_org_id AND id=p_artifact_id FOR UPDATE;
    typed_resource_id := COALESCE(
        artifact.sales_order_id,artifact.sales_invoice_id,artifact.sales_return_id,
        artifact.purchase_order_id,artifact.supplier_invoice_id,artifact.purchase_return_id,
        artifact.adjustment_note_id
    );
    IF artifact.status<>'issued' OR artifact.consumed_at IS NOT NULL
       OR artifact.expires_at<=pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact is consumed or expired';
    END IF;
    IF artifact.operation IS DISTINCT FROM p_operation
       OR typed_resource_id IS DISTINCT FROM p_resource_id
       OR artifact.aggregate_version IS DISTINCT FROM p_aggregate_version
       OR artifact.actor_membership_id IS DISTINCT FROM actor_id
       OR artifact.request_id IS DISTINCT FROM p_request_id
       OR artifact.command_request_id IS DISTINCT FROM p_command_request_id
       OR artifact.idempotency_key_id IS DISTINCT FROM p_idempotency_key_id
       OR artifact.calculator_principal<>'erp_calculator'
       OR artifact.attestation_method<>'postgresql_session_user_v1'
       OR artifact.input_sha256<>extensions.digest(artifact.input_bytes,'sha256')
       OR artifact.output_sha256<>extensions.digest(artifact.output_bytes,'sha256')
       OR artifact.authority_hash<>erp_calculation_authority.artifact_hash(artifact) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact proof or command binding is invalid';
    END IF;
    PERFORM 1 FROM core.idempotency_keys
     WHERE org_id=p_org_id AND id=p_idempotency_key_id
       AND actor_membership_id=actor_id AND operation=p_operation
       AND request_hash=artifact.request_sha256 AND status='claimed'
       AND expires_at>pg_catalog.transaction_timestamp()
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation idempotency claim is no longer executable';
    END IF;

    CASE p_resource_type
      WHEN 'sales_order' THEN
        IF artifact.sales_order_id IS NULL OR p_operation<>'sales.order.approve' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status FROM sales.orders WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
        IF actual_status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales order state changed'; END IF;
      WHEN 'sales_invoice' THEN
        IF artifact.sales_invoice_id IS NULL OR p_operation<>'sales.invoice.post' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status FROM sales.invoices WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
        IF actual_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales invoice state changed'; END IF;
      WHEN 'sales_return' THEN
        IF artifact.sales_return_id IS NULL OR p_operation<>'sales.return.post' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status FROM sales.returns WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
        IF actual_status IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sales return state changed'; END IF;
      WHEN 'purchase_order' THEN
        IF artifact.purchase_order_id IS NULL OR p_operation<>'procurement.purchase_order.approve' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status FROM procurement.purchase_orders WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
        IF actual_status IS DISTINCT FROM 'submitted' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase order state changed'; END IF;
      WHEN 'supplier_invoice' THEN
        IF artifact.supplier_invoice_id IS NULL OR p_operation<>'procurement.supplier_invoice.post' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status FROM procurement.supplier_invoices WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
        IF actual_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier invoice state changed'; END IF;
      WHEN 'purchase_return' THEN
        IF artifact.purchase_return_id IS NULL OR p_operation<>'procurement.purchase_return.post' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT branch_id,row_version,status INTO actual_branch_id,actual_version,actual_status FROM procurement.purchase_returns WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
        IF actual_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='purchase return state changed'; END IF;
      WHEN 'adjustment_note' THEN
        IF artifact.adjustment_note_id IS NULL OR p_operation<>'finance.adjustment_note.post' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='typed calculation source mismatch'; END IF;
        SELECT coalesce(sales_invoice.branch_id,supplier_invoice.branch_id),note.row_version,note.status
          INTO actual_branch_id,actual_version,actual_status
          FROM finance.adjustment_notes note
          LEFT JOIN sales.invoices sales_invoice ON sales_invoice.org_id=note.org_id AND sales_invoice.id=note.sales_invoice_id
          LEFT JOIN procurement.supplier_invoices supplier_invoice ON supplier_invoice.org_id=note.org_id AND supplier_invoice.id=note.supplier_invoice_id
         WHERE note.org_id=p_org_id AND note.id=p_resource_id FOR UPDATE OF note;
        IF actual_status IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='adjustment note state changed'; END IF;
      ELSE
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported calculation aggregate type';
    END CASE;
    IF actual_branch_id IS DISTINCT FROM artifact.branch_id
       OR actual_version IS DISTINCT FROM p_aggregate_version THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='calculation aggregate changed after issuance';
    END IF;
    version_hash := erp_calculation_authority.aggregate_version_hash(
        p_resource_type,p_resource_id,p_aggregate_version
    );
    IF p_command_request_id IS NOT NULL THEN
        PERFORM 1 FROM automation.command_requests
         WHERE org_id=p_org_id AND id=p_command_request_id
           AND requested_by_membership_id=actor_id AND operation=p_operation
           AND request_hash=artifact.request_sha256
           AND calculation_hash=artifact.authority_hash
           AND aggregate_version_hash=version_hash
           AND status IN ('approved','executing')
           AND expires_at>pg_catalog.transaction_timestamp()
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved agent command no longer matches calculation proof';
        END IF;
    END IF;

    UPDATE calculation.artifacts
       SET status='consumed', consumed_at=pg_catalog.transaction_timestamp(),
           consumed_by_membership_id=actor_id
     WHERE org_id=p_org_id AND id=p_artifact_id AND status='issued';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact was already consumed';
    END IF;
    RETURN artifact.output_bytes;
END
$function$;

ALTER FUNCTION "erp_calculation_authority"."consume_artifact"(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid) OWNER TO "erp_migration_owner";

REVOKE ALL ON FUNCTION "erp_calculation_authority"."consume_artifact"(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid) FROM PUBLIC, "erp_app", "erp_runtime";

GRANT EXECUTE ON FUNCTION "erp_calculation_authority"."issue_artifact"(uuid,uuid,varchar,varchar,uuid,bigint,uuid,uuid,uuid,bytea,bytea,bytea,varchar,varchar,varchar,timestamptz) TO "erp_calculator";

COMMIT;
