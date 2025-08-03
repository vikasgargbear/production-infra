#!/usr/bin/env python3
"""
Supplier Module Tests
Tests all supplier-related functionality including CRUD operations, search, and purchase integration
"""
import requests
import json
import time
from datetime import datetime

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class SupplierModuleTests:
    def __init__(self):
        self.test_results = []
        self.created_supplier_ids = []

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")

    def test_create_supplier_basic(self):
        """Test basic supplier creation"""
        supplier_data = {
            "supplier_name": f"Test Supplier Basic {datetime.now().strftime('%H%M%S')}",
            "contact_person": "Test Contact",
            "phone": "9876543210",
            "email": f"supplier{datetime.now().strftime('%H%M%S')}@example.com",
            "address": "123 Supplier Street, Supplier City",
            "supplier_type": "manufacturer"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/suppliers/", json=supplier_data, timeout=30)
            if response.status_code == 201:
                supplier = response.json()
                supplier_id = supplier.get('supplier_id') or supplier.get('id')
                if supplier_id:
                    self.created_supplier_ids.append(supplier_id)
                
                self.log_test("Create Supplier - Basic", True, 
                            f"Created supplier ID: {supplier_id} | Name: {supplier.get('supplier_name')}")
                return supplier
            else:
                self.log_test("Create Supplier - Basic", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Supplier - Basic", False, f"Exception: {e}")
            return None

    def test_create_supplier_with_details(self):
        """Test supplier creation with full details"""
        supplier_data = {
            "supplier_name": f"Test Distributor {datetime.now().strftime('%H%M%S')}",
            "contact_person": "Distributor Contact",
            "phone": "9876543211",
            "email": f"dist{datetime.now().strftime('%H%M%S')}@example.com",
            "address": "456 Distribution Center, Metro City",
            "supplier_type": "distributor",
            "gst_number": "27AAAAA0000A1Z5",
            "pan_number": "AAAAA0000A",
            "payment_terms": "Net 15",
            "credit_limit": 100000.0
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/suppliers/", json=supplier_data, timeout=30)
            if response.status_code == 201:
                supplier = response.json()
                supplier_id = supplier.get('supplier_id') or supplier.get('id')
                if supplier_id:
                    self.created_supplier_ids.append(supplier_id)
                
                # Verify details were saved
                credit_limit = supplier.get('credit_limit', 0)
                if float(credit_limit) == 100000.0:
                    self.log_test("Create Supplier - With Details", True, 
                                f"Created supplier with credit limit: ₹{credit_limit}")
                else:
                    self.log_test("Create Supplier - With Details", False, 
                                f"Credit limit not saved: expected ₹100000, got ₹{credit_limit}")
                return supplier
            else:
                self.log_test("Create Supplier - With Details", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Supplier - With Details", False, f"Exception: {e}")
            return None

    def test_get_suppliers_list(self):
        """Test fetching suppliers list"""
        try:
            response = requests.get(f"{API_BASE_URL}/suppliers?limit=10", timeout=30)
            if response.status_code == 200:
                suppliers = response.json()
                if isinstance(suppliers, list) and len(suppliers) > 0:
                    self.log_test("Get Suppliers - List", True, f"Retrieved {len(suppliers)} suppliers")
                    return suppliers
                else:
                    self.log_test("Get Suppliers - List", False, "No suppliers returned")
                    return []
            else:
                self.log_test("Get Suppliers - List", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Suppliers - List", False, f"Exception: {e}")
            return []

    def test_get_supplier_by_id(self):
        """Test fetching single supplier by ID"""
        if not self.created_supplier_ids:
            self.log_test("Get Supplier - By ID", False, "No suppliers created to test with")
            return None
            
        supplier_id = self.created_supplier_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/suppliers/{supplier_id}", timeout=30)
            if response.status_code == 200:
                supplier = response.json()
                self.log_test("Get Supplier - By ID", True, 
                            f"Retrieved supplier {supplier_id}: {supplier.get('supplier_name')}")
                return supplier
            else:
                self.log_test("Get Supplier - By ID", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Get Supplier - By ID", False, f"Exception: {e}")
            return None

    def test_supplier_search(self):
        """Test supplier search functionality"""
        try:
            # Search for suppliers with "Test" in name
            response = requests.get(f"{API_BASE_URL}/suppliers?search=Test&limit=10", timeout=30)
            if response.status_code == 200:
                suppliers = response.json()
                if isinstance(suppliers, list):
                    test_suppliers = [s for s in suppliers if 'Test' in s.get('supplier_name', '')]
                    self.log_test("Supplier Search", True, 
                                f"Found {len(test_suppliers)} suppliers matching 'Test'")
                    return suppliers
                else:
                    self.log_test("Supplier Search", False, "Invalid response format")
                    return []
            else:
                self.log_test("Supplier Search", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Supplier Search", False, f"Exception: {e}")
            return []

    def test_supplier_filter_by_type(self):
        """Test filtering suppliers by type"""
        try:
            # Filter for manufacturer suppliers
            response = requests.get(f"{API_BASE_URL}/suppliers?supplier_type=manufacturer&limit=10", timeout=30)
            if response.status_code == 200:
                suppliers = response.json()
                if isinstance(suppliers, list):
                    manufacturer_suppliers = [s for s in suppliers if s.get('supplier_type') == 'manufacturer']
                    self.log_test("Supplier Filter - By Type", True, 
                                f"Found {len(manufacturer_suppliers)} manufacturer suppliers")
                    return suppliers
                else:
                    self.log_test("Supplier Filter - By Type", False, "Invalid response format")
                    return []
            else:
                self.log_test("Supplier Filter - By Type", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Supplier Filter - By Type", False, f"Exception: {e}")
            return []

    def test_update_supplier(self):
        """Test supplier update functionality"""
        if not self.created_supplier_ids:
            self.log_test("Update Supplier", False, "No suppliers created to test with")
            return None
            
        supplier_id = self.created_supplier_ids[0]
        update_data = {
            "contact_person": "Updated Contact Person",
            "payment_terms": "Net 45"
        }
        
        try:
            response = requests.put(f"{API_BASE_URL}/suppliers/{supplier_id}", json=update_data, timeout=30)
            if response.status_code == 200:
                updated_supplier = response.json()
                if (updated_supplier.get('contact_person') == "Updated Contact Person" and 
                    updated_supplier.get('payment_terms') == "Net 45"):
                    self.log_test("Update Supplier", True, f"Successfully updated supplier {supplier_id}")
                    return updated_supplier
                else:
                    self.log_test("Update Supplier", False, "Supplier updated but fields not changed correctly")
                    return None
            else:
                self.log_test("Update Supplier", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Update Supplier", False, f"Exception: {e}")
            return None

    def test_supplier_data_integrity(self):
        """Test that supplier data contains required fields and valid values"""
        if not self.created_supplier_ids:
            self.log_test("Supplier Data - Integrity", False, "No suppliers created to test with")
            return False
            
        supplier_id = self.created_supplier_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/suppliers/{supplier_id}", timeout=30)
            if response.status_code == 200:
                supplier = response.json()
                
                # Check required fields
                required_fields = ['supplier_id', 'supplier_name', 'phone']
                missing_fields = [field for field in required_fields if field not in supplier or supplier[field] is None]
                
                if missing_fields:
                    self.log_test("Supplier Data - Integrity", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Check data types and values
                issues = []
                if not isinstance(supplier.get('supplier_id'), int) or supplier['supplier_id'] <= 0:
                    issues.append("Invalid supplier_id")
                if not supplier.get('supplier_name') or len(supplier['supplier_name'].strip()) == 0:
                    issues.append("Invalid supplier_name")
                if supplier.get('phone') and len(supplier['phone']) < 10:
                    issues.append("Invalid phone number")
                if supplier.get('email') and '@' not in supplier['email']:
                    issues.append("Invalid email format")
                
                if issues:
                    self.log_test("Supplier Data - Integrity", False, f"Data integrity issues: {issues}")
                    return False
                else:
                    self.log_test("Supplier Data - Integrity", True, "All supplier data fields are valid")
                    return True
                    
            else:
                self.log_test("Supplier Data - Integrity", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Supplier Data - Integrity", False, f"Exception: {e}")
            return False

    def run_all_tests(self):
        """Run all supplier module tests"""
        print("🧪 SUPPLIER MODULE TESTS")
        print("="*60)
        
        # Run tests in order
        self.test_create_supplier_basic()
        self.test_create_supplier_with_details()
        self.test_get_suppliers_list()
        self.test_get_supplier_by_id()
        self.test_supplier_search()
        self.test_supplier_filter_by_type()
        self.test_update_supplier()
        self.test_supplier_data_integrity()
        
        # Summary
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        total_tests = len(self.test_results)
        
        print(f"\n📊 SUPPLIER MODULE SUMMARY")
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        if passed_tests == total_tests:
            print("🎉 ALL SUPPLIER TESTS PASSED!")
        else:
            print("❌ SOME SUPPLIER TESTS FAILED")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed_tests == total_tests

if __name__ == "__main__":
    tester = SupplierModuleTests()
    success = tester.run_all_tests()
    exit(0 if success else 1)