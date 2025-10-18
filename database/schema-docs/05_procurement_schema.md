# Procurement Schema Documentation

**Schema:** `procurement`
**Purpose:** Purchase management from requisition to goods receipt
**Last Updated:** 2025-10-16
**Tables:** 16

---

## Overview

The `procurement` schema manages the complete procure-to-pay cycle including purchase requisitions, purchase orders, goods receipt notes, purchase returns, supplier quotations, and supplier invoices. Critical for pharmaceutical inventory replenishment with batch tracking and vendor management.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Features |
|---|-------|---------|-------------|--------------|
| 1 | purchase_requisitions | PR requests | requisition_id | Multi-level approval, PO conversion |
| 2 | purchase_requisition_items | PR line items | requisition_item_id | Stock analysis, supplier suggestions |
| 3 | purchase_orders | PO master | purchase_order_id | Supplier acknowledgment, delivery tracking |
| 4 | purchase_order_items | PO line items | po_item_id | Batch-wise receipt tracking |
| 5 | supplier_quotations | Supplier quotes | quotation_id | Comparative analysis, PO conversion |
| 6 | supplier_quotation_items | Quote line items | quotation_item_id | Price comparison |
| 7 | goods_receipt_notes | GRN/receipt | grn_id | QC, batch creation, invoice matching |
| 8 | grn_items | GRN line items | grn_item_id | Accepted/rejected quantities |
| 9 | purchase_returns | Purchase returns | return_id | Debit note generation |
| 10 | purchase_return_items | Return line items | return_item_id | Reason tracking |
| 11 | supplier_invoices | Vendor invoices | supplier_invoice_id | 3-way matching (PO-GRN-Invoice) |
| 12 | supplier_invoice_items | Invoice line items | supplier_invoice_item_id | Line-item matching |
| 13 | branch_budgets | Branch budgets | budget_id | Budget vs actual tracking |
| 14 | vendor_performance | Vendor KPIs | performance_id | Quality, delivery, pricing ratings |
| 15 | grn_return_status | GRN return view | - | Return analytics |
| 16 | supplier_invoice_return_status | Invoice return view | - | Return tracking |

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [03_inventory_schema.md](./03_inventory_schema.md) - Batch creation from GRN
- [06_financial_schema.md](./06_financial_schema.md) - Accounts payable

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 16
**Key Features:** 3-Way Matching, QC Integration, Multi-level Approval, Vendor Performance, Budget Control
