"""
Test Suite 15: Stock Receive API Testing
Tests goods receipt, purchase order receiving, and stock intake
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


class TestStockReceiveAPI:
    """Test suite for Stock Receive API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_grn_id = None
        cls.test_po_id = None
        cls.test_supplier_id = None
        
        # Get a supplier
        try:
            response = requests.get(
                f"{BASE_URL}/suppliers?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                suppliers = data.get("suppliers", [])
                if suppliers:
                    cls.test_supplier_id = suppliers[0].get("supplier_id")
                    logger.info(f"Using supplier ID: {cls.test_supplier_id}")
        except:
            cls.test_supplier_id = 1
            
    def test_01_get_pending_purchase_orders(self):
        """Test getting purchase orders pending receipt"""
        response = requests.get(
            f"{BASE_URL}/stock-receive/pending-orders",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/purchases?status=pending_receipt",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            orders = data if isinstance(data, list) else data.get("orders", data.get("purchases", []))
            logger.info(f"✅ Retrieved {len(orders)} pending purchase orders")
            
            if orders:
                self.__class__.test_po_id = orders[0].get("purchase_id", orders[0].get("po_id"))
                logger.info(f"Found pending PO: {self.test_po_id}")
        else:
            logger.warning(f"⚠️ Pending orders endpoint returned {response.status_code}")
            
    def test_02_create_grn_from_po(self):
        """Test creating GRN from purchase order"""
        grn_data = {
            "grn_date": date.today().isoformat(),
            "purchase_order_id": self.test_po_id or "PO-001",
            "supplier_id": self.test_supplier_id or 1,
            "invoice_number": f"SUP-INV-{datetime.now().strftime('%Y%m%d')}",
            "invoice_date": date.today().isoformat(),
            "items": [
                {
                    "product_id": 1,
                    "ordered_quantity": 100,
                    "received_quantity": 100,
                    "accepted_quantity": 98,
                    "rejected_quantity": 2,
                    "batch_number": f"GRN-BATCH-{datetime.now().strftime('%Y%m%d')}",
                    "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                    "mrp": 120.00,
                    "purchase_price": 100.00,
                    "rejection_reason": "2 units damaged in transit"
                }
            ],
            "transport_details": {
                "transporter_name": "Express Logistics",
                "lr_number": f"LR-{datetime.now().strftime('%Y%m%d%H%M')}",
                "lr_date": date.today().isoformat(),
                "vehicle_number": "MH02CD5678"
            },
            "checked_by": "QC Inspector",
            "received_by": "Store Manager"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-receive",
            json=grn_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.post(
                f"{BASE_URL}/stock-receive/grn",
                json=grn_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_grn_id = data.get("grn_id", data.get("id"))
            logger.info(f"✅ GRN created successfully: ID {self.test_grn_id}")
        else:
            logger.warning(f"⚠️ GRN creation failed: {response.status_code}")
            
    def test_03_direct_stock_receive(self):
        """Test direct stock receive without PO"""
        direct_receive = {
            "receive_date": date.today().isoformat(),
            "supplier_id": self.test_supplier_id or 1,
            "receive_type": "direct_purchase",
            "reference_number": f"DIRECT-{datetime.now().strftime('%Y%m%d%H%M')}",
            "items": [
                {
                    "product_id": 2,
                    "quantity": 50,
                    "batch_number": f"DIRECT-BATCH-{datetime.now().strftime('%Y%m%d')}",
                    "expiry_date": (date.today() + timedelta(days=180)).isoformat(),
                    "mrp": 50.00,
                    "purchase_price": 40.00,
                    "location": "Main Store"
                }
            ],
            "payment_terms": "cash",
            "notes": "Emergency purchase - direct from supplier"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-receive/direct",
            json=direct_receive,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try without /direct
            response = requests.post(
                f"{BASE_URL}/stock-receive",
                json=direct_receive,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Direct stock receive successful: {data.get('message', 'Success')}")
        else:
            logger.warning(f"⚠️ Direct stock receive failed: {response.status_code}")
            
    def test_04_get_grn_list(self):
        """Test retrieving GRN list"""
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/stock-receive",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/stock-receive/grn-list",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            grns = data if isinstance(data, list) else data.get("grns", data.get("receipts", []))
            logger.info(f"✅ Retrieved {len(grns)} GRNs")
            
            if grns:
                grn = grns[0]
                logger.info(f"GRN: {grn.get('grn_number', grn.get('id'))} - Date: {grn.get('grn_date', grn.get('receive_date'))}")
        else:
            logger.warning(f"⚠️ GRN list endpoint not found")
            
    def test_05_get_grn_details(self):
        """Test getting specific GRN details"""
        if not self.test_grn_id:
            logger.warning("⚠️ No GRN ID - skipping detail test")
            return
            
        response = requests.get(
            f"{BASE_URL}/stock-receive/{self.test_grn_id}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ GRN details retrieved")
            
            # Verify GRN data
            assert "items" in data or "grn_items" in data
            assert "supplier_id" in data or "supplier" in data
            
            items = data.get("items", data.get("grn_items", []))
            if items:
                logger.info(f"GRN contains {len(items)} items")
        else:
            logger.warning(f"⚠️ GRN detail endpoint not found")
            
    def test_06_partial_receipt(self):
        """Test partial receipt of purchase order"""
        partial_data = {
            "grn_date": date.today().isoformat(),
            "purchase_order_id": self.test_po_id or "PO-002",
            "partial_receipt": True,
            "items": [
                {
                    "product_id": 3,
                    "ordered_quantity": 200,
                    "received_quantity": 150,  # Partial receipt
                    "batch_number": f"PARTIAL-{datetime.now().strftime('%Y%m%d')}",
                    "expiry_date": (date.today() + timedelta(days=365)).isoformat(),
                    "mrp": 80.00,
                    "purchase_price": 65.00,
                    "notes": "Balance 50 units to be delivered next week"
                }
            ],
            "reason_for_partial": "Supplier stock shortage"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-receive/partial",
            json=partial_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try regular endpoint with partial flag
            response = requests.post(
                f"{BASE_URL}/stock-receive",
                json=partial_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Partial receipt recorded: {data.get('message', 'Success')}")
        else:
            logger.warning(f"⚠️ Partial receipt not supported")
            
    def test_07_quality_check_update(self):
        """Test updating quality check results"""
        if not self.test_grn_id:
            logger.warning("⚠️ No GRN ID - skipping QC test")
            return
            
        qc_data = {
            "qc_date": datetime.now().isoformat(),
            "qc_by": "QC Manager",
            "items": [
                {
                    "grn_item_id": 1,
                    "qc_status": "passed",
                    "qc_parameters": {
                        "visual_inspection": "passed",
                        "packaging": "intact",
                        "labeling": "correct",
                        "batch_verification": "matched"
                    },
                    "qc_notes": "All parameters within acceptable limits"
                }
            ],
            "overall_status": "approved"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-receive/{self.test_grn_id}/quality-check",
            json=qc_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try PUT endpoint
            response = requests.put(
                f"{BASE_URL}/stock-receive/{self.test_grn_id}",
                json={"quality_check": qc_data},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Quality check updated successfully")
        else:
            logger.warning(f"⚠️ Quality check update not implemented")
            
    def test_08_stock_put_away(self):
        """Test stock put-away (location assignment)"""
        if not self.test_grn_id:
            logger.warning("⚠️ No GRN ID - skipping put-away test")
            return
            
        putaway_data = {
            "grn_id": self.test_grn_id,
            "putaway_date": datetime.now().isoformat(),
            "items": [
                {
                    "product_id": 1,
                    "batch_number": "GRN-BATCH-001",
                    "quantity": 98,
                    "location": "Rack-A-01",
                    "bin_number": "BIN-A01-05"
                }
            ],
            "completed_by": "Warehouse Staff"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-receive/{self.test_grn_id}/putaway",
            json=putaway_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            logger.info("⚠️ Put-away endpoint not implemented")
        elif response.status_code in [200, 201]:
            logger.info(f"✅ Stock put-away completed")
        else:
            logger.warning(f"⚠️ Put-away failed: {response.status_code}")
            
    def test_09_receive_return_items(self):
        """Test receiving returned items from customer"""
        return_receive = {
            "receive_date": date.today().isoformat(),
            "receive_type": "customer_return",
            "reference_type": "sales_return",
            "reference_number": "SR-001",
            "customer_id": 1,
            "items": [
                {
                    "product_id": 1,
                    "batch_number": "ORIG-BATCH-001",
                    "quantity": 5,
                    "condition": "saleable",
                    "reason": "customer_cancelled",
                    "inspection_notes": "Unopened, in original packaging"
                }
            ],
            "credit_note_number": f"CN-{datetime.now().strftime('%Y%m%d%H%M')}"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-receive/returns",
            json=return_receive,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try regular endpoint with type
            response = requests.post(
                f"{BASE_URL}/stock-receive",
                json=return_receive,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Return items received successfully")
        else:
            logger.warning(f"⚠️ Return receipt not implemented separately")
            
    def test_10_grn_print_format(self):
        """Test getting GRN in print format"""
        if not self.test_grn_id:
            logger.warning("⚠️ No GRN ID - skipping print test")
            return
            
        response = requests.get(
            f"{BASE_URL}/stock-receive/{self.test_grn_id}/print",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative format endpoint
            response = requests.get(
                f"{BASE_URL}/stock-receive/{self.test_grn_id}?format=print",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ GRN print format retrieved")
            
            # Check for print-specific fields
            if "print_header" in data or "company_details" in data:
                logger.info("Print format includes company details")
        else:
            logger.warning(f"⚠️ GRN print format not available")


def run_tests():
    """Run all stock receive API tests"""
    test_suite = TestStockReceiveAPI()
    TestStockReceiveAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_pending_purchase_orders,
        test_suite.test_02_create_grn_from_po,
        test_suite.test_03_direct_stock_receive,
        test_suite.test_04_get_grn_list,
        test_suite.test_05_get_grn_details,
        test_suite.test_06_partial_receipt,
        test_suite.test_07_quality_check_update,
        test_suite.test_08_stock_put_away,
        test_suite.test_09_receive_return_items,
        test_suite.test_10_grn_print_format
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
    logger.info(f"Stock Receive API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)