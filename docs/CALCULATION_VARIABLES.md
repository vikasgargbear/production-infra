# Calculation Variables Reference

> Single source of truth - All field names match the database schema exactly.

## 📊 Invoice Totals (sales.invoices table)

| DB Column | Type | Description |
|-----------|------|-------------|
| `subtotal_amount` | numeric | Sum of item subtotals (qty × rate) |
| `discount_amount` | numeric | Sum of item-level discounts |
| `scheme_discount` | numeric | Invoice/bill-level discount |
| `taxable_amount` | numeric | subtotal - discount - scheme_discount |
| `total_tax_amount` | numeric | Total GST |
| `cgst_amount` | numeric | CGST (intra-state) |
| `sgst_amount` | numeric | SGST (intra-state) |
| `igst_amount` | numeric | IGST (inter-state) |
| `freight_charges` | numeric | Delivery charges |
| `round_off_amount` | numeric | Rounding adjustment |
| `final_amount` | numeric | Net payable amount |

## 🧮 Item-Level Fields

| Field | Description |
|-------|-------------|
| `quantity` | Billable quantity |
| `free_quantity` | Free items (not billed) |
| `unit_price` | Price per unit |
| `discount_percent` | Discount % |
| `gst_percent` | GST rate |
| `subtotal` | qty × unit_price |
| `discount_amount` | Item discount ₹ |
| `taxable_amount` | subtotal - discount |
| `gst_amount` | Tax amount |
| `total_amount` | Line total |

## 📁 Source Files

- **Frontend**: `frontend/src/services/enterpriseCalculator.ts`
- **Backend**: `backend/app/api/services/invoice_service.py`
- **Schema**: `Architecture Documentation/07-DATABASE-SCHEMA.md`
