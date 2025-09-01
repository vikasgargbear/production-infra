# 🚀 Quick Reference - Railway CLI

## Essential Commands (Copy & Paste)

### First Time Setup
```bash
# 1. Login (do once)
railway login

# 2. Link project (do once in project folder)
cd /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra
railway link
```

### Daily Use Commands

#### 🔍 Check Customer Outstanding
```bash
# Check specific invoice
railway run psql '$DATABASE_URL' -c "SELECT * FROM financial.customer_outstanding WHERE document_id = 289;"

# Check all outstanding
railway run psql '$DATABASE_URL' -c "SELECT document_number, outstanding_amount, status FROM financial.customer_outstanding ORDER BY created_at DESC LIMIT 10;"
```

#### 🔧 Apply Fixes
```bash
# Apply customer outstanding triggers
./quick_apply_triggers.sh

# Verify it's working
./verify_outstanding_working.sh

# Apply ALL database fixes
railway run psql '$DATABASE_URL' -f database/MASTER_DATABASE_FIXES.sql
```

#### 📊 Quick Stats
```bash
# Outstanding summary
railway run psql '$DATABASE_URL' -c "SELECT status, COUNT(*), SUM(outstanding_amount) FROM financial.customer_outstanding GROUP BY status;"

# Check triggers
railway run psql '$DATABASE_URL' -c "SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema IN ('sales', 'financial');"
```

#### 🐛 Debug
```bash
# View logs
railway logs --tail 50

# Check deployment status
railway status

# Test API
curl https://pharma-backend-production-0c09.up.railway.app/api/
```

## 🎯 Specific Tasks

### Create Test Invoice & Check Outstanding
```bash
railway run psql '$DATABASE_URL' << 'EOF'
-- Create test invoice
INSERT INTO sales.invoices (
    org_id, branch_id, invoice_number, invoice_date,
    customer_id, customer_name, final_amount, paid_amount, 
    credit_amount, payment_status, invoice_status, created_by
) VALUES (
    'e78d6777-35f6-4b19-994f-caaede2f021a', 5,
    'TEST-' || EXTRACT(EPOCH FROM NOW())::TEXT, CURRENT_DATE,
    111, 'Test Customer', 1000.00, 400.00, 600.00,
    'partial', 'posted', 7
) RETURNING invoice_id, credit_amount;

-- Check if it appears in outstanding (should be automatic!)
SELECT document_number, outstanding_amount, status 
FROM financial.customer_outstanding 
WHERE document_number LIKE 'TEST-%' 
ORDER BY created_at DESC LIMIT 1;
EOF
```

### Check Payment Allocations
```bash
railway run psql '$DATABASE_URL' -c "
SELECT 
    p.payment_id,
    p.payment_date,
    p.amount as payment_amount,
    pa.allocated_amount,
    pa.reference_type,
    pa.reference_id
FROM financial.payments p
LEFT JOIN financial.payment_allocations pa ON p.payment_id = pa.payment_id
WHERE p.customer_id = 111
ORDER BY p.payment_date DESC
LIMIT 5;"
```

## 🔄 After Code Changes

```bash
# 1. Commit and push
git add . && git commit -m "fix: your message" && git push

# 2. Watch deployment (takes ~1-2 min)
railway logs --tail 20

# 3. Test the change
curl https://pharma-backend-production-0c09.up.railway.app/api/your-endpoint
```

## 📝 SQL Templates

### Find Missing Outstanding Records
```bash
railway run psql '$DATABASE_URL' -c "
SELECT i.invoice_id, i.invoice_number, i.credit_amount
FROM sales.invoices i
LEFT JOIN financial.customer_outstanding co 
    ON co.document_id = i.invoice_id 
    AND co.document_type = 'INVOICE'
WHERE co.outstanding_id IS NULL
AND i.credit_amount > 0;"
```

### Fix Missing Records
```bash
railway run psql '$DATABASE_URL' -c "SELECT financial.populate_existing_invoices_to_outstanding();"
```

## ⚡ Shell Aliases (Add to ~/.zshrc)

```bash
# Railway shortcuts
alias rw='railway'
alias rwdb='railway run psql "$DATABASE_URL"'
alias rwlogs='railway logs --tail 100'
alias rwstatus='railway status'

# Project specific
alias cdpharma='cd /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra'
alias pharmalogs='railway logs --tail 100'
alias pharmadb='railway run psql "$DATABASE_URL"'
```

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Unauthorized" | `railway login` |
| "No project linked" | `railway link` |
| "Database does not exist" | Use double quotes: `"$DATABASE_URL"` not `'$DATABASE_URL'` |
| Backend not responding | Check logs: `railway logs` |
| Trigger not working | Run: `./quick_apply_triggers.sh` |

## 📱 Test from Terminal

```bash
# Test invoice creation via API (when backend is running)
curl -X POST https://pharma-backend-production-0c09.up.railway.app/api/v2/invoices \
  -H "Content-Type: application/json" \
  -H "org-id: e78d6777-35f6-4b19-994f-caaede2f021a" \
  -d '{
    "customer_id": 111,
    "items": [...],
    "final_amount": 1000,
    "paid_amount": 500
  }'
```

---

**Pro Tip:** Keep this file open in a separate terminal tab for quick copy-paste!