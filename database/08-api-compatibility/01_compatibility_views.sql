-- =============================================
-- API COMPATIBILITY VIEWS
-- =============================================
-- These views maintain backward compatibility with existing APIs
-- Maps new schema structure to old API expectations
-- =============================================

-- =============================================
-- PRODUCTS VIEW (maps to old products table)
-- =============================================
CREATE OR REPLACE VIEW public.products AS
SELECT 
    p.product_id,
    p.org_id,
    p.product_code,
    p.product_name,
    p.generic_name,
    p.product_type,
    p.category,
    p.subcategory,
    p.manufacturer,
    p.brand,
    p.hsn_code,
    p.barcode,
    
    -- Pack information (flattened from JSONB)
    p.pack_config->>'base_uom' as uom,
    (p.pack_config->>'base_units_per_pack')::INTEGER as pack_size,
    p.pack_config->>'pack_type' as pack_type,
    
    -- Pricing (now comes from batches, show average)
    COALESCE(
        (SELECT AVG(b.mrp_per_unit) 
         FROM inventory.batches b 
         WHERE b.product_id = p.product_id 
         AND b.is_active = true), 
        0
    ) as mrp,
    
    -- Tax info
    COALESCE(p.tax_config->>'gst_rate', '0')::NUMERIC as gst_percentage,
    
    -- Stock (aggregated from all batches/locations)
    COALESCE(
        (SELECT SUM(lws.quantity_available - COALESCE(lws.quantity_reserved, 0))
         FROM inventory.location_wise_stock lws
         WHERE lws.product_id = p.product_id), 
        0
    ) as current_stock,
    
    -- Settings
    p.is_active,
    p.allow_negative_stock,
    p.maintain_batch,
    p.maintain_expiry,
    
    -- Timestamps
    p.created_at,
    p.updated_at
FROM inventory.products p
WHERE p.is_active = true;

-- Grant permissions
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

-- =============================================
-- CUSTOMERS VIEW (maps to old customers table)
-- =============================================
CREATE OR REPLACE VIEW public.customers AS
SELECT 
    c.customer_id,
    c.org_id,
    c.customer_code,
    c.customer_name,
    c.customer_type,
    
    -- Contact (flattened from JSONB)
    c.contact_info->>'primary_phone' as phone,
    c.contact_info->>'primary_email' as email,
    c.contact_info->>'contact_person' as contact_person,
    
    -- Address (get primary billing address)
    COALESCE(
        (SELECT 
            a.address_line1 || 
            COALESCE(', ' || a.address_line2, '') || 
            ', ' || a.city || ', ' || a.state_name || ' - ' || a.pincode
         FROM master.addresses a
         WHERE a.entity_type = 'customer'
         AND a.entity_id = c.customer_id
         AND a.address_type = 'billing'
         AND a.is_default = true
         LIMIT 1),
        ''
    ) as address,
    
    -- Separate address fields for compatibility
    (SELECT a.city FROM master.addresses a 
     WHERE a.entity_type = 'customer' AND a.entity_id = c.customer_id 
     AND a.address_type = 'billing' AND a.is_default = true LIMIT 1) as city,
     
    (SELECT a.state_name FROM master.addresses a 
     WHERE a.entity_type = 'customer' AND a.entity_id = c.customer_id 
     AND a.address_type = 'billing' AND a.is_default = true LIMIT 1) as state,
     
    (SELECT a.pincode FROM master.addresses a 
     WHERE a.entity_type = 'customer' AND a.entity_id = c.customer_id 
     AND a.address_type = 'billing' AND a.is_default = true LIMIT 1) as pincode,
    
    -- Business info
    c.business_info->>'gst_number' as gst_number,
    c.business_info->>'pan_number' as pan_number,
    c.business_info->>'drug_license_number' as drug_license_number,
    
    -- Credit info
    (c.credit_info->>'credit_limit')::NUMERIC as credit_limit,
    (c.credit_info->>'credit_days')::INTEGER as credit_days,
    
    -- Outstanding
    COALESCE(
        (SELECT SUM(co.outstanding_amount)
         FROM financial.customer_outstanding co
         WHERE co.customer_id = c.customer_id
         AND co.status IN ('open', 'partial')),
        0
    ) as outstanding_amount,
    
    -- Status
    c.is_active,
    
    -- Timestamps
    c.created_at,
    c.updated_at
FROM parties.customers c;

-- Grant permissions
GRANT SELECT ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;

-- =============================================
-- ORDERS VIEW (maps to old orders table)
-- =============================================
CREATE OR REPLACE VIEW public.orders AS
SELECT 
    o.order_id,
    o.org_id,
    o.order_number,
    o.order_date,
    o.customer_id,
    
    -- Customer info (denormalized for compatibility)
    c.customer_name,
    c.contact_info->>'primary_phone' as customer_phone,
    
    -- Delivery info
    o.delivery_date,
    da.address_line1 || COALESCE(', ' || da.address_line2, '') as delivery_address,
    
    -- Amounts
    o.subtotal_amount,
    o.discount_amount,
    o.tax_amount,
    o.final_amount as total_amount,
    
    -- Status
    o.order_status,
    o.payment_status,
    
    -- Additional fields
    o.notes,
    o.internal_notes,
    
    -- User info
    o.created_by as user_id,
    u.full_name as created_by_name,
    
    -- Timestamps
    o.created_at,
    o.updated_at
FROM sales.orders o
JOIN parties.customers c ON o.customer_id = c.customer_id
LEFT JOIN master.addresses da ON da.address_id = o.delivery_address_id
LEFT JOIN master.org_users u ON u.user_id = o.created_by;

-- Grant permissions
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- =============================================
-- ORDER_ITEMS VIEW (maps to old order_items table)
-- =============================================
CREATE OR REPLACE VIEW public.order_items AS
SELECT 
    oi.order_item_id,
    oi.order_id,
    oi.product_id,
    
    -- Product info
    p.product_name,
    p.product_code,
    
    -- Quantity and pricing
    oi.quantity,
    oi.pack_type as unit,
    oi.unit_price,
    oi.discount_percent,
    oi.discount_amount,
    
    -- Tax
    COALESCE(oi.tax_percent, 0) as tax_percentage,
    oi.tax_amount,
    
    -- Totals
    oi.line_total as total_amount,
    
    -- Batch info (if single batch, for compatibility)
    CASE 
        WHEN jsonb_array_length(oi.batch_allocation) = 1 
        THEN (oi.batch_allocation->0->>'batch_number')::TEXT
        ELSE NULL
    END as batch_number,
    
    -- Status
    oi.item_status as status
FROM sales.order_items oi
JOIN inventory.products p ON oi.product_id = p.product_id;

-- Grant permissions
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

-- =============================================
-- INVOICES VIEW (maps to old invoices table)
-- =============================================
CREATE OR REPLACE VIEW public.invoices AS
SELECT 
    i.invoice_id,
    i.org_id,
    i.invoice_number,
    i.invoice_date,
    i.order_id,
    i.customer_id,
    
    -- Customer info
    c.customer_name,
    c.business_info->>'gst_number' as customer_gst,
    
    -- Amounts
    i.subtotal_amount,
    i.discount_amount,
    i.taxable_amount,
    i.igst_amount,
    i.cgst_amount,
    i.sgst_amount,
    i.total_tax_amount as tax_amount,
    i.final_amount as total_amount,
    
    -- Payment info
    i.payment_status,
    i.paid_amount,
    
    -- Status
    i.invoice_status as status,
    
    -- Additional
    i.notes,
    i.created_by,
    i.created_at,
    i.updated_at
FROM sales.invoices i
JOIN parties.customers c ON i.customer_id = c.customer_id;

-- Grant permissions
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

-- =============================================
-- BATCHES VIEW (simplified for old API)
-- =============================================
CREATE OR REPLACE VIEW public.batches AS
SELECT 
    b.batch_id,
    b.product_id,
    b.batch_number,
    b.manufacturing_date,
    b.expiry_date,
    
    -- Quantity
    b.quantity_available as available_quantity,
    b.quantity_reserved as reserved_quantity,
    
    -- Pricing (converted to old structure)
    b.cost_per_unit as purchase_rate,
    b.mrp_per_unit as mrp,
    b.sale_price_per_unit as ptr,
    
    -- Location (primary location for compatibility)
    b.primary_location_id as location_id,
    
    -- Status
    b.is_active,
    b.expiry_status as status,
    
    -- Timestamps
    b.created_at,
    b.updated_at
FROM inventory.batches b
WHERE b.is_active = true;

-- Grant permissions
GRANT SELECT ON public.batches TO authenticated;
GRANT ALL ON public.batches TO service_role;

-- =============================================
-- PAYMENTS VIEW (unified payments)
-- =============================================
CREATE OR REPLACE VIEW public.payments AS
SELECT 
    p.payment_id,
    p.org_id,
    p.payment_number,
    p.payment_date,
    p.payment_type,
    
    -- Party info (customer or supplier)
    p.party_type,
    p.party_id,
    CASE 
        WHEN p.party_type = 'customer' THEN c.customer_name
        WHEN p.party_type = 'supplier' THEN s.supplier_name
    END as party_name,
    
    -- Payment details
    p.payment_amount as amount,
    pm.method_name as payment_mode,
    p.reference_number,
    
    -- Bank info
    ba.account_name as bank_account,
    
    -- Status
    p.payment_status as status,
    
    -- Timestamps
    p.created_at,
    p.created_by
FROM financial.payments p
LEFT JOIN parties.customers c ON p.party_type = 'customer' AND p.party_id = c.customer_id
LEFT JOIN parties.suppliers s ON p.party_type = 'supplier' AND p.party_id = s.supplier_id
LEFT JOIN financial.payment_methods pm ON p.payment_method_id = pm.payment_method_id
LEFT JOIN master.org_bank_accounts ba ON p.bank_account_id = ba.bank_account_id;

-- Grant permissions
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

-- =============================================
-- SUPPLIERS VIEW (maps to old suppliers table)
-- =============================================
CREATE OR REPLACE VIEW public.suppliers AS
SELECT 
    s.supplier_id,
    s.org_id,
    s.supplier_code,
    s.supplier_name,
    s.supplier_type,
    
    -- Contact info
    s.contact_info->>'primary_phone' as phone,
    s.contact_info->>'primary_email' as email,
    s.contact_info->>'contact_person' as contact_person,
    
    -- Business info
    s.business_info->>'gst_number' as gst_number,
    s.business_info->>'pan_number' as pan_number,
    s.business_info->>'drug_license_number' as drug_license_number,
    
    -- Terms
    (s.payment_terms->>'payment_days')::INTEGER as payment_terms,
    
    -- Status
    s.is_active,
    
    -- Timestamps
    s.created_at,
    s.updated_at
FROM parties.suppliers s;

-- Grant permissions
GRANT SELECT ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

-- =============================================
-- PURCHASES VIEW (maps to old purchases table)
-- =============================================
CREATE OR REPLACE VIEW public.purchases AS
SELECT 
    po.purchase_order_id as purchase_id,
    po.org_id,
    po.po_number as purchase_number,
    po.po_date as purchase_date,
    po.supplier_id,
    
    -- Supplier info
    s.supplier_name,
    
    -- Reference
    po.supplier_reference as supplier_invoice_number,
    
    -- Amounts
    po.subtotal_amount,
    po.discount_amount,
    po.tax_amount,
    po.total_amount,
    
    -- Status
    po.po_status as purchase_status,
    
    -- Timestamps
    po.created_at,
    po.updated_at
FROM procurement.purchase_orders po
JOIN parties.suppliers s ON po.supplier_id = s.supplier_id;

-- Grant permissions
GRANT SELECT ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

-- =============================================
-- INVENTORY_MOVEMENTS VIEW
-- =============================================
CREATE OR REPLACE VIEW public.inventory_movements AS
SELECT 
    im.movement_id,
    im.org_id,
    im.movement_type,
    im.movement_date,
    im.product_id,
    im.batch_id,
    im.location_id,
    im.quantity,
    im.movement_direction,
    im.reference_type,
    im.reference_id,
    im.created_by,
    im.created_at
FROM inventory.inventory_movements im;

-- Grant permissions
GRANT SELECT ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;

-- =============================================
-- ORG_USERS VIEW (simplified)
-- =============================================
CREATE OR REPLACE VIEW public.org_users AS
SELECT 
    u.user_id,
    u.org_id,
    u.username,
    u.email,
    u.mobile_number as phone,
    u.full_name,
    u.role_id,
    r.role_name,
    u.is_active,
    u.created_at
FROM master.org_users u
LEFT JOIN master.roles r ON u.role_id = r.role_id;

-- Grant permissions
GRANT SELECT ON public.org_users TO authenticated;
GRANT ALL ON public.org_users TO service_role;

-- =============================================
-- SETTINGS VIEW (flattened settings)
-- =============================================
CREATE OR REPLACE VIEW public.app_settings AS
SELECT 
    s.setting_id,
    s.org_id,
    s.setting_category,
    s.setting_key,
    s.setting_value,
    s.setting_type,
    s.is_active
FROM system_config.system_settings s
WHERE s.is_active = true;

-- Grant permissions
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- =============================================
-- Create update rules for views to handle inserts/updates
-- =============================================

-- Products insert/update rule
CREATE OR REPLACE RULE products_insert AS ON INSERT TO public.products
DO INSTEAD
INSERT INTO inventory.products (
    org_id, product_code, product_name, generic_name, 
    product_type, category, subcategory, manufacturer, 
    brand, hsn_code, barcode, is_active
) VALUES (
    NEW.org_id, NEW.product_code, NEW.product_name, NEW.generic_name,
    NEW.product_type, NEW.category, NEW.subcategory, NEW.manufacturer,
    NEW.brand, NEW.hsn_code, NEW.barcode, NEW.is_active
) RETURNING *;

-- Customers insert/update rule
CREATE OR REPLACE RULE customers_insert AS ON INSERT TO public.customers
DO INSTEAD (
    INSERT INTO parties.customers (
        org_id, customer_code, customer_name, customer_type,
        contact_info, business_info, credit_info, is_active
    ) VALUES (
        NEW.org_id, NEW.customer_code, NEW.customer_name, NEW.customer_type,
        jsonb_build_object(
            'primary_phone', NEW.phone,
            'primary_email', NEW.email,
            'contact_person', NEW.contact_person
        ),
        jsonb_build_object(
            'gst_number', NEW.gst_number,
            'pan_number', NEW.pan_number,
            'drug_license_number', NEW.drug_license_number
        ),
        jsonb_build_object(
            'credit_limit', NEW.credit_limit,
            'credit_days', NEW.credit_days
        ),
        NEW.is_active
    );
    
    -- Also insert address if provided
    INSERT INTO master.addresses (
        org_id, entity_type, entity_id, address_type,
        address_line1, city, state_name, pincode
    )
    SELECT 
        NEW.org_id, 'customer', currval('parties.customers_customer_id_seq'), 'billing',
        NEW.address, NEW.city, NEW.state, NEW.pincode
    WHERE NEW.address IS NOT NULL;
);

-- Add similar rules for other views as needed...

-- =============================================
-- HELPER FUNCTIONS FOR API COMPATIBILITY
-- =============================================

-- Function to get product stock
CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id INTEGER)
RETURNS NUMERIC AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(quantity_available - COALESCE(quantity_reserved, 0))
         FROM inventory.location_wise_stock
         WHERE product_id = p_product_id), 
        0
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get customer outstanding
CREATE OR REPLACE FUNCTION public.get_customer_outstanding(p_customer_id INTEGER)
RETURNS NUMERIC AS $$
BEGIN
    RETURN COALESCE(
        (SELECT SUM(outstanding_amount)
         FROM financial.customer_outstanding
         WHERE customer_id = p_customer_id
         AND status IN ('open', 'partial')),
        0
    );
END;
$$ LANGUAGE plpgsql;