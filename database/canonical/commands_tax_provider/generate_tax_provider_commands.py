#!/usr/bin/env python3
"""Generate provider-neutral e-invoice and e-way evidence commands."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAIN_ROOT = CANONICAL_ROOT / "domains"
BASELINE_PATH = REPO_ROOT / "backend/scripts/generate_canonical_baseline.py"
MAPPING_PATH = ROOT / "baseline-tax-provider-command-enforcements.json"
MANIFEST_PATH = ROOT / "tax-provider-command-manifest.json"
SQL_PATH = ROOT / "tax-provider-commands.sql"
SCHEMA = "erp_tax_provider_commands"
REVIEW_KEYS = {
    "tax.einvoices:einvoices_cross_row_guard",
    "tax.eway_bills:eway_bills_cross_row_guard",
    "tax.registration_branches:registration_branches_effective_guard",
}


class ContractError(RuntimeError):
    pass


def _load_baseline():
    spec = importlib.util.spec_from_file_location("tax_provider_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _catalog() -> tuple[Any, dict[str, dict[str, Any]], str]:
    catalog = _load_baseline().load_and_validate_catalog(DOMAIN_ROOT)
    tables = {table["name"]: table for table in catalog.tables}
    invariants: dict[str, dict[str, Any]] = {}
    for table_name in ("tax.einvoices", "tax.eway_bills", "tax.registration_branches"):
        for invariant in tables[table_name]["cross_row_invariants"]:
            key = f"{table_name}:{invariant['name']}"
            if key in REVIEW_KEYS:
                invariants[key] = invariant
    if set(invariants) != REVIEW_KEYS:
        raise ContractError("provider invariant set drifted")
    payload = {
        "contract": catalog.contract,
        "tables": sorted(catalog.tables, key=lambda row: row["name"]),
    }
    digest = hashlib.sha256(
        json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True).encode()
    ).hexdigest()
    return catalog, invariants, digest


def _function(signature: str, returns: str, body: str, grants: tuple[str, ...] = ()) -> list[str]:
    statements = [
        f'''CREATE FUNCTION "{SCHEMA}".{signature}
RETURNS {returns}
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
#variable_conflict use_variable
{body.strip()}
$function$''',
        f'ALTER FUNCTION "{SCHEMA}".{signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION "{SCHEMA}".{signature} FROM PUBLIC, "erp_app", "erp_runtime", "erp_tax_provider"',
    ]
    statements.extend(
        f'GRANT EXECUTE ON FUNCTION "{SCHEMA}".{signature} TO "{role}"'
        for role in grants
    )
    return statements


def _trigger(name: str, table: str, function: str) -> str:
    table_schema, relation = table.split(".")
    return (
        f'CREATE TRIGGER "{name}" BEFORE INSERT OR UPDATE OR DELETE ON '
        f'"{table_schema}"."{relation}" FOR EACH ROW EXECUTE FUNCTION '
        f'"{SCHEMA}"."{function}"()'
    )


def _setup() -> list[str]:
    return [
        'CREATE ROLE "erp_tax_provider" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime", "erp_tax_provider"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_app", "erp_tax_provider"',
        f'''CREATE TABLE "{SCHEMA}"."command_scopes" (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  scope text NOT NULL,
  target_id uuid NOT NULL,
  PRIMARY KEY (backend_pid,transaction_id,scope,target_id)
)''',
        f'ALTER TABLE "{SCHEMA}"."command_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{SCHEMA}"."command_scopes" FROM PUBLIC, "erp_app", "erp_runtime", "erp_tax_provider"',
        *_function(
            '"scope_active"(requested_scope text, requested_target uuid)',
            "boolean",
            f'''
BEGIN
  RETURN EXISTS (SELECT 1 FROM "{SCHEMA}"."command_scopes" AS scope
    WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
      AND scope.transaction_id=pg_catalog.txid_current()
      AND scope.scope=requested_scope AND scope.target_id=requested_target);
END
''',
        ),
        *_function(
            '"adapter_allowed"(artifact_kind text, adapter_name text)',
            "boolean",
            '''
BEGIN
  RETURN (artifact_kind='einvoice' AND adapter_name IN ('nic_irp_v1','licensed_gsp_irp_v1'))
      OR (artifact_kind='eway_bill' AND adapter_name IN ('nic_eway_v1','licensed_gsp_eway_v1'));
END
''',
        ),
    ]


def _guard(table: str, kind: str) -> list[str]:
    function_name = f"guard_{kind}"
    authority_fields = (
        "NEW.irn,NEW.acknowledgement_number,NEW.acknowledged_at,NEW.signed_qr_bytes,NEW.signed_qr_sha256"
        if kind == "einvoice"
        else "NEW.eway_bill_number,NEW.transport_mode,NEW.vehicle_number,NEW.transporter_id,NEW.valid_from_at,NEW.valid_until_at"
    )
    old_authority_fields = authority_fields.replace("NEW.", "OLD.")
    body = f'''
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='provider authority evidence is retained';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'requested'
       OR NOT "{SCHEMA}"."scope_active"('provider_begin',NEW.id)
       OR NOT "{SCHEMA}"."adapter_allowed"('{kind}',NEW.provider_name)
       OR NEW.request_media_type<>'application/vnd.aasopharma.{kind}-request+json'
       OR NEW.request_sha256<>extensions.digest(NEW.request_bytes,'sha256')
       OR NEW.response_bytes IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='provider attempt lacks canonical command provenance';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'requested' OR NEW.status NOT IN ('generated','failed','cancelled'{",'expired'" if kind == "eway_bill" else ""})
     OR NOT "{SCHEMA}"."scope_active"('provider_complete',OLD.id)
     OR ROW(NEW.org_id,NEW.id,NEW.tax_document_id{',NEW.inventory_document_id' if kind == 'eway_bill' else ',NEW.rule_version_id'},NEW.artifact_version,
            NEW.supersedes_artifact_id,NEW.request_media_type,NEW.request_bytes,
            NEW.request_sha256,NEW.provider_name,NEW.provider_request_id,
            NEW.created_at,NEW.created_by_membership_id)
        IS DISTINCT FROM
        ROW(OLD.org_id,OLD.id,OLD.tax_document_id{',OLD.inventory_document_id' if kind == 'eway_bill' else ',OLD.rule_version_id'},OLD.artifact_version,
            OLD.supersedes_artifact_id,OLD.request_media_type,OLD.request_bytes,
            OLD.request_sha256,OLD.provider_name,OLD.provider_request_id,
            OLD.created_at,OLD.created_by_membership_id)
     OR OLD.response_bytes IS NOT NULL OR NEW.response_bytes IS NULL
     OR NEW.response_sha256<>extensions.digest(NEW.response_bytes,'sha256') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='provider evidence completion is invalid or mutable';
  END IF;
  RETURN NEW;
END
'''
    del authority_fields, old_authority_fields
    return [
        *_function(f'"{function_name}"()', "trigger", body),
        _trigger(f"tax_{table.split('.')[1]}_provider_guard", table, function_name),
    ]


def _canonical_request_function(kind: str) -> list[str]:
    return _function(
        f'"canonical_{kind}_request"(document tax.documents, registration tax.registrations, action_name text, adapter_name text, provider_request_id varchar, artifact_version integer, prior_authority varchar, cancellation_reason text)',
        "bytea",
        f'''
DECLARE envelope jsonb;
BEGIN
  envelope:=pg_catalog.jsonb_build_object(
    'schema','aasopharma.{kind}-provider-request','schema_version','1',
    'action',action_name,'adapter',adapter_name,'provider_request_id',provider_request_id,
    'artifact_version',artifact_version,'prior_authority',prior_authority,
    'cancellation_reason',cancellation_reason,
    'document',pg_catalog.jsonb_build_object(
      'source_kind','tax_document','tax_document_id',document.id,
      'document_class',document.document_class,
      'document_number',document.document_number,'document_date',document.document_date,
      'supplier_gstin',registration.gstin,'counterparty_gstin',document.counterparty_gstin,
      'place_of_supply_state_code',document.place_of_supply_state_code,
      'supply_type',document.supply_type,'tax_charge_mechanism',document.tax_charge_mechanism,
      'currency_code',document.currency_code,'net_value_amount',document.net_value_amount,
      'gst_taxable_value',document.gst_taxable_value,'cgst_amount',document.cgst_amount,
      'sgst_amount',document.sgst_amount,'igst_amount',document.igst_amount,
      'cess_amount',document.cess_amount,'rounding_adjustment',document.rounding_adjustment,
      'counterparty_payable_amount',document.counterparty_payable_amount,
      'tax_ruleset_version',document.tax_ruleset_version,
      'source_sha256',pg_catalog.encode(document.source_hash,'hex')
      {",'eway_supply_type','outward','eway_sub_supply_type','supply','eway_document_type','tax_invoice'" if kind == "eway_bill" else ""}),
    'lines',CASE WHEN document.document_class='sales_invoice' THEN
      (SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'line_id',line.id,'line_number',line.line_number,'line_kind',line.line_kind,
      'classification_code',line.tax_classification_code_snapshot,'uom_code',line.uom_code,
      'billed_quantity',line.billed_quantity,'free_quantity',line.free_quantity,
      'gross_amount',line.gross_amount,'discount_amount',line.line_discount_amount+line.document_discount_amount,
      'gst_taxable_value',line.gst_taxable_value,'cgst_rate',line.cgst_rate,'sgst_rate',line.sgst_rate,
      'igst_rate',line.igst_rate,'cess_rate',line.cess_rate,'cgst_amount',line.cgst_amount,
      'sgst_amount',line.sgst_amount,'igst_amount',line.igst_amount,'cess_amount',line.cess_amount,
      'line_total',line.line_total) ORDER BY line.line_number,line.id),'[]'::jsonb)
      FROM sales.invoice_lines AS line
      WHERE line.org_id=document.org_id AND line.invoice_id=document.sales_invoice_id)
    ELSE (SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'line_id',line.id,'line_number',line.line_number,'line_kind',line.line_kind,
      'classification_code',line.hsn_sac_code,'uom_code',line.uom_code,
      'billed_quantity',line.billed_quantity,'free_quantity',line.free_quantity,
      'gross_amount',line.gross_amount,'discount_amount',line.discount_amount,
      'gst_taxable_value',line.gst_taxable_value,'cgst_rate',line.cgst_rate,'sgst_rate',line.sgst_rate,
      'igst_rate',line.igst_rate,'cess_rate',line.cess_rate,'cgst_amount',line.cgst_amount,
      'sgst_amount',line.sgst_amount,'igst_amount',line.igst_amount,'cess_amount',line.cess_amount,
      'line_total',line.line_total) ORDER BY line.line_number,line.id),'[]'::jsonb)
      FROM finance.adjustment_note_lines AS line
      WHERE line.org_id=document.org_id AND line.adjustment_note_id=document.adjustment_note_id) END);
  RETURN pg_catalog.convert_to(envelope::text,'UTF8');
END
''',
    )


def _canonical_inventory_eway_request() -> list[str]:
    return _function(
        '"canonical_eway_bill_inventory_request"(document inventory.inventory_documents, tax_document_id uuid, registration tax.registrations, action_name text, adapter_name text, provider_request_id varchar, artifact_version integer, prior_authority varchar, cancellation_reason text)',
        "bytea",
        '''
DECLARE envelope jsonb; supply_direction text; sub_supply_type text;
BEGIN
  supply_direction:='outward';
  sub_supply_type:=CASE document.document_type
    WHEN 'transfer' THEN 'stock_transfer'
    WHEN 'sales_issue' THEN 'supply'
    WHEN 'purchase_return_issue' THEN 'purchase_return'
    END;
  IF document.status<>'posted' OR document.posted_at IS NULL
     OR NOT document.physical_movement_required
     OR document.document_type NOT IN ('transfer','sales_issue','purchase_return_issue')
     OR sub_supply_type IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-way inventory source is not an allowlisted posted physical movement';
  END IF;
  envelope:=pg_catalog.jsonb_build_object(
    'schema','aasopharma.eway_bill-provider-request','schema_version','1',
    'action',action_name,'adapter',adapter_name,'provider_request_id',provider_request_id,
    'artifact_version',artifact_version,'prior_authority',prior_authority,
    'cancellation_reason',cancellation_reason,
    'document',pg_catalog.jsonb_build_object(
      'source_kind','inventory_document','inventory_document_id',document.id,'tax_document_id',tax_document_id,
      'document_number',document.document_number,'document_date',document.document_date,
      'document_type',document.document_type,'reason_code',document.reason_code,
      'branch_id',document.branch_id,'destination_branch_id',document.destination_branch_id,
      'origin_address_line1',document.origin_address_line1,'origin_address_line2',document.origin_address_line2,
      'origin_city',document.origin_city,'origin_state_code',document.origin_state_code,'origin_pincode',document.origin_pincode,
      'destination_address_line1',document.destination_address_line1,'destination_address_line2',document.destination_address_line2,
      'destination_city',document.destination_city,'destination_state_code',document.destination_state_code,
      'destination_pincode',document.destination_pincode,'transport_mode',document.transport_mode,
      'distance_km',document.distance_km,'transporter_name',document.transporter_name_snapshot,
      'transporter_gstin',document.transporter_gstin_snapshot,'vehicle_number',document.vehicle_number_snapshot,
      'vehicle_type',document.vehicle_type_snapshot,'transport_document_number',document.transport_document_number_snapshot,
      'transport_document_date',document.transport_document_date,'movement_started_at',document.movement_started_at,
      'supplier_gstin',registration.gstin,
      'currency_code',document.currency_code,'total_abs_base_quantity',document.total_abs_base_quantity,
      'total_value',document.total_value,'eway_supply_type',supply_direction,
      'eway_sub_supply_type',sub_supply_type,'eway_document_type','delivery_challan'),
    'lines',(SELECT pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'line_id',line.id,'line_number',line.line_number,'movement_kind',line.movement_kind,
      'product_id',line.product_id,'batch_id',line.batch_id,'hsn_code',product.hsn_code,
      'uom_code',line.uom_code,'entered_quantity',line.entered_quantity,
      'base_quantity',line.base_quantity,'from_location_id',line.from_location_id,
      'to_location_id',line.to_location_id,'unit_cost',line.unit_cost,
      'extended_cost',line.extended_cost) ORDER BY line.line_number,line.id),'[]'::jsonb)
      FROM inventory.inventory_document_lines AS line
      JOIN catalog.products AS product ON product.org_id=line.org_id AND product.id=line.product_id
      WHERE line.org_id=document.org_id AND line.inventory_document_id=document.id));
  RETURN pg_catalog.convert_to(envelope::text,'UTF8');
END
''',
    )


def _begin(kind: str, table: str, permission: str, authority_column: str) -> list[str]:
    expiry_guard = (
        "     OR (action_name='expire' AND (prior.id IS NULL OR prior.status<>'generated'))\n"
        if kind == "eway_bill"
        else ""
    )
    return _function(
        f'"begin_{kind}"(organization_id uuid, artifact_id uuid, document_id uuid, action_name text, adapter_name varchar, provider_request_id varchar, cancellation_reason text)',
        "uuid",
        f'''
DECLARE actor_id uuid:=erp_security.current_membership_id(); document tax.documents%ROWTYPE;
        registration tax.registrations%ROWTYPE; prior {table}%ROWTYPE; existing {table}%ROWTYPE;
        fiscal_fact tax.organization_fiscal_tax_facts%ROWTYPE;
        applicable_rule tax.einvoice_rule_versions%ROWTYPE;
        source_branch_id uuid; next_version integer; request_bytes bytea; prior_authority varchar;
BEGIN
  IF organization_id IS DISTINCT FROM erp_security.current_org_id() OR actor_id IS NULL
     OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='provider attempt context or permission is invalid';
  END IF;
  IF action_name NOT IN ('generate','regenerate','cancel'{",'expire'" if kind == "eway_bill" else ""})
     OR NOT "{SCHEMA}"."adapter_allowed"('{kind}',adapter_name)
     OR pg_catalog.btrim(provider_request_id)='' OR artifact_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='provider attempt action or adapter is unsupported';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||document_id::text||':{kind}',20260820));
  SELECT * INTO document FROM tax.documents
   WHERE org_id=organization_id AND id=document_id AND direction='outward'
     AND document_class IN ('sales_invoice','adjustment_note') FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-invoice requires a posted outward invoice or statutory adjustment tax document';
  END IF;
  SELECT * INTO registration FROM tax.registrations
   WHERE org_id=organization_id AND id=document.registration_id AND status='active'
     AND document.document_date BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date)
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tax registration is not active on document date'; END IF;
  SELECT COALESCE(invoice.branch_id,original_invoice.branch_id) INTO source_branch_id
    FROM tax.documents source
    LEFT JOIN sales.invoices invoice ON invoice.org_id=source.org_id AND invoice.id=source.sales_invoice_id
    LEFT JOIN finance.adjustment_notes note ON note.org_id=source.org_id AND note.id=source.adjustment_note_id
    LEFT JOIN sales.invoices original_invoice ON original_invoice.org_id=note.org_id AND original_invoice.id=note.sales_invoice_id
   WHERE source.org_id=organization_id AND source.id=document_id;
  IF source_branch_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM tax.registration_branches association
     WHERE association.org_id=organization_id AND association.registration_id=registration.id
       AND association.branch_id=source_branch_id AND association.status='active'
       AND document.document_date BETWEEN association.effective_from AND COALESCE(association.effective_to,'infinity'::date)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document branch lacks an effective GST registration association';
  END IF;
  IF NOT erp_security.has_permission('{permission}',source_branch_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='provider attempt permission is absent for the registration branch';
  END IF;
  IF action_name IN ('generate','regenerate') THEN
    SELECT * INTO STRICT fiscal_fact FROM tax.organization_fiscal_tax_facts fact
     WHERE fact.org_id=organization_id AND fact.status='verified'
       AND fact.fiscal_year_start_year=EXTRACT(YEAR FROM (document.document_date-INTERVAL '3 months'))::smallint
       AND document.document_date BETWEEN fact.effective_from AND COALESCE(fact.effective_to,'infinity'::date)
     FOR SHARE;
    SELECT * INTO STRICT applicable_rule FROM tax.einvoice_rule_versions rule
     WHERE rule.status='active'
       AND document.document_date BETWEEN rule.effective_from AND COALESCE(rule.effective_to,'infinity'::date)
       AND rule.organization_person_type IN ('any',fiscal_fact.organization_person_type)
       AND rule.organization_exemption_code IN ('any',COALESCE(fiscal_fact.einvoice_exemption_code,'none'))
       AND rule.registration_type IN ('any',registration.registration_type)
       AND rule.document_class=document.document_class
       AND rule.supply_scope=CASE WHEN document.supply_type='export' THEN 'export'
                                  WHEN document.supply_type='sez' THEN 'sez' ELSE 'domestic_registered' END
       AND fiscal_fact.prior_fiscal_year_turnover>=rule.minimum_prior_fy_turnover
     FOR SHARE;
    IF applicable_rule.reporting_window_days IS NOT NULL
       AND CURRENT_DATE>document.document_date+applicable_rule.reporting_window_days THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='document is outside the reviewed e-invoice reporting window';
    END IF;
  END IF;
  SELECT * INTO existing FROM {table} AS replay
   WHERE replay.org_id=organization_id AND replay.provider_name=adapter_name
     AND replay.provider_request_id=provider_request_id FOR SHARE;
  IF existing.id IS NOT NULL THEN
    SELECT predecessor.{authority_column} INTO prior_authority FROM {table} AS predecessor
     WHERE predecessor.org_id=organization_id AND predecessor.id=existing.supersedes_artifact_id;
    request_bytes:="{SCHEMA}"."canonical_{kind}_request"(
      document,registration,action_name,adapter_name,provider_request_id,
      existing.artifact_version,prior_authority,
      CASE WHEN action_name='cancel' THEN cancellation_reason ELSE NULL END);
    IF existing.id=artifact_id AND existing.tax_document_id=document_id
       AND existing.request_bytes=request_bytes THEN RETURN existing.id; END IF;
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='provider request id already binds different canonical bytes';
  END IF;
  SELECT * INTO prior FROM {table} AS chain
   WHERE chain.org_id=organization_id AND chain.tax_document_id=document_id
   ORDER BY chain.artifact_version DESC LIMIT 1 FOR UPDATE;
  next_version:=COALESCE(prior.artifact_version,0)+1;
  prior_authority:=prior.{authority_column};
  IF action_name='cancel' THEN applicable_rule.id:=prior.rule_version_id; END IF;
  IF (action_name='generate' AND prior.id IS NOT NULL)
     OR (action_name='regenerate' AND (prior.id IS NULL OR prior.status NOT IN ('failed','cancelled')))
     OR (action_name='cancel' AND (prior.id IS NULL OR prior.status<>'generated'))
{expiry_guard.rstrip()}
     OR (action_name='cancel' AND pg_catalog.btrim(COALESCE(cancellation_reason,''))='') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='provider action does not follow the immutable evidence chain';
  END IF;
  request_bytes:="{SCHEMA}"."canonical_{kind}_request"(
    document,registration,action_name,adapter_name,provider_request_id,next_version,
    prior_authority,CASE WHEN action_name='cancel' THEN cancellation_reason ELSE NULL END);
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'provider_begin',artifact_id);
  INSERT INTO {table}(org_id,id,tax_document_id,rule_version_id,artifact_version,supersedes_artifact_id,
    request_media_type,request_bytes,request_sha256,provider_name,provider_request_id,
    status,created_by_membership_id)
  VALUES(organization_id,artifact_id,document_id,applicable_rule.id,next_version,prior.id,
    'application/vnd.aasopharma.{kind}-request+json',request_bytes,
    extensions.digest(request_bytes,'sha256'),adapter_name,provider_request_id,
    'requested',actor_id);
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
    AND transaction_id=pg_catalog.txid_current() AND scope='provider_begin' AND target_id=artifact_id;
  RETURN artifact_id;
END
''',
        grants=("erp_app",),
    )


def _begin_eway() -> list[str]:
    return _function(
        '"begin_eway_bill"(organization_id uuid, artifact_id uuid, tax_document_id uuid, inventory_document_id uuid, action_name text, adapter_name varchar, provider_request_id varchar, cancellation_reason text)',
        "uuid",
        f'''
DECLARE actor_id uuid:=erp_security.current_membership_id(); tax_document tax.documents%ROWTYPE;
        inventory_document inventory.inventory_documents%ROWTYPE; registration tax.registrations%ROWTYPE;
        prior tax.eway_bills%ROWTYPE; existing tax.eway_bills%ROWTYPE;
        next_version integer; request_bytes bytea; prior_authority varchar; source_lock text;
BEGIN
  IF organization_id IS DISTINCT FROM erp_security.current_org_id() OR actor_id IS NULL
     OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='e-way attempt context is invalid';
  END IF;
  IF inventory_document_id IS NULL
     OR action_name NOT IN ('generate','regenerate','cancel','expire')
     OR NOT "{SCHEMA}"."adapter_allowed"('eway_bill',adapter_name)
     OR pg_catalog.btrim(provider_request_id)='' OR artifact_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='e-way source, action, or adapter is unsupported';
  END IF;
  source_lock:='inventory:'||inventory_document_id::text;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organization_id::text||':'||source_lock||':eway_bill',20260820));
  SELECT * INTO inventory_document FROM inventory.inventory_documents
   WHERE org_id=organization_id AND id=inventory_document_id AND status='posted'
     AND physical_movement_required
     AND document_type IN ('sales_issue','purchase_return_issue','transfer')
   FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM inventory.inventory_document_lines AS line
     WHERE line.org_id=organization_id AND line.inventory_document_id=inventory_document_id
       AND line.movement_kind IN ('issue','transfer')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-way requires an allowlisted posted physical inventory movement with lines';
  END IF;
  IF tax_document_id IS NOT NULL THEN
    SELECT * INTO tax_document FROM tax.documents
     WHERE org_id=organization_id AND id=tax_document_id AND direction='outward'
       AND document_class='sales_invoice' AND sales_invoice_id=inventory_document.sales_invoice_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tax-sourced e-way v1 requires a posted outward sales-invoice tax document';
    END IF;
  END IF;
  SELECT registration_row.* INTO STRICT registration
    FROM tax.registration_branches association
    JOIN tax.registrations registration_row ON registration_row.org_id=association.org_id
      AND registration_row.id=association.registration_id
   WHERE association.org_id=organization_id AND association.branch_id=inventory_document.branch_id
     AND association.status='active' AND registration_row.status='active'
     AND inventory_document.document_date BETWEEN association.effective_from AND COALESCE(association.effective_to,'infinity'::date)
     AND inventory_document.document_date BETWEEN registration_row.effective_from AND COALESCE(registration_row.effective_to,'infinity'::date)
     AND (tax_document_id IS NULL OR registration_row.id=tax_document.registration_id)
   FOR SHARE;
  IF registration.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='source branch has no active GST registration on movement date';
  END IF;
  IF NOT erp_security.has_permission('tax.eway_bill.generate',inventory_document.branch_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='e-way permission is absent for the source branch';
  END IF;
  SELECT * INTO existing FROM tax.eway_bills AS replay
   WHERE replay.org_id=organization_id AND replay.provider_name=adapter_name
     AND replay.provider_request_id=provider_request_id FOR SHARE;
  IF existing.id IS NOT NULL THEN
    SELECT predecessor.eway_bill_number INTO prior_authority FROM tax.eway_bills AS predecessor
     WHERE predecessor.org_id=organization_id AND predecessor.id=existing.supersedes_artifact_id;
    request_bytes:="{SCHEMA}"."canonical_eway_bill_inventory_request"(
      inventory_document,tax_document_id,registration,action_name,adapter_name,provider_request_id,
      existing.artifact_version,prior_authority,
      CASE WHEN action_name='cancel' THEN cancellation_reason ELSE NULL END);
    IF existing.id=artifact_id
       AND existing.tax_document_id IS NOT DISTINCT FROM tax_document_id
       AND existing.inventory_document_id IS NOT DISTINCT FROM inventory_document_id
       AND existing.request_bytes=request_bytes THEN RETURN existing.id; END IF;
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='provider request id already binds different canonical bytes';
  END IF;
  SELECT * INTO prior FROM tax.eway_bills AS chain
   WHERE chain.org_id=organization_id
     AND chain.tax_document_id IS NOT DISTINCT FROM tax_document_id
     AND chain.inventory_document_id IS NOT DISTINCT FROM inventory_document_id
   ORDER BY chain.artifact_version DESC LIMIT 1 FOR UPDATE;
  next_version:=COALESCE(prior.artifact_version,0)+1; prior_authority:=prior.eway_bill_number;
  IF (action_name='generate' AND prior.id IS NOT NULL)
     OR (action_name='regenerate' AND (prior.id IS NULL OR prior.status NOT IN ('failed','cancelled')))
     OR (action_name='cancel' AND (prior.id IS NULL OR prior.status<>'generated'))
     OR (action_name='expire' AND (prior.id IS NULL OR prior.status<>'generated'))
     OR (action_name='cancel' AND pg_catalog.btrim(COALESCE(cancellation_reason,''))='') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-way action does not follow the immutable evidence chain';
  END IF;
  request_bytes:="{SCHEMA}"."canonical_eway_bill_inventory_request"(
    inventory_document,tax_document_id,registration,action_name,adapter_name,provider_request_id,next_version,
    prior_authority,CASE WHEN action_name='cancel' THEN cancellation_reason ELSE NULL END);
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'provider_begin',artifact_id);
  INSERT INTO tax.eway_bills(org_id,id,tax_document_id,inventory_document_id,artifact_version,
    supersedes_artifact_id,request_media_type,request_bytes,request_sha256,provider_name,
    provider_request_id,status,created_by_membership_id)
  VALUES(organization_id,artifact_id,tax_document_id,inventory_document_id,next_version,prior.id,
    'application/vnd.aasopharma.eway_bill-request+json',request_bytes,
    extensions.digest(request_bytes,'sha256'),adapter_name,provider_request_id,'requested',actor_id);
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
    AND transaction_id=pg_catalog.txid_current() AND scope='provider_begin' AND target_id=artifact_id;
  RETURN artifact_id;
END
''',
        grants=("erp_app",),
    )


def _complete_einvoice() -> list[str]:
    return _function(
        '"complete_einvoice"(organization_id uuid, artifact_id uuid, expected_adapter_name varchar, expected_provider_request_id varchar, expected_request_sha256 bytea, outcome text, response_media_type varchar, response_bytes bytea, response_sha256 bytea, irn varchar, acknowledgement_number varchar, acknowledged_at timestamptz, signed_qr_bytes bytea, signed_qr_sha256 bytea)',
        "uuid",
        f'''
DECLARE artifact tax.einvoices%ROWTYPE; prior tax.einvoices%ROWTYPE; request_doc jsonb; action_name text;
BEGIN
  IF SESSION_USER<>'erp_tax_provider' OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='completion requires isolated provider principal and request context';
  END IF;
  SELECT * INTO artifact FROM tax.einvoices WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-invoice attempt is absent'; END IF;
  IF artifact.provider_name<>expected_adapter_name
     OR artifact.provider_request_id<>expected_provider_request_id
     OR artifact.request_sha256<>expected_request_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-invoice completion does not bind the canonical provider request';
  END IF;
  IF artifact.status<>'requested' THEN
    IF artifact.status=outcome AND artifact.response_media_type=response_media_type
       AND artifact.response_bytes=response_bytes AND artifact.response_sha256=response_sha256
       AND (outcome<>'generated' OR (artifact.irn=irn
         AND artifact.acknowledgement_number=acknowledgement_number
         AND artifact.acknowledged_at=acknowledged_at
         AND artifact.signed_qr_bytes=signed_qr_bytes
         AND artifact.signed_qr_sha256=signed_qr_sha256)) THEN
      RETURN artifact.id;
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='e-invoice completion replay differs from immutable evidence';
  END IF;
  request_doc:=pg_catalog.convert_from(artifact.request_bytes,'UTF8')::jsonb; action_name:=request_doc->>'action';
  IF response_bytes IS NULL OR pg_catalog.octet_length(response_bytes)=0
     OR pg_catalog.btrim(response_media_type)='' OR response_sha256<>extensions.digest(response_bytes,'sha256')
     OR outcome NOT IN ('generated','failed','cancelled')
     OR (outcome='generated' AND action_name NOT IN ('generate','regenerate'))
     OR (outcome='cancelled' AND action_name<>'cancel') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-invoice provider outcome or evidence is invalid';
  END IF;
  IF outcome='generated' AND (pg_catalog.btrim(COALESCE(irn,''))='' OR pg_catalog.btrim(COALESCE(acknowledgement_number,''))=''
     OR acknowledged_at IS NULL OR signed_qr_bytes IS NULL OR signed_qr_sha256<>extensions.digest(signed_qr_bytes,'sha256')) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generated e-invoice lacks IRN acknowledgement or signed QR evidence';
  END IF;
  IF outcome='cancelled' THEN
    SELECT * INTO prior FROM tax.einvoices WHERE org_id=organization_id AND id=artifact.supersedes_artifact_id AND status='generated' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cancellation does not supersede generated IRN evidence'; END IF;
    irn:=prior.irn; acknowledgement_number:=prior.acknowledgement_number;
    acknowledged_at:=prior.acknowledged_at; signed_qr_bytes:=prior.signed_qr_bytes;
    signed_qr_sha256:=prior.signed_qr_sha256;
  END IF;
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'provider_complete',artifact_id);
  UPDATE tax.einvoices SET status=outcome,response_media_type=response_media_type,
    response_bytes=response_bytes,response_sha256=response_sha256,
    irn=CASE WHEN outcome IN ('generated','cancelled') THEN irn ELSE NULL END,
    acknowledgement_number=CASE WHEN outcome IN ('generated','cancelled') THEN acknowledgement_number ELSE NULL END,
    acknowledged_at=CASE WHEN outcome IN ('generated','cancelled') THEN acknowledged_at ELSE NULL END,
    signed_qr_bytes=CASE WHEN outcome IN ('generated','cancelled') THEN signed_qr_bytes ELSE NULL END,
    signed_qr_sha256=CASE WHEN outcome IN ('generated','cancelled') THEN signed_qr_sha256 ELSE NULL END,
    cancelled_at=CASE WHEN outcome='cancelled' THEN pg_catalog.transaction_timestamp() ELSE NULL END,
    cancelled_by_membership_id=CASE WHEN outcome='cancelled' THEN artifact.created_by_membership_id ELSE NULL END,
    cancellation_reason=CASE WHEN outcome='cancelled' THEN request_doc->>'cancellation_reason' ELSE NULL END
   WHERE org_id=organization_id AND id=artifact_id AND status='requested';
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
    AND transaction_id=pg_catalog.txid_current() AND scope='provider_complete' AND target_id=artifact_id;
  RETURN artifact_id;
END
''',
        grants=("erp_tax_provider",),
    )


def _complete_eway() -> list[str]:
    return _function(
        '"complete_eway_bill"(organization_id uuid, artifact_id uuid, expected_adapter_name varchar, expected_provider_request_id varchar, expected_request_sha256 bytea, outcome text, response_media_type varchar, response_bytes bytea, response_sha256 bytea, eway_bill_number varchar, transport_mode text, vehicle_number varchar, transporter_id varchar, valid_from_at timestamptz, valid_until_at timestamptz)',
        "uuid",
        f'''
DECLARE artifact tax.eway_bills%ROWTYPE; prior tax.eway_bills%ROWTYPE; request_doc jsonb; action_name text;
BEGIN
  IF SESSION_USER<>'erp_tax_provider' OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='completion requires isolated provider principal and request context';
  END IF;
  SELECT * INTO artifact FROM tax.eway_bills WHERE org_id=organization_id AND id=artifact_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-way attempt is absent'; END IF;
  IF artifact.provider_name<>expected_adapter_name
     OR artifact.provider_request_id<>expected_provider_request_id
     OR artifact.request_sha256<>expected_request_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-way completion does not bind the canonical provider request';
  END IF;
  IF artifact.status<>'requested' THEN
    IF artifact.status=outcome AND artifact.response_media_type=response_media_type
       AND artifact.response_bytes=response_bytes AND artifact.response_sha256=response_sha256
       AND (outcome<>'generated' OR (artifact.eway_bill_number=eway_bill_number
         AND artifact.transport_mode IS NOT DISTINCT FROM transport_mode
         AND artifact.vehicle_number IS NOT DISTINCT FROM vehicle_number
         AND artifact.transporter_id IS NOT DISTINCT FROM transporter_id
         AND artifact.valid_from_at=valid_from_at AND artifact.valid_until_at=valid_until_at)) THEN
      RETURN artifact.id;
    END IF;
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='e-way completion replay differs from immutable evidence';
  END IF;
  request_doc:=pg_catalog.convert_from(artifact.request_bytes,'UTF8')::jsonb; action_name:=request_doc->>'action';
  IF response_bytes IS NULL OR pg_catalog.octet_length(response_bytes)=0
     OR pg_catalog.btrim(response_media_type)='' OR response_sha256<>extensions.digest(response_bytes,'sha256')
     OR outcome NOT IN ('generated','failed','cancelled','expired')
     OR (outcome='generated' AND action_name NOT IN ('generate','regenerate'))
     OR (outcome='cancelled' AND action_name<>'cancel') OR (outcome='expired' AND action_name<>'expire') THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='e-way provider outcome or evidence is invalid';
  END IF;
  IF outcome='generated' AND (pg_catalog.btrim(COALESCE(eway_bill_number,''))=''
     OR transport_mode IS DISTINCT FROM request_doc#>>'{{document,transport_mode}}'
     OR vehicle_number IS DISTINCT FROM request_doc#>>'{{document,vehicle_number}}'
     OR valid_from_at IS NULL OR valid_until_at<=valid_from_at) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='generated e-way bill lacks matching transport, number or validity evidence';
  END IF;
  IF outcome IN ('cancelled','expired') THEN
    SELECT * INTO prior FROM tax.eway_bills WHERE org_id=organization_id AND id=artifact.supersedes_artifact_id AND status='generated' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='terminal e-way evidence does not supersede a generated bill'; END IF;
    eway_bill_number:=prior.eway_bill_number; transport_mode:=prior.transport_mode;
    vehicle_number:=prior.vehicle_number; transporter_id:=prior.transporter_id;
    valid_from_at:=prior.valid_from_at; valid_until_at:=prior.valid_until_at;
  END IF;
  INSERT INTO "{SCHEMA}"."command_scopes" VALUES
    (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'provider_complete',artifact_id);
  UPDATE tax.eway_bills SET status=outcome,response_media_type=response_media_type,
    response_bytes=response_bytes,response_sha256=response_sha256,
    eway_bill_number=CASE WHEN outcome IN ('generated','cancelled','expired') THEN eway_bill_number ELSE NULL END,
    transport_mode=CASE WHEN outcome IN ('generated','cancelled','expired') THEN transport_mode ELSE NULL END,
    vehicle_number=CASE WHEN outcome IN ('generated','cancelled','expired') THEN vehicle_number ELSE NULL END,
    transporter_id=CASE WHEN outcome IN ('generated','cancelled','expired') THEN transporter_id ELSE NULL END,
    valid_from_at=CASE WHEN outcome IN ('generated','cancelled','expired') THEN valid_from_at ELSE NULL END,
    valid_until_at=CASE WHEN outcome IN ('generated','cancelled','expired') THEN valid_until_at ELSE NULL END,
    cancelled_at=CASE WHEN outcome='cancelled' THEN pg_catalog.transaction_timestamp() ELSE NULL END,
    cancelled_by_membership_id=CASE WHEN outcome='cancelled' THEN artifact.created_by_membership_id ELSE NULL END,
    cancellation_reason=CASE WHEN outcome='cancelled' THEN request_doc->>'cancellation_reason' ELSE NULL END
   WHERE org_id=organization_id AND id=artifact_id AND status='requested';
  DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
    AND transaction_id=pg_catalog.txid_current() AND scope='provider_complete' AND target_id=artifact_id;
  RETURN artifact_id;
END
''',
        grants=("erp_tax_provider",),
    )


def _read_request() -> list[str]:
    return _function(
        '"read_request"(organization_id uuid, artifact_id uuid, artifact_kind text)',
        'TABLE(request_media_type varchar, request_bytes bytea, request_sha256 bytea, adapter_name varchar, provider_request_id varchar)',
        '''
BEGIN
  IF SESSION_USER<>'erp_tax_provider' OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='provider request read requires isolated provider principal and request context';
  END IF;
  IF artifact_kind='einvoice' THEN
    RETURN QUERY SELECT artifact.request_media_type,artifact.request_bytes,artifact.request_sha256,
      artifact.provider_name,artifact.provider_request_id
      FROM tax.einvoices AS artifact
     WHERE artifact.org_id=organization_id AND artifact.id=artifact_id AND artifact.status='requested';
  ELSIF artifact_kind='eway_bill' THEN
    RETURN QUERY SELECT artifact.request_media_type,artifact.request_bytes,artifact.request_sha256,
      artifact.provider_name,artifact.provider_request_id
      FROM tax.eway_bills AS artifact
     WHERE artifact.org_id=organization_id AND artifact.id=artifact_id AND artifact.status='requested';
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='provider artifact kind is unsupported';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='requested provider artifact is absent';
  END IF;
END
''',
        grants=("erp_tax_provider",),
    )


def _definitions() -> dict[str, list[str]]:
    shared = _setup()
    einvoice = [
        *shared,
        *_guard("tax.einvoices", "einvoice"),
        *_guard("tax.eway_bills", "eway_bill"),
        *_canonical_request_function("einvoice"),
        *_canonical_request_function("eway_bill"),
        *_canonical_inventory_eway_request(),
        *_begin("einvoice", "tax.einvoices", "tax.einvoice.generate", "irn"),
        *_begin_eway(),
        *_read_request(),
        *_complete_einvoice(),
        *_complete_eway(),
    ]
    return {
        "tax.einvoices:einvoices_cross_row_guard": einvoice,
        "tax.eway_bills:eway_bills_cross_row_guard": [
            'COMMENT ON TABLE "tax"."eway_bills" IS '
            "'Provider evidence state machine is installed with the e-invoice authority mapping'"
        ],
        "tax.registration_branches:registration_branches_effective_guard": [
            *_function(
                '"guard_registration_branch"()', "trigger", '''
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST registration branch history is retained';
  END IF;
  PERFORM 1 FROM tax.registrations registration
    JOIN core.branches branch ON branch.org_id=registration.org_id AND branch.id=NEW.branch_id
     WHERE registration.org_id=NEW.org_id AND registration.id=NEW.registration_id
       AND registration.state_code=branch.state_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST registration and branch must share organization and state';
  END IF;
  IF TG_OP='UPDATE' AND OLD IS DISTINCT FROM NEW AND EXISTS (
    SELECT 1 FROM tax.documents document
    LEFT JOIN sales.invoices invoice ON invoice.org_id=document.org_id AND invoice.id=document.sales_invoice_id
    LEFT JOIN finance.adjustment_notes note ON note.org_id=document.org_id AND note.id=document.adjustment_note_id
    LEFT JOIN sales.invoices original_invoice ON original_invoice.org_id=note.org_id AND original_invoice.id=note.sales_invoice_id
     WHERE document.org_id=OLD.org_id AND document.registration_id=OLD.registration_id
       AND COALESCE(invoice.branch_id,original_invoice.branch_id)=OLD.branch_id
       AND document.document_date BETWEEN OLD.effective_from AND COALESCE(OLD.effective_to,'infinity'::date)) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='GST registration branch association used by statutory evidence is immutable';
  END IF;
  RETURN NEW;
END
'''),
            _trigger("registration_branches_effective_guard", "tax.registration_branches", "guard_registration_branch"),
            'ALTER TABLE "tax"."registration_branches" ADD CONSTRAINT "registration_branches_active_period_excl" EXCLUDE USING gist ("org_id" WITH =, "branch_id" WITH =, daterange("effective_from",COALESCE("effective_to",\'infinity\'::date),\'[]\') WITH &&) WHERE ("status"=\'active\')',
        ],
    }


def generated_artifacts() -> tuple[str, str, str]:
    catalog, invariants, catalog_hash = _catalog()
    definitions = _definitions()
    entries = []
    for key in sorted(REVIEW_KEYS):
        table, invariant_name = key.split(":")
        invariant = invariants[key]
        entries.append({
            "table": table,
            "invariant": invariant_name,
            "enforcement": invariant["enforcement"],
            "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
            "reviewed": True,
            "statements": definitions[key],
        })
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    sql_statements = [statement for entry in entries for statement in entry["statements"]]
    sql_text = (
        "-- Canonical provider-neutral tax evidence commands\n"
        "-- REVIEWED, NOT APPLIED. No credentials or live endpoint access.\n\nBEGIN;\n\n"
        + ";\n\n".join(statement.rstrip(";") for statement in sql_statements)
        + ";\n\nCOMMIT;\n"
    )
    manifest = {
        "manifest_version": "1.0.0",
        "status": "provider_neutral_worker_boundary_reviewed_external_promotion_blocked",
        "catalog_sha256": catalog_hash,
        "catalog_table_count": len(catalog.tables),
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "sql_file": SQL_PATH.name,
        "sql_sha256": hashlib.sha256(sql_text.encode()).hexdigest(),
        "resolved_invariants": sorted(REVIEW_KEYS),
        "official_reference_review": "docs/architecture/india-compliance-rules.md",
        "database_boundary": {
            "application_functions": ["begin_einvoice", "begin_eway_bill"],
            "provider_functions": ["read_request", "complete_einvoice", "complete_eway_bill"],
            "provider_principal": "erp_tax_provider LOGIN NOINHERIT NOBYPASSRLS",
            "completion_identity": [
                "artifact_id",
                "adapter_name",
                "provider_request_id",
                "canonical_request_sha256",
            ],
            "adapters": {
                "einvoice": ["nic_irp_v1", "licensed_gsp_irp_v1"],
                "eway_bill": ["nic_eway_v1", "licensed_gsp_eway_v1"],
            },
            "credentials_embedded": False,
            "live_access_claimed": False,
        },
        "application_readiness_blockers": [
            "No reviewed PAN/fiscal-year AATO profile and effective e-invoice applicability/reporting-window release exists in the canonical catalog; generation and regeneration fail closed.",
        ],
        "external_operator_gates": [
            "Provision NIC/GSP credentials, static Indian egress and provider IP allowlisting outside PostgreSQL.",
            "Pass official sandbox request, response, signed-QR, cancellation, regeneration and duplicate-request conformance cases against a pinned official provider schema.",
            "Review the organization e-invoice applicability profile and effective rule release.",
        ],
    }
    return sql_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n", mapping_text


def main(argv: list[str] | None = None) -> int:
    check = bool(argv and "--check" in argv)
    sql_text, manifest_text, mapping_text = generated_artifacts()
    expected = {SQL_PATH: sql_text, MANIFEST_PATH: manifest_text, MAPPING_PATH: mapping_text}
    if check:
        drift = [str(path) for path, content in expected.items() if not path.exists() or path.read_text() != content]
        if drift:
            raise SystemExit("tax provider artifacts drifted: " + ", ".join(drift))
        return 0
    for path, content in expected.items():
        path.write_text(content, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
