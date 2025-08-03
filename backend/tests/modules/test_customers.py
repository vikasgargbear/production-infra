#!/usr/bin/env python3
"""
Customer Module Tests
Tests all customer-related functionality including CRUD operations, search, and credit management
"""
import requests
import json
import time
from datetime import datetime

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class CustomerModuleTests:
    def __init__(self):
        self.test_results = []
        self.created_customer_ids = []

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")

    def test_create_customer_basic(self):
        """Test basic customer creation"""
        customer_data = {
            "customer_name": f"Test Customer Basic {datetime.now().strftime('%H%M%S')}",
            "contact_person": "Test Contact Person",
            "phone": "9876543210",
            "email": f"test{datetime.now().strftime('%H%M%S')}@example.com",
            "address": "123 Test Street, Test City",
            "customer_type": "regular"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/customers/", json=customer_data, timeout=30)
            if response.status_code == 201:
                customer = response.json()
                customer_id = customer.get('customer_id') or customer.get('id')
                if customer_id:
                    self.created_customer_ids.append(customer_id)
                
                self.log_test("Create Customer - Basic", True, 
                            f"Created customer ID: {customer_id} | Name: {customer.get('customer_name')}")
                return customer
            else:
                self.log_test("Create Customer - Basic", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Customer - Basic", False, f"Exception: {e}")
            return None

    def test_create_customer_with_credit_details(self):
        """Test customer creation with credit limit and payment terms"""
        customer_data = {
            "customer_name": f"Test Customer Credit {datetime.now().strftime('%H%M%S')}",
            "contact_person": "Credit Test Person",
            "phone": "9876543211",
            "email": f"credit{datetime.now().strftime('%H%M%S')}@example.com",
            "address": "456 Credit Lane, Finance City",
            "customer_type": "credit",
            "credit_limit": 50000.0,
            "payment_terms": "Net 30",
            "gst_number": "27AAAAA0000A1Z5"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/customers/", json=customer_data, timeout=30)
            if response.status_code == 201:
                customer = response.json()
                customer_id = customer.get('customer_id') or customer.get('id')
                if customer_id:
                    self.created_customer_ids.append(customer_id)
                
                # Verify credit details were saved
                credit_limit = customer.get('credit_limit', 0)
                if float(credit_limit) == 50000.0:
                    self.log_test("Create Customer - With Credit", True, 
                                f"Created customer with credit limit: ₹{credit_limit}")
                else:
                    self.log_test("Create Customer - With Credit", False, 
                                f"Credit limit not saved correctly: expected ₹50000, got ₹{credit_limit}")
                return customer
            else:
                self.log_test("Create Customer - With Credit", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Customer - With Credit", False, f"Exception: {e}")
            return None

    def test_get_customers_list(self):
        """Test fetching customers list"""
        try:
            response = requests.get(f"{API_BASE_URL}/customers?limit=10", timeout=30)
            if response.status_code == 200:
                customers = response.json()
                if isinstance(customers, list) and len(customers) > 0:
                    self.log_test("Get Customers - List", True, f"Retrieved {len(customers)} customers")
                    return customers
                else:
                    self.log_test("Get Customers - List", False, "No customers returned")
                    return []
            else:
                self.log_test("Get Customers - List", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Customers - List", False, f"Exception: {e}")
            return []

    def test_get_customer_by_id(self):
        """Test fetching single customer by ID"""
        if not self.created_customer_ids:
            self.log_test("Get Customer - By ID", False, "No customers created to test with")
            return None
            
        customer_id = self.created_customer_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/customers/{customer_id}", timeout=30)
            if response.status_code == 200:
                customer = response.json()
                self.log_test("Get Customer - By ID", True, 
                            f"Retrieved customer {customer_id}: {customer.get('customer_name')}")
                return customer
            else:
                self.log_test("Get Customer - By ID", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Get Customer - By ID", False, f"Exception: {e}")
            return None

    def test_customer_search_by_name(self):
        """Test customer search by name"""
        try:
            # Search for customers with "Test" in name
            response = requests.get(f"{API_BASE_URL}/customers?search=Test&limit=10", timeout=30)
            if response.status_code == 200:
                customers = response.json()
                if isinstance(customers, list):
                    test_customers = [c for c in customers if 'Test' in c.get('customer_name', '')]
                    self.log_test("Customer Search - By Name", True, 
                                f"Found {len(test_customers)} customers matching 'Test'")
                    return customers
                else:
                    self.log_test("Customer Search - By Name", False, "Invalid response format")
                    return []
            else:
                self.log_test("Customer Search - By Name", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Customer Search - By Name", False, f"Exception: {e}")
            return []

    def test_customer_search_by_phone(self):
        """Test customer search by phone number"""
        if not self.created_customer_ids:
            self.log_test("Customer Search - By Phone", False, "No customers created to test with")
            return []
            
        try:
            # Search for customers by phone (using partial phone number)
            response = requests.get(f"{API_BASE_URL}/customers?search=9876&limit=10", timeout=30)
            if response.status_code == 200:
                customers = response.json()
                if isinstance(customers, list):
                    phone_customers = [c for c in customers if '9876' in c.get('phone', '')]
                    self.log_test("Customer Search - By Phone", True, 
                                f"Found {len(phone_customers)} customers with phone containing '9876'")
                    return customers
                else:
                    self.log_test("Customer Search - By Phone", False, "Invalid response format")
                    return []
            else:
                self.log_test("Customer Search - By Phone", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Customer Search - By Phone", False, f"Exception: {e}")
            return []

    def test_customer_filter_by_type(self):
        """Test filtering customers by type"""
        try:
            # Filter for credit customers
            response = requests.get(f"{API_BASE_URL}/customers?customer_type=credit&limit=10", timeout=30)
            if response.status_code == 200:
                customers = response.json()
                if isinstance(customers, list):
                    credit_customers = [c for c in customers if c.get('customer_type') == 'credit']
                    self.log_test("Customer Filter - By Type", True, 
                                f"Found {len(credit_customers)} credit customers")
                    return customers
                else:
                    self.log_test("Customer Filter - By Type", False, "Invalid response format")
                    return []
            else:
                self.log_test("Customer Filter - By Type", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Customer Filter - By Type", False, f"Exception: {e}")
            return []

    def test_update_customer(self):
        """Test customer update functionality"""
        if not self.created_customer_ids:
            self.log_test("Update Customer", False, "No customers created to test with")
            return None
            
        customer_id = self.created_customer_ids[0]
        update_data = {
            "contact_person": "Updated Contact Person",
            "phone": "9999888877"
        }
        
        try:
            response = requests.put(f"{API_BASE_URL}/customers/{customer_id}", json=update_data, timeout=30)
            if response.status_code == 200:
                updated_customer = response.json()
                if (updated_customer.get('contact_person') == "Updated Contact Person" and 
                    updated_customer.get('phone') == "9999888877"):
                    self.log_test("Update Customer", True, f"Successfully updated customer {customer_id}")
                    return updated_customer
                else:
                    self.log_test("Update Customer", False, "Customer updated but fields not changed correctly")
                    return None
            else:
                self.log_test("Update Customer", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Update Customer", False, f"Exception: {e}")
            return None

    def test_customer_data_integrity(self):
        """Test that customer data contains required fields and valid values"""
        if not self.created_customer_ids:
            self.log_test("Customer Data - Integrity", False, "No customers created to test with")
            return False
            
        customer_id = self.created_customer_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/customers/{customer_id}", timeout=30)
            if response.status_code == 200:
                customer = response.json()
                
                # Check required fields
                required_fields = ['customer_id', 'customer_name', 'phone']
                missing_fields = [field for field in required_fields if field not in customer or customer[field] is None]
                
                if missing_fields:
                    self.log_test("Customer Data - Integrity", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Check data types and values
                issues = []
                if not isinstance(customer.get('customer_id'), int) or customer['customer_id'] <= 0:
                    issues.append("Invalid customer_id")
                if not customer.get('customer_name') or len(customer['customer_name'].strip()) == 0:
                    issues.append("Invalid customer_name")
                if customer.get('phone') and len(customer['phone']) < 10:
                    issues.append("Invalid phone number")
                if customer.get('email') and '@' not in customer['email']:
                    issues.append("Invalid email format")
                
                if issues:
                    self.log_test("Customer Data - Integrity", False, f"Data integrity issues: {issues}")
                    return False
                else:
                    self.log_test("Customer Data - Integrity", True, "All customer data fields are valid")
                    return True
                    
            else:
                self.log_test("Customer Data - Integrity", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Customer Data - Integrity", False, f"Exception: {e}")
            return False

    def test_delete_customer(self):
        """Test customer deletion (if endpoint exists)"""
        if len(self.created_customer_ids) < 2:
            self.log_test("Delete Customer", False, "Not enough customers created to test deletion")
            return False
            
        # Use the last created customer for deletion test
        customer_id = self.created_customer_ids[-1]
        
        try:
            response = requests.delete(f"{API_BASE_URL}/customers/{customer_id}", timeout=30)
            if response.status_code in [200, 204]:
                # Verify customer is deleted by trying to fetch it
                get_response = requests.get(f"{API_BASE_URL}/customers/{customer_id}", timeout=30)
                if get_response.status_code == 404:
                    self.log_test("Delete Customer", True, f"Successfully deleted customer {customer_id}")
                    self.created_customer_ids.remove(customer_id)
                    return True
                else:
                    self.log_test("Delete Customer", False, f"Customer {customer_id} still exists after deletion")
                    return False
            elif response.status_code == 404:
                self.log_test("Delete Customer", False, "Delete endpoint not found - feature not implemented")
                return False
            else:
                self.log_test("Delete Customer", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Delete Customer", False, f"Exception: {e}")
            return False

    def run_all_tests(self):
        """Run all customer module tests"""
        print("🧪 CUSTOMER MODULE TESTS")
        print("="*60)
        
        # Run tests in order
        self.test_create_customer_basic()
        self.test_create_customer_with_credit_details()
        self.test_get_customers_list()
        self.test_get_customer_by_id()
        self.test_customer_search_by_name()
        self.test_customer_search_by_phone()
        self.test_customer_filter_by_type()
        self.test_update_customer()
        self.test_customer_data_integrity()
        self.test_delete_customer()
        
        # Summary
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        total_tests = len(self.test_results)
        
        print(f"\n📊 CUSTOMER MODULE SUMMARY")
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        if passed_tests == total_tests:
            print("🎉 ALL CUSTOMER TESTS PASSED!")
        else:
            print("❌ SOME CUSTOMER TESTS FAILED")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed_tests == total_tests

if __name__ == "__main__":
    tester = CustomerModuleTests()
    success = tester.run_all_tests()
    exit(0 if success else 1)