# Enterprise API Testing Framework

Comprehensive API testing framework for PharmaERP with terminal execution, coverage reports, and enterprise-grade validation.

## Quick Start

```bash
# 1. Start the backend with TEST_MODE
cd backend
TEST_MODE=true uvicorn app.main:app --reload --port 8000

# 2. Run all API tests (in another terminal)
python tests/run_tests.py
```

## Running Tests

### All Tests
```bash
python tests/run_tests.py
```

### Specific Module
```bash
python tests/run_tests.py --module returns
python tests/run_tests.py --module purchase
python tests/run_tests.py --module inventory
python tests/run_tests.py --module sales
python tests/run_tests.py --module master
```

### With Coverage
```bash
python tests/run_tests.py --coverage
```

### Generate HTML Report
```bash
python tests/run_tests.py --html-report
```

### Quick Tests Only (Skip Slow)
```bash
python tests/run_tests.py --fast
```

### Verbose Output
```bash
python tests/run_tests.py -v
```

### Stop on First Failure
```bash
python tests/run_tests.py -x
```

### Direct Pytest
```bash
TEST_MODE=true API_BASE_URL=http://localhost:8000 pytest tests/api/ -v
```

---

## Test Structure

```
tests/
├── conftest.py              # Pytest config, fixtures, API client
├── run_tests.py             # CLI test runner
├── api/
│   ├── __init__.py
│   ├── base_test.py         # Enterprise test base class
│   ├── factories.py         # Test data factories
│   │
│   ├── returns/             # Returns module tests
│   │   ├── test_sales_returns.py
│   │   └── test_purchase_returns.py
│   │
│   ├── purchase/            # Purchase module tests
│   │   └── test_grn.py
│   │
│   ├── inventory/           # Inventory module tests
│   │   └── test_stock.py
│   │
│   ├── sales/               # Sales module tests
│   ├── finance/             # Finance module tests
│   └── master/              # Master data tests
```

---

## Coverage by Module

| Module | Test File | Test Cases | Coverage |
|--------|-----------|------------|----------|
| **Returns - Sales** | `test_sales_returns.py` | 15+ | Endpoints, GST, quantities |
| **Returns - Purchase** | `test_purchase_returns.py` | 12+ | Debit notes, transport |
| **Purchase - GRN** | `test_grn.py` | 15+ | Batches, QC, approval |
| **Inventory - Stock** | `test_stock.py` | 20+ | Batches, movements, expiry |

---

## Test Types

### Unit Tests
Fast, isolated tests that don't require API:
```bash
pytest tests/unit/ -v
```

### API Tests
Full API integration tests:
```bash
TEST_MODE=true pytest tests/api/ -v
```

### Slow Tests
Tests marked as slow can be skipped:
```bash
pytest tests/api/ -v -m "not slow"
```

---

## Writing New Tests

### 1. Create Test File
```python
# tests/api/module/test_feature.py
import pytest
from ..base_test import APITestBase
from ..factories import CustomerFactory

class TestFeatureAPI:
    @pytest.fixture
    def api(self, api_client, api_base_url):
        return APITestBase(api_client, api_base_url)
    
    def test_feature_works(self, api):
        response = api.get("/endpoint")
        api.assert_has_fields(response, ["id", "name"])
```

### 2. Use Factories
```python
from ..factories import CustomerFactory, ProductFactory

def test_with_data(self, api_client):
    customer = CustomerFactory.create()
    product = ProductFactory.create()
```

### 3. Validate Frontend Fields
```python
def test_frontend_fields(self, api):
    payload = {
        # All fields from React component
        "customer_id": 1,
        "return_date": "2026-01-21",
        "items": [...]
    }
    response = api.post("/endpoint", payload)
    api.assert_success_response(response)
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_MODE` | `true` | Bypass auth in backend |
| `API_BASE_URL` | `http://localhost:8000` | API server URL |
| `TEST_ORG_ID` | - | Organization ID for tests |

---

## CI/CD Integration

### GitHub Actions
```yaml
- name: Run API Tests
  env:
    TEST_MODE: true
    API_BASE_URL: http://localhost:8000
  run: |
    python tests/run_tests.py --coverage
```

### Pre-commit Hook
```bash
#!/bin/sh
python tests/run_tests.py --fast
```

---

## Troubleshooting

### Tests Fail with 401
Ensure `TEST_MODE=true` is set when starting backend.

### Tests Fail with Connection Error
Backend may not be running. Start with:
```bash
uvicorn app.main:app --reload --port 8000
```

### Missing Dependencies
```bash
pip install pytest pytest-cov pytest-html requests
```
