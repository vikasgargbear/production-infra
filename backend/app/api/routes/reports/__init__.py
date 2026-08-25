"""Legacy report route package retained only for explicitly mounted reads."""

from .collection import router as collection_router
from .outstanding import router as outstanding_router

__all__ = [
    "collection_router",
    "outstanding_router",
]
