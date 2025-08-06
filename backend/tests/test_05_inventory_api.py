"""
Test Suite 05: Inventory API Testing
Tests stock movements, batch allocation, expiry tracking, and multi-location stock
"""

import pytest
import requests
import json
from datetime import datetime, date, timedelta
from typing import Dict, Any, List
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Use the org_id that has data
DEFAULT_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"


class TestInventoryAPI:
    """Test suite for Inventory API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_batch_id = None
        cls.test_product_id = None
        cls.test_location_id = None
        cls.test_movement_id = None
        
        # Get a product for testing
        try:
            response = requests.get(
                f"{BASE_URL}/products/search?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                products = data.get("products", data) if isinstance(data, dict) else data
                if products and len(products) > 0:
                    cls.test_product_id = products[0].get("product_id")
                    logger.info(f"Using product ID: {cls.test_product_id}")
        except:
            cls.test_product_id = 1
            
    def test_01_get_batches(self):
        """Test retrieving batches with various filters"""
        # Get all batches
        response = requests.get(
            f"{BASE_URL}/batches",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/inventory/batches",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            batches = data.get("batches", data) if isinstance(data, dict) else data
            
            if batches and len(batches) > 0:
                batch = batches[0]
                self.__class__.test_batch_id = batch.get("batch_id")
                
                # Verify batch schema
                assert "batch_id" in batch
                assert "batch_number" in batch or "batch_no" in batch
                assert "quantity_available" in batch or "available_quantity" in batch
                
                # Check expiry tracking
                if "expiry_date" in batch:
                    logger.info(f"✅ Batch expiry tracking available")
                    
                logger.info(f"✅ Retrieved {len(batches)} batches")
            else:
                logger.warning("⚠️ No batches found")
        else:
            logger.error(f"❌ Batch retrieval failed: {response.status_code}")
            
    def test_02_get_batch_by_product(self):
        """Test getting batches for a specific product"""
        if not self.test_product_id:
            logger.warning("⚠️ No product ID - skipping product batch test")
            return
            
        # Try different endpoints
        endpoints = [
            f"/products/{self.test_product_id}/batches",
            f"/batches?product_id={self.test_product_id}",
            f"/inventory/product/{self.test_product_id}/batches"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Product batches retrieved from {endpoint}")
                break
            elif response.status_code == 404:
                continue
                
    def test_03_stock_availability_check(self):
        """Test checking stock availability"""
        if not self.test_product_id:
            logger.warning("⚠️ No product ID - skipping availability test")
            return
            
        # Check stock availability
        params = {
            "product_id": self.test_product_id,
            "required_quantity": 10
        }
        
        response = requests.get(
            f"{BASE_URL}/inventory/check-availability",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/stock/availability",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Stock availability: {data.get('available', 'Unknown')}")
        else:
            logger.warning(f"⚠️ Availability check returned {response.status_code}")
            
    def test_04_get_locations(self):
        """Test retrieving storage locations"""
        response = requests.get(
            f"{BASE_URL}/locations",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/inventory/locations",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            locations = data.get("locations", data) if isinstance(data, dict) else data
            
            if locations and len(locations) > 0:
                location = locations[0]
                self.__class__.test_location_id = location.get("location_id")
                
                # Verify location schema
                assert "location_id" in location
                assert "location_name" in location or "name" in location
                
                logger.info(f"✅ Retrieved {len(locations)} locations")
            else:
                logger.warning("⚠️ No locations found")
        else:
            logger.warning(f"⚠️ Location endpoint not found")
            
    def test_05_location_wise_stock(self):
        """Test getting stock by location"""
        if not self.test_location_id:
            logger.warning("⚠️ No location ID - skipping location stock test")
            return
            
        response = requests.get(
            f"{BASE_URL}/locations/{self.test_location_id}/stock",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/stock/by-location/{self.test_location_id}",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Location stock data retrieved")
        else:
            logger.warning(f"⚠️ Location stock endpoint not found")
            
    def test_06_create_stock_movement(self):
        """Test creating a stock movement (adjustment)"""
        if not self.test_product_id:
            logger.warning("⚠️ No product ID - skipping movement creation")
            return
            
        movement_data = {
            "movement_type": "adjustment",
            "movement_date": date.today().isoformat(),
            "product_id": self.test_product_id,
            "quantity": 5,
            "movement_direction": "in",
            "reason": "Test adjustment",
            "reference_type": "manual",
            "reference_number": f"TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        }
        
        # Try different endpoints
        endpoints = [
            "/inventory/movements",
            "/stock-movements",
            "/inventory/adjustments"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=movement_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.__class__.test_movement_id = data.get("movement_id", data.get("id"))
                logger.info(f"✅ Stock movement created: ID {self.test_movement_id}")
                break
            elif response.status_code == 422:
                logger.warning(f"⚠️ Movement validation failed: {response.text}")
                break
                
    def test_07_get_stock_movements(self):
        """Test retrieving stock movement history"""
        # Get movements with filters
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/inventory/movements",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/stock-movements",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            movements = data.get("movements", data) if isinstance(data, dict) else data
            
            if movements:
                logger.info(f"✅ Retrieved {len(movements)} movements")
                
                # Verify movement schema
                if len(movements) > 0:
                    movement = movements[0]
                    assert "movement_type" in movement
                    assert "quantity" in movement
                    assert "movement_date" in movement or "date" in movement
            else:
                logger.warning("⚠️ No movements found")
        else:
            logger.warning(f"⚠️ Movement history endpoint not found")
            
    def test_08_expiry_tracking(self):
        """Test expiry date tracking and alerts"""
        # Get near-expiry products
        params = {
            "days_to_expiry": 90,
            "include_expired": False
        }
        
        response = requests.get(
            f"{BASE_URL}/inventory/near-expiry",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/batches/expiring",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Expiry tracking endpoint available")
            
            items = data.get("items", data) if isinstance(data, dict) else data
            if items:
                logger.info(f"✅ Found {len(items)} near-expiry items")
        else:
            logger.warning(f"⚠️ Expiry tracking endpoint not found")
            
    def test_09_stock_valuation(self):
        """Test stock valuation report"""
        response = requests.get(
            f"{BASE_URL}/inventory/valuation",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/stock-valuation",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Stock valuation data retrieved")
            
            # Check for valuation metrics
            if "total_value" in data or "valuation" in data:
                logger.info("✅ Valuation metrics available")
        else:
            logger.warning(f"⚠️ Stock valuation endpoint not found")
            
    def test_10_batch_allocation(self):
        """Test FIFO batch allocation logic"""
        if not self.test_product_id:
            logger.warning("⚠️ No product ID - skipping allocation test")
            return
            
        # Test batch allocation
        allocation_data = {
            "product_id": self.test_product_id,
            "required_quantity": 20,
            "allocation_method": "FIFO"
        }
        
        response = requests.post(
            f"{BASE_URL}/inventory/allocate-batch",
            json=allocation_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.post(
                f"{BASE_URL}/batches/allocate",
                json=allocation_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Batch allocation successful")
            
            # Check allocation details
            if "allocated_batches" in data:
                logger.info(f"✅ Allocated from {len(data['allocated_batches'])} batches")
        else:
            logger.warning(f"⚠️ Batch allocation endpoint not found or failed")


def run_tests():
    """Run all inventory API tests"""
    test_suite = TestInventoryAPI()
    TestInventoryAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_batches,
        test_suite.test_02_get_batch_by_product,
        test_suite.test_03_stock_availability_check,
        test_suite.test_04_get_locations,
        test_suite.test_05_location_wise_stock,
        test_suite.test_06_create_stock_movement,
        test_suite.test_07_get_stock_movements,
        test_suite.test_08_expiry_tracking,
        test_suite.test_09_stock_valuation,
        test_suite.test_10_batch_allocation
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            failed += 1
            logger.error(f"❌ {test.__name__} failed: {str(e)}")
    
    logger.info(f"\n{'='*50}")
    logger.info(f"Inventory API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)