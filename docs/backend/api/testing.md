# Testing Guide

How to test the Pharmacy API in different environments.

---

## Environments

| Environment | Base URL | Purpose |
|-------------|----------|---------|
| **Local** | `http://localhost:8000` | Development |
| **Staging** | `https://staging-api.yourdomain.com` | Pre-production testing |
| **Production** | `https://api.yourdomain.com` | Live environment |

---

## Local Development Setup

### 1. Start the Backend

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
python start.py
```

### 2. Access Interactive Docs

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

### 3. Get Test Token

```bash
# Login and get token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin@test.com", "password": "test123"}'

# Export token for convenience
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## Test Data

### Sample Test Users

| Username | Password | Role | Permissions |
|----------|----------|------|-------------|
| `admin@test.com` | `test123` | admin | All |
| `sales@test.com` | `test123` | sales | sales:*, inventory:view |
| `viewer@test.com` | `test123` | viewer | *:view |

### Sample Test Data IDs

```javascript
// Use these IDs for testing (pre-seeded in dev/staging)
const testData = {
  customers: [1, 2, 3],      // ABC Pharmacy, XYZ Medical, etc.
  suppliers: [1, 2, 3],      // Test Distributor 1, 2, 3
  products: [1, 2, 3, 4, 5], // Paracetamol, Amoxicillin, etc.
  batches: [1, 2, 3],        // Active test batches
};
```

---

## Testing Workflows

### Complete Sales Flow

```bash
# 1. Search for a product
curl "http://localhost:8000/api/inventory/products/search?q=paracetamol" \
  -H "Authorization: Bearer $TOKEN"

# 2. Check batch availability
curl "http://localhost:8000/api/inventory/batches/by-product/1?in_stock=true" \
  -H "Authorization: Bearer $TOKEN"

# 3. Create an invoice
curl -X POST http://localhost:8000/api/sales/invoices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invoice_number": "TEST-INV-001",
    "invoice_date": "2026-01-09",
    "customer_id": 1,
    "items": [
      {
        "product_id": 1,
        "batch_id": 1,
        "quantity": 5,
        "uom": "STRIP",
        "pack_type": "strip",
        "unit_price": 45.50
      }
    ]
  }'

# 4. Record a payment
curl -X POST http://localhost:8000/api/finance/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_date": "2026-01-09",
    "payment_type": "receipt",
    "party_type": "customer",
    "party_id": 1,
    "payment_amount": 250.00,
    "payment_method": "cash"
  }'
```

### Complete Purchase Flow

```bash
# 1. Create purchase order
curl -X POST http://localhost:8000/api/purchase/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "po_date": "2026-01-09",
    "supplier_id": 1,
    "items": [
      {
        "product_id": 1,
        "quantity": 100,
        "uom": "STRIP",
        "pack_type": "strip",
        "unit_price": 35.00
      }
    ]
  }'

# 2. Create GRN (goods receipt)
curl -X POST http://localhost:8000/api/purchase/grn \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "grn_date": "2026-01-09",
    "supplier_id": 1,
    "purchase_order_id": 1,
    "items": [
      {
        "product_id": 1,
        "batch_number": "TEST-BATCH-001",
        "expiry_date": "2027-12-31",
        "received_quantity": 100,
        "accepted_quantity": 100,
        "mrp": 50.00,
        "unit_price": 35.00
      }
    ]
  }'

# 3. Approve GRN (creates stock)
curl -X POST http://localhost:8000/api/purchase/grn/1/approve \
  -H "Authorization: Bearer $TOKEN"

# 4. Verify stock was created
curl "http://localhost:8000/api/inventory/stock/by-product/1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Postman Collection

### Import Collection

1. Download: [Pharmacy-API.postman_collection.json](./postman/collection.json)
2. Import into Postman
3. Set environment variables:
   - `base_url`: `http://localhost:8000`
   - `token`: (auto-set after login)

### Environment Setup

```json
{
  "name": "Local Development",
  "values": [
    {"key": "base_url", "value": "http://localhost:8000"},
    {"key": "username", "value": "admin@test.com"},
    {"key": "password", "value": "test123"},
    {"key": "token", "value": ""}
  ]
}
```

---

## Automated Testing

### Python Test Script

```python
import requests
import pytest

BASE_URL = "http://localhost:8000"

@pytest.fixture
def auth_headers():
    """Get authentication headers"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "username": "admin@test.com",
        "password": "test123"
    })
    token = response.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_create_invoice(auth_headers):
    """Test invoice creation"""
    response = requests.post(
        f"{BASE_URL}/api/sales/invoices",
        headers=auth_headers,
        json={
            "invoice_number": f"TEST-{int(time.time())}",
            "invoice_date": "2026-01-09",
            "customer_id": 1,
            "items": [
                {
                    "product_id": 1,
                    "batch_id": 1,
                    "quantity": 1,
                    "uom": "STRIP",
                    "pack_type": "strip",
                    "unit_price": 45.50
                }
            ]
        }
    )
    assert response.status_code == 201
    assert response.json()["success"] == True
    assert "invoice_id" in response.json()["data"]

def test_insufficient_stock(auth_headers):
    """Test insufficient stock error"""
    response = requests.post(
        f"{BASE_URL}/api/sales/invoices",
        headers=auth_headers,
        json={
            "invoice_number": f"TEST-{int(time.time())}",
            "invoice_date": "2026-01-09",
            "customer_id": 1,
            "items": [
                {
                    "product_id": 1,
                    "batch_id": 1,
                    "quantity": 999999,  # Too much
                    "uom": "STRIP",
                    "pack_type": "strip",
                    "unit_price": 45.50
                }
            ]
        }
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"
```

### Run Tests

```bash
pytest tests/api/ -v
```

---

## Debugging

### View Request Logs

```bash
# Tail API logs
tail -f logs/api.log

# Or use httpie for pretty output
http GET localhost:8000/api/sales/invoices Authorization:"Bearer $TOKEN"
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Token expired | Refresh token or re-login |
| 403 Forbidden | Missing permission | Use user with correct role |
| 400 INSUFFICIENT_STOCK | No available stock | Create GRN first |
| 404 Not Found | Wrong ID or org | Verify ID exists in your org |

---

## Rate Limit Testing

```bash
# Test rate limiting (will hit 429 after limit)
for i in {1..1000}; do
  curl -s "http://localhost:8000/api/sales/invoices" \
    -H "Authorization: Bearer $TOKEN" &
done
wait
```

---

## See Also

- [API Reference](README.md)
- [Error Codes](errors.md)
- [SDK Examples](sdk-examples.md)
