SET LOCAL ROLE erp_migration_owner;

-- Earlier invoices retain their original buyer_address_snapshot, but that column
-- cannot prove whether it represented billing or ship-to.  Preserve that fact
-- explicitly instead of manufacturing a shipping address from billing history.
ALTER TABLE sales.invoices
  ADD COLUMN archival_snapshot_state text NOT NULL DEFAULT 'unavailable',
  ADD COLUMN billing_address_snapshot text NOT NULL
    DEFAULT '[snapshot unavailable: invoice predates separate address archival]',
  ADD COLUMN shipping_address_snapshot text NOT NULL
    DEFAULT '[snapshot unavailable: invoice predates separate address archival]',
  ADD COLUMN seller_gst_evidence_snapshot jsonb NOT NULL
    DEFAULT '{"availability":"unavailable","reason":"invoice_predates_archival_migration"}'::jsonb,
  ADD COLUMN buyer_gst_evidence_snapshot jsonb NOT NULL
    DEFAULT '{"availability":"unavailable","reason":"invoice_predates_archival_migration"}'::jsonb,
  ADD COLUMN seller_drug_licence_evidence_snapshot jsonb NOT NULL
    DEFAULT '{"availability":"unavailable","reason":"invoice_predates_archival_migration"}'::jsonb,
  ADD COLUMN buyer_drug_licence_evidence_snapshot jsonb NOT NULL
    DEFAULT '{"availability":"unavailable","reason":"invoice_predates_archival_migration"}'::jsonb;

ALTER TABLE sales.invoices
  ADD CONSTRAINT invoices_archival_snapshot_state_ck CHECK (
    archival_snapshot_state IN ('unavailable','captured')
    AND CASE archival_snapshot_state
      WHEN 'unavailable' THEN
        seller_gst_evidence_snapshot->>'availability'='unavailable'
        AND buyer_gst_evidence_snapshot->>'availability'='unavailable'
        AND seller_drug_licence_evidence_snapshot->>'availability'='unavailable'
        AND buyer_drug_licence_evidence_snapshot->>'availability'='unavailable'
      WHEN 'captured' THEN
        btrim(billing_address_snapshot)<>''
        AND btrim(shipping_address_snapshot)<>''
        AND seller_gst_evidence_snapshot->>'availability'='available'
        AND buyer_gst_evidence_snapshot->>'availability' IN ('available','not_registered')
        AND seller_drug_licence_evidence_snapshot->>'availability' IN ('available','none_effective')
        AND buyer_drug_licence_evidence_snapshot->>'availability' IN ('available','none_effective')
      ELSE false
    END
  );

CREATE FUNCTION erp_automation_commands.sales_invoice_archival_snapshot(
  organization_id uuid,
  resolution jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  document_date date:=NULLIF(resolution->>'invoice_date','')::date;
  branch_identifier uuid:=NULLIF(resolution->>'branch_id','')::uuid;
  customer_identifier uuid:=NULLIF(resolution->>'customer_account_id','')::uuid;
  customer_party_identifier uuid;
  billing_identifier uuid:=NULLIF(resolution->>'billing_address_id','')::uuid;
  shipping_identifier uuid:=NULLIF(resolution->>'shipping_address_id','')::uuid;
  seller_registration_identifier uuid:=NULLIF(resolution->>'seller_tax_registration_id','')::uuid;
  buyer_registration_identifier uuid:=NULLIF(resolution->>'customer_tax_registration_id','')::uuid;
  billing_evidence jsonb;
  shipping_evidence jsonb;
  seller_gst_evidence jsonb;
  buyer_gst_evidence jsonb;
  seller_licence_evidence jsonb;
  buyer_licence_evidence jsonb;
BEGIN
  IF organization_id IS NULL OR document_date IS NULL OR branch_identifier IS NULL
     OR customer_identifier IS NULL OR billing_identifier IS NULL
     OR shipping_identifier IS NULL OR seller_registration_identifier IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='sales-invoice archival snapshot input is incomplete';
  END IF;

  SELECT account.party_id INTO STRICT customer_party_identifier
    FROM parties.customer_accounts account
   WHERE account.org_id=organization_id AND account.id=customer_identifier;

  SELECT pg_catalog.jsonb_build_object(
           'availability','available','id',address.id,
           'row_version',address.row_version,'address_kind',address.address_kind,
           'line1',address.line1,'line2',address.line2,'landmark',address.landmark,
           'city',address.city,'district',address.district,
           'state_code',address.state_code,'postal_code',address.postal_code,
           'country_code',address.country_code,'valid_from',address.valid_from,
           'valid_until',address.valid_until,
           'display',pg_catalog.concat_ws(', ',address.line1,address.line2,
             address.city,address.state_code,address.postal_code))
    INTO STRICT billing_evidence
    FROM parties.addresses address
   WHERE address.org_id=organization_id AND address.id=billing_identifier
     AND address.party_id=customer_party_identifier
     AND address.valid_from<=document_date
     AND (address.valid_until IS NULL OR address.valid_until>=document_date);

  SELECT pg_catalog.jsonb_build_object(
           'availability','available','id',address.id,
           'row_version',address.row_version,'address_kind',address.address_kind,
           'line1',address.line1,'line2',address.line2,'landmark',address.landmark,
           'city',address.city,'district',address.district,
           'state_code',address.state_code,'postal_code',address.postal_code,
           'country_code',address.country_code,'valid_from',address.valid_from,
           'valid_until',address.valid_until,
           'display',pg_catalog.concat_ws(', ',address.line1,address.line2,
             address.city,address.state_code,address.postal_code))
    INTO STRICT shipping_evidence
    FROM parties.addresses address
   WHERE address.org_id=organization_id AND address.id=shipping_identifier
     AND address.party_id=customer_party_identifier
     AND address.valid_from<=document_date
     AND (address.valid_until IS NULL OR address.valid_until>=document_date);

  SELECT pg_catalog.jsonb_build_object(
           'availability','available','as_of',document_date,
           'registration_id',registration.id,'row_version',registration.row_version,
           'gstin',registration.gstin,'legal_name',registration.legal_name,
           'trade_name',registration.trade_name,'state_code',registration.state_code,
           'registration_type',registration.registration_type,
           'effective_from',registration.effective_from,
           'effective_to',registration.effective_to,
           'branch_id',association.branch_id,
           'branch_effective_from',association.effective_from,
           'branch_effective_to',association.effective_to)
    INTO STRICT seller_gst_evidence
    FROM tax.registrations registration
    JOIN tax.registration_branches association
      ON association.org_id=registration.org_id
     AND association.registration_id=registration.id
   WHERE registration.org_id=organization_id
     AND registration.id=seller_registration_identifier
     AND registration.status='active'
     AND registration.effective_from<=document_date
     AND (registration.effective_to IS NULL OR registration.effective_to>=document_date)
     AND association.branch_id=branch_identifier
     AND association.status='active'
     AND association.effective_from<=document_date
     AND (association.effective_to IS NULL OR association.effective_to>=document_date);

  IF buyer_registration_identifier IS NULL THEN
    buyer_gst_evidence:=pg_catalog.jsonb_build_object(
      'availability','not_registered','as_of',document_date,
      'party_id',customer_party_identifier);
  ELSE
    SELECT pg_catalog.jsonb_build_object(
             'availability','available','as_of',document_date,
             'registration_id',registration.id,'row_version',registration.row_version,
             'party_id',registration.party_id,
             'registration_type',registration.registration_type,
             'registration_number',registration.registration_number,
             'registered_legal_name',registration.registered_legal_name,
             'state_code',registration.state_code,'taxpayer_type',registration.taxpayer_type,
             'valid_from',registration.valid_from,'valid_until',registration.valid_until,
             'verified_at',registration.verified_at)
      INTO STRICT buyer_gst_evidence
      FROM parties.tax_registrations registration
     WHERE registration.org_id=organization_id
       AND registration.id=buyer_registration_identifier
       AND registration.party_id=customer_party_identifier
       AND registration.registration_type='GSTIN'
       AND registration.status='active'
       AND (registration.valid_from IS NULL OR registration.valid_from<=document_date)
       AND (registration.valid_until IS NULL OR registration.valid_until>=document_date);
  END IF;

  SELECT pg_catalog.jsonb_build_object(
           'availability',CASE WHEN count(*)=0 THEN 'none_effective' ELSE 'available' END,
           'as_of',document_date,
           'licences',COALESCE(pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id',license.id,'row_version',license.row_version,
               'subject_kind',CASE WHEN license.branch_id IS NOT NULL THEN 'branch' ELSE 'organization' END,
               'branch_id',license.branch_id,'license_type_code',license.license_type_code,
               'license_number',license.license_number,
               'issuing_authority',license.issuing_authority,
               'jurisdiction_code',license.jurisdiction_code,
               'issued_on',license.issued_on,'valid_from',license.valid_from,
               'valid_until',license.valid_until,
               'next_verification_due_on',license.next_verification_due_on,
               'verified_at',license.verified_at,
               'evidence_attachment_id',license.evidence_attachment_id,
               'evidence_sha256',pg_catalog.encode(attachment.sha256,'hex'),
               'evidence_status',attachment.status)
             ORDER BY license.license_type_code,license.license_number,license.id),
             '[]'::jsonb))
    INTO seller_licence_evidence
    FROM compliance.licenses license
    JOIN core.attachments attachment
      ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
   WHERE license.org_id=organization_id
     AND (license.organization_subject_id=organization_id OR license.branch_id=branch_identifier)
     AND license.license_type_code IN (
       'drug_wholesale_form_20b','drug_wholesale_form_21b',
       'drug_schedule_x_wholesale_form_20g')
     AND license.status='active' AND license.verified_at IS NOT NULL
     AND license.valid_from<=document_date
     AND (license.valid_until IS NULL OR license.valid_until>=document_date)
     AND (license.next_verification_due_on IS NULL
          OR license.next_verification_due_on>=document_date);

  SELECT pg_catalog.jsonb_build_object(
           'availability',CASE WHEN count(*)=0 THEN 'none_effective' ELSE 'available' END,
           'as_of',document_date,
           'licences',COALESCE(pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object(
               'id',license.id,'row_version',license.row_version,
               'subject_kind','customer','party_id',license.party_id,
               'license_type_code',license.license_type_code,
               'license_number',license.license_number,
               'issuing_authority',license.issuing_authority,
               'jurisdiction_code',license.jurisdiction_code,
               'issued_on',license.issued_on,'valid_from',license.valid_from,
               'valid_until',license.valid_until,
               'next_verification_due_on',license.next_verification_due_on,
               'verified_at',license.verified_at,
               'evidence_attachment_id',license.evidence_attachment_id,
               'evidence_sha256',pg_catalog.encode(attachment.sha256,'hex'),
               'evidence_status',attachment.status)
             ORDER BY license.license_type_code,license.license_number,license.id),
             '[]'::jsonb))
    INTO buyer_licence_evidence
    FROM compliance.licenses license
    JOIN core.attachments attachment
      ON attachment.org_id=license.org_id AND attachment.id=license.evidence_attachment_id
   WHERE license.org_id=organization_id
     AND license.party_id=customer_party_identifier
     AND license.license_type_code IN (
       'drug_wholesale_form_20b','drug_wholesale_form_21b',
       'drug_schedule_x_wholesale_form_20g')
     AND license.status='active' AND license.verified_at IS NOT NULL
     AND license.valid_from<=document_date
     AND (license.valid_until IS NULL OR license.valid_until>=document_date)
     AND (license.next_verification_due_on IS NULL
          OR license.next_verification_due_on>=document_date);

  RETURN pg_catalog.jsonb_build_object(
    'billing_address',billing_evidence,
    'shipping_address',shipping_evidence,
    'seller_gst',seller_gst_evidence,
    'buyer_gst',buyer_gst_evidence,
    'seller_drug_licences',seller_licence_evidence,
    'buyer_drug_licences',buyer_licence_evidence);
END
$function$;
ALTER FUNCTION erp_automation_commands.sales_invoice_archival_snapshot(uuid,jsonb)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.sales_invoice_archival_snapshot(uuid,jsonb)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;

CREATE FUNCTION erp_commercial_commands.guard_sales_invoice_archival_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF ROW(NEW.archival_snapshot_state,NEW.billing_address_snapshot,
         NEW.shipping_address_snapshot,NEW.seller_gst_evidence_snapshot,
         NEW.buyer_gst_evidence_snapshot,NEW.seller_drug_licence_evidence_snapshot,
         NEW.buyer_drug_licence_evidence_snapshot)
     IS DISTINCT FROM
     ROW(OLD.archival_snapshot_state,OLD.billing_address_snapshot,
         OLD.shipping_address_snapshot,OLD.seller_gst_evidence_snapshot,
         OLD.buyer_gst_evidence_snapshot,OLD.seller_drug_licence_evidence_snapshot,
         OLD.buyer_drug_licence_evidence_snapshot) THEN
    IF NOT (OLD.status='draft' AND OLD.archival_snapshot_state='unavailable'
            AND NEW.status='draft' AND NEW.archival_snapshot_state='captured') THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='sales-invoice archival snapshots are immutable';
    END IF;
  END IF;
  IF OLD.status='draft' AND NEW.status IN ('posted','reversed')
     AND NEW.archival_snapshot_state<>'captured' THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='sales invoice cannot post without captured archival evidence';
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION erp_commercial_commands.guard_sales_invoice_archival_snapshot()
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_commercial_commands.guard_sales_invoice_archival_snapshot()
  FROM PUBLIC,erp_app,erp_runtime;
CREATE TRIGGER sales_invoice_archival_snapshot_guard
  BEFORE UPDATE ON sales.invoices
  FOR EACH ROW EXECUTE FUNCTION erp_commercial_commands.guard_sales_invoice_archival_snapshot();

-- Retain the reviewed v0049 persistence implementation behind a private name.
-- The canonical wrapper adds evidence atomically in the same transaction.
ALTER FUNCTION erp_automation_commands.persist_sales_invoice_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,
  bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)
  RENAME TO persist_sales_invoice_prepare_pre_archival;
REVOKE ALL ON FUNCTION erp_automation_commands.persist_sales_invoice_prepare_pre_archival(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,
  bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)
  FROM PUBLIC,erp_app,erp_runtime,erp_calculator;

CREATE FUNCTION erp_automation_commands.persist_sales_invoice_prepare(
  organization_id uuid,membership_id uuid,auth_user_id uuid,
  application_user_id uuid,grant_id uuid,caller_client_id varchar,
  invoice_id uuid,inventory_document_id uuid,command_id uuid,artifact_id uuid,
  request_id uuid,key_hash bytea,sequence_key_hash bytea,request_bytes bytea,
  resolved_bytes bytea,preview_bytes bytea,calculation_input_bytes bytea,
  calculation_output_bytes bytea,expires_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
#variable_conflict use_variable
DECLARE
  result_document jsonb;
  resolved_document jsonb;
  snapshot_document jsonb;
BEGIN
  result_document:=erp_automation_commands.persist_sales_invoice_prepare_pre_archival(
    organization_id,membership_id,auth_user_id,application_user_id,grant_id,
    caller_client_id,invoice_id,inventory_document_id,command_id,artifact_id,
    request_id,key_hash,sequence_key_hash,request_bytes,resolved_bytes,preview_bytes,
    calculation_input_bytes,calculation_output_bytes,expires_at);
  -- A replay may refer to an invoice prepared before this migration.  Never
  -- reconstruct its missing evidence from mutable master rows.  Replays of new
  -- invoices likewise return the already-captured immutable snapshot.
  IF COALESCE((result_document->>'replayed')::boolean,false) THEN
    RETURN result_document;
  END IF;
  BEGIN
    resolved_document:=pg_catalog.convert_from(resolved_bytes,'UTF8')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='sales-invoice archival snapshot requires UTF-8 JSON';
  END;
  snapshot_document:=erp_automation_commands.sales_invoice_archival_snapshot(
    organization_id,resolved_document);
  UPDATE sales.invoices invoice
     SET archival_snapshot_state='captured',
         billing_address_snapshot=snapshot_document#>>'{billing_address,display}',
         shipping_address_snapshot=snapshot_document#>>'{shipping_address,display}',
         seller_gst_evidence_snapshot=snapshot_document->'seller_gst',
         buyer_gst_evidence_snapshot=snapshot_document->'buyer_gst',
         seller_drug_licence_evidence_snapshot=snapshot_document->'seller_drug_licences',
         buyer_drug_licence_evidence_snapshot=snapshot_document->'buyer_drug_licences'
   WHERE invoice.org_id=organization_id AND invoice.id=invoice_id
     AND invoice.status='draft' AND invoice.archival_snapshot_state='unavailable';
  IF NOT FOUND THEN
    PERFORM 1 FROM sales.invoices invoice
     WHERE invoice.org_id=organization_id AND invoice.id=invoice_id
       AND invoice.archival_snapshot_state='captured'
       AND ROW(invoice.billing_address_snapshot,invoice.shipping_address_snapshot,
               invoice.seller_gst_evidence_snapshot,invoice.buyer_gst_evidence_snapshot,
               invoice.seller_drug_licence_evidence_snapshot,
               invoice.buyer_drug_licence_evidence_snapshot)
           IS NOT DISTINCT FROM
           ROW(snapshot_document#>>'{billing_address,display}',
               snapshot_document#>>'{shipping_address,display}',
               snapshot_document->'seller_gst',snapshot_document->'buyer_gst',
               snapshot_document->'seller_drug_licences',
               snapshot_document->'buyer_drug_licences');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='sales-invoice archival snapshot changed';
    END IF;
  END IF;
  RETURN result_document;
END
$function$;
ALTER FUNCTION erp_automation_commands.persist_sales_invoice_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,
  bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)
  OWNER TO erp_migration_owner;
REVOKE ALL ON FUNCTION erp_automation_commands.persist_sales_invoice_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,
  bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)
  FROM PUBLIC,erp_app,erp_runtime;
GRANT EXECUTE ON FUNCTION erp_automation_commands.persist_sales_invoice_prepare(
  uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,uuid,uuid,
  bytea,bytea,bytea,bytea,bytea,bytea,bytea,timestamptz)
  TO erp_calculator;

RESET ROLE;
