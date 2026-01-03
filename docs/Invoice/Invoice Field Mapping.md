# Invoice Workflow Field Name Audit

> **Goal:** Ensure all field names match database schema exactly - no SQL aliases.

---

## 🔍 Audit Results: SQL Aliases Found

### Critical Aliases (Cause Frontend Issues)

| File | Line | Alias | Database Column | Status |
|------|------|-------|-----------------|--------|
| `employees.py` | 39 | `full_name as employee_name` | `full_name` | ✅ Fixed |
| `employees.py` | 47 | `joining_date as date_of_joining` | `joining_date` | ✅ Fixed |
| `invoice_service.py` | 36 | `state_name as state` | `state_name` | ⚠️ To Fix |
| `orders.py` | 328 | `tax_percent as tax_percent` | `gst_percent` | ⚠️ To Fix |
| `order_service.py` | 148 | `gst_percentage as gst_percent` | `gst_percent` | ⚠️ To Fix |

### Computed Fields (OK - Not In Schema)

These are calculated values that don't exist as columns:

| File | Line | Computed Field | Notes |
|------|------|----------------|-------|
| `invoices/routes.py` | 819 | `credit_amount` | Computed: `final_amount - paid_amount` |
| `returns.py` | 158 | `total_items` | COUNT aggregate |
| `returns.py` | 269 | `paid_quantity` | Computed |
| `challan.py` | 748+ | `total_challans`, `draft_count`, etc. | Aggregates |

---

## ✅ Standard Field Names (Match Database)

### Invoice Fields (`sales.invoices`)
| Field | Type |
|-------|------|
| `invoice_id` | int |
| `invoice_number` | string |
| `invoice_date` | date |
| `customer_id` | int |
| `subtotal_amount` | numeric |
| `discount_amount` | numeric |
| `scheme_discount` | numeric |
| `taxable_amount` | numeric |
| `cgst_amount` | numeric |
| `sgst_amount` | numeric |
| `igst_amount` | numeric |
| `total_tax_amount` | numeric |
| `freight_charges` | numeric |
| `round_off_amount` | numeric |
| `final_amount` | numeric |
| `paid_amount` | numeric |

### Employee Fields (`master.employees`)
| Field | Type |
|-------|------|
| `employee_id` | int |
| `employee_code` | string |
| `full_name` | string |
| `first_name` | string |
| `designation` | string |
| `joining_date` | date |

### Product Fields (`inventory.products`)
| Field | Type |
|-------|------|
| `product_id` | int |
| `product_name` | string |
| `product_code` | string |
| `gst_percent` | numeric |
| `hsn_code` | string |

---

## 📁 Source Files

| Layer | File |
|-------|------|
| Invoice Routes | `backend/app/api/routes/sales/invoices/routes.py` |
| Invoice Service | `backend/app/api/services/sales/invoice_service.py` |
| Order Routes | `backend/app/api/routes/sales/orders.py` |
| Order Service | `backend/app/api/services/sales/order_service.py` |
| Employee Routes | `backend/app/api/routes/master/employees.py` |
| Customer Routes | `backend/app/api/routes/master/customers.py` |
