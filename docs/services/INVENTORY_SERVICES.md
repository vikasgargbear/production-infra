# Inventory Services

Services for inventory management including stock tracking, movements, and write-offs.

---

## InventoryService

**Location:** `backend/app/api/services/inventory/inventory_service.py`

**Used By:** `inventory/stock/routes.py`, `purchase/grn/routes.py`, `sales/invoices/routes.py`, `returns/*/routes.py`

**Description:** Core inventory management for stock tracking, movements, and batch management.

### Methods

| Method | Description |
|--------|-------------|
| `get_current_stock()` | Get current stock by product/batch |
| `get_stock_summary()` | Get stock summary with values |
| `record_stock_movement()` | Record stock in/out movement |
| `update_batch_quantity()` | Update batch quantity |
| `get_low_stock_items()` | Items below reorder level |
| `get_expiring_soon()` | Items expiring within days |
| `get_batch_stock()` | Get stock by batch |
| `reserve_stock()` | Reserve stock for order |
| `release_reservation()` | Release reserved stock |
| `transfer_stock()` | Transfer between locations |
| `get_stock_valuation()` | Calculate stock value |

### Stock Movement Types

| Type | Direction | Description |
|------|-----------|-------------|
| `PURCHASE` | IN | Stock from purchase/GRN |
| `SALE` | OUT | Stock sale via invoice |
| `RETURN_IN` | IN | Customer return |
| `RETURN_OUT` | OUT | Return to supplier |
| `ADJUSTMENT` | IN/OUT | Manual adjustment |
| `TRANSFER` | IN/OUT | Inter-branch transfer |
| `DAMAGE` | OUT | Damaged/expired write-off |

---

## WriteoffService

**Location:** `backend/app/api/services/inventory/writeoff/service.py`

**Used By:** `inventory/writeoff/routes.py`

**Description:** Stock write-off management for damaged, expired, or lost inventory.

### Methods

| Method | Description |
|--------|-------------|
| `create_writeoff()` | Create new write-off entry |
| `get_writeoff()` | Get write-off details |
| `list_writeoffs()` | List with filters |
| `approve_writeoff()` | Approve and update stock |
| `get_writeoff_items()` | Get line items |
| `get_writeoff_summary()` | Summary statistics |

### Write-off Reasons

| Reason | Description |
|--------|-------------|
| `EXPIRED` | Past expiry date |
| `DAMAGED` | Physical damage |
| `LOST` | Cannot locate |
| `QUALITY` | Quality issues |
| `RECALL` | Product recall |
| `OTHER` | Other reasons |

---

## Usage Examples

### InventoryService - Record Stock Movement

```python
from app.api.services.inventory.inventory_service import InventoryService
from app.api.schemas.inventory.inventory import StockMovementCreate
import uuid

# Record stock out for sale
movement = StockMovementCreate(
    org_id=uuid.UUID(str(context.org_id)),
    product_id=product_id,
    batch_id=batch_id,
    movement_type="SALE",
    movement_direction="out",
    movement_date=date.today(),
    quantity=10,
    base_quantity=10,
    location_id=branch_id,
    reference_type="INVOICE",
    reference_id=invoice_id,
    reference_number="INV/2024/00001",
    created_by=context.user_id
)

InventoryService.record_stock_movement(db, movement)
```

### InventoryService - Get Current Stock

```python
from app.api.services.inventory.inventory_service import InventoryService

# Get stock for a product across all batches
stock = InventoryService.get_current_stock(
    db=db,
    product_id=product_id
)
# Returns: {"total_quantity": 100, "batches": [...]}
```

### WriteoffService - Create Writeoff

```python
from app.api.services.inventory.writeoff.service import WriteoffService

writeoff_id = WriteoffService.create_writeoff(
    db=db,
    org_id=str(context.org_id),
    writeoff_data={
        "reason": "EXPIRED",
        "items": [
            {"batch_id": 123, "quantity": 10, "reason": "Past expiry date"}
        ]
    },
    created_by=context.user_id
)
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `inventory.products` | Product master | InventoryService | Product catalog |
| `inventory.batches` | Batch tracking | InventoryService | Batch/lot tracking |
| `inventory.stock_movements` | Movement log | InventoryService | All stock in/out |
| `inventory.stock_reservations` | Reservations | InventoryService | Reserved stock |
| `inventory.stock_writeoffs` | Writeoff headers | WriteoffService | Writeoff records |
| `inventory.writeoff_items` | Writeoff lines | WriteoffService | Writeoff line items |

---

## Dependencies

```
InventoryService
├── Uses: inventory.products, inventory.batches
├── Uses: inventory.stock_movements, inventory.stock_reservations
└── Depends on: None (core service)

WriteoffService
├── Uses: inventory.stock_writeoffs, inventory.writeoff_items
├── Uses: inventory.batches (update quantity)
├── Depends on: InventoryService (stock reduction)
└── Depends on: DocumentNumberService
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `INSUFFICIENT_STOCK` | 400 | Not enough stock available | Check batch availability |
| `BATCH_NOT_FOUND` | 404 | Batch ID not found | Verify batch_id |
| `PRODUCT_NOT_FOUND` | 404 | Product ID not found | Verify product_id |
| `EXPIRED_BATCH` | 400 | Batch is expired | Cannot sell expired items |
| `RESERVED_STOCK` | 400 | Stock is reserved for order | Release or use different batch |
| `INVALID_MOVEMENT_TYPE` | 400 | Unknown movement type | Use valid type |
| `WRITEOFF_ALREADY_APPROVED` | 400 | Writeoff already processed | Cannot modify |
| `NEGATIVE_QUANTITY` | 400 | Quantity cannot be negative | Use positive value |

