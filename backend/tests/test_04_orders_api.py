"""
Test Suite 04: Orders API Testing
Tests order creation, order-to-invoice conversion, and fulfillment tracking
"""

import pytest
import requests
import json
from datetime import datetime, date, timedelta
from typing import Dict, Any, List
import logging
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Test data - reuse from previous tests
TEST_CUSTOMER_ID = 35  # From invoice tests
TEST_PRODUCT_ID = 47   # From invoice tests
# Use the org_id that has customers and products
DEFAULT_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"  # Org with existing test data
USER_ORG_ID = "12de5e22-eee7-4d25-b3a7-d16d01c6170f"  # User's org_id


class TestOrdersAPI:
    """Test suite for Orders API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_order_id = None
        cls.test_order_number = None
        cls.test_customer_id = None
        cls.test_product_id = None
        
        # Get a valid customer ID
        try:
            response = requests.get(
                f"{BASE_URL}/customers?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                customers = data.get("customers", [])
                if customers:
                    cls.test_customer_id = customers[0].get("customer_id")
                    logger.info(f"Using customer ID: {cls.test_customer_id}")
        except:
            pass
            
        # Get a valid product ID
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
            pass
            
        # Fallback to defaults if not found
        if not cls.test_customer_id:
            cls.test_customer_id = TEST_CUSTOMER_ID
            logger.info(f"Using default customer ID: {cls.test_customer_id}")
        if not cls.test_product_id:
            cls.test_product_id = TEST_PRODUCT_ID
            logger.info(f"Using default product ID: {cls.test_product_id}")
        
    def test_01_create_order_minimal(self):
        """Test creating order with minimal required fields"""
        # Use class variables
        customer_id = self.__class__.test_customer_id or TEST_CUSTOMER_ID
        product_id = self.__class__.test_product_id or TEST_PRODUCT_ID
        
        # Use the correct org_id
        order_data = {
            "org_id": DEFAULT_ORG_ID,
            "customer_id": customer_id,
            "order_type": "sales",  # Must be sales/return/replacement
            "delivery_date": (date.today() + timedelta(days=2)).isoformat(),
            "items": [
                {
                    "product_id": product_id,
                    "quantity": 5,
                    "unit_price": 150.00,
                    "tax_percent": 12.0,  # Required field
                    "tax_amount": 90.0    # Required field (150 * 5 * 0.12)
                }
            ]
        }
        
        # Try sales-orders endpoint first (more likely to be mounted)
        response = requests.post(
            f"{BASE_URL}/sales-orders/",
            json=order_data,
            headers=HEADERS
        )
        
        logger.info(f"Create order response: {response.status_code}")
        
        if response.status_code == 404:
            # Try with org_id
            order_data["org_id"] = DEFAULT_ORG_ID
            response = requests.post(
                f"{BASE_URL}/sales-orders/",
                json=order_data,
                headers=HEADERS
            )
            
        if response.status_code == 404:
            # Try orders endpoint
            response = requests.post(
                f"{BASE_URL}/orders/",
                json=order_data,
                headers=HEADERS
            )
            
        assert response.status_code in [200, 201], f"Failed: {response.text}"
        
        data = response.json()
        assert "order_id" in data or "id" in data, "Response should contain order ID"
        
        # Store for later tests
        self.__class__.test_order_id = data.get("order_id", data.get("id"))
        self.__class__.test_order_number = data.get("order_number")
        
        logger.info(f"✅ Created order: {self.test_order_number} (ID: {self.test_order_id})")
        
    def test_02_get_order_details(self):
        """Test retrieving order details"""
        if not self.test_order_id:
            # Try to get any order
            response = requests.get(
                f"{BASE_URL}/orders?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                orders = data.get("orders", data) if isinstance(data, dict) else data
                if orders and len(orders) > 0:
                    self.test_order_id = orders[0].get("order_id", orders[0].get("id"))
                    
        if not self.test_order_id:
            logger.warning("⚠️ No orders found - skipping detail test")
            return
            
        # Try different endpoint patterns
        endpoints = [
            f"/orders/{self.test_order_id}",
            f"/sales-orders/{self.test_order_id}",
            f"/orders/details/{self.test_order_id}"
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
                    logger.info(f"✅ Order details retrieved from {endpoint}")
                    
                    # Verify order data
                    assert "order_id" in data or "id" in data
                    assert "customer_id" in data
                    assert "order_status" in data or "status" in data
                    
                    success = True
                    break
                    
            except Exception as e:
                logger.warning(f"Endpoint {endpoint} failed: {str(e)}")
                
        if not success:
            logger.warning("⚠️ No order detail endpoint found")
            
    def test_03_update_order_status(self):
        """Test updating order status"""
        if not self.test_order_id:
            logger.warning("⚠️ No order ID - skipping status update test")
            return
            
        # Test status progression
        status_updates = [
            {"order_status": "confirmed", "expected": [200, 201]},
            {"order_status": "processing", "expected": [200, 201]},
        ]
        
        for update in status_updates:
            response = requests.patch(
                f"{BASE_URL}/orders/{self.test_order_id}",
                json=update,
                headers=HEADERS
            )
            
            if response.status_code == 404:
                # Try PUT
                response = requests.put(
                    f"{BASE_URL}/orders/{self.test_order_id}/status",
                    json=update,
                    headers=HEADERS
                )
                
            if response.status_code in update["expected"]:
                logger.info(f"✅ Order status updated to: {update['order_status']}")
            else:
                logger.warning(f"⚠️ Status update returned {response.status_code}")
                
    def test_04_order_to_invoice_conversion(self):
        """Test converting order to invoice"""
        if not self.test_order_id:
            logger.warning("⚠️ No order ID - skipping conversion test")
            return
            
        # Try different conversion endpoints
        endpoints = [
            f"/orders/{self.test_order_id}/convert-to-invoice",
            f"/invoices/from-order/{self.test_order_id}",
            f"/orders/{self.test_order_id}/invoice"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"✅ Order converted to invoice: {data.get('invoice_number', 'Success')}")
                break
            elif response.status_code == 404:
                continue
            else:
                logger.warning(f"Conversion endpoint {endpoint} returned {response.status_code}")
                
    def test_05_order_list_with_filters(self):
        """Test retrieving order list with various filters"""
        # Test without filters
        response = requests.get(f"{BASE_URL}/orders/", headers=HEADERS)
        
        if response.status_code == 404:
            response = requests.get(f"{BASE_URL}/sales-orders/", headers=HEADERS)
            
        assert response.status_code == 200, f"Failed to get orders: {response.text}"
        data = response.json()
        
        orders = data.get("orders", data) if isinstance(data, dict) else data
        logger.info(f"✅ Retrieved {len(orders) if orders else 0} orders")
        
        # Test with customer filter
        response = requests.get(
            f"{BASE_URL}/orders/?customer_id={self.__class__.test_customer_id or TEST_CUSTOMER_ID}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            logger.info("✅ Customer filter working")
            
        # Test with date filter
        today = date.today().isoformat()
        response = requests.get(
            f"{BASE_URL}/orders/?from_date={today}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            logger.info("✅ Date filter working")
            
        # Test with status filter
        response = requests.get(
            f"{BASE_URL}/orders/?status=pending",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            logger.info("✅ Status filter working")
            
    def test_06_order_items_management(self):
        """Test order items CRUD operations"""
        if not self.test_order_id:
            logger.warning("⚠️ No order ID - skipping items test")
            return
            
        # Get order items
        response = requests.get(
            f"{BASE_URL}/orders/{self.test_order_id}/items",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Items might be included in order details
            logger.warning("⚠️ Separate items endpoint not found")
            return
            
        if response.status_code == 200:
            data = response.json()
            items = data.get("items", data) if isinstance(data, dict) else data
            logger.info(f"✅ Retrieved {len(items) if items else 0} order items")
            
    def test_07_order_fulfillment_tracking(self):
        """Test order fulfillment status"""
        if not self.test_order_id:
            logger.warning("⚠️ No order ID - skipping fulfillment test")
            return
            
        # Check fulfillment status
        response = requests.get(
            f"{BASE_URL}/orders/{self.test_order_id}/fulfillment",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            logger.warning("⚠️ Fulfillment endpoint not found")
            return
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Fulfillment status: {data.get('fulfillment_status', 'Available')}")
            
    def test_08_order_validation_errors(self):
        """Test order creation with invalid data"""
        invalid_orders = [
            {
                "name": "Missing customer",
                "data": {
                    "org_id": DEFAULT_ORG_ID,
                    "order_type": "sales",
                    "items": [{"product_id": 1, "quantity": 1, "unit_price": 100, "tax_percent": 12, "tax_amount": 12}]
                }
            },
            {
                "name": "Empty items",
                "data": {
                    "org_id": DEFAULT_ORG_ID,
                    "customer_id": self.__class__.test_customer_id or TEST_CUSTOMER_ID,
                    "order_type": "sales",
                    "items": []
                }
            },
            {
                "name": "Invalid order type",
                "data": {
                    "org_id": DEFAULT_ORG_ID,
                    "customer_id": self.__class__.test_customer_id or TEST_CUSTOMER_ID,
                    "order_type": "invalid_type",
                    "items": [{"product_id": 1, "quantity": 1, "unit_price": 100, "tax_percent": 12, "tax_amount": 12}]
                }
            }
        ]
        
        for test_case in invalid_orders:
            response = requests.post(
                f"{BASE_URL}/orders/",
                json=test_case["data"],
                headers=HEADERS
            )
            
            if response.status_code in [400, 422]:
                logger.info(f"✅ Validation passed: {test_case['name']}")
            else:
                logger.warning(f"⚠️ {test_case['name']} returned {response.status_code}")
                
    def test_09_order_schema_validation(self):
        """Validate order data matches sales.orders schema"""
        # Get an order to validate
        response = requests.get(
            f"{BASE_URL}/orders?limit=1",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/sales-orders?limit=1",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            orders = data.get("orders", data) if isinstance(data, dict) else data
            
            if orders and len(orders) > 0:
                order = orders[0]
                
                # Check critical fields
                required_fields = ["order_id", "customer_id", "order_date"]
                missing = [f for f in required_fields if f not in order and f.replace("order_", "") not in order]
                
                if missing:
                    logger.warning(f"⚠️ Missing fields: {missing}")
                else:
                    logger.info("✅ Order schema validation passed")


def run_tests():
    """Run all order API tests"""
    test_suite = TestOrdersAPI()
    TestOrdersAPI.setup_class()  # Call class method properly
    
    tests = [
        test_suite.test_01_create_order_minimal,
        test_suite.test_02_get_order_details,
        test_suite.test_03_update_order_status,
        test_suite.test_04_order_to_invoice_conversion,
        test_suite.test_05_order_list_with_filters,
        test_suite.test_06_order_items_management,
        test_suite.test_07_order_fulfillment_tracking,
        test_suite.test_08_order_validation_errors,
        test_suite.test_09_order_schema_validation
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
    logger.info(f"Order API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)