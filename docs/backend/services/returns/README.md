# Returns Services

Services for sales and purchase returns processing.

**Code Location**: `app/api/services/returns/`

---

## Architecture

```mermaid
flowchart TB
    subgraph Routes["API Routes"]
        R1["/returns/sales"]
        R2["/returns/purchase"]
    end
    
    subgraph Services["Service Layer"]
        S1[SalesReturnService]
        S2[PurchaseReturnService]
    end
    
    subgraph DB["Database"]
        D1[(returns.sales_returns)]
        D2[(returns.purchase_returns)]
        D3[(inventory.batches)]
        D4[(financial.credit_notes)]
    end
    
    R1 --> S1 --> D1
    R2 --> S2 --> D2
    S1 --> D3
    S1 --> D4
    S2 --> D3
```

---

## Services

| Service | File | Description |
|---------|------|-------------|
| [SalesReturnService](sales-returns.md) | `sales_return_service.py` | Customer returns |
| [PurchaseReturnService](purchase-returns.md) | `purchase_return_service.py` | Supplier returns |

---

## SalesReturnService

**Location**: `app/api/services/returns/sales_return_service.py`

### Methods

| Method | Description |
|--------|-------------|
| `create_sales_return()` | Create return request |
| `get_sales_return()` | Get return with items |
| `list_sales_returns()` | List with filters |
| `approve_return()` | Approve and process |
| `get_returnable_invoices()` | Invoices for return |
| `create_credit_note()` | Generate credit note |

### Return Flow

```mermaid
flowchart LR
    Req[Return Request] --> Approve[Approve Return]
    Approve --> Stock[Add Back Stock]
    Stock --> CN[Create Credit Note]
    CN --> Ledger[Update Ledger]
```

---

## PurchaseReturnService

**Location**: `app/api/services/returns/purchase_return_service.py`

### Methods

| Method | Description |
|--------|-------------|
| `create_purchase_return()` | Create return to supplier |
| `get_purchase_return()` | Get return details |
| `list_purchase_returns()` | List with filters |
| `process_return()` | Process and update stock |

---

## Database Tables

| Table | Description |
|-------|-------------|
| `returns.sales_returns` | Sales return headers |
| `returns.sales_return_items` | Return line items |
| `returns.purchase_returns` | Purchase return headers |
| `returns.purchase_return_items` | Return line items |

---

## Dependencies

```
SalesReturnService
├── InventoryService (stock addition)
├── CreditNoteService
└── LedgerService

PurchaseReturnService
├── InventoryService (stock deduction)
└── SupplierInvoiceService
```

---

## Error Codes

| Error | HTTP | Description |
|-------|------|-------------|
| `INVOICE_NOT_FOUND` | 404 | Invoice doesn't exist |
| `ALREADY_RETURNED` | 400 | Already fully returned |
| `QUANTITY_EXCEEDS` | 400 | Return qty > invoice qty |
| `RETURN_NOT_FOUND` | 404 | Return doesn't exist |

---

**See also**: [Returns API](../../api/returns/) · [Returns Schema](../../database/schemas/returns.md)
