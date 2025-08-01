-- =============================================
-- COMPLIANCE BUSINESS FUNCTIONS  
-- =============================================
-- Advanced compliance operations for pharmaceutical industry
-- including license management, narcotic tracking, and audits
-- =============================================

-- =============================================
-- 1. LICENSE COMPLIANCE MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_license_compliance(
    p_org_id INTEGER,
    p_days_ahead INTEGER DEFAULT 90
)
RETURNS TABLE (
    total_licenses INTEGER,
    expiring_soon INTEGER,
    expired INTEGER,
    compliance_score NUMERIC,
    license_details JSONB,
    action_required JSONB
) AS $$
DECLARE
    v_license_details JSONB;
    v_actions JSONB;
    v_compliance_score NUMERIC;
BEGIN
    -- Get license details
    SELECT jsonb_agg(
        jsonb_build_object(
            'license_id', license_id,
            'license_type', license_type,
            'license_number', license_number,
            'issuing_authority', issuing_authority,
            'issue_date', issue_date,
            'expiry_date', expiry_date,
            'status', CASE 
                WHEN expiry_date < CURRENT_DATE THEN 'expired'
                WHEN expiry_date <= CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL THEN 'expiring_soon'
                ELSE 'active'
            END,
            'days_to_expiry', expiry_date - CURRENT_DATE,
            'renewal_status', renewal_status,
            'branches', (
                SELECT jsonb_agg(b.branch_name)
                FROM master.branches b
                WHERE b.branch_id = ANY(bl.applicable_branches)
            )
        ) ORDER BY expiry_date
    )
    INTO v_license_details
    FROM compliance.business_licenses bl
    WHERE bl.org_id = p_org_id
    AND bl.is_active = TRUE;
    
    -- Generate action items
    SELECT jsonb_agg(
        jsonb_build_object(
            'action_type', action_type,
            'priority', priority,
            'license_type', license_type,
            'license_number', license_number,
            'expiry_date', expiry_date,
            'description', description,
            'responsible_person', responsible_person
        ) ORDER BY priority_order, expiry_date
    )
    INTO v_actions
    FROM (
        -- Expired licenses
        SELECT 
            'renew_license' as action_type,
            'critical' as priority,
            1 as priority_order,
            license_type,
            license_number,
            expiry_date,
            format('License expired %s days ago. Immediate renewal required!',
                   CURRENT_DATE - expiry_date) as description,
            responsible_person
        FROM compliance.business_licenses
        WHERE org_id = p_org_id
        AND is_active = TRUE
        AND expiry_date < CURRENT_DATE
        
        UNION ALL
        
        -- Expiring soon
        SELECT 
            'initiate_renewal' as action_type,
            CASE 
                WHEN expiry_date - CURRENT_DATE <= 30 THEN 'high'
                WHEN expiry_date - CURRENT_DATE <= 60 THEN 'medium'
                ELSE 'low'
            END as priority,
            CASE 
                WHEN expiry_date - CURRENT_DATE <= 30 THEN 2
                WHEN expiry_date - CURRENT_DATE <= 60 THEN 3
                ELSE 4
            END as priority_order,
            license_type,
            license_number,
            expiry_date,
            format('License expires in %s days. Start renewal process.',
                   expiry_date - CURRENT_DATE) as description,
            responsible_person
        FROM compliance.business_licenses
        WHERE org_id = p_org_id
        AND is_active = TRUE
        AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL
        
        UNION ALL
        
        -- Missing required licenses
        SELECT 
            'obtain_license' as action_type,
            'high' as priority,
            2 as priority_order,
            rl.license_type,
            'Not Available' as license_number,
            NULL as expiry_date,
            format('Required license "%s" not found for %s',
                   rl.license_type, b.branch_name) as description,
            b.branch_head as responsible_person
        FROM compliance.required_licenses rl
        CROSS JOIN master.branches b
        WHERE b.org_id = p_org_id
        AND b.is_active = TRUE
        AND NOT EXISTS (
            SELECT 1 FROM compliance.business_licenses bl
            WHERE bl.org_id = p_org_id
            AND bl.license_type = rl.license_type
            AND b.branch_id = ANY(bl.applicable_branches)
            AND bl.is_active = TRUE
            AND bl.expiry_date > CURRENT_DATE
        )
    ) action_items;
    
    -- Calculate compliance score
    SELECT 
        CASE 
            WHEN total_licenses = 0 THEN 0
            ELSE ROUND(
                ((active_licenses::NUMERIC / total_licenses) * 60) + -- 60% for active licenses
                ((on_time_renewals::NUMERIC / NULLIF(total_renewals, 0)) * 30) + -- 30% for timely renewals
                (CASE WHEN expired_licenses = 0 THEN 10 ELSE 0 END) -- 10% bonus for no expired
            , 2)
        END
    INTO v_compliance_score
    FROM (
        SELECT 
            COUNT(*) as total_licenses,
            COUNT(*) FILTER (WHERE expiry_date > CURRENT_DATE + INTERVAL '30 days') as active_licenses,
            COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE) as expired_licenses,
            COUNT(*) FILTER (WHERE renewal_status = 'renewed') as total_renewals,
            COUNT(*) FILTER (WHERE renewal_status = 'renewed' AND 
                           renewed_before_expiry = TRUE) as on_time_renewals
        FROM compliance.business_licenses
        WHERE org_id = p_org_id
        AND is_active = TRUE
    ) license_stats;
    
    -- Return results
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_licenses,
        COUNT(*) FILTER (WHERE bl.expiry_date BETWEEN CURRENT_DATE 
                        AND CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL)::INTEGER as expiring_soon,
        COUNT(*) FILTER (WHERE bl.expiry_date < CURRENT_DATE)::INTEGER as expired,
        v_compliance_score as compliance_score,
        v_license_details as license_details,
        v_actions as action_required
    FROM compliance.business_licenses bl
    WHERE bl.org_id = p_org_id
    AND bl.is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. NARCOTIC DRUG REGISTER MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_narcotic_register(
    p_transaction_type TEXT, -- 'receipt', 'issue', 'destruction'
    p_product_id INTEGER,
    p_batch_id INTEGER,
    p_quantity NUMERIC,
    p_reference_type TEXT,
    p_reference_id INTEGER,
    p_reference_number TEXT,
    p_party_name TEXT DEFAULT NULL,
    p_prescription_number TEXT DEFAULT NULL,
    p_created_by INTEGER DEFAULT 0
)
RETURNS TABLE (
    register_id INTEGER,
    transaction_number TEXT,
    opening_balance NUMERIC,
    closing_balance NUMERIC,
    compliance_status TEXT,
    validation_messages JSONB
) AS $$
DECLARE
    v_register_id INTEGER;
    v_transaction_number TEXT;
    v_product_info RECORD;
    v_last_entry RECORD;
    v_opening_balance NUMERIC;
    v_closing_balance NUMERIC;
    v_validation_msgs JSONB := '[]'::JSONB;
    v_compliance_status TEXT := 'compliant';
BEGIN
    -- Validate product is narcotic
    SELECT 
        p.*,
        pc.requires_narcotic_license
    INTO v_product_info
    FROM inventory.products p
    JOIN master.product_categories pc ON p.category_id = pc.category_id
    WHERE p.product_id = p_product_id;
    
    IF NOT FOUND OR NOT v_product_info.requires_narcotic_license THEN
        RAISE EXCEPTION 'Product is not a narcotic drug';
    END IF;
    
    -- Get last entry for opening balance
    SELECT 
        closing_balance,
        register_date
    INTO v_last_entry
    FROM compliance.narcotic_drug_register
    WHERE product_id = p_product_id
    AND batch_id = p_batch_id
    ORDER BY register_date DESC, register_id DESC
    LIMIT 1;
    
    v_opening_balance := COALESCE(v_last_entry.closing_balance, 0);
    
    -- Calculate closing balance
    CASE p_transaction_type
        WHEN 'receipt' THEN
            v_closing_balance := v_opening_balance + p_quantity;
        WHEN 'issue' THEN
            -- Validate sufficient balance
            IF v_opening_balance < p_quantity THEN
                v_validation_msgs := v_validation_msgs || jsonb_build_array(
                    jsonb_build_object(
                        'type', 'error',
                        'message', format('Insufficient balance. Available: %s, Required: %s',
                                        v_opening_balance, p_quantity)
                    )
                );
                v_compliance_status := 'non_compliant';
                RAISE EXCEPTION 'Insufficient narcotic balance';
            END IF;
            
            -- Validate prescription for patient issues
            IF p_reference_type = 'patient_issue' AND p_prescription_number IS NULL THEN
                v_validation_msgs := v_validation_msgs || jsonb_build_array(
                    jsonb_build_object(
                        'type', 'error',
                        'message', 'Prescription number required for patient issues'
                    )
                );
                v_compliance_status := 'non_compliant';
            END IF;
            
            v_closing_balance := v_opening_balance - p_quantity;
            
        WHEN 'destruction' THEN
            -- Validate destruction approval
            IF NOT EXISTS (
                SELECT 1 FROM compliance.destruction_approvals
                WHERE reference_type = p_reference_type
                AND reference_id = p_reference_id
                AND approval_status = 'approved'
            ) THEN
                v_validation_msgs := v_validation_msgs || jsonb_build_array(
                    jsonb_build_object(
                        'type', 'error',
                        'message', 'Destruction not approved by authorities'
                    )
                );
                v_compliance_status := 'non_compliant';
                RAISE EXCEPTION 'Destruction not approved';
            END IF;
            
            v_closing_balance := v_opening_balance - p_quantity;
    END CASE;
    
    -- Generate transaction number
    v_transaction_number := 'NDR-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                           LPAD(NEXTVAL('compliance.narcotic_register_seq')::TEXT, 6, '0');
    
    -- Create register entry
    INSERT INTO compliance.narcotic_drug_register (
        product_id,
        batch_id,
        register_date,
        transaction_number,
        transaction_type,
        reference_type,
        reference_id,
        reference_number,
        party_name,
        prescription_number,
        opening_balance,
        quantity_received,
        quantity_issued,
        quantity_destroyed,
        closing_balance,
        verification_status,
        compliance_notes,
        created_by,
        created_at
    ) VALUES (
        p_product_id,
        p_batch_id,
        CURRENT_DATE,
        v_transaction_number,
        p_transaction_type,
        p_reference_type,
        p_reference_id,
        p_reference_number,
        p_party_name,
        p_prescription_number,
        v_opening_balance,
        CASE WHEN p_transaction_type = 'receipt' THEN p_quantity ELSE 0 END,
        CASE WHEN p_transaction_type = 'issue' THEN p_quantity ELSE 0 END,
        CASE WHEN p_transaction_type = 'destruction' THEN p_quantity ELSE 0 END,
        v_closing_balance,
        'pending_verification',
        CASE WHEN jsonb_array_length(v_validation_msgs) > 0 
             THEN v_validation_msgs::TEXT 
             ELSE NULL END,
        p_created_by,
        CURRENT_TIMESTAMP
    ) RETURNING narcotic_drug_register.register_id INTO v_register_id;
    
    -- Update batch narcotic balance
    UPDATE inventory.batches
    SET 
        narcotic_balance = v_closing_balance,
        last_narcotic_update = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE batch_id = p_batch_id;
    
    -- Check for anomalies
    IF v_closing_balance < 0 THEN
        v_validation_msgs := v_validation_msgs || jsonb_build_array(
            jsonb_build_object(
                'type', 'critical',
                'message', 'Negative balance detected! Immediate audit required.'
            )
        );
        v_compliance_status := 'critical';
        
        -- Create high priority alert
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            requires_acknowledgment
        )
        SELECT 
            b.org_id,
            'error',
            'compliance',
            'Narcotic Balance Anomaly',
            format('Negative balance detected for %s, Batch: %s',
                   v_product_info.product_name, b.batch_number),
            'critical',
            TRUE
        FROM inventory.batches b
        WHERE b.batch_id = p_batch_id;
    END IF;
    
    -- Return result
    RETURN QUERY
    SELECT 
        v_register_id as register_id,
        v_transaction_number as transaction_number,
        v_opening_balance as opening_balance,
        v_closing_balance as closing_balance,
        v_compliance_status as compliance_status,
        v_validation_msgs as validation_messages;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. REGULATORY INSPECTION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_regulatory_inspection(
    p_org_id INTEGER,
    p_inspection_id INTEGER DEFAULT NULL,
    p_action TEXT DEFAULT 'view' -- 'create', 'update', 'complete', 'view'
)
RETURNS TABLE (
    inspection_summary JSONB,
    findings JSONB,
    corrective_actions JSONB,
    compliance_score NUMERIC,
    next_steps JSONB
) AS $$
DECLARE
    v_inspection_summary JSONB;
    v_findings JSONB;
    v_corrective_actions JSONB;
    v_compliance_score NUMERIC;
    v_next_steps JSONB;
BEGIN
    IF p_action = 'view' THEN
        -- Get inspection summary
        SELECT jsonb_build_object(
            'total_inspections', COUNT(*),
            'pending_closures', COUNT(*) FILTER (WHERE inspection_status = 'in_progress'),
            'average_score', AVG(compliance_score),
            'recent_inspections', (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'inspection_id', inspection_id,
                        'inspection_date', inspection_date,
                        'inspection_type', inspection_type,
                        'regulatory_body', regulatory_body,
                        'inspection_status', inspection_status,
                        'compliance_score', compliance_score,
                        'critical_findings', critical_findings
                    ) ORDER BY inspection_date DESC
                )
                FROM (
                    SELECT *,
                        (SELECT COUNT(*) FROM compliance.inspection_findings f
                         WHERE f.inspection_id = i.inspection_id
                         AND f.severity = 'critical') as critical_findings
                    FROM compliance.regulatory_inspections i
                    WHERE i.org_id = p_org_id
                    ORDER BY i.inspection_date DESC
                    LIMIT 10
                ) recent
            )
        )
        INTO v_inspection_summary
        FROM compliance.regulatory_inspections
        WHERE org_id = p_org_id;
        
        -- Get findings summary
        SELECT jsonb_build_object(
            'by_severity', jsonb_build_object(
                'critical', COUNT(*) FILTER (WHERE severity = 'critical' AND status != 'closed'),
                'major', COUNT(*) FILTER (WHERE severity = 'major' AND status != 'closed'),
                'minor', COUNT(*) FILTER (WHERE severity = 'minor' AND status != 'closed'),
                'observation', COUNT(*) FILTER (WHERE severity = 'observation' AND status != 'closed')
            ),
            'by_category', (
                SELECT jsonb_object_agg(finding_category, count)
                FROM (
                    SELECT finding_category, COUNT(*) as count
                    FROM compliance.inspection_findings
                    WHERE inspection_id IN (
                        SELECT inspection_id FROM compliance.regulatory_inspections
                        WHERE org_id = p_org_id
                    )
                    AND status != 'closed'
                    GROUP BY finding_category
                ) cat_summary
            ),
            'overdue_actions', COUNT(*) FILTER (
                WHERE target_closure_date < CURRENT_DATE 
                AND status != 'closed'
            )
        )
        INTO v_findings
        FROM compliance.inspection_findings
        WHERE inspection_id IN (
            SELECT inspection_id FROM compliance.regulatory_inspections
            WHERE org_id = p_org_id
        );
        
        -- Get corrective actions
        SELECT jsonb_agg(
            jsonb_build_object(
                'action_id', ca.action_id,
                'finding_id', ca.finding_id,
                'action_description', ca.action_description,
                'responsible_person', ca.responsible_person,
                'target_date', ca.target_date,
                'completion_status', ca.completion_status,
                'days_overdue', CASE 
                    WHEN ca.target_date < CURRENT_DATE AND ca.completion_status != 'completed'
                    THEN CURRENT_DATE - ca.target_date
                    ELSE 0
                END,
                'finding_severity', f.severity
            ) ORDER BY ca.target_date, f.severity
        )
        INTO v_corrective_actions
        FROM compliance.corrective_actions ca
        JOIN compliance.inspection_findings f ON ca.finding_id = f.finding_id
        WHERE ca.completion_status != 'completed'
        AND f.inspection_id IN (
            SELECT inspection_id FROM compliance.regulatory_inspections
            WHERE org_id = p_org_id
        );
        
        -- Calculate overall compliance score
        SELECT 
            ROUND(
                AVG(compliance_score) * 0.4 + -- 40% historical performance
                (100 - (open_findings::NUMERIC / NULLIF(total_findings, 1) * 100)) * 0.3 + -- 30% finding closure
                (100 - (overdue_actions::NUMERIC / NULLIF(total_actions, 1) * 100)) * 0.3 -- 30% timely actions
            , 2)
        INTO v_compliance_score
        FROM (
            SELECT 
                AVG(i.compliance_score) as avg_score,
                COUNT(DISTINCT f.finding_id) as total_findings,
                COUNT(DISTINCT f.finding_id) FILTER (WHERE f.status != 'closed') as open_findings,
                COUNT(DISTINCT ca.action_id) as total_actions,
                COUNT(DISTINCT ca.action_id) FILTER (
                    WHERE ca.target_date < CURRENT_DATE 
                    AND ca.completion_status != 'completed'
                ) as overdue_actions
            FROM compliance.regulatory_inspections i
            LEFT JOIN compliance.inspection_findings f ON i.inspection_id = f.inspection_id
            LEFT JOIN compliance.corrective_actions ca ON f.finding_id = ca.finding_id
            WHERE i.org_id = p_org_id
        ) scores;
        
        -- Generate next steps
        SELECT jsonb_agg(
            jsonb_build_object(
                'action_type', action_type,
                'priority', priority,
                'description', description,
                'due_date', due_date,
                'reference', reference
            ) ORDER BY priority_order, due_date
        )
        INTO v_next_steps
        FROM (
            -- Overdue corrective actions
            SELECT 
                'complete_action' as action_type,
                'critical' as priority,
                1 as priority_order,
                format('Complete overdue action: %s', ca.action_description) as description,
                ca.target_date as due_date,
                jsonb_build_object(
                    'action_id', ca.action_id,
                    'finding_id', ca.finding_id
                ) as reference
            FROM compliance.corrective_actions ca
            JOIN compliance.inspection_findings f ON ca.finding_id = f.finding_id
            JOIN compliance.regulatory_inspections i ON f.inspection_id = i.inspection_id
            WHERE i.org_id = p_org_id
            AND ca.target_date < CURRENT_DATE
            AND ca.completion_status != 'completed'
            
            UNION ALL
            
            -- Upcoming inspections
            SELECT 
                'prepare_inspection' as action_type,
                'high' as priority,
                2 as priority_order,
                format('Prepare for %s inspection by %s', 
                       inspection_type, regulatory_body) as description,
                scheduled_date as due_date,
                jsonb_build_object(
                    'inspection_type', inspection_type,
                    'regulatory_body', regulatory_body
                ) as reference
            FROM compliance.inspection_schedule
            WHERE org_id = p_org_id
            AND scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
        ) next_actions;
    END IF;
    
    RETURN QUERY
    SELECT 
        v_inspection_summary as inspection_summary,
        v_findings as findings,
        v_corrective_actions as corrective_actions,
        v_compliance_score as compliance_score,
        v_next_steps as next_steps;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. QUALITY DEVIATION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_quality_deviation(
    p_deviation_id INTEGER DEFAULT NULL,
    p_product_id INTEGER DEFAULT NULL,
    p_batch_id INTEGER DEFAULT NULL,
    p_deviation_type TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_severity TEXT DEFAULT NULL,
    p_action TEXT DEFAULT 'create' -- 'create', 'investigate', 'approve', 'close'
)
RETURNS TABLE (
    deviation_id INTEGER,
    deviation_number TEXT,
    investigation_required BOOLEAN,
    risk_assessment JSONB,
    impact_analysis JSONB,
    capa_required BOOLEAN
) AS $$
DECLARE
    v_deviation_id INTEGER;
    v_deviation_number TEXT;
    v_risk_assessment JSONB;
    v_impact_analysis JSONB;
    v_investigation_required BOOLEAN := FALSE;
    v_capa_required BOOLEAN := FALSE;
BEGIN
    IF p_action = 'create' THEN
        -- Generate deviation number
        v_deviation_number := 'QD-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
                             LPAD(NEXTVAL('compliance.deviation_seq')::TEXT, 5, '0');
        
        -- Perform risk assessment
        v_risk_assessment := assess_deviation_risk(
            p_deviation_type,
            p_severity,
            p_product_id,
            p_batch_id
        );
        
        -- Determine if investigation required
        v_investigation_required := 
            p_severity IN ('critical', 'major') OR
            (v_risk_assessment->>'risk_score')::INTEGER >= 7;
        
        -- Create deviation record
        INSERT INTO compliance.quality_deviations (
            deviation_number,
            deviation_date,
            product_id,
            batch_id,
            deviation_type,
            deviation_description,
            severity,
            deviation_status,
            investigation_required,
            risk_assessment,
            created_at
        ) VALUES (
            v_deviation_number,
            CURRENT_DATE,
            p_product_id,
            p_batch_id,
            p_deviation_type,
            p_description,
            p_severity,
            'open',
            v_investigation_required,
            v_risk_assessment,
            CURRENT_TIMESTAMP
        ) RETURNING quality_deviations.deviation_id INTO v_deviation_id;
        
        -- Perform impact analysis
        v_impact_analysis := analyze_deviation_impact(
            v_deviation_id,
            p_product_id,
            p_batch_id,
            p_deviation_type
        );
        
        -- Update with impact analysis
        UPDATE compliance.quality_deviations
        SET 
            impact_analysis = v_impact_analysis,
            capa_required = (v_impact_analysis->>'total_impact_score')::INTEGER >= 8
        WHERE quality_deviations.deviation_id = v_deviation_id;
        
        -- Create notifications for critical deviations
        IF p_severity = 'critical' THEN
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                requires_acknowledgment,
                notification_data
            )
            SELECT 
                b.org_id,
                'alert',
                'quality',
                'Critical Quality Deviation',
                format('Critical deviation detected for %s, Batch: %s',
                       p.product_name, b.batch_number),
                'critical',
                TRUE,
                jsonb_build_object(
                    'deviation_id', v_deviation_id,
                    'deviation_number', v_deviation_number,
                    'product_id', p_product_id,
                    'batch_id', p_batch_id
                )
            FROM inventory.products p
            JOIN inventory.batches b ON p.product_id = b.product_id
            WHERE p.product_id = p_product_id
            AND b.batch_id = p_batch_id;
        END IF;
        
        v_capa_required := (v_impact_analysis->>'total_impact_score')::INTEGER >= 8;
        
    ELSIF p_action = 'investigate' AND p_deviation_id IS NOT NULL THEN
        -- Handle investigation process
        -- This would include root cause analysis, corrective actions, etc.
        NULL; -- Placeholder for investigation logic
        
    ELSIF p_action = 'approve' AND p_deviation_id IS NOT NULL THEN
        -- Handle approval process
        -- This would include validation of investigation, CAPA effectiveness, etc.
        NULL; -- Placeholder for approval logic
    END IF;
    
    -- Return deviation details
    RETURN QUERY
    SELECT 
        COALESCE(v_deviation_id, p_deviation_id) as deviation_id,
        v_deviation_number as deviation_number,
        v_investigation_required as investigation_required,
        v_risk_assessment as risk_assessment,
        v_impact_analysis as impact_analysis,
        v_capa_required as capa_required;
END;
$$ LANGUAGE plpgsql;

-- Helper function for risk assessment
CREATE OR REPLACE FUNCTION assess_deviation_risk(
    p_deviation_type TEXT,
    p_severity TEXT,
    p_product_id INTEGER,
    p_batch_id INTEGER
)
RETURNS JSONB AS $$
DECLARE
    v_severity_score INTEGER;
    v_occurrence_score INTEGER;
    v_detection_score INTEGER;
    v_risk_score INTEGER;
    v_risk_level TEXT;
BEGIN
    -- Severity scoring
    v_severity_score := CASE p_severity
        WHEN 'critical' THEN 10
        WHEN 'major' THEN 7
        WHEN 'minor' THEN 4
        ELSE 1
    END;
    
    -- Occurrence scoring (based on historical data)
    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN 1
            WHEN COUNT(*) <= 2 THEN 3
            WHEN COUNT(*) <= 5 THEN 5
            WHEN COUNT(*) <= 10 THEN 7
            ELSE 10
        END
    INTO v_occurrence_score
    FROM compliance.quality_deviations
    WHERE product_id = p_product_id
    AND deviation_type = p_deviation_type
    AND deviation_date >= CURRENT_DATE - INTERVAL '1 year';
    
    -- Detection scoring
    v_detection_score := CASE p_deviation_type
        WHEN 'manufacturing' THEN 3
        WHEN 'packaging' THEN 5
        WHEN 'testing' THEN 7
        WHEN 'storage' THEN 8
        ELSE 5
    END;
    
    -- Calculate RPN (Risk Priority Number)
    v_risk_score := (v_severity_score * v_occurrence_score * v_detection_score) / 10;
    
    -- Determine risk level
    v_risk_level := CASE 
        WHEN v_risk_score >= 8 THEN 'high'
        WHEN v_risk_score >= 5 THEN 'medium'
        ELSE 'low'
    END;
    
    RETURN jsonb_build_object(
        'severity_score', v_severity_score,
        'occurrence_score', v_occurrence_score,
        'detection_score', v_detection_score,
        'risk_score', v_risk_score,
        'risk_level', v_risk_level,
        'risk_matrix', jsonb_build_object(
            'severity', p_severity,
            'likelihood', CASE v_occurrence_score
                WHEN 1 THEN 'rare'
                WHEN 3 THEN 'unlikely'
                WHEN 5 THEN 'possible'
                WHEN 7 THEN 'likely'
                ELSE 'almost_certain'
            END,
            'detectability', CASE v_detection_score
                WHEN 3 THEN 'easy'
                WHEN 5 THEN 'moderate'
                WHEN 7 THEN 'difficult'
                ELSE 'very_difficult'
            END
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Helper function for impact analysis
CREATE OR REPLACE FUNCTION analyze_deviation_impact(
    p_deviation_id INTEGER,
    p_product_id INTEGER,
    p_batch_id INTEGER,
    p_deviation_type TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_patient_impact INTEGER;
    v_regulatory_impact INTEGER;
    v_financial_impact INTEGER;
    v_reputation_impact INTEGER;
    v_affected_quantity NUMERIC;
    v_market_value NUMERIC;
BEGIN
    -- Get affected quantities
    SELECT 
        b.quantity_available + b.quantity_sold,
        b.mrp_per_unit * (b.quantity_available + b.quantity_sold)
    INTO v_affected_quantity, v_market_value
    FROM inventory.batches b
    WHERE b.batch_id = p_batch_id;
    
    -- Patient impact scoring
    v_patient_impact := CASE 
        WHEN p_deviation_type IN ('manufacturing', 'testing') THEN 8
        WHEN p_deviation_type = 'packaging' THEN 4
        ELSE 2
    END;
    
    -- Regulatory impact
    v_regulatory_impact := CASE 
        WHEN EXISTS (
            SELECT 1 FROM master.product_categories pc
            JOIN inventory.products p ON pc.category_id = p.category_id
            WHERE p.product_id = p_product_id
            AND pc.requires_narcotic_license
        ) THEN 10
        ELSE 5
    END;
    
    -- Financial impact
    v_financial_impact := CASE 
        WHEN v_market_value > 1000000 THEN 10
        WHEN v_market_value > 500000 THEN 7
        WHEN v_market_value > 100000 THEN 5
        ELSE 3
    END;
    
    -- Reputation impact
    v_reputation_impact := GREATEST(
        v_patient_impact,
        v_regulatory_impact
    ) * 0.8;
    
    RETURN jsonb_build_object(
        'patient_safety_impact', v_patient_impact,
        'regulatory_impact', v_regulatory_impact,
        'financial_impact', v_financial_impact,
        'reputation_impact', ROUND(v_reputation_impact),
        'total_impact_score', ROUND((v_patient_impact + v_regulatory_impact + 
                                    v_financial_impact + v_reputation_impact) / 4),
        'affected_quantity', v_affected_quantity,
        'market_value_at_risk', v_market_value,
        'recommended_actions', CASE 
            WHEN (v_patient_impact + v_regulatory_impact) >= 15 THEN
                jsonb_build_array('immediate_recall', 'regulatory_notification', 'capa_required')
            WHEN (v_patient_impact + v_regulatory_impact) >= 10 THEN
                jsonb_build_array('quarantine_batch', 'investigation_required', 'customer_notification')
            ELSE
                jsonb_build_array('monitor_batch', 'document_deviation')
        END
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. GXP AUDIT TRAIL
-- =============================================
CREATE OR REPLACE FUNCTION get_gxp_audit_trail(
    p_table_name TEXT,
    p_record_id INTEGER,
    p_from_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP - INTERVAL '30 days',
    p_to_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE (
    audit_entries JSONB,
    summary JSONB,
    compliance_flags JSONB
) AS $$
DECLARE
    v_audit_entries JSONB;
    v_summary JSONB;
    v_compliance_flags JSONB := '[]'::JSONB;
BEGIN
    -- Get audit entries
    SELECT jsonb_agg(
        jsonb_build_object(
            'audit_id', audit_id,
            'action_timestamp', action_timestamp,
            'action_type', action_type,
            'user_id', user_id,
            'user_name', user_name,
            'user_role', user_role,
            'old_values', old_values,
            'new_values', new_values,
            'change_reason', change_reason,
            'electronic_signature', electronic_signature,
            'ip_address', ip_address,
            'session_id', session_id
        ) ORDER BY action_timestamp DESC
    )
    INTO v_audit_entries
    FROM compliance.gxp_audit_log
    WHERE table_name = p_table_name
    AND record_id = p_record_id
    AND action_timestamp BETWEEN p_from_date AND p_to_date;
    
    -- Generate summary
    SELECT jsonb_build_object(
        'total_changes', COUNT(*),
        'unique_users', COUNT(DISTINCT user_id),
        'change_types', jsonb_object_agg(
            action_type, 
            count_by_type
        ),
        'first_created', MIN(action_timestamp) FILTER (WHERE action_type = 'INSERT'),
        'last_modified', MAX(action_timestamp) FILTER (WHERE action_type = 'UPDATE'),
        'critical_changes', COUNT(*) FILTER (
            WHERE jsonb_array_length(
                COALESCE(old_values, '{}'::jsonb) ?| 
                ARRAY['quantity', 'batch_number', 'expiry_date', 'test_results']
            ) > 0
        )
    )
    INTO v_summary
    FROM (
        SELECT 
            action_type,
            COUNT(*) as count_by_type,
            user_id,
            action_timestamp,
            old_values
        FROM compliance.gxp_audit_log
        WHERE table_name = p_table_name
        AND record_id = p_record_id
        AND action_timestamp BETWEEN p_from_date AND p_to_date
        GROUP BY action_type, user_id, action_timestamp, old_values
    ) audit_summary;
    
    -- Check for compliance issues
    -- Missing electronic signatures
    IF EXISTS (
        SELECT 1 FROM compliance.gxp_audit_log
        WHERE table_name = p_table_name
        AND record_id = p_record_id
        AND action_timestamp BETWEEN p_from_date AND p_to_date
        AND electronic_signature IS NULL
        AND table_name IN ('quality_test_results', 'batch_release', 'deviation_approvals')
    ) THEN
        v_compliance_flags := v_compliance_flags || jsonb_build_array(
            jsonb_build_object(
                'issue_type', 'missing_signature',
                'severity', 'high',
                'description', 'Electronic signature missing for GxP critical records'
            )
        );
    END IF;
    
    -- Suspicious activity patterns
    IF EXISTS (
        SELECT user_id
        FROM compliance.gxp_audit_log
        WHERE table_name = p_table_name
        AND record_id = p_record_id
        AND action_timestamp BETWEEN p_from_date AND p_to_date
        GROUP BY user_id, DATE(action_timestamp)
        HAVING COUNT(*) > 10 -- More than 10 changes by same user in a day
    ) THEN
        v_compliance_flags := v_compliance_flags || jsonb_build_array(
            jsonb_build_object(
                'issue_type', 'suspicious_activity',
                'severity', 'medium',
                'description', 'Unusually high number of changes by single user'
            )
        );
    END IF;
    
    RETURN QUERY
    SELECT 
        v_audit_entries as audit_entries,
        v_summary as summary,
        v_compliance_flags as compliance_flags;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUPPORTING TABLES
-- =============================================

-- Required licenses configuration
CREATE TABLE IF NOT EXISTS compliance.required_licenses (
    requirement_id SERIAL PRIMARY KEY,
    license_type TEXT NOT NULL,
    license_category TEXT,
    regulatory_body TEXT,
    applicable_to TEXT[], -- 'manufacturing', 'retail', 'wholesale', etc.
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Destruction approvals
CREATE TABLE IF NOT EXISTS compliance.destruction_approvals (
    approval_id SERIAL PRIMARY KEY,
    reference_type TEXT,
    reference_id INTEGER,
    approval_authority TEXT,
    approval_number TEXT,
    approval_date DATE,
    approval_status TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inspection schedule
CREATE TABLE IF NOT EXISTS compliance.inspection_schedule (
    schedule_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    inspection_type TEXT,
    regulatory_body TEXT,
    scheduled_date DATE,
    notification_sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_licenses_expiry ON compliance.org_licenses(org_id, valid_until);
CREATE INDEX IF NOT EXISTS idx_narcotic_register_product ON compliance.narcotic_register(product_id, batch_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_inspection_status ON compliance.regulatory_inspections(inspection_status, inspection_date);
CREATE INDEX IF NOT EXISTS idx_deviations_status ON compliance.quality_deviations(deviation_status, severity, deviation_date);
-- GXP audit log table doesn't exist yet

-- =============================================
-- GRANTS
-- =============================================
GRANT EXECUTE ON FUNCTION monitor_license_compliance TO compliance_officer, quality_manager;
GRANT EXECUTE ON FUNCTION manage_narcotic_register TO pharmacist, compliance_officer;
GRANT EXECUTE ON FUNCTION manage_regulatory_inspection TO quality_manager, compliance_officer;
GRANT EXECUTE ON FUNCTION manage_quality_deviation TO quality_user, production_manager;
GRANT EXECUTE ON FUNCTION get_gxp_audit_trail TO auditor, compliance_officer, quality_manager;

-- =============================================
-- COMMENTS
-- =============================================
COMMENT ON FUNCTION monitor_license_compliance IS 'Monitors business license compliance and expiry';
COMMENT ON FUNCTION manage_narcotic_register IS 'Manages narcotic drug register with compliance validation';
COMMENT ON FUNCTION manage_regulatory_inspection IS 'Handles regulatory inspections and corrective actions';
COMMENT ON FUNCTION manage_quality_deviation IS 'Manages quality deviations with risk assessment';
COMMENT ON FUNCTION get_gxp_audit_trail IS 'Retrieves GxP compliant audit trail with compliance checking';