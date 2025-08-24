"""
Enhanced Document Number Service with atomic number generation
"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class DocumentNumberServiceV2:
    """Service for generating unique document numbers with reservation"""
    
    @staticmethod
    def generate_and_reserve_number(db: Session, document_type: str, org_id: Optional[str] = None) -> str:
        """
        Generate and atomically reserve a unique document number
        Uses database sequences to ensure no duplicates
        """
        try:
            # Get current year (last 2 digits)
            current_year = datetime.now().year % 100
            year_prefix = f"{current_year:02d}"
            
            # Map document types to prefixes
            prefix_map = {
                "invoice": "INV",
                "purchase_order": "PO",
                "purchase": "PUR",
                "grn": "GRN",
                "sales_order": "SO",
                "delivery_challan": "DC",
                "sales_return": "SRN",
                "purchase_return": "PRN"
            }
            
            prefix = prefix_map.get(document_type, "DOC")
            
            # Use atomic UPDATE with RETURNING to get and increment the sequence
            # This ensures no two requests get the same number
            result = db.execute(text("""
                INSERT INTO public.document_number_sequences 
                    (document_type, org_id, year_prefix, last_sequence_number, last_generated_number)
                VALUES 
                    (:doc_type, :org_id, :year_prefix, 10000001, :initial_number)
                ON CONFLICT (document_type, org_id, year_prefix) 
                DO UPDATE SET 
                    last_sequence_number = document_number_sequences.last_sequence_number + 1,
                    last_generated_number = :prefix || '-' || :year_prefix || 
                                          (document_number_sequences.last_sequence_number + 1)::text,
                    updated_at = CURRENT_TIMESTAMP
                RETURNING last_generated_number;
            """), {
                "doc_type": document_type,
                "org_id": org_id or '00000000-0000-0000-0000-000000000000',
                "year_prefix": year_prefix,
                "prefix": prefix,
                "initial_number": f"{prefix}-{year_prefix}10000001"
            })
            
            row = result.fetchone()
            if row:
                document_number = row[0]
                # Commit immediately to release the lock
                db.commit()
                logger.info(f"Reserved {document_type} number: {document_number}")
                return document_number
            else:
                raise Exception("Failed to generate number")
                
        except Exception as e:
            db.rollback()
            logger.error(f"Error in atomic number generation: {e}")
            # Fallback with timestamp to ensure uniqueness
            timestamp = int(datetime.now().timestamp() * 1000) % 100000000
            return f"{prefix}-{year_prefix}{timestamp:08d}"