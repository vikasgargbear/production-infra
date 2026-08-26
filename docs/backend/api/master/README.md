# Master API

Complete API reference for master data operations including products, customers, and suppliers.

---

## Overview

The Master API provides access to core master data entities used across the system.

### Base Path

```
/api/master
```

### Sub-modules

| Module | Path | Description |
|--------|------|-------------|
| [Products](#products) | `/products` | Product master (alias) |
| [Customers](#customers) | `/customers` | Customer management |
| [Suppliers](#suppliers) | `/suppliers` | Supplier management |
| [Categories](#categories) | `/categories` | Product categories |

---

# Customers

Customer master data management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/customers` | Create customer |
| `GET` | `/customers` | List customers |
| `GET` | `/customers/{id}` | Get customer by ID |
| `PUT` | `/customers/{id}` | Update customer |
| `GET` | `/customers/search` | Search customers |
| `GET` | `/customers/{id}/outstanding` | Customer outstanding |

---

## Create Customer

Creates a new customer record.

```http
POST /api/master/customers
```

### Request Body

```json
{
  "customer_code": "CUST001",
  "customer_name": "ABC Pharmacy",
  "customer_type": "wholesale",
  "gstin": "29ABCDE1234F1Z5",
  "pan_number": "ABCDE1234F",
  "drug_license_number": "DL-20B-2024-001234",
  "primary_phone": "+91-9876543210",
  "email": "abc@pharmacy.com",
  "credit_limit": 100000.00,
  "credit_days": 30,
  "addresses": [
    {
      "address_type": "billing",
      "address_line1": "123 Main Street",
      "city": "Bangalore",
      "state_code": "KA",
      "pincode": "560001",
      "is_default": true
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "customer_id": 123,
    "customer_code": "CUST001",
    "customer_name": "ABC Pharmacy",
    "gstin": "29ABCDE1234F1Z5",
    "credit_limit": 100000.00,
    "outstanding_amount": 0,
    "is_active": true,
    "created_at": "2026-01-08T10:00:00Z"
  }
}
```

---

## Search Customers

Fast customer search for order/invoice entry.

```http
GET /api/master/customers/search
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query (name, phone, code) |
| `limit` | integer | Max results (default 10) |
| `type` | string | Filter by type |

### Response

```json
{
  "success": true,
  "data": [
    {
      "customer_id": 123,
      "customer_code": "CUST001",
      "customer_name": "ABC Pharmacy",
      "primary_phone": "+91-9876543210",
      "outstanding_amount": 15000.00,
      "credit_available": 85000.00
    }
  ]
}
```

---

# Suppliers

Supplier master data management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/suppliers` | Create supplier |
| `GET` | `/suppliers` | List suppliers |
| `GET` | `/suppliers/{id}` | Get supplier by ID |
| `PUT` | `/suppliers/{id}` | Update supplier |
| `GET` | `/suppliers/search` | Search suppliers |

---

## Create Supplier

Creates a new supplier record.

```http
POST /api/master/suppliers
```

### Request Body

```json
{
  "supplier_code": "SUP001",
  "supplier_name": "XYZ Distributors",
  "supplier_type": "distributor",
  "gstin": "27XYZAB5678C2D3",
  "drug_license_number": "DL-21B-2024-005678",
  "primary_phone": "+91-9876543210",
  "email": "sales@xyzdist.com",
  "payment_terms": "credit_30",
  "credit_limit": 500000.00
}
```

### Response

```json
{
  "success": true,
  "data": {
    "supplier_id": 50,
    "supplier_code": "SUP001",
    "supplier_name": "XYZ Distributors",
    "is_active": true
  }
}
```

---

# Categories

Product category management.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/categories` | List categories |
| `GET` | `/categories/tree` | Category hierarchy |
| `POST` | `/categories` | Create category |
| `PUT` | `/categories/{id}` | Update category |

---

## Get Category Tree

Returns hierarchical category structure.

```http
GET /api/master/categories/tree
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "category_id": 1,
      "category_name": "Medicines",
      "children": [
        {
          "category_id": 10,
          "category_name": "Tablets",
          "children": []
        },
        {
          "category_id": 11,
          "category_name": "Syrups",
          "children": []
        }
      ]
    },
    {
      "category_id": 2,
      "category_name": "OTC",
      "children": []
    }
  ]
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `CUSTOMER_NOT_FOUND` | Customer does not exist |
| `SUPPLIER_NOT_FOUND` | Supplier does not exist |
| `DUPLICATE_CODE` | Code already exists |
| `INVALID_GSTIN` | Invalid GSTIN format |
| `INVALID_PAN` | Invalid PAN format |

---

## See Also

- [Canonical field dictionary](../../../architecture/canonical-field-dictionary.json)
- [Master Services](../../services/master/)
- [Sales API](../sales/) · [Purchase API](../purchase/)

---

**Next**: [Returns API](../returns/) · [Auth API](../auth/)
