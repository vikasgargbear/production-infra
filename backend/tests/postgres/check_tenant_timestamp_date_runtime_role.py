"""Verify deployed tenant-local timestamp-date definitions on PostgreSQL 15."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text


FUNCTIONS = {
    "erp_trade_invariants.guard_batch()": (
        "NEW.created_at AT TIME ZONE organization_timezone",
    ),
    "erp_regulatory_commands.guard_regulatory_posting()": (
        "NEW.received_at AT TIME ZONE organization.timezone",
    ),
    "erp_compliance_commands.record_controlled_substance_entry(uuid,uuid,uuid,uuid,varchar,text,uuid,uuid,uuid,varchar,uuid,varchar,date,text,bytea,bytea,timestamptz)": (
        "ledger.posted_at AT TIME ZONE organization.timezone",
    ),
    "erp_compliance_commands.ingest_temperature_reading(uuid,uuid,uuid,uuid,uuid,varchar,timestamptz,numeric,numeric,varchar,varchar,varchar,bytea,bytea,bytea,bytea,timestamptz)": (
        "measured_at AT TIME ZONE organization.timezone",
    ),
    "erp_commercial_commands.post_sales_return(uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz)": (
        "filing.filed_at AT TIME ZONE organization.timezone",
    ),
    "erp_commercial_commands.post_purchase_return(uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,varchar,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz)": (
        "filing.filed_at AT TIME ZONE organization.timezone",
    ),
    "erp_commercial_commands.post_adjustment_note(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,varchar,uuid,uuid,uuid,bytea,bytea,timestamptz)": (
        "filing.filed_at AT TIME ZONE organization.timezone",
    ),
    "erp_automation_commands.resolve_sales_return_prepare(uuid,uuid,uuid,uuid,uuid,varchar,uuid,jsonb)": (
        "filing.filed_at AT TIME ZONE organization.timezone",
    ),
}

BOUNDARY_CASES = {
    # Each source family owns a separate function definition. Exercise both
    # positive- and negative-offset midnight boundaries in PostgreSQL rather
    # than assuming the database session date is a tenant date.
    "trade_invariant": (
        "2026-08-27 18:45:00+00",
        "Asia/Kolkata",
        "2026-08-28",
    ),
    "regulatory_guard": (
        "2026-08-28 06:30:00+00",
        "America/Los_Angeles",
        "2026-08-27",
    ),
    "compliance_commands": (
        "2026-08-27 18:45:00+00",
        "Asia/Kolkata",
        "2026-08-28",
    ),
    "commercial_commands": (
        "2026-08-28 06:30:00+00",
        "America/Los_Angeles",
        "2026-08-27",
    ),
    "automation_resolution": (
        "2026-08-27 18:45:00+00",
        "Asia/Kolkata",
        "2026-08-28",
    ),
}


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            assert int(connection.scalar(text("SHOW server_version_num"))) // 10000 == 15
            connection.execute(text("SET LOCAL TIME ZONE 'UTC'"))
            for family, (instant, timezone, expected_date) in BOUNDARY_CASES.items():
                session_date, tenant_date = connection.execute(
                    text(
                        """
                        SELECT CAST(:instant AS timestamptz)::date,
                               (CAST(:instant AS timestamptz)
                                  AT TIME ZONE :timezone)::date
                        """
                    ),
                    {"instant": instant, "timezone": timezone},
                ).one()
                assert str(tenant_date) == expected_date, family
                assert session_date != tenant_date, family

            for signature, required in FUNCTIONS.items():
                row = connection.execute(
                    text(
                        """
                        SELECT pg_catalog.pg_get_functiondef(
                                 pg_catalog.to_regprocedure(:signature)
                               ),
                               owner.rolname
                          FROM pg_catalog.pg_proc AS procedure
                          JOIN pg_catalog.pg_roles AS owner ON owner.oid=procedure.proowner
                         WHERE procedure.oid=pg_catalog.to_regprocedure(:signature)
                        """
                    ),
                    {"signature": signature},
                ).one()
                definition, owner = row
                assert owner == "erp_migration_owner"
                assert "core.organizations" in definition
                assert "FOR SHARE" in definition
                for fragment in required:
                    assert fragment in definition
                for forbidden in (
                    "NEW.created_at::date",
                    "NEW.received_at::date",
                    "ledger.posted_at::date",
                    "measured_at::date",
                    "filing.filed_at::date",
                ):
                    assert forbidden not in definition
    finally:
        engine.dispose()
    print("tenant timestamp-date PostgreSQL 15 definitions passed")


if __name__ == "__main__":
    main()
