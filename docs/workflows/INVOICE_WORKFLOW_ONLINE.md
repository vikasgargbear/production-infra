# Online Invoice Workflow & Data Dictionary

## Overview
This document defines the **schema contract** for the Invoice ecosystem. It maps every field used in the Online Workflow to its Data Source and Backend destination.

**Status**: 🟢 Verified against `useInvoiceLogic.js` and `billing.py`
**Goal**: Ensure Offline Sync provides exactly these fields.

---

## 1. Data Dictionary

### A. Initialization & Header
| Field Name | Type | Source (Online) | Offline Sync Table | Usage |
|:---|:---|:---|:---|:---|
| `invoice_date` | `string` | System (Format: YYYY-MM-DD) | N/A | Invoice Header |
| `due_date` | `string` | Calculated (`invoice_date` + `customer.credit_days`) | N/A | Payment Tracking |
| `sales_person_id` | `int` | `GET /api/employees` | `employees` | M.R. Assignment |
| `org_id` | `UUID` | `localStorage` | `auth_state` | Tenant Isolation |

### B. Customer Selection (`selectedCustomer`)
**Source**: `GET /api/parties/customers` (Search/List)
**Frontend Variable**: `selectedCustomer`

| Field Variable | Backend Column (DB) | Usage in Calculation/UI | Critical? |
|:---|:---|:---|:---|
| `customer_id` | `customer_id` | Link to invoice | ✅ |
| `customer_name` | `customer_name` | Display | ✅ |
| `primary_phone` | `primary_phone` | Display | ⚠️ |
| `email` | `primary_email` | Communication | ⚠️ |
| `gst_number` | `gst_number` | Tax Calculation (Inter/Intra state) | ✅ |
| `credit_days` | `credit_days` | Calculates `due_date` | ✅ |
| `credit_limit` | `credit_limit` | Validation Warning | ⚠️ |
| `current_outstanding` | `current_outstanding` | Validation Warning | ⚠️ |
| `address_line1` | `address_line1` (via JOIN) | Invoice PDF Address | ✅ |
| `city` | `city` (via JOIN) | Invoice PDF Address | ✅ |
| `state` | `state_name` (via JOIN) | Invoice PDF Address | ✅ |
| `pincode` | `pincode` (via JOIN) | Invoice PDF Address | ✅ |
| `state_code` | `state_code` (via JOIN) | Determines IGST vs CGST | ✅ |

### C. Product & Batch Selection (`items[]`)
**Source**: `GET /api/products` and `GET /api/inventory/batches`
**Transformation**: `DataTransformer.transformProduct(..., 'invoice')`

| Field Variable | Source Field (Backend) | Logic / Alias Note | Critical? |
|:---|:---|:---|:---|
| `product_id` | `product_id` | Unique Identifier | ✅ |
| `product_name` | `product_name` | Display | ✅ |
| `hsn_code` | `hsn_code` | Tax Reporting | ✅ |
| `batch_id` | `batch_id` | Inventory Deduction | ✅ |
| `batch_number` | `batch_number` | Display & Inventory | ✅ |
| `expiry_date` | `expiry_date` | Validation (Expired check) | ✅ |
| `quantity` | User Input | Multiplier for Amount | ✅ |
| `free_quantity` | User Input | Inventory deduction only | ⚠️ |
| `unit_price` | `sale_price_per_unit` | **Canonical Price**. Aliased as `sale_price` | ✅ |
| `mrp` | `mrp_per_unit` | Display | ✅ |
| `cost_price` | `cost_per_unit` | Profit Calculation (Internal) | ❌ |
| `gst_percent` | `gst_percent` (Product) | **Tax Rate**. From `products` table | ✅ |
| `discount_percent`| User Input | Line Item Discount | ✅ |

### D. Financial Calculations
**Logic**: Defined in `EnterpriseCalculator.js` / `useInvoiceLogic.js`

1.  **Line Subtotal**: `quantity * unit_price`
2.  **Line Discount**: `(Line Subtotal * discount_percent) / 100`
3.  **Taxable Value**: `Line Subtotal - Line Discount`
4.  **GST Amount**: `(Taxable Value * gst_percent) / 100`
5.  **Line Total**: `Taxable Value + GST Amount`
6.  **Invoice Net Total**: `Sum(Line Totals)` - `Bill Discount` + `Freight`

### E. Submission Payload (`POST /api/sales/invoices`)
The specific JSON structure the backend REQUIRES. Offline sync MUST replicate this.

```json
{
  "customer_id": 123,
  "invoice_date": "2024-12-15",
  "due_date": "2024-12-30",
  "items": [
    {
      "product_id": 1001,
      "batch_id": 500,
      "quantity": 10,
      "unit_price": 50.00,  // MUST be numeric. No string "50.00"
      "mrp": 60.00,
      "gst_percent": 12.0,
      "discount_percent": 5.0
    }
  ],
  "payment_mode": "cash", 
  "payment_status": "pending",
  "billing_address": "Full address string..."
}
```

---

## 2. Sync Gap Audit
*Comparison of Online Requirements vs Current Offline Sync Implementation*

| Requirement | Offline Status | Notes |
|:---|:---|:---|
| `customer.address_line1` | ✅ SYNCED | Fixed via JOIN in `sync.py` |
| `customer.state_code` | ✅ SYNCED | Fixed via JOIN in `sync.py` |
| `batch.unit_price` | ✅ SYNCED | Renamed `selling_price` -> `sale_price` in `sync.py` |
| `batch.cost_price` | ✅ SYNCED | Available as `cost_per_unit` |
| `employee.employee_name` | ✅ SYNCED | Available in `master.employees` sync |
| `product.gst_percent` | ✅ SYNCED | Available in `inventory.products` sync |

## 3. Workflow Validation Steps
1.  **Frontend**: `useInvoiceLogic` falls back to `offlineDB` for Employees/Batches (Implemented).
2.  **Backend**: `sync.py` provides aliased columns to match Frontend `DataTransformer` (Implemented).
3.  **Upload**: `syncEngine.js` constructs payload matching `InvoiceCreateRequest` schema (Verified).
