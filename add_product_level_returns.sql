-- Add quantity_returned to products table for aggregate tracking
DO $$
BEGIN
    -- Add to products table if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'inventory' 
        AND table_name = 'products'
        AND column_name = 'quantity_returned'
    ) THEN
        ALTER TABLE inventory.products 
        ADD COLUMN quantity_returned DECIMAL(18,3) DEFAULT 0;
        
        COMMENT ON COLUMN inventory.products.quantity_returned IS 'Total quantity returned across all batches';
        
        RAISE NOTICE '✅ Added quantity_returned column to inventory.products';
    END IF;

    -- Create or replace function to update product-level quantity_returned
    CREATE OR REPLACE FUNCTION inventory.update_product_quantity_returned()
    RETURNS TRIGGER AS $func$
    BEGIN
        -- Update product-level quantity_returned when batch-level changes
        UPDATE inventory.products p
        SET quantity_returned = (
            SELECT COALESCE(SUM(b.quantity_returned), 0)
            FROM inventory.batches b
            WHERE b.product_id = p.product_id
        )
        WHERE p.product_id = COALESCE(NEW.product_id, OLD.product_id);
        
        RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;

    -- Create trigger if not exists
    DROP TRIGGER IF EXISTS update_product_returns_on_batch_change ON inventory.batches;
    
    CREATE TRIGGER update_product_returns_on_batch_change
    AFTER INSERT OR UPDATE OF quantity_returned OR DELETE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION inventory.update_product_quantity_returned();
    
    RAISE NOTICE '✅ Created trigger to sync product-level quantity_returned';

    -- Initialize current values
    UPDATE inventory.products p
    SET quantity_returned = (
        SELECT COALESCE(SUM(b.quantity_returned), 0)
        FROM inventory.batches b
        WHERE b.product_id = p.product_id
    );
    
    RAISE NOTICE '✅ Initialized product-level quantity_returned values';
END $$;

-- Verify the setup
SELECT 
    p.product_id,
    p.product_name,
    p.quantity_on_hand,
    p.quantity_returned,
    COUNT(b.batch_id) as batch_count,
    SUM(b.quantity_returned) as total_batch_returns
FROM inventory.products p
LEFT JOIN inventory.batches b ON p.product_id = b.product_id
WHERE p.quantity_returned > 0 OR b.quantity_returned > 0
GROUP BY p.product_id, p.product_name, p.quantity_on_hand, p.quantity_returned
LIMIT 10;