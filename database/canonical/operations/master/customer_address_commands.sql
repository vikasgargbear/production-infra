CREATE FUNCTION erp_master_commands.create_party_address(
  organization_id uuid,
  party_identifier uuid,
  address_kind text,
  address_line1 text,
  address_line2 text,
  landmark text,
  city text,
  state_code text,
  postal_code text,
  make_primary boolean
)
RETURNS TABLE(address_id uuid,row_version bigint,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; country_code text; business_date date; existing parties.addresses%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.party.manage',NULL::uuid
  );
  IF party_identifier IS NULL OR address_kind NOT IN ('billing','shipping','other')
     OR address_line1 IS NULL OR pg_catalog.btrim(address_line1)=''
     OR city IS NULL OR pg_catalog.btrim(city)=''
     OR state_code !~ '^[0-9]{2}$' OR postal_code !~ '^[0-9]{6}$'
     OR make_primary IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='party address is invalid';
  END IF;
  SELECT organization.country_code,
         (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
    INTO STRICT country_code,business_date
    FROM core.organizations organization
   WHERE organization.id=organization_id AND organization.status='active' FOR SHARE;
  PERFORM 1 FROM parties.parties party
   WHERE party.org_id=organization_id AND party.id=party_identifier
     AND party.status IN ('draft','active') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='party not found';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||party_identifier::text||':address:'||address_kind,8727003
  ));
  SELECT * INTO existing FROM parties.addresses address
   WHERE address.org_id=organization_id AND address.party_id=party_identifier
     AND address.address_kind=address_kind AND address.status='active'
     AND address.valid_until IS NULL
     AND address.line1=pg_catalog.btrim(address_line1)
     AND address.line2 IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(address_line2),'')
     AND address.landmark IS NOT DISTINCT FROM NULLIF(pg_catalog.btrim(landmark),'')
     AND address.city=pg_catalog.btrim(city) AND address.state_code=state_code
     AND address.postal_code=postal_code AND address.country_code=country_code
     AND address.is_primary=make_primary
   ORDER BY address.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    address_id:=existing.id; row_version:=existing.row_version;
    idempotency_replayed:=true; RETURN NEXT; RETURN;
  END IF;
  IF make_primary OR NOT EXISTS(
    SELECT 1 FROM parties.addresses address
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.status='active'
       AND address.valid_until IS NULL AND address.is_primary
  ) THEN
    make_primary:=true;
    UPDATE parties.addresses address
       SET is_primary=false,updated_at=pg_catalog.transaction_timestamp(),
           updated_by_membership_id=actor_id,row_version=address.row_version+1
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.status='active'
       AND address.valid_until IS NULL AND address.is_primary;
  END IF;
  address_id:=gen_random_uuid();
  INSERT INTO parties.addresses(
    org_id,id,party_id,address_kind,line1,line2,landmark,city,state_code,
    postal_code,country_code,is_primary,valid_from,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES(
    organization_id,address_id,party_identifier,address_kind,pg_catalog.btrim(address_line1),
    NULLIF(pg_catalog.btrim(address_line2),''),NULLIF(pg_catalog.btrim(landmark),''),
    pg_catalog.btrim(city),state_code,postal_code,country_code,make_primary,
    business_date,'active',actor_id,actor_id
  );
  row_version:=1; idempotency_replayed:=false; RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_master_commands.update_party_address(
  organization_id uuid,
  party_identifier uuid,
  address_identifier uuid,
  expected_row_version bigint,
  address_kind text,
  address_line1 text,
  address_line2 text,
  landmark text,
  city text,
  state_code text,
  postal_code text,
  make_primary boolean
)
RETURNS TABLE(address_id uuid,row_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; current_address parties.addresses%ROWTYPE;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.party.manage',NULL::uuid
  );
  IF party_identifier IS NULL OR address_identifier IS NULL
     OR expected_row_version IS NULL OR expected_row_version<=0
     OR address_kind NOT IN ('billing','shipping','other')
     OR address_line1 IS NULL OR pg_catalog.btrim(address_line1)=''
     OR city IS NULL OR pg_catalog.btrim(city)=''
     OR state_code !~ '^[0-9]{2}$' OR postal_code !~ '^[0-9]{6}$'
     OR make_primary IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='party address update is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||party_identifier::text||':address:'||address_kind,8727003
  ));
  SELECT * INTO current_address FROM parties.addresses address
   WHERE address.org_id=organization_id AND address.party_id=party_identifier
     AND address.id=address_identifier AND address.status='active'
     AND address.valid_until IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='party address not found';
  END IF;
  IF current_address.row_version<>expected_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='party address row version changed';
  END IF;
  IF make_primary OR NOT EXISTS(
    SELECT 1 FROM parties.addresses address
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.id<>address_identifier
       AND address.status='active' AND address.valid_until IS NULL AND address.is_primary
  ) THEN
    make_primary:=true;
    UPDATE parties.addresses address
       SET is_primary=false,updated_at=pg_catalog.transaction_timestamp(),
           updated_by_membership_id=actor_id,row_version=address.row_version+1
     WHERE address.org_id=organization_id AND address.party_id=party_identifier
       AND address.address_kind=address_kind AND address.id<>address_identifier
       AND address.status='active' AND address.valid_until IS NULL AND address.is_primary;
  END IF;
  RETURN QUERY
  UPDATE parties.addresses address
     SET address_kind=address_kind,line1=pg_catalog.btrim(address_line1),
         line2=NULLIF(pg_catalog.btrim(address_line2),''),
         landmark=NULLIF(pg_catalog.btrim(landmark),''),city=pg_catalog.btrim(city),
         state_code=state_code,postal_code=postal_code,is_primary=make_primary,
         updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
         row_version=address.row_version+1
   WHERE address.org_id=organization_id AND address.party_id=party_identifier
     AND address.id=address_identifier
  RETURNING address.id,address.row_version;
END
$function$;

ALTER FUNCTION erp_master_commands.create_party_address(
  uuid,uuid,text,text,text,text,text,text,text,boolean
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.update_party_address(
  uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,boolean
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.create_party_address(
  uuid,uuid,text,text,text,text,text,text,text,boolean
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.update_party_address(
  uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,boolean
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_party_address(
  uuid,uuid,text,text,text,text,text,text,text,boolean
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.update_party_address(
  uuid,uuid,uuid,bigint,text,text,text,text,text,text,text,boolean
) TO erp_runtime;
