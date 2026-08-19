"""Explicit response contracts for master-data mutation endpoints."""

from pydantic import BaseModel, ConfigDict


class MasterMutationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DepartmentCreated(MasterMutationModel):
    department_id: int
    department_name: str
    department_code: str


class DepartmentUpdated(MasterMutationModel):
    department_id: int
    department_name: str


class DepartmentCreateResponse(MasterMutationModel):
    success: bool
    data: DepartmentCreated
    message: str


class DepartmentUpdateResponse(MasterMutationModel):
    success: bool
    data: DepartmentUpdated
    message: str


class MasterDeleteResponse(MasterMutationModel):
    success: bool
    message: str


class BranchCreated(MasterMutationModel):
    branch_id: int
    branch_name: str
    branch_code: str


class BranchUpdated(MasterMutationModel):
    branch_id: int
    branch_name: str


class BranchCreateResponse(MasterMutationModel):
    success: bool
    data: BranchCreated
    message: str


class BranchUpdateResponse(MasterMutationModel):
    success: bool
    data: BranchUpdated
    message: str


class EmployeeCreated(MasterMutationModel):
    employee_id: int
    full_name: str
    employee_code: str


class EmployeeUpdated(MasterMutationModel):
    employee_id: int
    full_name: str


class EmployeeCreateResponse(MasterMutationModel):
    success: bool
    data: EmployeeCreated
    message: str


class EmployeeUpdateResponse(MasterMutationModel):
    success: bool
    data: EmployeeUpdated
    message: str
