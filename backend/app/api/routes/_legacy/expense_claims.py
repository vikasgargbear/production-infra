"""
Expense Claims management endpoints
Handles employee expense claims and reimbursements
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
import logging

from ...core.database import get_db
from ...core.jwt_auth import get_org_id_string  # SECURE: JWT-based auth

logger = logging.getLogger(__name__)

router = APIRouter(tags=["expense-claims"])

class ExpenseLineCreate(BaseModel):
    """Schema for expense claim line item"""
    expense_type: str = Field(..., description="Type of expense")
    description: str = Field(..., description="Expense description")
    amount: Decimal = Field(..., gt=0, description="Expense amount")
    expense_date: date = Field(..., description="Date of expense")
    receipt_attached: bool = Field(default=False)
    receipt_reference: Optional[str] = None

class ExpenseClaimCreate(BaseModel):
    """Schema for creating expense claim"""
    org_id: Optional[str] = None  # Will be provided via header
    employee_id: Optional[int] = None
    employee_name: str = Field(..., description="Employee name")
    claim_date: date = Field(default_factory=date.today)
    purpose: str = Field(..., description="Purpose of expenses")
    expenses: List[ExpenseLineCreate] = Field(..., min_items=1)
    created_by: Optional[int] = None

@router.get("/generate-claim-number")
async def generate_claim_number(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)):
    """
    Generate unique expense claim number
    
    Format: EXP-YYYY-NNNN
    """
    try:
        current_date = date.today()
        year = current_date.year
        
        # Get next sequence number atomically
        seq_query = """
            SELECT COALESCE(MAX(
                CASE 
                    WHEN claim_number ~ :pattern THEN 
                        CAST(SUBSTRING(claim_number FROM :extract_pattern) AS INTEGER)
                    ELSE 0 
                END
            ), 0) + 1 as next_number
            FROM financial.expense_claims 
            WHERE org_id = :org_id
                AND EXTRACT(YEAR FROM claim_date) = :year
                AND claim_number LIKE :like_pattern
        """
        
        pattern = f"^EXP-{year}-[0-9]+$"
        extract_pattern = f"EXP-{year}-([0-9]+)$"
        like_pattern = f"EXP-{year}-%"
        
        result = db.execute(text(seq_query), {
            "org_id": org_id,
            "year": year,
            "pattern": pattern,
            "extract_pattern": extract_pattern,
            "like_pattern": like_pattern
        }).fetchone()
        
        next_number = str(result.next_number).zfill(4)
        claim_number = f"EXP-{year}-{next_number}"
        
        return {
            "claim_number": claim_number,
            "generated_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating claim number: {str(e)}")
        # Fallback to timestamp-based generation
        timestamp = int(datetime.now().timestamp())
        fallback_number = f"EXP-{year}-{str(timestamp)[-4:]}"
        return {
            "claim_number": fallback_number,
            "generated_at": datetime.now().isoformat(),
            "fallback": True
        }

@router.get("/expense-types")
async def get_expense_types():
    """
    Get list of available expense types
    """
    return {
        "expense_types": [
            {"code": "TRAVEL", "name": "Travel"},
            {"code": "ACCOMMODATION", "name": "Accommodation"},
            {"code": "MEALS", "name": "Meals"},
            {"code": "OFFICE_SUPPLIES", "name": "Office Supplies"},
            {"code": "COMMUNICATION", "name": "Communication"},
            {"code": "MEDICAL", "name": "Medical"},
            {"code": "TRAINING", "name": "Training"},
            {"code": "FUEL", "name": "Fuel"},
            {"code": "PARKING", "name": "Parking"},
            {"code": "OTHER", "name": "Other"}
        ]
    }

@router.post("", response_model=dict)
async def create_expense_claim(
    claim: ExpenseClaimCreate,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Create a new expense claim
    
    - Generates claim number
    - Creates claim header and line items
    - Sets initial status as 'submitted'
    """
    try:
        # Generate claim number
        claim_number_response = await generate_claim_number(db)
        claim_number = claim_number_response["claim_number"]
        
        # Get or create system user for API operations
        if not claim.created_by:
            user_result = db.execute(
                text("""
                    SELECT user_id FROM master.org_users 
                    WHERE org_id = :org_id AND is_active = true
                    ORDER BY user_id
                    LIMIT 1
                """),
                {"org_id": claim.org_id}
            ).first()
            
            if user_result:
                claim.created_by = user_result.user_id
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Unable to determine user for this operation"
                )
        
        # Get or create employee if needed
        if not claim.employee_id:
            # Try to find employee by name or create one
            employee_result = db.execute(
                text("""
                    SELECT employee_id FROM master.employees 
                    WHERE employee_name ILIKE :name 
                    ORDER BY employee_id 
                    LIMIT 1
                """),
                {"name": f"%{claim.employee_name}%"}
            ).first()
            
            if employee_result:
                claim.employee_id = employee_result.employee_id
            else:
                # Create employee record
                employee_insert = db.execute(
                    text("""
                        INSERT INTO master.employees (
                            employee_code, employee_name, status
                        ) VALUES (
                            :code, :name, 'active'
                        ) RETURNING employee_id
                    """),
                    {
                        "code": f"EMP-{claim.employee_name.upper()[:3]}-{int(datetime.now().timestamp())}",
                        "name": claim.employee_name
                    }
                )
                claim.employee_id = employee_insert.scalar()
        
        # Calculate total amount
        total_amount = sum(expense.amount for expense in claim.expenses)
        
        # Insert expense claim header
        claim_query = """
            INSERT INTO financial.expense_claims (
                org_id, claim_number, employee_id, claim_date, purpose,
                total_amount, claim_status, created_by, created_at
            ) VALUES (
                :org_id, :claim_number, :employee_id, :claim_date, :purpose,
                :total_amount, 'submitted', :created_by, CURRENT_TIMESTAMP
            ) RETURNING claim_id
        """
        
        claim_result = db.execute(text(claim_query), {
            "org_id": claim.org_id,
            "claim_number": claim_number,
            "employee_id": claim.employee_id,
            "claim_date": claim.claim_date,
            "purpose": claim.purpose,
            "total_amount": total_amount,
            "created_by": claim.created_by
        })
        
        claim_id = claim_result.scalar()
        
        # Insert expense claim items
        for expense in claim.expenses:
            item_query = """
                INSERT INTO financial.expense_claim_items (
                    claim_id, expense_type, description, amount,
                    expense_date, receipt_attached, receipt_reference
                ) VALUES (
                    :claim_id, :expense_type, :description, :amount,
                    :expense_date, :receipt_attached, :receipt_reference
                )
            """
            
            db.execute(text(item_query), {
                "claim_id": claim_id,
                "expense_type": expense.expense_type,
                "description": expense.description,
                "amount": expense.amount,
                "expense_date": expense.expense_date,
                "receipt_attached": expense.receipt_attached,
                "receipt_reference": expense.receipt_reference
            })
        
        db.commit()
        
        return {
            "message": "Expense claim created successfully",
            "data": {
                "claim_id": claim_id,
                "claim_number": claim_number,
                "total_amount": float(total_amount),
                "expenses_count": len(claim.expenses),
                "status": "submitted"
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating expense claim: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create expense claim: {str(e)}")

@router.get("", response_model=dict)
async def get_expense_claims(
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filter by status"),
    employee_id: Optional[int] = Query(None, description="Filter by employee"),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Get list of expense claims with pagination and filters
    """
    try:
        query = """
            SELECT 
                ec.claim_id,
                ec.claim_number,
                ec.employee_id,
                e.employee_name,
                ec.claim_date,
                ec.purpose,
                ec.total_amount,
                ec.approved_amount,
                ec.claim_status,
                ec.created_at,
                u.username as created_by_name,
                COUNT(eci.item_id) as items_count
            FROM financial.expense_claims ec
            LEFT JOIN master.employees e ON ec.employee_id = e.employee_id
            LEFT JOIN master.org_users u ON ec.created_by = u.user_id
            LEFT JOIN financial.expense_claim_items eci ON ec.claim_id = eci.claim_id
            WHERE ec.org_id = :org_id
        """
        
        params = {
            "org_id": org_id,
            "limit": limit,
            "offset": offset
        }
        
        if status:
            query += " AND ec.claim_status = :status"
            params["status"] = status
            
        if employee_id:
            query += " AND ec.employee_id = :employee_id"
            params["employee_id"] = employee_id
            
        if from_date:
            query += " AND ec.claim_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND ec.claim_date <= :to_date"
            params["to_date"] = to_date
        
        query += """
            GROUP BY ec.claim_id, ec.claim_number, ec.employee_id, e.employee_name,
                     ec.claim_date, ec.purpose, ec.total_amount, ec.approved_amount,
                     ec.claim_status, ec.created_at, u.username
            ORDER BY ec.claim_date DESC, ec.claim_id DESC
            LIMIT :limit OFFSET :offset
        """
        
        result = db.execute(text(query), params)
        claims = [dict(row._mapping) for row in result]
        
        # Get total count
        count_query = """
            SELECT COUNT(*)
            FROM financial.expense_claims ec
            WHERE ec.org_id = :org_id
        """
        
        count_params = {"org_id": org_id}
        
        if status:
            count_query += " AND ec.claim_status = :status"
            count_params["status"] = status
            
        if employee_id:
            count_query += " AND ec.employee_id = :employee_id"
            count_params["employee_id"] = employee_id
            
        if from_date:
            count_query += " AND ec.claim_date >= :from_date"
            count_params["from_date"] = from_date
            
        if to_date:
            count_query += " AND ec.claim_date <= :to_date"
            count_params["to_date"] = to_date
        
        total_count = db.execute(text(count_query), count_params).scalar()
        
        return {
            "claims": claims,
            "total": total_count,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error getting expense claims: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve expense claims")

@router.get("/{claim_id}", response_model=dict)
async def get_expense_claim_details(
    claim_id: int,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Get detailed expense claim with all line items
    """
    try:
        # Get claim header
        header_query = """
            SELECT 
                ec.claim_id,
                ec.claim_number,
                ec.employee_id,
                e.employee_name,
                ec.claim_date,
                ec.purpose,
                ec.total_amount,
                ec.approved_amount,
                ec.claim_status,
                ec.approval_notes,
                ec.approved_by,
                ec.approved_at,
                ec.created_at,
                u.username as created_by_name
            FROM financial.expense_claims ec
            LEFT JOIN master.employees e ON ec.employee_id = e.employee_id
            LEFT JOIN master.org_users u ON ec.created_by = u.user_id
            WHERE ec.claim_id = :claim_id AND ec.org_id = :org_id
        """
        
        header_result = db.execute(text(header_query), {
            "claim_id": claim_id,
            "org_id": org_id
        }).first()
        
        if not header_result:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        
        # Get claim items
        items_query = """
            SELECT 
                eci.item_id,
                eci.expense_type,
                eci.description,
                eci.amount,
                eci.expense_date,
                eci.receipt_attached,
                eci.receipt_reference,
                eci.approved_amount
            FROM financial.expense_claim_items eci
            WHERE eci.claim_id = :claim_id
            ORDER BY eci.expense_date, eci.item_id
        """
        
        items_result = db.execute(text(items_query), {"claim_id": claim_id})
        items = [dict(row._mapping) for row in items_result]
        
        return {
            "claim": dict(header_result._mapping),
            "items": items
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting expense claim details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve expense claim details")

@router.put("/{claim_id}/approve")
async def approve_expense_claim(
    claim_id: int,
    approval_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Approve expense claim
    
    - Updates claim status to approved
    - Records approved amounts
    - Creates payment entry if needed
    """
    try:
        approved_amount = approval_data.get("approved_amount")
        approval_notes = approval_data.get("notes", "")
        
        # Check if claim exists and is in submitted status
        check_query = """
            SELECT claim_id, claim_status, total_amount 
            FROM financial.expense_claims 
            WHERE claim_id = :claim_id AND org_id = :org_id
        """
        
        claim = db.execute(text(check_query), {
            "claim_id": claim_id,
            "org_id": org_id
        }).first()
        
        if not claim:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        
        if claim.claim_status != 'submitted':
            raise HTTPException(status_code=400, detail=f"Claim is already {claim.claim_status}")
        
        # Use total amount if approved amount not specified
        if not approved_amount:
            approved_amount = claim.total_amount
        
        # Update claim status
        approve_query = """
            UPDATE financial.expense_claims
            SET claim_status = 'approved',
                approved_amount = :approved_amount,
                approval_notes = :approval_notes,
                approved_by = :approved_by,
                approved_at = CURRENT_TIMESTAMP
            WHERE claim_id = :claim_id
        """
        
        db.execute(text(approve_query), {
            "claim_id": claim_id,
            "approved_amount": approved_amount,
            "approval_notes": approval_notes,
            "approved_by": 1  # Default system user
        })
        
        db.commit()
        
        return {
            "message": "Expense claim approved successfully",
            "claim_id": claim_id,
            "approved_amount": float(approved_amount),
            "status": "approved"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error approving expense claim: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to approve expense claim")

@router.put("/{claim_id}/reject")
async def reject_expense_claim(
    claim_id: int,
    rejection_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_string)
):
    """
    Reject expense claim
    """
    try:
        rejection_notes = rejection_data.get("notes", "")
        
        # Update claim status
        reject_query = """
            UPDATE financial.expense_claims
            SET claim_status = 'rejected',
                approval_notes = :rejection_notes,
                approved_by = :approved_by,
                approved_at = CURRENT_TIMESTAMP
            WHERE claim_id = :claim_id AND org_id = :org_id
        """
        
        result = db.execute(text(reject_query), {
            "claim_id": claim_id,
            "rejection_notes": rejection_notes,
            "approved_by": 1  # Default system user
        })
        
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Expense claim not found")
        
        db.commit()
        
        return {
            "message": "Expense claim rejected successfully",
            "claim_id": claim_id,
            "status": "rejected"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error rejecting expense claim: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to reject expense claim")