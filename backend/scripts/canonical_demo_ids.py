"""Deterministic identifiers shared by canonical demo provisioning and acceptance."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from uuid import NAMESPACE_URL, UUID, uuid5


RUN_SCOPED_AUTHORITY_KEYS = (
    "reviewer_access_grant",
    "operator_access_grant",
    "agent_grant",
    "legacy_approver_agent_grant",
)


@dataclass(frozen=True)
class CanonicalLive18CycleCountAuthority:
    attachment_id: str
    storage_object_path: str
    original_filename: str
    digest_input: str
    sha256: bytes


@dataclass(frozen=True)
class CanonicalLive18DestructionAuthority:
    certificate_attachment_id: str
    certificate_storage_object_path: str
    itc_reversal_attachment_id: str
    itc_reversal_storage_object_path: str
    return_period_id: str
    gstr3b_return_id: str
    gst_registration_id: str
    itc_reversal_rule_id: str


def _validated_scope(
    organization_id: str,
    run_id: str,
    run_attempt: str,
) -> tuple[str, str, str]:
    organization_id = str(UUID(organization_id))
    for name, value in (("run_id", run_id), ("run_attempt", run_attempt)):
        if (
            not isinstance(value, str)
            or not value
            or value != value.strip()
            or len(value) > 64
            or "\n" in value
            or "\r" in value
            or ":" in value
        ):
            raise ValueError(f"canonical demo {name} is invalid")
    return organization_id, run_id, run_attempt


def canonical_live18_cycle_count_authority(
    organization_id: str,
    run_id: str,
    run_attempt: str,
) -> CanonicalLive18CycleCountAuthority:
    """Return the exact unused cycle-count evidence authority for one run."""

    organization_id, run_id, run_attempt = _validated_scope(
        organization_id, run_id, run_attempt
    )
    run_token = f"{run_id}-{run_attempt}"
    digest_input = f"canonical-live18-cycle-count:{run_token}"
    return CanonicalLive18CycleCountAuthority(
        attachment_id=str(
            uuid5(
                NAMESPACE_URL,
                (
                    "canonical-staging:live18-cycle-count-evidence:"
                    f"{organization_id}:{run_token}"
                ),
            )
        ),
        storage_object_path=(
            f"demo/{run_token}/inventory-cycle-count-sheet.json"
        ),
        original_filename=f"LIVE18-CYCLE-COUNT-{run_token}.json",
        digest_input=digest_input,
        sha256=hashlib.sha256(digest_input.encode("utf-8")).digest(),
    )


def canonical_live18_destruction_authority(
    organization_id: str,
    run_id: str,
    run_attempt: str,
    *,
    gst_registration_id: str,
    itc_reversal_rule_version: str,
) -> CanonicalLive18DestructionAuthority:
    """Return the exact destruction evidence and GST authority for one run."""

    _, run_id, run_attempt = _validated_scope(
        organization_id, run_id, run_attempt
    )
    gst_registration_id = str(UUID(gst_registration_id))
    if (
        not isinstance(itc_reversal_rule_version, str)
        or not itc_reversal_rule_version
        or itc_reversal_rule_version != itc_reversal_rule_version.strip()
    ):
        raise ValueError("canonical demo ITC reversal rule version is invalid")
    run_token = f"{run_id}-{run_attempt}"

    def fixture_id(label: str) -> str:
        return str(
            uuid5(
                NAMESPACE_URL,
                f"aasopharma-canonical-demo-ui:{run_token}:{label}",
            )
        )

    return CanonicalLive18DestructionAuthority(
        certificate_attachment_id=fixture_id(
            "destruction_certificate_evidence"
        ),
        certificate_storage_object_path=(
            f"demo/{run_token}/licensed-incineration-certificate-{run_token}.pdf"
        ),
        itc_reversal_attachment_id=fixture_id(
            "destruction_itc_reversal_evidence"
        ),
        itc_reversal_storage_object_path=(
            f"demo/{run_token}/section-17-5-h-working-{run_token}.json"
        ),
        return_period_id=fixture_id("destruction_return_period"),
        gstr3b_return_id=fixture_id("destruction_gstr3b_return"),
        gst_registration_id=gst_registration_id,
        itc_reversal_rule_id=str(
            uuid5(
                NAMESPACE_URL,
                (
                    "aasopharma-regulatory-rule:"
                    "CGST_SECTION_17_5_H_GOODS_DESTROYED:"
                    f"{itc_reversal_rule_version}"
                ),
            )
        ),
    )


def canonical_demo_authority_ids(
    organization_id: str,
    run_id: str,
    run_attempt: str,
) -> dict[str, str]:
    """Return the exact run-scoped demo authority IDs for one organization."""

    organization_id, run_id, run_attempt = _validated_scope(
        organization_id, run_id, run_attempt
    )
    return {
        key: str(
            uuid5(
                NAMESPACE_URL,
                (
                    f"canonical-staging:{key}:{organization_id}:"
                    f"{run_id}:{run_attempt}"
                ),
            )
        )
        for key in RUN_SCOPED_AUTHORITY_KEYS
    }
