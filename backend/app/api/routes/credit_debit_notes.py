"""
Credit/Debit Note API Router
Handles financial adjustments independent of physical returns
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime
from decimal import Decimal
import uuid

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/notes", tags=["credit-debit-notes"])

@router.get("/")
async def get_notes(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    note_type: Optional[str] = Query(None, description="credit/debit"),
    party_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of credit/debit notes with optional filters
    """
    try:
        query = """
            SELECT n.*, p.party_name, p.gst_number as party_gst
            FROM financial_notes n
            LEFT JOIN parties p ON n.party_id = p.party_id
            WHERE 1=1
        """
        params = {"skip": skip, "limit": limit}
        
        if note_type:
            query += " AND n.note_type = :note_type"
            params["note_type"] = note_type
            
        if party_id:
            query += " AND n.party_id = :party_id"
            params["party_id"] = party_id
            
        if from_date:
            query += " AND n.note_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND n.note_date <= :to_date"
            params["to_date"] = to_date
            
        query += " ORDER BY n.note_date DESC, n.created_at DESC LIMIT :limit OFFSET :skip"
        
        notes = db.execute(text(query), params).fetchall()
        
        # Get total count
        count_query = """
            SELECT COUNT(*) FROM financial_notes n WHERE 1=1
        """
        if note_type:
            count_query += " AND n.note_type = :note_type"
        if party_id:
            count_query += " AND n.party_id = :party_id"
        if from_date:
            count_query += " AND n.note_date >= :from_date"
        if to_date:
            count_query += " AND n.note_date <= :to_date"
            
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total,
            "notes": [dict(note._mapping) for note in notes]
        }
        
    except Exception as e:
        logger.error(f"Error fetching notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/credit-note")
async def create_credit_note(
    note_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a credit note (reduce customer liability)
    """
    try:
        # Validate required fields
        required_fields = ["party_id", "note_date", "amount", "reason"]
        for field in required_fields:
            if field not in note_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
                
        # Validate party is a customer
        party = db.execute(
            text("SELECT * FROM parties WHERE party_id = :party_id"),
            {"party_id": note_data["party_id"]}
        ).first()
        
        if not party:
            raise HTTPException(status_code=404, detail="Party not found")
            
        if party.party_type != "customer":
            raise HTTPException(
                status_code=400, 
                detail="Credit notes can only be issued to customers"
            )
            
        note_id = str(uuid.uuid4())
        note_number = f"CN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Calculate tax if applicable
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        
        # Create note record
        db.execute(
            text("""
                INSERT INTO financial_notes (
                    note_id, org_id, note_number, note_type,
                    note_date, party_id, linked_invoice_id,
                    reason, subtotal_amount, tax_percent,
                    tax_amount, total_amount, notes, status
                ) VALUES (
                    :note_id, :org_id, :note_number, 'credit',
                    :note_date, :party_id, :linked_invoice,
                    :reason, :subtotal, :tax_percent,
                    :tax_amount, :total_amount, :notes, 'active'
                )
            """),
            {
                "note_id": note_id,
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "note_number": note_number,
                "note_date": note_data["note_date"],
                "party_id": note_data["party_id"],
                "linked_invoice": note_data.get("linked_invoice_id"),
                "reason": note_data["reason"],
                "subtotal": subtotal,
                "tax_percent": tax_percent,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "notes": note_data.get("notes", "")
            }
        )
        
        # Create ledger entry (credit reduces customer balance)
        db.execute(
            text("""
                INSERT INTO party_ledger (
                    ledger_id, org_id, party_id, transaction_date,
                    transaction_type, reference_type, reference_id,
                    debit_amount, credit_amount, description
                ) VALUES (
                    :ledger_id, :org_id, :party_id, :date,
                    'credit', 'credit_note', :note_id,
                    0, :amount, :description
                )
            """),
            {
                "ledger_id": str(uuid.uuid4()),
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "party_id": note_data["party_id"],
                "date": note_data["note_date"],
                "note_id": note_id,
                "amount": total_amount,
                "description": f"Credit Note - {note_number}: {note_data['reason']}"
            }
        )
        
        db.commit()
        
        return {
            "status": "success",
            "note_id": note_id,
            "note_number": note_number,
            "message": f"Credit note {note_number} created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating credit note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debit-note")
async def create_debit_note(
    note_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a debit note (increase customer liability or reduce supplier liability)
    """
    try:
        # Validate required fields
        required_fields = ["party_id", "note_date", "amount", "reason"]
        for field in required_fields:
            if field not in note_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
                
        # Get party details
        party = db.execute(
            text("SELECT * FROM parties WHERE party_id = :party_id"),
            {"party_id": note_data["party_id"]}
        ).first()
        
        if not party:
            raise HTTPException(status_code=404, detail="Party not found")
            
        note_id = str(uuid.uuid4())
        note_number = f"DN-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        
        # Calculate tax if applicable
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        
        # Create note record
        db.execute(
            text("""
                INSERT INTO financial_notes (
                    note_id, org_id, note_number, note_type,
                    note_date, party_id, linked_invoice_id,
                    reason, subtotal_amount, tax_percent,
                    tax_amount, total_amount, notes, status
                ) VALUES (
                    :note_id, :org_id, :note_number, 'debit',
                    :note_date, :party_id, :linked_invoice,
                    :reason, :subtotal, :tax_percent,
                    :tax_amount, :total_amount, :notes, 'active'
                )
            """),
            {
                "note_id": note_id,
                "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                "note_number": note_number,
                "note_date": note_data["note_date"],
                "party_id": note_data["party_id"],
                "linked_invoice": note_data.get("linked_invoice_id"),
                "reason": note_data["reason"],
                "subtotal": subtotal,
                "tax_percent": tax_percent,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "notes": note_data.get("notes", "")
            }
        )
        
        # Create appropriate ledger entry based on party type
        if party.party_type == "customer":
            # Debit increases customer balance
            debit_amt = total_amount
            credit_amt = Decimal("0")
            ledger_desc = f"Debit Note - {note_number}: {note_data['reason']}"
        else:  # supplier
            # Debit reduces supplier balance (we owe less)
            debit_amt = total_amount
            credit_amt = Decimal("0")
            ledger_desc = f"Debit Note - {note_number}: {note_data['reason']}"
            
            # Use supplier_ledger table for suppliers
            db.execute(
                text("""
                    INSERT INTO supplier_ledger (
                        ledger_id, org_id, supplier_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :supplier_id, :date,
                        'debit', 'debit_note', :note_id,
                        :debit, :credit, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "supplier_id": note_data["party_id"],
                    "date": note_data["note_date"],
                    "note_id": note_id,
                    "debit": debit_amt,
                    "credit": credit_amt,
                    "description": ledger_desc
                }
            )
        
        if party.party_type == "customer":
            # Create party ledger entry for customers
            db.execute(
                text("""
                    INSERT INTO party_ledger (
                        ledger_id, org_id, party_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :party_id, :date,
                        'debit', 'debit_note', :note_id,
                        :debit, :credit, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "party_id": note_data["party_id"],
                    "date": note_data["note_date"],
                    "note_id": note_id,
                    "debit": debit_amt,
                    "credit": credit_amt,
                    "description": ledger_desc
                }
            )
        
        db.commit()
        
        return {
            "status": "success",
            "note_id": note_id,
            "note_number": note_number,
            "message": f"Debit note {note_number} created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating debit note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}")
async def get_note_detail(
    note_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific note
    """
    try:
        # Get note details
        note_query = """
            SELECT n.*, p.party_name, p.party_type, p.gst_number as party_gst,
                   p.address as party_address, p.phone as party_phone,
                   s.invoice_number as linked_invoice_number
            FROM financial_notes n
            LEFT JOIN parties p ON n.party_id = p.party_id
            LEFT JOIN sales s ON n.linked_invoice_id = s.sale_id
            WHERE n.note_id = :note_id
        """
        
        note = db.execute(
            text(note_query), 
            {"note_id": note_id}
        ).first()
        
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
            
        return dict(note._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching note detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}/print")
async def get_note_print_data(
    note_id: str,
    db: Session = Depends(get_db)
):
    """
    Get note data formatted for printing
    """
    try:
        # Get organization details
        org_query = """
            SELECT * FROM organizations 
            WHERE org_id = '12de5e22-eee7-4d25-b3a7-d16d01c6170f'
        """
        organization = db.execute(text(org_query)).first()
        
        # Get note with all details
        note_data = await get_note_detail(note_id, db)
        
        # Format for printing
        print_data = {
            "organization": dict(organization._mapping) if organization else {},
            "note": note_data,
            "print_date": datetime.now().isoformat(),
            "document_type": "CREDIT NOTE" if note_data["note_type"] == "credit" else "DEBIT NOTE"
        }
        
        return print_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting print data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{note_id}")
async def cancel_note(
    note_id: str,
    cancellation_reason: str,
    db: Session = Depends(get_db)
):
    """
    Cancel a credit/debit note
    """
    try:
        # Check if note exists
        note = db.execute(
            text("SELECT * FROM financial_notes WHERE note_id = :note_id"),
            {"note_id": note_id}
        ).first()
        
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
            
        if note.status == "cancelled":
            raise HTTPException(status_code=400, detail="Note already cancelled")
            
        # Update note status
        db.execute(
            text("""
                UPDATE financial_notes 
                SET status = 'cancelled',
                    cancellation_reason = :reason,
                    cancelled_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE note_id = :note_id
            """),
            {
                "note_id": note_id,
                "reason": cancellation_reason
            }
        )
        
        # Reverse ledger entry
        if note.note_type == "credit":
            # Reverse credit note - debit the customer
            db.execute(
                text("""
                    INSERT INTO party_ledger (
                        ledger_id, org_id, party_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :party_id, CURRENT_DATE,
                        'debit', 'credit_note_reversal', :note_id,
                        :amount, 0, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                    "party_id": note.party_id,
                    "note_id": note_id,
                    "amount": note.total_amount,
                    "description": f"Credit Note Reversal - {note.note_number}"
                }
            )
        else:  # debit note
            # Check party type
            party = db.execute(
                text("SELECT party_type FROM parties WHERE party_id = :party_id"),
                {"party_id": note.party_id}
            ).first()
            
            if party.party_type == "customer":
                # Reverse debit note for customer - credit them
                db.execute(
                    text("""
                        INSERT INTO party_ledger (
                            ledger_id, org_id, party_id, transaction_date,
                            transaction_type, reference_type, reference_id,
                            debit_amount, credit_amount, description
                        ) VALUES (
                            :ledger_id, :org_id, :party_id, CURRENT_DATE,
                            'credit', 'debit_note_reversal', :note_id,
                            0, :amount, :description
                        )
                    """),
                    {
                        "ledger_id": str(uuid.uuid4()),
                        "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                        "party_id": note.party_id,
                        "note_id": note_id,
                        "amount": note.total_amount,
                        "description": f"Debit Note Reversal - {note.note_number}"
                    }
                )
            else:  # supplier
                # Reverse debit note for supplier
                db.execute(
                    text("""
                        INSERT INTO supplier_ledger (
                            ledger_id, org_id, supplier_id, transaction_date,
                            transaction_type, reference_type, reference_id,
                            debit_amount, credit_amount, description
                        ) VALUES (
                            :ledger_id, :org_id, :supplier_id, CURRENT_DATE,
                            'credit', 'debit_note_reversal', :note_id,
                            0, :amount, :description
                        )
                    """),
                    {
                        "ledger_id": str(uuid.uuid4()),
                        "org_id": "12de5e22-eee7-4d25-b3a7-d16d01c6170f",
                        "supplier_id": note.party_id,
                        "note_id": note_id,
                        "amount": note.total_amount,
                        "description": f"Debit Note Reversal - {note.note_number}"
                    }
                )
        
        db.commit()
        
        return {
            "status": "success",
            "message": f"{note.note_type.title()} note {note.note_number} cancelled successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reasons/list")
async def get_predefined_reasons():
    """
    Get predefined reasons for credit/debit notes
    """
    return {
        "credit_note_reasons": [
            {"value": "discount", "label": "Additional Discount"},
            {"value": "price_adjustment", "label": "Price Adjustment"},
            {"value": "overcharge", "label": "Overcharge Correction"},
            {"value": "quality_issue", "label": "Quality Issue"},
            {"value": "goodwill", "label": "Goodwill Gesture"},
            {"value": "promotional", "label": "Promotional Credit"},
            {"value": "other", "label": "Other"}
        ],
        "debit_note_reasons": [
            {"value": "undercharge", "label": "Undercharge Correction"},
            {"value": "late_payment", "label": "Late Payment Charges"},
            {"value": "service_charge", "label": "Additional Service Charge"},
            {"value": "price_increase", "label": "Price Increase Adjustment"},
            {"value": "penalty", "label": "Penalty Charges"},
            {"value": "other", "label": "Other"}
        ]
    }

@router.get("/linked-invoices/{party_id}")
async def get_party_invoices_for_linking(
    party_id: str,
    invoice_type: str = Query("sales", description="sales/purchase"),
    db: Session = Depends(get_db)
):
    """
    Get invoices for a party that can be linked to notes
    """
    try:
        if invoice_type == "sales":
            query = """
                SELECT 
                    sale_id as invoice_id,
                    invoice_number,
                    sale_date as invoice_date,
                    grand_total
                FROM sales
                WHERE party_id = :party_id
                AND sale_status = 'completed'
                ORDER BY sale_date DESC
                LIMIT 50
            """
        else:  # purchase
            query = """
                SELECT 
                    purchase_id as invoice_id,
                    supplier_invoice_number as invoice_number,
                    supplier_invoice_date as invoice_date,
                    final_amount as grand_total
                FROM purchases
                WHERE supplier_id = :party_id
                AND purchase_status IN ('received', 'completed')
                ORDER BY purchase_date DESC
                LIMIT 50
            """
            
        invoices = db.execute(
            text(query),
            {"party_id": party_id}
        ).fetchall()
        
        return {
            "party_id": party_id,
            "invoice_type": invoice_type,
            "invoices": [dict(inv._mapping) for inv in invoices]
        }
        
    except Exception as e:
        logger.error(f"Error fetching party invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))