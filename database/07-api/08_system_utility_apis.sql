-- =============================================
-- SYSTEM & UTILITY MODULE APIS
-- =============================================
-- Global API functions for system management and utilities
-- =============================================

-- =============================================
-- USER AUTHENTICATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.authenticate_user(
    p_username VARCHAR(100),
    p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id INTEGER;
    v_user RECORD;
    v_session_token UUID;
    v_result JSONB;
BEGIN
    -- Find user
    SELECT 
        u.user_id,
        u.username,
        u.email,
        u.full_name,
        u.user_type,
        u.is_active,
        u.password_hash,
        u.failed_login_attempts,
        u.locked_until
    INTO v_user
    FROM system_config.users u
    WHERE (u.username = p_username OR u.email = p_username);
    
    -- Check if user exists
    IF v_user.user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid username or password'
        );
    END IF;
    
    -- Check if user is active
    IF NOT v_user.is_active THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User account is inactive'
        );
    END IF;
    
    -- Check if account is locked
    IF v_user.locked_until IS NOT NULL AND v_user.locked_until > CURRENT_TIMESTAMP THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Account is locked. Please try again later.'
        );
    END IF;
    
    -- Verify password (simplified - use proper hashing in production)
    IF v_user.password_hash != encode(digest(p_password, 'sha256'), 'hex') THEN
        -- Increment failed attempts
        UPDATE system_config.users
        SET failed_login_attempts = failed_login_attempts + 1,
            locked_until = CASE 
                WHEN failed_login_attempts >= 4 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                ELSE NULL
            END
        WHERE user_id = v_user.user_id;
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid username or password'
        );
    END IF;
    
    -- Reset failed attempts on successful login
    UPDATE system_config.users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login = CURRENT_TIMESTAMP
    WHERE user_id = v_user.user_id;
    
    -- Create session
    v_session_token := gen_random_uuid();
    
    INSERT INTO system_config.user_sessions (
        session_id,
        user_id,
        session_token,
        ip_address,
        user_agent,
        created_at,
        expires_at
    )
    VALUES (
        gen_random_uuid(),
        v_user.user_id,
        v_session_token,
        inet_client_addr()::TEXT,
        current_setting('application_name', true),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + INTERVAL '24 hours'
    );
    
    -- Get user roles and permissions
    SELECT jsonb_build_object(
        'success', true,
        'user', jsonb_build_object(
            'user_id', v_user.user_id,
            'username', v_user.username,
            'email', v_user.email,
            'full_name', v_user.full_name,
            'user_type', v_user.user_type
        ),
        'session', jsonb_build_object(
            'token', v_session_token,
            'expires_at', CURRENT_TIMESTAMP + INTERVAL '24 hours'
        ),
        'roles', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'role_id', r.role_id,
                    'role_name', r.role_name,
                    'role_code', r.role_code
                )
            ) FILTER (WHERE r.role_id IS NOT NULL),
            '[]'::jsonb
        ),
        'permissions', COALESCE(
            jsonb_agg(DISTINCT p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL),
            '[]'::jsonb
        )
    ) INTO v_result
    FROM system_config.users u
    LEFT JOIN system_config.user_roles ur ON u.user_id = ur.user_id
    LEFT JOIN system_config.roles r ON ur.role_id = r.role_id AND r.is_active = TRUE
    LEFT JOIN system_config.role_permissions rp ON r.role_id = rp.role_id
    LEFT JOIN system_config.permissions p ON rp.permission_id = p.permission_id AND p.is_active = TRUE
    WHERE u.user_id = v_user.user_id
    GROUP BY u.user_id;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- SYSTEM SETTINGS API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_system_settings(
    p_org_id INTEGER,
    p_category TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH settings_data AS (
        SELECT 
            sd.setting_key,
            sd.setting_category,
            sd.setting_type,
            COALESCE(ss.setting_value, sd.default_value) as setting_value,
            sd.description,
            sd.is_required,
            sd.validation_rules
        FROM system_config.setting_definitions sd
        LEFT JOIN system_config.system_settings ss ON sd.setting_key = ss.setting_key
            AND ss.org_id = p_org_id
        WHERE sd.is_active = TRUE
        AND (p_category IS NULL OR sd.setting_category = p_category)
    )
    SELECT jsonb_build_object(
        'settings', jsonb_object_agg(
            setting_category,
            category_settings
        )
    ) INTO v_result
    FROM (
        SELECT 
            setting_category,
            jsonb_object_agg(
                setting_key,
                jsonb_build_object(
                    'value', CASE 
                        WHEN setting_type = 'number' THEN to_jsonb(setting_value::NUMERIC)
                        WHEN setting_type = 'boolean' THEN to_jsonb(setting_value::BOOLEAN)
                        ELSE to_jsonb(setting_value::TEXT)
                    END,
                    'type', setting_type,
                    'description', description,
                    'required', is_required,
                    'validation', validation_rules
                )
            ) as category_settings
        FROM settings_data
        GROUP BY setting_category
    ) categorized_settings;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- UPDATE SYSTEM SETTING API
-- =============================================
CREATE OR REPLACE FUNCTION api.update_system_setting(
    p_org_id INTEGER,
    p_setting_key VARCHAR(100),
    p_setting_value TEXT,
    p_updated_by INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_setting_def RECORD;
    v_result JSONB;
BEGIN
    -- Get setting definition
    SELECT * INTO v_setting_def
    FROM system_config.setting_definitions
    WHERE setting_key = p_setting_key
    AND is_active = TRUE;
    
    IF v_setting_def.setting_key IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid setting key'
        );
    END IF;
    
    -- Validate setting value based on type and rules
    -- (Add validation logic here based on setting_type and validation_rules)
    
    -- Update or insert setting
    INSERT INTO system_config.system_settings (
        org_id,
        setting_key,
        setting_value,
        updated_by,
        updated_at
    )
    VALUES (
        p_org_id,
        p_setting_key,
        p_setting_value,
        p_updated_by,
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (org_id, setting_key) 
    DO UPDATE SET
        setting_value = p_setting_value,
        updated_by = p_updated_by,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Log the change
    INSERT INTO system_config.audit_log (
        user_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address
    )
    VALUES (
        p_updated_by,
        'UPDATE',
        'system_settings',
        p_setting_key,
        jsonb_build_object('setting_value', v_setting_def.default_value),
        jsonb_build_object('setting_value', p_setting_value),
        inet_client_addr()::TEXT
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Setting updated successfully',
        'setting', jsonb_build_object(
            'key', p_setting_key,
            'value', p_setting_value,
            'updated_at', CURRENT_TIMESTAMP
        )
    );
END;
$$;

-- =============================================
-- AUDIT LOG API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_audit_log(
    p_table_name TEXT DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_from_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP - INTERVAL '7 days',
    p_to_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_total_count INTEGER;
BEGIN
    -- Get total count
    SELECT COUNT(*)
    INTO v_total_count
    FROM system_config.audit_log al
    WHERE (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
    AND (p_action IS NULL OR al.action = p_action)
    AND al.created_at BETWEEN p_from_date AND p_to_date;
    
    -- Get audit entries
    SELECT jsonb_build_object(
        'total_count', v_total_count,
        'limit', p_limit,
        'offset', p_offset,
        'entries', COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'audit_id', al.audit_id,
                    'timestamp', al.created_at,
                    'user', jsonb_build_object(
                        'user_id', al.user_id,
                        'username', u.username,
                        'full_name', u.full_name
                    ),
                    'action', al.action,
                    'table_name', al.table_name,
                    'record_id', al.record_id,
                    'changes', jsonb_build_object(
                        'old', al.old_values,
                        'new', al.new_values
                    ),
                    'ip_address', al.ip_address,
                    'user_agent', al.user_agent
                ) ORDER BY al.created_at DESC
            ),
            '[]'::jsonb
        )
    ) INTO v_result
    FROM system_config.audit_log al
    LEFT JOIN system_config.users u ON al.user_id = u.user_id
    WHERE (p_table_name IS NULL OR al.table_name = p_table_name)
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
    AND (p_action IS NULL OR al.action = p_action)
    AND al.created_at BETWEEN p_from_date AND p_to_date
    ORDER BY al.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- NOTIFICATION API
-- =============================================
CREATE OR REPLACE FUNCTION api.create_notification(
    p_notification_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notification_id INTEGER;
    v_template RECORD;
    v_processed_body TEXT;
    v_processed_subject TEXT;
    v_recipient JSONB;
    v_result JSONB;
BEGIN
    -- Get notification template if specified
    IF p_notification_data->>'template_id' IS NOT NULL THEN
        SELECT * INTO v_template
        FROM system_config.notification_templates
        WHERE template_id = (p_notification_data->>'template_id')::INTEGER
        AND is_active = TRUE;
        
        -- Process template variables
        v_processed_subject := v_template.subject;
        v_processed_body := v_template.body;
        
        -- Replace variables in template
        FOR v_recipient IN SELECT * FROM jsonb_each_text(p_notification_data->'variables')
        LOOP
            v_processed_subject := REPLACE(v_processed_subject, '{{' || v_recipient.key || '}}', v_recipient.value);
            v_processed_body := REPLACE(v_processed_body, '{{' || v_recipient.key || '}}', v_recipient.value);
        END LOOP;
    ELSE
        v_processed_subject := p_notification_data->>'subject';
        v_processed_body := p_notification_data->>'body';
    END IF;
    
    -- Create system notification
    INSERT INTO system_config.system_notifications (
        notification_type,
        priority,
        subject,
        body,
        metadata,
        created_by
    )
    VALUES (
        COALESCE(p_notification_data->>'notification_type', 'general'),
        COALESCE(p_notification_data->>'priority', 'normal'),
        v_processed_subject,
        v_processed_body,
        p_notification_data->'metadata',
        (p_notification_data->>'created_by')::INTEGER
    )
    RETURNING notification_id INTO v_notification_id;
    
    -- Create user notifications for recipients
    IF p_notification_data->'recipients' IS NOT NULL THEN
        INSERT INTO system_config.user_notifications (
            user_id,
            notification_id,
            delivery_channel,
            delivery_status
        )
        SELECT 
            (recipient->>'user_id')::INTEGER,
            v_notification_id,
            COALESCE(recipient->>'channel', 'in_app'),
            'pending'
        FROM jsonb_array_elements(p_notification_data->'recipients') AS recipient;
    END IF;
    
    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notification_id,
        'message', 'Notification created successfully'
    );
END;
$$;

-- =============================================
-- HEALTH CHECK API
-- =============================================
CREATE OR REPLACE FUNCTION api.system_health_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
    v_db_size TEXT;
    v_table_count INTEGER;
    v_index_count INTEGER;
    v_active_connections INTEGER;
BEGIN
    -- Get database size
    SELECT pg_size_pretty(pg_database_size(current_database())) INTO v_db_size;
    
    -- Get table count
    SELECT COUNT(*) INTO v_table_count
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema');
    
    -- Get index count
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema');
    
    -- Get active connections
    SELECT COUNT(*) INTO v_active_connections
    FROM pg_stat_activity
    WHERE state = 'active';
    
    SELECT jsonb_build_object(
        'status', 'healthy',
        'timestamp', CURRENT_TIMESTAMP,
        'database', jsonb_build_object(
            'name', current_database(),
            'version', version(),
            'size', v_db_size,
            'tables', v_table_count,
            'indexes', v_index_count,
            'active_connections', v_active_connections
        ),
        'modules', jsonb_build_object(
            'master', EXISTS(SELECT 1 FROM master.organizations LIMIT 1),
            'inventory', EXISTS(SELECT 1 FROM inventory.products LIMIT 1),
            'sales', EXISTS(SELECT 1 FROM sales.invoices LIMIT 1),
            'procurement', EXISTS(SELECT 1 FROM procurement.purchase_orders LIMIT 1),
            'financial', EXISTS(SELECT 1 FROM financial.journal_entries LIMIT 1),
            'gst', EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'gst'),
            'compliance', EXISTS(SELECT 1 FROM compliance.business_licenses LIMIT 1)
        ),
        'performance', jsonb_build_object(
            'cache_hit_ratio', (
                SELECT ROUND(
                    SUM(heap_blks_hit) / 
                    NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0) * 100,
                    2
                )
                FROM pg_statio_user_tables
            ),
            'index_usage_ratio', (
                SELECT ROUND(
                    AVG(CASE 
                        WHEN seq_scan + idx_scan > 0 
                        THEN 100.0 * idx_scan / (seq_scan + idx_scan)
                        ELSE 0
                    END),
                    2
                )
                FROM pg_stat_user_tables
            )
        ),
        'recent_errors', (
            SELECT COUNT(*)
            FROM system_config.error_log
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 hour'
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- BACKUP METADATA API
-- =============================================
CREATE OR REPLACE FUNCTION api.get_backup_metadata(
    p_include_row_counts BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH table_info AS (
        SELECT 
            table_schema,
            table_name,
            CASE 
                WHEN p_include_row_counts THEN (
                    SELECT COUNT(*)::BIGINT
                    FROM information_schema.tables t2
                    WHERE t2.table_schema = t.table_schema
                    AND t2.table_name = t.table_name
                )
                ELSE NULL
            END as row_count
        FROM information_schema.tables t
        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
    )
    SELECT jsonb_build_object(
        'backup_metadata', jsonb_build_object(
            'database_name', current_database(),
            'backup_timestamp', CURRENT_TIMESTAMP,
            'database_size', pg_database_size(current_database()),
            'database_size_pretty', pg_size_pretty(pg_database_size(current_database())),
            'schemas', (
                SELECT jsonb_object_agg(
                    schema_name,
                    jsonb_build_object(
                        'tables', table_list,
                        'table_count', table_count,
                        'total_rows', total_rows
                    )
                )
                FROM (
                    SELECT 
                        table_schema as schema_name,
                        jsonb_agg(
                            jsonb_build_object(
                                'table_name', table_name,
                                'row_count', row_count
                            ) ORDER BY table_name
                        ) as table_list,
                        COUNT(*) as table_count,
                        SUM(row_count) as total_rows
                    FROM table_info
                    GROUP BY table_schema
                ) schema_summary
            )
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$;

-- =============================================
-- DATA EXPORT API
-- =============================================
CREATE OR REPLACE FUNCTION api.export_data(
    p_export_type TEXT, -- 'customers', 'products', 'invoices', etc.
    p_format TEXT DEFAULT 'json', -- 'json', 'csv'
    p_filters JSONB DEFAULT '{}'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result TEXT;
    v_query TEXT;
BEGIN
    CASE p_export_type
        WHEN 'customers' THEN
            v_query := 'SELECT customer_id, customer_code, customer_name, customer_type, gstin, primary_phone, email FROM parties.customers WHERE is_active = TRUE';
        WHEN 'products' THEN
            v_query := 'SELECT product_id, product_code, product_name, generic_name, manufacturer, hsn_code, current_mrp FROM inventory.products WHERE is_active = TRUE';
        WHEN 'invoices' THEN
            v_query := 'SELECT invoice_id, invoice_number, invoice_date, customer_id, total_amount, payment_status FROM sales.invoices WHERE invoice_status = ''posted''';
        ELSE
            RAISE EXCEPTION 'Invalid export type: %', p_export_type;
    END CASE;
    
    -- Apply filters if provided
    -- (Add filter logic based on p_filters JSONB)
    
    -- Execute query and format result
    IF p_format = 'csv' THEN
        -- Convert to CSV format
        EXECUTE 'COPY (' || v_query || ') TO STDOUT WITH CSV HEADER' INTO v_result;
    ELSE
        -- Default to JSON
        EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || v_query || ') t' INTO v_result;
    END IF;
    
    RETURN v_result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION api.authenticate_user TO anonymous;
GRANT EXECUTE ON FUNCTION api.get_system_settings TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.update_system_setting TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_audit_log TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.create_notification TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.system_health_check TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.get_backup_metadata TO authenticated_user;
GRANT EXECUTE ON FUNCTION api.export_data TO authenticated_user;

COMMENT ON FUNCTION api.authenticate_user IS 'Authenticate user and create session';
COMMENT ON FUNCTION api.get_system_settings IS 'Get system settings by organization';
COMMENT ON FUNCTION api.update_system_setting IS 'Update individual system setting';
COMMENT ON FUNCTION api.get_audit_log IS 'Get audit trail with filters';
COMMENT ON FUNCTION api.create_notification IS 'Create system notification with template support';
COMMENT ON FUNCTION api.system_health_check IS 'Get system health status and metrics';
COMMENT ON FUNCTION api.get_backup_metadata IS 'Get database metadata for backup purposes';
COMMENT ON FUNCTION api.export_data IS 'Export data in various formats';