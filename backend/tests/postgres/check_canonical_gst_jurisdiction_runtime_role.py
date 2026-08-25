"""Exercise GST jurisdiction catalog and fail-closed rules on PostgreSQL 15."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.begin() as connection:
            assert connection.scalar(text("SELECT count(*) FROM tax.gst_jurisdictions")) == 39
            assert connection.execute(text("""
                SELECT count(*) FILTER (WHERE supports_domestic_address),
                       count(*) FILTER (WHERE supports_gstin_registration),
                       count(*) FILTER (WHERE supports_place_of_supply)
                  FROM tax.gst_jurisdiction_versions WHERE status='active'
            """)).one() == (36, 38, 38)
            assert connection.scalar(text("""
                SELECT count(*)=2 AND bool_and(
                  octet_length(source_document_sha256)=32
                  AND octet_length(dataset_sha256)=32
                  AND authority_catalog_uri LIKE 'https://%'
                  AND source_uri LIKE 'https://%'
                ) FROM tax.gst_jurisdiction_releases WHERE status='active'
            """)) is True
            connection.execute(text("""
                SELECT tax.assert_effective_gst_jurisdiction('27','2026-08-25','domestic_address',NULL),
                       tax.assert_effective_gst_jurisdiction('96','2026-08-25','place_of_supply','export'),
                       tax.assert_effective_gst_jurisdiction('97','2026-08-25','place_of_supply','inter_state'),
                       tax.assert_effective_gst_jurisdiction('99','2026-08-25','gstin_registration',NULL)
            """))
            connection.execute(text("""
                DO $checks$
                BEGIN
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('00','2026-08-25','domestic_address',NULL); RAISE EXCEPTION '00 accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('96','2026-08-25','domestic_address',NULL); RAISE EXCEPTION '96 address accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('96','2026-08-25','place_of_supply','inter_state'); RAISE EXCEPTION '96 domestic POS accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('96','2026-08-25','place_of_supply',NULL); RAISE EXCEPTION '96 unclassified POS accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('96','2026-08-25','portal_place_of_supply',NULL); RAISE EXCEPTION '96 portal POS without transaction semantics accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('97','2026-08-25','place_of_supply','intra_state'); RAISE EXCEPTION '97 intra-state accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('97','2026-08-25','place_of_supply',NULL); RAISE EXCEPTION '97 unclassified POS accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('97','2026-08-25','portal_place_of_supply',NULL); RAISE EXCEPTION '97 portal POS without transaction semantics accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                  BEGIN PERFORM tax.assert_effective_gst_jurisdiction('99','2026-08-25','place_of_supply','inter_state'); RAISE EXCEPTION '99 POS accepted';
                  EXCEPTION WHEN check_violation THEN NULL; END;
                END
                $checks$
            """))
            assert connection.scalar(text("""
                SELECT count(*) FROM pg_catalog.pg_constraint
                 WHERE contype='f' AND confrelid='tax.gst_jurisdictions'::regclass
            """)) == 14
            assert connection.scalar(text("""
                SELECT count(*) FROM pg_catalog.pg_trigger
                 WHERE tgname LIKE '%_gst_jurisdiction_bt' AND NOT tgisinternal
            """)) == 11

            connection.execute(text('SET LOCAL ROLE "erp_runtime"'))
            assert connection.scalar(text("SELECT current_user")) == "erp_runtime"
            assert connection.scalar(text("""
                SELECT has_table_privilege(current_user,'tax.gst_jurisdiction_versions','SELECT')
            """)) is True
            assert connection.scalar(text("""
                SELECT has_function_privilege(
                  current_user,'tax.assert_effective_gst_jurisdiction(text,date,text,text)','EXECUTE'
                )
            """)) is False
            assert connection.scalar(text("""
                SELECT count(*) FROM tax.gst_jurisdiction_versions
                 WHERE status='active' AND supports_domestic_address
                   AND effective_from<='2026-08-25'
                   AND (effective_to IS NULL OR effective_to>='2026-08-25')
            """)) == 36
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
