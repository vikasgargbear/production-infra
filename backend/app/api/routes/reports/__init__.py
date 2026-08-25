"""Legacy report route package retained only for explicitly mounted reads."""

from .outstanding import router as outstanding_router

__all__ = [
    "outstanding_router",
]
