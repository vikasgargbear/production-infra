"""
Enterprise API Testing Framework - Pytest Configuration
Central configuration for all API tests with shared fixtures.

Usage:
    TEST_MODE=true API_BASE_URL="http://localhost:8000" pytest tests/api/ -v
"""
import os
import sys
import pytest
import requests
from typing import Generator, Dict, Any, Optional
from datetime import date, timedelta
import random
import string
from uuid import uuid4

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# =============================================================================
# ENVIRONMENT CONFIGURATION
# =============================================================================

def get_api_base_url() -> str:
    """Get API base URL from environment"""
    return os.getenv("API_BASE_URL", "http://localhost:8000")


def is_test_mode() -> bool:
    """Check if TEST_MODE is enabled"""
    return os.getenv("TEST_MODE", "true").lower() == "true"


# =============================================================================
# SESSION-SCOPED FIXTURES
# =============================================================================

@pytest.fixture(scope="session")
def api_base_url() -> str:
    """API base URL for all tests"""
    return get_api_base_url()


@pytest.fixture(scope="session")
def api_headers() -> Dict[str, str]:
    """Standard API headers"""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    
    # Add org ID if available
    org_id = os.getenv("TEST_ORG_ID")
    if org_id:
        headers["X-Org-Id"] = org_id
    
    return headers


@pytest.fixture(scope="session")
def api_client(api_base_url: str, api_headers: Dict[str, str]):
    """
    Session-scoped API client for making requests.
    Automatically includes headers and handles responses.
    """
    class APIClient:
        def __init__(self, base_url: str, headers: Dict[str, str]):
            self.base_url = base_url
            self.headers = headers
            self.session = requests.Session()
            self.session.headers.update(headers)
        
        def get(self, path: str, params: Optional[Dict] = None, **kwargs) -> requests.Response:
            url = f"{self.base_url}{path}"
            return self.session.get(url, params=params, timeout=30, **kwargs)
        
        def post(self, path: str, json: Optional[Dict] = None, **kwargs) -> requests.Response:
            url = f"{self.base_url}{path}"
            return self.session.post(url, json=json, timeout=30, **kwargs)
        
        def put(self, path: str, json: Optional[Dict] = None, **kwargs) -> requests.Response:
            url = f"{self.base_url}{path}"
            return self.session.put(url, json=json, timeout=30, **kwargs)
        
        def patch(self, path: str, json: Optional[Dict] = None, **kwargs) -> requests.Response:
            url = f"{self.base_url}{path}"
            return self.session.patch(url, json=json, timeout=30, **kwargs)
        
        def delete(self, path: str, **kwargs) -> requests.Response:
            url = f"{self.base_url}{path}"
            return self.session.delete(url, timeout=30, **kwargs)
    
    return APIClient(api_base_url, api_headers)


# =============================================================================
# TEST DATA GENERATORS
# =============================================================================

@pytest.fixture(scope="session")
def random_phone() -> str:
    """Generate random 10-digit phone number"""
    return f"9{''.join(random.choices(string.digits, k=9))}"


@pytest.fixture(scope="session")
def random_gstin() -> str:
    """Generate random but valid-format GSTIN (15 chars)"""
    state_code = random.choice(["27", "09", "29", "06", "07"])
    pan = ''.join(random.choices(string.ascii_uppercase, k=5)) + \
          ''.join(random.choices(string.digits, k=4)) + \
          random.choice(string.ascii_uppercase)
    entity = "1"
    checksum = random.choice(string.ascii_uppercase + string.digits)
    return f"{state_code}{pan}{entity}Z{checksum}"


def generate_random_phone() -> str:
    """Helper function for factories"""
    return f"9{''.join(random.choices(string.digits, k=9))}"


def generate_random_gstin() -> str:
    """Helper function for factories"""
    state_code = random.choice(["27", "09", "29", "06", "07"])
    pan = ''.join(random.choices(string.ascii_uppercase, k=5)) + \
          ''.join(random.choices(string.digits, k=4)) + \
          random.choice(string.ascii_uppercase)
    entity = "1"
    checksum = random.choice(string.ascii_uppercase + string.digits)
    return f"{state_code}{pan}{entity}Z{checksum}"


def generate_batch_number() -> str:
    """Generate batch number"""
    return f"B{''.join(random.choices(string.ascii_uppercase + string.digits, k=8))}"


# =============================================================================
# ENTITY FIXTURES
# =============================================================================

@pytest.fixture
def test_customer_payload() -> Dict[str, Any]:
    """Generate test customer payload matching frontend form"""
    phone = generate_random_phone()
    return {
        # Required fields
        "customer_name": f"API Test Customer {phone[-4:]}",
        "primary_phone": phone,
        "customer_type": "wholesale",
        
        # Business details
        "business_type": "pharmacy",
        "gst_number": generate_random_gstin(),
        "pan_number": ''.join(random.choices(string.ascii_uppercase, k=5)) + \
                      ''.join(random.choices(string.digits, k=4)) + \
                      random.choice(string.ascii_uppercase),
        
        # Drug license (pharma requirement)
        "drug_license_number": f"DL-{''.join(random.choices(string.digits, k=6))}",
        "drug_license_validity": str(date.today() + timedelta(days=365)),
        
        # Contact info
        "primary_email": f"test{phone[-4:]}@example.com",
        "secondary_phone": generate_random_phone(),
        "whatsapp_number": phone,
        
        # Contact person
        "contact_person_name": "Test Contact Person",
        "contact_person_phone": generate_random_phone(),
        "contact_person_email": f"contact{phone[-4:]}@example.com",
        
        # Credit terms
        "credit_limit": 50000.00,
        "credit_days": 30,
        "credit_rating": "GOOD",
        "payment_terms": "Net 30",
        
        # Address
        "address_line1": "Test Building, 123 Main Street",
        "address_line2": "Near Test Landmark",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        
        # Notes
        "internal_notes": "API Test Customer - Auto Created",
        "is_active": True
    }


@pytest.fixture
def test_supplier_payload() -> Dict[str, Any]:
    """Generate test supplier payload"""
    phone = generate_random_phone()
    return {
        "supplier_name": f"API Test Supplier {phone[-4:]}",
        "supplier_type": "manufacturer",
        "primary_phone": phone,
        "primary_email": f"supplier{phone[-4:]}@example.com",
        "gst_number": generate_random_gstin(),
        "pan_number": ''.join(random.choices(string.ascii_uppercase, k=5)) + \
                      ''.join(random.choices(string.digits, k=4)) + \
                      random.choice(string.ascii_uppercase),
        "drug_license_number": f"MNF-{''.join(random.choices(string.digits, k=6))}",
        "drug_license_validity": str(date.today() + timedelta(days=365)),
        "contact_person_name": "Supplier Contact",
        "payment_terms": "Net 45",
        "credit_days": 45,
        "address_line1": "Supplier Building, Industrial Area",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "pincode": "380001",
        "is_active": True
    }


@pytest.fixture
def test_product_payload() -> Dict[str, Any]:
    """Generate test product payload"""
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return {
        "product_code": f"PRD-{code}",
        "product_name": f"Test Product {code}",
        "generic_name": "Test Generic Name",
        "manufacturer": "Test Pharma Ltd",
        "category": "tablets",
        "sub_category": "antibiotics",
        "hsn_code": "30049099",
        "gst_percent": 12.0,
        "unit": "STRIP",
        "pack_size": 10,
        "mrp": 150.00,
        "sale_price": 120.00,
        "purchase_price": 80.00,
        "min_stock_level": 100,
        "max_stock_level": 1000,
        "reorder_level": 200,
        "is_active": True,
        "requires_prescription": True,
        "is_narcotic": False,
        "storage_conditions": "Store in cool, dry place"
    }


@pytest.fixture
def test_batch_payload(test_product_payload: Dict) -> Dict[str, Any]:
    """Generate test batch payload"""
    return {
        "batch_number": generate_batch_number(),
        "manufacturing_date": str(date.today() - timedelta(days=30)),
        "expiry_date": str(date.today() + timedelta(days=365)),
        "mrp": 150.00,
        "ptr": 120.00,
        "purchase_price": 80.00,
        "quantity": 500,
        "location_code": "SHELF-A1"
    }


# =============================================================================
# CLEANUP TRACKING
# =============================================================================

@pytest.fixture
def cleanup_tracker():
    """Track created entities for cleanup"""
    created_entities = {
        "customers": [],
        "suppliers": [],
        "products": [],
        "invoices": [],
        "returns": [],
        "grns": []
    }
    
    yield created_entities
    
    # Cleanup is optional - entities can be left for inspection
    # Implement cleanup logic here if needed


# =============================================================================
# PYTEST CONFIGURATION
# =============================================================================

def pytest_configure(config):
    """Pytest configuration hook"""
    config.addinivalue_line(
        "markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')"
    )
    config.addinivalue_line(
        "markers", "integration: marks tests as integration tests"
    )
    config.addinivalue_line(
        "markers", "requires_data: tests that require existing data in database"
    )


def pytest_collection_modifyitems(config, items):
    """Modify test collection"""
    # Add slow marker to tests with 'slow' in name
    for item in items:
        if "slow" in item.nodeid.lower():
            item.add_marker(pytest.mark.slow)


# =============================================================================
# HELPER ASSERTIONS
# =============================================================================

def assert_response_ok(response: requests.Response, expected_status: int = 200):
    """Assert response has expected status"""
    assert response.status_code == expected_status, \
        f"Expected {expected_status}, got {response.status_code}: {response.text}"


def assert_response_has_fields(data: Dict, required_fields: list):
    """Assert response data has all required fields"""
    missing = [f for f in required_fields if f not in data]
    assert not missing, f"Missing required fields: {missing}"


def assert_valid_id(value: Any, field_name: str = "id"):
    """Assert value is a valid ID (positive int or uuid)"""
    if isinstance(value, int):
        assert value > 0, f"{field_name} must be positive"
    elif isinstance(value, str):
        # Try to parse as UUID or int
        try:
            int(value)
        except ValueError:
            try:
                from uuid import UUID
                UUID(value)
            except ValueError:
                pytest.fail(f"{field_name} is not a valid ID: {value}")


# Export helper functions
__all__ = [
    'get_api_base_url',
    'is_test_mode',
    'generate_random_phone',
    'generate_random_gstin',
    'generate_batch_number',
    'assert_response_ok',
    'assert_response_has_fields',
    'assert_valid_id'
]
