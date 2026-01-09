# Testing Guide

Comprehensive testing strategies and practices.

---

## Testing Stack

| Tool | Purpose |
|------|---------|
| **pytest** | Test runner |
| **pytest-cov** | Coverage reporting |
| **httpx** | Async API testing |
| **factory_boy** | Test data factories |
| **faker** | Realistic fake data |

---

## Quick Start

```bash
cd backend

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific file
pytest tests/test_invoices.py

# Run specific test
pytest tests/test_invoices.py::test_create_invoice

# Run with verbose output
pytest -v

# Run only failed tests from last run
pytest --lf
```

---

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures
├── factories/
│   ├── __init__.py
│   ├── invoice_factory.py
│   └── customer_factory.py
├── unit/
│   ├── test_calculations.py
│   └── test_services.py
├── api/
│   ├── test_invoices_api.py
│   ├── test_payments_api.py
│   └── test_auth_api.py
└── integration/
    ├── test_invoice_flow.py
    └── test_purchase_flow.py
```

---

## Test Configuration

### conftest.py

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import get_db

# Test database
TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/pharmacy_test"
engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(bind=engine)

@pytest.fixture(scope="function")
def db():
    """Database session for each test"""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db):
    """API test client"""
    def override_get_db():
        yield db
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as c:
        yield c
    
    app.dependency_overrides.clear()

@pytest.fixture
def auth_client(client, test_user):
    """Authenticated client"""
    response = client.post("/api/auth/login", json={
        "username": test_user.username,
        "password": "testpassword"
    })
    token = response.json()["data"]["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client

@pytest.fixture
def test_org(db):
    """Test organization"""
    from tests.factories import OrgFactory
    return OrgFactory.create(db)

@pytest.fixture
def test_user(db, test_org):
    """Test user with admin role"""
    from tests.factories import UserFactory
    return UserFactory.create(db, org_id=test_org.org_id, role="admin")
```

---

## Unit Tests

Test individual functions in isolation.

### Testing Calculations

```python
# tests/unit/test_calculations.py
from decimal import Decimal
from app.api.shared.calculations import calculate_line_total, calculate_gst

def test_calculate_line_total_no_discount():
    result = calculate_line_total(
        quantity=Decimal("10"),
        unit_price=Decimal("100.00"),
        discount_percent=Decimal("0")
    )
    assert result == Decimal("1000.00")

def test_calculate_line_total_with_discount():
    result = calculate_line_total(
        quantity=Decimal("10"),
        unit_price=Decimal("100.00"),
        discount_percent=Decimal("10")
    )
    assert result == Decimal("900.00")

def test_calculate_gst_intra_state():
    result = calculate_gst(
        taxable_amount=Decimal("1000.00"),
        gst_rate=Decimal("12"),
        is_inter_state=False
    )
    assert result["cgst_amount"] == Decimal("60.00")
    assert result["sgst_amount"] == Decimal("60.00")
    assert result["igst_amount"] == Decimal("0")

def test_calculate_gst_inter_state():
    result = calculate_gst(
        taxable_amount=Decimal("1000.00"),
        gst_rate=Decimal("12"),
        is_inter_state=True
    )
    assert result["cgst_amount"] == Decimal("0")
    assert result["sgst_amount"] == Decimal("0")
    assert result["igst_amount"] == Decimal("120.00")
```

### Testing Services

```python
# tests/unit/test_invoice_service.py
import pytest
from unittest.mock import Mock, patch
from app.api.services.sales.invoice_service import InvoiceService
from app.core.exceptions import ValidationError, InsufficientStockError

def test_create_invoice_validates_items():
    db = Mock()
    context = Mock(org_id="test-org")
    
    with pytest.raises(ValidationError, match="At least one item"):
        InvoiceService.create(db, context, {"items": []})

def test_create_invoice_checks_stock():
    db = Mock()
    context = Mock(org_id="test-org")
    
    # Mock insufficient stock
    with patch("app.api.services.sales.invoice_service.check_stock") as mock:
        mock.return_value = False
        
        with pytest.raises(InsufficientStockError):
            InvoiceService.create(db, context, {
                "customer_id": 1,
                "items": [{"product_id": 1, "batch_id": 1, "quantity": 1000}]
            })
```

---

## API Tests

Test endpoints with real HTTP requests.

### CRUD Operations

```python
# tests/api/test_invoices_api.py
import pytest

def test_create_invoice(auth_client, test_customer, test_batch):
    response = auth_client.post("/api/sales/invoices", json={
        "invoice_number": "TEST-INV-001",
        "invoice_date": "2026-01-09",
        "customer_id": test_customer.customer_id,
        "items": [
            {
                "product_id": test_batch.product_id,
                "batch_id": test_batch.batch_id,
                "quantity": 5,
                "uom": "STRIP",
                "pack_type": "strip",
                "unit_price": 45.50
            }
        ]
    })
    
    assert response.status_code == 201
    data = response.json()["data"]
    assert data["invoice_number"] == "TEST-INV-001"
    assert data["customer_id"] == test_customer.customer_id
    assert data["total_amount"] > 0

def test_list_invoices(auth_client, test_invoice):
    response = auth_client.get("/api/sales/invoices")
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert len(data["data"]) >= 1

def test_get_invoice(auth_client, test_invoice):
    response = auth_client.get(f"/api/sales/invoices/{test_invoice.invoice_id}")
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["invoice_id"] == test_invoice.invoice_id

def test_get_invoice_not_found(auth_client):
    response = auth_client.get("/api/sales/invoices/999999")
    
    assert response.status_code == 404
```

### Authentication Tests

```python
# tests/api/test_auth_api.py

def test_login_success(client, test_user):
    response = client.post("/api/auth/login", json={
        "username": test_user.username,
        "password": "testpassword"
    })
    
    assert response.status_code == 200
    data = response.json()["data"]
    assert "access_token" in data
    assert "refresh_token" in data

def test_login_invalid_credentials(client):
    response = client.post("/api/auth/login", json={
        "username": "nonexistent@test.com",
        "password": "wrongpassword"
    })
    
    assert response.status_code == 401

def test_protected_endpoint_without_token(client):
    response = client.get("/api/sales/invoices")
    
    assert response.status_code == 401

def test_protected_endpoint_with_token(auth_client):
    response = auth_client.get("/api/sales/invoices")
    
    assert response.status_code == 200
```

### Permission Tests

```python
# tests/api/test_permissions.py

def test_sales_user_cannot_delete_invoice(client, test_org, db):
    # Create user with sales:view,create only (no delete)
    user = UserFactory.create(db, org_id=test_org.org_id, role="sales_exec")
    
    # Login as sales user
    response = client.post("/api/auth/login", json={
        "username": user.username,
        "password": "testpassword"
    })
    token = response.json()["data"]["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    
    # Try to delete invoice
    response = client.post(f"/api/sales/invoices/1/cancel")
    
    assert response.status_code == 403
```

---

## Integration Tests

Test complete workflows across multiple services.

```python
# tests/integration/test_invoice_flow.py

def test_complete_invoice_flow(auth_client, test_customer, test_batch, db):
    """Test full invoice lifecycle: create → pay → complete"""
    
    # 1. Create invoice
    invoice_response = auth_client.post("/api/sales/invoices", json={
        "invoice_number": "FLOW-001",
        "invoice_date": "2026-01-09",
        "customer_id": test_customer.customer_id,
        "items": [
            {
                "product_id": test_batch.product_id,
                "batch_id": test_batch.batch_id,
                "quantity": 5,
                "uom": "STRIP",
                "pack_type": "strip",
                "unit_price": 100.00
            }
        ]
    })
    assert invoice_response.status_code == 201
    invoice = invoice_response.json()["data"]
    
    # 2. Verify stock reduced
    batch = db.execute(
        "SELECT quantity_available FROM inventory.batches WHERE batch_id = :id",
        {"id": test_batch.batch_id}
    ).fetchone()
    assert batch.quantity_available == test_batch.quantity_available - 5
    
    # 3. Create payment
    payment_response = auth_client.post("/api/finance/payments", json={
        "payment_date": "2026-01-09",
        "payment_type": "receipt",
        "party_type": "customer",
        "party_id": test_customer.customer_id,
        "payment_amount": invoice["total_amount"],
        "payment_method": "cash",
        "allocations": [
            {
                "reference_type": "invoice",
                "reference_id": invoice["invoice_id"],
                "allocated_amount": invoice["total_amount"]
            }
        ]
    })
    assert payment_response.status_code == 201
    
    # 4. Verify invoice marked as paid
    invoice_check = auth_client.get(f"/api/sales/invoices/{invoice['invoice_id']}")
    assert invoice_check.json()["data"]["payment_status"] == "paid"
```

---

## Test Factories

```python
# tests/factories/invoice_factory.py
from decimal import Decimal
from datetime import date
import factory
from app.models import Invoice

class InvoiceFactory(factory.Factory):
    class Meta:
        model = dict  # Returns dict, not ORM model
    
    invoice_number = factory.Sequence(lambda n: f"TEST-INV-{n:04d}")
    invoice_date = factory.LazyFunction(date.today)
    customer_id = factory.LazyAttribute(lambda o: o.customer.customer_id)
    subtotal_amount = Decimal("1000.00")
    discount_amount = Decimal("50.00")
    tax_amount = Decimal("114.00")
    total_amount = Decimal("1064.00")
    invoice_status = "generated"
    payment_status = "unpaid"
    
    @classmethod
    def create(cls, db, **kwargs):
        """Create invoice in database"""
        data = cls.build(**kwargs)
        result = db.execute("""
            INSERT INTO sales.invoices (
                org_id, invoice_number, invoice_date, customer_id,
                subtotal_amount, total_amount, invoice_status
            ) VALUES (
                :org_id, :invoice_number, :invoice_date, :customer_id,
                :subtotal_amount, :total_amount, :invoice_status
            ) RETURNING *
        """, data)
        return result.fetchone()
```

---

## Coverage

### Run Coverage Report

```bash
# Terminal report
pytest --cov=app tests/

# HTML report
pytest --cov=app --cov-report=html tests/
open htmlcov/index.html
```

### Coverage Targets

| Module | Target |
|--------|--------|
| Services | 80% |
| Routes | 70% |
| Core (auth, db) | 90% |
| Utilities | 90% |

---

## Test Best Practices

### Do's

```python
# ✅ Clear test names describing behavior
def test_create_invoice_deducts_stock():
    ...

# ✅ Single assertion focus
def test_payment_updates_invoice_balance():
    payment = create_payment(...)
    invoice = get_invoice(...)
    assert invoice.balance_due == original_balance - payment.amount

# ✅ Use fixtures for setup
def test_something(auth_client, test_customer):
    ...

# ✅ Test edge cases
def test_create_invoice_with_zero_quantity_fails():
    ...
```

### Don'ts

```python
# ❌ Vague test names
def test_invoice():
    ...

# ❌ Multiple unrelated assertions
def test_everything():
    assert invoice.status == "posted"
    assert customer.balance > 0
    assert stock.quantity < original

# ❌ Hard-coded IDs
def test_get_customer():
    response = client.get("/customers/123")  # Might not exist

# ❌ Depending on test order
def test_second_should_run_after_first():
    ...
```

---

## See Also

- [Getting Started](getting-started.md)
- [Development Workflow](development.md)
- [Troubleshooting](troubleshooting.md)

---

**Next**: [Troubleshooting](troubleshooting.md)
