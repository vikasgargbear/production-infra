CREATE FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  organization_id uuid,
  branch_identifier uuid,
  attachment_identifier uuid,
  storage_bucket text,
  storage_object_path text,
  original_filename text,
  byte_size bigint,
  sha256 bytea,
  document_date date,
  retention_until date
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
  IF erp_security.has_permission('finance.expense.manage',branch_identifier) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense evidence permission denied';
  END IF;
  IF attachment_identifier IS NULL OR branch_identifier IS NULL
     OR storage_bucket<>'canonical-evidence-private-v1'
     OR storage_object_path IS DISTINCT FROM organization_id::text||'/'||branch_identifier::text
        ||'/expense_receipt/'||pg_catalog.encode(sha256,'hex')||'.pdf'
     OR original_filename IS NULL OR pg_catalog.btrim(original_filename)=''
     OR byte_size<=0 OR pg_catalog.octet_length(sha256)<>32
     OR document_date IS NULL OR retention_until<document_date THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense receipt metadata is invalid';
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
    IF existing.evidence_kind<>'expense_receipt'
       OR existing.sha256 IS DISTINCT FROM sha256 OR existing.byte_size<>byte_size
       OR existing.original_filename<>original_filename
       OR existing.document_date<>document_date OR existing.retention_until<>retention_until THEN
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
    'expense_receipt',document_date,retention_until,false,'pending_upload',actor_id
  );
  attachment_id:=attachment_identifier; attachment_status:='pending_upload';
  idempotency_replayed:=false; RETURN NEXT;
END
$function$;

CREATE FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  organization_id uuid,
  branch_identifier uuid,
  attachment_identifier uuid,
  target_status text
)
RETURNS TABLE(attachment_id uuid,attachment_status text,idempotency_replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE current_attachment core.attachments%ROWTYPE;
BEGIN
  PERFORM erp_core_commands.assert_context(
    organization_id,'core.attachment.manage',branch_identifier
  );
  IF erp_security.has_permission('finance.expense.manage',branch_identifier) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='expense evidence permission denied';
  END IF;
  IF target_status NOT IN ('verified','rejected') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expense evidence transition is invalid';
  END IF;
  SELECT * INTO current_attachment FROM core.attachments attachment
   WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
     AND attachment.id=attachment_identifier AND attachment.evidence_kind='expense_receipt'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='expense receipt attachment not found';
  END IF;
  IF current_attachment.status=target_status THEN
    attachment_id:=current_attachment.id; attachment_status:=current_attachment.status;
    idempotency_replayed:=true; RETURN NEXT; RETURN;
  END IF;
  IF current_attachment.status<>'pending_upload' THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='evidence lifecycle changed before integrity finalization';
  END IF;
  UPDATE core.attachments attachment
     SET status=target_status,
         verified_at=CASE WHEN target_status='verified'
                          THEN pg_catalog.transaction_timestamp() ELSE NULL END
   WHERE attachment.org_id=organization_id AND attachment.branch_id=branch_identifier
     AND attachment.id=attachment_identifier;
  attachment_id:=attachment_identifier; attachment_status:=target_status;
  idempotency_replayed:=false; RETURN NEXT;
END
$function$;

ALTER FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date,date
) OWNER TO erp_migration_owner;
ALTER FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  uuid,uuid,uuid,text
) OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date,date
) FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  uuid,uuid,uuid,text
) FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.initiate_expense_receipt_attachment(
  uuid,uuid,uuid,text,text,text,bigint,bytea,date,date
) TO erp_runtime;
GRANT EXECUTE ON FUNCTION erp_core_commands.transition_expense_receipt_attachment(
  uuid,uuid,uuid,text
) TO erp_runtime;
