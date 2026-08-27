#!/usr/bin/env python3
"""Package tenant-local timestamp-to-date corrections for Alembic."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0039_tenant_timestamp_dates.sql"
)
POSTING_CHRONOLOGY_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0038_posting_chronology.sql"
)

TARGETS = (
    (
        "database/canonical/invariants_trade/baseline-trade-enforcements.json",
        "erp_trade_invariants",
        "guard_batch",
        (
            "FROM core.organizations",
            "NEW.created_at AT TIME ZONE organization_timezone",
        ),
    ),
    (
        "database/canonical/commands_regulatory/baseline-regulatory-command-enforcements.json",
        "erp_regulatory_commands",
        "guard_regulatory_posting",
        (
            "organization core.organizations%ROWTYPE",
            "NEW.received_at AT TIME ZONE organization.timezone",
        ),
    ),
    (
        "database/canonical/commands_compliance/baseline-compliance-command-enforcements.json",
        "erp_compliance_commands",
        "record_controlled_substance_entry",
        (
            "organization core.organizations%ROWTYPE",
            "ledger.posted_at AT TIME ZONE organization.timezone",
        ),
    ),
    (
        "database/canonical/commands_compliance/baseline-compliance-command-enforcements.json",
        "erp_compliance_commands",
        "ingest_temperature_reading",
        (
            "organization core.organizations%ROWTYPE",
            "measured_at AT TIME ZONE organization.timezone",
        ),
    ),
    (
        "database/canonical/commands_commercial/baseline-commercial-command-enforcements.json",
        "erp_commercial_commands",
        "post_sales_return",
        (
            "organization core.organizations%ROWTYPE",
            "filing.filed_at AT TIME ZONE organization.timezone",
        ),
    ),
    (
        "database/canonical/commands_commercial/baseline-commercial-command-enforcements.json",
        "erp_commercial_commands",
        "post_purchase_return",
        (
            "organization core.organizations%ROWTYPE",
            "filing.filed_at AT TIME ZONE organization.timezone",
        ),
    ),
    (
        "database/canonical/commands_commercial/baseline-commercial-command-enforcements.json",
        "erp_commercial_commands",
        "post_adjustment_note",
        (
            "organization core.organizations%ROWTYPE",
            "filing.filed_at AT TIME ZONE organization.timezone",
        ),
    ),
)


def _artifact_statements(relative_path: str) -> list[str]:
    document = json.loads((REPOSITORY_ROOT / relative_path).read_text(encoding="utf-8"))
    return [
        statement
        for enforcement in document["enforcements"]
        for statement in enforcement["statements"]
    ]


def _artifact_definition(
    relative_path: str, schema: str, function_name: str
) -> tuple[str, list[str]]:
    statements = _artifact_statements(relative_path)
    prefix = f'CREATE FUNCTION "{schema}"."{function_name}"('
    matches = [statement for statement in statements if statement.startswith(prefix)]
    if len(matches) != 1:
        raise RuntimeError(
            f"expected one canonical definition for {schema}.{function_name}"
        )
    definition = matches[0]
    acl_prefixes = ("ALTER FUNCTION ", "REVOKE ALL ON FUNCTION ", "GRANT EXECUTE ON FUNCTION ")
    identity_prefix = f'"{schema}"."{function_name}"('
    acl = [
        statement
        for statement in statements
        if statement.startswith(acl_prefixes) and identity_prefix in statement
    ]
    if not any(statement.startswith("ALTER FUNCTION ") for statement in acl):
        raise RuntimeError(f"missing canonical owner for {schema}.{function_name}")
    if not any(statement.startswith("REVOKE ALL ON FUNCTION ") for statement in acl):
        raise RuntimeError(f"missing canonical revocation for {schema}.{function_name}")
    return definition.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1), acl


def _migration_definition(schema: str, function_name: str) -> str:
    sql = POSTING_CHRONOLOGY_PATH.read_text(encoding="utf-8")
    prefix = f'CREATE OR REPLACE FUNCTION "{schema}"."{function_name}"('
    start = sql.find(prefix)
    if start < 0:
        raise RuntimeError(
            f"posting chronology lacks latest {schema}.{function_name} definition"
        )
    body_start = sql.find("$function$", start)
    body_end = sql.find("$function$", body_start + len("$function$"))
    if body_start < 0 or body_end < 0:
        raise RuntimeError(f"cannot parse {schema}.{function_name} definition")
    return sql[start : body_end + len("$function$")]


def _replace_exact(definition: str, old: str, new: str, *, label: str) -> str:
    if definition.count(old) != 1:
        raise RuntimeError(f"{label} expected one reviewed timestamp-date insertion point")
    return definition.replace(old, new, 1)


def _automation_sales_return_definition() -> tuple[str, list[str]]:
    schema = "erp_automation_commands"
    name = "resolve_sales_return_prepare"
    definition = _migration_definition(schema, name)
    definition = _replace_exact(
        definition,
        "invoice sales.invoices%ROWTYPE; original_tax tax.documents%ROWTYPE;",
        "invoice sales.invoices%ROWTYPE; original_tax tax.documents%ROWTYPE;\n        organization core.organizations%ROWTYPE;",
        label=name,
    )
    definition = _replace_exact(
        definition,
        """    IF return_date>"erp_core_commands"."current_organization_business_date"() THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales return date cannot be in the future'; END IF;
    SELECT * INTO STRICT invoice FROM sales.invoices""",
        """    IF return_date>"erp_core_commands"."current_organization_business_date"() THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales return date cannot be in the future'; END IF;
    SELECT * INTO STRICT organization FROM core.organizations
     WHERE id=organization_id AND status='active' FOR SHARE;
    SELECT * INTO STRICT invoice FROM sales.invoices""",
        label=name,
    )
    definition = _replace_exact(
        definition,
        "filing.filed_at::date",
        "(filing.filed_at AT TIME ZONE organization.timezone)::date",
        label=name,
    )
    _baseline, acl = _artifact_definition(
        "database/canonical/commands_automation/baseline-automation-command-enforcements.json",
        schema,
        name,
    )
    return definition, acl


def generate_sql() -> str:
    packages: list[str] = []
    for relative_path, schema, function_name, required in TARGETS:
        definition, acl = _artifact_definition(relative_path, schema, function_name)
        missing = [fragment for fragment in required if fragment not in definition]
        if missing:
            raise RuntimeError(
                f"{schema}.{function_name} lacks tenant-local date authority: {missing}"
            )
        packages.extend((definition, *acl))
    definition, acl = _automation_sales_return_definition()
    packages.extend((definition, *acl))
    body = ";\n".join(packages)
    sql = (
        "-- Generated by backend/scripts/generate_tenant_timestamp_date_migration.py.\n"
        "-- Alembic owns the transaction; this file must not be applied directly.\n"
        "SET LOCAL ROLE erp_migration_owner;\n"
        f"{body};\n"
        "RESET ROLE;\n"
    )
    # Canonical predecessor definitions can retain indented blank lines. Keep
    # the migration byte-stable and diff-clean without changing SQL tokens.
    return "\n".join(line.rstrip() for line in sql.splitlines()) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    generated = generate_sql()
    if args.check:
        if not OUTPUT_PATH.is_file() or OUTPUT_PATH.read_text(encoding="utf-8") != generated:
            raise RuntimeError("tenant timestamp-date migration package is stale")
        print("tenant timestamp-date migration: current")
    else:
        OUTPUT_PATH.write_text(generated, encoding="utf-8")
        print(f"wrote {OUTPUT_PATH.relative_to(REPOSITORY_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
