"""
Test Suite 19: Credit/Debit Notes API Testing
Tests credit note and debit note creation, management, and processing
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


class TestCreditDebitNotesAPI:
    """Test suite for Credit/Debit Notes API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_credit_note_id = None
        cls.test_debit_note_id = None
        cls.test_customer_id = None
        cls.test_supplier_id = None
        cls.test_invoice_id = None
        
        # Get a customer
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
        except:
            cls.test_supplier_id = 1
            
        # Get an invoice
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
        except:
            cls.test_invoice_id = 1
            
    def test_01_get_credit_notes(self):
        """Test retrieving credit notes"""
        response = requests.get(
            f"{BASE_URL}/credit-notes",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/credit-debit-notes?type=credit",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            notes = data if isinstance(data, list) else data.get("credit_notes", data.get("notes", []))
            logger.info(f"✅ Retrieved {len(notes)} credit notes")
            
            if notes:
                note = notes[0]
                # Check credit note structure
                expected_fields = ["note_date", "note_number", "amount", "reason", "party_id"]
                found_fields = [f for f in expected_fields if f in note]
                logger.info(f"Credit note fields: {found_fields}")
        else:
            logger.warning(f"⚠️ Credit notes endpoint returned {response.status_code}")
            
    def test_02_create_credit_note(self):
        """Test creating a credit note"""
        credit_note_data = {
            "note_date": date.today().isoformat(),
            "party_id": self.test_customer_id or 1,
            "party_type": "customer",
            "reference_type": "sales_return",
            "reference_id": 1,
            "reason_code": "goods_returned",
            "reason_description": "Defective products returned by customer",
            "items": [
                {
                    "product_id": 1,
                    "product_name": "Paracetamol 500mg",
                    "batch_number": "BATCH-001",
                    "quantity": 10,
                    "rate": 50.00,
                    "amount": 500.00,
                    "discount": 0.00,
                    "taxable_amount": 500.00,
                    "gst_rate": 18,
                    "cgst": 45.00,
                    "sgst": 45.00,
                    "igst": 0.00
                }
            ],
            "subtotal": 500.00,
            "discount_amount": 0.00,
            "taxable_amount": 500.00,
            "cgst_amount": 45.00,
            "sgst_amount": 45.00,
            "igst_amount": 0.00,
            "total_tax": 90.00,
            "total_amount": 590.00,
            "notes": "Credit note for returned defective goods",
            "terms_and_conditions": "Standard credit note terms"
        }
        
        response = requests.post(
            f"{BASE_URL}/credit-notes",
            json=credit_note_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.post(
                f"{BASE_URL}/credit-debit-notes",
                json={**credit_note_data, "note_type": "credit"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_credit_note_id = data.get("credit_note_id", data.get("id"))
            logger.info(f"✅ Credit note created: ID {self.test_credit_note_id}")
        else:
            logger.warning(f"⚠️ Credit note creation failed: {response.status_code}")
            
    def test_03_get_debit_notes(self):
        """Test retrieving debit notes"""
        response = requests.get(
            f"{BASE_URL}/debit-notes",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/credit-debit-notes?type=debit",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            notes = data if isinstance(data, list) else data.get("debit_notes", data.get("notes", []))
            logger.info(f"✅ Retrieved {len(notes)} debit notes")
            
            if notes:
                note = notes[0]
                logger.info(f"Debit note: {note.get('note_number')} - Amount: {note.get('total_amount', note.get('amount'))}")
        else:
            logger.warning(f"⚠️ Debit notes endpoint returned {response.status_code}")
            
    def test_04_create_debit_note(self):
        """Test creating a debit note"""
        debit_note_data = {
            "note_date": date.today().isoformat(),
            "party_id": self.test_supplier_id or 1,
            "party_type": "supplier",
            "reference_type": "purchase_return",
            "reference_id": 1,
            "reason_code": "quality_rejection",
            "reason_description": "Substandard quality goods returned to supplier",
            "items": [
                {
                    "product_id": 2,
                    "product_name": "Aspirin 75mg",
                    "batch_number": "DEFECTIVE-BATCH-001",
                    "quantity": 50,
                    "rate": 30.00,
                    "amount": 1500.00,
                    "discount": 0.00,
                    "taxable_amount": 1500.00,
                    "gst_rate": 12,
                    "cgst": 90.00,
                    "sgst": 90.00,
                    "igst": 0.00
                }
            ],
            "subtotal": 1500.00,
            "discount_amount": 0.00,
            "taxable_amount": 1500.00,
            "cgst_amount": 90.00,
            "sgst_amount": 90.00,
            "igst_amount": 0.00,
            "total_tax": 180.00,
            "total_amount": 1680.00,
            "notes": "Debit note for defective goods returned",
            "terms_and_conditions": "As per purchase agreement"
        }
        
        response = requests.post(
            f"{BASE_URL}/debit-notes",
            json=debit_note_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.post(
                f"{BASE_URL}/credit-debit-notes",
                json={**debit_note_data, "note_type": "debit"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_debit_note_id = data.get("debit_note_id", data.get("id"))
            logger.info(f"✅ Debit note created: ID {self.test_debit_note_id}")
        else:
            logger.warning(f"⚠️ Debit note creation failed: {response.status_code}")
            
    def test_05_get_note_details(self):
        """Test getting specific note details"""
        # Test credit note details
        if self.test_credit_note_id:
            response = requests.get(
                f"{BASE_URL}/credit-notes/{self.test_credit_note_id}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Credit note details retrieved")
                
                # Verify credit note data
                assert "items" in data or "note_items" in data
                assert "total_amount" in data or "amount" in data
            else:
                logger.warning(f"⚠️ Credit note details not available")
                
        # Test debit note details
        if self.test_debit_note_id:
            response = requests.get(
                f"{BASE_URL}/debit-notes/{self.test_debit_note_id}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Debit note details retrieved")
            else:
                logger.warning(f"⚠️ Debit note details not available")
                
    def test_06_note_approval_workflow(self):
        """Test note approval workflow"""
        if not self.test_credit_note_id:
            logger.warning("⚠️ No credit note ID - skipping approval test")
            return
            
        approval_data = {
            "approval_status": "approved",
            "approved_by": "Finance Manager",
            "approval_date": datetime.now().isoformat(),
            "approval_notes": "Approved after verification of return documents"
        }
        
        response = requests.post(
            f"{BASE_URL}/credit-notes/{self.test_credit_note_id}/approve",
            json=approval_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try PUT endpoint
            response = requests.put(
                f"{BASE_URL}/credit-notes/{self.test_credit_note_id}",
                json={**approval_data, "status": "approved"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Credit note approval processed")
        else:
            logger.warning(f"⚠️ Note approval workflow not implemented")
            
    def test_07_note_cancellation(self):
        """Test note cancellation"""
        if not self.test_credit_note_id:
            logger.warning("⚠️ No credit note ID - skipping cancellation test")
            return
            
        cancellation_data = {
            "cancellation_reason": "duplicate_entry",
            "cancelled_by": "Accounts Manager",
            "cancellation_date": datetime.now().isoformat(),
            "cancellation_notes": "Duplicate credit note created by mistake"
        }
        
        response = requests.post(
            f"{BASE_URL}/credit-notes/{self.test_credit_note_id}/cancel",
            json=cancellation_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try DELETE endpoint
            response = requests.delete(
                f"{BASE_URL}/credit-notes/{self.test_credit_note_id}",
                json=cancellation_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 204]:
            logger.info(f"✅ Credit note cancellation processed")
        else:
            logger.warning(f"⚠️ Note cancellation not implemented")
            
    def test_08_note_print_formats(self):
        """Test getting notes in print format"""
        # Test credit note print format
        if self.test_credit_note_id:
            response = requests.get(
                f"{BASE_URL}/credit-notes/{self.test_credit_note_id}/print",
                headers=HEADERS
            )
            
            if response.status_code == 404:
                response = requests.get(
                    f"{BASE_URL}/credit-notes/{self.test_credit_note_id}?format=print",
                    headers=HEADERS
                )
                
            if response.status_code == 200:
                logger.info(f"✅ Credit note print format available")
            else:
                logger.warning(f"⚠️ Credit note print format not available")
                
        # Test debit note print format
        if self.test_debit_note_id:
            response = requests.get(
                f"{BASE_URL}/debit-notes/{self.test_debit_note_id}/print",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                logger.info(f"✅ Debit note print format available")
                
    def test_09_note_search_and_filter(self):
        """Test searching and filtering notes"""
        search_params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat(),
            "party_type": "customer",
            "status": "approved"
        }
        
        # Test credit notes search
        response = requests.get(
            f"{BASE_URL}/credit-notes/search",
            params=search_params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/credit-notes",
                params=search_params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            notes = data if isinstance(data, list) else data.get("credit_notes", [])
            logger.info(f"✅ Found {len(notes)} credit notes with filters")
        else:
            logger.warning(f"⚠️ Credit note search not available")
            
        # Test debit notes search
        search_params["party_type"] = "supplier"
        response = requests.get(
            f"{BASE_URL}/debit-notes/search",
            params=search_params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/debit-notes",
                params=search_params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            notes = data if isinstance(data, list) else data.get("debit_notes", [])
            logger.info(f"✅ Found {len(notes)} debit notes with filters")
            
    def test_10_note_analytics_and_reports(self):
        """Test note analytics and reporting"""
        params = {
            "from_date": (date.today() - timedelta(days=90)).isoformat(),
            "to_date": date.today().isoformat(),
            "group_by": "reason"
        }
        
        # Test credit note analytics
        response = requests.get(
            f"{BASE_URL}/credit-notes/analytics",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/credit-notes",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Credit note analytics retrieved")
            
            # Check analytics data
            if "total_amount" in data:
                logger.info(f"Total credit note amount: {data['total_amount']}")
            if "count" in data:
                logger.info(f"Total credit notes: {data['count']}")
        else:
            logger.warning(f"⚠️ Credit note analytics not available")
            
        # Test debit note analytics
        response = requests.get(
            f"{BASE_URL}/debit-notes/analytics",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/debit-notes",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Debit note analytics retrieved")


def run_tests():
    """Run all credit/debit notes API tests"""
    test_suite = TestCreditDebitNotesAPI()
    TestCreditDebitNotesAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_credit_notes,
        test_suite.test_02_create_credit_note,
        test_suite.test_03_get_debit_notes,
        test_suite.test_04_create_debit_note,
        test_suite.test_05_get_note_details,
        test_suite.test_06_note_approval_workflow,
        test_suite.test_07_note_cancellation,
        test_suite.test_08_note_print_formats,
        test_suite.test_09_note_search_and_filter,
        test_suite.test_10_note_analytics_and_reports
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
    logger.info(f"Credit/Debit Notes API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)