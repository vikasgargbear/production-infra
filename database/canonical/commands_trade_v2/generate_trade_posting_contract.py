#!/usr/bin/env python3
"""Generate the second reviewed trade posting boundary.

This fragment composes with ``commands_trade``.  It deliberately calls the
existing ledger writer/projector and never implements commercial document
pricing.  The only arithmetic added here is inventory-cost pool allocation and
the resulting moving-weighted-average projection evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
CANONICAL_ROOT = ROOT.parent
REPO_ROOT = CANONICAL_ROOT.parents[1]
DOMAIN_ROOT = CANONICAL_ROOT / "domains"
BASELINE_GENERATOR = REPO_ROOT / "backend" / "scripts" / "generate_canonical_baseline.py"
PRIOR_MANIFEST = CANONICAL_ROOT / "commands_trade" / "trade-commands-manifest.json"
MAPPING_PATH = ROOT / "baseline-trade-posting-enforcements.json"
MANIFEST_PATH = ROOT / "trade-posting-manifest.json"
FIXTURE_PATH = ROOT / "test_trade_posting_rollback.sql"
SCHEMA = "erp_trade_commands_v2"


class ContractError(RuntimeError):
    """The reviewed follow-up no longer matches its catalog or predecessor."""


def _load_baseline():
    spec = importlib.util.spec_from_file_location(
        "canonical_baseline_for_trade_posting", BASELINE_GENERATOR
    )
    if spec is None or spec.loader is None:
        raise ContractError("cannot import canonical baseline generator")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def _catalog():
    baseline = _load_baseline()
    catalog = baseline.load_and_validate_catalog(DOMAIN_ROOT)
    payload = {
        "contract": catalog.contract,
        "tables": sorted(catalog.tables, key=lambda row: row["name"]),
    }
    return catalog, hashlib.sha256(_canonical_json(payload).encode()).hexdigest()


def _invariants(catalog: Any) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for table in catalog.tables:
        for invariant in table.get("cross_row_invariants", []):
            key = f"{table['name']}:{invariant['name']}"
            result[key] = {
                "table": table["name"],
                "invariant": invariant["name"],
                "enforcement": invariant["enforcement"],
                "rule": invariant["rule"],
            }
    return result


def _function(
    signature: str,
    returns: str,
    body: str,
    *,
    security_definer: bool = True,
    identity: str | None = None,
) -> list[str]:
    name, arguments = signature.split("(", 1)
    qualified = f'"{SCHEMA}"."{name}"({arguments}'
    if identity is None:
        identity = ",".join(
            argument.strip().split()[-1]
            for argument in arguments[:-1].split(",")
            if argument.strip()
        )
    identity_signature = f'"{SCHEMA}"."{name}"({identity})'
    security = "SECURITY DEFINER" if security_definer else "SECURITY INVOKER"
    return [
        f"""CREATE FUNCTION {qualified}
RETURNS {returns}
LANGUAGE plpgsql
{security}
SET search_path = ''
AS $function$
{body.strip()}
$function$""",
        f'ALTER FUNCTION {identity_signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION {identity_signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]


def _landed_pool_function() -> list[str]:
    return _function(
        "eligible_landed_cost_pool(p_org_id uuid, p_supplier_invoice_line_id uuid)",
        "numeric",
        """
DECLARE source procurement.supplier_invoice_lines%ROWTYPE;
        invoice_status text;
        allocated_billed numeric(20,6);
        allocated_free numeric(20,6);
        receipt_cost numeric;
BEGIN
    SELECT line.* INTO source
      FROM procurement.supplier_invoice_lines AS line
      JOIN procurement.supplier_invoices AS invoice
        ON invoice.org_id=line.org_id AND invoice.id=line.supplier_invoice_id
     WHERE line.org_id=p_org_id AND line.id=p_supplier_invoice_line_id
     FOR SHARE OF line, invoice;
    SELECT invoice.status INTO invoice_status
      FROM procurement.supplier_invoices AS invoice
     WHERE invoice.org_id=p_org_id AND invoice.id=source.supplier_invoice_id;
    IF source.id IS NULL OR invoice_status<>'posted' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed cost requires a posted supplier invoice line';
    END IF;
    IF source.inventory_cost_treatment<>'capitalize' THEN
        RETURN 0;
    END IF;
    IF source.line_kind='charge' THEN
        RETURN source.net_value_amount;
    END IF;

    SELECT COALESCE(sum(allocation.allocated_base_billed_quantity),0),
           COALESCE(sum(allocation.allocated_base_free_quantity),0),
           COALESCE(sum(pg_catalog.round(
               (allocation.allocated_base_billed_quantity+allocation.allocated_base_free_quantity)
               * receipt.unit_cost, 2
           )),0)
      INTO allocated_billed,allocated_free,receipt_cost
      FROM procurement.supplier_invoice_receipt_allocations AS allocation
      JOIN procurement.goods_receipt_lines AS receipt
        ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
     WHERE allocation.org_id=p_org_id
       AND allocation.supplier_invoice_line_id=p_supplier_invoice_line_id;
    IF allocated_billed IS DISTINCT FROM source.base_billed_quantity
       OR allocated_free IS DISTINCT FROM source.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='capitalized product cost requires complete receipt allocation';
    END IF;
    RETURN source.net_value_amount-receipt_cost;
END
""",
    )


def _landed_line_definitions() -> list[str]:
    return [
        f'CREATE SCHEMA "{SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_landed_pool_function(),
        *_function(
            "assert_landed_cost_document(p_org_id uuid, p_document_id uuid)",
            "void",
            """
DECLARE doc inventory.inventory_documents%ROWTYPE;
        source_line record;
        bad_count bigint;
        source_count bigint;
        expected_count bigint;
        pool numeric;
        locked_supplier_invoice_id uuid;
BEGIN
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=p_org_id AND id=p_document_id FOR UPDATE;
    IF doc.status<>'approved' OR doc.document_type<>'cost_adjustment'
       OR doc.supplier_invoice_id IS NULL
       OR doc.costing_method_snapshot<>'moving_weighted_average' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost command requires an approved typed MWA cost adjustment';
    END IF;
    SELECT id INTO locked_supplier_invoice_id FROM procurement.supplier_invoices
     WHERE org_id=p_org_id AND id=doc.supplier_invoice_id AND status='posted'
     FOR SHARE;
    IF locked_supplier_invoice_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost source supplier invoice is not posted';
    END IF;
    SELECT count(*) INTO source_count FROM inventory.inventory_document_lines
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF source_count=0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost document has no allocation lines';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_org_id::text||':landed-cost:'||p_document_id::text,82410617)
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key,82410618))
      FROM (
        SELECT DISTINCT p_org_id::text||':'||line.from_location_id::text||':'||line.product_id::text||':'||line.batch_id::text AS lock_key
          FROM inventory.inventory_document_lines AS line
         WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
         ORDER BY lock_key
      ) AS locked;
    PERFORM balance.location_id
      FROM inventory.stock_balances AS balance
      JOIN (
        SELECT DISTINCT from_location_id,product_id,batch_id
          FROM inventory.inventory_document_lines
         WHERE org_id=p_org_id AND inventory_document_id=p_document_id
      ) AS target
        ON target.from_location_id=balance.location_id
       AND target.product_id=balance.product_id AND target.batch_id=balance.batch_id
     WHERE balance.org_id=p_org_id
     ORDER BY balance.location_id,balance.product_id,balance.batch_id
     FOR UPDATE OF balance;

    SELECT count(*) INTO bad_count
      FROM inventory.inventory_document_lines AS line
      JOIN inventory.batches AS batch
        ON batch.org_id=line.org_id AND batch.id=line.batch_id
      JOIN inventory.locations AS location
        ON location.org_id=line.org_id AND location.id=line.from_location_id
      LEFT JOIN inventory.stock_balances AS balance
        ON balance.org_id=line.org_id AND balance.location_id=line.from_location_id
       AND balance.product_id=line.product_id AND balance.batch_id=line.batch_id
      JOIN procurement.supplier_invoice_lines AS supplier_line
        ON supplier_line.org_id=line.org_id AND supplier_line.id=line.supplier_invoice_line_id
     WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
       AND (line.movement_kind<>'value_adjustment'
         OR supplier_line.supplier_invoice_id IS DISTINCT FROM doc.supplier_invoice_id
         OR supplier_line.inventory_cost_treatment<>'capitalize'
         OR batch.product_id IS DISTINCT FROM line.product_id
         OR location.branch_id IS DISTINCT FROM doc.branch_id
         OR balance.on_hand_quantity IS NULL OR balance.on_hand_quantity<=0
         OR balance.inventory_value+line.extended_cost<0
         OR (line.cost_allocation_method='quantity_weighted'
             AND line.cost_allocation_basis_quantity IS DISTINCT FROM balance.on_hand_quantity)
         OR (line.cost_allocation_method='value_weighted'
             AND line.cost_allocation_basis_value IS DISTINCT FROM balance.inventory_value)
         OR NOT EXISTS (
             SELECT 1
               FROM procurement.supplier_invoice_receipt_allocations AS allocation
               JOIN procurement.goods_receipt_lines AS receipt
                 ON receipt.org_id=allocation.org_id AND receipt.id=allocation.goods_receipt_line_id
               JOIN procurement.supplier_invoice_lines AS allocated_line
                 ON allocated_line.org_id=allocation.org_id AND allocated_line.id=allocation.supplier_invoice_line_id
              WHERE allocation.org_id=line.org_id
                AND allocated_line.supplier_invoice_id=doc.supplier_invoice_id
                AND receipt.product_id=line.product_id
                AND receipt.batch_id=line.batch_id
                AND receipt.location_id=line.from_location_id
                AND (supplier_line.line_kind='charge'
                     OR allocated_line.id=supplier_line.id)
         ));
    IF bad_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost target is not positive on-hand stock from the supplier invoice receipt lineage';
    END IF;

    FOR source_line IN
        SELECT supplier_line.id,
               count(line.id) AS allocation_count,
               min(line.cost_allocation_method) AS allocation_method,
               max(line.cost_allocation_method) AS max_allocation_method,
               sum(line.cost_allocation_weight) AS weight_total
          FROM procurement.supplier_invoice_lines AS supplier_line
          JOIN inventory.inventory_document_lines AS line
            ON line.org_id=supplier_line.org_id AND line.supplier_invoice_line_id=supplier_line.id
         WHERE supplier_line.org_id=p_org_id
           AND supplier_line.supplier_invoice_id=doc.supplier_invoice_id
           AND line.inventory_document_id=p_document_id
         GROUP BY supplier_line.id
         ORDER BY supplier_line.id
    LOOP
        pool := erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,source_line.id);
        IF pool=0 OR source_line.allocation_method IS DISTINCT FROM source_line.max_allocation_method
           OR source_line.weight_total IS DISTINCT FROM 1
           OR (source_line.allocation_method='direct' AND source_line.allocation_count<>1) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost source pool, method, or exact weight total is invalid';
        END IF;

        SELECT count(*) INTO bad_count
          FROM (
            SELECT line.id,line.line_number,line.extended_cost,line.cost_allocation_method,
                   line.cost_allocation_weight,
                   CASE line.cost_allocation_method
                     WHEN 'quantity_weighted' THEN line.cost_allocation_basis_quantity
                     WHEN 'value_weighted' THEN line.cost_allocation_basis_value
                     ELSE 1
                   END AS basis,
                   sum(CASE line.cost_allocation_method
                         WHEN 'quantity_weighted' THEN line.cost_allocation_basis_quantity
                         WHEN 'value_weighted' THEN line.cost_allocation_basis_value
                         ELSE 1
                       END) OVER () AS basis_total,
                   row_number() OVER (ORDER BY line.line_number,line.id) AS allocation_position,
                   count(*) OVER () AS allocation_total
              FROM inventory.inventory_document_lines AS line
             WHERE line.org_id=p_org_id AND line.inventory_document_id=p_document_id
               AND line.supplier_invoice_line_id=source_line.id
          ) AS allocation
         WHERE allocation.cost_allocation_weight IS DISTINCT FROM
                 CASE WHEN allocation.cost_allocation_method='direct' THEN 1
                      WHEN allocation.allocation_position<allocation.allocation_total
                      THEN pg_catalog.round(allocation.basis/allocation.basis_total,12)
                      ELSE 1-COALESCE((
                          SELECT sum(pg_catalog.round(prior.basis/prior.basis_total,12))
                            FROM (
                              SELECT CASE earlier.cost_allocation_method
                                       WHEN 'quantity_weighted' THEN earlier.cost_allocation_basis_quantity
                                       WHEN 'value_weighted' THEN earlier.cost_allocation_basis_value
                                       ELSE 1
                                     END AS basis,
                                     sum(CASE earlier.cost_allocation_method
                                           WHEN 'quantity_weighted' THEN earlier.cost_allocation_basis_quantity
                                           WHEN 'value_weighted' THEN earlier.cost_allocation_basis_value
                                           ELSE 1
                                         END) OVER () AS basis_total,
                                     row_number() OVER (ORDER BY earlier.line_number,earlier.id) AS position
                                FROM inventory.inventory_document_lines AS earlier
                               WHERE earlier.org_id=p_org_id
                                 AND earlier.inventory_document_id=p_document_id
                                 AND earlier.supplier_invoice_line_id=source_line.id
                            ) AS prior
                           WHERE prior.position<allocation.allocation_total
                      ),0) END
            OR allocation.extended_cost IS DISTINCT FROM
                 CASE WHEN allocation.allocation_position<allocation.allocation_total
                      THEN pg_catalog.round(pool*allocation.cost_allocation_weight,2)
                      ELSE pool-COALESCE((
                          SELECT sum(pg_catalog.round(pool*prior.cost_allocation_weight,2))
                            FROM (
                              SELECT earlier.cost_allocation_weight,
                                     row_number() OVER (ORDER BY earlier.line_number,earlier.id) AS position
                                FROM inventory.inventory_document_lines AS earlier
                               WHERE earlier.org_id=p_org_id
                                 AND earlier.inventory_document_id=p_document_id
                                 AND earlier.supplier_invoice_line_id=source_line.id
                            ) AS prior
                           WHERE prior.position<allocation.allocation_total
                      ),0) END;
        IF bad_count<>0 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost weights or deterministic final-paise allocation do not match the eligible pool';
        END IF;
    END LOOP;

    SELECT count(*) INTO source_count
      FROM (
        SELECT DISTINCT supplier_invoice_line_id
          FROM inventory.inventory_document_lines
         WHERE org_id=p_org_id AND inventory_document_id=p_document_id
      ) AS sources;
    SELECT count(*) INTO expected_count
      FROM procurement.supplier_invoice_lines AS line
     WHERE line.org_id=p_org_id AND line.supplier_invoice_id=doc.supplier_invoice_id
       AND line.inventory_cost_treatment='capitalize'
       AND erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,line.id)<>0;
    IF source_count<>expected_count THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost document does not allocate every and only nonzero capitalized source pool';
    END IF;
END
""",
        ),
        *_function(
            "guard_posted_landed_allocation()",
            "trigger",
            """
DECLARE target_org uuid; target_document uuid; target_status text; target_type text;
BEGIN
    target_org := CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    target_document := CASE WHEN TG_OP='DELETE' THEN OLD.inventory_document_id ELSE NEW.inventory_document_id END;
    SELECT status,document_type INTO target_status,target_type FROM inventory.inventory_documents
     WHERE org_id=target_org AND id=target_document;
    IF target_status IN ('posted','reversed') AND target_type='cost_adjustment' THEN
        PERFORM erp_trade_commands_v2.assert_landed_cost_document(target_org,target_document);
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
""",
            security_definer=False,
        ),
        'CREATE CONSTRAINT TRIGGER "landed_cost_allocations_exact_ct" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."inventory_document_lines" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_posted_landed_allocation"()',
    ]


def _source_ownership_definitions() -> list[str]:
    return [
        *_function(
            "assert_source_inventory_ownership(p_source_kind text, p_org_id uuid, p_source_id uuid, p_source_status text)",
            "void",
            """
DECLARE owned_count bigint; reversal_count bigint; expected_count bigint := 1; owned_id uuid;
BEGIN
    IF p_source_status NOT IN ('posted','reversed') THEN RETURN; END IF;
    CASE p_source_kind
      WHEN 'sales_dispatch' THEN
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND sales_dispatch_id=p_source_id AND document_type='sales_issue' AND status IN ('posted','reversed');
      WHEN 'sales_invoice' THEN
        expected_count := CASE WHEN EXISTS (
            SELECT 1 FROM sales.invoice_lines line
             WHERE line.org_id=p_org_id AND line.invoice_id=p_source_id AND line.line_kind='product'
               AND NOT EXISTS (
                   SELECT 1 FROM sales.invoice_dispatch_allocations allocation
                    WHERE allocation.org_id=line.org_id AND allocation.invoice_line_id=line.id
               )
        ) THEN 1 ELSE 0 END;
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND sales_invoice_id=p_source_id AND document_type='sales_issue' AND status IN ('posted','reversed');
      WHEN 'sales_return' THEN
        expected_count := CASE WHEN EXISTS (
            SELECT 1 FROM sales.return_lines WHERE org_id=p_org_id AND return_id=p_source_id AND disposition='return_to_stock'
        ) THEN 1 ELSE 0 END;
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND sales_return_id=p_source_id AND document_type='sales_return_receipt' AND status IN ('posted','reversed');
      WHEN 'goods_receipt' THEN
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND goods_receipt_id=p_source_id AND document_type='purchase_receipt' AND status IN ('posted','reversed');
      WHEN 'purchase_return' THEN
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND purchase_return_id=p_source_id AND document_type='purchase_return_issue' AND status IN ('posted','reversed');
      WHEN 'destruction' THEN
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND destruction_id=p_source_id AND document_type='destruction' AND status IN ('posted','reversed');
      WHEN 'supplier_invoice' THEN
        SELECT count(*) INTO expected_count FROM procurement.supplier_invoice_lines AS line
         WHERE line.org_id=p_org_id AND line.supplier_invoice_id=p_source_id
           AND line.inventory_cost_treatment='capitalize'
           AND erp_trade_commands_v2.eligible_landed_cost_pool(p_org_id,line.id)<>0;
        expected_count := CASE WHEN expected_count>0 THEN 1 ELSE 0 END;
        SELECT count(*),(pg_catalog.array_agg(id))[1] INTO owned_count,owned_id FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND supplier_invoice_id=p_source_id AND document_type='cost_adjustment' AND status IN ('posted','reversed');
      ELSE
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unknown typed inventory source kind';
    END CASE;
    IF owned_count IS DISTINCT FROM expected_count THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted typed source does not own exactly its required canonical inventory document';
    END IF;
    IF p_source_status='reversed' AND owned_id IS NOT NULL THEN
        SELECT count(*) INTO reversal_count FROM inventory.inventory_documents
         WHERE org_id=p_org_id AND reverses_document_id=owned_id AND status='posted';
        IF reversal_count<>1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='reversed typed source does not own exactly one posted inverse inventory document';
        END IF;
    END IF;
END
""",
        ),
        *_function(
            "guard_source_inventory_ownership()",
            "trigger",
            """
DECLARE source_org uuid; source_id uuid; source_status text; original inventory.inventory_documents%ROWTYPE;
BEGIN
    IF TG_TABLE_SCHEMA='inventory' THEN
        IF TG_OP='DELETE' THEN
            original := OLD;
        ELSE
            original := NEW;
        END IF;
        IF original.sales_dispatch_id IS NOT NULL THEN
            SELECT status INTO source_status FROM sales.dispatches WHERE org_id=original.org_id AND id=original.sales_dispatch_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('sales_dispatch',original.org_id,original.sales_dispatch_id,source_status);
        ELSIF original.sales_invoice_id IS NOT NULL THEN
            SELECT status INTO source_status FROM sales.invoices WHERE org_id=original.org_id AND id=original.sales_invoice_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('sales_invoice',original.org_id,original.sales_invoice_id,source_status);
        ELSIF original.sales_return_id IS NOT NULL THEN
            SELECT status INTO source_status FROM sales.returns WHERE org_id=original.org_id AND id=original.sales_return_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('sales_return',original.org_id,original.sales_return_id,source_status);
        ELSIF original.goods_receipt_id IS NOT NULL THEN
            SELECT status INTO source_status FROM procurement.goods_receipts WHERE org_id=original.org_id AND id=original.goods_receipt_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('goods_receipt',original.org_id,original.goods_receipt_id,source_status);
        ELSIF original.purchase_return_id IS NOT NULL THEN
            SELECT status INTO source_status FROM procurement.purchase_returns WHERE org_id=original.org_id AND id=original.purchase_return_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('purchase_return',original.org_id,original.purchase_return_id,source_status);
        ELSIF original.destruction_id IS NOT NULL THEN
            SELECT status INTO source_status FROM compliance.destructions WHERE org_id=original.org_id AND id=original.destruction_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('destruction',original.org_id,original.destruction_id,source_status);
        ELSIF original.supplier_invoice_id IS NOT NULL THEN
            SELECT status INTO source_status FROM procurement.supplier_invoices WHERE org_id=original.org_id AND id=original.supplier_invoice_id;
            PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('supplier_invoice',original.org_id,original.supplier_invoice_id,source_status);
        ELSIF original.reverses_document_id IS NOT NULL THEN
            SELECT * INTO original FROM inventory.inventory_documents WHERE org_id=original.org_id AND id=original.reverses_document_id;
            IF original.sales_dispatch_id IS NOT NULL THEN
                SELECT status INTO source_status FROM sales.dispatches WHERE org_id=original.org_id AND id=original.sales_dispatch_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('sales_dispatch',original.org_id,original.sales_dispatch_id,source_status);
            ELSIF original.sales_invoice_id IS NOT NULL THEN
                SELECT status INTO source_status FROM sales.invoices WHERE org_id=original.org_id AND id=original.sales_invoice_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('sales_invoice',original.org_id,original.sales_invoice_id,source_status);
            ELSIF original.sales_return_id IS NOT NULL THEN
                SELECT status INTO source_status FROM sales.returns WHERE org_id=original.org_id AND id=original.sales_return_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('sales_return',original.org_id,original.sales_return_id,source_status);
            ELSIF original.goods_receipt_id IS NOT NULL THEN
                SELECT status INTO source_status FROM procurement.goods_receipts WHERE org_id=original.org_id AND id=original.goods_receipt_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('goods_receipt',original.org_id,original.goods_receipt_id,source_status);
            ELSIF original.purchase_return_id IS NOT NULL THEN
                SELECT status INTO source_status FROM procurement.purchase_returns WHERE org_id=original.org_id AND id=original.purchase_return_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('purchase_return',original.org_id,original.purchase_return_id,source_status);
            ELSIF original.destruction_id IS NOT NULL THEN
                SELECT status INTO source_status FROM compliance.destructions WHERE org_id=original.org_id AND id=original.destruction_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('destruction',original.org_id,original.destruction_id,source_status);
            ELSIF original.supplier_invoice_id IS NOT NULL THEN
                SELECT status INTO source_status FROM procurement.supplier_invoices WHERE org_id=original.org_id AND id=original.supplier_invoice_id;
                PERFORM erp_trade_commands_v2.assert_source_inventory_ownership('supplier_invoice',original.org_id,original.supplier_invoice_id,source_status);
            END IF;
        END IF;
        RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
    END IF;

    source_org := CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    source_id := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
    source_status := CASE WHEN TG_OP='DELETE' THEN OLD.status ELSE NEW.status END;
    PERFORM erp_trade_commands_v2.assert_source_inventory_ownership(TG_ARGV[0],source_org,source_id,source_status);
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
""",
            security_definer=False,
        ),
        'CREATE CONSTRAINT TRIGGER "inventory_documents_source_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "inventory"."inventory_documents" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"()',
        'CREATE CONSTRAINT TRIGGER "dispatch_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "sales"."dispatches" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'sales_dispatch\')',
        'CREATE CONSTRAINT TRIGGER "invoice_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "sales"."invoices" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'sales_invoice\')',
        'CREATE CONSTRAINT TRIGGER "sales_return_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "sales"."returns" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'sales_return\')',
        'CREATE CONSTRAINT TRIGGER "goods_receipt_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."goods_receipts" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'goods_receipt\')',
        'CREATE CONSTRAINT TRIGGER "purchase_return_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_returns" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'purchase_return\')',
        'CREATE CONSTRAINT TRIGGER "destruction_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "compliance"."destructions" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'destruction\')',
        'CREATE CONSTRAINT TRIGGER "supplier_invoice_inventory_owner_v2_ct" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."supplier_invoices" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_source_inventory_ownership"(\'supplier_invoice\')',
    ]


def _landed_document_definitions() -> list[str]:
    return [
        *_function(
            "post_landed_cost_adjustment(p_org_id uuid, p_document_id uuid, p_actor_id uuid, p_idempotency_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz)",
            "uuid",
            """
DECLARE claim_id uuid; replay_id uuid; doc inventory.inventory_documents%ROWTYPE;
        line inventory.inventory_document_lines%ROWTYPE;
        original_line inventory.inventory_document_lines%ROWTYPE;
        original_entry inventory.stock_ledger_entries%ROWTYPE;
        balance inventory.stock_balances%ROWTYPE;
        new_average numeric(20,4); command_posted_at timestamptz;
        quantity_total numeric(20,6); value_total numeric(20,2); actual_count bigint;
        original_document_id uuid;
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id FROM erp_trade_commands.claim(
      p_org_id,p_actor_id,'inventory.landed_cost.post',p_idempotency_key_hash,p_request_hash,p_expires_at
    );
    IF replay_id IS NOT NULL THEN RETURN replay_id; END IF;
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=p_org_id AND id=p_document_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('inventory.document.post',doc.branch_id);
    command_posted_at := pg_catalog.transaction_timestamp();

    IF doc.document_type='cost_adjustment' THEN
        PERFORM erp_trade_commands_v2.assert_landed_cost_document(p_org_id,p_document_id);
        FOR line IN SELECT * FROM inventory.inventory_document_lines
                     WHERE org_id=p_org_id AND inventory_document_id=p_document_id
                     ORDER BY line_number,id
        LOOP
            SELECT * INTO STRICT balance FROM inventory.stock_balances
             WHERE org_id=p_org_id AND location_id=line.from_location_id
               AND product_id=line.product_id AND batch_id=line.batch_id FOR UPDATE;
            IF balance.on_hand_quantity<=0 OR balance.inventory_value+line.extended_cost<0 THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost adjustment would create empty or negative-value inventory';
            END IF;
            new_average := pg_catalog.round(
                (balance.inventory_value+line.extended_cost)/balance.on_hand_quantity,4
            );
            PERFORM erp_trade_commands.emit_entry(
                p_org_id,p_document_id,line.id,'value_adjustment',line.from_location_id,
                0,new_average,line.extended_cost,NULL,p_actor_id,command_posted_at
            );
        END LOOP;
    ELSIF doc.document_type='reversal' THEN
        SELECT original.id INTO original_document_id FROM inventory.inventory_documents AS original
         WHERE original.org_id=p_org_id AND original.id=doc.reverses_document_id
           AND original.document_type='cost_adjustment' AND original.status='posted'
         FOR UPDATE;
        IF doc.reverses_document_id IS NULL OR original_document_id IS NULL THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost reversal requires a posted cost-adjustment source';
        END IF;
        IF (SELECT count(*) FROM inventory.inventory_document_lines WHERE org_id=p_org_id AND inventory_document_id=p_document_id)
           <> (SELECT count(*) FROM inventory.inventory_document_lines WHERE org_id=p_org_id AND inventory_document_id=doc.reverses_document_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost reversal line cardinality differs from its source';
        END IF;
        FOR line IN SELECT * FROM inventory.inventory_document_lines
                     WHERE org_id=p_org_id AND inventory_document_id=p_document_id
                     ORDER BY line_number,id
        LOOP
            SELECT * INTO STRICT original_line FROM inventory.inventory_document_lines
             WHERE org_id=p_org_id AND inventory_document_id=doc.reverses_document_id
               AND line_number=line.line_number;
            SELECT * INTO STRICT original_entry FROM inventory.stock_ledger_entries
             WHERE org_id=p_org_id AND inventory_document_line_id=original_line.id
               AND entry_kind='value_adjustment' FOR SHARE;
            IF ROW(line.movement_kind,line.product_id,line.batch_id,line.from_location_id,
                   line.supplier_invoice_line_id,line.extended_cost)
               IS DISTINCT FROM ROW('value_adjustment',original_line.product_id,original_line.batch_id,
                   original_line.from_location_id,original_line.supplier_invoice_line_id,original_line.extended_cost) THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost reversal line differs from immutable source allocation';
            END IF;
            SELECT * INTO STRICT balance FROM inventory.stock_balances
             WHERE org_id=p_org_id AND location_id=original_entry.location_id
               AND product_id=original_entry.product_id AND batch_id=original_entry.batch_id FOR UPDATE;
            IF balance.on_hand_quantity<=0 OR balance.inventory_value-original_entry.value_delta<0 THEN
                RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost reversal would create empty or negative-value inventory';
            END IF;
            new_average := pg_catalog.round(
                (balance.inventory_value-original_entry.value_delta)/balance.on_hand_quantity,4
            );
            PERFORM erp_trade_commands.emit_entry(
                p_org_id,p_document_id,line.id,'reversal',original_entry.location_id,
                0,new_average,-original_entry.value_delta,original_entry.id,p_actor_id,command_posted_at
            );
        END LOOP;
    ELSE
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost command accepts only cost adjustments and their reversals';
    END IF;

    SELECT COALESCE(sum(pg_catalog.abs(base_quantity)),0),COALESCE(sum(pg_catalog.abs(extended_cost)),0)
      INTO quantity_total,value_total FROM inventory.inventory_document_lines
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF quantity_total<>0 OR doc.total_abs_base_quantity IS DISTINCT FROM 0
       OR doc.total_value IS DISTINCT FROM value_total THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost header totals do not equal exact absolute allocation totals';
    END IF;
    SELECT count(*) INTO actual_count FROM inventory.stock_ledger_entries
     WHERE org_id=p_org_id AND inventory_document_id=p_document_id;
    IF actual_count<>(SELECT count(*) FROM inventory.inventory_document_lines WHERE org_id=p_org_id AND inventory_document_id=p_document_id) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost ledger cardinality is not exact';
    END IF;
    UPDATE inventory.inventory_documents SET status='posted',posted_at=command_posted_at,
           posted_by_membership_id=p_actor_id,updated_at=command_posted_at,
           updated_by_membership_id=p_actor_id,row_version=row_version+1
     WHERE org_id=p_org_id AND id=p_document_id AND status='approved';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='landed-cost state transition lost its lock';
    END IF;
    PERFORM erp_trade_commands.finish_claim(p_org_id,claim_id,'inventory.inventory_documents',p_document_id);
    RETURN p_document_id;
END
""",
        ),
        f'GRANT USAGE ON SCHEMA "{SCHEMA}" TO "erp_app", "erp_runtime"',
        f'GRANT EXECUTE ON FUNCTION "{SCHEMA}"."post_landed_cost_adjustment"(uuid,uuid,uuid,bytea,bytea,timestamptz) TO "erp_app", "erp_runtime"',
    ]


def _landed_ledger_definitions() -> list[str]:
    return [
        *_function(
            "guard_landed_cost_ledger_insert()",
            "trigger",
            """
DECLARE doc inventory.inventory_documents%ROWTYPE;
        line inventory.inventory_document_lines%ROWTYPE;
        balance inventory.stock_balances%ROWTYPE;
        original inventory.stock_ledger_entries%ROWTYPE;
        expected_average numeric(20,4);
BEGIN
    IF NEW.entry_kind NOT IN ('value_adjustment','reversal') OR NEW.quantity_delta<>0 THEN
        RETURN NEW;
    END IF;
    SELECT * INTO STRICT doc FROM inventory.inventory_documents
     WHERE org_id=NEW.org_id AND id=NEW.inventory_document_id FOR SHARE;
    SELECT * INTO STRICT line FROM inventory.inventory_document_lines
     WHERE org_id=NEW.org_id AND id=NEW.inventory_document_line_id FOR SHARE;
    SELECT * INTO STRICT balance FROM inventory.stock_balances
     WHERE org_id=NEW.org_id AND location_id=NEW.location_id
       AND product_id=NEW.product_id AND batch_id=NEW.batch_id FOR SHARE;
    IF balance.on_hand_quantity<=0 OR balance.inventory_value+NEW.value_delta<0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='zero-quantity cost adjustment requires positive on-hand and nonnegative resulting value';
    END IF;
    expected_average := pg_catalog.round(
        (balance.inventory_value+NEW.value_delta)/balance.on_hand_quantity,4
    );
    IF NEW.unit_cost IS DISTINCT FROM expected_average THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='cost-adjustment ledger unit cost is not the resulting locked MWA';
    END IF;
    IF NEW.entry_kind='value_adjustment' AND (
        doc.document_type<>'cost_adjustment' OR line.movement_kind<>'value_adjustment'
        OR NEW.value_delta IS DISTINCT FROM line.extended_cost
    ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='value-adjustment ledger entry differs from its canonical allocation';
    ELSIF NEW.entry_kind='reversal' THEN
        SELECT * INTO STRICT original FROM inventory.stock_ledger_entries
         WHERE org_id=NEW.org_id AND id=NEW.reverses_entry_id FOR SHARE;
        IF doc.document_type<>'reversal' OR original.entry_kind<>'value_adjustment'
           OR NEW.value_delta IS DISTINCT FROM -original.value_delta
           OR ROW(NEW.location_id,NEW.product_id,NEW.batch_id)
              IS DISTINCT FROM ROW(original.location_id,original.product_id,original.batch_id) THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='landed-cost reversal is not the exact inverse stock identity and value';
        END IF;
    END IF;
    RETURN NEW;
END
""",
            security_definer=False,
        ),
        'CREATE TRIGGER "stock_ledger_landed_cost_mwa_v2_guard" BEFORE INSERT ON "inventory"."stock_ledger_entries" FOR EACH ROW EXECUTE FUNCTION "erp_trade_commands_v2"."guard_landed_cost_ledger_insert"()',
    ]


def _approval_line_guard(
    function_name: str,
    table: str,
    parent_table: str,
    parent_column: str,
    frozen_statuses: str,
) -> list[str]:
    schema, relation = table.split(".")
    return [
        *_function(
            f"{function_name}()",
            "trigger",
            f"""
DECLARE parent_id uuid; parent_status text;
BEGIN
    parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.{parent_column} ELSE NEW.{parent_column} END;
    SELECT status INTO STRICT parent_status FROM {parent_table}
     WHERE org_id=CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END
       AND id=parent_id FOR SHARE;
    IF parent_status IN ({frozen_statuses}) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved commercial lines are immutable';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
""",
            security_definer=False,
        ),
        f'CREATE TRIGGER "{function_name}" BEFORE INSERT OR UPDATE OR DELETE ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{function_name}"()',
    ]


def _artifact_assertion(
    function_name: str,
    header_table: str,
    line_table: str,
    parent_column: str,
    resource_type: str,
    operation: str,
    document_date: str,
) -> list[str]:
    """Compare the complete reviewed document envelope with persisted order facts."""

    return _function(
        f"{function_name}(p_org_id uuid, p_resource_id uuid, p_input jsonb, p_output jsonb)",
        "void",
        f"""
DECLARE header {header_table}%ROWTYPE;
        expected_lines bigint;
        bad_count bigint;
BEGIN
    SELECT * INTO STRICT header FROM {header_table}
     WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
    IF header.status<>'submitted' THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculated order is no longer submitted';
    END IF;
    IF p_input->>'calculation_kind'<>'document'
       OR p_input->>'operation'<>'{operation}'
       OR p_input->>'resource_type'<>'{resource_type}'
       OR p_input->>'resource_id'<>p_resource_id::text
       OR (p_input->>'aggregate_version')::bigint IS DISTINCT FROM header.row_version
       OR p_output->>'operation'<>'{operation}'
       OR p_output->>'resource_type'<>'{resource_type}'
       OR p_output->>'resource_id'<>p_resource_id::text
       OR (p_output->>'aggregate_version')::bigint IS DISTINCT FROM header.row_version
       OR p_output->>'ruleset_version' IS DISTINCT FROM header.calculation_ruleset_version
       OR p_output->>'currency_code' IS DISTINCT FROM header.currency_code
       OR p_input#>>'{{document,gst_type}}' IS DISTINCT FROM
          (CASE WHEN header.supply_type='intra_state' THEN 'intra_state' ELSE 'inter_state' END)
       OR p_input#>>'{{document,zero_rated_mode}}' IS DISTINCT FROM header.zero_rated_payment_mode
       OR p_input#>>'{{document,tax_charge_mechanism}}' IS DISTINCT FROM header.tax_charge_mechanism
       OR p_input#>>'{{document,rounding_policy}}' IS DISTINCT FROM header.rounding_policy
       OR p_input#>>'{{document,document_discount,kind}}' IS DISTINCT FROM header.document_discount_kind
       OR (CASE p_input#>>'{{document,document_discount,basis}}'
            WHEN 'pre_tax_value' THEN 'taxable_value'
            ELSE p_input#>>'{{document,document_discount,basis}}'
          END) IS DISTINCT FROM header.document_discount_basis
       OR (p_input#>>'{{document,document_discount,value}}')::numeric IS DISTINCT FROM header.document_discount_value
       OR ROW(
          (p_output#>>'{{totals,subtotal}}')::numeric,
          (p_output#>>'{{totals,discount_total}}')::numeric,
          (p_output#>>'{{totals,charges_total}}')::numeric,
          (p_output#>>'{{totals,net_value_total}}')::numeric,
          (p_output#>>'{{totals,gst_taxable_total}}')::numeric,
          (p_output#>>'{{totals,cgst_total}}')::numeric,
          (p_output#>>'{{totals,sgst_total}}')::numeric,
          (p_output#>>'{{totals,igst_total}}')::numeric,
          (p_output#>>'{{totals,cess_total}}')::numeric,
          (p_output#>>'{{totals,recipient_assessed_tax_total}}')::numeric,
          (p_output#>>'{{totals,rounding_adjustment}}')::numeric,
          (p_output#>>'{{totals,grand_total}}')::numeric,
          (p_output#>>'{{totals,pre_round_total}}')::numeric
       ) IS DISTINCT FROM ROW(
          header.subtotal,header.discount_total,header.charges_total,
          header.net_value_total,header.gst_taxable_total,header.cgst_total,
          header.sgst_total,header.igst_total,header.cess_total,
          header.recipient_assessed_tax_total,header.rounding_adjustment,
          header.grand_total,header.grand_total-header.rounding_adjustment
       ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact header differs from persisted order';
    END IF;

    SELECT count(*) INTO expected_lines FROM {line_table}
     WHERE org_id=p_org_id AND {parent_column}=p_resource_id;
    IF expected_lines=0
       OR pg_catalog.jsonb_array_length(p_output->'lines')<>expected_lines
       OR pg_catalog.jsonb_array_length(p_input#>'{{document,products}}')
          +pg_catalog.jsonb_array_length(p_input#>'{{document,charges}}')<>expected_lines
       OR (SELECT count(DISTINCT value->>'line_id') FROM pg_catalog.jsonb_array_elements(p_output->'lines'))<>expected_lines
       OR (SELECT count(DISTINCT value->>'line_id')
             FROM (
               SELECT value FROM pg_catalog.jsonb_array_elements(p_input#>'{{document,products}}')
               UNION ALL
               SELECT value FROM pg_catalog.jsonb_array_elements(p_input#>'{{document,charges}}')
             ) AS input_items)<>expected_lines THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact line identity or cardinality differs';
    END IF;

    WITH output_lines AS (
        SELECT value AS item FROM pg_catalog.jsonb_array_elements(p_output->'lines')
    ), input_lines AS (
        SELECT value AS item,'product'::text AS line_kind
          FROM pg_catalog.jsonb_array_elements(p_input#>'{{document,products}}')
        UNION ALL
        SELECT value AS item,'charge'::text AS line_kind
          FROM pg_catalog.jsonb_array_elements(p_input#>'{{document,charges}}')
    )
    SELECT count(*) INTO bad_count
      FROM {line_table} AS line
      LEFT JOIN output_lines AS output_line ON output_line.item->>'line_id'=line.id::text
      LEFT JOIN input_lines AS input_line ON input_line.item->>'line_id'=line.id::text
      LEFT JOIN tax.tax_code_versions AS tax_version ON tax_version.id=line.tax_code_version_id
     WHERE line.org_id=p_org_id AND line.{parent_column}=p_resource_id
       AND (
         output_line.item IS NULL OR input_line.item IS NULL
         OR output_line.item->>'line_kind' IS DISTINCT FROM line.line_kind
         OR (output_line.item->>'final_residual')::boolean
         OR input_line.line_kind IS DISTINCT FROM line.line_kind
         OR input_line.item->>'tax_charge_mechanism' IS DISTINCT FROM line.tax_charge_mechanism
         OR input_line.item->>'price_basis' IS DISTINCT FROM line.price_basis
         OR input_line.item->>'taxability_snapshot' IS DISTINCT FROM line.taxability_snapshot
         OR (input_line.item->>'document_discount_eligible')::boolean IS DISTINCT FROM line.document_discount_eligible
         OR (input_line.item->>'cess_rate')::numeric IS DISTINCT FROM
            CASE WHEN line.taxability_snapshot='taxable' THEN tax_version.cess_rate ELSE 0 END
         OR (input_line.item->>'gst_rate')::numeric IS DISTINCT FROM
            CASE WHEN line.taxability_snapshot='taxable'
                       OR (line.taxability_snapshot='zero_rated' AND header.zero_rated_payment_mode='with_igst')
                 THEN tax_version.igst_rate ELSE 0 END
         OR tax_version.id IS NULL
         OR tax_version.code IS DISTINCT FROM line.tax_classification_code_snapshot
         OR tax_version.code_kind IS DISTINCT FROM CASE WHEN line.line_kind='product' THEN 'hsn' ELSE 'sac' END
         OR tax_version.ruleset_version IS DISTINCT FROM header.calculation_ruleset_version
         OR header.{document_date}<tax_version.effective_from
         OR (tax_version.effective_to IS NOT NULL AND header.{document_date}>tax_version.effective_to)
         OR NOT (line.taxability_snapshot=tax_version.taxability
                 OR (line.taxability_snapshot='zero_rated' AND header.supply_type IN ('export','sez')))
         OR (line.line_kind='product' AND (
              (input_line.item->>'base_billed_quantity')::numeric IS DISTINCT FROM line.base_billed_quantity
              OR (input_line.item->>'base_free_quantity')::numeric IS DISTINCT FROM line.base_free_quantity
              OR (input_line.item->>'billed_quantity')::numeric IS DISTINCT FROM line.billed_quantity
              OR (input_line.item->>'free_quantity')::numeric IS DISTINCT FROM line.free_quantity
              OR (input_line.item->>'uom_conversion_factor')::numeric IS DISTINCT FROM line.uom_conversion_factor
              OR (input_line.item->>'quoted_unit_rate')::numeric IS DISTINCT FROM line.quoted_unit_rate
              OR input_line.item->>'free_supply_tax_treatment' IS DISTINCT FROM line.free_supply_tax_treatment
              OR input_line.item#>>'{{line_discount,kind}}' IS DISTINCT FROM line.line_discount_kind
              OR CASE input_line.item#>>'{{line_discount,basis}}'
                   WHEN 'pre_tax_value' THEN 'taxable_value'
                   ELSE input_line.item#>>'{{line_discount,basis}}'
                 END IS DISTINCT FROM line.line_discount_basis
              OR (input_line.item#>>'{{line_discount,value}}')::numeric IS DISTINCT FROM line.line_discount_value
         ))
         OR (line.line_kind='charge' AND (
              input_line.item->>'charge_code' IS DISTINCT FROM line.charge_code
              OR (input_line.item->>'quoted_amount')::numeric IS DISTINCT FROM line.gross_amount
         ))
         OR ROW(
            (output_line.item->>'gross_amount')::numeric,
            (output_line.item->>'line_discount_amount')::numeric,
            (output_line.item->>'line_taxable_discount_amount')::numeric,
            (output_line.item->>'document_discount_amount')::numeric,
            (output_line.item->>'document_taxable_discount_amount')::numeric,
            (output_line.item->>'net_value_amount')::numeric,
            (output_line.item->>'gst_taxable_value')::numeric,
            (output_line.item->>'cgst_rate')::numeric,
            (output_line.item->>'sgst_rate')::numeric,
            (output_line.item->>'igst_rate')::numeric,
            (output_line.item->>'cess_rate')::numeric,
            (output_line.item->>'cgst_amount')::numeric,
            (output_line.item->>'sgst_amount')::numeric,
            (output_line.item->>'igst_amount')::numeric,
            (output_line.item->>'cess_amount')::numeric,
            (output_line.item->>'line_total')::numeric,
            (output_line.item->>'recipient_assessed_tax_amount')::numeric
         ) IS DISTINCT FROM ROW(
            line.gross_amount,line.line_discount_amount,line.line_taxable_discount_amount,
            line.document_discount_amount,line.document_taxable_discount_amount,
            line.net_value_amount,line.gst_taxable_value,line.cgst_rate,line.sgst_rate,
            line.igst_rate,line.cess_rate,line.cgst_amount,line.sgst_amount,
            line.igst_amount,line.cess_amount,line.line_total,
            CASE WHEN line.tax_charge_mechanism='reverse_charge'
                 THEN line.cgst_amount+line.sgst_amount+line.igst_amount+line.cess_amount ELSE 0 END
         )
       );
    IF bad_count<>0 THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='calculation artifact input, tax version, or line output differs';
    END IF;
END
""",
    )


def _approval_guard(
    function_name: str,
    table: str,
    typed_id_column: str,
    frozen_statuses: str,
    immutable_columns: list[str],
) -> list[str]:
    schema, relation = table.split(".")
    old_row = ",".join(f"OLD.{column}" for column in immutable_columns)
    new_row = ",".join(f"NEW.{column}" for column in immutable_columns)
    return [
        *_function(
            f"{function_name}()",
            "trigger",
            f"""
DECLARE actor_id uuid := NULLIF(pg_catalog.current_setting('app.membership_id',true),'')::uuid;
BEGIN
    IF TG_OP='INSERT' AND NEW.status IN ({frozen_statuses}) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial approval requires the canonical calculation command';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status NOT IN ({frozen_statuses}) AND NEW.status IN ({frozen_statuses})
       AND NOT EXISTS (
           SELECT 1 FROM calculation.artifacts AS artifact
            WHERE artifact.org_id=NEW.org_id AND artifact.{typed_id_column}=NEW.id
              AND artifact.status='consumed' AND artifact.consumed_by_membership_id=actor_id
              AND artifact.consumed_at=pg_catalog.transaction_timestamp()
       ) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='commercial approval lacks a transaction-bound calculation artifact';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ({frozen_statuses})
       AND ROW({new_row}) IS DISTINCT FROM ROW({old_row}) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='approved commercial terms are immutable';
    END IF;
    RETURN NEW;
END
""",
            security_definer=False,
        ),
        f'CREATE TRIGGER "{function_name}" BEFORE INSERT OR UPDATE ON "{schema}"."{relation}" '
        f'FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."{function_name}"()',
    ]


def _approval_command(
    function_name: str,
    assert_function: str,
    header_table: str,
    resource_type: str,
    operation: str,
    permission: str,
) -> list[str]:
    return [
        *_function(
            f"{function_name}(p_org_id uuid, p_resource_id uuid, p_artifact_id uuid, p_actor_id uuid, p_request_id uuid, p_command_request_id uuid, p_idempotency_key_hash bytea, p_request_hash bytea, p_expires_at timestamptz)",
            "uuid",
            f"""
DECLARE header {header_table}%ROWTYPE;
        claim_id uuid;
        replay_id uuid;
        input_document jsonb;
        output_document jsonb;
        output_bytes bytea;
        command_time timestamptz := pg_catalog.transaction_timestamp();
BEGIN
    PERFORM erp_trade_commands.assert_context(p_org_id,p_actor_id);
    IF NULLIF(pg_catalog.current_setting('app.request_id',true),'')::uuid IS DISTINCT FROM p_request_id THEN
        RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approval request context differs from calculation artifact';
    END IF;
    SELECT * INTO STRICT header FROM {header_table}
     WHERE org_id=p_org_id AND id=p_resource_id FOR UPDATE;
    PERFORM erp_trade_commands.assert_permission('{permission}',header.branch_id);
    SELECT p_claim_id,p_replay_resource_id INTO claim_id,replay_id
      FROM erp_trade_commands.claim(
        p_org_id,p_actor_id,'{operation}',p_idempotency_key_hash,p_request_hash,p_expires_at
      );
    IF replay_id IS NOT NULL THEN
        IF replay_id IS DISTINCT FROM p_resource_id THEN
            RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='approval replay resource differs';
        END IF;
        RETURN replay_id;
    END IF;
    SELECT pg_catalog.convert_from(artifact.input_bytes,'UTF8')::jsonb,
           pg_catalog.convert_from(artifact.output_bytes,'UTF8')::jsonb
      INTO STRICT input_document,output_document
      FROM calculation.artifacts AS artifact
     WHERE artifact.org_id=p_org_id AND artifact.id=p_artifact_id FOR UPDATE;
    PERFORM {SCHEMA}.{assert_function}(p_org_id,p_resource_id,input_document,output_document);
    output_bytes := erp_calculation_authority.consume_artifact(
        p_org_id,p_artifact_id,'{operation}','{resource_type}',p_resource_id,
        header.row_version,p_request_id,p_command_request_id,claim_id
    );
    IF pg_catalog.convert_from(output_bytes,'UTF8')::jsonb IS DISTINCT FROM output_document THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='consumed calculation output changed after exact comparison';
    END IF;
    UPDATE {header_table}
       SET status='approved',approved_at=command_time,approved_by_membership_id=p_actor_id,
           updated_at=command_time,updated_by_membership_id=p_actor_id,row_version=row_version+1
     WHERE org_id=p_org_id AND id=p_resource_id AND status='submitted'
       AND row_version=header.row_version;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='approval aggregate changed during verification';
    END IF;
    PERFORM erp_trade_commands.finish_claim(p_org_id,claim_id,'{header_table}',p_resource_id);
    RETURN p_resource_id;
END
""",
        ),
        f'GRANT EXECUTE ON FUNCTION "{SCHEMA}"."{function_name}"(uuid,uuid,uuid,uuid,uuid,uuid,bytea,bytea,timestamptz) TO "erp_app", "erp_runtime"',
    ]


ORDER_IMMUTABLE_COLUMNS = [
    "branch_id", "customer_account_id", "order_number", "fiscal_year", "order_date",
    "requested_delivery_date", "supply_type", "zero_rated_payment_mode",
    "tax_charge_mechanism", "billing_address_id", "shipping_address_id",
    "customer_po_number", "customer_po_date", "currency_code",
    "calculation_ruleset_version", "document_discount_kind", "document_discount_basis",
    "document_discount_value", "subtotal", "discount_total", "charges_total",
    "net_value_total", "gst_taxable_total", "cgst_total", "sgst_total", "igst_total",
    "cess_total", "recipient_assessed_tax_total", "rounding_policy",
    "rounding_adjustment", "grand_total",
]

PURCHASE_ORDER_IMMUTABLE_COLUMNS = [
    "branch_id", "supplier_account_id", "purchase_order_number", "fiscal_year",
    "order_date", "expected_delivery_date", "supply_type", "zero_rated_payment_mode",
    "tax_charge_mechanism", "currency_code", "calculation_ruleset_version",
    "document_discount_kind", "document_discount_basis", "document_discount_value",
    "subtotal", "discount_total", "charges_total", "net_value_total",
    "gst_taxable_total", "cgst_total", "sgst_total", "igst_total", "cess_total",
    "recipient_assessed_tax_total", "rounding_policy", "rounding_adjustment", "grand_total",
]


def _purchase_order_line_definitions() -> list[str]:
    return [
        *_artifact_assertion(
            "assert_purchase_order_artifact", "procurement.purchase_orders",
            "procurement.purchase_order_lines", "purchase_order_id", "purchase_order",
            "procurement.purchase_order.approve", "order_date",
        ),
        *_approval_line_guard(
            "guard_approved_purchase_order_lines", "procurement.purchase_order_lines",
            "procurement.purchase_orders", "purchase_order_id",
            "'approved','partially_received','received'",
        ),
    ]


def _purchase_order_definitions() -> list[str]:
    return [
        *_approval_guard(
            "guard_purchase_order_approval", "procurement.purchase_orders", "purchase_order_id",
            "'approved','partially_received','received'", PURCHASE_ORDER_IMMUTABLE_COLUMNS,
        ),
        *_approval_command(
            "approve_purchase_order", "assert_purchase_order_artifact",
            "procurement.purchase_orders", "purchase_order",
            "procurement.purchase_order.approve", "procurement.order.manage",
        ),
    ]


def _sales_order_line_definitions() -> list[str]:
    return [
        *_artifact_assertion(
            "assert_sales_order_artifact", "sales.orders", "sales.order_lines", "order_id",
            "sales_order", "sales.order.approve", "order_date",
        ),
        *_approval_line_guard(
            "guard_approved_sales_order_lines", "sales.order_lines", "sales.orders", "order_id",
            "'approved','partially_fulfilled','fulfilled'",
        ),
    ]


def _sales_order_definitions() -> list[str]:
    return [
        *_approval_guard(
            "guard_sales_order_approval", "sales.orders", "sales_order_id",
            "'approved','partially_fulfilled','fulfilled'", ORDER_IMMUTABLE_COLUMNS,
        ),
        *_approval_command(
            "approve_sales_order", "assert_sales_order_artifact", "sales.orders",
            "sales_order", "sales.order.approve", "sales.order.manage",
        ),
    ]


def _purchase_advance_definitions() -> list[str]:
    return [
        *_function(
            "guard_purchase_order_advance_allocation()",
            "trigger",
            """
DECLARE payment finance.payments%ROWTYPE; line procurement.purchase_order_lines%ROWTYPE;
        purchase_order procurement.purchase_orders%ROWTYPE; supplier parties.supplier_accounts%ROWTYPE;
        item finance.open_items%ROWTYPE; original procurement.purchase_order_advance_allocations%ROWTYPE; allocated numeric(20,2);
BEGIN
    IF TG_OP<>'INSERT' THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance allocations are append-only'; END IF;
    SELECT * INTO payment FROM finance.payments WHERE org_id=NEW.org_id AND id=NEW.payment_id FOR UPDATE;
    SELECT * INTO line FROM procurement.purchase_order_lines WHERE org_id=NEW.org_id AND id=NEW.purchase_order_line_id FOR SHARE;
    SELECT * INTO purchase_order FROM procurement.purchase_orders WHERE org_id=NEW.org_id AND id=line.purchase_order_id FOR SHARE;
    SELECT * INTO supplier FROM parties.supplier_accounts WHERE org_id=NEW.org_id AND id=NEW.supplier_account_id FOR SHARE;
    SELECT * INTO item FROM finance.open_items WHERE org_id=NEW.org_id AND id=NEW.prepayment_open_item_id FOR SHARE;
    IF NEW.status='reversed' THEN
      SELECT * INTO original FROM procurement.purchase_order_advance_allocations
       WHERE org_id=NEW.org_id AND id=NEW.reversal_of_allocation_id FOR SHARE;
      IF original.status<>'posted' OR payment.status<>'posted' OR payment.direction<>'receipt'
         OR item.status<>'reversed' OR ROW(NEW.purchase_order_line_id,NEW.supplier_account_id,NEW.branch_id,
            NEW.cash_disbursed_amount,NEW.withheld_amount,NEW.gross_advance_amount)
            IS DISTINCT FROM ROW(original.purchase_order_line_id,original.supplier_account_id,original.branch_id,
            original.cash_disbursed_amount,original.withheld_amount,original.gross_advance_amount)
         OR (NEW.withholding_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tax.withholdings reversal
             WHERE reversal.org_id=NEW.org_id AND reversal.id=NEW.withholding_id AND reversal.status='reversed'
               AND reversal.reversal_of_withholding_id=original.withholding_id)) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance reversal must exactly compensate immutable original';
      END IF;
      RETURN NEW;
    END IF;
    IF payment.status<>'posted' OR payment.direction<>'disbursement' OR payment.currency_code<>'INR'
       OR line.line_kind<>'product' OR line.product_id IS NULL
       OR purchase_order.status NOT IN ('approved','partially_received','received')
       OR purchase_order.supplier_account_id<>NEW.supplier_account_id OR purchase_order.branch_id<>NEW.branch_id
       OR supplier.party_id<>payment.party_id OR NEW.allocation_date<>payment.payment_date
       OR NEW.gross_advance_amount<>NEW.functional_gross_advance_amount
       OR NEW.gross_advance_amount<>NEW.cash_disbursed_amount+NEW.withheld_amount
       OR item.item_side<>'receivable' OR item.party_id<>payment.party_id OR item.currency_code<>'INR'
       OR item.principal_amount<>NEW.gross_advance_amount OR item.functional_principal_amount<>NEW.gross_advance_amount
       OR NOT EXISTS (SELECT 1 FROM finance.accounting_events event WHERE event.org_id=NEW.org_id
                       AND event.id=item.accounting_event_id AND event.payment_id=payment.id)
       OR (NEW.withheld_amount>0 AND NOT EXISTS (
           SELECT 1 FROM tax.withholdings withholding WHERE withholding.org_id=NEW.org_id
            AND withholding.id=NEW.withholding_id AND withholding.status='deducted'
            AND withholding.purchase_order_advance_allocation_id=NEW.id
            AND withholding.triggered_by_payment_id=payment.id
            AND withholding.withheld_amount=NEW.withheld_amount)) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='supplier advance lacks exact posted goods-payment and prepayment provenance';
    END IF;
    SELECT coalesce(sum(a.cash_disbursed_amount),0) INTO allocated
      FROM procurement.purchase_order_advance_allocations a
     WHERE a.org_id=NEW.org_id AND a.payment_id=NEW.payment_id AND a.status='posted';
    IF allocated<>payment.amount THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='posted payment must be fully allocated to typed goods advances'; END IF;
    RETURN NEW;
END
""",
        ),
        f'CREATE CONSTRAINT TRIGGER "purchase_order_advance_allocations_guard_ct" AFTER INSERT OR UPDATE OR DELETE ON "procurement"."purchase_order_advance_allocations" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "{SCHEMA}"."guard_purchase_order_advance_allocation"()',
    ]


RESOLVED_DEFINITIONS = {
    "procurement.purchase_order_advance_allocations:purchase_order_advance_allocations_cross_row_guard": _purchase_advance_definitions,
    "inventory.inventory_document_lines:inventory_inventory_document_lines_landed_cost_allocation": _landed_line_definitions,
    "inventory.inventory_documents:inventory_inventory_documents_invariant_2": _source_ownership_definitions,
    "inventory.inventory_documents:inventory_inventory_documents_landed_cost": _landed_document_definitions,
    "inventory.stock_ledger_entries:inventory_stock_ledger_entries_landed_cost": _landed_ledger_definitions,
    "procurement.purchase_order_lines:procurement_purchase_order_lines_invariant_1": _purchase_order_line_definitions,
    "procurement.purchase_orders:procurement_purchase_orders_invariant_1": _purchase_order_definitions,
    "sales.order_lines:sales_order_lines_invariant_1": _sales_order_line_definitions,
    "sales.orders:sales_orders_invariant_1": _sales_order_definitions,
}


CALCULATION_ARTIFACT = (
    "The canonical calculation.artifacts authority supplies authenticated, database-hashed fixed input/output "
    "bytes and a private one-time consumer. The order commands in this fragment reconstruct inputs, compare "
    "every persisted result, and consume the artifact atomically; an application-supplied hash alone is never proof."
)

DOWNSTREAM_POSTING = (
    "The calculation envelope can be compared, but this invariant cannot be split from its header posting: "
    "the same restricted transaction must also create the exact typed tax document, open item or adjustment, "
    "accounting event/journal, and any required inventory document. No reviewed shared writer and account-mapping "
    "interface for those effects exists yet, and this trade fragment must not invent a parallel authority."
)

BLOCKED_REASONS = {
    "procurement.purchase_return_lines:procurement_purchase_return_lines_invariant_1": (
        "Exact cumulative residual verification is possible for invoiced product allocations, but the modeled uninvoiced path has no immutable monetary source and neither path persists final_residual intent. " + DOWNSTREAM_POSTING
    ),
    "procurement.purchase_returns:procurement_purchase_returns_invariant_1": (
        "The header has no supplier_invoice_id for locking the original cumulative reversal state. " + DOWNSTREAM_POSTING
    ),
    "procurement.supplier_invoice_lines:procurement_supplier_invoice_lines_invariant_1": DOWNSTREAM_POSTING,
    "procurement.supplier_invoices:procurement_supplier_invoices_invariant_1": DOWNSTREAM_POSTING,
    "sales.invoice_lines:sales_invoice_lines_invariant_1": DOWNSTREAM_POSTING,
    "sales.invoices:sales_invoices_invariant_1": DOWNSTREAM_POSTING,
    "sales.return_lines:sales_return_lines_invariant_1": (
        "The persisted original supports proportional component checks, but final_residual intent must be tied to the locked cumulative original and prior returns. " + DOWNSTREAM_POSTING
    ),
    "sales.returns:sales_returns_invariant_1": (
        "Exact header residuals must be posted with their effects. " + DOWNSTREAM_POSTING
    ),
}


def generated_artifacts() -> tuple[str, str]:
    catalog, catalog_hash = _catalog()
    invariants = _invariants(catalog)
    prior_text = PRIOR_MANIFEST.read_text(encoding="utf-8")
    prior = json.loads(prior_text)
    prior_blocked = set(prior["blocked_invariants"])
    resolved = set(RESOLVED_DEFINITIONS)
    blocked = set(BLOCKED_REASONS)
    if resolved | blocked != prior_blocked or resolved & blocked:
        raise ContractError(
            "trade posting disposition must exactly partition commands_trade blockers: "
            f"missing={sorted(prior_blocked-resolved-blocked)}, extra={sorted((resolved|blocked)-prior_blocked)}"
        )

    entries: list[dict[str, Any]] = []
    for key in sorted(resolved):
        invariant = invariants[key]
        entries.append(
            {
                "table": invariant["table"],
                "invariant": invariant["invariant"],
                "enforcement": invariant["enforcement"],
                "requirement_sha256": hashlib.sha256(invariant["rule"].encode()).hexdigest(),
                "reviewed": True,
                "statements": RESOLVED_DEFINITIONS[key](),
            }
        )
    mapping = {
        "mapping_version": "1.0.0",
        "enforcements": entries,
        "platform_enforcements": [],
    }
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "catalog_sha256": catalog_hash,
        "prior_manifest_sha256": hashlib.sha256(prior_text.encode()).hexdigest(),
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode()).hexdigest(),
        "resolved_count": len(resolved),
        "resolved_invariants": sorted(resolved),
        "blocked_count": len(blocked),
        "blocked_invariants": {
            key: {"reason": BLOCKED_REASONS[key]} for key in sorted(blocked)
        },
        "ownership": {
            "inventory_ledger_writer_added": False,
            "inventory_projector_added": False,
            "composed_ledger_writer": "erp_trade_commands.emit_entry",
            "composed_projector": "erp_trade_commands.project_entry",
            "runtime_commands": [
                f"{SCHEMA}.approve_purchase_order",
                f"{SCHEMA}.approve_sales_order",
                f"{SCHEMA}.post_landed_cost_adjustment",
            ],
            "preclaim_interface": "core.claim_idempotency_key",
        },
        "calculation_gate": {
            "status": "consumed_for_order_approvals; downstream-posting-effects-still-blocked",
            "required_interface": CALCULATION_ARTIFACT,
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    mapping, manifest = generated_artifacts()
    outputs = ((MAPPING_PATH, mapping), (MANIFEST_PATH, manifest))
    if args.check:
        drift = [str(path) for path, text in outputs if not path.exists() or path.read_text() != text]
        if drift:
            print("trade-posting-contract: drift: " + ", ".join(drift), file=sys.stderr)
            return 1
        print("trade-posting-contract: OK")
        return 0
    ROOT.mkdir(parents=True, exist_ok=True)
    for path, text in outputs:
        path.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
