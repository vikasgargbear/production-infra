# Sales API

Complete API reference for sales operations including orders, invoices, and challans.

---

## Overview

The Sales API enables you to manage the complete sales workflow from order creation through invoicing and delivery.

### Base Path

```
/api/sales
```

### Sub-modules

| Module | Path | Description |
|--------|------|-------------|
| [Invoices](#invoices) | `/invoices` | Sales invoice management |
| [Orders](#orders) | `/orders` | Sales order management |
| [Challans](#challans) | `/challans` | Delivery challan management |
| [Customers](#customers) | `/customers` | Customer operations |

---

# Invoices

Sales invoice creation, retrieval, and management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/invoices` | Create a new invoice |
| `GET` | `/invoices` | List invoices |
| `GET` | `/invoices/{invoice_id}` | Get invoice by ID |
| `PUT` | `/invoices/{invoice_id}` | Update draft invoice |
| `POST` | `/invoices/{invoice_id}/cancel` | Cancel an invoice |
| `GET` | `/invoices/generate-number` | Generate next invoice number |

---

## Create Invoice

Creates a new sales invoice.

```http
POST /api/sales/invoices
```

### Request Body

```json
{
  "invoice_number": "INV-2026-0001",
  "invoice_date": "2026-01-08",
  "customer_id": 123,
  "payment_terms": "credit_30",
  "items": [
    {
      "product_id": 456,
      "batch_id": 789,
      "quantity": 10,
      "uom": "STRIP",
      "pack_type": "strip",
      "unit_price": 45.50,
      "discount_percent": 5.0,
      "cgst_rate": 6.0,
      "sgst_rate": 6.0
    }
  ],
  "notes": "Urgent delivery required"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `invoice_number` | string | Yes | Unique invoice number |
| `invoice_date` | date | Yes | Invoice date (YYYY-MM-DD) |
| `customer_id` | integer | Yes | Customer ID |
| `payment_terms` | string | No | `cash`, `credit_15`, `credit_30`, `credit_45`, `credit_60` |
| `items` | array | Yes | Line items (at least 1) |
| `items[].product_id` | integer | Yes | Product ID |
| `items[].batch_id` | integer | Yes | Batch ID |
| `items[].quantity` | number | Yes | Quantity to invoice |
| `items[].uom` | string | Yes | Unit: `PC`, `STRIP`, `BOX` |
| `items[].pack_type` | string | Yes | Pack type: `strip`, `box`, `unit` |
| `items[].unit_price` | number | Yes | Price per unit |
| `items[].discount_percent` | number | No | Line discount (0-100) |
| `items[].cgst_rate` | number | No | CGST rate (%) |
| `items[].sgst_rate` | number | No | SGST rate (%) |
| `items[].igst_rate` | number | No | IGST rate (%, for inter-state) |
| `notes` | string | No | Invoice notes |

### Response

```json
{
  "success": true,
  "data": {
    "invoice_id": 1001,
    "invoice_number": "INV-2026-0001",
    "invoice_date": "2026-01-08",
    "customer_id": 123,
    "customer_name": "ABC Pharmacy",
    "subtotal_amount": 432.25,
    "discount_amount": 21.61,
    "taxable_amount": 410.64,
    "cgst_amount": 24.64,
    "sgst_amount": 24.64,
    "total_amount": 459.92,
    "invoice_status": "generated",
    "payment_status": "unpaid",
    "balance_due": 459.92,
    "items_count": 1,
    "created_at": "2026-01-08T10:30:00Z"
  }
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `invoice_id` | integer | Unique invoice ID |
| `invoice_number` | string | Invoice number |
| `invoice_status` | string | `draft`, `generated`, `issued`, `cancelled` |
| `payment_status` | string | `unpaid`, `partial`, `paid` |
| `balance_due` | number | Remaining amount to collect |

### Example

```bash
curl -X POST https://api.yourdomain.com/api/sales/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_number": "INV-2026-0001",
    "invoice_date": "2026-01-08",
    "customer_id": 123,
    "items": [
      {
        "product_id": 456,
        "batch_id": 789,
        "quantity": 10,
        "uom": "STRIP",
        "pack_type": "strip",
        "unit_price": 45.50
      }
    ]
  }'
```

### Errors

| Code | Description |
|------|-------------|
| `CUSTOMER_NOT_FOUND` | Customer ID does not exist |
| `PRODUCT_NOT_FOUND` | Product ID does not exist |
| `BATCH_NOT_FOUND` | Batch ID does not exist |
| `INSUFFICIENT_STOCK` | Not enough stock in batch |
| `CREDIT_LIMIT_EXCEEDED` | Customer credit limit exceeded |
| `DUPLICATE_INVOICE_NUMBER` | Invoice number already exists |

---

## List Invoices

Retrieves a paginated list of invoices.

```http
GET /api/sales/invoices
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Results per page (max 200) |
| `offset` | integer | 0 | Number of records to skip |
| `customer_id` | integer | — | Filter by customer |
| `status` | string | — | Filter: `draft`, `generated`, `issued`, `cancelled` |
| `payment_status` | string | — | Filter: `unpaid`, `partial`, `paid` |
| `date_from` | date | — | Start date (YYYY-MM-DD) |
| `date_to` | date | — | End date (YYYY-MM-DD) |
| `search` | string | — | Search invoice number or customer name |

### Response

```json
{
  "success": true,
  "data": [
    {
      "invoice_id": 1001,
      "invoice_number": "INV-2026-0001",
      "invoice_date": "2026-01-08",
      "customer_name": "ABC Pharmacy",
      "total_amount": 459.92,
      "paid_amount": 0,
      "balance_due": 459.92,
      "invoice_status": "generated",
      "payment_status": "unpaid"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

### Example

```bash
curl "https://api.yourdomain.com/api/sales/invoices?limit=20&status=unpaid&date_from=2026-01-01" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Get Invoice

Retrieves a single invoice with all details.

```http
GET /api/sales/invoices/{invoice_id}
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `invoice_id` | integer | Invoice ID |

### Response

```json
{
  "success": true,
  "data": {
    "invoice_id": 1001,
    "invoice_number": "INV-2026-0001",
    "invoice_date": "2026-01-08",
    "customer": {
      "customer_id": 123,
      "customer_name": "ABC Pharmacy",
      "gstin": "29ABCDE1234F1Z5",
      "phone": "+91-9876543210"
    },
    "items": [
      {
        "invoice_item_id": 5001,
        "product_id": 456,
        "product_name": "Paracetamol 500mg",
        "batch_number": "B2025001",
        "expiry_date": "2027-06-30",
        "quantity": 10,
        "uom": "STRIP",
        "unit_price": 45.50,
        "discount_percent": 5.0,
        "discount_amount": 22.75,
        "taxable_amount": 432.25,
        "cgst_rate": 6.0,
        "cgst_amount": 25.94,
        "sgst_rate": 6.0,
        "sgst_amount": 25.94,
        "line_total": 484.13,
        "hsn_code": "30049099"
      }
    ],
    "subtotal_amount": 455.00,
    "discount_amount": 22.75,
    "taxable_amount": 432.25,
    "cgst_amount": 25.94,
    "sgst_amount": 25.94,
    "total_amount": 484.13,
    "paid_amount": 0,
    "balance_due": 484.13,
    "invoice_status": "generated",
    "payment_status": "unpaid",
    "notes": "Urgent delivery required",
    "created_at": "2026-01-08T10:30:00Z",
    "created_by": "John Doe"
  }
}
```

### Example

```bash
curl https://api.yourdomain.com/api/sales/invoices/1001 \
  -H "Authorization: Bearer $TOKEN"
```

---

## Cancel Invoice

Cancels an invoice. Draft invoices are simply marked cancelled. Posted invoices create reversal entries.

```http
POST /api/sales/invoices/{invoice_id}/cancel
```

### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `invoice_id` | integer | Invoice ID to cancel |

### Request Body

```json
{
  "reason": "Customer order cancelled"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "invoice_id": 1001,
    "invoice_status": "cancelled",
    "cancelled_at": "2026-01-08T15:00:00Z",
    "cancelled_by": "John Doe",
    "cancellation_reason": "Customer order cancelled"
  }
}
```

### Errors

| Code | Description |
|------|-------------|
| `INVOICE_NOT_FOUND` | Invoice does not exist |
| `INVOICE_HAS_PAYMENTS` | Cannot cancel invoice with payments |
| `INVOICE_ALREADY_CANCELLED` | Invoice already cancelled |

---

## Generate Invoice Number

Generates and reserves the next invoice number.

```http
GET /api/sales/invoices/generate-number
```

### Response

```json
{
  "success": true,
  "data": {
    "invoice_number": "INV-2026-0002"
  }
}
```

---

# Orders

Sales order management before invoicing.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Create sales order |
| `GET` | `/orders` | List orders |
| `GET` | `/orders/{order_id}` | Get order by ID |
| `PUT` | `/orders/{order_id}` | Update order |
| `POST` | `/orders/{order_id}/confirm` | Confirm order |
| `POST` | `/orders/{order_id}/convert` | Convert to invoice |
| `POST` | `/orders/{order_id}/cancel` | Cancel order |

---

## Create Order

Creates a new sales order.

```http
POST /api/sales/orders
```

### Request Body

```json
{
  "order_date": "2026-01-08",
  "customer_id": 123,
  "delivery_date": "2026-01-10",
  "items": [
    {
      "product_id": 456,
      "quantity": 10,
      "unit_price": 45.50
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "order_id": 501,
    "order_number": "SO-2026-0001",
    "order_status": "draft",
    "total_amount": 455.00
  }
}
```

---

## Order Status Flow

```
draft → pending → confirmed → invoiced
  ↓                   ↓
cancelled         cancelled
```

| Status | Description |
|--------|-------------|
| `draft` | Order being created |
| `pending` | Awaiting confirmation |
| `confirmed` | Ready for invoicing |
| `invoiced` | Converted to invoice |
| `cancelled` | Order cancelled |

---

# Challans

Delivery challan management for goods dispatch.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/challans` | Create delivery challan |
| `GET` | `/challans` | List challans |
| `GET` | `/challans/{challan_id}` | Get challan by ID |
| `POST` | `/challans/{challan_id}/dispatch` | Mark as dispatched |
| `POST` | `/challans/{challan_id}/deliver` | Record delivery |

---

## Create Challan

Creates a delivery challan from an order or invoice.

```http
POST /api/sales/challans
```

### Request Body

```json
{
  "challan_date": "2026-01-08",
  "customer_id": 123,
  "order_id": 501,
  "items": [
    {
      "product_id": 456,
      "batch_id": 789,
      "quantity": 10
    }
  ]
}
```

---

## Record Delivery

Records proof of delivery (POD).

```http
POST /api/sales/challans/{challan_id}/deliver
```

### Request Body

```json
{
  "delivered_date": "2026-01-08",
  "delivered_time": "14:30",
  "received_by_name": "Ramesh Kumar",
  "received_by_designation": "Store Manager",
  "delivery_notes": "Received in good condition",
  "signature_image": "base64_encoded_signature..."
}
```

---

## Challan Status Flow

```
draft → dispatched → delivered
  ↓
cancelled
```

---

## See Also

- [Invoice Schema](../../database/schemas/sales.md#salesinvoices)
- [Sales Services](../../services/sales/)
- [Error Codes](../errors.md)

---

**Next**: [Purchase API](../purchase/) · [Inventory API](../inventory/)
