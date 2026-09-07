"""Exercise committed migration recovery against an explicitly disposable local PG15 DB."""

import importlib.util
import os
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlparse

import psycopg2
from sqlalchemy import create_engine, text

from scripts import apply_reviewed_historical_inventory as operator


def main():
    url = os.environ["DATABASE_URL"]
    parsed = urlparse(url)
    if (os.environ.get("CANONICAL_CI_ALLOW_DISPOSABLE") != "1"
            or parsed.hostname not in {"127.0.0.1", "localhost"}
            or parsed.path != "/canonical_alembic_ci"):
        raise RuntimeError("This rehearsal requires the disposable local canonical_alembic_ci database")
    spec = importlib.util.spec_from_file_location(
        "migration_inventory_fixture",
        Path(__file__).with_name("check_historical_product_inventory_cutover_runtime_role.py"),
    )
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    engine = create_engine(url)
    with engine.begin() as connection:
        fixture.fixture._seed(connection)
        fixture._seed_cutover_authority(connection)
        connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
        connection.execute(text(
            "INSERT INTO core.settings(org_id,id,scope_kind,namespace,key,value_type,value_text,status,"
            "created_by_membership_id,updated_by_membership_id) VALUES "
            "(:org,gen_random_uuid(),'organization','finance.account_roles','accounts_receivable','text',:ar,'active',:member,:member),"
            "(:org,gen_random_uuid(),'organization','finance.account_roles','accounts_payable','text',:ap,'active',:member,:member)"
        ), {"org": fixture.fixture.ORG_A, "member": fixture.fixture.MEMBER_A,
            "ar": str(fixture.fixture.RECEIVABLE_A), "ap": str(fixture.fixture.PAYABLE_A)})
        connection.exec_driver_sql("RESET ROLE")
    org = fixture.fixture.ORG_A
    dataset = "marg-whole-run-recovery-v1"
    product = {
        "source_kind": "product", "record_key": "product:P1", "product_code": "P1",
        "product_name": "CODEX-E2E migration recovery medicine", "quantity": "1.250000",
        "inventory_value": "125.00", "event_date": "2026-08-01", "selection_state": "reviewed",
        "payload": {"source_product_code": "P1", "source_company": "Observed manufacturer",
                    "product_kind": "medicine", "base_uom_code": "PCS", "hsn_code": "99119999",
                    "gst_rate": "12.000000", "hsn_gst_candidate_unique": True,
                    "batch_reconciliation_status": "exact"},
    }
    batch = {
        "source_kind": "batch", "record_key": "batch:P1:B1", "product_code": "P1",
        "product_name": product["product_name"], "batch_number": "B1", "quantity": "1.250000",
        "inventory_value": "125.00", "event_date": "2028-08-01", "selection_state": "reviewed",
        "payload": {"mrp": "120.00", "unit_cost": "100.00", "base_uom_code": "PCS",
                    "mrp_uom_code": "PCS", "mrp_uom_multiplier": "1.000000"},
    }
    value = {"organization_id": org, "branch_id": fixture.BRANCH,
             "location_id": fixture.LOCATION, "user_id": fixture.fixture.USER_A,
             "dataset_id": dataset}
    value["migration_bundle"] = {
        "schema_version": "aasopharma.marg-migration.v1", **value,
        "import_requests": [{"dataset_id": dataset, "branch_id": str(fixture.BRANCH),
                             "confirmation": f"IMPORT-HISTORY:{org}:{dataset}", "facts": [row]}
                            for row in [product, batch]],
    }

    def attest_local(cursor):
        # Production attestation requires Supabase's postgres/SSL connection. Only
        # replace that environment check; every role, command, and transaction is real.
        cursor.execute("SELECT current_user,current_database(),current_setting('server_version_num')")
        user, database, version = cursor.fetchone()
        assert user == "postgres" and database == "canonical_alembic_ci" and version.startswith("15")

    original_import = operator._import_batch

    def interrupted_import(cursor, batch_value):
        result = original_import(cursor, batch_value)
        if batch_value["import_request"]["facts"][0]["source_kind"] == "batch":
            raise RuntimeError("simulated interrupted second chunk after canonical insert")
        return result

    connection = psycopg2.connect(url.replace("postgresql+psycopg2://", "postgresql://"))
    def reference_snapshot():
        with engine.connect() as read:
            return tuple(read.execute(text(
                f"SELECT row_to_json(reference_row)::text FROM {table} reference_row ORDER BY id"
            )).scalars().all() for table in ("core.reference_data_releases", "tax.tax_code_versions"))

    reviewed_references = reference_snapshot()
    try:
        with patch.object(operator, "_attest_reviewed_database", attest_local):
            mismatch = deepcopy(value)
            mismatch["migration_bundle"]["import_requests"][0]["facts"][0]["payload"]["gst_rate"] = "5.000000"
            try:
                operator._migrate(connection, mismatch)
            except ValueError as exc:
                assert "tax" in str(exc).lower()
            else:
                raise AssertionError("source GST differing from the reviewed catalog was accepted")
            with engine.connect() as read:
                assert read.execute(text(
                    "SELECT count(*) FROM automation.historical_migration_facts WHERE org_id=:org AND dataset_id=:dataset"
                ), {"org": org, "dataset": dataset}).scalar_one() == 0
            assert reference_snapshot() == reviewed_references
            with patch.object(operator, "_import_batch", interrupted_import):
                try:
                    operator._migrate(connection, value)
                except RuntimeError as exc:
                    assert "interrupted second chunk" in str(exc)
                else:
                    raise AssertionError("interruption was not exercised")
            with engine.connect() as read:
                rows = read.execute(text(
                    "SELECT source_kind::text FROM automation.historical_migration_facts "
                    "WHERE org_id=:org AND dataset_id=:dataset"
                ), {"org": org, "dataset": dataset}).scalars().all()
                assert rows == ["product"], rows
            first, first_status = operator._migrate(connection, value)
            replay, replay_status = operator._migrate(connection, value)
        assert first["complete"] and replay["complete"]
        assert first_status == replay_status
        assert first_status["opening_quantity"] == first_status["ledger_quantity"] == "1.250000"
        assert first_status["opening_value"] == first_status["ledger_value"] == "125.00"
        assert reference_snapshot() == reviewed_references
        with engine.connect() as read:
            assert read.execute(text(
                "SELECT count(*) FROM automation.historical_migration_facts WHERE org_id=:org AND dataset_id=:dataset"
            ), {"org": org, "dataset": dataset}).scalar_one() == 2
            assert read.execute(text(
                "SELECT count(*) FROM catalog.products WHERE org_id=:org AND name=:name"
            ), {"org": org, "name": product["product_name"]}).scalar_one() == 1
            assert read.execute(text(
                "SELECT count(*) FROM inventory.stock_ledger_entries WHERE org_id=:org"
            ), {"org": org}).scalar_one() == 1
        print("MARG whole-run PG15 recovery and replay passed: 2 facts, 1 product, 1 stock posting, quantity 1.25, value 125.00; mismatched GST rejected before import; shared tax references unchanged")
    finally:
        connection.close()
        engine.dispose()


if __name__ == "__main__":
    main()
