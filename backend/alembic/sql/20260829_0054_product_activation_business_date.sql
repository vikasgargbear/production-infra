-- Revision 20260829_0054.
SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_master_commands.activate_configured_product(
  organization_id uuid,
  product_identifier uuid,
  expected_row_version bigint,
  manufacturer_traceability_code varchar,
  idempotency_key_hash bytea,
  expires_at timestamptz
)
RETURNS TABLE(
  product_id uuid,product_code varchar,product_name text,new_row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE missing text[]; was_replayed boolean;
        organization_timezone text; prior_timezone text;
BEGIN
  missing:=erp_master_commands.product_setup_missing_fields(
    organization_id,product_identifier,
    erp_core_commands.current_organization_business_date()
  );
  IF pg_catalog.cardinality(missing)>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='product setup is incomplete: '||pg_catalog.array_to_string(missing,', ');
  END IF;
  SELECT organization.timezone INTO STRICT organization_timezone
    FROM core.organizations organization
   WHERE organization.id=organization_id AND organization.status='active';
  SELECT EXISTS(
    SELECT 1 FROM core.idempotency_keys claim
     WHERE claim.org_id=organization_id
       AND claim.operation='catalog.product.activate'
       AND claim.idempotency_key_hash=idempotency_key_hash
       AND claim.status='succeeded'
       AND claim.resource_type='catalog.products'
       AND claim.resource_id=product_identifier
  ) INTO was_replayed;
  prior_timezone:=pg_catalog.current_setting('TimeZone');
  BEGIN
    -- The inherited regulatory command evaluates effective-dated reference
    -- facts with CURRENT_DATE. Pin that date to the organization clock for the
    -- duration of the only runtime activation boundary, then restore the
    -- caller's session setting on success or error.
    PERFORM pg_catalog.set_config('TimeZone',organization_timezone,true);
    PERFORM erp_regulatory_commands.activate_product(
      organization_id,product_identifier,expected_row_version,
      manufacturer_traceability_code,idempotency_key_hash,expires_at
    );
    PERFORM pg_catalog.set_config('TimeZone',prior_timezone,true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_catalog.set_config('TimeZone',prior_timezone,true);
    RAISE;
  END;
  RETURN QUERY SELECT product.id,product.sku,product.name,product.row_version,was_replayed
    FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier
     AND product.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='activated product readback is unavailable';
  END IF;
END
$function$;

ALTER FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.activate_configured_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) TO erp_runtime;

-- The security-definer setup command is the sole runtime activation owner.
-- Its organization-timezone scope contains the inherited regulatory command's
-- effective-date checks without exposing that lower-level command directly.
REVOKE EXECUTE ON FUNCTION erp_regulatory_commands.activate_product(
  uuid,uuid,bigint,varchar,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;

RESET ROLE;
