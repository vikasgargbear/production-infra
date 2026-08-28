from __future__ import annotations

import hashlib
import inspect
import json
from pathlib import Path

from app.api.routes import canonical_reference_reads


ROOT = Path(__file__).resolve().parents[3]
SQL_PATH = ROOT / "backend/alembic/sql/20260825_0013_gst_jurisdiction_authority.sql"
MANIFEST_PATH = SQL_PATH.with_suffix(".manifest.json")
REVISION_PATH = ROOT / "backend/alembic/versions/20260825_0013_gst_jurisdiction_authority.py"


def test_gst_jurisdiction_migration_is_hash_bound_and_linear() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    revision = REVISION_PATH.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    digest = hashlib.sha256(sql.encode("utf-8")).hexdigest()

    assert manifest["revision"] == "20260825_0013"
    assert manifest["source_sql_sha256"] == digest
    assert manifest["record_count"] == 39
    assert 'revision = "20260825_0013"' in revision
    assert 'down_revision = "20260825_0012"' in revision
    assert digest in revision
    assert "CanonicalBaselineError" in revision.split("def downgrade", 1)[1]
    assert "SET LOCAL ROLE erp_migration_owner" in sql


def test_catalog_is_source_bound_effective_and_has_no_application_map() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    assert "source_uri text NOT NULL" in sql
    assert "authority_catalog_uri text NOT NULL" in sql
    assert "source_publication_date date NOT NULL" in sql
    assert "source_retrieved_at timestamptz NOT NULL" in sql
    assert "source_document_sha256 bytea NOT NULL" in sql
    assert "dataset_sha256 bytea NOT NULL" in sql
    assert "source_record_sha256 bytea NOT NULL" in sql
    assert "effective_from date NOT NULL" in sql
    assert "effective_to date" in sql
    assert len(manifest["official_sources"]) == 2
    assert all(source["uri"].startswith("https://") for source in manifest["official_sources"])
    assert all(
        source["authority_catalog_uri"].startswith("https://")
        for source in manifest["official_sources"]
    )
    assert all(len(source["sha256"]) == 64 for source in manifest["official_sources"])

    frontend_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (
            ROOT / "frontend/src/services/api/modules/master/gstJurisdictions.api.ts",
            ROOT / "frontend/src/components/global/ui/forms/GSTJurisdictionSelect.tsx",
        )
    )
    assert "Maharashtra" not in frontend_sources
    assert "gstJurisdictionsApi.list" in frontend_sources


def test_special_codes_are_context_restricted() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    policy = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))["special_code_policy"]

    assert set(policy) == {"96", "97", "99"}
    assert "p_code='96'" in sql and "('export','import')" in sql
    assert "p_supply_type IS NULL" in sql
    assert "p_code='97'" in sql and "p_supply_type IS DISTINCT FROM 'inter_state'" in sql
    assert "p_usage IN ('place_of_supply','portal_place_of_supply')" in sql
    assert "jurisdiction_code='99'" in sql
    special_99 = sql.split("jurisdiction_code='99'", 1)[1].split(
        "OR jurisdiction_code NOT IN", 1
    )[0]
    assert "supports_gstin_registration" in special_99
    assert "NOT supports_place_of_supply" in special_99
    special_96 = sql.split("jurisdiction_code='96'", 1)[1].split(
        "OR (jurisdiction_code='97'", 1
    )[0]
    assert "NOT supports_domestic_address" in special_96
    assert "NOT supports_gstin_registration" in special_96


def test_every_state_bearing_canonical_table_has_database_enforcement() -> None:
    sql = SQL_PATH.read_text(encoding="utf-8")
    for table in (
        "core.organizations",
        "core.branches",
        "parties.addresses",
        "parties.tax_registrations",
        "tax.registrations",
        "sales.invoices",
        "procurement.supplier_invoices",
        "tax.documents",
        "tax.portal_document_lines",
        "sales.dispatches",
        "inventory.inventory_documents",
    ):
        assert table in sql
    # One catalog-version FK plus thirteen state-bearing business columns.
    assert sql.count("REFERENCES tax.gst_jurisdictions(code)") == 14
    assert sql.count("gst_jurisdiction_bt BEFORE") == 11
    assert "existing row violates canonical GST jurisdiction authority" in sql


def test_reference_api_is_read_only_effective_and_server_clocked() -> None:
    paths = {route.path for route in canonical_reference_reads.router.routes}
    assert paths == {"/canonical/reference/gst-jurisdictions"}
    source = inspect.getsource(canonical_reference_reads.canonical_gst_jurisdictions)
    assert "transaction_timestamp() AT TIME ZONE organization.timezone" in source
    assert "tax.gst_jurisdiction_versions" in source
    assert "tax.gst_jurisdiction_releases" in source
    assert "source_document_sha256" in source
    assert "PermissionChecker()" in source
    assert "INSERT" not in source and "UPDATE" not in source and "DELETE" not in source
