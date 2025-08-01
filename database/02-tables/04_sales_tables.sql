-- =============================================
-- SALES OPERATIONS TABLES
-- =============================================
-- Schema: sales
-- Tables: 13
-- Purpose: Orders, invoices, challans, and sales management
-- =============================================

-- 1. Sales Orders
CREATE TABLE sales.orders (
    order_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Order identification
    order_number TEXT NOT NULL,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    order_type TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'urgent', 'scheduled', 'standing'
    
    -- Customer information
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    customer_po_number TEXT,
    customer_po_date DATE,
    
    -- Delivery information
    delivery_date DATE,
    delivery_priority TEXT DEFAULT 'normal', -- 'urgent', 'high', 'normal', 'low'
    delivery_address_id INTEGER REFERENCES master.addresses(address_id),
    delivery_instructions TEXT,
    
    -- Salesperson and territory
    salesperson_id INTEGER REFERENCES master.org_users(user_id),
    territory_id INTEGER REFERENCES parties.territories(territory_id),
    route_id INTEGER REFERENCES parties.routes(route_id),
    
    -- Pricing and amounts
    price_list_id INTEGER,
    currency_code TEXT DEFAULT 'INR',
    
    -- Order amounts (calculated from items)
    subtotal_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    scheme_discount NUMERIC(15,2) DEFAULT 0,
    taxable_amount NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    round_off_amount NUMERIC(5,2) DEFAULT 0,
    final_amount NUMERIC(15,2) DEFAULT 0,
    
    -- GST details
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    cess_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Status tracking
    order_status TEXT DEFAULT 'draft', -- 'draft', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled'
    approval_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Payment information
    payment_terms TEXT,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'paid'
    
    -- Fulfillment tracking
    fulfillment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'complete'
    items_count INTEGER DEFAULT 0,
    items_delivered INTEGER DEFAULT 0,
    
    -- Notes and references
    notes TEXT,
    internal_notes TEXT,
    tags TEXT[],
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    updated_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, order_number)
);

-- 2. Order Items
CREATE TABLE sales.order_items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES sales.orders(order_id) ON DELETE CASCADE,
    
    -- Product information
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    product_name TEXT NOT NULL, -- Denormalized for history
    hsn_code TEXT,
    
    -- Quantity and units
    quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    pack_type TEXT NOT NULL, -- 'base', 'pack', 'box', 'case'
    pack_size INTEGER,
    base_quantity NUMERIC(15,3), -- Calculated quantity in base units
    
    -- Pricing
    unit_price NUMERIC(15,4) NOT NULL,
    mrp NUMERIC(15,2),
    
    -- Discounts
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    scheme_discount_percent NUMERIC(5,2) DEFAULT 0,
    scheme_discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Free goods
    free_quantity NUMERIC(15,3) DEFAULT 0,
    scheme_code TEXT,
    
    -- Tax calculation
    taxable_amount NUMERIC(15,2),
    tax_percent NUMERIC(5,2),
    tax_amount NUMERIC(15,2),
    igst_percent NUMERIC(5,2) DEFAULT 0,
    cgst_percent NUMERIC(5,2) DEFAULT 0,
    sgst_percent NUMERIC(5,2) DEFAULT 0,
    cess_percent NUMERIC(5,2) DEFAULT 0,
    
    -- Line total
    line_total NUMERIC(15,2) NOT NULL,
    
    -- Batch allocation
    batch_id INTEGER, -- Will add FK after inventory.batches is created
    batch_number TEXT, -- For quick display
    batch_expiry DATE, -- For quick validation
    
    -- Fulfillment tracking
    ordered_quantity NUMERIC(15,3),
    delivered_quantity NUMERIC(15,3) DEFAULT 0,
    pending_quantity NUMERIC(15,3),
    cancelled_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Status
    item_status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'allocated', 'packed', 'delivered', 'cancelled'
    
    -- Notes
    item_notes TEXT,
    
    -- Sequence
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sales Invoices
CREATE TABLE sales.invoices (
    invoice_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Invoice identification
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    invoice_type TEXT DEFAULT 'tax_invoice', -- 'tax_invoice', 'bill_of_supply', 'export_invoice'
    
    -- Reference
    order_id INTEGER REFERENCES sales.orders(order_id),
    challan_ids INTEGER[], -- Multiple challans can be clubbed
    
    -- Customer information
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    customer_name TEXT NOT NULL, -- Denormalized
    billing_address_id INTEGER REFERENCES master.addresses(address_id),
    shipping_address_id INTEGER REFERENCES master.addresses(address_id),
    
    -- GST information
    place_of_supply TEXT,
    reverse_charge BOOLEAN DEFAULT FALSE,
    
    -- Amounts
    subtotal_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    scheme_discount NUMERIC(15,2) DEFAULT 0,
    taxable_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Tax breakup
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    cess_amount NUMERIC(15,2) DEFAULT 0,
    total_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Other charges
    freight_charges NUMERIC(15,2) DEFAULT 0,
    insurance_charges NUMERIC(15,2) DEFAULT 0,
    other_charges NUMERIC(15,2) DEFAULT 0,
    
    -- Final amount
    round_off_amount NUMERIC(5,2) DEFAULT 0,
    final_amount NUMERIC(15,2) DEFAULT 0,
    amount_in_words TEXT,
    
    -- Payment information
    payment_terms TEXT,
    due_date DATE,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'paid', 'overdue'
    paid_amount NUMERIC(15,2) DEFAULT 0,
    
    -- E-invoice details
    einvoice_required BOOLEAN DEFAULT FALSE,
    irn TEXT,
    irn_generated_date TIMESTAMP WITH TIME ZONE,
    qr_code TEXT,
    ack_number TEXT,
    ack_date TIMESTAMP WITH TIME ZONE,
    
    -- Status
    invoice_status TEXT DEFAULT 'draft', -- 'draft', 'posted', 'cancelled'
    cancellation_reason TEXT,
    cancelled_date DATE,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    terms_and_conditions TEXT,
    
    -- Bank details for payment
    bank_account_id INTEGER REFERENCES master.org_bank_accounts(bank_account_id),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    posted_by INTEGER REFERENCES master.org_users(user_id),
    posted_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(org_id, invoice_number)
);

-- 4. Invoice Items
CREATE TABLE sales.invoice_items (
    invoice_item_id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES sales.invoices(invoice_id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES sales.order_items(order_item_id),
    
    -- Product information
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    product_name TEXT NOT NULL,
    product_description TEXT,
    hsn_code TEXT,
    
    -- Batch information
    batch_id INTEGER, -- Will add FK constraint after inventory.batches is created
    batch_number TEXT,
    manufacturing_date DATE,
    expiry_date DATE,
    
    -- Quantity and units
    quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    pack_size INTEGER,
    base_quantity NUMERIC(15,3),
    
    -- Pricing
    mrp NUMERIC(15,2),
    unit_price NUMERIC(15,4) NOT NULL,
    
    -- Discounts
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Tax calculation
    taxable_amount NUMERIC(15,2),
    igst_rate NUMERIC(5,2) DEFAULT 0,
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_rate NUMERIC(5,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_rate NUMERIC(5,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    cess_rate NUMERIC(5,2) DEFAULT 0,
    cess_amount NUMERIC(15,2) DEFAULT 0,
    total_tax_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Line total
    line_total NUMERIC(15,2) NOT NULL,
    
    -- Free goods
    is_free_item BOOLEAN DEFAULT FALSE,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Delivery Challans
CREATE TABLE sales.delivery_challans (
    challan_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Challan identification
    challan_number TEXT NOT NULL,
    challan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    challan_type TEXT DEFAULT 'delivery', -- 'delivery', 'sample', 'returnable', 'job_work'
    
    -- Reference
    order_id INTEGER REFERENCES sales.orders(order_id),
    invoice_id INTEGER REFERENCES sales.invoices(invoice_id),
    
    -- Customer information
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    delivery_address_id INTEGER REFERENCES master.addresses(address_id),
    
    -- Dispatch information
    dispatch_date DATE,
    dispatch_time TIME,
    dispatch_address_id INTEGER REFERENCES master.addresses(address_id),
    
    -- Transport details
    transport_mode TEXT, -- 'road', 'rail', 'air', 'ship'
    transporter_name TEXT,
    vehicle_number TEXT,
    lr_number TEXT,
    lr_date DATE,
    freight_charges NUMERIC(15,2),
    
    -- E-way bill
    eway_bill_required BOOLEAN DEFAULT FALSE,
    eway_bill_number TEXT,
    eway_bill_date DATE,
    eway_bill_validity_days INTEGER,
    eway_bill_data JSONB,
    
    -- Amounts (for e-way bill)
    total_quantity NUMERIC(15,3),
    total_amount NUMERIC(15,2),
    
    -- Status
    challan_status TEXT DEFAULT 'draft', -- 'draft', 'dispatched', 'delivered', 'cancelled'
    delivery_status TEXT DEFAULT 'pending', -- 'pending', 'in_transit', 'delivered', 'returned'
    
    -- Delivery confirmation
    delivered_date DATE,
    delivered_time TIME,
    received_by TEXT,
    delivery_notes TEXT,
    pod_document TEXT, -- Proof of delivery
    
    -- Return handling
    is_returnable BOOLEAN DEFAULT FALSE,
    return_by_date DATE,
    return_status TEXT, -- 'not_returned', 'partially_returned', 'fully_returned'
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, challan_number)
);

-- 6. Challan Items
CREATE TABLE sales.delivery_challan_items (
    challan_item_id SERIAL PRIMARY KEY,
    challan_id INTEGER NOT NULL REFERENCES sales.delivery_challans(challan_id) ON DELETE CASCADE,
    order_item_id INTEGER REFERENCES sales.order_items(order_item_id),
    
    -- Product information
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER, -- Will add FK constraint after inventory.batches is created
    
    -- Quantities
    ordered_quantity NUMERIC(15,3),
    dispatched_quantity NUMERIC(15,3) NOT NULL,
    delivered_quantity NUMERIC(15,3),
    returned_quantity NUMERIC(15,3) DEFAULT 0,
    damaged_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Units
    uom TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    
    -- Status
    item_status TEXT DEFAULT 'dispatched',
    
    -- Notes
    item_notes TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Sales Returns (Credit Notes)
CREATE TABLE sales.sales_returns (
    return_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Return identification
    return_number TEXT NOT NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    return_type TEXT NOT NULL, -- 'goods_return', 'price_adjustment', 'quality_issue'
    
    -- Reference
    invoice_id INTEGER REFERENCES sales.invoices(invoice_id),
    challan_id INTEGER REFERENCES sales.delivery_challans(challan_id),
    
    -- Customer
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    
    -- Return reason
    return_reason TEXT NOT NULL,
    return_category TEXT, -- 'expired', 'damaged', 'wrong_item', 'quality', 'excess'
    
    -- Approval
    approval_required BOOLEAN DEFAULT TRUE,
    approval_status TEXT DEFAULT 'pending',
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Amounts
    return_amount NUMERIC(15,2),
    tax_amount NUMERIC(15,2),
    total_amount NUMERIC(15,2),
    
    -- Credit note
    credit_note_number TEXT,
    credit_note_date DATE,
    credit_note_status TEXT DEFAULT 'pending', -- 'pending', 'issued', 'adjusted', 'refunded'
    
    -- GST details for credit note
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Adjustment details
    adjustment_type TEXT, -- 'credit_note', 'replacement', 'refund'
    adjusted_amount NUMERIC(15,2) DEFAULT 0,
    pending_amount NUMERIC(15,2),
    
    -- Physical receipt
    goods_received_date DATE,
    goods_received_by INTEGER REFERENCES master.org_users(user_id),
    quality_check_status TEXT,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, return_number)
);

-- 8. Sales Return Items
CREATE TABLE sales.sales_return_items (
    return_item_id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES sales.sales_returns(return_id) ON DELETE CASCADE,
    invoice_item_id INTEGER REFERENCES sales.invoice_items(invoice_item_id),
    
    -- Product and batch
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER, -- Will add FK constraint after inventory.batches is created
    batch_number TEXT,
    
    -- Quantities
    return_quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    damaged_quantity NUMERIC(15,3) DEFAULT 0,
    saleable_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Pricing
    unit_price NUMERIC(15,4),
    return_value NUMERIC(15,2),
    
    -- Tax
    tax_amount NUMERIC(15,2),
    
    -- Reason
    item_return_reason TEXT,
    
    -- Disposition
    disposition TEXT, -- 'return_to_stock', 'destroy', 'return_to_vendor'
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Price Lists
CREATE TABLE sales.price_lists (
    price_list_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Price list details
    price_list_name TEXT NOT NULL,
    price_list_type TEXT NOT NULL, -- 'standard', 'customer_specific', 'promotional'
    currency_code TEXT DEFAULT 'INR',
    
    -- Validity
    effective_from DATE NOT NULL,
    effective_until DATE,
    
    -- Applicability
    applicable_branches INTEGER[], -- Branch IDs
    applicable_territories INTEGER[], -- Territory IDs
    applicable_customer_groups INTEGER[], -- Customer group IDs
    
    -- Base price list (for derivative lists)
    parent_price_list_id INTEGER REFERENCES sales.price_lists(price_list_id),
    adjustment_type TEXT, -- 'percentage', 'fixed'
    adjustment_value NUMERIC(15,4),
    
    -- Approval
    requires_approval BOOLEAN DEFAULT FALSE,
    approval_status TEXT DEFAULT 'approved',
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    
    -- Notes
    description TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, price_list_name)
);

-- 10. Price List Items
CREATE TABLE sales.price_list_items (
    price_list_item_id SERIAL PRIMARY KEY,
    price_list_id INTEGER NOT NULL REFERENCES sales.price_lists(price_list_id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    
    -- Pricing for different pack levels
    base_unit_price NUMERIC(15,4),
    pack_unit_price NUMERIC(15,4),
    box_unit_price NUMERIC(15,4),
    case_unit_price NUMERIC(15,4),
    
    -- MRP and margins
    mrp NUMERIC(15,2),
    ptr_margin_percent NUMERIC(5,2), -- Price to retailer margin
    pts_margin_percent NUMERIC(5,2), -- Price to stockist margin
    
    -- Minimum order quantity
    min_order_quantity NUMERIC(15,3),
    min_order_pack_type TEXT,
    
    -- Discounts allowed
    max_discount_percent NUMERIC(5,2),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(price_list_id, product_id)
);

-- 11. Sales Schemes
CREATE TABLE sales.sales_schemes (
    scheme_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Scheme identification
    scheme_code TEXT NOT NULL,
    scheme_name TEXT NOT NULL,
    scheme_type TEXT NOT NULL, -- 'quantity_based', 'value_based', 'product_combo', 'seasonal'
    
    -- Validity
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Applicability
    applicable_branches INTEGER[],
    applicable_territories INTEGER[],
    applicable_customers INTEGER[],
    applicable_customer_types TEXT[],
    
    -- Scheme rules
    scheme_rules JSONB NOT NULL,
    -- {
    --   "min_quantity": 100,
    --   "min_value": 10000,
    --   "discount_type": "percentage",
    --   "discount_value": 10,
    --   "free_goods": {"product_id": 123, "quantity": 10}
    -- }
    
    -- Products
    applicable_products INTEGER[], -- NULL means all products
    applicable_categories INTEGER[],
    
    -- Budget and limits
    scheme_budget NUMERIC(15,2),
    utilized_budget NUMERIC(15,2) DEFAULT 0,
    max_benefit_per_order NUMERIC(15,2),
    
    -- Approval
    approval_status TEXT DEFAULT 'draft',
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    can_combine BOOLEAN DEFAULT FALSE, -- Can combine with other schemes
    
    -- Performance
    total_orders INTEGER DEFAULT 0,
    total_discount_given NUMERIC(15,2) DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, scheme_code)
);

-- 12. Sales Targets
CREATE TABLE sales.sales_targets (
    target_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Target period
    target_year INTEGER NOT NULL,
    target_month INTEGER,
    target_quarter INTEGER,
    period_type TEXT NOT NULL, -- 'monthly', 'quarterly', 'yearly'
    
    -- Target for
    target_type TEXT NOT NULL, -- 'user', 'territory', 'branch', 'product', 'category'
    target_entity_id INTEGER NOT NULL,
    
    -- Target values
    revenue_target NUMERIC(15,2),
    quantity_target NUMERIC(15,3),
    new_customer_target INTEGER,
    visit_target INTEGER,
    
    -- Achievement tracking
    revenue_achieved NUMERIC(15,2) DEFAULT 0,
    quantity_achieved NUMERIC(15,3) DEFAULT 0,
    new_customers_achieved INTEGER DEFAULT 0,
    visits_achieved INTEGER DEFAULT 0,
    
    -- Percentage achievement
    revenue_achievement_percent NUMERIC(5,2) DEFAULT 0,
    overall_achievement_percent NUMERIC(5,2) DEFAULT 0,
    
    -- Incentive calculation
    incentive_percentage NUMERIC(5,2),
    calculated_incentive NUMERIC(15,2),
    
    -- Status
    status TEXT DEFAULT 'active', -- 'active', 'achieved', 'missed'
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, target_year, period_type, target_type, target_entity_id)
);

-- 13. Customer Visits
CREATE TABLE sales.customer_visits (
    visit_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Visit details
    visit_date DATE NOT NULL,
    visit_time TIME,
    customer_id INTEGER NOT NULL REFERENCES parties.customers(customer_id),
    
    -- Sales person
    visited_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    route_id INTEGER REFERENCES parties.routes(route_id),
    
    -- Visit purpose and outcome
    visit_purpose TEXT NOT NULL, -- 'sales', 'collection', 'complaint', 'relationship'
    visit_outcome TEXT, -- 'order_placed', 'payment_collected', 'issue_resolved', 'follow_up_required'
    
    -- Order/collection reference
    order_id INTEGER REFERENCES sales.orders(order_id),
    collection_amount NUMERIC(15,2),
    
    -- Location tracking
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    visit_location JSONB, -- {"latitude": 19.0760, "longitude": 72.8777, "accuracy": 10}
    
    -- Visit notes and follow-up
    visit_notes TEXT,
    follow_up_required BOOLEAN DEFAULT FALSE,
    follow_up_date DATE,
    follow_up_notes TEXT,
    
    -- Photos/documents
    visit_photos JSONB DEFAULT '[]',
    
    -- Status
    visit_status TEXT DEFAULT 'completed', -- 'scheduled', 'in_progress', 'completed', 'cancelled'
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_orders_customer ON sales.orders(customer_id);
CREATE INDEX idx_orders_date ON sales.orders(order_date);
CREATE INDEX idx_orders_status ON sales.orders(order_status);
CREATE INDEX idx_order_items_product ON sales.order_items(product_id);
CREATE INDEX idx_invoices_customer ON sales.invoices(customer_id);
CREATE INDEX idx_invoices_date ON sales.invoices(invoice_date);
CREATE INDEX idx_invoices_payment_status ON sales.invoices(payment_status);
CREATE INDEX idx_invoice_items_product ON sales.invoice_items(product_id);
CREATE INDEX idx_challans_date ON sales.delivery_challans(challan_date);
CREATE INDEX idx_returns_invoice ON sales.sales_returns(invoice_id);
CREATE INDEX idx_price_list_items_product ON sales.price_list_items(product_id);
CREATE INDEX idx_schemes_validity ON sales.sales_schemes(start_date, end_date);
CREATE INDEX idx_targets_period ON sales.sales_targets(target_year, period_type);
CREATE INDEX idx_visits_date ON sales.customer_visits(visit_date);
CREATE INDEX idx_visits_customer ON sales.customer_visits(customer_id);

-- Add comments
COMMENT ON TABLE sales.orders IS 'Sales orders with multi-level approval workflow';
COMMENT ON TABLE sales.invoices IS 'Tax invoices with GST compliance and e-invoice support';
COMMENT ON TABLE sales.delivery_challans IS 'Delivery challans with e-way bill integration';
COMMENT ON TABLE sales.sales_returns IS 'Sales returns and credit note management';
COMMENT ON TABLE sales.sales_schemes IS 'Promotional schemes with complex rules';
COMMENT ON TABLE sales.sales_targets IS 'Sales targets and achievement tracking';