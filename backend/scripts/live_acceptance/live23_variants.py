"""Fail-closed contracts for the five scenarios beyond the Live18 baseline.

This module deliberately does not turn partial readiness into a live pass.  It
derives the two residual-return quantities from the reviewed Live18 scalar
pack and compiles only repository-owned UI intent.  The other three variants
remain blocked until canonical fixture and document-policy authority exists.
"""

from __future__ import annotations

import json
import re
from decimal import Decimal
from pathlib import Path
from typing import Any

from scripts.compile_live18_browser_fixture import (
    FixtureCompileError,
    _compile_value,
    _validate_compiled_steps,
)


ROOT = Path(__file__).resolve().parents[3]
READINESS_PATH = ROOT / "docs/testing/live23-ui-variant-readiness.json"
REGISTRY_SCHEMA = "aasopharma.live23.ui-variant-readiness.v1"
TEMPLATE_SCHEMA = "aasopharma.live23.ui-variant-template.v1"
EXPECTED_VARIANTS = {
    "sales_invoice_inter",
    "sales_invoice_sez_with_igst",
    "sales_return_final",
    "sales_return_commercial_only",
    "purchase_return_final",
}
UUID_RE = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
    re.I,
)
PLAIN_QUANTITY_RE = re.compile(r"(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,6})?")


class Live23VariantError(FixtureCompileError):
    """The expanded browser scenario registry is incomplete or unsafe."""


def _quantity(scalars: dict[str, Any], key: str, *, positive: bool) -> Decimal:
    value = scalars.get(key)
    text = (
        str(value)
        if isinstance(value, (str, int, float)) and not isinstance(value, bool)
        else ""
    )
    if not PLAIN_QUANTITY_RE.fullmatch(text):
        raise Live23VariantError(f"{key} must be a plain quantity with at most 6 decimals")
    number = Decimal(text)
    if number < 0 or (positive and number <= 0):
        qualifier = "positive" if positive else "non-negative"
        raise Live23VariantError(f"{key} must be {qualifier}")
    return number


def derive_final_return_choices(scalars: dict[str, Any]) -> dict[str, str]:
    """Derive residual quantities; dates, identities, and amounts never enter here."""

    chains = {
        "sales_return_final": (
            "sales_invoice_quantity",
            "sales_invoice_free_quantity",
            "sales_return_billed_quantity",
            "sales_return_free_quantity",
        ),
        "purchase_return_final": (
            "goods_receipt_accepted_quantity",
            "goods_receipt_free_quantity",
            "purchase_return_billed_quantity",
            "purchase_return_free_quantity",
        ),
    }
    choices: dict[str, str] = {}
    for scenario_id, (source_billed, source_free, prior_billed, prior_free) in chains.items():
        original_billed = _quantity(scalars, source_billed, positive=True)
        original_free = _quantity(scalars, source_free, positive=False)
        returned_billed = _quantity(scalars, prior_billed, positive=False)
        returned_free = _quantity(scalars, prior_free, positive=False)
        if returned_billed > original_billed or returned_free > original_free:
            raise Live23VariantError(
                f"{scenario_id} prior return exceeds its authoritative source quantities"
            )
        final_billed = original_billed - returned_billed
        final_free = original_free - returned_free
        if final_billed == 0 and final_free == 0:
            raise Live23VariantError(f"{scenario_id} has no positive residual to post")
        choices[f"{scenario_id}_billed_quantity"] = format(final_billed, ".6f")
        choices[f"{scenario_id}_free_quantity"] = format(final_free, ".6f")
    return choices


def load_variant_registry(
    path: Path = READINESS_PATH,
    *,
    require_all_ready: bool = False,
) -> tuple[dict[str, Any], ...]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    rows = raw.get("variants")
    if raw.get("schema") != REGISTRY_SCHEMA or raw.get("required_variant_count") != 5:
        raise Live23VariantError("Live23 variant registry must declare exactly five variants")
    if not isinstance(rows, list) or len(rows) != 5:
        raise Live23VariantError("Live23 variant registry must contain exactly five variants")
    ids = [row.get("id") for row in rows if isinstance(row, dict)]
    if len(ids) != 5 or len(set(ids)) != 5 or set(ids) != EXPECTED_VARIANTS:
        raise Live23VariantError("Live23 registry does not cover the exact five extra scenarios")
    ready = 0
    for row in rows:
        scenario_id = row["id"]
        status = row.get("status")
        if row.get("exact_sha_required") is not True:
            raise Live23VariantError(f"{scenario_id} must require exact-SHA deployment")
        if status == "ready":
            ready += 1
            if row.get("blocker") is not None:
                raise Live23VariantError(f"{scenario_id} ready variant cannot carry a blocker")
            template_path = ROOT / str(row.get("template", ""))
            template = json.loads(template_path.read_text(encoding="utf-8"))
            if (
                template.get("template_schema") != TEMPLATE_SCHEMA
                or template.get("scenario_id") != scenario_id
                or template.get("operation_id") != row.get("operation_id")
            ):
                raise Live23VariantError(f"{scenario_id} template authority is invalid")
            serialized = json.dumps(template, sort_keys=True)
            if UUID_RE.search(serialized):
                raise Live23VariantError(f"{scenario_id} template contains a hardcoded UUID")
        elif status == "blocked":
            blocker = row.get("blocker")
            if row.get("template") is not None or not isinstance(blocker, dict):
                raise Live23VariantError(f"{scenario_id} blocked variant needs an exact blocker")
            if not blocker.get("code") or not blocker.get("missing_authority"):
                raise Live23VariantError(f"{scenario_id} blocker is incomplete")
        else:
            raise Live23VariantError(f"{scenario_id} has invalid status {status!r}")
    if raw.get("ready_count") != ready:
        raise Live23VariantError("Live23 ready_count does not match ready variants")
    if require_all_ready and ready != 5:
        raise Live23VariantError(
            f"LIVE23_VARIANTS_INCOMPLETE: {ready}/5 variants are browser-ready"
        )
    return tuple(rows)


def compile_ready_variant(
    scenario_id: str,
    facts: dict[str, Any],
    scalars: dict[str, Any],
) -> dict[str, Any]:
    rows = {row["id"]: row for row in load_variant_registry()}
    row = rows.get(scenario_id)
    if row is None or row.get("status") != "ready":
        raise Live23VariantError(f"{scenario_id} is not a ready UI-driven variant")
    template = json.loads((ROOT / row["template"]).read_text(encoding="utf-8"))
    compiled_facts = dict(facts)
    compiled_facts["choice"] = {
        **(facts.get("choice") or {}),
        **derive_final_return_choices(scalars),
    }
    used: set[str] = set()
    operation = _compile_value(
        {"lifecycle_mode": template["lifecycle_mode"], **template["steps"]},
        compiled_facts,
        scalars,
        used,
    )
    approval_policy = (
        "actor_confirmation"
        if row["operation_id"] == "sales_invoice"
        else "separate_approver"
    )
    _validate_compiled_steps(row["operation_id"], operation, approval_policy)
    return operation


compile_final_return_variant = compile_ready_variant
