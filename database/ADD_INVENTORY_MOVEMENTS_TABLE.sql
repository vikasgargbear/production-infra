-- =============================================
-- RECREATE MISSING inventory_movements TABLE
-- This table was deleted but is needed for audit trails
-- =============================================

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
    approved_at TIMESTAMP,
    
    -- Foreign Key Constraints
    CONSTRAINT fk_inventory_movements_org 
        FOREIGN KEY (org_id) REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    CONSTRAINT fk_inventory_movements_product 
        FOREIGN KEY (product_id) REFERENCES inventory.products(product_id),
    CONSTRAINT fk_inventory_movements_batch 
        FOREIGN KEY (batch_id) REFERENCES inventory.batches(batch_id),
    CONSTRAINT fk_inventory_movements_created_by 
        FOREIGN KEY (created_by) REFERENCES master.org_users(user_id),
    CONSTRAINT fk_inventory_movements_approved_by 
        FOREIGN KEY (approved_by) REFERENCES master.org_users(user_id)
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

CREATE INDEX IF NOT EXISTS idx_inventory_movements_type_direction 
    ON inventory.inventory_movements(movement_type, movement_direction);

-- Add table comment
COMMENT ON TABLE inventory.inventory_movements IS 'Tracks all inventory movements for audit trail and reporting';

-- Add column comments
COMMENT ON COLUMN inventory.inventory_movements.movement_type IS 'Type: sale, purchase, transfer, adjustment, return';
COMMENT ON COLUMN inventory.inventory_movements.movement_direction IS 'Direction: in, out, transfer';
COMMENT ON COLUMN inventory.inventory_movements.reference_type IS 'Reference: invoice, order, challan, return, adjustment';

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON inventory.inventory_movements TO CURRENT_USER;
GRANT USAGE, SELECT ON SEQUENCE inventory.inventory_movements_movement_id_seq TO CURRENT_USER;