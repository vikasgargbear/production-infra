# API Table Reference Fixes Required

## Critical Table Name Mismatches

Based on testing and the actual database schema, these table references need to be fixed:

### 1. Purchases Module (`purchases.py`, `purchase_enhanced.py`)
**Current**: `purchases`, `purchase_items`, `suppliers`
**Should be**: 
- `procurement.purchase_orders`
- `procurement.purchase_order_items`
- `parties.suppliers`

### 2. Delivery Challan Module (`enterprise_delivery_challan.py`)
**Current**: `challans`
**Should be**: `sales.delivery_challans`

### 3. Stock Movements Module (`stock_movements.py`)
**Current**: `stock_movements`
**Should be**: `inventory.inventory_movements`

### 4. Returns Modules (`sale_returns.py`, `purchase_returns.py`)
**Current**: `return_requests`, `return_items`
**Should be**: 
- `sales.sales_returns`
- `sales.sales_return_items`
- `procurement.purchase_returns` (if exists)

### 5. Collection Center Module (`collection_center_simple.py`)
**Current**: `customer_outstanding`
**Should be**: `financial.customer_outstanding`

### 6. All Supplier References
**Current**: `suppliers` (unqualified)
**Should be**: `parties.suppliers`

### 7. All Customer References
**Current**: `customers` (sometimes unqualified)
**Should be**: `parties.customers`

### 8. Product Search (`products_consolidated.py`)
- Need to check if `api.search_products()` function exists
- If not, use direct SELECT from `inventory.products`

## Files to Fix

Priority order based on frontend usage:

1. **products_consolidated.py** - Product creation still using old columns
2. **purchases.py** - Using wrong table names
3. **enterprise_delivery_challan.py** - Using `challans` instead of `sales.delivery_challans`
4. **collection_center_simple.py** - Using wrong outstanding table
5. **sale_returns.py** - Using wrong return tables
6. **stock_movements.py** - Using wrong movements table

## Working Endpoints (Keep As-Is)
- `/customers/` - Working
- `/suppliers/` - Working
- `/invoices/` - Working
- `/invoices/list` - Working

## Notes
- Database schema is LOCKED - no alterations allowed
- Must use exact table names with schema prefix (e.g., `parties.suppliers`)
- Batch creation happens through GRN process after purchase order