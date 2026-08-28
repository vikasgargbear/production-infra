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
