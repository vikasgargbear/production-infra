#!/usr/bin/env python3
"""Validate that the baseline contract follows the reviewed canonical topology."""

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MODEL_PATH = Path("database/canonical/model-v1.json")

EXPECTED_TABLE_COUNT = 110
DEFERRED_TABLES = {
    "payroll.attendance_entries",
    "payroll.leave_policies",
    "payroll.leave_requests",
    "payroll.salary_structures",
    "payroll.payroll_runs",
    "payroll.payroll_slips",
    "payroll.payroll_slip_lines",
    "loyalty.programs",
    "loyalty.tiers",
    "loyalty.entries",
    "sales.schemes",
    "sales.scheme_conditions",
    "sales.scheme_targets",
    "sales.scheme_redemptions",
    "catalog.price_lists",
    "catalog.price_list_items",
    "inventory.quality_tests",
    "compliance.inspections",
    "compliance.findings",
    "compliance.corrective_actions",
}
REQUIRED_REPLACEMENT_TABLES = {
    "core.reference_data_releases",
    "core.data_retention_cases",
    "calculation.artifacts",
    "catalog.ingredients",
    "catalog.product_ingredients",
    "catalog.commercial_charge_tax_profiles",
    "sales.invoice_dispatch_allocations",
    "procurement.supplier_invoice_receipt_allocations",
    "finance.accounting_events",
    "tax.documents",
    "tax.withholdings",
    "tax.withholding_rule_versions",
    "tax.organization_fiscal_tax_facts",
    "tax.withholding_basis_lines",
    "tax.withholding_deposits",
    "tax.withholding_deposit_lines",
    "tax.withholding_statements",
    "tax.withholding_statement_lines",
    "tax.withholding_certificates",
    "tax.withholding_certificate_lines",
    "procurement.purchase_order_advance_allocations",
    "tax.portal_document_lines",
    "tax.registration_branches",
    "tax.einvoice_rule_versions",
    "tax.gst_adjustment_rule_versions",
    "compliance.recall_batches",
    "compliance.controlled_movement_rule_versions",
    "compliance.storage_rule_versions",
}


@dataclass(frozen=True)
class ModelIssue:
    code: str
    message: str
    table: str | None = None


def load_model(repo_root: Path) -> dict[str, Any]:
    with (repo_root / MODEL_PATH).open(encoding="utf-8") as handle:
        return json.load(handle)


def load_topology(model: dict[str, Any], repo_root: Path) -> dict[str, Any]:
    with (repo_root / model["topology_authority"]).open(encoding="utf-8") as handle:
        return json.load(handle)


def flattened_tables(table_groups: dict[str, list[str]]) -> list[str]:
    return [name for names in table_groups.values() for name in names]


def validate_model(model: dict[str, Any], topology: dict[str, Any] | None = None) -> list[ModelIssue]:
    issues: list[ModelIssue] = []
    groups = model.get("canonical_tables", {})
    names = flattened_tables(groups)

    if model.get("state") != "candidate_not_deployed":
        issues.append(ModelIssue("unsafe_state", "Contract must remain candidate_not_deployed until every baseline gate passes."))
    if model.get("canonical_physical_table_count") != EXPECTED_TABLE_COUNT:
        issues.append(ModelIssue("unexpected_table_count", f"Reviewed lean-core count must remain {EXPECTED_TABLE_COUNT}."))
    if len(names) != model.get("canonical_physical_table_count"):
        issues.append(ModelIssue("table_count_mismatch", "Declared count does not match the contract inventory."))
    for name, count in Counter(names).items():
        if count != 1:
            issues.append(ModelIssue("duplicate_table", f"Table occurs {count} times.", name))
        schema, separator, _ = name.partition(".")
        if not separator or schema == "public":
            issues.append(ModelIssue("invalid_table_name", "Application tables must be schema-qualified and outside public.", name))

    overlay = model.get("topology_overlay", {})
    declared_deferred = set(overlay.get("deferred_tables", []))
    declared_required = set(overlay.get("required_tables", []))
    if declared_deferred != DEFERRED_TABLES:
            issues.append(ModelIssue("deferred_contract_drift", "The reviewed set of 20 deferred tables changed."))
    if declared_required != REQUIRED_REPLACEMENT_TABLES:
            issues.append(ModelIssue("required_replacement_drift", "The reviewed set of 28 required canonical facts changed."))
    for name in sorted(DEFERRED_TABLES & set(names)):
        issues.append(ModelIssue("deferred_table_present", "Deferred or unowned feature table is forbidden in the v1 baseline.", name))
    for name in sorted(REQUIRED_REPLACEMENT_TABLES - set(names)):
        issues.append(ModelIssue("missing_required_replacement", "Required relational fact is absent from the v1 baseline.", name))

    if topology is not None:
        authority_groups = topology.get("canonical_tables", {})
        authority_names = set(flattened_tables(authority_groups))
        if groups != authority_groups:
            issues.append(ModelIssue("topology_drift", "Implementation inventory differs from the final canonical authority."))
        authority_count = topology.get("scope", {}).get("canonical_physical_tables")
        if authority_count != EXPECTED_TABLE_COUNT or len(authority_names) != EXPECTED_TABLE_COUNT:
            issues.append(ModelIssue("authority_count_drift", f"Canonical authority must contain exactly {EXPECTED_TABLE_COUNT} tables."))

    required = {
        "core.users",
        "core.memberships",
        "core.permissions",
        "core.role_permissions",
        "core.access_grants",
        "core.attachments",
        "inventory.stock_ledger_entries",
        "inventory.stock_balances",
        "sales.invoices",
        "procurement.supplier_invoices",
        "finance.journal_entries",
        "finance.allocations",
        "tax.returns",
        "hr.employees",
        "automation.agent_grants",
        "automation.agent_grant_capabilities",
        "automation.command_requests",
        "automation.command_approvals",
    }
    for name in sorted(required - set(names)):
        issues.append(ModelIssue("missing_required_fact", "Mounted or regulated fact has no canonical table.", name))
    if any(name.startswith("commerce.") for name in names):
        issues.append(ModelIssue("generic_commerce_model", "Sales and procurement must remain typed aggregates."))

    types = model.get("type_contract", {})
    if types.get("resource_id") != "uuid" or "UUIDv7" not in types.get("id_generation", ""):
        issues.append(ModelIssue("id_contract_mismatch", "Resource IDs must be uuid with UUIDv7-preferred generation."))
    for field in ("money_intermediate", "money_posted", "quantity", "rate"):
        if not str(types.get(field, "")).startswith("numeric("):
            issues.append(ModelIssue("unsafe_numeric_type", f"{field} must use NUMERIC."))

    tenant = model.get("tenant_contract", {})
    if tenant.get("tenant_setting") != "app.org_id":
        issues.append(ModelIssue("tenant_setting_mismatch", "RLS must use app.org_id consistently."))
    if tenant.get("actor_setting") != "app.membership_id":
        issues.append(ModelIssue("actor_setting_mismatch", "Tenant actor context must resolve to a retained membership."))
    if tenant.get("application_role") != "erp_app" or tenant.get("runtime_login_role") != "erp_runtime":
        issues.append(ModelIssue("runtime_role_mismatch", "Login and least-privilege application roles must be separate."))
    if "FORCE RLS" not in tenant.get("rls", ""):
        issues.append(ModelIssue("force_rls_missing", "Tenant contract must require FORCE RLS."))
    if not all(name in tenant.get("rls", "") for name in ("core.organizations", "core.users")):
        issues.append(ModelIssue("global_identity_rls_missing", "Global-key organizations and profiles require membership-based FORCE RLS."))
    tenant_primary_key = tenant.get("tenant_primary_key", "")
    if not all(
        phrase in tenant_primary_key
        for phrase in (
            "PRIMARY KEY (org_id, id)",
            "non-addressable associations",
            "rebuildable projections",
            "natural composite primary key without id",
        )
    ):
        issues.append(
            ModelIssue(
                "tenant_primary_key_mismatch",
                "Addressable tenant resources need (org_id,id); associations and projections need org-leading natural keys without id.",
            )
        )
    if "redundant UNIQUE (org_id,id)" not in tenant.get("index_rule", ""):
        issues.append(ModelIssue("redundant_tenant_index_risk", "Tenant contract must prohibit duplicate PK/unique indexes."))
    if "core.memberships" not in tenant.get("child_fk", ""):
        issues.append(ModelIssue("actor_membership_fk_missing", "Actor evidence must use a composite FK to core.memberships."))

    identity = model.get("identity_contract", {})
    if "globally unique auth_user_id" not in identity.get("profile", ""):
        issues.append(ModelIssue("auth_mapping_missing", "Global ERP profile must map uniquely to auth.users."))
    if "(org_id,user_id)" not in identity.get("membership", ""):
        issues.append(ModelIssue("multi_org_membership_missing", "Membership must own organization scope."))
    if "JSON" not in identity.get("authorization", ""):
        issues.append(ModelIssue("relational_authorization_missing", "Role and branch grants must remain relational."))

    gates = model.get("baseline_generation_gates", {})
    if gates.get("current_result") != "blocked_pending_executable_invariants_rls_and_platform_controls":
        issues.append(
            ModelIssue(
                "unsafe_baseline_claim",
                "DDL generation must remain blocked until executable invariants, RLS, roles, seeds, preflight, and trigger controls are reviewed.",
            )
        )
    if not gates.get("required_before_revision"):
        issues.append(ModelIssue("missing_baseline_gates", "Baseline prerequisites are not declared."))
    return issues


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    model = load_model(args.repo_root)
    issues = validate_model(model, load_topology(model, args.repo_root))
    if args.json:
        print(json.dumps({"valid": not issues, "issues": [issue.__dict__ for issue in issues]}, indent=2))
    elif issues:
        for issue in issues:
            suffix = f" ({issue.table})" if issue.table else ""
            print(f"BLOCKER [{issue.code}] {issue.message}{suffix}")
    else:
        print("Canonical ERP baseline contract matches the topology authority.")
    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
