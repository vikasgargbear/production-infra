# Supabase Deployment Guide - Enterprise Pharma ERP

## 🚀 Quick Start Deployment

### Step 1: Create New Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in:
   - **Project name**: `pharma-erp` (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your location
   - **Plan**: Free tier works for testing, Pro for production

### Step 2: Get Your Credentials

Once project is created, go to **Settings → API**:

Save these values:
```
Project URL: https://[YOUR-PROJECT-REF].supabase.co
Anon Key: eyJ....... (public key)
Service Role Key: eyJ....... (keep secret!)
```

### Step 3: Deploy Database Schema

Go to **SQL Editor** in Supabase Dashboard and run these scripts in order:

#### 3.1 Enable Extensions
```sql
-- Run this first
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
```

#### 3.2 Create Schemas and Tables
Copy and run each file's content in this exact order:

1. **API Schema Setup**
```sql
CREATE SCHEMA IF NOT EXISTS api;
GRANT USAGE ON SCHEMA api TO anon, authenticated;
```

2. **All 10 Schemas** - Run each schema file from `/01-schemas/`:
   - 01_master_schema.sql
   - 02_inventory_schema.sql
   - 03_parties_schema.sql
   - 04_sales_schema.sql
   - 05_procurement_schema.sql
   - 06_financial_schema.sql
   - 07_gst_schema.sql
   - 08_compliance_schema.sql
   - 09_analytics_schema.sql
   - 10_system_config_schema.sql

3. **Views** - Run from `/02-views/`:
   - 01_api_compatibility_views.sql

4. **Functions** - Run from `/03-functions/`:
   - 01_api_compatibility_functions.sql

5. **Triggers** - Run all trigger files from `/04-triggers/`:
   - 01_validation_triggers.sql through 11_system_triggers.sql

6. **Business Functions** - Run from `/05-functions/`:
   - All 8 function files

7. **Indexes** - Run from `/06-indexes/`:
   - 01_performance_indexes.sql

8. **Initial Data** - Run from `/07-initial-data/`:
   - 01_master_data.sql
   - 02_sample_products.sql

9. **APIs** - Run all API files from `/08-api/`:
   - All 8 API files

### Step 4: Configure RLS Policies

Run this to enable Row Level Security:

```sql
-- Enable RLS on all main tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname IN ('master', 'inventory', 'parties', 'sales', 'procurement', 'financial', 'gst', 'compliance', 'analytics', 'system_config')
        AND tablename NOT LIKE '%_log'
    LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Create basic RLS policies
CREATE POLICY "Enable read for authenticated users" ON master.organizations
    FOR SELECT USING (true);

CREATE POLICY "Enable all for service role" ON master.organizations
    FOR ALL USING (auth.role() = 'service_role');
```

### Step 5: Configure Authentication

1. Go to **Authentication → Settings**
2. Configure:
   - Enable Email auth
   - Set JWT expiry to 24 hours
   - Configure email templates

### Step 6: Update Organization Details

```sql
-- Update with your company details
UPDATE master.organizations 
SET 
  company_name = 'Your Pharmacy Name',
  legal_name = 'Your Legal Entity Name Pvt Ltd',
  gstin = '27AABCD1234E1ZX',  -- Your actual GSTIN
  pan_number = 'AABCD1234E',   -- Your PAN
  drug_license_number = 'MH-12345-2024',  -- Your license
  registered_address = jsonb_build_object(
    'address_line1', '123 Your Street',
    'address_line2', 'Your Area',
    'city', 'Mumbai',
    'state', 'Maharashtra',
    'country', 'India',
    'pincode', '400001'
  )
WHERE org_id = 1;

-- Create your admin user
UPDATE system_config.users
SET 
  username = 'admin',
  email = 'admin@yourpharmacy.com',
  full_name = 'Administrator',
  password_hash = encode(digest('YourSecurePassword123!', 'sha256'), 'hex')
WHERE user_id = 1;
```

### Step 7: Test the Installation

Run these tests in SQL Editor:

```sql
-- Test authentication
SELECT * FROM api.authenticate_user('admin', 'YourSecurePassword123!');

-- Test product search
SELECT * FROM api.search_products(p_search_term := 'Para', p_limit := 5);

-- Test system health
SELECT * FROM api.system_health_check();

-- Run full test suite
SELECT * FROM testing.run_all_tests();
```

## 🔧 Frontend Integration

### Install Supabase Client
```bash
npm install @supabase/supabase-js
```

### Initialize Client
```javascript
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://[YOUR-PROJECT-REF].supabase.co'
const supabaseAnonKey = 'your-anon-key-here'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### Example API Calls
```javascript
// Login
const { data: auth } = await supabase.rpc('authenticate_user', {
  p_username: 'admin',
  p_password: 'password'
})

// Get Products
const { data: products } = await supabase.rpc('search_products', {
  p_search_term: 'Amox',
  p_limit: 10
})

// Create Invoice
const { data: invoice } = await supabase.rpc('create_invoice', {
  p_invoice_data: {
    org_id: 1,
    branch_id: 1,
    customer_id: 1,
    invoice_date: new Date().toISOString().split('T')[0],
    items: [{
      product_id: 1001,
      quantity: 100,
      base_unit_price: 8.50,
      tax_percentage: 12
    }]
  }
})
```

## 🔒 Security Checklist

- [ ] Change default admin password
- [ ] Update organization details
- [ ] Configure email authentication
- [ ] Set up proper RLS policies
- [ ] Enable 2FA for admin accounts
- [ ] Configure backup schedule
- [ ] Set up monitoring alerts

## 🚨 Common Issues

### "Permission denied" errors
- Check RLS policies
- Ensure user is authenticated
- Verify role permissions

### "Function does not exist" errors
- Make sure all API functions are created in order
- Check that api schema exists
- Verify function permissions

### Performance issues
- Run `ANALYZE;` on all tables
- Check Supabase dashboard for slow queries
- Ensure indexes are created

## 📞 Need Help?

1. Check test results: `SELECT * FROM testing.generate_test_report();`
2. View recent errors: `SELECT * FROM system_config.error_log ORDER BY created_at DESC LIMIT 20;`
3. Check Supabase logs in Dashboard → Logs
4. Review API documentation in `/08-api/API_DOCUMENTATION.md`

## 🎉 Success!

Once all tests pass, your enterprise pharma ERP backend is ready! Start building your frontend application using the comprehensive API.

Remember to:
- Take a backup after initial setup
- Document any customizations
- Monitor usage and performance
- Keep Supabase SDK updated