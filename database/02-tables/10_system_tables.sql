-- =============================================
-- SYSTEM & CONFIGURATION TABLES
-- =============================================
-- Schema: system_config
-- Tables: 13
-- Purpose: System settings, audit, notifications
-- =============================================

-- 1. System Settings
CREATE TABLE system_config.system_settings (
    setting_id SERIAL PRIMARY KEY,
    org_id UUID REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Setting identification
    setting_category TEXT NOT NULL, -- 'general', 'sales', 'inventory', 'financial', 'compliance'
    setting_key TEXT NOT NULL,
    setting_name TEXT NOT NULL,
    
    -- Value
    setting_value TEXT,
    setting_type TEXT NOT NULL, -- 'string', 'number', 'boolean', 'json', 'date'
    default_value TEXT,
    
    -- Validation
    validation_rules JSONB DEFAULT '{}',
    -- {
    --   "required": true,
    --   "min": 0,
    --   "max": 100,
    --   "pattern": "^[A-Z]{2}[0-9]{4}$",
    --   "options": ["option1", "option2"]
    -- }
    
    -- Description
    description TEXT,
    help_text TEXT,
    
    -- Scope
    setting_scope TEXT NOT NULL, -- 'system', 'organization', 'branch', 'user'
    branch_id INTEGER REFERENCES master.org_branches(branch_id),
    user_id INTEGER REFERENCES master.org_users(user_id),
    
    -- UI hints
    ui_component TEXT, -- 'text', 'number', 'select', 'checkbox', 'date', 'json_editor'
    display_order INTEGER,
    group_name TEXT,
    
    -- Security
    is_sensitive BOOLEAN DEFAULT FALSE, -- Encrypt in database
    requires_restart BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_editable BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, setting_category, setting_key, setting_scope)
);

-- 2. Audit Logs
CREATE TABLE system_config.audit_logs (
    audit_id BIGSERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Activity details
    activity_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    activity_type TEXT NOT NULL, -- 'create', 'update', 'delete', 'view', 'export', 'login', 'logout'
    
    -- Entity affected
    entity_type TEXT NOT NULL, -- 'order', 'invoice', 'payment', 'product', 'customer', etc.
    entity_id TEXT,
    entity_name TEXT,
    
    -- Changes
    action_performed TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    
    -- User and session
    user_id INTEGER NOT NULL REFERENCES master.org_users(user_id),
    user_name TEXT NOT NULL,
    session_id TEXT,
    
    -- Request details
    ip_address INET,
    user_agent TEXT,
    request_method TEXT,
    request_url TEXT,
    
    -- Additional context
    module_name TEXT,
    function_name TEXT,
    
    -- Result
    result_status TEXT DEFAULT 'success', -- 'success', 'failure', 'error'
    error_message TEXT,
    
    -- Performance
    execution_time_ms INTEGER,
    
    -- Audit trail integrity
    previous_audit_hash TEXT,
    current_audit_hash TEXT
);

-- Create partition for audit logs by month
CREATE INDEX idx_audit_logs_timestamp ON system_config.audit_logs(activity_timestamp);
CREATE INDEX idx_audit_logs_entity ON system_config.audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON system_config.audit_logs(user_id);

-- 3. System Notifications
CREATE TABLE system_config.system_notifications (
    notification_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Notification details
    notification_type TEXT NOT NULL, -- 'info', 'warning', 'error', 'success'
    notification_category TEXT NOT NULL, -- 'system', 'business', 'compliance', 'alert'
    
    -- Content
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Priority and urgency
    priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    requires_acknowledgment BOOLEAN DEFAULT FALSE,
    
    -- Target audience
    target_audience TEXT NOT NULL, -- 'all', 'specific', 'role_based', 'branch_based'
    target_users INTEGER[], -- Specific user IDs
    target_roles TEXT[], -- Role names
    target_branches INTEGER[], -- Branch IDs
    
    -- Additional data
    notification_data JSONB DEFAULT '{}',
    action_url TEXT,
    
    -- Validity
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 4. User Notifications
CREATE TABLE system_config.user_notifications (
    user_notification_id SERIAL PRIMARY KEY,
    notification_id INTEGER NOT NULL REFERENCES system_config.system_notifications(notification_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Acknowledgment
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    
    -- Dismissal
    is_dismissed BOOLEAN DEFAULT FALSE,
    dismissed_at TIMESTAMP WITH TIME ZONE,
    
    -- Delivery
    delivered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivery_channel TEXT DEFAULT 'in_app', -- 'in_app', 'email', 'sms', 'push'
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(notification_id, user_id)
);

-- 5. Scheduled Jobs
CREATE TABLE system_config.scheduled_jobs (
    job_id SERIAL PRIMARY KEY,
    org_id UUID REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Job details
    job_name TEXT NOT NULL,
    job_type TEXT NOT NULL, -- 'report', 'backup', 'cleanup', 'sync', 'notification'
    job_category TEXT NOT NULL,
    
    -- Schedule
    schedule_type TEXT NOT NULL, -- 'once', 'recurring'
    cron_expression TEXT, -- For recurring jobs
    next_run_time TIMESTAMP WITH TIME ZONE,
    
    -- Execution
    job_function TEXT NOT NULL, -- Function/procedure to execute
    job_parameters JSONB DEFAULT '{}',
    
    -- Configuration
    max_retries INTEGER DEFAULT 3,
    retry_interval_minutes INTEGER DEFAULT 5,
    timeout_minutes INTEGER DEFAULT 60,
    
    -- Priority
    priority INTEGER DEFAULT 5, -- 1-10, 1 being highest
    
    -- Status
    job_status TEXT DEFAULT 'active', -- 'active', 'paused', 'disabled'
    
    -- Last execution
    last_run_time TIMESTAMP WITH TIME ZONE,
    last_run_status TEXT,
    last_run_duration_seconds INTEGER,
    last_error_message TEXT,
    
    -- Statistics
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id)
);

-- 6. Job Execution History
CREATE TABLE system_config.job_execution_history (
    execution_id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES system_config.scheduled_jobs(job_id) ON DELETE CASCADE,
    
    -- Execution details
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    
    -- Status
    execution_status TEXT NOT NULL, -- 'running', 'completed', 'failed', 'cancelled'
    
    -- Results
    records_processed INTEGER,
    records_succeeded INTEGER,
    records_failed INTEGER,
    
    -- Output
    output_log TEXT,
    error_log TEXT,
    
    -- Resources
    cpu_usage_percent NUMERIC(5,2),
    memory_usage_mb INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. System Integrations
CREATE TABLE system_config.system_integrations (
    integration_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Integration details
    integration_name TEXT NOT NULL,
    integration_type TEXT NOT NULL, -- 'api', 'webhook', 'database', 'file', 'email'
    provider_name TEXT,
    
    -- Configuration
    base_url TEXT,
    auth_type TEXT, -- 'none', 'api_key', 'oauth2', 'basic', 'custom'
    auth_config JSONB DEFAULT '{}', -- Encrypted sensitive data
    
    -- Connection settings
    connection_config JSONB DEFAULT '{}',
    -- {
    --   "timeout_seconds": 30,
    --   "retry_attempts": 3,
    --   "rate_limit": {"requests": 100, "per_minutes": 60}
    -- }
    
    -- Endpoints/Operations
    endpoints JSONB DEFAULT '[]',
    -- [
    --   {
    --     "name": "create_order",
    --     "method": "POST",
    --     "path": "/api/orders",
    --     "headers": {},
    --     "mapping": {}
    --   }
    -- ]
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_test_date TIMESTAMP WITH TIME ZONE,
    last_test_status TEXT,
    
    -- Monitoring
    health_check_url TEXT,
    health_check_interval_minutes INTEGER,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, integration_name)
);

-- 8. Integration Logs
CREATE TABLE system_config.integration_logs (
    log_id BIGSERIAL PRIMARY KEY,
    integration_id INTEGER NOT NULL REFERENCES system_config.system_integrations(integration_id) ON DELETE CASCADE,
    
    -- Request details
    request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    endpoint_name TEXT,
    request_method TEXT,
    request_url TEXT,
    request_headers JSONB,
    request_body JSONB,
    
    -- Response details
    response_timestamp TIMESTAMP WITH TIME ZONE,
    response_status_code INTEGER,
    response_headers JSONB,
    response_body JSONB,
    
    -- Performance
    response_time_ms INTEGER,
    
    -- Status
    status TEXT NOT NULL, -- 'success', 'failure', 'error', 'timeout'
    error_message TEXT,
    
    -- Reference
    reference_type TEXT,
    reference_id TEXT,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integration_logs_timestamp ON system_config.integration_logs(request_timestamp);
CREATE INDEX idx_integration_logs_integration ON system_config.integration_logs(integration_id);

-- 9. Email Templates
CREATE TABLE system_config.email_templates (
    template_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Template details
    template_code TEXT NOT NULL,
    template_name TEXT NOT NULL,
    template_category TEXT NOT NULL, -- 'transactional', 'notification', 'report', 'marketing'
    
    -- Email content
    subject_template TEXT NOT NULL,
    body_template_html TEXT NOT NULL,
    body_template_text TEXT,
    
    -- Variables
    available_variables JSONB DEFAULT '[]',
    -- ["customer_name", "order_number", "total_amount", "delivery_date"]
    
    -- Sender
    from_name TEXT,
    from_email TEXT,
    reply_to_email TEXT,
    
    -- Attachments
    default_attachments JSONB DEFAULT '[]',
    
    -- Localization
    language TEXT DEFAULT 'en',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, template_code, language)
);

-- 10. Scheduled Notifications
CREATE TABLE system_config.scheduled_notifications (
    scheduled_notification_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Schedule
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Notification content
    notification_type TEXT NOT NULL,
    notification_category TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    
    -- Target
    target_users INTEGER[],
    target_roles TEXT[],
    
    -- Additional data
    notification_data JSONB DEFAULT '{}',
    
    -- Status
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'cancelled', 'failed'
    sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 11. System Health Metrics
CREATE TABLE system_config.system_health_metrics (
    metric_id SERIAL PRIMARY KEY,
    
    -- Timestamp
    metric_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- System resources
    cpu_usage_percent NUMERIC(5,2),
    memory_usage_percent NUMERIC(5,2),
    disk_usage_percent NUMERIC(5,2),
    
    -- Database metrics
    active_connections INTEGER,
    total_connections INTEGER,
    slow_queries_count INTEGER,
    deadlock_count INTEGER,
    
    -- Application metrics
    active_users INTEGER,
    requests_per_minute INTEGER,
    average_response_time_ms INTEGER,
    error_rate_percent NUMERIC(5,2),
    
    -- Queue metrics
    pending_jobs INTEGER,
    failed_jobs INTEGER,
    
    -- Cache metrics
    cache_hit_rate_percent NUMERIC(5,2),
    cache_size_mb INTEGER,
    
    -- Status
    overall_health_status TEXT, -- 'healthy', 'degraded', 'critical'
    
    -- Alerts triggered
    alerts_triggered INTEGER DEFAULT 0
);

CREATE INDEX idx_health_metrics_timestamp ON system_config.system_health_metrics(metric_timestamp);

-- 12. Feature Flags
CREATE TABLE system_config.feature_flags (
    flag_id SERIAL PRIMARY KEY,
    org_id UUID REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Flag details
    flag_key TEXT NOT NULL,
    flag_name TEXT NOT NULL,
    description TEXT,
    
    -- Configuration
    flag_type TEXT NOT NULL, -- 'boolean', 'percentage', 'variant'
    default_value TEXT NOT NULL,
    
    -- Targeting
    targeting_rules JSONB DEFAULT '[]',
    -- [
    --   {"condition": "user_role", "operator": "in", "values": ["admin", "manager"]},
    --   {"condition": "branch_id", "operator": "equals", "value": 1}
    -- ]
    
    -- Rollout
    rollout_percentage INTEGER DEFAULT 100,
    rollout_strategy TEXT DEFAULT 'all', -- 'all', 'gradual', 'targeted'
    
    -- Variants (for A/B testing)
    variants JSONB DEFAULT '[]',
    -- [{"key": "control", "weight": 50}, {"key": "variant_a", "weight": 50}]
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Expiry
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, flag_key)
);

-- 13. Error Logs
CREATE TABLE system_config.error_logs (
    error_id BIGSERIAL PRIMARY KEY,
    org_id UUID REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Error details
    error_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    error_level TEXT NOT NULL, -- 'debug', 'info', 'warning', 'error', 'critical'
    error_code TEXT,
    error_message TEXT NOT NULL,
    
    -- Context
    module_name TEXT,
    function_name TEXT,
    line_number INTEGER,
    
    -- Stack trace
    stack_trace TEXT,
    
    -- Request context
    user_id INTEGER REFERENCES master.org_users(user_id),
    session_id TEXT,
    request_id TEXT,
    request_url TEXT,
    request_method TEXT,
    request_params JSONB,
    
    -- Environment
    environment TEXT, -- 'development', 'staging', 'production'
    server_name TEXT,
    
    -- Additional data
    error_data JSONB DEFAULT '{}',
    
    -- Resolution
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by INTEGER REFERENCES master.org_users(user_id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT
);

CREATE INDEX idx_error_logs_timestamp ON system_config.error_logs(error_timestamp);
CREATE INDEX idx_error_logs_level ON system_config.error_logs(error_level);
CREATE INDEX idx_error_logs_user ON system_config.error_logs(user_id);

-- Create indexes for performance
CREATE INDEX idx_system_settings_org ON system_config.system_settings(org_id);
CREATE INDEX idx_system_settings_category ON system_config.system_settings(setting_category);
CREATE INDEX idx_system_notifications_valid ON system_config.system_notifications(valid_from, valid_until);
CREATE INDEX idx_user_notifications_user ON system_config.user_notifications(user_id, is_read);
CREATE INDEX idx_scheduled_jobs_next_run ON system_config.scheduled_jobs(next_run_time) WHERE job_status = 'active';
CREATE INDEX idx_email_templates_code ON system_config.email_templates(template_code);
CREATE INDEX idx_feature_flags_key ON system_config.feature_flags(flag_key);

-- 14. Workflow Definitions
CREATE TABLE system_config.workflow_definitions (
    workflow_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Workflow details
    workflow_code TEXT NOT NULL,
    workflow_name TEXT NOT NULL,
    workflow_type TEXT NOT NULL, -- 'purchase_order', 'sales_return', 'credit_note', 'payment'
    
    -- Configuration
    steps JSONB NOT NULL DEFAULT '[]',
    /* Example:
    [
        {
            "step": 1,
            "name": "Manager Approval",
            "approver_role": "sales_manager",
            "conditions": {"amount": {"operator": ">=", "value": 50000}},
            "sla_hours": 24,
            "can_skip": false
        }
    ]
    */
    
    -- Rules
    conditions JSONB DEFAULT '{}',
    escalation_rules JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(org_id, workflow_code)
);

-- 15. Workflow Instances
CREATE TABLE system_config.workflow_instances (
    instance_id SERIAL PRIMARY KEY,
    workflow_id INTEGER NOT NULL REFERENCES system_config.workflow_definitions(workflow_id),
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Instance details
    instance_code TEXT NOT NULL,
    reference_type TEXT NOT NULL, -- 'purchase_order', 'sales_return', etc
    reference_id INTEGER NOT NULL,
    
    -- Current state
    current_step INTEGER NOT NULL DEFAULT 1,
    instance_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'cancelled'
    
    -- Approval tracking
    approval_history JSONB DEFAULT '[]',
    /* Example:
    [
        {
            "step": 1,
            "approver_id": 123,
            "action": "approved",
            "comments": "OK",
            "timestamp": "2024-01-15T10:30:00Z"
        }
    ]
    */
    
    -- Timing
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    
    -- Escalation
    is_escalated BOOLEAN DEFAULT FALSE,
    escalation_level INTEGER DEFAULT 0,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, instance_code)
);

-- 16. API Usage Log
CREATE TABLE system_config.api_usage_log (
    log_id BIGSERIAL,
    org_id UUID REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Request details
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    user_id INTEGER REFERENCES master.org_users(user_id),
    ip_address INET,
    user_agent TEXT,
    
    -- Performance
    request_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    response_time_ms INTEGER,
    status_code INTEGER,
    
    -- Size
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    
    -- Error tracking
    error_occurred BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    
    -- Rate limiting
    rate_limit_remaining INTEGER,
    
    -- Partition by month for performance
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite primary key including partition key
    PRIMARY KEY (log_id, created_at)
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (example for 2024)
CREATE TABLE system_config.api_usage_log_2024_01 PARTITION OF system_config.api_usage_log
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE system_config.api_usage_log_2024_02 PARTITION OF system_config.api_usage_log
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
-- Add more partitions as needed

-- Create indexes for new tables
CREATE INDEX idx_workflow_instances_status ON system_config.workflow_instances(instance_status, org_id);
CREATE INDEX idx_workflow_instances_reference ON system_config.workflow_instances(reference_type, reference_id);
CREATE INDEX idx_workflow_instances_sla ON system_config.workflow_instances(sla_deadline) WHERE instance_status = 'pending';
CREATE INDEX idx_api_log_timestamp ON system_config.api_usage_log(request_timestamp);
CREATE INDEX idx_api_log_endpoint ON system_config.api_usage_log(endpoint, method);
CREATE INDEX idx_api_log_user ON system_config.api_usage_log(user_id, request_timestamp);

-- Add comments
COMMENT ON TABLE system_config.system_settings IS 'Configurable system settings at various scopes';
COMMENT ON TABLE system_config.audit_logs IS 'Comprehensive audit trail for all system activities';
COMMENT ON TABLE system_config.system_notifications IS 'System-wide notifications and alerts';
COMMENT ON TABLE system_config.scheduled_jobs IS 'Background job scheduling and management';
COMMENT ON TABLE system_config.feature_flags IS 'Feature toggle and A/B testing configuration';
COMMENT ON TABLE system_config.workflow_definitions IS 'Workflow templates for approval processes';
COMMENT ON TABLE system_config.workflow_instances IS 'Active workflow instances for approvals';
COMMENT ON TABLE system_config.api_usage_log IS 'API usage tracking for performance and security';