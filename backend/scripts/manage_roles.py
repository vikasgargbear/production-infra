#!/usr/bin/env python3
"""
Role Management CLI Script
Use this script to manage roles and permissions
"""
import sys
import os
import argparse
import json
from datetime import datetime
from tabulate import tabulate
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.core.role_management import RoleManager

# Get database URL from environment or config
DATABASE_URL = os.getenv('DATABASE_URL')
if not DATABASE_URL:
    from app.core.config import settings
    DATABASE_URL = settings.DATABASE_URL

if not DATABASE_URL:
    print("❌ DATABASE_URL not found in environment or config")
    sys.exit(1)

# Create database connection
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def setup_default_roles(org_id=None):
    """Setup default roles for organizations"""
    db = SessionLocal()
    try:
        role_manager = RoleManager(db)
        
        if org_id:
            # Setup for specific organization
            print(f"\n🔧 Setting up roles for organization: {org_id}")
            results = role_manager.setup_default_roles(org_id)
            print_results(results)
        else:
            # Setup for all organizations
            result = db.execute(text("SELECT org_id, org_name FROM master.organizations WHERE is_active = true"))
            organizations = result.fetchall()
            
            if not organizations:
                print("❌ No active organizations found")
                return
            
            for org in organizations:
                print(f"\n🔧 Setting up roles for: {org.org_name} ({org.org_id})")
                results = role_manager.setup_default_roles(org.org_id)
                print_results(results)
        
        print("\n✅ Role setup completed successfully!")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        db.rollback()
    finally:
        db.close()

def list_roles(org_id):
    """List all roles for an organization"""
    db = SessionLocal()
    try:
        role_manager = RoleManager(db)
        roles = role_manager.get_role_hierarchy(org_id)
        
        if not roles:
            print("No roles found")
            return
        
        # Prepare table data
        table_data = []
        for role in roles:
            modules = ', '.join(role.get('allowed_modules', []))[:30] + '...' if len(', '.join(role.get('allowed_modules', []))) > 30 else ', '.join(role.get('allowed_modules', []))
            table_data.append([
                role['role_code'],
                role['role_name'],
                role['role_level'],
                role['data_access_level'],
                modules
            ])
        
        print("\n📋 Roles Hierarchy:")
        print(tabulate(table_data, headers=['Code', 'Name', 'Level', 'Access', 'Modules'], tablefmt='grid'))
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
    finally:
        db.close()

def assign_role(user_id, role_code, org_id):
    """Assign a role to a user"""
    db = SessionLocal()
    try:
        # Get role_id from role_code
        result = db.execute(
            text("SELECT role_id FROM master.roles WHERE org_id = :org_id AND role_code = :role_code"),
            {"org_id": org_id, "role_code": role_code}
        )
        role = result.first()
        
        if not role:
            print(f"❌ Role '{role_code}' not found")
            return
        
        role_manager = RoleManager(db)
        success = role_manager.assign_role_to_user(user_id, role.role_id)
        
        if success:
            print(f"✅ Role '{role_code}' assigned to user {user_id}")
        else:
            print(f"❌ Failed to assign role")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        db.rollback()
    finally:
        db.close()

def show_user_permissions(user_id):
    """Show effective permissions for a user"""
    db = SessionLocal()
    try:
        role_manager = RoleManager(db)
        permissions = role_manager.get_user_effective_permissions(user_id)
        
        if not permissions:
            print("No permissions found for user")
            return
        
        print(f"\n🔐 User Permissions (ID: {user_id}):")
        print(f"Data Access Level: {permissions.get('data_access_level', 'own')}")
        print(f"Allowed Modules: {', '.join(permissions.get('modules', []))}")
        
        if permissions.get('permissions', {}).get('all'):
            print("✅ Has ALL permissions (Admin)")
        else:
            print("\nModule Permissions:")
            for module, perms in permissions.get('permissions', {}).items():
                if module != 'all':
                    perm_list = [k for k, v in perms.items() if v]
                    print(f"  {module}: {', '.join(perm_list)}")
        
        if permissions.get('restricted_features'):
            print(f"\n⚠️ Restricted Features: {', '.join(permissions['restricted_features'])}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
    finally:
        db.close()

def create_custom_role(org_id, role_code, role_name, permissions_file=None):
    """Create a custom role"""
    db = SessionLocal()
    try:
        role_manager = RoleManager(db)
        
        # Default permissions
        permissions = {
            "sales": {"view": True, "create": False, "edit": False, "delete": False},
            "inventory": {"view": True, "create": False, "edit": False, "delete": False}
        }
        
        # Load permissions from file if provided
        if permissions_file and os.path.exists(permissions_file):
            with open(permissions_file, 'r') as f:
                permissions = json.load(f)
        
        role_data = {
            "role_code": role_code,
            "role_name": role_name,
            "role_description": f"Custom role: {role_name}",
            "role_level": 3,
            "permissions": permissions,
            "allowed_modules": list(permissions.keys()),
            "data_access_level": "own"
        }
        
        role_id = role_manager.create_custom_role(org_id, role_data)
        print(f"✅ Custom role created with ID: {role_id}")
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        db.rollback()
    finally:
        db.close()

def print_results(results):
    """Print setup results"""
    if results['created']:
        print(f"  ✅ Created: {', '.join(results['created'])}")
    if results['updated']:
        print(f"  🔄 Updated: {', '.join(results['updated'])}")
    if results['errors']:
        print(f"  ❌ Errors: {', '.join(results['errors'])}")

def get_organizations():
    """Get list of organizations"""
    db = SessionLocal()
    try:
        result = db.execute(text("SELECT org_id, org_name FROM master.organizations WHERE is_active = true"))
        orgs = result.fetchall()
        
        print("\n📋 Active Organizations:")
        for org in orgs:
            print(f"  • {org.org_name} (ID: {org.org_id})")
        
        return orgs
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return []
    finally:
        db.close()

def main():
    parser = argparse.ArgumentParser(description='Role Management CLI')
    
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Setup command
    setup_parser = subparsers.add_parser('setup', help='Setup default roles')
    setup_parser.add_argument('--org-id', help='Organization ID (optional, applies to all if not specified)')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List roles')
    list_parser.add_argument('--org-id', required=True, help='Organization ID')
    
    # Assign command
    assign_parser = subparsers.add_parser('assign', help='Assign role to user')
    assign_parser.add_argument('--user-id', type=int, required=True, help='User ID')
    assign_parser.add_argument('--role', required=True, help='Role code (e.g., admin, manager)')
    assign_parser.add_argument('--org-id', required=True, help='Organization ID')
    
    # Permissions command
    perms_parser = subparsers.add_parser('permissions', help='Show user permissions')
    perms_parser.add_argument('--user-id', type=int, required=True, help='User ID')
    
    # Create command
    create_parser = subparsers.add_parser('create', help='Create custom role')
    create_parser.add_argument('--org-id', required=True, help='Organization ID')
    create_parser.add_argument('--code', required=True, help='Role code')
    create_parser.add_argument('--name', required=True, help='Role name')
    create_parser.add_argument('--permissions-file', help='JSON file with permissions')
    
    # Organizations command
    orgs_parser = subparsers.add_parser('orgs', help='List organizations')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    print("🚀 Role Management System")
    print("=" * 40)
    
    if args.command == 'setup':
        setup_default_roles(args.org_id)
    elif args.command == 'list':
        list_roles(args.org_id)
    elif args.command == 'assign':
        assign_role(args.user_id, args.role, args.org_id)
    elif args.command == 'permissions':
        show_user_permissions(args.user_id)
    elif args.command == 'create':
        create_custom_role(args.org_id, args.code, args.name, args.permissions_file)
    elif args.command == 'orgs':
        get_organizations()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()