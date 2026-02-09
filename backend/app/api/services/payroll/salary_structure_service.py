"""
Salary Structure Service
CRUD for payroll.salary_structures
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class SalaryStructureService:

    @staticmethod
    def list_structures(
        db, org_id: str, search: Optional[str] = None,
        is_active: Optional[bool] = None, limit: int = 100, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        search_pattern = f"%{search}%" if search else None

        rows = db.execute(text("""
            SELECT ss.*, e.full_name as employee_name, e.employee_code,
                   e.designation, d.department_name
            FROM payroll.salary_structures ss
            JOIN master.employees e ON ss.employee_id = e.employee_id AND e.org_id = ss.org_id
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = ss.org_id
            WHERE ss.org_id = :org_id
            AND (:is_active IS NULL OR ss.is_active = :is_active)
            AND (:search IS NULL OR LOWER(e.full_name) LIKE LOWER(:search_pattern)
                 OR LOWER(e.employee_code) LIKE LOWER(:search_pattern))
            ORDER BY e.full_name
            LIMIT :limit OFFSET :offset
        """), {
            "org_id": org_id, "search": search, "search_pattern": search_pattern,
            "is_active": is_active, "limit": limit, "offset": offset
        })
        data = [dict(r._mapping) for r in rows]

        count = db.execute(text("""
            SELECT COUNT(*) FROM payroll.salary_structures ss
            JOIN master.employees e ON ss.employee_id = e.employee_id AND e.org_id = ss.org_id
            WHERE ss.org_id = :org_id
            AND (:is_active IS NULL OR ss.is_active = :is_active)
            AND (:search IS NULL OR LOWER(e.full_name) LIKE LOWER(:search_pattern)
                 OR LOWER(e.employee_code) LIKE LOWER(:search_pattern))
        """), {
            "org_id": org_id, "search": search, "search_pattern": search_pattern,
            "is_active": is_active
        }).scalar() or 0

        return data, count

    @staticmethod
    def get_by_id(db, org_id: str, structure_id: int) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            SELECT ss.*, e.full_name as employee_name, e.employee_code
            FROM payroll.salary_structures ss
            JOIN master.employees e ON ss.employee_id = e.employee_id AND e.org_id = ss.org_id
            WHERE ss.salary_structure_id = :id AND ss.org_id = :org_id
        """), {"id": structure_id, "org_id": org_id}).first()
        return dict(row._mapping) if row else None

    @staticmethod
    def get_by_employee(db, org_id: str, employee_id: int) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            SELECT ss.*, e.full_name as employee_name
            FROM payroll.salary_structures ss
            JOIN master.employees e ON ss.employee_id = e.employee_id AND e.org_id = ss.org_id
            WHERE ss.employee_id = :employee_id AND ss.org_id = :org_id
            AND ss.is_active = true
            ORDER BY ss.effective_from DESC LIMIT 1
        """), {"employee_id": employee_id, "org_id": org_id}).first()
        return dict(row._mapping) if row else None

    @staticmethod
    def create(db, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        # Deactivate previous active structure for same employee
        db.execute(text("""
            UPDATE payroll.salary_structures
            SET is_active = false, effective_to = :effective_from, updated_at = NOW()
            WHERE org_id = :org_id AND employee_id = :employee_id AND is_active = true
        """), {"org_id": org_id, "employee_id": data["employee_id"],
               "effective_from": data.get("effective_from")})

        row = db.execute(text("""
            INSERT INTO payroll.salary_structures (
                org_id, employee_id, basic_salary, hra, dearness_allowance,
                conveyance_allowance, medical_allowance, special_allowance, other_allowance,
                pf_applicable, pf_percent, esi_applicable, professional_tax_applicable,
                effective_from, created_by
            ) VALUES (
                :org_id, :employee_id, :basic_salary, :hra, :dearness_allowance,
                :conveyance_allowance, :medical_allowance, :special_allowance, :other_allowance,
                :pf_applicable, :pf_percent, :esi_applicable, :professional_tax_applicable,
                :effective_from, :created_by
            ) RETURNING salary_structure_id
        """), {"org_id": org_id, **data}).first()

        db.commit()
        return {"salary_structure_id": row[0], "success": True}

    @staticmethod
    def update(db, org_id: str, structure_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        fields = []
        params = {"id": structure_id, "org_id": org_id}

        for key in [
            "basic_salary", "hra", "dearness_allowance", "conveyance_allowance",
            "medical_allowance", "special_allowance", "other_allowance",
            "pf_applicable", "pf_percent", "esi_applicable", "professional_tax_applicable",
            "effective_from", "is_active"
        ]:
            if key in data:
                fields.append(f"{key} = :{key}")
                params[key] = data[key]

        if not fields:
            return None

        row = db.execute(text(f"""
            UPDATE payroll.salary_structures
            SET {', '.join(fields)}, updated_at = NOW()
            WHERE salary_structure_id = :id AND org_id = :org_id
            RETURNING salary_structure_id
        """), params).first()
        db.commit()
        return {"salary_structure_id": row[0]} if row else None
