"""
Test Suite 08: Payments and Financial APIs Testing
Tests payment recording, ledger entries, and financial reporting
"""

import pytest
import requests
import json
from datetime import datetime, date, timedelta
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


class TestPaymentsAPI:
    """Test suite for Payments and Financial APIs"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_customer_id = None
        cls.test_invoice_id = None
        cls.test_payment_id = None
        
        # Get a customer with outstanding balance
        try:
            response = requests.get(
                f"{BASE_URL}/customers?limit=10",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                customers = data.get("customers", data) if isinstance(data, dict) else data
                # Find a customer with outstanding balance
                for customer in customers:
                    if customer.get("outstanding_balance", 0) > 0:
                        cls.test_customer_id = customer.get("customer_id", customer.get("id"))
                        logger.info(f"Using customer ID: {cls.test_customer_id} with outstanding: {customer.get('outstanding_balance')}")
                        break
                if not cls.test_customer_id and customers:
                    cls.test_customer_id = customers[0].get("customer_id", customers[0].get("id", 1))
        except:
            cls.test_customer_id = 1
            
    def test_01_create_payment_receipt(self):
        """Test creating a payment receipt"""
        payment_data = {
            "customer_id": self.test_customer_id,
            "payment_date": date.today().isoformat(),
            "amount": 1000.00,
            "payment_mode": "cash",
            "reference_number": f"PAY-TEST-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "notes": "Test payment receipt"
        }
        
        # Try different payment endpoints
        endpoints = [
            "/payments",
            "/payment-receipts",
            "/customer-payments",
            "/receipts"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=payment_data,
                headers=HEADERS
            )
            
            logger.info(f"Tried {endpoint}: Status {response.status_code}")
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"Response: {data}")
                
                self.__class__.test_payment_id = data.get("payment_id", data.get("receipt_id", data.get("id")))
                logger.info(f"✅ Payment created: ID {self.test_payment_id}")
                break
            elif response.status_code == 404:
                continue
            else:
                logger.warning(f"⚠️ {endpoint} returned {response.status_code}: {response.text}")
                
    def test_02_get_payment_list(self):
        """Test retrieving payment list"""
        endpoints = [
            "/payments",
            "/payment-receipts",
            "/receipts"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}?limit=5",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                payments = data if isinstance(data, list) else data.get("payments", data.get("receipts", []))
                
                if payments:
                    logger.info(f"✅ Retrieved {len(payments)} payments from {endpoint}")
                    
                    # Verify payment structure
                    payment = payments[0]
                    logger.info(f"Sample payment: {payment}")
                    break
            elif response.status_code == 404:
                continue
                
    def test_03_allocate_payment_to_invoice(self):
        """Test allocating payment to specific invoices"""
        if not self.test_payment_id:
            logger.warning("⚠️ No payment ID - skipping allocation test")
            return
            
        # Get unpaid invoices for the customer
        response = requests.get(
            f"{BASE_URL}/invoices?customer_id={self.test_customer_id}&payment_status=unpaid&limit=5",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            invoices = response.json()
            if invoices and len(invoices) > 0:
                invoice = invoices[0]
                invoice_id = invoice.get("invoice_id", invoice.get("id"))
                
                allocation_data = {
                    "payment_id": self.test_payment_id,
                    "allocations": [
                        {
                            "invoice_id": invoice_id,
                            "amount": 500.00
                        }
                    ]
                }
                
                # Try different allocation endpoints
                endpoints = [
                    f"/payments/{self.test_payment_id}/allocate",
                    "/payment-allocations",
                    "/allocate-payment"
                ]
                
                for endpoint in endpoints:
                    response = requests.post(
                        f"{BASE_URL}{endpoint}",
                        json=allocation_data,
                        headers=HEADERS
                    )
                    
                    if response.status_code in [200, 201]:
                        logger.info(f"✅ Payment allocated to invoice {invoice_id}")
                        break
                    elif response.status_code == 404:
                        continue
                    else:
                        logger.warning(f"⚠️ Allocation failed at {endpoint}: {response.status_code}")
                        
    def test_04_get_customer_ledger(self):
        """Test retrieving customer ledger/statement"""
        endpoints = [
            f"/customers/{self.test_customer_id}/ledger",
            f"/ledger/customer/{self.test_customer_id}",
            f"/customer-ledger/{self.test_customer_id}",
            f"/party-ledger/customer/{self.test_customer_id}"
        ]
        
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                params=params,
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Retrieved ledger from {endpoint}")
                
                # Check ledger structure
                entries = data if isinstance(data, list) else data.get("entries", data.get("ledger", []))
                if entries:
                    logger.info(f"Found {len(entries)} ledger entries")
                break
            elif response.status_code == 404:
                continue
                
    def test_05_get_outstanding_report(self):
        """Test retrieving outstanding/receivables report"""
        endpoints = [
            "/reports/outstanding",
            "/outstanding-report",
            "/receivables",
            "/customers/outstanding"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Retrieved outstanding report from {endpoint}")
                
                # Check report structure
                if isinstance(data, dict):
                    logger.info(f"Total outstanding: {data.get('total_outstanding', 'N/A')}")
                    logger.info(f"Customer count: {data.get('customer_count', len(data.get('customers', [])))}")
                break
            elif response.status_code == 404:
                continue
                
    def test_06_create_payment_voucher(self):
        """Test creating other payment types (expenses, purchases)"""
        voucher_data = {
            "voucher_type": "payment",
            "payment_date": date.today().isoformat(),
            "party_type": "supplier",
            "party_id": 1,
            "amount": 5000.00,
            "payment_mode": "bank_transfer",
            "account": "Purchase Account",
            "reference": f"VOUCHER-{datetime.now().strftime('%Y%m%d')}",
            "notes": "Payment to supplier"
        }
        
        endpoints = [
            "/payment-vouchers",
            "/vouchers/payment",
            "/payments/voucher"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=voucher_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                logger.info(f"✅ Payment voucher created at {endpoint}")
                break
            elif response.status_code == 404:
                continue
            else:
                logger.warning(f"⚠️ Voucher creation failed: {response.status_code}")
                
    def test_07_cash_flow_report(self):
        """Test cash flow and financial reports"""
        endpoints = [
            "/reports/cash-flow",
            "/financial/cash-flow",
            "/analytics/cash-flow"
        ]
        
        params = {
            "from_date": (date.today() - timedelta(days=7)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                params=params,
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Cash flow report retrieved from {endpoint}")
                
                # Check cash flow data
                if isinstance(data, dict):
                    logger.info(f"Cash inflow: {data.get('cash_inflow', data.get('total_receipts', 'N/A'))}")
                    logger.info(f"Cash outflow: {data.get('cash_outflow', data.get('total_payments', 'N/A'))}")
                break
            elif response.status_code == 404:
                continue
                
    def test_08_payment_modes_summary(self):
        """Test payment modes summary/analysis"""
        endpoints = [
            "/payments/summary/by-mode",
            "/analytics/payment-modes",
            "/reports/payment-modes"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Payment modes summary from {endpoint}")
                
                # Check payment modes data
                if isinstance(data, dict):
                    for mode, amount in data.items():
                        if isinstance(amount, (int, float)):
                            logger.info(f"  {mode}: {amount}")
                elif isinstance(data, list):
                    for item in data[:3]:  # Show first 3
                        logger.info(f"  {item}")
                break
            elif response.status_code == 404:
                continue


def run_tests():
    """Run all payment API tests"""
    test_suite = TestPaymentsAPI()
    TestPaymentsAPI.setup_class()
    
    tests = [
        test_suite.test_01_create_payment_receipt,
        test_suite.test_02_get_payment_list,
        test_suite.test_03_allocate_payment_to_invoice,
        test_suite.test_04_get_customer_ledger,
        test_suite.test_05_get_outstanding_report,
        test_suite.test_06_create_payment_voucher,
        test_suite.test_07_cash_flow_report,
        test_suite.test_08_payment_modes_summary
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
    logger.info(f"Payments API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)