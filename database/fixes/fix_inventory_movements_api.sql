-- Fix for inventory movements API function
-- Removes reference to non-existent stock_adjustments table

CREATE OR REPLACE FUNCTION api.get_inventory_movements(
    p_product_id INTEGER DEFAULT NULL,
    p_batch_id INTEGER DEFAULT NULL,
    p_location_id INTEGER DEFAULT NULL,
    p_movement_type TEXT DEFAULT NULL,
    p_from_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_to_date DATE DEFAULT CURRENT_DATE,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'movements', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'movement_id', im.movement_id,
                    'movement_date', im.movement_date,
                    'movement_type', im.movement_type,
                    'product_name', p.product_name,
                    'batch_number', b.batch_number,
                    'location_name', sl.location_name,
                    'quantity', im.quantity,
                    'unit_cost', im.unit_cost,
                    'total_value', im.quantity * im.unit_cost,
                    'reference_type', im.reference_type,
                    'reference_number', CASE 
                        WHEN im.reference_type = 'invoice' THEN inv.invoice_number
                        WHEN im.reference_type = 'grn' THEN grn.grn_number
                        WHEN im.reference_type = 'adjustment' THEN 'ADJ-' || im.reference_id::TEXT
                        ELSE im.reference_id::TEXT
                    END,
                    'narration', im.reason,
                    'created_by', u.full_name
                ) ORDER BY im.movement_date DESC, im.movement_id DESC
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM inventory.inventory_movements im
    JOIN inventory.products p ON im.product_id = p.product_id
    LEFT JOIN inventory.batches b ON im.batch_id = b.batch_id
    LEFT JOIN inventory.storage_locations sl ON im.location_id = sl.location_id
    LEFT JOIN sales.invoices inv ON im.reference_type = 'invoice' AND im.reference_id = inv.invoice_id
    LEFT JOIN procurement.goods_receipt_notes grn ON im.reference_type = 'grn' AND im.reference_id = grn.grn_id
    LEFT JOIN master.org_users u ON im.created_by = u.user_id
    WHERE (p_product_id IS NULL OR im.product_id = p_product_id)
    AND (p_batch_id IS NULL OR im.batch_id = p_batch_id)
    AND (p_location_id IS NULL OR im.location_id = p_location_id)
    AND (p_movement_type IS NULL OR im.movement_type = p_movement_type)
    AND im.movement_date BETWEEN p_from_date AND p_to_date
    LIMIT p_limit;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.get_inventory_movements TO authenticated_user;

COMMENT ON FUNCTION api.get_inventory_movements IS 'Get inventory movement history with filters - Fixed version without stock_adjustments table';