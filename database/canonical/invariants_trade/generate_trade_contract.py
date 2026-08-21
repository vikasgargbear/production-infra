#!/usr/bin/env python3
"""Generate reviewed inventory, sales, and procurement invariant mappings."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DOMAINS_ROOT = ROOT.parent / "domains"
MAPPING_PATH = ROOT / "baseline-trade-enforcements.json"
MANIFEST_PATH = ROOT / "trade-invariants-manifest.json"
TRADE_DOMAINS = ("inventory", "sales", "procurement")
FUNCTION_SCHEMA = "erp_trade_invariants"


class ContractError(RuntimeError):
    """The trade invariant contract no longer matches the canonical catalog."""


def _load_invariants() -> dict[str, dict[str, str]]:
    invariants: dict[str, dict[str, str]] = {}
    for domain in TRADE_DOMAINS:
        document = json.loads((DOMAINS_ROOT / f"{domain}.json").read_text(encoding="utf-8"))
        for table in document["tables"]:
            for invariant in table.get("cross_row_invariants", []):
                key = f"{table['name']}:{invariant['name']}"
                if key in invariants:
                    raise ContractError(f"duplicate invariant key: {key}")
                invariants[key] = {
                    "table": table["name"],
                    "invariant": invariant["name"],
                    "enforcement": invariant["enforcement"],
                    "rule": invariant["rule"],
                }
    return invariants


def _private_trigger_function(name: str, body: str) -> list[str]:
    signature = f'"{FUNCTION_SCHEMA}"."{name}"()'
    return [
        f"""CREATE FUNCTION {signature}
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
{body.strip()}
$function$""",
        f'ALTER FUNCTION {signature} OWNER TO "erp_migration_owner"',
        f'REVOKE ALL ON FUNCTION {signature} FROM PUBLIC, "erp_app", "erp_runtime"',
    ]


def _constraint_trigger(name: str, events: str, table: str, function: str) -> str:
    schema, relation = table.split(".")
    return (
        f'CREATE CONSTRAINT TRIGGER "{name}" AFTER {events} ON "{schema}"."{relation}" '
        f'DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION '
        f'"{FUNCTION_SCHEMA}"."{function}"()'
    )


def _definitions() -> dict[str, list[str]]:
    definitions: dict[str, list[str]] = {}

    definitions["inventory.batches:inventory_batches_invariant_1"] = [
        f'CREATE SCHEMA "{FUNCTION_SCHEMA}" AUTHORIZATION "erp_migration_owner"',
        f'REVOKE ALL ON SCHEMA "{FUNCTION_SCHEMA}" FROM PUBLIC, "erp_app", "erp_runtime"',
        *_private_trigger_function(
            "guard_batch",
"""
DECLARE
    mrp_conversion_count integer;
    validate_mrp_conversion boolean;
BEGIN
    validate_mrp_conversion:=TG_OP='INSERT';
    IF TG_OP='UPDATE' THEN
        validate_mrp_conversion:=ROW(
            NEW.product_id, NEW.mrp, NEW.mrp_uom_conversion_id, NEW.created_at
        ) IS DISTINCT FROM ROW(
            OLD.product_id, OLD.mrp, OLD.mrp_uom_conversion_id, OLD.created_at
        );
    END IF;
    IF validate_mrp_conversion THEN
        SELECT count(*) INTO mrp_conversion_count
          FROM catalog.uom_conversions AS conversion
          JOIN catalog.products AS product
            ON product.org_id=conversion.org_id
           AND product.id=conversion.product_id
         WHERE conversion.org_id=NEW.org_id
           AND conversion.id=NEW.mrp_uom_conversion_id
           AND conversion.product_id=NEW.product_id
           AND conversion.to_uom_code=product.base_uom_code
           AND conversion.status='active'
           AND conversion.valid_from<=NEW.created_at::date
           AND (conversion.valid_until IS NULL OR conversion.valid_until>=NEW.created_at::date);
        IF mrp_conversion_count<>1 THEN
            RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='batch MRP requires the effective marketed-pack to base-UOM conversion for its product';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF (
            OLD.status = 'quarantined' AND NEW.status NOT IN ('quarantined','released','blocked','recalled','expired')
            OR OLD.status = 'released' AND NEW.status NOT IN ('released','blocked','recalled','expired','exhausted')
            OR OLD.status = 'blocked' AND NEW.status NOT IN ('blocked','released','recalled','expired')
            OR OLD.status IN ('recalled','expired','exhausted') AND NEW.status IS DISTINCT FROM OLD.status
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid batch lifecycle transition';
        END IF;
        IF OLD.status='released' AND NEW.status='blocked'
           AND NOT EXISTS (
             SELECT 1 FROM erp_compliance_commands.command_scopes scope
              WHERE scope.backend_pid=pg_catalog.pg_backend_pid()
                AND scope.transaction_id=pg_catalog.txid_current()
                AND scope.scope='temperature_batch_block'
                AND scope.org_id=NEW.org_id AND scope.entity_id=NEW.id
           ) THEN
          RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='released batch blocking requires exact cold-chain command provenance';
        END IF;
        IF ROW(
            NEW.product_id, NEW.batch_number, NEW.lot_kind,
            NEW.manufactured_on, NEW.expires_on, NEW.mrp, NEW.mrp_uom_conversion_id
        ) IS DISTINCT FROM ROW(
            OLD.product_id, OLD.batch_number, OLD.lot_kind,
            OLD.manufactured_on, OLD.expires_on, OLD.mrp, OLD.mrp_uom_conversion_id
        ) AND EXISTS (
            SELECT 1 FROM inventory.stock_ledger_entries AS entry
             WHERE entry.org_id = OLD.org_id AND entry.batch_id = OLD.id
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted batch identity, MRP, and marketed-pack basis are immutable';
        END IF;
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("batches_state_identity_guard_ct", "INSERT OR UPDATE", "inventory.batches", "guard_batch"),
    ]

    definitions["inventory.locations:inventory_locations_invariant_1"] = [
        *_private_trigger_function(
            "guard_location_branch",
            """
DECLARE
    expected_branch uuid;
BEGIN
    IF TG_TABLE_NAME = 'locations' THEN
        IF NEW.branch_id IS DISTINCT FROM OLD.branch_id AND (
            EXISTS (SELECT 1 FROM inventory.stock_ledger_entries e WHERE e.org_id=OLD.org_id AND e.location_id=OLD.id)
            OR EXISTS (SELECT 1 FROM inventory.stock_balances b WHERE b.org_id=OLD.org_id AND b.location_id=OLD.id)
            OR EXISTS (SELECT 1 FROM inventory.reservations r WHERE r.org_id=OLD.org_id AND r.location_id=OLD.id)
            OR EXISTS (SELECT 1 FROM inventory.inventory_document_lines l WHERE l.org_id=OLD.org_id AND (l.from_location_id=OLD.id OR l.to_location_id=OLD.id))
            OR EXISTS (SELECT 1 FROM sales.dispatch_lines l WHERE l.org_id=OLD.org_id AND l.from_location_id=OLD.id)
            OR EXISTS (SELECT 1 FROM sales.return_lines l WHERE l.org_id=OLD.org_id AND l.disposition_location_id=OLD.id)
            OR EXISTS (SELECT 1 FROM procurement.goods_receipt_lines l WHERE l.org_id=OLD.org_id AND l.location_id=OLD.id)
            OR EXISTS (SELECT 1 FROM procurement.purchase_return_lines l WHERE l.org_id=OLD.org_id AND l.from_location_id=OLD.id)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'referenced inventory location branch is immutable';
        END IF;
        RETURN NEW;
    END IF;
    SELECT location.branch_id INTO expected_branch
      FROM inventory.locations AS location
     WHERE location.org_id = NEW.org_id AND location.id = NEW.location_id
     FOR SHARE;
    IF expected_branch IS NULL OR NEW.branch_id IS DISTINCT FROM expected_branch THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'stock fact branch does not match its location';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("locations_branch_guard_ct", "UPDATE", "inventory.locations", "guard_location_branch"),
        _constraint_trigger("stock_ledger_location_branch_guard_ct", "INSERT OR UPDATE", "inventory.stock_ledger_entries", "guard_location_branch"),
        _constraint_trigger("stock_balances_location_branch_guard_ct", "INSERT OR UPDATE", "inventory.stock_balances", "guard_location_branch"),
        _constraint_trigger("reservations_location_branch_guard_ct", "INSERT OR UPDATE", "inventory.reservations", "guard_location_branch"),
    ]

    definitions["inventory.reservations:inventory_reservations_invariant_1"] = [
        *_private_trigger_function(
            "guard_reservation_capacity",
            """
DECLARE
    balance inventory.stock_balances%ROWTYPE;
    location_branch uuid;
    batch_product uuid;
    active_quantity numeric(20,6);
BEGIN
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            NEW.org_id::text || ':' || NEW.location_id::text || ':' ||
            NEW.product_id::text || ':' || NEW.batch_id::text,
            731091327
        )
    );
    SELECT * INTO balance FROM inventory.stock_balances AS stock
     WHERE stock.org_id=NEW.org_id AND stock.location_id=NEW.location_id
       AND stock.product_id=NEW.product_id AND stock.batch_id=NEW.batch_id
     FOR UPDATE;
    SELECT branch_id INTO location_branch FROM inventory.locations
     WHERE org_id=NEW.org_id AND id=NEW.location_id FOR SHARE;
    SELECT product_id INTO batch_product FROM inventory.batches
     WHERE org_id=NEW.org_id AND id=NEW.batch_id FOR SHARE;
    IF NOT FOUND OR balance.location_id IS NULL
       OR NEW.branch_id IS DISTINCT FROM location_branch
       OR NEW.product_id IS DISTINCT FROM batch_product THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reservation stock identity is inconsistent';
    END IF;
    IF NEW.status = 'active' AND NEW.expires_at <= pg_catalog.transaction_timestamp() THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active reservation expiry must be in the future';
    END IF;
    SELECT COALESCE(sum(reservation.quantity), 0)::numeric(20,6) INTO active_quantity
      FROM inventory.reservations AS reservation
     WHERE reservation.org_id=NEW.org_id AND reservation.location_id=NEW.location_id
       AND reservation.product_id=NEW.product_id AND reservation.batch_id=NEW.batch_id
       AND reservation.status='active';
    IF active_quantity > balance.on_hand_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active reservations exceed on-hand quantity';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("reservations_capacity_guard_ct", "INSERT OR UPDATE", "inventory.reservations", "guard_reservation_capacity"),
    ]

    definitions["inventory.reservations:inventory_reservations_invariant_2"] = [
        *_private_trigger_function(
            "guard_reservation_transition",
            """
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reservation history cannot be deleted';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.status <> 'active' THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new reservation must be active';
    END IF;
    IF TG_OP = 'UPDATE' AND (
        OLD.status = 'active' AND NEW.status NOT IN ('active','released','consumed','cancelled','expired')
        OR OLD.status IN ('released','consumed','cancelled','expired') AND NEW IS DISTINCT FROM OLD
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invalid or terminal reservation transition';
    END IF;
    IF TG_OP = 'UPDATE' AND ROW(
        NEW.org_id, NEW.location_id, NEW.product_id, NEW.batch_id,
        NEW.order_line_id, NEW.invoice_line_id, NEW.quantity, NEW.expires_at
    ) IS DISTINCT FROM ROW(
        OLD.org_id, OLD.location_id, OLD.product_id, OLD.batch_id,
        OLD.order_line_id, OLD.invoice_line_id, OLD.quantity, OLD.expires_at
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'reservation claim identity and quantity are immutable';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("reservations_transition_guard_ct", "INSERT OR UPDATE OR DELETE", "inventory.reservations", "guard_reservation_transition"),
    ]

    definitions["inventory.stock_balances:inventory_stock_balances_invariant_2"] = [
        """CREATE FUNCTION "inventory"."available_quantity"(
    requested_org_id uuid, requested_location_id uuid,
    requested_product_id uuid, requested_batch_id uuid
)
RETURNS numeric(20,6)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
    SELECT GREATEST(
        balance.on_hand_quantity - COALESCE((
            SELECT sum(reservation.quantity)
              FROM inventory.reservations AS reservation
             WHERE reservation.org_id = balance.org_id
               AND reservation.location_id = balance.location_id
               AND reservation.product_id = balance.product_id
               AND reservation.batch_id = balance.batch_id
               AND reservation.status = 'active'
               AND reservation.expires_at > pg_catalog.transaction_timestamp()
        ), 0),
        0
    )::numeric(20,6)
      FROM inventory.stock_balances AS balance
     WHERE balance.org_id = requested_org_id
       AND balance.location_id = requested_location_id
       AND balance.product_id = requested_product_id
       AND balance.batch_id = requested_batch_id
$function$""",
        'ALTER FUNCTION "inventory"."available_quantity"(uuid,uuid,uuid,uuid) OWNER TO "erp_migration_owner"',
        'REVOKE ALL ON FUNCTION "inventory"."available_quantity"(uuid,uuid,uuid,uuid) FROM PUBLIC',
        'GRANT EXECUTE ON FUNCTION "inventory"."available_quantity"(uuid,uuid,uuid,uuid) TO "erp_app", "erp_runtime"',
    ]

    definitions["sales.dispatch_lines:sales_dispatch_lines_invariant_1"] = [
        *_private_trigger_function(
            "guard_dispatch_line",
            """
DECLARE
    source sales.order_lines%ROWTYPE;
    dispatch sales.dispatches%ROWTYPE;
    batch_product uuid;
    location_branch uuid;
    billed_total numeric(20,6);
    free_total numeric(20,6);
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO dispatch FROM sales.dispatches WHERE org_id=OLD.org_id AND id=OLD.dispatch_id FOR SHARE;
        IF dispatch.status IN ('posted','reversed') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted dispatch line is immutable';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO dispatch FROM sales.dispatches WHERE org_id=NEW.org_id AND id=NEW.dispatch_id FOR SHARE;
    IF dispatch.status IN ('posted','reversed')
       AND (TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted dispatch line is immutable';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text || ':' || NEW.order_line_id::text, 193701063));
    SELECT * INTO source FROM sales.order_lines WHERE org_id=NEW.org_id AND id=NEW.order_line_id FOR SHARE;
    SELECT product_id INTO batch_product FROM inventory.batches WHERE org_id=NEW.org_id AND id=NEW.batch_id FOR SHARE;
    SELECT branch_id INTO location_branch FROM inventory.locations WHERE org_id=NEW.org_id AND id=NEW.from_location_id FOR SHARE;
    IF source.id IS NULL OR source.line_kind <> 'product'
       OR source.product_id IS DISTINCT FROM NEW.product_id
       OR batch_product IS DISTINCT FROM NEW.product_id
       OR location_branch IS DISTINCT FROM dispatch.branch_id
       OR source.uom_code IS DISTINCT FROM NEW.uom_code
       OR NEW.base_billed_quantity IS DISTINCT FROM round(NEW.billed_quantity * source.uom_conversion_factor, 6)
       OR NEW.base_free_quantity IS DISTINCT FROM round(NEW.free_quantity * source.uom_conversion_factor, 6) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'dispatch line does not match approved product, lot, branch, or UOM facts';
    END IF;
    SELECT COALESCE(sum(line.base_billed_quantity),0), COALESCE(sum(line.base_free_quantity),0)
      INTO billed_total, free_total
      FROM sales.dispatch_lines AS line
      JOIN sales.dispatches AS parent ON parent.org_id=line.org_id AND parent.id=line.dispatch_id
     WHERE line.org_id=NEW.org_id AND line.order_line_id=NEW.order_line_id AND parent.status<>'cancelled';
    IF billed_total > source.base_billed_quantity OR free_total > source.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'cumulative dispatch exceeds approved billed or free quantity';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("dispatch_lines_source_cap_guard_ct", "INSERT OR UPDATE OR DELETE", "sales.dispatch_lines", "guard_dispatch_line"),
    ]

    definitions["sales.invoice_dispatch_allocations:sales_invoice_dispatch_allocations_invariant_1"] = [
        *_private_trigger_function(
            "guard_invoice_dispatch_allocation",
            """
DECLARE
    invoice_line sales.invoice_lines%ROWTYPE;
    dispatch_line sales.dispatch_lines%ROWTYPE;
    invoice_status text;
    invoice_billed numeric(20,6);
    invoice_free numeric(20,6);
    dispatch_billed numeric(20,6);
    dispatch_free numeric(20,6);
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT invoice.status INTO invoice_status FROM sales.invoice_lines line
        JOIN sales.invoices invoice ON invoice.org_id=line.org_id AND invoice.id=line.invoice_id
        WHERE line.org_id=OLD.org_id AND line.id=OLD.invoice_line_id FOR SHARE OF invoice;
        IF invoice_status IN ('posted','reversed') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted invoice allocation is immutable';
        END IF;
        RETURN OLD;
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text || ':invoice:' || NEW.invoice_line_id::text, 81957013));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text || ':dispatch:' || NEW.dispatch_line_id::text, 81957013));
    SELECT line.* INTO invoice_line FROM sales.invoice_lines line
    JOIN sales.invoices invoice ON invoice.org_id=line.org_id AND invoice.id=line.invoice_id
    WHERE line.org_id=NEW.org_id AND line.id=NEW.invoice_line_id FOR SHARE OF line, invoice;
    SELECT invoice.status INTO invoice_status FROM sales.invoices invoice
    WHERE invoice.org_id=NEW.org_id AND invoice.id=invoice_line.invoice_id;
    SELECT * INTO dispatch_line FROM sales.dispatch_lines WHERE org_id=NEW.org_id AND id=NEW.dispatch_line_id FOR SHARE;
    IF invoice_status IN ('posted','reversed')
       AND (TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted invoice allocation is immutable';
    END IF;
    IF invoice_line.id IS NULL OR dispatch_line.id IS NULL
       OR invoice_line.line_kind <> 'product'
       OR invoice_line.product_id IS DISTINCT FROM dispatch_line.product_id
       OR invoice_line.order_line_id IS DISTINCT FROM dispatch_line.order_line_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invoice allocation source product or order line mismatch';
    END IF;
    SELECT COALESCE(sum(allocated_base_billed_quantity),0), COALESCE(sum(allocated_base_free_quantity),0)
      INTO invoice_billed, invoice_free FROM sales.invoice_dispatch_allocations
     WHERE org_id=NEW.org_id AND invoice_line_id=NEW.invoice_line_id;
    SELECT COALESCE(sum(allocated_base_billed_quantity),0), COALESCE(sum(allocated_base_free_quantity),0)
      INTO dispatch_billed, dispatch_free FROM sales.invoice_dispatch_allocations
     WHERE org_id=NEW.org_id AND dispatch_line_id=NEW.dispatch_line_id;
    IF invoice_billed > invoice_line.base_billed_quantity OR invoice_free > invoice_line.base_free_quantity
       OR dispatch_billed > dispatch_line.base_billed_quantity OR dispatch_free > dispatch_line.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'cumulative invoice/dispatch allocation exceeds either source line';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("invoice_dispatch_allocations_cap_guard_ct", "INSERT OR UPDATE OR DELETE", "sales.invoice_dispatch_allocations", "guard_invoice_dispatch_allocation"),
    ]

    definitions["sales.invoices:sales_invoices_invariant_2"] = [
        *_private_trigger_function(
            "guard_direct_invoice_issue",
            """
DECLARE
    target_invoice uuid;
    target_org uuid;
    invoice_branch uuid;
    direct_count bigint;
BEGIN
    IF TG_TABLE_NAME = 'inventory_documents' THEN
        target_invoice := CASE WHEN TG_OP='DELETE' THEN OLD.sales_invoice_id ELSE NEW.sales_invoice_id END;
        target_org := CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END;
    ELSE
        SELECT line.invoice_id, line.org_id INTO target_invoice, target_org
          FROM sales.invoice_lines AS line
         WHERE line.org_id = CASE WHEN TG_OP='DELETE' THEN OLD.org_id ELSE NEW.org_id END
           AND line.id = CASE WHEN TG_OP='DELETE' THEN OLD.invoice_line_id ELSE NEW.invoice_line_id END;
    END IF;
    IF target_invoice IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_org::text || ':' || target_invoice::text, 470893037));
    SELECT branch_id INTO invoice_branch FROM sales.invoices WHERE org_id=target_org AND id=target_invoice FOR SHARE;
    SELECT count(*) INTO direct_count FROM inventory.inventory_documents
     WHERE org_id=target_org AND sales_invoice_id=target_invoice;
    IF direct_count > 1 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'invoice owns more than one direct inventory issue';
    END IF;
    IF EXISTS (
        SELECT 1 FROM sales.invoice_dispatch_allocations allocation
        JOIN sales.invoice_lines line ON line.org_id=allocation.org_id AND line.id=allocation.invoice_line_id
        JOIN inventory.inventory_document_lines issue_line
          ON issue_line.org_id=line.org_id AND issue_line.sales_invoice_line_id=line.id
        JOIN inventory.inventory_documents issue_document
          ON issue_document.org_id=issue_line.org_id AND issue_document.id=issue_line.inventory_document_id
         AND issue_document.sales_invoice_id=target_invoice
        WHERE line.org_id=target_org AND line.invoice_id=target_invoice
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'one invoice line cannot be both dispatch allocated and directly issued';
    END IF;
    IF TG_TABLE_NAME = 'inventory_documents' AND TG_OP <> 'DELETE' THEN
        IF NEW.sales_invoice_id IS NOT NULL
           AND (NEW.document_type <> 'sales_issue' OR NEW.branch_id IS DISTINCT FROM invoice_branch) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'direct invoice stock document type or branch is invalid';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("inventory_documents_direct_invoice_guard_ct", "INSERT OR UPDATE OR DELETE", "inventory.inventory_documents", "guard_direct_invoice_issue"),
        _constraint_trigger("invoice_allocations_direct_issue_guard_ct", "INSERT OR UPDATE OR DELETE", "sales.invoice_dispatch_allocations", "guard_direct_invoice_issue"),
    ]

    definitions["procurement.goods_receipt_lines:procurement_goods_receipt_lines_invariant_1"] = [
        *_private_trigger_function(
            "guard_goods_receipt_line",
            """
DECLARE
    source procurement.purchase_order_lines%ROWTYPE;
    receipt procurement.goods_receipts%ROWTYPE;
    batch_product uuid;
    location_branch uuid;
    billed_total numeric(20,6);
    free_total numeric(20,6);
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO receipt FROM procurement.goods_receipts WHERE org_id=OLD.org_id AND id=OLD.goods_receipt_id FOR SHARE;
        IF receipt.status IN ('posted','reversed') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted goods receipt line is immutable';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO receipt FROM procurement.goods_receipts WHERE org_id=NEW.org_id AND id=NEW.goods_receipt_id FOR SHARE;
    IF receipt.status IN ('posted','reversed')
       AND (TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted goods receipt line is immutable';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text || ':' || NEW.purchase_order_line_id::text, 95703173));
    SELECT * INTO source FROM procurement.purchase_order_lines WHERE org_id=NEW.org_id AND id=NEW.purchase_order_line_id FOR SHARE;
    SELECT product_id INTO batch_product FROM inventory.batches WHERE org_id=NEW.org_id AND id=NEW.batch_id FOR SHARE;
    SELECT branch_id INTO location_branch FROM inventory.locations WHERE org_id=NEW.org_id AND id=NEW.location_id FOR SHARE;
    IF source.id IS NULL OR source.line_kind <> 'product'
       OR source.product_id IS DISTINCT FROM NEW.product_id
       OR batch_product IS DISTINCT FROM NEW.product_id
       OR location_branch IS DISTINCT FROM receipt.branch_id
       OR source.uom_code IS DISTINCT FROM NEW.uom_code
       OR NEW.base_accepted_quantity IS DISTINCT FROM round(NEW.accepted_quantity * source.uom_conversion_factor, 6)
       OR NEW.base_free_quantity IS DISTINCT FROM round(NEW.free_quantity * source.uom_conversion_factor, 6) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'receipt line does not match ordered product, lot, branch, or UOM facts';
    END IF;
    SELECT COALESCE(sum(line.base_accepted_quantity),0),
           COALESCE(sum(line.base_free_quantity),0)
      INTO billed_total, free_total
      FROM procurement.goods_receipt_lines AS line
      JOIN procurement.goods_receipts AS parent ON parent.org_id=line.org_id AND parent.id=line.goods_receipt_id
      JOIN procurement.purchase_order_lines AS source_line ON source_line.org_id=line.org_id AND source_line.id=line.purchase_order_line_id
     WHERE line.org_id=NEW.org_id AND line.purchase_order_line_id=NEW.purchase_order_line_id
       AND (parent.status='posted' OR parent.id=NEW.goods_receipt_id);
    IF billed_total > source.base_billed_quantity OR free_total > source.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'cumulative receipt exceeds ordered billed or free quantity';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("goods_receipt_lines_source_cap_guard_ct", "INSERT OR UPDATE OR DELETE", "procurement.goods_receipt_lines", "guard_goods_receipt_line"),
    ]

    definitions["procurement.supplier_invoice_receipt_allocations:procurement_supplier_invoice_receipt_allocations_invariant_1"] = [
        *_private_trigger_function(
            "guard_supplier_receipt_allocation",
            """
DECLARE
    invoice_line procurement.supplier_invoice_lines%ROWTYPE;
    receipt_line procurement.goods_receipt_lines%ROWTYPE;
    invoice_status text;
    invoice_billed numeric(20,6);
    invoice_free numeric(20,6);
    receipt_billed numeric(20,6);
    receipt_free numeric(20,6);
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT invoice.status INTO invoice_status FROM procurement.supplier_invoice_lines line
        JOIN procurement.supplier_invoices invoice ON invoice.org_id=line.org_id AND invoice.id=line.supplier_invoice_id
        WHERE line.org_id=OLD.org_id AND line.id=OLD.supplier_invoice_line_id FOR SHARE OF invoice;
        IF invoice_status IN ('posted','reversed') THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted supplier invoice allocation is immutable';
        END IF;
        RETURN OLD;
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text || ':supplier_invoice:' || NEW.supplier_invoice_line_id::text, 630195401));
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.org_id::text || ':receipt:' || NEW.goods_receipt_line_id::text, 630195401));
    SELECT line.* INTO invoice_line FROM procurement.supplier_invoice_lines line
    JOIN procurement.supplier_invoices invoice ON invoice.org_id=line.org_id AND invoice.id=line.supplier_invoice_id
    WHERE line.org_id=NEW.org_id AND line.id=NEW.supplier_invoice_line_id FOR SHARE OF line, invoice;
    SELECT invoice.status INTO invoice_status FROM procurement.supplier_invoices invoice
    WHERE invoice.org_id=NEW.org_id AND invoice.id=invoice_line.supplier_invoice_id;
    SELECT * INTO receipt_line FROM procurement.goods_receipt_lines WHERE org_id=NEW.org_id AND id=NEW.goods_receipt_line_id FOR SHARE;
    IF invoice_status IN ('posted','reversed')
       AND (TG_OP = 'INSERT' OR NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'posted supplier invoice allocation is immutable';
    END IF;
    IF invoice_line.id IS NULL OR receipt_line.id IS NULL
       OR invoice_line.line_kind <> 'product'
       OR invoice_line.product_id IS DISTINCT FROM receipt_line.product_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'supplier invoice allocation product mismatch';
    END IF;
    SELECT COALESCE(sum(allocated_base_billed_quantity),0), COALESCE(sum(allocated_base_free_quantity),0)
      INTO invoice_billed, invoice_free FROM procurement.supplier_invoice_receipt_allocations
     WHERE org_id=NEW.org_id AND supplier_invoice_line_id=NEW.supplier_invoice_line_id;
    SELECT COALESCE(sum(allocated_base_billed_quantity),0), COALESCE(sum(allocated_base_free_quantity),0)
      INTO receipt_billed, receipt_free FROM procurement.supplier_invoice_receipt_allocations
     WHERE org_id=NEW.org_id AND goods_receipt_line_id=NEW.goods_receipt_line_id;
    IF invoice_billed > invoice_line.base_billed_quantity OR invoice_free > invoice_line.base_free_quantity
       OR receipt_billed > receipt_line.base_accepted_quantity OR receipt_free > receipt_line.base_free_quantity THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'cumulative supplier-invoice/receipt allocation exceeds either source line';
    END IF;
    RETURN NEW;
END
""",
        ),
        _constraint_trigger("supplier_receipt_allocations_cap_guard_ct", "INSERT OR UPDATE OR DELETE", "procurement.supplier_invoice_receipt_allocations", "guard_supplier_receipt_allocation"),
    ]

    return definitions


BLOCKED_REASONS = {
    "procurement.purchase_order_advance_allocations:purchase_order_advance_allocations_cross_row_guard": "Supplier-advance allocation requires a locked posted payment, approved product PO line, exact prepayment open item/accounting evidence, full payment allocation, and compensating reversal command.",
    "inventory.inventory_document_lines:inventory_inventory_document_lines_invariant_1": "Full validation is part of the missing atomic inventory posting command; a row trigger cannot prove source-command ownership, effective UOM lineage, and locked cost state together.",
    "inventory.inventory_document_lines:inventory_inventory_document_lines_invariant_2": "Exact transfer ledger emission and zero-variance suppression require the same atomic inventory posting command that owns ledger and projection writes.",
    "inventory.inventory_document_lines:inventory_inventory_document_lines_landed_cost_allocation": "The catalog lacks persisted eligible variance and capitalized-charge allocation authority needed to prove exact weights and signed landed-cost amounts.",
    "inventory.inventory_documents:inventory_inventory_documents_invariant_1": "No reviewed atomic inventory posting command exists yet to recompute totals, freeze evidence, emit the complete ledger, and replay idempotently as one transaction.",
    "inventory.inventory_documents:inventory_inventory_documents_invariant_2": "Source ownership and reversal require the missing inventory posting command plus an idempotency claim link; triggers alone cannot prove exactly-once command ownership.",
    "inventory.inventory_documents:inventory_inventory_documents_landed_cost": "The supplier invoice does not persist an approved eligible price-variance/capitalized-charge allocation set, so exact MWA cost adjustment cannot be reconstructed honestly.",
    "inventory.inventory_documents:inventory_inventory_documents_physical_logistics": "Complete physical-movement snapshots, branch/location consistency and live transporter provenance must be locked and frozen by the atomic inventory posting command.",
    "inventory.stock_balances:inventory_stock_balances_invariant_1": "Projection-only mutation, exact signed ledger folding, and last-entry ordering require a single reviewed ledger projector command and corresponding direct-write privilege revocation.",
    "inventory.stock_ledger_entries:inventory_stock_ledger_entries_invariant_1": "The sole posting function and locked costing-state derivation are not implemented; a session flag or trigger would create bypassable duplicate mutation ownership.",
    "inventory.stock_ledger_entries:inventory_stock_ledger_entries_invariant_2": "Exact per-line ledger cardinality and reversal uniqueness must be enforced inside the missing atomic posting command, including idempotent replay and inverse evidence creation.",
    "inventory.stock_ledger_entries:inventory_stock_ledger_entries_landed_cost": "Exact nonnegative MWA projection after a zero-quantity value adjustment requires the missing serialized ledger projector and persisted eligible allocation authority.",
    "procurement.goods_receipts:procurement_goods_receipts_invariant_1": "Posting fan-out to exactly one typed inventory receipt requires a reviewed idempotent procurement receipt command; a row trigger must not become a second stock writer.",
    "procurement.purchase_order_lines:procurement_purchase_order_lines_invariant_1": "The PostgreSQL layer does not implement the canonical Decimal calculation engine or persist a signed calculation input/output digest, so exact engine equivalence cannot be proved.",
    "procurement.purchase_orders:procurement_purchase_orders_invariant_1": "Approval needs an atomic canonical Decimal recomputation and immutable calculation digest; aggregate-only triggers would not prove the complete pricing and tax rule.",
    "procurement.purchase_return_lines:procurement_purchase_return_lines_invariant_1": "Exact cumulative reversal residuals require persisted original per-allocation value components and a reviewed return command; those facts are absent from the current catalog.",
    "procurement.purchase_returns:procurement_purchase_returns_invariant_1": "Return calculation and fan-out to tax, payable, accounting, and inventory require one reviewed idempotent posting command spanning domains.",
    "procurement.supplier_invoice_lines:procurement_supplier_invoice_lines_invariant_1": "The database lacks the canonical Decimal engine and approved landed-cost allocation authority needed to prove every calculation and capitalize/expense outcome.",
    "procurement.supplier_invoices:procurement_supplier_invoices_invariant_1": "Supplier invoice posting requires one idempotent command spanning exact Decimal tax calculation, tax facts, payable, accounting, and landed-cost eligibility.",
    "sales.invoice_lines:sales_invoice_lines_invariant_1": "The PostgreSQL layer does not implement the canonical Decimal calculation engine or persist a signed calculation input/output digest, so exact engine equivalence cannot be proved.",
    "sales.invoices:sales_invoices_invariant_1": "Invoice posting requires one idempotent command spanning exact Decimal tax calculation, tax facts, receivable, accounting, and immutable fiscal evidence.",
    "sales.order_lines:sales_order_lines_invariant_1": "The PostgreSQL layer does not implement the canonical Decimal calculation engine or persist a signed calculation input/output digest, so exact engine equivalence cannot be proved.",
    "sales.orders:sales_orders_invariant_1": "Approval needs an atomic canonical Decimal recomputation and immutable calculation digest; aggregate-only triggers would not prove the complete pricing and tax rule.",
    "sales.dispatches:sales_dispatches_invariant_1": "Posting fan-out to exactly one typed inventory issue requires a reviewed idempotent sales dispatch command; a row trigger must not become a second stock writer.",
    "sales.return_lines:sales_return_lines_invariant_1": "Exact cumulative reversal residuals require persisted original per-allocation value components and a reviewed return command; those facts are absent from the current catalog.",
    "sales.returns:sales_returns_invariant_1": "Return calculation and fan-out to tax, receivable, accounting, and inventory require one reviewed idempotent posting command spanning domains.",
}


def generated_artifacts() -> tuple[str, str]:
    invariants = _load_invariants()
    definitions = _definitions()
    unknown = sorted(set(definitions) - set(invariants))
    missing = sorted(set(invariants) - set(definitions) - set(BLOCKED_REASONS))
    stale = sorted(set(BLOCKED_REASONS) - set(invariants))
    if unknown or missing or stale:
        raise ContractError(
            f"trade invariant disposition mismatch: unknown={unknown}, missing={missing}, stale={stale}"
        )

    entries: list[dict[str, Any]] = []
    for key in sorted(definitions):
        invariant = invariants[key]
        entries.append(
            {
                "enforcement": invariant["enforcement"],
                "invariant": invariant["invariant"],
                "requirement_sha256": hashlib.sha256(invariant["rule"].encode("utf-8")).hexdigest(),
                "reviewed": True,
                "statements": definitions[key],
                "table": invariant["table"],
            }
        )
    mapping = {"mapping_version": "1.0.0", "enforcements": entries, "platform_enforcements": []}
    mapping_text = json.dumps(mapping, indent=2, sort_keys=True) + "\n"
    catalog_payload = {
        key: {"enforcement": value["enforcement"], "rule": value["rule"]}
        for key, value in sorted(invariants.items())
    }
    manifest = {
        "manifest_version": "1.0.0",
        "postgresql": "15+",
        "trade_domains": list(TRADE_DOMAINS),
        "catalog_invariant_sha256": hashlib.sha256(
            json.dumps(catalog_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
        "mapping_file": MAPPING_PATH.name,
        "mapping_sha256": hashlib.sha256(mapping_text.encode("utf-8")).hexdigest(),
        "resolved_count": len(definitions),
        "resolved_invariants": sorted(definitions),
        "blocked_count": len(BLOCKED_REASONS),
        "blocked_invariants": {
            key: {"reason": BLOCKED_REASONS[key]} for key in sorted(BLOCKED_REASONS)
        },
        "mutation_ownership": {
            "inventory_ledger_writers_added": 0,
            "inventory_projector_writers_added": 0,
            "posting_commands_added": 0,
            "reason": "Posting remains blocked until one reviewed idempotent command owns each cross-domain mutation.",
        },
        "security": {
            "function_schema": FUNCTION_SCHEMA,
            "dynamic_sql": False,
            "trigger_functions_public_execute": False,
            "runtime_callable_functions": ["inventory.available_quantity(uuid,uuid,uuid,uuid)"],
        },
    }
    return mapping_text, json.dumps(manifest, indent=2, sort_keys=True) + "\n"


def main() -> int:
    mapping_text, manifest_text = generated_artifacts()
    ROOT.mkdir(parents=True, exist_ok=True)
    MAPPING_PATH.write_text(mapping_text, encoding="utf-8")
    MANIFEST_PATH.write_text(manifest_text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
