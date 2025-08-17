# System Configuration Schema Documentation

## Overview
The `system_config` schema manages system-wide settings, notifications, workflows, audit logs, and operational configurations. This provides the infrastructure for system administration and monitoring.

---

## Tables

### 1. system_settings

### system_settings
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_system_settings()`, `api.create_system_setting()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `setting_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `setting_category` | TEXT | ✓ | Description needed | Standard field usage |
| `setting_key` | TEXT | ✓ | Description needed | Standard field usage |
| `setting_name` | TEXT | ✓ | Description needed | Standard field usage |
| `setting_value` | TEXT | - | Description needed | Standard field usage |
| `setting_type` | TEXT | ✓ | Description needed | Standard field usage |
| `default_value` | TEXT | - | Description needed | Standard field usage |
| `validation_rules` | JSONB | - | Description needed | Standard field usage |
| `description` | TEXT | - | Description needed | Standard field usage |
| `help_text` | TEXT | - | Description needed | Standard field usage |
| `setting_scope` | TEXT | ✓ | Description needed | Standard field usage |
| `branch_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `user_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `ui_component` | TEXT | - | Description needed | Standard field usage |
| `display_order` | INTEGER | - | Description needed | Standard field usage |
| `group_name` | TEXT | - | Description needed | Standard field usage |
| `is_sensitive` | BOOLEAN | - | Description needed | Standard field usage |
| `requires_restart` | BOOLEAN | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `is_editable` | BOOLEAN | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_by` | INTEGER | - | Update audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `branch_id` → `master.org_branches.branch_id`
- `user_id` → `master.org_users.user_id`
- `updated_by` → `master.org_users.user_id`

---

### 2. audit_logs

### audit_logs
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_audit_logs()`, `api.create_audit_log()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `audit_id` | BIGSERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `activity_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `activity_type` | TEXT | ✓ | Description needed | Standard field usage |
| `entity_type` | TEXT | ✓ | Description needed | Standard field usage |
| `entity_id` | TEXT | - | Reference to related entity | Association/lookup |
| `entity_name` | TEXT | - | Description needed | Standard field usage |
| `action_performed` | TEXT | ✓ | Description needed | Standard field usage |
| `old_values` | JSONB | - | Description needed | Standard field usage |
| `new_values` | JSONB | - | Description needed | Standard field usage |
| `changed_fields` | TEXT[] | - | Description needed | Standard field usage |
| `user_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `user_name` | TEXT | ✓ | Description needed | Standard field usage |
| `session_id` | TEXT | - | Reference to related entity | Association/lookup |
| `ip_address` | INET | - | Description needed | Standard field usage |
| `user_agent` | TEXT | - | Description needed | Standard field usage |
| `request_method` | TEXT | - | Description needed | Standard field usage |
| `request_url` | TEXT | - | Description needed | Standard field usage |
| `module_name` | TEXT | - | Description needed | Standard field usage |
| `function_name` | TEXT | - | Description needed | Standard field usage |
| `result_status` | TEXT | - | Description needed | Standard field usage |
| `error_message` | TEXT | - | Description needed | Standard field usage |
| `execution_time_ms` | INTEGER | - | Description needed | Standard field usage |
| `previous_audit_hash` | TEXT | - | Description needed | Standard field usage |
| `current_audit_hash` | TEXT | - | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `user_id` → `master.org_users.user_id`

---

### 3. system_notifications

### system_notifications
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_system_notifications()`, `api.create_system_notification()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `notification_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `notification_type` | TEXT | ✓ | Description needed | Standard field usage |
| `notification_category` | TEXT | ✓ | Description needed | Standard field usage |
| `title` | TEXT | ✓ | Description needed | Standard field usage |
| `message` | TEXT | ✓ | Description needed | Standard field usage |
| `priority` | TEXT | - | Description needed | Standard field usage |
| `requires_acknowledgment` | BOOLEAN | - | Description needed | Standard field usage |
| `target_audience` | TEXT | ✓ | Description needed | Standard field usage |
| `target_users` | INTEGER[] | - | Description needed | Standard field usage |
| `target_roles` | TEXT[] | - | Description needed | Standard field usage |
| `target_branches` | INTEGER[] | - | Description needed | Standard field usage |
| `notification_data` | JSONB | - | Description needed | Standard field usage |
| `action_url` | TEXT | - | Description needed | Standard field usage |
| `valid_from` | TIMESTAMP | - | Description needed | Standard field usage |
| `valid_until` | TIMESTAMP | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 4. user_notifications

### user_notifications
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_user_notifications()`, `api.create_user_notification()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `user_notification_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `notification_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `user_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `is_read` | BOOLEAN | - | Description needed | Standard field usage |
| `read_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `is_acknowledged` | BOOLEAN | - | Description needed | Standard field usage |
| `acknowledged_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `is_dismissed` | BOOLEAN | - | Description needed | Standard field usage |
| `dismissed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `delivered_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `delivery_channel` | TEXT | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `notification_id` → `system_config.system_notifications.notification_id`
- `user_id` → `master.org_users.user_id`

---

### 5. scheduled_jobs

### scheduled_jobs
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_scheduled_jobs()`, `api.create_scheduled_job()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `job_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `job_name` | TEXT | ✓ | Description needed | Standard field usage |
| `job_type` | TEXT | ✓ | Description needed | Standard field usage |
| `job_category` | TEXT | ✓ | Description needed | Standard field usage |
| `schedule_type` | TEXT | ✓ | Description needed | Standard field usage |
| `cron_expression` | TEXT | - | Description needed | Standard field usage |
| `next_run_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `job_function` | TEXT | ✓ | Description needed | Standard field usage |
| `job_parameters` | JSONB | - | Description needed | Standard field usage |
| `max_retries` | INTEGER | - | Description needed | Standard field usage |
| `retry_interval_minutes` | INTEGER | - | Description needed | Standard field usage |
| `timeout_minutes` | INTEGER | - | Description needed | Standard field usage |
| `priority` | INTEGER | - | Description needed | Standard field usage |
| `job_status` | TEXT | - | Description needed | Standard field usage |
| `last_run_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `last_run_status` | TEXT | - | Description needed | Standard field usage |
| `last_run_duration_seconds` | INTEGER | - | Description needed | Standard field usage |
| `last_error_message` | TEXT | - | Description needed | Standard field usage |
| `total_runs` | INTEGER | - | Description needed | Standard field usage |
| `successful_runs` | INTEGER | - | Description needed | Standard field usage |
| `failed_runs` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 6. job_execution_history

### job_execution_history
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_job_execution_history()`, `api.create_job_execution_history()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `execution_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `job_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `start_time` | TIMESTAMP | ✓ | Description needed | Standard field usage |
| `end_time` | TIMESTAMP | - | Description needed | Standard field usage |
| `duration_seconds` | INTEGER | - | Description needed | Standard field usage |
| `execution_status` | TEXT | ✓ | Description needed | Standard field usage |
| `records_processed` | INTEGER | - | Description needed | Standard field usage |
| `records_succeeded` | INTEGER | - | Description needed | Standard field usage |
| `records_failed` | INTEGER | - | Description needed | Standard field usage |
| `output_log` | TEXT | - | Description needed | Standard field usage |
| `error_log` | TEXT | - | Description needed | Standard field usage |
| `cpu_usage_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `memory_usage_mb` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `job_id` → `system_config.scheduled_jobs.job_id`

---

### 7. system_integrations

### system_integrations
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_system_integrations()`, `api.create_system_integration()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `integration_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `integration_name` | TEXT | ✓ | Description needed | Standard field usage |
| `integration_type` | TEXT | ✓ | Description needed | Standard field usage |
| `provider_name` | TEXT | - | Description needed | Standard field usage |
| `base_url` | TEXT | - | Description needed | Standard field usage |
| `auth_type` | TEXT | - | Description needed | Standard field usage |
| `auth_config` | JSONB | - | Description needed | Standard field usage |
| `connection_config` | JSONB | - | Description needed | Standard field usage |
| `endpoints` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `last_test_date` | TIMESTAMP | - | Description needed | Standard field usage |
| `last_test_status` | TEXT | - | Description needed | Standard field usage |
| `health_check_url` | TEXT | - | Description needed | Standard field usage |
| `health_check_interval_minutes` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 8. integration_logs

### integration_logs
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_integration_logs()`, `api.create_integration_log()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `log_id` | BIGSERIAL | ✓ | Primary key identifier | Primary key |
| `integration_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `request_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `endpoint_name` | TEXT | - | Description needed | Standard field usage |
| `request_method` | TEXT | - | Description needed | Standard field usage |
| `request_url` | TEXT | - | Description needed | Standard field usage |
| `request_headers` | JSONB | - | Description needed | Standard field usage |
| `request_body` | JSONB | - | Description needed | Standard field usage |
| `response_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `response_status_code` | INTEGER | - | Description needed | Standard field usage |
| `response_headers` | JSONB | - | Description needed | Standard field usage |
| `response_body` | JSONB | - | Description needed | Standard field usage |
| `response_time_ms` | INTEGER | - | Description needed | Standard field usage |
| `status` | TEXT | ✓ | Description needed | Standard field usage |
| `error_message` | TEXT | - | Description needed | Standard field usage |
| `reference_type` | TEXT | - | Description needed | Standard field usage |
| `reference_id` | TEXT | - | Reference to related entity | Association/lookup |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `integration_id` → `system_config.system_integrations.integration_id`

---

### 9. email_templates

### email_templates
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_email_templates()`, `api.create_email_template()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `template_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `template_code` | TEXT | ✓ | Description needed | Standard field usage |
| `template_name` | TEXT | ✓ | Description needed | Standard field usage |
| `template_category` | TEXT | ✓ | Description needed | Standard field usage |
| `subject_template` | TEXT | ✓ | Description needed | Standard field usage |
| `body_template_html` | TEXT | ✓ | Description needed | Standard field usage |
| `body_template_text` | TEXT | - | Description needed | Standard field usage |
| `available_variables` | JSONB | - | Description needed | Standard field usage |
| `from_name` | TEXT | - | Description needed | Standard field usage |
| `from_email` | TEXT | - | Description needed | Standard field usage |
| `reply_to_email` | TEXT | - | Description needed | Standard field usage |
| `default_attachments` | JSONB | - | Description needed | Standard field usage |
| `language` | TEXT | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 10. scheduled_notifications

### scheduled_notifications
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_scheduled_notifications()`, `api.create_scheduled_notification()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `scheduled_notification_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `scheduled_for` | TIMESTAMP | ✓ | Description needed | Standard field usage |
| `notification_type` | TEXT | ✓ | Description needed | Standard field usage |
| `notification_category` | TEXT | ✓ | Description needed | Standard field usage |
| `title` | TEXT | ✓ | Description needed | Standard field usage |
| `message` | TEXT | ✓ | Description needed | Standard field usage |
| `priority` | TEXT | - | Description needed | Standard field usage |
| `target_users` | INTEGER[] | - | Description needed | Standard field usage |
| `target_roles` | TEXT[] | - | Description needed | Standard field usage |
| `notification_data` | JSONB | - | Description needed | Standard field usage |
| `status` | TEXT | - | Description needed | Standard field usage |
| `sent_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 11. system_health_metrics

### system_health_metrics
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_system_health_metrics()`, `api.create_system_health_metric()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `metric_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `metric_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `cpu_usage_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `memory_usage_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `disk_usage_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `active_connections` | INTEGER | - | Description needed | Standard field usage |
| `total_connections` | INTEGER | - | Description needed | Standard field usage |
| `slow_queries_count` | INTEGER | - | Description needed | Standard field usage |
| `deadlock_count` | INTEGER | - | Description needed | Standard field usage |
| `active_users` | INTEGER | - | Description needed | Standard field usage |
| `requests_per_minute` | INTEGER | - | Description needed | Standard field usage |
| `average_response_time_ms` | INTEGER | - | Description needed | Standard field usage |
| `error_rate_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `pending_jobs` | INTEGER | - | Description needed | Standard field usage |
| `failed_jobs` | INTEGER | - | Description needed | Standard field usage |
| `cache_hit_rate_percent` | NUMERIC(5 | - | Description needed | Standard field usage |
| `cache_size_mb` | INTEGER | - | Description needed | Standard field usage |
| `overall_health_status` | TEXT | - | Description needed | Standard field usage |
| `alerts_triggered` | INTEGER | - | Description needed | Standard field usage |

---

### 12. feature_flags

### feature_flags
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_feature_flags()`, `api.create_feature_flag()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `flag_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `flag_key` | TEXT | ✓ | Description needed | Standard field usage |
| `flag_name` | TEXT | ✓ | Description needed | Standard field usage |
| `description` | TEXT | - | Description needed | Standard field usage |
| `flag_type` | TEXT | ✓ | Description needed | Standard field usage |
| `default_value` | TEXT | ✓ | Description needed | Standard field usage |
| `targeting_rules` | JSONB | - | Description needed | Standard field usage |
| `rollout_percentage` | INTEGER | - | Description needed | Standard field usage |
| `rollout_strategy` | TEXT | - | Description needed | Standard field usage |
| `variants` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `expires_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | - | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 13. error_logs

### error_logs
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_error_logs()`, `api.create_error_log()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `error_id` | BIGSERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `error_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `error_level` | TEXT | ✓ | Description needed | Standard field usage |
| `error_code` | TEXT | - | Description needed | Standard field usage |
| `error_message` | TEXT | ✓ | Description needed | Standard field usage |
| `module_name` | TEXT | - | Description needed | Standard field usage |
| `function_name` | TEXT | - | Description needed | Standard field usage |
| `line_number` | INTEGER | - | Description needed | Standard field usage |
| `stack_trace` | TEXT | - | Description needed | Standard field usage |
| `user_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `session_id` | TEXT | - | Reference to related entity | Association/lookup |
| `request_id` | TEXT | - | Reference to related entity | Association/lookup |
| `request_url` | TEXT | - | Description needed | Standard field usage |
| `request_method` | TEXT | - | Description needed | Standard field usage |
| `request_params` | JSONB | - | Description needed | Standard field usage |
| `environment` | TEXT | - | Description needed | Standard field usage |
| `server_name` | TEXT | - | Description needed | Standard field usage |
| `error_data` | JSONB | - | Description needed | Standard field usage |
| `is_resolved` | BOOLEAN | - | Description needed | Standard field usage |
| `resolved_by` | INTEGER | - | Description needed | Standard field usage |
| `resolved_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `resolution_notes` | TEXT | - | Description needed | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `user_id` → `master.org_users.user_id`
- `resolved_by` → `master.org_users.user_id`

---

### 14. workflow_definitions

### workflow_definitions
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_workflow_definitions()`, `api.create_workflow_definition()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `workflow_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `workflow_code` | TEXT | ✓ | Description needed | Standard field usage |
| `workflow_name` | TEXT | ✓ | Description needed | Standard field usage |
| `workflow_type` | TEXT | ✓ | Description needed | Standard field usage |
| `steps` | JSONB | - | Description needed | Standard field usage |
| `conditions` | JSONB | - | Description needed | Standard field usage |
| `escalation_rules` | JSONB | - | Description needed | Standard field usage |
| `is_active` | BOOLEAN | - | Active status flag | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`

---

### 15. workflow_instances

### workflow_instances
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_workflow_instances()`, `api.create_workflow_instance()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `instance_id` | SERIAL | ✓ | Primary key identifier | Primary key |
| `workflow_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `instance_code` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_type` | TEXT | ✓ | Description needed | Standard field usage |
| `reference_id` | INTEGER | ✓ | Reference to related entity | Association/lookup |
| `current_step` | INTEGER | - | Description needed | Standard field usage |
| `instance_status` | TEXT | - | Description needed | Standard field usage |
| `approval_history` | JSONB | - | Description needed | Standard field usage |
| `initiated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `completed_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `sla_deadline` | TIMESTAMP | - | Description needed | Standard field usage |
| `is_escalated` | BOOLEAN | - | Description needed | Standard field usage |
| `escalation_level` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `updated_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `created_by` | INTEGER | ✓ | Creation audit field | Standard field usage |

**Foreign Key Relationships**:
- `workflow_id` → `system_config.workflow_definitions.workflow_id`
- `org_id` → `master.organizations.org_id`
- `created_by` → `master.org_users.user_id`

---

### 16. api_usage_log

### api_usage_log
**Purpose**: [Business purpose description]
**API Endpoint**: `api.get_api_usage_log()`, `api.create_api_usage_log()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `log_id` | BIGSERIAL | - | Reference to related entity | Association/lookup |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `endpoint` | TEXT | ✓ | Description needed | Standard field usage |
| `method` | TEXT | ✓ | Description needed | Standard field usage |
| `user_id` | INTEGER | - | Reference to related entity | Association/lookup |
| `ip_address` | INET | - | Description needed | Standard field usage |
| `user_agent` | TEXT | - | Description needed | Standard field usage |
| `request_timestamp` | TIMESTAMP | - | Description needed | Standard field usage |
| `response_time_ms` | INTEGER | - | Description needed | Standard field usage |
| `status_code` | INTEGER | - | Description needed | Standard field usage |
| `request_size_bytes` | INTEGER | - | Description needed | Standard field usage |
| `response_size_bytes` | INTEGER | - | Description needed | Standard field usage |
| `error_occurred` | BOOLEAN | - | Description needed | Standard field usage |
| `error_message` | TEXT | - | Description needed | Standard field usage |
| `rate_limit_remaining` | INTEGER | - | Description needed | Standard field usage |
| `created_at` | TIMESTAMP | - | Timestamp field | Standard field usage |
| `PRIMARY` | KEY | ✓ | Primary key identifier | Primary key |

**Foreign Key Relationships**:
- `org_id` → `master.organizations.org_id`
- `user_id` → `master.org_users.user_id`

---
