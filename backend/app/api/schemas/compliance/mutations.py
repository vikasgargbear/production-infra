"""Explicit response contracts for compliance mutation endpoints."""

from pydantic import BaseModel, ConfigDict


class ComplianceMutationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DrugLicenseMutationResponse(ComplianceMutationModel):
    license_id: int
    license_number: str
    message: str


class ComplianceAuditMutationResponse(ComplianceMutationModel):
    audit_id: int
    message: str
    corrective_actions_created: int


class InspectorVisitMutationResponse(ComplianceMutationModel):
    visit_id: int
    message: str
    violations_count: int
    follow_up_required: bool
