#!/bin/bash

# Quick fix for invoice creation
# Replace the DATABASE_URL below with your actual Supabase connection string

DATABASE_URL="postgresql://postgres:I5ejcC77brqe4EPY@db.jfrairkkzxwkhbtqejnz.supabase.co:5432/postgres"

# Don't edit below this line
echo "🔧 Running invoice fix..."

python3 -c "
import psycopg2
import os

DATABASE_URL = '$DATABASE_URL'

if '[YOUR-PASSWORD]' in DATABASE_URL:
    print('❌ Please edit quick_fix.sh and add your actual DATABASE_URL')
    exit(1)

try:
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    print('✅ Connected to database')
    
    # Read SQL file
    with open('../database/fix_invoice_triggers.sql', 'r') as f:
        sql = f.read()
    
    # Execute
    cur.execute(sql)
    conn.commit()
    
    print('✅ Invoice fixes applied successfully!')
    print('🎉 You can now create invoices without errors!')
    
except Exception as e:
    print(f'❌ Error: {str(e)[:200]}')
"