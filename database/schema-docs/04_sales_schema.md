# Sales Schema Documentation

## Overview
The `sales` schema manages the complete sales process from orders to invoices, including returns and delivery management. This is critical for pharmaceutical sales operations with batch allocation and compliance tracking.

---

## Tables

### 1. orders

### orders
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_orders()`, `api.create_order()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `order_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `order_number` | TEXT | ✓ | Description needed | Standard field usage |
| `order_date` | DATE | - | Description needed | Standard field usage |
| `order_type` | TEXT | - | Description needed | Standard field usage |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `customer_po_number` | TEXT | - | Description needed | Standard field usage |
| `customer_po_date` | DATE | - | Description needed | Standard field usage |
| `delivery_date` | DATE | - | Description needed | Standard field usage |
| `delivery_priority` | TEXT | - | Description needed | Standard field usage |
| `delivery_address_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `delivery_instructions` | TEXT | - | Description needed | Standard field usage |
| `salesperson_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `territory_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `route_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `price_list_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `currency_code` | TEXT | - | Description needed | Standard field usage |
| `subtotal_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `scheme_discount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `round_off_amount` | NUMERIC(5 | - | Description needed | Standard field usage |
| `final_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `order_status` | TEXT | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `payment_terms` | TEXT | - | Description needed | Standard field usage |
| `payment_status` | TEXT | - | Description needed | Standard field usage |
| `fulfillment_status` | TEXT | - | Description needed | Standard field usage |
| `items_count` | INTEGER | - | Description needed | Standard field usage |
| `items_delivered` | INTEGER | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `tags` | TEXT[] | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |
| `updated_by` | INTEGER | - | Update audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `customer_id` → `parties.customers.customer_id`
- `delivery_address_id` → `master.addresses.address_id`
- `salesperson_id` → `master.org_users.user_id`
- `territory_id` → `parties.territories.territory_id`
- `route_id` → `parties.routes.route_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`
- `updated_by` → `master.org_users.user_id`

---

### 2. order_items

### order_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_order_items()`, `api.create_order_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `order_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `order_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_name` | TEXT | ✓ | Description needed | Standard field usage |
| `hsn_code` | TEXT | - | Description needed | Standard field usage |
| `quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_type` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_size` | INTEGER | - | Description needed | Standard field usage |
| `base_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `discount_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `scheme_discount_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `scheme_discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `free_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `scheme_code` | TEXT | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `cgst_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `sgst_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `cess_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `line_total` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `batch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | - | Description needed | Standard field usage |
| `batch_expiry` | DATE | - | Description needed | Standard field usage |
| `ordered_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `delivered_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pending_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cancelled_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `item_notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `order_id` → `sales.orders.order_id`
- `product_id` → `inventory.products.product_id`

---

### 3. invoices

### invoices
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_invoices()`, `api.create_invoice()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `invoice_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `invoice_number` | TEXT | ✓ | Description needed | Standard field usage |
| `invoice_date` | DATE | - | Description needed | Standard field usage |
| `invoice_type` | TEXT | - | Description needed | Standard field usage |
| `order_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `challan_ids` | INTEGER[] | - | Description needed | Standard field usage |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `customer_name` | TEXT | ✓ | Description needed | Standard field usage |
| `billing_address_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `shipping_address_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `place_of_supply` | TEXT | - | Description needed | Standard field usage |
| `reverse_charge` | BOOLEAN | - | Description needed | Standard field usage |
| `subtotal_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `scheme_discount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `freight_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `insurance_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `other_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `round_off_amount` | NUMERIC(5 | - | Description needed | Standard field usage |
| `final_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `amount_in_words` | TEXT | - | Description needed | Standard field usage |
| `payment_terms` | TEXT | - | Description needed | Standard field usage |
| `due_date` | DATE | - | Description needed | Standard field usage |
| `payment_status` | TEXT | - | Description needed | Standard field usage |
| `paid_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `einvoice_required` | BOOLEAN | - | Description needed | Standard field usage |
| `irn` | TEXT | - | Description needed | Standard field usage |
| `irn_generated_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `qr_code` | TEXT | - | Description needed | Standard field usage |
| `ack_number` | TEXT | - | Description needed | Standard field usage |
| `ack_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `invoice_status` | TEXT | - | Description needed | Standard field usage |
| `cancellation_reason` | TEXT | - | Description needed | Standard field usage |
| `cancelled_date` | DATE | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `terms_and_conditions` | TEXT | - | Description needed | Standard field usage |
| `bank_account_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |
| `posted_by` | INTEGER | - | Description needed | Standard field usage |
| `posted_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `order_id` → `sales.orders.order_id`
- `customer_id` → `parties.customers.customer_id`
- `billing_address_id` → `master.addresses.address_id`
- `shipping_address_id` → `master.addresses.address_id`
- `bank_account_id` → `master.org_bank_accounts.bank_account_id`
- `created_by` → `master.org_users.user_id`
- `posted_by` → `master.org_users.user_id`

---

### 4. invoice_items

### invoice_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_invoice_items()`, `api.create_invoice_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `invoice_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `invoice_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `order_item_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_name` | TEXT | ✓ | Description needed | Standard field usage |
| `product_description` | TEXT | - | Description needed | Standard field usage |
| `hsn_code` | TEXT | - | Description needed | Standard field usage |
| `batch_number` | TEXT | - | Description needed | Standard field usage |
| `manufacturing_date` | DATE | - | Description needed | Standard field usage |
| `expiry_date` | DATE | - | Description needed | Standard field usage |
| `quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_type` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_size` | INTEGER | - | Description needed | Standard field usage |
| `base_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `discount_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `discount_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `taxable_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `igst_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cess_rate` | NUMERIC(5 | - | Description needed | Standard field usage |
| `cess_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `line_total` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `is_free_item` | BOOLEAN | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `invoice_id` → `sales.invoices.invoice_id`
- `order_item_id` → `sales.order_items.order_item_id`
- `product_id` → `inventory.products.product_id`

---

### 5. delivery_challans

### delivery_challans
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_delivery_challans()`, `api.create_delivery_challan()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `challan_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `challan_number` | TEXT | ✓ | Description needed | Standard field usage |
| `challan_date` | DATE | - | Description needed | Standard field usage |
| `challan_type` | TEXT | - | Description needed | Standard field usage |
| `order_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `invoice_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `delivery_address_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `dispatch_date` | DATE | - | Description needed | Standard field usage |
| `dispatch_time` | TIME | - | Description needed | Standard field usage |
| `dispatch_address_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `transport_mode` | TEXT | - | Description needed | Standard field usage |
| `transporter_name` | TEXT | - | Description needed | Standard field usage |
| `vehicle_number` | TEXT | - | Description needed | Standard field usage |
| `lr_number` | TEXT | - | Description needed | Standard field usage |
| `lr_date` | DATE | - | Description needed | Standard field usage |
| `freight_charges` | NUMERIC(15 | - | Description needed | Standard field usage |
| `eway_bill_required` | BOOLEAN | - | Description needed | Standard field usage |
| `eway_bill_number` | TEXT | - | Description needed | Standard field usage |
| `eway_bill_date` | DATE | - | Description needed | Standard field usage |
| `eway_bill_validity_days` | INTEGER | - | Description needed | Standard field usage |
| `eway_bill_data` | JSONB | - | Description needed | Standard field usage |
| `total_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `challan_status` | TEXT | - | Description needed | Standard field usage |
| `delivery_status` | TEXT | - | Description needed | Standard field usage |
| `delivered_date` | DATE | - | Description needed | Standard field usage |
| `delivered_time` | TIME | - | Description needed | Standard field usage |
| `received_by` | TEXT | - | Description needed | Standard field usage |
| `delivery_notes` | TEXT | - | Description needed | Standard field usage |
| `pod_document` | TEXT | - | Description needed | Standard field usage |
| `is_returnable` | BOOLEAN | - | Description needed | Standard field usage |
| `return_by_date` | DATE | - | Description needed | Standard field usage |
| `return_status` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `order_id` → `sales.orders.order_id`
- `invoice_id` → `sales.invoices.invoice_id`
- `customer_id` → `parties.customers.customer_id`
- `delivery_address_id` → `master.addresses.address_id`
- `dispatch_address_id` → `master.addresses.address_id`
- `created_by` → `master.org_users.user_id`

---

### 6. delivery_challan_items

### delivery_challan_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_delivery_challan_items()`, `api.create_delivery_challan_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `challan_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `challan_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `order_item_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `ordered_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `dispatched_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `delivered_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `returned_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `damaged_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `pack_type` | TEXT | ✓ | Description needed | Standard field usage |
| `item_status` | TEXT | - | Description needed | Standard field usage |
| `item_notes` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `challan_id` → `sales.delivery_challans.challan_id`
- `order_item_id` → `sales.order_items.order_item_id`
- `product_id` → `inventory.products.product_id`

---

### 7. sales_returns

### sales_returns
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_sales_returns()`, `api.create_sales_return()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `branch_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `return_number` | TEXT | ✓ | Description needed | Standard field usage |
| `return_date` | DATE | - | Description needed | Standard field usage |
| `return_type` | TEXT | ✓ | Description needed | Standard field usage |
| `invoice_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `challan_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `return_reason` | TEXT | ✓ | Description needed | Standard field usage |
| `return_category` | TEXT | - | Description needed | Standard field usage |
| `approval_required` | BOOLEAN | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `return_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `total_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `credit_note_number` | TEXT | - | Description needed | Standard field usage |
| `credit_note_date` | DATE | - | Description needed | Standard field usage |
| `credit_note_status` | TEXT | - | Description needed | Standard field usage |
| `igst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `cgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `sgst_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `adjustment_type` | TEXT | - | Description needed | Standard field usage |
| `adjusted_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pending_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `goods_received_date` | DATE | - | Description needed | Standard field usage |
| `goods_received_by` | INTEGER | - | Description needed | Standard field usage |
| `quality_check_status` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `internal_notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `invoice_id` → `sales.invoices.invoice_id`
- `challan_id` → `sales.delivery_challans.challan_id`
- `customer_id` → `parties.customers.customer_id`
- `approved_by` → `master.org_users.user_id`
- `goods_received_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 8. sales_return_items

### sales_return_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_sales_return_items()`, `api.create_sales_return_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `return_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `return_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `invoice_item_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `batch_number` | TEXT | - | Description needed | Standard field usage |
| `return_quantity` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `uom` | TEXT | ✓ | Description needed | Standard field usage |
| `damaged_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `saleable_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `return_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `tax_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `item_return_reason` | TEXT | - | Description needed | Standard field usage |
| `disposition` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `return_id` → `sales.sales_returns.return_id`
- `invoice_item_id` → `sales.invoice_items.invoice_item_id`
- `product_id` → `inventory.products.product_id`

---

### 9. price_lists

### price_lists
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_price_lists()`, `api.create_price_list()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `price_list_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `price_list_name` | TEXT | ✓ | Description needed | Standard field usage |
| `price_list_type` | TEXT | ✓ | Description needed | Standard field usage |
| `currency_code` | TEXT | - | Description needed | Standard field usage |
| `effective_from` | DATE | ✓ | Description needed | Standard field usage |
| `effective_until` | DATE | - | Description needed | Standard field usage |
| `applicable_branches` | INTEGER[] | - | Description needed | Standard field usage |
| `applicable_territories` | INTEGER[] | - | Description needed | Standard field usage |
| `applicable_customer_groups` | INTEGER[] | - | Description needed | Standard field usage |
| `parent_price_list_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `adjustment_type` | TEXT | - | Description needed | Standard field usage |
| `adjustment_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `requires_approval` | BOOLEAN | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_date` | DATE | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_default` | BOOLEAN | - | Description needed | Standard field usage |
| `description` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `parent_price_list_id` → `sales.price_lists.price_list_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 10. price_list_items

### price_list_items
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_price_list_items()`, `api.create_price_list_item()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `price_list_item_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `price_list_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `product_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `base_unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `pack_unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `box_unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `case_unit_price` | NUMERIC(15 | - | Description needed | Standard field usage |
| `mrp` | NUMERIC(15 | - | Description needed | Standard field usage |
| `ptr_margin_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `pts_margin_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `min_order_quantity` | NUMERIC(15 | - | Description needed | Standard field usage |
| `min_order_pack_type` | TEXT | - | Description needed | Standard field usage |
| `max_discount_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `price_list_id` → `sales.price_lists.price_list_id`
- `product_id` → `inventory.products.product_id`

---

### 11. sales_schemes

### sales_schemes
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_sales_schemes()`, `api.create_sales_scheme()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `scheme_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `scheme_code` | TEXT | ✓ | Description needed | Standard field usage |
| `scheme_name` | TEXT | ✓ | Description needed | Standard field usage |
| `scheme_type` | TEXT | ✓ | Description needed | Standard field usage |
| `start_date` | DATE | ✓ | Description needed | Standard field usage |
| `end_date` | DATE | ✓ | Description needed | Standard field usage |
| `applicable_branches` | INTEGER[] | - | Description needed | Standard field usage |
| `applicable_territories` | INTEGER[] | - | Description needed | Standard field usage |
| `applicable_customers` | INTEGER[] | - | Description needed | Standard field usage |
| `applicable_customer_types` | TEXT[] | - | Description needed | Standard field usage |
| `scheme_rules` | JSONB | ✓ | Description needed | Standard field usage |
| `applicable_products` | INTEGER[] | - | Description needed | Standard field usage |
| `applicable_categories` | INTEGER[] | - | Description needed | Standard field usage |
| `scheme_budget` | NUMERIC(15 | - | Description needed | Standard field usage |
| `utilized_budget` | NUMERIC(15 | - | Description needed | Standard field usage |
| `max_benefit_per_order` | NUMERIC(15 | - | Description needed | Standard field usage |
| `approval_status` | TEXT | - | Description needed | Standard field usage |
| `approved_by` | INTEGER | - | Description needed | Standard field usage |
| `approved_date` | DATE | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `can_combine` | BOOLEAN | - | Description needed | Standard field usage |
| `total_orders` | INTEGER | - | Description needed | Standard field usage |
| `total_discount_given` | NUMERIC(15 | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `approved_by` → `master.org_users.user_id`
- `created_by` → `master.org_users.user_id`

---

### 12. sales_targets

### sales_targets
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_sales_targets()`, `api.create_sales_target()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `target_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `target_year` | INTEGER | ✓ | Description needed | Standard field usage |
| `target_month` | INTEGER | - | Description needed | Standard field usage |
| `target_quarter` | INTEGER | - | Description needed | Standard field usage |
| `period_type` | TEXT | ✓ | Description needed | Standard field usage |
| `target_type` | TEXT | ✓ | Description needed | Standard field usage |
| `target_entity_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `revenue_target` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_target` | NUMERIC(15 | - | Description needed | Standard field usage |
| `new_customer_target` | INTEGER | - | Description needed | Standard field usage |
| `visit_target` | INTEGER | - | Description needed | Standard field usage |
| `revenue_achieved` | NUMERIC(15 | - | Description needed | Standard field usage |
| `quantity_achieved` | NUMERIC(15 | - | Description needed | Standard field usage |
| `new_customers_achieved` | INTEGER | - | Description needed | Standard field usage |
| `visits_achieved` | INTEGER | - | Description needed | Standard field usage |
| `revenue_achievement_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `overall_achievement_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `incentive_percentage` | NUMERIC(5 | - | Description needed | Standard field usage |
| `calculated_incentive` | NUMERIC(15 | - | Description needed | Standard field usage |
| `status` | TEXT | - | Description needed | Standard field usage |
| `notes` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 13. customer_visits

### customer_visits
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_customer_visits()`, `api.create_customer_visit()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `visit_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `visit_date` | DATE | ✓ | Description needed | Standard field usage |
| `visit_time` | TIME | - | Description needed | Standard field usage |
| `customer_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `visited_by` | INTEGER | ✓ | Description needed | Standard field usage |
| `route_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `visit_purpose` | TEXT | ✓ | Description needed | Standard field usage |
| `visit_outcome` | TEXT | - | Description needed | Standard field usage |
| `order_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `collection_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `check_in_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `check_out_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `visit_location` | JSONB | - | Description needed | Standard field usage |
| `visit_notes` | TEXT | - | Description needed | Standard field usage |
| `follow_up_required` | BOOLEAN | - | Description needed | Standard field usage |
| `follow_up_date` | DATE | - | Description needed | Standard field usage |
| `follow_up_notes` | TEXT | - | Description needed | Standard field usage |
| `visit_photos` | JSONB | - | Description needed | Standard field usage |
| `visit_status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `customer_id` → `parties.customers.customer_id`
- `visited_by` → `master.org_users.user_id`
- `route_id` → `parties.routes.route_id`
- `order_id` → `sales.orders.order_id`

---
