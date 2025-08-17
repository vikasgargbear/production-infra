# Analytics Schema Documentation

## Overview
The `analytics` schema provides business intelligence, reporting, and data analytics capabilities. It includes pre-aggregated data, KPIs, dashboards, and analytical views for decision-making.

---

## Tables

### 1. report_templates

### report_templates
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_report_templates()`, `api.create_report_template()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `template_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `template_code` | TEXT | ✓ | Description needed | Standard field usage |
| `template_name` | TEXT | ✓ | Description needed | Standard field usage |
| `report_category` | TEXT | ✓ | Description needed | Standard field usage |
| `report_type` | TEXT | ✓ | Description needed | Standard field usage |
| `query_template` | TEXT | ✓ | Description needed | Standard field usage |
| `parameters` | JSONB | - | Description needed | Standard field usage |
| `output_formats` | TEXT[] | - | Description needed | Standard field usage |
| `default_format` | TEXT | - | Description needed | Standard field usage |
| `layout_config` | JSONB | - | Description needed | Standard field usage |
| `schedulable` | BOOLEAN | - | Description needed | Standard field usage |
| `required_roles` | TEXT[] | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 2. report_schedules

### report_schedules
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_report_schedules()`, `api.create_report_schedule()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `schedule_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `template_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `schedule_name` | TEXT | ✓ | Description needed | Standard field usage |
| `frequency` | TEXT | ✓ | Description needed | Standard field usage |
| `run_time` | TIME | - | Description needed | Standard field usage |
| `run_day_of_week` | INTEGER | - | Description needed | Standard field usage |
| `run_day_of_month` | INTEGER | - | Description needed | Standard field usage |
| `report_parameters` | JSONB | - | Description needed | Standard field usage |
| `email_recipients` | TEXT[] | - | Description needed | Standard field usage |
| `cc_recipients` | TEXT[] | - | Description needed | Standard field usage |
| `output_format` | TEXT | - | Description needed | Standard field usage |
| `next_run_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `last_run_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `template_id` → `analytics.report_templates.template_id`
- `created_by` → `master.org_users.user_id`

---

### 3. report_execution_history

### report_execution_history
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_report_execution_history()`, `api.create_report_execution_history()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `execution_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `template_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `schedule_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `execution_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `executed_by` | INTEGER | - | Description needed | Standard field usage |
| `execution_type` | TEXT | ✓ | Description needed | Standard field usage |
| `parameters_used` | JSONB | - | Description needed | Standard field usage |
| `start_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `end_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `execution_time_ms` | INTEGER | - | Description needed | Standard field usage |
| `rows_processed` | INTEGER | - | Description needed | Standard field usage |
| `output_format` | TEXT | - | Description needed | Standard field usage |
| `file_size_bytes` | INTEGER | - | Description needed | Standard field usage |
| `file_path` | TEXT | - | Description needed | Standard field usage |
| `execution_status` | TEXT | - | Description needed | Standard field usage |
| `error_message` | TEXT | - | Description needed | Standard field usage |
| `emailed_to` | TEXT[] | - | Description needed | Standard field usage |
| `email_sent_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `template_id` → `analytics.report_templates.template_id`
- `schedule_id` → `analytics.report_schedules.schedule_id`
- `executed_by` → `master.org_users.user_id`

---

### 4. dashboards

### dashboards
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_dashboards()`, `api.create_dashboard()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `dashboard_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `dashboard_code` | TEXT | ✓ | Description needed | Standard field usage |
| `dashboard_name` | TEXT | ✓ | Description needed | Standard field usage |
| `dashboard_category` | TEXT | ✓ | Description needed | Standard field usage |
| `description` | TEXT | - | Description needed | Standard field usage |
| `layout_type` | TEXT | - | Description needed | Standard field usage |
| `layout_config` | JSONB | - | Description needed | Standard field usage |
| `auto_refresh` | BOOLEAN | - | Description needed | Standard field usage |
| `refresh_interval_seconds` | INTEGER | - | Description needed | Standard field usage |
| `is_public` | BOOLEAN | - | Description needed | Standard field usage |
| `allowed_roles` | TEXT[] | - | Description needed | Standard field usage |
| `default_filters` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 5. dashboard_widgets

### dashboard_widgets
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_dashboard_widgets()`, `api.create_dashboard_widget()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `widget_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `dashboard_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `widget_type` | TEXT | ✓ | Description needed | Standard field usage |
| `widget_title` | TEXT | ✓ | Description needed | Standard field usage |
| `data_query` | TEXT | ✓ | Description needed | Standard field usage |
| `refresh_interval_seconds` | INTEGER | - | Description needed | Standard field usage |
| `chart_type` | TEXT | - | Description needed | Standard field usage |
| `chart_config` | JSONB | - | Description needed | Standard field usage |
| `position_x` | INTEGER | ✓ | Description needed | Standard field usage |
| `position_y` | INTEGER | ✓ | Description needed | Standard field usage |
| `width` | INTEGER | - | Description needed | Standard field usage |
| `height` | INTEGER | - | Description needed | Standard field usage |
| `is_interactive` | BOOLEAN | - | Description needed | Standard field usage |
| `drill_down_enabled` | BOOLEAN | - | Description needed | Standard field usage |
| `drill_down_dashboard_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `thresholds` | JSONB | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `dashboard_id` → `analytics.dashboards.dashboard_id`
- `drill_down_dashboard_id` → `analytics.dashboards.dashboard_id`

---

### 6. kpi_definitions

### kpi_definitions
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_kpi_definitions()`, `api.create_kpi_definition()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `kpi_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `kpi_code` | TEXT | ✓ | Description needed | Standard field usage |
| `kpi_name` | TEXT | ✓ | Description needed | Standard field usage |
| `kpi_category` | TEXT | ✓ | Description needed | Standard field usage |
| `calculation_query` | TEXT | ✓ | Description needed | Standard field usage |
| `aggregation_type` | TEXT | ✓ | Description needed | Standard field usage |
| `unit_of_measure` | TEXT | - | Description needed | Standard field usage |
| `display_format` | TEXT | - | Description needed | Standard field usage |
| `decimal_places` | INTEGER | - | Description needed | Standard field usage |
| `target_type` | TEXT | - | Description needed | Standard field usage |
| `target_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `target_query` | TEXT | - | Description needed | Standard field usage |
| `calculation_frequency` | TEXT | ✓ | Description needed | Standard field usage |
| `track_trend` | BOOLEAN | - | Description needed | Standard field usage |
| `trend_period_days` | INTEGER | - | Description needed | Standard field usage |
| `alert_enabled` | BOOLEAN | - | Description needed | Standard field usage |
| `alert_threshold_type` | TEXT | - | Description needed | Standard field usage |
| `alert_threshold_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `alert_recipients` | TEXT[] | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 7. kpi_values

### kpi_values
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_kpi_values()`, `api.create_kpi_value()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `value_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `kpi_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `calculation_date` | DATE | ✓ | Description needed | Standard field usage |
| `period_type` | TEXT | ✓ | Description needed | Standard field usage |
| `actual_value` | NUMERIC(15 | ✓ | Description needed | Standard field usage |
| `target_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `previous_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `variance_amount` | NUMERIC(15 | - | Description needed | Standard field usage |
| `variance_percentage` | NUMERIC(10 | - | Description needed | Standard field usage |
| `achievement_percentage` | NUMERIC(10 | - | Description needed | Standard field usage |
| `trend_direction` | TEXT | - | Description needed | Standard field usage |
| `trend_percentage` | NUMERIC(10 | - | Description needed | Standard field usage |
| `status` | TEXT | - | Description needed | Standard field usage |
| `calculation_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `calculation_duration_ms` | INTEGER | - | Description needed | Standard field usage |
| `data_quality_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `kpi_id` → `analytics.kpi_definitions.kpi_id`

---

### 8. data_quality_metrics

### data_quality_metrics
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_data_quality_metrics()`, `api.create_data_quality_metric()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `metric_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `check_date` | DATE | - | Description needed | Standard field usage |
| `table_schema` | TEXT | ✓ | Description needed | Standard field usage |
| `table_name` | TEXT | ✓ | Description needed | Standard field usage |
| `total_records` | INTEGER | ✓ | Description needed | Standard field usage |
| `null_count` | INTEGER | - | Description needed | Standard field usage |
| `duplicate_count` | INTEGER | - | Description needed | Standard field usage |
| `field_checks` | JSONB | - | Description needed | Standard field usage |
| `completeness_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `validity_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `consistency_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `overall_quality_score` | NUMERIC(5 | - | Description needed | Standard field usage |
| `critical_issues` | INTEGER | - | Description needed | Standard field usage |
| `major_issues` | INTEGER | - | Description needed | Standard field usage |
| `minor_issues` | INTEGER | - | Description needed | Standard field usage |
| `check_status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `checked_by` | INTEGER | - | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `checked_by` → `master.org_users.user_id`

---

### 9. user_activity_analytics

### user_activity_analytics
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_user_activity_analytics()`, `api.create_user_activity_analytic()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `analytics_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `user_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `activity_date` | DATE | ✓ | Description needed | Standard field usage |
| `login_count` | INTEGER | - | Description needed | Standard field usage |
| `first_login_time` | TIME | - | Description needed | Standard field usage |
| `last_login_time` | TIME | - | Description needed | Standard field usage |
| `total_session_duration_minutes` | INTEGER | - | Description needed | Standard field usage |
| `features_used` | TEXT[] | - | Description needed | Standard field usage |
| `most_used_feature` | TEXT | - | Description needed | Standard field usage |
| `transactions_created` | INTEGER | - | Description needed | Standard field usage |
| `transactions_value` | NUMERIC(15 | - | Description needed | Standard field usage |
| `module_activity` | JSONB | - | Description needed | Standard field usage |
| `average_page_load_time_ms` | INTEGER | - | Description needed | Standard field usage |
| `slow_queries_count` | INTEGER | - | Description needed | Standard field usage |
| `errors_encountered` | INTEGER | - | Description needed | Standard field usage |
| `devices_used` | JSONB | - | Description needed | Standard field usage |
| `locations` | JSONB | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `user_id` → `master.org_users.user_id`

---

### 10. alert_definitions

### alert_definitions
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_alert_definitions()`, `api.create_alert_definition()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `alert_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `alert_code` | TEXT | ✓ | Description needed | Standard field usage |
| `alert_name` | TEXT | ✓ | Description needed | Standard field usage |
| `alert_category` | TEXT | ✓ | Description needed | Standard field usage |
| `trigger_type` | TEXT | ✓ | Description needed | Standard field usage |
| `check_query` | TEXT | ✓ | Description needed | Standard field usage |
| `check_frequency_minutes` | INTEGER | - | Description needed | Standard field usage |
| `conditions` | JSONB | ✓ | Description needed | Standard field usage |
| `severity` | TEXT | ✓ | Description needed | Standard field usage |
| `notification_channels` | TEXT[] | - | Description needed | Standard field usage |
| `recipients` | JSONB | - | Description needed | Standard field usage |
| `message_template` | TEXT | - | Description needed | Standard field usage |
| `cooldown_minutes` | INTEGER | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 11. alert_history

### alert_history
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_alert_history()`, `api.create_alert_history()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `history_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `alert_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `triggered_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `trigger_value` | TEXT | - | Description needed | Standard field usage |
| `trigger_details` | JSONB | - | Description needed | Standard field usage |
| `severity` | TEXT | ✓ | Description needed | Standard field usage |
| `message` | TEXT | ✓ | Description needed | Standard field usage |
| `notifications_sent` | JSONB | - | Description needed | Standard field usage |
| `acknowledged` | BOOLEAN | - | Description needed | Standard field usage |
| `acknowledged_by` | INTEGER | - | Description needed | Standard field usage |
| `acknowledged_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `acknowledgment_notes` | TEXT | - | Description needed | Standard field usage |
| `resolved` | BOOLEAN | - | Description needed | Standard field usage |
| `resolved_by` | INTEGER | - | Description needed | Standard field usage |
| `resolved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `resolution_notes` | TEXT | - | Description needed | Standard field usage |
| `alert_status` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `alert_id` → `analytics.alert_definitions.alert_id`
- `acknowledged_by` → `master.org_users.user_id`
- `resolved_by` → `master.org_users.user_id`

---
