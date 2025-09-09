#!/usr/bin/env python3
"""
Setup Authentication System
Creates admin user and configures authentication
"""
import os
import sys
import json
import subprocess
from passlib.context import CryptContext
import psycopg2
from psycopg2.extras import RealDictCursor

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_db_connection():
    """Get database connection from Railway"""
    try:
        # Get DATABASE_URL from Railway
        result = subprocess.run(
            ["railway", "variables", "--json"],
            capture_output=True,
            text=True,
            check=True
        )
        vars = json.loads(result.stdout)
        db_url = vars.get("DATABASE_URL")
        
        if not db_url:
            print("❌ DATABASE_URL not found in Railway variables")
            sys.exit(1)
            
        return psycopg2.connect(db_url, cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"❌ Failed to connect to database: {e}")
        sys.exit(1)

def setup_password_column():
    """Add password_hash column to org_users if it doesn't exist"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Check if password_hash column exists
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'master' 
            AND table_name = 'org_users' 
            AND column_name = 'password_hash'
        """)
        
        if not cur.fetchone():
            print("📦 Adding password_hash column to master.org_users...")
            cur.execute("""
                ALTER TABLE master.org_users 
                ADD COLUMN IF NOT EXISTS password_hash TEXT
            """)
            conn.commit()
            print("✅ Password column added")
        else:
            print("✅ Password column already exists")
            
    except Exception as e:
        print(f"❌ Error setting up password column: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

def create_admin_user(email, password, full_name="Admin User"):
    """Create or update admin user with password"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Hash the password
        password_hash = pwd_context.hash(password)
        
        # Get organization
        cur.execute("SELECT org_id, org_name FROM master.organizations LIMIT 1")
        org = cur.fetchone()
        
        if not org:
            print("❌ No organization found. Please create an organization first.")
            sys.exit(1)
        
        print(f"🏢 Using organization: {org['org_name']}")
        
        # Check if user exists
        cur.execute("""
            SELECT user_id, email FROM master.org_users 
            WHERE email = %s AND org_id = %s
        """, (email, org['org_id']))
        
        existing_user = cur.fetchone()
        
        if existing_user:
            # Update existing user
            print(f"📝 Updating existing user: {email}")
            cur.execute("""
                UPDATE master.org_users 
                SET password_hash = %s,
                    role_id = 1,
                    is_admin = true,
                    is_active = true,
                    permissions = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE email = %s AND org_id = %s
                RETURNING user_id
            """, (
                password_hash,
                json.dumps({"master": ["view", "create", "update", "delete"]}),
                email,
                org['org_id']
            ))
        else:
            # Create new user
            print(f"👤 Creating new admin user: {email}")
            
            # Parse full name
            name_parts = full_name.split(' ', 1)
            first_name = name_parts[0]
            last_name = name_parts[1] if len(name_parts) > 1 else ''
            
            cur.execute("""
                INSERT INTO master.org_users (
                    org_id, email, username, first_name, last_name,
                    password_hash, role_id, is_admin, is_active,
                    permissions, mobile_number, created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, 1, true, true,
                    %s, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING user_id
            """, (
                org['org_id'],
                email,
                email.split('@')[0],  # Use email prefix as username
                first_name,
                last_name,
                password_hash,
                json.dumps({"master": ["view", "create", "update", "delete"]})
            ))
        
        user_id = cur.fetchone()['user_id']
        conn.commit()
        
        print(f"✅ Admin user ready: {email} (ID: {user_id})")
        print(f"🔑 Password: {password}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error creating admin user: {e}")
        conn.rollback()
        return False
    finally:
        cur.close()
        conn.close()

def test_login(email, password):
    """Test login with the created user"""
    print("\n🧪 Testing login...")
    
    import requests
    
    # Get API URL from environment or use default
    api_url = "https://pharma-backend-production-0c09.up.railway.app/api"
    
    # Try OAuth2 password flow (form-encoded)
    response = requests.post(
        f"{api_url}/auth/token",
        data={
            "username": email,  # OAuth2 spec uses 'username' field for email
            "password": password,
            "grant_type": "password"
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    
    if response.status_code == 200:
        print("✅ Login successful via /auth/token!")
        data = response.json()
        print(f"🎫 Token type: {data.get('token_type')}")
        print(f"🎫 Access token: {data.get('access_token')[:20]}...")
        return True
    else:
        print(f"❌ Login via /auth/token failed: {response.status_code}")
        
        # Try JSON login endpoint
        response = requests.post(
            f"{api_url}/auth/login",
            json={"email": email, "password": password}
        )
        
        if response.status_code == 200:
            print("✅ Login successful via /auth/login!")
            data = response.json()
            print(f"🎫 Access token: {data.get('access_token')[:20]}...")
            return True
        else:
            print(f"❌ Login via /auth/login failed: {response.status_code}")
            print(f"Response: {response.text}")
            return False

def main():
    print("🚀 Setting up Authentication System")
    print("=" * 50)
    
    # Setup database
    setup_password_column()
    
    # Create admin user
    print("\n👤 Admin User Setup")
    print("-" * 30)
    
    email = input("Enter admin email [admin@pharma.com]: ").strip()
    if not email:
        email = "admin@pharma.com"
    
    password = input("Enter admin password [admin123]: ").strip()
    if not password:
        password = "admin123"
    
    full_name = input("Enter full name [Admin User]: ").strip()
    if not full_name:
        full_name = "Admin User"
    
    # Create the admin user
    if create_admin_user(email, password, full_name):
        # Test login
        test_login(email, password)
        
        print("\n✅ Authentication setup complete!")
        print("\n📝 Next steps:")
        print("1. Login at: https://your-frontend-url/login")
        print(f"2. Email: {email}")
        print(f"3. Password: {password}")
        print("\n⚠️  Remember to change the password after first login!")
    else:
        print("\n❌ Setup failed. Please check the errors above.")

if __name__ == "__main__":
    main()