-- =============================================
-- API COMPATIBILITY VIEWS (FIXED)
-- =============================================
-- These views maintain backward compatibility with existing APIs
-- Maps new schema structure to old API expectations
-- =============================================

-- Drop existing views first
DROP VIEW IF EXISTS public.customers CASCADE;
DROP VIEW IF EXISTS public.products CASCADE;
DROP VIEW IF EXISTS public.orders CASCADE;
DROP VIEW IF EXISTS public.order_items CASCADE;

-- =============================================
-- CUSTOMERS VIEW (maps parties.customers to old API format)
-- =============================================
CREATE OR REPLACE VIEW public.customers AS
SELECT 
    c.customer_id,
    c.org_id,
    c.customer_code,
    c.customer_name,
    c.customer_type,
    
    -- Map new column names to old API expectations
    c.primary_phone as phone,
    c.primary_email as email,
    c.contact_person_name as contact_person,
    c.secondary_phone as alternate_phone,
    
    -- Address fields (from customer_addresses table)
    a.address_line1,
    a.address_line2,
    a.area_name as area,
    a.city,
    a.state,
    a.pincode,
    
    -- Business info (map to old names)
    c.gst_number as gstin,
    c.pan_number,
    c.drug_license_number,
    
    -- Credit info
    c.credit_limit,
    c.credit_days,
    COALESCE(c.discount_group_id, 0) as discount_percent, -- Simplified for now
    
    -- Outstanding
    c.current_outstanding as outstanding_amount,
    
    -- Business metrics
    c.total_business_amount as total_business,
    c.last_transaction_date as last_order_date,
    c.total_transactions as total_orders,
    
    -- Notes
    c.internal_notes as notes,
    
    -- Status
    c.is_active,
    
    -- Timestamps
    c.created_at,
    c.updated_at
FROM parties.customers c
LEFT JOIN parties.customer_addresses a ON c.customer_id = a.customer_id 
    AND a.is_primary = true AND a.is_active = true;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

-- Create trigger for INSERT operations on the view
CREATE OR REPLACE FUNCTION public.handle_customer_insert()
RETURNS trigger AS $$
DECLARE
    v_customer_id INTEGER;
BEGIN
    -- Insert into parties.customers
    INSERT INTO parties.customers (
        org_id, customer_code, customer_name, customer_type,
        primary_phone, primary_email, secondary_phone,
        contact_person_name, gst_number, pan_number,
        drug_license_number, credit_limit, credit_days,
        internal_notes, is_active
    ) VALUES (
        NEW.org_id, NEW.customer_code, NEW.customer_name, NEW.customer_type,
        NEW.phone, NEW.email, NEW.alternate_phone,
        NEW.contact_person, NEW.gstin, NEW.pan_number,
        NEW.drug_license_number, NEW.credit_limit, NEW.credit_days,
        NEW.notes, COALESCE(NEW.is_active, true)
    ) RETURNING customer_id INTO v_customer_id;
    
    -- Insert address if provided
    IF NEW.address_line1 IS NOT NULL OR NEW.city IS NOT NULL THEN
        INSERT INTO parties.customer_addresses (
            customer_id, address_type, address_line1, address_line2,
            area_name, city, state, pincode, is_primary, is_active
        ) VALUES (
            v_customer_id, 'billing', NEW.address_line1, NEW.address_line2,
            NEW.area, NEW.city, NEW.state, NEW.pincode, true, true
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_insert_trigger
    INSTEAD OF INSERT ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.handle_customer_insert();

-- Create trigger for UPDATE operations on the view
CREATE OR REPLACE FUNCTION public.handle_customer_update()
RETURNS trigger AS $$
BEGIN
    -- Update parties.customers
    UPDATE parties.customers SET
        customer_name = NEW.customer_name,
        customer_type = NEW.customer_type,
        primary_phone = NEW.phone,
        primary_email = NEW.email,
        secondary_phone = NEW.alternate_phone,
        contact_person_name = NEW.contact_person,
        gst_number = NEW.gstin,
        pan_number = NEW.pan_number,
        drug_license_number = NEW.drug_license_number,
        credit_limit = NEW.credit_limit,
        credit_days = NEW.credit_days,
        internal_notes = NEW.notes,
        is_active = NEW.is_active,
        updated_at = CURRENT_TIMESTAMP
    WHERE customer_id = NEW.customer_id;
    
    -- Update or insert address
    IF NEW.address_line1 IS NOT NULL OR NEW.city IS NOT NULL THEN
        INSERT INTO parties.customer_addresses (
            customer_id, address_type, address_line1, address_line2,
            area_name, city, state, pincode, is_primary, is_active
        ) VALUES (
            NEW.customer_id, 'billing', NEW.address_line1, NEW.address_line2,
            NEW.area, NEW.city, NEW.state, NEW.pincode, true, true
        )
        ON CONFLICT (customer_id, address_type) WHERE is_primary = true
        DO UPDATE SET
            address_line1 = EXCLUDED.address_line1,
            address_line2 = EXCLUDED.address_line2,
            area_name = EXCLUDED.area_name,
            city = EXCLUDED.city,
            state = EXCLUDED.state,
            pincode = EXCLUDED.pincode;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_update_trigger
    INSTEAD OF UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.handle_customer_update();

-- =============================================
-- PRODUCTS VIEW (keep existing, seems correct)
-- =============================================
CREATE OR REPLACE VIEW public.products AS
SELECT 
    p.product_id,
    p.org_id,
    p.product_code,
    p.product_name,
    p.generic_name,
    p.product_type,
    p.category_id as category,
    p.subcategory_id as subcategory,
    p.manufacturer,
    p.brand_id as brand,
    p.hsn_code,
    p.barcode,
    
    -- Pack information
    p.base_unit_type as uom,
    p.base_units_per_pack as pack_size,
    p.pack_unit_type as pack_type,
    
    -- Pricing
    p.current_mrp as mrp,
    
    -- Tax info
    p.gst_percentage,
    
    -- Stock (aggregated)
    COALESCE(
        (SELECT SUM(lws.quantity_available - COALESCE(lws.quantity_reserved, 0))
         FROM inventory.location_wise_stock lws
         WHERE lws.product_id = p.product_id), 
        0
    ) as current_stock,
    
    -- Settings
    p.is_active,
    p.allow_negative_stock,
    p.maintain_batch_number as maintain_batch,
    p.maintain_expiry_date as maintain_expiry,
    
    -- Timestamps
    p.created_at,
    p.updated_at
FROM inventory.products p
WHERE p.is_active = true;

-- Grant permissions
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- =============================================
-- BATCHES VIEW (simple pass-through)
-- =============================================
CREATE OR REPLACE VIEW public.batches AS
SELECT * FROM inventory.batches;

GRANT SELECT ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;