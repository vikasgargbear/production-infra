"""
GRN (Goods Receipt Note) Service
Business logic for receiving goods against purchase orders
Uses GRNRepository for data access - follows sales module pattern
"""
from typing import Optional, Dict, Any, List
from datetime import date
from sqlalchemy.orm import Session
import logging

from .grn_repository import GRNRepository
from ..calculations import PurchaseCalculator
from ...document_number_service import DocumentNumberService
from .....core.utils.constants import GRNStatus

logger = logging.getLogger(__name__)


class GRNService:
    """
    Service class for GRN-related business logic.
    Uses GRNRepository for all data access.
    Centralizes all GRN operations - routes should call these methods.
    """
    
    @staticmethod
    def generate_grn_number(db: Session, org_id: str) -> str:
        """Generate GRN number using DocumentNumberService."""
        return DocumentNumberService.generate_number(db, "grn", org_id)
    
    @staticmethod
    def create_grn(
        db: Session,
        org_id: str,
        branch_id: int,
        grn_data: Dict[str, Any],
        user_id: int
    ) -> Dict[str, Any]:
        """
        Create a Goods Receipt Note with items.
        
        Args:
            db: Database session
            org_id: Organization ID
            branch_id: Branch ID
            grn_data: GRN data including items
            user_id: User creating the GRN
            
        Returns:
            Dict with grn_id, grn_number, and status
        """
        try:
            # Generate GRN number if not provided
            grn_number = grn_data.get("grn_number") or grn_data.get("grn_no")
            if not grn_number:
                grn_number = GRNService.generate_grn_number(db, org_id)
            
            # Set GRN number in data
            grn_data["grn_number"] = grn_number
            grn_data["grn_status"] = GRNStatus.CREATED.value if hasattr(GRNStatus, 'CREATED') else "created"
            
            # Create GRN header via repository
            grn_id = GRNRepository.create_grn_header(
                db, org_id, branch_id, grn_data, user_id
            )
            
            # Insert GRN items
            items = grn_data.get("items", [])
            items_created = 0
            
            for idx, item in enumerate(items):
                GRNRepository.create_grn_item(db, grn_id, item, idx + 1)
                items_created += 1
            
            # If QC not required, update inventory immediately
            batches_created = 0
            if not grn_data.get("qc_required", False):
                batches_created = GRNService._update_inventory(
                    db, org_id, grn_id, grn_data.get("supplier_id"), items
                )
                
                # Mark stock as updated
                GRNRepository.update_grn_stock_status(db, grn_id, True)
            
            logger.info(f"Created GRN {grn_number} (ID: {grn_id}) with {items_created} items")
            
            return {
                "grn_id": grn_id,
                "grn_number": grn_number,
                "items_created": items_created,
                "batches_created": batches_created,
                "stock_updated": not grn_data.get("qc_required", False)
            }
            
        except Exception as e:
            logger.error(f"Error creating GRN: {str(e)}")
            raise
    
    @staticmethod
    def _update_inventory(
        db: Session,
        org_id: str,
        grn_id: int,
        supplier_id: Optional[int],
        items: List[Dict[str, Any]]
    ) -> int:
        """
        Create/update inventory batches from GRN items.
        Business logic wrapper around repository batch creation.
        """
        batches_created = 0
        
        for item in items:
            quantity = item.get("quantity") or item.get("received_quantity") or 0
            if quantity <= 0:
                continue
            
            GRNRepository.create_inventory_batch(
                db, org_id, grn_id, supplier_id, item, quantity
            )
            batches_created += 1
        
        return batches_created
    
    @staticmethod
    def get_grn_by_id(db: Session, grn_id: int, org_id: str) -> Optional[Dict[str, Any]]:
        """Get GRN details by ID."""
        return GRNRepository.get_grn_by_id(db, grn_id, org_id)
    
    @staticmethod
    def get_grn_items(db: Session, grn_id: int) -> List[Dict[str, Any]]:
        """Get all items for a GRN."""
        return GRNRepository.get_grn_items(db, grn_id)
    
    @staticmethod
    def approve_grn(
        db: Session,
        grn_id: int,
        org_id: str,
        user_id: int,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Approve a GRN and update inventory if not already done.
        
        Args:
            db: Database session
            grn_id: GRN ID to approve
            org_id: Organization ID
            user_id: Approving user ID
            notes: Approval notes
            
        Returns:
            Dict with approval status
        """
        # Get GRN
        grn = GRNRepository.get_grn_by_id(db, grn_id, org_id)
        if not grn:
            raise ValueError(f"GRN {grn_id} not found")
        
        if grn.get("approval_status") == "approved":
            return {"message": "GRN already approved", "grn_id": grn_id}
        
        # Update inventory if not already done
        batches_created = 0
        if not grn.get("stock_updated"):
            items = GRNRepository.get_grn_items(db, grn_id)
            batches_created = GRNService._update_inventory(
                db, org_id, grn_id, grn.get("supplier_id"), items
            )
        
        # Update GRN status via repository
        GRNRepository.approve_grn_record(db, grn_id, user_id, notes)
        
        logger.info(f"Approved GRN {grn_id}, created {batches_created} batches")
        
        return {
            "message": "GRN approved successfully",
            "grn_id": grn_id,
            "batches_created": batches_created
        }
