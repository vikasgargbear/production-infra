# Schema Updates Based on Actual Database

## procurement.purchase_orders
- Primary key: `purchase_order_id` (NOT `po_id`)
- No `payment_status` column
- Has `receipt_status` instead of `grn_status`

## procurement.purchase_order_items  
- Foreign key: `purchase_order_id` (NOT `po_id`)
- Primary key: `po_item_id` ✓
- Has `received_quantity` ✓

## financial.payments
- Column: `payment_amount` (NOT `amount`)
- Has `party_id` and `party_type` ✓
- Has `payment_method_id` (NOT `payment_mode`)
- Columns `customer_id`/`supplier_id` don't exist separately

## inventory.movement_summary
- This is a view/table with columns: `movement_type`, `product_id`, `quantity`, `movement_date`, `document_number`, `party_name`, `org_id`
- NOT `quantity_in`/`quantity_out`

## inventory.batches
- Has `cost_per_unit` ✓
- Has `quantity_reserved` ✓  
- Has `sale_price_per_unit` and `mrp_per_unit`

## inventory.products
- Has `min_stock_quantity` (NOT `minimum_stock_level`)
- Has `reorder_level` ✓

## sales.invoices
- Has `paid_amount` ✓
- Has `payment_status` ✓