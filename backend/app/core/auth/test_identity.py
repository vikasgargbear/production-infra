"""Validated identity inputs for the explicitly enabled non-production test mode."""

from dataclasses import dataclass
import os
from uuid import UUID


class SyntheticIdentityConfigurationError(ValueError):
    """Raised when test mode has no complete, explicit synthetic identity."""


@dataclass(frozen=True)
class TestIdentity:
    organization_id: UUID
    branch_id: int
    user_id: UUID
    auth_user_id: UUID
    email: str


def _required_environment_value(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SyntheticIdentityConfigurationError(
            f"{name} is required when TEST_MODE is enabled"
        )
    return value


def required_test_identity() -> TestIdentity:
    """Load test identity facts without repository or runtime defaults."""
    try:
        organization_id = UUID(_required_environment_value("TEST_ORG_ID"))
        user_id = UUID(_required_environment_value("TEST_USER_ID"))
        auth_user_id = UUID(_required_environment_value("TEST_AUTH_USER_ID"))
        branch_id = int(_required_environment_value("TEST_BRANCH_ID"))
    except (TypeError, ValueError) as error:
        if isinstance(error, SyntheticIdentityConfigurationError):
            raise
        raise SyntheticIdentityConfigurationError(
            "TEST_ORG_ID, TEST_USER_ID and TEST_AUTH_USER_ID must be UUIDs; "
            "TEST_BRANCH_ID must be a positive integer"
        ) from error
    if branch_id <= 0:
        raise SyntheticIdentityConfigurationError(
            "TEST_BRANCH_ID must be a positive integer"
        )

    email = _required_environment_value("TEST_USER_EMAIL")
    if "@" not in email:
        raise SyntheticIdentityConfigurationError(
            "TEST_USER_EMAIL must be an email address"
        )
    return TestIdentity(
        organization_id=organization_id,
        branch_id=branch_id,
        user_id=user_id,
        auth_user_id=auth_user_id,
        email=email,
    )
