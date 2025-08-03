#!/usr/bin/env python3
"""
Product Module Tests
Tests all product-related functionality including CRUD operations and batch integration
"""
import requests
import json
import time
from datetime import datetime

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class ProductModuleTests:
    def __init__(self):
        self.test_results = []
        self.created_product_ids = []

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")

    def test_create_product_basic(self):
        """Test basic product creation"""
        product_data = {
            "product_name": f"Test Product Basic {datetime.now().strftime('%H%M%S')}",
            "manufacturer": "Test Pharma",
            "product_type": "Medicine",
            "hsn_code": "3004"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
            if response.status_code == 201:
                product = response.json()
                self.created_product_ids.append(product['product_id'])
                self.log_test("Create Product - Basic", True, f"Created product ID: {product['product_id']}")
                return product
            else:
                self.log_test("Create Product - Basic", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Product - Basic", False, f"Exception: {e}")
            return None

    def test_create_product_with_mrp(self):
        """Test product creation with MRP (should create batch)"""
        product_data = {
            "product_name": f"Test Product MRP {datetime.now().strftime('%H%M%S')}",
            "manufacturer": "Test Pharma MRP",
            "product_type": "Medicine",
            "hsn_code": "3004",
            "mrp": 250.0,
            "sale_price": 200.0,
            "maintain_batch": True,
            "maintain_expiry": True
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
            if response.status_code == 201:
                product = response.json()
                product_id = product['product_id']
                self.created_product_ids.append(product_id)
                
                # Check if batch was created
                time.sleep(2)  # Wait for batch creation
                batch_response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={product_id}", timeout=30)
                
                if batch_response.status_code == 200:
                    batch_data = batch_response.json()
                    batches = batch_data.get('batches', [])
                    
                    if batches and len(batches) > 0:
                        batch = batches[0]
                        if batch.get('batch_number') != 'DEFAULT':
                            self.log_test("Create Product - With MRP & Batch", True, 
                                        f"Product {product_id} created with real batch: {batch.get('batch_number')}")
                        else:
                            self.log_test("Create Product - With MRP & Batch", False, 
                                        f"Product {product_id} created but only fallback batch found")
                    else:
                        self.log_test("Create Product - With MRP & Batch", False, 
                                    f"Product {product_id} created but no batches found")
                else:
                    self.log_test("Create Product - With MRP & Batch", False, 
                                f"Product {product_id} created but batch API failed: {batch_response.status_code}")
                
                return product
            else:
                self.log_test("Create Product - With MRP & Batch", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Create Product - With MRP & Batch", False, f"Exception: {e}")
            return None

    def test_get_products_list(self):
        """Test fetching products list"""
        try:
            response = requests.get(f"{API_BASE_URL}/products?limit=5", timeout=30)
            if response.status_code == 200:
                products = response.json()
                if isinstance(products, list) and len(products) > 0:
                    self.log_test("Get Products - List", True, f"Retrieved {len(products)} products")
                    return products
                else:
                    self.log_test("Get Products - List", False, "No products returned")
                    return []
            else:
                self.log_test("Get Products - List", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Get Products - List", False, f"Exception: {e}")
            return []

    def test_get_product_by_id(self):
        """Test fetching single product by ID"""
        if not self.created_product_ids:
            self.log_test("Get Product - By ID", False, "No products created to test with")
            return None
            
        product_id = self.created_product_ids[0]
        try:
            response = requests.get(f"{API_BASE_URL}/products/{product_id}", timeout=30)
            if response.status_code == 200:
                product = response.json()
                self.log_test("Get Product - By ID", True, f"Retrieved product {product_id}: {product.get('product_name')}")
                return product
            else:
                self.log_test("Get Product - By ID", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Get Product - By ID", False, f"Exception: {e}")
            return None

    def test_product_search(self):
        """Test product search functionality"""
        try:
            # Search for products with "Test" in name
            response = requests.get(f"{API_BASE_URL}/products?search=Test&limit=10", timeout=30)
            if response.status_code == 200:
                products = response.json()
                if isinstance(products, list):
                    test_products = [p for p in products if 'Test' in p.get('product_name', '')]
                    self.log_test("Product Search", True, f"Found {len(test_products)} products matching 'Test'")
                    return products
                else:
                    self.log_test("Product Search", False, "Invalid response format")
                    return []
            else:
                self.log_test("Product Search", False, f"HTTP {response.status_code}: {response.text}")
                return []
        except Exception as e:
            self.log_test("Product Search", False, f"Exception: {e}")
            return []

    def test_update_product(self):
        """Test product update functionality"""
        if not self.created_product_ids:
            self.log_test("Update Product", False, "No products created to test with")
            return None
            
        product_id = self.created_product_ids[0]
        update_data = {
            "manufacturer": "Updated Test Pharma"
        }
        
        try:
            response = requests.put(f"{API_BASE_URL}/products/{product_id}", json=update_data, timeout=30)
            if response.status_code == 200:
                updated_product = response.json()
                if updated_product.get('manufacturer') == "Updated Test Pharma":
                    self.log_test("Update Product", True, f"Successfully updated product {product_id}")
                    return updated_product
                else:
                    self.log_test("Update Product", False, "Product updated but manufacturer not changed")
                    return None
            else:
                self.log_test("Update Product", False, f"HTTP {response.status_code}: {response.text}")
                return None
        except Exception as e:
            self.log_test("Update Product", False, f"Exception: {e}")
            return None

    def run_all_tests(self):
        """Run all product module tests"""
        print("🧪 PRODUCT MODULE TESTS")
        print("="*60)
        
        # Run tests in order
        self.test_create_product_basic()
        self.test_create_product_with_mrp()
        self.test_get_products_list()
        self.test_get_product_by_id()
        self.test_product_search()
        self.test_update_product()
        
        # Summary
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        total_tests = len(self.test_results)
        
        print(f"\n📊 PRODUCT MODULE SUMMARY")
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        if passed_tests == total_tests:
            print("🎉 ALL PRODUCT TESTS PASSED!")
        else:
            print("❌ SOME PRODUCT TESTS FAILED")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed_tests == total_tests

if __name__ == "__main__":
    tester = ProductModuleTests()
    success = tester.run_all_tests()
    exit(0 if success else 1)