#!/usr/bin/env python3
"""
One-time script to set up payment methods for all organizations
Run this once to populate the financial.payment_methods table
"""

from sqlalchemy import text
from app.core.database import SessionLocal, engine
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def setup_payment_methods():
    """Create standard payment methods for all organizations"""
    db = SessionLocal()
    
    try:
        # Get all organizations
        orgs = db.execute(text("SELECT org_id, org_name FROM master.organizations")).fetchall()
        
        for org in orgs:
            org_id = org[0]
            org_name = org[1]
            
            logger.info(f"Setting up payment methods for organization: {org_name}")
            
            # Check if payment methods already exist
            existing = db.execute(text("""
                SELECT COUNT(*) FROM financial.payment_methods
                WHERE org_id = :org_id
            """), {"org_id": org_id}).scalar()
            
            if existing > 0:
                logger.info(f"  Payment methods already exist for {org_name}, skipping")
                continue
            
            # Insert standard payment methods
            db.execute(text("""
                INSERT INTO financial.payment_methods 
                (org_id, method_code, method_name, method_type, requires_reference, requires_approval, processing_days, is_active)
                VALUES 
                (:org_id, 'CASH', 'Cash', 'instant', false, false, 0, true),
                (:org_id, 'UPI', 'UPI Payment', 'digital', true, false, 0, true),
                (:org_id, 'BANK', 'Bank Transfer', 'bank', true, false, 1, true),
                (:org_id, 'CHECK', 'Cheque', 'bank', true, true, 3, true),
                (:org_id, 'CARD', 'Credit/Debit Card', 'digital', true, false, 0, true),
                (:org_id, 'CREDIT', 'Credit Sale', 'credit', false, false, 0, true)
            """), {"org_id": org_id})
            
            logger.info(f"  Created 6 payment methods for {org_name}")
        
        db.commit()
        logger.info("Payment methods setup completed successfully!")
        
        # Show summary
        result = db.execute(text("""
            SELECT o.org_name, COUNT(pm.payment_method_id) as method_count
            FROM master.organizations o
            LEFT JOIN financial.payment_methods pm ON o.org_id = pm.org_id
            GROUP BY o.org_id, o.org_name
            ORDER BY o.org_name
        """)).fetchall()
        
        logger.info("\nSummary:")
        for row in result:
            logger.info(f"  {row[0]}: {row[1]} payment methods")
            
    except Exception as e:
        logger.error(f"Error setting up payment methods: {e}")
        db.rollback()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    setup_payment_methods()