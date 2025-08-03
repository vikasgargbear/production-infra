# Database Setup - Production

## Required SQL Scripts

Run these scripts in your Supabase SQL Editor:

### 1. Organization Setup
**File:** `setup_organization.sql`
- Creates the default organization (AASO Pharma)
- Required for all operations
- Run this first

### 2. Invoice Module Fix
**File:** `fix_invoice_triggers.sql`
- Fixes invoice creation issues
- Creates required tables for triggers:
  - `analytics.dashboard_cache` - For sales metrics
  - `financial.customer_outstanding` - For payment tracking
- Run this to enable invoice functionality

## Environment Configuration

Ensure your backend `.env` file contains:
```
DEFAULT_ORG_ID=ad808530-1ddb-4377-ab20-67bef145d80d
```

## Schema Documentation

See `COMPLETE_SCHEMA_DOCUMENTATION.md` for full database structure.

## Production Notes

- No demo/seed data included
- All temporary files removed
- Clean production setup only