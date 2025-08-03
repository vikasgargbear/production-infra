#!/usr/bin/env python3
"""
Search Functionality Tests
Tests all search capabilities across products, customers, and other modules
"""
import requests
import json
import time
from datetime import datetime

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class SearchFunctionalityTests:
    def __init__(self):
        self.test_results = []
        self.test_data = {}

    def log_test(self, test_name, passed, details=""):
        """Log test result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        self.test_results.append({"test": test_name, "passed": passed, "details": details})
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")

    def setup_test_data(self):
        """Create test data for search testing"""
        print("📋 Setting up test data for search tests...")
        
        # Create test products with specific names for search testing
        test_products = [
            {
                "product_name": "Search Test Paracetamol 500mg",
                "manufacturer": "SearchPharma Ltd",
                "product_type": "Medicine",
                "generic_name": "Paracetamol",
                "brand": "SearchBrand",
                "hsn_code": "3004"
            },
            {
                "product_name": "Search Test Amoxicillin Capsules",
                "manufacturer": "SearchPharma Ltd", 
                "product_type": "Medicine",
                "generic_name": "Amoxicillin",
                "brand": "SearchBrand",
                "hsn_code": "3004"
            },
            {
                "product_name": "Search Test Cough Syrup",
                "manufacturer": "Different Pharma",
                "product_type": "Syrup",
                "generic_name": "Dextromethorphan",
                "brand": "CoughCure",
                "hsn_code": "3004"
            }
        ]
        
        created_products = []
        for product_data in test_products:
            try:
                response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
                if response.status_code == 201:
                    created_products.append(response.json())
            except Exception as e:
                print(f"    ⚠️ Failed to create test product: {e}")
        
        self.test_data['products'] = created_products
        
        # Create test customers
        test_customers = [
            {
                "customer_name": "Search Test Medical Store",
                "contact_person": "John Search",
                "phone": "9123456789",
                "email": "search@medical.com",
                "address": "123 Search Street"
            },
            {
                "customer_name": "Search Test Pharmacy Chain", 
                "contact_person": "Jane Search",
                "phone": "9123456790",
                "email": "search@pharmacy.com",
                "address": "456 Search Avenue"
            }
        ]
        
        created_customers = []
        for customer_data in test_customers:
            try:
                response = requests.post(f"{API_BASE_URL}/customers/", json=customer_data, timeout=30)
                if response.status_code == 201:
                    created_customers.append(response.json())
            except Exception as e:
                print(f"    ⚠️ Failed to create test customer: {e}")
        
        self.test_data['customers'] = created_customers
        
        print(f"    ✅ Created {len(created_products)} test products and {len(created_customers)} test customers")
        return len(created_products) > 0 and len(created_customers) > 0

    def test_product_search_by_name(self):
        """Test product search by name"""
        search_terms = ["Paracetamol", "Search Test", "Cough"]
        
        for term in search_terms:
            try:
                response = requests.get(f"{API_BASE_URL}/products?search={term}&limit=20", timeout=30)
                if response.status_code == 200:
                    products = response.json()
                    if isinstance(products, list):
                        matching_products = [p for p in products if term.lower() in p.get('product_name', '').lower()]
                        if len(matching_products) > 0:
                            self.log_test(f"Product Search - Name '{term}'", True, 
                                        f"Found {len(matching_products)} products matching '{term}'")
                        else:
                            self.log_test(f"Product Search - Name '{term}'", False, 
                                        f"No products found matching '{term}'")
                    else:
                        self.log_test(f"Product Search - Name '{term}'", False, "Invalid response format")
                else:
                    self.log_test(f"Product Search - Name '{term}'", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Product Search - Name '{term}'", False, f"Exception: {e}")

    def test_product_search_by_generic_name(self):
        """Test product search by generic name"""
        search_terms = ["Paracetamol", "Amoxicillin", "Dextromethorphan"]
        
        for term in search_terms:
            try:
                response = requests.get(f"{API_BASE_URL}/products?search={term}&limit=20", timeout=30)
                if response.status_code == 200:
                    products = response.json()
                    if isinstance(products, list):
                        matching_products = [p for p in products if term.lower() in p.get('generic_name', '').lower()]
                        if len(matching_products) > 0:
                            self.log_test(f"Product Search - Generic '{term}'", True, 
                                        f"Found {len(matching_products)} products with generic '{term}'")
                        else:
                            self.log_test(f"Product Search - Generic '{term}'", False, 
                                        f"No products found with generic '{term}'")
                    else:
                        self.log_test(f"Product Search - Generic '{term}'", False, "Invalid response format")
                else:
                    self.log_test(f"Product Search - Generic '{term}'", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Product Search - Generic '{term}'", False, f"Exception: {e}")

    def test_product_search_by_manufacturer(self):
        """Test product search by manufacturer"""
        search_terms = ["SearchPharma", "Different Pharma"]
        
        for term in search_terms:
            try:
                response = requests.get(f"{API_BASE_URL}/products?search={term}&limit=20", timeout=30)
                if response.status_code == 200:
                    products = response.json()
                    if isinstance(products, list):
                        matching_products = [p for p in products if term.lower() in p.get('manufacturer', '').lower()]
                        if len(matching_products) > 0:
                            self.log_test(f"Product Search - Manufacturer '{term}'", True, 
                                        f"Found {len(matching_products)} products from '{term}'")
                        else:
                            self.log_test(f"Product Search - Manufacturer '{term}'", False, 
                                        f"No products found from '{term}'")
                    else:
                        self.log_test(f"Product Search - Manufacturer '{term}'", False, "Invalid response format")
                else:
                    self.log_test(f"Product Search - Manufacturer '{term}'", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Product Search - Manufacturer '{term}'", False, f"Exception: {e}")

    def test_product_filter_by_type(self):
        """Test product filtering by product type"""
        filter_types = ["Medicine", "Syrup"]
        
        for product_type in filter_types:
            try:
                response = requests.get(f"{API_BASE_URL}/products?product_type={product_type}&limit=20", timeout=30)
                if response.status_code == 200:
                    products = response.json()
                    if isinstance(products, list):
                        type_products = [p for p in products if p.get('product_type') == product_type]
                        self.log_test(f"Product Filter - Type '{product_type}'", True, 
                                    f"Found {len(type_products)} {product_type} products")
                    else:
                        self.log_test(f"Product Filter - Type '{product_type}'", False, "Invalid response format")
                else:
                    self.log_test(f"Product Filter - Type '{product_type}'", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Product Filter - Type '{product_type}'", False, f"Exception: {e}")

    def test_customer_search_by_name(self):
        """Test customer search by name"""
        search_terms = ["Search Test", "Medical", "Pharmacy"]
        
        for term in search_terms:
            try:
                response = requests.get(f"{API_BASE_URL}/customers?search={term}&limit=20", timeout=30)
                if response.status_code == 200:
                    customers = response.json()
                    if isinstance(customers, list):
                        matching_customers = [c for c in customers if term.lower() in c.get('customer_name', '').lower()]
                        if len(matching_customers) > 0:
                            self.log_test(f"Customer Search - Name '{term}'", True, 
                                        f"Found {len(matching_customers)} customers matching '{term}'")
                        else:
                            self.log_test(f"Customer Search - Name '{term}'", False, 
                                        f"No customers found matching '{term}'")
                    else:
                        self.log_test(f"Customer Search - Name '{term}'", False, "Invalid response format")
                else:
                    self.log_test(f"Customer Search - Name '{term}'", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Customer Search - Name '{term}'", False, f"Exception: {e}")

    def test_customer_search_by_phone(self):
        """Test customer search by phone"""
        search_terms = ["9123456789", "912345"]
        
        for term in search_terms:
            try:
                response = requests.get(f"{API_BASE_URL}/customers?search={term}&limit=20", timeout=30)
                if response.status_code == 200:
                    customers = response.json()
                    if isinstance(customers, list):
                        matching_customers = [c for c in customers if term in c.get('phone', '')]
                        if len(matching_customers) > 0:
                            self.log_test(f"Customer Search - Phone '{term}'", True, 
                                        f"Found {len(matching_customers)} customers with phone containing '{term}'")
                        else:
                            self.log_test(f"Customer Search - Phone '{term}'", False, 
                                        f"No customers found with phone containing '{term}'")
                    else:
                        self.log_test(f"Customer Search - Phone '{term}'", False, "Invalid response format")
                else:
                    self.log_test(f"Customer Search - Phone '{term}'", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Customer Search - Phone '{term}'", False, f"Exception: {e}")

    def test_search_response_time(self):
        """Test search response times are reasonable"""
        test_searches = [
            ("products", "search=Test"),
            ("customers", "search=Search"),
            ("products", "product_type=Medicine"),
            ("customers", "customer_type=regular")
        ]
        
        for endpoint, query in test_searches:
            try:
                start_time = time.time()
                response = requests.get(f"{API_BASE_URL}/{endpoint}?{query}&limit=10", timeout=30)
                end_time = time.time()
                
                response_time = end_time - start_time
                
                if response.status_code == 200 and response_time < 2.0:  # Should respond within 2 seconds
                    self.log_test(f"Search Performance - {endpoint} ({query})", True, 
                                f"Response time: {response_time:.3f}s")
                elif response.status_code == 200:
                    self.log_test(f"Search Performance - {endpoint} ({query})", False, 
                                f"Slow response: {response_time:.3f}s (expected < 2s)")
                else:
                    self.log_test(f"Search Performance - {endpoint} ({query})", False, 
                                f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                self.log_test(f"Search Performance - {endpoint} ({query})", False, f"Exception: {e}")

    def test_search_case_insensitive(self):
        """Test that searches are case insensitive"""
        search_variations = [
            ("paracetamol", "PARACETAMOL", "Paracetamol"),
            ("search", "SEARCH", "Search"),
            ("test", "TEST", "Test")
        ]
        
        for lower, upper, title in search_variations:
            try:
                # Test with different cases
                responses = []
                for term in [lower, upper, title]:
                    response = requests.get(f"{API_BASE_URL}/products?search={term}&limit=10", timeout=30)
                    if response.status_code == 200:
                        responses.append(len(response.json()))
                    else:
                        responses.append(-1)
                
                # All searches should return same number of results
                if len(set(responses)) == 1 and responses[0] > 0:
                    self.log_test(f"Search Case Insensitive - '{lower}'", True, 
                                f"All case variations returned {responses[0]} results")
                elif len(set(responses)) == 1 and responses[0] == 0:
                    self.log_test(f"Search Case Insensitive - '{lower}'", True, 
                                f"No results found (consistent across cases)")
                else:
                    self.log_test(f"Search Case Insensitive - '{lower}'", False, 
                                f"Inconsistent results: {responses}")
            except Exception as e:
                self.log_test(f"Search Case Insensitive - '{lower}'", False, f"Exception: {e}")

    def test_search_pagination(self):
        """Test search pagination works correctly"""
        try:
            # Get first page
            response1 = requests.get(f"{API_BASE_URL}/products?limit=5&skip=0", timeout=30)
            # Get second page  
            response2 = requests.get(f"{API_BASE_URL}/products?limit=5&skip=5", timeout=30)
            
            if response1.status_code == 200 and response2.status_code == 200:
                products1 = response1.json()
                products2 = response2.json()
                
                if isinstance(products1, list) and isinstance(products2, list):
                    # Check that products are different (no overlap)
                    ids1 = {p.get('product_id') for p in products1}
                    ids2 = {p.get('product_id') for p in products2}
                    overlap = ids1.intersection(ids2)
                    
                    if len(overlap) == 0:
                        self.log_test("Search Pagination", True, 
                                    f"Page 1: {len(products1)} products, Page 2: {len(products2)} products, no overlap")
                    else:
                        self.log_test("Search Pagination", False, 
                                    f"Pages have overlapping products: {len(overlap)} duplicates")
                else:
                    self.log_test("Search Pagination", False, "Invalid response format")
            else:
                self.log_test("Search Pagination", False, 
                            f"HTTP errors: {response1.status_code}, {response2.status_code}")
        except Exception as e:
            self.log_test("Search Pagination", False, f"Exception: {e}")

    def run_all_tests(self):
        """Run all search functionality tests"""
        print("🧪 SEARCH FUNCTIONALITY TESTS")
        print("="*60)
        
        # Setup test data
        if not self.setup_test_data():
            print("⚠️ Warning: Could not create all test data - some tests may fail")
        
        # Wait for data to be indexed
        time.sleep(2)
        
        # Run search tests
        self.test_product_search_by_name()
        self.test_product_search_by_generic_name()  
        self.test_product_search_by_manufacturer()
        self.test_product_filter_by_type()
        self.test_customer_search_by_name()
        self.test_customer_search_by_phone()
        self.test_search_response_time()
        self.test_search_case_insensitive()
        self.test_search_pagination()
        
        # Summary
        passed_tests = sum(1 for result in self.test_results if result['passed'])
        total_tests = len(self.test_results)
        
        print(f"\n📊 SEARCH FUNCTIONALITY SUMMARY")
        print(f"Tests Passed: {passed_tests}/{total_tests}")
        if passed_tests == total_tests:
            print("🎉 ALL SEARCH TESTS PASSED!")
        else:
            print("❌ SOME SEARCH TESTS FAILED")
            for result in self.test_results:
                if not result['passed']:
                    print(f"  - {result['test']}: {result['details']}")
        
        return passed_tests == total_tests

if __name__ == "__main__":
    tester = SearchFunctionalityTests()
    success = tester.run_all_tests()
    exit(0 if success else 1)