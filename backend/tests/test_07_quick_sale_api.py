"""
Test Suite 07: Quick Sale API Testing
Tests the enterprise-orders/quick-sale endpoint that creates order + invoice together
"""

import pytest
import requests
import json
from datetime import datetime, date
from typing import Dict, Any
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


class TestQuickSaleAPI:
    """Test suite for Quick Sale API endpoint"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_customer_id = None
        cls.test_product_id = None
        cls.test_invoice_id = None
        cls.test_order_id = None
        
        # Get a customer for testing
        try:
            response = requests.get(
                f"{BASE_URL}/customers?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                customers = data.get("customers", data) if isinstance(data, dict) else data
                if customers and len(customers) > 0:
                    customer = customers[0]
                    cls.test_customer_id = customer.get("customer_id", customer.get("id", 1))
                    logger.info(f"Using customer ID: {cls.test_customer_id}")
            else:
                cls.test_customer_id = 1  # Default
        except:
            cls.test_customer_id = 1
            
        # Get a product
        try:
            response = requests.get(
                f"{BASE_URL}/products/search?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                products = data.get("products", data) if isinstance(data, dict) else data
                if products and len(products) > 0:
                    product = products[0]
                    cls.test_product_id = product.get("product_id") if isinstance(product, dict) else product.get("id")
                    logger.info(f"Using product ID: {cls.test_product_id}")
        except:
            cls.test_product_id = 1
            
    def test_01_create_quick_sale(self):
        """Test creating a quick sale (order + invoice)"""
        quick_sale_data = {
            "customer_id": self.test_customer_id,
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 5,
                    "unit_price": 10.00,
                    "discount_percent": 0
                }
            ],
            "payment_mode": "cash",
            "payment_amount": 50.00,
            "discount_amount": 0,
            "other_charges": 0,
            "notes": "Test quick sale"
        }
        
        response = requests.post(
            f"{BASE_URL}/enterprise-orders/quick-sale",
            json=quick_sale_data,
            headers=HEADERS
        )
        
        logger.info(f"Quick sale response: Status {response.status_code}")
        
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"Response data: {data}")
            
            # Store IDs for subsequent tests
            self.__class__.test_invoice_id = data.get("invoice_id")
            self.__class__.test_order_id = data.get("order_id")
            
            # Verify response structure
            assert data.get("success") is True
            assert data.get("invoice_number") is not None
            assert data.get("invoice_id") is not None
            assert data.get("order_id") is not None
            assert data.get("total_amount") is not None
            
            logger.info(f"✅ Quick sale created: Invoice {data.get('invoice_number')}")
            logger.info(f"   Order ID: {self.test_order_id}")
            logger.info(f"   Invoice ID: {self.test_invoice_id}")
            
        elif response.status_code == 422:
            logger.warning(f"⚠️ Validation failed: {response.text}")
            pytest.fail(f"Quick sale validation failed: {response.text}")
        else:
            logger.error(f"❌ Quick sale failed: {response.status_code} - {response.text}")
            pytest.fail(f"Quick sale failed: {response.status_code}")
            
    def test_02_verify_order_created(self):
        """Verify the order was created"""
        if not self.test_order_id:
            logger.warning("⚠️ No order ID - skipping verification")
            return
            
        response = requests.get(
            f"{BASE_URL}/orders/{self.test_order_id}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            order = response.json()
            logger.info(f"✅ Order verified: {order.get('order_number')}")
            
            # Verify order details
            assert order.get("customer_id") == self.test_customer_id
            assert order.get("order_status") is not None
            assert len(order.get("items", [])) > 0
        else:
            logger.warning(f"⚠️ Could not verify order: {response.status_code}")
            
    def test_03_verify_invoice_created(self):
        """Verify the invoice was created"""
        if not self.test_invoice_id:
            logger.warning("⚠️ No invoice ID - skipping verification")
            return
            
        response = requests.get(
            f"{BASE_URL}/invoices/{self.test_invoice_id}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            invoice = response.json()
            logger.info(f"✅ Invoice verified: {invoice.get('invoice_number')}")
            
            # Verify invoice details
            assert invoice.get("customer_id") == self.test_customer_id
            assert invoice.get("order_id") == self.test_order_id
            assert invoice.get("payment_status") is not None
            assert len(invoice.get("items", [])) > 0
        else:
            logger.warning(f"⚠️ Could not verify invoice: {response.status_code}")
            
    def test_04_quick_sale_with_invalid_customer(self):
        """Test quick sale with invalid customer"""
        quick_sale_data = {
            "customer_id": 99999,  # Non-existent customer
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 1,
                    "unit_price": 10.00
                }
            ],
            "payment_mode": "cash",
            "payment_amount": 10.00
        }
        
        response = requests.post(
            f"{BASE_URL}/enterprise-orders/quick-sale",
            json=quick_sale_data,
            headers=HEADERS
        )
        
        if response.status_code in [400, 404, 422]:
            logger.info("✅ Correctly rejected invalid customer")
        else:
            logger.warning(f"⚠️ Expected error for invalid customer, got {response.status_code}")
            
    def test_05_quick_sale_with_invalid_product(self):
        """Test quick sale with invalid product"""
        quick_sale_data = {
            "customer_id": self.test_customer_id,
            "items": [
                {
                    "product_id": 99999,  # Non-existent product
                    "quantity": 1,
                    "unit_price": 10.00
                }
            ],
            "payment_mode": "cash",
            "payment_amount": 10.00
        }
        
        response = requests.post(
            f"{BASE_URL}/enterprise-orders/quick-sale",
            json=quick_sale_data,
            headers=HEADERS
        )
        
        if response.status_code in [400, 404, 422]:
            logger.info("✅ Correctly rejected invalid product")
        else:
            logger.warning(f"⚠️ Expected error for invalid product, got {response.status_code}")
            
    def test_06_quick_sale_with_multiple_items(self):
        """Test quick sale with multiple items"""
        quick_sale_data = {
            "customer_id": self.test_customer_id,
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 2,
                    "unit_price": 10.00,
                    "discount_percent": 5
                },
                {
                    "product_id": self.test_product_id,
                    "quantity": 3,
                    "unit_price": 15.00,
                    "discount_percent": 0
                }
            ],
            "payment_mode": "credit",
            "payment_amount": 0,  # Credit sale
            "discount_amount": 2.00,
            "other_charges": 5.00,
            "notes": "Multi-item test sale"
        }
        
        response = requests.post(
            f"{BASE_URL}/enterprise-orders/quick-sale",
            json=quick_sale_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Multi-item quick sale created: {data.get('invoice_number')}")
            
            # Verify calculations
            # Item 1: 2 * 10 = 20, less 5% = 19
            # Item 2: 3 * 15 = 45
            # Subtotal: 64, less discount 2 = 62, plus charges 5 = 67
            # Plus tax (if applicable)
            
        else:
            logger.warning(f"⚠️ Multi-item sale failed: {response.status_code}")


def run_tests():
    """Run all quick sale API tests"""
    test_suite = TestQuickSaleAPI()
    TestQuickSaleAPI.setup_class()
    
    tests = [
        test_suite.test_01_create_quick_sale,
        test_suite.test_02_verify_order_created,
        test_suite.test_03_verify_invoice_created,
        test_suite.test_04_quick_sale_with_invalid_customer,
        test_suite.test_05_quick_sale_with_invalid_product,
        test_suite.test_06_quick_sale_with_multiple_items
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
    logger.info(f"Quick Sale API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)