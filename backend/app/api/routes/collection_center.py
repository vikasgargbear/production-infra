"""
Collection Center API Endpoints
Provides comprehensive receivables management and collection analytics
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, func, case, and_, or_
from datetime import datetime, date, timedelta
from typing import List, Optional, Dict, Any
import logging
from decimal import Decimal

from database.connection import get_db
from models.organization import Organization
from models.customer import Customer
from models.order import Order, OrderItem
from models.payment import Payment

router = APIRouter(prefix="/api/v1/collection", tags=["Collection Center"])
logger = logging.getLogger(__name__)

# ============================================================================
# SMART AGING DASHBOARD APIs
# ============================================================================

@router.get("/aging-data")
async def get_aging_data(
    org_id: str,
    db: Session = Depends(get_db)
):
    """
    Get comprehensive aging data for smart dashboard
    Returns party-wise outstanding with aging buckets and risk scoring
    """
    try:
        # Get aging buckets summary
        aging_query = text("""
            WITH customer_outstanding AS (
                SELECT 
                    c.customer_id,
                    c.customer_name,
                    c.phone,
                    c.email,
                    c.address_line1 || ', ' || c.city || ', ' || c.state as address,
                    c.credit_limit,
                    c.credit_days,
                    COALESCE(SUM(bd.outstanding_amount), 0) as outstanding_amount,
                    MIN(bd.due_date) as oldest_due_date,
                    MAX(COALESCE(bd.overdue_days, 0)) as max_overdue_days,
                    COUNT(bd.bill_id) as outstanding_bills_count,
                    -- Calculate aging buckets
                    SUM(CASE WHEN COALESCE(bd.overdue_days, 0) BETWEEN 0 AND 30 
                        THEN bd.outstanding_amount ELSE 0 END) as bucket_0_30,
                    SUM(CASE WHEN bd.overdue_days BETWEEN 31 AND 60 
                        THEN bd.outstanding_amount ELSE 0 END) as bucket_31_60,
                    SUM(CASE WHEN bd.overdue_days BETWEEN 61 AND 90 
                        THEN bd.outstanding_amount ELSE 0 END) as bucket_61_90,
                    SUM(CASE WHEN bd.overdue_days BETWEEN 91 AND 120 
                        THEN bd.outstanding_amount ELSE 0 END) as bucket_91_120,
                    SUM(CASE WHEN bd.overdue_days > 120 
                        THEN bd.outstanding_amount ELSE 0 END) as bucket_120_plus,
                    -- Risk scoring factors
                    AVG(COALESCE(bd.overdue_days, 0)) as avg_overdue_days,
                    (COALESCE(SUM(bd.outstanding_amount), 0) / NULLIF(c.credit_limit, 0) * 100) as credit_utilization
                FROM customers c
                LEFT JOIN bill_details bd ON c.customer_id = bd.ledger_id 
                    AND bd.status IN ('Outstanding', 'Partial')
                WHERE c.org_id = :org_id 
                    AND c.is_active = true
                    AND COALESCE(SUM(bd.outstanding_amount), 0) > 0
                GROUP BY c.customer_id, c.customer_name, c.phone, c.email, 
                         c.address_line1, c.city, c.state, c.credit_limit, c.credit_days
                HAVING COALESCE(SUM(bd.outstanding_amount), 0) > 0
            ),
            payment_history AS (
                SELECT 
                    customer_id,
                    COUNT(*) as payment_count_30d,
                    AVG(EXTRACT(DAYS FROM (payment_date - due_date))) as avg_payment_delay,
                    COUNT(CASE WHEN payment_date > due_date THEN 1 END)::float / 
                        NULLIF(COUNT(*), 0) * 100 as late_payment_percentage
                FROM payments p
                WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
                    AND org_id = :org_id
                GROUP BY customer_id
            )
            SELECT 
                co.*,
                COALESCE(ph.payment_count_30d, 0) as recent_payments,
                COALESCE(ph.avg_payment_delay, 0) as avg_payment_delay,
                COALESCE(ph.late_payment_percentage, 0) as late_payment_rate,
                -- Calculate risk score (0-100, higher = more risk)
                LEAST(100, GREATEST(0, 
                    (CASE WHEN co.max_overdue_days > 120 THEN 40
                          WHEN co.max_overdue_days > 90 THEN 35
                          WHEN co.max_overdue_days > 60 THEN 30
                          WHEN co.max_overdue_days > 30 THEN 20
                          WHEN co.max_overdue_days > 0 THEN 10
                          ELSE 0 END) +
                    (CASE WHEN co.credit_utilization > 90 THEN 25
                          WHEN co.credit_utilization > 75 THEN 20
                          WHEN co.credit_utilization > 50 THEN 10
                          ELSE 0 END) +
                    (CASE WHEN COALESCE(ph.late_payment_percentage, 0) > 50 THEN 15
                          WHEN COALESCE(ph.late_payment_percentage, 0) > 25 THEN 10
                          ELSE 0 END) +
                    (CASE WHEN COALESCE(ph.payment_count_30d, 0) = 0 THEN 20
                          WHEN COALESCE(ph.payment_count_30d, 0) < 2 THEN 10
                          ELSE 0 END)
                )) as risk_score
            FROM customer_outstanding co
            LEFT JOIN payment_history ph ON co.customer_id = ph.customer_id
            ORDER BY co.outstanding_amount DESC, co.max_overdue_days DESC
            LIMIT 50
        """)
        
        result = db.execute(aging_query, {"org_id": org_id})
        customers_data = result.fetchall()
        
        # Calculate summary metrics
        total_outstanding = sum(float(row.outstanding_amount or 0) for row in customers_data)
        overdue_amount = sum(float(row.outstanding_amount or 0) for row in customers_data if row.max_overdue_days > 0)
        
        # Get collection efficiency from last 7 days
        collections_query = text("""
            SELECT 
                COALESCE(SUM(amount), 0) as week_collections,
                COUNT(*) as collection_count
            FROM payments 
            WHERE org_id = :org_id 
                AND payment_date >= CURRENT_DATE - INTERVAL '7 days'
        """)
        collections_result = db.execute(collections_query, {"org_id": org_id}).fetchone()
        
        # Calculate aging buckets summary
        aging_buckets = [
            {
                "range": "0-30",
                "amount": sum(float(row.bucket_0_30 or 0) for row in customers_data),
                "count": sum(1 for row in customers_data if row.bucket_0_30 > 0),
                "percentage": 0
            },
            {
                "range": "31-60", 
                "amount": sum(float(row.bucket_31_60 or 0) for row in customers_data),
                "count": sum(1 for row in customers_data if row.bucket_31_60 > 0),
                "percentage": 0
            },
            {
                "range": "61-90",
                "amount": sum(float(row.bucket_61_90 or 0) for row in customers_data),
                "count": sum(1 for row in customers_data if row.bucket_61_90 > 0),
                "percentage": 0
            },
            {
                "range": "91-120",
                "amount": sum(float(row.bucket_91_120 or 0) for row in customers_data),
                "count": sum(1 for row in customers_data if row.bucket_91_120 > 0),
                "percentage": 0
            },
            {
                "range": "120+",
                "amount": sum(float(row.bucket_120_plus or 0) for row in customers_data),
                "count": sum(1 for row in customers_data if row.bucket_120_plus > 0),
                "percentage": 0
            }
        ]
        
        # Calculate percentages
        if total_outstanding > 0:
            for bucket in aging_buckets:
                bucket["percentage"] = round((bucket["amount"] / total_outstanding) * 100, 1)
        
        # Format parties data
        parties = []
        for row in customers_data:
            parties.append({
                "id": row.customer_id,
                "name": row.customer_name,
                "phone": row.phone or "",
                "email": row.email or "",
                "location": row.address or "",
                "outstandingAmount": float(row.outstanding_amount or 0),
                "daysOverdue": int(row.max_overdue_days or 0),
                "creditLimit": float(row.credit_limit or 0),
                "creditUtilization": round(float(row.credit_utilization or 0), 1),
                "lastPayment": "2024-06-15",  # TODO: Get from payment history
                "lastFollowUp": "2024-07-18",  # TODO: Get from follow-up history
                "promiseDate": None,  # TODO: Get from promises
                "riskScore": int(row.risk_score),
                "paymentHistory": "Good" if row.late_payment_rate < 25 else "Average" if row.late_payment_rate < 50 else "Poor",
                "collectionSuccess": max(0, 100 - int(row.late_payment_rate or 0)),
                "preferredContactTime": "10:00 AM - 12:00 PM",  # TODO: Store in customer preferences
                "assignedAgent": "Auto-assigned",  # TODO: Get from agent assignments
                "agingBreakdown": [
                    {"range": "0-30", "amount": float(row.bucket_0_30 or 0)},
                    {"range": "31-60", "amount": float(row.bucket_31_60 or 0)},
                    {"range": "61-90", "amount": float(row.bucket_61_90 or 0)},
                    {"range": "91-120", "amount": float(row.bucket_91_120 or 0)},
                    {"range": "120+", "amount": float(row.bucket_120_plus or 0)}
                ]
            })
        
        return {
            "summary": {
                "totalOutstanding": total_outstanding,
                "overdueAmount": overdue_amount,
                "currentWeekCollections": float(collections_result.week_collections or 0),
                "collectionEfficiency": 82,  # TODO: Calculate based on targets
                "avgCollectionDays": 45  # TODO: Calculate from payment history
            },
            "agingBuckets": aging_buckets,
            "parties": parties
        }
        
    except Exception as e:
        logger.error(f"Error fetching aging data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch aging data: {str(e)}")


@router.post("/send-whatsapp-reminder")
async def send_whatsapp_reminder(
    customer_id: int,
    template_type: str,
    variables: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Send WhatsApp reminder to customer
    For now returns success - integrate with WhatsApp Business API later
    """
    try:
        # Get customer details
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # Log the reminder (you can create a reminders table)
        reminder_log = {
            "customer_id": customer_id,
            "customer_name": customer.customer_name,
            "phone": customer.phone,
            "template_type": template_type,
            "variables": variables,
            "sent_at": datetime.now(),
            "status": "sent"
        }
        
        logger.info(f"WhatsApp reminder sent: {reminder_log}")
        
        # TODO: Integrate with actual WhatsApp Business API
        # whatsapp_response = await whatsapp_client.send_template_message(
        #     to=customer.phone,
        #     template_name=f"collection_reminder_{template_type}",
        #     variables=variables
        # )
        
        return {
            "success": True,
            "message_id": f"whatsapp_{datetime.now().timestamp()}",
            "delivered_at": datetime.now().isoformat(),
            "customer_name": customer.customer_name
        }
        
    except Exception as e:
        logger.error(f"Error sending WhatsApp reminder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send WhatsApp reminder: {str(e)}")


@router.post("/send-sms-reminder")
async def send_sms_reminder(
    customer_id: int,
    template_type: str,
    variables: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Send SMS reminder to customer
    """
    try:
        customer = db.query(Customer).filter(Customer.customer_id == customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        
        # TODO: Integrate with SMS service
        return {
            "success": True,
            "message_id": f"sms_{datetime.now().timestamp()}",
            "delivered_at": datetime.now().isoformat(),
            "customer_name": customer.customer_name
        }
        
    except Exception as e:
        logger.error(f"Error sending SMS reminder: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send SMS reminder: {str(e)}")


# ============================================================================
# COLLECTION ANALYTICS APIs
# ============================================================================

@router.get("/analytics/performance")
async def get_collection_performance(
    org_id: str,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Get collection performance analytics
    """
    try:
        # Daily collections trend
        daily_collections_query = text("""
            SELECT 
                payment_date::date as date,
                SUM(amount) as amount,
                COUNT(*) as count
            FROM payments 
            WHERE org_id = :org_id 
                AND payment_date BETWEEN :start_date AND :end_date
            GROUP BY payment_date::date
            ORDER BY payment_date::date
        """)
        
        daily_result = db.execute(daily_collections_query, {
            "org_id": org_id,
            "start_date": start_date,
            "end_date": end_date
        })
        
        daily_collections = [
            {
                "date": row.date.strftime("%Y-%m-%d"),
                "amount": float(row.amount),
                "count": row.count
            }
            for row in daily_result.fetchall()
        ]
        
        # Calculate total metrics
        total_collections = sum(item["amount"] for item in daily_collections)
        
        return {
            "total_collections": total_collections,
            "daily_collections": daily_collections,
            "collection_rate": 85.5,  # TODO: Calculate actual rate
            "outstanding_change": -5.2  # TODO: Calculate change
        }
        
    except Exception as e:
        logger.error(f"Error fetching performance analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/agent-performance")
async def get_agent_performance(
    org_id: str,
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db)
):
    """
    Get field agent performance metrics
    """
    try:
        # For now return mock data - implement when agent assignments are ready
        agents = [
            {
                "id": 1,
                "name": "Rajesh Kumar",
                "avatar": "/api/placeholder/40/40",
                "region": "Mumbai North",
                "total_collections": 450000,
                "total_visits": 85,
                "success_rate": 78,
                "avg_per_visit": 5294
            },
            {
                "id": 2,
                "name": "Priya Sharma", 
                "avatar": "/api/placeholder/40/40",
                "region": "Pune Central",
                "total_collections": 380000,
                "total_visits": 72,
                "success_rate": 82,
                "avg_per_visit": 5278
            }
        ]
        
        return {"agent_performance": agents}
        
    except Exception as e:
        logger.error(f"Error fetching agent performance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CUSTOMER RECEIVABLES APIs
# ============================================================================

@router.get("/customer/{customer_id}/outstanding")
async def get_customer_outstanding(
    customer_id: int,
    org_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed outstanding for a specific customer
    """
    try:
        outstanding_query = text("""
            SELECT 
                bd.bill_id,
                bd.bill_number,
                bd.bill_date,
                bd.bill_amount,
                bd.paid_amount,
                bd.outstanding_amount,
                bd.due_date,
                bd.overdue_days,
                bd.status
            FROM bill_details bd
            WHERE bd.ledger_id = :customer_id
                AND bd.status IN ('Outstanding', 'Partial')
                AND bd.outstanding_amount > 0
            ORDER BY bd.due_date ASC
        """)
        
        result = db.execute(outstanding_query, {"customer_id": customer_id})
        bills = result.fetchall()
        
        invoices = []
        for bill in bills:
            invoices.append({
                "id": bill.bill_id,
                "number": bill.bill_number,
                "date": bill.bill_date.strftime("%Y-%m-%d"),
                "amount": float(bill.bill_amount),
                "outstanding": float(bill.outstanding_amount),
                "dueDate": bill.due_date.strftime("%Y-%m-%d"),
                "daysOverdue": int(bill.overdue_days or 0),
                "status": bill.status
            })
        
        return {
            "customer_id": customer_id,
            "invoices": invoices,
            "total_outstanding": sum(float(bill.outstanding_amount) for bill in bills)
        }
        
    except Exception as e:
        logger.error(f"Error fetching customer outstanding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/customer/{customer_id}/record-payment")
async def record_customer_payment(
    customer_id: int,
    payment_data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Record payment for customer
    """
    try:
        # Create payment record
        payment = Payment(
            customer_id=customer_id,
            amount=payment_data["amount"],
            payment_method=payment_data["method"],
            payment_date=datetime.strptime(payment_data["date"], "%Y-%m-%d").date(),
            reference_number=payment_data.get("reference", ""),
            notes=payment_data.get("notes", ""),
            status="confirmed",
            org_id=payment_data["org_id"]
        )
        
        db.add(payment)
        db.commit()
        db.refresh(payment)
        
        logger.info(f"Payment recorded: Customer {customer_id}, Amount {payment_data['amount']}")
        
        return {
            "success": True,
            "payment_id": payment.payment_id,
            "message": "Payment recorded successfully"
        }
        
    except Exception as e:
        logger.error(f"Error recording payment: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HUB DASHBOARD APIs
# ============================================================================

@router.get("/hub-stats")
async def get_hub_statistics(
    org_id: str,
    db: Session = Depends(get_db)
):
    """
    Get comprehensive hub statistics for dashboard
    """
    try:
        # Get aging data
        aging_response = await get_aging_data(org_id, db)
        
        # Get recent payments for today's collections
        today_payments_query = text("""
            SELECT COALESCE(SUM(amount), 0) as today_collections,
                   COUNT(*) as payment_count
            FROM payments 
            WHERE org_id = :org_id AND payment_date = CURRENT_DATE
        """)
        
        today_result = db.execute(today_payments_query, {"org_id": org_id}).fetchone()
        
        # Get field agents count (from org_users table)
        agents_query = text("""
            SELECT COUNT(*) as agent_count
            FROM org_users 
            WHERE org_id = :org_id AND is_active = true
                AND role ILIKE '%agent%' OR role ILIKE '%collection%'
        """)
        
        agents_result = db.execute(agents_query, {"org_id": org_id}).fetchone()
        
        return {
            "total_outstanding": aging_response["summary"]["totalOutstanding"],
            "overdue_amount": aging_response["summary"]["overdueAmount"],
            "today_collections": float(today_result.today_collections or 0),
            "collection_efficiency": aging_response["summary"]["collectionEfficiency"],
            "active_campaigns": 5,  # TODO: Get from campaigns table when implemented
            "field_agents": int(agents_result.agent_count or 0),
            "high_risk_customers": len([p for p in aging_response["parties"] if p["riskScore"] > 80]),
            "total_customers": len(aging_response["parties"]),
            "last_updated": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error fetching hub statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications")
async def get_hub_notifications(
    org_id: str,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """
    Get real-time notifications for hub dashboard
    """
    try:
        notifications = []
        
        # Get high-risk customers
        aging_response = await get_aging_data(org_id, db)
        high_risk = [p for p in aging_response["parties"] if p["riskScore"] > 80]
        
        if high_risk:
            notifications.append({
                "id": f"risk_{datetime.now().timestamp()}",
                "type": "urgent",
                "title": "High Risk Customers",
                "message": f"{len(high_risk)} customers need immediate attention",
                "time": "Now",
                "action_url": "/receivables/dashboard"
            })
        
        # Get large overdue amounts
        large_overdue = [p for p in aging_response["parties"] 
                        if p["outstandingAmount"] > 100000 and p["daysOverdue"] > 60]
        
        if large_overdue:
            notifications.append({
                "id": f"overdue_{datetime.now().timestamp()}",
                "type": "urgent", 
                "title": "Large Overdue Amounts",
                "message": f"{len(large_overdue)} customers with >₹1L overdue 60+ days",
                "time": "5 min ago",
                "action_url": "/receivables/dashboard"
            })
        
        # Get today's collections
        today_collections = aging_response["summary"]["currentWeekCollections"]
        if today_collections > 0:
            notifications.append({
                "id": f"collections_{datetime.now().timestamp()}",
                "type": "success",
                "title": "Collection Update",
                "message": f"Today's collections: ₹{today_collections:,.0f}",
                "time": "1 hour ago",
                "action_url": "/receivables/analytics"
            })
        
        return {"notifications": notifications[:limit]}
        
    except Exception as e:
        logger.error(f"Error fetching notifications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# CAMPAIGN MANAGEMENT APIs (Enhanced)
# ============================================================================

@router.get("/campaigns")
async def get_collection_campaigns(
    org_id: str,
    db: Session = Depends(get_db)
):
    """
    Get active collection campaigns
    """
    try:
        # Mock campaigns data for now - implement campaigns table later
        campaigns = [
            {
                "id": 1,
                "name": "Overdue Reminder Campaign",
                "description": "Automated reminders for overdue customers",
                "status": "active",
                "created_at": "2024-07-01",
                "triggers": ["days_overdue > 7"],
                "actions": ["whatsapp", "sms", "call_task"],
                "stats": {
                    "total_sent": 150,
                    "conversion_rate": 12.5
                }
            },
            {
                "id": 2,
                "name": "High Value Follow-up",
                "description": "Premium follow-up for >₹50k customers",
                "status": "active",
                "created_at": "2024-07-15",
                "triggers": ["amount > 50000"],
                "actions": ["call_task", "whatsapp"],
                "stats": {
                    "total_sent": 45,
                    "conversion_rate": 18.2
                }
            }
        ]
        
        return {"campaigns": campaigns, "total": len(campaigns)}
        
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns")
async def create_collection_campaign(
    campaign_data: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Create new collection campaign
    """
    try:
        # TODO: Implement actual campaign creation when campaigns table is ready
        campaign_id = int(datetime.now().timestamp())
        
        logger.info(f"Campaign creation requested: {campaign_data}")
        
        return {
            "success": True, 
            "campaign_id": campaign_id,
            "message": "Campaign created successfully"
        }
        
    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))