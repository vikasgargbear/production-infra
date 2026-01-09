# Purchase API

Complete API reference for procurement operations including purchase orders, GRN, and supplier invoices.

---

## Overview

The Purchase API enables management of the complete procure-to-pay cycle from purchase orders through goods receipt and supplier invoice processing.

### Base Path

```
/api/purchase
```

### Sub-modules

| Module | Path | Description |
|--------|------|-------------|
| [Purchase Orders](#purchase-orders) | `/orders` | PO management |
| [GRN](#goods-receipt-notes-grn) | `/grn` | Goods receipt |
| [Supplier Invoices](#supplier-invoices) | `/supplier-invoices` | AP invoices |

---

# Purchase Orders

Purchase order creation and management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/orders` | Create purchase order |
| `GET` | `/orders` | List purchase orders |
| `GET` | `/orders/{po_id}` | Get PO by ID |
| `PUT` | `/orders/{po_id}` | Update draft PO |
| `POST` | `/orders/{po_id}/approve` | Approve PO |
| `POST` | `/orders/{po_id}/send` | Send to supplier |
| `POST` | `/orders/{po_id}/cancel` | Cancel PO |

---

## Create Purchase Order

Creates a new purchase order.

```http
POST /api/purchase/orders
```

### Request Body

```json
{
  "po_date": "2026-01-08",
  "supplier_id": 50,
  "expected_delivery_date": "2026-01-15",
  "payment_terms": "credit_30",
  "items": [
    {
      "product_id": 456,
      "quantity": 100,
      "uom": "STRIP",
      "pack_type": "strip",
      "unit_price": 35.00,
      "discount_percent": 10.0
    }
  ],
  "notes": "Urgent requirement"
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `po_date` | date | Yes | PO date |
| `supplier_id` | integer | Yes | Supplier ID |
| `expected_delivery_date` | date | No | Expected delivery |
| `payment_terms` | string | No | Payment terms |
| `items` | array | Yes | Line items |
| `items[].product_id` | integer | Yes | Product ID |
| `items[].quantity` | number | Yes | Order quantity |
| `items[].unit_price` | number | Yes | Purchase price |
| `items[].discount_percent` | number | No | Line discount |

### Response

```json
{
  "success": true,
  "data": {
    "purchase_order_id": 201,
    "po_number": "PO-2026-0001",
    "po_date": "2026-01-08",
    "supplier_id": 50,
    "supplier_name": "XYZ Distributors",
    "subtotal_amount": 3500.00,
    "discount_amount": 350.00,
    "taxable_amount": 3150.00,
    "tax_amount": 378.00,
    "total_amount": 3528.00,
    "po_status": "draft",
    "approval_status": "pending",
    "receipt_status": "pending",
    "items_count": 1,
    "created_at": "2026-01-08T10:00:00Z"
  }
}
```

### Example

```bash
curl -X POST https://api.yourdomain.com/api/purchase/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "po_date": "2026-01-08",
    "supplier_id": 50,
    "items": [
      {
        "product_id": 456,
        "quantity": 100,
        "uom": "STRIP",
        "pack_type": "strip",
        "unit_price": 35.00
      }
    ]
  }'
```

---

## List Purchase Orders

Retrieves paginated list of purchase orders.

```http
GET /api/purchase/orders
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Results per page |
| `offset` | integer | 0 | Records to skip |
| `supplier_id` | integer | — | Filter by supplier |
| `status` | string | — | `draft`, `approved`, `partial`, `complete`, `cancelled` |
| `date_from` | date | — | Start date |
| `date_to` | date | — | End date |

### Response

```json
{
  "success": true,
  "data": [
    {
      "purchase_order_id": 201,
      "po_number": "PO-2026-0001",
      "po_date": "2026-01-08",
      "supplier_name": "XYZ Distributors",
      "total_amount": 3528.00,
      "po_status": "approved",
      "receipt_status": "pending"
    }
  ],
  "total": 45,
  "limit": 50,
  "offset": 0
}
```

---

## PO Status Flow

```
draft → pending_approval → approved → partial_receipt → complete
  ↓           ↓               ↓
cancelled  rejected       cancelled
```

---

# Goods Receipt Notes (GRN)

Record goods received from suppliers.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/grn` | Create GRN |
| `GET` | `/grn` | List GRNs |
| `GET` | `/grn/{grn_id}` | Get GRN by ID |
| `PUT` | `/grn/{grn_id}` | Update draft GRN |
| `POST` | `/grn/{grn_id}/approve` | Approve GRN |
| `POST` | `/grn/{grn_id}/reject` | Reject GRN |

---

## Create GRN

Creates a goods receipt note, optionally linked to a purchase order.

```http
POST /api/purchase/grn
```

### Request Body

```json
{
  "grn_date": "2026-01-15",
  "supplier_id": 50,
  "purchase_order_id": 201,
  "supplier_invoice_number": "SI-12345",
  "supplier_invoice_date": "2026-01-14",
  "items": [
    {
      "product_id": 456,
      "batch_number": "B2026001",
      "manufacturing_date": "2025-12-01",
      "expiry_date": "2027-11-30",
      "received_quantity": 100,
      "accepted_quantity": 98,
      "rejected_quantity": 2,
      "uom": "STRIP",
      "pack_type": "strip",
      "pack_size": 10,
      "unit_price": 35.00,
      "mrp": 50.00,
      "ptr": 42.00,
      "pts": 45.00
    }
  ]
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grn_date` | date | Yes | Receipt date |
| `supplier_id` | integer | Yes | Supplier ID |
| `purchase_order_id` | integer | No | Link to PO |
| `supplier_invoice_number` | string | No | Supplier's invoice # |
| `items` | array | Yes | Received items |
| `items[].batch_number` | string | Yes | Batch number |
| `items[].expiry_date` | date | Yes | Expiry date |
| `items[].received_quantity` | number | Yes | Qty received |
| `items[].accepted_quantity` | number | Yes | Qty accepted (QC passed) |
| `items[].rejected_quantity` | number | No | Qty rejected |
| `items[].mrp` | number | Yes | MRP per unit |
| `items[].ptr` | number | No | PTR (Price to Retailer) |
| `items[].pts` | number | No | PTS (Price to Stockist) |

### Response

```json
{
  "success": true,
  "data": {
    "grn_id": 301,
    "grn_number": "GRN-2026-0001",
    "grn_date": "2026-01-15",
    "supplier_name": "XYZ Distributors",
    "purchase_order_id": 201,
    "grn_status": "draft",
    "total_amount": 3430.00,
    "items_count": 1,
    "items_received": 100,
    "items_accepted": 98,
    "items_rejected": 2,
    "created_at": "2026-01-15T09:00:00Z"
  }
}
```

> **Note**: Approving a GRN creates inventory batches automatically.

---

## Approve GRN

Approves GRN and creates inventory batches.

```http
POST /api/purchase/grn/{grn_id}/approve
```

### Response

```json
{
  "success": true,
  "data": {
    "grn_id": 301,
    "grn_status": "approved",
    "stock_updated": true,
    "batches_created": [
      {
        "batch_id": 1001,
        "product_id": 456,
        "batch_number": "B2026001",
        "quantity_available": 98
      }
    ],
    "approved_at": "2026-01-15T10:00:00Z"
  }
}
```

---

# Supplier Invoices

Manage supplier invoices for accounts payable.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/supplier-invoices` | Create supplier invoice |
| `GET` | `/supplier-invoices` | List supplier invoices |
| `GET` | `/supplier-invoices/{id}` | Get invoice by ID |
| `POST` | `/supplier-invoices/{id}/verify` | Verify invoice |
| `POST` | `/supplier-invoices/{id}/approve` | Approve for payment |

---

## Create Supplier Invoice

Creates a supplier invoice linked to GRNs.

```http
POST /api/purchase/supplier-invoices
```

### Request Body

```json
{
  "supplier_invoice_number": "SI-12345",
  "invoice_date": "2026-01-14",
  "supplier_id": 50,
  "grn_ids": [301],
  "due_date": "2026-02-13",
  "items": [
    {
      "product_id": 456,
      "batch_id": 1001,
      "quantity": 98,
      "unit_price": 35.00,
      "discount_percent": 10.0,
      "cgst_percent": 6.0,
      "sgst_percent": 6.0
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "supplier_invoice_id": 401,
    "supplier_invoice_number": "SI-12345",
    "invoice_date": "2026-01-14",
    "supplier_name": "XYZ Distributors",
    "invoice_total": 3430.00,
    "payment_status": "unpaid",
    "due_date": "2026-02-13"
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `SUPPLIER_NOT_FOUND` | Supplier ID does not exist |
| `PO_NOT_FOUND` | Purchase order not found |
| `GRN_NOT_FOUND` | GRN not found |
| `PO_ALREADY_COMPLETE` | PO already fully received |
| `QUANTITY_EXCEEDS_ORDERED` | Received qty exceeds order |
| `BATCH_ALREADY_EXISTS` | Batch number already exists |
| `DUPLICATE_INVOICE` | Supplier invoice already exists |

---

## See Also

- [Procurement Schema](../../database/schemas/procurement.md)
- [Purchase Services](../../services/purchase/)
- [Inventory API](../inventory/)

---

**Next**: [Inventory API](../inventory/) · [Finance API](../finance/)
