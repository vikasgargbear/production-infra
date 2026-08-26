"""
Unified Document Number Generation Service
Provides consistent document number generation across all modules

Format: PREFIX-YYYYMMDDNNNN
- PREFIX: Document type identifier (2-4 letters)
- YYYYMMDD: Date of generation
- NNNN: 4-digit sequential number per date (0001-9999)

Scoped by: document_type + org_id + date → each org gets its own 0001 per type per day
"""
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


# Document type configurations
DOCUMENT_CONFIGS = {
    "grn": {
        "prefix": "GRN",
        "table": "procurement.goods_receipt_notes",
        "column": "grn_number",
        "id_column": "grn_id"
    },
    "payment": {
        "prefix": "PAY",
        "table": "financial.payments",
        "column": "payment_number",
        "id_column": "payment_id"
    },
    "receipt": {
        "prefix": "RCT",
        "table": "financial.payments",
        "column": "payment_number",
        "id_column": "payment_id"
    },
}

class DocumentNumberService:
    """Unified service for generating document numbers"""
    
    @staticmethod
    def generate_number(db: Session, document_type: str, org_id: str) -> str:
        """
        Generate a unique document number using atomic database sequences.

        Uses INSERT ... ON CONFLICT DO UPDATE on public.document_number_sequences
        to guarantee uniqueness even under concurrent requests.

        Args:
            db: Database session
            document_type: Type of document (invoice, purchase_order, etc.)
            org_id: Organization ID used to isolate the sequence

        Returns:
            Generated document number in format PREFIX-YYYYMMDDNNNN
        """
        if not org_id:
            raise ValueError("org_id is required for document number generation")

        try:
            config = DOCUMENT_CONFIGS.get(document_type)
            if not config:
                raise ValueError(f"Unknown document type: {document_type}")

            now = datetime.now()
            date_prefix = now.strftime("%Y%m%d")  # YYYYMMDD

            # Atomic: INSERT new row or INCREMENT existing sequence in one statement
            # ON CONFLICT guarantees no race condition — PostgreSQL locks the row during UPDATE
            result = db.execute(text("""
                INSERT INTO public.document_number_sequences
                    (document_type, org_id, year_prefix, last_sequence_number, last_generated_number, created_at, updated_at)
                VALUES
                    (:doc_type, :org_id, :date_prefix, 1, :generated, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (document_type, org_id, year_prefix)
                DO UPDATE SET
                    last_sequence_number = document_number_sequences.last_sequence_number + 1,
                    last_generated_number = :prefix || '-' || :date_prefix || LPAD((document_number_sequences.last_sequence_number + 1)::text, 4, '0'),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING last_sequence_number
            """), {
                "doc_type": document_type,
                "org_id": org_id,
                "date_prefix": date_prefix,
                "prefix": config['prefix'],
                "generated": f"{config['prefix']}-{date_prefix}0001"
            })

            next_seq = result.scalar()
            document_number = f"{config['prefix']}-{date_prefix}{next_seq:04d}"

            logger.info(f"Generated {document_type} number: {document_number} (atomic)")
            return document_number

        except Exception as e:
            logger.error(f"Error generating {document_type} number: {e}")
            raise ValueError(f"Failed to generate {document_type} number: {e}")

    @staticmethod
    def validate_format(document_number: str, document_type: str) -> bool:
        """
        Validate if a document number follows the correct format
        """
        config = DOCUMENT_CONFIGS.get(document_type)
        if not config:
            return False
        
        # Expected format: PREFIX-YYYYMMDDNNNN
        parts = document_number.split('-')
        if len(parts) != 2:
            return False
        
        prefix, number_part = parts
        if prefix != config['prefix']:
            return False
        
        # Date prefix (8 digits) followed by a 4-digit daily sequence.
        if len(number_part) != 12 or not number_part.isdigit():
            return False
        
        return True
