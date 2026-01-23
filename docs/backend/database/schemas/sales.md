# Sales Schema

Transaction and customer-facing sales operations.

**Schema**: `sales`  
**Tables**: 27

---

## Core Sales Tables

### sales.invoices

| Column | Type | Nullable |
|--------|------|----------|
| `invoice_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `invoice_number` | text | NOT NULL |
| `invoice_date` | date | NOT NULL |
| `due_date` | date | NULL |
| `order_id` | integer | NULL |
| `customer_id` | integer | NOT NULL |
| `customer_name` | text | NULL |
| `billing_address` | text | NULL |
| `shipping_address` | text | NULL |
| `delivery_type` | text | NULL |
| `transport_company` | text | NULL |
| `vehicle_number` | text | NULL |
| `driver_phone` | text | NULL |
| `lr_number` | text | NULL |
| `eway_bill_number` | text | NULL |
| `subtotal_amount` | numeric | NOT NULL |
| `discount_type` | text | NULL |
| `discount_percent` | numeric | NULL |
| `discount_amount` | numeric | NULL |
| `taxable_amount` | numeric | NOT NULL |
| `cgst_amount` | numeric | NULL |
| `sgst_amount` | numeric | NULL |
| `igst_amount` | numeric | NULL |
| `cess_amount` | numeric | NULL |
| `total_tax_amount` | numeric | NOT NULL |
| `freight_charges` | numeric | NULL |
| `other_charges` | numeric | NULL |
| `round_off` | numeric | NULL |
| `total_amount` | numeric | NOT NULL |
| `payment_mode` | text | NULL |
| `payment_status` | text | NULL |
| `paid_amount` | numeric | NULL |
| `balance_amount` | numeric | NULL |
| `payment_due_date` | date | NULL |
| `gst_type` | text | NULL |
| `place_of_supply` | text | NULL |
| `salesperson_id` | integer | NULL |
| `scheme_ids` | ARRAY | NULL |
| `scheme_discount_amount` | numeric | NULL |
| `is_cancelled` | boolean | NULL |
| `cancellation_reason` | text | NULL |
| `cancelled_date` | date | NULL |
| `cancelled_by` | integer | NULL |
| `notes` | text | NULL |
| `terms_and_conditions` | text | NULL |
| `invoice_type` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.invoice_items

| Column | Type | Nullable |
|--------|------|----------|
| `item_id` | integer | NOT NULL |
| `invoice_id` | integer | NOT NULL |
| `product_id` | integer | NOT NULL |
| `product_name` | text | NULL |
| `batch_id` | integer | NULL |
| `batch_number` | text | NULL |
| `expiry_date` | date | NULL |
| `hsn_code` | text | NULL |
| `quantity` | numeric | NOT NULL |
| `free_quantity` | numeric | NULL |
| `unit_price` | numeric | NOT NULL |
| `mrp` | numeric | NULL |
| `discount_percent` | numeric | NULL |
| `discount_amount` | numeric | NULL |
| `taxable_amount` | numeric | NOT NULL |
| `cgst_percent` | numeric | NULL |
| `cgst_amount` | numeric | NULL |
| `sgst_percent` | numeric | NULL |
| `sgst_amount` | numeric | NULL |
| `igst_percent` | numeric | NULL |
| `igst_amount` | numeric | NULL |
| `cess_percent` | numeric | NULL |
| `cess_amount` | numeric | NULL |
| `total_tax_amount` | numeric | NOT NULL |
| `total_amount` | numeric | NOT NULL |
| `scheme_id` | integer | NULL |
| `scheme_discount_percent` | numeric | NULL |
| `scheme_discount_amount` | numeric | NULL |

### sales.orders

| Column | Type | Nullable |
|--------|------|----------|
| `order_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `order_number` | text | NOT NULL |
| `order_date` | date | NOT NULL |
| `expected_delivery_date` | date | NULL |
| `customer_id` | integer | NOT NULL |
| `customer_name` | text | NULL |
| `delivery_address` | text | NULL |
| `delivery_type` | text | NULL |
| `salesperson_id` | integer | NULL |
| `subtotal_amount` | numeric | NOT NULL |
| `discount_amount` | numeric | NULL |
| `tax_amount` | numeric | NULL |
| `total_amount` | numeric | NOT NULL |
| `advance_amount` | numeric | NULL |
| `order_status` | text | NULL |
| `fulfillment_status` | text | NULL |
| `invoice_id` | integer | NULL |
| `notes` | text | NULL |
| `special_instructions` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.order_items

| Column | Type | Nullable |
|--------|------|----------|
| `item_id` | integer | NOT NULL |
| `order_id` | integer | NOT NULL |
| `product_id` | integer | NOT NULL |
| `product_name` | text | NULL |
| `requested_quantity` | numeric | NOT NULL |
| `confirmed_quantity` | numeric | NULL |
| `fulfilled_quantity` | numeric | NULL |
| `unit_price` | numeric | NOT NULL |
| `discount_percent` | numeric | NULL |
| `discount_amount` | numeric | NULL |
| `tax_percent` | numeric | NULL |
| `tax_amount` | numeric | NULL |
| `total_amount` | numeric | NOT NULL |
| `notes` | text | NULL |

### sales.delivery_challans

| Column | Type | Nullable |
|--------|------|----------|
| `challan_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `challan_number` | text | NOT NULL |
| `challan_date` | date | NOT NULL |
| `invoice_id` | integer | NULL |
| `order_id` | integer | NULL |
| `customer_id` | integer | NOT NULL |
| `customer_name` | text | NULL |
| `delivery_address` | text | NULL |
| `delivery_type` | text | NULL |
| `transport_company` | text | NULL |
| `vehicle_number` | text | NULL |
| `driver_name` | text | NULL |
| `driver_phone` | text | NULL |
| `lr_number` | text | NULL |
| `eway_bill_number` | text | NULL |
| `total_boxes` | integer | NULL |
| `total_weight` | numeric | NULL |
| `delivery_status` | text | NULL |
| `expected_delivery_date` | date | NULL |
| `actual_delivery_date` | date | NULL |
| `delivered_by` | integer | NULL |
| `received_by` | text | NULL |
| `delivery_notes` | text | NULL |
| `is_cancelled` | boolean | NULL |
| `cancellation_reason` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.delivery_challan_items

| Column | Type | Nullable |
|--------|------|----------|
| `item_id` | integer | NOT NULL |
| `challan_id` | integer | NOT NULL |
| `product_id` | integer | NOT NULL |
| `product_name` | text | NULL |
| `batch_id` | integer | NULL |
| `batch_number` | text | NULL |
| `quantity` | numeric | NOT NULL |
| `free_quantity` | numeric | NULL |
| `unit_price` | numeric | NULL |
| `notes` | text | NULL |

---

## Returns & Credit/Debit Notes

### sales.sales_returns

| Column | Type | Nullable |
|--------|------|----------|
| `return_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `return_number` | text | NOT NULL |
| `return_date` | date | NOT NULL |
| `invoice_id` | integer | NULL |
| `customer_id` | integer | NOT NULL |
| `customer_name` | text | NULL |
| `return_type` | text | NOT NULL |
| `return_reason` | text | NULL |
| `subtotal_amount` | numeric | NOT NULL |
| `tax_amount` | numeric | NOT NULL |
| `total_amount` | numeric | NOT NULL |
| `refund_mode` | text | NULL |
| `refund_status` | text | NULL |
| `refund_amount` | numeric | NULL |
| `refund_date` | date | NULL |
| `credit_note_id` | integer | NULL |
| `restocking_fee` | numeric | NULL |
| `approval_status` | text | NULL |
| `approved_by` | integer | NULL |
| `approved_date` | date | NULL |
| `notes` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.sales_return_items

| Column | Type | Nullable |
|--------|------|----------|
| `item_id` | integer | NOT NULL |
| `return_id` | integer | NOT NULL |
| `invoice_item_id` | integer | NULL |
| `product_id` | integer | NOT NULL |
| `product_name` | text | NULL |
| `batch_id` | integer | NULL |
| `batch_number` | text | NULL |
| `returned_quantity` | numeric | NOT NULL |
| `unit_price` | numeric | NOT NULL |
| `discount_amount` | numeric | NULL |
| `taxable_amount` | numeric | NOT NULL |
| `tax_percent` | numeric | NULL |
| `tax_amount` | numeric | NULL |
| `total_amount` | numeric | NOT NULL |
| `return_reason` | text | NULL |
| `product_condition` | text | NULL |
| `restock_allowed` | boolean | NULL |

### sales.credit_notes

| Column | Type | Nullable |
|--------|------|----------|
| `credit_note_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `credit_note_number` | text | NOT NULL |
| `credit_note_date` | date | NOT NULL |
| `customer_id` | integer | NOT NULL |
| `invoice_id` | integer | NULL |
| `return_id` | integer | NULL |
| `reason` | text | NULL |
| `credit_amount` | numeric | NOT NULL |
| `utilized_amount` | numeric | NULL |
| `balance_amount` | numeric | NULL |
| `validity_date` | date | NULL |
| `status` | text | NULL |
| `approval_status` | text | NULL |
| `approved_by` | integer | NULL |
| `approved_date` | date | NULL |
| `notes` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.debit_notes

| Column | Type | Nullable |
|--------|------|----------|
| `debit_note_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `debit_note_number` | text | NOT NULL |
| `debit_note_date` | date | NOT NULL |
| `customer_id` | integer | NOT NULL |
| `invoice_id` | integer | NULL |
| `reason` | text | NULL |
| `debit_amount` | numeric | NOT NULL |
| `adjusted_amount` | numeric | NULL |
| `balance_amount` | numeric | NULL |
| `status` | text | NULL |
| `approval_status` | text | NULL |
| `approved_by` | integer | NULL |
| `approved_date` | date | NULL |
| `notes` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.credit_note_applications

| Column | Type | Nullable |
|--------|------|----------|
| `application_id` | integer | NOT NULL |
| `credit_note_id` | integer | NOT NULL |
| `invoice_id` | integer | NOT NULL |
| `applied_amount` | numeric | NOT NULL |
| `application_date` | date | NOT NULL |
| `created_by` | integer | NULL |
| `created_at` | timestamp with time zone | NULL |

---

## Pricing & Schemes

### sales.price_lists

| Column | Type | Nullable |
|--------|------|----------|
| `price_list_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `price_list_name` | text | NOT NULL |
| `description` | text | NULL |
| `customer_type` | text | NULL |
| `priority` | integer | NULL |
| `valid_from` | date | NULL |
| `valid_to` | date | NULL |
| `is_active` | boolean | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NULL |

### sales.price_list_items

| Column | Type | Nullable |
|--------|------|----------|
| `price_list_item_id` | integer | NOT NULL |
| `price_list_id` | integer | NOT NULL |
| `product_id` | integer | NOT NULL |
| `special_price` | numeric | NOT NULL |
| `discount_percent` | numeric | NULL |
| `min_quantity` | numeric | NULL |
| `max_quantity` | numeric | NULL |
| `valid_from` | date | NULL |
| `valid_to` | date | NULL |

### sales.promotional_schemes

| Column | Type | Nullable |
|--------|------|----------|
| `scheme_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `scheme_code` | text | NOT NULL |
| `scheme_name` | text | NOT NULL |
| `scheme_type` | text | NOT NULL |
| `start_date` | date | NOT NULL |
| `end_date` | date | NOT NULL |
| `applicable_branches` | ARRAY | NULL |
| `applicable_territories` | ARRAY | NULL |
| `applicable_customers` | ARRAY | NULL |
| `applicable_products` | ARRAY | NULL |
| `is_active` | boolean | NULL |
| `discount_percentage` | numeric | NULL |
| `discount_amount` | numeric | NULL |
| `buy_quantity` | integer | NULL |
| `get_quantity` | integer | NULL |
| `min_bill_value` | numeric | NULL |
| `max_discount_amount` | numeric | NULL |
| `max_uses_per_customer` | integer | NULL |
| `can_combine` | boolean | NULL |
| `priority` | integer | NULL |
| `created_by` | integer | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### sales.sales_schemes

| Column | Type | Nullable |
|--------|------|----------|
| `scheme_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `scheme_code` | text | NOT NULL |
| `scheme_name` | text | NOT NULL |
| `scheme_type` | text | NOT NULL |
| `start_date` | date | NOT NULL |
| `end_date` | date | NOT NULL |
| `applicable_branches` | ARRAY | NULL |
| `applicable_territories` | ARRAY | NULL |
| `applicable_customers` | ARRAY | NULL |
| `applicable_customer_types` | ARRAY | NULL |
| `scheme_rules` | jsonb | NOT NULL |
| `applicable_products` | ARRAY | NULL |
| `applicable_categories` | ARRAY | NULL |
| `scheme_budget` | numeric | NULL |
| `utilized_budget` | numeric | NULL |
| `max_benefit_per_order` | numeric | NULL |
| `approval_status` | text | NULL |
| `approved_by` | integer | NULL |
| `approved_date` | date | NULL |
| `is_active` | boolean | NULL |
| `can_combine` | boolean | NULL |
| `total_orders` | integer | NULL |
| `total_discount_given` | numeric | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

### sales.scheme_products

| Column | Type | Nullable |
|--------|------|----------|
| `scheme_id` | integer | NOT NULL |
| `product_id` | integer | NOT NULL |

### sales.scheme_customers

| Column | Type | Nullable |
|--------|------|----------|
| `scheme_id` | integer | NOT NULL |
| `customer_id` | integer | NOT NULL |

### sales.scheme_usage

| Column | Type | Nullable |
|--------|------|----------|
| `usage_id` | integer | NOT NULL |
| `scheme_id` | integer | NULL |
| `invoice_id` | integer | NULL |
| `customer_id` | integer | NULL |
| `usage_date` | date | NOT NULL |
| `discount_given` | numeric | NULL |
| `free_items_data` | jsonb | NULL |
| `created_at` | timestamp with time zone | NULL |

### sales.scheme_volume_slabs

| Column | Type | Nullable |
|--------|------|----------|
| `slab_id` | integer | NOT NULL |
| `scheme_id` | integer | NULL |
| `min_quantity` | numeric | NOT NULL |
| `max_quantity` | numeric | NULL |
| `discount_percentage` | numeric | NULL |
| `discount_amount` | numeric | NULL |

---

## Other Tables

### sales.customer_visits

| Column | Type | Nullable |
|--------|------|----------|
| `visit_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `visit_date` | date | NOT NULL |
| `visit_time` | time without time zone | NULL |
| `customer_id` | integer | NOT NULL |
| `visited_by` | integer | NOT NULL |
| `route_id` | integer | NULL |
| `visit_purpose` | text | NOT NULL |
| `visit_outcome` | text | NULL |
| `order_id` | integer | NULL |
| `collection_amount` | numeric | NULL |
| `check_in_time` | timestamp with time zone | NULL |
| `check_out_time` | timestamp with time zone | NULL |
| `visit_location` | jsonb | NULL |
| `visit_notes` | text | NULL |
| `follow_up_required` | boolean | NULL |
| `follow_up_date` | date | NULL |
| `follow_up_notes` | text | NULL |
| `visit_photos` | jsonb | NULL |
| `visit_status` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### sales.delivery_tracking

| Column | Type | Nullable |
|--------|------|----------|
| `tracking_id` | integer | NOT NULL |
| `challan_id` | integer | NOT NULL |
| `status` | text | NOT NULL |
| `location` | text | NULL |
| `timestamp` | timestamp with time zone | NOT NULL |
| `gps_latitude` | numeric | NULL |
| `gps_longitude` | numeric | NULL |
| `notes` | text | NULL |
| `updated_by` | text | NULL |
| `created_at` | timestamp with time zone | NULL |

### sales.eway_bills

| Column | Type | Nullable |
|--------|------|----------|
| `eway_bill_id` | integer | NOT NULL |
| `challan_id` | integer | NULL |
| `eway_bill_number` | text | NOT NULL |
| `supply_type` | text | NOT NULL |
| `sub_type` | text | NOT NULL |
| `document_type` | text | NOT NULL |
| `document_number` | text | NOT NULL |
| `document_date` | date | NOT NULL |
| `from_gstin` | text | NULL |
| `to_gstin` | text | NULL |
| `transport_mode` | text | NOT NULL |
| `transport_distance` | integer | NULL |
| `transporter_name` | text | NULL |
| `transporter_id` | text | NULL |
| `vehicle_number` | text | NULL |
| `valid_until` | timestamp with time zone | NOT NULL |
| `status` | text | NOT NULL |
| `generated_date` | timestamp with time zone | NULL |

### sales.loyalty_programs

| Column | Type | Nullable |
|--------|------|----------|
| `program_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `program_name` | text | NOT NULL |
| `description` | text | NULL |
| `points_per_rupee` | numeric | NULL |
| `redemption_ratio` | numeric | NULL |
| `min_purchase_amount` | numeric | NULL |
| `min_redemption_points` | integer | NULL |
| `max_redemption_percentage` | numeric | NULL |
| `points_validity_days` | integer | NULL |
| `tier_based` | boolean | NULL |
| `is_active` | boolean | NULL |
| `created_by` | integer | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |

### sales.loyalty_tiers

| Column | Type | Nullable |
|--------|------|----------|
| `tier_id` | integer | NOT NULL |
| `program_id` | integer | NULL |
| `tier_name` | text | NOT NULL |
| `min_points_required` | integer | NOT NULL |
| `points_multiplier` | numeric | NULL |
| `additional_benefits` | text | NULL |

### sales.loyalty_transactions

| Column | Type | Nullable |
|--------|------|----------|
| `transaction_id` | integer | NOT NULL |
| `program_id` | integer | NULL |
| `customer_id` | integer | NULL |
| `transaction_type` | text | NOT NULL |
| `points` | integer | NOT NULL |
| `reference_type` | text | NULL |
| `reference_id` | integer | NULL |
| `remarks` | text | NULL |
| `expiry_date` | date | NULL |
| `created_by` | integer | NULL |
| `created_at` | timestamp with time zone | NULL |

### sales.proof_of_delivery

| Column | Type | Nullable |
|--------|------|----------|
| `pod_id` | integer | NOT NULL |
| `challan_id` | integer | NOT NULL |
| `customer_id` | integer | NULL |
| `delivered_date` | date | NOT NULL |
| `delivered_time` | time without time zone | NULL |
| `received_by_name` | text | NOT NULL |
| `received_by_designation` | text | NULL |
| `received_by_phone` | text | NULL |
| `delivery_location` | text | NULL |
| `delivery_notes` | text | NULL |
| `signature_image` | text | NULL |
| `delivery_photo` | text | NULL |
| `gps_latitude` | numeric | NULL |
| `gps_longitude` | numeric | NULL |
| `delivery_rating` | integer | NULL |
| `created_date` | timestamp with time zone | NULL |

### sales.sales_targets

| Column | Type | Nullable |
|--------|------|----------|
| `target_id` | integer | NOT NULL |
| `org_id` | uuid | NOT NULL |
| `target_year` | integer | NOT NULL |
| `target_month` | integer | NULL |
| `target_quarter` | integer | NULL |
| `period_type` | text | NOT NULL |
| `target_type` | text | NOT NULL |
| `target_entity_id` | integer | NOT NULL |
| `revenue_target` | numeric | NULL |
| `quantity_target` | numeric | NULL |
| `new_customer_target` | integer | NULL |
| `visit_target` | integer | NULL |
| `revenue_achieved` | numeric | NULL |
| `quantity_achieved` | numeric | NULL |
| `new_customers_achieved` | integer | NULL |
| `visits_achieved` | integer | NULL |
| `revenue_achievement_percent` | numeric | NULL |
| `overall_achievement_percent` | numeric | NULL |
| `incentive_percentage` | numeric | NULL |
| `calculated_incentive` | numeric | NULL |
| `status` | text | NULL |
| `notes` | text | NULL |
| `created_at` | timestamp with time zone | NULL |
| `updated_at` | timestamp with time zone | NULL |
| `created_by` | integer | NOT NULL |

---

**Generated from live database**: `https://pharma-backend-production-0c09.up.railway.app/api/schema/sales`
