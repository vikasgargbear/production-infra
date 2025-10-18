# Sales Schema Documentation

**Schema:** `sales`
**Purpose:** Complete sales cycle management from orders to returns
**Last Updated:** 2025-10-16
**Tables:** 30 (doubled from ~15 in previous documentation)

---

## Overview

The `sales` schema manages the entire pharmaceutical sales lifecycle including order management, invoicing with GST compliance, delivery tracking, returns processing, credit/debit notes, loyalty programs, promotional schemes, and field sales operations. This is the largest and most business-critical schema in the application.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Features |
|---|-------|---------|-------------|--------------|
| **Core Sales Flow** |
| 1 | orders | Sales orders | order_id | Customer PO, delivery tracking, 56 columns |
| 2 | order_items | Order line items | order_item_id | Batch allocation, schemes, delivery status |
| 3 | invoices | Tax invoices | invoice_id | GST/E-invoice, payment tracking, IRN |
| 4 | invoice_items | Invoice line items | invoice_item_id | Batch-wise billing, returns tracking |
| 5 | delivery_challans | Delivery challans | challan_id | E-way bill, transport, POD |
| 6 | delivery_challan_items | Challan line items | challan_item_id | Dispatch vs delivery tracking |
| **Returns & Adjustments** |
| 7 | sales_returns | Sales returns | return_id | Quality check, credit note generation |
| 8 | sales_return_items | Return line items | return_item_id | Saleable vs damaged classification |
| 9 | credit_notes | ⭐ NEW: Credit notes | credit_note_id | Application tracking, remaining amount |
| 10 | credit_note_applications | ⭐ NEW: CN applications | application_id | Invoice allocation |
| 11 | debit_notes | ⭐ NEW: Debit notes | debit_note_id | Payment tracking, GST |
| 12 | invoice_return_status | ⭐ NEW: Return view | - | Aggregated return analytics |
| **Logistics & Tracking** |
| 13 | customer_visits | ⭐ NEW: Field visits | visit_id | GPS tracking, photo capture, follow-ups |
| 14 | delivery_tracking | ⭐ NEW: Delivery GPS | tracking_id | Real-time location tracking |
| 15 | eway_bills | ⭐ NEW: E-way bills | eway_bill_id | GST e-way bill management |
| 16 | proof_of_delivery | ⭐ NEW: POD | pod_id | Signature, GPS, rating |
| **Loyalty & Schemes** |
| 17 | loyalty_programs | ⭐ NEW: Loyalty config | program_id | Points, redemption, tiers |
| 18 | loyalty_tiers | ⭐ NEW: Tier levels | tier_id | Bronze/Silver/Gold/Platinum |
| 19 | loyalty_transactions | ⭐ NEW: Points ledger | transaction_id | Earn/redeem/expire |
| 20 | sales_schemes | ⭐ NEW: Scheme master | scheme_id | Volume/combo/free goods schemes |
| 21 | scheme_customers | ⭐ NEW: Customer mapping | - | Eligible customers |
| 22 | scheme_products | ⭐ NEW: Product mapping | - | Applicable products |
| 23 | scheme_usage | ⭐ NEW: Usage tracking | usage_id | Discount/free items given |
| 24 | scheme_volume_slabs | ⭐ NEW: Volume slabs | slab_id | Quantity-based discounts |
| 25 | promotional_schemes | ⭐ NEW: Promotions | scheme_id | Time-bound offers |
| **Pricing & Targets** |
| 26 | price_lists | ⭐ NEW: Price lists | price_list_id | Customer/territory-specific pricing |
| 27 | price_list_items | ⭐ NEW: Price details | price_list_item_id | Pack-wise pricing |
| 28 | sales_targets | ⭐ NEW: Targets | target_id | Revenue/quantity/visit targets |
| **Views** |
| 29 | v_invoice_calculation_debug | ⭐ NEW: Debug view | - | Invoice calc troubleshooting |
| 30 | v_invoice_items_with_quantities | ⭐ NEW: Item view | - | Aggregated quantities |

---

## Core Sales Flow Tables

### 1. orders
**Complete sales order management with delivery tracking**

**Key Columns:**
- `order_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `branch_id` (int, FK, REQUIRED)
- `order_number` (text, UNIQUE per org)
- `order_date` (date) - Default: CURRENT_DATE
- `order_type` (text) - standard/urgent/export (default: 'standard')

**Customer Details:**
- `customer_id` (int, FK, REQUIRED)
- `customer_name` (text) - Denormalized for performance
- `customer_phone` (text)
- `customer_po_number` (text) - Customer PO reference
- `customer_po_date` (date)

**Delivery:**
- `delivery_date` (date) - Requested delivery date
- `expected_delivery_date` (date) - Calculated date
- `delivery_priority` (text) - normal/urgent/critical (default: 'normal')
- `delivery_address_id` (int, FK)
- `delivery_instructions` (text)
- `delivery_area` (text)
- `delivered_at` (timestamptz) - Actual delivery time

**Sales Assignment:**
- `salesperson_id` (int, FK)
- `territory_id` (int, FK)
- `route_id` (int, FK)
- `price_list_id` (int, FK) - Special pricing

**Financial Summary:**
- `currency_code` (text) - Default: 'INR'
- `subtotal_amount` (numeric 15,2) - Default: 0
- `discount_amount` (numeric 15,2) - Default: 0
- `scheme_discount` (numeric 15,2) - Default: 0
- `taxable_amount` (numeric 15,2) - After discounts (default: 0)
- `tax_amount` (numeric 15,2) - Total GST (default: 0)
- `igst_amount`, `cgst_amount`, `sgst_amount`, `cess_amount` (numeric 15,2)
- `round_off_amount` (numeric 5,2) - Default: 0
- `final_amount` (numeric 15,2) - Grand total (default: 0)

**Payment:**
- `payment_terms` (text) - Payment terms
- `payment_mode` (text) - Default: 'credit'
- `payment_status` (text) - pending/partial/paid (default: 'pending')
- `paid_amount` (numeric 15,2) - Default: 0
- `balance_amount` (numeric 15,2) - Remaining (default: 0)

**Status Tracking:**
- `order_status` (text) - draft/confirmed/processing/delivered/cancelled (default: 'draft')
- `approval_status` (text) - pending/approved/rejected (default: 'pending')
- `approved_by` (int, FK)
- `approved_at` (timestamptz)
- `confirmed_at` (timestamptz)
- `fulfillment_status` (text) - pending/partial/complete (default: 'pending')

**Item Tracking:**
- `items_count` (int) - Total line items (default: 0)
- `items_delivered` (int) - Delivered items (default: 0)

**E-way Bill & POD:**
- `eway_bill_number` (text)
- `pod_recorded` (boolean) - POD captured (default: false)
- `last_tracking_update` (timestamptz)

**Notes:**
- `notes` (text) - Customer-facing notes
- `internal_notes` (text) - Internal remarks
- `tags` (text[]) - Categorization tags

**Audit:**
- `created_by` (int, FK)
- `updated_by` (int, FK)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Order booking with batch allocation
- Delivery scheduling
- Order tracking dashboard
- Payment collection

**Indexes:** customer_id, order_date, order_status

---

### 2. order_items
**Order line items with scheme application and delivery tracking**

**Key Columns:**
- `order_item_id` (serial, PK)
- `order_id` (int, FK, REQUIRED)
- `product_id` (int, FK, REQUIRED)
- `product_name` (text) - Denormalized
- `product_code` (text)
- `hsn_code` (text) - For GST

**Quantity & UOM:**
- `quantity` (numeric 15,3, REQUIRED)
- `uom` (text) - Unit of measure
- `pack_type` (text) - unit/strip/box
- `pack_size` (int)
- `base_quantity` (numeric 15,3) - Converted to base UOM

**Batch Details:**
- `batch_id` (int, FK)
- `batch_number` (text)
- `batch_expiry` (date)

**Pricing:**
- `unit_price` (numeric 15,4, REQUIRED)
- `mrp` (numeric 15,2)
- `discount_percent` (numeric 5,2) - Default: 0
- `discount_amount` (numeric 15,2) - Default: 0

**Schemes:**
- `scheme_code` (text) - Applied scheme
- `scheme_discount_percent` (numeric 5,2) - Default: 0
- `scheme_discount_amount` (numeric 15,2) - Default: 0
- `free_quantity` (numeric 15,3) - Free goods (default: 0)

**Tax Calculation:**
- `taxable_amount` (numeric 15,2) - After discounts
- `tax_percent` (numeric 5,2)
- `tax_amount` (numeric 15,2)
- `igst_rate`, `cgst_rate`, `sgst_rate`, `cess_rate` (numeric 5,2)
- `igst_amount`, `cgst_amount`, `sgst_amount`, `cess_amount` (numeric 15,2)
- `line_total` (numeric 15,2, REQUIRED)

**Fulfillment Tracking:**
- `ordered_quantity` (numeric 15,3) - Original order qty
- `delivered_quantity` (numeric 15,3) - Actually delivered (default: 0)
- `pending_quantity` (numeric 15,3) - Yet to deliver
- `cancelled_quantity` (numeric 15,3) - Cancelled qty (default: 0)

**Status:**
- `item_status` (text) - pending/partial/fulfilled/cancelled (default: 'pending')
- `delivery_status` (text) - pending/dispatched/delivered (default: 'pending')
- `item_notes`, `notes` (text)

**Display:**
- `display_order` (int) - Line item sequence

**Cascade:** ON DELETE CASCADE (with orders)

---

### 3. invoices
**Tax invoice with GST compliance and E-invoice integration**

**Key Columns:**
- `invoice_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `branch_id` (int, FK, REQUIRED)
- `invoice_number` (text, UNIQUE per org)
- `invoice_date` (date, REQUIRED) - Default: CURRENT_DATE
- `invoice_type` (text) - tax_invoice/bill_of_supply/export (default: 'tax_invoice')

**References:**
- `order_id` (int, FK) - Source order
- `challan_ids` (int[]) - Linked challans
- `customer_id` (int, FK, REQUIRED)
- `customer_name` (text, REQUIRED)

**Addresses:**
- `billing_address_id` (int, FK)
- `shipping_address_id` (int, FK)
- `place_of_supply` (text) - For GST type determination

**GST Compliance:**
- `reverse_charge` (boolean) - RCM flag (default: false)
- `igst_amount`, `cgst_amount`, `sgst_amount`, `cess_amount` (numeric 15,2)
- `total_tax_amount` (numeric 15,2) - Default: 0

**Financial Summary:**
- `subtotal_amount` (numeric 15,2) - Before discount (default: 0)
- `discount_amount` (numeric 15,2) - Line discounts (default: 0)
- `scheme_discount` (numeric 15,2) - Scheme discounts (default: 0)
- `taxable_amount` (numeric 15,2) - After discounts (default: 0)
- `freight_charges`, `insurance_charges`, `other_charges` (numeric 15,2)
- `round_off_amount` (numeric 5,2) - Default: 0
- `final_amount` (numeric 15,2) - Grand total (default: 0)
- `amount_in_words` (text) - For printing

**Payment:**
- `payment_terms` (text)
- `due_date` (date)
- `payment_status` (text) - pending/partial/paid (default: 'pending')
- `paid_amount` (numeric 15,2) - Default: 0
- `credit_amount` (numeric 15,2) - Unpaid balance (default: 0)

**Allocation Tracking:**
- `allocated_amount` (numeric 15,2) - Allocated to CN (default: 0)
- `unallocated_amount` (numeric 15,2) - GENERATED: final_amount - allocated_amount

**E-Invoice (GST):**
- `einvoice_required` (boolean) - E-invoice flag (default: false)
- `irn` (text) - Invoice Reference Number
- `irn_generated_date` (timestamptz)
- `qr_code` (text) - QR code data
- `ack_number` (text) - Acknowledgement number
- `ack_date` (timestamptz)

**Loyalty:**
- `loyalty_points_used` (int)
- `loyalty_discount` (numeric 15,2)

**Status:**
- `invoice_status` (text) - draft/posted/cancelled (default: 'draft')
- `cancellation_reason` (text)
- `cancelled_date` (date)

**Items Summary:**
- `items_count` (int) - Total line items (default: 0)
- `total_quantity` (numeric 15,3) - Total qty (default: 0)

**Documents:**
- `notes` (text) - Customer-facing
- `internal_notes` (text) - Internal
- `terms_and_conditions` (text)
- `bank_account_id` (int, FK) - For payment details

**Audit:**
- `created_by` (int, FK)
- `posted_by` (int, FK)
- `posted_at` (timestamptz)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- GST-compliant invoicing
- E-invoice generation
- Payment tracking
- Credit note processing

**RLS Policy:** ✅ Enabled (`org_id = get_current_org_id()`)

---

### 4. invoice_items
**Invoice line items with batch tracking and returns**

**Key Columns:**
- `invoice_item_id` (serial, PK)
- `item_id` (serial) - Alternative ID
- `invoice_id` (int, FK, REQUIRED)
- `order_item_id` (int, FK) - Source order item

**Product Details:**
- `product_id` (int, FK, REQUIRED)
- `product_name` (text, REQUIRED)
- `product_description` (text)
- `hsn_code` (text)

**Batch:**
- `batch_id` (int, FK)
- `batch_number` (text)
- `manufacturing_date`, `expiry_date` (date)

**Quantity:**
- `quantity` (numeric 15,3, REQUIRED)
- `free_quantity` (numeric 15,3) - Free goods (default: 0)
- `quantity_returned` (numeric 18,3) - Returned qty (default: 0)
- `uom` (text, REQUIRED)
- `pack_type` (text, REQUIRED) - unit/strip/box
- `pack_size` (int)
- `base_quantity` (numeric 15,3) - Base UOM qty

**Pricing:**
- `mrp` (numeric 15,2)
- `unit_price` (numeric 15,4, REQUIRED)
- `discount_percent` (numeric 5,2) - Default: 0
- `discount_amount` (numeric 15,2) - Default: 0
- `taxable_amount` (numeric 15,2)

**Tax:**
- `igst_rate`, `cgst_rate`, `sgst_rate`, `cess_rate` (numeric 5,2) - Default: 0
- `igst_amount`, `cgst_amount`, `sgst_amount`, `cess_amount` (numeric 15,2) - Default: 0
- `total_tax_amount` (numeric 15,2) - Default: 0
- `line_total` (numeric 15,2, REQUIRED)

**Flags:**
- `is_free_item` (boolean) - Free goods flag (default: false)
- `display_order` (int) - Sequence

**Cascade:** ON DELETE CASCADE (with invoices)

---

## Returns & Adjustments Tables

### 9. credit_notes ⭐ NEW
**Credit notes for returns and adjustments**

**Key Columns:**
- `credit_note_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `branch_id` (int, FK, REQUIRED)
- `credit_note_number` (text, UNIQUE per org)
- `credit_note_date` (date, REQUIRED) - Default: CURRENT_DATE
- `customer_id` (int, FK, REQUIRED)

**Reference:**
- `reference_type` (text) - return/adjustment/discount
- `reference_id` (int) - sales_return_id or other
- `reference_number` (text)

**Amounts:**
- `credit_amount` (numeric 15,2, REQUIRED)
- `tax_amount` (numeric 15,2) - Default: 0
- `total_amount` (numeric 15,2, REQUIRED)
- `applied_amount` (numeric 15,2) - Already applied (default: 0)
- `remaining_amount` (numeric 15,2) - GENERATED: total_amount - applied_amount

**GST:**
- `is_gst_applicable` (boolean) - Default: true
- `cgst_amount`, `sgst_amount`, `igst_amount` (numeric 15,2) - Default: 0

**Details:**
- `reason_code` (text, REQUIRED) - return/damaged/shortage/pricing_error
- `reason` (text, REQUIRED)
- `notes` (text)
- `items_detail` (jsonb) - Item-wise details

**Approval:**
- `status` (text) - draft/approved/applied/cancelled (default: 'draft')
- `approved_by` (int, FK)
- `approved_date` (timestamptz)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Return processing
- Price adjustments
- Shortage claims
- Invoice allocation

---

### 10. credit_note_applications ⭐ NEW
**Tracking of credit note applications to invoices**

**Key Columns:**
- `application_id` (serial, PK)
- `credit_note_id` (int, FK, REQUIRED)
- `invoice_id` (int, FK, REQUIRED)
- `applied_amount` (numeric 15,2, REQUIRED)
- `application_date` (date, REQUIRED) - Default: CURRENT_DATE
- `created_by` (int, FK, REQUIRED)
- `created_at` (timestamptz)

**Use Cases:**
- CN-to-invoice allocation
- Outstanding balance adjustment
- Payment reconciliation

**Cascade:** ON DELETE CASCADE (with credit_notes)

---

### 11. debit_notes ⭐ NEW
**Debit notes for additional charges**

**Key Columns:**
- `debit_note_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `branch_id` (int, FK, REQUIRED)
- `debit_note_number` (text, UNIQUE per org)
- `debit_note_date` (date, REQUIRED) - Default: CURRENT_DATE
- `customer_id` (int, FK, REQUIRED)

**Reference:**
- `reference_type` (text) - freight/penalty/shortage
- `reference_id` (int)
- `reference_number` (text)

**Amounts:**
- `debit_amount` (numeric 15,2, REQUIRED)
- `tax_amount` (numeric 15,2) - Default: 0
- `total_amount` (numeric 15,2, REQUIRED)
- `paid_amount` (numeric 15,2) - Default: 0
- `payment_status` (text) - GENERATED: paid/partial/pending

**GST:**
- `is_gst_applicable` (boolean) - Default: true
- `cgst_amount`, `sgst_amount`, `igst_amount` (numeric 15,2) - Default: 0

**Details:**
- `reason_code` (text, REQUIRED) - freight/late_payment/shortage
- `reason` (text, REQUIRED)
- `notes` (text)
- `items_detail` (jsonb)

**Approval:**
- `status` (text) - draft/approved/paid/cancelled (default: 'draft')
- `approved_by` (int, FK)
- `approved_date` (timestamptz)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Freight recovery
- Late payment charges
- Shortage recovery

---

### 12. invoice_return_status ⭐ NEW (VIEW)
**Aggregated invoice return analytics**

**Columns:**
- `invoice_id` (int)
- `invoice_number` (text)
- `invoice_amount` (numeric 15,2)
- `return_count` (bigint) - Number of returns
- `total_returned_amount` (numeric) - Total returned
- `return_status` (text) - Calculated status

**Use Cases:**
- Return rate analysis
- Invoice return dashboard
- Customer return patterns

---

## Logistics & Tracking Tables

### 13. customer_visits ⭐ NEW
**Field sales visit tracking with GPS**

**Key Columns:**
- `visit_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `visit_date` (date, REQUIRED)
- `visit_time` (time)
- `customer_id` (int, FK, REQUIRED)
- `visited_by` (int, FK, REQUIRED) - Salesperson
- `route_id` (int, FK)

**Visit Details:**
- `visit_purpose` (text, REQUIRED) - order_booking/collection/relationship/complaint
- `visit_outcome` (text) - success/rescheduled/cancelled
- `order_id` (int, FK) - Order created during visit
- `collection_amount` (numeric 15,2) - Payment collected

**Time Tracking:**
- `check_in_time`, `check_out_time` (timestamptz)
- `visit_location` (jsonb) - GPS coordinates

**Follow-up:**
- `visit_notes` (text)
- `follow_up_required` (boolean) - Default: false
- `follow_up_date` (date)
- `follow_up_notes` (text)

**Media:**
- `visit_photos` (jsonb) - Photo URLs (default: [])

**Status:**
- `visit_status` (text) - completed/pending/cancelled (default: 'completed')

**Audit:**
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Field sales tracking
- Route compliance
- Visit productivity analysis
- GPS-based attendance

---

### 14. delivery_tracking ⭐ NEW
**Real-time delivery status tracking**

**Key Columns:**
- `tracking_id` (serial, PK)
- `challan_id` (int, FK, REQUIRED)
- `status` (text, REQUIRED) - dispatched/in_transit/out_for_delivery/delivered/failed
- `location` (text)
- `timestamp` (timestamptz, REQUIRED)

**GPS:**
- `gps_latitude`, `gps_longitude` (numeric 10,7)

**Details:**
- `notes` (text)
- `updated_by` (text) - Transporter/driver name

**Use Cases:**
- Real-time tracking
- Delivery ETAs
- Route optimization
- Customer notifications

---

### 15. eway_bills ⭐ NEW
**E-way bill management (GST requirement)**

**Key Columns:**
- `eway_bill_id` (serial, PK)
- `challan_id` (int, FK)
- `eway_bill_number` (text, UNIQUE)
- `supply_type` (text, REQUIRED) - outward/inward
- `sub_type` (text, REQUIRED) - supply/export/job_work
- `document_type` (text, REQUIRED) - tax_invoice/bill_of_supply/challan
- `document_number` (text, REQUIRED)
- `document_date` (date, REQUIRED)

**GSTIN:**
- `from_gstin`, `to_gstin` (text)

**Transport:**
- `transport_mode` (text, REQUIRED) - road/rail/air/ship
- `transport_distance` (int) - In km
- `transporter_name` (text)
- `transporter_id` (text) - GST transporter ID
- `vehicle_number` (text)

**Validity:**
- `valid_until` (timestamptz, REQUIRED) - Auto-calculated
- `status` (text, REQUIRED) - active/expired/cancelled (default: 'active')
- `generated_date` (timestamptz) - Default: CURRENT_TIMESTAMP

**Use Cases:**
- GST e-way bill compliance
- Inter-state movement tracking
- Expiry alerts

---

### 16. proof_of_delivery ⭐ NEW
**Digital POD with signature and GPS**

**Key Columns:**
- `pod_id` (serial, PK)
- `challan_id` (int, FK, REQUIRED)
- `customer_id` (int, FK)
- `delivered_date` (date, REQUIRED)
- `delivered_time` (time)

**Receiver Details:**
- `received_by_name` (text, REQUIRED)
- `received_by_designation` (text)
- `received_by_phone` (text)
- `delivery_location` (text)

**Verification:**
- `signature_image` (text) - Base64 or URL
- `delivery_photo` (text) - Photo URL
- `gps_latitude`, `gps_longitude` (numeric 10,7)

**Feedback:**
- `delivery_notes` (text)
- `delivery_rating` (int) - 1-5 rating

**Audit:**
- `created_date` (timestamptz) - Default: CURRENT_TIMESTAMP

**Use Cases:**
- Digital signature capture
- GPS-verified delivery
- Delivery quality tracking
- Dispute resolution

---

## Loyalty & Schemes Tables

### 17. loyalty_programs ⭐ NEW
**Loyalty program configuration**

**Key Columns:**
- `program_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `program_name` (text, REQUIRED)
- `description` (text)

**Rules:**
- `points_per_rupee` (numeric 5,2) - Earning rate (default: 1.0)
- `redemption_ratio` (numeric 5,2) - ₹ value per point (default: 0.25)
- `min_purchase_amount` (numeric 15,2) - Minimum to earn
- `min_redemption_points` (int) - Min points to redeem (default: 100)
- `max_redemption_percentage` (numeric 5,2) - Max % of bill (default: 50)
- `points_validity_days` (int) - Expiry days

**Features:**
- `tier_based` (boolean) - Enable tiers (default: false)
- `is_active` (boolean) - Default: true

**Audit:**
- `created_by` (int, FK)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Customer retention
- Repeat purchase incentives
- Tier-based benefits

---

### 20. sales_schemes ⭐ NEW
**Promotional scheme master**

**Key Columns:**
- `scheme_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `scheme_code` (text, UNIQUE per org)
- `scheme_name` (text, REQUIRED)
- `scheme_type` (text, REQUIRED) - volume/combo/free_goods/percentage
- `start_date`, `end_date` (date, REQUIRED)

**Applicability:**
- `applicable_branches` (int[])
- `applicable_territories` (int[])
- `applicable_customers` (int[])
- `applicable_customer_types` (text[])
- `applicable_products` (int[])
- `applicable_categories` (int[])

**Rules:**
- `scheme_rules` (jsonb, REQUIRED) - Complex rules in JSON

**Budget:**
- `scheme_budget` (numeric 15,2) - Max spend
- `utilized_budget` (numeric 15,2) - Used so far (default: 0)
- `max_benefit_per_order` (numeric 15,2) - Per-order cap

**Approval:**
- `approval_status` (text) - draft/approved/active (default: 'draft')
- `approved_by` (int, FK)
- `approved_date` (date)

**Status:**
- `is_active` (boolean) - Default: true
- `can_combine` (boolean) - Stackable with other schemes (default: false)

**Analytics:**
- `total_orders` (int) - Orders using scheme (default: 0)
- `total_discount_given` (numeric 15,2) - Total benefit (default: 0)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Volume-based discounts
- Buy X Get Y offers
- Combo schemes
- Category promotions

---

### 26. price_lists ⭐ NEW
**Customer/territory-specific pricing**

**Key Columns:**
- `price_list_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `price_list_name` (text, REQUIRED)
- `price_list_type` (text, REQUIRED) - standard/customer/territory/seasonal
- `currency_code` (text) - Default: 'INR'

**Validity:**
- `effective_from` (date, REQUIRED)
- `effective_until` (date)

**Applicability:**
- `applicable_branches` (int[])
- `applicable_territories` (int[])
- `applicable_customer_groups` (int[])

**Pricing Logic:**
- `parent_price_list_id` (int) - Inherit from parent
- `adjustment_type` (text) - percentage/fixed
- `adjustment_value` (numeric 15,4)

**Approval:**
- `requires_approval` (boolean) - Default: false
- `approval_status` (text) - approved/pending (default: 'approved')
- `approved_by` (int, FK)
- `approved_date` (date)

**Status:**
- `is_active` (boolean) - Default: true
- `is_default` (boolean) - Default price list (default: false)
- `description` (text)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Volume-based pricing
- Regional pricing
- Customer-specific rates
- Seasonal pricing

---

### 28. sales_targets ⭐ NEW
**Sales target tracking and incentives**

**Key Columns:**
- `target_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `target_year`, `target_month`, `target_quarter` (int)
- `period_type` (text, REQUIRED) - monthly/quarterly/annual
- `target_type` (text, REQUIRED) - salesperson/territory/branch/product
- `target_entity_id` (int, REQUIRED) - ID of entity

**Targets:**
- `revenue_target` (numeric 15,2)
- `quantity_target` (numeric 15,3)
- `new_customer_target` (int)
- `visit_target` (int)

**Achievement:**
- `revenue_achieved` (numeric 15,2) - Default: 0
- `quantity_achieved` (numeric 15,3) - Default: 0
- `new_customers_achieved` (int) - Default: 0
- `visits_achieved` (int) - Default: 0
- `revenue_achievement_percent` (numeric 5,2) - Default: 0
- `overall_achievement_percent` (numeric 5,2) - Default: 0

**Incentives:**
- `incentive_percentage` (numeric 5,2) - Incentive % on achievement
- `calculated_incentive` (numeric 15,2)

**Status:**
- `status` (text) - active/completed/cancelled (default: 'active')
- `notes` (text)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Sales performance tracking
- Incentive calculation
- Team leaderboards
- Territory analysis

---

## Delivery Tables

### 5. delivery_challans
**Delivery challan/dispatch note**

**Key Columns:**
- `challan_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `branch_id` (int, FK, REQUIRED)
- `challan_number` (text, UNIQUE per org)
- `challan_date` (date, REQUIRED) - Default: CURRENT_DATE
- `challan_type` (text) - delivery/sample/returnable (default: 'delivery')

**References:**
- `order_id` (int, FK)
- `invoice_id` (int, FK)
- `customer_id` (int, FK, REQUIRED)
- `delivery_address_id` (int, FK)

**Dispatch:**
- `dispatch_date` (date)
- `dispatch_time` (time)
- `dispatch_address_id` (int, FK)

**Transport:**
- `transport_mode` (text) - road/rail/air/courier
- `transporter_name` (text)
- `vehicle_number` (text)
- `lr_number` (text) - Lorry receipt
- `lr_date` (date)
- `freight_charges` (numeric 15,2)

**E-way Bill:**
- `eway_bill_required` (boolean) - Default: false
- `eway_bill_number` (text)
- `eway_bill_date` (date)
- `eway_bill_validity_days` (int)
- `eway_bill_data` (jsonb)

**Summary:**
- `total_quantity` (numeric 15,3)
- `total_amount` (numeric 15,2)
- `taxable_amount`, `gst_amount` (numeric 15,2) - Default: 0

**Status:**
- `challan_status` (text) - draft/confirmed/dispatched/cancelled (default: 'draft')
- `delivery_status` (text) - pending/in_transit/delivered/failed (default: 'pending')

**Delivery:**
- `delivered_date`, `delivered_time` (date, time)
- `received_by` (text) - Receiver name
- `delivery_notes` (text)
- `pod_document` (text) - POD attachment

**Returns:**
- `is_returnable` (boolean) - Default: false
- `return_by_date` (date)
- `return_status` (text)

**Notes:**
- `notes` (text)
- `internal_notes` (text)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Dispatch management
- Delivery tracking
- POD capture
- E-way bill integration

---

### 7. sales_returns
**Sales return header with approval workflow**

**Key Columns:**
- `return_id` (serial, PK)
- `org_id` (uuid, FK, REQUIRED)
- `branch_id` (int, FK, REQUIRED)
- `return_number` (text, UNIQUE per org)
- `return_date` (date, REQUIRED) - Default: CURRENT_DATE
- `return_type` (text, REQUIRED) - full_return/partial_return/exchange/damage
- `invoice_id` (int, FK)
- `challan_id` (int, FK)
- `customer_id` (int, FK, REQUIRED)

**Reason:**
- `return_reason` (text, REQUIRED) - damaged/expired/quality/wrong_product
- `return_category` (text) - quality/commercial/operational

**Approval:**
- `approval_required` (boolean) - Default: true
- `approval_status` (text) - pending/approved/rejected (default: 'pending')
- `approved_by` (int, FK)
- `approved_at` (timestamptz)

**Financial:**
- `return_amount` (numeric 15,2)
- `tax_amount` (numeric 15,2)
- `total_amount` (numeric 15,2)
- `igst_amount`, `cgst_amount`, `sgst_amount` (numeric 15,2) - Default: 0

**Credit Note:**
- `credit_note_number` (text)
- `credit_note_date` (date)
- `credit_note_status` (text) - pending/generated/applied (default: 'pending')

**Adjustment:**
- `adjustment_type` (text) - credit_note/replacement/refund
- `adjusted_amount` (numeric 15,2) - Default: 0
- `pending_amount` (numeric 15,2)

**Goods Receipt:**
- `goods_received_date` (date)
- `goods_received_by` (int, FK)
- `quality_check_status` (text) - pending/approved/rejected

**Notes:**
- `notes` (text)
- `internal_notes` (text)

**Audit:**
- `created_by` (int, FK, REQUIRED)
- `created_at`, `updated_at` (timestamptz)

**Use Cases:**
- Return authorization
- Quality inspection
- Credit note generation
- Stock adjustment

---

## Relationships

### Order Flow:
```
orders
 └─ order_items (many)
     └─ delivery_challans
         └─ delivery_challan_items
             └─ invoices
                 └─ invoice_items
```

### Returns Flow:
```
invoices
 └─ sales_returns
     ├─ sales_return_items
     └─ credit_notes
         └─ credit_note_applications → back to invoices
```

### Schemes:
```
sales_schemes
 ├─ scheme_customers (many-to-many)
 ├─ scheme_products (many-to-many)
 ├─ scheme_volume_slabs (one-to-many)
 └─ scheme_usage (tracking)
```

---

## Multi-Tenant Security

### RLS Policies:
- **orders, invoices, challans, returns:** ✅ Enabled
- **All sales tables:** Filtered by org_id

---

## Performance Optimizations

### Critical Indexes:
- **invoices:** (org_id, invoice_date), (customer_id), (invoice_status)
- **invoice_items:** (invoice_id, product_id), (batch_id)
- **orders:** (org_id, order_date), (customer_id), (order_status)
- **credit_notes:** (customer_id, status), (remaining_amount > 0)

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [03_inventory_schema.md](./03_inventory_schema.md) - Batch allocation
- [06_financial_schema.md](./06_financial_schema.md) - Payments & receivables
- [07_gst_schema.md](./07_gst_schema.md) - GST compliance

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 30 (+15 new tables from previous documentation)
**Key Features:** Complete Order-to-Cash, Credit/Debit Notes, E-invoice, E-way Bills, Loyalty, Schemes, Field Sales, GPS Tracking
**Major Additions:** Returns processing, Loyalty programs, Field sales visits, Delivery tracking, Pricing lists, Sales targets
