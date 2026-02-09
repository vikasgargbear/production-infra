"""
Leave Service
Leave policy, balance, and application management
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class LeaveService:

    # ========================================================================
    # LEAVE POLICIES
    # ========================================================================

    @staticmethod
    def list_policies(db, org_id: str) -> List[Dict[str, Any]]:
        rows = db.execute(text("""
            SELECT * FROM payroll.leave_policies
            WHERE org_id = :org_id
            ORDER BY leave_type
        """), {"org_id": org_id})
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def create_policy(db, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        row = db.execute(text("""
            INSERT INTO payroll.leave_policies (
                org_id, leave_type, leave_name, annual_quota,
                carry_forward, max_carry_forward,
                max_consecutive_days, requires_document, applicable_after_days
            ) VALUES (
                :org_id, :leave_type, :leave_name, :annual_quota,
                :carry_forward, :max_carry_forward,
                :max_consecutive_days, :requires_document, :applicable_after_days
            )
            ON CONFLICT (org_id, leave_type) DO UPDATE SET
                leave_name = EXCLUDED.leave_name,
                annual_quota = EXCLUDED.annual_quota,
                carry_forward = EXCLUDED.carry_forward,
                max_carry_forward = EXCLUDED.max_carry_forward,
                max_consecutive_days = EXCLUDED.max_consecutive_days,
                requires_document = EXCLUDED.requires_document,
                applicable_after_days = EXCLUDED.applicable_after_days,
                updated_at = NOW()
            RETURNING leave_policy_id
        """), {"org_id": org_id, **data}).first()
        db.commit()
        return {"leave_policy_id": row[0]}

    @staticmethod
    def update_policy(db, org_id: str, policy_id: int, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        fields = []
        params = {"id": policy_id, "org_id": org_id}
        for key in ["leave_name", "annual_quota", "carry_forward", "max_carry_forward",
                     "max_consecutive_days", "requires_document", "applicable_after_days", "is_active"]:
            if key in data:
                fields.append(f"{key} = :{key}")
                params[key] = data[key]
        if not fields:
            return None

        row = db.execute(text(f"""
            UPDATE payroll.leave_policies
            SET {', '.join(fields)}, updated_at = NOW()
            WHERE leave_policy_id = :id AND org_id = :org_id
            RETURNING leave_policy_id
        """), params).first()
        db.commit()
        return {"leave_policy_id": row[0]} if row else None

    @staticmethod
    def delete_policy(db, org_id: str, policy_id: int) -> bool:
        result = db.execute(text("""
            DELETE FROM payroll.leave_policies
            WHERE leave_policy_id = :id AND org_id = :org_id
            RETURNING leave_policy_id
        """), {"id": policy_id, "org_id": org_id}).first()
        db.commit()
        return result is not None

    # ========================================================================
    # LEAVE BALANCES
    # ========================================================================

    @staticmethod
    def get_balances(
        db, org_id: str, financial_year: str, employee_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        rows = db.execute(text("""
            SELECT lb.*, lp.leave_type, lp.leave_name, lp.annual_quota,
                   e.full_name as employee_name, e.employee_code,
                   (lb.opening_balance + lb.carry_forwarded - lb.used) as available
            FROM payroll.leave_balances lb
            JOIN payroll.leave_policies lp ON lb.leave_policy_id = lp.leave_policy_id
            JOIN master.employees e ON lb.employee_id = e.employee_id AND e.org_id = lb.org_id
            WHERE lb.org_id = :org_id AND lb.financial_year = :fy
            AND (:employee_id IS NULL OR lb.employee_id = :employee_id)
            ORDER BY e.full_name, lp.leave_type
        """), {"org_id": org_id, "fy": financial_year, "employee_id": employee_id})
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def initialize_balances(db, org_id: str, financial_year: str) -> int:
        """Initialize leave balances for all active employees for a financial year.
        Skips employees who already have balances for that year."""
        result = db.execute(text("""
            INSERT INTO payroll.leave_balances (org_id, employee_id, leave_policy_id, financial_year, opening_balance)
            SELECT lp.org_id, e.employee_id, lp.leave_policy_id, :fy, lp.annual_quota
            FROM payroll.leave_policies lp
            CROSS JOIN master.employees e
            WHERE lp.org_id = :org_id AND e.org_id = :org_id
            AND lp.is_active = true AND e.employment_status = 'active'
            ON CONFLICT (org_id, employee_id, leave_policy_id, financial_year) DO NOTHING
        """), {"org_id": org_id, "fy": financial_year})
        db.commit()
        return result.rowcount

    # ========================================================================
    # LEAVE APPLICATIONS
    # ========================================================================

    @staticmethod
    def list_applications(
        db, org_id: str, status: Optional[str] = None,
        employee_id: Optional[int] = None, limit: int = 100, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        rows = db.execute(text("""
            SELECT la.*, lp.leave_type, lp.leave_name,
                   e.full_name as employee_name, e.employee_code,
                   a.full_name as approver_name
            FROM payroll.leave_applications la
            JOIN payroll.leave_policies lp ON la.leave_policy_id = lp.leave_policy_id
            JOIN master.employees e ON la.employee_id = e.employee_id AND e.org_id = la.org_id
            LEFT JOIN master.employees a ON la.approved_by = a.employee_id AND a.org_id = la.org_id
            WHERE la.org_id = :org_id
            AND (:status IS NULL OR la.status = :status)
            AND (:employee_id IS NULL OR la.employee_id = :employee_id)
            ORDER BY la.created_at DESC
            LIMIT :limit OFFSET :offset
        """), {
            "org_id": org_id, "status": status, "employee_id": employee_id,
            "limit": limit, "offset": offset
        })
        data = [dict(r._mapping) for r in rows]

        count = db.execute(text("""
            SELECT COUNT(*) FROM payroll.leave_applications
            WHERE org_id = :org_id
            AND (:status IS NULL OR status = :status)
            AND (:employee_id IS NULL OR employee_id = :employee_id)
        """), {"org_id": org_id, "status": status, "employee_id": employee_id}).scalar() or 0

        return data, count

    @staticmethod
    def apply_leave(db, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        row = db.execute(text("""
            INSERT INTO payroll.leave_applications (
                org_id, employee_id, leave_policy_id,
                from_date, to_date, number_of_days, half_day, reason
            ) VALUES (
                :org_id, :employee_id, :leave_policy_id,
                :from_date, :to_date, :number_of_days, :half_day, :reason
            ) RETURNING leave_application_id
        """), {"org_id": org_id, **data}).first()
        db.commit()
        return {"leave_application_id": row[0]}

    @staticmethod
    def approve_leave(db, org_id: str, application_id: int, approved_by: int, remarks: Optional[str] = None) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            UPDATE payroll.leave_applications
            SET status = 'approved', approved_by = :approved_by,
                approval_remarks = :remarks, approved_at = NOW(), updated_at = NOW()
            WHERE leave_application_id = :id AND org_id = :org_id AND status = 'pending'
            RETURNING leave_application_id, employee_id, leave_policy_id, number_of_days
        """), {
            "id": application_id, "org_id": org_id,
            "approved_by": approved_by, "remarks": remarks
        }).first()

        if row:
            # Update leave balance
            db.execute(text("""
                UPDATE payroll.leave_balances
                SET used = used + :days, updated_at = NOW()
                WHERE org_id = :org_id AND employee_id = :employee_id
                AND leave_policy_id = :policy_id
                AND financial_year = (
                    CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                    THEN EXTRACT(YEAR FROM CURRENT_DATE) || '-' || (EXTRACT(YEAR FROM CURRENT_DATE) + 1)
                    ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1) || '-' || EXTRACT(YEAR FROM CURRENT_DATE)
                    END
                )
            """), {
                "org_id": org_id, "employee_id": row[1],
                "policy_id": row[2], "days": float(row[3])
            })
            db.commit()
            return {"leave_application_id": row[0]}

        return None

    @staticmethod
    def reject_leave(db, org_id: str, application_id: int, approved_by: int, remarks: Optional[str] = None) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            UPDATE payroll.leave_applications
            SET status = 'rejected', approved_by = :approved_by,
                approval_remarks = :remarks, approved_at = NOW(), updated_at = NOW()
            WHERE leave_application_id = :id AND org_id = :org_id AND status = 'pending'
            RETURNING leave_application_id
        """), {
            "id": application_id, "org_id": org_id,
            "approved_by": approved_by, "remarks": remarks
        }).first()
        db.commit()
        return {"leave_application_id": row[0]} if row else None
