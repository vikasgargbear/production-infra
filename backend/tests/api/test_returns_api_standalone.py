#!/usr/bin/env python3
"""
Sales Returns API Test - Tests return creation with full frontend payload
Run: API_BASE_URL="http://localhost:8000" python backend/tests/api/test_returns_api_standalone.py

NOTE: Backend must have TEST_MODE=true env var set to bypass auth.
      No auth token needed when TEST_MODE is enabled.

Tests:
1. Generate return number
2. Create sales return with full frontend payload
3. Verify response structure
4. Provide SQL for database verification
"""
import os
import sys
import json
import requests
from datetime import date, timedelta

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")

def generate_return_number():
    """Get a new return number from the API"""
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/returns/sales/generate-number",
            timeout=10
        )
        if response.status_code == 200:
            return response.json().get("return_number")
    except Exception as e:
        print(f"Warning: Could not generate return number: {e}")
    return f"SR-TEST-{date.today().strftime('%Y%m%d')}"


def create_test_return_payload(customer_id: int = 108, invoice_id: int = None):
    """
    Create a test return payload matching exact frontend structure.
    Based on SalesReturnFlow.tsx ReturnFormData and ReturnFormItem types.
    """
    
    return_no = generate_return_number()
    
    # Full item structure matching ReturnFormItem from frontend
    item = {
        # Core identifiers
        "id": "test-item-1",
        "product_id": 122,  # Use existing product
        "product_name": "Test Product for Return",
        "batch_id": 119,  # Use existing batch
        "batch_number": "BATCH-TEST-001",
        "invoice_item_id": None,  # None for manual entry
        
        # Quantity fields (critical for credit calculation)
        "quantity": 10,  # Original invoice quantity
        "paid_quantity": 8,  # Paid items (credited)
        "free_quantity": 2,  # Free items (not credited)
        "return_quantity": 5,  # User wants to return 5
        "max_returnable_qty": 10,  # Max they could return
        
        # Pricing
        "unit_price": 100.00,
        "discount_percent": 5.0,
        "tax_percent": 12.0,
        
        # Pharma compliance fields
        "hsn_code": "30049099",
        "unit": "Box",
        "uom": "Box",
        "manufacturer": "Test Pharma Ltd",
        "manufacturing_date": str(date.today() - timedelta(days=90)),
        "expiry_date": str(date.today() + timedelta(days=365)),
        
        # Return specific
        "return_reason": "DAMAGED",
        "disposition": "QUARANTINE",
        "selected": True,
        "is_manual": True,  # Manual entry (no invoice)
        
        # Status fields
        "requires_approval": False,
        "verification_status": "PENDING",
        "available_stock": 100
    }
    
    # Full payload matching ReturnFormData from frontend
    payload = {
        # Header fields
        "return_no": return_no,
        "return_date": str(date.today()),
        "customer_id": customer_id,
        
        # Invoice reference (None for manual entry)
        "invoice_id": invoice_id,
        "invoice_number": "",
        "invoice_date": "",
        
        # Items
        "items": [item],
        
        # Return details
        "return_reason": "DAMAGED",
        "return_reason_notes": "Product received damaged in transit - packaging compromised",
        "return_method": "credit_note",  # credit_note | replacement | refund
        
        # Calculated amounts (frontend calculates these)
        "subtotal_amount": 475.00,  # (5 qty * 100 price) - 5% discount = 475
        "tax_amount": 57.00,  # 475 * 12% = 57
        "total_amount": 532.00,  # 475 + 57 = 532
        
        # GST handling
        "include_gst": True,  # Whether to include GST in credit
        "credit_adjustment_type": "future",  # future | existing_dues
        
        # Status
        "status": "PENDING",
        "credit_note_no": ""  # Backend generates this
    }
    
    return payload


def test_generate_return_number():
    """Test 1: Generate return number"""
    print("\n--- TEST 1: Generate Return Number ---")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/returns/sales/generate-number",
            timeout=10
        )
        
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Return number: {data.get('return_number')}")
            return True
        else:
            print(f"❌ Error: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False


def test_create_sales_return():
    """Test 2: Create sales return with full frontend payload"""
    print("\n--- TEST 2: Create Sales Return ---")
    
    payload = create_test_return_payload()
    
    print(f"Return Number: {payload['return_no']}")
    print(f"Customer ID: {payload['customer_id']}")
    print(f"Items: {len(payload['items'])}")
    print(f"Return Quantity: {payload['items'][0]['return_quantity']}")
    print(f"Include GST: {payload['include_gst']}")
    print(f"Credit Adjustment: {payload['credit_adjustment_type']}")
    
    headers = {"Content-Type": "application/json"}
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/api/returns/sales/",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        print(f"\nResponse Status: {response.status_code}")
        
        if response.status_code in [200, 201]:
            result = response.json()
            print(f"✅ Return created successfully!")
            print(f"   Return ID: {result.get('return_id', 'N/A')}")
            print(f"   Return Number: {result.get('return_number', 'N/A')}")
            print(f"   Credit Note: {result.get('credit_note_no', 'N/A')}")
            print(f"   Has GST: {result.get('has_gst', 'N/A')}")
            return result
        else:
            print(f"❌ Error: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return None


def test_get_sales_return(return_id: int):
    """Test 3: Verify return by fetching it"""
    print(f"\n--- TEST 3: Verify Return {return_id} ---")
    
    try:
        response = requests.get(
            f"{API_BASE_URL}/api/returns/sales/{return_id}",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Return fetched successfully")
            print(f"   Status: {data.get('status')}")
            print(f"   Total Amount: {data.get('total_amount')}")
            print(f"   Items: {len(data.get('items', []))}")
            return True
        else:
            print(f"⚠️ Could not fetch return: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Request failed: {e}")
        return False


def print_verification_sql(return_id: int = None):
    """Print SQL queries for database verification"""
    print("\n--- DATABASE VERIFICATION SQL ---")
    
    where_clause = f"WHERE sr.return_id = {return_id}" if return_id else "ORDER BY sr.created_at DESC LIMIT 1"
    
    print(f"""
-- Verify sales return header
SELECT 
    sr.return_id, sr.return_number, sr.return_date,
    sr.customer_id, c.customer_name,
    sr.return_reason, sr.return_method,
    sr.include_gst, sr.credit_adjustment_type,
    sr.subtotal_amount, sr.tax_amount, sr.total_amount,
    sr.credit_note_no, sr.status
FROM sales.sales_returns sr
LEFT JOIN master.customers c ON c.customer_id = sr.customer_id
{where_clause};

-- Verify return items
SELECT 
    sri.item_id, sri.product_id, p.product_name,
    sri.batch_id, b.batch_number,
    sri.return_quantity, sri.unit_price, sri.tax_percent,
    sri.disposition, sri.is_manual, sri.return_reason
FROM sales.sales_return_items sri
LEFT JOIN master.products p ON p.product_id = sri.product_id
LEFT JOIN inventory.product_batches b ON b.batch_id = sri.batch_id
WHERE sri.return_id = {return_id or '(SELECT MAX(return_id) FROM sales.sales_returns)'};

-- Check inventory movement (if applicable)
SELECT 
    im.movement_id, im.movement_type, im.reference_id,
    im.product_id, im.batch_id, im.quantity,
    im.created_at
FROM inventory.inventory_movements im
WHERE im.reference_type = 'SALES_RETURN'
  AND im.reference_id = {return_id or '(SELECT MAX(return_id) FROM sales.sales_returns)'}
ORDER BY im.created_at DESC;
""")


def main():
    print("=" * 70)
    print("SALES RETURNS API TEST (Full Frontend Payload)")
    print("=" * 70)
    print(f"\nAPI URL: {API_BASE_URL}")
    print("Auth: TEST_MODE bypass (no token needed)")
    
    # Run tests
    test_generate_return_number()
    
    result = test_create_sales_return()
    
    return_id = None
    if result:
        return_id = result.get('return_id')
        if return_id:
            test_get_sales_return(return_id)
    
    print_verification_sql(return_id)
    
    print("\n" + "=" * 70)
    if result:
        print("✅ TEST PASSED - Sales return created")
    else:
        print("⚠️ TEST INCOMPLETE - Check errors above")
    print("=" * 70)
    
    return result is not None


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
