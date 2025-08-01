# System Configuration Schema Documentation

## Overview
The `system_config` schema manages system-wide settings, notifications, workflows, audit logs, and operational configurations. This provides the infrastructure for system administration and monitoring.

---

## Tables

### 1. system_settings
**Purpose**: Configurable system settings at various scopes
**API Endpoint**: `api.get_settings()`, `api.update_setting()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `setting_id` | SERIAL | ✓ | Unique setting identifier | Primary key |
| `org_id` | UUID | - | Organization ID (null for global) | Organization filtering |
| `setting_category` | TEXT | ✓ | Category: 'general', 'sales', 'inventory', 'financial', 'compliance' | Setting grouping |
| `setting_key` | TEXT | ✓ | Setting key (e.g., 'invoice.prefix') | Setting identification |
| `setting_name` | TEXT | ✓ | Display name | UI display |
| `setting_value` | TEXT | - | Setting value | Configuration value |
| `setting_type` | TEXT | ✓ | Type: 'string', 'number', 'boolean', 'json', 'date' | Value validation |
| `default_value` | TEXT | - | Default value | Reset functionality |
| `validation_rules` | JSONB | - | Validation rules | Input validation |
| `allowed_values` | TEXT[] | - | Allowed values for dropdown | Selection options |
| `setting_scope` | TEXT | ✓ | Scope: 'global', 'organization', 'branch', 'user' | Scope control |
| `description` | TEXT | - | Setting description | Help text |
| `is_sensitive` | BOOLEAN | - | Sensitive data flag | Security control |
| `is_editable` | BOOLEAN | - | User editable flag | Edit control |
| `requires_restart` | BOOLEAN | - | Requires system restart | Change impact |
| `display_order` | INTEGER | - | UI display order | UI ordering |
| `last_modified_by` | INTEGER | - | User who last modified | Change tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**validation_rules JSONB Structure**:
```json
{
  "type": "number",
  "min": 0,
  "max": 100,
  "required": true,
  "pattern": "^[0-9]+$"
}
```

**Example API Response**:
```json
{
  "setting_id": 1,
  "setting_category": "sales",
  "setting_key": "invoice.auto_email",
  "setting_name": "Auto Email Invoices",
  "setting_value": "true",
  "setting_type": "boolean",
  "default_value": "false",
  "setting_scope": "organization",
  "description": "Automatically email invoices to customers",
  "is_editable": true
}
```

---

### 2. audit_logs
**Purpose**: Comprehensive audit trail for all system activities
**API Endpoint**: `api.get_audit_logs()`, `api.search_audit_logs()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `audit_id` | SERIAL | ✓ | Unique audit log identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `user_id` | INTEGER | - | User who performed action | User tracking |
| `username` | TEXT | - | Username (snapshot) | Display convenience |
| `action_timestamp` | TIMESTAMPTZ | ✓ | Action timestamp | Time tracking |
| `action_type` | TEXT | ✓ | Type: 'create', 'update', 'delete', 'view', 'login', 'export' | Action classification |
| `module_name` | TEXT | ✓ | Module: 'sales', 'inventory', 'financial', etc. | Module tracking |
| `table_name` | TEXT | - | Database table affected | Technical tracking |
| `record_id` | TEXT | - | Primary key of affected record | Record tracking |
| `record_identifier` | TEXT | - | Human-readable identifier | Display reference |
| `action_description` | TEXT | ✓ | Action description | Audit description |
| `changes_made` | JSONB | - | Before/after values for updates | Change tracking |
| `ip_address` | INET | - | Client IP address | Security tracking |
| `user_agent` | TEXT | - | Browser/client user agent | Client tracking |
| `session_id` | TEXT | - | User session ID | Session tracking |
| `request_method` | TEXT | - | HTTP method | Technical tracking |
| `request_url` | TEXT | - | API endpoint | Technical tracking |
| `response_status` | INTEGER | - | HTTP response status | Result tracking |
| `error_message` | TEXT | - | Error message if failed | Error tracking |
| `additional_data` | JSONB | - | Additional context data | Extra information |
| `risk_level` | TEXT | - | Risk: 'low', 'medium', 'high', 'critical' | Risk assessment |

**changes_made JSONB Structure**:
```json
{
  "before": {
    "credit_limit": 50000,
    "payment_terms": "30 days"
  },
  "after": {
    "credit_limit": 75000,
    "payment_terms": "45 days"
  }
}
```

---

### 3. system_notifications
**Purpose**: System-wide notifications and alerts
**API Endpoint**: `api.get_notifications()`, `api.create_notification()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `notification_id` | SERIAL | ✓ | Unique notification identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `notification_type` | TEXT | ✓ | Type: 'info', 'warning', 'error', 'success' | Notification styling |
| `notification_category` | TEXT | ✓ | Category: 'system', 'compliance', 'inventory', 'financial' | Category filtering |
| `priority` | TEXT | - | Priority: 'low', 'normal', 'high', 'urgent' | Priority sorting |
| `title` | TEXT | ✓ | Notification title | Display header |
| `message` | TEXT | ✓ | Notification message | Display content |
| `action_required` | BOOLEAN | - | Action required flag | Action tracking |
| `action_url` | TEXT | - | Link to relevant page | Navigation |
| `target_roles` | TEXT[] | - | Target user roles | Role filtering |
| `target_users` | INTEGER[] | - | Specific target users | User targeting |
| `valid_from` | TIMESTAMPTZ | - | Validity start | Display control |
| `valid_until` | TIMESTAMPTZ | - | Validity end | Display control |
| `requires_acknowledgment` | BOOLEAN | - | Acknowledgment required | Compliance tracking |
| `auto_dismiss_after` | INTEGER | - | Auto-dismiss after seconds | UI behavior |
| `notification_data` | JSONB | - | Additional data | Extra context |
| `created_by` | INTEGER | - | User who created notification | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 4. user_notifications
**Purpose**: User-specific notification delivery and tracking
**API Endpoint**: `api.get_user_notifications()`, `api.mark_notification_read()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `user_notification_id` | SERIAL | ✓ | Unique user notification identifier | Primary key |
| `notification_id` | INTEGER | ✓ | Parent notification reference | Notification linking |
| `user_id` | INTEGER | ✓ | Target user | User association |
| `delivery_channel` | TEXT | - | Channel: 'in_app', 'email', 'sms', 'push' | Delivery tracking |
| `delivered_at` | TIMESTAMPTZ | - | Delivery timestamp | Delivery tracking |
| `is_read` | BOOLEAN | - | Read status | Read tracking |
| `read_at` | TIMESTAMPTZ | - | Read timestamp | Read tracking |
| `is_acknowledged` | BOOLEAN | - | Acknowledgment status | Acknowledgment tracking |
| `acknowledged_at` | TIMESTAMPTZ | - | Acknowledgment timestamp | Acknowledgment tracking |
| `is_dismissed` | BOOLEAN | - | Dismissed status | Dismissal tracking |
| `dismissed_at` | TIMESTAMPTZ | - | Dismissal timestamp | Dismissal tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 5. scheduled_jobs
**Purpose**: Background job scheduling and management
**API Endpoint**: `api.get_scheduled_jobs()`, `api.create_scheduled_job()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `job_id` | SERIAL | ✓ | Unique job identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `job_name` | TEXT | ✓ | Job name | Job identification |
| `job_type` | TEXT | ✓ | Type: 'report', 'backup', 'sync', 'cleanup', 'notification' | Job classification |
| `job_function` | TEXT | ✓ | Function/procedure to execute | Execution reference |
| `job_parameters` | JSONB | - | Job parameters | Configuration |
| `schedule_type` | TEXT | ✓ | Schedule: 'once', 'recurring' | Schedule type |
| `cron_expression` | TEXT | - | Cron expression for recurring | Schedule definition |
| `next_run_time` | TIMESTAMPTZ | - | Next scheduled run | Schedule tracking |
| `last_run_time` | TIMESTAMPTZ | - | Last execution time | History tracking |
| `last_run_status` | TEXT | - | Status: 'success', 'failed', 'timeout' | Result tracking |
| `last_run_duration` | INTERVAL | - | Execution duration | Performance tracking |
| `last_error_message` | TEXT | - | Error message if failed | Error tracking |
| `retry_count` | INTEGER | - | Current retry count | Retry tracking |
| `max_retries` | INTEGER | - | Maximum retry attempts | Retry configuration |
| `timeout_seconds` | INTEGER | - | Job timeout | Timeout control |
| `job_status` | TEXT | ✓ | Status: 'active', 'paused', 'disabled' | Job control |
| `created_by` | INTEGER | - | User who created job | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 6. system_health_metrics
**Purpose**: System performance and health monitoring
**API Endpoint**: `api.get_health_metrics()`, `api.get_system_status()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `metric_id` | SERIAL | ✓ | Unique metric identifier | Primary key |
| `metric_timestamp` | TIMESTAMPTZ | ✓ | Metric timestamp | Time series |
| `metric_type` | TEXT | ✓ | Type: 'performance', 'usage', 'error', 'availability' | Metric classification |
| `metric_name` | TEXT | ✓ | Metric name | Metric identification |
| `metric_value` | NUMERIC | ✓ | Metric value | Measurement |
| `metric_unit` | TEXT | - | Unit of measurement | Display formatting |
| `component` | TEXT | - | System component | Component tracking |
| `server_name` | TEXT | - | Server identifier | Server tracking |
| `database_name` | TEXT | - | Database name | Database tracking |
| `additional_metrics` | JSONB | - | Additional metric data | Extra measurements |
| `threshold_status` | TEXT | - | Status: 'normal', 'warning', 'critical' | Alert status |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

**additional_metrics JSONB Structure**:
```json
{
  "cpu_usage": 45.2,
  "memory_usage": 78.5,
  "disk_usage": 62.0,
  "active_connections": 125,
  "response_time_ms": 245
}
```

---

### 7. feature_flags
**Purpose**: Feature toggle and A/B testing configuration
**API Endpoint**: `api.get_feature_flags()`, `api.toggle_feature()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `flag_id` | SERIAL | ✓ | Unique flag identifier | Primary key |
| `org_id` | UUID | - | Organization ID (null for global) | Organization filtering |
| `flag_key` | TEXT | ✓ | Feature flag key | Flag identification |
| `flag_name` | TEXT | ✓ | Display name | UI display |
| `description` | TEXT | - | Feature description | Documentation |
| `flag_type` | TEXT | ✓ | Type: 'boolean', 'percentage', 'variant' | Flag behavior |
| `is_enabled` | BOOLEAN | - | Enabled status for boolean flags | Toggle control |
| `rollout_percentage` | INTEGER | - | Rollout percentage (0-100) | Gradual rollout |
| `variants` | JSONB | - | A/B test variants | Variant configuration |
| `target_rules` | JSONB | - | Targeting rules | Conditional activation |
| `start_date` | DATE | - | Feature start date | Time control |
| `end_date` | DATE | - | Feature end date | Time control |
| `is_active` | BOOLEAN | - | Flag active status | Master control |
| `created_by` | INTEGER | - | User who created flag | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 8. email_templates
**Purpose**: Email template management
**API Endpoint**: `api.get_email_templates()`, `api.update_email_template()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `template_id` | SERIAL | ✓ | Unique template identifier | Primary key |
| `org_id` | UUID | - | Organization ID | Organization filtering |
| `template_code` | TEXT | ✓ | Template code | Template identification |
| `template_name` | TEXT | ✓ | Template name | Display name |
| `template_type` | TEXT | ✓ | Type: 'invoice', 'order', 'payment', 'reminder', 'notification' | Template classification |
| `subject` | TEXT | ✓ | Email subject with variables | Email header |
| `body_html` | TEXT | ✓ | HTML body template | Email content |
| `body_text` | TEXT | - | Plain text body | Fallback content |
| `available_variables` | TEXT[] | - | Available template variables | Variable reference |
| `attachments` | JSONB | - | Attachment configuration | Attachment rules |
| `is_default` | BOOLEAN | - | Default template flag | Template selection |
| `is_active` | BOOLEAN | - | Template active status | Template filtering |
| `created_by` | INTEGER | - | User who created template | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

### 9. workflow_definitions
**Purpose**: Workflow templates for approval processes
**API Endpoint**: `api.get_workflows()`, `api.create_workflow()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `workflow_id` | SERIAL | ✓ | Unique workflow identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `workflow_code` | TEXT | ✓ | Workflow code | Workflow identification |
| `workflow_name` | TEXT | ✓ | Workflow name | Display name |
| `workflow_type` | TEXT | ✓ | Type: 'purchase_order', 'sales_return', 'credit_note', 'payment' | Workflow classification |
| `description` | TEXT | - | Workflow description | Documentation |
| `trigger_conditions` | JSONB | - | Conditions to trigger workflow | Automation rules |
| `approval_stages` | JSONB | ✓ | Approval stage configuration | Stage definition |
| `escalation_rules` | JSONB | - | Escalation configuration | Timeout handling |
| `is_active` | BOOLEAN | - | Workflow active status | Workflow control |
| `created_by` | INTEGER | - | User who created workflow | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

**approval_stages JSONB Structure**:
```json
[
  {
    "stage": 1,
    "name": "Manager Approval",
    "approvers": ["role:manager", "user:5"],
    "approval_type": "any", // any, all, sequential
    "timeout_hours": 24,
    "conditions": {
      "amount": {"operator": ">", "value": 50000}
    }
  }
]
```

---

### 10. workflow_instances
**Purpose**: Active workflow instances for approvals
**API Endpoint**: `api.get_workflow_instances()`, `api.approve_workflow()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `instance_id` | SERIAL | ✓ | Unique instance identifier | Primary key |
| `workflow_id` | INTEGER | ✓ | Workflow definition reference | Workflow linking |
| `document_type` | TEXT | ✓ | Document type | Document classification |
| `document_id` | INTEGER | ✓ | Document ID | Document reference |
| `document_number` | TEXT | - | Document number | Display reference |
| `initiated_by` | INTEGER | ✓ | User who initiated | User tracking |
| `initiated_at` | TIMESTAMPTZ | ✓ | Initiation timestamp | Time tracking |
| `current_stage` | INTEGER | - | Current approval stage | Progress tracking |
| `workflow_status` | TEXT | ✓ | Status: 'pending', 'approved', 'rejected', 'cancelled' | Status tracking |
| `approval_history` | JSONB | - | Approval action history | History tracking |
| `completed_at` | TIMESTAMPTZ | - | Completion timestamp | Completion tracking |
| `notes` | TEXT | - | Workflow notes | Documentation |

---

### 11. api_keys
**Purpose**: API key management for external integrations
**API Endpoint**: `api.get_api_keys()`, `api.create_api_key()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `key_id` | SERIAL | ✓ | Unique key identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Organization filtering |
| `key_name` | TEXT | ✓ | API key name | Key identification |
| `api_key` | TEXT | ✓ | Encrypted API key | Authentication |
| `key_type` | TEXT | ✓ | Type: 'production', 'sandbox', 'webhook' | Key classification |
| `permissions` | TEXT[] | - | Allowed permissions | Access control |
| `allowed_ips` | INET[] | - | IP whitelist | Security control |
| `rate_limit` | INTEGER | - | Requests per minute | Rate limiting |
| `valid_from` | DATE | - | Validity start | Time control |
| `valid_until` | DATE | - | Validity end | Time control |
| `last_used_at` | TIMESTAMPTZ | - | Last usage timestamp | Usage tracking |
| `usage_count` | INTEGER | - | Total usage count | Usage metrics |
| `is_active` | BOOLEAN | - | Key active status | Key control |
| `created_by` | INTEGER | - | User who created key | User tracking |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trails |

---

### 12. api_usage_log
**Purpose**: API usage tracking for performance and security
**API Endpoint**: `api.get_api_usage()`, `api.get_api_analytics()`

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `usage_id` | SERIAL | ✓ | Unique usage identifier | Primary key |
| `api_key_id` | INTEGER | - | API key reference | Key tracking |
| `user_id` | INTEGER | - | User ID if authenticated | User tracking |
| `endpoint` | TEXT | ✓ | API endpoint called | Endpoint tracking |
| `method` | TEXT | ✓ | HTTP method | Method tracking |
| `request_timestamp` | TIMESTAMPTZ | ✓ | Request timestamp | Time tracking |
| `response_time_ms` | INTEGER | - | Response time in milliseconds | Performance tracking |
| `status_code` | INTEGER | - | HTTP status code | Result tracking |
| `request_size` | INTEGER | - | Request size in bytes | Size tracking |
| `response_size` | INTEGER | - | Response size in bytes | Size tracking |
| `ip_address` | INET | - | Client IP address | Security tracking |
| `user_agent` | TEXT | - | Client user agent | Client tracking |
| `error_message` | TEXT | - | Error message if failed | Error tracking |
| `rate_limit_remaining` | INTEGER | - | Rate limit remaining | Rate limit tracking |

---

## API Integration Notes

### System Settings Management
```javascript
// Get settings by category
GET /api/settings?category=sales&scope=organization

// Update setting
PATCH /api/settings/invoice.auto_email
{
  "setting_value": "true"
}

// Get all settings for UI
GET /api/settings/ui-config
{
  "categories": {
    "sales": {
      "invoice": {
        "auto_email": {
          "value": true,
          "type": "boolean",
          "editable": true
        }
      }
    }
  }
}
```

### Audit Log Search
```javascript
// Search audit logs
POST /api/audit-logs/search
{
  "date_from": "2024-01-01",
  "date_to": "2024-01-31",
  "user_id": 5,
  "module_name": "sales",
  "action_type": "update",
  "risk_level": ["high", "critical"]
}

// Export audit logs
GET /api/audit-logs/export?format=csv&filters=...
```

### Notification Management
```javascript
// Create system notification
POST /api/notifications
{
  "notification_type": "warning",
  "notification_category": "compliance",
  "title": "License Expiry Alert",
  "message": "Drug License MH-123 expires in 30 days",
  "priority": "high",
  "target_roles": ["admin", "compliance_officer"],
  "requires_acknowledgment": true
}

// Get user notifications
GET /api/notifications/user?unread=true&limit=10

// Mark notification read
PATCH /api/notifications/user/123/read
```

### Workflow Management
```javascript
// Initiate workflow
POST /api/workflows/initiate
{
  "workflow_type": "purchase_order",
  "document_id": 123,
  "document_data": {
    "amount": 100000,
    "supplier": "Critical Supplier"
  }
}

// Approve/Reject workflow stage
POST /api/workflows/instance/456/action
{
  "action": "approve",
  "comments": "Approved with conditions",
  "conditions": ["Delivery within 7 days"]
}

// Get pending approvals
GET /api/workflows/pending?user_id=5
```

### Health Monitoring
```javascript
// System health check
GET /api/health
{
  "status": "healthy",
  "components": {
    "database": "healthy",
    "cache": "healthy",
    "queue": "degraded"
  },
  "metrics": {
    "response_time_ms": 45,
    "active_users": 125,
    "cpu_usage": 35.5,
    "memory_usage": 62.0
  }
}

// Performance metrics
GET /api/metrics?
  type=performance&
  period=last_hour&
  interval=5m
```

### Feature Flags
```javascript
// Check feature flag
GET /api/features/new_ui_dashboard
{
  "enabled": true,
  "variant": "version_b",
  "rollout_percentage": 50
}

// Feature flag evaluation for user
POST /api/features/evaluate
{
  "user_id": 123,
  "features": ["new_ui_dashboard", "advanced_reporting"]
}
```

### Scheduled Jobs
```javascript
// Create scheduled report
POST /api/scheduled-jobs
{
  "job_name": "Daily Sales Report",
  "job_type": "report",
  "job_function": "generate_daily_sales_report",
  "schedule_type": "recurring",
  "cron_expression": "0 9 * * *", // 9 AM daily
  "job_parameters": {
    "recipients": ["manager@company.com"],
    "format": "pdf"
  }
}

// Get job execution history
GET /api/scheduled-jobs/123/history?limit=10
```

### API Key Management
```javascript
// Create API key
POST /api/api-keys
{
  "key_name": "Mobile App Integration",
  "key_type": "production",
  "permissions": ["read:products", "read:inventory", "create:orders"],
  "rate_limit": 1000,
  "valid_until": "2025-12-31"
}

// Revoke API key
DELETE /api/api-keys/abc123
```

### Validation Rules
1. **Setting Values**: Must match defined type and validation rules
2. **Cron Expressions**: Must be valid cron syntax
3. **Email Templates**: Must have valid variable placeholders
4. **Workflow Stages**: Must have at least one approver
5. **API Keys**: Must have defined permissions and expiry