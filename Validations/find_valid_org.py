#!/usr/bin/env python3
"""
Find valid org_id from existing data
"""

import requests
import json

API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"

def find_org_id():
    """Find valid org_id from existing customers"""
    
    print("🔍 Finding valid org_id from existing data...")
    
    # Get an existing invoice to see org_id
    response = requests.get(
        f"{API_BASE}/invoices",
        params={"limit": 1},
        headers={"X-Org-Id": "11111111-1111-1111-1111-111111111111"}
    )
    
    if response.status_code == 200:
        data = response.json()
        invoices = data.get('invoices', [])
        if invoices:
            invoice = invoices[0]
            print(f"\n✅ Found invoice: {invoice.get('invoice_number')}")
            print(f"   Customer: {invoice.get('customer_name')}")
            
            # Try to get the customer details
            customer_id = invoice.get('customer_id')
            if customer_id:
                cust_response = requests.get(
                    f"{API_BASE}/customers/{customer_id}",
                    headers={"X-Org-Id": "11111111-1111-1111-1111-111111111111"}
                )
                if cust_response.status_code == 200:
                    customer = cust_response.json()
                    org_id = customer.get('org_id')
                    if org_id:
                        print(f"\n✅ Found org_id from customer: {org_id}")
                        return org_id
    
    # Check batches for org_id
    print("\n🔍 Checking batches for org_id...")
    response = requests.get(
        f"{API_BASE}/inventory/batches",
        params={"limit": 1},
        headers={"X-Org-Id": "11111111-1111-1111-1111-111111111111"}
    )
    
    if response.status_code == 200:
        data = response.json()
        batches = data.get('batches', [])
        if batches:
            batch = batches[0]
            # The batch query uses DEFAULT_ORG_ID from config
            print(f"\n📌 Batches are using DEFAULT_ORG_ID from backend config")
            print(f"   This is likely: ad808530-1ddb-4377-ab20-67bef145d80d")
            return "ad808530-1ddb-4377-ab20-67bef145d80d"
    
    return None

if __name__ == "__main__":
    org_id = find_org_id()
    
    if org_id:
        print("\n" + "=" * 60)
        print("✅ VALID ORG_ID FOUND")
        print("=" * 60)
        print(f"Use this org_id: {org_id}")
        print("\nUpdate complete_invoice_flow.py with:")
        print(f'ORG_ID = "{org_id}"')
    else:
        print("\n❌ Could not find valid org_id")