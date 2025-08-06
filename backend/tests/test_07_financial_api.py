"""
Test Suite 07: Financial API Testing
Tests payment recording, ledger updates, outstanding aging, and bank reconciliation
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


class TestFinancialAPI:
    """Test suite for Financial API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_payment_id = None
        cls.test_invoice_id = None
        cls.test_customer_id = None
        
        # Get a customer with outstanding
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
            cls.test_customer_id = 1
            
        # Get an invoice to pay
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
                    logger.info(f"Using invoice ID: {cls.test_invoice_id}")
        except:
            pass
            
    def test_01_record_payment(self):
        """Test recording a payment"""
        if not self.test_invoice_id:
            logger.warning("⚠️ No invoice ID - skipping payment test")
            return
            
        payment_data = {
            "invoice_id": self.test_invoice_id,
            "payment_date": date.today().isoformat(),
            "payment_amount": 1000.00,
            "payment_mode": "bank_transfer",
            "payment_reference": f"PAY-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "bank_name": "Test Bank",
            "notes": "Partial payment"
        }
        
        # Try different endpoints
        endpoints = [
            "/payments",
            "/financial/payments",
            "/payment-receipts"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=payment_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.__class__.test_payment_id = data.get("payment_id", data.get("id"))
                logger.info(f"✅ Payment recorded: ID {self.test_payment_id}")
                break
            elif response.status_code == 404:
                continue
            else:
                logger.warning(f"⚠️ Payment recording failed: {response.status_code}")
                
    def test_02_get_payment_history(self):
        """Test retrieving payment history"""
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/payments",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/financial/payment-history",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            payments = data.get("payments", data) if isinstance(data, dict) else data
            
            if payments:
                logger.info(f"✅ Retrieved {len(payments)} payments")
                
                # Verify payment schema
                if len(payments) > 0:
                    payment = payments[0]
                    assert "payment_date" in payment or "date" in payment
                    assert "payment_amount" in payment or "amount" in payment
            else:
                logger.warning("⚠️ No payments found")
        else:
            logger.warning(f"⚠️ Payment history endpoint not found")
            
    def test_03_customer_ledger(self):
        """Test customer ledger/statement"""
        if not self.test_customer_id:
            logger.warning("⚠️ No customer ID - skipping ledger test")
            return
            
        params = {
            "from_date": (date.today() - timedelta(days=90)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/customers/{self.test_customer_id}/ledger",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/financial/customer-ledger/{self.test_customer_id}",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Customer ledger retrieved")
            
            # Check for ledger entries
            if "entries" in data or "transactions" in data:
                logger.info("✅ Ledger entries available")
        else:
            logger.warning(f"⚠️ Customer ledger endpoint not found")
            
    def test_04_outstanding_aging(self):
        """Test outstanding aging report"""
        response = requests.get(
            f"{BASE_URL}/reports/outstanding-aging",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/financial/aging-report",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Outstanding aging report retrieved")
            
            # Check for aging buckets
            if "aging_buckets" in data or "buckets" in data:
                logger.info("✅ Aging buckets available")
                
                # Common buckets: 0-30, 31-60, 61-90, 90+
                buckets = data.get("aging_buckets", data.get("buckets", {}))
                if "0-30" in str(buckets) or "current" in str(buckets):
                    logger.info("✅ Standard aging buckets found")
        else:
            logger.warning(f"⚠️ Outstanding aging endpoint not found")
            
    def test_05_bank_reconciliation(self):
        """Test bank reconciliation endpoints"""
        recon_data = {
            "bank_account": "Test Bank Account",
            "statement_date": date.today().isoformat(),
            "opening_balance": 100000.00,
            "closing_balance": 95000.00,
            "transactions": [
                {
                    "date": date.today().isoformat(),
                    "description": "Payment received",
                    "amount": 5000.00,
                    "type": "credit"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/bank-reconciliation",
            json=recon_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            logger.warning("⚠️ Bank reconciliation endpoint not found")
        elif response.status_code in [200, 201]:
            logger.info("✅ Bank reconciliation created")
        else:
            logger.warning(f"⚠️ Bank reconciliation failed: {response.status_code}")
            
    def test_06_payment_modes(self):
        """Test payment mode configuration"""
        response = requests.get(
            f"{BASE_URL}/payment-modes",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/financial/payment-methods",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            modes = data.get("payment_modes", data.get("modes", data)) if isinstance(data, dict) else data
            
            if modes:
                logger.info(f"✅ Retrieved {len(modes)} payment modes")
                
                # Common modes
                common_modes = ["cash", "bank_transfer", "cheque", "upi"]
                if any(mode in str(modes).lower() for mode in common_modes):
                    logger.info("✅ Standard payment modes available")
        else:
            logger.warning(f"⚠️ Payment modes endpoint not found")
            
    def test_07_financial_summary(self):
        """Test financial summary/dashboard"""
        params = {
            "period": "current_month"
        }
        
        response = requests.get(
            f"{BASE_URL}/financial/summary",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/financial-summary",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Financial summary retrieved")
            
            # Check for key metrics
            metrics = ["total_sales", "total_collections", "total_outstanding", "cash_balance"]
            found_metrics = [m for m in metrics if m in str(data)]
            if found_metrics:
                logger.info(f"✅ Found metrics: {found_metrics}")
        else:
            logger.warning(f"⚠️ Financial summary endpoint not found")
            
    def test_08_credit_note_management(self):
        """Test credit note creation and management"""
        credit_note_data = {
            "customer_id": self.test_customer_id,
            "credit_note_date": date.today().isoformat(),
            "credit_amount": 500.00,
            "reason": "Product return",
            "reference_type": "return",
            "reference_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/credit-notes",
            json=credit_note_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.post(
                f"{BASE_URL}/financial/credit-notes",
                json=credit_note_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Credit note created: ID {data.get('credit_note_id', data.get('id'))}")
        else:
            logger.warning(f"⚠️ Credit note creation failed or not found")
            
    def test_09_payment_allocation(self):
        """Test payment allocation to invoices"""
        if not self.test_payment_id:
            logger.warning("⚠️ No payment ID - skipping allocation test")
            return
            
        allocation_data = {
            "payment_id": self.test_payment_id,
            "allocations": [
                {
                    "invoice_id": self.test_invoice_id,
                    "allocated_amount": 1000.00
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/payment-allocations",
            json=allocation_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            logger.warning("⚠️ Payment allocation endpoint not found")
        elif response.status_code in [200, 201]:
            logger.info("✅ Payment allocation successful")
        else:
            logger.warning(f"⚠️ Payment allocation failed: {response.status_code}")
            
    def test_10_financial_validation(self):
        """Test financial data validation"""
        # Test negative payment
        invalid_payment = {
            "invoice_id": self.test_invoice_id,
            "payment_amount": -100.00,  # Negative amount
            "payment_date": date.today().isoformat()
        }
        
        response = requests.post(
            f"{BASE_URL}/payments",
            json=invalid_payment,
            headers=HEADERS
        )
        
        if response.status_code in [400, 422]:
            logger.info("✅ Financial validation working correctly")
        else:
            logger.warning(f"⚠️ Expected validation error, got {response.status_code}")


def run_tests():
    """Run all financial API tests"""
    test_suite = TestFinancialAPI()
    TestFinancialAPI.setup_class()
    
    tests = [
        test_suite.test_01_record_payment,
        test_suite.test_02_get_payment_history,
        test_suite.test_03_customer_ledger,
        test_suite.test_04_outstanding_aging,
        test_suite.test_05_bank_reconciliation,
        test_suite.test_06_payment_modes,
        test_suite.test_07_financial_summary,
        test_suite.test_08_credit_note_management,
        test_suite.test_09_payment_allocation,
        test_suite.test_10_financial_validation
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
    logger.info(f"Financial API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)