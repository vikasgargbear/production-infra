# Procurement Schema Documentation

## Overview
The `procurement` schema manages the complete procurement process from purchase requisitions to goods receipt, including supplier management, quality control, and inventory inward processing.

---

## Tables

### 1. purchase_orders

### purchase_orders
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_purchase_orders()`, `api.create_purchase_order()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `purchase_order_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `po_number` | TEXT | ✓ | Description needed | Standard field usage |
| `po_date` | DATE | - | Description needed | Standard field usage |
| `po_type` | TEXT | - | Description needed | Standard field usage |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `supplier_name` | TEXT | ✓ | Description needed | Standard field usage |
| `supplier_reference` | TEXT | - | Description needed | Standard field usage |
| `expected_delivery_date` | DATE | - | Description needed | Standard field usage |
| `delivery_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `delivery_terms` | TEXT | - | Description needed | Standard field usage |
| `payment_terms` | TEXT | - | Description needed | Standard field usage |
| `payment_days` | INTEGER | - | Description needed | Standard field usage |
| `due_date` | DATE | - | Description needed | Standard field usage |
| `subtotal_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `other_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `round_off_amount` | NUMERIC(5 | - | Description needed | Standard field usage |
| `total_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `po_status` | TEXT | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `items_count` | INTEGER | - | Description needed | Standard field usage |
| `items_received` | INTEGER | - | Description needed | Standard field usage |
| `receipt_status` | TEXT | - | Description needed | Standard field usage |
| `sent_to_supplier` | BOOLEAN | - | Description needed | Standard field usage |
| `sent_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `acknowledged_by_supplier` | BOOLEAN | - | Description needed | Standard field usage |
| `acknowledged_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `terms_and_conditions` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `delivery_location_id` → `inventory.storage_locations.location_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 2. purchase_order_items

### purchase_order_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_purchase_order_items()`, `api.create_purchase_order_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `po_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `purchase_order_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_name` | TEXT | ✓ | Description needed | Standard field usage |
| `manufacturer` | TEXT | - | Description needed | Standard field usage |
| `hsn_code` | TEXT | - | Description needed | Standard field usage |
| `ordered_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_type` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_size` | INTEGER | - | Description needed | Standard field usage |
| `base_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `free_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `scheme_details` | TEXT | - | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `discount_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `line_total` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `received_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pending_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cancelled_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `bonus_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `item_notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `purchase_order_id` → `procurement.purchase_orders.purchase_order_id`
- `product_id` → `inventory.products.product_id`

---

### 3. goods_receipt_notes

### goods_receipt_notes
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_goods_receipt_notes()`, `api.create_goods_receipt_note()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `grn_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `grn_number` | TEXT | ✓ | Description needed | Standard field usage |
| `grn_date` | DATE | - | Description needed | Standard field usage |
| `grn_type` | TEXT | - | Description needed | Standard field usage |
| `purchase_order_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `supplier_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `supplier_invoice_number` | TEXT | - | Description needed | Standard field usage |
| `supplier_invoice_date` | DATE | - | Description needed | Standard field usage |
| `supplier_challan_number` | TEXT | - | Description needed | Standard field usage |
| `supplier_challan_date` | DATE | - | Description needed | Standard field usage |
| `received_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `received_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `storage_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `transport_mode` | TEXT | - | Description needed | Standard field usage |
| `vehicle_number` | TEXT | - | Description needed | Standard field usage |
| `lr_number` | TEXT | - | Description needed | Standard field usage |
| `lr_date` | DATE | - | Description needed | Standard field usage |
| `qc_required` | BOOLEAN | - | Description needed | Standard field usage |
| `qc_status` | TEXT | - | Description needed | Standard field usage |
| `qc_completed_by` | INTEGER | - | Description needed | Standard field usage |
| `qc_completed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `qc_notes` | TEXT | - | Description needed | Standard field usage |
| `supplier_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `calculated_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `variance_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `grn_status` | TEXT | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `stock_updated` | BOOLEAN | - | Description needed | Standard field usage |
| `stock_updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `rejection_reason` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `purchase_order_id` → `procurement.purchase_orders.purchase_order_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `received_by` → `master.org_users.user_id`
- `storage_location_id` → `inventory.storage_locations.location_id`
- `qc_completed_by` → `master.org_users.user_id`
- `approved_by` → `master.org_users.user_id`

---

### 4. grn_items

### grn_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_grn_items()`, `api.create_grn_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `grn_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `grn_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `po_item_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | ✓ | Description needed | Standard field usage |
| `manufacturing_date` | DATE | - | Description needed | Standard field usage |
| `expiry_date` | DATE | ✓ | Description needed | Standard field usage |
| `ordered_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `received_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `accepted_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `rejected_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `free_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_type` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_size` | INTEGER | - | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `mrp` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `ptr` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pts` | NUMERIC(15 | - | Description needed | Standard field usage |
| `ptr_margin_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `pts_margin_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `qc_status` | TEXT | - | Description needed | Standard field usage |
| `qc_notes` | TEXT | - | Description needed | Standard field usage |
| `rejection_reason` | TEXT | - | Description needed | Standard field usage |
| `storage_location_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `item_notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `grn_id` → `procurement.goods_receipt_notes.grn_id`
- `po_item_id` → `procurement.purchase_order_items.po_item_id`
- `product_id` → `inventory.products.product_id`
- `storage_location_id` → `inventory.storage_locations.location_id`

---

### 5. supplier_invoices

### supplier_invoices
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_supplier_invoices()`, `api.create_supplier_invoice()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `supplier_invoice_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `supplier_invoice_number` | TEXT | ✓ | Description needed | Standard field usage |
| `invoice_date` | DATE | ✓ | Description needed | Standard field usage |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `purchase_order_ids` | INTEGER[] | - | Description needed | Standard field usage |
| `grn_ids` | INTEGER[] | - | Description needed | Standard field usage |
| `subtotal_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `freight_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `insurance_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `other_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `round_off_amount` | NUMERIC(5 | - | Description needed | Standard field usage |
| `invoice_total` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `tds_applicable` | BOOLEAN | - | Description needed | Standard field usage |
| `tds_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `tds_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `payment_terms` | TEXT | - | Description needed | Standard field usage |
| `due_date` | DATE | - | Description needed | Standard field usage |
| `payment_status` | TEXT | - | Description needed | Standard field usage |
| `paid_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `gstr2a_matched` | BOOLEAN | - | Description needed | Standard field usage |
| `gstr2a_match_date` | DATE | - | Description needed | Standard field usage |
| `itc_eligible` | BOOLEAN | - | Description needed | Standard field usage |
| `matching_status` | TEXT | - | Description needed | Standard field usage |
| `invoice_status` | TEXT | - | Description needed | Standard field usage |
| `verified_by` | INTEGER | - | Description needed | Standard field usage |
| `verified_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `rejection_reason` | TEXT | - | Description needed | Standard field usage |
| `invoice_document_path` | TEXT | - | Description needed | Standard field usage |
| `supporting_documents` | JSONB | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `verified_by` → `master.org_users.user_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 6. purchase_returns

### purchase_returns
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_purchase_returns()`, `api.create_purchase_return()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `return_number` | TEXT | ✓ | Description needed | Standard field usage |
| `return_date` | DATE | - | Description needed | Standard field usage |
| `return_type` | TEXT | ✓ | Description needed | Standard field usage |
| `grn_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `supplier_invoice_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `return_reason` | TEXT | ✓ | Description needed | Standard field usage |
| `detailed_reason` | TEXT | - | Description needed | Standard field usage |
| `approval_required` | BOOLEAN | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `return_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `debit_note_number` | TEXT | - | Description needed | Standard field usage |
| `debit_note_date` | DATE | - | Description needed | Standard field usage |
| `debit_note_status` | TEXT | - | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `supplier_acknowledged` | BOOLEAN | - | Description needed | Standard field usage |
| `supplier_acknowledgment_date` | DATE | - | Description needed | Standard field usage |
| `supplier_credit_note_number` | TEXT | - | Description needed | Standard field usage |
| `dispatch_date` | DATE | - | Description needed | Standard field usage |
| `transport_details` | JSONB | - | Description needed | Standard field usage |
| `adjustment_type` | TEXT | - | Description needed | Standard field usage |
| `adjusted_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pending_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `grn_id` → `procurement.goods_receipt_notes.grn_id`
- `supplier_invoice_id` → `procurement.supplier_invoices.supplier_invoice_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 7. purchase_return_items

### purchase_return_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_purchase_return_items()`, `api.create_purchase_return_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `return_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `grn_item_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | ✓ | Description needed | Standard field usage |
| `return_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `return_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `item_return_reason` | TEXT | - | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `return_id` → `procurement.purchase_returns.return_id`
- `grn_item_id` → `procurement.grn_items.grn_item_id`
- `product_id` → `inventory.products.product_id`

---

### 8. purchase_requisitions

### purchase_requisitions
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_purchase_requisitions()`, `api.create_purchase_requisition()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `requisition_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `requisition_number` | TEXT | ✓ | Description needed | Standard field usage |
| `requisition_date` | DATE | - | Description needed | Standard field usage |
| `required_by_date` | DATE | - | Description needed | Standard field usage |
| `requested_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `department` | TEXT | - | Description needed | Standard field usage |
| `requisition_type` | TEXT | - | Description needed | Standard field usage |
| `priority` | TEXT | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `current_approver_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `approval_history` | JSONB | - | Description needed | Standard field usage |
| `requisition_status` | TEXT | - | Description needed | Standard field usage |
| `converted_to_po` | BOOLEAN | - | Description needed | Standard field usage |
| `po_ids` | INTEGER[] | - | Description needed | Standard field usage |
| `purpose` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `rejection_reason` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `requested_by` → `master.org_users.user_id`
- `current_approver_id` → `master.org_users.user_id`

---

### 9. purchase_requisition_items

### purchase_requisition_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_purchase_requisition_items()`, `api.create_purchase_requisition_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `requisition_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `requisition_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `requested_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `current_stock` | NUMERIC(15 | - | Description needed | Standard field usage |
| `reorder_level` | NUMERIC(15 | - | Description needed | Standard field usage |
| `suggested_supplier_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `last_purchase_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `approved_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `item_notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `requisition_id` → `procurement.purchase_requisitions.requisition_id`
- `product_id` → `inventory.products.product_id`
- `suggested_supplier_id` → `parties.suppliers.supplier_id`

---

### 10. supplier_quotations

### supplier_quotations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_supplier_quotations()`, `api.create_supplier_quotation()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `quotation_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `quotation_number` | TEXT | ✓ | Description needed | Standard field usage |
| `quotation_date` | DATE | ✓ | Description needed | Standard field usage |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `requisition_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `rfq_number` | TEXT | - | Description needed | Standard field usage |
| `valid_until` | DATE | - | Description needed | Standard field usage |
| `payment_terms` | TEXT | - | Description needed | Standard field usage |
| `delivery_terms` | TEXT | - | Description needed | Standard field usage |
| `other_terms` | TEXT | - | Description needed | Standard field usage |
| `total_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quotation_status` | TEXT | - | Description needed | Standard field usage |
| `is_best_price` | BOOLEAN | - | Description needed | Standard field usage |
| `price_rank` | INTEGER | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `requisition_id` → `procurement.purchase_requisitions.requisition_id`
- `created_by` → `master.org_users.user_id`

---

### 11. supplier_quotation_items

### supplier_quotation_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_supplier_quotation_items()`, `api.create_supplier_quotation_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `quotation_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `quotation_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `discount_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `free_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `line_total` | NUMERIC(15 | - | Description needed | Standard field usage |
| `is_best_price` | BOOLEAN | - | Description needed | Standard field usage |
| `price_variance_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `item_notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `quotation_id` → `procurement.supplier_quotations.quotation_id`
- `product_id` → `inventory.products.product_id`

---

### 12. vendor_performance

### vendor_performance
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_vendor_performance()`, `api.create_vendor_performance()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `performance_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `supplier_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `evaluation_period` | TEXT | ✓ | Description needed | Standard field usage |
| `period_start` | DATE | ✓ | Description needed | Standard field usage |
| `period_end` | DATE | ✓ | Description needed | Standard field usage |
| `total_orders` | INTEGER | - | Description needed | Standard field usage |
| `on_time_deliveries` | INTEGER | - | Description needed | Standard field usage |
| `late_deliveries` | INTEGER | - | Description needed | Standard field usage |
| `on_time_delivery_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `total_items_received` | INTEGER | - | Description needed | Standard field usage |
| `items_rejected` | INTEGER | - | Description needed | Standard field usage |
| `rejection_rate_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `quality_issues_count` | INTEGER | - | Description needed | Standard field usage |
| `total_purchase_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `invoice_accuracy_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `payment_term_adherence` | NUMERIC(5 | - | Description needed | Standard field usage |
| `return_count` | INTEGER | - | Description needed | Standard field usage |
| `return_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `return_rate_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `delivery_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `quality_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `price_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `service_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `overall_rating` | NUMERIC(3 | - | Description needed | Standard field usage |
| `evaluation_status` | TEXT | - | Description needed | Standard field usage |
| `reviewed_by` | INTEGER | - | Description needed | Standard field usage |
| `reviewed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `review_notes` | TEXT | - | Description needed | Standard field usage |
| `improvement_areas` | TEXT[] | - | Description needed | Standard field usage |
| `action_required` | BOOLEAN | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `supplier_id` → `parties.suppliers.supplier_id`
- `reviewed_by` → `master.org_users.user_id`

---
