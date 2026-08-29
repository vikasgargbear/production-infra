SET LOCAL ROLE erp_migration_owner;

CREATE FUNCTION erp_master_commands.update_customer_account(
  organization_id uuid,
  customer_identifier uuid,
  expected_account_row_version bigint,
  expected_party_row_version bigint,
  set_customer_name boolean,
  customer_name text,
  set_customer_type boolean,
  customer_type text,
  set_primary_phone boolean,
  primary_phone text,
  set_primary_email boolean,
  primary_email text,
  set_contact_person_name boolean,
  contact_person_name text,
  set_pan boolean,
  pan text,
  set_credit_limit boolean,
  credit_limit numeric,
  set_credit_days boolean,
  credit_days integer,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  customer_account_id uuid,
  party_id uuid,
  customer_code text,
  updated_customer_name text,
  updated_customer_type text,
  updated_primary_phone text,
  updated_primary_email text,
  updated_contact_person_name text,
  updated_pan text,
  updated_credit_limit numeric,
  updated_credit_days integer,
  account_row_version bigint,
  party_row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  actor_id uuid;
  claim core.idempotency_keys%ROWTYPE;
  request_document jsonb;
  response_document jsonb;
  account parties.customer_accounts%ROWTYPE;
  party parties.parties%ROWTYPE;
  contact parties.contacts%ROWTYPE;
  next_customer_name text;
  next_contact_name text;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.customer.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','parties.customer.update',
    'customer_account_id',customer_identifier,
    'expected_account_row_version',expected_account_row_version,
    'expected_party_row_version',expected_party_row_version,
    'set_customer_name',set_customer_name,'customer_name',customer_name,
    'set_customer_type',set_customer_type,'customer_type',customer_type,
    'set_primary_phone',set_primary_phone,'primary_phone',primary_phone,
    'set_primary_email',set_primary_email,'primary_email',primary_email,
    'set_contact_person_name',set_contact_person_name,
    'contact_person_name',contact_person_name,
    'set_pan',set_pan,'pan',pan,
    'set_credit_limit',set_credit_limit,'credit_limit',credit_limit,
    'set_credit_days',set_credit_days,'credit_days',credit_days
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'parties.customer.update',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    IF claim.resource_type<>'parties.customer_accounts'
       OR claim.resource_id IS DISTINCT FROM customer_identifier
       OR claim.response_body IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='customer update replay is invalid';
    END IF;
    response_document:=pg_catalog.convert_from(claim.response_body,'UTF8')::jsonb;
    customer_account_id:=(response_document->>'customer_account_id')::uuid;
    party_id:=(response_document->>'party_id')::uuid;
    customer_code:=response_document->>'customer_code';
    updated_customer_name:=response_document->>'customer_name';
    updated_customer_type:=response_document->>'customer_type';
    updated_primary_phone:=response_document->>'primary_phone';
    updated_primary_email:=response_document->>'primary_email';
    updated_contact_person_name:=response_document->>'contact_person_name';
    updated_pan:=response_document->>'pan_number';
    updated_credit_limit:=(response_document->>'credit_limit')::numeric;
    updated_credit_days:=(response_document->>'credit_days')::integer;
    account_row_version:=(response_document->>'account_row_version')::bigint;
    party_row_version:=(response_document->>'party_row_version')::bigint;
    idempotency_replayed:=true;
    RETURN NEXT;
    RETURN;
  END IF;
  IF customer_identifier IS NULL
     OR expected_account_row_version IS NULL OR expected_account_row_version<=0
     OR expected_party_row_version IS NULL OR expected_party_row_version<=0
     OR NOT (
       set_customer_name OR set_customer_type OR set_primary_phone
       OR set_primary_email OR set_contact_person_name OR set_pan
       OR set_credit_limit OR set_credit_days
     )
     OR (set_customer_name AND (customer_name IS NULL OR pg_catalog.btrim(customer_name)=''))
     OR (set_customer_type AND customer_type NOT IN ('individual','organization'))
     OR (set_primary_phone AND (primary_phone IS NULL OR primary_phone !~ '^[0-9]{10}$'))
     OR (set_primary_email AND primary_email IS NOT NULL
         AND primary_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     OR (set_pan AND pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
     OR (set_credit_limit AND (credit_limit IS NULL OR credit_limit<0))
     OR (set_credit_days AND (credit_days IS NULL OR credit_days NOT BETWEEN 0 AND 365)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer account update is invalid';
  END IF;
  SELECT * INTO account
    FROM parties.customer_accounts customer_account
   WHERE customer_account.org_id=organization_id
     AND customer_account.id=customer_identifier
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='customer account not found';
  END IF;
  IF account.status NOT IN ('active','on_hold') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer account cannot be edited in its current state';
  END IF;
  SELECT * INTO party
    FROM parties.parties customer_party
   WHERE customer_party.org_id=organization_id AND customer_party.id=account.party_id
   FOR UPDATE;
  IF NOT FOUND OR party.status NOT IN ('active','blocked') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='customer party is not editable';
  END IF;
  IF account.row_version<>expected_account_row_version
     OR party.row_version<>expected_party_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='customer account row version changed';
  END IF;
  next_customer_name:=CASE WHEN set_customer_name
    THEN pg_catalog.btrim(customer_name) ELSE party.legal_name END;
  IF set_customer_name THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text||':party-name:'||pg_catalog.lower(next_customer_name),8727001
    ));
    IF EXISTS(
      SELECT 1 FROM parties.parties candidate
       WHERE candidate.org_id=organization_id AND candidate.id<>party.id
         AND pg_catalog.lower(pg_catalog.btrim(candidate.legal_name))=
             pg_catalog.lower(next_customer_name)
         AND candidate.status IN ('draft','active','blocked')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='party legal name already exists';
    END IF;
  END IF;
  SELECT * INTO contact
    FROM parties.contacts primary_contact
   WHERE primary_contact.org_id=organization_id
     AND primary_contact.party_id=party.id AND primary_contact.status='active'
   ORDER BY primary_contact.is_primary DESC,primary_contact.id
   LIMIT 1 FOR UPDATE;
  IF contact.id IS NOT NULL
     AND (set_primary_phone OR set_primary_email)
     AND NULLIF(pg_catalog.btrim(
       CASE WHEN set_primary_phone THEN primary_phone ELSE contact.phone END
     ),'') IS NULL
     AND NULLIF(pg_catalog.btrim(
       CASE WHEN set_primary_email THEN primary_email ELSE contact.email END
     ),'') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer contact requires an email or phone';
  END IF;
  IF set_primary_phone OR set_primary_email OR set_contact_person_name THEN
    next_contact_name:=CASE WHEN set_contact_person_name
      THEN COALESCE(NULLIF(pg_catalog.btrim(contact_person_name),''),next_customer_name)
      WHEN contact.id IS NULL THEN next_customer_name ELSE contact.name END;
    IF contact.id IS NULL THEN
      IF NULLIF(pg_catalog.btrim(CASE WHEN set_primary_email THEN primary_email END),'') IS NULL
         AND NULLIF(pg_catalog.btrim(CASE WHEN set_primary_phone THEN primary_phone END),'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer contact requires an email or phone';
      END IF;
      INSERT INTO parties.contacts(
        org_id,party_id,contact_kind,name,email,phone,is_primary,status,
        created_by_membership_id,updated_by_membership_id
      ) VALUES (
        organization_id,party.id,'business',next_contact_name,
        CASE WHEN set_primary_email THEN NULLIF(pg_catalog.btrim(primary_email),'') END,
        CASE WHEN set_primary_phone THEN primary_phone END,
        true,'active',actor_id,actor_id
      ) RETURNING * INTO contact;
    ELSE
      UPDATE parties.contacts primary_contact
         SET name=next_contact_name,
             email=CASE WHEN set_primary_email
               THEN NULLIF(pg_catalog.btrim(primary_email),'') ELSE primary_contact.email END,
             phone=CASE WHEN set_primary_phone THEN primary_phone ELSE primary_contact.phone END,
             updated_at=pg_catalog.transaction_timestamp(),
             updated_by_membership_id=actor_id,row_version=primary_contact.row_version+1
       WHERE primary_contact.org_id=organization_id AND primary_contact.id=contact.id
      RETURNING primary_contact.* INTO contact;
    END IF;
  END IF;
  IF set_customer_name OR set_customer_type OR set_pan
     OR set_primary_phone OR set_primary_email OR set_contact_person_name THEN
    UPDATE parties.parties customer_party
       SET legal_name=next_customer_name,
           party_kind=CASE WHEN set_customer_type THEN customer_type ELSE customer_party.party_kind END,
           pan=CASE WHEN set_pan THEN NULLIF(pg_catalog.btrim(pan),'') ELSE customer_party.pan END,
           updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
           row_version=customer_party.row_version+1
     WHERE customer_party.org_id=organization_id AND customer_party.id=party.id
    RETURNING customer_party.* INTO party;
  END IF;
  IF set_credit_limit OR set_credit_days THEN
    INSERT INTO erp_core_commands.command_scopes(
      backend_pid,transaction_id,scope,org_id,entity_id
    ) VALUES (
      pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'customer_terms',
      organization_id,account.id
    );
  END IF;
  UPDATE parties.customer_accounts customer_account
     SET credit_limit=CASE WHEN set_credit_limit THEN credit_limit ELSE customer_account.credit_limit END,
         credit_days=CASE WHEN set_credit_days THEN credit_days ELSE customer_account.credit_days END,
         updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
         row_version=customer_account.row_version+1
   WHERE customer_account.org_id=organization_id AND customer_account.id=account.id
  RETURNING customer_account.* INTO account;
  IF set_credit_limit OR set_credit_days THEN
    DELETE FROM erp_core_commands.command_scopes
     WHERE backend_pid=pg_catalog.pg_backend_pid()
       AND transaction_id=pg_catalog.txid_current()
       AND scope='customer_terms' AND org_id=organization_id
       AND entity_id=account.id;
  END IF;
  customer_account_id:=account.id;
  party_id:=party.id;
  customer_code:=account.customer_code;
  updated_customer_name:=party.legal_name;
  updated_customer_type:=party.party_kind;
  updated_primary_phone:=contact.phone;
  updated_primary_email:=contact.email;
  updated_contact_person_name:=contact.name;
  updated_pan:=party.pan;
  updated_credit_limit:=account.credit_limit;
  updated_credit_days:=account.credit_days;
  account_row_version:=account.row_version;
  party_row_version:=party.row_version;
  idempotency_replayed:=false;
  response_document:=pg_catalog.jsonb_build_object(
    'customer_account_id',customer_account_id,'party_id',party_id,
    'customer_code',customer_code,'customer_name',updated_customer_name,
    'customer_type',updated_customer_type,'primary_phone',updated_primary_phone,
    'primary_email',updated_primary_email,'contact_person_name',updated_contact_person_name,
    'pan_number',updated_pan,'credit_limit',updated_credit_limit,
    'credit_days',updated_credit_days,'account_row_version',account_row_version,
    'party_row_version',party_row_version
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'parties.customer_accounts',account.id,response_document
  );
  RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_master_commands.update_supplier_account(
  organization_id uuid,
  supplier_identifier uuid,
  expected_account_row_version bigint,
  expected_party_row_version bigint,
  set_supplier_name boolean,
  supplier_name text,
  set_primary_phone boolean,
  primary_phone text,
  set_primary_email boolean,
  primary_email text,
  set_contact_person_name boolean,
  contact_person_name text,
  set_pan boolean,
  pan text,
  set_payment_days boolean,
  payment_days integer,
  idempotency_key_hash bytea,
  idempotency_expires_at timestamptz
)
RETURNS TABLE(
  supplier_account_id uuid,
  party_id uuid,
  supplier_code text,
  updated_supplier_name text,
  updated_primary_phone text,
  updated_primary_email text,
  updated_contact_person_name text,
  updated_pan text,
  updated_payment_days integer,
  account_row_version bigint,
  party_row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  actor_id uuid;
  claim core.idempotency_keys%ROWTYPE;
  request_document jsonb;
  response_document jsonb;
  account parties.supplier_accounts%ROWTYPE;
  party parties.parties%ROWTYPE;
  contact parties.contacts%ROWTYPE;
  next_supplier_name text;
  next_contact_name text;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'parties.supplier.manage',NULL::uuid
  );
  request_document:=pg_catalog.jsonb_build_object(
    'operation','parties.supplier.update',
    'supplier_account_id',supplier_identifier,
    'expected_account_row_version',expected_account_row_version,
    'expected_party_row_version',expected_party_row_version,
    'set_supplier_name',set_supplier_name,'supplier_name',supplier_name,
    'set_primary_phone',set_primary_phone,'primary_phone',primary_phone,
    'set_primary_email',set_primary_email,'primary_email',primary_email,
    'set_contact_person_name',set_contact_person_name,
    'contact_person_name',contact_person_name,
    'set_pan',set_pan,'pan',pan,
    'set_payment_days',set_payment_days,'payment_days',payment_days
  );
  claim:=erp_core_commands.claim(
    organization_id,actor_id,'parties.supplier.update',idempotency_key_hash,
    request_document,idempotency_expires_at
  );
  IF claim.status='succeeded' THEN
    IF claim.resource_type<>'parties.supplier_accounts'
       OR claim.resource_id IS DISTINCT FROM supplier_identifier
       OR claim.response_body IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='supplier update replay is invalid';
    END IF;
    response_document:=pg_catalog.convert_from(claim.response_body,'UTF8')::jsonb;
    supplier_account_id:=(response_document->>'supplier_account_id')::uuid;
    party_id:=(response_document->>'party_id')::uuid;
    supplier_code:=response_document->>'supplier_code';
    updated_supplier_name:=response_document->>'supplier_name';
    updated_primary_phone:=response_document->>'primary_phone';
    updated_primary_email:=response_document->>'primary_email';
    updated_contact_person_name:=response_document->>'contact_person_name';
    updated_pan:=response_document->>'pan_number';
    updated_payment_days:=(response_document->>'payment_days')::integer;
    account_row_version:=(response_document->>'account_row_version')::bigint;
    party_row_version:=(response_document->>'party_row_version')::bigint;
    idempotency_replayed:=true;
    RETURN NEXT;
    RETURN;
  END IF;
  IF supplier_identifier IS NULL
     OR expected_account_row_version IS NULL OR expected_account_row_version<=0
     OR expected_party_row_version IS NULL OR expected_party_row_version<=0
     OR NOT (
       set_supplier_name OR set_primary_phone OR set_primary_email
       OR set_contact_person_name OR set_pan OR set_payment_days
     )
     OR (set_supplier_name AND (supplier_name IS NULL OR pg_catalog.btrim(supplier_name)=''))
     OR (set_primary_phone AND primary_phone IS NOT NULL AND primary_phone !~ '^[0-9]{10}$')
     OR (set_primary_email AND primary_email IS NOT NULL
         AND primary_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
     OR (set_pan AND pan IS NOT NULL AND pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$')
     OR (set_payment_days AND (payment_days IS NULL OR payment_days NOT BETWEEN 0 AND 180)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier account update is invalid';
  END IF;
  SELECT * INTO account
    FROM parties.supplier_accounts supplier_account
   WHERE supplier_account.org_id=organization_id
     AND supplier_account.id=supplier_identifier
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='supplier account not found';
  END IF;
  IF account.status NOT IN ('active','on_hold') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier account cannot be edited in its current state';
  END IF;
  SELECT * INTO party
    FROM parties.parties supplier_party
   WHERE supplier_party.org_id=organization_id AND supplier_party.id=account.party_id
   FOR UPDATE;
  IF NOT FOUND OR party.status NOT IN ('active','blocked') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier party is not editable';
  END IF;
  IF account.row_version<>expected_account_row_version
     OR party.row_version<>expected_party_row_version THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='supplier account row version changed';
  END IF;
  next_supplier_name:=CASE WHEN set_supplier_name
    THEN pg_catalog.btrim(supplier_name) ELSE party.legal_name END;
  IF set_supplier_name THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      organization_id::text||':party-name:'||pg_catalog.lower(next_supplier_name),8727001
    ));
    IF EXISTS(
      SELECT 1 FROM parties.parties candidate
       WHERE candidate.org_id=organization_id AND candidate.id<>party.id
         AND pg_catalog.lower(pg_catalog.btrim(candidate.legal_name))=
             pg_catalog.lower(next_supplier_name)
         AND candidate.status IN ('draft','active','blocked')
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='party legal name already exists';
    END IF;
  END IF;
  SELECT * INTO contact
    FROM parties.contacts primary_contact
   WHERE primary_contact.org_id=organization_id
     AND primary_contact.party_id=party.id AND primary_contact.status='active'
   ORDER BY primary_contact.is_primary DESC,primary_contact.id
   LIMIT 1 FOR UPDATE;
  IF contact.id IS NOT NULL
     AND (set_primary_phone OR set_primary_email)
     AND NULLIF(pg_catalog.btrim(
       CASE WHEN set_primary_phone THEN primary_phone ELSE contact.phone END
     ),'') IS NULL
     AND NULLIF(pg_catalog.btrim(
       CASE WHEN set_primary_email THEN primary_email ELSE contact.email END
     ),'') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier contact requires an email or phone';
  END IF;
  IF set_primary_phone OR set_primary_email OR set_contact_person_name THEN
    next_contact_name:=CASE WHEN set_contact_person_name
      THEN COALESCE(NULLIF(pg_catalog.btrim(contact_person_name),''),next_supplier_name)
      WHEN contact.id IS NULL THEN next_supplier_name ELSE contact.name END;
    IF contact.id IS NULL THEN
      IF NULLIF(pg_catalog.btrim(CASE WHEN set_primary_email THEN primary_email END),'') IS NULL
         AND NULLIF(pg_catalog.btrim(CASE WHEN set_primary_phone THEN primary_phone END),'') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='supplier contact requires an email or phone';
      END IF;
      INSERT INTO parties.contacts(
        org_id,party_id,contact_kind,name,email,phone,is_primary,status,
        created_by_membership_id,updated_by_membership_id
      ) VALUES (
        organization_id,party.id,'business',next_contact_name,
        CASE WHEN set_primary_email THEN NULLIF(pg_catalog.btrim(primary_email),'') END,
        CASE WHEN set_primary_phone THEN NULLIF(pg_catalog.btrim(primary_phone),'') END,
        true,'active',actor_id,actor_id
      ) RETURNING * INTO contact;
    ELSE
      UPDATE parties.contacts primary_contact
         SET name=next_contact_name,
             email=CASE WHEN set_primary_email
               THEN NULLIF(pg_catalog.btrim(primary_email),'') ELSE primary_contact.email END,
             phone=CASE WHEN set_primary_phone
               THEN NULLIF(pg_catalog.btrim(primary_phone),'') ELSE primary_contact.phone END,
             updated_at=pg_catalog.transaction_timestamp(),
             updated_by_membership_id=actor_id,row_version=primary_contact.row_version+1
       WHERE primary_contact.org_id=organization_id AND primary_contact.id=contact.id
      RETURNING primary_contact.* INTO contact;
    END IF;
  END IF;
  IF set_supplier_name OR set_pan
     OR set_primary_phone OR set_primary_email OR set_contact_person_name THEN
    UPDATE parties.parties supplier_party
       SET legal_name=next_supplier_name,
           pan=CASE WHEN set_pan THEN NULLIF(pg_catalog.btrim(pan),'') ELSE supplier_party.pan END,
           updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
           row_version=supplier_party.row_version+1
     WHERE supplier_party.org_id=organization_id AND supplier_party.id=party.id
    RETURNING supplier_party.* INTO party;
  END IF;
  IF set_payment_days THEN
    INSERT INTO erp_core_commands.command_scopes(
      backend_pid,transaction_id,scope,org_id,entity_id
    ) VALUES (
      pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'supplier_terms',
      organization_id,account.id
    );
  END IF;
  UPDATE parties.supplier_accounts supplier_account
     SET payment_days=CASE WHEN set_payment_days THEN payment_days ELSE supplier_account.payment_days END,
         updated_at=pg_catalog.transaction_timestamp(),updated_by_membership_id=actor_id,
         row_version=supplier_account.row_version+1
   WHERE supplier_account.org_id=organization_id AND supplier_account.id=account.id
  RETURNING supplier_account.* INTO account;
  IF set_payment_days THEN
    DELETE FROM erp_core_commands.command_scopes
     WHERE backend_pid=pg_catalog.pg_backend_pid()
       AND transaction_id=pg_catalog.txid_current()
       AND scope='supplier_terms' AND org_id=organization_id
       AND entity_id=account.id;
  END IF;
  supplier_account_id:=account.id;
  party_id:=party.id;
  supplier_code:=account.supplier_code;
  updated_supplier_name:=party.legal_name;
  updated_primary_phone:=contact.phone;
  updated_primary_email:=contact.email;
  updated_contact_person_name:=contact.name;
  updated_pan:=party.pan;
  updated_payment_days:=account.payment_days;
  account_row_version:=account.row_version;
  party_row_version:=party.row_version;
  idempotency_replayed:=false;
  response_document:=pg_catalog.jsonb_build_object(
    'supplier_account_id',supplier_account_id,'party_id',party_id,
    'supplier_code',supplier_code,'supplier_name',updated_supplier_name,
    'primary_phone',updated_primary_phone,'primary_email',updated_primary_email,
    'contact_person_name',updated_contact_person_name,'pan_number',updated_pan,
    'payment_days',updated_payment_days,'account_row_version',account_row_version,
    'party_row_version',party_row_version
  );
  PERFORM erp_core_commands.finish_claim(
    organization_id,claim.id,'parties.supplier_accounts',account.id,response_document
  );
  RETURN NEXT;
END
$function$;

ALTER FUNCTION erp_master_commands.update_customer_account(
  uuid,uuid,bigint,bigint,boolean,text,boolean,text,boolean,text,boolean,text,
  boolean,text,boolean,text,boolean,numeric,boolean,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_master_commands.update_supplier_account(
  uuid,uuid,bigint,bigint,boolean,text,boolean,text,boolean,text,boolean,text,
  boolean,text,boolean,integer,bytea,timestamptz
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_master_commands.update_customer_account(
  uuid,uuid,bigint,bigint,boolean,text,boolean,text,boolean,text,boolean,text,
  boolean,text,boolean,text,boolean,numeric,boolean,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_master_commands.update_supplier_account(
  uuid,uuid,bigint,bigint,boolean,text,boolean,text,boolean,text,boolean,text,
  boolean,text,boolean,integer,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.update_customer_account(
  uuid,uuid,bigint,bigint,boolean,text,boolean,text,boolean,text,boolean,text,
  boolean,text,boolean,text,boolean,numeric,boolean,integer,bytea,timestamptz
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_master_commands.update_supplier_account(
  uuid,uuid,bigint,bigint,boolean,text,boolean,text,boolean,text,boolean,text,
  boolean,text,boolean,integer,bytea,timestamptz
) TO erp_runtime;

-- Runtime party/account/contact mutations now have one named owner. Security-
-- definer commands remain executable through their explicit grants.
REVOKE UPDATE ON TABLE parties.parties FROM erp_app,erp_runtime;
REVOKE INSERT,UPDATE ON TABLE parties.contacts FROM erp_app,erp_runtime;
REVOKE UPDATE ON TABLE parties.customer_accounts FROM erp_app,erp_runtime;
REVOKE UPDATE ON TABLE parties.supplier_accounts FROM erp_app,erp_runtime;

RESET ROLE;
