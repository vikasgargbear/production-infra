"""Prove canonical product setup and activation as the restricted runtime role."""

from __future__ import annotations

import hashlib
import importlib.util
import os
from datetime import date
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


HERE = Path(__file__).resolve().parent
MASTER_FIXTURE = HERE / "check_canonical_master_write_function_runtime_role.py"
TAX_RELEASE = UUID("ee000000-0000-7000-8000-000000000001")
TAX_VERSION = UUID("ee000000-0000-7000-8000-000000000002")


def _master_fixture():
    spec = importlib.util.spec_from_file_location("product_setup_master_fixture", MASTER_FIXTURE)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _expect_denied(
    connection,
    statement: str,
    parameters: dict,
    *,
    expected_sqlstate: str | None = None,
) -> None:
    savepoint = connection.begin_nested()
    try:
        connection.execute(text(statement), parameters)
    except DBAPIError as exc:
        savepoint.rollback()
        if expected_sqlstate is not None:
            actual_sqlstate = getattr(exc.orig, "pgcode", None) or getattr(
                exc.orig, "sqlstate", None
            )
            assert actual_sqlstate == expected_sqlstate, (
                f"expected SQLSTATE {expected_sqlstate}, got {actual_sqlstate}"
            )
    else:
        savepoint.rollback()
        raise AssertionError("restricted product setup operation unexpectedly succeeded")


def _organization_business_date(connection, fixture) -> date:
    return connection.scalar(text("""
        SELECT (transaction_timestamp() AT TIME ZONE timezone)::date
          FROM core.organizations
         WHERE id=:org
    """), {"org": fixture.ORG_A})


def _seed_tax_release(connection, fixture, effective_on: date) -> str:
    connection.exec_driver_sql('SET LOCAL ROLE "erp_migration_owner"')
    session_date = connection.scalar(text("SELECT CURRENT_DATE"))
    release_effective_from = min(effective_on, session_date)
    existing = connection.scalar(text("""
        SELECT tax_version.code
         FROM tax.tax_code_versions tax_version
          JOIN core.reference_data_releases release ON release.id=tax_version.release_id
         WHERE tax_version.status='active' AND tax_version.code_kind='hsn'
           AND release.dataset_kind='hsn_sac_tax'
           AND tax_version.default_supply_type='goods' AND release.status='active'
           AND :effective_on BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date)
           AND :effective_on BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
           AND CURRENT_DATE BETWEEN tax_version.effective_from AND COALESCE(tax_version.effective_to,'infinity'::date)
           AND CURRENT_DATE BETWEEN release.effective_from AND COALESCE(release.effective_to,'infinity'::date)
         ORDER BY tax_version.code LIMIT 1
    """), {"effective_on": effective_on})
    if existing:
        connection.exec_driver_sql("RESET ROLE")
        return str(existing)
    connection.exec_driver_sql("ALTER TABLE core.reference_data_releases DISABLE TRIGGER USER")
    connection.exec_driver_sql("ALTER TABLE tax.tax_code_versions DISABLE TRIGGER USER")
    connection.execute(
        text(
            """
            INSERT INTO core.reference_data_releases(
              id,dataset_kind,ruleset_version,source_authority,source_uri,
              source_storage_bucket,source_storage_object_path,source_media_type,
              source_document_sha256,dataset_storage_bucket,dataset_storage_object_path,
              dataset_media_type,dataset_sha256,record_count,publication_date,
              effective_from,reviewed_by_user_id,reviewed_at,status)
            VALUES (
              :release,'hsn_sac_tax','pg15-product-setup-v1','gstn',
              'https://example.invalid/pg15-product-setup','fixture','product-setup/source',
              'text/plain',:source_hash,'fixture','product-setup/dataset','application/json',
              :dataset_hash,1,:release_effective_from,:release_effective_from,:reviewer,
              transaction_timestamp(),'active'
            );
            INSERT INTO tax.tax_code_versions(
              id,release_id,code,code_kind,version_number,description,effective_from,
              taxability,default_supply_type,cgst_rate,sgst_rate,igst_rate,cess_rate,
              ruleset_version,status)
            VALUES (
              :tax_version,:release,'4819','hsn',1,'Disposable product setup cartons',
              :release_effective_from,'taxable','goods',6,6,12,0,'pg15-product-setup-v1','active'
            )
            """
        ),
        {
            "release": TAX_RELEASE,
            "tax_version": TAX_VERSION,
            "reviewer": fixture.USER_A,
            "source_hash": hashlib.sha256(b"product setup source").digest(),
            "dataset_hash": hashlib.sha256(b"product setup dataset").digest(),
            "release_effective_from": release_effective_from,
        },
    )
    connection.exec_driver_sql("ALTER TABLE tax.tax_code_versions ENABLE TRIGGER USER")
    connection.exec_driver_sql("ALTER TABLE core.reference_data_releases ENABLE TRIGGER USER")
    connection.exec_driver_sql("RESET ROLE")
    return "4819"


def main() -> None:
    fixture = _master_fixture()
    engine = create_engine(os.environ["DATABASE_URL"])
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            fixture._seed(connection)
            effective_on = _organization_business_date(connection, fixture)
            hsn_code = _seed_tax_release(connection, fixture, effective_on)
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.execute(
                text("SELECT pg_catalog.set_config('app.request_id',:request_id,true)"),
                {"request_id": "ee000000-0000-7000-8000-000000000003"},
            )
            connection.execute(
                text("SELECT erp_security.activate_context(:auth,:org)"),
                {"auth": fixture.AUTH_A, "org": fixture.ORG_A},
            )

            _expect_denied(
                connection,
                "INSERT INTO catalog.uom_conversions(org_id,product_id,from_uom_code,to_uom_code,multiplier) VALUES (:org,:product,'EA','EA',1)",
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_DELETE},
                expected_sqlstate="42501",
            )
            _expect_denied(
                connection,
                "UPDATE catalog.products SET hsn_code='4819' WHERE org_id=:org AND id=:product",
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_DELETE},
                expected_sqlstate="42501",
            )

            configured = connection.execute(
                text(
                    """
                    SELECT product_id,product_code,product_name,new_row_version
                      FROM erp_master_commands.configure_product_draft(
                        :org,:product,1,NULL,:manufacturer,'EA',NULL,NULL,:hsn_code,
                        false,NULL,NULL,365,'8901234567890','[]'::jsonb,'[]'::jsonb
                      )
                    """
                ),
                {
                    "org": fixture.ORG_A,
                    "product": fixture.PRODUCT_DELETE,
                    "manufacturer": fixture.PARTY_A,
                    "hsn_code": hsn_code,
                },
            ).one()
            assert configured == (fixture.PRODUCT_DELETE, "TEST-A-2", "Delete A", 2)
            missing_fields = connection.scalar(
                text(
                    "SELECT erp_master_commands.product_setup_missing_fields("
                    ":org,:product,erp_core_commands.current_organization_business_date())"
                ),
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_DELETE},
            )
            assert missing_fields == [], missing_fields
            assert connection.scalar(
                text(
                    "SELECT count(*) FROM catalog.uom_conversions WHERE org_id=:org AND product_id=:product AND from_uom_code='EA' AND to_uom_code='EA' AND multiplier=1"
                ),
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_DELETE},
            ) == 1

            _expect_denied(
                connection,
                """
                SELECT * FROM erp_master_commands.configure_product_draft(
                  :org,:product,1,NULL,:manufacturer,'EA',NULL,NULL,:hsn_code,
                  false,NULL,NULL,365,NULL,'[]'::jsonb,'[]'::jsonb)
                """,
                {
                    "org": fixture.ORG_A,
                    "product": fixture.PRODUCT_DELETE,
                    "manufacturer": fixture.PARTY_A,
                    "hsn_code": hsn_code,
                },
            )
            _expect_denied(
                connection,
                """
                SELECT * FROM erp_master_commands.configure_product_draft(
                  :org,:product,2,NULL,:manufacturer,'EA',NULL,NULL,:hsn_code,
                  false,NULL,NULL,365,NULL,'[{"uom_code":"BX","multiplier":"bad"}]'::jsonb,'[]'::jsonb)
                """,
                {
                    "org": fixture.ORG_A,
                    "product": fixture.PRODUCT_DELETE,
                    "manufacturer": fixture.PARTY_A,
                    "hsn_code": hsn_code,
                },
            )
            assert connection.scalar(
                text("SELECT row_version FROM catalog.products WHERE org_id=:org AND id=:product"),
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_DELETE},
            ) == 2

            activated = connection.execute(
                text(
                    """
                    SELECT product_id,product_code,product_name,new_row_version,
                           idempotency_replayed
                      FROM erp_master_commands.activate_configured_product(
                        :org,:product,2,NULL,:key,transaction_timestamp()+interval '1 hour')
                    """
                ),
                {
                    "org": fixture.ORG_A,
                    "product": fixture.PRODUCT_DELETE,
                    "key": hashlib.sha256(b"pg15-product-setup-activation").digest(),
                },
            ).one()
            assert activated == (
                fixture.PRODUCT_DELETE, "TEST-A-2", "Delete A", 3, False
            )
            replayed = connection.execute(
                text(
                    """
                    SELECT product_id,product_code,product_name,new_row_version,
                           idempotency_replayed
                      FROM erp_master_commands.activate_configured_product(
                        :org,:product,2,NULL,:key,transaction_timestamp()+interval '1 hour')
                    """
                ),
                {
                    "org": fixture.ORG_A,
                    "product": fixture.PRODUCT_DELETE,
                    "key": hashlib.sha256(b"pg15-product-setup-activation").digest(),
                },
            ).one()
            assert replayed == (
                fixture.PRODUCT_DELETE, "TEST-A-2", "Delete A", 3, True
            )
            assert connection.execute(
                text("SELECT status,row_version FROM catalog.products WHERE org_id=:org AND id=:product"),
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_DELETE},
            ).one() == ("active", 3)

            _expect_denied(
                connection,
                "SELECT * FROM erp_master_commands.product_setup_missing_fields("
                ":org,:product,erp_core_commands.current_organization_business_date())",
                {"org": fixture.ORG_A, "product": fixture.PRODUCT_B},
            )
            print("canonical product setup runtime-role checks passed")
        finally:
            connection.exec_driver_sql("RESET SESSION AUTHORIZATION")
            transaction.rollback()
    engine.dispose()


if __name__ == "__main__":
    main()
