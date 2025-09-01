"""
Customer Outstanding API endpoints
Automatically syncs with invoices
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel, UUID4
from decimal import Decimal

from ...core.database import get_db
from ...core.auth import get_current_user
from ...utils.org_utils import get_org_id_from_header

router = APIRouter(prefix="/customer-outstanding", tags=["Customer Outstanding"])

class CustomerOutstandingResponse(BaseModel):
    outstanding_id: int
    customer_id: int
    customer_name: Optional[str]
    document_type: str
    document_id: int
    document_number: str
    document_date: date
    original_amount: Decimal
    outstanding_amount: Decimal
    paid_amount: Decimal
    due_date: Optional[date]
    days_overdue: int
    aging_bucket: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

@router.get("/", response_model=List[CustomerOutstandingResponse])
async def get_customer_outstanding(
    customer_id: Optional[int] = None,
    status: Optional[str] = None,
    aging_bucket: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    org_id: UUID4 = Depends(get_org_id_from_header)
):
    """Get customer outstanding records with filters"""
    
    query = """
        SELECT 
            co.*,
            c.customer_name
        FROM financial.customer_outstanding co
        LEFT JOIN parties.customers c ON c.customer_id = co.customer_id
        WHERE co.org_id = :org_id
    """
    
    params = {"org_id": str(org_id)}
    
    if customer_id:
        query += " AND co.customer_id = :customer_id"
        params["customer_id"] = customer_id
    
    if status:
        query += " AND co.status = :status"
        params["status"] = status
    
    if aging_bucket:
        query += " AND co.aging_bucket = :aging_bucket"
        params["aging_bucket"] = aging_bucket
    
    query += " ORDER BY co.days_overdue DESC, co.outstanding_amount DESC"
    
    result = db.execute(text(query), params).fetchall()
    
    return [
        CustomerOutstandingResponse(
            outstanding_id=row.outstanding_id,
            customer_id=row.customer_id,
            customer_name=row.customer_name,
            document_type=row.document_type,
            document_id=row.document_id,
            document_number=row.document_number,
            document_date=row.document_date,
            original_amount=row.original_amount,
            outstanding_amount=row.outstanding_amount,
            paid_amount=row.paid_amount,
            due_date=row.due_date,
            days_overdue=row.days_overdue,
            aging_bucket=row.aging_bucket,
            status=row.status,
            created_at=row.created_at,
            updated_at=row.updated_at
        )
        for row in result
    ]

@router.get("/summary")
async def get_outstanding_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    org_id: UUID4 = Depends(get_org_id_from_header)
):
    """Get summary of customer outstanding"""
    
    query = """
        SELECT 
            COUNT(*) as total_records,
            COUNT(DISTINCT customer_id) as total_customers,
            SUM(outstanding_amount) as total_outstanding,
            SUM(CASE WHEN status = 'open' THEN outstanding_amount ELSE 0 END) as open_amount,
            SUM(CASE WHEN status = 'partial' THEN outstanding_amount ELSE 0 END) as partial_amount,
            SUM(CASE WHEN aging_bucket = 'CURRENT' THEN outstanding_amount ELSE 0 END) as current_amount,
            SUM(CASE WHEN aging_bucket = '1-30' THEN outstanding_amount ELSE 0 END) as days_1_30,
            SUM(CASE WHEN aging_bucket = '31-60' THEN outstanding_amount ELSE 0 END) as days_31_60,
            SUM(CASE WHEN aging_bucket = '61-90' THEN outstanding_amount ELSE 0 END) as days_61_90,
            SUM(CASE WHEN aging_bucket = 'OVER_90' THEN outstanding_amount ELSE 0 END) as over_90_days
        FROM financial.customer_outstanding
        WHERE org_id = :org_id
        AND status != 'paid'
        AND document_type = 'INVOICE'
    """
    
    result = db.execute(text(query), {"org_id": str(org_id)}).fetchone()
    
    return {
        "total_records": result.total_records or 0,
        "total_customers": result.total_customers or 0,
        "total_outstanding": float(result.total_outstanding or 0),
        "open_amount": float(result.open_amount or 0),
        "partial_amount": float(result.partial_amount or 0),
        "aging": {
            "current": float(result.current_amount or 0),
            "1-30": float(result.days_1_30 or 0),
            "31-60": float(result.days_31_60 or 0),
            "61-90": float(result.days_61_90 or 0),
            "over_90": float(result.over_90_days or 0)
        }
    }

@router.post("/sync")
async def sync_outstanding(
    invoice_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    org_id: UUID4 = Depends(get_org_id_from_header)
):
    """Sync customer outstanding with invoices"""
    
    try:
        if invoice_id:
            # Sync specific invoice
            query = """
                INSERT INTO financial.customer_outstanding (
                    org_id, customer_id, document_type, document_id,
                    document_number, document_date, original_amount,
                    outstanding_amount, paid_amount, due_date, status,
                    aging_bucket, days_overdue
                )
                SELECT
                    org_id,
                    customer_id::INTEGER,
                    'INVOICE',
                    invoice_id,
                    invoice_number,
                    invoice_date,
                    final_amount,
                    COALESCE(credit_amount, final_amount - COALESCE(paid_amount, 0)),
                    COALESCE(paid_amount, 0),
                    COALESCE(due_date, invoice_date + INTERVAL '30 days'),
                    CASE 
                        WHEN COALESCE(credit_amount, 0) <= 0 THEN 'paid'
                        WHEN COALESCE(paid_amount, 0) > 0 THEN 'partial'
                        ELSE 'open'
                    END,
                    CASE
                        WHEN COALESCE(credit_amount, 0) <= 0 THEN 'PAID'
                        WHEN CURRENT_DATE <= COALESCE(due_date, invoice_date + INTERVAL '30 days') THEN 'CURRENT'
                        WHEN CURRENT_DATE <= COALESCE(due_date, invoice_date + INTERVAL '30 days') + INTERVAL '30 days' THEN '1-30'
                        WHEN CURRENT_DATE <= COALESCE(due_date, invoice_date + INTERVAL '30 days') + INTERVAL '60 days' THEN '31-60'
                        WHEN CURRENT_DATE <= COALESCE(due_date, invoice_date + INTERVAL '30 days') + INTERVAL '90 days' THEN '61-90'
                        ELSE 'OVER_90'
                    END,
                    GREATEST(0, CURRENT_DATE - COALESCE(due_date, invoice_date + INTERVAL '30 days'))::INTEGER
                FROM sales.invoices
                WHERE invoice_id = :invoice_id AND org_id = :org_id
                ON CONFLICT (org_id, document_type, document_id) 
                DO UPDATE SET
                    outstanding_amount = EXCLUDED.outstanding_amount,
                    paid_amount = EXCLUDED.paid_amount,
                    status = EXCLUDED.status,
                    aging_bucket = EXCLUDED.aging_bucket,
                    days_overdue = EXCLUDED.days_overdue,
                    updated_at = CURRENT_TIMESTAMP
            """
            db.execute(text(query), {"invoice_id": invoice_id, "org_id": str(org_id)})
        else:
            # Sync all invoices
            query = """
                INSERT INTO financial.customer_outstanding (
                    org_id, customer_id, document_type, document_id,
                    document_number, document_date, original_amount,
                    outstanding_amount, paid_amount, due_date, status,
                    aging_bucket, days_overdue
                )
                SELECT
                    i.org_id,
                    i.customer_id::INTEGER,
                    'INVOICE',
                    i.invoice_id,
                    i.invoice_number,
                    i.invoice_date,
                    i.final_amount,
                    COALESCE(i.credit_amount, i.final_amount - COALESCE(i.paid_amount, 0)),
                    COALESCE(i.paid_amount, 0),
                    COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days'),
                    CASE 
                        WHEN COALESCE(i.credit_amount, 0) <= 0 THEN 'paid'
                        WHEN COALESCE(i.paid_amount, 0) > 0 THEN 'partial'
                        ELSE 'open'
                    END,
                    CASE
                        WHEN COALESCE(i.credit_amount, 0) <= 0 THEN 'PAID'
                        WHEN CURRENT_DATE <= COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days') THEN 'CURRENT'
                        WHEN CURRENT_DATE <= COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days') + INTERVAL '30 days' THEN '1-30'
                        WHEN CURRENT_DATE <= COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days') + INTERVAL '60 days' THEN '31-60'
                        WHEN CURRENT_DATE <= COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days') + INTERVAL '90 days' THEN '61-90'
                        ELSE 'OVER_90'
                    END,
                    GREATEST(0, CURRENT_DATE - COALESCE(i.due_date, i.invoice_date + INTERVAL '30 days'))::INTEGER
                FROM sales.invoices i
                WHERE i.org_id = :org_id
                AND NOT EXISTS (
                    SELECT 1 FROM financial.customer_outstanding co
                    WHERE co.document_type = 'INVOICE' 
                    AND co.document_id = i.invoice_id
                    AND co.org_id = i.org_id
                )
                ON CONFLICT (org_id, document_type, document_id) DO NOTHING
            """
            db.execute(text(query), {"org_id": str(org_id)})
        
        db.commit()
        
        # Get count of synced records
        count_query = """
            SELECT COUNT(*) as count 
            FROM financial.customer_outstanding 
            WHERE org_id = :org_id AND document_type = 'INVOICE'
        """
        result = db.execute(text(count_query), {"org_id": str(org_id)}).fetchone()
        
        return {
            "success": True,
            "message": f"Successfully synced customer outstanding",
            "total_records": result.count
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/customer/{customer_id}")
async def get_customer_ledger(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
    org_id: UUID4 = Depends(get_org_id_from_header)
):
    """Get customer ledger with all outstanding documents"""
    
    query = """
        SELECT 
            co.*,
            c.customer_name,
            c.phone,
            c.email,
            c.credit_limit,
            c.credit_days
        FROM financial.customer_outstanding co
        JOIN parties.customers c ON c.customer_id = co.customer_id
        WHERE co.org_id = :org_id 
        AND co.customer_id = :customer_id
        AND co.status != 'paid'
        ORDER BY co.document_date DESC
    """
    
    result = db.execute(text(query), {
        "org_id": str(org_id),
        "customer_id": customer_id
    }).fetchall()
    
    if not result:
        return {
            "customer_id": customer_id,
            "outstanding_records": [],
            "total_outstanding": 0
        }
    
    customer_info = result[0] if result else None
    
    return {
        "customer_id": customer_id,
        "customer_name": customer_info.customer_name if customer_info else None,
        "phone": customer_info.phone if customer_info else None,
        "email": customer_info.email if customer_info else None,
        "credit_limit": float(customer_info.credit_limit) if customer_info and customer_info.credit_limit else None,
        "credit_days": customer_info.credit_days if customer_info else None,
        "outstanding_records": [
            {
                "document_type": row.document_type,
                "document_number": row.document_number,
                "document_date": row.document_date,
                "original_amount": float(row.original_amount),
                "paid_amount": float(row.paid_amount),
                "outstanding_amount": float(row.outstanding_amount),
                "due_date": row.due_date,
                "days_overdue": row.days_overdue,
                "aging_bucket": row.aging_bucket,
                "status": row.status
            }
            for row in result
        ],
        "total_outstanding": sum(float(row.outstanding_amount) for row in result)
    }