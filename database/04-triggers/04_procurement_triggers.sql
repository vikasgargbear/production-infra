-- =============================================
-- PROCUREMENT OPERATIONS TRIGGERS
-- =============================================
-- Schema: procurement
-- Purchase orders, GRN, and vendor management
-- =============================================

-- =============================================
-- 1. PURCHASE ORDER TOTAL CALCULATION
-- =============================================
CREATE OR REPLACE FUNCTION calculate_po_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_totals RECORD;
BEGIN
    -- Calculate totals from PO items
    SELECT 
        COUNT(*) as item_count,
        COALESCE(SUM(ordered_quantity * unit_price), 0) as subtotal,
        COALESCE(SUM(discount_amount), 0) as total_discount,
        COALESCE(SUM(taxable_amount), 0) as taxable,
        COALESCE(SUM(tax_amount), 0) as tax,
        COALESCE(SUM(line_total), 0) as total
    INTO v_totals
    FROM procurement.purchase_order_items
    WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id)
    AND item_status != 'cancelled';
    
    -- Update PO totals
    UPDATE procurement.purchase_orders
    SET 
        items_count = v_totals.item_count,
        subtotal_amount = v_totals.subtotal,
        discount_amount = v_totals.total_discount,
        taxable_amount = v_totals.taxable,
        tax_amount = v_totals.tax,
        round_off_amount = ROUND(v_totals.total) - v_totals.total,
        total_amount = ROUND(v_totals.total),
        updated_at = CURRENT_TIMESTAMP
    WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_po_totals
    AFTER INSERT OR UPDATE OR DELETE ON procurement.purchase_order_items
    FOR EACH ROW
    EXECUTE FUNCTION calculate_po_totals();

-- =============================================
-- 2. GRN BATCH CREATION AND VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION process_grn_batch()
RETURNS TRIGGER AS $$
DECLARE
    v_batch_id INTEGER;
    v_product RECORD;
    v_existing_batch RECORD;
BEGIN
    -- Get product details
    SELECT * INTO v_product
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    -- Check if batch exists
    SELECT * INTO v_existing_batch
    FROM inventory.batches
    WHERE org_id = (SELECT org_id FROM procurement.goods_receipt_notes WHERE grn_id = NEW.grn_id)
    AND product_id = NEW.product_id
    AND batch_number = NEW.batch_number;
    
    IF v_existing_batch.batch_id IS NOT NULL THEN
        -- Update existing batch
        UPDATE inventory.batches
        SET 
            initial_quantity = initial_quantity + NEW.accepted_quantity,
            quantity_available = quantity_available + NEW.accepted_quantity,
            -- Update cost using weighted average
            cost_per_unit = (
                (quantity_available * cost_per_unit) + 
                (NEW.accepted_quantity * NEW.unit_price)
            ) / (quantity_available + NEW.accepted_quantity),
            updated_at = CURRENT_TIMESTAMP
        WHERE batch_id = v_existing_batch.batch_id;
        
        v_batch_id := v_existing_batch.batch_id;
    ELSE
        -- Create new batch
        INSERT INTO inventory.batches (
            org_id,
            product_id,
            batch_number,
            alternate_batch_number,
            manufacturing_date,
            expiry_date,
            initial_quantity,
            quantity_available,
            cost_per_unit,
            mrp_per_unit,
            sale_price_per_unit,
            trade_price_per_unit,
            source_type,
            source_reference_id,
            supplier_id,
            qc_status,
            created_by
        )
        SELECT 
            g.org_id,
            NEW.product_id,
            NEW.batch_number,
            g.supplier_invoice_number,
            NEW.manufacturing_date,
            NEW.expiry_date,
            NEW.accepted_quantity,
            NEW.accepted_quantity,
            NEW.unit_price,
            NEW.mrp,
            NEW.ptr,
            NEW.pts,
            'purchase',
            NEW.grn_id,
            g.supplier_id,
            NEW.qc_status,
            g.created_by
        FROM procurement.goods_receipt_notes g
        WHERE g.grn_id = NEW.grn_id
        RETURNING batch_id INTO v_batch_id;
    END IF;
    
    -- Create inventory movement
    INSERT INTO inventory.inventory_movements (
        org_id,
        movement_type,
        movement_direction,
        product_id,
        batch_id,
        quantity,
        base_quantity,
        location_id,
        unit_cost,
        total_cost,
        reference_type,
        reference_id,
        reference_number,
        created_by
    )
    SELECT 
        g.org_id,
        'purchase',
        'in',
        NEW.product_id,
        v_batch_id,
        NEW.accepted_quantity,
        NEW.accepted_quantity * COALESCE(NEW.pack_size, 1),
        NEW.storage_location_id,
        NEW.unit_price,
        NEW.accepted_quantity * NEW.unit_price,
        'grn',
        NEW.grn_id,
        g.grn_number,
        g.received_by
    FROM procurement.goods_receipt_notes g
    WHERE g.grn_id = NEW.grn_id;
    
    -- Update PO item status
    IF NEW.po_item_id IS NOT NULL THEN
        UPDATE procurement.purchase_order_items
        SET 
            received_quantity = COALESCE(received_quantity, 0) + NEW.accepted_quantity,
            pending_quantity = ordered_quantity - 
                              (COALESCE(received_quantity, 0) + NEW.accepted_quantity),
            item_status = CASE 
                WHEN ordered_quantity <= (COALESCE(received_quantity, 0) + NEW.accepted_quantity)
                THEN 'received'
                ELSE 'partial'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE po_item_id = NEW.po_item_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_process_grn_batch
    AFTER INSERT ON procurement.grn_items
    FOR EACH ROW
    WHEN (NEW.qc_status IN ('passed', 'conditional'))
    EXECUTE FUNCTION process_grn_batch();

-- =============================================
-- 3. SUPPLIER INVOICE MATCHING
-- =============================================
CREATE OR REPLACE FUNCTION match_supplier_invoice()
RETURNS TRIGGER AS $$
DECLARE
    v_grn_total NUMERIC;
    v_po_total NUMERIC;
    v_variance NUMERIC;
    v_tolerance_percent NUMERIC := 2; -- 2% tolerance
BEGIN
    -- Calculate GRN totals
    SELECT 
        COALESCE(SUM(gi.accepted_quantity * gi.unit_price), 0)
    INTO v_grn_total
    FROM procurement.grn_items gi
    WHERE gi.grn_id = ANY(NEW.grn_ids);
    
    -- Calculate PO totals
    SELECT 
        COALESCE(SUM(po.total_amount), 0)
    INTO v_po_total
    FROM procurement.purchase_orders po
    WHERE po.purchase_order_id = ANY(NEW.purchase_order_ids);
    
    -- Calculate variance
    v_variance := ABS(NEW.subtotal_amount - v_grn_total);
    
    -- Check variance
    IF v_variance > (v_grn_total * v_tolerance_percent / 100) THEN
        -- Create notification for variance
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            NEW.org_id,
            'warning',
            'procurement',
            'Invoice Amount Variance',
            format('Supplier invoice %s has variance of ₹%s. Invoice: ₹%s, GRN Total: ₹%s',
                NEW.supplier_invoice_number,
                TO_CHAR(v_variance, 'FM99,99,999'),
                TO_CHAR(NEW.subtotal_amount, 'FM99,99,999'),
                TO_CHAR(v_grn_total, 'FM99,99,999')),
            'high',
            jsonb_build_object(
                'invoice_id', NEW.supplier_invoice_id,
                'invoice_number', NEW.supplier_invoice_number,
                'invoice_amount', NEW.subtotal_amount,
                'grn_total', v_grn_total,
                'variance', v_variance,
                'variance_percent', ROUND(v_variance * 100.0 / NULLIF(v_grn_total, 0), 2)
            )
        );
        
        -- Require additional approval
        NEW.invoice_status := 'verification_required';
    END IF;
    
    -- Update supplier outstanding
    IF NEW.invoice_status = 'approved' AND OLD.invoice_status != 'approved' THEN
        INSERT INTO financial.supplier_outstanding (
            org_id,
            supplier_id,
            document_type,
            document_id,
            document_number,
            document_date,
            original_amount,
            outstanding_amount,
            due_date
        ) VALUES (
            NEW.org_id,
            NEW.supplier_id,
            'invoice',
            NEW.supplier_invoice_id,
            NEW.supplier_invoice_number,
            NEW.invoice_date,
            NEW.invoice_total,
            NEW.invoice_total,
            NEW.due_date
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_match_supplier_invoice
    BEFORE UPDATE OF invoice_status ON procurement.supplier_invoices
    FOR EACH ROW
    EXECUTE FUNCTION match_supplier_invoice();

-- =============================================
-- 4. VENDOR PERFORMANCE TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION update_vendor_performance()
RETURNS TRIGGER AS $$
DECLARE
    v_performance RECORD;
    v_lead_time INTEGER;
    v_on_time BOOLEAN;
BEGIN
    -- Track on GRN completion
    IF NEW.grn_status = 'approved' AND OLD.grn_status != 'approved' THEN
        -- Get or create performance record
        INSERT INTO procurement.vendor_performance (
            org_id,
            supplier_id,
            evaluation_period,
            period_start,
            period_end
        )
        SELECT 
            NEW.org_id,
            NEW.supplier_id,
            'monthly',
            DATE_TRUNC('month', NEW.grn_date),
            DATE_TRUNC('month', NEW.grn_date) + INTERVAL '1 month' - INTERVAL '1 day'
        WHERE NOT EXISTS (
            SELECT 1 FROM procurement.vendor_performance
            WHERE org_id = NEW.org_id
            AND supplier_id = NEW.supplier_id
            AND period_start = DATE_TRUNC('month', NEW.grn_date)
        );
        
        -- Calculate lead time
        SELECT 
            (NEW.grn_date - po.po_date)::INTEGER,
            NEW.grn_date <= po.expected_delivery_date
        INTO v_lead_time, v_on_time
        FROM procurement.purchase_orders po
        WHERE po.purchase_order_id = NEW.purchase_order_id;
        
        -- Update metrics
        UPDATE procurement.vendor_performance
        SET 
            total_orders = total_orders + 1,
            on_time_deliveries = on_time_deliveries + CASE WHEN v_on_time THEN 1 ELSE 0 END,
            late_deliveries = late_deliveries + CASE WHEN NOT v_on_time THEN 1 ELSE 0 END,
            on_time_delivery_percent = 
                (on_time_deliveries + CASE WHEN v_on_time THEN 1 ELSE 0 END) * 100.0 / 
                (total_orders + 1),
            total_items_received = total_items_received + 
                (SELECT COUNT(*) FROM procurement.grn_items WHERE grn_id = NEW.grn_id),
            items_rejected = items_rejected + 
                (SELECT COALESCE(SUM(rejected_quantity), 0) 
                 FROM procurement.grn_items WHERE grn_id = NEW.grn_id),
            total_purchase_value = total_purchase_value + 
                (SELECT COALESCE(SUM(accepted_quantity * unit_price), 0)
                 FROM procurement.grn_items WHERE grn_id = NEW.grn_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id
        AND supplier_id = NEW.supplier_id
        AND period_start = DATE_TRUNC('month', NEW.grn_date);
        
        -- Update quality metrics
        WITH quality_stats AS (
            SELECT 
                COUNT(*) as total_items,
                SUM(CASE WHEN qc_status = 'failed' THEN 1 ELSE 0 END) as failed_items,
                SUM(rejected_quantity) as rejected_qty,
                SUM(accepted_quantity + COALESCE(rejected_quantity, 0)) as total_qty
            FROM procurement.grn_items
            WHERE grn_id = NEW.grn_id
        )
        UPDATE procurement.vendor_performance vp
        SET 
            quality_issues_count = quality_issues_count + 
                CASE WHEN qs.failed_items > 0 THEN 1 ELSE 0 END,
            rejection_rate_percent = 
                CASE 
                    WHEN (vp.total_items_received + qs.total_items) > 0 
                    THEN (vp.items_rejected + qs.rejected_qty) * 100.0 / 
                         (vp.total_items_received + qs.total_items)
                    ELSE 0
                END
        FROM quality_stats qs
        WHERE vp.org_id = NEW.org_id
        AND vp.supplier_id = NEW.supplier_id
        AND vp.period_start = DATE_TRUNC('month', NEW.grn_date);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vendor_performance
    AFTER UPDATE OF grn_status ON procurement.goods_receipt_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_vendor_performance();

-- =============================================
-- 5. PURCHASE REQUISITION WORKFLOW
-- =============================================
CREATE OR REPLACE FUNCTION process_requisition_workflow()
RETURNS TRIGGER AS $$
DECLARE
    v_approver RECORD;
    v_approval_limit NUMERIC;
    v_total_value NUMERIC;
BEGIN
    -- Handle submission
    IF NEW.requisition_status = 'submitted' AND OLD.requisition_status = 'draft' THEN
        -- Calculate total estimated value
        SELECT SUM(requested_quantity * COALESCE(last_purchase_price, 0))
        INTO v_total_value
        FROM procurement.purchase_requisition_items
        WHERE requisition_id = NEW.requisition_id;
        
        -- Get first approver based on amount
        SELECT 
            u.user_id,
            u.full_name,
            r.approval_limit
        INTO v_approver
        FROM master.org_users u
        JOIN master.roles r ON u.role_id = r.role_id
        WHERE u.org_id = NEW.org_id
        AND u.branch_id = NEW.branch_id
        AND r.can_approve_requisitions = TRUE
        AND (r.approval_limit IS NULL OR r.approval_limit >= v_total_value)
        AND u.is_active = TRUE
        ORDER BY r.approval_limit NULLS LAST
        LIMIT 1;
        
        IF v_approver.user_id IS NOT NULL THEN
            NEW.current_approver_id := v_approver.user_id;
            NEW.approval_history := jsonb_build_array(
                jsonb_build_object(
                    'action', 'submitted',
                    'user_id', NEW.requested_by,
                    'timestamp', CURRENT_TIMESTAMP,
                    'notes', 'Requisition submitted for approval'
                )
            );
            
            -- Send notification to approver
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_users,
                action_url
            ) VALUES (
                NEW.org_id,
                'info',
                'procurement',
                'Purchase Requisition Approval Required',
                format('Requisition %s requires your approval. Estimated value: ₹%s',
                    NEW.requisition_number,
                    TO_CHAR(v_total_value, 'FM99,99,999')),
                CASE 
                    WHEN NEW.priority = 'urgent' THEN 'urgent'
                    WHEN NEW.priority = 'high' THEN 'high'
                    ELSE 'normal'
                END,
                ARRAY[v_approver.user_id],
                '/procurement/requisitions/' || NEW.requisition_id
            );
        ELSE
            RAISE EXCEPTION 'No approver found for requisition amount ₹%', v_total_value;
        END IF;
    END IF;
    
    -- Handle approval
    IF NEW.approval_status = 'approved' AND OLD.approval_status = 'pending' THEN
        NEW.requisition_status := 'approved';
        NEW.approval_history := OLD.approval_history || jsonb_build_object(
            'action', 'approved',
            'user_id', NEW.current_approver_id,
            'timestamp', CURRENT_TIMESTAMP,
            'notes', 'Requisition approved'
        );
        
        -- Create notification for requester
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_users
        ) VALUES (
            NEW.org_id,
            'success',
            'procurement',
            'Requisition Approved',
            format('Your requisition %s has been approved and can now be converted to PO',
                NEW.requisition_number),
            'normal',
            ARRAY[NEW.requested_by]
        );
        
        -- Auto-create PO if configured
        IF EXISTS (
            SELECT 1 FROM system_config.system_settings
            WHERE setting_key = 'auto_create_po_from_requisition'
            AND setting_value = 'true'
            AND org_id = NEW.org_id
        ) THEN
            -- This would call a function to create PO
            -- Simplified for this example
            NEW.converted_to_po := TRUE;
        END IF;
    END IF;
    
    -- Handle rejection
    IF NEW.approval_status = 'rejected' AND OLD.approval_status = 'pending' THEN
        NEW.requisition_status := 'rejected';
        NEW.approval_history := OLD.approval_history || jsonb_build_object(
            'action', 'rejected',
            'user_id', NEW.current_approver_id,
            'timestamp', CURRENT_TIMESTAMP,
            'notes', NEW.rejection_reason
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_requisition_workflow
    BEFORE UPDATE ON procurement.purchase_requisitions
    FOR EACH ROW
    EXECUTE FUNCTION process_requisition_workflow();

-- =============================================
-- 6. PURCHASE RETURN PROCESSING
-- =============================================
CREATE OR REPLACE FUNCTION process_purchase_return()
RETURNS TRIGGER AS $$
DECLARE
    v_debit_note_number TEXT;
    v_item RECORD;
BEGIN
    -- Generate debit note on approval
    IF NEW.approval_status = 'approved' AND OLD.approval_status != 'approved' THEN
        -- Generate debit note number
        SELECT 'DN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
               LPAD(COALESCE(MAX(REGEXP_REPLACE(debit_note_number, '^DN-[0-9]{6}-', '')::INTEGER), 0) + 1::TEXT, 6, '0')
        INTO v_debit_note_number
        FROM procurement.purchase_returns
        WHERE org_id = NEW.org_id
        AND debit_note_number LIKE 'DN-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-%';
        
        NEW.debit_note_number := v_debit_note_number;
        NEW.debit_note_date := CURRENT_DATE;
        NEW.debit_note_status := 'issued';
        
        -- Process each return item
        FOR v_item IN
            SELECT * FROM procurement.purchase_return_items
            WHERE return_id = NEW.return_id
        LOOP
            -- Remove stock from inventory
            INSERT INTO inventory.inventory_movements (
                org_id,
                movement_type,
                movement_direction,
                product_id,
                batch_id,
                quantity,
                base_quantity,
                location_id,
                reference_type,
                reference_id,
                reference_number,
                reason,
                created_by
            )
            SELECT 
                NEW.org_id,
                'return',
                'out',
                v_item.product_id,
                v_item.batch_id,
                v_item.return_quantity,
                v_item.return_quantity,
                lws.location_id,
                'purchase_return',
                NEW.return_id,
                NEW.return_number,
                NEW.return_reason,
                NEW.created_by
            FROM inventory.location_wise_stock lws
            WHERE lws.batch_id = v_item.batch_id
            AND lws.quantity_available >= v_item.return_quantity
            ORDER BY lws.stock_in_date DESC
            LIMIT 1;
        END LOOP;
        
        -- Create debit note in outstanding
        INSERT INTO financial.supplier_outstanding (
            org_id,
            supplier_id,
            document_type,
            document_id,
            document_number,
            document_date,
            original_amount,
            outstanding_amount,
            status
        ) VALUES (
            NEW.org_id,
            NEW.supplier_id,
            'debit_note',
            NEW.return_id,
            NEW.debit_note_number,
            NEW.debit_note_date,
            -NEW.total_amount, -- Negative for debit
            -NEW.total_amount,
            'open'
        );
        
        -- Send notification to supplier
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            notification_data
        ) VALUES (
            NEW.org_id,
            'info',
            'procurement',
            'Debit Note Issued',
            format('Debit note %s for ₹%s has been issued to %s',
                NEW.debit_note_number,
                TO_CHAR(NEW.total_amount, 'FM99,99,999'),
                (SELECT supplier_name FROM parties.suppliers WHERE supplier_id = NEW.supplier_id)),
            'normal',
            jsonb_build_object(
                'return_id', NEW.return_id,
                'debit_note_number', NEW.debit_note_number,
                'amount', NEW.total_amount,
                'supplier_id', NEW.supplier_id
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_process_purchase_return
    BEFORE UPDATE OF approval_status ON procurement.purchase_returns
    FOR EACH ROW
    EXECUTE FUNCTION process_purchase_return();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_po_items_po ON procurement.purchase_order_items(purchase_order_id);
CREATE INDEX idx_grn_items_grn ON procurement.grn_items(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_product ON procurement.grn_items(product_id);
CREATE INDEX idx_supplier_invoices_grn ON procurement.supplier_invoices USING GIN(grn_ids);
CREATE INDEX IF NOT EXISTS idx_vendor_performance_supplier ON procurement.vendor_performance(supplier_id, period_start);
CREATE INDEX idx_requisitions_status ON procurement.purchase_requisitions(requisition_status);
CREATE INDEX idx_requisitions_approver ON procurement.purchase_requisitions(current_approver_id);

-- Add comments
COMMENT ON FUNCTION calculate_po_totals() IS 'Calculates purchase order totals from line items';
COMMENT ON FUNCTION process_grn_batch() IS 'Creates or updates batches from goods receipt';
COMMENT ON FUNCTION update_vendor_performance() IS 'Tracks vendor performance metrics';
COMMENT ON FUNCTION process_requisition_workflow() IS 'Manages purchase requisition approval workflow';