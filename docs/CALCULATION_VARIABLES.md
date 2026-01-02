# Calculation Variables Reference

> **Single Source of Truth** - All field names match the database schema exactly.
> 
> Refer to: `Architecture Documentation/07-DATABASE-SCHEMA.md` → `sales.invoices`

---

## 📊 Invoice-Level Totals

These fields match the `sales.invoices` table columns:

| DB Column | Type | Description |
|-----------|------|-------------|
| `subtotal_amount` | numeric | Sum of item subtotals (qty × rate) |
| `discount_amount` | numeric | Sum of item-level discounts |
| `scheme_discount` | numeric | Invoice/bill-level discount |
| `taxable_amount` | numeric | subtotal - discounts |
| `total_tax_amount` | numeric | Total GST (CGST + SGST or IGST) |
| `cgst_amount` | numeric | CGST (intra-state) |
| `sgst_amount` | numeric | SGST (intra-state) |
| `igst_amount` | numeric | IGST (inter-state) |
| `freight_charges` | numeric | Delivery/transport charges |
| `insurance_charges` | numeric | Insurance charges |
| `other_charges` | numeric | Other additional charges |
| `round_off_amount` | numeric | Rounding adjustment |
| `final_amount` | numeric | Net payable amount |

---

## 🧮 Item-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `quantity` | number | Billable quantity |
| `free_quantity` | number | Free items (not billed) |
| `unit_price` | number | Price per unit |
| `mrp` | number | Maximum retail price |
| `discount_percent` | number | Discount percentage |
| `discount_amount` | number | Calculated discount ₹ |
| `gst_percent` | number | GST rate |
| `subtotal` | number | qty × unit_price |
| `taxable_amount` | number | subtotal - discount_amount |
| `gst_amount` | number | Tax amount |
| `cgst_amount` | number | CGST component |
| `sgst_amount` | number | SGST component |
| `igst_amount` | number | IGST component |
| `total_amount` | number | Final line amount |

---

## ❌ Deprecated Names (Do Not Use)

| ❌ Old Name | ✅ Use Instead |
|-------------|----------------|
| `gross_amount` | `subtotal_amount` |
| `total_discount` | `discount_amount` |
| `additional_discount` | `scheme_discount` |
| `invoice_discount` | `scheme_discount` |
| `total_gst` | `total_tax_amount` |
| `total_tax` | `total_tax_amount` |
| `delivery_charges` | `freight_charges` |
| `round_off` | `round_off_amount` |
| `net_amount` | `final_amount` |
| `rate` | `unit_price` |
| `tax_amount` | `gst_amount` |

---

## 🔄 Calculation Flow

```
ITEM LEVEL:
┌─────────────────────────────────────────────────────────┐
│  quantity × unit_price = subtotal                       │
│  subtotal × discount_percent / 100 = discount_amount    │
│  subtotal - discount_amount = taxable_amount            │
│  taxable_amount × gst_percent / 100 = gst_amount        │
│  taxable_amount + gst_amount = total_amount             │
└─────────────────────────────────────────────────────────┘

INVOICE LEVEL:
┌─────────────────────────────────────────────────────────┐
│  Σ subtotal = subtotal_amount                           │
│  Σ discount_amount = discount_amount                    │
│  subtotal_amount - discount_amount = taxable_before     │
│  taxable_before × scheme_percent / 100 = scheme_discount│
│  taxable_before - scheme_discount = taxable_amount      │
│  Σ gst_amount = total_tax_amount                        │
│  taxable + tax + freight = net_before_round             │
│  round(net_before_round) = final_amount                 │
│  final_amount - net_before_round = round_off_amount     │
└─────────────────────────────────────────────────────────┘
```

---

## 📁 Source Files

| Layer | File |
|-------|------|
| Frontend Calculator | `frontend/src/services/enterpriseCalculator.ts` |
| Backend Service | `backend/app/api/services/invoice_service.py` |
| API Route | `backend/app/api/routes/sales/invoices.py` |
| Database Schema | `Architecture Documentation/07-DATABASE-SCHEMA.md` |
| Type Definitions | `frontend/src/components/sales/invoice/types/invoiceTypes.ts` |
