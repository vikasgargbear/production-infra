#!/usr/bin/env python3
"""Check if there are any users in master.org_users"""
import requests
import json

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

print("Checking for USERS (not customers)...")
print("=" * 60)

# Check users endpoint
response = requests.get(f"{BASE_URL}/users?limit=10")
if response.status_code == 200:
    users = response.json()
    if isinstance(users, list) and len(users) > 0:
        print(f"Found {len(users)} users:")
        for user in users[:3]:
            print(f"  - ID: {user.get('user_id')}, Username: {user.get('username')}")
    else:
        print("❌ No users found in master.org_users table!")
else:
    print(f"Error checking users: {response.status_code}")
    print(response.text[:200])

print("\n" + "=" * 60)
print("\nThe issue:")
print("- created_by needs a user_id from master.org_users")
print("- NOT a customer_id from parties.customers")
print("- These are different tables!")