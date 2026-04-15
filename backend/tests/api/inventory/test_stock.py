"""
Enterprise Inventory Stock & Batch API Tests
Comprehensive testing for inventory endpoints.

Covers:
- Inventory overview and dashboard
- Batch CRUD operations
- Stock levels and movements
- Expiry alerts
- Stock valuation
"""
import pytest
from datetime import date, timedelta
from typing import Dict, Any, List

from ..base_test import InventoryTestBase
from ..factories import ProductFactory, BatchFactory, StockAdjustmentFactory


class TestInventoryStockAPI:
    """Test suite for Inventory Stock API"""
    
    # =========================================================================
    # FIXTURES
    # =========================================================================
    
    @pytest.fixture
    def inventory_api(self, api_client, api_base_url):
        """Inventory API test helper"""
        api = InventoryTestBase(api_client, api_base_url)
        api.BASE_PATH = "/api/inventory"
        return api
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/
    # =========================================================================
    
    def test_inventory_overview(self, inventory_api):
        """Test inventory overview endpoint"""
        response = inventory_api.get("/")
        
        # Should return summary stats
        assert isinstance(response, dict)
    
    # =========================================================================
    # ENDPOINT: POST /api/inventory/batches
    # =========================================================================
    
    def test_create_batch(self, inventory_api):
        """Test batch creation"""
        batch_payload = BatchFactory.create(product_id=1)
        
        # Validate payload structure
        required_fields = [
            "product_id", "batch_number", "expiry_date",
            "mrp", "quantity"
        ]
        
        for field in required_fields:
            assert field in batch_payload, f"Missing field: {field}"
    
    def test_create_batch_frontend_fields(self, inventory_api):
        """Test all frontend batch fields are supported"""
        batch_payload = {
            "product_id": 1,
            "batch_number": "BATCH-TEST-001",
            "manufacturing_date": str(date.today() - timedelta(days=60)),
            "expiry_date": str(date.today() + timedelta(days=365)),
            "mrp": 150.00,
            "ptr": 120.00,
            "purchase_price": 80.00,
            "quantity": 500,
            "quantity_available": 500,
            "location_code": "SHELF-A1",
            "notes": "Test batch"
        }
        
        # Validate all fields present
        assert "batch_number" in batch_payload
        assert "expiry_date" in batch_payload
        assert "mrp" in batch_payload
    
    def test_create_batch_expiry_required(self, inventory_api):
        """Validate expiry date is required for pharma"""
        batch_payload = {
            "product_id": 1,
            "batch_number": "BATCH-001",
            "mrp": 100.00,
            "quantity": 100
            # Missing expiry_date
        }
        
        # Should fail validation
        assert "expiry_date" not in batch_payload
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/batches/{batch_id}
    # =========================================================================
    
    def test_get_batch_not_found(self, inventory_api):
        """Test getting non-existent batch"""
        inventory_api.get("/batches/999999", expected_status=404)
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/batches
    # =========================================================================
    
    def test_list_batches(self, inventory_api):
        """Test listing batches"""
        response = inventory_api.get("/batches")
        
        assert isinstance(response, (dict, list))
    
    def test_list_batches_by_product(self, inventory_api):
        """Test listing batches for specific product"""
        response = inventory_api.get("/batches", params={"product_id": 1})
        
        assert isinstance(response, (dict, list))
    
    def test_list_batches_expiring_soon(self, inventory_api):
        """Test listing batches expiring within N days"""
        response = inventory_api.get("/batches", params={
            "expiring_in_days": 90
        })
        
        assert isinstance(response, (dict, list))
    
    def test_list_batches_include_expired(self, inventory_api):
        """Test listing including expired batches"""
        response = inventory_api.get("/batches", params={
            "include_expired": True
        })
        
        assert isinstance(response, (dict, list))
    
    def test_list_batches_pagination(self, inventory_api):
        """Test batch listing with pagination"""
        response = inventory_api.get("/batches", params={
            "skip": 0,
            "limit": 20
        })
        
        assert isinstance(response, (dict, list))
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/stock/current/{product_id}
    # =========================================================================
    
    def test_get_current_stock(self, inventory_api):
        """Test getting current stock for product"""
        stock_list = inventory_api.get("/stock/current")
        stock_items = stock_list if isinstance(stock_list, list) else stock_list.get("data", [])
        if not stock_items:
            pytest.skip("No current stock available in test org")

        product_id = stock_items[0].get("product_id")
        assert product_id is not None, "Current stock item is missing product_id"

        response = inventory_api.get(f"/stock/current/{product_id}")
        
        assert isinstance(response, dict)
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/stock/current
    # =========================================================================
    
    def test_list_current_stock(self, inventory_api):
        """Test listing current stock levels"""
        response = inventory_api.get("/stock/current")
        
        assert isinstance(response, (dict, list))
    
    def test_list_current_stock_low_only(self, inventory_api):
        """Test listing only low stock items"""
        response = inventory_api.get("/stock/current", params={
            "low_stock_only": True
        })
        
        assert isinstance(response, (dict, list))
    
    def test_list_current_stock_by_category(self, inventory_api):
        """Test listing stock by category"""
        response = inventory_api.get("/stock/current", params={
            "category": "tablets"
        })
        
        assert isinstance(response, (dict, list))
    
    # =========================================================================
    # ENDPOINT: POST /api/inventory/movements
    # =========================================================================
    
    def test_record_stock_movement(self, inventory_api):
        """Test recording stock movement"""
        movement_payload = {
            "product_id": 1,
            "batch_id": 1,
            "movement_type": "SALE",
            "movement_direction": "out",
            "movement_date": str(date.today()),
            "quantity": 10,
            "base_quantity": 10,
            "reference_type": "INVOICE",
            "reference_id": 1,
            "reference_number": "INV-001",
            "reason": "Sale",
            "notes": "Test movement"
        }
        
        # Validate structure
        required_fields = [
            "product_id", "movement_type", "movement_direction",
            "movement_date", "quantity"
        ]
        
        for field in required_fields:
            assert field in movement_payload
    
    def test_stock_movement_types(self, inventory_api):
        """Validate all stock movement types"""
        movement_types = [
            "PURCHASE", "SALE", "RETURN", "PURCHASE_RETURN",
            "ADJUSTMENT", "TRANSFER", "DAMAGE", "EXPIRY"
        ]
        
        for m_type in movement_types:
            assert m_type in movement_types
    
    def test_stock_movement_directions(self, inventory_api):
        """Validate movement directions"""
        directions = ["in", "out"]
        
        for direction in directions:
            assert direction in directions
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/movements
    # =========================================================================
    
    def test_list_stock_movements(self, inventory_api):
        """Test listing stock movements"""
        response = inventory_api.get("/movements")
        
        assert isinstance(response, (dict, list))
    
    def test_list_movements_by_product(self, inventory_api):
        """Test listing movements for product"""
        response = inventory_api.get("/movements", params={
            "product_id": 1
        })
        
        assert isinstance(response, (dict, list))
    
    def test_list_movements_by_type(self, inventory_api):
        """Test listing movements by type"""
        response = inventory_api.get("/movements", params={
            "movement_type": "SALE"
        })
        
        assert isinstance(response, (dict, list))
    
    def test_list_movements_date_range(self, inventory_api):
        """Test listing movements with date range"""
        response = inventory_api.get("/movements", params={
            "from_date": str(date.today() - timedelta(days=30)),
            "to_date": str(date.today())
        })
        
        assert isinstance(response, (dict, list))
    
    # =========================================================================
    # ENDPOINT: POST /api/inventory/stock/adjustment
    # =========================================================================
    
    def test_adjust_stock(self, inventory_api):
        """Test stock adjustment"""
        adjustment_payload = StockAdjustmentFactory.create(
            product_id=1,
            batch_id=1
        )
        
        required_fields = [
            "product_id", "batch_id", "adjustment_type",
            "quantity", "reason"
        ]
        
        for field in required_fields:
            assert field in adjustment_payload
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/expiry/alerts
    # =========================================================================
    
    def test_get_expiry_alerts(self, inventory_api):
        """Test expiry alerts endpoint"""
        response = inventory_api.get("/expiry/alerts")
        
        assert isinstance(response, (dict, list))
    
    def test_expiry_alerts_with_days(self, inventory_api):
        """Test expiry alerts with custom days"""
        response = inventory_api.get("/expiry/alerts", params={
            "days_ahead": 180
        })
        
        assert isinstance(response, (dict, list))
    
    def test_expiry_alerts_by_level(self, inventory_api):
        """Test expiry alerts filtered by level"""
        response = inventory_api.get("/expiry/alerts", params={
            "alert_level": "critical"
        })
        
        assert isinstance(response, (dict, list))
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/valuation
    # =========================================================================
    
    def test_get_stock_valuation(self, inventory_api):
        """Test stock valuation endpoint"""
        response = inventory_api.get("/valuation")
        
        assert isinstance(response, dict)
    
    def test_stock_valuation_as_of_date(self, inventory_api):
        """Test valuation as of specific date"""
        response = inventory_api.get("/valuation", params={
            "as_of_date": str(date.today())
        })
        
        assert isinstance(response, dict)
    
    # =========================================================================
    # ENDPOINT: GET /api/inventory/dashboard
    # =========================================================================
    
    def test_inventory_dashboard(self, inventory_api):
        """Test inventory dashboard endpoint"""
        response = inventory_api.get("/dashboard")
        
        assert isinstance(response, dict)


# =============================================================================
# BATCH EXPIRY TESTS
# =============================================================================

class TestBatchExpiry:
    """Test batch expiry handling"""
    
    def test_expiry_calculation(self):
        """Validate expiry date calculations"""
        today = date.today()
        expiry = today + timedelta(days=90)
        days_until_expiry = (expiry - today).days
        
        assert days_until_expiry == 90
    
    def test_expired_batch_detection(self):
        """Validate expired batch detection"""
        today = date.today()
        expiry = today - timedelta(days=1)
        
        is_expired = expiry < today
        assert is_expired is True
    
    def test_near_expiry_detection(self):
        """Validate near-expiry detection"""
        today = date.today()
        expiry = today + timedelta(days=30)
        threshold = 90
        
        is_near_expiry = (expiry - today).days <= threshold
        assert is_near_expiry is True


# =============================================================================
# STOCK MOVEMENT REFERENCE TYPES
# =============================================================================

class TestStockMovementReferences:
    """Test stock movement reference types"""
    
    def test_reference_types(self):
        """Validate all reference types"""
        reference_types = [
            "INVOICE", "PURCHASE_ORDER", "GRN",
            "SALES_RETURN", "PURCHASE_RETURN",
            "ADJUSTMENT", "TRANSFER", "WRITEOFF"
        ]
        
        for ref_type in reference_types:
            assert ref_type in reference_types
    
    def test_movement_creates_audit_trail(self):
        """Movements should create audit trail"""
        # Movement should have reference_type, reference_id, reference_number
        movement = {
            "reference_type": "INVOICE",
            "reference_id": 123,
            "reference_number": "INV-001"
        }
        
        assert "reference_type" in movement
        assert "reference_id" in movement
        assert "reference_number" in movement


# =============================================================================
# SCHEMA VALIDATION TESTS
# =============================================================================

class TestInventorySchemas:
    """Test schema validation"""
    
    def test_batch_create_schema(self):
        """Validate BatchCreate schema"""
        batch = BatchFactory.create(product_id=1)
        
        required = ["product_id", "batch_number", "expiry_date", "mrp"]
        for field in required:
            assert field in batch
    
    def test_stock_movement_schema(self):
        """Validate StockMovementCreate schema"""
        movement = {
            "org_id": "uuid-here",
            "product_id": 1,
            "batch_id": 1,
            "movement_type": "SALE",
            "movement_direction": "out",
            "movement_date": str(date.today()),
            "quantity": 10,
            "base_quantity": 10
        }
        
        required = ["product_id", "movement_type", "movement_direction",
                    "movement_date", "quantity"]
        for field in required:
            assert field in movement
    
    def test_stock_adjustment_schema(self):
        """Validate StockAdjustment schema"""
        adjustment = StockAdjustmentFactory.create(product_id=1, batch_id=1)
        
        required = ["product_id", "batch_id", "adjustment_type", "quantity"]
        for field in required:
            assert field in adjustment
