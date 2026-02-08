"""
Salary Slip Service
Generate, store, and retrieve payslips
"""
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text
from datetime import datetime
import logging

from ..document_number_service import DocumentNumberService

logger = logging.getLogger(__name__)


class SalarySlipService:

    @staticmethod
    def create_payroll_run(
        db, org_id: str, year: int, month: int,
        calculation: Dict[str, Any], processed_by: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create payroll run and generate all slips from calculation data."""

        # Generate run number using central service
        run_number = DocumentNumberService.generate_number(db, "payroll_run", org_id)

        # Insert payroll run
        run_row = db.execute(text("""
            INSERT INTO payroll.payroll_runs (
                org_id, run_number, payroll_month, payroll_year,
                total_employees, total_gross, total_deductions, total_net_pay,
                total_employer_pf, total_employer_esi,
                status, processed_at, processed_by
            ) VALUES (
                :org_id, :run_number, :month, :year,
                :total_employees, :total_gross, :total_deductions, :total_net_pay,
                :total_employer_pf, :total_employer_esi,
                'calculated', NOW(), :processed_by
            )
            ON CONFLICT (org_id, payroll_month, payroll_year)
            DO UPDATE SET
                total_employees = EXCLUDED.total_employees,
                total_gross = EXCLUDED.total_gross,
                total_deductions = EXCLUDED.total_deductions,
                total_net_pay = EXCLUDED.total_net_pay,
                total_employer_pf = EXCLUDED.total_employer_pf,
                total_employer_esi = EXCLUDED.total_employer_esi,
                status = 'calculated',
                processed_at = NOW(),
                processed_by = EXCLUDED.processed_by,
                updated_at = NOW()
            RETURNING payroll_run_id
        """), {
            "org_id": org_id, "run_number": run_number, "month": month, "year": year,
            "total_employees": calculation["total_employees"],
            "total_gross": calculation["total_gross"],
            "total_deductions": calculation["total_deductions"],
            "total_net_pay": calculation["total_net_pay"],
            "total_employer_pf": calculation["total_employer_pf"],
            "total_employer_esi": calculation["total_employer_esi"],
            "processed_by": processed_by
        }).first()

        run_id = run_row[0]

        # Delete existing slips for this run (recalculation)
        db.execute(text("""
            DELETE FROM payroll.payroll_slips WHERE payroll_run_id = :run_id
        """), {"run_id": run_id})

        # Insert slips
        for idx, slip in enumerate(calculation.get("slips", []), 1):
            slip_number = DocumentNumberService.generate_number(db, "salary_slip", org_id)
            db.execute(text("""
                INSERT INTO payroll.payroll_slips (
                    org_id, payroll_run_id, employee_id, slip_number,
                    working_days, days_present, days_absent, days_leave, days_holiday, lop_days,
                    basic_earned, hra_earned, da_earned, conveyance_earned,
                    medical_earned, special_earned, other_earned, gross_earned,
                    pf_employee, pf_employer, esi_employee, esi_employer,
                    professional_tax, tds, lop_deduction, other_deductions,
                    total_deductions, net_pay,
                    bank_name, account_number, ifsc_code
                ) VALUES (
                    :org_id, :run_id, :employee_id, :slip_number,
                    :working_days, :days_present, :days_absent, :days_leave, :days_holiday, :lop_days,
                    :basic_earned, :hra_earned, :da_earned, :conveyance_earned,
                    :medical_earned, :special_earned, :other_earned, :gross_earned,
                    :pf_employee, :pf_employer, :esi_employee, :esi_employer,
                    :professional_tax, :tds, :lop_deduction, :other_deductions,
                    :total_deductions, :net_pay,
                    :bank_name, :account_number, :ifsc_code
                )
            """), {
                "org_id": org_id, "run_id": run_id, "slip_number": slip_number,
                **{k: v for k, v in slip.items() if k not in ("employee_name", "employee_code")}
            })

        db.commit()
        return {"payroll_run_id": run_id, "run_number": run_number, "slips_generated": len(calculation.get("slips", []))}

    @staticmethod
    def confirm_payroll_run(db, org_id: str, run_id: int, confirmed_by: Optional[int] = None) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            UPDATE payroll.payroll_runs
            SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = :confirmed_by, updated_at = NOW()
            WHERE payroll_run_id = :run_id AND org_id = :org_id AND status = 'calculated'
            RETURNING payroll_run_id, run_number
        """), {"run_id": run_id, "org_id": org_id, "confirmed_by": confirmed_by}).first()
        db.commit()
        return {"payroll_run_id": row[0], "run_number": row[1]} if row else None

    @staticmethod
    def list_runs(db, org_id: str, year: Optional[int] = None, limit: int = 20) -> List[Dict[str, Any]]:
        rows = db.execute(text("""
            SELECT * FROM payroll.payroll_runs
            WHERE org_id = :org_id
            AND (:year IS NULL OR payroll_year = :year)
            ORDER BY payroll_year DESC, payroll_month DESC
            LIMIT :limit
        """), {"org_id": org_id, "year": year, "limit": limit})
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def get_run(db, org_id: str, run_id: int) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            SELECT * FROM payroll.payroll_runs
            WHERE payroll_run_id = :run_id AND org_id = :org_id
        """), {"run_id": run_id, "org_id": org_id}).first()
        return dict(row._mapping) if row else None

    @staticmethod
    def list_slips(
        db, org_id: str, run_id: Optional[int] = None,
        employee_id: Optional[int] = None, limit: int = 100, offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        rows = db.execute(text("""
            SELECT ps.*, e.full_name as employee_name, e.employee_code,
                   pr.payroll_month, pr.payroll_year, pr.run_number
            FROM payroll.payroll_slips ps
            JOIN master.employees e ON ps.employee_id = e.employee_id AND e.org_id = ps.org_id
            JOIN payroll.payroll_runs pr ON ps.payroll_run_id = pr.payroll_run_id
            WHERE ps.org_id = :org_id
            AND (:run_id IS NULL OR ps.payroll_run_id = :run_id)
            AND (:employee_id IS NULL OR ps.employee_id = :employee_id)
            ORDER BY pr.payroll_year DESC, pr.payroll_month DESC, e.full_name
            LIMIT :limit OFFSET :offset
        """), {
            "org_id": org_id, "run_id": run_id,
            "employee_id": employee_id, "limit": limit, "offset": offset
        })
        data = [dict(r._mapping) for r in rows]

        count = db.execute(text("""
            SELECT COUNT(*) FROM payroll.payroll_slips
            WHERE org_id = :org_id
            AND (:run_id IS NULL OR payroll_run_id = :run_id)
            AND (:employee_id IS NULL OR employee_id = :employee_id)
        """), {"org_id": org_id, "run_id": run_id, "employee_id": employee_id}).scalar() or 0

        return data, count

    @staticmethod
    def get_slip(db, org_id: str, slip_id: int) -> Optional[Dict[str, Any]]:
        row = db.execute(text("""
            SELECT ps.*, e.full_name as employee_name, e.employee_code,
                   e.designation, e.department_id, d.department_name,
                   pr.payroll_month, pr.payroll_year, pr.run_number
            FROM payroll.payroll_slips ps
            JOIN master.employees e ON ps.employee_id = e.employee_id AND e.org_id = ps.org_id
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = ps.org_id
            JOIN payroll.payroll_runs pr ON ps.payroll_run_id = pr.payroll_run_id
            WHERE ps.payroll_slip_id = :slip_id AND ps.org_id = :org_id
        """), {"slip_id": slip_id, "org_id": org_id}).first()
        return dict(row._mapping) if row else None
