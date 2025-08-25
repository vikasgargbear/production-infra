-- Seed Product Categories for Pharmaceutical System
-- This script inserts comprehensive product categories covering all major pharmaceutical types

-- Function to insert categories for a specific organization
CREATE OR REPLACE FUNCTION seed_product_categories_for_org(p_org_id UUID)
RETURNS void AS $$
BEGIN
    -- Clear existing categories for this org (optional - comment out if you want to keep existing)
    -- DELETE FROM inventory.product_categories WHERE org_id = p_org_id;

    -- Main Categories (Level 1)
    INSERT INTO inventory.product_categories (
        org_id, category_code, category_name, category_level, category_type,
        requires_prescription, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    -- Oral Solids
    (p_org_id, 'ORAL_SOLIDS', 'Oral Solids', 1, 'standard', false, '3004', 12.00, 1),
    -- Oral Liquids
    (p_org_id, 'ORAL_LIQUIDS', 'Oral Liquids', 1, 'standard', false, '3004', 12.00, 2),
    -- Injectables
    (p_org_id, 'INJECTABLES', 'Injectables', 1, 'standard', true, '3004', 12.00, 3),
    -- Topical
    (p_org_id, 'TOPICAL', 'Topical Preparations', 1, 'standard', false, '3004', 12.00, 4),
    -- Surgical & Medical Devices
    (p_org_id, 'SURGICAL', 'Surgical & Medical Devices', 1, 'standard', false, '9018', 12.00, 5),
    -- Ayurvedic & Herbal
    (p_org_id, 'AYURVEDIC', 'Ayurvedic & Herbal', 1, 'standard', false, '3004', 12.00, 6),
    -- Nutraceuticals
    (p_org_id, 'NUTRA', 'Nutraceuticals & Supplements', 1, 'standard', false, '2106', 18.00, 7),
    -- OTC Products
    (p_org_id, 'OTC', 'OTC Products', 1, 'standard', false, '3004', 12.00, 8)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Sub-Categories (Level 2) - Oral Solids
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, requires_prescription, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'TABLETS', 'Tablets', 2, 'ORAL_SOLIDS/TABLETS', false, '3004', 12.00, 1),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'CAPSULES', 'Capsules', 2, 'ORAL_SOLIDS/CAPSULES', false, '3004', 12.00, 2),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'POWDERS', 'Powders', 2, 'ORAL_SOLIDS/POWDERS', false, '3004', 12.00, 3),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'GRANULES', 'Granules', 2, 'ORAL_SOLIDS/GRANULES', false, '3004', 12.00, 4),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'SACHETS', 'Sachets', 2, 'ORAL_SOLIDS/SACHETS', false, '3004', 12.00, 5),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'CHEWABLE_TABS', 'Chewable Tablets', 2, 'ORAL_SOLIDS/CHEWABLE_TABS', false, '3004', 12.00, 6),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'DISPERSIBLE_TABS', 'Dispersible Tablets', 2, 'ORAL_SOLIDS/DISPERSIBLE_TABS', false, '3004', 12.00, 7),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_SOLIDS'),
     'EFFERVESCENT_TABS', 'Effervescent Tablets', 2, 'ORAL_SOLIDS/EFFERVESCENT_TABS', false, '3004', 12.00, 8)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Sub-Categories (Level 2) - Oral Liquids
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, requires_prescription, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_LIQUIDS'),
     'SYRUPS', 'Syrups', 2, 'ORAL_LIQUIDS/SYRUPS', false, '3004', 12.00, 1),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_LIQUIDS'),
     'SUSPENSIONS', 'Suspensions', 2, 'ORAL_LIQUIDS/SUSPENSIONS', false, '3004', 12.00, 2),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_LIQUIDS'),
     'DROPS', 'Drops', 2, 'ORAL_LIQUIDS/DROPS', false, '3004', 12.00, 3),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_LIQUIDS'),
     'ELIXIRS', 'Elixirs', 2, 'ORAL_LIQUIDS/ELIXIRS', false, '3004', 12.00, 4),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_LIQUIDS'),
     'SOLUTIONS', 'Solutions', 2, 'ORAL_LIQUIDS/SOLUTIONS', false, '3004', 12.00, 5),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'ORAL_LIQUIDS'),
     'EMULSIONS', 'Emulsions', 2, 'ORAL_LIQUIDS/EMULSIONS', false, '3004', 12.00, 6)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Sub-Categories (Level 2) - Injectables
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, requires_prescription, requires_license, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'VIALS', 'Vials', 2, 'INJECTABLES/VIALS', true, true, '3004', 12.00, 1),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'AMPOULES', 'Ampoules', 2, 'INJECTABLES/AMPOULES', true, true, '3004', 12.00, 2),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'PREFILLED_SYRINGES', 'Pre-filled Syringes', 2, 'INJECTABLES/PREFILLED_SYRINGES', true, true, '3004', 12.00, 3),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'IV_FLUIDS', 'IV Fluids', 2, 'INJECTABLES/IV_FLUIDS', true, true, '3004', 5.00, 4),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'INSULIN', 'Insulin', 2, 'INJECTABLES/INSULIN', true, true, '3004', 5.00, 5),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'VACCINES', 'Vaccines', 2, 'INJECTABLES/VACCINES', true, true, '3002', 5.00, 6)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Sub-Categories (Level 2) - Topical
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, requires_prescription, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'CREAMS', 'Creams', 2, 'TOPICAL/CREAMS', false, '3004', 12.00, 1),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'OINTMENTS', 'Ointments', 2, 'TOPICAL/OINTMENTS', false, '3004', 12.00, 2),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'GELS', 'Gels', 2, 'TOPICAL/GELS', false, '3004', 12.00, 3),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'LOTIONS', 'Lotions', 2, 'TOPICAL/LOTIONS', false, '3004', 12.00, 4),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'SPRAYS', 'Sprays', 2, 'TOPICAL/SPRAYS', false, '3004', 12.00, 5),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'PATCHES', 'Patches', 2, 'TOPICAL/PATCHES', false, '3004', 12.00, 6),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'POWDERS_TOPICAL', 'Powders (Topical)', 2, 'TOPICAL/POWDERS_TOPICAL', false, '3004', 12.00, 7)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Sub-Categories (Level 2) - Surgical & Medical Devices
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'SURGICAL'),
     'SYRINGES_NEEDLES', 'Syringes & Needles', 2, 'SURGICAL/SYRINGES_NEEDLES', '9018', 12.00, 1),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'SURGICAL'),
     'BANDAGES', 'Bandages & Dressings', 2, 'SURGICAL/BANDAGES', '3005', 12.00, 2),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'SURGICAL'),
     'GLOVES', 'Gloves', 2, 'SURGICAL/GLOVES', '4015', 12.00, 3),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'SURGICAL'),
     'MASKS', 'Masks', 2, 'SURGICAL/MASKS', '6307', 5.00, 4),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'SURGICAL'),
     'SURGICAL_INSTRUMENTS', 'Surgical Instruments', 2, 'SURGICAL/SURGICAL_INSTRUMENTS', '9018', 12.00, 5),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'SURGICAL'),
     'DIAGNOSTIC_DEVICES', 'Diagnostic Devices', 2, 'SURGICAL/DIAGNOSTIC_DEVICES', '9018', 12.00, 6)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Sub-Categories (Level 2) - Special Categories
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, requires_prescription, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    -- Eye/Ear/Nasal
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'EYE_DROPS', 'Eye Drops', 2, 'TOPICAL/EYE_DROPS', false, '3004', 12.00, 8),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'EAR_DROPS', 'Ear Drops', 2, 'TOPICAL/EAR_DROPS', false, '3004', 12.00, 9),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'NASAL_DROPS', 'Nasal Drops/Sprays', 2, 'TOPICAL/NASAL_DROPS', false, '3004', 12.00, 10),
    -- Respiratory
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'INHALERS', 'Inhalers', 2, 'INJECTABLES/INHALERS', true, '3004', 12.00, 7),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'INJECTABLES'),
     'NEBULIZER_SOLUTIONS', 'Nebulizer Solutions', 2, 'INJECTABLES/NEBULIZER_SOLUTIONS', true, '3004', 12.00, 8),
    -- Suppositories & Pessaries
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'SUPPOSITORIES', 'Suppositories', 2, 'TOPICAL/SUPPOSITORIES', false, '3004', 12.00, 11),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TOPICAL'),
     'PESSARIES', 'Pessaries', 2, 'TOPICAL/PESSARIES', false, '3004', 12.00, 12)
    ON CONFLICT (org_id, category_code) DO NOTHING;

    -- Specific Therapy Categories (Level 3 examples)
    INSERT INTO inventory.product_categories (
        org_id, parent_category_id, category_code, category_name, category_level,
        category_path, requires_prescription, default_hsn_code, default_gst_rate, display_order
    ) VALUES
    -- Antibiotics
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TABLETS'),
     'ANTIBIOTICS_TABS', 'Antibiotic Tablets', 3, 'ORAL_SOLIDS/TABLETS/ANTIBIOTICS_TABS', true, '3004', 12.00, 1),
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'CAPSULES'),
     'ANTIBIOTICS_CAPS', 'Antibiotic Capsules', 3, 'ORAL_SOLIDS/CAPSULES/ANTIBIOTICS_CAPS', true, '3004', 12.00, 1),
    -- Pain Management
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TABLETS'),
     'ANALGESICS_TABS', 'Analgesic Tablets', 3, 'ORAL_SOLIDS/TABLETS/ANALGESICS_TABS', false, '3004', 12.00, 2),
    -- Cardiovascular
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TABLETS'),
     'CARDIAC_TABS', 'Cardiac Tablets', 3, 'ORAL_SOLIDS/TABLETS/CARDIAC_TABS', true, '3004', 12.00, 3),
    -- Diabetes
    (p_org_id, (SELECT category_id FROM inventory.product_categories WHERE org_id = p_org_id AND category_code = 'TABLETS'),
     'ANTIDIABETIC_TABS', 'Antidiabetic Tablets', 3, 'ORAL_SOLIDS/TABLETS/ANTIDIABETIC_TABS', true, '3004', 12.00, 4)
    ON CONFLICT (org_id, category_code) DO NOTHING;

END;
$$ LANGUAGE plpgsql;

-- Execute for the specific organization
-- Replace with actual org_id
SELECT seed_product_categories_for_org('e78d6777-35f6-4b19-994f-caaede2f021a');

-- To seed for all organizations (optional)
-- SELECT seed_product_categories_for_org(org_id) FROM master.organizations;

-- Verify the data
SELECT 
    pc.category_id,
    pc.category_code,
    pc.category_name,
    pc.category_level,
    parent.category_name as parent_category,
    pc.requires_prescription,
    pc.default_hsn_code,
    pc.default_gst_rate
FROM inventory.product_categories pc
LEFT JOIN inventory.product_categories parent ON pc.parent_category_id = parent.category_id
WHERE pc.org_id = 'e78d6777-35f6-4b19-994f-caaede2f021a'
ORDER BY pc.category_level, pc.display_order;