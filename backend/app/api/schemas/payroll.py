"""Explicit response contracts for payroll mutation endpoints."""

from typing import List

from pydantic import BaseModel, ConfigDict


class PayrollResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AttendanceIdentifier(PayrollResponseModel):
    attendance_id: int


class AttendanceMutationResponse(PayrollResponseModel):
    success: bool
    data: AttendanceIdentifier


class PayrollCountResponse(PayrollResponseModel):
    success: bool
    count: int
    message: str


class LeaveApplicationIdentifier(PayrollResponseModel):
    leave_application_id: int


class LeaveApplicationMutationResponse(PayrollResponseModel):
    success: bool
    data: LeaveApplicationIdentifier
    message: str


class LeavePolicyIdentifier(PayrollResponseModel):
    leave_policy_id: int


class LeavePolicyMutationResponse(PayrollResponseModel):
    success: bool
    data: LeavePolicyIdentifier
    message: str


class LeavePolicyDeleteResponse(PayrollResponseModel):
    success: bool
    message: str


class SalaryStructureCreated(PayrollResponseModel):
    salary_structure_id: int
    success: bool


class SalaryStructureUpdated(PayrollResponseModel):
    salary_structure_id: int


class SalaryStructureCreateResponse(PayrollResponseModel):
    success: bool
    data: SalaryStructureCreated
    message: str


class SalaryStructureUpdateResponse(PayrollResponseModel):
    success: bool
    data: SalaryStructureUpdated
    message: str


class PayrollSlipCalculation(PayrollResponseModel):
    employee_id: int
    employee_name: str
    employee_code: str
    working_days: int
    days_present: float
    days_absent: float
    days_leave: float
    days_holiday: float
    lop_days: float
    basic_earned: float
    hra_earned: float
    da_earned: float
    conveyance_earned: float
    medical_earned: float
    special_earned: float
    other_earned: float
    gross_earned: float
    pf_employee: float
    pf_employer: float
    esi_employee: float
    esi_employer: float
    professional_tax: float
    tds: float
    lop_deduction: float
    other_deductions: float
    total_deductions: float
    net_pay: float
    bank_name: str
    account_number: str
    ifsc_code: str


class PayrollCalculation(PayrollResponseModel):
    year: int
    month: int
    working_days: int
    total_employees: int
    total_gross: float
    total_deductions: float
    total_net_pay: float
    total_employer_pf: float
    total_employer_esi: float
    slips: List[PayrollSlipCalculation]


class PayrollCalculationResponse(PayrollResponseModel):
    success: bool
    data: PayrollCalculation


class PayrollRunGeneration(PayrollResponseModel):
    payroll_run_id: int
    run_number: str
    slips_generated: int


class PayrollRunGenerationResponse(PayrollResponseModel):
    success: bool
    data: PayrollRunGeneration
    message: str


class PayrollRunConfirmation(PayrollResponseModel):
    payroll_run_id: int
    run_number: str


class PayrollRunConfirmationResponse(PayrollResponseModel):
    success: bool
    data: PayrollRunConfirmation
    message: str
