#!/usr/bin/env python3
"""
Create a test user in the database for development
"""

import psycopg2
import os
import sys
from datetime import datetime
import bcrypt
import uuid

# Get DATABASE_URL from environment or Railway
DATABASE_URL = os.getenv('DATABASE_URL')

if not DATABASE_URL:
    # Try to get from Railway
    import subprocess
    import json
    try:
        result = subprocess.run(['railway', 'variables', '--json'], capture_output=True, text=True)
        if result.returncode == 0:
            vars = json.loads(result.stdout)
            DATABASE_URL = vars.get('DATABASE_URL')
    except:
        pass

if not DATABASE_URL:
    print("Error: DATABASE_URL not found")
    sys.exit(1)

def hash_password(password):
    """Hash a password using bcrypt"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

try:
    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Create organization if not exists
    org_id = str(uuid.uuid4())
    org_code = 'TEST001'
    cur.execute("""
        INSERT INTO master.organizations (
            org_id, org_code, org_name, legal_name, 
            registered_address, is_active, created_at
        )
        VALUES (%s, %s, %s, %s, %s, true, %s)
        ON CONFLICT (org_id) DO UPDATE SET is_active = true
        RETURNING org_id
    """, (
        org_id, org_code, 'Test Pharma Company', 'Test Pharma Company Pvt Ltd',
        '{"address_line1": "123 Test Street", "city": "Mumbai", "state": "Maharashtra", "postal_code": "400001", "country": "India"}',
        datetime.now()
    ))
    
    result_org_id = cur.fetchone()[0]
    print(f"Organization created/updated: {org_id}")
    
    # Create branch
    cur.execute("""
        INSERT INTO master.org_branches (
            org_id, branch_code, branch_name, branch_type,
            address, is_default_location, is_active
        )
        VALUES (%s, %s, %s, %s, %s, true, true)
        ON CONFLICT (branch_code, org_id) DO UPDATE SET is_active = true
        RETURNING branch_id
    """, (
        org_id, 'MAIN', 'Main Branch', 'warehouse',
        '{"address_line1": "123 Test Street", "city": "Mumbai", "state": "Maharashtra", "postal_code": "400001", "country": "India"}'
    ))
    
    branch_id = cur.fetchone()[0]
    print(f"Branch created/updated: {branch_id}")
    
    # Create user - check if exists first
    test_email = "test@pharma.com"
    test_username = "testuser"
    test_password = "test123"
    password_hash = hash_password(test_password)
    
    # Check if user already exists
    cur.execute("SELECT user_id FROM master.org_users WHERE email = %s", (test_email,))
    existing_user = cur.fetchone()
    
    if existing_user:
        # Update existing user
        cur.execute("""
            UPDATE master.org_users 
            SET password_hash = %s, is_active = true, org_id = %s
            WHERE email = %s
            RETURNING user_id
        """, (password_hash, org_id, test_email))
        user_id = cur.fetchone()[0]
        print(f"User updated: {test_email}")
    else:
        # Insert new user
        cur.execute("""
            INSERT INTO master.org_users (
                org_id, username, email, mobile_number, 
                first_name, password_hash, is_admin, is_active
            )
            VALUES (%s, %s, %s, %s, %s, %s, true, true)
            RETURNING user_id
        """, (
            org_id, test_username, test_email, '9999999999',
            'Test User', password_hash
        ))
        user_id = cur.fetchone()[0]
        print(f"User created: {test_email}")
    
    conn.commit()
    
    print("\n" + "="*50)
    print("Test user created successfully!")
    print("="*50)
    print(f"Email: {test_email}")
    print(f"Password: {test_password}")
    print(f"Org ID: {org_id}")
    print(f"Branch ID: {branch_id}")
    print("\nYou can now login with these credentials")
    
except Exception as e:
    print(f"Error: {e}")
    if conn:
        conn.rollback()
finally:
    if cur:
        cur.close()
    if conn:
        conn.close()