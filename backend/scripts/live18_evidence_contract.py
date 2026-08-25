"""Mandatory canonical lineage required by exact-SHA Live18 evidence."""

MANDATORY_LINEAGE_PATHS = {
    "sales.order.prepare": (
        "customer_account_id", "delivery_address_id", "delivery_address_row_version",
        "lines.0.product_id", "lines.0.uom_conversion_id",
    ),
    "sales.dispatch.prepare": (
        "sales_order_id", "from_location_id", "lines.0.sales_order_line_id",
        "lines.0.batch_allocations.0.batch_id",
    ),
    "sales.invoice.prepare": (
        "customer_account_id", "delivery_address_id", "delivery_address_row_version",
        "lines.0.product_id", "lines.0.uom_conversion_id",
    ),
    "sales.return.prepare": (
        "original_invoice_id", "lines.0.original_invoice_line_id",
        "lines.0.invoice_dispatch_allocation_id", "lines.0.batch_allocation.batch_id",
        "lines.0.to_location_id",
    ),
    "procurement.purchase_order.prepare": (
        "supplier_account_id", "lines.0.product_id", "lines.0.uom_conversion_id",
    ),
    "procurement.goods_receipt.prepare": (
        "purchase_order_id", "supplier_account_id", "lines.0.purchase_order_line_id",
        "lines.0.batches.0.mrp_uom_conversion_id",
        "lines.0.batches.0.to_location_id",
    ),
    "procurement.supplier_invoice.prepare": (
        "supplier_account_id", "supplier_tax_registration_id",
        "portal_document_line_id", "goods_receipt_ids.0",
        "lines.0.goods_receipt_line_id",
    ),
    "procurement.purchase_return.prepare": (
        "original_supplier_invoice_id", "supplier_destination_address_id",
        "lines.0.goods_receipt_line_id",
        "lines.0.supplier_invoice_receipt_allocation_id",
        "lines.0.batch_allocation.batch_id", "lines.0.from_location_id",
    ),
    "finance.customer_receipt.prepare": (
        "customer_account_id", "settlement_account_id", "allocations.0.open_item_id",
    ),
    "finance.supplier_payment.prepare": (
        "supplier_account_id", "settlement_account_id", "allocations.0.open_item_id",
    ),
    "finance.supplier_advance.prepare": (
        "supplier_account_id", "purchase_order_id", "settlement_account_id",
        "allocations.0.purchase_order_line_id",
    ),
    "finance.adjustment_note.prepare": (
        "original_document_id", "lines.0.original_line_id",
    ),
    "finance.bank_reconciliation.prepare": (
        "bank_statement_id", "bank_statement_line_id", "journal_entry_id",
    ),
    "finance.expense_claim.prepare": (
        "reimbursement_account_id", "lines.0.expense_account_id",
        "lines.0.receipt_attachment_id",
    ),
    "inventory.adjustment.prepare": (
        "counted_by_membership_id", "location_id", "evidence_attachment_id",
        "lines.0.product_id", "lines.0.uom_conversion_id",
        "lines.0.batch_counts.0.batch_id",
    ),
    "inventory.transfer.prepare": (
        "source_branch_id", "destination_branch_id", "source_location_id",
        "destination_location_id", "lines.0.product_id",
        "lines.0.uom_conversion_id", "lines.0.batch_allocations.0.batch_id",
    ),
    "inventory.destruction.prepare": (
        "location_id", "certificate_attachment_id", "lines.0.product_id",
        "lines.0.uom_conversion_id", "lines.0.batch_allocations.0.batch_id",
    ),
}
