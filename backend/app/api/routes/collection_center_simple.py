"""
Collection Center API Router
Manages receivables collection and payment reminders with click-based approach
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
from datetime import datetime, date, timedelta
from decimal import Decimal
import json
import urllib.parse

from ...database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/collection-center", tags=["collection-center"])

@router.get("/dashboard")
async def get_collection_dashboard(
    org_id: str = Query(default="12de5e22-eee7-4d25-b3a7-d16d01c6170f"),
    db: Session = Depends(get_db)
):
    """
    Get collection dashboard metrics
    """
    try:
        # Get customer outstanding metrics
        customer_metrics = db.execute(
            text("""
                SELECT 
                    COUNT(DISTINCT customer_id) as total_customers,
                    SUM(outstanding_amount) as total_outstanding,
                    AVG(days_overdue) as avg_days_overdue,
                    COUNT(CASE WHEN days_overdue <= 30 THEN 1 END) as current_count,
                    COUNT(CASE WHEN days_overdue > 30 AND days_overdue <= 60 THEN 1 END) as overdue_30_count,
                    COUNT(CASE WHEN days_overdue > 60 AND days_overdue <= 90 THEN 1 END) as overdue_60_count,
                    COUNT(CASE WHEN days_overdue > 90 THEN 1 END) as overdue_90_count
                FROM customer_outstanding
                WHERE org_id = :org_id AND status = 'outstanding'
            """),
            {"org_id": org_id}
        ).first()
        
        # Get supplier outstanding metrics
        supplier_metrics = db.execute(
            text("""
                SELECT 
                    COUNT(DISTINCT supplier_id) as total_suppliers,
                    SUM(outstanding_amount) as total_outstanding,
                    AVG(days_overdue) as avg_days_overdue
                FROM supplier_outstanding
                WHERE org_id = :org_id AND status = 'outstanding'
            """),
            {"org_id": org_id}
        ).first()
        
        # Get today's collections
        today_collections = db.execute(
            text("""
                SELECT 
                    COUNT(*) as count,
                    COALESCE(SUM(payment_amount), 0) as amount
                FROM payment_collections
                WHERE org_id = :org_id 
                AND DATE(payment_date) = :today
            """),
            {"org_id": org_id, "today": date.today()}
        ).first()
        
        # Get collection trends (last 7 days)
        trends = db.execute(
            text("""
                SELECT 
                    DATE(payment_date) as collection_date,
                    COUNT(*) as count,
                    SUM(payment_amount) as amount
                FROM payment_collections
                WHERE org_id = :org_id 
                AND payment_date >= :start_date
                GROUP BY DATE(payment_date)
                ORDER BY collection_date
            """),
            {
                "org_id": org_id,
                "start_date": date.today() - timedelta(days=7)
            }
        ).fetchall()
        
        return {
            "customer_metrics": {
                "total_customers": customer_metrics.total_customers or 0,
                "total_outstanding": float(customer_metrics.total_outstanding or 0),
                "avg_days_overdue": float(customer_metrics.avg_days_overdue or 0),
                "aging": {
                    "current": customer_metrics.current_count or 0,
                    "30_days": customer_metrics.overdue_30_count or 0,
                    "60_days": customer_metrics.overdue_60_count or 0,
                    "90_plus_days": customer_metrics.overdue_90_count or 0
                }
            },
            "supplier_metrics": {
                "total_suppliers": supplier_metrics.total_suppliers or 0,
                "total_outstanding": float(supplier_metrics.total_outstanding or 0),
                "avg_days_overdue": float(supplier_metrics.avg_days_overdue or 0)
            },
            "today_collections": {
                "count": today_collections.count,
                "amount": float(today_collections.amount)
            },
            "collection_trends": [
                {
                    "date": str(trend.collection_date),
                    "count": trend.count,
                    "amount": float(trend.amount)
                } for trend in trends
            ]
        }
        
    except Exception as e:
        logger.error(f"Error fetching collection dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/outstanding")
async def get_outstanding_list(
    party_type: str = Query(..., regex="^(customer|supplier)$"),
    aging_bucket: Optional[str] = None,
    min_amount: Optional[float] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    Get list of outstanding receivables/payables
    """
    try:
        if party_type == "customer":
            query = """
                SELECT 
                    o.*,
                    c.customer_name as party_name,
                    c.phone,
                    c.email
                FROM customer_outstanding o
                JOIN customers c ON o.customer_id = c.customer_id
                WHERE o.status = 'outstanding'
            """
            
            if search:
                query += """
                    AND (c.customer_name ILIKE :search 
                    OR o.invoice_number ILIKE :search)
                """
                
        else:  # supplier
            query = """
                SELECT 
                    o.*,
                    s.supplier_name as party_name,
                    s.phone,
                    s.email
                FROM supplier_outstanding o
                JOIN suppliers s ON o.supplier_id = s.supplier_id
                WHERE o.status = 'outstanding'
            """
            
            if search:
                query += """
                    AND (s.supplier_name ILIKE :search 
                    OR o.bill_number ILIKE :search)
                """
        
        # Apply filters
        params = {"skip": skip, "limit": limit}
        
        if search:
            params["search"] = f"%{search}%"
            
        if min_amount:
            query += " AND o.outstanding_amount >= :min_amount"
            params["min_amount"] = min_amount
            
        if aging_bucket:
            if aging_bucket == "current":
                query += " AND o.days_overdue <= 30"
            elif aging_bucket == "30-60":
                query += " AND o.days_overdue > 30 AND o.days_overdue <= 60"
            elif aging_bucket == "61-90":
                query += " AND o.days_overdue > 60 AND o.days_overdue <= 90"
            elif aging_bucket == "90+":
                query += " AND o.days_overdue > 90"
                
        query += " ORDER BY o.days_overdue DESC, o.outstanding_amount DESC"
        query += " LIMIT :limit OFFSET :skip"
        
        results = db.execute(text(query), params).fetchall()
        
        outstanding_list = []
        for row in results:
            outstanding_list.append({
                "outstanding_id": row.outstanding_id,
                "party_id": row.customer_id if party_type == "customer" else row.supplier_id,
                "party_name": row.party_name,
                "phone": row.phone,
                "email": row.email,
                "invoice_number": row.invoice_number if party_type == "customer" else row.bill_number,
                "invoice_date": str(row.invoice_date),
                "due_date": str(row.due_date),
                "total_amount": float(row.total_amount),
                "paid_amount": float(row.paid_amount),
                "outstanding_amount": float(row.outstanding_amount),
                "days_overdue": row.days_overdue,
                "status": row.status,
                "aging_bucket": _get_aging_bucket(row.days_overdue)
            })
            
        return {
            "party_type": party_type,
            "count": len(outstanding_list),
            "outstanding": outstanding_list
        }
        
    except Exception as e:
        logger.error(f"Error fetching outstanding list: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reminders/generate-links")
async def generate_reminder_links(
    reminder_data: dict,
    db: Session = Depends(get_db)
):
    """
    Generate clickable WhatsApp/SMS links for payment reminders
    """
    try:
        # Validate required fields
        required_fields = ["party_type", "party_ids", "channel", "message"]
        for field in required_fields:
            if field not in reminder_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
                
        party_type = reminder_data["party_type"]
        party_ids = reminder_data["party_ids"]
        channel = reminder_data["channel"]  # 'sms', 'whatsapp'
        message_template = reminder_data["message"]
        
        # Get party details and outstanding
        if party_type == "customer":
            party_query = """
                SELECT 
                    c.customer_id as party_id,
                    c.customer_name as party_name,
                    c.phone,
                    c.email,
                    SUM(o.outstanding_amount) as total_outstanding,
                    COUNT(o.outstanding_id) as bill_count,
                    MAX(o.days_overdue) as max_days_overdue,
                    STRING_AGG(o.invoice_number, ', ') as invoice_numbers
                FROM customers c
                JOIN customer_outstanding o ON c.customer_id = o.customer_id
                WHERE c.customer_id = ANY(:party_ids)
                GROUP BY c.customer_id, c.customer_name, c.phone, c.email
            """
        else:  # supplier
            party_query = """
                SELECT 
                    s.supplier_id as party_id,
                    s.supplier_name as party_name,
                    s.phone,
                    s.email,
                    SUM(o.outstanding_amount) as total_outstanding,
                    COUNT(o.outstanding_id) as bill_count,
                    MAX(o.days_overdue) as max_days_overdue,
                    STRING_AGG(o.bill_number, ', ') as invoice_numbers
                FROM suppliers s
                JOIN supplier_outstanding o ON s.supplier_id = o.supplier_id
                WHERE s.supplier_id = ANY(:party_ids)
                GROUP BY s.supplier_id, s.supplier_name, s.phone, s.email
            """
            
        parties = db.execute(
            text(party_query),
            {"party_ids": party_ids}
        ).fetchall()
        
        links = []
        
        for party in parties:
            # Prepare message with variables
            message = message_template.replace("{{party_name}}", party.party_name)
            message = message.replace("{{amount}}", f"₹{party.total_outstanding:.2f}")
            message = message.replace("{{days_overdue}}", str(party.max_days_overdue))
            message = message.replace("{{invoice_numbers}}", party.invoice_numbers or "")
            message = message.replace("{{company_name}}", "AASO Pharmaceuticals")
            
            if not party.phone:
                continue
                
            # Clean phone number (remove spaces, dashes)
            phone = party.phone.replace(" ", "").replace("-", "")
            if not phone.startswith("+"):
                # Assume Indian number if no country code
                if not phone.startswith("91"):
                    phone = "91" + phone
                phone = "+" + phone
            
            link = ""
            if channel == "whatsapp":
                # Generate WhatsApp link
                encoded_message = urllib.parse.quote(message)
                link = f"https://wa.me/{phone}?text={encoded_message}"
            elif channel == "sms":
                # Generate SMS link
                encoded_message = urllib.parse.quote(message)
                link = f"sms:{phone}?body={encoded_message}"
                
            # Save reminder record
            db.execute(
                text("""
                    INSERT INTO collection_reminders (
                        org_id, customer_id, reminder_type,
                        reminder_date, message_content, status
                    ) VALUES (
                        :org_id, :customer_id, :reminder_type,
                        :reminder_date, :message_content, 'generated'
                    )
                """),
                {
                    "org_id": reminder_data.get("org_id", "12de5e22-eee7-4d25-b3a7-d16d01c6170f"),
                    "customer_id": party.party_id,
                    "reminder_type": channel,
                    "reminder_date": date.today(),
                    "message_content": message
                }
            )
                
            links.append({
                "party_id": party.party_id,
                "party_name": party.party_name,
                "phone": party.phone,
                "outstanding_amount": float(party.total_outstanding),
                "days_overdue": party.max_days_overdue,
                "link": link,
                "message": message
            })
        
        db.commit()
            
        return {
            "status": "success",
            "channel": channel,
            "links": links,
            "count": len(links)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating reminder links: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reminders/history")
async def get_reminder_history(
    customer_id: Optional[int] = None,
    reminder_type: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """
    Get history of sent reminders
    """
    try:
        query = """
            SELECT 
                r.*,
                c.customer_name,
                c.phone,
                c.email
            FROM collection_reminders r
            JOIN customers c ON r.customer_id = c.customer_id
            WHERE 1=1
        """
        params = {"skip": skip, "limit": limit}
        
        if customer_id:
            query += " AND r.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        if reminder_type:
            query += " AND r.reminder_type = :reminder_type"
            params["reminder_type"] = reminder_type
            
        if from_date:
            query += " AND r.reminder_date >= :from_date"
            params["from_date"] = from_date
            
        if to_date:
            query += " AND r.reminder_date <= :to_date"
            params["to_date"] = to_date
            
        query += " ORDER BY r.reminder_date DESC LIMIT :limit OFFSET :skip"
        
        reminders = db.execute(text(query), params).fetchall()
        
        result = []
        for reminder in reminders:
            result.append({
                "reminder_id": reminder.reminder_id,
                "customer_id": reminder.customer_id,
                "customer_name": reminder.customer_name,
                "phone": reminder.phone,
                "reminder_type": reminder.reminder_type,
                "reminder_date": str(reminder.reminder_date),
                "message_content": reminder.message_content,
                "status": reminder.status,
                "created_at": str(reminder.created_at)
            })
            
        return {
            "reminders": result,
            "count": len(result)
        }
        
    except Exception as e:
        logger.error(f"Error fetching reminder history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/payment/record")
async def record_payment_collection(
    payment_data: dict,
    db: Session = Depends(get_db)
):
    """
    Record a payment collection
    """
    try:
        # Validate required fields
        required_fields = ["customer_id", "payment_amount", "payment_mode", "invoice_ids"]
        for field in required_fields:
            if field not in payment_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
                
        # Create payment collection record
        result = db.execute(
            text("""
                INSERT INTO payment_collections (
                    org_id, customer_id, payment_date,
                    payment_amount, payment_mode,
                    reference_number, notes
                ) VALUES (
                    :org_id, :customer_id, :payment_date,
                    :payment_amount, :payment_mode,
                    :reference_number, :notes
                )
                RETURNING collection_id
            """),
            {
                "org_id": payment_data.get("org_id", "12de5e22-eee7-4d25-b3a7-d16d01c6170f"),
                "customer_id": payment_data["customer_id"],
                "payment_date": payment_data.get("payment_date", date.today()),
                "payment_amount": Decimal(str(payment_data["payment_amount"])),
                "payment_mode": payment_data["payment_mode"],
                "reference_number": payment_data.get("reference_number"),
                "notes": payment_data.get("notes")
            }
        ).fetchone()
        
        collection_id = result.collection_id
        
        # Allocate payment to invoices
        invoice_ids = payment_data["invoice_ids"]
        remaining_amount = Decimal(str(payment_data["payment_amount"]))
        
        for invoice_id in invoice_ids:
            if remaining_amount <= 0:
                break
                
            # Get outstanding amount for this invoice
            outstanding = db.execute(
                text("""
                    SELECT outstanding_amount 
                    FROM customer_outstanding
                    WHERE invoice_id = :invoice_id
                """),
                {"invoice_id": invoice_id}
            ).fetchone()
            
            if outstanding:
                allocation_amount = min(remaining_amount, outstanding.outstanding_amount)
                
                # Create allocation record
                db.execute(
                    text("""
                        INSERT INTO payment_allocations (
                            collection_id, invoice_id, allocated_amount
                        ) VALUES (
                            :collection_id, :invoice_id, :allocated_amount
                        )
                    """),
                    {
                        "collection_id": collection_id,
                        "invoice_id": invoice_id,
                        "allocated_amount": allocation_amount
                    }
                )
                
                # Update outstanding
                new_paid = db.execute(
                    text("""
                        UPDATE customer_outstanding
                        SET paid_amount = paid_amount + :allocated_amount,
                            outstanding_amount = outstanding_amount - :allocated_amount,
                            status = CASE 
                                WHEN outstanding_amount - :allocated_amount <= 0 
                                THEN 'paid' 
                                ELSE 'outstanding' 
                            END
                        WHERE invoice_id = :invoice_id
                        RETURNING outstanding_amount
                    """),
                    {
                        "allocated_amount": allocation_amount,
                        "invoice_id": invoice_id
                    }
                ).fetchone()
                
                remaining_amount -= allocation_amount
                
        db.commit()
        
        return {
            "status": "success",
            "collection_id": collection_id,
            "message": "Payment recorded successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error recording payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _get_aging_bucket(days_overdue: int) -> str:
    """Get aging bucket based on days overdue"""
    if days_overdue <= 30:
        return "Current"
    elif days_overdue <= 60:
        return "31-60 days"
    elif days_overdue <= 90:
        return "61-90 days"
    else:
        return ">90 days"