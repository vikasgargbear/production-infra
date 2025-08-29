"""
Comprehensive Role Management System
Handles role creation, updates, and permission management
"""
import json
from typing import Dict, List, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class RoleManager:
    """
    Comprehensive role management system for enterprise RBAC
    """
    
    # Default system roles definition
    DEFAULT_ROLES = {
        "admin": {
            "role_name": "Administrator",
            "role_description": "Full system access with all permissions",
            "role_level": 1,
            "permissions": {"all": True},
            "allowed_modules": ["sales", "purchase", "inventory", "payment", "reports", 
                              "master", "gst", "returns", "ledger", "notes"],
            "restricted_features": [],
            "data_access_level": "organization",
            "is_system_role": True
        },
        "manager": {
            "role_name": "Manager",
            "role_description": "Department manager with broad access",
            "role_level": 2,
            "permissions": {
                "sales": {"view": True, "create": True, "edit": True, "delete": True, "approve": True},
                "purchase": {"view": True, "create": True, "edit": True, "delete": True, "approve": True},
                "inventory": {"view": True, "create": True, "edit": True, "delete": False},
                "payment": {"view": True, "create": True, "edit": True, "delete": False, "approve": True},
                "reports": {"view": True, "create": False, "edit": False, "delete": False, "export": True},
                "master": {"view": True, "create": True, "edit": True, "delete": False},
                "gst": {"view": True, "create": True, "edit": True, "delete": False},
                "returns": {"view": True, "create": True, "edit": True, "delete": False, "approve": True},
                "ledger": {"view": True, "create": True, "edit": True, "delete": False},
                "notes": {"view": True, "create": True, "edit": True, "delete": False}
            },
            "allowed_modules": ["sales", "purchase", "inventory", "payment", "reports", 
                              "master", "gst", "returns", "ledger", "notes"],
            "restricted_features": ["delete_permanent", "modify_closed_period"],
            "data_access_level": "branch",
            "is_system_role": True
        },
        "billing": {
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
            "restricted_features": ["modify_prices", "approve_discounts", "delete_invoices"],
            "data_access_level": "own",
            "is_system_role": True
        },
        "store": {
            "role_name": "Store Keeper",
            "role_description": "Inventory and stock management",
            "role_level": 3,
            "permissions": {
                "inventory": {"view": True, "create": True, "edit": True, "delete": False},
                "purchase": {"view": True, "create": True, "edit": False, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False, "export": True}
            },
            "allowed_modules": ["inventory", "purchase", "reports"],
            "restricted_features": ["modify_purchase_prices", "delete_stock_entries"],
            "data_access_level": "branch",
            "is_system_role": True
        },
        "accountant": {
            "role_name": "Accountant",
            "role_description": "Financial and accounting operations",
            "role_level": 3,
            "permissions": {
                "payment": {"view": True, "create": True, "edit": True, "delete": False, "approve": True},
                "ledger": {"view": True, "create": True, "edit": True, "delete": False},
                "gst": {"view": True, "create": True, "edit": True, "delete": False},
                "notes": {"view": True, "create": True, "edit": True, "delete": False},
                "reports": {"view": True, "create": True, "edit": False, "delete": False, "export": True}
            },
            "allowed_modules": ["payment", "ledger", "gst", "notes", "reports"],
            "restricted_features": ["modify_locked_entries", "delete_reconciled"],
            "data_access_level": "organization",
            "is_system_role": True
        },
        "sales_executive": {
            "role_name": "Sales Executive",
            "role_description": "Field sales and customer management",
            "role_level": 4,
            "permissions": {
                "sales": {"view": True, "create": True, "edit": False, "delete": False},
                "payment": {"view": True, "create": False, "edit": False, "delete": False},
                "inventory": {"view": True, "create": False, "edit": False, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False}
            },
            "allowed_modules": ["sales", "payment", "inventory", "reports"],
            "restricted_features": ["modify_prices", "approve_discounts", "view_cost"],
            "data_access_level": "own",
            "is_system_role": True
        },
        "viewer": {
            "role_name": "Viewer",
            "role_description": "Read-only access",
            "role_level": 5,
            "permissions": {
                "sales": {"view": True, "create": False, "edit": False, "delete": False},
                "purchase": {"view": True, "create": False, "edit": False, "delete": False},
                "inventory": {"view": True, "create": False, "edit": False, "delete": False},
                "reports": {"view": True, "create": False, "edit": False, "delete": False}
            },
            "allowed_modules": ["sales", "purchase", "inventory", "reports"],
            "restricted_features": ["export_data", "print_documents"],
            "data_access_level": "own",
            "is_system_role": True
        }
    }
    
    # Module definitions
    MODULES = {
        "sales": "Sales Management",
        "purchase": "Purchase Management",
        "inventory": "Inventory Management",
        "payment": "Payment Processing",
        "reports": "Reports & Analytics",
        "master": "Master Data",
        "gst": "GST & Tax",
        "returns": "Returns Management",
        "ledger": "Ledger & Accounting",
        "notes": "Credit/Debit Notes"
    }
    
    # Permission types
    PERMISSION_TYPES = ["view", "create", "edit", "delete", "approve", "export"]
    
    # Data access levels
    DATA_ACCESS_LEVELS = {
        "own": "Own data only",
        "branch": "Branch level data",
        "organization": "Organization wide data"
    }
    
    def __init__(self, db: Session):
        self.db = db
    
    def setup_default_roles(self, org_id: str) -> Dict[str, Any]:
        """
        Setup default roles for an organization
        """
        results = {
            "created": [],
            "updated": [],
            "errors": []
        }
        
        try:
            for role_code, role_data in self.DEFAULT_ROLES.items():
                try:
                    # Check if role exists
                    existing = self.db.execute(
                        text("""
                            SELECT role_id FROM master.roles 
                            WHERE org_id = :org_id AND role_code = :role_code
                        """),
                        {"org_id": org_id, "role_code": role_code}
                    ).first()
                    
                    if existing:
                        # Update existing role
                        self.db.execute(
                            text("""
                                UPDATE master.roles SET
                                    role_name = :role_name,
                                    role_description = :role_description,
                                    role_level = :role_level,
                                    permissions = :permissions,
                                    allowed_modules = :allowed_modules,
                                    restricted_features = :restricted_features,
                                    data_access_level = :data_access_level,
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE org_id = :org_id AND role_code = :role_code
                            """),
                            {
                                "org_id": org_id,
                                "role_code": role_code,
                                "role_name": role_data["role_name"],
                                "role_description": role_data["role_description"],
                                "role_level": role_data["role_level"],
                                "permissions": json.dumps(role_data["permissions"]),
                                "allowed_modules": role_data["allowed_modules"],
                                "restricted_features": role_data.get("restricted_features", []),
                                "data_access_level": role_data["data_access_level"]
                            }
                        )
                        results["updated"].append(role_code)
                    else:
                        # Create new role
                        self.db.execute(
                            text("""
                                INSERT INTO master.roles (
                                    org_id, role_code, role_name, role_description,
                                    role_level, permissions, allowed_modules,
                                    restricted_features, data_access_level, 
                                    is_system_role, is_active
                                ) VALUES (
                                    :org_id, :role_code, :role_name, :role_description,
                                    :role_level, :permissions, :allowed_modules,
                                    :restricted_features, :data_access_level,
                                    :is_system_role, true
                                )
                            """),
                            {
                                "org_id": org_id,
                                "role_code": role_code,
                                "role_name": role_data["role_name"],
                                "role_description": role_data["role_description"],
                                "role_level": role_data["role_level"],
                                "permissions": json.dumps(role_data["permissions"]),
                                "allowed_modules": role_data["allowed_modules"],
                                "restricted_features": role_data.get("restricted_features", []),
                                "data_access_level": role_data["data_access_level"],
                                "is_system_role": role_data["is_system_role"]
                            }
                        )
                        results["created"].append(role_code)
                    
                except Exception as e:
                    results["errors"].append(f"{role_code}: {str(e)}")
                    logger.error(f"Error setting up role {role_code}: {str(e)}")
            
            self.db.commit()
            
        except Exception as e:
            self.db.rollback()
            raise e
        
        return results
    
    def create_custom_role(self, org_id: str, role_data: Dict[str, Any]) -> int:
        """
        Create a custom role for an organization
        """
        try:
            result = self.db.execute(
                text("""
                    INSERT INTO master.roles (
                        org_id, role_code, role_name, role_description,
                        parent_role_id, role_level, permissions, 
                        allowed_modules, restricted_features,
                        data_access_level, is_system_role, is_active
                    ) VALUES (
                        :org_id, :role_code, :role_name, :role_description,
                        :parent_role_id, :role_level, :permissions,
                        :allowed_modules, :restricted_features,
                        :data_access_level, false, true
                    ) RETURNING role_id
                """),
                {
                    "org_id": org_id,
                    "role_code": role_data.get("role_code"),
                    "role_name": role_data.get("role_name"),
                    "role_description": role_data.get("role_description"),
                    "parent_role_id": role_data.get("parent_role_id"),
                    "role_level": role_data.get("role_level", 3),
                    "permissions": json.dumps(role_data.get("permissions", {})),
                    "allowed_modules": role_data.get("allowed_modules", []),
                    "restricted_features": role_data.get("restricted_features", []),
                    "data_access_level": role_data.get("data_access_level", "own")
                }
            )
            
            role_id = result.scalar()
            self.db.commit()
            return role_id
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error creating custom role: {str(e)}")
            raise
    
    def update_role_permissions(self, org_id: str, role_code: str, 
                               permissions: Dict[str, Any]) -> bool:
        """
        Update permissions for a specific role
        """
        try:
            result = self.db.execute(
                text("""
                    UPDATE master.roles 
                    SET permissions = :permissions,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE org_id = :org_id AND role_code = :role_code
                    RETURNING role_id
                """),
                {
                    "org_id": org_id,
                    "role_code": role_code,
                    "permissions": json.dumps(permissions)
                }
            )
            
            if result.rowcount > 0:
                self.db.commit()
                return True
            return False
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error updating role permissions: {str(e)}")
            raise
    
    def assign_role_to_user(self, user_id: int, role_id: int) -> bool:
        """
        Assign a role to a user
        """
        try:
            # Get role details
            role = self.db.execute(
                text("""
                    SELECT role_code, is_system_role 
                    FROM master.roles 
                    WHERE role_id = :role_id
                """),
                {"role_id": role_id}
            ).first()
            
            if not role:
                raise ValueError(f"Role {role_id} not found")
            
            # Update user with role
            result = self.db.execute(
                text("""
                    UPDATE master.org_users 
                    SET role_id = :role_id,
                        is_admin = :is_admin,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :user_id
                    RETURNING user_id
                """),
                {
                    "user_id": user_id,
                    "role_id": role_id,
                    "is_admin": role.role_code == "admin"
                }
            )
            
            if result.rowcount > 0:
                self.db.commit()
                return True
            return False
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Error assigning role to user: {str(e)}")
            raise
    
    def get_role_hierarchy(self, org_id: str) -> List[Dict[str, Any]]:
        """
        Get role hierarchy for an organization
        """
        result = self.db.execute(
            text("""
                WITH RECURSIVE role_tree AS (
                    SELECT 
                        role_id, role_code, role_name, role_level,
                        parent_role_id, permissions, allowed_modules,
                        data_access_level, 0 as depth
                    FROM master.roles
                    WHERE org_id = :org_id AND parent_role_id IS NULL
                    
                    UNION ALL
                    
                    SELECT 
                        r.role_id, r.role_code, r.role_name, r.role_level,
                        r.parent_role_id, r.permissions, r.allowed_modules,
                        r.data_access_level, rt.depth + 1
                    FROM master.roles r
                    INNER JOIN role_tree rt ON r.parent_role_id = rt.role_id
                    WHERE r.org_id = :org_id
                )
                SELECT * FROM role_tree
                ORDER BY depth, role_level, role_name
            """),
            {"org_id": org_id}
        )
        
        roles = []
        for row in result:
            role_dict = dict(row._mapping)
            if role_dict['permissions']:
                if isinstance(role_dict['permissions'], str):
                    role_dict['permissions'] = json.loads(role_dict['permissions'])
            roles.append(role_dict)
        
        return roles
    
    def validate_permission(self, user_id: int, module: str, 
                          permission: str) -> bool:
        """
        Validate if a user has specific permission
        """
        result = self.db.execute(
            text("""
                SELECT 
                    u.is_admin,
                    u.permissions as user_permissions,
                    r.permissions as role_permissions,
                    r.allowed_modules
                FROM master.org_users u
                LEFT JOIN master.roles r ON u.role_id = r.role_id
                WHERE u.user_id = :user_id AND u.is_active = true
            """),
            {"user_id": user_id}
        ).first()
        
        if not result:
            return False
        
        # Admin has all permissions
        if result.is_admin:
            return True
        
        # Check if module is allowed
        if result.allowed_modules and module not in result.allowed_modules:
            return False
        
        # Parse permissions
        user_perms = {}
        role_perms = {}
        
        if result.user_permissions:
            user_perms = json.loads(result.user_permissions) if isinstance(result.user_permissions, str) else result.user_permissions
        
        if result.role_permissions:
            role_perms = json.loads(result.role_permissions) if isinstance(result.role_permissions, str) else result.role_permissions
        
        # Check user permissions (override role)
        if user_perms.get('all') or user_perms.get(module, {}).get(permission):
            return True
        
        # Check role permissions
        if role_perms.get('all') or role_perms.get(module, {}).get(permission):
            return True
        
        return False
    
    def get_user_effective_permissions(self, user_id: int) -> Dict[str, Any]:
        """
        Get effective permissions for a user (merged role + user permissions)
        """
        result = self.db.execute(
            text("""
                SELECT 
                    u.is_admin,
                    u.permissions as user_permissions,
                    r.permissions as role_permissions,
                    r.allowed_modules,
                    r.restricted_features,
                    r.data_access_level
                FROM master.org_users u
                LEFT JOIN master.roles r ON u.role_id = r.role_id
                WHERE u.user_id = :user_id
            """),
            {"user_id": user_id}
        ).first()
        
        if not result:
            return {}
        
        if result.is_admin:
            return {"all": True, "data_access_level": "organization"}
        
        # Merge permissions
        effective = {
            "modules": result.allowed_modules or [],
            "restricted_features": result.restricted_features or [],
            "data_access_level": result.data_access_level or "own",
            "permissions": {}
        }
        
        # Start with role permissions
        if result.role_permissions:
            role_perms = json.loads(result.role_permissions) if isinstance(result.role_permissions, str) else result.role_permissions
            effective["permissions"] = role_perms.copy()
        
        # Override with user permissions
        if result.user_permissions:
            user_perms = json.loads(result.user_permissions) if isinstance(result.user_permissions, str) else result.user_permissions
            for module, perms in user_perms.items():
                if module == "all":
                    effective["permissions"]["all"] = True
                else:
                    if module not in effective["permissions"]:
                        effective["permissions"][module] = {}
                    effective["permissions"][module].update(perms)
        
        return effective