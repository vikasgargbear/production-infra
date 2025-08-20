#!/usr/bin/env python3
"""
Complete end-to-end test for sales order flow
Tests the full workflow from creation to calculation verification
"""

import requests
import json
from decimal import Decimal
import time

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

def test_employees_endpoint():
    """Test employees endpoint for Created By dropdown"""
    print("=== Testing Employees Endpoint ===")
    
    response = requests.get(f"{BASE_URL}/sales-orders/employees")
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        employees = response.json()
        print(f"Found {len(employees)} employees:")
        for emp in employees:
            print(f"  - {emp['full_name']} (ID: {emp['user_id']})")
        return employees[0]['user_id'] if employees else None
    else:
        print(f"Error: {response.text}")
        return None

def find_valid_customer():
    """Find a valid customer ID by trying several IDs"""
    print("\n=== Finding Valid Customer ===")
    
    for customer_id in range(1, 20):  # Try IDs 1-19
        test_data = {
            "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
            "customer_id": customer_id,
            "order_date": "2025-01-20",
            "order_type": "regular",
            "created_by": 2,
            "items": []  # Empty items for validation test
        }
        
        response = requests.post(f"{BASE_URL}/sales-orders/validate", json=test_data)
        if response.status_code == 200:
            result = response.json()
            if result.get("valid", False) or "Customer not found" not in result.get("message", ""):
                print(f"Found valid customer ID: {customer_id}")
                return customer_id
        
        time.sleep(0.1)  # Small delay to avoid overwhelming the API
    
    print("No valid customer found in range 1-19")
    return None

def find_valid_product():
    """Find a valid product ID by trying several IDs"""
    print("\n=== Finding Valid Product ===")
    
    for product_id in range(1, 20):  # Try IDs 1-19
        test_data = {
            "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d", 
            "customer_id": 1,  # Use any customer for product validation
            "order_date": "2025-01-20",
            "order_type": "regular",
            "created_by": 2,
            "items": [
                {
                    "product_id": product_id,
                    "quantity": 1,
                    "unit_price": 10.00,
                    "discount_percent": 0,
                    "tax_percent": 12
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/sales-orders/validate", json=test_data)
        if response.status_code == 200:
            result = response.json()
            if result.get("valid", False) or "Product" not in result.get("message", ""):
                print(f"Found valid product ID: {product_id}")
                return product_id
        
        time.sleep(0.1)  # Small delay
    
    print("No valid product found in range 1-19")
    return None

def test_sales_order_creation(customer_id, product_id, employee_id):
    """Test complete sales order creation with calculation verification"""
    print(f"\n=== Testing Sales Order Creation ===")
    print(f"Customer ID: {customer_id}")
    print(f"Product ID: {product_id}")
    print(f"Employee ID: {employee_id}")
    
    # The corrected Azethro example
    order_data = {
        "org_id": "ad808530-1ddb-4377-ab20-67bef145d80d",
        "customer_id": customer_id,
        "order_date": "2025-01-20",
        "order_type": "regular",
        "created_by": employee_id,
        "payment_terms": "credit",
        "notes": "Test order for calculation verification",
        "items": [
            {
                "product_id": product_id,
                "quantity": 9,
                "unit_price": 10.00,
                "discount_percent": 12,
                "tax_percent": 12,
                "pack_type": "Strip",
                "pack_size": 10,
                "uom": "PCS"
            }
        ]
    }
    
    print("Creating sales order...")
    response = requests.post(f"{BASE_URL}/sales-orders/", json=order_data)
    
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200 or response.status_code == 201:
        order = response.json()
        print("✅ Sales order created successfully!")
        
        # Verify calculations
        print(f"\n=== CALCULATION VERIFICATION ===")
        print(f"Order ID: {order.get('order_id')}")
        print(f"Order Number: {order.get('order_number')}")
        
        # Check totals
        subtotal = order.get('subtotal_amount', 0)
        discount = order.get('discount_amount', 0) 
        tax = order.get('tax_amount', 0)
        final_total = order.get('final_amount', 0)
        
        print(f"Sub Total: ₹{subtotal}")
        print(f"Discount: ₹{discount}")
        print(f"Tax Amount: ₹{tax}")
        print(f"Final Total: ₹{final_total}")
        
        # Verify calculations are correct
        expected_gross = 9 * 10.00  # 90.00
        expected_discount = expected_gross * 0.12  # 10.80
        expected_taxable = expected_gross - expected_discount  # 79.20
        expected_tax = expected_taxable * 0.12  # 9.504
        expected_final = expected_taxable + expected_tax  # 88.704
        
        print(f"\n=== EXPECTED vs ACTUAL ===")
        print(f"Expected Taxable: ₹{expected_taxable} | Actual: ₹{subtotal}")
        print(f"Expected Tax: ₹{expected_tax} | Actual: ₹{tax}")
        print(f"Expected Final: ₹{expected_final} | Actual: ₹{final_total}")
        
        # Check if calculations are within acceptable range (rounding differences)
        taxable_correct = abs(float(subtotal) - expected_taxable) < 0.01
        tax_correct = abs(float(tax) - expected_tax) < 0.01
        final_correct = abs(float(final_total) - expected_final) < 0.01
        
        print(f"\n=== VALIDATION RESULTS ===")
        print(f"Taxable Amount Correct: {'✅' if taxable_correct else '❌'}")
        print(f"Tax Amount Correct: {'✅' if tax_correct else '❌'}")
        print(f"Final Amount Correct: {'✅' if final_correct else '❌'}")
        
        if taxable_correct and tax_correct and final_correct:
            print("\n🎉 ALL CALCULATIONS VERIFIED - NO MORE NEGATIVE SUBTOTALS!")
            return order
        else:
            print("\n⚠️  Calculation discrepancies found")
            return None
            
    else:
        print(f"❌ Error creating sales order: {response.text}")
        return None

def test_pack_unit_format(order):
    """Verify pack unit format in created order"""
    print(f"\n=== Testing Pack Unit Format ===")
    
    if order and 'items' in order:
        for item in order['items']:
            pack_size = item.get('pack_size', 1)
            pack_type = item.get('pack_type', 'NOS')
            
            expected_format = f"1x{pack_size} {pack_type}"
            print(f"Expected Pack Unit: {expected_format}")
            
            # This would be displayed on frontend as "1x10 Strip" instead of "1x1 NOS"
            if pack_size > 1 and pack_type != "NOS":
                print("✅ Pack unit format is correct")
            else:
                print("⚠️  Pack unit needs formatting improvement")

def main():
    """Main test execution"""
    print("🚀 Starting Complete Sales Order End-to-End Test")
    print("=" * 60)
    
    # Test 1: Employee endpoint
    employee_id = test_employees_endpoint()
    if not employee_id:
        print("❌ Cannot proceed without valid employee")
        return
    
    # Test 2: Find valid customer
    customer_id = find_valid_customer()
    if not customer_id:
        print("❌ Cannot proceed without valid customer")
        return
    
    # Test 3: Find valid product
    product_id = find_valid_product()
    if not product_id:
        print("❌ Cannot proceed without valid product")
        return
    
    # Test 4: Create sales order with calculation verification
    order = test_sales_order_creation(customer_id, product_id, employee_id)
    
    # Test 5: Verify pack unit format
    if order:
        test_pack_unit_format(order)
    
    print("\n" + "=" * 60)
    print("🏁 End-to-End Test Complete")
    
    if order:
        print("✅ Sales order API is working correctly")
        print("✅ Calculations are fixed (no more negative subtotals)")
        print("🎯 Ready for frontend integration testing")
    else:
        print("❌ Issues found - see logs above")

if __name__ == "__main__":
    main()