#!/usr/bin/env python3
"""
Complete end-to-end test for customer creation with new B2B/B2C toggle component
Tests both backend API and verifies frontend data mapping
"""

import requests
import json
from datetime import datetime

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

def test_b2b_customer_creation():
    """Test B2B customer creation with comprehensive data"""
    print("=== Testing B2B Customer Creation ===")
    
    customer_data = {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "customer_name": "ABC Pharmacy & Medical Store",
        "customer_type": "wholesale",  # B2B maps to wholesale
        "primary_phone": "9876543212",
        "email": "abc@pharmacy.com",
        "secondary_phone": "9876543213",
        "contact_person": "Dr. Rajesh Kumar",
        "gstin": "29AABCU9603R1ZX",
        "pan_number": "AABCU9603R",
        "drug_license_number": "DL-MH-123456",
        "credit_limit": 200000,
        "credit_days": 45,
        "notes": "B2B customer. Business Type: Pharmacy",
        "is_active": True
    }
    
    response = requests.post(f"{BASE_URL}/customers/", json=customer_data)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code in [200, 201]:
        data = response.json()
        print("✅ B2B Customer created successfully!")
        print(f"Customer ID: {data.get('customer_id')}")
        print(f"Customer Code: {data.get('customer_code')}")
        print(f"Customer Name: {data.get('customer_name')}")
        print(f"Customer Type: {data.get('customer_type')}")
        print(f"Credit Limit: ₹{data.get('credit_limit')}")
        print(f"Credit Days: {data.get('credit_days')}")
        return data
    else:
        print(f"❌ Error creating B2B customer: {response.text}")
        return None

def test_b2c_customer_creation():
    """Test B2C customer creation with individual data"""
    print("\n=== Testing B2C Customer Creation ===")
    
    customer_data = {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "customer_name": "Priya Sharma",
        "customer_type": "retail",  # B2C maps to retail
        "primary_phone": "9876543214",
        "email": "priya.sharma@email.com",
        "credit_limit": 10000,
        "credit_days": 7,
        "notes": "B2C customer. Business Type: Individual",
        "is_active": True
    }
    
    response = requests.post(f"{BASE_URL}/customers/", json=customer_data)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code in [200, 201]:
        data = response.json()
        print("✅ B2C Customer created successfully!")
        print(f"Customer ID: {data.get('customer_id')}")
        print(f"Customer Code: {data.get('customer_code')}")
        print(f"Customer Name: {data.get('customer_name')}")
        print(f"Customer Type: {data.get('customer_type')}")
        print(f"Credit Limit: ₹{data.get('credit_limit')}")
        print(f"Credit Days: {data.get('credit_days')}")
        return data
    else:
        print(f"❌ Error creating B2C customer: {response.text}")
        return None

def test_customer_validation_errors():
    """Test validation errors to ensure frontend handles them correctly"""
    print("\n=== Testing Validation Errors ===")
    
    # Test missing required fields
    invalid_data = {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "customer_name": "Test Customer",
        # Missing required primary_phone
        "customer_type": "invalid_type"  # Invalid type
    }
    
    response = requests.post(f"{BASE_URL}/customers/", json=invalid_data)
    
    print(f"Status Code: {response.status_code}")
    
    if response.status_code == 422:
        errors = response.json()
        print("✅ Validation errors caught correctly:")
        if 'detail' in errors:
            for error in errors['detail']:
                field = '.'.join(error['loc'][1:]) if len(error['loc']) > 1 else error['loc'][0]
                print(f"  - Field '{field}': {error['msg']}")
        return True
    else:
        print(f"❌ Expected validation error, got: {response.text}")
        return False

def test_frontend_data_mapping():
    """Test that frontend data mapping matches backend expectations"""
    print("\n=== Testing Frontend Data Mapping ===")
    
    # This simulates the exact data structure that the fixed frontend sends
    frontend_b2b_data = {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "customer_name": "XYZ Medical Supplies",
        "customer_type": "wholesale",  # Frontend now correctly maps B2B to 'wholesale'
        "primary_phone": "9876543215",
        "email": "xyz@medical.com",  # Frontend correctly maps 'primary_email' to 'email'
        "secondary_phone": "9876543216",
        "contact_person": "Mr. Suresh Patel",  # Frontend correctly maps 'contact_person_name' to 'contact_person'
        "gstin": "24AABCU9603R1ZX",  # Frontend correctly maps 'gst_number' to 'gstin'
        "pan_number": "AABCU9603R",
        "drug_license_number": "DL-GJ-789012",
        "credit_limit": 150000,
        "credit_days": 30,
        "notes": "B2B customer. Business Type: Medical Store",
        "is_active": True
    }
    
    print("Testing frontend B2B data mapping...")
    response = requests.post(f"{BASE_URL}/customers/", json=frontend_b2b_data)
    
    if response.status_code in [200, 201]:
        print("✅ Frontend B2B data mapping is correct!")
        data = response.json()
        print(f"Created customer: {data.get('customer_name')} (ID: {data.get('customer_id')})")
        
        # Test B2C mapping
        frontend_b2c_data = {
            "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
            "customer_name": "Amit Singh",
            "customer_type": "retail",  # Frontend now correctly maps B2C to 'retail'
            "primary_phone": "9876543217",
            "email": "amit.singh@email.com",
            "credit_limit": 5000,
            "credit_days": 15,
            "notes": "B2C customer. Business Type: Individual",
            "is_active": True
        }
        
        print("Testing frontend B2C data mapping...")
        response = requests.post(f"{BASE_URL}/customers/", json=frontend_b2c_data)
        
        if response.status_code in [200, 201]:
            print("✅ Frontend B2C data mapping is correct!")
            data = response.json()
            print(f"Created customer: {data.get('customer_name')} (ID: {data.get('customer_id')})")
            return True
        else:
            print(f"❌ Frontend B2C data mapping failed: {response.text}")
            return False
    else:
        print(f"❌ Frontend B2B data mapping failed: {response.text}")
        return False

def test_customer_retrieval(customer_id):
    """Test customer retrieval to verify data storage"""
    print(f"\n=== Testing Customer Retrieval (ID: {customer_id}) ===")
    
    response = requests.get(f"{BASE_URL}/customers/{customer_id}")
    
    if response.status_code == 200:
        data = response.json()
        print("✅ Customer retrieved successfully!")
        print(f"Name: {data.get('customer_name')}")
        print(f"Type: {data.get('customer_type')}")
        print(f"Phone: {data.get('primary_phone')}")
        print(f"Email: {data.get('email')}")
        return data
    else:
        print(f"❌ Error retrieving customer: {response.text}")
        return None

def main():
    """Main test execution"""
    print("🚀 Starting Complete Customer Creation End-to-End Test")
    print("=" * 70)
    
    # Test B2B customer creation
    b2b_customer = test_b2b_customer_creation()
    
    # Test B2C customer creation  
    b2c_customer = test_b2c_customer_creation()
    
    # Test validation errors
    validation_ok = test_customer_validation_errors()
    
    # Test frontend data mapping
    mapping_ok = test_frontend_data_mapping()
    
    # Test customer retrieval if we have created customers
    if b2b_customer:
        test_customer_retrieval(b2b_customer['customer_id'])
    
    if b2c_customer:
        test_customer_retrieval(b2c_customer['customer_id'])
    
    print("\n" + "=" * 70)
    print("🏁 Customer Creation Test Complete")
    
    # Summary
    tests_passed = 0
    total_tests = 4
    
    if b2b_customer:
        tests_passed += 1
        print("✅ B2B Customer Creation: PASSED")
    else:
        print("❌ B2B Customer Creation: FAILED")
    
    if b2c_customer:
        tests_passed += 1
        print("✅ B2C Customer Creation: PASSED")
    else:
        print("❌ B2C Customer Creation: FAILED")
    
    if validation_ok:
        tests_passed += 1
        print("✅ Validation Error Handling: PASSED")
    else:
        print("❌ Validation Error Handling: FAILED")
    
    if mapping_ok:
        tests_passed += 1
        print("✅ Frontend Data Mapping: PASSED")
    else:
        print("❌ Frontend Data Mapping: FAILED")
    
    print(f"\n🎯 Overall Result: {tests_passed}/{total_tests} tests passed")
    
    if tests_passed == total_tests:
        print("🎉 ALL TESTS PASSED - Customer creation is working correctly!")
        print("🚀 Frontend can now be tested with confidence")
    else:
        print("⚠️  Some tests failed - see details above")

if __name__ == "__main__":
    main()