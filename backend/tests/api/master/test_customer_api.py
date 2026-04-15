#!/usr/bin/env python3
"""
Customer & Address API Test - Tests customer creation, address creation, and address listing
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_customer_api.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.
"""
import os
import sys
import json
import requests
import pytest
from datetime import date, timedelta
import random
import string

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def finish_test(value, predicate=None):
    """Assert under pytest, preserve return values for script-mode runs."""
    ok = predicate(value) if predicate else bool(value)
    if os.getenv("PYTEST_CURRENT_TEST"):
        assert ok
        return None
    return value


def generate_random_phone():
    """Generate random 10-digit phone number"""
    return f"9{''.join(random.choices(string.digits, k=9))}"


def generate_random_gstin():
    """Generate random but valid-format GSTIN (15 chars)"""
    state_code = random.choice(["27", "09", "29", "06", "07"])  # Valid Indian state codes
    pan = ''.join(random.choices(string.ascii_uppercase, k=5)) + ''.join(random.choices(string.digits, k=4)) + random.choice(string.ascii_uppercase)
    entity = "1"
    checksum = random.choice(string.ascii_uppercase + string.digits)
    return f"{state_code}{pan}{entity}Z{checksum}"


def create_test_customer_payload():
    """Create a test customer payload with all fields"""
    phone = generate_random_phone()
    
    payload = {
        # Required fields
        "customer_name": f"API Test Customer {phone[-4:]}",
        "primary_phone": phone,
        "customer_type": "wholesale",
        
        # Business details
        "business_type": "pharmacy",  # Matches frontend: Pharmacy option
        "gst_number": generate_random_gstin(),
        "pan_number": f"{''.join(random.choices(string.ascii_uppercase, k=5))}{''.join(random.choices(string.digits, k=4))}{''.join(random.choices(string.ascii_uppercase, k=1))}",
        
        # Drug license (for pharma)
        "drug_license_number": f"DL-{''.join(random.choices(string.digits, k=6))}",
        "drug_license_validity": str(date.today() + timedelta(days=365)),
        
        # FSSAI License (for food/supplements)
        "fssai_number": f"{''.join(random.choices(string.digits, k=14))}",
        
        # Contact info
        "primary_email": f"test{phone[-4:]}@example.com",
        "secondary_phone": generate_random_phone(),
        "whatsapp_number": phone,
        
        # Contact person
        "contact_person_name": "Test Contact Person",
        "contact_person_phone": generate_random_phone(),
        "contact_person_email": f"contact{phone[-4:]}@example.com",
        
        # Credit terms - Updated to match frontend dropdown values
        "credit_limit": 50000.00,
        "credit_days": 30,
        "credit_rating": "B",  # A, B, C, D as per frontend
        "payment_terms": "NET30",  # CASH, NET15, NET30, NET45, NET60 as per frontend
        "discount_percent": 5.0,  # Default discount percentage
        
        # Address (created inline with customer)
        "address_line1": "Test Building, 123 Main Street",
        "address_line2": "Near Test Landmark",
        "city": "Mumbai",
        "state": "Maharashtra",
        "pincode": "400001",
        
        # Notes
        "internal_notes": "API Test Customer - Auto Created",
        "is_active": True
    }
    
    return payload


def create_test_address_payload(address_type="shipping"):
    """Create a test address payload with all fields"""
    
    cities = ["Mumbai", "Delhi", "Bangalore", "Chennai", "Kolkata", "Pune", "Hyderabad"]
    states = ["Maharashtra", "Delhi", "Karnataka", "Tamil Nadu", "West Bengal", "Maharashtra", "Telangana"]
    
    idx = random.randint(0, len(cities) - 1)
    
    payload = {
        "address_type": address_type,
        "address_line1": f"Building {random.randint(1, 999)}, Street {random.randint(1, 50)}",
        "address_line2": f"Near {random.choice(['Park', 'Hospital', 'School', 'Mall', 'Station'])}",
        "landmark": f"{random.choice(['Opposite', 'Near', 'Behind'])} {random.choice(['Big Bazaar', 'SBI Bank', 'Petrol Pump', 'Bus Stop'])}",
        "city": cities[idx],
        "state": states[idx],
        "pincode": f"{random.randint(100, 999)}00{random.randint(1, 9)}",
        "country": "India",
        "mobile": generate_random_phone(),
        "is_default": address_type == "shipping"
    }
    
    return payload


def test_create_customer():
    """Test customer creation with full payload"""
    print("\n" + "=" * 70)
    print("TEST 1: CREATE CUSTOMER")
    print("=" * 70)
    
    payload = create_test_customer_payload()
    
    print(f"\n--- FULL PAYLOAD (matching frontend form) ---")
    print(f"  [Basic Information]")
    print(f"    customer_name:      {payload['customer_name']}")
    print(f"    primary_phone:      {payload['primary_phone']}")
    print(f"    whatsapp_number:    {payload['whatsapp_number']}")
    print(f"    primary_email:      {payload['primary_email']}")
    print(f"  [Address Information]")
    print(f"    address_line1:      {payload['address_line1']}")
    print(f"    address_line2:      {payload['address_line2']}")
    print(f"    city:               {payload['city']}")
    print(f"    state:              {payload['state']}")
    print(f"    pincode:            {payload['pincode']}")
    print(f"  [Business Type]")
    print(f"    customer_type:      {payload['customer_type']}")
    print(f"    business_type:      {payload['business_type']}")
    print(f"  [Compliance Information]")
    print(f"    drug_license_number: {payload['drug_license_number']}")
    print(f"    drug_license_validity: {payload['drug_license_validity']}")
    print(f"    gst_number:         {payload['gst_number']}")
    print(f"    pan_number:         {payload['pan_number']}")
    print(f"  [Credit Management]")
    print(f"    credit_rating:      {payload['credit_rating']}")
    print(f"    credit_limit:       ₹{payload['credit_limit']}")
    print(f"    credit_days:        {payload['credit_days']}")
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/customers/",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code not in [200, 201]:
            print(f"❌ API Error: {response.text}")
            return None
        
        result = response.json()
        customer_id = result.get('customer_id')
        
        print(f"✅ Customer created successfully!")
        print(f"   Customer ID: {customer_id}")
        print(f"   Customer Code: {result.get('customer_code')}")
        print(f"   Name: {result.get('customer_name')}")
        
        return finish_test(customer_id)
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return finish_test(None)


def get_any_customer_id():
    """Get any customer ID for standalone pytest execution."""
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.get(f"{API_BASE_URL}/api/customers/?limit=1", headers=headers, timeout=30)
        if response.status_code != 200:
            return None
        result = response.json()
        customers = result if isinstance(result, list) else result.get("data", [])
        if customers:
            return customers[0].get("customer_id") or customers[0].get("id")
    except requests.RequestException:
        return None
    return None


def test_create_address(customer_id=None):
    """Test address creation for existing customer"""
    if customer_id is None:
        customer_id = get_any_customer_id()
    if customer_id is None:
        pytest.skip("No customer available for address creation test")

    print("\n" + "=" * 70)
    print("TEST 2: CREATE CUSTOMER ADDRESS")
    print("=" * 70)
    
    payload = create_test_address_payload(address_type="shipping")
    
    print(f"\nPayload summary:")
    print(f"  Customer ID: {customer_id}")
    print(f"  Address Type: {payload['address_type']}")
    print(f"  City: {payload['city']}, {payload['state']}")
    print(f"  Pincode: {payload['pincode']}")
    print(f"  Mobile: {payload['mobile']}")
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/customers/{customer_id}/addresses",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code not in [200, 201]:
            print(f"❌ API Error: {response.text}")
            return None
        
        result = response.json()
        
        print(f"✅ Address created successfully!")
        print(f"   Success: {result.get('success')}")
        print(f"   Address ID: {result.get('address_id')}")
        print(f"   Customer ID: {result.get('customer_id')}")
        
        return finish_test(result.get('address_id'))
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return finish_test(None)


def test_list_addresses(customer_id=None):
    """Test listing addresses for a customer"""
    if customer_id is None:
        customer_id = get_any_customer_id()
    if customer_id is None:
        pytest.skip("No customer available for address listing test")

    print("\n" + "=" * 70)
    print("TEST 3: LIST CUSTOMER ADDRESSES")
    print("=" * 70)
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/customers/{customer_id}/addresses",
            headers=headers,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.text}")
            return False
        
        result = response.json()
        
        print(f"✅ Addresses retrieved successfully!")
        print(f"   Success: {result.get('success')}")
        print(f"   Total Addresses: {result.get('total_addresses')}")
        
        addresses = result.get('data', [])
        for i, addr in enumerate(addresses, 1):
            print(f"\n   Address {i}:")
            print(f"     Type: {addr.get('address_type')}")
            print(f"     Line 1: {addr.get('address_line1')}")
            print(f"     City: {addr.get('city')}, {addr.get('state_name')}")
            print(f"     Pincode: {addr.get('pincode')}")
            print(f"     Is Default: {addr.get('is_default')}")
        
        return finish_test(True)
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return finish_test(False)


def test_get_customer(customer_id=None):
    """Test getting customer details with addresses"""
    if customer_id is None:
        customer_id = get_any_customer_id()
    if customer_id is None:
        pytest.skip("No customer available for customer detail test")

    print("\n" + "=" * 70)
    print("TEST 4: GET CUSTOMER DETAILS")
    print("=" * 70)
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/customers/{customer_id}",
            headers=headers,
            timeout=30
        )
        
        print(f"\nResponse status: {response.status_code}")
        
        if response.status_code != 200:
            print(f"❌ API Error: {response.text}")
            return False
        
        result = response.json()
        
        print(f"✅ Customer retrieved successfully!")
        print(f"   Customer ID: {result.get('customer_id')}")
        print(f"   Customer Code: {result.get('customer_code')}")
        print(f"   Name: {result.get('customer_name')}")
        print(f"   Phone: {result.get('primary_phone')}")
        print(f"   GST: {result.get('gst_number')}")
        print(f"   Credit Limit: ₹{result.get('credit_limit')}")
        print(f"   Addresses: {len(result.get('addresses', []))} found")
        
        return finish_test(True)
        
    except requests.RequestException as e:
        print(f"❌ Request failed: {e}")
        return finish_test(False)


def print_verification_queries(customer_id, address_id):
    """Print SQL queries for manual verification"""
    print("\n" + "=" * 70)
    print("VERIFICATION QUERIES")
    print("=" * 70)
    
    print("\n-- Verify customer in database:")
    print(f"""
SELECT 
    customer_id,
    customer_code,
    customer_name,
    primary_phone,
    gst_number,
    credit_limit,
    is_active,
    created_at
FROM parties.customers
WHERE customer_id = {customer_id};
""")
    
    print("\n-- Verify addresses for customer:")
    print(f"""
SELECT 
    address_id,
    customer_id,
    address_type,
    address_line1,
    city,
    state_name,
    pincode,
    is_default,
    mobile,
    created_at
FROM parties.customer_addresses
WHERE customer_id = {customer_id};
""")
    
    if address_id:
        print("\n-- Verify specific address:")
        print(f"""
SELECT * 
FROM parties.customer_addresses
WHERE address_id = {address_id};
""")


def main():
    """Run all customer and address API tests"""
    print("\n" + "=" * 70)
    print("CUSTOMER & ADDRESS API TEST SUITE (TEST_MODE)")
    print("=" * 70)
    
    print(f"\nAPI URL: {API_BASE_URL}")
    print("Auth: TEST_MODE bypass (no token needed)")
    
    # Track test results
    results = {
        "create_customer": False,
        "create_address": False,
        "list_addresses": False,
        "get_customer": False
    }
    
    # Test 1: Create customer
    customer_id = test_create_customer()
    results["create_customer"] = customer_id is not None
    
    if not customer_id:
        print("\n❌ Cannot continue without customer. Using existing customer ID 108.")
        customer_id = 108
    
    # Test 2: Create address
    address_id = test_create_address(customer_id)
    results["create_address"] = address_id is not None
    
    # Test 3: List addresses
    results["list_addresses"] = test_list_addresses(customer_id)
    
    # Test 4: Get customer with addresses
    results["get_customer"] = test_get_customer(customer_id)
    
    # Print verification queries
    print_verification_queries(customer_id, address_id)
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    passed = sum(results.values())
    total = len(results)
    
    for test_name, passed_test in results.items():
        status = "✅ PASS" if passed_test else "❌ FAIL"
        print(f"  {test_name}: {status}")
    
    print(f"\n  Total: {passed}/{total} tests passed")
    
    return passed == total


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
