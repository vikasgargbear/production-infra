"""Exact boundary between canonical tax evidence and a licensed NIC/GSP adapter.

The application never translates NIC or GSP payloads. A separately deployed,
officially conformance-tested adapter consumes immutable canonical request bytes
and returns the unmodified provider response plus normalized authority evidence.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


ArtifactKind = Literal["einvoice", "eway_bill"]
AdapterName = Literal[
    "nic_irp_v1",
    "licensed_gsp_irp_v1",
    "nic_eway_v1",
    "licensed_gsp_eway_v1",
]
SHA256_PATTERN = r"^[0-9a-f]{64}$"
MEDIA_TYPE_PATTERN = r"^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}(?:;[ -~]{1,256})?$"
VERSION_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$"
IDENTIFIER_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,254}$"
MAX_EVIDENCE_BYTES = 4 * 1024 * 1024


class StrictDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


def decode_evidence(value: str, field_name: str) -> bytes:
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError(f"{field_name} must be canonical base64") from exc
    if not decoded:
        raise ValueError(f"{field_name} must not be empty")
    if len(decoded) > MAX_EVIDENCE_BYTES:
        raise ValueError(f"{field_name} exceeds {MAX_EVIDENCE_BYTES} bytes")
    if base64.b64encode(decoded).decode("ascii") != value:
        raise ValueError(f"{field_name} must use canonical padded base64")
    return decoded


class AdapterVerification(StrictDTO):
    adapter_contract_version: Literal["1.0.0"]
    official_schema_version: str = Field(pattern=VERSION_PATTERN)
    response_validation_status: Literal["validated"]
    conformance_profile_sha256: str = Field(pattern=SHA256_PATTERN)


class ProviderRequestFetchRequest(StrictDTO):
    contract_version: Literal["1.0.0"]
    worker_request_id: UUID
    organization_id: UUID
    artifact_id: UUID
    artifact_kind: ArtifactKind


class ProviderRequestFetchResponse(StrictDTO):
    contract_version: Literal["1.0.0"] = "1.0.0"
    organization_id: UUID
    artifact_id: UUID
    artifact_kind: ArtifactKind
    request_media_type: str = Field(max_length=128, pattern=MEDIA_TYPE_PATTERN)
    request_base64: str
    request_sha256: str = Field(pattern=SHA256_PATTERN)
    adapter_name: AdapterName
    provider_request_id: str = Field(max_length=128, pattern=IDENTIFIER_PATTERN)

    @model_validator(mode="after")
    def request_hash_matches_bytes(self):
        request_bytes = decode_evidence(self.request_base64, "request_base64")
        if hashlib.sha256(request_bytes).hexdigest() != self.request_sha256:
            raise ValueError("request_sha256 does not match request_base64")
        if self.artifact_kind == "einvoice" and self.adapter_name not in {
            "nic_irp_v1", "licensed_gsp_irp_v1"
        }:
            raise ValueError("e-invoice request uses an incompatible adapter")
        if self.artifact_kind == "eway_bill" and self.adapter_name not in {
            "nic_eway_v1", "licensed_gsp_eway_v1"
        }:
            raise ValueError("e-way bill request uses an incompatible adapter")
        return self


class ProviderCompletionRequest(StrictDTO):
    contract_version: Literal["1.0.0"]
    worker_request_id: UUID
    organization_id: UUID
    artifact_id: UUID
    artifact_kind: ArtifactKind
    adapter_name: AdapterName
    provider_request_id: str = Field(max_length=128, pattern=IDENTIFIER_PATTERN)
    canonical_request_sha256: str = Field(pattern=SHA256_PATTERN)
    verification: AdapterVerification
    outcome: Literal["generated", "failed", "cancelled", "expired"]
    response_media_type: str = Field(max_length=128, pattern=MEDIA_TYPE_PATTERN)
    response_base64: str
    response_sha256: str = Field(pattern=SHA256_PATTERN)

    irn: Optional[str] = Field(default=None, max_length=128, pattern=IDENTIFIER_PATTERN)
    acknowledgement_number: Optional[str] = Field(
        default=None, max_length=64, pattern=IDENTIFIER_PATTERN
    )
    acknowledged_at: Optional[datetime] = None
    signed_qr_base64: Optional[str] = None
    signed_qr_sha256: Optional[str] = Field(default=None, pattern=SHA256_PATTERN)

    eway_bill_number: Optional[str] = Field(
        default=None, max_length=64, pattern=IDENTIFIER_PATTERN
    )
    transport_mode: Optional[
        Literal["road", "rail", "air", "ship", "multimodal", "in_person"]
    ] = None
    vehicle_number: Optional[str] = Field(
        default=None, max_length=20, pattern=IDENTIFIER_PATTERN
    )
    transporter_id: Optional[str] = Field(
        default=None, max_length=32, pattern=IDENTIFIER_PATTERN
    )
    valid_from_at: Optional[datetime] = None
    valid_until_at: Optional[datetime] = None

    @model_validator(mode="after")
    def evidence_is_exact_for_outcome(self):
        response_bytes = decode_evidence(self.response_base64, "response_base64")
        if hashlib.sha256(response_bytes).hexdigest() != self.response_sha256:
            raise ValueError("response_sha256 does not match response_base64")

        einvoice_fields = (
            self.irn,
            self.acknowledgement_number,
            self.acknowledged_at,
            self.signed_qr_base64,
            self.signed_qr_sha256,
        )
        eway_fields = (
            self.eway_bill_number,
            self.transport_mode,
            self.vehicle_number,
            self.transporter_id,
            self.valid_from_at,
            self.valid_until_at,
        )
        if self.artifact_kind == "einvoice":
            if self.adapter_name not in {"nic_irp_v1", "licensed_gsp_irp_v1"}:
                raise ValueError("e-invoice completion uses an incompatible adapter")
            if self.outcome == "expired":
                raise ValueError("e-invoice outcome cannot be expired")
            if any(value is not None for value in eway_fields):
                raise ValueError("e-invoice completion must not contain e-way authority fields")
            if self.outcome == "generated":
                if any(value is None for value in einvoice_fields):
                    raise ValueError("generated e-invoice requires complete IRN authority evidence")
                signed_qr = decode_evidence(self.signed_qr_base64 or "", "signed_qr_base64")
                if hashlib.sha256(signed_qr).hexdigest() != self.signed_qr_sha256:
                    raise ValueError("signed_qr_sha256 does not match signed_qr_base64")
                if self.acknowledged_at and self.acknowledged_at.tzinfo is None:
                    raise ValueError("acknowledged_at must include a timezone")
            elif any(value is not None for value in einvoice_fields):
                raise ValueError("non-generated e-invoice must not assert authority evidence")
        else:
            if self.adapter_name not in {"nic_eway_v1", "licensed_gsp_eway_v1"}:
                raise ValueError("e-way bill completion uses an incompatible adapter")
            if any(value is not None for value in einvoice_fields):
                raise ValueError("e-way bill completion must not contain IRN authority fields")
            if self.outcome == "generated":
                if (
                    self.eway_bill_number is None
                    or self.transport_mode is None
                    or self.valid_from_at is None
                    or self.valid_until_at is None
                ):
                    raise ValueError(
                        "generated e-way bill requires number, transport mode, and validity evidence"
                    )
                if self.valid_from_at.tzinfo is None or self.valid_until_at.tzinfo is None:
                    raise ValueError("e-way validity timestamps must include a timezone")
                if self.valid_until_at <= self.valid_from_at:
                    raise ValueError("e-way validity end must be after its start")
            elif any(value is not None for value in eway_fields):
                raise ValueError("non-generated e-way bill must not assert authority evidence")
        return self


class ProviderCompletionResponse(StrictDTO):
    contract_version: Literal["1.0.0"] = "1.0.0"
    organization_id: UUID
    artifact_id: UUID
    artifact_kind: ArtifactKind
    outcome: Literal["generated", "failed", "cancelled", "expired"]
    response_sha256: str = Field(pattern=SHA256_PATTERN)
    committed: Literal[True] = True
