SET LOCAL ROLE erp_migration_owner;

CREATE OR REPLACE FUNCTION erp_master_commands.create_customer(
  organization_id uuid,
  customer_name text,
  customer_type text,
  primary_phone text,
  primary_email text,
  contact_person_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state_code text,
  postal_code text,
  gstin text,
  pan text,
  credit_limit numeric,
  credit_days integer,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  customer_account_id uuid,
  party_id uuid,
  customer_code text,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; generated_code text; party_identifier uuid;
        account_identifier uuid; receivable_account_id uuid;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.customer.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','parties.customer.create','customer_name',customer_name,
    'customer_type',customer_type,'primary_phone',primary_phone,
    'primary_email',primary_email,'contact_person_name',contact_person_name,
    'address_line1',address_line1,'address_line2',address_line2,'city',city,
    'state_code',state_code,'postal_code',postal_code,'gstin',gstin,'pan',pan,
    'credit_limit',credit_limit,'credit_days',credit_days
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'parties.customer.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT account.id,account.party_id,account.customer_code,true
     INTO STRICT customer_account_id,party_id,customer_code,idempotency_replayed
      FROM parties.customer_accounts account
     WHERE account.org_id=organization_id AND account.id=claim.resource_id
       AND claim.resource_type='parties.customer_accounts';
    RETURN NEXT; RETURN;
  END IF;
  IF customer_name IS NULL OR btrim(customer_name)=''
     OR customer_type IS NULL
     OR customer_type NOT IN ('individual','organization')
     OR primary_phone IS NULL OR primary_phone !~ '^[0-9]{10}$'
     OR (primary_email IS NOT NULL AND btrim(primary_email)='')
     OR pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
     OR gstin IS NOT NULL AND gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
     OR pg_catalog.num_nonnulls(address_line1,city,state_code,postal_code) NOT IN (0,4)
     OR state_code IS NOT NULL AND state_code !~ '^[0-9]{2}$'
     OR postal_code IS NOT NULL AND postal_code !~ '^[0-9]{6}$'
     OR gstin IS NOT NULL AND state_code IS DISTINCT FROM left(gstin,2)
     OR credit_limit IS NULL OR credit_limit<0
     OR credit_days IS NULL OR credit_days NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer master facts are invalid';
  END IF;
  receivable_account_id:=erp_commercial_commands.resolve_role_account(
    organization_id,NULL::uuid,'accounts_receivable','asset','INR',true
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':party-name:'||pg_catalog.lower(pg_catalog.btrim(customer_name)),
    8727001
  ));
  IF EXISTS (
    SELECT 1 FROM parties.parties party
     WHERE party.org_id=organization_id
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
           pg_catalog.lower(pg_catalog.btrim(customer_name))
       AND party.status IN ('draft','active','blocked')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='party legal name already exists';
  END IF;
  generated_code:=erp_master_commands.allocate_code(organization_id,'customer',actor_id);
  party_identifier:=gen_random_uuid(); account_identifier:=gen_random_uuid();
  INSERT INTO parties.parties(
    org_id,id,party_kind,legal_name,pan,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,party_identifier,customer_type,customer_name,pan,'draft',actor_id,actor_id
  );
  INSERT INTO parties.contacts(
    org_id,party_id,contact_kind,name,email,phone,is_primary,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,party_identifier,'business',
    coalesce(nullif(contact_person_name,''),customer_name),primary_email,primary_phone,
    true,'active',actor_id,actor_id
  );
  IF address_line1 IS NOT NULL THEN
    INSERT INTO parties.addresses(
      org_id,party_id,address_kind,line1,line2,city,state_code,postal_code,
      country_code,is_primary,status,created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'billing',address_line1,address_line2,city,
      state_code,postal_code,'IN',true,'active',actor_id,actor_id
    );
  END IF;
  IF gstin IS NOT NULL THEN
    INSERT INTO parties.tax_registrations(
      org_id,party_id,registration_type,registration_number,
      registered_legal_name,state_code,taxpayer_type,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'GSTIN',gstin,customer_name,state_code,
      'regular','pending_verification',actor_id,actor_id
    );
  END IF;
  UPDATE parties.parties
     SET status='active',updated_at=transaction_timestamp(),
         updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=party_identifier AND status='draft';
  INSERT INTO parties.customer_accounts(
    org_id,id,party_id,customer_code,credit_limit,credit_days,
    default_receivable_account_id,status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,account_identifier,party_identifier,generated_code,
    credit_limit,credit_days,receivable_account_id,'active',actor_id,actor_id
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'parties.customer_accounts',account_identifier,
    pg_catalog.jsonb_build_object(
      'customer_account_id',account_identifier,'party_id',party_identifier,
      'customer_code',generated_code
    )
  );
  customer_account_id:=account_identifier; party_id:=party_identifier;
  customer_code:=generated_code; idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

CREATE OR REPLACE FUNCTION erp_master_commands.create_supplier(
  organization_id uuid,
  supplier_name text,
  primary_phone text,
  primary_email text,
  contact_person_name text,
  address_line1 text,
  address_line2 text,
  city text,
  state_code text,
  postal_code text,
  gstin text,
  pan text,
  payment_days integer,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  supplier_account_id uuid,
  party_id uuid,
  supplier_code text,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; generated_code text; party_identifier uuid;
        account_identifier uuid; payable_account_id uuid;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.supplier.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','parties.supplier.create','supplier_name',supplier_name,
    'primary_phone',primary_phone,'primary_email',primary_email,
    'contact_person_name',contact_person_name,'address_line1',address_line1,
    'address_line2',address_line2,'city',city,'state_code',state_code,
    'postal_code',postal_code,'gstin',gstin,'pan',pan,'payment_days',payment_days
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'parties.supplier.create',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    SELECT account.id,account.party_id,account.supplier_code,true
     INTO STRICT supplier_account_id,party_id,supplier_code,idempotency_replayed
      FROM parties.supplier_accounts account
     WHERE account.org_id=organization_id AND account.id=claim.resource_id
       AND claim.resource_type='parties.supplier_accounts';
    RETURN NEXT; RETURN;
  END IF;
  IF supplier_name IS NULL OR btrim(supplier_name)=''
     OR primary_phone IS NOT NULL AND primary_phone !~ '^[0-9]{10}$'
     OR (primary_email IS NOT NULL AND btrim(primary_email)='')
     OR pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$'
     OR gstin IS NOT NULL AND gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
     OR pg_catalog.num_nonnulls(address_line1,city,state_code,postal_code) NOT IN (0,4)
     OR state_code IS NOT NULL AND state_code !~ '^[0-9]{2}$'
     OR postal_code IS NOT NULL AND postal_code !~ '^[0-9]{6}$'
     OR gstin IS NOT NULL AND state_code IS DISTINCT FROM left(gstin,2)
     OR payment_days IS NULL OR payment_days NOT BETWEEN 0 AND 180 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier master facts are invalid';
  END IF;
  payable_account_id:=erp_commercial_commands.resolve_role_account(
    organization_id,NULL::uuid,'accounts_payable','liability','INR',true
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':party-name:'||pg_catalog.lower(pg_catalog.btrim(supplier_name)),
    8727001
  ));
  IF EXISTS (
    SELECT 1 FROM parties.parties party
     WHERE party.org_id=organization_id
       AND pg_catalog.lower(pg_catalog.btrim(party.legal_name))=
           pg_catalog.lower(pg_catalog.btrim(supplier_name))
       AND party.status IN ('draft','active','blocked')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='party legal name already exists';
  END IF;
  generated_code:=erp_master_commands.allocate_code(organization_id,'supplier',actor_id);
  party_identifier:=gen_random_uuid(); account_identifier:=gen_random_uuid();
  INSERT INTO parties.parties(
    org_id,id,party_kind,legal_name,pan,status,
    created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,party_identifier,'organization',supplier_name,pan,'draft',actor_id,actor_id
  );
  IF primary_phone IS NOT NULL OR primary_email IS NOT NULL THEN
    INSERT INTO parties.contacts(
      org_id,party_id,contact_kind,name,email,phone,is_primary,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'business',
      coalesce(nullif(contact_person_name,''),supplier_name),primary_email,primary_phone,
      true,'active',actor_id,actor_id
    );
  END IF;
  IF address_line1 IS NOT NULL THEN
    INSERT INTO parties.addresses(
      org_id,party_id,address_kind,line1,line2,city,state_code,postal_code,
      country_code,is_primary,status,created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'billing',address_line1,address_line2,city,
      state_code,postal_code,'IN',true,'active',actor_id,actor_id
    );
  END IF;
  IF gstin IS NOT NULL THEN
    INSERT INTO parties.tax_registrations(
      org_id,party_id,registration_type,registration_number,
      registered_legal_name,state_code,taxpayer_type,status,
      created_by_membership_id,updated_by_membership_id
    ) VALUES (
      organization_id,party_identifier,'GSTIN',gstin,supplier_name,state_code,
      'regular','pending_verification',actor_id,actor_id
    );
  END IF;
  UPDATE parties.parties
     SET status='active',updated_at=transaction_timestamp(),
         updated_by_membership_id=actor_id,row_version=row_version+1
   WHERE org_id=organization_id AND id=party_identifier AND status='draft';
  INSERT INTO parties.supplier_accounts(
    org_id,id,party_id,supplier_code,payment_days,default_payable_account_id,
    status,created_by_membership_id,updated_by_membership_id
  ) VALUES (
    organization_id,account_identifier,party_identifier,generated_code,
    payment_days,payable_account_id,'active',actor_id,actor_id
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'parties.supplier_accounts',account_identifier,
    pg_catalog.jsonb_build_object(
      'supplier_account_id',account_identifier,'party_id',party_identifier,
      'supplier_code',generated_code
    )
  );
  supplier_account_id:=account_identifier; party_id:=party_identifier;
  supplier_code:=generated_code; idempotency_replayed:=false;
  RETURN NEXT;
END
$function$;

ALTER FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;

REVOKE ALL ON FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_customer(
  uuid,text,text,text,text,text,text,text,text,text,text,text,text,numeric,integer,bytea,timestamptz
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.create_supplier(
  uuid,text,text,text,text,text,text,text,text,text,text,text,integer,bytea,timestamptz
) TO erp_runtime;

RESET ROLE;
