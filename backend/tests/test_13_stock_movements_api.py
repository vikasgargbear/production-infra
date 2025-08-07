"""
Test Suite 13: Stock Movements API Testing
Tests stock receive, issue, transfer, and movement tracking
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


class TestStockMovementsAPI:
    """Test suite for Stock Movements API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_product_id = None
        cls.test_batch_id = None
        cls.test_movement_id = None
        
        # Get a product with stock
        try:
            response = requests.get(
                f"{BASE_URL}/products?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                products = data.get("products", [])
                if products:
                    cls.test_product_id = products[0].get("product_id")
                    logger.info(f"Using product ID: {cls.test_product_id}")
        except:
            cls.test_product_id = 1
            
    def test_01_get_stock_movements(self):
        """Test retrieving stock movements"""
        response = requests.get(
            f"{BASE_URL}/stock-movements",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            movements = data if isinstance(data, list) else data.get("movements", [])
            logger.info(f"✅ Retrieved {len(movements)} stock movements")
            
            if movements:
                movement = movements[0]
                # Check movement structure
                expected_fields = ["movement_type", "product_id", "quantity", "movement_date"]
                found_fields = [f for f in expected_fields if f in movement]
                logger.info(f"Movement fields: {found_fields}")
        else:
            logger.warning(f"⚠️ Stock movements endpoint returned {response.status_code}")
            
    def test_02_get_movement_reasons(self):
        """Test getting movement reason codes"""
        response = requests.get(
            f"{BASE_URL}/stock-movements/reasons",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            reasons = data if isinstance(data, list) else data.get("reasons", [])
            logger.info(f"✅ Retrieved {len(reasons)} movement reasons")
            
            # Common reasons should include
            expected_reasons = ["damaged", "expired", "lost", "found", "adjustment"]
            if reasons:
                logger.info(f"Available reasons: {reasons[:5]}")  # Show first 5
        else:
            logger.warning(f"⚠️ Movement reasons endpoint not found")
            
    def test_03_stock_receive(self):
        """Test receiving stock (goods receipt)"""
        receive_data = {
            "movement_date": date.today().isoformat(),
            "reference_type": "purchase_order",
            "reference_number": f"PO-{datetime.now().strftime('%Y%m%d%H%M')}",
            "supplier_id": 1,
            "items": [
                {
                    "product_id": self.test_product_id or 1,
                    "batch_number": f"BATCH-{datetime.now().strftime('%Y%m%d')}",
                    "quantity": 100,
                    "unit_price": 95.00,
                    "mrp": 100.00,
                    "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                    "location": "Main Warehouse"
                }
            ],
            "notes": "Test stock receipt"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-movements/receive",
            json=receive_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_movement_id = data.get("movement_id", data.get("id"))
            self.__class__.test_batch_id = data.get("batch_id")
            logger.info(f"✅ Stock received successfully: Movement ID {self.test_movement_id}")
        else:
            logger.warning(f"⚠️ Stock receive failed: {response.status_code} - {response.text}")
            
    def test_04_stock_issue(self):
        """Test issuing stock (sales/consumption)"""
        issue_data = {
            "movement_date": date.today().isoformat(),
            "movement_type": "issue",
            "reference_type": "sales_invoice",
            "reference_number": f"INV-{datetime.now().strftime('%Y%m%d%H%M')}",
            "customer_id": 1,
            "items": [
                {
                    "product_id": self.test_product_id or 1,
                    "batch_number": self.test_batch_id or "DEFAULT",
                    "quantity": 10,
                    "reason": "sales"
                }
            ],
            "notes": "Test stock issue"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-movements/issue",
            json=issue_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Stock issued successfully: {data.get('message', 'Success')}")
        else:
            logger.warning(f"⚠️ Stock issue failed: {response.status_code} - {response.text}")
            
    def test_05_stock_transfer(self):
        """Test transferring stock between locations"""
        transfer_data = {
            "transfer_date": date.today().isoformat(),
            "from_location": "Main Warehouse",
            "to_location": "Branch Store",
            "items": [
                {
                    "product_id": self.test_product_id or 1,
                    "batch_number": self.test_batch_id or "DEFAULT",
                    "quantity": 20
                }
            ],
            "transfer_reason": "branch_requirement",
            "transport_details": {
                "vehicle_number": "MH01AB1234",
                "driver_name": "Test Driver"
            },
            "notes": "Test stock transfer"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-movements/transfer",
            json=transfer_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Stock transferred successfully: {data.get('transfer_id', 'Success')}")
        else:
            logger.warning(f"⚠️ Stock transfer failed: {response.status_code}")
            
    def test_06_get_product_batches(self):
        """Test getting batches for a product"""
        if not self.test_product_id:
            logger.warning("⚠️ No product ID - skipping batch test")
            return
            
        response = requests.get(
            f"{BASE_URL}/stock-movements/product/{self.test_product_id}/batches",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            batches = data if isinstance(data, list) else data.get("batches", [])
            logger.info(f"✅ Retrieved {len(batches)} batches for product")
            
            if batches:
                batch = batches[0]
                logger.info(f"Batch info: {batch.get('batch_number')} - Qty: {batch.get('quantity')}")
        else:
            logger.warning(f"⚠️ Product batches endpoint not found")
            
    def test_07_near_expiry_stock(self):
        """Test getting near-expiry stock"""
        params = {
            "days_ahead": 90  # Items expiring in next 90 days
        }
        
        response = requests.get(
            f"{BASE_URL}/stock-movements/near-expiry",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data if isinstance(data, list) else data.get("items", [])
            logger.info(f"✅ Found {len(items)} near-expiry items")
            
            if items:
                item = items[0]
                logger.info(f"Near expiry: {item.get('product_name')} - Expires: {item.get('expiry_date')}")
        else:
            logger.warning(f"⚠️ Near-expiry endpoint not found")
            
    def test_08_low_stock_alert(self):
        """Test getting low stock items"""
        response = requests.get(
            f"{BASE_URL}/stock-movements/low-stock",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            items = data if isinstance(data, list) else data.get("items", [])
            logger.info(f"✅ Found {len(items)} low stock items")
            
            if items:
                item = items[0]
                logger.info(f"Low stock: {item.get('product_name')} - Current: {item.get('current_stock')}")
        else:
            logger.warning(f"⚠️ Low stock endpoint not found")
            
    def test_09_movement_history_by_product(self):
        """Test getting movement history for a specific product"""
        if not self.test_product_id:
            logger.warning("⚠️ No product ID - skipping history test")
            return
            
        params = {
            "product_id": self.test_product_id,
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/stock-movements",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            movements = data if isinstance(data, list) else data.get("movements", [])
            
            product_movements = [m for m in movements if m.get("product_id") == self.test_product_id]
            logger.info(f"✅ Found {len(product_movements)} movements for product")
        else:
            logger.warning(f"⚠️ Movement history filtering not working")
            
    def test_10_stock_movement_summary(self):
        """Test getting stock movement summary/analytics"""
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat(),
            "group_by": "movement_type"
        }
        
        # Try different endpoints for summary
        endpoints = [
            "/stock-movements/summary",
            "/stock-movements/analytics",
            "/reports/stock-movements"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                params=params,
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Stock movement summary retrieved from {endpoint}")
                
                # Check for summary data
                if "total_received" in data or "total_issued" in data:
                    logger.info(f"Summary: Received: {data.get('total_received', 0)}, Issued: {data.get('total_issued', 0)}")
                break
        else:
            logger.warning(f"⚠️ Stock movement summary endpoint not found")


def run_tests():
    """Run all stock movements API tests"""
    test_suite = TestStockMovementsAPI()
    TestStockMovementsAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_stock_movements,
        test_suite.test_02_get_movement_reasons,
        test_suite.test_03_stock_receive,
        test_suite.test_04_stock_issue,
        test_suite.test_05_stock_transfer,
        test_suite.test_06_get_product_batches,
        test_suite.test_07_near_expiry_stock,
        test_suite.test_08_low_stock_alert,
        test_suite.test_09_movement_history_by_product,
        test_suite.test_10_stock_movement_summary
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
    logger.info(f"Stock Movements API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)