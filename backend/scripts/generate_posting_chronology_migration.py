#!/usr/bin/env python3
"""Package canonical posting-chronology authority for Alembic."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
ARTIFACT_PATH = (
    REPOSITORY_ROOT
    / "database/canonical/commands_automation/baseline-automation-command-enforcements.json"
)
OUTPUT_PATH = (
    REPOSITORY_ROOT
    / "backend/alembic/sql/20260828_0038_posting_chronology.sql"
)

FUNCTION_REQUIREMENTS = {
    "resolve_sales_dispatch_prepare": (
        'dispatch_date>"erp_core_commands"."current_organization_business_date"()',
        "'order_date',order_header.order_date",
    ),
    "resolve_purchase_order_prepare": (
        'order_date>"erp_core_commands"."current_organization_business_date"()',
    ),
    "resolve_goods_receipt_prepare": (
        "received_day<purchase_order.order_date",
        "'order_date',purchase_order.order_date",
    ),
    "resolve_supplier_invoice_prepare": (
        'invoice_date>"erp_core_commands"."current_organization_business_date"()',
        'received_date>"erp_core_commands"."current_organization_business_date"()',
        "received_date<receipt_business_date",
        "(receipt.received_at AT TIME ZONE organization.timezone)::date",
        "'goods_receipt_business_date',receipt_business_date",
        "'received_at',receipt.received_at,'business_date',receipt_business_date",
    ),
    "resolve_sales_invoice_prepare": (
        'invoice_date>"erp_core_commands"."current_organization_business_date"()',
        "invoice_date<dispatch_header.dispatch_date",
        "'dispatch_date',dispatch_header.dispatch_date",
        "'dispatch_row_version',dispatch_header.row_version",
    ),
    "resolve_sales_order_prepare": (
        'order_date>"erp_core_commands"."current_organization_business_date"()',
        "requested_delivery_date<order_date",
    ),
    "resolve_sales_return_prepare": (
        'return_date>"erp_core_commands"."current_organization_business_date"()',
        "return_date<invoice.invoice_date",
        "'invoice_date',invoice.invoice_date",
    ),
    "resolve_purchase_return_prepare": (
        'return_date>"erp_core_commands"."current_organization_business_date"()',
        "return_date<invoice.supplier_invoice_date",
        "portal_line.invoice_date>return_date",
        "'invoice_date',portal_line.invoice_date",
    ),
    "resolve_adjustment_note_prepare_unchecked_v0013": (
        'note_date>"erp_core_commands"."current_organization_business_date"()',
        "note_date<document_date",
        "'document_date',document_date",
    ),
}

FUNCTION_SOURCE_MIGRATIONS = {
    "resolve_sales_dispatch_prepare": "20260825_0012_canonical_command_definitions.sql",
    "resolve_goods_receipt_prepare": "20260825_0012_canonical_command_definitions.sql",
    "resolve_sales_invoice_prepare": "20260825_0016_sales_invoice_auto_fefo.sql",
    "resolve_sales_order_prepare": "20260828_0036_sales_order_delivery_date.sql",
    # Revision 0039 evolves the canonical source after chronology was packaged.
    # Rebuild 0038 from its immutable pre-chronology baseline rather than
    # trying to remove the newer tenant-timezone clauses from current source.
    "resolve_sales_return_prepare": "20260820_0001_canonical_v1.sql",
    "resolve_purchase_return_prepare": "20260825_0010_return_reason_authority.sql",
    "resolve_adjustment_note_prepare_unchecked_v0013": "20260825_0007_adjustment_note_command.sql",
}


def _replace_exact(
    definition: str,
    old: str,
    new: str,
    *,
    function_name: str,
) -> str:
    if definition.count(old) != 1:
        raise RuntimeError(
            f"{function_name} expected one reviewed chronology insertion point"
        )
    return definition.replace(old, new, 1)


def _apply_chronology(function_name: str, definition: str) -> str:
    """Apply the forward-only delta to an immutable generated predecessor."""

    replace = lambda old, new: _replace_exact(  # noqa: E731
        definition, old, new, function_name=function_name
    )
    if function_name == "resolve_sales_dispatch_prepare":
        definition = replace(
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-dispatch verified auth context resolved a different membership';
    END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-dispatch verified auth context resolved a different membership';
    END IF;
    IF dispatch_date>"erp_core_commands"."current_organization_business_date"() THEN
        RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales dispatch date cannot be in the future';
    END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','sales_order','id',order_header.id,'row_version',order_header.row_version,'status',order_header.status)",
            "pg_catalog.jsonb_build_object('resource_type','sales_order','id',order_header.id,'row_version',order_header.row_version,\n        'status',order_header.status,'order_date',order_header.order_date)",
            function_name=function_name,
        )
    elif function_name == "resolve_purchase_order_prepare":
        definition = replace(
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-order verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-order verified auth context resolved a different membership'; END IF;
    IF order_date>"erp_core_commands"."current_organization_business_date"() THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='purchase order date cannot be in the future'; END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
        )
    elif function_name == "resolve_goods_receipt_prepare":
        definition = replace(
            """       AND supplier_account_id=requested_supplier_account_id
       AND status IN ('approved','partially_received')
       AND currency_code='INR' AND supply_type IN ('intra_state','inter_state')
       AND zero_rated_payment_mode='not_applicable' AND tax_charge_mechanism='normal' FOR SHARE;
    SELECT * INTO STRICT supplier""",
            """       AND supplier_account_id=requested_supplier_account_id
       AND status IN ('approved','partially_received')
       AND currency_code='INR' AND supply_type IN ('intra_state','inter_state')
       AND zero_rated_payment_mode='not_applicable' AND tax_charge_mechanism='normal' FOR SHARE;
    IF received_day<purchase_order.order_date THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='goods receipt date cannot precede the locked purchase order date'; END IF;
    SELECT * INTO STRICT supplier""",
        )
        definition = _replace_exact(
            definition,
            "'status',purchase_order.status,'supply_type',purchase_order.supply_type,'tax_charge_mechanism',purchase_order.tax_charge_mechanism",
            "'status',purchase_order.status,'order_date',purchase_order.order_date,\n        'supply_type',purchase_order.supply_type,'tax_charge_mechanism',purchase_order.tax_charge_mechanism",
            function_name=function_name,
        )
    elif function_name == "resolve_supplier_invoice_prepare":
        definition = _replace_exact(
            definition,
            "line_uom text; line_factor numeric(20,6);",
            "line_uom text; line_factor numeric(20,6); receipt_business_date date;",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true""",
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='supplier-invoice verified auth context resolved a different membership'; END IF;
    IF invoice_date>"erp_core_commands"."current_organization_business_date"()
       OR received_date>"erp_core_commands"."current_organization_business_date"() THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='supplier invoice or received date cannot be in the future'; END IF;
    IF erp_security.can_access_branch(requested_branch_id) IS DISTINCT FROM true""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            """        SELECT * INTO STRICT receipt FROM procurement.goods_receipts
         WHERE org_id=organization_id AND id=receipt_line.goods_receipt_id AND status='posted' FOR SHARE;
        SELECT * INTO STRICT order_line""",
            """        SELECT * INTO STRICT receipt FROM procurement.goods_receipts
         WHERE org_id=organization_id AND id=receipt_line.goods_receipt_id AND status='posted' FOR SHARE;
        receipt_business_date:=(receipt.received_at AT TIME ZONE organization.timezone)::date;
        IF received_date<receipt_business_date THEN
          RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='supplier invoice received date cannot precede the organization-local goods receipt date'; END IF;
        SELECT * INTO STRICT order_line""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "'goods_receipt_id',receipt.id,'goods_receipt_row_version',receipt.row_version,'goods_receipt_line_row_id',receipt_line.id,",
            "'goods_receipt_id',receipt.id,'goods_receipt_row_version',receipt.row_version,'goods_receipt_line_row_id',receipt_line.id,\n          'goods_receipt_received_at',receipt.received_at,'goods_receipt_business_date',receipt_business_date,",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','purchase_order','id',purchase_order.id,'row_version',purchase_order.row_version,'status',purchase_order.status)",
            "pg_catalog.jsonb_build_object('resource_type','purchase_order','id',purchase_order.id,'row_version',purchase_order.row_version,\n            'status',purchase_order.status,'order_date',purchase_order.order_date)",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version,'status',receipt.status)",
            "pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version,\n            'status',receipt.status,'received_at',receipt.received_at,'business_date',receipt_business_date)",
            function_name=function_name,
        )
    elif function_name == "resolve_sales_invoice_prepare":
        definition = _replace_exact(
            definition,
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-invoice verified auth context resolved a different membership'; END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-invoice verified auth context resolved a different membership'; END IF;
    IF invoice_date>"erp_core_commands"."current_organization_business_date"() THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales invoice date cannot be in the future'; END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            """           AND id=dispatch_line.dispatch_id AND status='posted' AND branch_id=branch_id
           AND customer_account_id=customer.id AND shipping_address_id=shipping.id FOR SHARE;
          IF order_line.id IS NULL THEN""",
            """           AND id=dispatch_line.dispatch_id AND status='posted' AND branch_id=branch_id
           AND customer_account_id=customer.id AND shipping_address_id=shipping.id FOR SHARE;
          IF invoice_date<dispatch_header.dispatch_date THEN
            RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales invoice date cannot precede an allocated dispatch date'; END IF;
          IF order_line.id IS NULL THEN""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "'dispatch_line_id',dispatch_line.id,'dispatch_id',dispatch_header.id,'order_line_id',order_line.id,",
            "'dispatch_line_id',dispatch_line.id,'dispatch_id',dispatch_header.id,'dispatch_date',dispatch_header.dispatch_date,\n            'dispatch_row_version',dispatch_header.row_version,'order_line_id',order_line.id,",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','sales_dispatch','id',dispatch_header.id,'row_version',dispatch_header.row_version,'status',dispatch_header.status)",
            "pg_catalog.jsonb_build_object('resource_type','sales_dispatch','id',dispatch_header.id,\n              'row_version',dispatch_header.row_version,'status',dispatch_header.status,'dispatch_date',dispatch_header.dispatch_date)",
            function_name=function_name,
        )
    elif function_name == "resolve_sales_order_prepare":
        definition = _replace_exact(
            definition,
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-order verified auth context resolved a different membership';
    END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
            """    IF erp_security.current_membership_id() IS DISTINCT FROM membership_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-order verified auth context resolved a different membership';
    END IF;
    IF order_date>"erp_core_commands"."current_organization_business_date"() THEN
        RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales order date cannot be in the future';
    END IF;
    IF erp_security.can_access_branch(branch_id) IS DISTINCT FROM true""",
            function_name=function_name,
        )
    elif function_name == "resolve_sales_return_prepare":
        definition = _replace_exact(
            definition,
            """       OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-return verified context or cross-domain permission is inactive'; END IF;
    SELECT * INTO STRICT invoice""",
            """       OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sales-return verified context or cross-domain permission is inactive'; END IF;
    IF return_date>"erp_core_commands"."current_organization_business_date"() THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='sales return date cannot be in the future'; END IF;
    SELECT * INTO STRICT invoice""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','sales_invoice','id',invoice.id,'row_version',invoice.row_version)",
            "pg_catalog.jsonb_build_object('resource_type','sales_invoice','id',invoice.id,'row_version',invoice.row_version,\n        'invoice_date',invoice.invoice_date)",
            function_name=function_name,
        )
    elif function_name == "resolve_purchase_return_prepare":
        definition = _replace_exact(
            definition,
            """     OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-return verified context or cross-domain permission is inactive'; END IF;
  SELECT * INTO STRICT branch""",
            """     OR erp_security.has_permission('automation.command.execute',requested_branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='purchase-return verified context or cross-domain permission is inactive'; END IF;
  IF return_date>"erp_core_commands"."current_organization_business_date"() THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='purchase return date cannot be in the future'; END IF;
  SELECT * INTO STRICT branch""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            """       AND line.document_type='credit_note' AND line.supplier_gstin=original_tax.counterparty_gstin
       AND line.place_of_supply_state_code=original_tax.place_of_supply_state_code FOR SHARE OF line,parent;
    SELECT * INTO STRICT portal_document""",
            """       AND line.document_type='credit_note' AND line.supplier_gstin=original_tax.counterparty_gstin
       AND line.place_of_supply_state_code=original_tax.place_of_supply_state_code FOR SHARE OF line,parent;
    IF portal_line.invoice_date>return_date THEN
      RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='purchase return cannot precede the supplier portal credit-note date'; END IF;
    SELECT * INTO STRICT portal_document""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','supplier_invoice','id',invoice.id,'row_version',invoice.row_version)",
            "pg_catalog.jsonb_build_object('resource_type','supplier_invoice','id',invoice.id,'row_version',invoice.row_version,\n      'supplier_invoice_date',invoice.supplier_invoice_date,'received_date',invoice.received_date)",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','supplier_credit_note_portal_line','id',portal_line.id,'source_hash'",
            "pg_catalog.jsonb_build_object('resource_type','supplier_credit_note_portal_line','id',portal_line.id,\n      'invoice_date',portal_line.invoice_date,'source_hash'",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version)",
            "pg_catalog.jsonb_build_object('resource_type','goods_receipt','id',receipt.id,'row_version',receipt.row_version,\n        'received_at',receipt.received_at)",
            function_name=function_name,
        )
    elif function_name == "resolve_adjustment_note_prepare_unchecked_v0013":
        definition = _replace_exact(
            definition,
            """     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='adjustment-note verified context or cross-domain permission is inactive'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock""",
            """     OR erp_security.has_permission('automation.command.execute',branch_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='adjustment-note verified context or cross-domain permission is inactive'; END IF;
  IF note_date>"erp_core_commands"."current_organization_business_date"() THEN
    RAISE EXCEPTION USING ERRCODE='22007', MESSAGE='adjustment note date cannot be in the future'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock""",
            function_name=function_name,
        )
        definition = _replace_exact(
            definition,
            "pg_catalog.jsonb_build_object('resource_type',CASE WHEN side='sales' THEN 'sales_invoice' ELSE 'supplier_invoice' END,'id',original_id,'row_version',document_row_version)",
            "pg_catalog.jsonb_build_object('resource_type',CASE WHEN side='sales' THEN 'sales_invoice' ELSE 'supplier_invoice' END,\n      'id',original_id,'row_version',document_row_version,'document_date',document_date)",
            function_name=function_name,
        )
    return definition


def _migration_definition(function_name: str, filename: str) -> str:
    source = (REPOSITORY_ROOT / "backend/alembic/sql" / filename).read_text(
        encoding="utf-8"
    )
    source_name = (
        "resolve_adjustment_note_prepare"
        if function_name == "resolve_adjustment_note_prepare_unchecked_v0013"
        else function_name
    )
    candidates = (
        f'CREATE OR REPLACE FUNCTION "erp_automation_commands"."{source_name}"(',
        f'CREATE FUNCTION "erp_automation_commands"."{source_name}"(',
    )
    starts = [source.find(prefix) for prefix in candidates]
    starts = [start for start in starts if start >= 0]
    if len(starts) != 1:
        raise RuntimeError(
            f"expected one Alembic-owned predecessor for {function_name} in {filename}"
        )
    start = starts[0]
    end = source.find("$function$;", start)
    if end < 0:
        raise RuntimeError(f"unterminated predecessor for {function_name} in {filename}")
    definition = source[start : end + len("$function$")]
    if function_name == "resolve_adjustment_note_prepare_unchecked_v0013":
        definition = definition.replace(
            '"resolve_adjustment_note_prepare"(',
            '"resolve_adjustment_note_prepare_unchecked_v0013"(',
            1,
        )
    return definition


def _apply_post_predecessor_evolution(function_name: str, definition: str) -> str:
    if function_name != "resolve_sales_invoice_prepare":
        return definition
    if "sales_invoice_fefo_expiry_date_equivalence_v3" in definition:
        if "requested_conversion.multiplier" not in definition:
            raise RuntimeError(
                "sales-invoice predecessor has an incomplete FEFO UOM evolution"
            )
        return definition
    old_requested = """      WITH requested AS (
        SELECT (line.value->>'product_id')::uuid product_id,(allocation.value->>'batch_id')::uuid batch_id,
          sum(pg_catalog.round(((allocation.value->>'billed_quantity')::numeric+(allocation.value->>'free_quantity')::numeric)*conversion.multiplier,6)) requested_base
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        JOIN catalog.uom_conversions conversion ON conversion.org_id=organization_id AND conversion.id=(line.value->>'uom_conversion_id')::uuid
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(COALESCE(line.value->'batch_allocations','[]'::jsonb)) allocation(value)
        WHERE line.value->>'fulfillment_source'='direct_issue'
        GROUP BY (line.value->>'product_id')::uuid,(allocation.value->>'batch_id')::uuid
      ), totals AS (SELECT product_id,sum(requested_base) requested_base FROM requested GROUP BY product_id),
      /* sales_invoice_fefo_expiry_date_equivalence_v1 */"""
    new_requested = """      WITH requested AS (
        SELECT (line.value->>'product_id')::uuid product_id,(allocation.value->>'batch_id')::uuid batch_id,
          sum(pg_catalog.round(((allocation.value->>'billed_quantity')::numeric+(allocation.value->>'free_quantity')::numeric)*requested_conversion.multiplier,6)) requested_base
        FROM pg_catalog.jsonb_array_elements(request_document->'lines') line(value)
        JOIN catalog.uom_conversions requested_conversion
          ON requested_conversion.org_id=organization_id
         AND requested_conversion.id=(line.value->>'uom_conversion_id')::uuid
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(COALESCE(line.value->'batch_allocations','[]'::jsonb)) allocation(value)
        WHERE line.value->>'fulfillment_source'='direct_issue'
        GROUP BY (line.value->>'product_id')::uuid,(allocation.value->>'batch_id')::uuid
      ), totals AS (SELECT product_id,sum(requested_base) requested_base FROM requested GROUP BY product_id),
      /* sales_invoice_fefo_expiry_date_equivalence_v3 */"""
    definition = _replace_exact(
        definition,
        old_requested,
        new_requested,
        function_name=function_name,
    )
    replacements = (
        ("      eligible AS (", "      fefo_eligible AS ("),
        ("FROM eligible JOIN totals USING(product_id)", "FROM fefo_eligible JOIN totals USING(product_id)"),
        ("eligible.expiry_requested", "fefo_eligible.expiry_requested"),
        ("eligible.prior_available", "fefo_eligible.prior_available"),
        ("eligible.expiry_available", "fefo_eligible.expiry_available"),
    )
    for old, new in replacements:
        definition = _replace_exact(
            definition, old, new, function_name=function_name
        )
    return definition


def _artifact_definitions() -> dict[str, str]:
    artifact = json.loads(ARTIFACT_PATH.read_text(encoding="utf-8"))
    definitions: dict[str, str] = {}
    for function_name in FUNCTION_REQUIREMENTS:
        prefix = (
            'CREATE FUNCTION "erp_automation_commands".'
            f'"{function_name}"('
        )
        matches = [
            statement
            for enforcement in artifact["enforcements"]
            for statement in enforcement["statements"]
            if statement.startswith(prefix)
        ]
        if matches:
            if len(matches) != 1:
                raise RuntimeError(
                    f"expected one canonical definition for {function_name}"
                )
            definitions[function_name] = matches[0]
    return definitions


def _definitions() -> list[str]:
    artifact = _artifact_definitions()
    for function_name, filename in FUNCTION_SOURCE_MIGRATIONS.items():
        artifact[function_name] = _migration_definition(function_name, filename)

    missing_functions = set(FUNCTION_REQUIREMENTS) - set(artifact)
    if missing_functions:
        raise RuntimeError(
            f"canonical chronology definitions are missing: {sorted(missing_functions)}"
        )
    definitions = []
    for function_name, required in FUNCTION_REQUIREMENTS.items():
        definition = artifact[function_name].replace(
            "CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1
        )
        definition = _apply_post_predecessor_evolution(function_name, definition)
        definition = _apply_chronology(function_name, definition)
        missing = [fragment for fragment in required if fragment not in definition]
        if missing:
            raise RuntimeError(
                f"{function_name} lacks canonical chronology authority: {missing}"
            )
        definitions.append(definition)
    return definitions


def generate_sql() -> str:
    definitions = ";\n".join(_definitions())
    return (
        "-- Generated by backend/scripts/generate_posting_chronology_migration.py.\n"
        "-- Alembic owns the transaction; this file must not be applied directly.\n"
        "SET LOCAL ROLE erp_migration_owner;\n"
        f"{definitions};\n"
        "RESET ROLE;\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    generated = generate_sql()
    if args.check:
        if not OUTPUT_PATH.is_file() or OUTPUT_PATH.read_text(encoding="utf-8") != generated:
            raise RuntimeError("posting-chronology migration package is stale")
        print("posting-chronology migration: current")
    else:
        OUTPUT_PATH.write_text(generated, encoding="utf-8")
        print(f"wrote {OUTPUT_PATH.relative_to(REPOSITORY_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
