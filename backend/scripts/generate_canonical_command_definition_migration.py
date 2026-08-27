#!/usr/bin/env python3
"""Generate the versioned replacement for the retired staging SQL hot-patch."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260825_0012_canonical_command_definitions.sql"
)
EXPECTED_SQL_SHA256 = "90975dbc68957972b056ce1565b266e78e355ed41565b125c736bd6bdab7d459"

FUNCTION_TARGETS = (
    ("commands_core/baseline-core-command-enforcements.json", "erp_core_commands", "allocate_document_number"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "execute_approved_command"),
    ("commands_trade/baseline-trade-command-enforcements.json", "erp_trade_commands", "finish_claim"),
    ("commands_trade/baseline-trade-command-enforcements.json", "erp_trade_commands", "post_goods_receipt"),
    ("commands_finance/baseline-finance-command-enforcements.json", "erp_finance_commands", "parse_portal_document"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "post_supplier_invoice"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "post_sales_invoice"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "post_sales_return"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "post_purchase_return"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "assert_sales_invoice_artifact"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "assert_supplier_invoice_artifact"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "assert_sales_return_artifact"),
    ("commands_commercial/baseline-commercial-command-enforcements.json", "erp_commercial_commands", "assert_purchase_return_artifact"),
    ("commands_compliance/baseline-compliance-command-enforcements.json", "erp_compliance_commands", "finish_claim"),
    ("plumbing/baseline-plumbing-enforcements.json", "erp_plumbing", "enqueue_state_outbox"),
    ("commands_trade_v2/baseline-trade-posting-enforcements.json", "erp_trade_commands_v2", "guard_source_inventory_ownership"),
    ("commands_trade_v2/baseline-trade-posting-enforcements.json", "erp_trade_commands_v2", "guard_posted_landed_allocation"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "resolve_inventory_adjustment_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "resolve_goods_receipt_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_purchase_order_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "resolve_sales_dispatch_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_sales_return_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "assert_sales_return_draft"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "resolve_purchase_return_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "assert_purchase_return_draft"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_purchase_return_prepare"),
    ("calculation_authority/baseline-calculation-authority-enforcements.json", "erp_calculation_authority", "issue_artifact"),
    ("invariants_trade/baseline-trade-enforcements.json", "erp_trade_invariants", "guard_direct_invoice_issue"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_supplier_invoice_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_inventory_adjustment_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_supplier_payment_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_supplier_advance_prepare"),
    ("commands_automation/baseline-automation-command-enforcements.json", "erp_automation_commands", "persist_customer_receipt_prepare"),
)

# These functions were deliberately evolved after the immutable baseline. A
# staging repair must preserve the latest Alembic-owned definition rather than
# reinstalling the baseline implementation. The command-request guard is not
# in FUNCTION_TARGETS because revisions 0008 and 0009 evolve it from catalog
# state; Alembic already owns that final state and a later migration must not
# guess or reconstruct it.
FUNCTION_SOURCE_OVERRIDES = {
    ("erp_automation_commands", "execute_approved_command"): (
        "20260825_0007_adjustment_note_command.sql"
    ),
    ("erp_calculation_authority", "issue_artifact"): (
        "20260825_0007_adjustment_note_command.sql"
    ),
    ("erp_automation_commands", "resolve_purchase_return_prepare"): (
        "20260825_0010_return_reason_authority.sql"
    ),
}

CONSTRAINT_TARGETS = (
    ("sales.json", "sales", "returns", "ck_sales_returns_rounding_policy"),
    (
        "procurement.json",
        "procurement",
        "purchase_returns",
        "ck_procurement_purchase_returns_rounding_policy",
    ),
)


def _artifact(relative_path: str) -> dict:
    path = REPOSITORY_ROOT / "database/canonical" / relative_path
    return json.loads(path.read_text(encoding="utf-8"))


def _function_definition(relative_path: str, schema: str, function: str) -> str:
    override = FUNCTION_SOURCE_OVERRIDES.get((schema, function))
    if override is not None:
        source = (
            REPOSITORY_ROOT / "backend/alembic/sql" / override
        ).read_text(encoding="utf-8")
        prefix = f'CREATE OR REPLACE FUNCTION "{schema}"."{function}"'
        start = source.find(prefix)
        if start < 0:
            raise RuntimeError(f"reviewed override is missing {prefix} in {override}")
        end = source.find("$function$;", start)
        if end < 0:
            raise RuntimeError(f"reviewed override is unterminated for {prefix} in {override}")
        return source[start : end + len("$function$;")]

    artifact = _artifact(relative_path)
    enforcements = artifact.get("enforcements", artifact.get("platform_enforcements"))
    if not isinstance(enforcements, list):
        raise RuntimeError(f"reviewed enforcement list is missing from {relative_path}")
    prefix = f'CREATE FUNCTION "{schema}"."{function}"'
    matches = [
        statement
        for enforcement in enforcements
        for statement in enforcement["statements"]
        if statement.startswith(prefix)
    ]
    if len(matches) != 1:
        raise RuntimeError(f"expected one reviewed definition for {prefix}")
    return matches[0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)


def _constraint_definition(
    relative_path: str,
    schema: str,
    table: str,
    constraint_name: str,
) -> str:
    domain = _artifact(f"domains/{relative_path}")
    relation = next(item for item in domain["tables"] if item["name"] == f"{schema}.{table}")
    constraint = next(
        item for item in relation["checks"] if item["name"] == constraint_name
    )
    return (
        f'ALTER TABLE "{schema}"."{table}" DROP CONSTRAINT "{constraint_name}";\n'
        f'ALTER TABLE "{schema}"."{table}" ADD CONSTRAINT "{constraint_name}" '
        f'CHECK ({constraint["expression"]})'
    )


def generate_sql() -> str:
    """Return frozen migration 0012 after verifying its immutable SHA-256."""

    sql = OUTPUT_PATH.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != EXPECTED_SQL_SHA256:
        raise RuntimeError("canonical command-definition migration hash mismatch")
    return sql


def main() -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    generated = generate_sql()
    if args.check:
        if not OUTPUT_PATH.is_file() or OUTPUT_PATH.read_text(encoding="utf-8") != generated:
            raise RuntimeError("canonical command-definition migration package is stale")
        print("canonical command-definition migration: current")
    else:
        OUTPUT_PATH.write_text(generated, encoding="utf-8")
        print(f"wrote {OUTPUT_PATH.relative_to(REPOSITORY_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
