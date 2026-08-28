#!/usr/bin/env python3
"""Render the reviewed product-setup command boundary and search indexes."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/master/product_setup_commands.sql"
OUTPUT = ROOT / "backend/alembic/sql/20260828_0049_canonical_product_setup.sql"


# Revision 0049 remains reproducible after the canonical operation source moved
# forward in 0051. This is the exact activation wrapper body reviewed in 0049.
LEGACY_ACTIVATION_WRAPPER = """CREATE FUNCTION erp_master_commands.activate_configured_product(
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
BEGIN
  missing:=erp_master_commands.product_setup_missing_fields(
    organization_id,product_identifier,
    erp_core_commands.current_organization_business_date()
  );
  IF pg_catalog.cardinality(missing)>0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='product setup is incomplete: '||pg_catalog.array_to_string(missing,', ');
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM core.idempotency_keys claim
     WHERE claim.org_id=organization_id
       AND claim.operation='catalog.product.activate'
       AND claim.idempotency_key_hash=idempotency_key_hash
       AND claim.status='succeeded'
       AND claim.resource_type='catalog.products'
       AND claim.resource_id=product_identifier
  ) INTO was_replayed;
  PERFORM erp_regulatory_commands.activate_product(
    organization_id,product_identifier,expected_row_version,
    manufacturer_traceability_code,idempotency_key_hash,expires_at
  );
  RETURN QUERY SELECT product.id,product.sku,product.name,product.row_version,was_replayed
    FROM catalog.products product
   WHERE product.org_id=organization_id AND product.id=product_identifier
     AND product.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='activated product readback is unavailable';
  END IF;
END
$function$;"""


def render() -> str:
    command_sql = SOURCE.read_text(encoding="utf-8")
    start = command_sql.index(
        "CREATE OR REPLACE FUNCTION erp_master_commands.activate_configured_product("
    )
    end = command_sql.index(
        "\nALTER FUNCTION erp_master_commands.product_setup_missing_fields", start
    )
    command_sql = (
        command_sql[:start]
        + LEGACY_ACTIVATION_WRAPPER
        + "\n"
        + command_sql[end:]
    ).rstrip()
    return f"""SET LOCAL ROLE erp_migration_owner;

-- Countable pharmacy packaging units are controlled global vocabulary.  They
-- carry no tax, regulatory, pricing or stock fact.
INSERT INTO catalog.units_of_measure(code,name,symbol,dimension,decimal_places,status)
VALUES
  ('BX','Box','box','count',3,'active'),
  ('STRIP','Strip','strip','count',3,'active'),
  ('BTL','Bottle','btl','count',3,'active'),
  ('VIAL','Vial','vial','count',3,'active'),
  ('AMP','Ampoule','amp','count',3,'active'),
  ('TUBE','Tube','tube','count',3,'active'),
  ('SACH','Sachet','sachet','count',3,'active'),
  ('JAR','Jar','jar','count',3,'active');

-- Prefix and full-text paths keep tenant product search index-backed.  Exact
-- code/GTIN matches remain the highest-ranked application results.
CREATE INDEX products_search_name_lower_idx
  ON catalog.products(org_id,(pg_catalog.lower(name)) text_pattern_ops,id)
  WHERE status IN ('draft','active','blocked');
CREATE INDEX products_search_generic_lower_idx
  ON catalog.products(org_id,(pg_catalog.lower(generic_name)) text_pattern_ops,id)
  WHERE generic_name IS NOT NULL AND status IN ('draft','active','blocked');
CREATE INDEX products_search_document_idx
  ON catalog.products USING gin (
    pg_catalog.to_tsvector(
      'simple'::pg_catalog.regconfig,
      COALESCE(sku,'')||' '||COALESCE(name,'')||' '||
      COALESCE(generic_name,'')||' '||COALESCE(gtin,'')
    )
  ) WHERE status IN ('draft','active','blocked');
CREATE INDEX parties_search_name_lower_idx
  ON parties.parties(org_id,(pg_catalog.lower(legal_name)) text_pattern_ops,id)
  WHERE status='active';
CREATE INDEX parties_search_document_idx
  ON parties.parties USING gin (
    pg_catalog.to_tsvector(
      'simple'::pg_catalog.regconfig,
      COALESCE(legal_name,'')||' '||COALESCE(trade_name,'')
    )
  ) WHERE status IN ('active','blocked');
CREATE INDEX tax_code_versions_search_description_idx
  ON tax.tax_code_versions USING gin (
    pg_catalog.to_tsvector('simple'::pg_catalog.regconfig,description)
  ) WHERE status='active' AND code_kind='hsn' AND default_supply_type='goods';

{command_sql}

RESET ROLE;
"""


if __name__ == "__main__":
    rendered = render()
    if sys.argv[1:] == ["--write"]:
        OUTPUT.write_text(rendered, encoding="utf-8")
    elif sys.argv[1:]:
        raise SystemExit("usage: generate_canonical_product_setup_migration.py [--write]")
    else:
        print(rendered, end="")
