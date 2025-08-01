-- =============================================
-- MASTER MODULE APIS
-- =============================================
-- Global API functions for master data management
-- =============================================

-- =============================================
-- ORGANIZATION MANAGEMENT API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_organization_details(
    p_org_id INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'organization', row_to_json(o.*),
        'branches', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'branch_id', b.branch_id,
                    'branch_code', b.branch_code,
                    'branch_name', b.branch_name,
                    'branch_type', b.branch_type,
                    'is_head_office', b.is_head_office,
                    'gstin', b.gstin,
                    'address', b.address
                ) ORDER BY b.branch_id
            ) FILTER (WHERE b.branch_id IS NOT NULL), 
            '[]'::jsonb
        ),
        'licenses', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'license_type', l.license_type,
                    'license_number', l.license_number,
                    'expiry_date', l.expiry_date,
                    'renewal_status', l.renewal_status
                ) ORDER BY l.expiry_date
            ) FILTER (WHERE l.license_id IS NOT NULL), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM master.organizations o
    LEFT JOIN master.branches b ON o.org_id = b.org_id AND b.is_active = TRUE
    LEFT JOIN compliance.business_licenses l ON o.org_id = l.org_id AND l.is_active = TRUE
    WHERE o.org_id = COALESCE(p_org_id, o.org_id)
    AND o.is_active = TRUE
    GROUP BY o.org_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- =============================================
-- PRODUCT CATALOG API
-- =============================================
CREATE OR REPLACE FUNCTION api.search_products(
    p_search_term TEXT DEFAULT NULL,
    p_category_id INTEGER DEFAULT NULL,
    p_product_type TEXT DEFAULT NULL,
    p_is_narcotic BOOLEAN DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_total_count INTEGER;
BEGIN
    -- Get total count
    SELECT COUNT(*)
    INTO v_total_count
    FROM inventory.products p
    WHERE p.is_active = TRUE
    AND (p_search_term IS NULL OR 
         p.product_name ILIKE '%' || p_search_term || '%' OR
         p.generic_name ILIKE '%' || p_search_term || '%' OR
         p.product_code ILIKE '%' || p_search_term || '%')
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_type IS NULL OR p.product_type = p_product_type)
    AND (p_is_narcotic IS NULL OR p.is_narcotic = p_is_narcotic);
    
    -- Get paginated results with stock info
    SELECT jsonb_build_object(
        'total_count', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'products', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'product_id', p.product_id,
                    'product_code', p.product_code,
                    'product_name', p.product_name,
                    'generic_name', p.generic_name,
                    'category', c.category_name,
                    'manufacturer', p.manufacturer,
                    'product_type', p.product_type,
                    'dosage_form', p.dosage_form,
                    'strength', p.strength,
                    'pack_configuration', p.pack_configuration,
                    'current_mrp', p.current_mrp,
                    'gst_percentage', p.gst_percentage,
                    'is_prescription_required', p.is_prescription_required,
                    'is_narcotic', p.is_narcotic,
                    'stock_info', jsonb_build_object(
                        'total_quantity', COALESCE(SUM(ls.quantity_available), 0),
                        'locations', COUNT(DISTINCT ls.location_id),
                        'active_batches', COUNT(DISTINCT b.batch_id)
                    )
                ) ORDER BY p.product_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM inventory.products p
    LEFT JOIN master.product_categories c ON p.category_id = c.category_id
    LEFT JOIN inventory.batches b ON p.product_id = b.product_id AND b.batch_status = 'active'
    LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id AND ls.quantity_available > 0
    WHERE p.is_active = TRUE
    AND (p_search_term IS NULL OR 
         p.product_name ILIKE '%' || p_search_term || '%' OR
         p.generic_name ILIKE '%' || p_search_term || '%' OR
         p.product_code ILIKE '%' || p_search_term || '%')
    AND (p_category_id IS NULL OR p.category_id = p_category_id)
    AND (p_product_type IS NULL OR p.product_type = p_product_type)
    AND (p_is_narcotic IS NULL OR p.is_narcotic = p_is_narcotic)
    GROUP BY p.product_id, c.category_name
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- PRODUCT DETAILS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_product_details(
    p_product_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'product', row_to_json(p.*),
        'category', row_to_json(c.*),
        'batches', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'batch_id', b.batch_id,
                    'batch_number', b.batch_number,
                    'expiry_date', b.expiry_date,
                    'quantity_available', b.quantity_available,
                    'mrp_per_unit', b.mrp_per_unit,
                    'sale_price_per_unit', b.sale_price_per_unit,
                    'days_to_expiry', b.expiry_date - CURRENT_DATE
                ) ORDER BY b.expiry_date
            ) FILTER (WHERE b.batch_id IS NOT NULL AND b.batch_status = 'active'), 
            '[]'::jsonb
        ),
        'location_stock', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'location_id', ls.location_id,
                    'location_name', sl.location_name,
                    'branch_name', br.branch_name,
                    'quantity_available', ls.quantity_available,
                    'batch_count', COUNT(DISTINCT ls.batch_id)
                ) ORDER BY br.branch_name, sl.location_name
            ) FILTER (WHERE ls.location_id IS NOT NULL), 
            '[]'::jsonb
        ),
        'suppliers', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'supplier_id', s.supplier_id,
                    'supplier_name', s.supplier_name,
                    'last_supply_price', sp.last_supply_price,
                    'lead_time_days', sp.lead_time_days,
                    'is_preferred', sp.is_preferred
                ) ORDER BY sp.is_preferred DESC, s.supplier_name
            ) FILTER (WHERE s.supplier_id IS NOT NULL), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM inventory.products p
    LEFT JOIN master.product_categories c ON p.category_id = c.category_id
    LEFT JOIN inventory.batches b ON p.product_id = b.product_id
    LEFT JOIN inventory.location_wise_stock ls ON p.product_id = ls.product_id
    LEFT JOIN inventory.storage_locations sl ON ls.location_id = sl.location_id
    LEFT JOIN master.branches br ON sl.branch_id = br.branch_id
    LEFT JOIN procurement.supplier_products sp ON p.product_id = sp.product_id AND sp.is_active = TRUE
    LEFT JOIN parties.suppliers s ON sp.supplier_id = s.supplier_id
    WHERE p.product_id = p_product_id
    AND p.is_active = TRUE
    GROUP BY p.product_id, c.category_id, ls.location_id, sl.location_id, br.branch_id;
    
    RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- =============================================
-- BRANCH MANAGEMENT API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_branches(
    p_org_id INTEGER,
    p_branch_type TEXT DEFAULT NULL,
    p_include_inactive BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'branches', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'branch_id', b.branch_id,
                    'branch_code', b.branch_code,
                    'branch_name', b.branch_name,
                    'branch_type', b.branch_type,
                    'is_head_office', b.is_head_office,
                    'gstin', b.gstin,
                    'address', b.address,
                    'contact_details', b.contact_details,
                    'is_active', b.is_active,
                    'storage_locations', COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'location_id', sl.location_id,
                                'location_code', sl.location_code,
                                'location_name', sl.location_name,
                                'location_type', sl.location_type,
                                'storage_class', sl.storage_class
                            ) ORDER BY sl.location_name
                        ) FILTER (WHERE sl.location_id IS NOT NULL), 
                        '[]'::jsonb
                    )
                ) ORDER BY b.branch_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM master.branches b
    LEFT JOIN inventory.storage_locations sl ON b.branch_id = sl.branch_id AND sl.is_active = TRUE
    WHERE b.org_id = p_org_id
    AND (p_branch_type IS NULL OR b.branch_type = p_branch_type)
    AND (p_include_inactive OR b.is_active = TRUE)
    GROUP BY b.branch_id;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- PRODUCT CATEGORY API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_product_categories(
    p_parent_id INTEGER DEFAULT NULL,
    p_category_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH RECURSIVE category_tree AS (
        -- Base case: get root categories or specific parent
        SELECT 
            c.category_id,
            c.category_name,
            c.category_code,
            c.parent_category_id,
            c.category_type,
            c.requires_prescription,
            c.requires_narcotic_license,
            1 as level
        FROM master.product_categories c
        WHERE (p_parent_id IS NULL AND c.parent_category_id IS NULL) 
           OR (p_parent_id IS NOT NULL AND c.parent_category_id = p_parent_id)
        AND c.is_active = TRUE
        
        UNION ALL
        
        -- Recursive case: get child categories
        SELECT 
            c.category_id,
            c.category_name,
            c.category_code,
            c.parent_category_id,
            c.category_type,
            c.requires_prescription,
            c.requires_narcotic_license,
            ct.level + 1
        FROM master.product_categories c
        INNER JOIN category_tree ct ON c.parent_category_id = ct.category_id
        WHERE c.is_active = TRUE
    )
    SELECT jsonb_build_object(
        'categories', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'category_id', ct.category_id,
                    'category_name', ct.category_name,
                    'category_code', ct.category_code,
                    'parent_category_id', ct.parent_category_id,
                    'category_type', ct.category_type,
                    'requires_prescription', ct.requires_prescription,
                    'requires_narcotic_license', ct.requires_narcotic_license,
                    'level', ct.level,
                    'product_count', COUNT(p.product_id)
                ) ORDER BY ct.level, ct.category_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM category_tree ct
    LEFT JOIN inventory.products p ON ct.category_id = p.category_id AND p.is_active = TRUE
    WHERE (p_category_type IS NULL OR ct.category_type = p_category_type)
    GROUP BY ct.category_id, ct.category_name, ct.category_code, 
             ct.parent_category_id, ct.category_type, ct.requires_prescription, 
             ct.requires_narcotic_license, ct.level;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- UNIT OF MEASUREMENT API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_units_of_measurement(
    p_uom_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'units', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'uom_id', u.uom_id,
                    'uom_code', u.uom_code,
                    'uom_name', u.uom_name,
                    'uom_type', u.uom_type,
                    'conversion_factor', u.conversion_factor,
                    'base_uom', jsonb_build_object(
                        'uom_id', b.uom_id,
                        'uom_code', b.uom_code,
                        'uom_name', b.uom_name
                    )
                ) ORDER BY u.uom_type, u.uom_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM master.units_of_measurement u
    LEFT JOIN master.units_of_measurement b ON u.base_uom_id = b.uom_id
    WHERE u.is_active = TRUE
    AND (p_uom_type IS NULL OR u.uom_type = p_uom_type);
    
    RETURN v_result;
END;
$$;

-- =============================================
-- TAX RATE API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_tax_rates(
    p_hsn_code TEXT DEFAULT NULL,
    p_effective_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'tax_rates', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'hsn_code', t.hsn_code,
                    'gst_percentage', t.gst_percentage,
                    'igst_rate', t.igst_rate,
                    'cgst_rate', t.cgst_rate,
                    'sgst_rate', t.sgst_rate,
                    'effective_from', t.effective_from,
                    'description', t.description
                ) ORDER BY t.hsn_code
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM master.tax_rates t
    WHERE t.is_active = TRUE
    AND (p_hsn_code IS NULL OR t.hsn_code = p_hsn_code)
    AND t.effective_from <= p_effective_date
    AND NOT EXISTS (
        SELECT 1 FROM master.tax_rates t2
        WHERE t2.hsn_code = t.hsn_code
        AND t2.effective_from > t.effective_from
        AND t2.effective_from <= p_effective_date
        AND t2.is_active = TRUE
    );
    
    RETURN v_result;
END;
$$;

-- =============================================
-- PACK CONFIGURATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_pack_configurations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'pack_configurations', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'config_id', p.config_id,
                    'config_name', p.config_name,
                    'base_unit', p.base_unit,
                    'pack_hierarchy', p.pack_hierarchy,
                    'usage_count', COUNT(pr.product_id)
                ) ORDER BY p.config_name
            ), 
            '[]'::jsonb
        )
    ) INTO v_result
    FROM master.pack_configurations p
    LEFT JOIN inventory.products pr ON pr.pack_configuration::jsonb->>'base_unit' = p.base_unit
    WHERE p.is_active = TRUE
    GROUP BY p.config_id;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.get_organization_details TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.search_products TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_product_details TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_branches TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_product_categories TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_units_of_measurement TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_tax_rates TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_pack_configurations TO authenticated_user;

COMMENT ON FUNCTION api.get_organization_details IS 'Get complete organization details including branches and licenses';
COMMENT ON FUNCTION api.search_products IS 'Search products with pagination and filters';
COMMENT ON FUNCTION api.get_product_details IS 'Get detailed product information including stock and suppliers';
COMMENT ON FUNCTION api.get_branches IS 'Get branch list with optional filters';
COMMENT ON FUNCTION api.get_product_categories IS 'Get hierarchical product category tree';
COMMENT ON FUNCTION api.get_units_of_measurement IS 'Get units of measurement with conversions';
COMMENT ON FUNCTION api.get_tax_rates IS 'Get applicable tax rates for HSN codes';
COMMENT ON FUNCTION api.get_pack_configurations IS 'Get pack hierarchy configurations';