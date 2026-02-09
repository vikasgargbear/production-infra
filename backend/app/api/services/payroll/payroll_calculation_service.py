"""
Payroll Calculation Service
Core payroll engine for Indian pharma SMEs

Calculations:
- Prorate earnings by attendance
- PF: 12% of min(basic, 15000) — Indian PF ceiling
- ESI: 0.75% employee + 3.25% employer if gross ≤ 21000
- Professional Tax: Maharashtra slabs
- LOP deduction: proportional to absent days without leave
"""
from typing import List, Dict, Any, Optional
from sqlalchemy import text
from datetime import date
import calendar
import logging

from ....core.utils.constants import PayrollDefaults

logger = logging.getLogger(__name__)


class PayrollCalculationService:

    @staticmethod
    def calculate_payroll(
        db, org_id: str, year: int, month: int, processed_by: Optional[int] = None
    ) -> Dict[str, Any]:
        """Calculate payroll for all active employees for a given month.
        Returns payroll run summary + per-employee breakdowns."""

        # Get working days in month
        _, days_in_month = calendar.monthrange(year, month)
        working_days = PayrollDefaults.DEFAULT_WORKING_DAYS

        # Get all active salary structures
        structures = db.execute(text("""
            SELECT ss.*, e.full_name, e.employee_code, e.gender,
                   e.bank_account_details
            FROM payroll.salary_structures ss
            JOIN master.employees e ON ss.employee_id = e.employee_id AND e.org_id = ss.org_id
            WHERE ss.org_id = :org_id AND ss.is_active = true
            AND e.employment_status = 'active'
        """), {"org_id": org_id})

        employees = [dict(r._mapping) for r in structures]
        if not employees:
            return {"error": "No active salary structures found", "slips": []}

        slips = []
        total_gross = 0
        total_deductions = 0
        total_net = 0
        total_employer_pf = 0
        total_employer_esi = 0

        for emp in employees:
            slip = PayrollCalculationService._calculate_employee_slip(
                db, org_id, emp, year, month, working_days
            )
            slips.append(slip)
            total_gross += slip["gross_earned"]
            total_deductions += slip["total_deductions"]
            total_net += slip["net_pay"]
            total_employer_pf += slip["pf_employer"]
            total_employer_esi += slip["esi_employer"]

        return {
            "year": year,
            "month": month,
            "working_days": working_days,
            "total_employees": len(slips),
            "total_gross": round(total_gross, 2),
            "total_deductions": round(total_deductions, 2),
            "total_net_pay": round(total_net, 2),
            "total_employer_pf": round(total_employer_pf, 2),
            "total_employer_esi": round(total_employer_esi, 2),
            "slips": slips
        }

    @staticmethod
    def _calculate_employee_slip(
        db, org_id: str, emp: Dict[str, Any],
        year: int, month: int, working_days: int
    ) -> Dict[str, Any]:
        """Calculate one employee's payslip."""
        employee_id = emp["employee_id"]

        # Get attendance summary
        att = db.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'present') as present,
                COUNT(*) FILTER (WHERE status = 'half_day') as half_days,
                COUNT(*) FILTER (WHERE status = 'absent') as absent,
                COUNT(*) FILTER (WHERE status = 'leave') as on_leave,
                COUNT(*) FILTER (WHERE status = 'holiday') as holidays,
                COUNT(*) FILTER (WHERE status = 'week_off') as week_offs
            FROM payroll.attendance
            WHERE org_id = :org_id AND employee_id = :eid
            AND EXTRACT(YEAR FROM attendance_date) = :year
            AND EXTRACT(MONTH FROM attendance_date) = :month
        """), {"org_id": org_id, "eid": employee_id, "year": year, "month": month}).first()

        att = dict(att._mapping) if att else {}
        days_present = float(att.get("present", 0)) + float(att.get("half_days", 0)) * 0.5
        days_absent = float(att.get("absent", 0))
        days_leave = float(att.get("on_leave", 0))
        days_holiday = float(att.get("holidays", 0))
        days_week_off = float(att.get("week_offs", 0))

        # LOP = absent days without approved leave
        lop_days = days_absent

        # Payable days = working_days - lop_days
        payable_days = working_days - lop_days
        prorate = payable_days / working_days if working_days > 0 else 1

        # Prorate earnings
        basic_earned = round(float(emp["basic_salary"]) * prorate, 2)
        hra_earned = round(float(emp["hra"]) * prorate, 2)
        da_earned = round(float(emp["dearness_allowance"]) * prorate, 2)
        conv_earned = round(float(emp["conveyance_allowance"]) * prorate, 2)
        med_earned = round(float(emp["medical_allowance"]) * prorate, 2)
        special_earned = round(float(emp["special_allowance"]) * prorate, 2)
        other_earned = round(float(emp["other_allowance"]) * prorate, 2)
        gross_earned = basic_earned + hra_earned + da_earned + conv_earned + med_earned + special_earned + other_earned

        # LOP deduction
        lop_deduction = round(float(emp.get("gross_salary", 0)) * (lop_days / working_days), 2) if lop_days > 0 else 0

        # PF calculation
        pf_employee = 0.0
        pf_employer = 0.0
        if emp.get("pf_applicable"):
            pf_base = min(basic_earned, PayrollDefaults.PF_CEILING_BASIC)
            pf_employee = round(pf_base * PayrollDefaults.PF_EMPLOYEE_PERCENT / 100, 2)
            pf_employer = round(pf_base * PayrollDefaults.PF_EMPLOYER_PERCENT / 100, 2)

        # ESI calculation
        esi_employee = 0.0
        esi_employer = 0.0
        if emp.get("esi_applicable") and gross_earned <= PayrollDefaults.ESI_CEILING_GROSS:
            esi_employee = round(gross_earned * PayrollDefaults.ESI_EMPLOYEE_PERCENT / 100, 2)
            esi_employer = round(gross_earned * PayrollDefaults.ESI_EMPLOYER_PERCENT / 100, 2)

        # Professional Tax (Maharashtra slabs)
        professional_tax = 0.0
        if emp.get("professional_tax_applicable"):
            gender = (emp.get("gender") or "male").lower()
            slabs = PayrollDefaults.PT_SLAB_FEMALE if gender == "female" else PayrollDefaults.PT_SLAB_MALE
            for low, high, tax in slabs:
                if low <= gross_earned <= high:
                    professional_tax = tax
                    break

        total_deductions = pf_employee + esi_employee + professional_tax + lop_deduction
        net_pay = round(gross_earned - total_deductions, 2)

        # Extract bank details
        bank_details = emp.get("bank_account_details") or {}
        if isinstance(bank_details, str):
            import json
            try:
                bank_details = json.loads(bank_details)
            except (json.JSONDecodeError, TypeError):
                bank_details = {}

        return {
            "employee_id": employee_id,
            "employee_name": emp.get("full_name", ""),
            "employee_code": emp.get("employee_code", ""),
            "working_days": working_days,
            "days_present": days_present,
            "days_absent": days_absent,
            "days_leave": days_leave,
            "days_holiday": days_holiday,
            "lop_days": lop_days,
            "basic_earned": basic_earned,
            "hra_earned": hra_earned,
            "da_earned": da_earned,
            "conveyance_earned": conv_earned,
            "medical_earned": med_earned,
            "special_earned": special_earned,
            "other_earned": other_earned,
            "gross_earned": round(gross_earned, 2),
            "pf_employee": pf_employee,
            "pf_employer": pf_employer,
            "esi_employee": esi_employee,
            "esi_employer": esi_employer,
            "professional_tax": professional_tax,
            "tds": 0,
            "lop_deduction": lop_deduction,
            "other_deductions": 0,
            "total_deductions": round(total_deductions, 2),
            "net_pay": net_pay,
            "bank_name": bank_details.get("bank_name", ""),
            "account_number": bank_details.get("account_number", ""),
            "ifsc_code": bank_details.get("ifsc_code", ""),
        }
