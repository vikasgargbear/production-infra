"""Prove exact-head readiness through the isolated PostgreSQL runtime role."""

from __future__ import annotations

import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.infrastructure.operator_actions.deployment_contract import (
    EXPECTED_CANONICAL_ALEMBIC_HEAD,
)
from app.infrastructure.operator_actions.service import (
    SqlAlchemyOperatorActionService,
)


def main() -> None:
    engine = create_engine(os.environ["DATABASE_URL"])
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql('SET SESSION AUTHORIZATION "erp_runtime"')
            connection.commit()

            current_user = connection.scalar(text("SELECT CURRENT_USER"))
            deployed_revision = connection.scalar(
                text("SELECT erp_security.deployed_canonical_revision()")
            )
            can_read_alembic = connection.scalar(
                text(
                    "SELECT has_table_privilege(CURRENT_USER, "
                    "'public.alembic_version', 'SELECT')"
                )
            )
            wrong_revision_accepted = connection.scalar(
                text(
                    "SELECT erp_security.deployed_canonical_revision()="
                    "'not-the-reviewed-head'"
                )
            )
            connection.commit()

            assert current_user == "erp_runtime"
            assert deployed_revision == EXPECTED_CANONICAL_ALEMBIC_HEAD
            assert can_read_alembic is False
            assert wrong_revision_accepted is False

            service = SqlAlchemyOperatorActionService(
                lambda: Session(bind=connection),
                runtime_principal_configured=True,
            )
            assert service.deployment_readiness() is True
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
