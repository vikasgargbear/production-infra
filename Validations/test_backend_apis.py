#!/usr/bin/env python3
"""
Test Backend APIs to find working endpoints
"""

import requests
import json

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

def test_endpoints():
    """Test various endpoints to see what works"""
    
    print("🔍 TESTING BACKEND ENDPOINTS")
    print("=" * 60)
    
    endpoints = [
        ("GET", "/products", "Products List"),
        ("GET", "/inventory/products", "Inventory Products"),
        ("GET", "/inventory/batches", "Inventory Batches"),
        ("GET", "/inventory/current-stock", "Current Stock"),
        ("GET", "/customers", "Customers List"),
        ("GET", "/invoices", "Invoices List"),
    ]
    
    for method, endpoint, name in endpoints:
        print(f"\n📍 Testing: {name}")
        print(f"   Endpoint: {method} {API_BASE}{endpoint}")
        
        try:
            if method == "GET":
                response = requests.get(
                    f"{API_BASE}{endpoint}",
                    headers={"X-Org-Id": ORG_ID},
                    params={"limit": 2},
                    timeout=5
                )
            
            print(f"   Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                print(f"   ✅ Success!")
                
                # Show sample data
                if isinstance(data, dict):
                    for key in list(data.keys())[:3]:
                        if isinstance(data[key], list):
                            print(f"   - {key}: {len(data[key])} items")
                        else:
                            print(f"   - {key}: {data[key]}")
                elif isinstance(data, list):
                    print(f"   - Got {len(data)} items")
                    if data and len(data) > 0:
                        item = data[0]
                        for key in list(item.keys())[:5]:
                            print(f"     • {key}: {item[key]}")
            else:
                print(f"   ❌ Failed")
                
        except Exception as e:
            print(f"   ❌ Error: {str(e)[:50]}")

def create_basim_customer():
    """Create Basim customer using API"""
    
    print("\n" + "=" * 60)
    print("CREATING BASIM CUSTOMER")
    print("=" * 60)
    
    customer_data = {
        "customer_name": "Basim",
        "customer_code": "BASIM001",
        "customer_type": "retail",
        "primary_phone": "7738228969",
        "primary_email": "basim@example.com",
        "state": "Maharashtra",
        "state_code": "27",
        "city": "Mumbai",
        "address_line1": "123 Main Street",
        "pincode": "400001",
        "is_active": True
    }
    
    # Try with trailing slash
    response = requests.post(
        f"{API_BASE}/customers/",
        json=customer_data,
        headers={
            "X-Org-Id": ORG_ID,
            "Content-Type": "application/json"
        },
        allow_redirects=False
    )
    
    print(f"Response: {response.status_code}")
    
    if response.status_code in [200, 201]:
        result = response.json()
        print("✅ Customer created successfully!")
        print(f"Response: {json.dumps(result, indent=2)[:500]}")
        return result
    else:
        print(f"❌ Failed: {response.text[:200]}")
        return None

def get_stock_with_prices():
    """Get current stock which might have prices"""
    
    print("\n" + "=" * 60)
    print("GETTING CURRENT STOCK WITH PRICES")
    print("=" * 60)
    
    response = requests.get(
        f"{API_BASE}/inventory/current-stock",
        headers={"X-Org-Id": ORG_ID},
        params={"search": "Atlas", "limit": 5}
    )
    
    if response.status_code == 200:
        data = response.json()
        
        if 'stock_items' in data:
            items = data['stock_items']
        elif isinstance(data, list):
            items = data
        else:
            items = []
        
        print(f"Found {len(items)} stock items")
        
        for item in items[:3]:
            if 'atlas' in item.get('product_name', '').lower():
                print(f"\n✅ Found Atlas in stock:")
                for key, value in item.items():
                    if any(x in key.lower() for x in ['price', 'gst', 'product', 'batch', 'quantity']):
                        print(f"   {key}: {value}")
                return item
    
    return None

def main():
    # Test endpoints
    test_endpoints()
    
    # Create customer
    create_basim_customer()
    
    # Get stock/prices
    atlas_stock = get_stock_with_prices()
    
    if atlas_stock:
        print("\n" + "=" * 60)
        print("ATLAS PRODUCT DETAILS FROM BACKEND:")
        print("=" * 60)
        print(json.dumps(atlas_stock, indent=2))

if __name__ == "__main__":
    main()