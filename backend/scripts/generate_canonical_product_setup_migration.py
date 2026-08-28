#!/usr/bin/env python3
"""Render the reviewed product-setup command boundary and search indexes."""

from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "database/canonical/operations/master/product_setup_commands.sql"
OUTPUT = ROOT / "backend/alembic/sql/20260828_0049_canonical_product_setup.sql"


def render() -> str:
    command_sql = SOURCE.read_text(encoding="utf-8").rstrip()
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
      pg_catalog.coalesce(sku,'')||' '||pg_catalog.coalesce(name,'')||' '||
      pg_catalog.coalesce(generic_name,'')||' '||pg_catalog.coalesce(gtin,'')
    )
  ) WHERE status IN ('draft','active','blocked');
CREATE INDEX parties_search_name_lower_idx
  ON parties.parties(org_id,(pg_catalog.lower(legal_name)) text_pattern_ops,id)
  WHERE status='active';
CREATE INDEX parties_search_document_idx
  ON parties.parties USING gin (
    pg_catalog.to_tsvector(
      'simple'::pg_catalog.regconfig,
      pg_catalog.coalesce(legal_name,'')||' '||pg_catalog.coalesce(trade_name,'')
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
