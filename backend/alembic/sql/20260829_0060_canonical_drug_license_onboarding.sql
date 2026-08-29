-- Reviewed Forms 20B/21B evidence and canonical license activation.
SET LOCAL ROLE erp_migration_owner;

ALTER TABLE core.attachments
  DROP CONSTRAINT attachments_private_evidence_shape_ck;
ALTER TABLE core.attachments
  ADD CONSTRAINT attachments_private_evidence_shape_ck
  CHECK (
    storage_bucket<>'canonical-evidence-private-v1'
    OR (
      branch_id IS NOT NULL
      AND evidence_kind IN (
        'expense_receipt','customer_receipt_evidence','drug_license_evidence'
      )
      AND media_type='application/pdf'
      AND document_date IS NOT NULL
      AND retention_until IS NOT NULL
      AND retention_until>=document_date
      AND storage_object_path=(
        org_id::text||'/'||branch_id::text||'/'||evidence_kind
        ||'/'||pg_catalog.encode(sha256,'hex')||'.pdf'
      )
    )
  );

CREATE FUNCTION erp_core_commands.initiate_drug_license_attachment(
  organization_id uuid,
  branch_identifier uuid,
  attachment_identifier uuid,
  storage_bucket text,
  storage_object_path text,
  original_filename text,
  byte_size bigint,
  sha256 bytea,
  document_date date
)
RETURNS TABLE(attachment_id uuid,attachment_status text,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE actor_id uuid; existing core.attachments%ROWTYPE; existing_count bigint;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.attachment.manage',branch_identifier
  );
  IF erp_security.has_permission(
       'compliance.license.manage',branch_identifier
     ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='drug license evidence permission denied';
  END IF;
  IF attachment_identifier IS NULL OR branch_identifier IS NULL
     OR storage_bucket<>'canonical-evidence-private-v1'
     OR storage_object_path IS DISTINCT FROM organization_id::text||'/'||branch_identifier::text
        ||'/drug_license_evidence/'||pg_catalog.encode(sha256,'hex')||'.pdf'
     OR original_filename IS NULL OR pg_catalog.btrim(original_filename)=''
     OR byte_size IS NULL OR byte_size<=0
     OR sha256 IS NULL OR pg_catalog.octet_length(sha256)<>32
     OR document_date IS NULL OR document_date>(
       SELECT (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
         FROM core.organizations organization WHERE organization.id=organization_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='drug license evidence metadata is invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':evidence-object:'||storage_bucket||':'||storage_object_path,
    8727004
  ));
  SELECT count(*) INTO existing_count FROM core.attachments attachment
   WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
     AND attachment.storage_bucket=storage_bucket
     AND attachment.storage_object_path=storage_object_path;
  IF existing_count>1 THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='evidence object identity is duplicated';
  END IF;
  IF existing_count=1 THEN
    SELECT * INTO STRICT existing FROM core.attachments attachment
     WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
       AND attachment.storage_bucket=storage_bucket
       AND attachment.storage_object_path=storage_object_path FOR SHARE;
    IF existing.evidence_kind<>'drug_license_evidence'
       OR existing.sha256 IS DISTINCT FROM sha256 OR existing.byte_size<>byte_size
       OR existing.original_filename<>original_filename
       OR existing.document_date<>document_date OR existing.legal_hold IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='evidence object identity conflicts with canonical metadata';
    END IF;
    attachment_id:=existing.id; attachment_status:=existing.status;
    idempotency_replayed:=true; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO core.attachments(
    org_id,branch_id,id,storage_bucket,storage_object_path,original_filename,
    media_type,byte_size,sha256,evidence_kind,document_date,retention_until,
    legal_hold,status,created_by_membership_id
  ) VALUES(
    organization_id,branch_identifier,attachment_identifier,storage_bucket,
    storage_object_path,original_filename,'application/pdf',byte_size,sha256,
    'drug_license_evidence',document_date,document_date,true,'pending_upload',actor_id
  );
  attachment_id:=attachment_identifier; attachment_status:='pending_upload';
  idempotency_replayed:=false; RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_core_commands.transition_drug_license_attachment(
  organization_id uuid,
  branch_identifier uuid,
  attachment_identifier uuid,
  target_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE actor_id uuid;
BEGIN
  actor_id:=erp_core_commands.assert_context(
    organization_id,'core.attachment.manage',branch_identifier
  );
  IF erp_security.has_permission(
       'compliance.license.manage',branch_identifier
     ) IS DISTINCT FROM true
     OR target_status NOT IN ('verified','rejected') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='drug license evidence transition denied';
  END IF;
  UPDATE core.attachments attachment
     SET status=target_status,
         verified_at=CASE WHEN target_status='verified'
                          THEN pg_catalog.transaction_timestamp() ELSE NULL END
   WHERE attachment.org_id=organization_id
     AND attachment.branch_id=branch_identifier
     AND attachment.id=attachment_identifier
     AND attachment.evidence_kind='drug_license_evidence'
     AND attachment.status='pending_upload';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='drug license evidence lifecycle changed';
  END IF;
END
$function$;

CREATE FUNCTION erp_compliance_commands.record_effective_wholesale_license(
  organization_id uuid,
  license_id uuid,
  actor_id uuid,
  subject_branch_id uuid,
  subject_party_id uuid,
  evidence_branch_id uuid,
  license_type_code varchar,
  license_number varchar,
  issuing_authority text,
  jurisdiction_code varchar,
  issued_on date,
  valid_from date,
  next_verification_due_on date,
  evidence_attachment_id uuid,
  key_hash bytea,
  expires_at timestamptz
)
RETURNS TABLE(
  recorded_license_id uuid,
  recorded_status text,
  recorded_row_version bigint,
  idempotency_replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE claim_id uuid; replay_id uuid; business_day date; request_hash bytea;
BEGIN
  PERFORM erp_compliance_commands.assert_context(
    organization_id,actor_id,'compliance.license.manage',
    COALESCE(subject_branch_id,evidence_branch_id)
  );
  request_hash:=extensions.digest(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'license_id',license_id,'subject_branch_id',subject_branch_id,
    'subject_party_id',subject_party_id,'evidence_branch_id',evidence_branch_id,
    'license_type_code',license_type_code,'license_number',pg_catalog.btrim(license_number),
    'issuing_authority',pg_catalog.btrim(issuing_authority),
    'jurisdiction_code',pg_catalog.upper(pg_catalog.btrim(jurisdiction_code)),
    'issued_on',issued_on,'valid_from',valid_from,
    'next_verification_due_on',next_verification_due_on,
    'evidence_attachment_id',evidence_attachment_id
  )::text,'UTF8'),'sha256');
  SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id
    FROM erp_compliance_commands.claim(
      organization_id,actor_id,'compliance.wholesale_license.record',
      key_hash,request_hash,expires_at
    );
  IF replay_id IS NOT NULL THEN
    RETURN QUERY
      SELECT license.id,license.status,license.row_version,true
        FROM compliance.licenses license
       WHERE license.org_id=organization_id AND license.id=replay_id;
    RETURN;
  END IF;
  SELECT (pg_catalog.transaction_timestamp() AT TIME ZONE organization.timezone)::date
    INTO STRICT business_day
    FROM core.organizations organization
   WHERE organization.id=organization_id AND organization.status='active';
  IF license_id IS NULL OR evidence_branch_id IS NULL
     OR pg_catalog.num_nonnulls(subject_branch_id,subject_party_id)<>1
     OR license_type_code NOT IN (
       'drug_wholesale_form_20b','drug_wholesale_form_21b'
     )
     OR license_number IS NULL OR pg_catalog.btrim(license_number)=''
     OR pg_catalog.char_length(pg_catalog.btrim(license_number))>128
     OR issuing_authority IS NULL OR pg_catalog.btrim(issuing_authority)=''
     OR jurisdiction_code IS NULL OR pg_catalog.btrim(jurisdiction_code)=''
     OR issued_on IS NULL OR valid_from IS NULL OR next_verification_due_on IS NULL
     OR issued_on>valid_from OR valid_from>business_day
     OR next_verification_due_on<business_day THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='an effective reviewed Form 20B or 21B record is required';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM core.branches branch
        WHERE branch.org_id=organization_id AND branch.id=evidence_branch_id
          AND branch.status='active' AND erp_security.can_access_branch(branch.id)
     )
     OR (subject_branch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM core.branches branch
        WHERE branch.org_id=organization_id AND branch.id=subject_branch_id
          AND branch.status='active' AND erp_security.can_access_branch(branch.id)
     ))
     OR (subject_party_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM parties.supplier_accounts supplier
        JOIN parties.parties party ON party.org_id=supplier.org_id
          AND party.id=supplier.party_id
        WHERE supplier.org_id=organization_id AND supplier.party_id=subject_party_id
          AND supplier.status='active' AND party.status='active'
     )) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='license subject or evidence branch is not active and authorized';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM core.attachments evidence
        WHERE evidence.org_id=organization_id
          AND evidence.branch_id=evidence_branch_id
          AND evidence.id=evidence_attachment_id
          AND evidence.evidence_kind='drug_license_evidence'
          AND evidence.media_type='application/pdf'
          AND evidence.status IN ('verified','retained')
          AND evidence.verified_at IS NOT NULL
          AND evidence.document_date=issued_on
          AND evidence.legal_hold=true
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='verified matching license PDF evidence is required';
  END IF;
  INSERT INTO compliance.licenses(
    org_id,id,branch_id,party_id,license_type_code,license_number,
    issuing_authority,jurisdiction_code,issued_on,valid_from,valid_until,
    next_verification_due_on,evidence_attachment_id,status,verified_at,
    verified_by_membership_id,created_by_membership_id,updated_by_membership_id
  ) VALUES(
    organization_id,license_id,subject_branch_id,subject_party_id,
    license_type_code,pg_catalog.btrim(license_number),
    pg_catalog.btrim(issuing_authority),pg_catalog.upper(pg_catalog.btrim(jurisdiction_code)),
    issued_on,valid_from,NULL,next_verification_due_on,evidence_attachment_id,
    'active',pg_catalog.transaction_timestamp(),actor_id,actor_id,actor_id
  );
  PERFORM erp_compliance_commands.finish_claim(
    organization_id,claim_id,'compliance.licenses',license_id
  );
  RETURN QUERY SELECT license_id,'active'::text,1::bigint,false;
END
$function$;

ALTER FUNCTION erp_core_commands.initiate_drug_license_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_core_commands.transition_drug_license_attachment(
  uuid,uuid,uuid,text
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_compliance_commands.record_effective_wholesale_license(
  uuid,uuid,uuid,uuid,uuid,uuid,varchar,varchar,text,varchar,date,date,date,uuid,bytea,timestamptz
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.initiate_drug_license_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_core_commands.transition_drug_license_attachment(
  uuid,uuid,uuid,text
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_compliance_commands.record_effective_wholesale_license(
  uuid,uuid,uuid,uuid,uuid,uuid,varchar,varchar,text,varchar,date,date,date,uuid,bytea,timestamptz
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.initiate_drug_license_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date
) TO erp_app;
GRANT EXECUTE ON FUNCTION erp_core_commands.transition_drug_license_attachment(
  uuid,uuid,uuid,text
) TO erp_app;
GRANT EXECUTE ON FUNCTION erp_compliance_commands.record_effective_wholesale_license(
  uuid,uuid,uuid,uuid,uuid,uuid,varchar,varchar,text,varchar,date,date,date,uuid,bytea,timestamptz
) TO erp_app,erp_runtime;

RESET ROLE;
