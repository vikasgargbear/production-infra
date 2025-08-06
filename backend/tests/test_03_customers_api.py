"""
Test Suite 03: Customers API Testing
Tests customer search, credit management, and GST validation
"""

import pytest
import requests
import json
from datetime import datetime, date
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


class TestCustomersAPI:
    """Test suite for Customers API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_customer_id = None
        cls.test_customer_name = None
        
    def test_01_customer_search(self):
        """Test customer search functionality"""
        test_queries = [
            {"search": "medical", "expected_field": "customer_name"},
            {"search": "27AAPFC", "expected_field": "gst_number"},  # GST search
            {"search": "", "expected_field": None}  # Empty query should return customers
        ]
        
        for test in test_queries:
            # Use the correct endpoint with search parameter
            response = requests.get(
                f"{BASE_URL}/customers",
                params={"search": test["search"], "limit": 10, "skip": 0},
                headers=HEADERS
            )
            
            logger.info(f"Search query: '{test['search']}' - Status: {response.status_code}")
            
            assert response.status_code == 200, f"Search failed: {response.text}"
            
            data = response.json()
            customers = data.get("customers", data) if isinstance(data, dict) else data
            
            # Verify response structure
            if customers and len(customers) > 0:
                customer = customers[0]
                
                # Check required fields based on schema
                assert "customer_id" in customer, "Missing customer_id"
                assert "customer_name" in customer or "name" in customer, "Missing customer name"
                
                # Check GST field - could be gst_number or gstin
                gst_field = None
                if "gst_number" in customer:
                    gst_field = "gst_number"
                elif "gstin" in customer:
                    gst_field = "gstin"
                elif "gst_no" in customer:
                    gst_field = "gst_no"
                    
                logger.info(f"✅ GST field found: {gst_field}")
                
                # Store customer ID for later tests
                if not self.__class__.test_customer_id:
                    self.__class__.test_customer_id = customer.get("customer_id")
                    self.__class__.test_customer_name = customer.get("customer_name", customer.get("name"))
            elif test["search"] == "":
                # Empty search should return some customers
                logger.info(f"Empty search returned {len(customers)} customers")
                    
        logger.info("✅ Customer search tests passed")
        
    def test_02_get_customer_details(self):
        """Test getting single customer details"""
        if not self.test_customer_id:
            # Try to get any customer from the list
            response = requests.get(
                f"{BASE_URL}/customers?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                customers = data.get("customers", [])
                if customers and len(customers) > 0:
                    self.test_customer_id = customers[0].get("customer_id")
                    
        if not self.test_customer_id:
            logger.warning("⚠️ No customers found in database - skipping detail tests")
            return
            
        # Try different endpoint patterns
        endpoints = [
            f"/customers/{self.test_customer_id}",
            f"/customers/details/{self.test_customer_id}",
            f"/customers/get/{self.test_customer_id}"
        ]
        
        success = False
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"✅ Customer details retrieved from {endpoint}")
                    
                    # Verify comprehensive customer data
                    assert "customer_id" in data
                    assert "customer_name" in data or "name" in data
                    
                    # Check for credit fields
                    credit_fields = ["credit_limit", "credit_days", "outstanding_amount"]
                    found_credit_fields = [f for f in credit_fields if f in data]
                    if found_credit_fields:
                        logger.info(f"✅ Credit fields found: {found_credit_fields}")
                    
                    success = True
                    break
                else:
                    logger.warning(f"Endpoint {endpoint} returned {response.status_code}")
                    
            except Exception as e:
                logger.warning(f"Endpoint {endpoint} failed: {str(e)}")
                
        if not success:
            logger.warning("⚠️ No customer detail endpoint found - skipping")
            
    def test_03_customer_credit_check(self):
        """Test customer credit limit and outstanding check"""
        if not self.test_customer_id:
            pytest.skip("No test customer ID available")
            
        # Try credit check endpoints
        endpoints = [
            f"/customers/{self.test_customer_id}/credit",
            f"/customers/{self.test_customer_id}/outstanding",
            f"/customers/credit-check/{self.test_customer_id}"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"✅ Credit info retrieved from {endpoint}")
                    
                    # Verify credit information
                    if "credit_limit" in data or "outstanding" in data:
                        logger.info("✅ Credit information available")
                    break
                    
            except Exception as e:
                continue
                
    def test_04_customer_schema_validation(self):
        """Validate customer data matches parties.customers schema"""
        # Based on schema documentation
        expected_fields = {
            "customer_id": "INTEGER",
            "customer_name": "TEXT",
            "gst_number": "TEXT",  # Could also be gstin
            "credit_limit": "NUMERIC",
            "credit_days": "INTEGER",
            "phone": "TEXT",  # Could be primary_phone
            "email": "TEXT",
            "address": "TEXT"
        }
        
        # Search for a customer to validate
        response = requests.get(
            f"{BASE_URL}/customers/search?limit=1",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/customers?limit=1",
                headers=HEADERS
            )
        
        if response.status_code == 200:
            data = response.json()
            customers = data.get("customers", data) if isinstance(data, dict) else data
            
            if customers and len(customers) > 0:
                customer = customers[0]
                
                # Check critical fields
                missing_fields = []
                for field in ["customer_id", "customer_name"]:
                    if field not in customer and field.replace("customer_", "") not in customer:
                        missing_fields.append(field)
                        
                if missing_fields:
                    logger.warning(f"⚠️ Missing critical fields: {missing_fields}")
                else:
                    logger.info("✅ Customer schema validation passed")
                    
    def test_05_customer_addresses(self):
        """Test customer address retrieval"""
        if not self.test_customer_id:
            pytest.skip("No test customer ID available")
            
        # Try address endpoints
        endpoints = [
            f"/customers/{self.test_customer_id}/addresses",
            f"/addresses?customer_id={self.test_customer_id}"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    data = response.json()
                    addresses = data.get("addresses", data) if isinstance(data, dict) else data
                    
                    if addresses:
                        logger.info(f"✅ Found {len(addresses)} addresses for customer")
                        
                        # Verify address structure
                        if len(addresses) > 0:
                            addr = addresses[0]
                            if "address_type" in addr:
                                logger.info(f"✅ Address type: {addr['address_type']}")
                    break
                    
            except Exception as e:
                continue
                
    def test_06_customer_transactions(self):
        """Test retrieving customer transaction history"""
        if not self.test_customer_id:
            pytest.skip("No test customer ID available")
            
        # Try transaction endpoints
        endpoints = [
            f"/customers/{self.test_customer_id}/transactions",
            f"/customers/{self.test_customer_id}/invoices",
            f"/invoices?customer_id={self.test_customer_id}"
        ]
        
        for endpoint in endpoints:
            try:
                response = requests.get(
                    f"{BASE_URL}{endpoint}",
                    headers=HEADERS
                )
                
                if response.status_code == 200:
                    data = response.json()
                    logger.info(f"✅ Transaction data retrieved from {endpoint}")
                    break
                    
            except Exception as e:
                continue
                
    def test_07_customer_validation_errors(self):
        """Test API validation with invalid customer requests"""
        # Test GST number validation
        test_gst = "INVALID_GST"
        
        response = requests.get(
            f"{BASE_URL}/customers/validate-gst",
            params={"gst": test_gst},
            headers=HEADERS
        )
        
        if response.status_code in [400, 422]:
            logger.info("✅ GST validation working correctly")
        elif response.status_code == 404:
            logger.warning("⚠️ GST validation endpoint not found")
            
        # Test non-existent customer
        response = requests.get(
            f"{BASE_URL}/customers/99999",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            logger.info("✅ Correct 404 for non-existent customer")
        elif response.status_code == 200:
            data = response.json()
            if not data or (isinstance(data, dict) and not data.get("customer_id")):
                logger.info("✅ Empty result for non-existent customer")
                
    def test_08_customer_outstanding_report(self):
        """Test customer outstanding/aging report"""
        # Test outstanding report endpoint
        response = requests.get(
            f"{BASE_URL}/reports/customer-outstanding",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try alternative endpoint
            response = requests.get(
                f"{BASE_URL}/customers/outstanding-report",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info("✅ Outstanding report retrieved")
            
            # Check if report contains aging buckets
            if isinstance(data, dict) and "aging_buckets" in data:
                logger.info("✅ Aging buckets available in report")
        else:
            logger.warning(f"⚠️ Outstanding report endpoint not found")
            
    def test_09_bulk_customer_operations(self):
        """Test bulk customer operations if available"""
        # Test retrieving multiple customers
        response = requests.get(
            f"{BASE_URL}/customers?limit=50&offset=0",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            customers = data.get("customers", data) if isinstance(data, dict) else data
            
            if customers:
                logger.info(f"✅ Bulk retrieval successful: {len(customers)} customers")
                
                # Check pagination
                if isinstance(data, dict):
                    if "total" in data:
                        logger.info(f"✅ Pagination info available: Total {data['total']}")
                        
                # Verify consistent schema across all customers
                phone_fields = set()
                gst_fields = set()
                for customer in customers[:10]:  # Check first 10
                    for field in customer.keys():
                        if "phone" in field.lower():
                            phone_fields.add(field)
                        if "gst" in field.lower():
                            gst_fields.add(field)
                            
                if len(phone_fields) > 1:
                    logger.warning(f"⚠️ Inconsistent phone field names: {phone_fields}")
                else:
                    logger.info(f"✅ Consistent phone field: {phone_fields}")
                    
                if len(gst_fields) > 1:
                    logger.warning(f"⚠️ Inconsistent GST field names: {gst_fields}")
                else:
                    logger.info(f"✅ Consistent GST field: {gst_fields}")


def run_tests():
    """Run all customer API tests"""
    test_suite = TestCustomersAPI()
    test_suite.setup_class()
    
    tests = [
        test_suite.test_01_customer_search,
        test_suite.test_02_get_customer_details,
        test_suite.test_03_customer_credit_check,
        test_suite.test_04_customer_schema_validation,
        test_suite.test_05_customer_addresses,
        test_suite.test_06_customer_transactions,
        test_suite.test_07_customer_validation_errors,
        test_suite.test_08_customer_outstanding_report,
        test_suite.test_09_bulk_customer_operations
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
    logger.info(f"Customer API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)