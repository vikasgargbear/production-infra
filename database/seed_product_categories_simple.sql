-- Simplified Product Categories for Pharmaceutical System
-- Only broad categories without depth

-- Function to seed simplified product categories for an organization
CREATE OR REPLACE FUNCTION seed_product_categories_simple_for_org(p_org_id UUID)
RETURNS void AS $$
BEGIN
    -- Clear existing categories for this org
    DELETE FROM inventory.product_categories WHERE org_id = p_org_id;
    
    -- Insert broad categories only
    INSERT INTO inventory.product_categories (
        org_id, category_code, category_name,
        parent_category_id, category_level, default_hsn_code, 
        default_gst_rate, is_active, created_at, updated_at
    ) VALUES
    -- Main pharmaceutical product forms
    (p_org_id, 'TAB', 'Tablets', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'CAP', 'Capsules', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'INJ', 'Injections', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'SYR', 'Syrups', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'SUSP', 'Suspensions', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'DROP', 'Drops', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'OINT', 'Ointments', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'CRM', 'Creams', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'GEL', 'Gels', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'LOT', 'Lotions', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'POW', 'Powders', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'SACH', 'Sachets', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'INH', 'Inhalers', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'SPRAY', 'Sprays', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'PATCH', 'Patches', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'SUPP', 'Suppositories', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'IV', 'IV Fluids', NULL, 1, '3004', 5.00, true, NOW(), NOW()),
    (p_org_id, 'VACC', 'Vaccines', NULL, 1, '3002', 5.00, true, NOW(), NOW()),
    (p_org_id, 'SURG', 'Surgical Items', NULL, 1, '9018', 12.00, true, NOW(), NOW()),
    (p_org_id, 'MED', 'Medical Devices', NULL, 1, '9018', 12.00, true, NOW(), NOW()),
    (p_org_id, 'CONS', 'Consumables', NULL, 1, '3005', 12.00, true, NOW(), NOW()),
    (p_org_id, 'NUTR', 'Nutritionals', NULL, 1, '2106', 18.00, true, NOW(), NOW()),
    (p_org_id, 'AYUR', 'Ayurvedic', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'HOMEO', 'Homeopathic', NULL, 1, '3004', 12.00, true, NOW(), NOW()),
    (p_org_id, 'OTC', 'OTC Products', NULL, 1, '3004', 18.00, true, NOW(), NOW())
    ON CONFLICT (org_id, category_code) DO UPDATE
    SET category_name = EXCLUDED.category_name,
        default_hsn_code = EXCLUDED.default_hsn_code,
        default_gst_rate = EXCLUDED.default_gst_rate,
        updated_at = NOW();
        
END;
$$ LANGUAGE plpgsql;

-- Execute for the default organization
SELECT seed_product_categories_simple_for_org('e78d6777-35f6-4b19-994f-caaede2f021a'::uuid);

-- Verify the categories
SELECT category_code, category_name, default_hsn_code, default_gst_rate 
FROM inventory.product_categories 
WHERE org_id = 'e78d6777-35f6-4b19-994f-caaede2f021a'::uuid
ORDER BY category_name;