from .salary_structure import router as salary_structure_router
from .leave_policy import router as leave_policy_router
from .attendance import router as attendance_router
from .leave import router as leave_router
from .payroll_run import router as payroll_run_router
from .salary_slips import router as salary_slips_router

__all__ = [
    'salary_structure_router',
    'leave_policy_router',
    'attendance_router',
    'leave_router',
    'payroll_run_router',
    'salary_slips_router',
]
