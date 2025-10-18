# Database Maintenance Scripts

⚠️ **Admin-only scripts** - Not for production API exposure

## Scripts

### `drop_problematic_triggers.sql`
- **Purpose**: Remove problematic triggers causing database issues
- **Usage**: Run manually via psql or database admin tool
- **Security**: Requires admin database access

### `fix_invoice_trigger.sql`  
- **Purpose**: Fix invoice calculation trigger with correct column names
- **Usage**: Run manually via psql or database admin tool
- **Security**: Requires admin database access

## How to Run

```bash
# Connect to Railway database
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")"

# Run specific script
\i backend/scripts/maintenance/drop_problematic_triggers.sql
\i backend/scripts/maintenance/fix_invoice_trigger.sql
```

## Security Notes

- These scripts were moved from public API endpoints for security
- Only database administrators should run these scripts
- Always backup database before running maintenance scripts
- Test on staging environment first