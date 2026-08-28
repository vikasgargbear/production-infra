"""Explicit response contracts for compliance mutation endpoints."""

from pydantic import BaseModel, ConfigDict


class ComplianceMutationModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DrugLicenseMutationResponse(ComplianceMutationModel):
    license_id: int
    license_number: str
    message: str
