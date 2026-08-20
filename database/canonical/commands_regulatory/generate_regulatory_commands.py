#!/usr/bin/env python3
"""Generate reviewed regulatory reference import and product activation commands."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
DOMAINS_ROOT = CANONICAL_ROOT / "domains"
REPO_ROOT = CANONICAL_ROOT.parents[1]
BASELINE_PATH = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
SOURCE_MANIFEST = CANONICAL_ROOT / "commands_core" / "core-commands-manifest.json"
MAPPING_PATH = ROOT / "baseline-regulatory-command-enforcements.json"
MANIFEST_PATH = ROOT / "regulatory-command-manifest.json"
SCHEMA = "erp_regulatory_commands"
REVIEW_KEYS = {
    "core.reference_data_releases:reference_data_release_import",
    "catalog.ingredients:ingredient_reference_release",
    "catalog.products:products_regulatory_classification",
    "tax.tax_code_versions:tax_code_versions_release_authority",
    "tax.withholding_rule_versions:withholding_rule_versions_release_authority",
    "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority",
    "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority",
    "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority",
}


class ContractError(RuntimeError):
    """The reviewed regulatory contract no longer matches the catalog."""


def _load_baseline():
    spec = importlib.util.spec_from_file_location("regulatory_baseline", BASELINE_PATH)
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _catalog_hash() -> str:
    catalog = _load_baseline().load_and_validate_catalog(DOMAINS_ROOT)
    payload = {"contract": catalog.contract, "tables": sorted(catalog.tables, key=lambda row: row["name"])}
    canonical = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _invariants() -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    for path in sorted(DOMAINS_ROOT.glob("*.json")):
        if path.name.startswith("_"):
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key in REVIEW_KEYS:
                    found[key] = {
                        "table": table["name"],
                        "invariant": invariant["name"],
                        "enforcement": invariant["enforcement"],
                        "rule": invariant["rule"],
                    }
    if set(found) != REVIEW_KEYS:
        raise ContractError(f"regulatory invariant set drifted: {sorted(REVIEW_KEYS - set(found))}")
    return found


def _function(signature: str, returns: str, body: str, *, grants: tuple[str, ...] = ()) -> list[str]:
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
        f'REVOKE ALL ON FUNCTION "{SCHEMA}".{signature} FROM PUBLIC, "erp_app", "erp_runtime", "erp_regulatory_importer"',
    ]
    statements.extend(f'GRANT EXECUTE ON FUNCTION "{SCHEMA}".{signature} TO "{role}"' for role in grants)
    return statements


def _trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE TRIGGER "{name}" BEFORE {events} ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{function}"()'
    )


def _setup() -> list[str]:
    return [
        'CREATE ROLE "erp_regulatory_importer" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime", "erp_regulatory_importer"',
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_app", "erp_regulatory_importer"',
        f'''CREATE TABLE "{SCHEMA}"."command_scopes" (
    backend_pid integer NOT NULL,
    transaction_id bigint NOT NULL,
    scope text NOT NULL,
    target_id uuid NOT NULL,
    PRIMARY KEY (backend_pid,transaction_id,scope,target_id)
)''',
        f'ALTER TABLE "{SCHEMA}"."command_scopes" OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON TABLE "{SCHEMA}"."command_scopes" FROM PUBLIC, "erp_app", "erp_runtime", "erp_regulatory_importer"',
        *_function(
            '"scope_active"(requested_scope text, requested_target uuid)',
            "boolean",
            f'''
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM "{SCHEMA}"."command_scopes" AS token
         WHERE token.backend_pid=pg_catalog.pg_backend_pid()
           AND token.transaction_id=pg_catalog.txid_current()
           AND token.scope=requested_scope AND token.target_id=requested_target
    );
END
''',
        ),
        *_function(
            '"assert_reference_readiness"(effective_on date)',
            "void",
            '''
BEGIN
    IF effective_on IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='regulatory readiness requires an effective date';
    END IF;
    PERFORM 1 FROM core.reference_data_releases AS release
     WHERE release.dataset_kind='ingredient_classification' AND release.status='active'
       AND effective_on BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
       AND EXISTS (SELECT 1 FROM catalog.ingredients AS ingredient
                    WHERE ingredient.release_id=release.id AND ingredient.status='active'
                      AND effective_on BETWEEN ingredient.effective_from AND COALESCE(ingredient.effective_to,'infinity'::date));
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='no active reviewed ingredient classification release is ready';
    END IF;
    PERFORM 1 FROM core.reference_data_releases AS release
     WHERE release.dataset_kind='hsn_sac_tax' AND release.status='active'
       AND effective_on BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
       AND EXISTS (SELECT 1 FROM tax.tax_code_versions AS tax_version
                    WHERE tax_version.release_id=release.id AND tax_version.status='active'
                      AND effective_on BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date));
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='no active reviewed HSN/SAC tax release is ready';
    END IF;
END
''',
        ),
        *_function(
            '"product_ready"(organization_id uuid, product_id uuid, effective_on date)',
            "boolean",
            '''
BEGIN
    RETURN EXISTS (
      SELECT 1 FROM catalog.products AS product
       WHERE product.org_id=organization_id AND product.id=product_id AND product.status='active'
         AND EXISTS (
           SELECT 1 FROM core.reference_data_releases AS release
            WHERE release.dataset_kind='ingredient_classification' AND release.status='active'
              AND release.ruleset_version=product.regulatory_ruleset_version
              AND effective_on BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
         )
         AND EXISTS (
           SELECT 1 FROM tax.tax_code_versions AS tax_version
           JOIN core.reference_data_releases AS release ON release.id=tax_version.release_id
            WHERE release.dataset_kind='hsn_sac_tax' AND release.status='active'
              AND tax_version.status='active' AND tax_version.code_kind='hsn'
              AND tax_version.default_supply_type='goods' AND tax_version.code=product.hsn_code
              AND effective_on BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
              AND effective_on BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date)
         )
    );
END
''',
        ),
        *_function(
            '"guard_release"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reviewed reference releases are retained';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'staged' OR NOT "{SCHEMA}"."scope_active"('reference_import',NEW.id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reference release requires verified import provenance';
        END IF;
        RETURN NEW;
    END IF;
    IF ROW(NEW.id,NEW.dataset_kind,NEW.ruleset_version,NEW.source_authority,NEW.source_uri,
           NEW.source_storage_bucket,NEW.source_storage_object_path,NEW.source_media_type,
           NEW.source_document_sha256,NEW.dataset_storage_bucket,NEW.dataset_storage_object_path,
           NEW.dataset_media_type,NEW.dataset_sha256,NEW.record_count,
           NEW.publication_date,NEW.effective_from,NEW.effective_to,NEW.supersedes_release_id,
           NEW.reviewed_by_user_id,NEW.reviewed_at,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.dataset_kind,OLD.ruleset_version,OLD.source_authority,OLD.source_uri,
           OLD.source_storage_bucket,OLD.source_storage_object_path,OLD.source_media_type,
           OLD.source_document_sha256,OLD.dataset_storage_bucket,OLD.dataset_storage_object_path,
           OLD.dataset_media_type,OLD.dataset_sha256,OLD.record_count,
           OLD.publication_date,OLD.effective_from,OLD.effective_to,OLD.supersedes_release_id,
           OLD.reviewed_by_user_id,OLD.reviewed_at,OLD.created_at)
       OR NOT "{SCHEMA}"."scope_active"('reference_import',OLD.id)
       OR NOT ((OLD.status='staged' AND NEW.status='active')
            OR (OLD.status='active' AND NEW.status='superseded')) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='invalid or unproven reference release transition';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("reference_data_releases_guard", "INSERT OR UPDATE OR DELETE", "core.reference_data_releases", "guard_release"),
        *_function(
            '"guard_ingredient"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed ingredient versions are retained'; END IF;
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' OR NOT "{SCHEMA}"."scope_active"('reference_import',NEW.release_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ingredient requires verified exact-set import provenance';
        END IF;
        RETURN NEW;
    END IF;
    IF ROW(NEW.id,NEW.release_id,NEW.canonical_name,NEW.normalized_name,NEW.salt_or_form,
           NEW.cas_number,NEW.drugs_rules_schedule,NEW.ndps_classification,
           NEW.schedule_h2_applicable_from,NEW.classification_ruleset_version,
           NEW.effective_from,NEW.effective_to,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.release_id,OLD.canonical_name,OLD.normalized_name,OLD.salt_or_form,
           OLD.cas_number,OLD.drugs_rules_schedule,OLD.ndps_classification,
           OLD.schedule_h2_applicable_from,OLD.classification_ruleset_version,
           OLD.effective_from,OLD.effective_to,OLD.created_at)
       OR OLD.status<>'active' OR NEW.status<>'retired'
       OR NOT "{SCHEMA}"."scope_active"('reference_import',OLD.release_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ingredient identity and classification are immutable';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("ingredients_release_guard", "INSERT OR UPDATE OR DELETE", "catalog.ingredients", "guard_ingredient"),
        *_function(
            '"guard_tax_code_version"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' OR NOT "{SCHEMA}"."scope_active"('reference_import',NEW.release_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tax code version requires verified exact-set import provenance';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed tax code versions are retained'; END IF;
    IF ROW(NEW.id,NEW.release_id,NEW.code,NEW.code_kind,NEW.version_number,NEW.description,
           NEW.effective_from,NEW.effective_to,NEW.taxability,NEW.default_supply_type,
           NEW.cgst_rate,NEW.sgst_rate,NEW.igst_rate,NEW.cess_rate,NEW.ruleset_version,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.release_id,OLD.code,OLD.code_kind,OLD.version_number,OLD.description,
           OLD.effective_from,OLD.effective_to,OLD.taxability,OLD.default_supply_type,
           OLD.cgst_rate,OLD.sgst_rate,OLD.igst_rate,OLD.cess_rate,OLD.ruleset_version,OLD.created_at)
       OR OLD.status<>'active' OR NEW.status<>'retired'
       OR NOT "{SCHEMA}"."scope_active"('reference_import',OLD.release_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tax code identity, treatment and provenance are immutable';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("tax_code_versions_release_guard", "INSERT OR UPDATE OR DELETE", "tax.tax_code_versions", "guard_tax_code_version"),
        *_function(
            '"guard_withholding_rule_version"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'active' OR NOT "{SCHEMA}"."scope_active"('reference_import',NEW.release_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding rule requires verified exact-set import provenance';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed withholding rules are retained'; END IF;
    IF ROW(NEW.id,NEW.release_id,NEW.rule_code,NEW.version_number,NEW.tax_regime,NEW.governing_act_code,
           NEW.provision_code,NEW.fiscal_year_start_from,NEW.fiscal_year_start_to,NEW.effective_from,NEW.effective_to,
           NEW.deduction_trigger,NEW.source_kind,NEW.nature_code,NEW.deductor_person_type,
           NEW.deductee_person_type,NEW.deductee_residency,NEW.deductee_pan_status,
           NEW.organization_prior_fy_turnover_threshold,NEW.transaction_threshold,
           NEW.aggregation_scope,NEW.threshold_application,NEW.basis_mode,NEW.income_tax_rate,
           NEW.cgst_rate,NEW.sgst_rate,NEW.igst_rate,NEW.deposit_due_policy,
           NEW.deposit_month_offset,NEW.deposit_due_day,NEW.statement_form_code,NEW.certificate_form_code,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.release_id,OLD.rule_code,OLD.version_number,OLD.tax_regime,OLD.governing_act_code,
           OLD.provision_code,OLD.fiscal_year_start_from,OLD.fiscal_year_start_to,OLD.effective_from,OLD.effective_to,
           OLD.deduction_trigger,OLD.source_kind,OLD.nature_code,OLD.deductor_person_type,
           OLD.deductee_person_type,OLD.deductee_residency,OLD.deductee_pan_status,
           OLD.organization_prior_fy_turnover_threshold,OLD.transaction_threshold,
           OLD.aggregation_scope,OLD.threshold_application,OLD.basis_mode,OLD.income_tax_rate,
           OLD.cgst_rate,OLD.sgst_rate,OLD.igst_rate,OLD.deposit_due_policy,
           OLD.deposit_month_offset,OLD.deposit_due_day,OLD.statement_form_code,OLD.certificate_form_code,OLD.created_at)
       OR OLD.status<>'active' OR NEW.status<>'retired'
       OR NOT "{SCHEMA}"."scope_active"('reference_import',OLD.release_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding rule identity, applicability and calculation authority are immutable';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("withholding_rule_versions_release_guard", "INSERT OR UPDATE OR DELETE", "tax.withholding_rule_versions", "guard_withholding_rule_version"),
        *_function(
            '"guard_product_classification"()',
            "trigger",
            f'''
BEGIN
    IF TG_OP='INSERT' THEN
        IF NEW.status<>'draft' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='product must start as draft'; END IF;
        RETURN NEW;
    END IF;
    IF NEW.status='active' AND OLD.status IS DISTINCT FROM 'active'
       AND NOT "{SCHEMA}"."scope_active"('product_activation',OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='activation requires regulatory classification command provenance';
    END IF;
    IF OLD.status IN ('active','blocked')
       AND ROW(NEW.product_kind,NEW.manufacturer_party_id,NEW.base_uom_code,NEW.hsn_code,
               NEW.drug_schedule,NEW.requires_prescription,NEW.ndps_regulated,
               NEW.regulatory_ruleset_version,NEW.schedule_h2_applicable_from,
               NEW.traceability_product_code,NEW.hsn_release_id)
           IS DISTINCT FROM
           ROW(OLD.product_kind,OLD.manufacturer_party_id,OLD.base_uom_code,OLD.hsn_code,
               OLD.drug_schedule,OLD.requires_prescription,OLD.ndps_regulated,
               OLD.regulatory_ruleset_version,OLD.schedule_h2_applicable_from,
               OLD.traceability_product_code,OLD.hsn_release_id)
       AND NOT "{SCHEMA}"."scope_active"('product_activation',OLD.id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed product classification changes require the reviewed command';
    END IF;
    RETURN NEW;
END
''',
        ),
        _trigger("products_regulatory_classification_guard", "INSERT OR UPDATE", "catalog.products", "guard_product_classification"),
        *_function(
            '"guard_product_use"()',
            "trigger",
            '''
DECLARE product catalog.products%ROWTYPE;
BEGIN
    IF NEW.product_id IS NULL THEN RETURN NEW; END IF;
    PERFORM "erp_regulatory_commands"."assert_reference_readiness"(CURRENT_DATE);
    SELECT * INTO product FROM catalog.products
     WHERE org_id=NEW.org_id AND id=NEW.product_id FOR SHARE;
    IF NOT FOUND OR product.status<>'active' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='sale or receipt requires an active product';
    END IF;
    PERFORM 1 FROM core.reference_data_releases AS release
       WHERE release.dataset_kind='ingredient_classification' AND release.status='active'
         AND release.ruleset_version=product.regulatory_ruleset_version
         AND CURRENT_DATE BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='product ingredient classification release is no longer active';
    END IF;
    PERFORM 1 FROM tax.tax_code_versions AS tax_version
      JOIN core.reference_data_releases AS release ON release.id=tax_version.release_id
       WHERE release.dataset_kind='hsn_sac_tax' AND release.status='active'
         AND tax_version.status='active' AND tax_version.code_kind='hsn'
         AND tax_version.default_supply_type='goods' AND tax_version.code=product.hsn_code
         AND CURRENT_DATE BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date);
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='product HSN is absent from the active effective tax release';
    END IF;
    RETURN NEW;
END
''',
        ),
        *(
            _trigger(
                table.replace(".", "_") + "_product_reference_guard",
                "INSERT OR UPDATE",
                table,
                "guard_product_use",
            )
            for table in (
                "sales.order_lines",
                "sales.dispatch_lines",
                "sales.invoice_lines",
                "sales.return_lines",
                "procurement.purchase_order_lines",
                "procurement.goods_receipt_lines",
                "procurement.supplier_invoice_lines",
                "procurement.purchase_return_lines",
            )
        ),
        *_function(
            '"guard_regulatory_posting"()',
            "trigger",
            f'''
DECLARE has_product boolean:=false; stale_product boolean:=false; effective_date date;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    CASE TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME
      WHEN 'sales.orders' THEN
        IF NEW.status<>'approved' THEN RETURN NEW; END IF;
        effective_date:=NEW.order_date;
        SELECT EXISTS(SELECT 1 FROM sales.order_lines WHERE org_id=NEW.org_id AND order_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM sales.order_lines WHERE org_id=NEW.org_id AND order_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      WHEN 'sales.invoices' THEN
        IF NEW.status<>'posted' THEN RETURN NEW; END IF;
        effective_date:=NEW.invoice_date;
        SELECT EXISTS(SELECT 1 FROM sales.invoice_lines WHERE org_id=NEW.org_id AND invoice_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM sales.invoice_lines WHERE org_id=NEW.org_id AND invoice_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      WHEN 'sales.returns' THEN
        IF NEW.status<>'posted' THEN RETURN NEW; END IF;
        effective_date:=NEW.return_date;
        SELECT EXISTS(SELECT 1 FROM sales.return_lines WHERE org_id=NEW.org_id AND return_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM sales.return_lines WHERE org_id=NEW.org_id AND return_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      WHEN 'procurement.purchase_orders' THEN
        IF NEW.status<>'approved' THEN RETURN NEW; END IF;
        effective_date:=NEW.order_date;
        SELECT EXISTS(SELECT 1 FROM procurement.purchase_order_lines WHERE org_id=NEW.org_id AND purchase_order_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM procurement.purchase_order_lines WHERE org_id=NEW.org_id AND purchase_order_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      WHEN 'procurement.goods_receipts' THEN
        IF NEW.status<>'posted' THEN RETURN NEW; END IF;
        effective_date:=NEW.received_at::date;
        SELECT EXISTS(SELECT 1 FROM procurement.goods_receipt_lines WHERE org_id=NEW.org_id AND goods_receipt_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM procurement.goods_receipt_lines WHERE org_id=NEW.org_id AND goods_receipt_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      WHEN 'procurement.supplier_invoices' THEN
        IF NEW.status<>'posted' THEN RETURN NEW; END IF;
        effective_date:=NEW.supplier_invoice_date;
        SELECT EXISTS(SELECT 1 FROM procurement.supplier_invoice_lines WHERE org_id=NEW.org_id AND supplier_invoice_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM procurement.supplier_invoice_lines WHERE org_id=NEW.org_id AND supplier_invoice_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      WHEN 'procurement.purchase_returns' THEN
        IF NEW.status<>'posted' THEN RETURN NEW; END IF;
        effective_date:=NEW.return_date;
        SELECT EXISTS(SELECT 1 FROM procurement.purchase_return_lines WHERE org_id=NEW.org_id AND purchase_return_id=NEW.id AND product_id IS NOT NULL),
               EXISTS(SELECT 1 FROM procurement.purchase_return_lines WHERE org_id=NEW.org_id AND purchase_return_id=NEW.id AND product_id IS NOT NULL
                 AND NOT "{SCHEMA}"."product_ready"(NEW.org_id,product_id,effective_date)) INTO has_product,stale_product;
      ELSE RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='unsupported regulatory posting guard binding';
    END CASE;
    IF has_product THEN
      PERFORM "{SCHEMA}"."assert_reference_readiness"(effective_date);
    END IF;
    IF stale_product THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posting product lacks active reviewed regulatory reference authority';
    END IF;
    RETURN NEW;
END
''',
        ),
        *(
            _trigger(
                table.replace(".", "_") + "_regulatory_posting_guard",
                "UPDATE",
                table,
                "guard_regulatory_posting",
            )
            for table in (
                "sales.orders",
                "sales.invoices",
                "sales.returns",
                "procurement.purchase_orders",
                "procurement.goods_receipts",
                "procurement.supplier_invoices",
                "procurement.purchase_returns",
            )
        ),
    ]


def _release_helpers() -> list[str]:
    return [
        *_function(
            '"stage_release"(p_release_id uuid, p_dataset_kind text, p_ruleset_version varchar, p_source_authority text, p_source_uri text, p_source_storage_bucket text, p_source_storage_object_path text, p_source_media_type varchar, p_source_bytes bytea, p_source_sha256 bytea, p_dataset_storage_bucket text, p_dataset_storage_object_path text, p_dataset_bytes bytea, p_dataset_sha256 bytea, p_publication_date date, p_effective_from date, p_effective_to date, p_reviewed_by_user_id uuid, p_reviewed_at timestamptz)',
            "uuid",
            f'''
DECLARE prior_id uuid; canonical_hash bytea; source_hash bytea; row_count integer; dataset_rows jsonb;
BEGIN
    IF SESSION_USER<>'erp_regulatory_importer' THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='reference import requires the isolated regulatory importer principal';
    END IF;
    IF p_dataset_kind NOT IN ('ingredient_classification','hsn_sac_tax','withholding_rules','controlled_movement_rules','einvoice_rules','gst_adjustment_rules')
       OR pg_catalog.btrim(p_ruleset_version)='' OR pg_catalog.btrim(p_source_media_type)=''
       OR pg_catalog.btrim(p_source_storage_bucket)='' OR pg_catalog.btrim(p_source_storage_object_path)=''
       OR pg_catalog.btrim(p_dataset_storage_bucket)='' OR pg_catalog.btrim(p_dataset_storage_object_path)=''
       OR NOT ((p_dataset_kind='ingredient_classification' AND p_source_authority='cdsco'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*cdsco\\.gov\\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='gst_portal'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*gst\\.gov\\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='cbic'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*cbic-gst\\.gov\\.in(/|$)')
            OR (p_dataset_kind='hsn_sac_tax' AND p_source_authority='gstn'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*gstn\\.org\\.in(/|$)')
            OR (p_dataset_kind='withholding_rules' AND p_source_authority='income_tax_department'
                AND (p_source_uri ~ '^https://([a-z0-9-]+\\.)*incometax\\.gov\\.in(/|$)'
                  OR p_source_uri ~ '^https://([a-z0-9-]+\\.)*incometaxindia\\.gov\\.in(/|$)'))
            OR (p_dataset_kind='withholding_rules' AND p_source_authority='cbic'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*cbic-gst\\.gov\\.in(/|$)')
            OR (p_dataset_kind='controlled_movement_rules' AND p_source_authority='cdsco'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*cdsco\\.gov\\.in(/|$)')
            OR (p_dataset_kind='controlled_movement_rules' AND p_source_authority='revenue_department'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*dor\\.gov\\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules') AND p_source_authority='gst_portal'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*gst\\.gov\\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules') AND p_source_authority='cbic'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*cbic-gst\\.gov\\.in(/|$)')
            OR (p_dataset_kind IN ('einvoice_rules','gst_adjustment_rules') AND p_source_authority='gstn'
                AND p_source_uri ~ '^https://([a-z0-9-]+\\.)*gstn\\.org\\.in(/|$)'))
       OR p_publication_date>p_effective_from OR p_reviewed_at>pg_catalog.transaction_timestamp()
       OR p_reviewed_at::date<p_publication_date
       OR p_effective_from>CURRENT_DATE OR (p_effective_to IS NOT NULL AND p_effective_to<CURRENT_DATE)
       OR (p_effective_to IS NOT NULL AND p_effective_to<p_effective_from)
       OR pg_catalog.octet_length(p_source_bytes) NOT BETWEEN 1 AND 104857600
       OR pg_catalog.octet_length(p_dataset_bytes) NOT BETWEEN 2 AND 104857600
       OR pg_catalog.octet_length(p_source_sha256)<>32 OR pg_catalog.octet_length(p_dataset_sha256)<>32 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reference source, review, effective period or dataset envelope is invalid';
    END IF;
    PERFORM 1 FROM core.users WHERE id=p_reviewed_by_user_id AND status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reference release reviewer must be an active typed user'; END IF;
    BEGIN
      dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='canonical reference dataset artifact is not UTF-8 JSON';
    END;
    IF pg_catalog.jsonb_typeof(dataset_rows)<>'array'
       OR p_dataset_bytes IS DISTINCT FROM pg_catalog.convert_to(dataset_rows::text,'UTF8') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='dataset artifact must use canonical PostgreSQL JSONB bytes';
    END IF;
    row_count:=pg_catalog.jsonb_array_length(dataset_rows);
    IF row_count NOT BETWEEN 1 AND 500000 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reference dataset must contain a bounded non-empty exact set';
    END IF;
    source_hash:=extensions.digest(p_source_bytes,'sha256');
    canonical_hash:=extensions.digest(p_dataset_bytes,'sha256');
    IF source_hash IS DISTINCT FROM p_source_sha256 OR canonical_hash IS DISTINCT FROM p_dataset_sha256 THEN
        RAISE EXCEPTION USING ERRCODE='22000', MESSAGE='reference source or canonical dataset SHA-256 mismatch';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_dataset_kind,20260820));
    SELECT id INTO prior_id FROM core.reference_data_releases
     WHERE dataset_kind=p_dataset_kind AND status='active' FOR UPDATE;
    IF prior_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM core.reference_data_releases
         WHERE id=prior_id AND effective_from>=p_effective_from
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='replacement release must start after the active release';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',p_release_id);
    IF prior_id IS NOT NULL THEN
      INSERT INTO "{SCHEMA}"."command_scopes" VALUES
        (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'reference_import',prior_id);
    END IF;
    INSERT INTO core.reference_data_releases(
      id,dataset_kind,ruleset_version,source_authority,source_uri,source_storage_bucket,
      source_storage_object_path,source_media_type,source_document_sha256,dataset_storage_bucket,
      dataset_storage_object_path,dataset_media_type,dataset_sha256,record_count,publication_date,
      effective_from,effective_to,supersedes_release_id,reviewed_by_user_id,reviewed_at,status)
    VALUES(p_release_id,p_dataset_kind,p_ruleset_version,p_source_authority,p_source_uri,
      p_source_storage_bucket,p_source_storage_object_path,p_source_media_type,p_source_sha256,
      p_dataset_storage_bucket,p_dataset_storage_object_path,'application/json',p_dataset_sha256,
      row_count,p_publication_date,p_effective_from,p_effective_to,prior_id,p_reviewed_by_user_id,
      p_reviewed_at,'staged');
    RETURN prior_id;
END
''',
        ),
        *_function(
            '"finish_release"(p_release_id uuid, p_prior_id uuid)',
            "void",
            f'''
BEGIN
    IF SESSION_USER<>'erp_regulatory_importer'
       OR NOT "{SCHEMA}"."scope_active"('reference_import',p_release_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='release completion lacks importer provenance';
    END IF;
    IF p_prior_id IS NOT NULL THEN
      UPDATE core.reference_data_releases SET status='superseded'
       WHERE id=p_prior_id AND status='active';
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='active release changed during import'; END IF;
    END IF;
    UPDATE core.reference_data_releases SET status='active'
     WHERE id=p_release_id AND status='staged';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='staged release changed during import'; END IF;
    DELETE FROM "{SCHEMA}"."command_scopes"
     WHERE backend_pid=pg_catalog.pg_backend_pid() AND transaction_id=pg_catalog.txid_current()
       AND scope='reference_import' AND target_id IN (p_release_id,p_prior_id);
END
''',
        ),
    ]


def _ingredient_import() -> list[str]:
    return [
        *_function(
            '"import_ingredient_release"(p_release_id uuid, p_ruleset_version varchar, p_source_authority text, p_source_uri text, p_source_storage_bucket text, p_source_storage_object_path text, p_source_media_type varchar, p_source_bytes bytea, p_source_sha256 bytea, p_dataset_storage_bucket text, p_dataset_storage_object_path text, p_dataset_bytes bytea, p_dataset_sha256 bytea, p_publication_date date, p_effective_from date, p_effective_to date, p_reviewed_by_user_id uuid, p_reviewed_at timestamptz, p_request_id uuid)',
            "uuid",
            f'''
DECLARE prior_id uuid; item jsonb; supplied_count integer; p_dataset_rows jsonb; affected_org uuid;
BEGIN
    IF p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reference import request id is required'; END IF;
    p_dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
    prior_id:="{SCHEMA}"."stage_release"(p_release_id,'ingredient_classification',p_ruleset_version,
      p_source_authority,p_source_uri,p_source_storage_bucket,p_source_storage_object_path,
      p_source_media_type,p_source_bytes,p_source_sha256,p_dataset_storage_bucket,
      p_dataset_storage_object_path,p_dataset_bytes,p_dataset_sha256,p_publication_date,
      p_effective_from,p_effective_to,p_reviewed_by_user_id,p_reviewed_at);
    supplied_count:=pg_catalog.jsonb_array_length(p_dataset_rows);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_dataset_rows) AS row(value)
       WHERE pg_catalog.jsonb_typeof(value)<>'object'
          OR NOT value ?& ARRAY['id','canonical_name','normalized_name','salt_or_form','cas_number',
              'drugs_rules_schedule','ndps_classification','schedule_h2_applicable_from']
          OR value - ARRAY['id','canonical_name','normalized_name','salt_or_form','cas_number',
              'drugs_rules_schedule','ndps_classification','schedule_h2_applicable_from'] <> '{{}}'::jsonb
          OR pg_catalog.btrim(value->>'canonical_name')=''
          OR value->>'normalized_name'<>pg_catalog.lower(pg_catalog.btrim(value->>'normalized_name'))
          OR value->>'drugs_rules_schedule' NOT IN ('NONE','G','H','H1','X')
          OR value->>'ndps_classification' NOT IN ('NONE','NARCOTIC_DRUG','PSYCHOTROPIC_SUBSTANCE','CONTROLLED_SUBSTANCE')
    ) OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(p_dataset_rows))<>supplied_count
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements(p_dataset_rows) AS row(value)
        GROUP BY value->>'normalized_name',value->>'salt_or_form' HAVING count(*)>1
      ) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ingredient dataset is not the exact reviewed typed set';
    END IF;
    IF prior_id IS NOT NULL THEN
      UPDATE catalog.ingredients SET status='retired'
       WHERE release_id=prior_id AND status='active';
    END IF;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_dataset_rows) ORDER BY value->>'id' LOOP
      INSERT INTO catalog.ingredients(
        id,release_id,canonical_name,normalized_name,salt_or_form,cas_number,drugs_rules_schedule,
        ndps_classification,schedule_h2_applicable_from,classification_ruleset_version,
        effective_from,effective_to,status)
      VALUES((item->>'id')::uuid,p_release_id,item->>'canonical_name',item->>'normalized_name',
        NULLIF(item->>'salt_or_form',''),NULLIF(item->>'cas_number',''),item->>'drugs_rules_schedule',
        item->>'ndps_classification',NULLIF(item->>'schedule_h2_applicable_from','')::date,
        p_ruleset_version,p_effective_from,p_effective_to,'active');
    END LOOP;
    IF (SELECT count(*) FROM catalog.ingredients WHERE release_id=p_release_id)<>supplied_count THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ingredient exact-set count mismatch';
    END IF;
    IF prior_id IS NOT NULL THEN
      FOR affected_org IN
        SELECT DISTINCT product.org_id
          FROM catalog.products AS product
          JOIN catalog.product_ingredients AS composition
            ON composition.org_id=product.org_id AND composition.product_id=product.id
          JOIN catalog.ingredients AS ingredient ON ingredient.id=composition.ingredient_id
         WHERE product.status='active' AND composition.status='active' AND ingredient.release_id=prior_id
      LOOP
        PERFORM pg_catalog.set_config('app.org_id',affected_org::text,true);
        PERFORM pg_catalog.set_config('app.membership_id','',true);
        PERFORM pg_catalog.set_config('app.request_id',p_request_id::text,true);
        UPDATE catalog.products AS product SET status='blocked',updated_at=pg_catalog.transaction_timestamp(),
               row_version=product.row_version+1
         WHERE product.org_id=affected_org AND product.status='active'
           AND EXISTS (
             SELECT 1 FROM catalog.product_ingredients AS composition
             JOIN catalog.ingredients AS ingredient ON ingredient.id=composition.ingredient_id
              WHERE composition.org_id=product.org_id AND composition.product_id=product.id
                AND composition.status='active' AND ingredient.release_id=prior_id
           );
      END LOOP;
    END IF;
    PERFORM "{SCHEMA}"."finish_release"(p_release_id,prior_id);
    RETURN p_release_id;
END
''',
            grants=("erp_regulatory_importer",),
        )
    ]


def _tax_import() -> list[str]:
    return [
        *_function(
            '"import_tax_release"(p_release_id uuid, p_ruleset_version varchar, p_source_authority text, p_source_uri text, p_source_storage_bucket text, p_source_storage_object_path text, p_source_media_type varchar, p_source_bytes bytea, p_source_sha256 bytea, p_dataset_storage_bucket text, p_dataset_storage_object_path text, p_dataset_bytes bytea, p_dataset_sha256 bytea, p_publication_date date, p_effective_from date, p_effective_to date, p_reviewed_by_user_id uuid, p_reviewed_at timestamptz, p_request_id uuid)',
            "uuid",
            f'''
DECLARE prior_id uuid; item jsonb; supplied_count integer; p_dataset_rows jsonb; affected_org uuid;
BEGIN
    IF p_request_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reference import request id is required'; END IF;
    p_dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
    prior_id:="{SCHEMA}"."stage_release"(p_release_id,'hsn_sac_tax',p_ruleset_version,
      p_source_authority,p_source_uri,p_source_storage_bucket,p_source_storage_object_path,
      p_source_media_type,p_source_bytes,p_source_sha256,p_dataset_storage_bucket,
      p_dataset_storage_object_path,p_dataset_bytes,p_dataset_sha256,p_publication_date,
      p_effective_from,p_effective_to,p_reviewed_by_user_id,p_reviewed_at);
    supplied_count:=pg_catalog.jsonb_array_length(p_dataset_rows);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_dataset_rows) AS row(value)
       WHERE pg_catalog.jsonb_typeof(value)<>'object'
          OR NOT value ?& ARRAY['id','code','code_kind','version_number','description','effective_from','effective_to',
              'taxability','default_supply_type','cgst_rate','sgst_rate','igst_rate','cess_rate']
          OR value - ARRAY['id','code','code_kind','version_number','description','effective_from','effective_to',
              'taxability','default_supply_type','cgst_rate','sgst_rate','igst_rate','cess_rate'] <> '{{}}'::jsonb
          OR value->>'code' !~ '^[0-9]{{4,8}}$'
          OR value->>'code_kind' NOT IN ('hsn','sac')
          OR value->>'taxability' NOT IN ('taxable','exempt','nil_rated','non_gst')
          OR value->>'default_supply_type' NOT IN ('goods','services')
          OR (value->>'version_number')::integer<=0
          OR (value->>'effective_from')::date<p_effective_from
          OR (p_effective_to IS NOT NULL AND COALESCE(NULLIF(value->>'effective_to','')::date,p_effective_to)>p_effective_to)
          OR (value->>'cgst_rate')::numeric<0 OR (value->>'sgst_rate')::numeric<0
          OR (value->>'igst_rate')::numeric<0 OR (value->>'cess_rate')::numeric<0
          OR (value->>'cgst_rate')::numeric+(value->>'sgst_rate')::numeric<>(value->>'igst_rate')::numeric
    ) OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(p_dataset_rows))<>supplied_count
      OR (SELECT count(DISTINCT (value->>'code',value->>'version_number')) FROM pg_catalog.jsonb_array_elements(p_dataset_rows))<>supplied_count THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='tax dataset is not the exact reviewed typed set';
    END IF;
    IF prior_id IS NOT NULL THEN
      UPDATE tax.tax_code_versions SET status='retired'
       WHERE release_id=prior_id AND status='active';
    END IF;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_dataset_rows) ORDER BY value->>'id' LOOP
      INSERT INTO tax.tax_code_versions(
        id,release_id,code,code_kind,version_number,description,effective_from,effective_to,taxability,
        default_supply_type,cgst_rate,sgst_rate,igst_rate,cess_rate,ruleset_version,status)
      VALUES((item->>'id')::uuid,p_release_id,item->>'code',item->>'code_kind',(item->>'version_number')::integer,
        item->>'description',(item->>'effective_from')::date,NULLIF(item->>'effective_to','')::date,
        item->>'taxability',item->>'default_supply_type',(item->>'cgst_rate')::numeric,
        (item->>'sgst_rate')::numeric,(item->>'igst_rate')::numeric,(item->>'cess_rate')::numeric,
        p_ruleset_version,'active');
    END LOOP;
    IF (SELECT count(*) FROM tax.tax_code_versions WHERE release_id=p_release_id)<>supplied_count THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tax exact-set count mismatch';
    END IF;
    IF prior_id IS NOT NULL THEN
      FOR affected_org IN
        SELECT DISTINCT product.org_id FROM catalog.products AS product
         WHERE product.status='active' AND NOT EXISTS (
           SELECT 1 FROM tax.tax_code_versions AS tax_version
            WHERE tax_version.release_id=p_release_id AND tax_version.status='active'
              AND tax_version.code_kind='hsn' AND tax_version.default_supply_type='goods'
              AND tax_version.code=product.hsn_code
              AND CURRENT_DATE BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date)
         )
      LOOP
        PERFORM pg_catalog.set_config('app.org_id',affected_org::text,true);
        PERFORM pg_catalog.set_config('app.membership_id','',true);
        PERFORM pg_catalog.set_config('app.request_id',p_request_id::text,true);
        UPDATE catalog.products AS product SET status='blocked',updated_at=pg_catalog.transaction_timestamp(),
               row_version=product.row_version+1
         WHERE product.org_id=affected_org AND product.status='active' AND NOT EXISTS (
           SELECT 1 FROM tax.tax_code_versions AS tax_version
            WHERE tax_version.release_id=p_release_id AND tax_version.status='active'
              AND tax_version.code_kind='hsn' AND tax_version.default_supply_type='goods'
              AND tax_version.code=product.hsn_code
              AND CURRENT_DATE BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date)
         );
      END LOOP;
    END IF;
    PERFORM "{SCHEMA}"."finish_release"(p_release_id,prior_id);
    RETURN p_release_id;
END
''',
            grants=("erp_regulatory_importer",),
        )
    ]


def _withholding_import() -> list[str]:
    fields = (
        "id", "rule_code", "version_number", "tax_regime", "governing_act_code", "provision_code",
        "fiscal_year_start_from", "fiscal_year_start_to", "effective_from", "effective_to",
        "deduction_trigger", "source_kind", "nature_code", "deductor_person_type",
        "deductee_person_type", "deductee_residency", "deductee_pan_status",
        "organization_prior_fy_turnover_threshold", "transaction_threshold", "aggregation_scope",
        "threshold_application", "basis_mode", "income_tax_rate", "cgst_rate", "sgst_rate",
        "igst_rate", "deposit_due_policy", "deposit_month_offset", "deposit_due_day",
        "statement_form_code", "certificate_form_code",
    )
    sql_fields = ",".join(f"'{field}'" for field in fields)
    return [
        *_function(
            '"import_withholding_release"(p_release_id uuid, p_ruleset_version varchar, p_source_authority text, p_source_uri text, p_source_storage_bucket text, p_source_storage_object_path text, p_source_media_type varchar, p_source_bytes bytea, p_source_sha256 bytea, p_dataset_storage_bucket text, p_dataset_storage_object_path text, p_dataset_bytes bytea, p_dataset_sha256 bytea, p_publication_date date, p_effective_from date, p_effective_to date, p_reviewed_by_user_id uuid, p_reviewed_at timestamptz, p_request_id uuid)',
            "uuid",
            f'''
DECLARE prior_id uuid; item jsonb; supplied_count integer; p_dataset_rows jsonb;
BEGIN
    IF p_request_id IS NULL
       OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM p_request_id THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='withholding import requires the matching transaction-local request id';
    END IF;
    p_dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
    prior_id:="{SCHEMA}"."stage_release"(p_release_id,'withholding_rules',p_ruleset_version,
      p_source_authority,p_source_uri,p_source_storage_bucket,p_source_storage_object_path,
      p_source_media_type,p_source_bytes,p_source_sha256,p_dataset_storage_bucket,
      p_dataset_storage_object_path,p_dataset_bytes,p_dataset_sha256,p_publication_date,
      p_effective_from,p_effective_to,p_reviewed_by_user_id,p_reviewed_at);
    supplied_count:=pg_catalog.jsonb_array_length(p_dataset_rows);
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_dataset_rows) AS row(value)
       WHERE pg_catalog.jsonb_typeof(value)<>'object'
          OR NOT value ?& ARRAY[{sql_fields}]
          OR value - ARRAY[{sql_fields}] <> '{{}}'::jsonb
          OR pg_catalog.btrim(value->>'rule_code')=''
          OR (value->>'version_number')::integer<=0
          OR value->>'tax_regime' NOT IN ('income_tax_tds','gst_tds')
          OR pg_catalog.btrim(value->>'governing_act_code')=''
          OR pg_catalog.btrim(value->>'provision_code')=''
          OR (value->>'fiscal_year_start_from')::integer NOT BETWEEN 2000 AND 9999
          OR (NULLIF(value->>'fiscal_year_start_to',''))::integer<(value->>'fiscal_year_start_from')::integer
          OR (value->>'effective_from')::date<p_effective_from
          OR (p_effective_to IS NOT NULL AND COALESCE(NULLIF(value->>'effective_to','')::date,p_effective_to)>p_effective_to)
          OR value->>'deduction_trigger' NOT IN ('credit','earlier_credit_or_payment')
          OR value->>'source_kind' NOT IN ('supplier_invoice','expense_claim')
          OR pg_catalog.btrim(value->>'nature_code')=''
          OR value->>'deductee_residency' NOT IN ('any','resident','non_resident')
          OR value->>'deductee_pan_status' NOT IN ('any','verified','inoperative','not_available','not_applicable')
          OR value->>'aggregation_scope' NOT IN ('party_rule_fiscal_year','contract')
          OR value->>'threshold_application' NOT IN ('excess_only','full_amount')
          OR value->>'basis_mode' NOT IN ('net_value','net_excluding_gst_cess','approved_amount')
          OR COALESCE(NULLIF(value->>'organization_prior_fy_turnover_threshold','')::numeric,0)<0
          OR (value->>'transaction_threshold')::numeric<0
          OR (value->>'income_tax_rate')::numeric<0 OR (value->>'cgst_rate')::numeric<0
          OR (value->>'sgst_rate')::numeric<0 OR (value->>'igst_rate')::numeric<0
          OR value->>'deposit_due_policy' NOT IN ('day_of_following_month','days_after_deduction','fixed_date_after_fy_end')
          OR (value->>'deposit_month_offset')::integer NOT BETWEEN 0 AND 24
          OR (value->>'deposit_due_day')::integer NOT BETWEEN 1 AND 31
    ) OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(p_dataset_rows))<>supplied_count
      OR (SELECT count(DISTINCT (value->>'rule_code',value->>'version_number')) FROM pg_catalog.jsonb_array_elements(p_dataset_rows))<>supplied_count
      OR EXISTS (
        SELECT 1
          FROM pg_catalog.jsonb_array_elements(p_dataset_rows) WITH ORDINALITY AS left_row(value,ordinality)
          JOIN pg_catalog.jsonb_array_elements(p_dataset_rows) WITH ORDINALITY AS right_row(value,ordinality)
            ON left_row.ordinality<right_row.ordinality
         WHERE left_row.value->>'rule_code'=right_row.value->>'rule_code'
           AND left_row.value->>'tax_regime'=right_row.value->>'tax_regime'
           AND left_row.value->>'source_kind'=right_row.value->>'source_kind'
           AND left_row.value->>'nature_code'=right_row.value->>'nature_code'
           AND left_row.value->>'deductor_person_type'=right_row.value->>'deductor_person_type'
           AND left_row.value->>'deductee_person_type'=right_row.value->>'deductee_person_type'
           AND left_row.value->>'deductee_residency'=right_row.value->>'deductee_residency'
           AND left_row.value->>'deductee_pan_status'=right_row.value->>'deductee_pan_status'
           AND (left_row.value->>'effective_from')::date<=COALESCE(NULLIF(right_row.value->>'effective_to','')::date,'infinity'::date)
           AND (right_row.value->>'effective_from')::date<=COALESCE(NULLIF(left_row.value->>'effective_to','')::date,'infinity'::date)
           AND (left_row.value->>'fiscal_year_start_from')::integer<=COALESCE(NULLIF(right_row.value->>'fiscal_year_start_to','')::integer,9999)
           AND (right_row.value->>'fiscal_year_start_from')::integer<=COALESCE(NULLIF(left_row.value->>'fiscal_year_start_to','')::integer,9999)
      ) THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='withholding dataset is not one exact non-overlapping reviewed typed set';
    END IF;
    IF prior_id IS NOT NULL THEN
      UPDATE tax.withholding_rule_versions SET status='retired'
       WHERE release_id=prior_id AND status='active';
    END IF;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_dataset_rows) ORDER BY value->>'id' LOOP
      INSERT INTO tax.withholding_rule_versions(
        id,release_id,rule_code,version_number,tax_regime,governing_act_code,provision_code,
        fiscal_year_start_from,fiscal_year_start_to,effective_from,effective_to,deduction_trigger,
        source_kind,nature_code,deductor_person_type,deductee_person_type,deductee_residency,
        deductee_pan_status,organization_prior_fy_turnover_threshold,transaction_threshold,
        aggregation_scope,threshold_application,basis_mode,income_tax_rate,cgst_rate,sgst_rate,
        igst_rate,deposit_due_policy,deposit_month_offset,deposit_due_day,statement_form_code,certificate_form_code,status)
      VALUES((item->>'id')::uuid,p_release_id,item->>'rule_code',(item->>'version_number')::integer,
        item->>'tax_regime',item->>'governing_act_code',item->>'provision_code',
        (item->>'fiscal_year_start_from')::smallint,NULLIF(item->>'fiscal_year_start_to','')::smallint,
        (item->>'effective_from')::date,NULLIF(item->>'effective_to','')::date,
        item->>'deduction_trigger',item->>'source_kind',item->>'nature_code',
        item->>'deductor_person_type',item->>'deductee_person_type',item->>'deductee_residency',
        item->>'deductee_pan_status',NULLIF(item->>'organization_prior_fy_turnover_threshold','')::numeric,
        (item->>'transaction_threshold')::numeric,item->>'aggregation_scope',
        item->>'threshold_application',item->>'basis_mode',(item->>'income_tax_rate')::numeric,
        (item->>'cgst_rate')::numeric,(item->>'sgst_rate')::numeric,(item->>'igst_rate')::numeric,
        item->>'deposit_due_policy',
        (item->>'deposit_month_offset')::smallint,(item->>'deposit_due_day')::smallint,
        item->>'statement_form_code',item->>'certificate_form_code','active');
    END LOOP;
    IF (SELECT count(*) FROM tax.withholding_rule_versions WHERE release_id=p_release_id)<>supplied_count THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='withholding exact-set count mismatch';
    END IF;
    PERFORM "{SCHEMA}"."finish_release"(p_release_id,prior_id);
    RETURN p_release_id;
END
''',
            grants=("erp_regulatory_importer",),
        )
    ]


def _regulated_rule_import(
    *,
    table: str,
    dataset_kind: str,
    function_name: str,
    fields: tuple[tuple[str, str, bool], ...],
    dimensions: tuple[str, ...],
) -> list[str]:
    schema, relation = table.split(".")
    field_names = tuple(name for name, _, _ in fields)
    exact_fields = ",".join(f"'{name}'" for name in field_names)
    immutable = ",".join(f"NEW.{name}" for name in ("id", "release_id", *field_names[1:], "created_at"))
    old_immutable = ",".join(f"OLD.{name}" for name in ("id", "release_id", *field_names[1:], "created_at"))
    insert_columns = ",".join(("id", "release_id", *field_names[1:], "status"))

    def expression(name: str, sql_type: str, nullable: bool) -> str:
        value = f"item->>'{name}'"
        if sql_type in {"text", "varchar(32)", "varchar(64)"}:
            return f"NULLIF({value},'')" if nullable else value
        cast = sql_type
        return f"NULLIF({value},'')::{cast}" if nullable else f"({value})::{cast}"

    insert_values = ",".join(
        ["(item->>'id')::uuid", "p_release_id"]
        + [expression(name, sql_type, nullable) for name, sql_type, nullable in fields[1:]]
        + ["'active'"]
    )
    dimension_match = " AND ".join(
        f"left_row.value->>'{name}'=right_row.value->>'{name}'" for name in dimensions
    )
    guard_name = f"guard_{relation[:-1] if relation.endswith('s') else relation}"
    return [
        *_function(
            f'"{guard_name}"()',
            "trigger",
            f'''
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NOT "{SCHEMA}"."scope_active"('reference_import',NEW.release_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='{relation} requires verified exact-set import provenance';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='deployed {relation} rows are retained'; END IF;
  IF ROW({immutable}) IS DISTINCT FROM ROW({old_immutable})
     OR OLD.status<>'active' OR NEW.status<>'retired'
     OR NOT "{SCHEMA}"."scope_active"('reference_import',OLD.release_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='{relation} authority is immutable';
  END IF;
  RETURN NEW;
END
''',
        ),
        _trigger(f"{relation}_release_guard", "INSERT OR UPDATE OR DELETE", table, guard_name),
        *_function(
            f'"{function_name}"(p_release_id uuid, p_ruleset_version varchar, p_source_authority text, p_source_uri text, p_source_storage_bucket text, p_source_storage_object_path text, p_source_media_type varchar, p_source_bytes bytea, p_source_sha256 bytea, p_dataset_storage_bucket text, p_dataset_storage_object_path text, p_dataset_bytes bytea, p_dataset_sha256 bytea, p_publication_date date, p_effective_from date, p_effective_to date, p_reviewed_by_user_id uuid, p_reviewed_at timestamptz, p_request_id uuid)',
            "uuid",
            f'''
DECLARE prior_id uuid; item jsonb; supplied_count integer; dataset_rows jsonb;
BEGIN
  IF p_request_id IS NULL OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM p_request_id THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='{dataset_kind} import requires matching transaction-local request id';
  END IF;
  dataset_rows:=pg_catalog.convert_from(p_dataset_bytes,'UTF8')::jsonb;
  prior_id:="{SCHEMA}"."stage_release"(p_release_id,'{dataset_kind}',p_ruleset_version,
    p_source_authority,p_source_uri,p_source_storage_bucket,p_source_storage_object_path,
    p_source_media_type,p_source_bytes,p_source_sha256,p_dataset_storage_bucket,
    p_dataset_storage_object_path,p_dataset_bytes,p_dataset_sha256,p_publication_date,
    p_effective_from,p_effective_to,p_reviewed_by_user_id,p_reviewed_at);
  supplied_count:=pg_catalog.jsonb_array_length(dataset_rows);
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(dataset_rows) AS row(value)
     WHERE pg_catalog.jsonb_typeof(value)<>'object'
        OR NOT value ?& ARRAY[{exact_fields}]
        OR value - ARRAY[{exact_fields}] <> '{{}}'::jsonb
        OR pg_catalog.btrim(value->>'rule_code')=''
        OR pg_catalog.btrim(value->>'rule_version')=''
        OR (value->>'effective_from')::date<p_effective_from
        OR (p_effective_to IS NOT NULL AND COALESCE(NULLIF(value->>'effective_to','')::date,p_effective_to)>p_effective_to)
  ) OR (SELECT count(DISTINCT value->>'id') FROM pg_catalog.jsonb_array_elements(dataset_rows))<>supplied_count
    OR (SELECT count(DISTINCT (value->>'rule_code',value->>'rule_version')) FROM pg_catalog.jsonb_array_elements(dataset_rows))<>supplied_count
    OR EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(dataset_rows) WITH ORDINALITY AS left_row(value,ordinality)
        JOIN pg_catalog.jsonb_array_elements(dataset_rows) WITH ORDINALITY AS right_row(value,ordinality)
          ON left_row.ordinality<right_row.ordinality
       WHERE {dimension_match}
         AND (left_row.value->>'effective_from')::date<=COALESCE(NULLIF(right_row.value->>'effective_to','')::date,'infinity'::date)
         AND (right_row.value->>'effective_from')::date<=COALESCE(NULLIF(left_row.value->>'effective_to','')::date,'infinity'::date)
    ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='{dataset_kind} dataset is not one exact non-overlapping typed set';
  END IF;
  IF prior_id IS NOT NULL THEN UPDATE {table} SET status='retired' WHERE release_id=prior_id AND status='active'; END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(dataset_rows) ORDER BY value->>'id' LOOP
    INSERT INTO {table}({insert_columns}) VALUES({insert_values});
  END LOOP;
  IF (SELECT count(*) FROM {table} WHERE release_id=p_release_id)<>supplied_count THEN
    RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='{dataset_kind} exact-set count mismatch';
  END IF;
  PERFORM "{SCHEMA}"."finish_release"(p_release_id,prior_id);
  RETURN p_release_id;
END
''',
            grants=("erp_regulatory_importer",),
        ),
    ]


def _activation() -> list[str]:
    return [
        *_function(
            '"activate_product"(organization_id uuid, product_id uuid, expected_row_version bigint, manufacturer_traceability_code varchar, idempotency_key_hash bytea, expires_at timestamptz)',
            "uuid",
            f'''
DECLARE actor_id uuid; product catalog.products%ROWTYPE; tax_version tax.tax_code_versions%ROWTYPE;
        ingredient_release core.reference_data_releases%ROWTYPE; tax_release core.reference_data_releases%ROWTYPE;
        composition_count integer; classified_count integer; release_count integer; max_schedule integer;
        derived_schedule text; derived_ndps boolean; derived_h2 date; claim core.idempotency_keys%ROWTYPE;
        request_document jsonb; response_document jsonb;
BEGIN
    actor_id:=erp_security.current_membership_id();
    IF organization_id IS DISTINCT FROM erp_security.current_org_id() OR actor_id IS NULL
       OR NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS NULL
       OR NOT erp_security.has_permission('catalog.product.manage',NULL::uuid) THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='product activation context or permission is invalid';
    END IF;
    request_document:=pg_catalog.jsonb_build_object(
      'expected_row_version',expected_row_version,'manufacturer_traceability_code',manufacturer_traceability_code,
      'product_id',product_id);
    claim:="erp_core_commands"."claim"(organization_id,actor_id,'catalog.product.activate',
      idempotency_key_hash,request_document,expires_at);
    IF claim.status='succeeded' THEN
      IF claim.resource_type<>'catalog.products' OR claim.resource_id IS DISTINCT FROM product_id THEN
        RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='activation idempotency key belongs to another resource';
      END IF;
      RETURN product_id;
    END IF;
    SELECT * INTO product FROM catalog.products
     WHERE org_id=organization_id AND id=product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='product not found'; END IF;
    IF product.row_version<>expected_row_version OR product.status NOT IN ('draft','blocked') THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='product is not an activatable expected version';
    END IF;
    IF product.product_kind<>'medicine' THEN
      IF product.manufacturer_party_id IS NULL
         OR COALESCE(product.drug_schedule,'NONE')<>'NONE'
         OR COALESCE(product.requires_prescription,false)
         OR COALESCE(product.ndps_regulated,false)
         OR product.schedule_h2_applicable_from IS NOT NULL
         OR product.traceability_product_code IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-medicine activation has medicine-only regulatory facts or lacks a manufacturer';
      END IF;
      SELECT * INTO tax_version FROM tax.tax_code_versions
       WHERE status='active' AND code_kind='hsn'
         AND default_supply_type='goods' AND code=product.hsn_code
         AND CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date)
       FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-medicine HSN tax version is not active, effective or product-matched';
      END IF;
      SELECT * INTO tax_release FROM core.reference_data_releases
       WHERE id=tax_version.release_id AND dataset_kind='hsn_sac_tax' AND status='active'
         AND CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date)
       FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='non-medicine HSN lacks an active effective reviewed release';
      END IF;
      INSERT INTO "{SCHEMA}"."command_scopes" VALUES
        (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'product_activation',product_id);
      UPDATE catalog.products SET
        drug_schedule='NONE',requires_prescription=false,ndps_regulated=false,
        regulatory_ruleset_version=tax_release.ruleset_version,
        schedule_h2_applicable_from=NULL,traceability_product_code=NULL,
        hsn_release_id=tax_release.id,status='active',updated_at=pg_catalog.transaction_timestamp(),
        updated_by_membership_id=actor_id,row_version=row_version+1
       WHERE org_id=organization_id AND id=product_id AND row_version=expected_row_version;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='non-medicine product changed before activation';
      END IF;
      DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
        AND transaction_id=pg_catalog.txid_current() AND scope='product_activation' AND target_id=product_id;
      response_document:=pg_catalog.jsonb_build_object(
        'product_id',product_id,'row_version',expected_row_version+1,
        'ingredient_ruleset_version',NULL,
        'tax_ruleset_version',tax_release.ruleset_version,'tax_code_version_id',tax_version.id);
      PERFORM "erp_core_commands"."finish_claim"(organization_id,claim.id,'catalog.products',product_id,response_document);
      RETURN product_id;
    END IF;
    PERFORM "{SCHEMA}"."assert_reference_readiness"(CURRENT_DATE);
    IF product.manufacturer_party_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='medicine activation requires an identified manufacturer';
    END IF;
    SELECT count(*),count(ingredient.id),count(DISTINCT ingredient.release_id),
           max(CASE ingredient.drugs_rules_schedule WHEN 'X' THEN 4 WHEN 'H1' THEN 3 WHEN 'H' THEN 2 WHEN 'G' THEN 1 ELSE 0 END),
           bool_or(ingredient.ndps_classification<>'NONE'),min(ingredient.schedule_h2_applicable_from)
      INTO composition_count,classified_count,release_count,max_schedule,derived_ndps,derived_h2
      FROM catalog.product_ingredients AS composition
      LEFT JOIN catalog.ingredients AS ingredient
        ON ingredient.id=composition.ingredient_id AND ingredient.status='active'
       AND CURRENT_DATE BETWEEN ingredient.effective_from AND COALESCE(ingredient.effective_to,'infinity'::date)
     WHERE composition.org_id=organization_id AND composition.product_id=product_id
       AND composition.status='active'
       AND CURRENT_DATE BETWEEN composition.valid_from AND COALESCE(composition.valid_until,'infinity'::date);
    IF composition_count=0 OR classified_count<>composition_count OR release_count<>1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='medicine composition lacks one complete effective reviewed ingredient release';
    END IF;
    SELECT release.* INTO ingredient_release FROM core.reference_data_releases AS release
      JOIN catalog.product_ingredients AS composition ON composition.org_id=organization_id AND composition.product_id=product_id
      JOIN catalog.ingredients AS ingredient ON ingredient.id=composition.ingredient_id AND ingredient.release_id=release.id
     WHERE release.dataset_kind='ingredient_classification' AND release.status='active'
       AND CURRENT_DATE BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
     LIMIT 1 FOR SHARE OF release;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='ingredient ruleset is not the active effective reviewed release'; END IF;
    derived_schedule:=CASE max_schedule WHEN 4 THEN 'X' WHEN 3 THEN 'H1' WHEN 2 THEN 'H' WHEN 1 THEN 'G' ELSE 'NONE' END;
    SELECT * INTO tax_version FROM tax.tax_code_versions
     WHERE status='active' AND code_kind='hsn'
       AND default_supply_type='goods' AND code=product.hsn_code
       AND CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date)
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='selected HSN tax version is not active, effective or product-matched'; END IF;
    SELECT * INTO tax_release FROM core.reference_data_releases
     WHERE id=tax_version.release_id AND dataset_kind='hsn_sac_tax' AND status='active'
       AND CURRENT_DATE BETWEEN effective_from AND COALESCE(effective_to,'infinity'::date)
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='tax version lacks an active effective reviewed release'; END IF;
    IF derived_h2 IS NOT NULL AND derived_h2<=CURRENT_DATE
       AND pg_catalog.btrim(COALESCE(manufacturer_traceability_code,product.traceability_product_code,''))='' THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='effective Schedule H2 product lacks manufacturer traceability code';
    END IF;
    INSERT INTO "{SCHEMA}"."command_scopes" VALUES
      (pg_catalog.pg_backend_pid(),pg_catalog.txid_current(),'product_activation',product_id);
    UPDATE catalog.products SET
      drug_schedule=derived_schedule,requires_prescription=derived_schedule IN ('H','H1','X'),
      ndps_regulated=COALESCE(derived_ndps,false),regulatory_ruleset_version=ingredient_release.ruleset_version,
      schedule_h2_applicable_from=derived_h2,
      traceability_product_code=COALESCE(NULLIF(pg_catalog.btrim(manufacturer_traceability_code),''),traceability_product_code),
      hsn_release_id=tax_release.id,status='active',updated_at=pg_catalog.transaction_timestamp(),
      updated_by_membership_id=actor_id,row_version=row_version+1
     WHERE org_id=organization_id AND id=product_id AND row_version=expected_row_version;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='product changed before activation'; END IF;
    DELETE FROM "{SCHEMA}"."command_scopes" WHERE backend_pid=pg_catalog.pg_backend_pid()
      AND transaction_id=pg_catalog.txid_current() AND scope='product_activation' AND target_id=product_id;
    response_document:=pg_catalog.jsonb_build_object(
      'product_id',product_id,'row_version',expected_row_version+1,
      'ingredient_ruleset_version',ingredient_release.ruleset_version,
      'tax_ruleset_version',tax_release.ruleset_version,'tax_code_version_id',tax_version.id);
    PERFORM "erp_core_commands"."finish_claim"(organization_id,claim.id,'catalog.products',product_id,response_document);
    RETURN product_id;
END
''',
            grants=("erp_app",),
        )
    ]


def _definitions() -> dict[str, list[str]]:
    return {
        "core.reference_data_releases:reference_data_release_import": [
            *_setup(), *_release_helpers(), *_ingredient_import(), *_tax_import(),
            *_activation()
        ],
        "catalog.ingredients:ingredient_reference_release": [
            'COMMENT ON TABLE "catalog"."ingredients" IS \'Imported only through erp_regulatory_commands exact-set release authority\''
        ],
        "catalog.products:products_regulatory_classification": [
            'COMMENT ON COLUMN "catalog"."products"."regulatory_ruleset_version" IS \'Derived by the reviewed activation command; never selected by a client or MCP model\''
        ],
        "tax.tax_code_versions:tax_code_versions_release_authority": [
            'COMMENT ON TABLE "tax"."tax_code_versions" IS \'Imported only through erp_regulatory_commands exact-set release authority\''
        ],
        "tax.withholding_rule_versions:withholding_rule_versions_release_authority": [
            *_withholding_import(),
            'COMMENT ON TABLE "tax"."withholding_rule_versions" IS \'Imported only through erp_regulatory_commands exact-set release authority\''
        ],
        "compliance.controlled_movement_rule_versions:controlled_movement_rule_versions_release_authority": [
            *_regulated_rule_import(
                table="compliance.controlled_movement_rule_versions",
                dataset_kind="controlled_movement_rules",
                function_name="import_controlled_movement_release",
                fields=(
                    ("id", "uuid", False), ("rule_code", "varchar(64)", False),
                    ("rule_version", "varchar(32)", False), ("drug_schedule", "text", False),
                    ("ndps_scope", "text", False), ("entry_type", "text", False),
                    ("organization_license_type_code", "varchar(64)", False),
                    ("counterparty_required", "boolean", False),
                    ("counterparty_license_type_code", "varchar(64)", True),
                    ("prescription_evidence_required", "boolean", False),
                    ("authority_document_required", "boolean", False),
                    ("effective_from", "date", False), ("effective_to", "date", True),
                ),
                dimensions=("drug_schedule", "ndps_scope", "entry_type"),
            ),
            'COMMENT ON TABLE "compliance"."controlled_movement_rule_versions" IS \'Imported only through erp_regulatory_commands exact-set release authority\'',
        ],
        "tax.einvoice_rule_versions:einvoice_rule_versions_release_authority": [
            *_regulated_rule_import(
                table="tax.einvoice_rule_versions", dataset_kind="einvoice_rules",
                function_name="import_einvoice_rule_release",
                fields=(
                    ("id", "uuid", False), ("rule_code", "varchar(64)", False),
                    ("rule_version", "varchar(32)", False),
                    ("organization_person_type", "varchar(32)", False),
                    ("organization_exemption_code", "varchar(64)", False),
                    ("registration_type", "text", False), ("document_class", "text", False),
                    ("supply_scope", "text", False), ("minimum_prior_fy_turnover", "numeric", False),
                    ("reporting_window_days", "integer", True),
                    ("effective_from", "date", False), ("effective_to", "date", True),
                ),
                dimensions=("organization_person_type", "organization_exemption_code", "registration_type", "document_class", "supply_scope"),
            ),
            'COMMENT ON TABLE "tax"."einvoice_rule_versions" IS \'Imported only through erp_regulatory_commands exact-set release authority\'',
        ],
        "tax.gst_adjustment_rule_versions:gst_adjustment_rule_versions_release_authority": [
            *_regulated_rule_import(
                table="tax.gst_adjustment_rule_versions", dataset_kind="gst_adjustment_rules",
                function_name="import_gst_adjustment_rule_release",
                fields=(
                    ("id", "uuid", False), ("rule_code", "varchar(64)", False),
                    ("rule_version", "varchar(32)", False), ("side", "text", False),
                    ("direction", "text", False), ("document_effect", "text", False),
                    ("reason_code", "varchar(64)", False), ("deadline_policy", "text", False),
                    ("deadline_days", "integer", True), ("portal_evidence_required", "boolean", False),
                    ("tax_effect", "text", False), ("effective_from", "date", False),
                    ("effective_to", "date", True),
                ),
                dimensions=("side", "direction", "document_effect", "reason_code", "tax_effect"),
            ),
            'COMMENT ON TABLE "tax"."gst_adjustment_rule_versions" IS \'Imported only through erp_regulatory_commands exact-set release authority\'',
        ],
    }


def generated_artifacts() -> tuple[str, str]:
    invariants = _invariants()
    definitions = _definitions()
    if set(definitions) != REVIEW_KEYS:
        raise ContractError("regulatory definitions do not exactly cover the reviewed invariant set")
    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append({
            "enforcement": invariant["enforcement"],
            "invariant": invariant["invariant"],
            "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
            "reviewed": True,
            "statements": definitions[key],
            "table": invariant["table"],
        })
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    prior_product_blocked = "catalog.products:products_regulatory_classification" in source["blocked_invariants"]
    if not prior_product_blocked:
        raise ContractError("core command product regulatory blocker is no longer present")
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "catalog_sha256": _catalog_hash(),
        "source_manifest": "../commands_core/core-commands-manifest.json",
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(REVIEW_KEYS),
        "resolved_invariants": sorted(REVIEW_KEYS),
        "blocker_delta": {
            "current_catalog_before_mapping": 8,
            "current_catalog_resolved": 8,
            "current_catalog_after_mapping": 0,
            "pre_correction_global_net": -1,
        },
        "regulated_seed_status": {
            "population_mode": "regulated_import",
            "empty_baseline_tables": [
                "core.reference_data_releases",
                "catalog.ingredients",
                "tax.tax_code_versions",
                "tax.withholding_rule_versions",
                "compliance.controlled_movement_rule_versions",
                "tax.einvoice_rule_versions",
                "tax.gst_adjustment_rule_versions",
            ],
            "baseline_seed_blockers_removed": 7,
            "operational_readiness": "blocked_until_active_official_reviewed_releases_are_imported",
        },
        "security": {
            "import_principal": "erp_regulatory_importer LOGIN NOINHERIT NOBYPASSRLS",
            "importer_functions": ["import_ingredient_release", "import_tax_release", "import_withholding_release", "import_controlled_movement_release", "import_einvoice_rule_release", "import_gst_adjustment_rule_release"],
            "runtime_functions": ["activate_product"],
            "mcp_functions": [],
            "session_user_attestation": True,
            "fixed_empty_search_path": True,
            "dynamic_sql": False,
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    check = argv is not None and "--check" in argv
    mapping, manifest = generated_artifacts()
    if check:
        return 0 if MAPPING_PATH.read_text() == mapping and MANIFEST_PATH.read_text() == manifest else 1
    MAPPING_PATH.write_text(mapping, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
