"""Deterministic identifiers shared by canonical demo provisioning and acceptance."""

from __future__ import annotations

from uuid import NAMESPACE_URL, UUID, uuid5


RUN_SCOPED_AUTHORITY_KEYS = (
    "reviewer_access_grant",
    "operator_access_grant",
    "agent_grant",
    "legacy_approver_agent_grant",
)


def canonical_demo_authority_ids(
    organization_id: str,
    run_id: str,
    run_attempt: str,
) -> dict[str, str]:
    """Return the exact run-scoped demo authority IDs for one organization."""

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
