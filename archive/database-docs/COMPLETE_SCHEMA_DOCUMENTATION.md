# Complete Schema Documentation for Pharma ERP

## Overview
This document provides complete reference for all tables, columns, and relationships in the Pharma ERP system.
Use this as the single source of truth when building frontend or API integrations.

## Quick Reference Format
Each table is documented with:
- Exact table name (schema.table_name)
- All column names with data types
- Foreign key relationships
- Common query patterns
- API endpoint mappings

---

## 1. MASTER SCHEMA

### 1.1 master.organizations
Primary organization/company table
```sql
org_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4()
org_code            TEXT UNIQUE NOT NULL
org_name            TEXT NOT NULL
org_type            TEXT -- 'pharmacy', 'distributor', 'manufacturer'
legal_name          TEXT
registration_number TEXT
logo_url            TEXT
website             TEXT
contact_info        JSONB -- {phone, email, support_email}
address             JSONB -- {line1, line2, city, state, pin, country}
tax_info            JSONB -- {gstin, pan, drug_license}
settings            JSONB -- {currency, date_format, time_zone}
subscription_info   JSONB -- {plan, valid_until, user_limit}
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

### 1.2 master.org_branches
Branch/location management
```sql
branch_id           SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_code         TEXT NOT NULL
branch_name         TEXT NOT NULL
branch_type         TEXT -- 'warehouse', 'retail', 'distribution'
is_head_office      BOOLEAN DEFAULT false
address             JSONB -- {line1, line2, city, state, pin}
contact_info        JSONB -- {phone, email, manager_name}
gstin               TEXT
licenses            JSONB -- {drug_license, fssai, etc}
storage_capacity    JSONB -- {area_sqft, racks, cold_storage: true}
operational_hours   JSONB -- {monday: {open: "09:00", close: "18:00"}}
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

### 1.3 master.org_users
User management
```sql
user_id             SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
auth_user_id        UUID -- Links to Supabase auth.users
employee_code       TEXT
full_name           TEXT NOT NULL
email               TEXT UNIQUE NOT NULL
mobile              TEXT
role                TEXT NOT NULL -- 'admin', 'manager', 'sales_user', etc
permissions         JSONB DEFAULT '[]'
branch_access       INTEGER[] -- Array of branch_ids
is_active           BOOLEAN DEFAULT true
last_login          TIMESTAMP WITH TIME ZONE
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

### 1.4 master.addresses
Reusable address book
```sql
address_id          SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
address_type        TEXT -- 'billing', 'shipping', 'both'
entity_type         TEXT -- 'customer', 'supplier', 'branch'
entity_id           INTEGER
address_line1       TEXT NOT NULL
address_line2       TEXT
city                TEXT NOT NULL
state               TEXT NOT NULL
pin_code            TEXT NOT NULL
country             TEXT DEFAULT 'India'
landmark            TEXT
contact_person      TEXT
contact_phone       TEXT
is_default          BOOLEAN DEFAULT false
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMP WITH TIME ZONE
```

---

## 2. INVENTORY SCHEMA

### 2.1 inventory.products
Master product catalog
```sql
product_id          SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
product_code        TEXT NOT NULL
product_name        TEXT NOT NULL
generic_name        TEXT
product_type        TEXT -- 'medicine', 'surgical', 'cosmetic'
category_id         INTEGER REFERENCES master.product_categories(category_id)
manufacturer        TEXT
brand               TEXT
hsn_code            TEXT
barcode             TEXT
description         TEXT
pack_config         JSONB -- {base_uom, pack_definitions}
tax_config          JSONB -- {gst_rate: 12, cess_rate: 0}
pricing_config      JSONB -- {margin_percent, markup_formula}
stock_config        JSONB -- {maintain_stock: true, track_batch: true}
reorder_level       NUMERIC(15,3)
reorder_quantity    NUMERIC(15,3)
storage_conditions  TEXT -- 'Cool and dry', 'Below 25°C'
requires_cold_chain BOOLEAN DEFAULT false
is_narcotic         BOOLEAN DEFAULT false
is_active           BOOLEAN DEFAULT true
search_keywords     TEXT[]
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

### 2.2 inventory.batches
Batch tracking for products
```sql
batch_id            SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
product_id          INTEGER REFERENCES inventory.products(product_id)
batch_number        TEXT NOT NULL
manufacturing_date  DATE
expiry_date         DATE NOT NULL
initial_quantity    NUMERIC(15,3) NOT NULL
quantity_available  NUMERIC(15,3) NOT NULL DEFAULT 0
quantity_reserved   NUMERIC(15,3) DEFAULT 0
cost_per_unit       NUMERIC(15,4)
mrp_per_unit        NUMERIC(15,2) NOT NULL
sale_price_per_unit NUMERIC(15,2)
pack_pricing        JSONB -- {strip: {mrp: 100, ptr: 80}}
batch_status        TEXT DEFAULT 'active' -- 'active', 'expired', 'recalled'
supplier_id         INTEGER REFERENCES parties.suppliers(supplier_id)
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

### 2.3 inventory.storage_locations
Warehouse location management
```sql
location_id         SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
location_code       TEXT NOT NULL
location_name       TEXT NOT NULL
parent_location_id  INTEGER REFERENCES inventory.storage_locations(location_id)
location_type       TEXT -- 'warehouse', 'rack', 'shelf', 'bin'
temperature_controlled BOOLEAN DEFAULT false
temperature_range   JSONB -- {min: 2, max: 8, unit: "celsius"}
storage_class       TEXT -- 'general', 'cold', 'narcotic', 'hazardous'
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMP WITH TIME ZONE
```

### 2.4 inventory.location_wise_stock
Real-time stock at each location
```sql
stock_id            SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
product_id          INTEGER REFERENCES inventory.products(product_id)
batch_id            INTEGER REFERENCES inventory.batches(batch_id)
location_id         INTEGER REFERENCES inventory.storage_locations(location_id)
quantity_available  NUMERIC(15,3) NOT NULL DEFAULT 0
quantity_reserved   NUMERIC(15,3) DEFAULT 0
quantity_quarantine NUMERIC(15,3) DEFAULT 0
last_movement_date  TIMESTAMP WITH TIME ZONE
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

---

## 3. PARTIES SCHEMA

### 3.1 parties.customers
Customer master
```sql
customer_id         SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
customer_code       TEXT NOT NULL
customer_name       TEXT NOT NULL
customer_type       TEXT -- 'retail', 'hospital', 'institution'
contact_person      TEXT
mobile              TEXT
email               TEXT
gstin               TEXT
pan_number          TEXT
drug_license_no     TEXT
license_expiry_date DATE
address             JSONB -- {line1, line2, city, state, pin}
billing_address_id  INTEGER REFERENCES master.addresses(address_id)
shipping_addresses  INTEGER[] -- Array of address_ids
credit_limit        NUMERIC(15,2) DEFAULT 0
credit_days         INTEGER DEFAULT 0
credit_info         JSONB -- {credit_utilized, credit_status}
customer_category   TEXT -- 'A', 'B', 'C'
customer_grade      TEXT -- 'premium', 'regular'
discount_percent    NUMERIC(5,2) DEFAULT 0
tags                TEXT[]
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

### 3.2 parties.suppliers
Supplier/vendor master
```sql
supplier_id         SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
supplier_code       TEXT NOT NULL
supplier_name       TEXT NOT NULL
supplier_type       TEXT -- 'manufacturer', 'distributor', 'importer'
contact_person      TEXT
mobile              TEXT
email               TEXT
gstin               TEXT
pan_number          TEXT
drug_license_no     TEXT
mfg_license_no      TEXT
address             JSONB
billing_address_id  INTEGER REFERENCES master.addresses(address_id)
bank_details        JSONB -- {bank_name, account_no, ifsc}
payment_terms       TEXT
credit_days         INTEGER DEFAULT 0
supplier_rating     NUMERIC(3,2) -- 1-5 scale
preferred_supplier  BOOLEAN DEFAULT false
tags                TEXT[]
is_active           BOOLEAN DEFAULT true
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

---

## 4. SALES SCHEMA

### 4.1 sales.orders
Sales orders
```sql
order_id            SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
order_number        TEXT NOT NULL
order_date          DATE NOT NULL DEFAULT CURRENT_DATE
customer_id         INTEGER REFERENCES parties.customers(customer_id)
customer_name       TEXT NOT NULL -- Denormalized
order_type          TEXT DEFAULT 'sales_order'
delivery_date       DATE
delivery_address_id INTEGER REFERENCES master.addresses(address_id)
salesperson_id      INTEGER REFERENCES master.org_users(user_id)
price_list_id       INTEGER REFERENCES sales.price_lists(price_list_id)
payment_terms       TEXT
items_total         NUMERIC(15,2) DEFAULT 0
total_discount      NUMERIC(15,2) DEFAULT 0
taxable_amount      NUMERIC(15,2) DEFAULT 0
tax_amount          NUMERIC(15,2) DEFAULT 0
round_off           NUMERIC(5,2) DEFAULT 0
final_amount        NUMERIC(15,2) DEFAULT 0
order_status        TEXT DEFAULT 'draft' -- 'draft', 'confirmed', 'delivered'
approval_status     TEXT DEFAULT 'pending' -- 'pending', 'approved', 'rejected'
notes               TEXT
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 4.2 sales.order_items
Line items for orders
```sql
order_item_id       SERIAL PRIMARY KEY
order_id            INTEGER REFERENCES sales.orders(order_id)
product_id          INTEGER REFERENCES inventory.products(product_id)
product_name        TEXT NOT NULL -- Denormalized
hsn_code            TEXT
quantity            NUMERIC(15,3) NOT NULL
uom                 TEXT NOT NULL
pack_type           TEXT NOT NULL -- 'base', 'pack', 'box'
pack_size           INTEGER
base_quantity       NUMERIC(15,3)
unit_price          NUMERIC(15,4) NOT NULL
mrp                 NUMERIC(15,2)
discount_percent    NUMERIC(5,2) DEFAULT 0
discount_amount     NUMERIC(15,2) DEFAULT 0
taxable_amount      NUMERIC(15,2)
tax_percent         NUMERIC(5,2)
tax_amount          NUMERIC(15,2)
line_total          NUMERIC(15,2) NOT NULL
batch_allocation    JSONB DEFAULT '[]' -- Array of {batch_id, quantity}
item_status         TEXT DEFAULT 'pending'
created_at          TIMESTAMP WITH TIME ZONE
```

### 4.3 sales.invoices
Sales invoices
```sql
invoice_id          SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
invoice_number      TEXT NOT NULL
invoice_date        DATE NOT NULL DEFAULT CURRENT_DATE
invoice_type        TEXT DEFAULT 'tax_invoice'
order_id            INTEGER REFERENCES sales.orders(order_id)
challan_ids         INTEGER[] -- Array of delivery_challan ids
customer_id         INTEGER REFERENCES parties.customers(customer_id)
customer_name       TEXT NOT NULL
customer_gstin      TEXT
billing_address     JSONB
shipping_address    JSONB
items_total         NUMERIC(15,2) DEFAULT 0
total_discount      NUMERIC(15,2) DEFAULT 0
taxable_amount      NUMERIC(15,2) DEFAULT 0
cgst_amount         NUMERIC(15,2) DEFAULT 0
sgst_amount         NUMERIC(15,2) DEFAULT 0
igst_amount         NUMERIC(15,2) DEFAULT 0
cess_amount         NUMERIC(15,2) DEFAULT 0
round_off_amount    NUMERIC(5,2) DEFAULT 0
final_amount        NUMERIC(15,2) DEFAULT 0
payment_terms       TEXT
due_date            DATE
payment_status      TEXT DEFAULT 'pending' -- 'pending', 'partial', 'paid'
einvoice_required   BOOLEAN DEFAULT FALSE
irn                 TEXT -- E-invoice IRN
invoice_status      TEXT DEFAULT 'draft' -- 'draft', 'posted', 'cancelled'
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 4.4 sales.invoice_items
Invoice line items
```sql
invoice_item_id     SERIAL PRIMARY KEY
invoice_id          INTEGER REFERENCES sales.invoices(invoice_id)
order_item_id       INTEGER REFERENCES sales.order_items(order_item_id)
product_id          INTEGER REFERENCES inventory.products(product_id)
product_name        TEXT NOT NULL
hsn_code            TEXT
batch_id            INTEGER REFERENCES inventory.batches(batch_id)
batch_number        TEXT
expiry_date         DATE
quantity            NUMERIC(15,3) NOT NULL
uom                 TEXT NOT NULL
pack_type           TEXT NOT NULL
unit_price          NUMERIC(15,4) NOT NULL
mrp                 NUMERIC(15,2)
discount_percent    NUMERIC(5,2) DEFAULT 0
discount_amount     NUMERIC(15,2) DEFAULT 0
taxable_amount      NUMERIC(15,2)
cgst_rate           NUMERIC(5,2) DEFAULT 0
sgst_rate           NUMERIC(5,2) DEFAULT 0
igst_rate           NUMERIC(5,2) DEFAULT 0
tax_amount          NUMERIC(15,2)
line_total          NUMERIC(15,2) NOT NULL
```

### 4.5 sales.delivery_challans
Delivery documents
```sql
challan_id          SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
challan_number      TEXT NOT NULL
challan_date        DATE NOT NULL DEFAULT CURRENT_DATE
challan_type        TEXT DEFAULT 'delivery' -- 'delivery', 'sample', 'returnable'
order_id            INTEGER REFERENCES sales.orders(order_id)
customer_id         INTEGER REFERENCES parties.customers(customer_id)
customer_name       TEXT NOT NULL
delivery_address_id INTEGER REFERENCES master.addresses(address_id)
transport_details   JSONB -- {mode, vehicle_no, driver_name}
eway_bill_no        TEXT
eway_bill_date      DATE
challan_status      TEXT DEFAULT 'draft' -- 'draft', 'dispatched', 'delivered'
delivery_status     TEXT DEFAULT 'pending' -- 'pending', 'in_transit', 'delivered'
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

---

## 5. PROCUREMENT SCHEMA

### 5.1 procurement.purchase_orders
Purchase orders to suppliers
```sql
purchase_order_id   SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
po_number           TEXT NOT NULL
po_date             DATE NOT NULL DEFAULT CURRENT_DATE
supplier_id         INTEGER REFERENCES parties.suppliers(supplier_id)
supplier_name       TEXT NOT NULL -- Denormalized
delivery_location_id INTEGER REFERENCES inventory.storage_locations(location_id)
payment_terms       TEXT
delivery_date       DATE
items_total         NUMERIC(15,2) DEFAULT 0
discount_amount     NUMERIC(15,2) DEFAULT 0
taxable_amount      NUMERIC(15,2) DEFAULT 0
tax_amount          NUMERIC(15,2) DEFAULT 0
other_charges       NUMERIC(15,2) DEFAULT 0
final_amount        NUMERIC(15,2) DEFAULT 0
po_status           TEXT DEFAULT 'draft' -- 'draft', 'approved', 'sent', 'partial', 'completed'
approval_status     TEXT DEFAULT 'pending'
notes               TEXT
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 5.2 procurement.grn (Goods Receipt Note)
Receipt of goods from suppliers
```sql
grn_id              SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
grn_number          TEXT NOT NULL
grn_date            DATE NOT NULL DEFAULT CURRENT_DATE
grn_type            TEXT DEFAULT 'purchase' -- 'purchase', 'return', 'transfer'
supplier_id         INTEGER REFERENCES parties.suppliers(supplier_id)
supplier_name       TEXT NOT NULL
purchase_order_id   INTEGER REFERENCES procurement.purchase_orders(purchase_order_id)
supplier_invoice_no TEXT
supplier_invoice_date DATE
items_total         NUMERIC(15,2) DEFAULT 0
discount_amount     NUMERIC(15,2) DEFAULT 0
taxable_amount      NUMERIC(15,2) DEFAULT 0
tax_amount          NUMERIC(15,2) DEFAULT 0
other_charges       NUMERIC(15,2) DEFAULT 0
final_amount        NUMERIC(15,2) DEFAULT 0
grn_status          TEXT DEFAULT 'draft' -- 'draft', 'completed', 'cancelled'
qc_required         BOOLEAN DEFAULT FALSE
qc_status           TEXT -- 'pending', 'passed', 'failed'
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 5.3 procurement.grn_items
GRN line items
```sql
grn_item_id         SERIAL PRIMARY KEY
grn_id              INTEGER REFERENCES procurement.grn(grn_id)
po_item_id          INTEGER REFERENCES procurement.purchase_order_items(po_item_id)
product_id          INTEGER REFERENCES inventory.products(product_id)
product_name        TEXT NOT NULL
batch_number        TEXT NOT NULL
manufacturing_date  DATE
expiry_date         DATE NOT NULL
received_quantity   NUMERIC(15,3) NOT NULL
accepted_quantity   NUMERIC(15,3) NOT NULL
rejected_quantity   NUMERIC(15,3) DEFAULT 0
free_quantity       NUMERIC(15,3) DEFAULT 0
uom                 TEXT NOT NULL
pack_type           TEXT NOT NULL
pack_size           INTEGER
unit_cost           NUMERIC(15,4) NOT NULL
mrp                 NUMERIC(15,2) NOT NULL
sale_price          NUMERIC(15,2)
discount_percent    NUMERIC(5,2) DEFAULT 0
tax_percent         NUMERIC(5,2)
line_total          NUMERIC(15,2) NOT NULL
storage_location_id INTEGER REFERENCES inventory.storage_locations(location_id)
```

---

## 6. FINANCIAL SCHEMA

### 6.1 financial.payment_modes
Payment method configuration
```sql
payment_mode_id     SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
mode_code           TEXT NOT NULL
mode_name           TEXT NOT NULL
mode_type           TEXT -- 'cash', 'bank', 'card', 'upi', 'cheque'
requires_reference  BOOLEAN DEFAULT FALSE
requires_approval   BOOLEAN DEFAULT FALSE
processing_days     INTEGER DEFAULT 0
is_active           BOOLEAN DEFAULT TRUE
created_at          TIMESTAMP WITH TIME ZONE
```

### 6.2 financial.payments
Payment transactions
```sql
payment_id          SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
payment_number      TEXT NOT NULL
payment_date        DATE NOT NULL DEFAULT CURRENT_DATE
party_type          TEXT NOT NULL -- 'customer', 'supplier'
party_id            INTEGER NOT NULL
party_name          TEXT NOT NULL
payment_type        TEXT NOT NULL -- 'receipt', 'payment', 'advance'
payment_mode_id     INTEGER REFERENCES financial.payment_modes(payment_mode_id)
amount              NUMERIC(15,2) NOT NULL
reference_number    TEXT -- Cheque/transaction number
reference_date      DATE
bank_charges        NUMERIC(15,2) DEFAULT 0
payment_status      TEXT DEFAULT 'pending' -- 'pending', 'cleared', 'bounced'
notes               TEXT
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 6.3 financial.payment_allocations
Link payments to invoices
```sql
allocation_id       SERIAL PRIMARY KEY
payment_id          INTEGER REFERENCES financial.payments(payment_id)
invoice_type        TEXT NOT NULL -- 'sales_invoice', 'purchase_invoice'
invoice_id          INTEGER NOT NULL
allocated_amount    NUMERIC(15,2) NOT NULL
created_at          TIMESTAMP WITH TIME ZONE
```

### 6.4 financial.customer_outstanding
Customer payment tracking
```sql
outstanding_id      SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
customer_id         INTEGER REFERENCES parties.customers(customer_id)
invoice_id          INTEGER REFERENCES sales.invoices(invoice_id)
invoice_number      TEXT NOT NULL
invoice_date        DATE NOT NULL
invoice_amount      NUMERIC(15,2) NOT NULL
paid_amount         NUMERIC(15,2) DEFAULT 0
outstanding_amount  NUMERIC(15,2) NOT NULL
days_overdue        INTEGER DEFAULT 0
aging_bucket        TEXT -- '0-30', '31-60', '61-90', '90+'
status              TEXT DEFAULT 'open' -- 'open', 'partial', 'paid'
follow_up_date      DATE
notes               TEXT
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

---

## 7. GST SCHEMA

### 7.1 gst.hsn_sac_codes
HSN/SAC code master
```sql
hsn_sac_id          SERIAL PRIMARY KEY
code                TEXT NOT NULL UNIQUE
code_type           TEXT NOT NULL -- 'hsn' or 'sac'
description         TEXT NOT NULL
igst_rate           NUMERIC(5,2) NOT NULL
cgst_rate           NUMERIC(5,2) NOT NULL
sgst_rate           NUMERIC(5,2) NOT NULL
cess_rate           NUMERIC(5,2) DEFAULT 0
chapter_code        TEXT
is_active           BOOLEAN DEFAULT TRUE
created_at          TIMESTAMP WITH TIME ZONE
```

### 7.2 gst.gstr1_data
GSTR-1 (Sales) return data
```sql
gstr1_id            SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
return_period       DATE NOT NULL -- Month/Year
gstin               TEXT NOT NULL
invoice_id          INTEGER REFERENCES sales.invoices(invoice_id)
invoice_number      TEXT NOT NULL
invoice_date        DATE NOT NULL
invoice_type        TEXT -- 'B2B', 'B2C', 'Export'
customer_gstin      TEXT
customer_name       TEXT
place_of_supply     TEXT
invoice_value       NUMERIC(15,2)
taxable_value       NUMERIC(15,2)
cgst_amount         NUMERIC(15,2)
sgst_amount         NUMERIC(15,2)
igst_amount         NUMERIC(15,2)
cess_amount         NUMERIC(15,2)
filing_status       TEXT DEFAULT 'pending' -- 'pending', 'filed', 'amended'
created_at          TIMESTAMP WITH TIME ZONE
```

### 7.3 gst.eway_bills
E-way bill management
```sql
eway_bill_id        SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
eway_bill_number    TEXT UNIQUE
generated_date      TIMESTAMP WITH TIME ZONE
valid_until         DATE
reference_type      TEXT -- 'invoice', 'challan'
reference_id        INTEGER
from_gstin          TEXT
to_gstin            TEXT
transport_mode      TEXT
transport_distance  INTEGER
vehicle_number      TEXT
transport_doc_no    TEXT
status              TEXT DEFAULT 'active' -- 'active', 'cancelled', 'expired'
created_at          TIMESTAMP WITH TIME ZONE
```

---

## 8. COMPLIANCE SCHEMA

### 8.1 compliance.temperature_logs
Cold chain temperature monitoring
```sql
log_id              SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
location_id         INTEGER REFERENCES inventory.storage_locations(location_id)
device_id           TEXT NOT NULL
device_type         TEXT NOT NULL -- 'sensor', 'data_logger', 'manual'
temperature         NUMERIC(5,2) NOT NULL
humidity            NUMERIC(5,2)
recorded_at         TIMESTAMP WITH TIME ZONE NOT NULL
within_range        BOOLEAN NOT NULL
min_allowed         NUMERIC(5,2) NOT NULL
max_allowed         NUMERIC(5,2) NOT NULL
is_excursion        BOOLEAN DEFAULT FALSE
excursion_severity  TEXT -- 'minor', 'major', 'critical'
action_taken        TEXT
affected_products   INTEGER[] -- Array of product_ids
affected_batches    INTEGER[] -- Array of batch_ids
created_at          TIMESTAMP WITH TIME ZONE
```

### 8.2 compliance.narcotic_register
Narcotic drugs register
```sql
register_id         SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
branch_id           INTEGER REFERENCES master.org_branches(branch_id)
transaction_date    DATE NOT NULL
transaction_type    TEXT NOT NULL -- 'receipt', 'issue', 'destruction'
product_id          INTEGER REFERENCES inventory.products(product_id)
batch_id            INTEGER REFERENCES inventory.batches(batch_id)
batch_number        TEXT
receipt_quantity    NUMERIC(15,3) DEFAULT 0
issue_quantity      NUMERIC(15,3) DEFAULT 0
balance_quantity    NUMERIC(15,3) NOT NULL
party_type          TEXT -- 'supplier', 'customer', 'patient'
party_name          TEXT
prescription_number TEXT
prescriber_name     TEXT
permit_number       TEXT
verified_by         INTEGER REFERENCES master.org_users(user_id)
created_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 8.3 compliance.product_recalls
Product recall management
```sql
recall_id           SERIAL PRIMARY KEY
org_id              UUID REFERENCES master.organizations(org_id)
recall_number       TEXT NOT NULL UNIQUE
recall_date         DATE NOT NULL
recall_type         TEXT NOT NULL -- 'voluntary', 'mandatory'
recall_classification TEXT NOT NULL -- 'class_i', 'class_ii', 'class_iii'
product_id          INTEGER REFERENCES inventory.products(product_id)
affected_batches    INTEGER[] -- Array of batch_ids
reason_category     TEXT NOT NULL -- 'contamination', 'labeling', 'quality'
reason_description  TEXT NOT NULL
quantity_distributed NUMERIC(15,3)
quantity_recovered  NUMERIC(15,3)
customers_notified  INTEGER DEFAULT 0
fda_notified        BOOLEAN DEFAULT FALSE
recall_status       TEXT DEFAULT 'initiated' -- 'initiated', 'ongoing', 'completed'
created_at          TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

---

## 9. SYSTEM CONFIG SCHEMA

### 9.1 system_config.workflow_instances
Approval workflow management
```sql
instance_id         SERIAL PRIMARY KEY
workflow_id         INTEGER REFERENCES system_config.workflow_definitions(workflow_id)
org_id              UUID REFERENCES master.organizations(org_id)
instance_code       TEXT NOT NULL
reference_type      TEXT NOT NULL -- 'purchase_order', 'sales_return', etc
reference_id        INTEGER NOT NULL
current_step        INTEGER DEFAULT 1
instance_status     TEXT DEFAULT 'pending' -- 'pending', 'approved', 'rejected'
approval_history    JSONB DEFAULT '[]'
initiated_at        TIMESTAMP WITH TIME ZONE
completed_at        TIMESTAMP WITH TIME ZONE
sla_deadline        TIMESTAMP WITH TIME ZONE
created_by          INTEGER REFERENCES master.org_users(user_id)
```

### 9.2 system_config.api_usage_log
API monitoring and rate limiting (partitioned table)
```sql
log_id              BIGSERIAL
org_id              UUID REFERENCES master.organizations(org_id)
endpoint            TEXT NOT NULL
method              TEXT NOT NULL
user_id             INTEGER REFERENCES master.org_users(user_id)
ip_address          INET
request_timestamp   TIMESTAMP WITH TIME ZONE
response_time_ms    INTEGER
status_code         INTEGER
error_occurred      BOOLEAN DEFAULT FALSE
error_message       TEXT
created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
PRIMARY KEY (log_id, created_at)
-- Table is partitioned by RANGE (created_at)
```

---

## Common Query Patterns

### Get product with current stock
```sql
SELECT 
    p.*,
    COALESCE(SUM(lws.quantity_available), 0) as current_stock
FROM inventory.products p
LEFT JOIN inventory.location_wise_stock lws ON p.product_id = lws.product_id
WHERE p.org_id = ? AND p.is_active = true
GROUP BY p.product_id;
```

### Get customer with outstanding
```sql
SELECT 
    c.*,
    COALESCE(SUM(co.outstanding_amount), 0) as total_outstanding
FROM parties.customers c
LEFT JOIN financial.customer_outstanding co ON c.customer_id = co.customer_id
WHERE c.org_id = ? AND co.status IN ('open', 'partial')
GROUP BY c.customer_id;
```

### Get invoice with items
```sql
SELECT 
    i.*,
    json_agg(
        json_build_object(
            'product_name', ii.product_name,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'line_total', ii.line_total
        )
    ) as items
FROM sales.invoices i
LEFT JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
WHERE i.invoice_id = ?
GROUP BY i.invoice_id;
```

---

## API Endpoint Mappings

### Products
- GET /api/products → `inventory.products`
- GET /api/products/:id/stock → `inventory.location_wise_stock`
- GET /api/products/:id/batches → `inventory.batches`

### Customers
- GET /api/customers → `parties.customers`
- GET /api/customers/:id/outstanding → `financial.customer_outstanding`
- GET /api/customers/:id/orders → `sales.orders`

### Orders & Invoices
- POST /api/orders → `sales.orders` + `sales.order_items`
- POST /api/invoices → `sales.invoices` + `sales.invoice_items`
- GET /api/invoices/:id/payments → `financial.payment_allocations`

### Inventory
- POST /api/grn → `procurement.grn` + `procurement.grn_items`
- GET /api/stock/location/:id → `inventory.location_wise_stock`
- POST /api/stock/movement → `inventory.inventory_movements`

---

## Important Notes

1. **All monetary values** are stored as NUMERIC(15,2)
2. **All quantity values** are stored as NUMERIC(15,3)
3. **All percentage values** are stored as NUMERIC(5,2)
4. **All timestamps** use TIMESTAMP WITH TIME ZONE
5. **JSONB columns** are used for flexible data that varies by organization
6. **Array columns** (INTEGER[]) are used for many-to-many relationships
7. **Denormalized fields** (like customer_name in orders) are intentional for history

## Frontend Integration Guidelines

1. **Never assume column names** - Always refer to this document
2. **Use exact table names** including schema prefix (e.g., `sales.invoices` not just `invoices`)
3. **Check data types** - Don't send strings for numeric fields
4. **Respect constraints** - Check NOT NULL and UNIQUE constraints
5. **Use proper references** - Ensure foreign key values exist
6. **Handle JSONB properly** - Send valid JSON for JSONB columns

## Version
Last Updated: [Current Date]
Schema Version: 2.0
Total Tables: 140+