# Sales Services

Services for sales operations including orders, invoices, delivery challans, and document conversions.

---

## InvoiceService

**Location:** `backend/app/api/services/sales/invoice/invoice_service.py`

**Used By:** `sales/invoices/routes.py`, `sales/conversions/routes.py`

**Description:** Complete invoice lifecycle management from creation to payment tracking.

### Methods

| Method | Description |
|--------|-------------|
| `create_invoice()` | Create new sales invoice |
| `get_invoice()` | Get invoice with items |
| `list_invoices()` | List invoices with filters |
| `update_invoice()` | Update invoice details |
| `cancel_invoice()` | Cancel/void invoice |
| `get_invoice_items()` | Get line items |
| `calculate_totals()` | Calculate invoice totals |
| `update_payment_status()` | Update based on payments |
| `generate_invoice_number()` | Generate unique number |

### Repository Methods

Located in `invoice_repository.py`:

| Method | Description |
|--------|-------------|
| `insert_invoice()` | Insert invoice record |
| `insert_invoice_item()` | Insert line item |
| `get_by_id()` | Fetch by invoice_id |
| `get_by_number()` | Fetch by invoice_number |

---

## OrderService

**Location:** `backend/app/api/services/sales/order/order_service.py`

**Used By:** `sales/orders/routes.py`

**Description:** Sales order management from quotation to fulfillment.

### Methods

| Method | Description |
|--------|-------------|
| `create_order()` | Create new sales order |
| `get_order()` | Get order with items |
| `list_orders()` | List orders with filters |
| `update_order()` | Update order details |
| `update_order_status()` | Change order status |
| `cancel_order()` | Cancel order |
| `get_order_items()` | Get line items |
| `confirm_order()` | Confirm order for processing |
| `get_pending_orders()` | Orders pending dispatch |

---

## ChallanService

**Location:** `backend/app/api/services/sales/challan/service.py`

**Used By:** `sales/challans/routes.py`

**Description:** Delivery challan management for goods dispatch and tracking.

### Methods (20 total)

| Method | Description |
|--------|-------------|
| `get_next_challan_sequence()` | Get next challan number sequence |
| `get_branch_id()` | Get branch for challan |
| `get_order_with_customer()` | Get order details with customer |
| `get_customer_name()` | Get customer name |
| `create_challan()` | Create delivery challan |
| `get_existing_order_items()` | Get order items for challan |
| `check_order_item_exists()` | Validate order item |
| `create_challan_item()` | Create challan line item |
| `update_challan_amounts()` | Fix amounts after trigger |
| `get_challan_amounts()` | Verify stored amounts |
| `list_challans()` | List challans with filters |
| `get_challan_with_customer()` | Get challan with customer info |
| `get_challan_items()` | Get challan line items |
| `dispatch_challan()` | Mark as dispatched |
| `update_order_delivery_status_from_challan()` | Update order status |
| `deliver_challan()` | Mark as delivered |
| `update_order_delivered()` | Mark order delivered |
| `check_challan_exists()` | Validate challan exists |
| `get_challan_analytics()` | Get delivery analytics |
| `get_delivery_by_city()` | City-wise delivery stats |

---

## ConversionService

**Location:** `backend/app/api/services/sales/conversion/service.py`

**Used By:** `sales/conversions/routes.py`

**Description:** Document conversion between sales order, challan, and invoice.

### Methods (18 total)

| Method | Description |
|--------|-------------|
| `get_order_for_conversion()` | Get order with customer for conversion |
| `check_order_invoiced()` | Check if order already has invoice |
| `get_org_state()` | Get org state for GST type |
| `create_invoice()` | Create invoice from order |
| `copy_order_items_to_invoice()` | Copy items with GST split |
| `update_order_status()` | Update order after conversion |
| `get_next_challan_sequence()` | Get next challan sequence |
| `create_challan()` | Create challan from order |
| `copy_order_items_to_challan()` | Copy order items to challan |
| `get_challans_for_conversion()` | Get challans for bulk conversion |
| `get_customer_details()` | Get customer for invoice |
| `get_challan_items()` | Get items from multiple challans |
| `create_invoice_simple()` | Create invoice (simplified) |
| `insert_invoice_item()` | Insert single invoice item |
| `mark_challans_invoiced()` | Mark challans as invoiced |
| `get_eligible_challans()` | Get deliverd uninvoiced challans |

### Conversion Flows

```
Sales Order ──┬──▶ Invoice (SO→INV)
              │
              └──▶ Challan ──▶ Invoice (SO→DC→INV)

Multiple Challans ──▶ Single Invoice (Bulk DC→INV)
```

---

## Usage Examples

### InvoiceService - Create Invoice

```python
from app.api.services.sales.invoice.invoice_service import InvoiceService

invoice_id = InvoiceService.create_invoice(
    db=db,
    org_id=str(context.org_id),
    invoice_data={
        "customer_id": customer_id,
        "invoice_date": date.today(),
        "items": [
            {"product_id": 1, "quantity": 10, "unit_price": Decimal("100.00")},
            {"product_id": 2, "quantity": 5, "unit_price": Decimal("200.00")}
        ]
    },
    created_by=context.user_id
)
db.commit()
```

### ChallanService - Create Delivery Challan

```python
from app.api.services.sales.challan.service import ChallanService

challan_id = ChallanService.create_challan(db, {
    "org_id": str(context.org_id),
    "customer_id": customer_id,
    "order_id": order_id,  # Optional
    "challan_number": "DC20240106001",
    "challan_date": date.today(),
    "total_amount": Decimal("15000.00"),
    "created_by": context.user_id
})
```

### ConversionService - Order to Invoice

```python
from app.api.services.sales.conversion.service import ConversionService

# Get order for conversion
order = ConversionService.get_order_for_conversion(db, org_id, order_id)

# Check not already invoiced
if ConversionService.check_order_invoiced(db, org_id, order_id):
    raise HTTPException(status_code=400, detail="Already invoiced")

# Create invoice and copy items
invoice_id = ConversionService.create_invoice(db, invoice_data)
ConversionService.copy_order_items_to_invoice(db, invoice_id, order_id, is_interstate=False)
ConversionService.update_order_status(db, order_id, "invoiced")
db.commit()
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `sales.orders` | Order headers | OrderService | Sales order master |
| `sales.order_items` | Order lines | OrderService | Order line items |
| `sales.invoices` | Invoice headers | InvoiceService | Sales invoice master |
| `sales.invoice_items` | Invoice lines | InvoiceService | Invoice line items |
| `sales.delivery_challans` | Challan headers | ChallanService | Delivery challan master |
| `sales.delivery_challan_items` | Challan lines | ChallanService | Challan line items |

---

## Dependencies

```
InvoiceService
├── Uses: sales.invoices, sales.invoice_items
├── Uses: parties.customers, inventory.products
├── Depends on: DocumentNumberService
├── Depends on: GSTService (tax calculation)
└── Depends on: InventoryService (stock deduction)

OrderService
├── Uses: sales.orders, sales.order_items
├── Uses: parties.customers, inventory.products
└── Depends on: DocumentNumberService

ChallanService
├── Uses: sales.delivery_challans, sales.delivery_challan_items
├── Uses: sales.orders (optional)
└── Depends on: DocumentNumberService

ConversionService
├── Uses: sales.orders, sales.invoices, sales.delivery_challans
├── Depends on: InvoiceService (creates invoices)
├── Depends on: ChallanService (creates challans)
└── Depends on: DocumentNumberService
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `ORDER_NOT_FOUND` | 404 | Order ID doesn't exist | Verify order_id |
| `CUSTOMER_NOT_FOUND` | 404 | Customer ID doesn't exist | Verify customer_id |
| `ALREADY_INVOICED` | 400 | Order already has invoice | Check existing invoices |
| `ALREADY_DELIVERED` | 400 | Challan already delivered | Cannot modify |
| `INVALID_ORDER_STATUS` | 400 | Order not in convertible status | Must be approved/confirmed |
| `CHALLAN_NOT_DELIVERED` | 400 | Challan must be delivered first | Mark as delivered |
| `MIXED_CUSTOMERS` | 400 | Bulk conversion has different customers | All challans must be same customer |
| `INSUFFICIENT_STOCK` | 400 | Not enough stock for invoice | Check batch availability |
| `DUPLICATE_INVOICE_NUMBER` | 409 | Invoice number already exists | System will auto-generate |

