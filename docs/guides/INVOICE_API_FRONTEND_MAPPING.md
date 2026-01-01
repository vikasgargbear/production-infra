# Invoice API & Frontend Variable Mapping Guide

> [!IMPORTANT]
> **Single Source of Truth** for variable naming across the Invoice Workflow (Online & Offline).
> All legacy aliases have been removed. Use canonical names only.

---

## 1. Canonical Variable Names (ENFORCED)

| Variable Concept | **DB Column** | **Sync/API JSON** | **Frontend State** | **Status** |
| :--- | :--- | :--- | :--- | :--- |
| **Price (Selling)** | `sale_price_per_unit` | `sale_price_per_unit` | `unit_price` | ✅ Enforced |
| **MRP** | `mrp_per_unit` | `mrp_per_unit` | `mrp` | ✅ Enforced |
| **Tax Rate** | `gst_percent` | `gst_percent` | `gst_percent` | ✅ Canonical |
| **Quantity** | `quantity` | `quantity` | `quantity` | ✅ Canonical |
| **Stock** | `quantity_available` | `quantity_available` | `quantity_available` | ✅ Canonical |
| **Discount** | `discount_percent` | `discount_percent` | `discount_percent` | ✅ Canonical |
| **Invoice Total** | `final_amount` | `final_amount` | `final_amount` | ✅ Enforced |
| **Payment Mode** | `payment_terms` | `payment_terms` | `payment_mode` | ⚠️ Backend maps |

---

## 2. Removed Aliases (DO NOT USE)

| ❌ Removed Alias | ✅ Use Instead | Where Removed |
| :--- | :--- | :--- |
| `rate` | `unit_price` | EnterpriseCalculator, useInvoiceLogic |
| `sale_price` | `sale_price_per_unit` | sync.py, dataTransformer |
| `mrp` (aliased) | `mrp_per_unit` | sync.py |
| `net_amount` | `final_amount` | EnterpriseCalculator, invoice steps |
| `total_amount` | `final_amount` | EnterpriseCalculator |
| `tax_rate` | `gst_percent` | All components (fallback only) |
| `line_total` | `total_amount` | EnterpriseCalculator item output |

---

## 3. Explicit Mapping Points

### A. `sync.py` (Backend)
- Returns raw column names: `sale_price_per_unit`, `mrp_per_unit`
- **NO aliasing** to `sale_price` or `mrp`

### B. `BatchSelector.js` (Frontend)
- Reads `batch.sale_price_per_unit` directly
- Maps to `unit_price` only in `handleBatchSelect`:
```javascript
const productWithBatch = {
  ...product,
  unit_price: batch.sale_price_per_unit || product.sale_price_per_unit || 0,
  mrp: batch.mrp_per_unit || product.mrp_per_unit || product.mrp || 0,
};
```

### C. `useInvoiceLogic.js` → `prepareItemForInvoice()`
- Inline helper replaces DataTransformer
- Explicit mapping:
```javascript
unit_price: parseFloat(product.sale_price_per_unit || product.unit_price || 0),
mrp: parseFloat(product.mrp_per_unit || product.mrp || 0),
```

### D. `EnterpriseCalculator.js`
- Input: Uses `getNumericField()` which checks canonical name first
- Output: Only canonical names (`unit_price`, `final_amount`, `gst_percent`)
- **Removed**: `rate`, `line_total`, `net_amount`, camelCase versions

---

## 4. API Payload (Create Invoice)

**Endpoint:** `POST /api/invoices/`

```json
{
  "customer_id": 101,
  "invoice_date": "2024-05-20",
  "items": [
    {
      "product_id": 505,
      "batch_id": 99,
      "quantity": 10,
      "unit_price": 100.00,
      "mrp": 120.00,
      "discount_percent": 5.0,
      "gst_percent": 12.0
    }
  ],
  "payment_mode": "cash",
  "final_amount": 1200.00
}
```

> [!TIP]
> **Debugging**: If `unit_price` is 0, check if component is reading from `sale_price` instead of `sale_price_per_unit`.
