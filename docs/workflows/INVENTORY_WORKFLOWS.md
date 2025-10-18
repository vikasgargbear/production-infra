# Inventory Management Workflows

## Understanding the Difference

### Purchase Order (PO)
- **What**: Order sent to supplier
- **Inventory Change**: NONE
- **Table**: `procurement.purchase_orders` with status='draft/sent'
- **Purpose**: Request goods from supplier

### Purchase Entry (Bill Entry)
- **What**: Recording goods RECEIVED with supplier's bill/invoice
- **Inventory Change**: INCREASES (creates batches)
- **Table**: `procurement.purchase_orders` with status='completed'
- **Creates**: `inventory.batches` for stock tracking
- **Purpose**: Add received goods to inventory

### GRN (Goods Receipt Note)
- **What**: Quality check document
- **When**: Optional, used by large companies
- **Purpose**: Verify received goods match PO

## Three Workflows Available

### 1. Direct Product Add (Simplest)
**For**: Small shops adding initial stock or samples
**Process**: 
- Add Product → Enter quantity, batch, expiry → Auto-creates batch
**Endpoint**: `/api/products/` (with quantity_available)
**Creates**:
- Product in `inventory.products`
- Batch in `inventory.batches`

### 2. Purchase Entry (Most Common)
**For**: Regular pharmacies receiving goods with bills
**Process**:
- Receive goods with bill → Purchase Entry → Creates batches
**Endpoint**: `/api/purchases-enhanced/with-items`
**Creates**:
- Completed PO in `procurement.purchase_orders` 
- Batches in `inventory.batches`
**Frontend**: PurchaseFlow.js component

### 3. Full Enterprise Workflow
**For**: Large pharmacies/chains needing approval workflow
**Process**:
- Create PO → Send to supplier → Receive goods → GRN → Create batches
**Endpoints**:
- `/api/purchase-orders/` - Create PO
- `/api/grn/` - Record receipt
- Batches created via GRN process

## Key Points

1. **Purchase Entry ≠ Purchase Order**
   - PO = Order to supplier (no stock change)
   - Purchase Entry = Bill entry (stock increases)

2. **Most users need Purchase Entry**, not PO
   - They receive goods and want to add to inventory
   - PO is only needed if you want to track orders sent to suppliers

3. **Batch creation happens when**:
   - Product added with quantity (direct)
   - Purchase Entry completed (with bill)
   - GRN processed (enterprise flow)

## Database Impact

| Action | Creates | Inventory Change |
|--------|---------|------------------|
| Purchase Order | `procurement.purchase_orders` (status='sent') | None |
| Purchase Entry | `procurement.purchase_orders` (status='completed') + `inventory.batches` | Increases |
| Direct Product Add | `inventory.products` + `inventory.batches` | Increases |
| GRN | `procurement.grn` + `inventory.batches` | Increases |