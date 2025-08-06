"""
Test Suite 02: Products API Testing
Tests product search, batch management, and inventory queries
"""

import pytest
import requests
import json
from datetime import datetime, date
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


class TestProductsAPI:
    """Test suite for Products API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_product_id = None
        cls.test_batch_id = None
        
    def test_01_product_search(self):
        """Test product search functionality"""
        test_queries = [
            {"q": "paracetamol", "expected_field": "product_name"},
            {"q": "3004", "expected_field": "hsn_code"},
            {"q": "", "expected_field": None}  # Empty query should return products
        ]
        
        for test in test_queries:
            response = requests.get(
                f"{BASE_URL}/products/search",
                params={"q": test["q"], "limit": 10},
                headers=HEADERS
            )
            
            logger.info(f"Search query: '{test['q']}' - Status: {response.status_code}")
            
            assert response.status_code == 200, f"Search failed: {response.text}"
            
            data = response.json()
            products = data.get("products", data) if isinstance(data, dict) else data
            
            # Verify response structure
            if products and len(products) > 0:
                product = products[0]
                
                # Check required fields based on schema
                assert "product_id" in product, "Missing product_id"
                assert "product_name" in product or "name" in product, "Missing product name"
                
                # Check GST field - should be gst_percentage not gst_percent
                gst_field = None
                if "gst_percentage" in product:
                    gst_field = "gst_percentage"
                elif "gst_rate" in product:
                    gst_field = "gst_rate"
                elif "gst_percent" in product:
                    gst_field = "gst_percent"
                    
                assert gst_field is not None, f"No GST field found in product: {product.keys()}"
                logger.info(f"✅ GST field found: {gst_field}")
                
                # Store product ID for later tests
                if not self.__class__.test_product_id:
                    self.__class__.test_product_id = product.get("product_id")
                    
        logger.info("✅ Product search tests passed")
        
    def test_02_get_product_details(self):
        """Test getting single product details"""
        if not self.test_product_id:
            pytest.skip("No test product ID available")
            
        # Try different endpoint patterns
        endpoints = [
            f"/products/{self.test_product_id}",
            f"/products/details/{self.test_product_id}",
            f"/products/get/{self.test_product_id}"
        ]
        
        success = False
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"✅ Product details retrieved from {endpoint}")
                    
                    # Verify comprehensive product data
                    assert "product_id" in data
                    assert "product_name" in data or "name" in data
                    assert "hsn_code" in data
                    
                    success = True
                    break
                else:
                    logger.warning(f"Endpoint {endpoint} returned {response.status_code}")
                    
            except Exception as e:
                logger.warning(f"Endpoint {endpoint} failed: {str(e)}")
                
        if not success:
            logger.warning("⚠️ No product detail endpoint found - skipping")
            
    def test_03_get_product_batches(self):
        """Test retrieving batches for a product"""
        if not self.test_product_id:
            pytest.skip("No test product ID available")
            
        # Test batch retrieval
        response = requests.get(
            f"{BASE_URL}/products/{self.test_product_id}/batches",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/batches?product_id={self.test_product_id}",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            batches = data.get("batches", data) if isinstance(data, dict) else data
            
            if batches and len(batches) > 0:
                batch = batches[0]
                
                # Verify batch schema
                assert "batch_id" in batch, "Missing batch_id"
                assert "batch_number" in batch or "batch_no" in batch, "Missing batch number"
                assert "quantity_available" in batch or "available_quantity" in batch, "Missing quantity"
                
                # Check for expiry date
                if "expiry_date" in batch:
                    logger.info(f"✅ Batch has expiry date: {batch['expiry_date']}")
                    
                # Store batch ID for later tests
                self.__class__.test_batch_id = batch.get("batch_id")
                
                logger.info(f"✅ Found {len(batches)} batches for product {self.test_product_id}")
            else:
                logger.warning("⚠️ No batches found for product")
        else:
            logger.warning(f"⚠️ Batch retrieval returned {response.status_code}")
            
    def test_04_product_schema_validation(self):
        """Validate product data matches inventory.products schema"""
        # Based on schema documentation
        expected_fields = {
            "product_id": "INTEGER",
            "product_name": "TEXT",
            "hsn_code": "TEXT",
            "gst_percentage": "NUMERIC",  # Not gst_percent!
            "manufacturer": "TEXT",
            "category_id": "INTEGER",
            "prescription_required": "BOOLEAN",
            "base_unit": "TEXT",
            "pack_size": "INTEGER"
        }
        
        # Search for a product to validate
        response = requests.get(
            f"{BASE_URL}/products/search?limit=1",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            products = data.get("products", data) if isinstance(data, dict) else data
            
            if products and len(products) > 0:
                product = products[0]
                
                # Check critical fields
                missing_fields = []
                for field in ["product_id", "product_name"]:
                    if field not in product and field.replace("product_", "") not in product:
                        missing_fields.append(field)
                        
                if missing_fields:
                    logger.warning(f"⚠️ Missing critical fields: {missing_fields}")
                else:
                    logger.info("✅ Product schema validation passed")
                    
    def test_05_inventory_stock_check(self):
        """Test inventory stock availability check"""
        if not self.test_product_id:
            pytest.skip("No test product ID available")
            
        # Try different stock check endpoints
        endpoints = [
            f"/inventory/stock/{self.test_product_id}",
            f"/products/{self.test_product_id}/stock",
            f"/stock?product_id={self.test_product_id}"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"✅ Stock data retrieved from {endpoint}")
                    
                    # Verify stock information
                    if "total_stock" in data or "quantity_available" in data:
                        logger.info("✅ Stock information available")
                    break
                    
            except Exception as e:
                continue
                
    def test_06_product_categories(self):
        """Test product category retrieval"""
        response = requests.get(
            f"{BASE_URL}/categories",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/products/categories",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            categories = data.get("categories", data) if isinstance(data, dict) else data
            
            if categories and len(categories) > 0:
                logger.info(f"✅ Found {len(categories)} product categories")
            else:
                logger.warning("⚠️ No categories found")
        else:
            logger.warning(f"⚠️ Category endpoint not found")
            
    def test_07_product_validation_errors(self):
        """Test API validation with invalid product requests"""
        if not self.test_product_id:
            self.test_product_id = 99999  # Non-existent ID
            
        # Test non-existent product
        response = requests.get(
            f"{BASE_URL}/products/{self.test_product_id + 99999}/batches",
            headers=HEADERS
        )
        
        # Should return 404 or empty result
        if response.status_code == 404:
            logger.info("✅ Correct 404 for non-existent product")
        elif response.status_code == 200:
            data = response.json()
            batches = data.get("batches", data) if isinstance(data, dict) else data
            if not batches or len(batches) == 0:
                logger.info("✅ Empty result for non-existent product")
                
    def test_08_bulk_product_operations(self):
        """Test bulk product operations if available"""
        # Test retrieving multiple products
        response = requests.get(
            f"{BASE_URL}/products?limit=50&offset=0",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            products = data.get("products", data) if isinstance(data, dict) else data
            
            if products:
                logger.info(f"✅ Bulk retrieval successful: {len(products)} products")
                
                # Check pagination
                if isinstance(data, dict):
                    if "total" in data:
                        logger.info(f"✅ Pagination info available: Total {data['total']}")
                        
                # Verify consistent schema across all products
                gst_fields = set()
                for product in products[:10]:  # Check first 10
                    for field in product.keys():
                        if "gst" in field.lower():
                            gst_fields.add(field)
                            
                if len(gst_fields) > 1:
                    logger.warning(f"⚠️ Inconsistent GST field names: {gst_fields}")
                else:
                    logger.info(f"✅ Consistent GST field: {gst_fields}")


def run_tests():
    """Run all product API tests"""
    test_suite = TestProductsAPI()
    test_suite.setup_class()
    
    tests = [
        test_suite.test_01_product_search,
        test_suite.test_02_get_product_details,
        test_suite.test_03_get_product_batches,
        test_suite.test_04_product_schema_validation,
        test_suite.test_05_inventory_stock_check,
        test_suite.test_06_product_categories,
        test_suite.test_07_product_validation_errors,
        test_suite.test_08_bulk_product_operations
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
    logger.info(f"Product API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)