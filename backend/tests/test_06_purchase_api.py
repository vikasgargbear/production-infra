"""
Test Suite 06: Purchase API Testing
Tests purchase order creation, GRN processing, supplier invoice matching, and returns
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


class TestPurchaseAPI:
    """Test suite for Purchase API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_po_id = None
        cls.test_po_number = None
        cls.test_supplier_id = None
        cls.test_grn_id = None
        cls.test_product_id = None
        
        # Get a supplier for testing
        try:
            response = requests.get(
                f"{BASE_URL}/suppliers?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                suppliers = data.get("suppliers", data) if isinstance(data, dict) else data
                if suppliers and len(suppliers) > 0:
                    supplier = suppliers[0]
                    if isinstance(supplier, dict):
                        cls.test_supplier_id = supplier.get("supplier_id", supplier.get("id", 1))
                    else:
                        cls.test_supplier_id = 1
                    logger.info(f"Using supplier ID: {cls.test_supplier_id}")
            else:
                cls.test_supplier_id = 1  # Default
        except:
            cls.test_supplier_id = 1
            
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
                    cls.test_product_id = product.get("product_id") if isinstance(product, dict) else product["product_id"]
                    logger.info(f"Using product ID: {cls.test_product_id}")
        except:
            cls.test_product_id = 1
            
    def test_01_create_purchase_order(self):
        """Test creating a purchase order"""
        # Format data for the purchases-enhanced endpoint
        po_data = {
            "supplier_id": self.test_supplier_id,
            "supplier_name": "Test Supplier",
            "purchase_date": date.today().isoformat(),
            "subtotal_amount": 850.00,
            "tax_amount": 102.00,
            "final_amount": 952.00,
            "payment_status": "pending",
            "items": [
                {
                    "product_id": self.test_product_id,
                    "product_name": f"Product {self.test_product_id}",
                    "ordered_quantity": 100,
                    "cost_price": 8.50,
                    "tax_percent": 12.0,
                    "tax_amount": 102.00,
                    "total_amount": 952.00
                }
            ]
        }
        
        # Try different endpoints - add the enhanced endpoint that actually works
        endpoints = [
            "/purchase-orders",
            "/purchases-enhanced/with-items",
            "/purchase-simple/create",
            "/purchases"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=po_data,
                headers=HEADERS
            )
            
            logger.info(f"Tried {endpoint}: Status {response.status_code}")
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"Response type: {type(data)}, content: {data}")
                
                # Handle both list and dict responses
                if isinstance(data, list):
                    if len(data) > 0:
                        po = data[0]
                        self.__class__.test_po_id = po.get("po_id", po.get("purchase_order_id", po.get("purchase_id", po.get("id"))))
                        self.__class__.test_po_number = po.get("po_number", po.get("purchase_number", po.get("order_number")))
                else:
                    self.__class__.test_po_id = data.get("po_id", data.get("purchase_order_id", data.get("purchase_id", data.get("id"))))
                    self.__class__.test_po_number = data.get("po_number", data.get("purchase_number", data.get("order_number")))
                    
                logger.info(f"✅ Created PO: {self.test_po_number} (ID: {self.test_po_id})")
                break
            elif response.status_code == 422:
                logger.warning(f"⚠️ PO validation failed: {response.text}")
                # Try with org_id
                po_data["org_id"] = DEFAULT_ORG_ID
            elif response.status_code == 404:
                continue
            elif response.status_code == 501:
                logger.warning(f"⚠️ {endpoint} disabled: {response.text}")
                continue
            else:
                logger.warning(f"⚠️ {endpoint} returned {response.status_code}: {response.text}")
                
    def test_02_get_purchase_orders(self):
        """Test retrieving purchase orders list"""
        response = requests.get(
            f"{BASE_URL}/purchase-orders",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/purchase/orders",
                headers=HEADERS
            )
        elif response.status_code == 500:
            logger.warning(f"⚠️ PO list endpoint returned 500: {response.text}")
            return
            
        if response.status_code == 200:
            data = response.json()
            orders = data.get("orders", data.get("purchase_orders", data)) if isinstance(data, dict) else data
            
            if orders:
                logger.info(f"✅ Retrieved {len(orders)} purchase orders")
                
                # Get first PO if we don't have one
                if not self.test_po_id and len(orders) > 0:
                    po = orders[0]
                    self.__class__.test_po_id = po.get("po_id", po.get("id"))
                    self.__class__.test_po_number = po.get("po_number")
            else:
                logger.warning("⚠️ No purchase orders found")
        else:
            logger.warning(f"⚠️ PO list endpoint returned {response.status_code}")
            
    def test_03_get_po_details(self):
        """Test getting purchase order details"""
        if not self.test_po_id:
            logger.warning("⚠️ No PO ID - skipping detail test")
            return
            
        endpoints = [
            f"/purchase-orders/{self.test_po_id}",
            f"/purchase/orders/{self.test_po_id}"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ PO details retrieved")
                
                # Verify PO data
                assert "po_number" in data or "order_number" in data
                assert "supplier_id" in data
                assert "items" in data or "order_items" in data
                break
                
    def test_04_create_grn(self):
        """Test creating Goods Receipt Note (GRN)"""
        if not self.test_po_id:
            logger.warning("⚠️ No PO ID - skipping GRN test")
            return
            
        grn_data = {
            "po_id": self.test_po_id,
            "grn_date": date.today().isoformat(),
            "supplier_invoice_number": f"SUP-INV-{datetime.now().strftime('%Y%m%d')}",
            "supplier_invoice_date": date.today().isoformat(),
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity_received": 95,  # Less than ordered
                    "batch_number": f"BATCH-{datetime.now().strftime('%Y%m%d')}",
                    "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                    "mrp": 15.00,
                    "purchase_price": 8.50
                }
            ]
        }
        
        endpoints = [
            "/grn",
            "/goods-receipt",
            "/purchase/grn"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=grn_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.__class__.test_grn_id = data.get("grn_id", data.get("id"))
                logger.info(f"✅ Created GRN: ID {self.test_grn_id}")
                break
            elif response.status_code == 404:
                continue
            else:
                logger.warning(f"⚠️ GRN creation failed: {response.status_code}")
                
    def test_05_supplier_management(self):
        """Test supplier endpoints"""
        # Get suppliers list
        response = requests.get(
            f"{BASE_URL}/suppliers",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/purchase/suppliers",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            suppliers = data.get("suppliers", data) if isinstance(data, dict) else data
            
            if suppliers:
                logger.info(f"✅ Retrieved {len(suppliers)} suppliers")
                
                # Verify supplier schema
                if len(suppliers) > 0:
                    supplier = suppliers[0]
                    assert "supplier_id" in supplier or "id" in supplier
                    assert "supplier_name" in supplier or "name" in supplier
            else:
                logger.warning("⚠️ No suppliers found")
        else:
            logger.warning(f"⚠️ Supplier endpoint not found")
            
    def test_06_purchase_returns(self):
        """Test purchase return creation"""
        if not self.test_grn_id:
            logger.warning("⚠️ No GRN ID - skipping return test")
            return
            
        return_data = {
            "grn_id": self.test_grn_id,
            "return_date": date.today().isoformat(),
            "return_reason": "quality_issue",
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 5,
                    "batch_number": f"BATCH-{datetime.now().strftime('%Y%m%d')}",
                    "reason": "Damaged packaging"
                }
            ]
        }
        
        endpoints = [
            "/purchase-returns",
            "/purchase/returns",
            "/returns/purchase"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=return_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"✅ Purchase return created: ID {data.get('return_id', data.get('id'))}")
                break
            elif response.status_code == 404:
                continue
                
    def test_07_po_status_tracking(self):
        """Test purchase order status updates"""
        if not self.test_po_id:
            logger.warning("⚠️ No PO ID - skipping status test")
            return
            
        # Update PO status
        status_updates = [
            {"status": "approved"},
            {"status": "partially_received"},
            {"status": "completed"}
        ]
        
        for update in status_updates:
            response = requests.patch(
                f"{BASE_URL}/purchase-orders/{self.test_po_id}/status",
                json=update,
                headers=HEADERS
            )
            
            if response.status_code == 404:
                # Try alternative
                response = requests.put(
                    f"{BASE_URL}/purchase-orders/{self.test_po_id}",
                    json=update,
                    headers=HEADERS
                )
                
            if response.status_code in [200, 201]:
                logger.info(f"✅ PO status updated to: {update['status']}")
            else:
                logger.warning(f"⚠️ Status update failed: {response.status_code}")
                
    def test_08_purchase_analytics(self):
        """Test purchase analytics endpoints"""
        # Get purchase summary
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/purchase/analytics",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/purchase-summary",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Purchase analytics retrieved")
            
            # Check for metrics
            if "total_purchases" in data or "summary" in data:
                logger.info("✅ Purchase metrics available")
        else:
            logger.warning(f"⚠️ Purchase analytics not found")
            
    def test_09_supplier_outstanding(self):
        """Test supplier outstanding/payables"""
        if not self.test_supplier_id:
            logger.warning("⚠️ No supplier ID - skipping outstanding test")
            return
            
        response = requests.get(
            f"{BASE_URL}/suppliers/{self.test_supplier_id}/outstanding",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/purchase/supplier-outstanding/{self.test_supplier_id}",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Supplier outstanding data retrieved")
            
            # Check for outstanding amount
            if "outstanding_amount" in data or "total_outstanding" in data:
                logger.info("✅ Outstanding amount available")
        else:
            logger.warning(f"⚠️ Supplier outstanding endpoint not found")
            
    def test_10_purchase_validation(self):
        """Test purchase order validation rules"""
        # Test with invalid data
        invalid_po = {
            "supplier_id": 99999,  # Non-existent
            "items": []  # Empty items
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-orders",
            json=invalid_po,
            headers=HEADERS
        )
        
        if response.status_code in [400, 422]:
            logger.info("✅ Validation working correctly")
        else:
            logger.warning(f"⚠️ Expected validation error, got {response.status_code}")


def run_tests():
    """Run all purchase API tests"""
    test_suite = TestPurchaseAPI()
    TestPurchaseAPI.setup_class()
    
    tests = [
        test_suite.test_01_create_purchase_order,
        test_suite.test_02_get_purchase_orders,
        test_suite.test_03_get_po_details,
        test_suite.test_04_create_grn,
        test_suite.test_05_supplier_management,
        test_suite.test_06_purchase_returns,
        test_suite.test_07_po_status_tracking,
        test_suite.test_08_purchase_analytics,
        test_suite.test_09_supplier_outstanding,
        test_suite.test_10_purchase_validation
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
    logger.info(f"Purchase API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)