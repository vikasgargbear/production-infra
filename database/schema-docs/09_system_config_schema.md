# System Configuration Schema Documentation

**Schema:** `system_config`
**Purpose:** System administration, workflows, audit logs
**Last Updated:** 2025-10-16
**Tables:** 22

---

## Overview

The `system_config` schema manages system-wide configuration, notifications, workflows, audit logs, user activity tracking, data import/export, scheduled jobs, API logs, and operational monitoring. Infrastructure layer for system administration.

---

## Table Categories

### Configuration Management (5 tables)
System settings, feature flags, email templates, SMS templates, notification preferences

### Workflow Engine (4 tables)
Workflow definitions, workflow instances, workflow steps, approval routing

### Audit & Logging (4 tables)
Audit trail, user activity logs, API request logs, error logs

### Notifications (3 tables)
Notification queue, notification history, notification templates

### Data Operations (3 tables)
Data import jobs, data export jobs, batch processing status

### Scheduled Tasks (2 tables)
Cron job definitions, job execution history

### Miscellaneous (1 table)
System health monitoring

---

## Key Features

- **Dynamic Configuration**: Runtime feature flag management without deployment
- **Workflow Automation**: Multi-step approval workflows with conditional routing
- **Comprehensive Audit**: All database changes tracked with before/after values
- **Notification System**: Multi-channel (email/SMS/push/in-app) notification delivery
- **Background Jobs**: Scheduled task execution with retry logic
- **API Monitoring**: Request/response logging for debugging and analytics
- **Data Import/Export**: Bulk data operations with validation and error handling

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [01_master_schema.md](./01_master_schema.md) - User management

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 22
**Key Features:** Workflow Engine, Audit Trail, Notification System, Background Jobs, Configuration Management
