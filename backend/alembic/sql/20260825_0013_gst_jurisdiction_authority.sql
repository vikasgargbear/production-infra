-- Hash-bound incremental migration: official GST jurisdiction/state-code authority.
-- Alembic owns the transaction. This script must not be run directly.

SET LOCAL ROLE erp_migration_owner;

CREATE TABLE tax.gst_jurisdictions (
    code char(2) PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT gst_jurisdictions_code_ck CHECK (code ~ '^[0-9]{2}$')
);

CREATE TABLE tax.gst_jurisdiction_releases (
    id uuid PRIMARY KEY,
    dataset_version varchar(64) NOT NULL UNIQUE,
    source_authority text NOT NULL,
    authority_catalog_uri text NOT NULL,
    source_uri text NOT NULL,
    source_publication_date date NOT NULL,
    source_retrieved_at timestamptz NOT NULL,
    source_document_sha256 bytea NOT NULL,
    dataset_sha256 bytea NOT NULL,
    record_count integer NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT gst_jurisdiction_releases_hashes_ck CHECK (
      octet_length(source_document_sha256)=32 AND octet_length(dataset_sha256)=32
    ),
    CONSTRAINT gst_jurisdiction_releases_count_ck CHECK (record_count>0),
    CONSTRAINT gst_jurisdiction_releases_dates_ck CHECK (
      effective_to IS NULL OR effective_to>=effective_from
    ),
    CONSTRAINT gst_jurisdiction_releases_status_ck CHECK (status IN ('active','retired'))
);

CREATE TABLE tax.gst_jurisdiction_versions (
    id uuid PRIMARY KEY,
    release_id uuid NOT NULL REFERENCES tax.gst_jurisdiction_releases(id) ON DELETE RESTRICT,
    jurisdiction_code char(2) NOT NULL REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT,
    display_name text NOT NULL,
    jurisdiction_kind text NOT NULL,
    supports_domestic_address boolean NOT NULL,
    supports_gstin_registration boolean NOT NULL,
    supports_place_of_supply boolean NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    status text NOT NULL,
    source_record_sha256 bytea NOT NULL,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT gst_jurisdiction_versions_code_from_uq UNIQUE (jurisdiction_code,effective_from),
    CONSTRAINT gst_jurisdiction_versions_name_ck CHECK (btrim(display_name)<>''),
    CONSTRAINT gst_jurisdiction_versions_kind_ck CHECK (
      jurisdiction_kind IN ('state','union_territory','special')
    ),
    CONSTRAINT gst_jurisdiction_versions_dates_ck CHECK (
      effective_to IS NULL OR effective_to>=effective_from
    ),
    CONSTRAINT gst_jurisdiction_versions_status_ck CHECK (status IN ('active','retired')),
    CONSTRAINT gst_jurisdiction_versions_hash_ck CHECK (octet_length(source_record_sha256)=32),
    CONSTRAINT gst_jurisdiction_versions_special_capability_ck CHECK (
      (jurisdiction_code='96' AND jurisdiction_kind='special'
        AND NOT supports_domestic_address AND NOT supports_gstin_registration
        AND supports_place_of_supply)
      OR (jurisdiction_code='97' AND jurisdiction_kind='special'
        AND NOT supports_domestic_address AND supports_gstin_registration
        AND supports_place_of_supply)
      OR (jurisdiction_code='99' AND jurisdiction_kind='special'
        AND NOT supports_domestic_address AND supports_gstin_registration
        AND NOT supports_place_of_supply)
      OR jurisdiction_code NOT IN ('96','97','99')
    )
);

CREATE INDEX gst_jurisdiction_versions_effective_idx
  ON tax.gst_jurisdiction_versions(jurisdiction_code,effective_from,effective_to)
  WHERE status='active';

CREATE TEMPORARY TABLE pg_temp.gst_jurisdiction_seed (
  release_id uuid NOT NULL,
  code char(2) NOT NULL,
  display_name text NOT NULL,
  jurisdiction_kind text NOT NULL,
  supports_domestic_address boolean NOT NULL,
  supports_gstin_registration boolean NOT NULL,
  supports_place_of_supply boolean NOT NULL,
  effective_from date NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.gst_jurisdiction_seed VALUES
('d3900000-0000-7000-8000-000000000001','01','Jammu and Kashmir','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','02','Himachal Pradesh','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','03','Punjab','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','04','Chandigarh','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','05','Uttarakhand','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','06','Haryana','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','07','Delhi','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','08','Rajasthan','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','09','Uttar Pradesh','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','10','Bihar','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','11','Sikkim','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','12','Arunachal Pradesh','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','13','Nagaland','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','14','Manipur','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','15','Mizoram','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','16','Tripura','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','17','Meghalaya','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','18','Assam','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','19','West Bengal','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','20','Jharkhand','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','21','Odisha','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','22','Chhattisgarh','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','23','Madhya Pradesh','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','24','Gujarat','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','26','Dadra and Nagar Haveli and Daman and Diu','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','27','Maharashtra','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','29','Karnataka','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','30','Goa','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','31','Lakshadweep','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','32','Kerala','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','33','Tamil Nadu','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','34','Puducherry','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','35','Andaman and Nicobar Islands','union_territory',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','36','Telangana','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','37','Andhra Pradesh','state',true,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','38','Ladakh','union_territory',true,true,true,pg_catalog.make_date(2020,1,1)),
('d3900000-0000-7000-8000-000000000001','97','Other Territory','special',false,true,true,'2017-07-01'),
('d3900000-0000-7000-8000-000000000001','99','OIDAR','special',false,true,false,'2017-07-01'),
('d3900000-0000-7000-8000-000000000002','96','Foreign Country','special',false,false,true,pg_catalog.make_date(2020,10,1));

INSERT INTO tax.gst_jurisdiction_releases(
  id,dataset_version,source_authority,authority_catalog_uri,source_uri,source_publication_date,
  source_retrieved_at,source_document_sha256,dataset_sha256,record_count,
  effective_from,effective_to,status
)
SELECT source.id,source.dataset_version,source.source_authority,source.authority_catalog_uri,source.source_uri,
       source.source_publication_date,
       pg_catalog.make_timestamptz(2026,8,25,15,50,0,'Asia/Kolkata'),
       pg_catalog.decode(source.source_document_sha256,'hex'),
       extensions.digest(pg_catalog.convert_to(pg_catalog.string_agg(
         seed.code||'|'||seed.display_name||'|'||seed.jurisdiction_kind||'|'||
         seed.supports_domestic_address::text||'|'||seed.supports_gstin_registration::text||'|'||
         seed.supports_place_of_supply::text||'|'||seed.effective_from::text,E'\n'
         ORDER BY seed.code),'UTF8'),'sha256'),
       pg_catalog.count(*)::integer,source.source_publication_date,NULL,'active'
  FROM (VALUES
    ('d3900000-0000-7000-8000-000000000001'::uuid,'gstn-state-jurisdictions-2026-03',
     'Goods and Services Tax Network (GSTN)',
     'https://einvoice1.gst.gov.in/Others/MasterCodes',
     'https://tutorial.gst.gov.in/downloads/news/monthly_gst_data_for_mar_2026_for_publishing_final.pdf',
     pg_catalog.make_date(2026,3,31),'3d4dd97c535b9ad022326b98ff293d50428fb0e423c8f49eeecb4daa4d5b1b2a'),
    ('d3900000-0000-7000-8000-000000000002'::uuid,'cbic-einvoice-pos-foreign-2020-10',
     'Central Board of Indirect Taxes and Customs (CBIC), hosted by GSTN-authorized IRIS IRP',
     'https://einvoice6.gst.gov.in/content/kb/tools/',
     'https://einvoice6.gst.gov.in/content/wp-content/uploads/2022/07/notification-60-central-tax-english-2020.pdf',
     pg_catalog.make_date(2020,7,30),'502304afd71e4d54b0b5fbbed425b8c7b707e78121d50d75763777fe8ad52305')
  ) AS source(id,dataset_version,source_authority,authority_catalog_uri,source_uri,source_publication_date,source_document_sha256)
  JOIN pg_temp.gst_jurisdiction_seed seed ON seed.release_id=source.id
 GROUP BY source.id,source.dataset_version,source.source_authority,source.authority_catalog_uri,source.source_uri,
          source.source_publication_date,source.source_document_sha256;

INSERT INTO tax.gst_jurisdictions(code)
SELECT DISTINCT code FROM pg_temp.gst_jurisdiction_seed ORDER BY code;

INSERT INTO tax.gst_jurisdiction_versions(
  id,release_id,jurisdiction_code,display_name,jurisdiction_kind,
  supports_domestic_address,supports_gstin_registration,supports_place_of_supply,
  effective_from,effective_to,status,source_record_sha256
)
SELECT ('d3910000-0000-7000-8000-'||pg_catalog.lpad(code,12,'0'))::uuid,
       release_id,code,display_name,jurisdiction_kind,
       supports_domestic_address,supports_gstin_registration,supports_place_of_supply,
       effective_from,NULL,'active',
       extensions.digest(pg_catalog.convert_to(
         code||'|'||display_name||'|'||jurisdiction_kind||'|'||
         supports_domestic_address::text||'|'||supports_gstin_registration::text||'|'||
         supports_place_of_supply::text||'|'||effective_from::text,'UTF8'),'sha256')
  FROM pg_temp.gst_jurisdiction_seed;

CREATE FUNCTION tax.assert_effective_gst_jurisdiction(
  p_code text,p_effective_on date,p_usage text,p_supply_type text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog
AS $function$
DECLARE matching_count integer;
BEGIN
  IF p_code IS NULL OR p_code!~'^[0-9]{2}$' OR p_effective_on IS NULL
     OR p_usage NOT IN ('domestic_address','gstin_registration','place_of_supply','portal_place_of_supply') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='GST jurisdiction validation requires exact code, date and supported usage';
  END IF;
  SELECT count(*) INTO matching_count
    FROM tax.gst_jurisdiction_versions version
    JOIN tax.gst_jurisdiction_releases release ON release.id=version.release_id
   WHERE version.jurisdiction_code=p_code AND version.status='active' AND release.status='active'
     AND version.effective_from<=p_effective_on
     AND (version.effective_to IS NULL OR version.effective_to>=p_effective_on)
     AND CASE p_usage
       WHEN 'domestic_address' THEN version.supports_domestic_address
       WHEN 'gstin_registration' THEN version.supports_gstin_registration
       WHEN 'place_of_supply' THEN version.supports_place_of_supply
       WHEN 'portal_place_of_supply' THEN version.supports_place_of_supply
       ELSE false END;
  IF matching_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST jurisdiction code is unknown, ineffective or unsupported for this use';
  END IF;
  IF p_code='96' AND (
       p_usage<>'place_of_supply' OR p_supply_type IS NULL
       OR p_supply_type NOT IN ('export','import')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST code 96 is restricted to export/import place-of-supply semantics';
  END IF;
  IF p_code='97' AND p_usage IN ('place_of_supply','portal_place_of_supply') AND (
       p_usage<>'place_of_supply' OR p_supply_type IS DISTINCT FROM 'inter_state'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST code 97 is restricted to inter-state place-of-supply semantics';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION tax.assert_effective_gst_jurisdiction(text,date,text,text) FROM PUBLIC,erp_app,erp_runtime;

CREATE FUNCTION tax.guard_gst_master_jurisdiction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE row_data jsonb:=pg_catalog.to_jsonb(NEW); code text; effective_on date; usage text;
BEGIN
  IF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='organizations' THEN
    code:=row_data->>'registered_state_code'; effective_on:=COALESCE((row_data->>'created_at')::timestamptz::date,CURRENT_DATE); usage:='domestic_address';
  ELSIF TG_TABLE_SCHEMA='core' AND TG_TABLE_NAME='branches' THEN
    code:=row_data->>'state_code'; effective_on:=COALESCE((row_data->>'created_at')::timestamptz::date,CURRENT_DATE); usage:='domestic_address';
  ELSIF TG_TABLE_SCHEMA='parties' AND TG_TABLE_NAME='addresses' THEN
    IF row_data->>'country_code'<>'IN' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='canonical party addresses currently require country_code IN';
    END IF;
    code:=row_data->>'state_code'; effective_on:=(row_data->>'valid_from')::date; usage:='domestic_address';
  ELSIF TG_TABLE_SCHEMA='tax' AND TG_TABLE_NAME='registrations' THEN
    code:=row_data->>'state_code'; effective_on:=(row_data->>'effective_from')::date; usage:='gstin_registration';
  ELSIF TG_TABLE_SCHEMA='parties' AND TG_TABLE_NAME='tax_registrations' THEN
    IF row_data->>'registration_type'<>'GSTIN' AND row_data->>'state_code' IS NULL THEN RETURN NEW; END IF;
    code:=row_data->>'state_code'; effective_on:=COALESCE((row_data->>'valid_from')::date,CURRENT_DATE); usage:='gstin_registration';
  ELSE
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='GST master jurisdiction guard is attached to an unsupported table';
  END IF;
  PERFORM tax.assert_effective_gst_jurisdiction(code,effective_on,usage,NULL);
  RETURN NEW;
END
$function$;

CREATE FUNCTION tax.guard_gst_transaction_jurisdiction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE row_data jsonb:=pg_catalog.to_jsonb(NEW); code text; effective_on date; supply_type text; usage text:='place_of_supply';
BEGIN
  code:=row_data->>'place_of_supply_state_code'; supply_type:=row_data->>'supply_type';
  IF TG_TABLE_SCHEMA='sales' AND TG_TABLE_NAME='invoices' THEN effective_on:=(row_data->>'invoice_date')::date;
  ELSIF TG_TABLE_SCHEMA='procurement' AND TG_TABLE_NAME='supplier_invoices' THEN effective_on:=(row_data->>'supplier_invoice_date')::date;
  ELSIF TG_TABLE_SCHEMA='tax' AND TG_TABLE_NAME='documents' THEN effective_on:=(row_data->>'document_date')::date;
  ELSIF TG_TABLE_SCHEMA='tax' AND TG_TABLE_NAME='portal_document_lines' THEN effective_on:=(row_data->>'invoice_date')::date; usage:='portal_place_of_supply';
  ELSE RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='GST transaction jurisdiction guard is attached to an unsupported table';
  END IF;
  PERFORM tax.assert_effective_gst_jurisdiction(code,effective_on,usage,supply_type);
  RETURN NEW;
END
$function$;

CREATE FUNCTION tax.guard_gst_movement_jurisdiction() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE row_data jsonb:=pg_catalog.to_jsonb(NEW); effective_on date; origin_code text; destination_code text;
BEGIN
  IF TG_TABLE_SCHEMA='sales' AND TG_TABLE_NAME='dispatches' THEN effective_on:=(row_data->>'dispatch_date')::date;
  ELSIF TG_TABLE_SCHEMA='inventory' AND TG_TABLE_NAME='inventory_documents' THEN effective_on:=(row_data->>'document_date')::date;
  ELSE RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='GST movement jurisdiction guard is attached to an unsupported table';
  END IF;
  origin_code:=row_data->>'origin_state_code'; destination_code:=row_data->>'destination_state_code';
  IF origin_code IS NOT NULL THEN PERFORM tax.assert_effective_gst_jurisdiction(origin_code,effective_on,'domestic_address',NULL); END IF;
  IF destination_code IS NOT NULL THEN PERFORM tax.assert_effective_gst_jurisdiction(destination_code,effective_on,'domestic_address',NULL); END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION tax.guard_gst_master_jurisdiction() FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION tax.guard_gst_transaction_jurisdiction() FROM PUBLIC,erp_app,erp_runtime;
REVOKE ALL ON FUNCTION tax.guard_gst_movement_jurisdiction() FROM PUBLIC,erp_app,erp_runtime;

DO $preflight$
DECLARE row_value record;
BEGIN
  FOR row_value IN
    SELECT 'core.organizations'::text AS source,registered_state_code::text AS code,created_at::date AS effective_on,'domestic_address'::text AS usage,NULL::text AS supply_type FROM core.organizations
    UNION ALL SELECT 'core.branches',state_code::text,created_at::date,'domestic_address',NULL FROM core.branches
    UNION ALL SELECT 'parties.addresses',state_code::text,valid_from,'domestic_address',NULL FROM parties.addresses WHERE country_code='IN'
    UNION ALL SELECT 'tax.registrations',state_code::text,effective_from,'gstin_registration',NULL FROM tax.registrations
    UNION ALL SELECT 'parties.tax_registrations',state_code::text,COALESCE(valid_from,CURRENT_DATE),'gstin_registration',NULL FROM parties.tax_registrations WHERE registration_type='GSTIN' OR state_code IS NOT NULL
    UNION ALL SELECT 'sales.invoices',place_of_supply_state_code::text,invoice_date,'place_of_supply',supply_type FROM sales.invoices
    UNION ALL SELECT 'procurement.supplier_invoices',place_of_supply_state_code::text,supplier_invoice_date,'place_of_supply',supply_type FROM procurement.supplier_invoices
    UNION ALL SELECT 'tax.documents',place_of_supply_state_code::text,document_date,'place_of_supply',supply_type FROM tax.documents
    UNION ALL SELECT 'tax.portal_document_lines',place_of_supply_state_code::text,invoice_date,'portal_place_of_supply',NULL FROM tax.portal_document_lines
    UNION ALL SELECT 'sales.dispatches.origin',origin_state_code::text,dispatch_date,'domestic_address',NULL FROM sales.dispatches WHERE origin_state_code IS NOT NULL
    UNION ALL SELECT 'sales.dispatches.destination',destination_state_code::text,dispatch_date,'domestic_address',NULL FROM sales.dispatches WHERE destination_state_code IS NOT NULL
    UNION ALL SELECT 'inventory.inventory_documents.origin',origin_state_code::text,document_date,'domestic_address',NULL FROM inventory.inventory_documents WHERE origin_state_code IS NOT NULL
    UNION ALL SELECT 'inventory.inventory_documents.destination',destination_state_code::text,document_date,'domestic_address',NULL FROM inventory.inventory_documents WHERE destination_state_code IS NOT NULL
  LOOP
    BEGIN
      PERFORM tax.assert_effective_gst_jurisdiction(row_value.code,row_value.effective_on,row_value.usage,row_value.supply_type);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='existing row violates canonical GST jurisdiction authority: '||row_value.source||' code='||COALESCE(row_value.code,'NULL');
    END;
  END LOOP;
END
$preflight$;

ALTER TABLE core.organizations ADD CONSTRAINT organizations_registered_state_fk FOREIGN KEY(registered_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE core.branches ADD CONSTRAINT branches_state_fk FOREIGN KEY(state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE parties.addresses ADD CONSTRAINT addresses_state_fk FOREIGN KEY(state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE parties.tax_registrations ADD CONSTRAINT party_tax_registrations_state_fk FOREIGN KEY(state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE tax.registrations ADD CONSTRAINT registrations_jurisdiction_fk FOREIGN KEY(state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE sales.invoices ADD CONSTRAINT sales_invoices_pos_jurisdiction_fk FOREIGN KEY(place_of_supply_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE procurement.supplier_invoices ADD CONSTRAINT supplier_invoices_pos_jurisdiction_fk FOREIGN KEY(place_of_supply_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE tax.documents ADD CONSTRAINT tax_documents_pos_jurisdiction_fk FOREIGN KEY(place_of_supply_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE tax.portal_document_lines ADD CONSTRAINT portal_document_lines_pos_jurisdiction_fk FOREIGN KEY(place_of_supply_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE sales.dispatches ADD CONSTRAINT dispatches_origin_jurisdiction_fk FOREIGN KEY(origin_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE sales.dispatches ADD CONSTRAINT dispatches_destination_jurisdiction_fk FOREIGN KEY(destination_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE inventory.inventory_documents ADD CONSTRAINT inventory_documents_origin_jurisdiction_fk FOREIGN KEY(origin_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;
ALTER TABLE inventory.inventory_documents ADD CONSTRAINT inventory_documents_destination_jurisdiction_fk FOREIGN KEY(destination_state_code) REFERENCES tax.gst_jurisdictions(code) ON DELETE RESTRICT NOT VALID;

ALTER TABLE core.organizations VALIDATE CONSTRAINT organizations_registered_state_fk;
ALTER TABLE core.branches VALIDATE CONSTRAINT branches_state_fk;
ALTER TABLE parties.addresses VALIDATE CONSTRAINT addresses_state_fk;
ALTER TABLE parties.tax_registrations VALIDATE CONSTRAINT party_tax_registrations_state_fk;
ALTER TABLE tax.registrations VALIDATE CONSTRAINT registrations_jurisdiction_fk;
ALTER TABLE sales.invoices VALIDATE CONSTRAINT sales_invoices_pos_jurisdiction_fk;
ALTER TABLE procurement.supplier_invoices VALIDATE CONSTRAINT supplier_invoices_pos_jurisdiction_fk;
ALTER TABLE tax.documents VALIDATE CONSTRAINT tax_documents_pos_jurisdiction_fk;
ALTER TABLE tax.portal_document_lines VALIDATE CONSTRAINT portal_document_lines_pos_jurisdiction_fk;
ALTER TABLE sales.dispatches VALIDATE CONSTRAINT dispatches_origin_jurisdiction_fk;
ALTER TABLE sales.dispatches VALIDATE CONSTRAINT dispatches_destination_jurisdiction_fk;
ALTER TABLE inventory.inventory_documents VALIDATE CONSTRAINT inventory_documents_origin_jurisdiction_fk;
ALTER TABLE inventory.inventory_documents VALIDATE CONSTRAINT inventory_documents_destination_jurisdiction_fk;

CREATE TRIGGER organizations_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF registered_state_code,status ON core.organizations FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_master_jurisdiction();
CREATE TRIGGER branches_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF state_code,status ON core.branches FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_master_jurisdiction();
CREATE TRIGGER addresses_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF state_code,country_code,valid_from,valid_until,status ON parties.addresses FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_master_jurisdiction();
CREATE TRIGGER party_tax_registrations_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF state_code,registration_type,valid_from,valid_until,status ON parties.tax_registrations FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_master_jurisdiction();
CREATE TRIGGER registrations_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF state_code,effective_from,effective_to,status ON tax.registrations FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_master_jurisdiction();
CREATE TRIGGER sales_invoices_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF place_of_supply_state_code,invoice_date,supply_type,status ON sales.invoices FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_transaction_jurisdiction();
CREATE TRIGGER supplier_invoices_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF place_of_supply_state_code,supplier_invoice_date,supply_type,status ON procurement.supplier_invoices FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_transaction_jurisdiction();
CREATE TRIGGER tax_documents_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF place_of_supply_state_code,document_date,supply_type ON tax.documents FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_transaction_jurisdiction();
CREATE TRIGGER portal_document_lines_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF place_of_supply_state_code,invoice_date ON tax.portal_document_lines FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_transaction_jurisdiction();
CREATE TRIGGER dispatches_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF origin_state_code,destination_state_code,dispatch_date,status ON sales.dispatches FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_movement_jurisdiction();
CREATE TRIGGER inventory_documents_gst_jurisdiction_bt BEFORE INSERT OR UPDATE OF origin_state_code,destination_state_code,document_date,status ON inventory.inventory_documents FOR EACH ROW EXECUTE FUNCTION tax.guard_gst_movement_jurisdiction();

REVOKE ALL ON TABLE tax.gst_jurisdictions,tax.gst_jurisdiction_releases,tax.gst_jurisdiction_versions FROM PUBLIC,erp_app,erp_runtime;
GRANT SELECT ON TABLE tax.gst_jurisdictions,tax.gst_jurisdiction_releases,tax.gst_jurisdiction_versions TO erp_app;

RESET ROLE;
