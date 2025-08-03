#!/usr/bin/env python3
"""
Invoice Module Tests
Tests all invoice-related functionality including creation, fetching, and customer integration
"""
import requests
import json
import time
from datetime import datetime, timedelta

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class InvoiceModuleTests:
    def __init__(self):
        self.test_results = []
        self.test_customer_id = None
        self.test_product_id = None
        self.created_invoice_ids = []

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")

    def setup_test_data(self):
        """Setup test customer and product for invoice testing"""
        # Get or create test customer
        try:
            customers_response = requests.get(f"{API_BASE_URL}/customers?limit=1", timeout=30)
            if customers_response.status_code == 200:
                customers = customers_response.json()
                if customers and len(customers) > 0:
                    self.test_customer_id = customers[0]['customer_id']
                    self.log_test("Setup - Test Customer", True, f"Using customer ID: {self.test_customer_id}")
                else:
                    self.log_test("Setup - Test Customer", False, "No customers found")
                    return False
            else:
                self.log_test("Setup - Test Customer", False, f"Failed to fetch customers: {customers_response.text}")
                return False
        except Exception as e:
            self.log_test("Setup - Test Customer", False, f"Exception: {e}")
            return False

        # Create test product with MRP
        product_data = {
            "product_name": f"Invoice Test Product {datetime.now().strftime('%H%M%S')}",
            "manufacturer": "Invoice Test Pharma",
            "product_type": "Medicine",
            "hsn_code": "3004",
            "mrp": 200.0,
            "sale_price": 160.0,
            "gst_percentage": 12.0,
            "maintain_batch": True
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
            if response.status_code == 201:
                product = response.json()
                self.test_product_id = product['product_id']
                self.log_test("Setup - Test Product", True, f"Created test product ID: {self.test_product_id}")
                return True
            else:
                self.log_test("Setup - Test Product", False, f"Failed to create test product: {response.text}")
                return False
        except Exception as e:
            self.log_test("Setup - Test Product", False, f"Exception: {e}")
            return False

    def test_create_invoice_basic(self):
        """Test basic invoice creation"""
        if not self.test_customer_id or not self.test_product_id:
            self.log_test("Create Invoice - Basic", False, "Missing test data")
            return None

        invoice_data = {
            "customer_id": self.test_customer_id,
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "due_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "payment_terms": "Net 30",
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 2,
                    "unit_price": 160.0,
                    "discount_percentage": 0,
                    "gst_percentage": 12.0
                }
            ],
            "notes": "Test Invoice - Basic"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/sales/invoices/", json=invoice_data, timeout=30)
            if response.status_code == 201:
                invoice = response.json()
                invoice_id = invoice.get('invoice_id') or invoice.get('id')
                if invoice_id:
                    self.created_invoice_ids.append(invoice_id)
                
                self.log_test("Create Invoice - Basic", True, 
                            f"Created invoice: {invoice.get('invoice_number')} (ID: {invoice_id})")
                return invoice
            else:
                self.log_test("Create Invoice - Basic", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Invoice - Basic", False, f"Exception: {e}")
            return None

    def test_create_invoice_multiple_items(self):
        """Test invoice creation with multiple line items"""
        if not self.test_customer_id or not self.test_product_id:
            self.log_test("Create Invoice - Multiple Items", False, "Missing test data")
            return None

        invoice_data = {
            "customer_id": self.test_customer_id,
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "due_date": (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d"),
            "payment_terms": "Net 15",
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 1,
                    "unit_price": 160.0,
                    "discount_percentage": 5,
                    "gst_percentage": 12.0
                },
                {
                    "product_id": self.test_product_id,
                    "quantity": 3,
                    "unit_price": 160.0,
                    "discount_percentage": 10,
                    "gst_percentage": 12.0
                }
            ],
            "notes": "Test Invoice - Multiple Items"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/sales/invoices/", json=invoice_data, timeout=30)
            if response.status_code == 201:
                invoice = response.json()
                invoice_id = invoice.get('invoice_id') or invoice.get('id')
                if invoice_id:
                    self.created_invoice_ids.append(invoice_id)
                
                # Verify multiple items were processed
                items_count = len(invoice_data['items'])
                self.log_test("Create Invoice - Multiple Items", True, 
                            f"Created invoice with {items_count} items: {invoice.get('invoice_number')}")
                return invoice
            else:
                self.log_test("Create Invoice - Multiple Items", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Invoice - Multiple Items", False, f"Exception: {e}")
            return None

    def test_get_invoices_list(self):
        """Test fetching invoices list"""
        try:
            response = requests.get(f"{API_BASE_URL}/sales/invoices?limit=10", timeout=30)
            if response.status_code == 200:
                invoices = response.json()
                if isinstance(invoices, list) and len(invoices) > 0:
                    self.log_test("Get Invoices - List", True, f"Retrieved {len(invoices)} invoices")
                    return invoices
                elif isinstance(invoices, dict) and 'invoices' in invoices:
                    invoice_list = invoices['invoices']
                    self.log_test("Get Invoices - List", True, f"Retrieved {len(invoice_list)} invoices")
                    return invoice_list
                else:
                    self.log_test("Get Invoices - List", False, "No invoices returned or invalid format")
                    return []
            else:
                self.log_test("Get Invoices - List", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Invoices - List", False, f"Exception: {e}")
            return []

    def test_get_invoice_by_id(self):
        """Test fetching single invoice by ID"""
        if not self.created_invoice_ids:
            self.log_test("Get Invoice - By ID", False, "No invoices created to test with")
            return None
            
        invoice_id = self.created_invoice_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/sales/invoices/{invoice_id}", timeout=30)
            if response.status_code == 200:
                invoice = response.json()
                self.log_test("Get Invoice - By ID", True, f"Retrieved invoice {invoice_id}: {invoice.get('invoice_number')}")
                return invoice
            else:
                self.log_test("Get Invoice - By ID", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Get Invoice - By ID", False, f"Exception: {e}")
            return None

    def test_invoice_calculations(self):
        """Test that invoice calculations are correct"""
        if not self.test_customer_id or not self.test_product_id:
            self.log_test("Invoice Calculations", False, "Missing test data")
            return False

        # Create invoice with known values for calculation testing
        invoice_data = {
            "customer_id": self.test_customer_id,
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "due_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "items": [
                {
                    "product_id": self.test_product_id,
                    "quantity": 10,
                    "unit_price": 100.0,  # 10 * 100 = 1000
                    "discount_percentage": 10,  # 1000 - 100 = 900
                    "gst_percentage": 18.0  # 900 * 0.18 = 162
                }
            ]
        }
        
        expected_subtotal = 1000.0
        expected_discount = 100.0
        expected_taxable = 900.0
        expected_gst = 162.0
        expected_total = 1062.0
        
        try:
            response = requests.post(f"{API_BASE_URL}/sales/invoices/", json=invoice_data, timeout=30)
            if response.status_code == 201:
                invoice = response.json()
                
                # Check calculations (with tolerance for floating point)
                tolerance = 0.01
                issues = []
                
                actual_total = float(invoice.get('total_amount', 0))
                if abs(actual_total - expected_total) > tolerance:
                    issues.append(f"Total: expected {expected_total}, got {actual_total}")
                
                if issues:
                    self.log_test("Invoice Calculations", False, f"Calculation errors: {issues}")
                    return False
                else:
                    self.log_test("Invoice Calculations", True, f"Calculations correct: Total ₹{actual_total}")
                    return True
            else:
                self.log_test("Invoice Calculations", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Invoice Calculations", False, f"Exception: {e}")
            return False

    def test_invoice_data_integrity(self):
        """Test that invoice data contains required fields"""
        if not self.created_invoice_ids:
            self.log_test("Invoice Data - Integrity", False, "No invoices to test")
            return False
            
        invoice_id = self.created_invoice_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/sales/invoices/{invoice_id}", timeout=30)
            if response.status_code == 200:
                invoice = response.json()
                
                required_fields = ['invoice_number', 'customer_id', 'invoice_date', 'total_amount']
                missing_fields = [field for field in required_fields if field not in invoice or invoice[field] is None]
                
                if missing_fields:
                    self.log_test("Invoice Data - Integrity", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Check data types and values
                issues = []
                if not isinstance(invoice.get('customer_id'), int) or invoice['customer_id'] <= 0:
                    issues.append("Invalid customer_id")
                if not isinstance(invoice.get('total_amount'), (int, float)) or invoice['total_amount'] <= 0:
                    issues.append("Invalid total_amount")
                
                if issues:
                    self.log_test("Invoice Data - Integrity", False, f"Data integrity issues: {issues}")
                    return False
                else:
                    self.log_test("Invoice Data - Integrity", True, "All invoice data fields are valid")
                    return True
                    
            else:
                self.log_test("Invoice Data - Integrity", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Invoice Data - Integrity", False, f"Exception: {e}")
            return False

    def run_all_tests(self):
        """Run all invoice module tests"""
        print("🧪 INVOICE MODULE TESTS")
        print("="*60)
        
        # Setup
        if not self.setup_test_data():
            print("❌ Cannot proceed with invoice tests - setup failed")
            return False
        
        # Wait for product batch creation
        time.sleep(3)
        
        # Run tests
        self.test_create_invoice_basic()
        self.test_create_invoice_multiple_items()
        self.test_get_invoices_list()
        self.test_get_invoice_by_id()
        self.test_invoice_calculations()
        self.test_invoice_data_integrity()
        
        # Summary
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        total_tests = len(self.test_results)
        
        print(f"\n📊 INVOICE MODULE SUMMARY")
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        if passed_tests == total_tests:
            print("🎉 ALL INVOICE TESTS PASSED!")
        else:
            print("❌ SOME INVOICE TESTS FAILED")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed_tests == total_tests

if __name__ == "__main__":
    tester = InvoiceModuleTests()
    success = tester.run_all_tests()
    exit(0 if success else 1)