"""Strict operator-action schemas for the canonical command boundary."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


OPERATOR_ACTIONS_EXPORTED = True
DECIMAL_PATTERN = r"^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$"
MONEY_PATTERN = r"^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,2})?$"
UNIT_RATE_PATTERN = r"^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,4})?$"
DISTANCE_PATTERN = r"^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$"
PREVIEW_HASH_PATTERN = r"^sha256:[0-9a-f]{64}$"
IDEMPOTENCY_KEY_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"

RELEASE_GATES: Mapping[str, bool] = {
    "canonical_api_command_boundary_verified": True,
    "canonical_database_commands_deployed_verified": True,
    "calculation_tax_inventory_parity_verified": True,
    "idempotency_concurrency_audit_verified": True,
    "hosted_oauth_consent_verified": True,
    "official_mcp_sdk_staging_verified": True,
}

OPERATOR_TOOL_DESCRIPTIONS: Mapping[str, str] = {
    "erp_product_create": "Create one canonical product draft with a server-allocated immutable product code and exact replay protection.",
    "erp_customer_create": "Create one canonical customer with a server-allocated immutable customer code and exact replay protection.",
    "erp_supplier_create": "Create one canonical supplier with a server-allocated immutable supplier code and exact replay protection.",
    "erp_sales_order_prepare": "Prepare a customer sales order with exact UOM, quantity, price, discount, and backend-derived India tax facts without posting it.",
    "erp_sales_dispatch_prepare": "Prepare a delivery challan and physical dispatch against an approved sales order using exact released batches.",
    "erp_sales_invoice_prepare": "Prepare an India GST sales invoice with exact fulfillment, discount, batch, and logistics facts without posting it.",
    "erp_sales_return_prepare": "Prepare a customer return, quarantine receipt, and credit-note treatment against exact original invoice quantities.",
    "erp_purchase_order_prepare": "Prepare a domestic GST purchase order with exact product, UOM, free quantity, price, discount, and charge facts.",
    "erp_goods_receipt_prepare": "Prepare a GRN against an approved PO with supplier challan, manufacturer batch, expiry, MRP, location, and QC facts.",
    "erp_supplier_invoice_prepare": "Prepare a supplier GST invoice matched to posted GRN quantities and GSTR-2B evidence.",
    "erp_purchase_return_prepare": "Prepare a supplier return, return challan, and debit-note or supplier-credit-note treatment against exact receipt lineage.",
    "erp_customer_receipt_prepare": "Prepare an allocated INR receipt or a goods-only unapplied customer advance using canonical cash, cheque, or bank authority.",
    "erp_customer_cheque_clearance_prepare": "Prepare clearance of one posted account-payee customer cheque into a canonical bank account.",
    "erp_customer_cheque_bounce_prepare": "Prepare the compensating bounce of one posted uncleared customer cheque.",
    "erp_supplier_payment_prepare": "Prepare an INR supplier payment with canonical withholding and exact payable, advance, and adjustment-note identities.",
    "erp_supplier_advance_prepare": "Prepare an INR supplier advance allocated to one approved purchase-order line.",
    "erp_adjustment_note_prepare": "Prepare a standalone canonical customer credit note or supplier debit note against exact posted invoice lines and the authoritative open item.",
    "erp_inventory_transfer_prepare": "Prepare an exact canonical inter-branch stock transfer with explicit source batches and destination location.",
    "erp_inventory_adjustment_prepare": "Prepare an evidenced homogeneous gain or ordinary-loss cycle-count inventory adjustment for exact product batches.",
    "erp_inventory_destruction_prepare": "Prepare certified same-day destruction of exact non-regulated stock with a reviewed Section 17(5)(h) GST input-credit reversal.",
    "erp_bank_reconciliation_prepare": "Prepare an exact full match between one imported bank-statement line and one posted bank-ledger journal entry without changing either owner.",
    "erp_expense_claim_prepare": "Submit an INR member expense claim with verified receipts, exact expense accounts, and a separately reviewed reimbursement journal.",
    "erp_sales_return_reversal_prepare": "Prepare an exact compensating reversal of one erroneous posted sales return.",
    "erp_purchase_return_reversal_prepare": "Prepare an exact compensating reversal of one erroneous posted purchase return.",
    "erp_adjustment_note_reversal_prepare": "Prepare an exact compensating reversal of one posted customer-credit or supplier-debit note.",
    "erp_operation_approve": "Approve exactly one unchanged prepared command by its command ID and preview hash.",
    "erp_operation_review_get": "Inspect exact immutable preview bytes, hashes, source versions, impacts, and approval requirements using an independent approval grant.",
    "erp_operation_execute": "Execute exactly one approved, unchanged command with an idempotency key.",
    "erp_operation_status_get": "Read immutable status, result, failure, and audit references for one authorized command.",
    "erp_bank_reconciliation_get": "Read authoritative bank-statement, posted-journal, audit, and outbox evidence for one succeeded reconciliation command.",
    "erp_sales_dispatch_readback": "Read one posted sales dispatch with its exact order, batch, inventory-document, stock-ledger, quantity, and value evidence.",
    "erp_sales_return_readback": "Read one posted sales return with its exact invoice, dispatch allocation, quarantine receipt, adjustment-note, allocation, and tax evidence.",
    "erp_purchase_return_readback": "Read one posted purchase return with its exact supplier-invoice, goods-receipt, inventory issue, adjustment-note, allocation, and tax evidence.",
    "erp_customer_receipt_readback": "Read one posted customer receipt with its exact receivable allocations and balanced settlement journal.",
    "erp_supplier_payment_readback": "Read one posted supplier payment with its exact payable allocations, residual open items, withholding identity, and balanced settlement journal.",
    "erp_supplier_advance_readback": "Read one posted supplier advance with its exact purchase-order-line allocation, prepayment open item, withholding identity, and balanced journal.",
    "erp_inventory_transfer_readback": "Read one posted inventory transfer with its exact paired source and destination stock-ledger evidence and unchanged value.",
    "erp_inventory_adjustment_readback": "Read one posted signed cycle-count variance with its exact count, stock ledger, valuation journal, and accounting-event evidence.",
    "erp_expense_claim_readback": "Read a posted expense claim with approved lines, verified receipt hashes, balanced journal totals, and accounting-event identity.",
    "erp_sales_return_reversal_readback": "Read exact sales-return counter-note, stock, allocation, tax, and journal reversal evidence.",
    "erp_purchase_return_reversal_readback": "Read exact purchase-return counter-note, stock, allocation, tax, and journal reversal evidence.",
    "erp_adjustment_note_reversal_readback": "Read exact adjustment-note counter-document, allocation, tax, and journal reversal evidence.",
}
PUBLISHED_PREPARE_TOOL_NAMES = frozenset(
    {
        "erp_sales_order_prepare",
        "erp_sales_dispatch_prepare",
        "erp_sales_invoice_prepare",
        "erp_sales_return_prepare",
        "erp_purchase_order_prepare",
        "erp_goods_receipt_prepare",
        "erp_supplier_invoice_prepare",
        "erp_purchase_return_prepare",
        "erp_customer_receipt_prepare",
        "erp_customer_cheque_clearance_prepare",
        "erp_customer_cheque_bounce_prepare",
        "erp_supplier_payment_prepare",
        "erp_supplier_advance_prepare",
        "erp_adjustment_note_prepare",
        "erp_inventory_transfer_prepare",
        "erp_inventory_adjustment_prepare",
        "erp_inventory_destruction_prepare",
        "erp_bank_reconciliation_prepare",
        "erp_expense_claim_prepare",
        "erp_sales_return_reversal_prepare",
        "erp_purchase_return_reversal_prepare",
        "erp_adjustment_note_reversal_prepare",
    }
)


class OperatorActionsUnavailable(RuntimeError):
    """Raised when code attempts to publish a planned action before release gates."""


def _string(description: str, **keywords: Any) -> dict[str, Any]:
    return {"type": "string", "description": description, **keywords}


def _uuid(description: str) -> dict[str, Any]:
    return _string(description, format="uuid")


def _date(description: str) -> dict[str, Any]:
    return _string(description, format="date")


def _datetime(description: str) -> dict[str, Any]:
    return _string(description, format="date-time")


def _decimal(description: str, *, money: bool = False) -> dict[str, Any]:
    return _string(description, pattern=MONEY_PATTERN if money else DECIMAL_PATTERN)


def _unit_rate(description: str) -> dict[str, Any]:
    return _string(description, pattern=UNIT_RATE_PATTERN)


def _object(
    properties: Mapping[str, Any], required: tuple[str, ...], description: str
) -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "additionalProperties": False,
        "properties": dict(properties),
        "required": list(required),
    }


def _array(items: Mapping[str, Any], description: str) -> dict[str, Any]:
    return {
        "type": "array",
        "description": description,
        "minItems": 1,
        "maxItems": 500,
        "items": dict(items),
    }


LINE_DISCOUNT = _object(
    {
        "line_discount_kind": _string(
            "Canonical line discount kind.",
            enum=["none", "percent", "amount"],
        ),
        "line_discount_basis": _string(
            "Whether the line discount is applied to the taxable value or quoted price value.",
            enum=["taxable_value", "price_value"],
        ),
        "line_discount_value": _decimal(
            "Exact nonnegative percentage or INR line amount selected by line_discount_kind."
        ),
    },
    ("line_discount_kind", "line_discount_basis", "line_discount_value"),
    "Canonical line discount input. Use kind none with value 0 when no line discount applies.",
)

DOCUMENT_DISCOUNT = _object(
    {
        "document_discount_kind": _string(
            "Canonical document discount kind.",
            enum=["none", "percent", "amount"],
        ),
        "document_discount_basis": _string(
            "Whether the document discount is allocated over taxable value or quoted price value.",
            enum=["taxable_value", "price_value"],
        ),
        "document_discount_value": _decimal(
            "Exact nonnegative percentage or INR document amount selected by document_discount_kind."
        ),
    },
    ("document_discount_kind", "document_discount_basis", "document_discount_value"),
    "Canonical document discount input. Use kind none with value 0 when no document discount applies.",
)

COMMERCIAL_BATCH_ALLOCATION = _object(
    {
        "batch_id": _uuid("Canonical manufacturer batch selected for this movement."),
        "billed_quantity": _decimal("Exact billed quantity assigned to this batch."),
        "free_quantity": _decimal("Exact free-supply quantity assigned to this batch; use 0 when none."),
    },
    ("batch_id", "billed_quantity", "free_quantity"),
    "Explicit commercial batch allocation; billed and free quantities must reconcile separately.",
)

DISPATCH_ALLOCATION = _object(
    {
        "dispatch_line_id": _uuid("Posted dispatch line supplying this invoice line."),
        "allocated_base_billed_quantity": _decimal(
            "Exact billed base-UOM quantity allocated from the source line."
        ),
        "allocated_base_free_quantity": _decimal(
            "Exact free-supply base-UOM quantity allocated from the source line."
        ),
    },
    (
        "dispatch_line_id",
        "allocated_base_billed_quantity",
        "allocated_base_free_quantity",
    ),
    "Typed dispatch-to-invoice quantity allocation; it never issues stock a second time.",
)

MOVEMENT_BATCH_ALLOCATION = _object(
    {
        "batch_id": _uuid("Canonical manufacturer batch selected for this movement."),
        "entered_quantity": _decimal("Exact movement quantity in the selected UOM."),
    },
    ("batch_id", "entered_quantity"),
    "Explicit physical movement allocation; automatic or unspecified batch selection is forbidden.",
)

DESTRUCTION_BATCH_ALLOCATION = _object(
    {
        "inventory_document_line_id": _uuid(
            "Client-generated immutable identity for the destruction inventory-document line."
        ),
        "batch_id": _uuid("Canonical manufacturer batch selected for this movement."),
        "entered_quantity": _decimal("Exact movement quantity in the selected UOM."),
    },
    ("inventory_document_line_id", "batch_id", "entered_quantity"),
    "Explicit full-balance destruction allocation with its stable line identity.",
)

COMMERCIAL_LINE_PROPERTIES = {
    "product_id": _uuid("Canonical product selected by a bounded search."),
    "uom_conversion_id": _uuid(
        "Effective canonical product UOM conversion used to snapshot uom_code and conversion factor."
    ),
    "billed_quantity": _decimal("Exact billed quantity in the selected UOM."),
    "free_quantity": _decimal("Exact free-supply quantity in the selected UOM; use 0 when none."),
    "free_supply_tax_treatment": _string(
        "Explicit legal valuation treatment for free supply; never inferred from a zero price.",
        enum=["excluded_from_taxable_value", "included_at_unit_rate"],
    ),
    "quoted_unit_rate": _unit_rate(
        "Exact INR quoted rate for one selected UOM before the explicitly supplied discount."
    ),
    "price_basis": _string(
        "Whether quoted_unit_rate includes tax; the backend derives every tax rate and amount.",
        enum=["tax_exclusive", "tax_inclusive"],
    ),
    "line_discount": LINE_DISCOUNT,
    "document_discount_eligible": {
        "type": "boolean",
        "description": "Whether this line participates in the explicitly supplied document discount allocation.",
    },
}

CHARGE_LINE = _object(
    {
        "charge_code": _string(
            "Canonical commercial charge kind.",
            enum=["freight", "packing", "insurance", "handling", "other"],
        ),
        "quoted_amount": _decimal("Exact INR charge amount before derived tax.", money=True),
        "price_basis": _string(
            "Whether quoted_amount includes tax; tax classification and rates remain backend-derived.",
            enum=["tax_exclusive", "tax_inclusive"],
        ),
        "document_discount_eligible": {
            "type": "boolean",
            "description": "Whether this charge participates in the document discount allocation.",
        },
    },
    ("charge_code", "quoted_amount", "price_basis", "document_discount_eligible"),
    "Typed freight, packing, insurance, handling, or other charge line.",
)


def _commercial_line(
    *,
    batches: bool = False,
    source_field: str | None = None,
    derive_product_from_source: bool = False,
) -> dict[str, Any]:
    properties = dict(COMMERCIAL_LINE_PROPERTIES)
    required = [
        "product_id",
        "uom_conversion_id",
        "billed_quantity",
        "free_quantity",
        "free_supply_tax_treatment",
        "quoted_unit_rate",
        "price_basis",
        "line_discount",
        "document_discount_eligible",
    ]
    if source_field:
        properties[source_field] = _uuid(
            f"Canonical source {source_field.removesuffix('_id').replace('_', ' ')}."
        )
        required.insert(0, source_field)
    if derive_product_from_source:
        for field in ("product_id", "uom_conversion_id"):
            properties.pop(field)
            required.remove(field)
    if batches:
        properties["batch_allocations"] = _array(
            COMMERCIAL_BATCH_ALLOCATION,
            "Exact manufacturer batches with separately reconciled billed and free quantities.",
        )
        required.append("batch_allocations")
    return _object(
        properties,
        tuple(required),
        "Commercial document line. Product tax classification, place of supply, GST and cess are backend-derived.",
    )


def _sales_invoice_line() -> dict[str, Any]:
    properties = dict(COMMERCIAL_LINE_PROPERTIES)
    properties.update(
        {
            "fulfillment_source": _string(
                "Whether stock is issued directly by this invoice or was already issued by posted dispatches.",
                enum=["direct_issue", "dispatch_allocated"],
            ),
            "batch_allocation_mode": _string(
                "Optional direct-issue policy. Omit with no batches for automatic FEFO, or use explicit_fefo with reviewed batches from the earliest eligible expiry tier.",
                enum=["auto_fefo", "explicit_fefo"],
            ),
            "batch_allocations": _array(
                COMMERCIAL_BATCH_ALLOCATION,
                "Exact batches for explicit_fefo, or the backend-resolved immutable result for auto_fefo.",
            ),
            "dispatch_allocations": _array(
                DISPATCH_ALLOCATION,
                "Required only for dispatch_allocated; posted dispatch quantities consumed by this invoice.",
            ),
        }
    )
    required = tuple(
        field
        for field in properties
        if field not in {
            "batch_allocation_mode", "batch_allocations", "dispatch_allocations"
        }
    )
    return _object(
        properties,
        required,
        "Sales invoice product line. Exactly one source allocation collection is allowed by fulfillment_source.",
    )


LOGISTICS = _object(
    {
        "transport_mode": _string(
            "Physical transport mode.",
            enum=["road", "rail", "air", "ship", "multimodal", "in_person"],
        ),
        "distance_km": _string(
            "Exact planned transport distance in kilometres at two-decimal precision.",
            pattern=DISTANCE_PATTERN,
        ),
        "transporter_party_id": _uuid("Canonical transporter party."),
        "vehicle_number": _string("Indian vehicle registration when road movement uses a vehicle."),
        "vehicle_type": _string(
            "E-way-bill vehicle category required for road transport.",
            enum=["regular", "over_dimensional_cargo"],
        ),
        "transport_document_number": _string("LR, RR, airway bill, or equivalent transport document number."),
        "transport_document_date": _date("Date on the transport document."),
    },
    ("transport_mode", "distance_km"),
    "Physical logistics facts snapshotted for dispatch and compliance derivation.",
)

GRN_BATCH = _object(
    {
        "manufacturer_batch_number": _string("Batch number printed by the manufacturer."),
        "manufactured_on": _date("Manufacturing date when present on the pack or supplier evidence."),
        "expires_on": _date("Normalized exclusive expiry date derived from the labelled expiry month/date."),
        "mrp": _decimal(
            "Tax-inclusive INR Maximum Retail Price for one marketed pack.",
            money=True,
        ),
        "mrp_uom_conversion_id": _uuid(
            "Effective same-product marketed-pack UOM conversion defining the MRP basis."
        ),
        "received_quantity": _decimal("Total billed quantity physically received before acceptance."),
        "accepted_quantity": _decimal("Quantity accepted into saleable or quarantine stock."),
        "rejected_quantity": _decimal("Quantity rejected at receipt; use 0 when none."),
        "free_quantity": _decimal("Free-supply quantity accepted from the supplier; use 0 when none."),
        "qc_status": _string(
            "Explicit completed QC disposition. Fully rejected receipts remain fail-closed in the pilot.",
            enum=["accepted", "partial"],
        ),
        "qc_notes": _string(
            "Inspection evidence explaining a partial acceptance."
        ),
        "to_location_id": _uuid("Canonical destination inventory location."),
    },
    (
        "manufacturer_batch_number",
        "expires_on",
        "mrp",
        "mrp_uom_conversion_id",
        "received_quantity",
        "accepted_quantity",
        "rejected_quantity",
        "free_quantity",
        "qc_status",
        "to_location_id",
    ),
    "Explicit received manufacturer batch, marketed-pack MRP basis, and completed QC disposition.",
)

ALLOCATION = _object(
    {
        "open_item_id": _uuid("Canonical receivable or payable open item."),
        "amount": _decimal("Exact INR amount to allocate to this open item.", money=True),
    },
    ("open_item_id", "amount"),
    "Explicit payment allocation; the backend verifies ownership, currency, branch and outstanding balance.",
)

SUPPLIER_PAYMENT_ALLOCATION = _object(
    {
        "open_item_id": _uuid("Exact posted supplier-invoice payable being reduced."),
        "cash_amount": _decimal(
            "Requested INR bank component for this payable; statutory withholding and selected credit residuals are database-derived.",
            money=True,
        ),
        "supplier_advance_open_item_id": _uuid(
            "Optional exact supplier-prepayment receivable; its locked residual is applied in full."
        ),
        "adjustment_note_open_item_id": _uuid(
            "Optional exact posted supplier debit-note receivable; its locked residual is applied in full."
        ),
    },
    ("open_item_id", "cash_amount"),
    "One unambiguous payable settlement identity. Every selected source credit must share supplier, branch, and currency.",
)


@dataclass(frozen=True)
class OperatorAction:
    tool_name: str
    operation_key: str
    permission: str
    risk_class: str
    schema_profile: str
    approval_policy: str
    input_schema: Mapping[str, Any]


def _header(document_date_field: str, description: str) -> dict[str, Any]:
    return {
        "branch_id": _uuid("Explicit authorized branch; no write-time branch default is allowed."),
        document_date_field: _date(description),
    }


def _commercial_header(document_date_field: str, description: str) -> dict[str, Any]:
    properties = _header(document_date_field, description)
    properties.update(
        {
            "document_discount": DOCUMENT_DISCOUNT,
            "rounding_policy": _string(
                "Canonical document rounding policy.",
                enum=["none", "nearest_rupee"],
            ),
            "zero_rated_payment_mode": _string(
                "SEZ/export GST payment mode; use not_applicable for ordinary supplies.",
                enum=["not_applicable", "without_payment", "with_igst"],
            ),
            "charge_lines": _array(
                CHARGE_LINE,
                "Optional typed freight, packing, insurance, handling, or other charge lines.",
            ),
        }
    )
    return properties


def _prepare_actions() -> dict[str, OperatorAction]:
    sales_order = _commercial_header("order_date", "Commercial order date in the branch timezone.")
    sales_order.update(
        {
            "customer_account_id": _uuid("Canonical active customer account; the backend derives its party."),
            "delivery_address_id": _uuid(
                "Explicit effective customer delivery address; the backend derives place of supply from it."
            ),
            "delivery_address_row_version": _string(
                "Exact selected delivery-address row version; stale selections fail closed.",
                pattern=r"^[1-9][0-9]*$",
            ),
            "lines": _array(_commercial_line(), "Requested sales order lines."),
        }
    )

    sales_dispatch = _header("dispatch_date", "Physical dispatch date in the branch timezone.")
    sales_dispatch.update(
        {
            "sales_order_id": _uuid("Approved canonical sales order being dispatched."),
            "from_location_id": _uuid("Canonical source inventory location in branch_id."),
            "lines": _array(
                _object(
                    {
                        "sales_order_line_id": _uuid(
                            "Approved sales order line; product, UOM and commercial facts are backend-resolved."
                        ),
                        "billed_quantity": _decimal(
                            "Billed quantity dispatched in the order line's snapshotted UOM."
                        ),
                        "free_quantity": _decimal(
                            "Free-supply quantity dispatched in the order line's snapshotted UOM."
                        ),
                        "batch_allocations": _array(
                            COMMERCIAL_BATCH_ALLOCATION,
                            "Exact manufacturer batches allocated to the dispatch.",
                        ),
                    },
                    (
                        "sales_order_line_id",
                        "billed_quantity",
                        "free_quantity",
                        "batch_allocations",
                    ),
                    "Dispatch quantity request; product, UOM, price and tax facts come only from the locked order line.",
                ),
                "Order lines and explicit batches to dispatch.",
            ),
            "logistics": LOGISTICS,
        }
    )

    sales_invoice = _commercial_header("invoice_date", "Invoice date in the open fiscal period.")
    sales_invoice.update(
        {
            "customer_account_id": _uuid("Canonical active customer account; the backend derives its party."),
            "delivery_address_id": _uuid(
                "Explicit effective customer delivery address; the backend derives place of supply from it."
            ),
            "delivery_address_row_version": _string(
                "Exact selected delivery-address row version; stale selections fail closed.",
                pattern=r"^[1-9][0-9]*$",
            ),
            "tax_charge_mechanism": _string(
                "Explicit tax charge mechanism. Only normal is accepted; reverse charge remains fail-closed until an effective reviewed legal authority exists.",
                enum=["normal"],
            ),
            "from_location_id": _uuid("Source location for the invoice's posted stock issue."),
            "logistics": LOGISTICS,
            "lines": _array(
                _sales_invoice_line(),
                "Invoice lines with explicit price, discount, and exactly one stock-source mode.",
            ),
        }
    )

    sales_return = _header("return_date", "Customer return receipt and adjustment date.")
    sales_return_line = _object(
        {
            "original_invoice_line_id": _uuid("Original posted sales invoice line."),
            "invoice_dispatch_allocation_id": _uuid(
                "Exact original invoice-to-dispatch allocation. Direct-issued returns remain unavailable in the pilot."
            ),
            "billed_quantity": _decimal("Exact billed quantity returned, cumulatively bounded by the original line."),
            "free_quantity": _decimal("Exact free-supply quantity returned, cumulatively bounded by the original line."),
            "batch_allocation": COMMERCIAL_BATCH_ALLOCATION,
            "to_location_id": _uuid(
                "Active same-branch non-saleable quarantine location receiving the returned batch."
            ),
            "return_condition": _string(
                "Observed physical condition retained as immutable command evidence; it never auto-releases stock.",
                enum=["sealed_resaleable", "opened", "damaged", "expired", "recalled", "quality_hold"],
            ),
        },
        (
            "original_invoice_line_id",
            "invoice_dispatch_allocation_id",
            "billed_quantity",
            "free_quantity",
            "batch_allocation",
            "to_location_id",
            "return_condition",
        ),
        "One dispatch-allocated invoice line and its exact returned manufacturer batch.",
    )
    sales_return.update(
        {
            "original_invoice_id": _uuid("Original posted sales invoice."),
            "reason_code": _string(
                "Uniform controlled reason for the return and effective GST adjustment rule.",
                enum=["customer_rejection", "damage", "expiry", "quality", "recall", "wrong_supply"],
            ),
            "gst_tax_treatment": _string(
                "Explicit statutory or commercial-only GST adjustment treatment; it must match the effective reviewed rule.",
                enum=["statutory", "commercial_only"],
            ),
            "recipient_itc_reversal_evidence_attachment_id": _uuid(
                "Verified or retained buyer ITC-reversal evidence required only for a statutory credit."
            ),
            "recipient_itc_reversal_confirmed_at": _datetime(
                "Timestamp at which the registered buyer's ITC reversal was confirmed."
            ),
            "lines": _array(sales_return_line, "Customer return lines."),
        }
    )

    purchase_order = _commercial_header("order_date", "Purchase order date in the branch timezone.")
    purchase_order.update(
        {
            "supplier_account_id": _uuid("Canonical active supplier account; the backend derives its party."),
            "tax_charge_mechanism": _string(
                "Explicit tax charge mechanism. Only normal is accepted; reverse charge remains fail-closed until an effective reviewed legal authority exists.",
                enum=["normal"],
            ),
            "expected_on": _date("Expected delivery date."),
            "lines": _array(_commercial_line(), "Purchase order lines."),
        }
    )

    goods_receipt = {
        "branch_id": _uuid(
            "Explicit authorized branch; no write-time branch default is allowed."
        ),
        "received_at": _datetime(
            "Exact physical receipt timestamp with timezone offset."
        ),
    }
    grn_line = _object(
        {
            "purchase_order_line_id": _uuid(
                "Approved product purchase order line; product and UOM are backend-resolved."
            ),
            "batches": _array(GRN_BATCH, "Every physical manufacturer batch in this receipt."),
        },
        ("purchase_order_line_id", "batches"),
        "Goods receipt line with complete manufacturer-batch identity.",
    )
    goods_receipt.update(
        {
            "purchase_order_id": _uuid("Approved product purchase order."),
            "supplier_account_id": _uuid("Canonical supplier account on the purchase order."),
            "supplier_challan_number": _string(
                "Supplier delivery challan number when supplied."
            ),
            "supplier_challan_date": _date(
                "Supplier delivery challan date when supplied."
            ),
            "lines": _array(grn_line, "Received purchase order lines."),
        }
    )

    supplier_invoice = _commercial_header("invoice_date", "Supplier tax invoice date.")
    supplier_invoice_line = _commercial_line(derive_product_from_source=True)
    supplier_invoice_line["properties"].update(
        {
            "goods_receipt_line_id": _uuid(
                "Exact posted accepted goods-receipt line used as source lineage."
            ),
            "allocated_base_billed_quantity": _decimal(
                "Exact billed base-UOM quantity allocated from the source line."
            ),
            "allocated_base_free_quantity": _decimal(
                "Exact free-supply base-UOM quantity allocated from the source line."
            ),
            "product_inventory_cost_treatment": _string(
                "Explicit accounting treatment. The pilot accepts capitalize for received product lines.",
                enum=["capitalize"],
            ),
            "landed_cost_allocation_method": _string(
                "Reviewed allocation authority for invoice price variance. No implicit weighting or fallback is allowed.",
                enum=["direct", "quantity_weighted", "value_weighted"],
            ),
            "itc_eligibility": _string(
                "Explicit ITC treatment backed by the exact GSTR-2B portal line.",
                enum=["eligible"],
            ),
            "itc_eligibility_basis": _string(
                "Auditable human attestation that the supply is outside Section 17 blocked-credit categories; this is not an automated legal determination.",
                enum=["taxable_resale_not_blocked_under_section_17"],
            ),
        }
    )
    supplier_invoice_line["required"].extend(
        [
            "goods_receipt_line_id",
            "allocated_base_billed_quantity",
            "allocated_base_free_quantity",
            "product_inventory_cost_treatment",
            "landed_cost_allocation_method",
            "itc_eligibility",
            "itc_eligibility_basis",
        ]
    )
    supplier_invoice_charge = dict(CHARGE_LINE)
    supplier_invoice_charge = {
        **supplier_invoice_charge,
        "properties": {
            **supplier_invoice_charge["properties"],
            "charge_inventory_cost_treatment": _string(
                "Explicit reviewed expense or capitalized landed-cost treatment.",
                enum=["expense", "capitalize"],
            ),
            "landed_cost_allocation_method": _string(
                "Reviewed allocation authority for invoice price variance. No implicit weighting or fallback is allowed.",
                enum=["direct", "quantity_weighted", "value_weighted"],
            ),
            "net_value_account_id": _uuid(
                "Active canonical expense account for the reviewed charge."
            ),
            "itc_eligibility": _string(
                "Explicit ITC treatment backed by the exact GSTR-2B portal line.",
                enum=["eligible"],
            ),
            "itc_eligibility_basis": _string(
                "Auditable human attestation that the supply is outside Section 17 blocked-credit categories; this is not an automated legal determination.",
                enum=["taxable_resale_not_blocked_under_section_17"],
            ),
        },
        "required": [
            *supplier_invoice_charge["required"],
            "charge_inventory_cost_treatment",
            "net_value_account_id",
            "itc_eligibility",
            "itc_eligibility_basis",
        ],
    }
    supplier_invoice_charge["properties"].pop("charge_code")
    supplier_invoice_charge["properties"]["expense_price_basis"] = (
        supplier_invoice_charge["properties"].pop("price_basis")
    )
    supplier_invoice_charge["properties"]["expense_document_discount_eligible"] = (
        supplier_invoice_charge["properties"].pop("document_discount_eligible")
    )
    supplier_invoice_charge["properties"]["expense_charge_code"] = _string(
        "Reviewed receipt-related charge kind; generic other charges remain fail-closed.",
        enum=["freight", "packing", "insurance", "handling"],
    )
    supplier_invoice_charge["required"] = [
        {
            "charge_code": "expense_charge_code",
            "price_basis": "expense_price_basis",
            "document_discount_eligible": "expense_document_discount_eligible",
        }.get(field, field)
        for field in supplier_invoice_charge["required"]
    ]
    supplier_invoice.pop("charge_lines")
    supplier_invoice.update(
        {
            "supplier_account_id": _uuid("Canonical active supplier account; the backend derives its party."),
            "supplier_tax_registration_id": _uuid(
                "Exact active verified supplier GST registration used on this invoice."
            ),
            "supplier_invoice_number": _string("Supplier's exact document number."),
            "received_date": _date("Date the supplier invoice was received."),
            "tax_charge_mechanism": _string(
                "Explicit tax charge mechanism. Only normal is accepted; reverse charge remains fail-closed until an effective reviewed legal authority exists.",
                enum=["normal"],
            ),
            "portal_document_line_id": _uuid(
                "Exact immutable parsed GSTR-2B invoice row supporting eligible ITC."
            ),
            "goods_receipt_ids": _array(
                _uuid("Exact posted GRN included in the invoice match."),
                "Exact GRN header set represented by the receipt allocations; the backend rejects omissions and extras.",
            ),
            "lines": _array(
                supplier_invoice_line,
                "Supplier invoice product lines fully matched to posted receipt quantities.",
            ),
            "expense_charge_lines": _array(
                supplier_invoice_charge,
                "Reviewed expensed freight, packing, insurance, or handling charges.",
            ),
        }
    )

    purchase_return = _header("return_date", "Physical supplier return issue date.")
    purchase_return_line = _object(
        {
            "goods_receipt_line_id": _uuid(
                "Exact posted accepted goods-receipt line used as source lineage."
            ),
            "supplier_invoice_receipt_allocation_id": _uuid(
                "Exact posted supplier-invoice allocation required by the invoiced-only pilot."
            ),
            "billed_quantity": _decimal("Exact billed quantity returned, cumulatively bounded by the original line."),
            "free_quantity": _decimal("Exact free-supply quantity returned, cumulatively bounded by the original line."),
            "batch_allocation": COMMERCIAL_BATCH_ALLOCATION,
            "from_location_id": _uuid(
                "Exact active receipt location holding sufficient stock at locked current MWA."
            ),
        },
        (
            "goods_receipt_line_id",
            "billed_quantity",
            "free_quantity",
            "batch_allocation",
            "from_location_id",
        ),
        "One receipt line and exact manufacturer batch returned to the supplier.",
    )
    purchase_return.update(
        {
            "return_source_kind": _string(
                "Explicit reviewed pilot source; only posted supplier-invoiced receipts are supported.",
                enum=["invoiced"],
            ),
            "original_supplier_invoice_id": _uuid(
                "Original posted supplier invoice required by the invoiced-only pilot."
            ),
            "supplier_credit_note_portal_line_id": _uuid(
                "Unique parsed GSTR-2B supplier credit-note row required only for a statutory invoiced GST decrease."
            ),
            "reason_code": _string(
                "Uniform controlled reason selecting the effective purchase-debit GST adjustment rule.",
                enum=["wrong_supply", "excess_supply"],
            ),
            "gst_tax_treatment": _string(
                "Explicit statutory or commercial-only GST adjustment treatment; it must match the effective reviewed rule.",
                enum=["statutory", "commercial_only"],
            ),
            "supplier_destination_address_id": _uuid(
                "Active supplier registered, warehouse, or shipping address snapshotted as the physical destination."
            ),
            "logistics": LOGISTICS,
            "lines": _array(purchase_return_line, "Purchase return lines."),
        }
    )

    customer_receipt = _header("payment_date", "Customer receipt value date.")
    customer_receipt.update(
        {
            "customer_account_id": _uuid("Canonical active customer account; the backend derives its party."),
            "bank_account_id": _uuid(
                "Active organization bank account for bank, card, or UPI receipt. The ledger is derived from this identity."
            ),
            "payment_method": _string(
                "Reviewed INR receipt method. Cash and cheque use canonical branch account roles.",
                enum=["cash", "cheque", "bank_transfer", "card", "upi"],
            ),
            "receipt_purpose": _string(
                "Invoice settlement or a goods-only unapplied customer advance liability.",
                enum=["invoice_settlement", "customer_advance"],
            ),
            "sales_order_id": _uuid(
                "Required only for a goods-only customer advance; the backend locks the approved product-only order."
            ),
            "amount": _decimal("Exact total INR receipt amount.", money=True),
            "allocations": {
                **_array(ALLOCATION, "Unique live receivable allocations."),
                "minItems": 0,
            },
            "external_reference": _string(
                "Exact bank, UPI, gateway, cash-voucher, or cheque reference used for duplicate detection."
            ),
            "evidence_attachment_id": _uuid(
                "Verified immutable tender or instrument evidence required by the effective branch receipt rule."
            ),
            "instrument_number": _string("Cheque instrument number."),
            "instrument_date": _date("Cheque instrument date."),
            "drawee_bank_name": _string("Cheque drawee bank name copied from immutable evidence."),
            "account_payee_confirmed": {"type": "boolean", "description": "Explicit confirmation that the cheque is account-payee only."},
        }
    )

    customer_cheque_clearance = _header("clearance_date", "Cheque bank-clearance date.")
    customer_cheque_clearance.update({
        "original_payment_id": _uuid("Posted uncleared customer-cheque receipt."),
        "original_payment_row_version": _string("Exact selected receipt row version.", pattern=r"^[1-9][0-9]*$"),
        "bank_account_id": _uuid("Canonical INR bank account receiving cleared funds."),
        "clearance_reference": _string("Exact bank clearance reference."),
        "evidence_attachment_id": _uuid("Verified immutable bank-clearance evidence."),
    })

    customer_cheque_bounce = _header("bounce_date", "Cheque dishonour date.")
    customer_cheque_bounce.update({
        "original_payment_id": _uuid("Posted uncleared customer-cheque receipt."),
        "original_payment_row_version": _string("Exact selected receipt row version.", pattern=r"^[1-9][0-9]*$"),
        "reason_code": _string("Reviewed dishonour reason.", enum=["funds_insufficient", "signature_mismatch", "account_closed", "payment_stopped", "instrument_invalid", "other"]),
        "evidence_attachment_id": _uuid("Verified immutable bank dishonour evidence."),
    })

    supplier_payment = _header("payment_date", "Supplier payment value date.")
    supplier_payment.update(
        {
            "supplier_account_id": _uuid("Canonical active supplier account; the backend derives its party."),
            "bank_account_id": _uuid(
                "Active organization bank account; its canonical ledger is database-derived."
            ),
            "payment_method": _string(
                "Reviewed non-cheque INR supplier-payment method.",
                enum=["bank_transfer", "upi"],
            ),
            "expected_gross_amount": _decimal(
                "Concurrency assertion for the total liability reduction derived from locked payables, imported withholding rules, and selected credit residuals.",
                money=True,
            ),
            "allocations": _array(
                SUPPLIER_PAYMENT_ALLOCATION,
                "Unique payable identities with optional exact source-credit identities.",
            ),
            "external_reference": _string(
                "Exact bank or UPI reference permanently consumed for this bank account, including after accounting reversal."
            ),
        }
    )

    supplier_advance = _header("payment_date", "Supplier advance payment value date.")
    advance_allocation = _object(
        {
            "purchase_order_line_id": _uuid("Approved product purchase order line."),
            "gross_amount": _decimal(
                "Exact INR advance basis allocated to this line before derived withholding.", money=True
            ),
        },
        ("purchase_order_line_id", "gross_amount"),
        "Advance allocation establishing later invoice and withholding lineage.",
    )
    supplier_advance.update(
        {
            "supplier_account_id": _uuid("Canonical active supplier account; the backend derives its party."),
            "purchase_order_id": _uuid("Approved product purchase order."),
            "bank_account_id": _uuid(
                "Active organization bank account; its canonical asset ledger is database-derived."
            ),
            "payment_method": _string(
                "Reviewed non-cheque INR supplier-advance method.",
                enum=["bank_transfer", "upi"],
            ),
            "gross_amount": _decimal(
                "Exact INR goods advance. The pilot requires verified non-applicability of withholding, so gross equals bank cash.",
                money=True,
            ),
            "allocations": {
                **_array(
                    advance_allocation,
                    "Exactly one approved product purchase-order line allocation in the pilot.",
                ),
                "maxItems": 1,
            },
            "external_reference": _string("Exact bank or UPI reference used for duplicate detection."),
        }
    )

    adjustment_note = _header("note_date", "India-local note date, not before the original invoice date.")
    adjustment_note.update({
        "side": _string("Original document side.", enum=["sales", "purchase"]),
        "direction": _string("Canonical decrease direction.", enum=["credit", "debit"]),
        "original_document_id": _uuid("Canonical posted sales or supplier invoice being adjusted."),
        "gst_tax_treatment": _string("Explicit statutory or commercial-only GST adjustment treatment; it must match the effective reviewed rule.", enum=["statutory", "commercial_only"]),
        "recipient_itc_reversal_evidence_attachment_id": _uuid("Verified or retained buyer ITC-reversal evidence required only for a statutory credit."),
        "recipient_itc_reversal_confirmed_at": _datetime("Timestamp at which the registered buyer's ITC reversal was confirmed."),
        "counterparty_portal_document_line_id": _uuid("Parsed GSTR-2B supplier credit-note line for a statutory supplier debit note."),
        "reason_code": _string("Exact active GST adjustment-rule reason code."),
        "reason": _string("Human-readable business reason retained on the note."),
        "rounding_policy": _string("Canonical document rounding policy.", enum=["none", "nearest_rupee"]),
        "document_discount": DOCUMENT_DISCOUNT,
        "lines": _array(
            _object(
                {
                    "original_line_id": _uuid("Exact line on the original posted invoice."),
                    "billed_quantity": COMMERCIAL_LINE_PROPERTIES["billed_quantity"],
                    "free_quantity": COMMERCIAL_LINE_PROPERTIES["free_quantity"],
                    "free_supply_tax_treatment": COMMERCIAL_LINE_PROPERTIES["free_supply_tax_treatment"],
                    "quoted_unit_rate": COMMERCIAL_LINE_PROPERTIES["quoted_unit_rate"],
                    "price_basis": COMMERCIAL_LINE_PROPERTIES["price_basis"],
                    "line_discount": LINE_DISCOUNT,
                    "document_discount_eligible": COMMERCIAL_LINE_PROPERTIES["document_discount_eligible"],
                },
                ("original_line_id", "billed_quantity", "free_quantity", "free_supply_tax_treatment", "quoted_unit_rate", "price_basis", "line_discount", "document_discount_eligible"),
                "One exact original-line adjustment; product substitution and ad-hoc charges are unavailable.",
            ),
            "Exact standalone adjustment-note lines.",
        ),
    })

    inventory_transfer = {
        "source_branch_id": _uuid("Authorized source branch."),
        "destination_branch_id": _uuid("Authorized, distinct destination branch."),
        "source_location_id": _uuid("Location belonging to source_branch_id."),
        "destination_location_id": _uuid("Location belonging to destination_branch_id."),
        "transfer_date": _date("Physical transfer issue date."),
        "lines": _array(
            _object(
                {
                    "product_id": _uuid("Canonical product."),
                    "uom_conversion_id": _uuid("Effective canonical product UOM conversion for the transfer."),
                    "batch_allocations": _array(MOVEMENT_BATCH_ALLOCATION, "Explicit batches to transfer."),
                },
                ("product_id", "uom_conversion_id", "batch_allocations"),
                "Interbranch transfer product and exact manufacturer batches.",
            ),
            "Transfer lines.",
        ),
        "logistics": LOGISTICS,
    }

    STOCK_COUNT_BATCH = _object(
        {
            "batch_id": _uuid("Canonical manufacturer batch selected for this movement."),
            "counted_quantity": _decimal("Exact physical count in the selected effective UOM."),
            "stock_balance_row_version": {
                "type": "integer",
                "minimum": 1,
                "description": "Exact positive authoritative stock-balance row version selected before prepare.",
            },
        },
        ("batch_id", "counted_quantity", "stock_balance_row_version"),
        "One unique existing lot count. The backend derives system quantity, base quantity, variance, and MWA value.",
    )
    inventory_adjustment = _header("adjustment_date", "India-local posting date of the same-day physical cycle count.")
    inventory_adjustment.update(
        {
            "counted_at": _datetime("Recent nonfuture physical count timestamp with timezone offset."),
            "counted_by_membership_id": _uuid("Active membership that performed the physical count."),
            "location_id": _uuid("Active same-branch saleable, non-cold inventory location."),
            "reason_code": _string("Fixed reviewed cycle-count reason.", enum=["cycle_count"]),
            "evidence_attachment_id": _uuid(
                "Verified retained inventory_cycle_count_sheet certifying organization ownership and no pending source document."
            ),
            "lines": _array(
                _object(
                    {
                        "product_id": _uuid("Canonical product."),
                        "uom_conversion_id": _uuid("Effective canonical product UOM conversion used by the physical count."),
                        "batch_counts": _array(STOCK_COUNT_BATCH, "Exact existing lots physically counted."),
                    },
                    ("product_id", "uom_conversion_id", "batch_counts"),
                    "Signed cycle-count product and its unique existing lots.",
                ),
                "All lines must be gains or ordinary losses. Mixed, zero, damage, expiry, cold-chain, controlled, recalled, and reversal flows are unavailable.",
            ),
        }
    )

    bank_reconciliation = {
        "branch_id": _uuid("Explicit authorized branch; no write-time branch default is allowed."),
        "bank_statement_id": _uuid("Imported canonical bank statement."),
        "bank_statement_line_id": _uuid("One immutable statement line to match in full."),
        "journal_entry_id": _uuid("One posted canonical journal containing exactly one line for the statement bank ledger."),
        "matched_amount": _decimal("Exact full statement-line and bank-ledger amount.", money=True),
        "match_method": _string(
            "Reviewed matching method; automatic or partial matching is not accepted.",
            enum=["manual", "reference_exact"],
        ),
    }

    inventory_destruction = _header("destruction_date", "Approved physical destruction date.")
    inventory_destruction.update(
        {
            "location_id": _uuid("Canonical source quarantine or destruction location."),
            "physical_destruction_confirmed_at": _datetime(
                "Timestamp at which the witnessed physical destruction was completed."
            ),
            "method_code": _string(
                "Reviewed physical destruction method.", enum=["licensed_incineration"]
            ),
            "reason_code": _string(
                "Controlled destruction reason.", enum=["expired", "damaged", "quality_rejected"]
            ),
            "reason": _string("Exact business and compliance reason recorded on the destruction evidence."),
            "authority_reference": _string("Regulator, committee, or approval reference."),
            "witness_name": _string("Name of the witness to physical destruction."),
            "witness_credential": _string("Optional witness role, licence, or credential reference."),
            "certificate_attachment_id": _uuid(
                "Verified retained attachment containing the destruction certificate."
            ),
            "itc_reversal_evidence_attachment_id": _uuid(
                "Verified retained evidence supporting the exact Section 17(5)(h) component reversal."
            ),
            "itc_treatment": _string(
                "Reviewed GST treatment for goods destroyed under Section 17(5)(h).",
                enum=["section_17_5_h_reversal"],
            ),
            "lines": _array(
                _object(
                    {
                        "product_id": _uuid("Canonical product."),
                        "uom_conversion_id": _uuid("Effective canonical product UOM conversion for destruction."),
                        "batch_allocations": _array(
                            DESTRUCTION_BATCH_ALLOCATION,
                            "Explicit batches destroyed.",
                        ),
                    },
                    ("product_id", "uom_conversion_id", "batch_allocations"),
                    "Destroyed product and exact batches.",
                ),
                "Destruction lines.",
            ),
        }
    )

    expense_claim = _header("claim_date", "India-local date on which the member submits the claim.")
    expense_claim.update(
        {
            "period_start": _date("First India-local expense date covered by the claim."),
            "period_end": _date("Last India-local expense date covered by the claim."),
            "purpose": _string("Specific business purpose for the claimed expenses."),
            "reimbursement_account_id": _uuid(
                "Active INR liability account credited for the approved member reimbursement."
            ),
            "tax_treatment": _string(
                "The first reviewed scope expenses the gross receipt and claims no GST input tax or withholding.",
                enum=["non_creditable_gross_expense"],
            ),
            "lines": _array(
                _object(
                    {
                        "expense_date": _date("India-local date printed on the receipt."),
                        "expense_account_id": _uuid("Active INR expense ledger account."),
                        "description": _string("Specific goods or services purchased for the business."),
                        "merchant_name": _string("Merchant name printed on the receipt."),
                        "receipt_attachment_id": _uuid(
                            "Unique verified or retained expense_receipt attachment whose document date matches expense_date."
                        ),
                        "claimed_amount": _decimal("Exact gross INR receipt amount.", money=True),
                    },
                    (
                        "expense_date",
                        "expense_account_id",
                        "description",
                        "merchant_name",
                        "receipt_attachment_id",
                        "claimed_amount",
                    ),
                    "One gross, non-creditable member expense supported by one unique verified receipt.",
                ),
                "Expense claim lines. Partial approval, GST credit, withholding, mileage, per diem, cash advance, and foreign currency remain fail-closed.",
            ),
        }
    )

    commercial_reversal = {
        "original_resource_id": _uuid("Exact posted return or adjustment-note identity to correct."),
        "expected_row_version": {
            "type": "integer",
            "minimum": 1,
            "description": "Exact positive posted source row version.",
        },
        "reversal_date": _date("Counter-document date, not before the original note date."),
        "reason": _string("Required auditable reason explaining why the posted source was erroneous."),
        "amendment_evidence_attachment_id": _uuid(
            "Verified statutory amendment or counter-note evidence; required only after return reporting."
        ),
    }

    definitions = (
        ("erp_sales_order_prepare", "sales.order.prepare", "sales.order.create", "commercial_lines", "actor_confirmation", sales_order),
        ("erp_sales_dispatch_prepare", "sales.dispatch.prepare", "sales.dispatch.create", "batched_commercial_lines", "actor_confirmation", sales_dispatch),
        ("erp_sales_invoice_prepare", "sales.invoice.prepare", "sales.invoice.create", "batched_commercial_lines", "actor_confirmation", sales_invoice),
        ("erp_sales_return_prepare", "sales.return.prepare", "sales.return.create", "original_document_return", "separate_approver", sales_return),
        ("erp_purchase_order_prepare", "procurement.purchase_order.prepare", "procurement.order.manage", "commercial_lines", "actor_confirmation", purchase_order),
        ("erp_goods_receipt_prepare", "procurement.goods_receipt.prepare", "procurement.receipt.post", "received_batches", "actor_confirmation", goods_receipt),
        ("erp_supplier_invoice_prepare", "procurement.supplier_invoice.prepare", "procurement.supplier_invoice.create", "commercial_lines", "actor_confirmation", supplier_invoice),
        ("erp_purchase_return_prepare", "procurement.purchase_return.prepare", "procurement.purchase_return.create", "original_document_return", "separate_approver", purchase_return),
        ("erp_customer_receipt_prepare", "finance.customer_receipt.prepare", "finance.customer_receipt.create", "payment_allocations", "actor_confirmation", customer_receipt),
        ("erp_customer_cheque_clearance_prepare", "finance.customer_cheque_clearance.prepare", "finance.customer_receipt.create", "cheque_instrument_clearance", "separate_approver", customer_cheque_clearance),
        ("erp_customer_cheque_bounce_prepare", "finance.customer_cheque_bounce.prepare", "finance.customer_receipt.create", "cheque_instrument_bounce", "separate_approver", customer_cheque_bounce),
        ("erp_supplier_payment_prepare", "finance.supplier_payment.prepare", "finance.supplier_payment.create", "payment_allocations", "actor_confirmation", supplier_payment),
        ("erp_supplier_advance_prepare", "finance.supplier_advance.prepare", "finance.supplier_advance.create", "supplier_advance", "separate_approver", supplier_advance),
        ("erp_adjustment_note_prepare", "finance.adjustment_note.prepare", "finance.adjustment_note.manage", "original_document_adjustment", "separate_approver", adjustment_note),
        ("erp_inventory_transfer_prepare", "inventory.transfer.prepare", "inventory.transfer.create", "interbranch_batched_movement", "actor_confirmation", inventory_transfer),
        ("erp_inventory_adjustment_prepare", "inventory.adjustment.prepare", "inventory.adjustment.create", "controlled_batched_movement", "separate_approver", inventory_adjustment),
        ("erp_bank_reconciliation_prepare", "finance.bank_reconciliation.prepare", "finance.bank_reconcile", "exact_bank_journal_match", "separate_approver", bank_reconciliation),
        ("erp_inventory_destruction_prepare", "inventory.destruction.prepare", "inventory.destruction.create", "controlled_batched_movement", "separate_approver", inventory_destruction),
        ("erp_expense_claim_prepare", "finance.expense_claim.prepare", "finance.expense.manage", "verified_expense_receipts", "separate_approver", expense_claim),
        ("erp_sales_return_reversal_prepare", "sales.return.reversal.prepare", "finance.adjustment_note.manage", "posted_commercial_reversal", "separate_approver", commercial_reversal),
        ("erp_purchase_return_reversal_prepare", "procurement.purchase_return.reversal.prepare", "finance.adjustment_note.manage", "posted_commercial_reversal", "separate_approver", commercial_reversal),
        ("erp_adjustment_note_reversal_prepare", "finance.adjustment_note.reversal.prepare", "finance.adjustment_note.manage", "posted_commercial_reversal", "separate_approver", commercial_reversal),
    )

    def prepare_schema(
        operation_key: str, properties: Mapping[str, Any]
    ) -> Mapping[str, Any]:
        transport_properties = {
            "idempotency_key": _string(
                "Client-generated stable key for safe prepare retries.",
                pattern=IDEMPOTENCY_KEY_PATTERN,
            ),
            **properties,
        }
        optional_fields = {
            "charge_lines",
            "expense_charge_lines",
            "authority_reference",
            "amendment_evidence_attachment_id",
            "witness_credential",
            "bank_account_id",
            "external_reference",
            "instrument_number",
            "instrument_date",
            "drawee_bank_name",
            "account_payee_confirmed",
            "sales_order_id",
            "qc_notes",
            "supplier_challan_number",
            "supplier_challan_date",
            "recipient_itc_reversal_evidence_attachment_id",
            "recipient_itc_reversal_confirmed_at",
            "supplier_credit_note_portal_line_id",
            "counterparty_portal_document_line_id",
            "supplier_invoice_receipt_allocation_id",
        }
        if operation_key == "sales.invoice.prepare":
            optional_fields.update({"from_location_id", "logistics"})
        required = tuple(
            field for field in transport_properties if field not in optional_fields
        )
        return _object(
            transport_properties,
            required,
            "Prepare and independently validate a single business command without posting it.",
        )

    return {
        tool_name: OperatorAction(
            tool_name=tool_name,
            operation_key=operation_key,
            permission=permission,
            risk_class="consequential_write",
            schema_profile=profile,
            approval_policy=approval_policy,
            input_schema=prepare_schema(operation_key, properties),
        )
        for tool_name, operation_key, permission, profile, approval_policy, properties in definitions
    }


PREPARE_ACTIONS = _prepare_actions()

APPROVE_INPUT_SCHEMA = _object(
    {
        "command_request_id": _uuid("Opaque prepared command request."),
        "preview_hash": _string("Immutable hash returned by prepare.", pattern=PREVIEW_HASH_PATTERN),
        "approval_intent": _string("Explicit human decision.", enum=["approve"]),
        "idempotency_key": _string(
            "Client-generated stable key for approval retries.", pattern=IDEMPOTENCY_KEY_PATTERN
        ),
    },
    ("command_request_id", "preview_hash", "approval_intent", "idempotency_key"),
    "Approve one unchanged prepared command. No business field can be changed here.",
)

EXECUTE_INPUT_SCHEMA = _object(
    {
        "command_request_id": _uuid("Opaque prepared and approved command request."),
        "preview_hash": _string("Immutable hash returned by prepare.", pattern=PREVIEW_HASH_PATTERN),
        "idempotency_key": _string(
            "Client-generated stable key for execution retries.", pattern=IDEMPOTENCY_KEY_PATTERN
        ),
    },
    ("command_request_id", "preview_hash", "idempotency_key"),
    "Execute one unchanged approved command. Business payload is never accepted at execution.",
)

STATUS_INPUT_SCHEMA = _object(
    {"command_request_id": _uuid("Opaque command request to inspect.")},
    ("command_request_id",),
    "Read status and immutable references for one authorized command request.",
)

REVIEW_INPUT_SCHEMA = _object(
    {"command_request_id": _uuid("Prepared command request to inspect before approval.")},
    ("command_request_id",),
    "Read the exact immutable command preview without mutating it.",
)

SHARED_ACTION_SCHEMAS: Mapping[str, Mapping[str, Any]] = {
    "erp_operation_approve": APPROVE_INPUT_SCHEMA,
    "erp_operation_review_get": REVIEW_INPUT_SCHEMA,
    "erp_operation_execute": EXECUTE_INPUT_SCHEMA,
    "erp_operation_status_get": STATUS_INPUT_SCHEMA,
    "erp_bank_reconciliation_get": STATUS_INPUT_SCHEMA,
    "erp_sales_dispatch_readback": STATUS_INPUT_SCHEMA,
    "erp_sales_return_readback": STATUS_INPUT_SCHEMA,
    "erp_purchase_return_readback": STATUS_INPUT_SCHEMA,
    "erp_customer_receipt_readback": STATUS_INPUT_SCHEMA,
    "erp_supplier_payment_readback": STATUS_INPUT_SCHEMA,
    "erp_supplier_advance_readback": STATUS_INPUT_SCHEMA,
    "erp_inventory_transfer_readback": STATUS_INPUT_SCHEMA,
    "erp_inventory_adjustment_readback": STATUS_INPUT_SCHEMA,
    "erp_expense_claim_readback": STATUS_INPUT_SCHEMA,
    "erp_sales_return_reversal_readback": STATUS_INPUT_SCHEMA,
    "erp_purchase_return_reversal_readback": STATUS_INPUT_SCHEMA,
    "erp_adjustment_note_reversal_readback": STATUS_INPUT_SCHEMA,
}


def planned_operator_action_tool_names() -> tuple[str, ...]:
    return tuple(sorted((*PREPARE_ACTIONS, *SHARED_ACTION_SCHEMAS)))


def require_operator_action_publication_ready(
    gates: Mapping[str, bool] = RELEASE_GATES,
) -> None:
    """Fail closed unless the bounded publication flag and every gate are enabled."""
    incomplete = sorted(name for name, verified in gates.items() if verified is not True)
    if not OPERATOR_ACTIONS_EXPORTED or incomplete:
        detail = ", ".join(incomplete) if incomplete else "source publication flag"
        raise OperatorActionsUnavailable(f"operator actions are not publishable: {detail}")
