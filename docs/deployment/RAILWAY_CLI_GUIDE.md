# Railway CLI Setup & Usage Guide

## One-Time Setup (Do this once)

### 1. Install Railway CLI
```bash
# On macOS
brew install railway

# Or using npm
npm install -g @railway/cli
```

### 2. Login to Railway
```bash
railway login
# This opens browser - login with your Railway account
```

### 3. Link to Your Project
```bash
cd /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra
railway link
# Select your project from the list
```

### 4. Verify Connection
```bash
railway status
# Should show your project details
```

## Quick Database Commands

### Check Database Connection
```bash
# Get database URL
railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))"

# Test connection
railway run psql '$DATABASE_URL' -c "SELECT current_database();"
```

### Run SQL Files
```bash
# Run any SQL file
railway run psql '$DATABASE_URL' -f database/MASTER_DATABASE_FIXES.sql

# Run specific section (example: Section 25)
railway run psql '$DATABASE_URL' -f database/MASTER_DATABASE_FIXES.sql
```

### Quick SQL Queries
```bash
# Check customer outstanding
railway run psql '$DATABASE_URL' -c "SELECT * FROM financial.customer_outstanding WHERE document_id = 289;"

# Count records
railway run psql '$DATABASE_URL' -c "SELECT COUNT(*) FROM sales.invoices;"

# Check triggers
railway run psql '$DATABASE_URL' -c "SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'sales';"
```

## Helper Scripts (Already Created)

### 1. Apply Customer Outstanding Triggers
```bash
./quick_apply_triggers.sh
```

### 2. Verify Outstanding is Working
```bash
./verify_outstanding_working.sh
```

## Common Tasks

### Deploy Backend Changes
```bash
# Backend auto-deploys on push, but to check status:
railway logs

# Check deployment
railway status

# View environment variables
railway variables
```

### Run Database Migrations
```bash
# Apply all fixes
railway run psql '$DATABASE_URL' -f database/MASTER_DATABASE_FIXES.sql

# Check what's applied
railway run psql '$DATABASE_URL' -c "\df financial.*" # List functions
railway run psql '$DATABASE_URL' -c "\dt financial.*" # List tables
```

### Debug Issues
```bash
# View backend logs
railway logs --tail 100

# Check if backend is running
curl https://pharma-backend-production-0c09.up.railway.app/api/

# Database query with output formatting
railway run psql '$DATABASE_URL' -x -c "SELECT * FROM sales.invoices WHERE invoice_id = 289;"
```

## Environment Variables

### View All Variables
```bash
railway variables
```

### Set a Variable
```bash
railway variables set KEY=value
```

### Get Specific Variable
```bash
railway variables get DATABASE_URL
```

## Useful SQL Snippets

### Check Invoice to Outstanding Flow
```bash
railway run psql '$DATABASE_URL' << 'EOF'
-- Check if trigger exists
SELECT trigger_name, event_manipulation 
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_create_customer_outstanding';

-- Check recent outstanding records
SELECT document_number, outstanding_amount, status, created_at
FROM financial.customer_outstanding
ORDER BY created_at DESC
LIMIT 5;
EOF
```

### Fix Common Issues
```bash
# If triggers are missing
./quick_apply_triggers.sh

# If data is out of sync
railway run psql '$DATABASE_URL' -c "SELECT financial.populate_existing_invoices_to_outstanding();"
```

## Database Access Pattern

```bash
# Standard pattern for any SQL operation
DB_URL=$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")
psql "$DB_URL" -c "YOUR SQL HERE"
```

## Troubleshooting

### "Unauthorized" Error
```bash
railway login
railway link
```

### "Database does not exist" Error
Make sure to use double quotes for variable expansion:
- ✅ `"$DATABASE_URL"`
- ❌ `'$DATABASE_URL'`

### Check Railway Project ID
```bash
railway status
```

### View Deployment Logs
```bash
railway logs --tail 50
```

## Quick Test Commands

```bash
# Test if everything is connected
railway whoami  # Shows your username
railway status  # Shows project info
railway run echo '$DATABASE_URL' | head -c 20  # Shows start of DB URL

# Test database access
railway run psql '$DATABASE_URL' -c "SELECT version();"
```

## Summary Workflow

1. **Always start with:**
   ```bash
   cd /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra
   railway status  # Verify you're connected
   ```

2. **For database work:**
   ```bash
   railway run psql '$DATABASE_URL' -c "YOUR QUERY"
   ```

3. **For checking logs:**
   ```bash
   railway logs --tail 100
   ```

4. **After code changes:**
   ```bash
   git add . && git commit -m "your message" && git push
   railway logs --tail 50  # Watch deployment
   ```

---

## Quick Copy-Paste Commands

```bash
# Login & Link (one-time)
railway login && railway link

# Check outstanding for invoice
railway run psql '$DATABASE_URL' -c "SELECT * FROM financial.customer_outstanding WHERE document_id = 289;"

# Apply triggers
./quick_apply_triggers.sh

# Verify setup
./verify_outstanding_working.sh

# View logs
railway logs --tail 100
```

---

**Note:** Save this guide and keep it handy. All commands assume you're in the project directory:
`/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra`