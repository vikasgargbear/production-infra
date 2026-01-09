# Inventory API

Complete API reference for inventory operations including stock, batches, and movements.

---

## Overview

The Inventory API provides access to product catalog, batch management, stock levels, and inventory movements.

### Base Path

```
/api/inventory
```

### Sub-modules

| Module | Path | Description |
|--------|------|-------------|
| [Products](#products) | `/products` | Product catalog |
| [Batches](#batches) | `/batches` | Batch/lot management |
| [Stock](#stock) | `/stock` | Stock levels |
| [Movements](#movements) | `/movements` | Stock movement history |

---

# Products

Product catalog management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/products` | Create product |
| `GET` | `/products` | List products |
| `GET` | `/products/{product_id}` | Get product by ID |
| `PUT` | `/products/{product_id}` | Update product |
| `GET` | `/products/search` | Search products |

---

## Create Product

Creates a new product in the catalog.

```http
POST /api/inventory/products
```

### Request Body

```json
{
  "product_code": "PARA500",
  "product_name": "Paracetamol 500mg",
  "generic_name": "Paracetamol",
  "manufacturer": "Sun Pharma",
  "category_id": 10,
  "product_type": "tablet",
  "hsn_code": "30049099",
  "gst_percent": 12.0,
  "reorder_level": 100,
  "min_stock_quantity": 50
}
```

### Response

```json
{
  "success": true,
  "data": {
    "product_id": 456,
    "product_code": "PARA500",
    "product_name": "Paracetamol 500mg",
    "is_active": true,
    "created_at": "2026-01-08T10:00:00Z"
  }
}
```

---

## Search Products

Fast product search for order/invoice entry.

```http
GET /api/inventory/products/search
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (name, code, generic) |
| `limit` | integer | Max results (default 10) |
| `category_id` | integer | Filter by category |
| `in_stock` | boolean | Only products with stock |

### Response

```json
{
  "success": true,
  "data": [
    {
      "product_id": 456,
      "product_code": "PARA500",
      "product_name": "Paracetamol 500mg",
      "manufacturer": "Sun Pharma",
      "available_stock": 500,
      "batches_count": 3
    }
  ]
}
```

### Example

```bash
curl "https://api.yourdomain.com/api/inventory/products/search?q=paracetamol&in_stock=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

# Batches

Batch and lot tracking with expiry management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/batches` | List batches |
| `GET` | `/batches/{batch_id}` | Get batch details |
| `GET` | `/batches/expiring` | Get expiring batches |
| `GET` | `/batches/by-product/{product_id}` | Batches for product |
| `PUT` | `/batches/{batch_id}` | Update batch |

---

## Get Batches for Product

Returns available batches for a product (FIFO ordered).

```http
GET /api/inventory/batches/by-product/{product_id}
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `in_stock` | boolean | Only batches with stock |
| `status` | string | `active`, `expired`, `recalled` |

### Response

```json
{
  "success": true,
  "data": [
    {
      "batch_id": 1001,
      "batch_number": "B2026001",
      "expiry_date": "2027-11-30",
      "quantity_available": 98,
      "quantity_reserved": 10,
      "mrp_per_unit": 50.00,
      "sale_price_per_unit": 45.00,
      "batch_status": "active",
      "expiry_status": "valid",
      "days_to_expiry": 692
    }
  ]
}
```

---

## Get Expiring Batches

Returns batches expiring within specified days.

```http
GET /api/inventory/batches/expiring
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | integer | 90 | Days until expiry |
| `limit` | integer | 50 | Max results |

### Response

```json
{
  "success": true,
  "data": [
    {
      "batch_id": 1005,
      "product_name": "Amoxicillin 250mg",
      "batch_number": "B2025050",
      "expiry_date": "2026-03-15",
      "days_to_expiry": 66,
      "quantity_available": 25,
      "stock_value": 875.00
    }
  ],
  "total": 15
}
```

---

# Stock

Real-time stock levels and availability.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stock` | Get stock summary |
| `GET` | `/stock/low` | Low stock alerts |
| `GET` | `/stock/by-product/{product_id}` | Stock for product |
| `GET` | `/stock/by-location/{location_id}` | Stock at location |
| `POST` | `/stock/adjust` | Manual adjustment |

---

## Get Stock Summary

Returns aggregate stock information.

```http
GET /api/inventory/stock
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `product_id` | integer | Filter by product |
| `category_id` | integer | Filter by category |
| `location_id` | integer | Filter by location |
| `status` | string | `in_stock`, `low`, `out` |

### Response

```json
{
  "success": true,
  "data": [
    {
      "product_id": 456,
      "product_name": "Paracetamol 500mg",
      "total_available": 500,
      "total_reserved": 50,
      "total_free": 450,
      "reorder_level": 100,
      "stock_status": "in_stock",
      "batches_count": 3,
      "earliest_expiry": "2027-06-30"
    }
  ]
}
```

---

## Low Stock Alerts

Returns products below reorder level.

```http
GET /api/inventory/stock/low
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "product_id": 789,
      "product_name": "Aspirin 100mg",
      "current_stock": 25,
      "reorder_level": 100,
      "min_stock": 50,
      "shortage": 75,
      "urgency": "critical",
      "preferred_supplier": "ABC Pharma",
      "last_purchase_price": 15.00
    }
  ],
  "total": 8
}
```

---

## Stock Adjustment

Manual stock adjustment (write-off, correction).

```http
POST /api/inventory/stock/adjust
```

### Request Body

```json
{
  "product_id": 456,
  "batch_id": 1001,
  "location_id": 1,
  "adjustment_type": "write_off",
  "quantity": -10,
  "reason": "Damaged goods",
  "reference_number": "WO-2026-001"
}
```

### Adjustment Types

| Type | Description |
|------|-------------|
| `write_off` | Remove damaged/expired stock |
| `correction` | Correct counting error |
| `opening` | Opening balance entry |

---

# Movements

Stock movement history and audit trail.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/movements` | List movements |
| `GET` | `/movements/{movement_id}` | Get movement details |
| `GET` | `/movements/by-product/{product_id}` | Movements for product |
| `GET` | `/movements/by-batch/{batch_id}` | Movements for batch |

---

## List Movements

Returns stock movement history.

```http
GET /api/inventory/movements
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `movement_type` | string | `grn`, `invoice`, `return`, `adjustment`, `transfer` |
| `direction` | string | `in`, `out` |
| `product_id` | integer | Filter by product |
| `date_from` | date | Start date |
| `date_to` | date | End date |

### Response

```json
{
  "success": true,
  "data": [
    {
      "movement_id": 5001,
      "movement_date": "2026-01-08T10:30:00Z",
      "movement_type": "invoice",
      "movement_direction": "out",
      "product_name": "Paracetamol 500mg",
      "batch_number": "B2026001",
      "quantity": 10,
      "reference_type": "invoice",
      "reference_number": "INV-2026-0001"
    }
  ],
  "total": 250
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `PRODUCT_NOT_FOUND` | Product does not exist |
| `BATCH_NOT_FOUND` | Batch does not exist |
| `INSUFFICIENT_STOCK` | Not enough available stock |
| `BATCH_EXPIRED` | Batch has expired |
| `BATCH_RECALLED` | Batch has been recalled |
| `LOCATION_NOT_FOUND` | Storage location not found |

---

## See Also

- [Inventory Schema](../../database/schemas/inventory.md)
- [Inventory Services](../../services/inventory/)
- [Sales API](../sales/) · [Purchase API](../purchase/)

---

**Next**: [Finance API](../finance/) · [Master API](../master/)
