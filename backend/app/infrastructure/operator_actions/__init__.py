"""Canonical SQLAlchemy adapter for the hidden operator-action boundary."""

from .registry import ACTION_ADAPTER_BINDINGS, ActionAdapterBinding
from .service import (
    SqlAlchemyOperatorActionService,
    install_sqlalchemy_operator_action_service,
)

__all__ = [
    "ACTION_ADAPTER_BINDINGS",
    "ActionAdapterBinding",
    "SqlAlchemyOperatorActionService",
    "install_sqlalchemy_operator_action_service",
]
