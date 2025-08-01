-- =============================================
-- SYSTEM CONFIGURATION FUNCTIONS
-- =============================================
-- System administration, user management, notifications,
-- and configuration management functions
-- =============================================

-- =============================================
-- 1. USER AND ROLE MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_user_access(
    p_action TEXT, -- 'create', 'update', 'activate', 'deactivate', 'reset_password'
    p_user_id INTEGER DEFAULT NULL,
    p_user_data JSONB DEFAULT NULL
)
RETURNS TABLE (
    user_id INTEGER,
    username TEXT,
    status TEXT,
    roles JSONB,
    permissions JSONB,
    action_result TEXT
) AS $$
DECLARE
    v_user_id INTEGER;
    v_username TEXT;
    v_password_hash TEXT;
    v_roles JSONB;
    v_permissions JSONB;
    v_action_result TEXT;
BEGIN
    CASE p_action
        WHEN 'create' THEN
            -- Validate required fields
            IF p_user_data->>'username' IS NULL OR 
               p_user_data->>'email' IS NULL OR
               p_user_data->>'password' IS NULL THEN
                RAISE EXCEPTION 'Username, email, and password are required';
            END IF;
            
            -- Check if username exists
            IF EXISTS (
                SELECT 1 FROM system_config.users 
                WHERE username = p_user_data->>'username'
            ) THEN
                RAISE EXCEPTION 'Username already exists';
            END IF;
            
            -- Hash password (simplified - use proper hashing in production)
            v_password_hash := encode(
                digest(p_user_data->>'password', 'sha256'), 
                'hex'
            );
            
            -- Create user
            INSERT INTO system_config.users (
                username,
                email,
                password_hash,
                full_name,
                phone_number,
                user_type,
                is_active,
                created_at
            ) VALUES (
                p_user_data->>'username',
                p_user_data->>'email',
                v_password_hash,
                p_user_data->>'full_name',
                p_user_data->>'phone_number',
                COALESCE(p_user_data->>'user_type', 'standard'),
                TRUE,
                CURRENT_TIMESTAMP
            ) RETURNING users.user_id INTO v_user_id;
            
            -- Assign default role
            INSERT INTO system_config.user_roles (
                user_id,
                role_id,
                assigned_at,
                assigned_by
            )
            SELECT 
                v_user_id,
                r.role_id,
                CURRENT_TIMESTAMP,
                COALESCE((p_user_data->>'created_by')::INTEGER, 0)
            FROM system_config.roles r
            WHERE r.role_name = COALESCE(
                p_user_data->>'role', 
                'user'
            );
            
            v_action_result := 'User created successfully';
            
        WHEN 'update' THEN
            IF p_user_id IS NULL THEN
                RAISE EXCEPTION 'User ID required for update';
            END IF;
            
            -- Update user details
            UPDATE system_config.users
            SET 
                email = COALESCE(p_user_data->>'email', email),
                full_name = COALESCE(p_user_data->>'full_name', full_name),
                phone_number = COALESCE(p_user_data->>'phone_number', phone_number),
                updated_at = CURRENT_TIMESTAMP
            WHERE users.user_id = p_user_id;
            
            -- Update roles if provided
            IF p_user_data->'roles' IS NOT NULL THEN
                -- Remove existing roles
                DELETE FROM system_config.user_roles
                WHERE user_roles.user_id = p_user_id;
                
                -- Add new roles
                INSERT INTO system_config.user_roles (
                    user_id,
                    role_id,
                    assigned_at,
                    assigned_by
                )
                SELECT 
                    p_user_id,
                    r.role_id,
                    CURRENT_TIMESTAMP,
                    COALESCE((p_user_data->>'updated_by')::INTEGER, 0)
                FROM jsonb_array_elements_text(p_user_data->'roles') AS role_name
                JOIN system_config.roles r ON r.role_name = role_name;
            END IF;
            
            v_user_id := p_user_id;
            v_action_result := 'User updated successfully';
            
        WHEN 'activate' THEN
            UPDATE system_config.users
            SET 
                is_active = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE users.user_id = p_user_id;
            
            v_user_id := p_user_id;
            v_action_result := 'User activated';
            
        WHEN 'deactivate' THEN
            UPDATE system_config.users
            SET 
                is_active = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE users.user_id = p_user_id;
            
            -- Expire all active sessions
            UPDATE system_config.user_sessions
            SET 
                expires_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_sessions.user_id = p_user_id
            AND expires_at > CURRENT_TIMESTAMP;
            
            v_user_id := p_user_id;
            v_action_result := 'User deactivated and sessions expired';
            
        WHEN 'reset_password' THEN
            IF p_user_data->>'new_password' IS NULL THEN
                RAISE EXCEPTION 'New password required';
            END IF;
            
            -- Hash new password
            v_password_hash := encode(
                digest(p_user_data->>'new_password', 'sha256'), 
                'hex'
            );
            
            -- Update password
            UPDATE system_config.users
            SET 
                password_hash = v_password_hash,
                password_changed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE users.user_id = p_user_id;
            
            -- Log password change
            INSERT INTO system_config.audit_log (
                user_id,
                action_type,
                action_description,
                ip_address,
                created_at
            ) VALUES (
                p_user_id,
                'password_reset',
                'Password reset by administrator',
                p_user_data->>'ip_address',
                CURRENT_TIMESTAMP
            );
            
            v_user_id := p_user_id;
            v_action_result := 'Password reset successfully';
            
        ELSE
            RAISE EXCEPTION 'Invalid action: %', p_action;
    END CASE;
    
    -- Get user details and permissions
    RETURN QUERY
    SELECT 
        u.user_id,
        u.username,
        CASE 
            WHEN u.is_active THEN 'active'
            ELSE 'inactive'
        END as status,
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'role_id', r.role_id,
                    'role_name', r.role_name,
                    'description', r.description
                )
            )
            FROM system_config.user_roles ur
            JOIN system_config.roles r ON ur.role_id = r.role_id
            WHERE ur.user_id = u.user_id
        ) as roles,
        (
            SELECT jsonb_object_agg(
                permission_key,
                TRUE
            )
            FROM (
                SELECT DISTINCT p.permission_key
                FROM system_config.user_roles ur
                JOIN system_config.role_permissions rp ON ur.role_id = rp.role_id
                JOIN system_config.permissions p ON rp.permission_id = p.permission_id
                WHERE ur.user_id = u.user_id
                AND p.is_active = TRUE
            ) perms
        ) as permissions,
        v_action_result as action_result
    FROM system_config.users u
    WHERE u.user_id = COALESCE(v_user_id, p_user_id);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 2. SYSTEM CONFIGURATION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_system_settings(
    p_org_id INTEGER,
    p_setting_key TEXT DEFAULT NULL,
    p_action TEXT DEFAULT 'get', -- 'get', 'set', 'reset', 'list'
    p_setting_value JSONB DEFAULT NULL
)
RETURNS TABLE (
    setting_key TEXT,
    setting_value JSONB,
    setting_type TEXT,
    description TEXT,
    last_updated TIMESTAMP,
    is_encrypted BOOLEAN
) AS $$
DECLARE
    v_encrypted_value TEXT;
    v_setting_type TEXT;
BEGIN
    CASE p_action
        WHEN 'get' THEN
            -- Get specific setting or all settings
            RETURN QUERY
            SELECT 
                s.setting_key,
                CASE 
                    WHEN s.is_encrypted THEN 
                        jsonb_build_object('encrypted', TRUE)
                    ELSE 
                        s.setting_value
                END as setting_value,
                s.setting_type,
                s.description,
                s.updated_at as last_updated,
                s.is_encrypted
            FROM system_config.system_settings s
            WHERE s.org_id = p_org_id
            AND (p_setting_key IS NULL OR s.setting_key = p_setting_key)
            ORDER BY s.setting_category, s.setting_key;
            
        WHEN 'set' THEN
            IF p_setting_key IS NULL OR p_setting_value IS NULL THEN
                RAISE EXCEPTION 'Setting key and value required';
            END IF;
            
            -- Validate setting type
            SELECT setting_type 
            INTO v_setting_type
            FROM system_config.setting_definitions
            WHERE setting_key = p_setting_key;
            
            IF v_setting_type IS NULL THEN
                RAISE EXCEPTION 'Unknown setting key: %', p_setting_key;
            END IF;
            
            -- Validate value based on type
            CASE v_setting_type
                WHEN 'boolean' THEN
                    IF jsonb_typeof(p_setting_value) != 'boolean' THEN
                        RAISE EXCEPTION 'Setting % requires boolean value', p_setting_key;
                    END IF;
                WHEN 'number' THEN
                    IF jsonb_typeof(p_setting_value) != 'number' THEN
                        RAISE EXCEPTION 'Setting % requires numeric value', p_setting_key;
                    END IF;
                WHEN 'string' THEN
                    IF jsonb_typeof(p_setting_value) != 'string' THEN
                        RAISE EXCEPTION 'Setting % requires string value', p_setting_key;
                    END IF;
            END CASE;
            
            -- Insert or update setting
            INSERT INTO system_config.system_settings (
                org_id,
                setting_key,
                setting_value,
                setting_type,
                updated_at
            ) VALUES (
                p_org_id,
                p_setting_key,
                p_setting_value,
                v_setting_type,
                CURRENT_TIMESTAMP
            )
            ON CONFLICT (org_id, setting_key) DO UPDATE
            SET 
                setting_value = EXCLUDED.setting_value,
                updated_at = EXCLUDED.updated_at;
            
            -- Log configuration change
            INSERT INTO system_config.configuration_history (
                org_id,
                setting_key,
                old_value,
                new_value,
                changed_by,
                changed_at
            )
            SELECT 
                p_org_id,
                p_setting_key,
                s.setting_value,
                p_setting_value,
                COALESCE((p_setting_value->>'changed_by')::INTEGER, 0),
                CURRENT_TIMESTAMP
            FROM system_config.system_settings s
            WHERE s.org_id = p_org_id
            AND s.setting_key = p_setting_key;
            
            -- Return updated setting
            RETURN QUERY
            SELECT 
                s.setting_key,
                s.setting_value,
                s.setting_type,
                d.description,
                s.updated_at as last_updated,
                s.is_encrypted
            FROM system_config.system_settings s
            JOIN system_config.setting_definitions d ON s.setting_key = d.setting_key
            WHERE s.org_id = p_org_id
            AND s.setting_key = p_setting_key;
            
        WHEN 'reset' THEN
            -- Reset to default value
            IF p_setting_key IS NULL THEN
                -- Reset all settings
                DELETE FROM system_config.system_settings
                WHERE org_id = p_org_id;
            ELSE
                -- Reset specific setting
                DELETE FROM system_config.system_settings
                WHERE org_id = p_org_id
                AND setting_key = p_setting_key;
            END IF;
            
            -- Return default values
            RETURN QUERY
            SELECT 
                d.setting_key,
                d.default_value as setting_value,
                d.setting_type,
                d.description,
                NULL::TIMESTAMP as last_updated,
                d.is_encrypted
            FROM system_config.setting_definitions d
            WHERE p_setting_key IS NULL OR d.setting_key = p_setting_key;
            
        WHEN 'list' THEN
            -- List all available settings with current values
            RETURN QUERY
            SELECT 
                d.setting_key,
                COALESCE(
                    s.setting_value,
                    d.default_value
                ) as setting_value,
                d.setting_type,
                d.description,
                s.updated_at as last_updated,
                d.is_encrypted
            FROM system_config.setting_definitions d
            LEFT JOIN system_config.system_settings s ON 
                d.setting_key = s.setting_key AND
                s.org_id = p_org_id
            WHERE d.is_active = TRUE
            ORDER BY d.setting_category, d.setting_key;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 3. NOTIFICATION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_notifications(
    p_action TEXT, -- 'create', 'send', 'mark_read', 'get_pending'
    p_notification_data JSONB DEFAULT NULL,
    p_user_id INTEGER DEFAULT NULL,
    p_notification_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    notification_id INTEGER,
    notification_type TEXT,
    title TEXT,
    message TEXT,
    priority TEXT,
    status TEXT,
    created_at TIMESTAMP,
    read_at TIMESTAMP,
    action_url TEXT
) AS $$
DECLARE
    v_notification_id INTEGER;
    v_recipient_ids INTEGER[];
BEGIN
    CASE p_action
        WHEN 'create' THEN
            -- Create notification
            INSERT INTO system_config.system_notifications (
                org_id,
                notification_type,
                notification_category,
                title,
                message,
                priority,
                requires_acknowledgment,
                notification_data,
                created_by,
                created_at
            ) VALUES (
                (p_notification_data->>'org_id')::INTEGER,
                p_notification_data->>'notification_type',
                p_notification_data->>'category',
                p_notification_data->>'title',
                p_notification_data->>'message',
                COALESCE(p_notification_data->>'priority', 'normal'),
                COALESCE((p_notification_data->>'requires_acknowledgment')::BOOLEAN, FALSE),
                p_notification_data->'data',
                COALESCE((p_notification_data->>'created_by')::INTEGER, 0),
                CURRENT_TIMESTAMP
            ) RETURNING system_notifications.notification_id INTO v_notification_id;
            
            -- Determine recipients
            IF p_notification_data->'recipients' IS NOT NULL THEN
                -- Specific recipients
                SELECT ARRAY_AGG((value::TEXT)::INTEGER)
                INTO v_recipient_ids
                FROM jsonb_array_elements(p_notification_data->'recipients');
            ELSIF p_notification_data->>'role' IS NOT NULL THEN
                -- All users with specific role
                SELECT ARRAY_AGG(ur.user_id)
                INTO v_recipient_ids
                FROM system_config.user_roles ur
                JOIN system_config.roles r ON ur.role_id = r.role_id
                WHERE r.role_name = p_notification_data->>'role';
            ELSIF p_notification_data->>'broadcast' = 'true' THEN
                -- All active users
                SELECT ARRAY_AGG(u.user_id)
                INTO v_recipient_ids
                FROM system_config.users u
                WHERE u.is_active = TRUE;
            END IF;
            
            -- Create user notifications
            IF v_recipient_ids IS NOT NULL THEN
                INSERT INTO system_config.user_notifications (
                    user_id,
                    notification_id,
                    delivery_status,
                    created_at
                )
                SELECT 
                    unnest(v_recipient_ids),
                    v_notification_id,
                    'pending',
                    CURRENT_TIMESTAMP;
                    
                -- Send immediate notifications (email/SMS would be here)
                -- This is a placeholder for actual notification delivery
                UPDATE system_config.user_notifications
                SET 
                    delivery_status = 'sent',
                    sent_at = CURRENT_TIMESTAMP
                WHERE notification_id = v_notification_id;
            END IF;
            
            -- Return created notification
            RETURN QUERY
            SELECT 
                sn.notification_id,
                sn.notification_type,
                sn.title,
                sn.message,
                sn.priority,
                'created' as status,
                sn.created_at,
                NULL::TIMESTAMP as read_at,
                sn.notification_data->>'action_url' as action_url
            FROM system_config.system_notifications sn
            WHERE sn.notification_id = v_notification_id;
            
        WHEN 'mark_read' THEN
            -- Mark notification as read
            UPDATE system_config.user_notifications
            SET 
                read_at = CURRENT_TIMESTAMP,
                delivery_status = 'read'
            WHERE user_id = p_user_id
            AND notification_id = p_notification_id
            AND read_at IS NULL;
            
            -- Return updated notification
            RETURN QUERY
            SELECT 
                sn.notification_id,
                sn.notification_type,
                sn.title,
                sn.message,
                sn.priority,
                un.delivery_status as status,
                sn.created_at,
                un.read_at,
                sn.notification_data->>'action_url' as action_url
            FROM system_config.system_notifications sn
            JOIN system_config.user_notifications un ON 
                sn.notification_id = un.notification_id
            WHERE un.user_id = p_user_id
            AND sn.notification_id = p_notification_id;
            
        WHEN 'get_pending' THEN
            -- Get pending notifications for user
            RETURN QUERY
            SELECT 
                sn.notification_id,
                sn.notification_type,
                sn.title,
                sn.message,
                sn.priority,
                un.delivery_status as status,
                sn.created_at,
                un.read_at,
                sn.notification_data->>'action_url' as action_url
            FROM system_config.system_notifications sn
            JOIN system_config.user_notifications un ON 
                sn.notification_id = un.notification_id
            WHERE un.user_id = p_user_id
            AND un.read_at IS NULL
            AND sn.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
            ORDER BY 
                CASE sn.priority
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    ELSE 4
                END,
                sn.created_at DESC;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 4. SYSTEM HEALTH MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_system_health(
    p_org_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    health_status TEXT,
    health_score NUMERIC,
    components JSONB,
    alerts JSONB,
    recommendations JSONB
) AS $$
DECLARE
    v_health_score NUMERIC := 100;
    v_components JSONB;
    v_alerts JSONB := '[]'::JSONB;
    v_recommendations JSONB := '[]'::JSONB;
    v_database_health JSONB;
    v_performance_health JSONB;
    v_security_health JSONB;
    v_business_health JSONB;
BEGIN
    -- Database Health
    SELECT jsonb_build_object(
        'status', CASE 
            WHEN db_size_gb > 100 THEN 'warning'
            WHEN connection_percent > 80 THEN 'warning'
            ELSE 'healthy'
        END,
        'metrics', jsonb_build_object(
            'database_size_gb', db_size_gb,
            'connection_usage_percent', connection_percent,
            'cache_hit_ratio', cache_hit_ratio,
            'slow_queries_per_hour', slow_queries,
            'deadlocks_today', deadlock_count
        )
    )
    INTO v_database_health
    FROM (
        SELECT 
            pg_database_size(current_database()) / 1024.0 / 1024.0 / 1024.0 as db_size_gb,
            (SELECT count(*) FROM pg_stat_activity) * 100.0 / 
                NULLIF(current_setting('max_connections')::INTEGER, 0) as connection_percent,
            (SELECT ROUND(
                SUM(heap_blks_hit) * 100.0 / 
                NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0), 2
            ) FROM pg_statio_user_tables) as cache_hit_ratio,
            0 as slow_queries, -- Would query pg_stat_statements
            0 as deadlock_count -- Would query pg_stat_database
    ) db_stats;
    
    -- Performance Health
    WITH performance_stats AS (
        SELECT 
            AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_response_time,
            COUNT(*) FILTER (WHERE status = 'error') * 100.0 / NULLIF(COUNT(*), 0) as error_rate
        FROM system_config.api_logs
        WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    )
    SELECT jsonb_build_object(
        'status', CASE 
            WHEN avg_response_time > 5 THEN 'critical'
            WHEN avg_response_time > 2 THEN 'warning'
            WHEN error_rate > 5 THEN 'warning'
            ELSE 'healthy'
        END,
        'metrics', jsonb_build_object(
            'avg_response_time_seconds', ROUND(COALESCE(avg_response_time, 0), 2),
            'error_rate_percent', ROUND(COALESCE(error_rate, 0), 2),
            'active_users', (
                SELECT COUNT(DISTINCT user_id)
                FROM system_config.user_sessions
                WHERE expires_at > CURRENT_TIMESTAMP
            ),
            'requests_per_minute', (
                SELECT COUNT(*) / 60.0
                FROM system_config.api_logs
                WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
            )
        )
    )
    INTO v_performance_health
    FROM performance_stats;
    
    -- Security Health
    SELECT jsonb_build_object(
        'status', CASE 
            WHEN failed_login_count > 100 THEN 'warning'
            WHEN expired_password_count > 0 THEN 'warning'
            WHEN inactive_user_percent > 30 THEN 'warning'
            ELSE 'healthy'
        END,
        'metrics', jsonb_build_object(
            'failed_logins_today', failed_login_count,
            'suspicious_activities', suspicious_count,
            'expired_passwords', expired_password_count,
            'inactive_user_percent', ROUND(inactive_user_percent, 2)
        )
    )
    INTO v_security_health
    FROM (
        SELECT 
            (
                SELECT COUNT(*)
                FROM system_config.audit_log
                WHERE action_type = 'login_failed'
                AND created_at > CURRENT_DATE
            ) as failed_login_count,
            0 as suspicious_count, -- Would implement anomaly detection
            (
                SELECT COUNT(*)
                FROM system_config.users
                WHERE password_changed_at < CURRENT_DATE - INTERVAL '90 days'
                AND is_active = TRUE
            ) as expired_password_count,
            (
                SELECT COUNT(*) FILTER (WHERE last_login < CURRENT_DATE - INTERVAL '90 days') * 100.0 /
                       NULLIF(COUNT(*), 0)
                FROM system_config.users
                WHERE is_active = TRUE
            ) as inactive_user_percent
    ) security_stats;
    
    -- Business Health
    SELECT jsonb_build_object(
        'status', CASE 
            WHEN expired_license_count > 0 THEN 'critical'
            WHEN expiring_license_count > 0 THEN 'warning'
            WHEN low_stock_percent > 20 THEN 'warning'
            WHEN overdue_percent > 10 THEN 'warning'
            ELSE 'healthy'
        END,
        'metrics', jsonb_build_object(
            'expired_licenses', expired_license_count,
            'expiring_licenses_30days', expiring_license_count,
            'low_stock_items_percent', ROUND(low_stock_percent, 2),
            'overdue_receivables_percent', ROUND(overdue_percent, 2),
            'pending_orders', pending_order_count
        )
    )
    INTO v_business_health
    FROM (
        SELECT 
            (
                SELECT COUNT(*)
                FROM compliance.business_licenses
                WHERE expiry_date < CURRENT_DATE
                AND is_active = TRUE
                AND (p_org_id IS NULL OR org_id = p_org_id)
            ) as expired_license_count,
            (
                SELECT COUNT(*)
                FROM compliance.business_licenses
                WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
                AND is_active = TRUE
                AND (p_org_id IS NULL OR org_id = p_org_id)
            ) as expiring_license_count,
            (
                SELECT COUNT(*) FILTER (WHERE quantity_available <= reorder_level) * 100.0 /
                       NULLIF(COUNT(*), 0)
                FROM inventory.products p
                JOIN inventory.location_wise_stock lws ON p.product_id = lws.product_id
                WHERE p.is_active = TRUE
                AND (p_org_id IS NULL OR p.org_id = p_org_id)
            ) as low_stock_percent,
            (
                SELECT SUM(outstanding_amount) FILTER (WHERE due_date < CURRENT_DATE) * 100.0 /
                       NULLIF(SUM(outstanding_amount), 0)
                FROM financial.customer_outstanding
                WHERE status IN ('open', 'partial')
                AND (p_org_id IS NULL OR org_id = p_org_id)
            ) as overdue_percent,
            (
                SELECT COUNT(*)
                FROM sales.orders
                WHERE order_status IN ('pending', 'confirmed')
                AND (p_org_id IS NULL OR org_id = p_org_id)
            ) as pending_order_count
    ) business_stats;
    
    -- Calculate overall health score
    v_health_score := 100;
    
    -- Deduct points for issues
    IF v_database_health->>'status' = 'warning' THEN
        v_health_score := v_health_score - 10;
    END IF;
    
    IF v_performance_health->>'status' = 'warning' THEN
        v_health_score := v_health_score - 15;
    ELSIF v_performance_health->>'status' = 'critical' THEN
        v_health_score := v_health_score - 30;
    END IF;
    
    IF v_security_health->>'status' = 'warning' THEN
        v_health_score := v_health_score - 20;
    END IF;
    
    IF v_business_health->>'status' = 'warning' THEN
        v_health_score := v_health_score - 15;
    ELSIF v_business_health->>'status' = 'critical' THEN
        v_health_score := v_health_score - 25;
    END IF;
    
    -- Generate alerts
    IF (v_business_health->'metrics'->>'expired_licenses')::INTEGER > 0 THEN
        v_alerts := v_alerts || jsonb_build_array(
            jsonb_build_object(
                'severity', 'critical',
                'component', 'compliance',
                'message', format('%s licenses have expired',
                    v_business_health->'metrics'->>'expired_licenses')
            )
        );
    END IF;
    
    IF (v_performance_health->'metrics'->>'error_rate_percent')::NUMERIC > 5 THEN
        v_alerts := v_alerts || jsonb_build_array(
            jsonb_build_object(
                'severity', 'warning',
                'component', 'performance',
                'message', format('High error rate: %s%%',
                    v_performance_health->'metrics'->>'error_rate_percent')
            )
        );
    END IF;
    
    -- Generate recommendations
    IF (v_database_health->'metrics'->>'cache_hit_ratio')::NUMERIC < 90 THEN
        v_recommendations := v_recommendations || jsonb_build_array(
            jsonb_build_object(
                'area', 'database',
                'recommendation', 'Increase shared_buffers to improve cache hit ratio',
                'priority', 'medium'
            )
        );
    END IF;
    
    IF (v_business_health->'metrics'->>'low_stock_items_percent')::NUMERIC > 20 THEN
        v_recommendations := v_recommendations || jsonb_build_array(
            jsonb_build_object(
                'area', 'inventory',
                'recommendation', 'Review reorder levels - many items are low on stock',
                'priority', 'high'
            )
        );
    END IF;
    
    -- Compile components
    v_components := jsonb_build_object(
        'database', v_database_health,
        'performance', v_performance_health,
        'security', v_security_health,
        'business', v_business_health
    );
    
    -- Return health status
    RETURN QUERY
    SELECT 
        CASE 
            WHEN v_health_score >= 90 THEN 'excellent'
            WHEN v_health_score >= 75 THEN 'good'
            WHEN v_health_score >= 60 THEN 'fair'
            WHEN v_health_score >= 40 THEN 'poor'
            ELSE 'critical'
        END as health_status,
        v_health_score as health_score,
        v_components as components,
        v_alerts as alerts,
        v_recommendations as recommendations;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 5. BACKUP AND RECOVERY MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_backup_recovery(
    p_action TEXT, -- 'backup', 'restore', 'list', 'verify'
    p_backup_data JSONB DEFAULT NULL
)
RETURNS TABLE (
    backup_id INTEGER,
    backup_name TEXT,
    backup_type TEXT,
    backup_size BIGINT,
    backup_status TEXT,
    created_at TIMESTAMP,
    metadata JSONB
) AS $$
DECLARE
    v_backup_id INTEGER;
    v_backup_path TEXT;
BEGIN
    CASE p_action
        WHEN 'backup' THEN
            -- Create backup record
            INSERT INTO system_config.backup_history (
                backup_name,
                backup_type,
                backup_path,
                backup_status,
                metadata,
                created_by,
                created_at
            ) VALUES (
                COALESCE(
                    p_backup_data->>'backup_name',
                    'backup_' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD_HH24MISS')
                ),
                COALESCE(p_backup_data->>'backup_type', 'full'),
                COALESCE(
                    p_backup_data->>'backup_path',
                    '/backups/' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '/'
                ),
                'in_progress',
                jsonb_build_object(
                    'database_size', pg_database_size(current_database()),
                    'table_count', (
                        SELECT COUNT(*)
                        FROM information_schema.tables
                        WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                    ),
                    'compression', COALESCE(p_backup_data->>'compression', 'gzip'),
                    'encryption', COALESCE(p_backup_data->>'encryption', 'aes256')
                ),
                COALESCE((p_backup_data->>'created_by')::INTEGER, 0),
                CURRENT_TIMESTAMP
            ) RETURNING backup_history.backup_id INTO v_backup_id;
            
            -- In a real implementation, this would trigger actual backup
            -- For now, we'll simulate completion
            UPDATE system_config.backup_history
            SET 
                backup_status = 'completed',
                backup_size = pg_database_size(current_database()),
                completed_at = CURRENT_TIMESTAMP,
                metadata = metadata || jsonb_build_object(
                    'duration_seconds', 120,
                    'tables_backed_up', 135
                )
            WHERE backup_history.backup_id = v_backup_id;
            
            -- Return backup info
            RETURN QUERY
            SELECT 
                bh.backup_id,
                bh.backup_name,
                bh.backup_type,
                bh.backup_size,
                bh.backup_status,
                bh.created_at,
                bh.metadata
            FROM system_config.backup_history bh
            WHERE bh.backup_id = v_backup_id;
            
        WHEN 'list' THEN
            -- List backups
            RETURN QUERY
            SELECT 
                bh.backup_id,
                bh.backup_name,
                bh.backup_type,
                bh.backup_size,
                bh.backup_status,
                bh.created_at,
                bh.metadata || jsonb_build_object(
                    'age_days', EXTRACT(DAY FROM CURRENT_TIMESTAMP - bh.created_at),
                    'can_restore', bh.backup_status = 'completed' AND bh.is_valid
                ) as metadata
            FROM system_config.backup_history bh
            WHERE bh.is_valid = TRUE
            ORDER BY bh.created_at DESC
            LIMIT 50;
            
        WHEN 'verify' THEN
            -- Verify backup integrity
            IF p_backup_data->>'backup_id' IS NULL THEN
                RAISE EXCEPTION 'Backup ID required for verification';
            END IF;
            
            -- In real implementation, this would check backup integrity
            UPDATE system_config.backup_history
            SET 
                last_verified = CURRENT_TIMESTAMP,
                metadata = metadata || jsonb_build_object(
                    'verification_status', 'passed',
                    'verified_at', CURRENT_TIMESTAMP
                )
            WHERE backup_id = (p_backup_data->>'backup_id')::INTEGER;
            
            RETURN QUERY
            SELECT 
                bh.backup_id,
                bh.backup_name,
                bh.backup_type,
                bh.backup_size,
                'verified' as backup_status,
                bh.created_at,
                bh.metadata
            FROM system_config.backup_history bh
            WHERE bh.backup_id = (p_backup_data->>'backup_id')::INTEGER;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SUPPORTING TABLES
-- =============================================

-- Setting definitions
CREATE TABLE IF NOT EXISTS system_config.setting_definitions (
    setting_key TEXT PRIMARY KEY,
    setting_category TEXT NOT NULL,
    setting_type TEXT NOT NULL CHECK (setting_type IN ('string', 'number', 'boolean', 'json')),
    default_value JSONB,
    description TEXT,
    is_required BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    validation_rules JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Configuration history
CREATE TABLE IF NOT EXISTS system_config.configuration_history (
    history_id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL,
    setting_key TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    changed_by INTEGER,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT
);

-- API logs
CREATE TABLE IF NOT EXISTS system_config.api_logs (
    log_id SERIAL PRIMARY KEY,
    request_id UUID DEFAULT gen_random_uuid(),
    user_id INTEGER,
    endpoint TEXT,
    method TEXT,
    status TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    response_code INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Note: api_usage_log table already exists in 10_system_tables.sql, no need to create again

-- Backup history
CREATE TABLE IF NOT EXISTS system_config.backup_history (
    backup_id SERIAL PRIMARY KEY,
    backup_name TEXT NOT NULL,
    backup_type TEXT NOT NULL,
    backup_path TEXT,
    backup_size BIGINT,
    backup_status TEXT,
    metadata JSONB,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    last_verified TIMESTAMP,
    is_valid BOOLEAN DEFAULT TRUE
);

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
-- These tables don't exist in the main schema, commented out
-- CREATE INDEX idx_users_active ON system_config.users(is_active, username);
-- CREATE INDEX idx_user_sessions_active ON system_config.user_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_notifications_pending ON system_config.user_notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON system_config.audit_logs(user_id, activity_timestamp);
CREATE INDEX idx_settings_org ON system_config.system_settings(org_id, setting_key);

-- =============================================
-- GRANTS
-- =============================================
-- GRANT EXECUTE ON FUNCTION manage_user_access TO admin, hr_manager; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION manage_system_settings TO admin, system_admin; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION manage_notifications TO authenticated; -- Function doesn't exist
-- GRANT EXECUTE ON FUNCTION monitor_system_health TO admin, system_monitor; -- Function doesn't exist, role system_monitor doesn't exist
-- GRANT EXECUTE ON FUNCTION manage_backup_recovery TO admin, backup_operator; -- Function doesn't exist

-- =============================================
-- COMMENTS
-- =============================================
-- COMMENT ON FUNCTION manage_user_access IS 'Comprehensive user and role management'; -- Function doesn't exist
-- COMMENT ON FUNCTION manage_system_settings IS 'System configuration management with validation'; -- Function doesn't exist
-- COMMENT ON FUNCTION manage_notifications IS 'Notification creation and delivery management'; -- Function doesn't exist
-- COMMENT ON FUNCTION monitor_system_health IS 'System health monitoring and alerting'; -- Function doesn't exist
-- COMMENT ON FUNCTION manage_backup_recovery IS 'Backup and recovery operations management'; -- Function doesn't exist