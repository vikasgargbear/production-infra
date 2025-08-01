-- =============================================
-- INVENTORY MANAGEMENT TABLES
-- =============================================
-- Schema: inventory
-- Tables: 13
-- Purpose: Product, batch, stock, and warehouse management
-- =============================================

-- 1. Product Categories
CREATE TABLE inventory.product_categories (
    category_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Category hierarchy
    parent_category_id INTEGER REFERENCES inventory.product_categories(category_id),
    category_code TEXT NOT NULL,
    category_name TEXT NOT NULL,
    category_level INTEGER NOT NULL DEFAULT 1,
    category_path TEXT, -- Materialized path like 'Medicines/Tablets/Antibiotics'
    
    -- Classification
    category_type TEXT DEFAULT 'standard', -- 'standard', 'narcotic', 'psychotropic', 'controlled'
    requires_prescription BOOLEAN DEFAULT false,
    requires_license BOOLEAN DEFAULT false,
    
    -- Display
    display_order INTEGER,
    icon_name TEXT,
    color_code TEXT,
    
    -- GST defaults
    default_hsn_code TEXT,
    default_gst_rate NUMERIC(5,2),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, category_code)
);

-- 2. Product Types (Tablet, Capsule, Syrup, Injection, etc.)
CREATE TABLE inventory.product_types (
    type_id SERIAL PRIMARY KEY,
    
    -- Type definition
    type_code TEXT NOT NULL UNIQUE,
    type_name TEXT NOT NULL,
    
    -- Default units
    default_base_uom TEXT NOT NULL, -- 'TABLET', 'ML', 'GRAM'
    default_purchase_uom TEXT,
    default_sale_uom TEXT,
    default_display_uom TEXT,
    
    -- Pack configuration hints
    typical_pack_sizes INTEGER[], -- [10, 15, 30] for tablets
    
    -- Properties
    is_liquid BOOLEAN DEFAULT false,
    is_injectable BOOLEAN DEFAULT false,
    requires_cold_storage BOOLEAN DEFAULT false,
    
    -- Status
    is_active BOOLEAN DEFAULT true
);

-- 3. Units of Measure
CREATE TABLE inventory.units_of_measure (
    uom_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- UOM definition
    uom_code TEXT NOT NULL,
    uom_name TEXT NOT NULL,
    uom_type TEXT NOT NULL, -- 'base', 'pack', 'volume', 'weight'
    
    -- Conversion (to base unit)
    base_uom_code TEXT,
    conversion_factor NUMERIC(15,6) DEFAULT 1,
    
    -- Display
    symbol TEXT,
    decimal_places INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, uom_code)
);

-- 4. Products (Master product catalog)
CREATE TABLE inventory.products (
    product_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Product identification
    product_code TEXT NOT NULL,
    product_name TEXT NOT NULL,
    generic_name TEXT,
    brand TEXT,
    manufacturer TEXT,
    
    -- Classification
    category_id INTEGER REFERENCES inventory.product_categories(category_id),
    product_type TEXT NOT NULL DEFAULT 'standard',
    product_class TEXT DEFAULT 'medicine', -- 'medicine', 'surgical', 'cosmetic', 'ayurvedic'
    
    -- Composition and strength
    composition JSONB, -- {"Paracetamol": "500mg", "Caffeine": "50mg"}
    strength TEXT, -- "500mg", "5ml", etc.
    
    -- Regulatory
    hsn_code TEXT,
    drug_schedule TEXT, -- 'H', 'H1', 'X', 'G', etc.
    requires_prescription BOOLEAN DEFAULT false,
    is_narcotic BOOLEAN DEFAULT false,
    is_controlled_substance BOOLEAN DEFAULT false,
    
    -- Barcode and tracking
    barcode TEXT,
    manufacturer_code TEXT,
    
    -- Pack configuration
    pack_config JSONB NOT NULL DEFAULT '{}', -- Detailed pack hierarchy
    base_uom_id INTEGER REFERENCES inventory.units_of_measure(uom_id),
    
    -- Tax configuration
    gst_percentage NUMERIC(5,2) DEFAULT 0,
    cess_percentage NUMERIC(5,2) DEFAULT 0,
    
    -- Storage requirements
    storage_conditions TEXT, -- 'Cool and dry', 'Below 25°C', 'Refrigerate'
    requires_cold_chain BOOLEAN DEFAULT false,
    
    -- Inventory settings
    maintain_batch BOOLEAN DEFAULT true,
    maintain_expiry BOOLEAN DEFAULT true,
    allow_negative_stock BOOLEAN DEFAULT false,
    
    -- Reorder configuration
    min_stock_quantity NUMERIC(15,3),
    reorder_level NUMERIC(15,3),
    reorder_quantity NUMERIC(15,3),
    max_stock_quantity NUMERIC(15,3),
    critical_stock_level NUMERIC(15,3),
    
    -- Status and lifecycle
    product_status TEXT DEFAULT 'active', -- 'active', 'discontinued', 'banned', 'recalled'
    launch_date DATE,
    discontinuation_date DATE,
    
    -- Search and display
    search_keywords TEXT[],
    tags TEXT[],
    
    -- Images and documents
    product_images JSONB DEFAULT '[]',
    documents JSONB DEFAULT '[]',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_saleable BOOLEAN DEFAULT true,
    is_purchasable BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, product_code)
);

-- 5. Product Pack Configurations
CREATE TABLE inventory.product_pack_configurations (
    pack_config_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id) ON DELETE CASCADE,
    
    -- Configuration name
    config_name TEXT NOT NULL, -- 'Standard', 'Hospital Pack', 'Retail Pack'
    
    -- Base unit
    base_uom TEXT NOT NULL, -- 'TABLET', 'ML'
    base_units_per_pack INTEGER NOT NULL, -- 10 tablets per strip
    pack_uom TEXT NOT NULL, -- 'STRIP'
    
    -- Box level (optional)
    packs_per_box INTEGER,
    box_uom TEXT, -- 'BOX'
    
    -- Case/Shipper level (optional)
    boxes_per_case INTEGER,
    case_uom TEXT, -- 'CASE'
    
    -- Display information
    pack_label_format TEXT, -- '10x10 Tablets'
    barcode_format TEXT,
    
    -- Pricing at each level
    pricing_levels JSONB, -- {"base": true, "pack": true, "box": false, "case": false}
    
    -- Status
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT one_default_per_product UNIQUE (product_id, is_default)
);

-- 6. Batches (Lot tracking)
CREATE TABLE inventory.batches (
    batch_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    
    -- Batch identification
    batch_number TEXT NOT NULL,
    alternate_batch_number TEXT, -- Supplier's batch number
    
    -- Manufacturing details
    manufacturing_date DATE,
    expiry_date DATE NOT NULL,
    retesting_date DATE,
    
    -- Quantity tracking (in base units)
    initial_quantity NUMERIC(15,3) NOT NULL,
    quantity_available NUMERIC(15,3) NOT NULL DEFAULT 0,
    quantity_reserved NUMERIC(15,3) DEFAULT 0,
    quantity_quarantine NUMERIC(15,3) DEFAULT 0,
    
    -- Multi-location summary
    location_count INTEGER DEFAULT 0,
    primary_location_id INTEGER,
    
    -- Costing
    cost_per_unit NUMERIC(15,4),
    mrp_per_unit NUMERIC(15,2) NOT NULL,
    sale_price_per_unit NUMERIC(15,2),
    trade_price_per_unit NUMERIC(15,2),
    
    -- Pricing for different pack levels
    strip_mrp NUMERIC(15,2),
    strip_ptr NUMERIC(15,2),
    strip_pts NUMERIC(15,2),
    box_mrp NUMERIC(15,2),
    box_ptr NUMERIC(15,2),
    box_pts NUMERIC(15,2),
    case_mrp NUMERIC(15,2),
    case_ptr NUMERIC(15,2),
    case_pts NUMERIC(15,2),
    
    -- Quality and compliance
    qc_status TEXT DEFAULT 'pending', -- 'pending', 'passed', 'failed', 'quarantine'
    qc_date DATE,
    qc_certificate_number TEXT,
    qc_performed_by INTEGER REFERENCES master.org_users(user_id),
    
    -- Source information
    source_type TEXT NOT NULL, -- 'purchase', 'manufacturing', 'return', 'transfer'
    source_reference_id INTEGER,
    supplier_id INTEGER REFERENCES parties.suppliers(supplier_id),
    
    -- Cost tracking
    weighted_average_cost NUMERIC(15,4),
    last_cost_update TIMESTAMP WITH TIME ZONE,
    cost_calculation_method TEXT DEFAULT 'weighted_average',
    
    -- Status
    batch_status TEXT DEFAULT 'active', -- 'active', 'expired', 'recalled', 'quarantine'
    expiry_status TEXT, -- 'normal', 'caution', 'warning', 'critical', 'expired'
    recall_status TEXT, -- 'none', 'voluntary', 'mandatory'
    recall_date DATE,
    recall_reason TEXT,
    
    -- Additional tracking
    serial_numbers TEXT[], -- For high-value items
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, product_id, batch_number)
);

-- 7. Storage Locations (Warehouse structure)
CREATE TABLE inventory.storage_locations (
    location_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Location hierarchy
    parent_location_id INTEGER REFERENCES inventory.storage_locations(location_id),
    location_code TEXT NOT NULL,
    location_name TEXT NOT NULL,
    location_type TEXT NOT NULL, -- 'warehouse', 'zone', 'aisle', 'rack', 'shelf', 'bin'
    location_path TEXT, -- 'WH01/A/R01/S03/B12'
    
    -- Physical attributes
    storage_capacity JSONB, -- {"volume_m3": 10, "weight_kg": 1000, "units": 5000}
    dimensions JSONB, -- {"length": 2, "width": 1, "height": 3, "unit": "meter"}
    
    -- Storage conditions
    temperature_controlled BOOLEAN DEFAULT false,
    temperature_range JSONB, -- {"min": 2, "max": 8, "unit": "celsius"}
    humidity_controlled BOOLEAN DEFAULT false,
    humidity_range JSONB, -- {"min": 30, "max": 60, "unit": "percent"}
    
    -- Access and restrictions
    restricted_access BOOLEAN DEFAULT false,
    allowed_product_categories INTEGER[], -- Category IDs
    storage_class TEXT, -- 'general', 'cold', 'narcotic', 'hazardous', 'quarantine'
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_full BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, location_code)
);

-- 8. Location-wise Stock
CREATE TABLE inventory.location_wise_stock (
    stock_id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER NOT NULL REFERENCES inventory.batches(batch_id),
    location_id INTEGER NOT NULL REFERENCES inventory.storage_locations(location_id),
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Quantities (in base units)
    quantity_available NUMERIC(15,3) NOT NULL DEFAULT 0,
    quantity_reserved NUMERIC(15,3) DEFAULT 0,
    quantity_quarantine NUMERIC(15,3) DEFAULT 0,
    
    -- FIFO/FEFO tracking
    stock_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Cost at this location
    unit_cost NUMERIC(15,4),
    
    -- Physical location details
    bin_number TEXT,
    pallet_number TEXT,
    
    -- Status
    stock_status TEXT DEFAULT 'available', -- 'available', 'reserved', 'quarantine', 'damaged'
    
    -- Last activity
    last_movement_date TIMESTAMP WITH TIME ZONE,
    last_counted_date DATE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(product_id, batch_id, location_id),
    CONSTRAINT positive_stock CHECK (quantity_available >= 0)
);

-- 9. Stock Reservations
CREATE TABLE inventory.stock_reservations (
    reservation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- What is reserved
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    location_id INTEGER NOT NULL REFERENCES inventory.storage_locations(location_id),
    
    -- Reservation details
    reserved_quantity NUMERIC(15,3) NOT NULL,
    fulfilled_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- For what
    reference_type TEXT NOT NULL, -- 'order', 'transfer', 'production'
    reference_id INTEGER NOT NULL,
    
    -- Validity
    reservation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Priority
    priority INTEGER DEFAULT 5, -- 1-10, 1 being highest
    
    -- Status
    reservation_status TEXT DEFAULT 'active', -- 'active', 'partial', 'fulfilled', 'cancelled', 'expired'
    
    -- Audit
    reserved_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT positive_reservation CHECK (reserved_quantity > 0)
);

-- 10. Inventory Movements
CREATE TABLE inventory.inventory_movements (
    movement_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Movement type and direction
    movement_type TEXT NOT NULL, -- 'purchase', 'sale', 'transfer', 'adjustment', 'return', 'damage', 'expiry'
    movement_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    movement_direction TEXT NOT NULL, -- 'in', 'out'
    
    -- What moved
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    quantity NUMERIC(15,3) NOT NULL,
    pack_type TEXT, -- 'base', 'pack', 'box', 'case'
    base_quantity NUMERIC(15,3), -- Calculated quantity in base units
    
    -- Location information
    location_id INTEGER NOT NULL REFERENCES inventory.storage_locations(location_id),
    from_location_id INTEGER REFERENCES inventory.storage_locations(location_id),
    to_location_id INTEGER REFERENCES inventory.storage_locations(location_id),
    
    -- Cost information
    unit_cost NUMERIC(15,4),
    total_cost NUMERIC(15,2),
    
    -- Reference
    reference_type TEXT, -- 'order', 'invoice', 'grn', 'transfer_note'
    reference_id INTEGER,
    reference_number TEXT,
    
    -- Transfer specific
    transfer_type TEXT, -- 'in' or 'out' for paired transfers
    transfer_pair_id INTEGER REFERENCES inventory.inventory_movements(movement_id),
    
    -- Additional details
    reason TEXT,
    notes TEXT,
    
    -- Pack display data (for invoices)
    pack_display_data JSONB,
    
    -- Cost tracking
    cost_details JSONB,
    
    -- Audit
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE
);

-- 11. Stock Transfers
CREATE TABLE inventory.stock_transfers (
    transfer_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Transfer identification
    transfer_number TEXT NOT NULL,
    transfer_date DATE NOT NULL,
    transfer_type TEXT NOT NULL, -- 'inter_branch', 'inter_warehouse', 'inter_location'
    
    -- Source and destination
    from_branch_id INTEGER REFERENCES master.org_branches(branch_id),
    to_branch_id INTEGER REFERENCES master.org_branches(branch_id),
    from_location_id INTEGER NOT NULL REFERENCES inventory.storage_locations(location_id),
    to_location_id INTEGER NOT NULL REFERENCES inventory.storage_locations(location_id),
    
    -- Transfer reason
    transfer_reason TEXT NOT NULL,
    priority TEXT DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
    
    -- Expected timeline
    expected_dispatch_date DATE,
    expected_delivery_date DATE,
    actual_dispatch_date DATE,
    actual_delivery_date DATE,
    
    -- Transport details
    transport_mode TEXT, -- 'road', 'rail', 'air', 'courier'
    transporter_name TEXT,
    vehicle_number TEXT,
    lr_number TEXT, -- Transport receipt number
    lr_date DATE,
    
    -- Status
    transfer_status TEXT DEFAULT 'draft', -- 'draft', 'approved', 'in_transit', 'received', 'cancelled'
    
    -- Approval workflow
    requested_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Receipt confirmation
    received_by INTEGER REFERENCES master.org_users(user_id),
    received_at TIMESTAMP WITH TIME ZONE,
    
    -- Documents
    documents JSONB DEFAULT '[]',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, transfer_number)
);

-- 12. Stock Transfer Items
CREATE TABLE inventory.stock_transfer_items (
    transfer_item_id SERIAL PRIMARY KEY,
    transfer_id INTEGER NOT NULL REFERENCES inventory.stock_transfers(transfer_id) ON DELETE CASCADE,
    
    -- Item details
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER REFERENCES inventory.batches(batch_id),
    
    -- Quantities
    requested_quantity NUMERIC(15,3) NOT NULL,
    approved_quantity NUMERIC(15,3),
    dispatched_quantity NUMERIC(15,3),
    received_quantity NUMERIC(15,3),
    
    -- Pack information
    pack_type TEXT NOT NULL, -- 'base', 'pack', 'box', 'case'
    pack_size INTEGER,
    
    -- Discrepancy handling
    shortage_quantity NUMERIC(15,3),
    damage_quantity NUMERIC(15,3),
    discrepancy_reason TEXT,
    
    -- Status
    item_status TEXT DEFAULT 'pending',
    
    -- Notes
    dispatch_notes TEXT,
    receipt_notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Reorder Suggestions
CREATE TABLE inventory.reorder_suggestions (
    suggestion_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    
    -- Current status
    current_stock NUMERIC(15,3) NOT NULL,
    reserved_stock NUMERIC(15,3) DEFAULT 0,
    available_stock NUMERIC(15,3),
    
    -- Reorder parameters
    reorder_level NUMERIC(15,3),
    min_stock_level NUMERIC(15,3),
    suggested_quantity NUMERIC(15,3) NOT NULL,
    
    -- Demand analysis
    average_daily_consumption NUMERIC(15,3),
    lead_time_days INTEGER,
    safety_stock_days INTEGER,
    
    -- Supplier suggestions
    preferred_supplier_id INTEGER REFERENCES parties.suppliers(supplier_id),
    last_purchase_price NUMERIC(15,2),
    last_purchase_date DATE,
    
    -- Urgency
    urgency TEXT NOT NULL, -- 'critical', 'high', 'normal', 'low'
    suggested_order_date DATE,
    
    -- Status
    suggestion_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'ordered', 'cancelled'
    
    -- Action taken
    action_taken TEXT,
    action_taken_by INTEGER REFERENCES master.org_users(user_id),
    action_taken_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(product_id, suggestion_status)
);

-- Create indexes for performance
CREATE INDEX idx_products_org ON inventory.products(org_id);
CREATE INDEX idx_products_category ON inventory.products(category_id);
CREATE INDEX idx_products_search ON inventory.products USING gin(search_keywords);
CREATE INDEX idx_batches_product ON inventory.batches(product_id);
CREATE INDEX idx_batches_expiry ON inventory.batches(expiry_date) WHERE batch_status = 'active';
CREATE INDEX idx_location_stock_product_batch ON inventory.location_wise_stock(product_id, batch_id);
CREATE INDEX idx_location_stock_available ON inventory.location_wise_stock(location_id) 
    WHERE quantity_available > 0;
CREATE INDEX idx_movements_date ON inventory.inventory_movements(movement_date);
CREATE INDEX idx_movements_reference ON inventory.inventory_movements(reference_type, reference_id);
CREATE INDEX idx_reservations_active ON inventory.stock_reservations(product_id, location_id) 
    WHERE reservation_status = 'active';
CREATE INDEX idx_reorder_suggestions_urgency ON inventory.reorder_suggestions(urgency) 
    WHERE suggestion_status = 'pending';

-- Add comments
COMMENT ON TABLE inventory.products IS 'Master product catalog with Indian pharma specific fields';
COMMENT ON TABLE inventory.batches IS 'Batch/lot tracking with expiry management';
COMMENT ON TABLE inventory.location_wise_stock IS 'Real-time stock levels at each storage location';
COMMENT ON TABLE inventory.product_pack_configurations IS 'Complex pack hierarchies (tablet→strip→box→case)';