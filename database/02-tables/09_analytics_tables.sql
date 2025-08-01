-- =============================================
-- ANALYTICS & REPORTING TABLES
-- =============================================
-- Schema: analytics
-- Tables: 11
-- Purpose: Reports, dashboards, KPIs, and analytics
-- =============================================

-- 1. Report Templates
CREATE TABLE analytics.report_templates (
    template_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Template details
    template_code TEXT NOT NULL,
    template_name TEXT NOT NULL,
    report_category TEXT NOT NULL, -- 'sales', 'inventory', 'financial', 'compliance', 'operational'
    report_type TEXT NOT NULL, -- 'summary', 'detailed', 'analytical', 'regulatory'
    
    -- Configuration
    query_template TEXT NOT NULL, -- SQL query with parameters
    parameters JSONB DEFAULT '[]',
    -- [
    --   {"name": "from_date", "type": "date", "required": true},
    --   {"name": "to_date", "type": "date", "required": true},
    --   {"name": "branch_id", "type": "integer", "required": false}
    -- ]
    
    -- Output format
    output_formats TEXT[] DEFAULT '{pdf,excel,csv}',
    default_format TEXT DEFAULT 'pdf',
    
    -- Layout
    layout_config JSONB DEFAULT '{}',
    -- {
    --   "orientation": "portrait",
    --   "paper_size": "A4",
    --   "margins": {"top": 20, "bottom": 20, "left": 15, "right": 15},
    --   "header": true,
    --   "footer": true
    -- }
    
    -- Scheduling
    schedulable BOOLEAN DEFAULT TRUE,
    
    -- Access control
    required_roles TEXT[],
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, template_code)
);

-- 2. Report Schedules
CREATE TABLE analytics.report_schedules (
    schedule_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES analytics.report_templates(template_id),
    
    -- Schedule details
    schedule_name TEXT NOT NULL,
    frequency TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    
    -- Timing
    run_time TIME DEFAULT '08:00:00',
    run_day_of_week INTEGER, -- 0-6 for weekly
    run_day_of_month INTEGER, -- 1-31 for monthly
    
    -- Parameters
    report_parameters JSONB DEFAULT '{}',
    
    -- Recipients
    email_recipients TEXT[],
    cc_recipients TEXT[],
    
    -- Output
    output_format TEXT NOT NULL DEFAULT 'pdf',
    
    -- Next run
    next_run_date TIMESTAMP WITH TIME ZONE,
    last_run_date TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id)
);

-- 3. Report Execution History
CREATE TABLE analytics.report_execution_history (
    execution_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    template_id INTEGER NOT NULL REFERENCES analytics.report_templates(template_id),
    schedule_id INTEGER REFERENCES analytics.report_schedules(schedule_id),
    
    -- Execution details
    execution_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    executed_by INTEGER REFERENCES master.org_users(user_id),
    execution_type TEXT NOT NULL, -- 'manual', 'scheduled'
    
    -- Parameters used
    parameters_used JSONB DEFAULT '{}',
    
    -- Execution metrics
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    execution_time_ms INTEGER,
    rows_processed INTEGER,
    
    -- Output
    output_format TEXT,
    file_size_bytes INTEGER,
    file_path TEXT,
    
    -- Status
    execution_status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    error_message TEXT,
    
    -- Distribution
    emailed_to TEXT[],
    email_sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Dashboard Definitions
CREATE TABLE analytics.dashboards (
    dashboard_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Dashboard details
    dashboard_code TEXT NOT NULL,
    dashboard_name TEXT NOT NULL,
    dashboard_category TEXT NOT NULL,
    description TEXT,
    
    -- Layout
    layout_type TEXT DEFAULT 'grid', -- 'grid', 'flex'
    layout_config JSONB DEFAULT '{}',
    
    -- Refresh settings
    auto_refresh BOOLEAN DEFAULT FALSE,
    refresh_interval_seconds INTEGER DEFAULT 300,
    
    -- Access control
    is_public BOOLEAN DEFAULT FALSE,
    allowed_roles TEXT[],
    
    -- Default filters
    default_filters JSONB DEFAULT '{}',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, dashboard_code)
);

-- 5. Dashboard Widgets
CREATE TABLE analytics.dashboard_widgets (
    widget_id SERIAL PRIMARY KEY,
    dashboard_id INTEGER NOT NULL REFERENCES analytics.dashboards(dashboard_id) ON DELETE CASCADE,
    
    -- Widget details
    widget_type TEXT NOT NULL, -- 'chart', 'table', 'metric', 'gauge', 'map'
    widget_title TEXT NOT NULL,
    
    -- Data source
    data_query TEXT NOT NULL,
    refresh_interval_seconds INTEGER,
    
    -- Visualization config
    chart_type TEXT, -- 'line', 'bar', 'pie', 'donut', 'area', 'scatter'
    chart_config JSONB DEFAULT '{}',
    
    -- Position and size
    position_x INTEGER NOT NULL,
    position_y INTEGER NOT NULL,
    width INTEGER NOT NULL DEFAULT 4,
    height INTEGER NOT NULL DEFAULT 4,
    
    -- Interactivity
    is_interactive BOOLEAN DEFAULT TRUE,
    drill_down_enabled BOOLEAN DEFAULT FALSE,
    drill_down_dashboard_id INTEGER REFERENCES analytics.dashboards(dashboard_id),
    
    -- Thresholds and alerts
    thresholds JSONB DEFAULT '[]',
    -- [{"value": 80, "color": "yellow", "label": "Warning"}, {"value": 90, "color": "red", "label": "Critical"}]
    
    -- Display
    display_order INTEGER,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. KPI Definitions
CREATE TABLE analytics.kpi_definitions (
    kpi_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- KPI details
    kpi_code TEXT NOT NULL,
    kpi_name TEXT NOT NULL,
    kpi_category TEXT NOT NULL, -- 'sales', 'inventory', 'financial', 'operational', 'quality'
    
    -- Calculation
    calculation_query TEXT NOT NULL,
    aggregation_type TEXT NOT NULL, -- 'sum', 'avg', 'count', 'min', 'max', 'custom'
    
    -- Unit and format
    unit_of_measure TEXT,
    display_format TEXT, -- 'number', 'currency', 'percentage', 'ratio'
    decimal_places INTEGER DEFAULT 2,
    
    -- Targets
    target_type TEXT, -- 'fixed', 'dynamic', 'percentage_growth'
    target_value NUMERIC(15,4),
    target_query TEXT, -- For dynamic targets
    
    -- Frequency
    calculation_frequency TEXT NOT NULL, -- 'realtime', 'hourly', 'daily', 'weekly', 'monthly'
    
    -- Trending
    track_trend BOOLEAN DEFAULT TRUE,
    trend_period_days INTEGER DEFAULT 30,
    
    -- Alerts
    alert_enabled BOOLEAN DEFAULT FALSE,
    alert_threshold_type TEXT, -- 'above', 'below', 'outside_range'
    alert_threshold_value NUMERIC(15,4),
    alert_recipients TEXT[],
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, kpi_code)
);

-- 7. KPI Values
CREATE TABLE analytics.kpi_values (
    value_id SERIAL PRIMARY KEY,
    kpi_id INTEGER NOT NULL REFERENCES analytics.kpi_definitions(kpi_id),
    
    -- Period
    calculation_date DATE NOT NULL,
    period_type TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'
    
    -- Values
    actual_value NUMERIC(15,4) NOT NULL,
    target_value NUMERIC(15,4),
    previous_value NUMERIC(15,4),
    
    -- Calculated metrics
    variance_amount NUMERIC(15,4),
    variance_percentage NUMERIC(10,2),
    achievement_percentage NUMERIC(10,2),
    
    -- Trend
    trend_direction TEXT, -- 'up', 'down', 'stable'
    trend_percentage NUMERIC(10,2),
    
    -- Status
    status TEXT, -- 'on_target', 'above_target', 'below_target', 'critical'
    
    -- Calculation details
    calculation_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    calculation_duration_ms INTEGER,
    data_quality_score NUMERIC(5,2), -- 0-100
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(kpi_id, calculation_date, period_type)
);

-- 8. Data Quality Metrics
CREATE TABLE analytics.data_quality_metrics (
    metric_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Check details
    check_date DATE NOT NULL DEFAULT CURRENT_DATE,
    table_schema TEXT NOT NULL,
    table_name TEXT NOT NULL,
    
    -- Metrics
    total_records INTEGER NOT NULL,
    null_count INTEGER DEFAULT 0,
    duplicate_count INTEGER DEFAULT 0,
    
    -- Field-level checks
    field_checks JSONB DEFAULT '[]',
    -- [
    --   {
    --     "field_name": "email",
    --     "check_type": "format",
    --     "invalid_count": 15,
    --     "invalid_percentage": 0.5
    --   }
    -- ]
    
    -- Overall score
    completeness_score NUMERIC(5,2), -- Percentage of non-null required fields
    validity_score NUMERIC(5,2), -- Percentage of valid formats/ranges
    consistency_score NUMERIC(5,2), -- Percentage following business rules
    overall_quality_score NUMERIC(5,2),
    
    -- Issues found
    critical_issues INTEGER DEFAULT 0,
    major_issues INTEGER DEFAULT 0,
    minor_issues INTEGER DEFAULT 0,
    
    -- Status
    check_status TEXT DEFAULT 'completed',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    checked_by INTEGER REFERENCES master.org_users(user_id)
);

-- 9. User Analytics
CREATE TABLE analytics.user_activity_analytics (
    analytics_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    -- Period
    activity_date DATE NOT NULL,
    
    -- Login metrics
    login_count INTEGER DEFAULT 0,
    first_login_time TIME,
    last_login_time TIME,
    total_session_duration_minutes INTEGER DEFAULT 0,
    
    -- Feature usage
    features_used TEXT[],
    most_used_feature TEXT,
    
    -- Transaction metrics
    transactions_created INTEGER DEFAULT 0,
    transactions_value NUMERIC(15,2) DEFAULT 0,
    
    -- Module-wise activity
    module_activity JSONB DEFAULT '{}',
    -- {
    --   "sales": {"page_views": 45, "actions": 12, "time_spent_minutes": 35},
    --   "inventory": {"page_views": 20, "actions": 8, "time_spent_minutes": 15}
    -- }
    
    -- Performance metrics
    average_page_load_time_ms INTEGER,
    slow_queries_count INTEGER DEFAULT 0,
    errors_encountered INTEGER DEFAULT 0,
    
    -- Device and location
    devices_used JSONB DEFAULT '[]',
    locations JSONB DEFAULT '[]',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, activity_date)
);

-- 10. Alert Definitions
CREATE TABLE analytics.alert_definitions (
    alert_id SERIAL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES master.organizations(org_id) ON DELETE CASCADE,
    
    -- Alert details
    alert_code TEXT NOT NULL,
    alert_name TEXT NOT NULL,
    alert_category TEXT NOT NULL, -- 'business', 'system', 'compliance', 'security'
    
    -- Trigger
    trigger_type TEXT NOT NULL, -- 'threshold', 'anomaly', 'scheduled', 'event'
    check_query TEXT NOT NULL,
    check_frequency_minutes INTEGER DEFAULT 60,
    
    -- Conditions
    conditions JSONB NOT NULL,
    -- {
    --   "operator": "greater_than",
    --   "value": 1000000,
    --   "consecutive_occurrences": 3
    -- }
    
    -- Severity
    severity TEXT NOT NULL, -- 'info', 'warning', 'error', 'critical'
    
    -- Actions
    notification_channels TEXT[] DEFAULT '{email,dashboard}', -- 'email', 'sms', 'dashboard', 'webhook'
    recipients JSONB DEFAULT '{}',
    -- {
    --   "email": ["admin@company.com"],
    --   "sms": ["+919876543210"],
    --   "roles": ["admin", "manager"]
    -- }
    
    -- Message template
    message_template TEXT,
    
    -- Cooldown
    cooldown_minutes INTEGER DEFAULT 60, -- Prevent alert fatigue
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER NOT NULL REFERENCES master.org_users(user_id),
    
    UNIQUE(org_id, alert_code)
);

-- 11. Alert History
CREATE TABLE analytics.alert_history (
    history_id SERIAL PRIMARY KEY,
    alert_id INTEGER NOT NULL REFERENCES analytics.alert_definitions(alert_id),
    
    -- Trigger details
    triggered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    trigger_value TEXT,
    trigger_details JSONB DEFAULT '{}',
    
    -- Alert details
    severity TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Notifications
    notifications_sent JSONB DEFAULT '{}',
    -- {
    --   "email": {"sent": true, "recipients": [...], "sent_at": "..."},
    --   "sms": {"sent": false, "error": "SMS service unavailable"}
    -- }
    
    -- Acknowledgment
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by INTEGER REFERENCES master.org_users(user_id),
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledgment_notes TEXT,
    
    -- Resolution
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by INTEGER REFERENCES master.org_users(user_id),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    
    -- Status
    alert_status TEXT DEFAULT 'open', -- 'open', 'acknowledged', 'resolved', 'expired'
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_report_templates_category ON analytics.report_templates(report_category);
CREATE INDEX idx_report_execution_date ON analytics.report_execution_history(execution_date);
CREATE INDEX idx_report_execution_template ON analytics.report_execution_history(template_id);
CREATE INDEX idx_dashboard_widgets_dashboard ON analytics.dashboard_widgets(dashboard_id);
CREATE INDEX idx_kpi_values_kpi_date ON analytics.kpi_values(kpi_id, calculation_date);
CREATE INDEX idx_data_quality_date ON analytics.data_quality_metrics(check_date);
CREATE INDEX idx_user_activity_date ON analytics.user_activity_analytics(activity_date);
CREATE INDEX idx_user_activity_user ON analytics.user_activity_analytics(user_id);
CREATE INDEX idx_alert_history_alert ON analytics.alert_history(alert_id);
CREATE INDEX idx_alert_history_triggered ON analytics.alert_history(triggered_at);
CREATE INDEX idx_alert_history_status ON analytics.alert_history(alert_status);

-- Add comments
COMMENT ON TABLE analytics.report_templates IS 'Report template definitions with parameters and scheduling';
COMMENT ON TABLE analytics.dashboards IS 'Dashboard configurations for real-time analytics';
COMMENT ON TABLE analytics.kpi_definitions IS 'Key Performance Indicator definitions and targets';
COMMENT ON TABLE analytics.data_quality_metrics IS 'Data quality monitoring and scoring';
COMMENT ON TABLE analytics.alert_definitions IS 'Business and system alert configurations';