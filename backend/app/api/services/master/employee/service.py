"""
Employee Service
Handles all database operations for employees
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class EmployeeService:
    """Service class for Employee operations"""
    
    @staticmethod
    def list_employees(
        db: Session,
        org_id: str,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """List employees with pagination and search. Returns (employees, total_count)."""
        search_pattern = f"%{search}%" if search else None
        
        # Main query
        query = text("""
            SELECT 
                e.employee_id, e.user_id, e.employee_code, e.full_name, e.first_name, e.last_name,
                e.designation, e.department_id, d.department_name, e.branch_id, b.branch_name,
                e.joining_date, e.personal_mobile, e.personal_email, e.date_of_birth, e.gender,
                e.pan_number, e.aadhar_number, e.current_address, e.permanent_address,
                e.emergency_contact, e.bank_account_details, e.employment_status,
                CASE WHEN e.employment_status = 'active' THEN true ELSE false END as is_active,
                e.created_at
            FROM master.employees e
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = e.org_id
            LEFT JOIN master.org_branches b ON e.branch_id = b.branch_id AND b.org_id = e.org_id
            WHERE e.org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(e.full_name) LIKE LOWER(:search_pattern) OR
                 LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR (
                CASE WHEN :is_active THEN e.employment_status = 'active'
                ELSE e.employment_status != 'active' END
            ))
            ORDER BY e.full_name
            LIMIT :limit OFFSET :offset
        """)
        
        result = db.execute(query, {
            "org_id": org_id,
            "search": search,
            "search_pattern": search_pattern,
            "is_active": is_active,
            "limit": limit,
            "offset": offset
        })
        employees = [dict(row._mapping) for row in result]
        
        # Count query
        count_query = text("""
            SELECT COUNT(*) FROM master.employees e
            WHERE e.org_id = :org_id
            AND (:search IS NULL OR 
                 LOWER(e.full_name) LIKE LOWER(:search_pattern) OR
                 LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            AND (:is_active IS NULL OR (
                CASE WHEN :is_active THEN e.employment_status = 'active'
                ELSE e.employment_status != 'active' END
            ))
        """)
        
        count_result = db.execute(count_query, {
            "org_id": org_id,
            "search": search,
            "search_pattern": search_pattern,
            "is_active": is_active
        })
        total = count_result.scalar() or 0
        
        return employees, total
    
    @staticmethod
    def get_employee(
        db: Session,
        org_id: str,
        employee_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get employee by ID with department and branch names."""
        query = text("""
            SELECT 
                e.*,
                d.department_name,
                b.branch_name
            FROM master.employees e
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = e.org_id
            LEFT JOIN master.org_branches b ON e.branch_id = b.branch_id AND b.org_id = e.org_id
            WHERE e.employee_id = :employee_id AND e.org_id = :org_id
        """)
        
        result = db.execute(query, {"employee_id": employee_id, "org_id": org_id})
        row = result.first()
        return dict(row._mapping) if row else None
    
    @staticmethod
    def count_employees(db: Session, org_id: str) -> int:
        """Count total employees for an org."""
        result = db.execute(text("""
            SELECT COUNT(*) FROM master.employees WHERE org_id = :org_id
        """), {"org_id": org_id})
        return result.scalar() or 0
    
    @staticmethod
    def insert_employee(
        db: Session,
        org_id: str,
        employee_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Insert a new employee. Returns created employee info."""
        result = db.execute(text("""
            INSERT INTO master.employees (
                org_id, employee_code, first_name, last_name,
                designation, department_id, branch_id, joining_date,
                personal_mobile, personal_email,
                date_of_birth, gender,
                pan_number, aadhar_number,
                current_address, permanent_address,
                emergency_contact, bank_account_details,
                employment_status
            ) VALUES (
                :org_id, :employee_code, :first_name, :last_name,
                :designation, :department_id, :branch_id, :joining_date,
                :personal_mobile, :personal_email,
                :date_of_birth, :gender,
                :pan_number, :aadhar_number,
                :current_address, :permanent_address,
                :emergency_contact, :bank_account_details,
                :employment_status
            ) RETURNING employee_id, full_name, employee_code
        """), {"org_id": org_id, **employee_data})
        
        row = result.first()
        return {"employee_id": row[0], "full_name": row[1], "employee_code": row[2]} if row else {}
    
    @staticmethod
    def update_employee_dynamic(
        db: Session,
        org_id: str,
        employee_id: int,
        update_fields: List[str],
        params: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update employee with dynamic fields. Returns updated info or None if not found."""
        if not update_fields:
            return None
            
        query = text(f"""
            UPDATE master.employees 
            SET {', '.join(update_fields)}, updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = :employee_id AND org_id = :org_id
            RETURNING employee_id, full_name
        """)
        
        result = db.execute(query, {**params, "employee_id": employee_id, "org_id": org_id})
        row = result.first()
        return {"employee_id": row[0], "full_name": row[1]} if row else None
    
    @staticmethod
    def soft_delete_employee(
        db: Session,
        org_id: str,
        employee_id: int
    ) -> Optional[Dict[str, Any]]:
        """Soft delete employee. Returns deleted info or None if not found."""
        result = db.execute(text("""
            UPDATE master.employees 
            SET employment_status = 'inactive', updated_at = CURRENT_TIMESTAMP
            WHERE employee_id = :employee_id AND org_id = :org_id
            RETURNING employee_id, full_name
        """), {"employee_id": employee_id, "org_id": org_id})
        
        row = result.first()
        return {"employee_id": row[0], "full_name": row[1]} if row else None
