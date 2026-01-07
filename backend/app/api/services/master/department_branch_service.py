"""
Master Service - Generic CRUD for Departments, Branches
Handles common operations with table/column parameterization
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class DepartmentService:
    """Service class for Department operations"""
    
    @staticmethod
    def list_departments(
        db: Session, org_id: str, search: Optional[str] = None,
        is_active: Optional[bool] = None, limit: int = 100, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List departments with pagination and search."""
        search_pattern = f"%{search}%" if search else None
        
        query = text("""
            SELECT department_id, department_code, department_name, department_type,
                   parent_department_id, department_head_id, cost_center_code,
                   budget_allocated, is_active, created_at
            FROM master.departments
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(department_name) LIKE LOWER(:search_pattern) OR
                 LOWER(department_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
            ORDER BY department_name
            LIMIT :limit OFFSET :offset
        """)
        
        result = db.execute(query, {
            "org_id": org_id, "search": search, "search_pattern": search_pattern,
            "is_active": is_active, "limit": limit, "offset": offset
        })
        departments = [dict(row._mapping) for row in result]
        
        count_query = text("""
            SELECT COUNT(*) FROM master.departments
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(department_name) LIKE LOWER(:search_pattern) OR
                 LOWER(department_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
        """)
        total = db.execute(count_query, {
            "org_id": org_id, "search": search, "search_pattern": search_pattern, "is_active": is_active
        }).scalar() or 0
        
        return departments, total
    
    @staticmethod
    def get_department(db: Session, org_id: str, department_id: int) -> Optional[Dict[str, Any]]:
        """Get department by ID."""
        result = db.execute(text("""
            SELECT * FROM master.departments WHERE department_id = :id AND org_id = :org_id
        """), {"id": department_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def count_departments(db: Session, org_id: str) -> int:
        """Count departments for code generation."""
        return db.execute(text("SELECT COUNT(*) FROM master.departments WHERE org_id = :org_id"), {"org_id": org_id}).scalar() or 0
    
    @staticmethod
    def insert_department(db: Session, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Insert new department. Returns created info."""
        result = db.execute(text("""
            INSERT INTO master.departments (
                org_id, department_code, department_name, department_type,
                parent_department_id, department_head_id, cost_center_code, is_active
            ) VALUES (
                :org_id, :department_code, :department_name, :department_type,
                :parent_department_id, :department_head_id, :cost_center_code, :is_active
            ) RETURNING department_id, department_name, department_code
        """), {"org_id": org_id, **data})
        row = result.first()
        return {"department_id": row[0], "department_name": row[1], "department_code": row[2]} if row else {}
    
    @staticmethod
    def update_department_dynamic(db: Session, org_id: str, department_id: int, 
                                   update_fields: List[str], params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update department with dynamic fields."""
        if not update_fields:
            return None
        query = text(f"""
            UPDATE master.departments 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE department_id = :department_id AND org_id = :org_id
            RETURNING department_id, department_name
        """)
        result = db.execute(query, {**params, "department_id": department_id, "org_id": org_id})
        row = result.first()
        return {"department_id": row[0], "department_name": row[1]} if row else None
    
    @staticmethod
    def soft_delete_department(db: Session, org_id: str, department_id: int) -> Optional[Dict[str, Any]]:
        """Soft delete department."""
        result = db.execute(text("""
            UPDATE master.departments SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE department_id = :id AND org_id = :org_id
            RETURNING department_id, department_name
        """), {"id": department_id, "org_id": org_id})
        row = result.first()
        return {"department_id": row[0], "department_name": row[1]} if row else None


class BranchService:
    """Service class for Branch operations"""
    
    @staticmethod
    def list_branches(
        db: Session, org_id: str, search: Optional[str] = None,
        is_active: Optional[bool] = None, limit: int = 100, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List branches with pagination and search."""
        search_pattern = f"%{search}%" if search else None
        
        query = text("""
            SELECT branch_id, branch_code, branch_name, branch_type, address,
                   branch_phone, branch_email, branch_gst_number, branch_manager_id,
                   is_billing_location, is_shipping_location, is_default_location,
                   is_active, created_at
            FROM master.org_branches
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(branch_name) LIKE LOWER(:search_pattern) OR
                 LOWER(branch_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
            ORDER BY branch_name
            LIMIT :limit OFFSET :offset
        """)
        
        result = db.execute(query, {
            "org_id": org_id, "search": search, "search_pattern": search_pattern,
            "is_active": is_active, "limit": limit, "offset": offset
        })
        branches = [dict(row._mapping) for row in result]
        
        count_query = text("""
            SELECT COUNT(*) FROM master.org_branches
            WHERE org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(branch_name) LIKE LOWER(:search_pattern) OR
                 LOWER(branch_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR is_active = :is_active)
        """)
        total = db.execute(count_query, {
            "org_id": org_id, "search": search, "search_pattern": search_pattern, "is_active": is_active
        }).scalar() or 0
        
        return branches, total
    
    @staticmethod
    def get_branch(db: Session, org_id: str, branch_id: int) -> Optional[Dict[str, Any]]:
        """Get branch by ID."""
        result = db.execute(text("""
            SELECT * FROM master.org_branches WHERE branch_id = :id AND org_id = :org_id
        """), {"id": branch_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def count_branches(db: Session, org_id: str) -> int:
        """Count branches for code generation."""
        return db.execute(text("SELECT COUNT(*) FROM master.org_branches WHERE org_id = :org_id"), {"org_id": org_id}).scalar() or 0
    
    @staticmethod
    def insert_branch(db: Session, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Insert new branch. Returns created info."""
        result = db.execute(text("""
            INSERT INTO master.org_branches (
                org_id, branch_code, branch_name, branch_type,
                address, branch_phone, branch_email, branch_gst_number,
                branch_manager_id, is_active
            ) VALUES (
                :org_id, :branch_code, :branch_name, :branch_type,
                :address, :branch_phone, :branch_email, :branch_gst_number,
                :branch_manager_id, :is_active
            ) RETURNING branch_id, branch_name, branch_code
        """), {"org_id": org_id, **data})
        row = result.first()
        return {"branch_id": row[0], "branch_name": row[1], "branch_code": row[2]} if row else {}
    
    @staticmethod
    def update_branch_dynamic(db: Session, org_id: str, branch_id: int,
                               update_fields: List[str], params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update branch with dynamic fields."""
        if not update_fields:
            return None
        query = text(f"""
            UPDATE master.org_branches 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE branch_id = :branch_id AND org_id = :org_id
            RETURNING branch_id, branch_name
        """)
        result = db.execute(query, {**params, "branch_id": branch_id, "org_id": org_id})
        row = result.first()
        return {"branch_id": row[0], "branch_name": row[1]} if row else None
    
    @staticmethod
    def soft_delete_branch(db: Session, org_id: str, branch_id: int) -> Optional[Dict[str, Any]]:
        """Soft delete branch."""
        result = db.execute(text("""
            UPDATE master.org_branches SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE branch_id = :id AND org_id = :org_id
            RETURNING branch_id, branch_name
        """), {"id": branch_id, "org_id": org_id})
        row = result.first()
        return {"branch_id": row[0], "branch_name": row[1]} if row else None
