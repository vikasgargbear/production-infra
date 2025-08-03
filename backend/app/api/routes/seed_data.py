"""
Seed Data API Router
Creates sample data for testing
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
import random
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/seed", tags=["seed-data"])

@router.post("/batches")
async def seed_batches(db: Session = Depends(get_db)):
    """
    Create sample batches with realistic pricing for testing
    """
    try:
        # Sample batch data with realistic pharma pricing
        sample_batches = [
            {
                'product_name': 'AasoTops',
                'product_code': 'AASO001',
                'batches': [
                    {'batch_number': 'AT2024001', 'mrp': 150, 'selling_price': 120, 'cost_price': 80, 'quantity': 500},
                    {'batch_number': 'AT2024002', 'mrp': 150, 'selling_price': 125, 'cost_price': 82, 'quantity': 300},
                    {'batch_number': 'AT2024003', 'mrp': 160, 'selling_price': 130, 'cost_price': 85, 'quantity': 750},
                ]
            },
            {
                'product_name': 'Paracetamol 500mg',
                'product_code': 'PCM500',
                'batches': [
                    {'batch_number': 'PCM2024001', 'mrp': 30, 'selling_price': 24, 'cost_price': 15, 'quantity': 1000},
                    {'batch_number': 'PCM2024002', 'mrp': 30, 'selling_price': 25, 'cost_price': 16, 'quantity': 1500},
                ]
            },
            {
                'product_name': 'Amoxicillin 500mg',
                'product_code': 'AMX500',
                'batches': [
                    {'batch_number': 'AMX2024001', 'mrp': 120, 'selling_price': 95, 'cost_price': 60, 'quantity': 400},
                    {'batch_number': 'AMX2024002', 'mrp': 125, 'selling_price': 98, 'cost_price': 62, 'quantity': 600},
                ]
            },
            {
                'product_name': 'Vitamin C 500mg',
                'product_code': 'VTC500',
                'batches': [
                    {'batch_number': 'VTC2024001', 'mrp': 80, 'selling_price': 65, 'cost_price': 40, 'quantity': 800},
                    {'batch_number': 'VTC2024002', 'mrp': 85, 'selling_price': 68, 'cost_price': 42, 'quantity': 1200},
                ]
            },
            {
                'product_name': 'Omeprazole 20mg',
                'product_code': 'OMP020',
                'batches': [
                    {'batch_number': 'OMP2024001', 'mrp': 140, 'selling_price': 110, 'cost_price': 70, 'quantity': 350},
                    {'batch_number': 'OMP2024002', 'mrp': 145, 'selling_price': 115, 'cost_price': 72, 'quantity': 450},
                ]
            }
        ]
        
        created_products = 0
        created_batches = 0
        
        for product_data in sample_batches:
            # Check if product exists
            result = db.execute(
                text("""
                    SELECT product_id FROM inventory.products 
                    WHERE product_name = :product_name AND org_id = :org_id
                """),
                {"product_name": product_data['product_name'], "org_id": DEFAULT_ORG_ID}
            )
            row = result.first()
            
            if row:
                product_id = row.product_id
            else:
                # Create product
                result = db.execute(
                    text("""
                        INSERT INTO inventory.products (
                            org_id, product_code, product_name, generic_name,
                            brand, manufacturer, hsn_code, gst_percentage,
                            maintain_batch, maintain_expiry, is_active,
                            created_at, updated_at
                        ) VALUES (
                            :org_id, :product_code, :product_name, :generic_name,
                            :brand, :manufacturer, :hsn_code, :gst_percentage,
                            true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        ) RETURNING product_id
                    """),
                    {
                        "org_id": DEFAULT_ORG_ID,
                        "product_code": product_data['product_code'],
                        "product_name": product_data['product_name'],
                        "generic_name": product_data['product_name'].split()[0],
                        "brand": "Generic",
                        "manufacturer": "ABC Pharma",
                        "hsn_code": "3004",
                        "gst_percentage": 12
                    }
                )
                product_id = result.scalar()
                created_products += 1
            
            # Create batches
            for batch in product_data['batches']:
                # Check if batch exists
                exists = db.execute(
                    text("""
                        SELECT 1 FROM inventory.batches 
                        WHERE batch_number = :batch_number 
                        AND product_id = :product_id 
                        AND org_id = :org_id
                    """),
                    {
                        "batch_number": batch['batch_number'],
                        "product_id": product_id,
                        "org_id": DEFAULT_ORG_ID
                    }
                ).scalar()
                
                if not exists:
                    # Calculate dates
                    days_to_expiry = random.randint(180, 730)
                    expiry_date = datetime.now() + timedelta(days=days_to_expiry)
                    manufacturing_date = datetime.now() - timedelta(days=random.randint(30, 180))
                    
                    db.execute(
                        text("""
                            INSERT INTO inventory.batches (
                                org_id, product_id, batch_number,
                                manufacturing_date, expiry_date,
                                initial_quantity, quantity_available,
                                cost_per_unit, sale_price_per_unit, mrp_per_unit,
                                batch_status, created_at, updated_at
                            ) VALUES (
                                :org_id, :product_id, :batch_number,
                                :manufacturing_date, :expiry_date,
                                :initial_quantity, :quantity_available,
                                :cost_per_unit, :sale_price_per_unit, :mrp_per_unit,
                                'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                            )
                        """),
                        {
                            "org_id": DEFAULT_ORG_ID,
                            "product_id": product_id,
                            "batch_number": batch['batch_number'],
                            "manufacturing_date": manufacturing_date.date(),
                            "expiry_date": expiry_date.date(),
                            "initial_quantity": batch['quantity'],
                            "quantity_available": batch['quantity'],
                            "cost_per_unit": batch['cost_price'],
                            "sale_price_per_unit": batch['selling_price'],
                            "mrp_per_unit": batch['mrp']
                        }
                    )
                    created_batches += 1
        
        db.commit()
        
        # Get summary
        summary = db.execute(
            text("""
                SELECT 
                    COUNT(DISTINCT p.product_id) as products,
                    COUNT(DISTINCT b.batch_id) as batches,
                    SUM(b.quantity_available) as total_stock,
                    SUM(b.quantity_available * b.selling_price) as stock_value
                FROM inventory.products p
                LEFT JOIN inventory.batches b ON p.product_id = b.product_id
                WHERE p.org_id = :org_id AND b.is_active = true
            """),
            {"org_id": DEFAULT_ORG_ID}
        ).first()
        
        return {
            "message": "Sample data created successfully",
            "created": {
                "products": created_products,
                "batches": created_batches
            },
            "summary": {
                "total_products": summary.products,
                "total_batches": summary.batches,
                "total_stock": float(summary.total_stock) if summary.total_stock else 0,
                "stock_value": float(summary.stock_value) if summary.stock_value else 0
            }
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error seeding batches: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))