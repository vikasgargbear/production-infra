"""Fail-closed boundary for retired standalone document numbering.

Canonical document identities are allocated inside reviewed prepare commands
from core.document_sequences. Application services must never reserve a number
outside the command preview they are about to review and execute.
"""

from typing import NoReturn


DOCUMENT_CONFIGS: dict[str, object] = {}


class CanonicalDocumentCommandRequired(RuntimeError):
    """Raised when a retired service attempts standalone number allocation."""


class DocumentNumberService:
    """Compatibility import sentinel that performs no database access."""

    @staticmethod
    def generate_number(_db: object, document_type: str, _org_id: str) -> NoReturn:
        raise CanonicalDocumentCommandRequired(
            f"{document_type or 'document'} numbers are allocated only by canonical command prepare"
        )

    @staticmethod
    def validate_format(_document_number: str, _document_type: str) -> bool:
        """Local format inference is not authoritative for canonical identities."""
        return False
