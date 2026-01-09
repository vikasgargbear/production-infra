# Returns API

Complete API reference for sales and purchase returns.

---

## Overview

The Returns API manages customer returns (sales returns) and supplier returns (purchase returns).

### Base Path

```
/api/returns
```

### Sub-modules

| Module | Path | Description |
|--------|------|-------------|
| [Sales Returns](#sales-returns) | `/sales` | Customer returns |
| [Purchase Returns](#purchase-returns) | `/purchase` | Supplier returns |

---

# Sales Returns

Handle customer returns and credit note generation.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/sales` | Create sales return |
| `GET` | `/sales` | List sales returns |
| `GET` | `/sales/{return_id}` | Get return by ID |
| `POST` | `/sales/{return_id}/approve` | Approve return |
| `GET` | `/sales/returnable-invoices` | Get invoices for return |

---

## Create Sales Return

Creates a sales return request.

```http
POST /api/returns/sales
```

### Request Body

```json
{
  "return_date": "2026-01-08",
  "customer_id": 123,
  "invoice_id": 1001,
  "return_reason": "near_expiry",
  "items": [
    {
      "invoice_item_id": 5001,
      "product_id": 456,
      "batch_id": 1001,
      "return_quantity": 5,
      "damaged_quantity": 1,
      "saleable_quantity": 4,
      "item_return_reason": "Short expiry - 2 months remaining"
    }
  ],
  "notes": "Customer requested return for expiry concern"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `return_date` | date | Yes | Return date |
| `customer_id` | integer | Yes | Customer ID |
| `invoice_id` | integer | No | Original invoice |
| `return_reason` | string | Yes | `expired`, `near_expiry`, `damaged`, `wrong_product`, `quality_issue` |
| `items` | array | Yes | Return items |
| `items[].return_quantity` | number | Yes | Quantity to return |
| `items[].damaged_quantity` | number | No | Damaged (non-saleable) |
| `items[].saleable_quantity` | number | No | Can be resold |

### Response

```json
{
  "success": true,
  "data": {
    "return_id": 101,
    "return_number": "SR-2026-0001",
    "return_date": "2026-01-08",
    "customer_name": "ABC Pharmacy",
    "invoice_number": "INV-2026-0001",
    "return_reason": "near_expiry",
    "return_amount": 227.50,
    "tax_amount": 27.30,
    "total_amount": 254.80,
    "approval_status": "pending",
    "created_at": "2026-01-08T14:00:00Z"
  }
}
```

---

## Approve Sales Return

Approves a return request and processes inventory/credit note.

```http
POST /api/returns/sales/{return_id}/approve
```

### Response

```json
{
  "success": true,
  "data": {
    "return_id": 101,
    "approval_status": "approved",
    "approved_at": "2026-01-08T15:00:00Z",
    "credit_note": {
      "credit_note_number": "CN-2026-0001",
      "credit_note_date": "2026-01-08",
      "total_amount": 254.80
    },
    "stock_added": [
      {
        "batch_id": 1001,
        "quantity_added": 4
      }
    ]
  }
}
```

---

## Get Returnable Invoices

Returns invoices eligible for return (not fully returned).

```http
GET /api/returns/sales/returnable-invoices
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `customer_id` | integer | Filter by customer |
| `date_from` | date | Invoice date from |

### Response

```json
{
  "success": true,
  "data": [
    {
      "invoice_id": 1001,
      "invoice_number": "INV-2026-0001",
      "invoice_date": "2026-01-05",
      "customer_name": "ABC Pharmacy",
      "total_amount": 5000.00,
      "returnable_items": [
        {
          "invoice_item_id": 5001,
          "product_name": "Paracetamol 500mg",
          "batch_number": "B2026001",
          "invoiced_quantity": 10,
          "returned_quantity": 0,
          "returnable_quantity": 10
        }
      ]
    }
  ]
}
```

---

# Purchase Returns

Handle returns to suppliers.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/purchase` | Create purchase return |
| `GET` | `/purchase` | List purchase returns |
| `GET` | `/purchase/{return_id}` | Get return by ID |
| `POST` | `/purchase/{return_id}/approve` | Approve return |
| `POST` | `/purchase/{return_id}/dispatch` | Mark as dispatched |

---

## Create Purchase Return

Creates a return to supplier.

```http
POST /api/returns/purchase
```

### Request Body

```json
{
  "return_date": "2026-01-08",
  "supplier_id": 50,
  "grn_id": 301,
  "return_type": "quality_rejection",
  "return_reason": "Failed QC - contamination detected",
  "items": [
    {
      "grn_item_id": 3001,
      "product_id": 456,
      "batch_id": 1001,
      "return_quantity": 50
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "return_id": 201,
    "return_number": "PR-2026-0001",
    "return_date": "2026-01-08",
    "supplier_name": "XYZ Distributors",
    "return_type": "quality_rejection",
    "total_amount": 1750.00,
    "approval_status": "pending"
  }
}
```

---

## Return Types

### Sales Return Reasons

| Reason | Description |
|--------|-------------|
| `expired` | Product has expired |
| `near_expiry` | Short shelf life remaining |
| `damaged` | Damaged packaging/product |
| `wrong_product` | Incorrect product delivered |
| `quality_issue` | Quality defect |
| `excess_stock` | Overstocked by customer |

### Purchase Return Reasons

| Reason | Description |
|--------|-------------|
| `quality_rejection` | Failed QC inspection |
| `short_expiry` | Insufficient shelf life |
| `damaged_in_transit` | Transit damage |
| `wrong_product` | Incorrect product received |
| `excess_received` | Received more than ordered |
| `pricing_dispute` | Price mismatch |

---

## Status Flow

### Sales Return

```
created → pending_approval → approved → credit_note_issued
    ↓
 rejected
```

### Purchase Return

```
created → pending_approval → approved → dispatched → supplier_acknowledged
    ↓
 rejected
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `INVOICE_NOT_FOUND` | Invoice does not exist |
| `GRN_NOT_FOUND` | GRN does not exist |
| `ITEM_NOT_RETURNABLE` | Item cannot be returned |
| `QUANTITY_EXCEEDS_LIMIT` | Return qty exceeds available |
| `ALREADY_FULLY_RETURNED` | Item already fully returned |
| `RETURN_NOT_FOUND` | Return record not found |

---

## See Also

- [Sales Schema](../../database/schemas/sales.md#salessales_returns)
- [Returns Services](../../services/returns/)
- [Sales API](../sales/) · [Finance API](../finance/)

---

**Next**: [Auth API](../auth/) · [Error Reference](../errors.md)
