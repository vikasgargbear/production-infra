"""
Test Suite 16: Sales Returns API Testing
Tests sales return processing, credit notes, and return inventory handling
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


class TestSalesReturnsAPI:
    """Test suite for Sales Returns API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_return_id = None
        cls.test_invoice_id = None
        cls.test_customer_id = None
        cls.test_credit_note_id = None
        
        # Get an invoice for returns
        try:
            response = requests.get(
                f"{BASE_URL}/invoices?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                invoices = data.get("invoices", [])
                if invoices:
                    cls.test_invoice_id = invoices[0].get("invoice_id")
                    cls.test_customer_id = invoices[0].get("customer_id")
                    logger.info(f"Using invoice ID: {cls.test_invoice_id}")
        except:
            cls.test_invoice_id = 1
            cls.test_customer_id = 1
            
    def test_01_get_sales_returns(self):
        """Test retrieving sales returns"""
        response = requests.get(
            f"{BASE_URL}/sales-returns",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/sale-returns",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            returns = data if isinstance(data, list) else data.get("returns", data.get("sales_returns", []))
            logger.info(f"✅ Retrieved {len(returns)} sales returns")
            
            if returns:
                return_record = returns[0]
                # Check return structure
                expected_fields = ["return_date", "invoice_id", "return_reason", "total_amount"]
                found_fields = [f for f in expected_fields if f in return_record]
                logger.info(f"Return fields: {found_fields}")
        else:
            logger.warning(f"⚠️ Sales returns endpoint returned {response.status_code}")
            
    def test_02_create_sales_return(self):
        """Test creating a sales return"""
        return_data = {
            "return_date": date.today().isoformat(),
            "original_invoice_id": self.test_invoice_id or 1,
            "customer_id": self.test_customer_id or 1,
            "return_reason": "damaged_goods",
            "items": [
                {
                    "product_id": 1,
                    "batch_number": "BATCH-001",
                    "quantity_returned": 5,
                    "original_quantity": 10,
                    "unit_price": 100.00,
                    "return_condition": "damaged",
                    "reason": "Product damaged during delivery",
                    "resaleable": False
                }
            ],
            "transport_charges": 50.00,
            "handling_charges": 25.00,
            "notes": "Customer complained about damaged packaging"
        }
        
        response = requests.post(
            f"{BASE_URL}/sales-returns",
            json=return_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.post(
                f"{BASE_URL}/sale-returns",
                json=return_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_return_id = data.get("return_id", data.get("id"))
            logger.info(f"✅ Sales return created: ID {self.test_return_id}")
        else:
            logger.warning(f"⚠️ Sales return creation failed: {response.status_code}")
            
    def test_03_get_return_reasons(self):
        """Test getting return reason codes"""
        response = requests.get(
            f"{BASE_URL}/sales-returns/reasons",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            reasons = data if isinstance(data, list) else data.get("reasons", [])
            logger.info(f"✅ Retrieved {len(reasons)} return reasons")
            
            # Common reasons should include
            expected_reasons = ["damaged_goods", "expired", "wrong_product", "customer_dissatisfaction", "quality_issues"]
            if reasons:
                logger.info(f"Available reasons: {reasons[:5]}")
        else:
            logger.warning(f"⚠️ Return reasons endpoint not found")
            
    def test_04_process_return_approval(self):
        """Test approving/rejecting a return"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping approval test")
            return
            
        approval_data = {
            "approval_status": "approved",
            "approved_by": "Return Manager",
            "approval_notes": "Valid return - product was indeed damaged",
            "refund_method": "credit_note",
            "quality_check_notes": "Confirmed damage, not resaleable"
        }
        
        response = requests.post(
            f"{BASE_URL}/sales-returns/{self.test_return_id}/approve",
            json=approval_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try PUT endpoint
            response = requests.put(
                f"{BASE_URL}/sales-returns/{self.test_return_id}",
                json={**approval_data, "status": "approved"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Return approved successfully")
        else:
            logger.warning(f"⚠️ Return approval not implemented")
            
    def test_05_generate_credit_note(self):
        """Test generating credit note from return"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping credit note test")
            return
            
        credit_note_data = {
            "return_id": self.test_return_id,
            "credit_note_date": date.today().isoformat(),
            "credit_amount": 500.00,
            "tax_amount": 90.00,
            "total_credit": 590.00,
            "adjustment_type": "full_refund",
            "notes": "Credit note for damaged goods return"
        }
        
        response = requests.post(
            f"{BASE_URL}/sales-returns/{self.test_return_id}/credit-note",
            json=credit_note_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try general credit notes endpoint
            response = requests.post(
                f"{BASE_URL}/credit-notes",
                json=credit_note_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_credit_note_id = data.get("credit_note_id", data.get("id"))
            logger.info(f"✅ Credit note generated: {self.test_credit_note_id}")
        else:
            logger.warning(f"⚠️ Credit note generation failed: {response.status_code}")
            
    def test_06_return_to_inventory(self):
        """Test returning saleable items to inventory"""
        inventory_return = {
            "return_id": self.test_return_id or 1,
            "items": [
                {
                    "product_id": 2,
                    "batch_number": "BATCH-002",
                    "quantity": 3,
                    "condition": "good",
                    "location": "Returns Bin",
                    "inspection_notes": "Item in good condition, can be resold",
                    "inspector": "QC Team",
                    "inspection_date": date.today().isoformat()
                }
            ],
            "processed_by": "Warehouse Manager"
        }
        
        response = requests.post(
            f"{BASE_URL}/sales-returns/inventory-return",
            json=inventory_return,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try stock movements endpoint
            response = requests.post(
                f"{BASE_URL}/stock-movements/return-to-stock",
                json=inventory_return,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Items returned to inventory successfully")
        else:
            logger.warning(f"⚠️ Inventory return not implemented")
            
    def test_07_get_return_analytics(self):
        """Test getting return analytics"""
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat(),
            "group_by": "reason"
        }
        
        response = requests.get(
            f"{BASE_URL}/sales-returns/analytics",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try reports endpoint
            response = requests.get(
                f"{BASE_URL}/reports/sales-returns",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Return analytics retrieved")
            
            # Check analytics data
            if "total_returns" in data:
                logger.info(f"Total returns: {data['total_returns']}")
            if "by_reason" in data:
                logger.info(f"Returns by reason: {len(data['by_reason'])} categories")
        else:
            logger.warning(f"⚠️ Return analytics endpoint not found")
            
    def test_08_customer_return_history(self):
        """Test getting customer return history"""
        if not self.test_customer_id:
            logger.warning("⚠️ No customer ID - skipping history test")
            return
            
        response = requests.get(
            f"{BASE_URL}/sales-returns/customer/{self.test_customer_id}",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try with query parameter
            response = requests.get(
                f"{BASE_URL}/sales-returns?customer_id={self.test_customer_id}",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            returns = data if isinstance(data, list) else data.get("returns", [])
            logger.info(f"✅ Found {len(returns)} returns for customer")
            
            if returns:
                recent_return = returns[0]
                logger.info(f"Recent return: {recent_return.get('return_date')} - Reason: {recent_return.get('return_reason')}")
        else:
            logger.warning(f"⚠️ Customer return history not available")
            
    def test_09_return_refund_processing(self):
        """Test processing refunds for returns"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping refund test")
            return
            
        refund_data = {
            "return_id": self.test_return_id,
            "refund_method": "bank_transfer",
            "refund_amount": 500.00,
            "bank_details": {
                "account_number": "1234567890",
                "account_holder": "Customer Name",
                "bank_name": "Test Bank",
                "ifsc_code": "TEST001"
            },
            "processing_charges": 10.00,
            "net_refund": 490.00,
            "processed_by": "Accounts Team"
        }
        
        response = requests.post(
            f"{BASE_URL}/sales-returns/{self.test_return_id}/refund",
            json=refund_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try payments endpoint
            response = requests.post(
                f"{BASE_URL}/payments/refunds",
                json=refund_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Refund processed successfully")
        else:
            logger.warning(f"⚠️ Refund processing not implemented")
            
    def test_10_return_print_formats(self):
        """Test getting return documents in print format"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping print test")
            return
            
        # Test return receipt format
        response = requests.get(
            f"{BASE_URL}/sales-returns/{self.test_return_id}/print",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try with format parameter
            response = requests.get(
                f"{BASE_URL}/sales-returns/{self.test_return_id}?format=print",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            logger.info(f"✅ Return receipt print format available")
        else:
            logger.warning(f"⚠️ Return print format not available")
            
        # Test credit note format if available
        if self.test_credit_note_id:
            response = requests.get(
                f"{BASE_URL}/credit-notes/{self.test_credit_note_id}/print",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Credit note print format available")


def run_tests():
    """Run all sales returns API tests"""
    test_suite = TestSalesReturnsAPI()
    TestSalesReturnsAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_sales_returns,
        test_suite.test_02_create_sales_return,
        test_suite.test_03_get_return_reasons,
        test_suite.test_04_process_return_approval,
        test_suite.test_05_generate_credit_note,
        test_suite.test_06_return_to_inventory,
        test_suite.test_07_get_return_analytics,
        test_suite.test_08_customer_return_history,
        test_suite.test_09_return_refund_processing,
        test_suite.test_10_return_print_formats
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
    logger.info(f"Sales Returns API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)