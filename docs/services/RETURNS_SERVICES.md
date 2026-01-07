# Returns Services

Services for sales and purchase return management.

---

## ReturnService

**Location:** `backend/app/api/services/returns/return_service.py`

**Used By:** `returns/sales/routes.py`, `returns/purchase/routes.py`

**Description:** Core return processing logic shared between sales and purchase returns.

### Methods

| Method | Description |
|--------|-------------|
| `calculate_return_value()` | Calculate return amount with tax |
| `resolve_batch()` | Resolve batch from multiple sources |
| `resolve_tax_from_supplier_invoice()` | Get tax rate from source |
| `determine_disposition()` | Determine how to handle returned goods |
| `get_return_reasons()` | Get list of return reasons |

### Return Dispositions

| Disposition | Description |
|-------------|-------------|
| `RESTOCK` | Return to sellable stock |
| `DAMAGED` | Move to damaged inventory |
| `RETURN_TO_SUPPLIER` | Return to supplier |
| `DISPOSE` | Dispose/write-off |
| `QUALITY_CHECK` | Hold for QC |

---

## PurchaseReturnService

**Location:** `backend/app/api/services/returns/purchase_return/service.py`

**Used By:** `returns/purchase/routes.py`

**Description:** Purchase return management for returning goods to suppliers.

### Methods (8 total)

| Method | Description |
|--------|-------------|
| `get_returnable_items_from_invoice()` | Get items eligible for return from supplier invoice |
| `get_returnable_items_from_grn()` | Get items eligible for return from GRN |
| `get_supplier()` | Get supplier details |
| `create_purchase_return()` | Create return header |
| `get_invoice_item_returnable()` | Get returnable qty from invoice item |
| `get_grn_item_returnable()` | Get returnable qty from GRN item |
| `insert_return_item()` | Insert return line item |
| `update_batch_stock_for_return()` | Update batch stock on return |

### Purchase Return Flow

```
Supplier Invoice/GRN
        │
        ▼
┌───────────────────┐
│  Get Returnable   │
│      Items        │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Create Return    │
│    + Debit Note   │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│  Update Stock     │
│   (Reduce Qty)    │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Record Movement   │
│ (PURCHASE_RETURN) │
└───────────────────┘
```

---

## Sales Return (via ReturnService)

**Used By:** `returns/sales/routes.py`

**Description:** Sales return handling uses `ReturnService` combined with `InvoiceService` and `InventoryService`.

### Flow

```
Sales Invoice
      │
      ▼
┌───────────────────┐
│  Get Returnable   │
│      Items        │
└───────────────────┘
      │
      ▼
┌───────────────────┐
│  Create Return    │
│  + Credit Note    │
└───────────────────┘
      │
      ▼
┌───────────────────┐
│  Update Stock     │
│  (Add Back Qty)   │
└───────────────────┘
      │
      ▼
┌───────────────────┐
│ Record Movement   │
│   (RETURN_IN)     │
└───────────────────┘
```

---

## Usage Examples

### PurchaseReturnService - Get Returnable Items

```python
from app.api.services.returns.purchase_return.service import PurchaseReturnService

# Get items from supplier invoice that can be returned
items = PurchaseReturnService.get_returnable_items_from_invoice(
    db=db,
    invoice_id=supplier_invoice_id
)

# Each item includes:
# - invoice_quantity
# - already_returned
# - returnable_quantity (invoice_qty - already_returned)
```

### PurchaseReturnService - Create Return

```python
from app.api.services.returns.purchase_return.service import PurchaseReturnService

return_id = PurchaseReturnService.create_purchase_return(db, {
    "org_id": str(context.org_id),
    "branch_id": branch_id,
    "return_number": "PR/2024/00001",
    "return_date": str(date.today()),
    "supplier_invoice_id": invoice_id,
    "supplier_id": supplier_id,
    "return_reason": "Quality Issue",
    "return_amount": Decimal("5000.00"),
    "tax_amount": Decimal("600.00"),
    "total_amount": Decimal("5600.00"),
    "created_by": context.user_id
})
```

### ReturnService - Calculate Return Value

```python
from app.api.services.returns.return_service import ReturnService

return_calc = ReturnService.calculate_return_value(
    return_qty=Decimal("10"),
    unit_price=Decimal("100.00"),
    discount_percent=Decimal("5"),
    tax_percent=Decimal("12")
)
# Returns: {"return_value": 950.00, "tax_amount": 114.00, "total": 1064.00}
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `procurement.purchase_returns` | Return headers | PurchaseReturnService | Purchase return master |
| `procurement.purchase_return_items` | Return lines | PurchaseReturnService | Return line items |
| `sales.sales_returns` | Return headers | ReturnService (sales) | Sales return master |
| `sales.sales_return_items` | Return lines | ReturnService (sales) | Return line items |
| `procurement.supplier_invoice_items` | - | PurchaseReturnService | Update quantity_returned |
| `procurement.grn_items` | - | PurchaseReturnService | Update quantity_returned |

---

## Dependencies

```
ReturnService
├── Uses: Sales and purchase return tables
├── Uses: inventory.batches (stock updates)
├── Depends on: GSTService (tax calculations)
└── Depends on: InventoryService (stock movements)

PurchaseReturnService
├── Uses: procurement.purchase_returns, procurement.purchase_return_items
├── Uses: procurement.supplier_invoices, procurement.grn_items
├── Depends on: ReturnService (calculations)
├── Depends on: DocumentNumberService
├── Depends on: InventoryService (record movement)
└── Depends on: GSTService (tax split)
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `INVOICE_NOT_FOUND` | 404 | Source invoice not found | Verify invoice_id |
| `EXCEEDS_RETURNABLE` | 400 | Return qty > returnable qty | Reduce quantity |
| `ALREADY_RETURNED` | 400 | Item fully returned already | No more qty available |
| `INVALID_RETURN_REASON` | 400 | Unknown return reason | Use valid reason |
| `RETURN_NOT_FOUND` | 404 | Return ID not found | Verify return_id |
| `RETURN_ALREADY_PROCESSED` | 400 | Return already processed | Cannot modify |
| `NO_ITEMS_SELECTED` | 400 | No items selected for return | Select at least one item |
| `BATCH_NOT_FOUND` | 404 | Batch for return not found | Verify batch exists |

