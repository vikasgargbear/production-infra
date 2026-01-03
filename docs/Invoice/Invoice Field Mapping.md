# Invoice Workflow Field Name Audit

> **Goal:** Ensure all field names match database schema exactly - no SQL aliases.

---

## 🔍 Audit Results: SQL Aliases Found

### Critical Aliases (Cause Frontend Issues)

| File | Line | Alias | Database Column | Status |
|------|------|-------|-----------------|--------|
| `employees.py` | 39 | `full_name as employee_name` | `full_name` | ✅ Fixed |
| `employees.py` | 47 | `joining_date as date_of_joining` | `joining_date` | ✅ Fixed |
| `invoice_service.py` | 36 | `state_name as state` | `state_name` | ✅ Fixed |
| `orders.py` | 68 | `primary_phone as phone` | `primary_phone` | ✅ Fixed |
| `challan.py` | 472 | `challan_status as status` | `challan_status` | ✅ Fixed |
| `challan.py` | 474 | `transporter_name as delivery_company` | `transporter_name` | ✅ Fixed |
| `challan.py` | 531-532 | `gstin as customer_gstin`, etc. | actual names | ✅ Fixed |
| `invoices/routes.py` | 819 | `GREATEST(...) as credit_amount` | `credit_amount` | ✅ Fixed (uses DB column) |

### Computed Fields (Review Required)

| File | Line | Field | Question | Recommendation |
|------|------|-------|----------|----------------|
| `invoices/routes.py` | 819 | `credit_amount` | Should this be a DB column? | ⚠️ Consider adding to `sales.invoices` if used frequently |
| `returns.py` | 158 | `total_items` | Aggregate | ✅ OK as computed (COUNT) |
| `returns.py` | 269 | `paid_quantity` | Should exclude free items from return credit? | ✅ Yes - standard practice: credit = qty - free_qty |
| `challan.py` | 748+ | `total_challans`, `draft_count` | Dashboard aggregates | ✅ OK - computed for display only |

> **Note on `return_quantity`:** Having same name in both `sales_returns` (header total) and `sales_return_items` (line item) is OK - follows standard pattern like `quantity` on order vs order_items.

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
