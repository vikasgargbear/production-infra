-- =============================================
-- COMPLIANCE AND REGULATORY TRIGGERS
-- =============================================
-- Schema: compliance
-- License tracking, narcotic monitoring, and audits
-- =============================================

-- =============================================
-- 1. LICENSE EXPIRY MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_license_expiry()
RETURNS TRIGGER AS $$
DECLARE
    v_days_to_expiry INTEGER;
    v_notification_type TEXT;
    v_priority TEXT;
    v_escalation_level INTEGER;
    v_responsible_users INTEGER[];
BEGIN
    -- Calculate days to expiry
    v_days_to_expiry := (NEW.valid_until - CURRENT_DATE)::INTEGER;
    
    -- Update status based on expiry
    NEW.status := CASE
        WHEN v_days_to_expiry < 0 THEN 'expired'
        WHEN v_days_to_expiry <= 30 THEN 'expiring_soon'
        WHEN v_days_to_expiry <= 90 THEN 'attention_required'
        ELSE 'active'
    END;
    
    -- Determine notification parameters
    IF v_days_to_expiry <= 0 THEN
        v_notification_type := 'error';
        v_priority := 'critical';
        v_escalation_level := 3;
    ELSIF v_days_to_expiry <= 30 THEN
        v_notification_type := 'warning';
        v_priority := 'urgent';
        v_escalation_level := 2;
    ELSIF v_days_to_expiry <= 90 THEN
        v_notification_type := 'info';
        v_priority := 'high';
        v_escalation_level := 1;
    ELSE
        -- No notification needed
        RETURN NEW;
    END IF;
    
    -- Get responsible users based on license type
    SELECT ARRAY_AGG(u.user_id)
    INTO v_responsible_users
    FROM master.org_users u
    JOIN master.roles r ON u.role_id = r.role_id
    WHERE u.org_id = NEW.org_id
    AND u.is_active = TRUE
    AND (
        (NEW.license_type = 'drug_license' AND r.permission_flags->>'manage_drug_licenses' = 'true') OR
        (NEW.license_type = 'gst_registration' AND r.permission_flags->>'manage_gst' = 'true') OR
        (NEW.license_type IN ('factory_license', 'pollution_control') AND r.permission_flags->>'manage_compliance' = 'true')
    );
    
    -- Create notification
    INSERT INTO system_config.system_notifications (
        org_id,
        notification_type,
        notification_category,
        title,
        message,
        priority,
        target_users,
        escalation_level,
        requires_acknowledgment,
        notification_data,
        action_url
    ) VALUES (
        NEW.org_id,
        v_notification_type,
        'compliance',
        CASE 
            WHEN v_days_to_expiry < 0 THEN 'LICENSE EXPIRED'
            WHEN v_days_to_expiry <= 30 THEN 'License Expiring Soon'
            ELSE 'License Renewal Required'
        END,
        format('%s %s %s. Expiry: %s',
            NEW.license_type,
            NEW.license_number,
            CASE 
                WHEN v_days_to_expiry < 0 THEN 'has expired'
                ELSE format('expires in %s days', v_days_to_expiry)
            END,
            TO_CHAR(NEW.valid_until, 'DD/MM/YYYY')),
        v_priority,
        v_responsible_users,
        v_escalation_level,
        v_days_to_expiry <= 30, -- Require acknowledgment for urgent cases
        jsonb_build_object(
            'license_id', NEW.license_id,
            'license_type', NEW.license_type,
            'license_number', NEW.license_number,
            'days_to_expiry', v_days_to_expiry,
            'expiry_date', NEW.valid_until,
            'issuing_authority', NEW.issuing_authority
        ),
        '/compliance/licenses/' || NEW.license_id
    )
    ON CONFLICT (org_id, notification_category, (notification_data->>'license_id'))
    DO UPDATE SET
        updated_at = CURRENT_TIMESTAMP,
        escalation_level = GREATEST(
            system_config.system_notifications.escalation_level,
            v_escalation_level
        );
    
    -- Block operations for critical licenses
    IF NEW.is_mandatory AND v_days_to_expiry < 0 THEN
        -- Set organization compliance flag
        UPDATE master.organizations
        SET 
            compliance_status = jsonb_set(
                COALESCE(compliance_status, '{}'::jsonb),
                ARRAY[NEW.license_type],
                jsonb_build_object(
                    'status', 'non_compliant',
                    'reason', 'license_expired',
                    'license_id', NEW.license_id,
                    'expiry_date', NEW.valid_until
                )
            ),
            operations_blocked = CASE 
                WHEN NEW.license_type = 'drug_license' THEN TRUE
                ELSE operations_blocked
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id;
    END IF;
    
    -- Create renewal task
    IF v_days_to_expiry > 0 AND v_days_to_expiry <= 90 THEN
        INSERT INTO compliance.renewal_tasks (
            org_id,
            license_id,
            task_type,
            task_description,
            due_date,
            priority,
            assigned_to,
            created_by
        )
        SELECT 
            NEW.org_id,
            NEW.license_id,
            'license_renewal',
            format('Renew %s - %s', NEW.license_type, NEW.license_number),
            NEW.valid_until - INTERVAL '30 days',
            CASE 
                WHEN v_days_to_expiry <= 30 THEN 'urgent'
                ELSE 'high'
            END,
            v_responsible_users[1], -- Assign to first responsible user
            NEW.created_by
        WHERE NOT EXISTS (
            SELECT 1 FROM compliance.renewal_tasks
            WHERE license_id = NEW.license_id
            AND task_status IN ('pending', 'in_progress')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_monitor_license_expiry
    BEFORE INSERT OR UPDATE ON compliance.org_licenses
    FOR EACH ROW
    EXECUTE FUNCTION monitor_license_expiry();

-- =============================================
-- 2. NARCOTIC BALANCE VALIDATION
-- =============================================
CREATE OR REPLACE FUNCTION validate_narcotic_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_current_balance RECORD;
    v_calculated_balance NUMERIC;
    v_discrepancy NUMERIC;
    v_tolerance NUMERIC := 0.001; -- 1mg tolerance
    v_is_narcotic BOOLEAN;
BEGIN
    -- Check if product is narcotic/psychotropic
    SELECT 
        drug_type = 'narcotic' OR drug_type = 'psychotropic' OR
        schedule_type IN ('H', 'H1', 'X')
    INTO v_is_narcotic
    FROM inventory.products
    WHERE product_id = NEW.product_id;
    
    IF NOT v_is_narcotic THEN
        RETURN NEW;
    END IF;
    
    -- Get current balance
    SELECT 
        opening_balance,
        receipts_quantity,
        issues_quantity,
        closing_balance,
        physical_balance
    INTO v_current_balance
    FROM compliance.narcotic_register
    WHERE product_id = NEW.product_id
    AND location_id = NEW.location_id
    AND register_date = CURRENT_DATE - INTERVAL '1 day';
    
    -- Calculate expected balance
    v_calculated_balance := COALESCE(v_current_balance.closing_balance, 0);
    
    IF NEW.movement_direction = 'in' THEN
        v_calculated_balance := v_calculated_balance + NEW.base_quantity;
        
        -- Update register
        INSERT INTO compliance.narcotic_register (
            org_id,
            product_id,
            batch_id,
            location_id,
            register_date,
            opening_balance,
            receipts_quantity,
            receipt_details,
            closing_balance
        ) VALUES (
            NEW.org_id,
            NEW.product_id,
            NEW.batch_id,
            NEW.location_id,
            CURRENT_DATE,
            COALESCE(v_current_balance.closing_balance, 0),
            NEW.base_quantity,
            jsonb_build_object(
                'movement_id', NEW.movement_id,
                'reference_type', NEW.reference_type,
                'reference_number', NEW.reference_number,
                'supplier_name', CASE 
                    WHEN NEW.movement_type = 'purchase' THEN 
                        (SELECT supplier_name FROM parties.suppliers 
                         WHERE supplier_id = NEW.party_id)
                    ELSE NULL
                END,
                'license_number', CASE 
                    WHEN NEW.movement_type = 'purchase' THEN 
                        (SELECT license_number FROM parties.suppliers 
                         WHERE supplier_id = NEW.party_id)
                    ELSE NULL
                END
            ),
            v_calculated_balance
        )
        ON CONFLICT (product_id, location_id, register_date)
        DO UPDATE SET
            receipts_quantity = compliance.narcotic_register.receipts_quantity + NEW.base_quantity,
            receipt_details = compliance.narcotic_register.receipt_details || 
                jsonb_build_array(EXCLUDED.receipt_details),
            closing_balance = compliance.narcotic_register.closing_balance + NEW.base_quantity,
            updated_at = CURRENT_TIMESTAMP;
            
    ELSIF NEW.movement_direction = 'out' THEN
        -- Validate sufficient balance
        IF v_calculated_balance < NEW.base_quantity THEN
            RAISE EXCEPTION 'Insufficient narcotic balance. Available: %, Required: %',
                v_calculated_balance, NEW.base_quantity;
        END IF;
        
        v_calculated_balance := v_calculated_balance - NEW.base_quantity;
        
        -- Update register
        INSERT INTO compliance.narcotic_register (
            org_id,
            product_id,
            batch_id,
            location_id,
            register_date,
            opening_balance,
            issues_quantity,
            issue_details,
            closing_balance
        ) VALUES (
            NEW.org_id,
            NEW.product_id,
            NEW.batch_id,
            NEW.location_id,
            CURRENT_DATE,
            COALESCE(v_current_balance.closing_balance, 0),
            NEW.base_quantity,
            jsonb_build_object(
                'movement_id', NEW.movement_id,
                'reference_type', NEW.reference_type,
                'reference_number', NEW.reference_number,
                'patient_name', NEW.additional_info->>'patient_name',
                'prescription_number', NEW.additional_info->>'prescription_number',
                'doctor_name', NEW.additional_info->>'doctor_name',
                'issued_to', CASE 
                    WHEN NEW.movement_type = 'sale' THEN 
                        (SELECT customer_name FROM parties.customers 
                         WHERE customer_id = NEW.party_id)
                    ELSE NEW.additional_info->>'issued_to'
                END
            ),
            v_calculated_balance
        )
        ON CONFLICT (product_id, location_id, register_date)
        DO UPDATE SET
            issues_quantity = compliance.narcotic_register.issues_quantity + NEW.base_quantity,
            issue_details = compliance.narcotic_register.issue_details || 
                jsonb_build_array(EXCLUDED.issue_details),
            closing_balance = compliance.narcotic_register.closing_balance - NEW.base_quantity,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Check for discrepancies
    SELECT 
        closing_balance,
        physical_balance
    INTO v_current_balance
    FROM compliance.narcotic_register
    WHERE product_id = NEW.product_id
    AND location_id = NEW.location_id
    AND register_date = CURRENT_DATE;
    
    IF v_current_balance.physical_balance IS NOT NULL THEN
        v_discrepancy := ABS(v_current_balance.closing_balance - v_current_balance.physical_balance);
        
        IF v_discrepancy > v_tolerance THEN
            -- Create high priority alert
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                requires_acknowledgment,
                notification_data
            ) VALUES (
                NEW.org_id,
                'error',
                'compliance',
                'Narcotic Balance Discrepancy',
                format('CRITICAL: %s shows discrepancy of %s units. Book: %s, Physical: %s',
                    (SELECT product_name FROM inventory.products WHERE product_id = NEW.product_id),
                    v_discrepancy,
                    v_current_balance.closing_balance,
                    v_current_balance.physical_balance),
                'critical',
                TRUE,
                jsonb_build_object(
                    'product_id', NEW.product_id,
                    'location_id', NEW.location_id,
                    'book_balance', v_current_balance.closing_balance,
                    'physical_balance', v_current_balance.physical_balance,
                    'discrepancy', v_discrepancy
                )
            );
            
            -- Log in discrepancy register
            INSERT INTO compliance.narcotic_discrepancies (
                org_id,
                product_id,
                location_id,
                discrepancy_date,
                book_balance,
                physical_balance,
                discrepancy_quantity,
                status,
                created_by
            ) VALUES (
                NEW.org_id,
                NEW.product_id,
                NEW.location_id,
                CURRENT_DATE,
                v_current_balance.closing_balance,
                v_current_balance.physical_balance,
                v_discrepancy,
                'pending_investigation',
                NEW.created_by
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validate_narcotic_balance
    AFTER INSERT ON inventory.inventory_movements
    FOR EACH ROW
    EXECUTE FUNCTION validate_narcotic_balance();

-- =============================================
-- 3. REGULATORY INSPECTION TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_inspection_compliance()
RETURNS TRIGGER AS $$
DECLARE
    v_critical_findings INTEGER;
    v_major_findings INTEGER;
    v_compliance_score NUMERIC;
    v_follow_up_required BOOLEAN;
BEGIN
    -- Calculate findings summary
    SELECT 
        COUNT(CASE WHEN severity = 'critical' THEN 1 END),
        COUNT(CASE WHEN severity = 'major' THEN 1 END),
        COUNT(CASE WHEN compliance_status = 'compliant' THEN 1 END) * 100.0 / 
            NULLIF(COUNT(*), 0)
    INTO v_critical_findings, v_major_findings, v_compliance_score
    FROM compliance.inspection_findings
    WHERE inspection_id = NEW.inspection_id;
    
    -- Update inspection summary
    NEW.total_findings := (
        SELECT COUNT(*) FROM compliance.inspection_findings 
        WHERE inspection_id = NEW.inspection_id
    );
    NEW.critical_findings := v_critical_findings;
    NEW.major_findings := v_major_findings;
    NEW.minor_findings := NEW.total_findings - v_critical_findings - v_major_findings;
    NEW.compliance_score := v_compliance_score;
    
    -- Determine follow-up requirement
    v_follow_up_required := v_critical_findings > 0 OR v_major_findings > 2;
    
    -- Update status based on completion
    IF NEW.inspection_status = 'completed' AND OLD.inspection_status != 'completed' THEN
        -- Generate inspection report
        INSERT INTO compliance.inspection_reports (
            org_id,
            inspection_id,
            report_number,
            report_date,
            summary,
            recommendations,
            follow_up_required,
            next_inspection_date,
            created_by
        ) VALUES (
            NEW.org_id,
            NEW.inspection_id,
            'IR-' || TO_CHAR(NEW.inspection_date, 'YYYYMMDD') || '-' || 
                LPAD(NEW.inspection_id::TEXT, 6, '0'),
            CURRENT_DATE,
            jsonb_build_object(
                'inspection_type', NEW.inspection_type,
                'authority', NEW.inspection_authority,
                'compliance_score', v_compliance_score,
                'critical_findings', v_critical_findings,
                'major_findings', v_major_findings,
                'areas_inspected', NEW.areas_inspected
            ),
            NEW.inspector_remarks,
            v_follow_up_required,
            CASE 
                WHEN v_follow_up_required THEN CURRENT_DATE + INTERVAL '30 days'
                ELSE CURRENT_DATE + INTERVAL '1 year'
            END,
            NEW.updated_by
        );
        
        -- Create follow-up tasks for findings
        INSERT INTO compliance.corrective_actions (
            org_id,
            finding_id,
            action_required,
            priority,
            due_date,
            assigned_to,
            created_by
        )
        SELECT 
            NEW.org_id,
            f.finding_id,
            f.corrective_action_required,
            CASE f.severity
                WHEN 'critical' THEN 'urgent'
                WHEN 'major' THEN 'high'
                ELSE 'medium'
            END,
            CASE f.severity
                WHEN 'critical' THEN CURRENT_DATE + INTERVAL '7 days'
                WHEN 'major' THEN CURRENT_DATE + INTERVAL '30 days'
                ELSE CURRENT_DATE + INTERVAL '60 days'
            END,
            (SELECT user_id FROM master.org_users 
             WHERE org_id = NEW.org_id 
             AND role_id IN (SELECT role_id FROM master.roles 
                            WHERE permission_flags->>'manage_compliance' = 'true')
             AND is_active = TRUE
             LIMIT 1),
            NEW.updated_by
        FROM compliance.inspection_findings f
        WHERE f.inspection_id = NEW.inspection_id
        AND f.corrective_action_required IS NOT NULL;
        
        -- Send notifications based on severity
        IF v_critical_findings > 0 THEN
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                target_audience,
                requires_acknowledgment,
                notification_data
            ) VALUES (
                NEW.org_id,
                'error',
                'compliance',
                'Critical Inspection Findings',
                format('%s inspection by %s found %s critical findings requiring immediate action',
                    NEW.inspection_type,
                    NEW.inspection_authority,
                    v_critical_findings),
                'critical',
                'management',
                TRUE,
                jsonb_build_object(
                    'inspection_id', NEW.inspection_id,
                    'critical_findings', v_critical_findings,
                    'compliance_score', v_compliance_score,
                    'report_id', NEW.inspection_id
                )
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_inspection
    BEFORE UPDATE ON compliance.regulatory_inspections
    FOR EACH ROW
    EXECUTE FUNCTION track_inspection_compliance();

-- =============================================
-- 4. QUALITY DEVIATION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_quality_deviations()
RETURNS TRIGGER AS $$
DECLARE
    v_investigation_required BOOLEAN;
    v_capa_required BOOLEAN;
    v_risk_score NUMERIC;
    v_escalation_users INTEGER[];
BEGIN
    -- Calculate risk score
    v_risk_score := CASE NEW.severity
        WHEN 'critical' THEN 10
        WHEN 'major' THEN 7
        WHEN 'minor' THEN 3
        ELSE 1
    END * CASE NEW.impact_area
        WHEN 'patient_safety' THEN 3
        WHEN 'product_quality' THEN 2
        WHEN 'regulatory' THEN 2
        ELSE 1
    END;
    
    NEW.risk_assessment := jsonb_build_object(
        'risk_score', v_risk_score,
        'risk_level', CASE 
            WHEN v_risk_score >= 20 THEN 'critical'
            WHEN v_risk_score >= 10 THEN 'high'
            WHEN v_risk_score >= 5 THEN 'medium'
            ELSE 'low'
        END
    );
    
    -- Determine investigation requirement
    v_investigation_required := v_risk_score >= 10 OR 
                               NEW.deviation_type IN ('out_of_specification', 'contamination');
    v_capa_required := v_risk_score >= 5;
    
    -- Auto-generate deviation number
    IF NEW.deviation_number IS NULL THEN
        NEW.deviation_number := 'QD-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' ||
            LPAD(nextval('compliance.deviation_sequence')::TEXT, 4, '0');
    END IF;
    
    -- Handle status transitions
    IF NEW.status = 'reported' AND OLD.status IS NULL THEN
        -- Get QA team for escalation
        SELECT ARRAY_AGG(u.user_id)
        INTO v_escalation_users
        FROM master.org_users u
        JOIN master.roles r ON u.role_id = r.role_id
        WHERE u.org_id = NEW.org_id
        AND r.permission_flags->>'manage_quality' = 'true'
        AND u.is_active = TRUE;
        
        -- Create notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_users,
            requires_acknowledgment,
            notification_data,
            action_url
        ) VALUES (
            NEW.org_id,
            CASE 
                WHEN NEW.severity = 'critical' THEN 'error'
                WHEN NEW.severity = 'major' THEN 'warning'
                ELSE 'info'
            END,
            'quality',
            format('%s Quality Deviation Reported', INITCAP(NEW.severity)),
            format('Deviation %s: %s in %s',
                NEW.deviation_number,
                NEW.deviation_description,
                NEW.department),
            CASE 
                WHEN NEW.severity = 'critical' THEN 'critical'
                WHEN NEW.severity = 'major' THEN 'high'
                ELSE 'medium'
            END,
            v_escalation_users,
            NEW.severity IN ('critical', 'major'),
            jsonb_build_object(
                'deviation_id', NEW.deviation_id,
                'deviation_number', NEW.deviation_number,
                'severity', NEW.severity,
                'risk_score', v_risk_score,
                'investigation_required', v_investigation_required
            ),
            '/quality/deviations/' || NEW.deviation_id
        );
        
        -- Create investigation if required
        IF v_investigation_required THEN
            INSERT INTO compliance.quality_investigations (
                org_id,
                deviation_id,
                investigation_type,
                priority,
                assigned_to,
                due_date,
                created_by
            ) VALUES (
                NEW.org_id,
                NEW.deviation_id,
                'root_cause_analysis',
                CASE 
                    WHEN NEW.severity = 'critical' THEN 'urgent'
                    ELSE 'high'
                END,
                v_escalation_users[1],
                CASE 
                    WHEN NEW.severity = 'critical' THEN CURRENT_DATE + INTERVAL '2 days'
                    ELSE CURRENT_DATE + INTERVAL '7 days'
                END,
                NEW.reported_by
            );
            
            NEW.status := 'under_investigation';
        END IF;
        
        -- Quarantine affected batches if product-related
        IF NEW.affected_products IS NOT NULL THEN
            UPDATE inventory.location_wise_stock
            SET 
                stock_status = 'quarantine',
                quantity_quarantine = quantity_available,
                quantity_available = 0,
                quarantine_reason = 'Quality deviation: ' || NEW.deviation_number,
                last_updated = CURRENT_TIMESTAMP
            WHERE batch_id = ANY(NEW.affected_batches)
            AND stock_status != 'quarantine';
        END IF;
    END IF;
    
    -- Handle closure
    IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
        -- Verify all CAPAs are completed
        IF EXISTS (
            SELECT 1 FROM compliance.capa_actions
            WHERE deviation_id = NEW.deviation_id
            AND status != 'completed'
        ) THEN
            RAISE EXCEPTION 'Cannot close deviation with pending CAPA actions';
        END IF;
        
        NEW.closed_date := CURRENT_TIMESTAMP;
        NEW.closed_by := NEW.updated_by;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_deviations
    BEFORE INSERT OR UPDATE ON compliance.quality_deviations
    FOR EACH ROW
    EXECUTE FUNCTION manage_quality_deviations();

-- =============================================
-- 5. AUDIT TRAIL COMPLIANCE
-- =============================================
CREATE OR REPLACE FUNCTION maintain_gxp_audit_trail()
RETURNS TRIGGER AS $$
DECLARE
    v_table_criticality TEXT;
    v_user_details RECORD;
    v_change_summary TEXT;
BEGIN
    -- Determine table criticality for GxP
    v_table_criticality := CASE TG_TABLE_SCHEMA
        WHEN 'inventory' THEN 
            CASE TG_TABLE_NAME
                WHEN 'batches' THEN 'critical'
                WHEN 'inventory_movements' THEN 'critical'
                ELSE 'high'
            END
        WHEN 'compliance' THEN 'critical'
        WHEN 'sales' THEN 
            CASE TG_TABLE_NAME
                WHEN 'invoices' THEN 'high'
                ELSE 'medium'
            END
        ELSE 'medium'
    END;
    
    -- Skip non-critical changes in non-GxP mode
    IF v_table_criticality = 'medium' AND 
       NOT EXISTS (
           SELECT 1 FROM system_config.system_settings
           WHERE setting_key = 'gxp_mode_enabled'
           AND setting_value = 'true'
           AND org_id = COALESCE(NEW.org_id, OLD.org_id)
       ) THEN
        RETURN NEW;
    END IF;
    
    -- Get user details
    SELECT 
        u.user_id,
        u.username,
        u.full_name,
        r.role_name
    INTO v_user_details
    FROM master.org_users u
    JOIN master.roles r ON u.role_id = r.role_id
    WHERE u.user_id = COALESCE(
        NEW.updated_by, 
        NEW.created_by, 
        OLD.updated_by,
        current_setting('app.current_user_id', true)::INTEGER
    );
    
    -- Generate change summary
    IF TG_OP = 'UPDATE' THEN
        v_change_summary := (
            SELECT string_agg(
                format('%s: %s → %s', 
                    col, 
                    OLD_TABLE.col::TEXT, 
                    NEW_TABLE.col::TEXT
                ), '; '
            )
            FROM (
                SELECT key as col
                FROM jsonb_each(row_to_json(NEW)::jsonb)
                WHERE row_to_json(NEW)::jsonb->key != row_to_json(OLD)::jsonb->key
                AND key NOT IN ('updated_at', 'updated_by')
            ) changes
        );
    END IF;
    
    -- Create audit entry
    INSERT INTO compliance.gxp_audit_trail (
        schema_name,
        table_name,
        record_id,
        operation,
        user_id,
        username,
        user_full_name,
        user_role,
        timestamp,
        client_ip,
        session_id,
        old_values,
        new_values,
        change_summary,
        criticality,
        reason_for_change,
        electronic_signature
    ) VALUES (
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        COALESCE(
            NEW.batch_id::TEXT,
            NEW.invoice_id::TEXT,
            NEW.movement_id::TEXT,
            OLD.batch_id::TEXT,
            OLD.invoice_id::TEXT,
            OLD.movement_id::TEXT
        ),
        TG_OP,
        v_user_details.user_id,
        v_user_details.username,
        v_user_details.full_name,
        v_user_details.role_name,
        CURRENT_TIMESTAMP,
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        current_setting('request.jwt.claim.session', true),
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        v_change_summary,
        v_table_criticality,
        current_setting('app.change_reason', true),
        current_setting('app.electronic_signature', true)
    );
    
    -- Additional validation for critical operations
    IF v_table_criticality = 'critical' AND TG_OP IN ('UPDATE', 'DELETE') THEN
        -- Require reason for change
        IF current_setting('app.change_reason', true) IS NULL THEN
            RAISE EXCEPTION 'Reason for change is required for % operations on %', 
                TG_OP, TG_TABLE_NAME;
        END IF;
        
        -- Require electronic signature for specific operations
        IF TG_TABLE_NAME IN ('batches', 'narcotic_register') AND 
           current_setting('app.electronic_signature', true) IS NULL THEN
            RAISE EXCEPTION 'Electronic signature required for % operations on %', 
                TG_OP, TG_TABLE_NAME;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to critical tables
CREATE TRIGGER trigger_audit_batches
    AFTER INSERT OR UPDATE OR DELETE ON inventory.batches
    FOR EACH ROW
    EXECUTE FUNCTION maintain_gxp_audit_trail();

CREATE TRIGGER trigger_audit_movements
    AFTER INSERT OR UPDATE OR DELETE ON inventory.inventory_movements
    FOR EACH ROW
    EXECUTE FUNCTION maintain_gxp_audit_trail();

CREATE TRIGGER trigger_audit_narcotic
    AFTER INSERT OR UPDATE OR DELETE ON compliance.narcotic_register
    FOR EACH ROW
    EXECUTE FUNCTION maintain_gxp_audit_trail();

-- =============================================
-- 6. TEMPERATURE EXCURSION MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_temperature_excursions()
RETURNS TRIGGER AS $$
DECLARE
    v_storage_requirements RECORD;
    v_excursion_duration INTERVAL;
    v_affected_products INTEGER;
    v_total_value NUMERIC;
BEGIN
    -- Get storage requirements
    SELECT 
        min_temperature,
        max_temperature,
        storage_condition
    INTO v_storage_requirements
    FROM inventory.storage_locations
    WHERE location_id = NEW.location_id;
    
    -- Check for excursion
    IF NEW.temperature < v_storage_requirements.min_temperature OR 
       NEW.temperature > v_storage_requirements.max_temperature THEN
        
        -- Check if this is a continuing excursion
        IF EXISTS (
            SELECT 1 FROM compliance.temperature_excursions
            WHERE location_id = NEW.location_id
            AND status = 'active'
        ) THEN
            -- Update existing excursion
            UPDATE compliance.temperature_excursions
            SET 
                end_time = NEW.recorded_at,
                duration = NEW.recorded_at - start_time,
                max_temperature = GREATEST(max_temperature, NEW.temperature),
                min_temperature = LEAST(min_temperature, NEW.temperature),
                readings_count = readings_count + 1
            WHERE location_id = NEW.location_id
            AND status = 'active';
        ELSE
            -- Create new excursion record
            INSERT INTO compliance.temperature_excursions (
                org_id,
                location_id,
                start_time,
                temperature_at_start,
                min_temperature,
                max_temperature,
                required_min,
                required_max,
                severity,
                status
            ) VALUES (
                NEW.org_id,
                NEW.location_id,
                NEW.recorded_at,
                NEW.temperature,
                NEW.temperature,
                NEW.temperature,
                v_storage_requirements.min_temperature,
                v_storage_requirements.max_temperature,
                CASE 
                    WHEN ABS(NEW.temperature - CASE 
                        WHEN NEW.temperature < v_storage_requirements.min_temperature 
                        THEN v_storage_requirements.min_temperature
                        ELSE v_storage_requirements.max_temperature
                    END) > 5 THEN 'critical'
                    WHEN ABS(NEW.temperature - CASE 
                        WHEN NEW.temperature < v_storage_requirements.min_temperature 
                        THEN v_storage_requirements.min_temperature
                        ELSE v_storage_requirements.max_temperature
                    END) > 2 THEN 'major'
                    ELSE 'minor'
                END,
                'active'
            );
            
            -- Calculate affected inventory
            SELECT 
                COUNT(DISTINCT lws.product_id),
                SUM(lws.quantity_available * b.mrp_per_unit)
            INTO v_affected_products, v_total_value
            FROM inventory.location_wise_stock lws
            JOIN inventory.batches b ON lws.batch_id = b.batch_id
            WHERE lws.location_id = NEW.location_id
            AND lws.quantity_available > 0;
            
            -- Create alert
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                requires_acknowledgment,
                notification_data
            ) VALUES (
                NEW.org_id,
                'error',
                'compliance',
                'Temperature Excursion Alert',
                format('Temperature %s°C recorded at %s (Required: %s-%s°C). %s products worth ₹%s affected.',
                    NEW.temperature,
                    (SELECT location_name FROM inventory.storage_locations WHERE location_id = NEW.location_id),
                    v_storage_requirements.min_temperature,
                    v_storage_requirements.max_temperature,
                    v_affected_products,
                    TO_CHAR(v_total_value, 'FM99,99,999')),
                'urgent',
                TRUE,
                jsonb_build_object(
                    'location_id', NEW.location_id,
                    'temperature', NEW.temperature,
                    'required_range', format('%s-%s°C', 
                        v_storage_requirements.min_temperature,
                        v_storage_requirements.max_temperature),
                    'affected_products', v_affected_products,
                    'inventory_value', v_total_value
                )
            );
        END IF;
        
        -- Update product status if critical
        IF ABS(NEW.temperature - CASE 
            WHEN NEW.temperature < v_storage_requirements.min_temperature 
            THEN v_storage_requirements.min_temperature
            ELSE v_storage_requirements.max_temperature
        END) > 5 THEN
            UPDATE inventory.location_wise_stock
            SET 
                stock_status = 'quarantine',
                quarantine_reason = format('Temperature excursion: %s°C at %s',
                    NEW.temperature,
                    TO_CHAR(NEW.recorded_at, 'DD/MM/YYYY HH24:MI')),
                last_updated = CURRENT_TIMESTAMP
            WHERE location_id = NEW.location_id
            AND stock_status = 'available';
        END IF;
        
    ELSE
        -- Temperature back to normal - close excursion
        UPDATE compliance.temperature_excursions
        SET 
            status = 'resolved',
            end_time = NEW.recorded_at,
            duration = NEW.recorded_at - start_time,
            resolution_notes = 'Temperature returned to acceptable range'
        WHERE location_id = NEW.location_id
        AND status = 'active';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_monitor_temperature
    AFTER INSERT ON compliance.temperature_logs
    FOR EACH ROW
    EXECUTE FUNCTION monitor_temperature_excursions();

-- =============================================
-- 7. PRODUCT RECALL MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_product_recall()
RETURNS TRIGGER AS $$
DECLARE
    v_affected_quantity NUMERIC;
    v_distributed_quantity NUMERIC;
    v_customer_count INTEGER;
    v_notification_sent INTEGER := 0;
BEGIN
    -- Update recall status
    IF NEW.recall_status = 'initiated' AND OLD.recall_status = 'draft' THEN
        -- Calculate affected quantities
        SELECT 
            SUM(lws.quantity_available),
            SUM(im.quantity)
        INTO v_affected_quantity, v_distributed_quantity
        FROM inventory.batches b
        LEFT JOIN inventory.location_wise_stock lws ON b.batch_id = lws.batch_id
        LEFT JOIN inventory.inventory_movements im ON b.batch_id = im.batch_id
            AND im.movement_direction = 'out'
            AND im.movement_type = 'sale'
        WHERE b.batch_id = ANY(NEW.affected_batches);
        
        -- Get affected customers
        SELECT COUNT(DISTINCT o.customer_id)
        INTO v_customer_count
        FROM sales.invoice_items ii
        JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
        JOIN sales.orders o ON i.order_id = o.order_id
        WHERE ii.batch_id = ANY(NEW.affected_batches)
        AND i.invoice_date >= NEW.recall_period_start
        AND i.invoice_date <= COALESCE(NEW.recall_period_end, CURRENT_DATE);
        
        -- Update recall details
        NEW.total_quantity_affected := v_affected_quantity + v_distributed_quantity;
        NEW.quantity_in_market := v_distributed_quantity;
        NEW.customers_affected := v_customer_count;
        
        -- Quarantine all stock
        UPDATE inventory.location_wise_stock
        SET 
            stock_status = 'recalled',
            quantity_quarantine = quantity_available,
            quantity_available = 0,
            quarantine_reason = 'Product recall: ' || NEW.recall_number,
            last_updated = CURRENT_TIMESTAMP
        WHERE batch_id = ANY(NEW.affected_batches);
        
        -- Notify customers
        FOR v_customer_count IN
            SELECT DISTINCT 
                c.customer_id,
                c.customer_name,
                c.email,
                c.mobile_number,
                STRING_AGG(DISTINCT ii.batch_number, ', ') as batch_numbers,
                SUM(ii.quantity) as total_quantity
            FROM sales.invoice_items ii
            JOIN sales.invoices i ON ii.invoice_id = i.invoice_id
            JOIN parties.customers c ON i.customer_id = c.customer_id
            WHERE ii.batch_id = ANY(NEW.affected_batches)
            AND i.invoice_date >= NEW.recall_period_start
            GROUP BY c.customer_id, c.customer_name, c.email, c.mobile_number
        LOOP
            -- Create customer notification
            INSERT INTO compliance.recall_notifications (
                recall_id,
                customer_id,
                notification_type,
                notification_status,
                created_at
            ) VALUES (
                NEW.recall_id,
                v_customer_count.customer_id,
                'email',
                'pending',
                CURRENT_TIMESTAMP
            );
            
            v_notification_sent := v_notification_sent + 1;
        END LOOP;
        
        -- Create regulatory notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_audience,
            requires_acknowledgment,
            notification_data
        ) VALUES (
            NEW.org_id,
            'error',
            'compliance',
            format('Product Recall %s - %s', NEW.recall_classification, NEW.recall_number),
            format('Recall initiated for %s. %s customers affected, %s units in market.',
                (SELECT product_name FROM inventory.products WHERE product_id = NEW.product_id),
                v_customer_count,
                v_distributed_quantity),
            'critical',
            'all',
            TRUE,
            jsonb_build_object(
                'recall_id', NEW.recall_id,
                'recall_number', NEW.recall_number,
                'classification', NEW.recall_classification,
                'customers_affected', v_customer_count,
                'quantity_in_market', v_distributed_quantity,
                'notifications_sent', v_notification_sent
            )
        );
        
        -- Report to regulatory authority
        IF NEW.recall_classification IN ('Class I', 'Class II') THEN
            INSERT INTO compliance.regulatory_communications (
                org_id,
                communication_type,
                authority,
                subject,
                content,
                priority,
                created_by
            ) VALUES (
                NEW.org_id,
                'recall_notification',
                'CDSCO',
                format('Product Recall Notification - %s', NEW.recall_number),
                jsonb_build_object(
                    'recall_details', row_to_json(NEW),
                    'affected_quantity', v_distributed_quantity,
                    'customers_affected', v_customer_count
                ),
                'urgent',
                NEW.initiated_by
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_recall
    BEFORE UPDATE ON compliance.product_recalls
    FOR EACH ROW
    EXECUTE FUNCTION manage_product_recall();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_licenses_expiry ON compliance.org_licenses(valid_until, license_status);
CREATE INDEX IF NOT EXISTS idx_narcotic_register_product ON compliance.narcotic_register(product_id, branch_id, transaction_date);
-- CREATE INDEX idx_inspection_findings_severity ON compliance.inspection_findings(inspection_id, severity); -- Table doesn't exist
CREATE INDEX idx_deviations_status ON compliance.quality_deviations(deviation_status, severity);
-- CREATE INDEX idx_temperature_logs_location ON compliance.temperature_logs(location_id, recorded_at); -- Table doesn't exist
-- CREATE INDEX idx_audit_trail_table ON compliance.gxp_audit_trail(schema_name, table_name, timestamp); -- Table doesn't exist
-- CREATE INDEX idx_recalls_status ON compliance.product_recalls(recall_status, recall_classification); -- Table doesn't exist

-- Add comments
COMMENT ON FUNCTION monitor_license_expiry() IS 'Monitors license expiry and creates renewal tasks';
COMMENT ON FUNCTION validate_narcotic_balance() IS 'Validates narcotic drug balance and detects discrepancies';
COMMENT ON FUNCTION track_inspection_compliance() IS 'Tracks regulatory inspection findings and corrective actions';
COMMENT ON FUNCTION manage_quality_deviations() IS 'Manages quality deviations with risk assessment';
COMMENT ON FUNCTION maintain_gxp_audit_trail() IS 'Maintains GxP-compliant audit trail for critical operations';
COMMENT ON FUNCTION monitor_temperature_excursions() IS 'Monitors cold chain temperature excursions';
COMMENT ON FUNCTION manage_product_recall() IS 'Manages product recall process and notifications';