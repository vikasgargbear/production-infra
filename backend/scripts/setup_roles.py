"""
Script to setup initial roles in the database
"""
import psycopg2
import json
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection
DATABASE_URL = os.getenv('DATABASE_URL')

def setup_default_roles():
    """Create default roles for organizations"""
    
    # Define default roles with their permissions
    default_roles = [
        {
            "role_code": "admin",
            "role_name": "Admin",
            "role_description": "Full system access with all permissions",
            "role_level": 1,
            "permissions": {
                "all": True  # Admin has all permissions
            },
            "allowed_modules": ["sales", "purchase", "inventory", "payment", "reports", "master", "gst", "returns", "ledger", "notes"],
            "data_access_level": "organization",
            "is_system_role": True
        },
        {
            "role_code": "manager", 
            "role_name": "Manager",
            "role_description": "Department manager with broad access",
            "role_level": 2,
            "permissions": {
                "sales": {"view": True, "create": True, "edit": True, "delete": True},
                "purchase": {"view": True, "create": True, "edit": True, "delete": True},
                "inventory": {"view": True, "create": True, "edit": True, "delete": False},
                "payment": {"view": True, "create": True, "edit": True, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False},
                "master": {"view": True, "create": True, "edit": True, "delete": False},
                "gst": {"view": True, "create": True, "edit": True, "delete": False},
                "returns": {"view": True, "create": True, "edit": True, "delete": False},
                "ledger": {"view": True, "create": True, "edit": True, "delete": False},
                "notes": {"view": True, "create": True, "edit": True, "delete": False}
            },
            "allowed_modules": ["sales", "purchase", "inventory", "payment", "reports", "master", "gst", "returns", "ledger", "notes"],
            "data_access_level": "branch",
            "is_system_role": True
        },
        {
            "role_code": "billing",
            "role_name": "Billing Staff",
            "role_description": "Sales and billing operations",
            "role_level": 3,
            "permissions": {
                "sales": {"view": True, "create": True, "edit": True, "delete": False},
                "payment": {"view": True, "create": True, "edit": False, "delete": False},
                "inventory": {"view": True, "create": False, "edit": False, "delete": False},
                "returns": {"view": True, "create": True, "edit": False, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False}
            },
            "allowed_modules": ["sales", "payment", "inventory", "returns", "reports"],
            "data_access_level": "own",
            "is_system_role": True
        },
        {
            "role_code": "store",
            "role_name": "Store Keeper",
            "role_description": "Inventory and stock management",
            "role_level": 3,
            "permissions": {
                "inventory": {"view": True, "create": True, "edit": True, "delete": False},
                "purchase": {"view": True, "create": True, "edit": False, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False}
            },
            "allowed_modules": ["inventory", "purchase", "reports"],
            "data_access_level": "branch",
            "is_system_role": True
        },
        {
            "role_code": "accountant",
            "role_name": "Accountant",
            "role_description": "Financial and accounting operations",
            "role_level": 3,
            "permissions": {
                "payment": {"view": True, "create": True, "edit": True, "delete": False},
                "ledger": {"view": True, "create": True, "edit": True, "delete": False},
                "gst": {"view": True, "create": True, "edit": True, "delete": False},
                "notes": {"view": True, "create": True, "edit": True, "delete": False},
                "reports": {"view": True, "create": True, "edit": False, "delete": False}
            },
            "allowed_modules": ["payment", "ledger", "gst", "notes", "reports"],
            "data_access_level": "organization",
            "is_system_role": True
        },
        {
            "role_code": "viewer",
            "role_name": "Viewer",
            "role_description": "Read-only access",
            "role_level": 4,
            "permissions": {
                "sales": {"view": True, "create": False, "edit": False, "delete": False},
                "purchase": {"view": True, "create": False, "edit": False, "delete": False},
                "inventory": {"view": True, "create": False, "edit": False, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False}
            },
            "allowed_modules": ["sales", "purchase", "inventory", "reports"],
            "data_access_level": "own",
            "is_system_role": True
        }
    ]
    
    try:
        # Connect to database
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Get all organizations
        cur.execute("SELECT org_id FROM master.organizations WHERE is_active = true")
        organizations = cur.fetchall()
        
        if not organizations:
            print("No organizations found. Creating default organization...")
            # Create a default organization if none exists
            cur.execute("""
                INSERT INTO master.organizations (
                    org_name, org_code, contact_email, 
                    subscription_plan, is_active
                ) VALUES (
                    'Default Organization', 'DEFAULT', 'admin@example.com',
                    'enterprise', true
                ) RETURNING org_id
            """)
            org_id = cur.fetchone()[0]
            organizations = [(org_id,)]
            conn.commit()
        
        # Insert roles for each organization
        for (org_id,) in organizations:
            print(f"Setting up roles for organization: {org_id}")
            
            for role in default_roles:
                # Check if role already exists
                cur.execute("""
                    SELECT role_id FROM master.roles 
                    WHERE org_id = %s AND role_code = %s
                """, (org_id, role['role_code']))
                
                existing = cur.fetchone()
                
                if existing:
                    print(f"  Role '{role['role_name']}' already exists, updating...")
                    cur.execute("""
                        UPDATE master.roles SET
                            role_name = %s,
                            role_description = %s,
                            permissions = %s,
                            allowed_modules = %s,
                            data_access_level = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE org_id = %s AND role_code = %s
                    """, (
                        role['role_name'],
                        role['role_description'],
                        json.dumps(role['permissions']),
                        role['allowed_modules'],
                        role['data_access_level'],
                        org_id,
                        role['role_code']
                    ))
                else:
                    print(f"  Creating role: {role['role_name']}")
                    cur.execute("""
                        INSERT INTO master.roles (
                            org_id, role_code, role_name, role_description,
                            role_level, permissions, allowed_modules,
                            data_access_level, is_system_role, is_active
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, true
                        )
                    """, (
                        org_id,
                        role['role_code'],
                        role['role_name'],
                        role['role_description'],
                        role['role_level'],
                        json.dumps(role['permissions']),
                        role['allowed_modules'],
                        role['data_access_level'],
                        role['is_system_role']
                    ))
        
        # Update existing users with appropriate roles
        print("\nUpdating existing users with roles...")
        for (org_id,) in organizations:
            # Get admin role_id
            cur.execute("""
                SELECT role_id FROM master.roles 
                WHERE org_id = %s AND role_code = 'admin'
            """, (org_id,))
            admin_role = cur.fetchone()
            
            # Get manager role_id  
            cur.execute("""
                SELECT role_id FROM master.roles 
                WHERE org_id = %s AND role_code = 'manager'
            """, (org_id,))
            manager_role = cur.fetchone()
            
            if admin_role:
                # Update admin users
                cur.execute("""
                    UPDATE master.org_users 
                    SET role_id = %s 
                    WHERE org_id = %s AND is_admin = true AND role_id IS NULL
                """, (admin_role[0], org_id))
                
            if manager_role:
                # Update non-admin users without roles
                cur.execute("""
                    UPDATE master.org_users 
                    SET role_id = %s 
                    WHERE org_id = %s AND is_admin = false AND role_id IS NULL
                """, (manager_role[0], org_id))
        
        conn.commit()
        print("\n✅ Roles setup completed successfully!")
        
        # Display summary
        cur.execute("""
            SELECT r.role_name, COUNT(u.user_id) as user_count
            FROM master.roles r
            LEFT JOIN master.org_users u ON r.role_id = u.role_id
            GROUP BY r.role_name
            ORDER BY r.role_level
        """)
        
        print("\n📊 Role Summary:")
        print("-" * 40)
        for role_name, user_count in cur.fetchall():
            print(f"{role_name}: {user_count} users")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error setting up roles: {str(e)}")
        if conn:
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    setup_default_roles()