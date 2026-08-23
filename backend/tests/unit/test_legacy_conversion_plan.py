from __future__ import annotations

import importlib.util
from copy import deepcopy
from decimal import Decimal
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "backend/scripts/compile_legacy_conversion_plan.py"
SPEC = importlib.util.spec_from_file_location("compile_legacy_conversion_plan", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def inputs():
    return (
        MODULE.load_json(MODULE.DEFAULT_INVENTORY),
        MODULE.load_json(MODULE.DEFAULT_EVIDENCE),
        MODULE.load_json(MODULE.DEFAULT_MODEL),
    )


def test_live_evidence_compiles_complete_separate_shadow_plan() -> None:
    inventory, evidence, model = inputs()
    plan = MODULE.compile_plan(
        inventory=inventory,
        evidence=evidence,
        model=model,
        target_project_ref=MODULE.DISPOSABLE_STAGING_PROJECT_REF,
    )

    assert plan["status"] == "ready_for_row_extraction"
    assert plan["source"]["mode"] == "read_only"
    assert plan["target"]["production_write_allowed"] is False
    assert plan["row_coverage"]["counted_source_rows"] == 4839
    assert len(plan["row_coverage"]["all_schema_relations"]) == 184
    assert plan["row_coverage"]["unexplained_rows_allowed"] == 0
    assert plan["destructive_action"]["authorized"] is False
    assert Decimal(
        plan["reconciliation_contract"]["source_exact_totals"]["payments"]["amount"]
    ) == Decimal("18864.00")


def test_target_ids_are_stable_and_source_scoped() -> None:
    first = MODULE.deterministic_target_id("sales.invoices", 123)
    assert first == MODULE.deterministic_target_id("sales.invoices", 123)
    assert first != MODULE.deterministic_target_id("sales.orders", 123)
    assert first != MODULE.deterministic_target_id("sales.invoices", 124)


def test_plan_refuses_same_or_unreviewed_target() -> None:
    inventory, evidence, model = inputs()
    for target in (MODULE.SOURCE_PROJECT_REF, "unknown-project"):
        with pytest.raises(MODULE.PlanError):
            MODULE.compile_plan(
                inventory=inventory,
                evidence=evidence,
                model=model,
                target_project_ref=target,
            )


def test_plan_refuses_non_read_only_or_float_evidence() -> None:
    inventory, evidence, model = inputs()
    unsafe = deepcopy(evidence)
    unsafe["transaction_read_only"] = "off"
    with pytest.raises(MODULE.PlanError, match="read-only"):
        MODULE.compile_plan(
            inventory=inventory,
            evidence=unsafe,
            model=model,
            target_project_ref=MODULE.DISPOSABLE_STAGING_PROJECT_REF,
        )

    inexact = deepcopy(evidence)
    inexact["exact_totals"]["payments"]["amount"] = 18864.0
    with pytest.raises(MODULE.PlanError, match="exact decimal string"):
        MODULE.compile_plan(
            inventory=inventory,
            evidence=inexact,
            model=model,
            target_project_ref=MODULE.DISPOSABLE_STAGING_PROJECT_REF,
        )


def test_plan_refuses_unclassified_source_relation() -> None:
    inventory, evidence, model = inputs()
    incomplete_model = deepcopy(model)
    incomplete_model["source_mapping"].pop("sales.orders")
    with pytest.raises(MODULE.PlanError, match="unclassified source relations"):
        MODULE.compile_plan(
            inventory=inventory,
            evidence=evidence,
            model=incomplete_model,
            target_project_ref=MODULE.DISPOSABLE_STAGING_PROJECT_REF,
        )


def test_reviewed_exceptions_have_explicit_non_drop_dispositions() -> None:
    inventory, evidence, model = inputs()
    plan = MODULE.compile_plan(
        inventory=inventory,
        evidence=evidence,
        model=model,
        target_project_ref=MODULE.DISPOSABLE_STAGING_PROJECT_REF,
    )
    exceptions = {item["kind"]: item for item in plan["exception_dispositions"]}

    assert exceptions["header_without_lines"]["counts"]["sales_orders"] == 300
    assert "do_not_fabricate_lines" in exceptions["header_without_lines"]["disposition"]
    assert exceptions["inventory_movement_missing_batch"]["count"] == 2
    assert "untracked_system_batch" in exceptions["inventory_movement_missing_batch"]["disposition"]
    assert exceptions["user_without_auth_identity"]["count"] == 7
    assert "null_auth_user_id" in exceptions["user_without_auth_identity"]["disposition"]
