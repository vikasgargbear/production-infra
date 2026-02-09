"""
Payroll Report Service
Payroll summaries, PF/ESI register, bank sheet, department breakdown
"""
from typing import List, Dict, Any, Optional
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


class PayrollReportService:

    @staticmethod
    def monthly_summary(db, org_id: str, year: int, month: int) -> Dict[str, Any]:
        """Monthly payroll summary with totals."""
        row = db.execute(text("""
            SELECT
                pr.payroll_run_id, pr.run_number, pr.status,
                pr.total_employees, pr.total_gross, pr.total_deductions,
                pr.total_net_pay, pr.total_employer_pf, pr.total_employer_esi,
                (pr.total_employer_pf + pr.total_employer_esi) as total_employer_cost,
                (pr.total_gross + pr.total_employer_pf + pr.total_employer_esi) as ctc_total
            FROM payroll.payroll_runs pr
            WHERE pr.org_id = :org_id AND pr.payroll_year = :year AND pr.payroll_month = :month
        """), {"org_id": org_id, "year": year, "month": month}).first()

        return dict(row._mapping) if row else {}

    @staticmethod
    def pf_register(db, org_id: str, year: int, month: int) -> List[Dict[str, Any]]:
        """PF register: employee + employer contributions per employee."""
        rows = db.execute(text("""
            SELECT ps.employee_id, e.full_name, e.employee_code,
                   ps.basic_earned, ps.pf_employee, ps.pf_employer,
                   (ps.pf_employee + ps.pf_employer) as total_pf
            FROM payroll.payroll_slips ps
            JOIN payroll.payroll_runs pr ON ps.payroll_run_id = pr.payroll_run_id
            JOIN master.employees e ON ps.employee_id = e.employee_id AND e.org_id = ps.org_id
            WHERE ps.org_id = :org_id AND pr.payroll_year = :year AND pr.payroll_month = :month
            AND ps.pf_employee > 0
            ORDER BY e.full_name
        """), {"org_id": org_id, "year": year, "month": month})
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def esi_register(db, org_id: str, year: int, month: int) -> List[Dict[str, Any]]:
        """ESI register."""
        rows = db.execute(text("""
            SELECT ps.employee_id, e.full_name, e.employee_code,
                   ps.gross_earned, ps.esi_employee, ps.esi_employer,
                   (ps.esi_employee + ps.esi_employer) as total_esi
            FROM payroll.payroll_slips ps
            JOIN payroll.payroll_runs pr ON ps.payroll_run_id = pr.payroll_run_id
            JOIN master.employees e ON ps.employee_id = e.employee_id AND e.org_id = ps.org_id
            WHERE ps.org_id = :org_id AND pr.payroll_year = :year AND pr.payroll_month = :month
            AND ps.esi_employee > 0
            ORDER BY e.full_name
        """), {"org_id": org_id, "year": year, "month": month})
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def bank_transfer_sheet(db, org_id: str, year: int, month: int) -> List[Dict[str, Any]]:
        """Bank transfer statement for bulk salary disbursement."""
        rows = db.execute(text("""
            SELECT ps.employee_id, e.full_name, e.employee_code,
                   ps.net_pay, ps.bank_name, ps.account_number, ps.ifsc_code
            FROM payroll.payroll_slips ps
            JOIN payroll.payroll_runs pr ON ps.payroll_run_id = pr.payroll_run_id
            JOIN master.employees e ON ps.employee_id = e.employee_id AND e.org_id = ps.org_id
            WHERE ps.org_id = :org_id AND pr.payroll_year = :year AND pr.payroll_month = :month
            AND ps.net_pay > 0
            ORDER BY e.full_name
        """), {"org_id": org_id, "year": year, "month": month})
        return [dict(r._mapping) for r in rows]

    @staticmethod
    def department_wise_cost(db, org_id: str, year: int, month: int) -> List[Dict[str, Any]]:
        """Department-wise payroll cost breakdown."""
        rows = db.execute(text("""
            SELECT
                COALESCE(d.department_name, 'Unassigned') as department_name,
                COUNT(DISTINCT ps.employee_id) as employee_count,
                SUM(ps.gross_earned) as total_gross,
                SUM(ps.total_deductions) as total_deductions,
                SUM(ps.net_pay) as total_net_pay,
                SUM(ps.pf_employer) as total_employer_pf,
                SUM(ps.esi_employer) as total_employer_esi,
                SUM(ps.gross_earned + ps.pf_employer + ps.esi_employer) as total_ctc
            FROM payroll.payroll_slips ps
            JOIN payroll.payroll_runs pr ON ps.payroll_run_id = pr.payroll_run_id
            JOIN master.employees e ON ps.employee_id = e.employee_id AND e.org_id = ps.org_id
            LEFT JOIN master.departments d ON e.department_id = d.department_id AND d.org_id = ps.org_id
            WHERE ps.org_id = :org_id AND pr.payroll_year = :year AND pr.payroll_month = :month
            GROUP BY d.department_name
            ORDER BY total_ctc DESC
        """), {"org_id": org_id, "year": year, "month": month})
        return [dict(r._mapping) for r in rows]
