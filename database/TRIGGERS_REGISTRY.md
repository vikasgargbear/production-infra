# Database Triggers Registry

> Single source of truth for all database triggers in the system.

## Quick Reference

| Category | Count | File Location |
|----------|-------|---------------|
| Financial | 7 | `04-triggers/01_financial_triggers.sql` |
| Inventory | 7 | `04-triggers/02_inventory_triggers.sql` |
| Sales | 6 | `04-triggers/03_sales_triggers.sql` |
| Procurement | 6 | `04-triggers/04_procurement_triggers.sql` |
| Credit Management | 5 | `04-triggers/05_credit_triggers.sql` |
| GST | 8 | `04-triggers/06_gst_triggers.sql` |
| Compliance | 7 | `04-triggers/07_compliance_triggers.sql` |
| Analytics | 7 | `04-triggers/08_analytics_triggers.sql` |
| System | 7 | `04-triggers/09_system_triggers.sql` |
| Pricing | 7 | `04-triggers/10_pricing_triggers.sql` |
| Core Operations | 9 | `04-triggers/11_core_operations_triggers.sql` |
| Quality Validation | 3 | `04-triggers/12_quality_validation_triggers.sql` |
| **Migration Triggers** | 2 | See below |

---

## Migration Triggers (Not in 04-triggers/)

These are triggers added via migrations for specific fixes:

### trg_auto_create_org_user
- **Table:** `master.employees`
- **Event:** BEFORE INSERT
- **Purpose:** Auto-creates `org_user` record when employee is added without `user_id`
- **File:** `migrations/link_employees_to_org_users.sql`
- **Added:** 2026-01-11

---

## How to View Active Triggers

```sql
-- List all triggers in your database
SELECT 
    trigger_schema,
    trigger_name,
    event_object_table,
    event_manipulation,
    action_timing
FROM information_schema.triggers
WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY trigger_schema, event_object_table;
```

## Deployment Order

1. Financial triggers (foundation for transactions)
2. Inventory triggers (stock management)
3. Sales triggers (order processing)
4. Procurement triggers (purchase management)
5. Credit triggers (credit control)
6. GST triggers (tax compliance)
7. Compliance triggers (regulatory)
8. Analytics triggers (reporting)
9. System triggers (administration)
10. Core Operations triggers
11. Quality Validation triggers
12. Migration triggers (as needed)

## Maintenance

- Review trigger performance monthly
- Monitor execution times via `pg_stat_user_functions`
- Check for conflicts between triggers
- Test triggers after schema changes
- Update this registry when adding new triggers
