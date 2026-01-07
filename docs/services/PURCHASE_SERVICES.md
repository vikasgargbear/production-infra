# Purchase Services

Services for procurement operations including purchase orders, GRN, supplier invoices, and PDF parsing.

---

## PurchaseOrderService

**Location:** `backend/app/api/services/purchase/order/order_service.py`

**Used By:** `purchase/orders/routes.py`

**Description:** Purchase order management from creation to receipt.

### Methods

| Method | Description |
|--------|-------------|
| `create_purchase_order()` | Create new PO |
| `get_purchase_order()` | Get PO with items |
| `list_purchase_orders()` | List POs with filters |
| `update_purchase_order()` | Update PO details |
| `approve_purchase_order()` | Approve PO |
| `cancel_purchase_order()` | Cancel PO |
| `get_pending_orders()` | POs pending receipt |
| `generate_po_number()` | Generate unique PO number |

---

## GRNService

**Location:** `backend/app/api/services/purchase/grn/grn_service.py`

**Used By:** `purchase/grn/routes.py`

**Description:** Goods Receipt Note management for inventory inward.

### Methods

| Method | Description |
|--------|-------------|
| `create_grn()` | Create new GRN |
| `get_grn()` | Get GRN with items |
| `list_grns()` | List GRNs with filters |
| `update_grn()` | Update GRN details |
| `approve_grn()` | Approve and update stock |
| `reject_grn()` | Reject GRN |
| `get_grn_items()` | Get line items |
| `get_po_items_for_grn()` | Get PO items for receipt |

---

## SupplierInvoiceService

**Location:** `backend/app/api/services/purchase/supplier_invoice/service.py`

**Used By:** `purchase/supplier_invoices/routes.py`

**Description:** Supplier invoice management and payment tracking.

### Methods (5 total)

| Method | Description |
|--------|-------------|
| `get_supplier_invoices()` | List invoices with filters |
| `get_returnable_invoices()` | Get invoices eligible for returns |
| `get_invoice_details()` | Get invoice with items |
| `get_invoice_items()` | Get line items |
| `get_invoice_for_return()` | Get invoice data for return creation |

### Repository Methods

Located in `supplier_invoice_repository.py`:

| Method | Description |
|--------|-------------|
| `insert_invoice()` | Insert supplier invoice |
| `insert_invoice_item()` | Insert line item |
| `update_payment_status()` | Update payment status |

---

## UploadService

**Location:** `backend/app/api/services/purchase/upload/service.py`

**Used By:** `purchase/upload/routes.py`

**Description:** PDF invoice parsing and purchase order creation from parsed data.

### Methods (12 total)

| Method | Description |
|--------|-------------|
| `get_supplier_by_gstin()` | Find supplier by GST number |
| `get_supplier_by_name()` | Find supplier by name (partial) |
| `get_supplier_by_name_fuzzy()` | Fuzzy name matching |
| `create_supplier()` | Create new supplier |
| `create_purchase_order()` | Create PO from parsed data |
| `create_product()` | Create new product |
| `create_purchase_order_item()` | Create PO line item |
| `get_product_by_name()` | Find product by name |
| `get_product_by_hsn()` | Find product by HSN code |
| `check_duplicate_invoice()` | Check for duplicate invoice |

### Integration Flow

```
PDF Upload ──▶ Parse (bill_parser) ──▶ Extract Data
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │ Match/Create  │
                                    │   Supplier    │
                                    └───────────────┘
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │ Match/Create  │
                                    │   Products    │
                                    └───────────────┘
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │    Create     │
                                    │ Purchase Order│
                                    └───────────────┘
```

---

## PurchaseService (Legacy)

**Location:** `backend/app/api/services/purchase/purchase_service.py`

**Used By:** Various legacy routes

**Description:** Legacy purchase service - being migrated to domain-specific services.

### Methods

| Method | Description |
|--------|-------------|
| `validate_supplier()` | Validate supplier exists |
| `validate_products()` | Validate product IDs |
| `calculate_totals()` | Calculate purchase totals |

---

## PurchaseCalculator

**Location:** `backend/app/api/services/purchase/calculations.py`

**Used By:** All purchase services

**Description:** Precise calculation utilities for purchase operations.

### Methods

| Method | Description |
|--------|-------------|
| `calculate_item_totals()` | Calculate line item totals |
| `calculate_gst()` | Calculate GST components |
| `calculate_discount()` | Calculate discount amounts |
| `round_currency()` | Round to 2 decimal places |

---

## Usage Examples

### UploadService - Check and Create Supplier

```python
from app.api.services.purchase.upload.service import UploadService

# Check if supplier exists
supplier = UploadService.get_supplier_by_gstin(db, "29AABCU9603R1ZM")

if not supplier:
    # Create new supplier
    supplier_id = UploadService.create_supplier(db, {
        "org_id": str(context.org_id),
        "code": "SUP20240106",
        "name": "ABC Pharma Ltd",
        "gstin": "29AABCU9603R1ZM",
        "address": "123 Industrial Area",
        "phone": "9876543210",
        "email": "abc@pharma.com",
        "drug_license": "DL-12345"
    })
```

### GRNService - Create GRN from PO

```python
from app.api.services.purchase.grn.grn_service import GRNService

grn_id = GRNService.create_grn(
    db=db,
    org_id=str(context.org_id),
    grn_data={
        "po_id": purchase_order_id,
        "supplier_id": supplier_id,
        "grn_date": date.today(),
        "items": received_items
    },
    created_by=context.user_id
)
db.commit()
```

### SupplierInvoiceService - Get Returnable Items

```python
from app.api.services.purchase.supplier_invoice.service import SupplierInvoiceService

# Get items that can be returned
items = SupplierInvoiceService.get_returnable_invoices(
    db=db,
    org_id=str(context.org_id),
    supplier_id=supplier_id
)
# Returns invoices with returnable quantity > 0
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `procurement.purchase_orders` | PO headers | PurchaseOrderService | Purchase order master |
| `procurement.purchase_order_items` | PO lines | PurchaseOrderService | PO line items |
| `procurement.goods_receipt_notes` | GRN headers | GRNService | GRN master |
| `procurement.grn_items` | GRN lines | GRNService | GRN line items |
| `procurement.supplier_invoices` | Invoice headers | SupplierInvoiceService | Supplier invoice master |
| `procurement.supplier_invoice_items` | Invoice lines | SupplierInvoiceService | Invoice line items |
| `parties.suppliers` | Supplier master | UploadService | Supplier records |

---

## Dependencies

```
PurchaseOrderService
├── Uses: procurement.purchase_orders, procurement.purchase_order_items
├── Uses: parties.suppliers, inventory.products
└── Depends on: DocumentNumberService

GRNService
├── Uses: procurement.goods_receipt_notes, procurement.grn_items
├── Uses: procurement.purchase_orders
├── Depends on: DocumentNumberService
├── Depends on: InventoryService (stock addition)
└── Depends on: ProductService (batch creation)

SupplierInvoiceService
├── Uses: procurement.supplier_invoices, procurement.supplier_invoice_items
├── Uses: procurement.goods_receipt_notes
└── Depends on: DocumentNumberService

UploadService
├── Uses: parties.suppliers, inventory.products
├── Uses: procurement.purchase_orders, procurement.purchase_order_items
├── Depends on: DocumentNumberService
└── Depends on: ProductService (create products)
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `PO_NOT_FOUND` | 404 | Purchase order not found | Verify PO ID |
| `SUPPLIER_NOT_FOUND` | 404 | Supplier doesn't exist | Create supplier first |
| `DUPLICATE_INVOICE` | 409 | Supplier invoice already exists | Check invoice number |
| `GRN_ALREADY_APPROVED` | 400 | GRN already approved | Cannot modify |
| `QUANTITY_EXCEEDS_PO` | 400 | Received qty > ordered qty | Verify quantities |
| `PRODUCT_NOT_FOUND` | 404 | Product doesn't exist | Create product or check ID |
| `INVALID_FILE_TYPE` | 400 | Not a PDF file | Upload PDF only |
| `PARSE_FAILED` | 422 | Could not extract data | Use manual entry |
| `INVALID_GSTIN` | 400 | Invalid GST number format | Verify GSTIN |

