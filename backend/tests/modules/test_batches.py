#!/usr/bin/env python3
"""
Batch Module Tests
Tests all batch-related functionality including creation, fetching, and integration with products
"""
import requests
import json
import time
from datetime import datetime

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class BatchModuleTests:
    def __init__(self):
        self.test_results = []
        self.test_product_id = None

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")

    def setup_test_product(self):
        """Create a test product for batch testing"""
        product_data = {
            "product_name": f"Batch Test Product {datetime.now().strftime('%H%M%S')}",
            "manufacturer": "Batch Test Pharma",
            "product_type": "Medicine",
            "hsn_code": "3004",
            "mrp": 100.0,
            "sale_price": 80.0,
            "maintain_batch": True,
            "maintain_expiry": True
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

    def test_get_batches_by_product(self):
        """Test fetching batches for a specific product"""
        if not self.test_product_id:
            self.log_test("Get Batches - By Product", False, "No test product available")
            return []
            
        try:
            response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={self.test_product_id}", timeout=30)
            if response.status_code == 200:
                batch_data = response.json()
                batches = batch_data.get('batches', [])
                
                if batches and len(batches) > 0:
                    batch = batches[0]
                    # Check if it's a real batch or fallback
                    if batch.get('batch_number') == 'DEFAULT' or 'default_' in str(batch.get('batch_id', '')):
                        self.log_test("Get Batches - By Product", False, f"Only fallback batch found: {batch.get('batch_number')}")
                    else:
                        self.log_test("Get Batches - By Product", True, f"Found {len(batches)} real batch(es): {batch.get('batch_number')}")
                else:
                    self.log_test("Get Batches - By Product", False, "No batches found for product")
                
                return batches
            else:
                self.log_test("Get Batches - By Product", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Batches - By Product", False, f"Exception: {e}")
            return []

    def test_get_all_batches(self):
        """Test fetching all batches"""
        try:
            response = requests.get(f"{API_BASE_URL}/inventory/batches?limit=10", timeout=30)
            if response.status_code == 200:
                batch_data = response.json()
                batches = batch_data.get('batches', [])
                total = batch_data.get('total', 0)
                
                if total > 0:
                    real_batches = [b for b in batches if b.get('batch_number') != 'DEFAULT']
                    self.log_test("Get Batches - All", True, f"Found {total} total batches, {len(real_batches)} real batches")
                else:
                    self.log_test("Get Batches - All", False, "No batches found in system")
                
                return batches
            else:
                self.log_test("Get Batches - All", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Batches - All", False, f"Exception: {e}")
            return []

    def test_get_available_batches(self):
        """Test fetching available (non-expired, with stock) batches"""
        if not self.test_product_id:
            self.log_test("Get Batches - Available", False, "No test product available")
            return []
            
        try:
            response = requests.get(f"{API_BASE_URL}/inventory/batches/available/{self.test_product_id}", timeout=30)
            if response.status_code == 200:
                batches = response.json()
                
                if isinstance(batches, list) and len(batches) > 0:
                    available_batches = [b for b in batches if b.get('quantity_available', 0) > 0]
                    self.log_test("Get Batches - Available", True, f"Found {len(available_batches)} available batches")
                else:
                    self.log_test("Get Batches - Available", False, "No available batches found")
                
                return batches
            else:
                self.log_test("Get Batches - Available", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Batches - Available", False, f"Exception: {e}")
            return []

    def test_get_expiring_batches(self):
        """Test fetching expiring batches"""
        try:
            response = requests.get(f"{API_BASE_URL}/inventory/batches/expiring?days=365", timeout=30)
            if response.status_code == 200:
                batches = response.json()
                
                if isinstance(batches, list):
                    self.log_test("Get Batches - Expiring", True, f"Found {len(batches)} expiring batches (within 365 days)")
                else:
                    self.log_test("Get Batches - Expiring", False, "Invalid response format")
                
                return batches
            else:
                self.log_test("Get Batches - Expiring", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Batches - Expiring", False, f"Exception: {e}")
            return []

    def test_batch_data_integrity(self):
        """Test that batch data contains required fields and valid values"""
        if not self.test_product_id:
            self.log_test("Batch Data - Integrity", False, "No test product available")
            return False
            
        try:
            response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={self.test_product_id}", timeout=30)
            if response.status_code == 200:
                batch_data = response.json()
                batches = batch_data.get('batches', [])
                
                if not batches:
                    self.log_test("Batch Data - Integrity", False, "No batches to test")
                    return False
                
                batch = batches[0]
                required_fields = ['batch_id', 'batch_number', 'product_id', 'expiry_date', 'quantity_available']
                missing_fields = [field for field in required_fields if field not in batch or batch[field] is None]
                
                if missing_fields:
                    self.log_test("Batch Data - Integrity", False, f"Missing required fields: {missing_fields}")
                    return False
                
                # Check data types and values
                issues = []
                if not isinstance(batch.get('product_id'), int) or batch['product_id'] <= 0:
                    issues.append("Invalid product_id")
                if not isinstance(batch.get('quantity_available'), (int, float)) or batch['quantity_available'] < 0:
                    issues.append("Invalid quantity_available")
                if batch.get('mrp') and (not isinstance(batch['mrp'], (int, float)) or batch['mrp'] <= 0):
                    issues.append("Invalid MRP")
                
                if issues:
                    self.log_test("Batch Data - Integrity", False, f"Data integrity issues: {issues}")
                    return False
                else:
                    self.log_test("Batch Data - Integrity", True, "All batch data fields are valid")
                    return True
                    
            else:
                self.log_test("Batch Data - Integrity", False, f"HTTP {response.status_code}: {response.text}")
                return False
        except Exception as e:
            self.log_test("Batch Data - Integrity", False, f"Exception: {e}")
            return False

    def run_all_tests(self):
        """Run all batch module tests"""
        print("🧪 BATCH MODULE TESTS")
        print("="*60)
        
        # Setup
        if not self.setup_test_product():
            print("❌ Cannot proceed with batch tests - test product creation failed")
            return False
        
        # Wait for batch creation
        time.sleep(3)
        
        # Run tests
        self.test_get_batches_by_product()
        self.test_get_all_batches()
        self.test_get_available_batches()
        self.test_get_expiring_batches()
        self.test_batch_data_integrity()
        
        # Summary
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        total_tests = len(self.test_results)
        
        print(f"\n📊 BATCH MODULE SUMMARY")
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        if passed_tests == total_tests:
            print("🎉 ALL BATCH TESTS PASSED!")
        else:
            print("❌ SOME BATCH TESTS FAILED")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed_tests == total_tests

if __name__ == "__main__":
    tester = BatchModuleTests()
    success = tester.run_all_tests()
    exit(0 if success else 1)