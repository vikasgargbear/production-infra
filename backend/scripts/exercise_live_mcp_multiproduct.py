"""Exercise a two-distinct-product sales chain through the deployed public MCP."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

from tests.live_canonical.config import load_live_config
from tests.live_canonical.transport import McpActionClient, _json


FIRST_PRODUCT = "d3000000-0000-7000-8000-000000000015"
FIRST_UOM = "d3000000-0000-7000-8000-000000000016"
SUPPLIER = "d3200000-0000-7000-8000-000000000002"
CUSTOMER = "d3000000-0000-7000-8000-000000000011"
SALEABLE = "d3200000-0000-7000-8000-000000000006"
QUARANTINE = "d3200000-0000-7000-8000-000000000007"


def required(value: Any, name: str) -> Any:
    if value in (None, "", []):
        raise RuntimeError(f"live multi-product MCP response omitted {name}")
    return value


def document(payload: dict[str, Any]) -> dict[str, Any]:
    value = payload.get("document")
    if not isinstance(value, dict):
        raise RuntimeError("canonical MCP document readback was not matched")
    return value


def list_tool(client: McpActionClient, tool: str, arguments: dict[str, Any]) -> list[dict[str, Any]]:
    request_id = str(uuid4())
    response = client.sessions["requester"].post(
        client.config.mcp_url,
        json={"jsonrpc": "2.0", "id": request_id, "method": "tools/call",
              "params": {"name": tool, "arguments": arguments}},
        timeout=client.config.timeout_seconds,
    )
    response.raise_for_status()
    envelope = _json(response)
    result = envelope.get("result", {})
    candidates: Any = result.get("structuredContent")
    if isinstance(candidates, dict) and isinstance(candidates.get("result"), list):
        candidates = candidates["result"]
    if not isinstance(candidates, list):
        for block in result.get("content", []):
            if block.get("type") != "text":
                continue
            decoded = json.loads(block["text"])
            if isinstance(decoded, list):
                candidates = decoded
                break
    if not isinstance(candidates, list) or not all(isinstance(row, dict) for row in candidates):
        raise RuntimeError(f"{tool} did not return a JSON list")
    return candidates


def command(client: McpActionClient, tool: str, payload: dict[str, Any], token: str,
            *, separate: bool = False) -> tuple[str, str, dict[str, Any]]:
    prepared = client.call(tool, payload)
    command_id = str(required(prepared.get("command_request_id"), "command_request_id"))
    preview_hash = str(required(prepared.get("preview_hash"), "preview_hash"))
    approved = client.call(
        "erp_operation_approve",
        {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "approval_intent": "approve",
            "idempotency_key": f"live-multi-approve-{token}-{tool}",
        },
        actor="reviewer" if separate else "requester",
    )
    if approved.get("status") != "approved":
        raise RuntimeError(f"{tool} did not reach approved status")
    executed = client.call(
        "erp_operation_execute",
        {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "idempotency_key": f"live-multi-execute-{token}-{tool}",
        },
    )
    if executed.get("status") != "succeeded":
        raise RuntimeError(f"{tool} did not reach succeeded status")
    replay = client.call(
        "erp_operation_execute",
        {
            "command_request_id": command_id,
            "preview_hash": preview_hash,
            "idempotency_key": f"live-multi-execute-{token}-{tool}",
        },
    )
    if replay.get("idempotency_replayed") is not True:
        raise RuntimeError(f"{tool} execute replay was not idempotent")
    return command_id, str(required(executed.get("resource_id"), "resource_id")), prepared


def commercial_line(product_id: str, uom_id: str, quantity: str, rate: str) -> dict[str, Any]:
    return {
        "product_id": product_id,
        "uom_conversion_id": uom_id,
        "billed_quantity": quantity,
        "free_quantity": "0",
        "free_supply_tax_treatment": "excluded_from_taxable_value",
        "quoted_unit_rate": rate,
        "price_basis": "tax_exclusive",
        "line_discount": {
            "line_discount_kind": "none",
            "line_discount_basis": "taxable_value",
            "line_discount_value": "0",
        },
        "document_discount_eligible": True,
    }


def main() -> None:
    config = load_live_config()
    client = McpActionClient.build(config)
    token = os.environ["LIVE18_RUN_TOKEN"].replace("-", "x")
    today = date.today().isoformat()

    first_setup = client.call("erp_product_setup_get", {"product_id": FIRST_PRODUCT})
    manufacturer = str(required(first_setup.get("manufacturer_party_id"), "manufacturer_party_id"))
    created = client.call("erp_product_create", {
        "product_name": f"Live MCP second pharmacy carton {token}",
        "generic_name": "Secondary pharmacy carton",
        "product_kind": "consumable",
        "idempotency_key": f"live-multi-product-create-{token}",
    })
    second_product = str(required(created.get("product_id"), "second product id"))
    configured = client.call("erp_product_setup", {
        "product_id": second_product,
        "row_version": int(created["row_version"]),
        "manufacturer_party_id": manufacturer,
        "base_uom_code": "EA",
        "hsn_code": "481910",
        "cold_chain_required": False,
        "pack_conversions": [],
        "ingredients": [],
        "idempotency_key": f"live-multi-product-setup-{token}",
    })
    client.call("erp_product_activate", {
        "product_id": second_product,
        "row_version": int(configured["row_version"]),
        "manufacturer_traceability_code": f"LIVE-MCP-{token}"[:128],
        "idempotency_key": f"live-multi-product-activate-{token}",
    })
    second_search = list_tool(client, "erp_product_search", {"q": token, "limit": 20, "offset": 0})
    matches = [row for row in second_search
               if str(row.get("product_id")) == second_product]
    if len(matches) != 1:
        raise RuntimeError("activated second MCP product did not resolve exactly once")
    conversions = matches[0].get("uom_conversions", [])
    second_uom = str(required(next((row.get("uom_conversion_id") for row in conversions
                                    if row.get("from_uom_code") == "EA"), None), "second EA UOM"))

    no_discount = {"document_discount_kind": "none", "document_discount_basis": "taxable_value", "document_discount_value": "0"}
    common = {"branch_id": str(config.test_branch_id), "document_discount": no_discount,
              "rounding_policy": "none", "zero_rated_payment_mode": "not_applicable"}
    po_command, po_id, _ = command(client, "erp_purchase_order_prepare", {
        **common, "idempotency_key": f"live-multi-po-{token}", "order_date": today,
        "expected_on": (date.today() + timedelta(days=2)).isoformat(),
        "supplier_account_id": SUPPLIER, "tax_charge_mechanism": "normal",
        "lines": [commercial_line(FIRST_PRODUCT, FIRST_UOM, "6", "100.00"),
                  commercial_line(second_product, second_uom, "7", "80.00")],
    }, token)
    po = document(client.call("erp_purchase_order_get", {
        "branch_id": str(config.test_branch_id), "purchase_order_id": po_id,
        "purchase_order_number": None, "fiscal_year": None,
    }))
    po_lines = po.get("lines", [])
    if {str(row.get("product_id")) for row in po_lines} != {FIRST_PRODUCT, second_product}:
        raise RuntimeError("posted purchase order did not preserve two distinct products")

    grn_lines = []
    for index, row in enumerate(po_lines, start=1):
        grn_lines.append({
            "purchase_order_line_id": str(row["purchase_order_line_id"]),
            "batches": [{
                "manufacturer_batch_number": f"LIVE-MULTI-{token}-{index}",
                "manufactured_on": today,
                "expires_on": (date.today() + timedelta(days=730)).isoformat(),
                "mrp": "150.00", "mrp_uom_conversion_id": FIRST_UOM if str(row["product_id"]) == FIRST_PRODUCT else second_uom,
                "received_quantity": str(row["remaining_receipt_base_billed_quantity"]),
                "accepted_quantity": str(row["remaining_receipt_base_billed_quantity"]),
                "rejected_quantity": "0", "free_quantity": "0",
                "qc_status": "accepted", "to_location_id": SALEABLE,
            }],
        })
    _, grn_id, _ = command(client, "erp_goods_receipt_prepare", {
        "idempotency_key": f"live-multi-grn-{token}", "branch_id": str(config.test_branch_id),
        "received_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "purchase_order_id": po_id, "supplier_account_id": SUPPLIER,
        "supplier_challan_number": f"LIVE-MULTI-{token}", "supplier_challan_date": today,
        "lines": grn_lines,
    }, token)
    grn = document(client.call("erp_goods_receipt_get", {
        "branch_id": str(config.test_branch_id), "goods_receipt_id": grn_id,
        "goods_receipt_number": None, "fiscal_year": None,
    }))
    grn_by_product = {str(row["product_id"]): row for row in grn.get("lines", [])}
    if set(grn_by_product) != {FIRST_PRODUCT, second_product}:
        raise RuntimeError("posted GRN did not preserve two distinct products")

    customers = client.call("erp_customer_search", {"search_term": "CUST-DEMO-001", "limit": 20})
    customer_rows = customers.get("results", customers.get("records", []))
    customer = next(row for row in customer_rows if str(row.get("customer_account_id")) == CUSTOMER)
    addresses = customer.get("primary_delivery_addresses") or []
    if len(addresses) != 1:
        raise RuntimeError("canonical customer did not resolve one delivery address")
    address_id = str(required(addresses[0].get("delivery_address_id"), "delivery address"))
    address_version = str(required(addresses[0].get("delivery_address_row_version"), "delivery address version"))
    _, order_id, _ = command(client, "erp_sales_order_prepare", {
        **common, "idempotency_key": f"live-multi-so-{token}", "order_date": today,
        "requested_delivery_date": today, "customer_account_id": CUSTOMER,
        "delivery_address_id": address_id, "delivery_address_row_version": address_version,
        "lines": [commercial_line(FIRST_PRODUCT, FIRST_UOM, "2", "125.00"),
                  commercial_line(second_product, second_uom, "3", "95.00")],
    }, token)
    order = document(client.call("erp_sales_order_get", {
        "branch_id": str(config.test_branch_id), "sales_order_id": order_id,
        "order_number": None, "fiscal_year": None,
    }))
    order_lines = order.get("lines", [])
    batches = {}
    for product_id in (FIRST_PRODUCT, second_product):
        batch_result = client.call("erp_stock_batch_search", {
            "branch_id": str(config.test_branch_id), "product_id": product_id,
            "location_id": SALEABLE, "limit": 50,
        })
        candidates = batch_result.get("results", batch_result.get("records", []))
        batches[product_id] = str(required(candidates[0].get("batch_id") if candidates else None, f"batch for {product_id}"))
    dispatch_lines = []
    quantities = {FIRST_PRODUCT: "2", second_product: "3"}
    for row in order_lines:
        product_id = str(row["product_id"])
        quantity = quantities[product_id]
        dispatch_lines.append({
            "sales_order_line_id": str(row["order_line_id"]), "billed_quantity": quantity,
            "free_quantity": "0", "batch_allocations": [{"batch_id": batches[product_id],
            "billed_quantity": quantity, "free_quantity": "0"}],
        })
    dispatch_command, dispatch_id, _ = command(client, "erp_sales_dispatch_prepare", {
        "idempotency_key": f"live-multi-dispatch-{token}", "branch_id": str(config.test_branch_id),
        "dispatch_date": today, "sales_order_id": order_id, "from_location_id": SALEABLE,
        "lines": dispatch_lines,
    }, token)
    dispatch = client.call("erp_sales_dispatch_readback", {"command_request_id": dispatch_command})
    dispatch_rows = dispatch.get("lines") or dispatch.get("dispatch_lines") or []
    if len(dispatch_rows) != 2:
        raise RuntimeError("MCP dispatch readback did not contain two product lines")

    invoice_lines = []
    for row in dispatch_rows:
        product_id = str(row["product_id"])
        quantity = quantities[product_id]
        line = commercial_line(product_id, FIRST_UOM if product_id == FIRST_PRODUCT else second_uom, quantity, "125.00" if product_id == FIRST_PRODUCT else "95.00")
        line.update({"fulfillment_source": "dispatch_allocated", "dispatch_allocations": [{
            "dispatch_line_id": str(row["dispatch_line_id"]),
            "allocated_base_billed_quantity": quantity, "allocated_base_free_quantity": "0",
        }]})
        invoice_lines.append(line)
    invoice_command, invoice_id, _ = command(client, "erp_sales_invoice_prepare", {
        **common, "idempotency_key": f"live-multi-invoice-{token}", "invoice_date": today,
        "customer_account_id": CUSTOMER, "delivery_address_id": address_id,
        "delivery_address_row_version": address_version, "tax_charge_mechanism": "normal",
        "lines": invoice_lines,
    }, token)
    invoice = document(client.call("erp_sales_invoice_get", {
        "branch_id": str(config.test_branch_id), "sales_invoice_id": invoice_id,
        "invoice_number": None, "fiscal_year": None,
    }))
    invoice_rows = invoice.get("lines", [])
    if {str(row.get("product_id")) for row in invoice_rows} != {FIRST_PRODUCT, second_product}:
        raise RuntimeError("MCP invoice readback did not preserve two distinct products")

    return_lines = []
    for row in invoice_rows:
        allocation = required((row.get("dispatch_allocations") or [None])[0], "invoice dispatch allocation")
        return_lines.append({
            "original_invoice_line_id": str(row["invoice_line_id"]),
            "fulfillment_source": "dispatch_allocated",
            "invoice_dispatch_allocation_id": str(allocation["invoice_dispatch_allocation_id"]),
            "billed_quantity": "1", "free_quantity": "0",
            "batch_allocation": {"batch_id": str(allocation["batch_id"]), "billed_quantity": "1", "free_quantity": "0"},
            "to_location_id": QUARANTINE, "return_condition": "sealed_resaleable",
        })
    return_command, return_id, _ = command(client, "erp_sales_return_prepare", {
        "idempotency_key": f"live-multi-return-{token}", "branch_id": str(config.test_branch_id),
        "return_date": today, "original_invoice_id": invoice_id,
        "reason_code": "customer_rejection", "gst_tax_treatment": "commercial_only",
        "lines": return_lines,
    }, token, separate=True)
    return_readback = client.call("erp_sales_return_readback", {"command_request_id": return_command})
    encoded = json.dumps(return_readback, sort_keys=True)
    for value in (return_id, invoice_id, FIRST_PRODUCT, second_product):
        if value not in encoded:
            raise RuntimeError(f"MCP sales-return readback omitted {value}")

    evidence = {
        "schema": "aasopharma.live-mcp-multiproduct.v1",
        "tested_sha": os.environ["LIVE18_EXPECTED_DEPLOYED_SHA"],
        "product_ids": [FIRST_PRODUCT, second_product],
        "purchase_order": {"command_request_id": po_command, "resource_id": po_id},
        "goods_receipt_id": grn_id,
        "sales_order_id": order_id,
        "sales_dispatch_id": dispatch_id,
        "sales_invoice": {"command_request_id": invoice_command, "resource_id": invoice_id, "line_count": len(invoice_rows)},
        "sales_return": {"command_request_id": return_command, "resource_id": return_id, "line_count": len(return_lines)},
    }
    output = Path(os.environ["RUNNER_TEMP"]) / "live-mcp-multiproduct.json"
    output.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(evidence, sort_keys=True))


if __name__ == "__main__":
    main()
