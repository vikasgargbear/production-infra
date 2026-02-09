"""
Attendance Service
Daily attendance marking and queries
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class AttendanceService:

    @staticmethod
    def get_monthly_attendance(
        db, org_id: str, year: int, month: int, employee_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get attendance for a month, optionally filtered by employee."""
        rows = db.execute(text("""
            SELECT a.*, e.full_name as employee_name, e.employee_code
            FROM payroll.attendance a
            JOIN master.employees e ON a.employee_id = e.employee_id AND e.org_id = a.org_id
            WHERE a.org_id = :org_id
            AND EXTRACT(YEAR FROM a.attendance_date) = :year
            AND EXTRACT(MONTH FROM a.attendance_date) = :month
            AND (:employee_id IS NULL OR a.employee_id = :employee_id)
            ORDER BY e.full_name, a.attendance_date
        """), {
            "org_id": org_id, "year": year, "month": month,
            "employee_id": employee_id
        })
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def get_attendance_summary(
        db, org_id: str, employee_id: int, year: int, month: int
    ) -> Dict[str, Any]:
        """Get attendance summary for an employee for a specific month."""
        row = db.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'present') as days_present,
                COUNT(*) FILTER (WHERE status = 'absent') as days_absent,
                COUNT(*) FILTER (WHERE status = 'half_day') * 0.5 as half_days,
                COUNT(*) FILTER (WHERE status = 'leave') as days_leave,
                COUNT(*) FILTER (WHERE status = 'holiday') as days_holiday,
                COUNT(*) FILTER (WHERE status = 'week_off') as days_week_off,
                COUNT(*) as total_records
            FROM payroll.attendance
            WHERE org_id = :org_id AND employee_id = :employee_id
            AND EXTRACT(YEAR FROM attendance_date) = :year
            AND EXTRACT(MONTH FROM attendance_date) = :month
        """), {
            "org_id": org_id, "employee_id": employee_id,
            "year": year, "month": month
        }).first()
        return dict(row._mapping) if row else {}

    @staticmethod
    def mark_attendance(db, org_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Mark or update attendance for a single employee+date."""
        row = db.execute(text("""
            INSERT INTO payroll.attendance (
                org_id, employee_id, attendance_date, status, remarks,
                leave_application_id, marked_by
            ) VALUES (
                :org_id, :employee_id, :attendance_date, :status, :remarks,
                :leave_application_id, :marked_by
            )
            ON CONFLICT (org_id, employee_id, attendance_date)
            DO UPDATE SET
                status = EXCLUDED.status,
                remarks = EXCLUDED.remarks,
                leave_application_id = EXCLUDED.leave_application_id,
                marked_by = EXCLUDED.marked_by,
                updated_at = NOW()
            RETURNING attendance_id
        """), {
            "org_id": org_id,
            "employee_id": data["employee_id"],
            "attendance_date": data["attendance_date"],
            "status": data["status"],
            "remarks": data.get("remarks"),
            "leave_application_id": data.get("leave_application_id"),
            "marked_by": data.get("marked_by")
        }).first()
        db.commit()
        return {"attendance_id": row[0]} if row else {}

    @staticmethod
    def bulk_mark_attendance(db, org_id: str, records: List[Dict[str, Any]], marked_by: Optional[int] = None) -> int:
        """Bulk mark attendance. Returns count of upserted records."""
        count = 0
        for rec in records:
            db.execute(text("""
                INSERT INTO payroll.attendance (
                    org_id, employee_id, attendance_date, status, remarks, marked_by
                ) VALUES (
                    :org_id, :employee_id, :attendance_date, :status, :remarks, :marked_by
                )
                ON CONFLICT (org_id, employee_id, attendance_date)
                DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks,
                             marked_by = EXCLUDED.marked_by, updated_at = NOW()
            """), {
                "org_id": org_id,
                "employee_id": rec["employee_id"],
                "attendance_date": rec["attendance_date"],
                "status": rec["status"],
                "remarks": rec.get("remarks"),
                "marked_by": marked_by
            })
            count += 1
        db.commit()
        return count
