#!/usr/bin/env python3
"""
Quick script to create the missing inventory_movements table
Run this once to fix the missing table issue
"""

import os
import psycopg2
from sqlalchemy import create_engine, text

# Database connection string
DATABASE_URL = "postgresql://postgres:qJUYzUwhWgTHNlJHZWZqGUKwqvCJtlKr@junction.proxy.rlwy.net:33612/railway"

CREATE_TABLE_SQL = """
-- Create the inventory_movements table
CREATE TABLE IF NOT EXISTS inventory.inventory_movements (
    movement_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL,
    movement_type TEXT NOT NULL,
    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    movement_direction TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    quantity NUMERIC(15,3) NOT NULL,
    pack_type TEXT,
    base_quantity NUMERIC(15,3),
    location_id INTEGER NOT NULL DEFAULT 1,
    from_location_id INTEGER,
    to_location_id INTEGER,
    unit_cost NUMERIC(15,4),
    total_cost NUMERIC(15,2),
    reference_type TEXT,
    reference_id INTEGER,
    reference_number TEXT,
    transfer_type TEXT,
    transfer_pair_id INTEGER,
    reason TEXT,
    notes TEXT,
    pack_display_data JSONB,
    cost_details JSONB,
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER,
    approved_at TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_date 
    ON inventory.inventory_movements(org_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product 
    ON inventory.inventory_movements(product_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch 
    ON inventory.inventory_movements(batch_id, movement_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference 
    ON inventory.inventory_movements(reference_type, reference_id);

-- Add table comment
COMMENT ON TABLE inventory.inventory_movements IS 'Tracks all inventory movements for audit trail and reporting';
"""

def create_table():
    try:
        # Connect to database using SQLAlchemy
        engine = create_engine(DATABASE_URL)
        print("✅ Connected to Railway database")
        
        with engine.connect() as conn:
            # Execute the CREATE TABLE SQL
            conn.execute(text(CREATE_TABLE_SQL))
            conn.commit()
            print("✅ inventory_movements table created successfully")
            
            # Test the table
            result = conn.execute(text("SELECT COUNT(*) FROM inventory.inventory_movements")).scalar()
            print(f"✅ Table test successful - current rows: {result}")
        
        print("✅ Database connection closed")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    create_table()