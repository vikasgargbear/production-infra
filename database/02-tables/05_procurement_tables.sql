-- =============================================
-- PROCUREMENT OPERATIONS TABLES
-- =============================================
-- Schema: procurement
-- Tables: 12
-- Purpose: Purchase orders, GRN, supplier invoices
-- =============================================

-- 1. Purchase Orders
CREATE TABLE procurement.purchase_orders (
    purchase_order_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- PO identification
    po_number TEXT NOT NULL,
    po_date DATE NOT NULL DEFAULT CURRENT_DATE,
    po_type TEXT DEFAULT 'regular', -- 'regular', 'urgent', 'import', 'consignment'
    
    -- Supplier information
    supplier_id INTEGER NOT NULL REFERENCES parties.suppliers(supplier_id),
    supplier_name TEXT NOT NULL, -- Denormalized
    supplier_reference TEXT,
    
    -- Delivery information
    expected_delivery_date DATE,
    delivery_location_id INTEGER REFERENCES inventory.storage_locations(location_id),
    delivery_terms TEXT,
    
    -- Payment terms
    payment_terms TEXT,
    payment_days INTEGER,
    due_date DATE,
    
    -- Amounts
    subtotal_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    taxable_amount NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) DEFAULT 0,
    other_charges NUMERIC(15,2) DEFAULT 0,
    round_off_amount NUMERIC(5,2) DEFAULT 0,
    total_amount NUMERIC(15,2) DEFAULT 0,
    
    -- GST details
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    cess_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Status tracking
    po_status TEXT DEFAULT 'draft', -- 'draft', 'approved', 'sent', 'acknowledged', 'partial', 'completed', 'cancelled'
    approval_status TEXT DEFAULT 'pending',
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Fulfillment tracking
    items_count INTEGER DEFAULT 0,
    items_received INTEGER DEFAULT 0,
    receipt_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'complete'
    
    -- Communication
    sent_to_supplier BOOLEAN DEFAULT FALSE,
    sent_date TIMESTAMP WITH TIME ZONE,
    acknowledged_by_supplier BOOLEAN DEFAULT FALSE,
    acknowledged_date TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    terms_and_conditions TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, po_number)
);

-- 2. Purchase Order Items
CREATE TABLE procurement.purchase_order_items (
    po_item_id SERIAL PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL REFERENCES procurement.purchase_orders(purchase_order_id) ON DELETE CASCADE,
    
    -- Product information
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    product_name TEXT NOT NULL,
    manufacturer TEXT,
    hsn_code TEXT,
    
    -- Quantity and units
    ordered_quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    pack_size INTEGER,
    base_quantity NUMERIC(15,3),
    
    -- Free quantity
    free_quantity NUMERIC(15,3) DEFAULT 0,
    scheme_details TEXT,
    
    -- Pricing
    unit_price NUMERIC(15,4) NOT NULL,
    mrp NUMERIC(15,2),
    
    -- Discounts
    discount_percent NUMERIC(5,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Tax
    taxable_amount NUMERIC(15,2),
    tax_percent NUMERIC(5,2),
    tax_amount NUMERIC(15,2),
    
    -- Line total
    line_total NUMERIC(15,2) NOT NULL,
    
    -- Receipt tracking
    received_quantity NUMERIC(15,3) DEFAULT 0,
    pending_quantity NUMERIC(15,3),
    cancelled_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Bonus/scheme
    bonus_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Status
    item_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'received', 'cancelled'
    
    -- Notes
    item_notes TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Goods Receipt Notes (GRN)
CREATE TABLE procurement.goods_receipt_notes (
    grn_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- GRN identification
    grn_number TEXT NOT NULL,
    grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
    grn_type TEXT DEFAULT 'purchase', -- 'purchase', 'return', 'transfer', 'consignment'
    
    -- Reference
    purchase_order_id INTEGER REFERENCES procurement.purchase_orders(purchase_order_id),
    supplier_id INTEGER REFERENCES parties.suppliers(supplier_id),
    
    -- Supplier documents
    supplier_invoice_number TEXT,
    supplier_invoice_date DATE,
    supplier_challan_number TEXT,
    supplier_challan_date DATE,
    
    -- Receipt details
    received_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    storage_location_id INTEGER REFERENCES inventory.storage_locations(location_id),
    
    -- Transport details
    transport_mode TEXT,
    vehicle_number TEXT,
    lr_number TEXT,
    lr_date DATE,
    
    -- Quality check
    qc_required BOOLEAN DEFAULT TRUE,
    qc_status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'passed', 'failed', 'conditional'
    qc_completed_by INTEGER REFERENCES master.org_users(user_id),
    qc_completed_at TIMESTAMP WITH TIME ZONE,
    qc_notes TEXT,
    
    -- Amounts (for verification)
    supplier_amount NUMERIC(15,2),
    calculated_amount NUMERIC(15,2),
    variance_amount NUMERIC(15,2),
    
    -- Status
    grn_status TEXT DEFAULT 'draft', -- 'draft', 'verified', 'approved', 'rejected'
    approval_status TEXT DEFAULT 'pending',
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Stock update
    stock_updated BOOLEAN DEFAULT FALSE,
    stock_updated_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    rejection_reason TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, grn_number)
);

-- 4. GRN Items
CREATE TABLE procurement.grn_items (
    grn_item_id SERIAL PRIMARY KEY,
    grn_id INTEGER NOT NULL REFERENCES procurement.goods_receipt_notes(grn_id) ON DELETE CASCADE,
    po_item_id INTEGER REFERENCES procurement.purchase_order_items(po_item_id),
    
    -- Product information
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    
    -- Batch information
    batch_number TEXT NOT NULL,
    manufacturing_date DATE,
    expiry_date DATE NOT NULL,
    
    -- Quantities
    ordered_quantity NUMERIC(15,3),
    received_quantity NUMERIC(15,3) NOT NULL,
    accepted_quantity NUMERIC(15,3),
    rejected_quantity NUMERIC(15,3) DEFAULT 0,
    free_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Units
    uom TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    pack_size INTEGER,
    
    -- Pricing
    unit_price NUMERIC(15,4),
    mrp NUMERIC(15,2) NOT NULL,
    ptr NUMERIC(15,2),
    pts NUMERIC(15,2),
    
    -- Margins
    ptr_margin_percent NUMERIC(5,2),
    pts_margin_percent NUMERIC(5,2),
    
    -- Quality check
    qc_status TEXT DEFAULT 'pending',
    qc_notes TEXT,
    rejection_reason TEXT,
    
    -- Storage
    storage_location_id INTEGER REFERENCES inventory.storage_locations(location_id),
    
    -- Status
    item_status TEXT DEFAULT 'received',
    
    -- Notes
    item_notes TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Supplier Invoices
CREATE TABLE procurement.supplier_invoices (
    supplier_invoice_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Invoice identification
    supplier_invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    
    -- Supplier
    supplier_id INTEGER NOT NULL REFERENCES parties.suppliers(supplier_id),
    
    -- References
    purchase_order_ids INTEGER[], -- Multiple POs
    grn_ids INTEGER[], -- Multiple GRNs
    
    -- Amounts
    subtotal_amount NUMERIC(15,2) NOT NULL,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    taxable_amount NUMERIC(15,2) NOT NULL,
    
    -- Tax details
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    cess_amount NUMERIC(15,2) DEFAULT 0,
    tax_amount NUMERIC(15,2) NOT NULL,
    
    -- Other charges
    freight_charges NUMERIC(15,2) DEFAULT 0,
    insurance_charges NUMERIC(15,2) DEFAULT 0,
    other_charges NUMERIC(15,2) DEFAULT 0,
    
    -- Total
    round_off_amount NUMERIC(5,2) DEFAULT 0,
    invoice_total NUMERIC(15,2) NOT NULL,
    
    -- TDS
    tds_applicable BOOLEAN DEFAULT FALSE,
    tds_percent NUMERIC(5,2),
    tds_amount NUMERIC(15,2),
    
    -- Payment details
    payment_terms TEXT,
    due_date DATE,
    payment_status TEXT DEFAULT 'pending', -- 'pending', 'partial', 'paid', 'overdue'
    paid_amount NUMERIC(15,2) DEFAULT 0,
    
    -- GST compliance
    gstr2a_matched BOOLEAN DEFAULT FALSE,
    gstr2a_match_date DATE,
    itc_eligible BOOLEAN DEFAULT TRUE,
    matching_status TEXT DEFAULT 'pending', -- 'pending', 'matched', 'mismatched'
    
    -- Verification
    invoice_status TEXT DEFAULT 'draft', -- 'draft', 'verified', 'approved', 'rejected'
    verified_by INTEGER REFERENCES master.org_users(user_id),
    verified_at TIMESTAMP WITH TIME ZONE,
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    rejection_reason TEXT,
    
    -- Document management
    invoice_document_path TEXT,
    supporting_documents JSONB DEFAULT '[]',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, supplier_id, supplier_invoice_number)
);

-- 6. Purchase Returns (Debit Notes)
CREATE TABLE procurement.purchase_returns (
    return_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Return identification
    return_number TEXT NOT NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    return_type TEXT NOT NULL, -- 'quality_issue', 'expired', 'damaged', 'excess', 'price_dispute'
    
    -- References
    grn_id INTEGER REFERENCES procurement.goods_receipt_notes(grn_id),
    supplier_invoice_id INTEGER REFERENCES procurement.supplier_invoices(supplier_invoice_id),
    supplier_id INTEGER NOT NULL REFERENCES parties.suppliers(supplier_id),
    
    -- Return reason
    return_reason TEXT NOT NULL,
    detailed_reason TEXT,
    
    -- Approval
    approval_required BOOLEAN DEFAULT TRUE,
    approval_status TEXT DEFAULT 'pending',
    approved_by INTEGER REFERENCES master.org_users(user_id),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Amounts
    return_amount NUMERIC(15,2),
    tax_amount NUMERIC(15,2),
    total_amount NUMERIC(15,2),
    
    -- Debit note
    debit_note_number TEXT,
    debit_note_date DATE,
    debit_note_status TEXT DEFAULT 'pending', -- 'pending', 'issued', 'accepted', 'disputed'
    
    -- GST details
    igst_amount NUMERIC(15,2) DEFAULT 0,
    cgst_amount NUMERIC(15,2) DEFAULT 0,
    sgst_amount NUMERIC(15,2) DEFAULT 0,
    
    -- Supplier acknowledgment
    supplier_acknowledged BOOLEAN DEFAULT FALSE,
    supplier_acknowledgment_date DATE,
    supplier_credit_note_number TEXT,
    
    -- Physical dispatch
    dispatch_date DATE,
    transport_details JSONB,
    
    -- Adjustment
    adjustment_type TEXT, -- 'credit_note', 'replacement', 'refund'
    adjusted_amount NUMERIC(15,2) DEFAULT 0,
    pending_amount NUMERIC(15,2),
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, return_number)
);

-- 7. Purchase Return Items
CREATE TABLE procurement.purchase_return_items (
    return_item_id SERIAL PRIMARY KEY,
    return_id INTEGER NOT NULL REFERENCES procurement.purchase_returns(return_id) ON DELETE CASCADE,
    grn_item_id INTEGER REFERENCES procurement.grn_items(grn_item_id),
    
    -- Product and batch
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    batch_id INTEGER, -- Will add FK constraint after inventory.batches is created
    batch_number TEXT NOT NULL,
    
    -- Quantities
    return_quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    
    -- Pricing
    unit_price NUMERIC(15,4),
    return_value NUMERIC(15,2),
    
    -- Tax
    tax_amount NUMERIC(15,2),
    
    -- Reason
    item_return_reason TEXT,
    
    -- Status
    item_status TEXT DEFAULT 'pending',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Purchase Requisitions
CREATE TABLE procurement.purchase_requisitions (
    requisition_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES master.org_branches(branch_id),
    
    -- Requisition details
    requisition_number TEXT NOT NULL,
    requisition_date DATE NOT NULL DEFAULT CURRENT_DATE,
    required_by_date DATE,
    
    -- Requester
    requested_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    department TEXT,
    
    -- Type and priority
    requisition_type TEXT DEFAULT 'stock', -- 'stock', 'emergency', 'new_product'
    priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    
    -- Approval workflow
    approval_status TEXT DEFAULT 'pending',
    current_approver_id INTEGER REFERENCES master.org_users(user_id),
    approval_history JSONB DEFAULT '[]',
    
    -- Status
    requisition_status TEXT DEFAULT 'draft', -- 'draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled'
    
    -- Conversion to PO
    converted_to_po BOOLEAN DEFAULT FALSE,
    po_ids INTEGER[],
    
    -- Notes
    purpose TEXT,
    notes TEXT,
    rejection_reason TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, requisition_number)
);

-- 9. Purchase Requisition Items
CREATE TABLE procurement.purchase_requisition_items (
    requisition_item_id SERIAL PRIMARY KEY,
    requisition_id INTEGER NOT NULL REFERENCES procurement.purchase_requisitions(requisition_id) ON DELETE CASCADE,
    
    -- Product
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    
    -- Quantity
    requested_quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    
    -- Stock information
    current_stock NUMERIC(15,3),
    reorder_level NUMERIC(15,3),
    
    -- Supplier suggestion
    suggested_supplier_id INTEGER REFERENCES parties.suppliers(supplier_id),
    last_purchase_price NUMERIC(15,4),
    
    -- Approval
    approved_quantity NUMERIC(15,3),
    
    -- Status
    item_status TEXT DEFAULT 'pending',
    
    -- Notes
    item_notes TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Supplier Quotations
CREATE TABLE procurement.supplier_quotations (
    quotation_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Quotation details
    quotation_number TEXT NOT NULL,
    quotation_date DATE NOT NULL,
    
    -- Supplier
    supplier_id INTEGER NOT NULL REFERENCES parties.suppliers(supplier_id),
    
    -- Reference
    requisition_id INTEGER REFERENCES procurement.purchase_requisitions(requisition_id),
    rfq_number TEXT, -- Request for quotation
    
    -- Validity
    valid_until DATE,
    
    -- Terms
    payment_terms TEXT,
    delivery_terms TEXT,
    other_terms TEXT,
    
    -- Amounts
    total_amount NUMERIC(15,2),
    
    -- Status
    quotation_status TEXT DEFAULT 'received', -- 'draft', 'received', 'under_review', 'accepted', 'rejected'
    
    -- Comparison
    is_best_price BOOLEAN DEFAULT FALSE,
    price_rank INTEGER,
    
    -- Notes
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, quotation_number)
);

-- 11. Supplier Quotation Items
CREATE TABLE procurement.supplier_quotation_items (
    quotation_item_id SERIAL PRIMARY KEY,
    quotation_id INTEGER NOT NULL REFERENCES procurement.supplier_quotations(quotation_id) ON DELETE CASCADE,
    
    -- Product
    product_id INTEGER NOT NULL REFERENCES inventory.products(product_id),
    
    -- Quantity and pricing
    quantity NUMERIC(15,3) NOT NULL,
    uom TEXT NOT NULL,
    unit_price NUMERIC(15,4) NOT NULL,
    
    -- Discounts
    discount_percent NUMERIC(5,2) DEFAULT 0,
    
    -- Free goods
    free_quantity NUMERIC(15,3) DEFAULT 0,
    
    -- Tax
    tax_percent NUMERIC(5,2),
    
    -- Total
    line_total NUMERIC(15,2),
    
    -- Comparison
    is_best_price BOOLEAN DEFAULT FALSE,
    price_variance_percent NUMERIC(5,2), -- Compared to current price
    
    -- Notes
    item_notes TEXT,
    
    -- Display
    display_order INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Vendor Performance
CREATE TABLE procurement.vendor_performance (
    performance_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    supplier_id INTEGER NOT NULL REFERENCES parties.suppliers(supplier_id),
    
    -- Evaluation period
    evaluation_period TEXT NOT NULL, -- 'monthly', 'quarterly', 'yearly'
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Order metrics
    total_orders INTEGER DEFAULT 0,
    on_time_deliveries INTEGER DEFAULT 0,
    late_deliveries INTEGER DEFAULT 0,
    on_time_delivery_percent NUMERIC(5,2),
    
    -- Quality metrics
    total_items_received INTEGER DEFAULT 0,
    items_rejected INTEGER DEFAULT 0,
    rejection_rate_percent NUMERIC(5,2),
    quality_issues_count INTEGER DEFAULT 0,
    
    -- Financial metrics
    total_purchase_value NUMERIC(15,2) DEFAULT 0,
    invoice_accuracy_percent NUMERIC(5,2),
    payment_term_adherence NUMERIC(5,2),
    
    -- Return metrics
    return_count INTEGER DEFAULT 0,
    return_value NUMERIC(15,2) DEFAULT 0,
    return_rate_percent NUMERIC(5,2),
    
    -- Overall ratings
    delivery_rating NUMERIC(3,2), -- 1.00 to 5.00
    quality_rating NUMERIC(3,2),
    price_rating NUMERIC(3,2),
    service_rating NUMERIC(3,2),
    overall_rating NUMERIC(3,2),
    
    -- Status
    evaluation_status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'reviewed'
    
    -- Review
    reviewed_by INTEGER REFERENCES master.org_users(user_id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    
    -- Actions
    improvement_areas TEXT[],
    action_required BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, supplier_id, period_start, period_end)
);

-- Create indexes for performance
CREATE INDEX idx_po_supplier ON procurement.purchase_orders(supplier_id);
CREATE INDEX idx_po_date ON procurement.purchase_orders(po_date);
CREATE INDEX idx_po_status ON procurement.purchase_orders(po_status);
CREATE INDEX idx_po_items_product ON procurement.purchase_order_items(product_id);
CREATE INDEX idx_grn_po ON procurement.goods_receipt_notes(purchase_order_id);
CREATE INDEX idx_grn_date ON procurement.goods_receipt_notes(grn_date);
CREATE INDEX idx_grn_items_product ON procurement.grn_items(product_id);
CREATE INDEX idx_grn_items_batch ON procurement.grn_items(batch_number);
CREATE INDEX idx_supplier_invoices_supplier ON procurement.supplier_invoices(supplier_id);
CREATE INDEX idx_supplier_invoices_date ON procurement.supplier_invoices(invoice_date);
CREATE INDEX idx_requisitions_date ON procurement.purchase_requisitions(requisition_date);
CREATE INDEX idx_vendor_performance_supplier ON procurement.vendor_performance(supplier_id);

-- Add comments
COMMENT ON TABLE procurement.purchase_orders IS 'Purchase orders with multi-level approval workflow';
COMMENT ON TABLE procurement.goods_receipt_notes IS 'GRN with quality check and batch tracking';
COMMENT ON TABLE procurement.supplier_invoices IS 'Supplier invoices with GST reconciliation';
COMMENT ON TABLE procurement.purchase_returns IS 'Purchase returns and debit note management';
COMMENT ON TABLE procurement.vendor_performance IS 'Vendor performance evaluation and ratings';