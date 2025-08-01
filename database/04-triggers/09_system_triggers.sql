-- =============================================
-- SYSTEM CONFIGURATION AND MANAGEMENT TRIGGERS
-- =============================================
-- Schema: system_config
-- System settings, notifications, and workflows
-- =============================================

-- =============================================
-- 1. CONFIGURATION CHANGE TRACKING
-- =============================================
CREATE OR REPLACE FUNCTION track_configuration_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_change_impact TEXT;
    v_requires_restart BOOLEAN := FALSE;
    v_affected_modules TEXT[];
    v_notification_users INTEGER[];
BEGIN
    -- Determine impact of configuration change
    CASE NEW.setting_key
        -- Critical settings requiring restart
        WHEN 'database_connection_pool_size',
             'api_rate_limit',
             'session_timeout',
             'encryption_key' THEN
            v_change_impact := 'critical';
            v_requires_restart := TRUE;
            v_affected_modules := ARRAY['all'];
            
        -- Financial settings
        WHEN 'strict_credit_control',
             'auto_writeoff_limit',
             'payment_reconciliation_tolerance' THEN
            v_change_impact := 'high';
            v_affected_modules := ARRAY['finance', 'sales'];
            
        -- Inventory settings
        WHEN 'batch_expiry_alert_days',
             'auto_reorder_enabled',
             'stock_valuation_method' THEN
            v_change_impact := 'medium';
            v_affected_modules := ARRAY['inventory', 'procurement'];
            
        -- Compliance settings
        WHEN 'gxp_mode_enabled',
             'electronic_signature_required',
             'audit_trail_retention_days' THEN
            v_change_impact := 'high';
            v_affected_modules := ARRAY['compliance', 'quality'];
            
        ELSE
            v_change_impact := 'low';
            v_affected_modules := ARRAY['general'];
    END CASE;
    
    -- Log configuration change
    INSERT INTO system_config.audit_logs (
        org_id,
        setting_key,
        old_value,
        new_value,
        changed_by,
        change_timestamp,
        change_reason,
        impact_level,
        requires_restart,
        affected_modules
    ) VALUES (
        NEW.org_id,
        NEW.setting_key,
        OLD.setting_value,
        NEW.setting_value,
        NEW.updated_by,
        CURRENT_TIMESTAMP,
        NEW.update_reason,
        v_change_impact,
        v_requires_restart,
        v_affected_modules
    );
    
    -- Get admin users for notification
    SELECT ARRAY_AGG(u.user_id)
    INTO v_notification_users
    FROM master.org_users u
    JOIN master.roles r ON u.role_id = r.role_id
    WHERE u.org_id = NEW.org_id
    AND u.is_active = TRUE
    AND r.permission_flags->>'manage_system_settings' = 'true';
    
    -- Create notification for critical changes
    IF v_change_impact IN ('critical', 'high') THEN
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_users,
            requires_acknowledgment,
            notification_data
        ) VALUES (
            NEW.org_id,
            CASE v_change_impact
                WHEN 'critical' THEN 'error'
                ELSE 'warning'
            END,
            'system',
            'System Configuration Changed',
            format('Setting "%s" changed from "%s" to "%s". %s',
                NEW.setting_key,
                OLD.setting_value,
                NEW.setting_value,
                CASE 
                    WHEN v_requires_restart THEN 'System restart required.'
                    ELSE 'Changes will take effect immediately.'
                END),
            v_change_impact,
            v_notification_users,
            v_requires_restart,
            jsonb_build_object(
                'setting_key', NEW.setting_key,
                'old_value', OLD.setting_value,
                'new_value', NEW.setting_value,
                'impact_level', v_change_impact,
                'requires_restart', v_requires_restart,
                'affected_modules', v_affected_modules
            )
        );
    END IF;
    
    -- Apply immediate effects for certain settings
    IF NOT v_requires_restart THEN
        CASE NEW.setting_key
            WHEN 'maintenance_mode' THEN
                IF NEW.setting_value = 'true' THEN
                    -- Set maintenance mode flag
                    UPDATE master.organizations
                    SET 
                        is_active = FALSE,
                        maintenance_mode = TRUE,
                        maintenance_message = 'System is under maintenance. Please try again later.'
                    WHERE org_id = NEW.org_id;
                ELSE
                    -- Clear maintenance mode
                    UPDATE master.organizations
                    SET 
                        is_active = TRUE,
                        maintenance_mode = FALSE,
                        maintenance_message = NULL
                    WHERE org_id = NEW.org_id;
                END IF;
                
            WHEN 'block_orders_on_overdue' THEN
                -- Update credit check behavior immediately
                PERFORM pg_notify('config_change', 
                    json_build_object(
                        'org_id', NEW.org_id,
                        'setting', NEW.setting_key,
                        'value', NEW.setting_value
                    )::text
                );
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_config_changes
    AFTER UPDATE ON system_config.system_settings
    FOR EACH ROW
    WHEN (NEW.setting_value != OLD.setting_value)
    EXECUTE FUNCTION track_configuration_changes();

-- =============================================
-- 2. NOTIFICATION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_notification_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    v_escalation_config RECORD;
    v_next_escalation_level INTEGER;
    v_escalation_users INTEGER[];
BEGIN
    -- Handle new notifications
    IF TG_OP = 'INSERT' THEN
        -- Set expiry time based on priority
        NEW.expires_at := CURRENT_TIMESTAMP + CASE NEW.priority
            WHEN 'critical' THEN INTERVAL '7 days'
            WHEN 'urgent' THEN INTERVAL '3 days'
            WHEN 'high' THEN INTERVAL '2 days'
            ELSE INTERVAL '1 day'
        END;
        
        -- Auto-assign to users if target_audience is specified
        IF NEW.target_audience IS NOT NULL AND NEW.target_users IS NULL THEN
            SELECT ARRAY_AGG(u.user_id)
            INTO NEW.target_users
            FROM master.org_users u
            JOIN master.roles r ON u.role_id = r.role_id
            WHERE u.org_id = NEW.org_id
            AND u.is_active = TRUE
            AND (
                (NEW.target_audience = 'all') OR
                (NEW.target_audience = 'management' AND r.role_level >= 3) OR
                (NEW.target_audience = 'finance_team' AND r.department = 'finance') OR
                (NEW.target_audience = 'sales_team' AND r.department = 'sales') OR
                (NEW.target_audience = 'specific' AND u.user_id = ANY(NEW.target_users))
            );
        END IF;
        
        -- Send real-time notification
        PERFORM pg_notify('new_notification', 
            json_build_object(
                'notification_id', NEW.notification_id,
                'org_id', NEW.org_id,
                'type', NEW.notification_type,
                'title', NEW.title,
                'priority', NEW.priority,
                'users', NEW.target_users
            )::text
        );
        
    -- Handle updates
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check for escalation need
        IF NEW.acknowledged = FALSE AND 
           OLD.acknowledged = FALSE AND
           NEW.escalation_level IS NOT NULL AND
           NEW.priority IN ('critical', 'urgent') THEN
            
            -- Get escalation config
            SELECT 
                escalation_after_minutes,
                max_escalation_level
            INTO v_escalation_config
            FROM system_config.notification_escalation_rules
            WHERE org_id = NEW.org_id
            AND notification_category = NEW.notification_category
            AND is_active = TRUE;
            
            -- Check if escalation needed
            IF EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.created_at)) / 60 > 
               COALESCE(v_escalation_config.escalation_after_minutes, 60) THEN
                
                v_next_escalation_level := COALESCE(NEW.escalation_level, 0) + 1;
                
                IF v_next_escalation_level <= COALESCE(v_escalation_config.max_escalation_level, 3) THEN
                    -- Get next level users
                    SELECT ARRAY_AGG(u.user_id)
                    INTO v_escalation_users
                    FROM master.org_users u
                    JOIN master.roles r ON u.role_id = r.role_id
                    WHERE u.org_id = NEW.org_id
                    AND u.is_active = TRUE
                    AND r.role_level >= v_next_escalation_level + 2; -- Higher role levels
                    
                    -- Update notification
                    NEW.escalation_level := v_next_escalation_level;
                    NEW.target_users := NEW.target_users || v_escalation_users;
                    NEW.escalated_at := CURRENT_TIMESTAMP;
                    
                    -- Log escalation
                    INSERT INTO system_config.notification_escalation_log (
                        notification_id,
                        escalation_level,
                        escalated_to,
                        escalation_reason,
                        escalated_at
                    ) VALUES (
                        NEW.notification_id,
                        v_next_escalation_level,
                        v_escalation_users,
                        'No acknowledgment within configured time',
                        CURRENT_TIMESTAMP
                    );
                END IF;
            END IF;
        END IF;
        
        -- Handle acknowledgment
        IF NEW.acknowledged = TRUE AND OLD.acknowledged = FALSE THEN
            NEW.acknowledged_at := CURRENT_TIMESTAMP;
            
            -- If this was a blocking notification, unblock
            IF NEW.blocks_operations = TRUE THEN
                -- Clear any operation blocks
                UPDATE master.organizations
                SET operations_blocked = FALSE
                WHERE org_id = NEW.org_id
                AND NOT EXISTS (
                    SELECT 1 FROM system_config.system_notifications
                    WHERE org_id = NEW.org_id
                    AND blocks_operations = TRUE
                    AND acknowledged = FALSE
                    AND notification_id != NEW.notification_id
                );
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_notifications
    BEFORE INSERT OR UPDATE ON system_config.system_notifications
    FOR EACH ROW
    EXECUTE FUNCTION manage_notification_lifecycle();

-- =============================================
-- 3. WORKFLOW ENGINE
-- =============================================
CREATE OR REPLACE FUNCTION execute_workflow_step()
RETURNS TRIGGER AS $$
DECLARE
    v_workflow RECORD;
    v_next_step RECORD;
    v_can_proceed BOOLEAN;
    v_assigned_user INTEGER;
BEGIN
    -- Get workflow definition
    SELECT * INTO v_workflow
    FROM system_config.workflow_definitions
    WHERE workflow_id = NEW.workflow_id;
    
    -- Handle step completion
    IF NEW.step_status = 'completed' AND OLD.step_status != 'completed' THEN
        NEW.completed_at := CURRENT_TIMESTAMP;
        NEW.completed_by := NEW.updated_by;
        
        -- Check if all required fields are filled
        IF NEW.step_data IS NOT NULL AND 
           EXISTS (
               SELECT 1 FROM jsonb_object_keys(v_workflow.step_config->NEW.step_number->'required_fields') AS field
               WHERE NEW.step_data->>field IS NULL
           ) THEN
            RAISE EXCEPTION 'Required fields not completed for step %', NEW.step_number;
        END IF;
        
        -- Get next step
        SELECT * INTO v_next_step
        FROM jsonb_to_record(v_workflow.step_config->NEW.step_number::TEXT) AS x(
            next_step INTEGER,
            condition TEXT,
            auto_assign BOOLEAN,
            assign_to_role TEXT
        );
        
        -- Check condition for next step
        IF v_next_step.condition IS NOT NULL THEN
            EXECUTE format('SELECT %s FROM (SELECT $1.*) t', v_next_step.condition)
            USING NEW
            INTO v_can_proceed;
        ELSE
            v_can_proceed := TRUE;
        END IF;
        
        IF v_can_proceed AND v_next_step.next_step IS NOT NULL THEN
            -- Auto-assign next step
            IF v_next_step.auto_assign AND v_next_step.assign_to_role IS NOT NULL THEN
                SELECT u.user_id
                INTO v_assigned_user
                FROM master.org_users u
                JOIN master.roles r ON u.role_id = r.role_id
                WHERE u.org_id = NEW.org_id
                AND r.role_code = v_next_step.assign_to_role
                AND u.is_active = TRUE
                ORDER BY 
                    -- Load balancing
                    (SELECT COUNT(*) FROM system_config.workflow_instances 
                     WHERE assigned_to = u.user_id 
                     AND step_status = 'pending')
                LIMIT 1;
            END IF;
            
            -- Create next step
            INSERT INTO system_config.workflow_instances (
                org_id,
                workflow_id,
                workflow_instance_group,
                step_number,
                step_name,
                step_status,
                assigned_to,
                due_date,
                created_by
            )
            SELECT 
                NEW.org_id,
                NEW.workflow_id,
                NEW.workflow_instance_group,
                v_next_step.next_step,
                v_workflow.step_config->v_next_step.next_step::TEXT->>'name',
                'pending',
                v_assigned_user,
                CURRENT_TIMESTAMP + 
                    ((v_workflow.step_config->v_next_step.next_step::TEXT->>'sla_hours')::INTEGER || ' hours')::INTERVAL,
                NEW.completed_by;
        ELSE
            -- Workflow completed
            UPDATE system_config.workflow_instances
            SET step_status = 'workflow_completed'
            WHERE workflow_instance_group = NEW.workflow_instance_group
            AND instance_id = NEW.instance_id;
            
            -- Execute completion actions
            IF v_workflow.completion_actions IS NOT NULL THEN
                -- This would trigger specific actions based on workflow type
                PERFORM execute_workflow_completion_actions(
                    NEW.workflow_id,
                    NEW.workflow_instance_group,
                    NEW.step_data
                );
            END IF;
        END IF;
        
        -- Send notification
        INSERT INTO system_config.system_notifications (
            org_id,
            notification_type,
            notification_category,
            title,
            message,
            priority,
            target_users,
            notification_data
        ) VALUES (
            NEW.org_id,
            'info',
            'workflow',
            format('Workflow Step Completed: %s', NEW.step_name),
            format('%s has completed step %s in %s workflow',
                (SELECT full_name FROM master.org_users WHERE user_id = NEW.completed_by),
                NEW.step_name,
                v_workflow.workflow_name),
            'low',
            ARRAY[v_assigned_user],
            jsonb_build_object(
                'workflow_id', NEW.workflow_id,
                'instance_id', NEW.instance_id,
                'step_completed', NEW.step_number,
                'next_step', v_next_step.next_step
            )
        );
    END IF;
    
    -- Handle SLA breach
    IF NEW.step_status = 'pending' AND 
       NEW.due_date < CURRENT_TIMESTAMP AND
       NOT NEW.sla_breached THEN
        NEW.sla_breached := TRUE;
        
        -- Escalate
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
            'warning',
            'workflow',
            'Workflow SLA Breached',
            format('%s step in %s workflow has exceeded SLA by %s hours',
                NEW.step_name,
                v_workflow.workflow_name,
                ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.due_date)) / 3600)),
            'high',
            TRUE,
            jsonb_build_object(
                'workflow_id', NEW.workflow_id,
                'instance_id', NEW.instance_id,
                'step_number', NEW.step_number,
                'assigned_to', NEW.assigned_to,
                'hours_overdue', ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.due_date)) / 3600)
            )
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_execute_workflow
    BEFORE UPDATE ON system_config.workflow_instances
    FOR EACH ROW
    EXECUTE FUNCTION execute_workflow_step();

-- =============================================
-- 4. SYSTEM HEALTH MONITORING
-- =============================================
CREATE OR REPLACE FUNCTION monitor_system_health()
RETURNS TRIGGER AS $$
DECLARE
    v_alert_threshold RECORD;
    v_create_alert BOOLEAN := FALSE;
    v_alert_message TEXT;
    v_alert_severity TEXT;
BEGIN
    -- Get thresholds
    SELECT 
        (setting_value::JSONB->>'critical_cpu')::NUMERIC as critical_cpu,
        (setting_value::JSONB->>'critical_memory')::NUMERIC as critical_memory,
        (setting_value::JSONB->>'critical_disk')::NUMERIC as critical_disk,
        (setting_value::JSONB->>'warning_response_time')::NUMERIC as warning_response_time
    INTO v_alert_threshold
    FROM system_config.system_settings
    WHERE org_id = NEW.org_id
    AND setting_key = 'health_check_thresholds';
    
    -- Check CPU
    IF NEW.cpu_usage > COALESCE(v_alert_threshold.critical_cpu, 90) THEN
        v_create_alert := TRUE;
        v_alert_severity := 'critical';
        v_alert_message := format('Critical CPU usage: %s%%', ROUND(NEW.cpu_usage, 1));
        
    -- Check Memory
    ELSIF NEW.memory_usage > COALESCE(v_alert_threshold.critical_memory, 85) THEN
        v_create_alert := TRUE;
        v_alert_severity := 'critical';
        v_alert_message := format('Critical memory usage: %s%%', ROUND(NEW.memory_usage, 1));
        
    -- Check Disk
    ELSIF NEW.disk_usage > COALESCE(v_alert_threshold.critical_disk, 80) THEN
        v_create_alert := TRUE;
        v_alert_severity := 'high';
        v_alert_message := format('High disk usage: %s%%', ROUND(NEW.disk_usage, 1));
        
    -- Check API response time
    ELSIF NEW.api_response_time > COALESCE(v_alert_threshold.warning_response_time, 1000) THEN
        v_create_alert := TRUE;
        v_alert_severity := 'medium';
        v_alert_message := format('Slow API response time: %sms', ROUND(NEW.api_response_time));
        
    -- Check database connections
    ELSIF NEW.active_connections > (NEW.max_connections * 0.8) THEN
        v_create_alert := TRUE;
        v_alert_severity := 'high';
        v_alert_message := format('High database connections: %s/%s', 
            NEW.active_connections, NEW.max_connections);
    END IF;
    
    -- Create alert if needed
    IF v_create_alert THEN
        INSERT INTO system_config.system_notifications (
            org_id,
            alert_type,
            severity,
            title,
            message,
            source,
            metric_data,
            created_at
        ) VALUES (
            NEW.org_id,
            'system_health',
            v_alert_severity,
            'System Health Alert',
            v_alert_message,
            'health_monitor',
            jsonb_build_object(
                'cpu_usage', NEW.cpu_usage,
                'memory_usage', NEW.memory_usage,
                'disk_usage', NEW.disk_usage,
                'api_response_time', NEW.api_response_time,
                'active_connections', NEW.active_connections,
                'queue_size', NEW.queue_size
            ),
            CURRENT_TIMESTAMP
        )
        ON CONFLICT (org_id, alert_type, source) 
        WHERE resolved_at IS NULL
        DO UPDATE SET
            occurrences = system_config.system_notifications.occurrences + 1,
            last_occurred_at = CURRENT_TIMESTAMP,
            severity = GREATEST(
                system_config.system_notifications.severity::TEXT,
                v_alert_severity
            )::TEXT;
        
        -- Auto-scale if configured
        IF v_alert_severity = 'critical' AND EXISTS (
            SELECT 1 FROM system_config.system_settings
            WHERE org_id = NEW.org_id
            AND setting_key = 'auto_scaling_enabled'
            AND setting_value = 'true'
        ) THEN
            -- Trigger auto-scaling
            INSERT INTO system_config.auto_scaling_events (
                org_id,
                trigger_metric,
                trigger_value,
                scaling_action,
                status
            ) VALUES (
                NEW.org_id,
                CASE 
                    WHEN NEW.cpu_usage > v_alert_threshold.critical_cpu THEN 'cpu'
                    WHEN NEW.memory_usage > v_alert_threshold.critical_memory THEN 'memory'
                    ELSE 'connections'
                END,
                CASE 
                    WHEN NEW.cpu_usage > v_alert_threshold.critical_cpu THEN NEW.cpu_usage
                    WHEN NEW.memory_usage > v_alert_threshold.critical_memory THEN NEW.memory_usage
                    ELSE NEW.active_connections
                END,
                'scale_up',
                'triggered'
            );
        END IF;
    END IF;
    
    -- Update health status
    NEW.health_status := CASE
        WHEN v_alert_severity = 'critical' THEN 'unhealthy'
        WHEN v_alert_severity IN ('high', 'medium') THEN 'degraded'
        ELSE 'healthy'
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_monitor_health
    BEFORE INSERT ON system_config.system_health_metrics
    FOR EACH ROW
    EXECUTE FUNCTION monitor_system_health();

-- =============================================
-- 5. API RATE LIMITING
-- =============================================
CREATE OR REPLACE FUNCTION enforce_api_rate_limits()
RETURNS TRIGGER AS $$
DECLARE
    v_rate_limit RECORD;
    v_current_usage RECORD;
    v_is_exceeded BOOLEAN := FALSE;
BEGIN
    -- Get rate limit configuration
    SELECT 
        requests_per_minute,
        requests_per_hour,
        requests_per_day,
        burst_size,
        penalty_duration_minutes
    INTO v_rate_limit
    FROM system_config.api_rate_limits
    WHERE org_id = NEW.org_id
    AND (
        endpoint_pattern = NEW.endpoint OR
        NEW.endpoint LIKE endpoint_pattern OR
        endpoint_pattern = '*'
    )
    AND is_active = TRUE
    ORDER BY 
        CASE 
            WHEN endpoint_pattern = NEW.endpoint THEN 1
            WHEN endpoint_pattern != '*' THEN 2
            ELSE 3
        END
    LIMIT 1;
    
    IF NOT FOUND THEN
        -- Default limits
        v_rate_limit.requests_per_minute := 60;
        v_rate_limit.requests_per_hour := 1000;
        v_rate_limit.requests_per_day := 10000;
    END IF;
    
    -- Check current usage
    SELECT 
        COUNT(*) FILTER (WHERE request_timestamp > CURRENT_TIMESTAMP - INTERVAL '1 minute') as last_minute,
        COUNT(*) FILTER (WHERE request_timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour') as last_hour,
        COUNT(*) FILTER (WHERE request_timestamp > CURRENT_TIMESTAMP - INTERVAL '1 day') as last_day
    INTO v_current_usage
    FROM system_config.integration_logs
    WHERE org_id = NEW.org_id
    AND (user_id = NEW.user_id OR ip_address = NEW.ip_address)
    AND status_code < 429; -- Don't count rate limited requests
    
    -- Check limits
    IF v_current_usage.last_minute >= v_rate_limit.requests_per_minute THEN
        v_is_exceeded := TRUE;
        NEW.rate_limit_exceeded := 'per_minute';
    ELSIF v_current_usage.last_hour >= v_rate_limit.requests_per_hour THEN
        v_is_exceeded := TRUE;
        NEW.rate_limit_exceeded := 'per_hour';
    ELSIF v_current_usage.last_day >= v_rate_limit.requests_per_day THEN
        v_is_exceeded := TRUE;
        NEW.rate_limit_exceeded := 'per_day';
    END IF;
    
    -- Handle rate limit exceeded
    IF v_is_exceeded THEN
        NEW.status_code := 429;
        NEW.response_data := jsonb_build_object(
            'error', 'Rate limit exceeded',
            'limit_type', NEW.rate_limit_exceeded,
            'retry_after', v_rate_limit.penalty_duration_minutes * 60
        );
        
        -- Log violation
        INSERT INTO system_config.rate_limit_violations (
            org_id,
            user_id,
            ip_address,
            endpoint,
            limit_type,
            requests_made,
            limit_value,
            violation_timestamp
        ) VALUES (
            NEW.org_id,
            NEW.user_id,
            NEW.ip_address,
            NEW.endpoint,
            NEW.rate_limit_exceeded,
            CASE NEW.rate_limit_exceeded
                WHEN 'per_minute' THEN v_current_usage.last_minute
                WHEN 'per_hour' THEN v_current_usage.last_hour
                WHEN 'per_day' THEN v_current_usage.last_day
            END,
            CASE NEW.rate_limit_exceeded
                WHEN 'per_minute' THEN v_rate_limit.requests_per_minute
                WHEN 'per_hour' THEN v_rate_limit.requests_per_hour
                WHEN 'per_day' THEN v_rate_limit.requests_per_day
            END,
            CURRENT_TIMESTAMP
        );
        
        -- Block if repeated violations
        IF (
            SELECT COUNT(*) 
            FROM system_config.rate_limit_violations
            WHERE (user_id = NEW.user_id OR ip_address = NEW.ip_address)
            AND violation_timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'
        ) > 10 THEN
            -- Add to blocklist
            INSERT INTO system_config.api_blocklist (
                org_id,
                blocked_entity_type,
                blocked_entity_value,
                reason,
                blocked_until,
                blocked_by
            ) VALUES (
                NEW.org_id,
                CASE 
                    WHEN NEW.user_id IS NOT NULL THEN 'user'
                    ELSE 'ip'
                END,
                COALESCE(NEW.user_id::TEXT, NEW.ip_address),
                'Repeated rate limit violations',
                CURRENT_TIMESTAMP + INTERVAL '24 hours',
                0 -- System
            )
            ON CONFLICT (blocked_entity_type, blocked_entity_value) 
            DO UPDATE SET
                blocked_until = GREATEST(
                    system_config.api_blocklist.blocked_until,
                    CURRENT_TIMESTAMP + INTERVAL '24 hours'
                );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rate_limiting
    BEFORE INSERT ON system_config.integration_logs
    FOR EACH ROW
    EXECUTE FUNCTION enforce_api_rate_limits();

-- =============================================
-- 6. BACKUP AND RECOVERY MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_backup_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    v_retention_policy RECORD;
    v_storage_used NUMERIC;
    v_oldest_backup RECORD;
BEGIN
    -- Get retention policy
    SELECT 
        (setting_value::JSONB->>'daily_retention_days')::INTEGER as daily_retention,
        (setting_value::JSONB->>'weekly_retention_weeks')::INTEGER as weekly_retention,
        (setting_value::JSONB->>'monthly_retention_months')::INTEGER as monthly_retention,
        (setting_value::JSONB->>'max_storage_gb')::NUMERIC as max_storage
    INTO v_retention_policy
    FROM system_config.system_settings
    WHERE org_id = NEW.org_id
    AND setting_key = 'backup_retention_policy';
    
    -- Set retention based on backup type
    NEW.retention_until := CASE NEW.backup_frequency
        WHEN 'daily' THEN 
            NEW.backup_start_time + 
            (COALESCE(v_retention_policy.daily_retention, 7) || ' days')::INTERVAL
        WHEN 'weekly' THEN 
            NEW.backup_start_time + 
            (COALESCE(v_retention_policy.weekly_retention, 4) || ' weeks')::INTERVAL
        WHEN 'monthly' THEN 
            NEW.backup_start_time + 
            (COALESCE(v_retention_policy.monthly_retention, 12) || ' months')::INTERVAL
        ELSE 
            NEW.backup_start_time + INTERVAL '30 days'
    END;
    
    -- Check storage limits
    SELECT SUM(backup_size_mb) / 1024.0
    INTO v_storage_used
    FROM system_config.job_execution_history
    WHERE org_id = NEW.org_id
    AND status = 'completed'
    AND deleted_at IS NULL;
    
    -- If storage limit exceeded, delete old backups
    WHILE v_storage_used + (NEW.backup_size_mb / 1024.0) > 
          COALESCE(v_retention_policy.max_storage, 100) LOOP
        
        -- Find oldest non-critical backup
        SELECT *
        INTO v_oldest_backup
        FROM system_config.job_execution_history
        WHERE org_id = NEW.org_id
        AND status = 'completed'
        AND deleted_at IS NULL
        AND backup_frequency = 'daily'
        AND backup_start_time < CURRENT_TIMESTAMP - INTERVAL '7 days'
        ORDER BY backup_start_time
        LIMIT 1;
        
        IF NOT FOUND THEN
            -- No more backups to delete
            EXIT;
        END IF;
        
        -- Mark for deletion
        UPDATE system_config.job_execution_history
        SET 
            deleted_at = CURRENT_TIMESTAMP,
            deletion_reason = 'Storage limit exceeded'
        WHERE backup_id = v_oldest_backup.backup_id;
        
        v_storage_used := v_storage_used - (v_oldest_backup.backup_size_mb / 1024.0);
    END LOOP;
    
    -- Handle backup completion
    IF NEW.status = 'completed' AND OLD.status = 'in_progress' THEN
        NEW.backup_end_time := CURRENT_TIMESTAMP;
        NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.backup_end_time - NEW.backup_start_time));
        
        -- Verify backup
        IF NEW.backup_size_mb < 1 THEN
            NEW.status := 'failed';
            NEW.error_message := 'Backup file too small - possible corruption';
        ELSE
            -- Schedule verification
            INSERT INTO system_config.backup_verification_queue (
                backup_id,
                verification_type,
                scheduled_at
            ) VALUES (
                NEW.backup_id,
                'checksum',
                CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            );
        END IF;
        
        -- Update last successful backup
        UPDATE system_config.system_settings
        SET 
            setting_value = NEW.backup_end_time::TEXT,
            updated_at = CURRENT_TIMESTAMP
        WHERE org_id = NEW.org_id
        AND setting_key = 'last_successful_backup';
        
    -- Handle backup failure
    ELSIF NEW.status = 'failed' AND OLD.status = 'in_progress' THEN
        -- Create alert
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
            'error',
            'system',
            'Backup Failed',
            format('%s backup failed: %s',
                INITCAP(NEW.backup_type),
                NEW.error_message),
            'urgent',
            jsonb_build_object(
                'backup_id', NEW.backup_id,
                'backup_type', NEW.backup_type,
                'error', NEW.error_message,
                'retry_count', NEW.retry_count
            )
        );
        
        -- Schedule retry
        IF NEW.retry_count < 3 THEN
            INSERT INTO system_config.scheduled_jobs (
                org_id,
                job_type,
                job_name,
                job_data,
                scheduled_for,
                priority
            ) VALUES (
                NEW.org_id,
                'backup_retry',
                format('Retry backup %s', NEW.backup_id),
                jsonb_build_object(
                    'backup_id', NEW.backup_id,
                    'retry_count', NEW.retry_count + 1
                ),
                CURRENT_TIMESTAMP + (NEW.retry_count + 1) * INTERVAL '10 minutes',
                'high'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_backups
    BEFORE UPDATE ON system_config.job_execution_history
    FOR EACH ROW
    EXECUTE FUNCTION manage_backup_lifecycle();

-- =============================================
-- 7. USER SESSION MANAGEMENT
-- =============================================
CREATE OR REPLACE FUNCTION manage_user_sessions()
RETURNS TRIGGER AS $$
DECLARE
    v_concurrent_limit INTEGER;
    v_active_sessions INTEGER;
    v_oldest_session RECORD;
    v_session_timeout INTEGER;
BEGIN
    -- Get session configuration
    SELECT 
        (setting_value::JSONB->>'max_concurrent_sessions')::INTEGER,
        (setting_value::JSONB->>'session_timeout_minutes')::INTEGER
    INTO v_concurrent_limit, v_session_timeout
    FROM system_config.system_settings
    WHERE org_id = NEW.org_id
    AND setting_key = 'session_configuration';
    
    -- Default values
    v_concurrent_limit := COALESCE(v_concurrent_limit, 3);
    v_session_timeout := COALESCE(v_session_timeout, 480); -- 8 hours
    
    -- New session
    IF TG_OP = 'INSERT' THEN
        -- Check concurrent sessions
        SELECT COUNT(*)
        INTO v_active_sessions
        FROM system_config.audit_logs
        WHERE user_id = NEW.user_id
        AND is_active = TRUE
        AND last_activity > CURRENT_TIMESTAMP - (v_session_timeout || ' minutes')::INTERVAL;
        
        IF v_active_sessions >= v_concurrent_limit THEN
            -- Find oldest session to terminate
            SELECT *
            INTO v_oldest_session
            FROM system_config.audit_logs
            WHERE user_id = NEW.user_id
            AND is_active = TRUE
            ORDER BY last_activity
            LIMIT 1;
            
            -- Terminate oldest session
            UPDATE system_config.audit_logs
            SET 
                is_active = FALSE,
                logout_time = CURRENT_TIMESTAMP,
                logout_reason = 'concurrent_session_limit'
            WHERE session_id = v_oldest_session.session_id;
            
            -- Notify user
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
                'info',
                'security',
                'Session Terminated',
                'Your oldest session was terminated due to concurrent session limit',
                'low',
                ARRAY[NEW.user_id]
            );
        END IF;
        
        -- Check for suspicious activity
        IF EXISTS (
            SELECT 1 FROM system_config.audit_logs
            WHERE user_id = NEW.user_id
            AND login_time > CURRENT_TIMESTAMP - INTERVAL '1 minute'
            GROUP BY user_id
            HAVING COUNT(*) > 5
        ) THEN
            -- Flag potential brute force
            INSERT INTO system_config.security_events (
                org_id,
                event_type,
                severity,
                user_id,
                ip_address,
                details
            ) VALUES (
                NEW.org_id,
                'suspicious_login_pattern',
                'high',
                NEW.user_id,
                NEW.ip_address,
                jsonb_build_object(
                    'reason', 'Multiple login attempts',
                    'attempts_per_minute', 5
                )
            );
        END IF;
        
    -- Session update
    ELSIF TG_OP = 'UPDATE' THEN
        -- Check session timeout
        IF NEW.is_active AND 
           OLD.last_activity < CURRENT_TIMESTAMP - (v_session_timeout || ' minutes')::INTERVAL THEN
            NEW.is_active := FALSE;
            NEW.logout_time := CURRENT_TIMESTAMP;
            NEW.logout_reason := 'session_timeout';
        END IF;
        
        -- Update session duration
        IF NEW.is_active THEN
            NEW.session_duration := EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - NEW.login_time));
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_manage_sessions
    BEFORE INSERT OR UPDATE ON system_config.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION manage_user_sessions();

-- =============================================
-- SUPPORTING INDEXES
-- =============================================
CREATE INDEX idx_config_history_key ON system_config.audit_logs(org_id, entity_type, activity_timestamp);
CREATE INDEX idx_notifications_pending ON system_config.system_notifications(org_id, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_workflow_instances_pending ON system_config.workflow_instances(org_id, instance_status) WHERE instance_status = 'pending';
CREATE INDEX idx_system_alerts_active ON system_config.system_notifications(org_id, valid_until);
CREATE INDEX idx_api_usage_recent ON system_config.integration_logs(integration_id, request_timestamp);
CREATE INDEX idx_backup_history_active ON system_config.job_execution_history(job_id, execution_status) WHERE execution_status = 'running';
CREATE INDEX idx_user_sessions_active ON system_config.audit_logs(user_id, activity_type) WHERE activity_type IN ('login', 'logout');

-- Add comments
COMMENT ON FUNCTION track_configuration_changes() IS 'Tracks system configuration changes and manages impacts';
COMMENT ON FUNCTION manage_notification_lifecycle() IS 'Manages notification delivery and escalation';
COMMENT ON FUNCTION execute_workflow_step() IS 'Executes workflow steps and manages transitions';
COMMENT ON FUNCTION monitor_system_health() IS 'Monitors system health metrics and creates alerts';
COMMENT ON FUNCTION enforce_api_rate_limits() IS 'Enforces API rate limits and manages violations';
COMMENT ON FUNCTION manage_backup_lifecycle() IS 'Manages backup retention and storage limits';
COMMENT ON FUNCTION manage_user_sessions() IS 'Manages user session limits and security';