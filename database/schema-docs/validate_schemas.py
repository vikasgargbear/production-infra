#!/usr/bin/env python3
"""
Comprehensive check of ALL tables across ALL schemas
"""

import os
import re
from collections import defaultdict

def analyze_all_schema_files():
    """Analyze all schema files for potential issues"""
    
    schema_dir = "/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database/schema-docs"
    
    all_issues = defaultdict(list)
    all_tables = defaultdict(list)
    
    # Get all schema files
    schema_files = [
        "01_master_schema.md",
        "01_master_schema_addresses.md",
        "02_parties_schema.md",
        "03_inventory_schema.md",
        "04_sales_schema.md",
        "05_procurement_schema.md",
        "06_financial_schema.md",
        "07_gst_schema.md",
        "08_compliance_schema.md",
        "09_system_config_schema.md",
        "10_analytics_schema.md"
    ]
    
    for schema_file in schema_files:
        file_path = os.path.join(schema_dir, schema_file)
        if not os.path.exists(file_path):
            print(f"⚠️ File not found: {schema_file}")
            continue
            
        print(f"\n📄 Analyzing: {schema_file}")
        print("-" * 60)
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Extract schema name
        schema_name = schema_file.split('_')[1].replace('.md', '')
        if 'master_schema_addresses' in schema_file:
            schema_name = 'master'
        elif '01_master' in schema_file:
            schema_name = 'master'
        elif '02_parties' in schema_file:
            schema_name = 'parties'
        elif '03_inventory' in schema_file:
            schema_name = 'inventory'
        elif '04_sales' in schema_file:
            schema_name = 'sales'
        elif '05_procurement' in schema_file:
            schema_name = 'procurement'
        elif '06_financial' in schema_file:
            schema_name = 'financial'
        elif '07_gst' in schema_file:
            schema_name = 'gst'
        elif '08_compliance' in schema_file:
            schema_name = 'compliance'
        elif '09_system' in schema_file:
            schema_name = 'system_config'
        elif '10_analytics' in schema_file:
            schema_name = 'analytics'
        
        # Find all tables in the file
        table_pattern = r'###\s+(?:\d+\.\s+)?(\w+)\s*\n'
        tables = re.findall(table_pattern, content)
        
        for table in tables:
            if table.lower() not in ['overview', 'purpose', 'api', 'notes', 'example']:
                all_tables[schema_name].append(table)
                print(f"  Found table: {schema_name}.{table}")
                
                # Check for common issues in this table's section
                # Find the table section
                table_section_pattern = rf'###.*{table}.*?\n(.*?)(?=###|\Z)'
                table_match = re.search(table_section_pattern, content, re.DOTALL)
                
                if table_match:
                    table_content = table_match.group(1)
                    
                    # Check for problematic field names
                    issues = []
                    
                    # Check for _percentage suffix (should be _percent)
                    if 'discount_percentage' in table_content:
                        issues.append("Has 'discount_percentage' - should be 'discount_percent'")
                    
                    if 'gst_percentage' in table_content and table != 'products':
                        # GST percentage might be OK for products table
                        if 'items' in table.lower() or 'line' in table.lower():
                            issues.append("Has 'gst_percentage' - should be cgst_rate/sgst_rate/igst_rate")
                    
                    if 'cgst_percentage' in table_content:
                        issues.append("Has 'cgst_percentage' - should be 'cgst_rate'")
                    
                    if 'sgst_percentage' in table_content:
                        issues.append("Has 'sgst_percentage' - should be 'sgst_rate'")
                    
                    if 'igst_percentage' in table_content:
                        issues.append("Has 'igst_percentage' - should be 'igst_rate'")
                    
                    if 'tax_percentage' in table_content:
                        issues.append("Has 'tax_percentage' - should be 'tax_percent' or tax_rate")
                    
                    if 'commission_percentage' in table_content:
                        issues.append("Has 'commission_percentage' - should be 'commission_percent'")
                    
                    if 'margin_percentage' in table_content:
                        issues.append("Has 'margin_percentage' - should be 'margin_percent'")
                    
                    # Check for _per_unit vs other naming
                    if 'selling_price' in table_content and 'batch' in table.lower():
                        if 'sale_price_per_unit' not in table_content:
                            issues.append("Has 'selling_price' - should be 'sale_price_per_unit' for batches")
                    
                    # Check for line_total_with_tax
                    if 'line_total_with_tax' in table_content:
                        issues.append("Has 'line_total_with_tax' - should be 'line_total'")
                    
                    # Check for missing required fields in specific tables
                    if table == 'invoice_items':
                        if 'uom' not in table_content:
                            issues.append("Missing 'uom' field (required)")
                        if 'pack_type' not in table_content:
                            issues.append("Missing 'pack_type' field (required)")
                        if 'taxable_amount' not in table_content:
                            issues.append("Missing 'taxable_amount' field")
                        if 'total_tax_amount' not in table_content:
                            issues.append("Missing 'total_tax_amount' field")
                    
                    if table == 'customers':
                        # Check if phone is marked as required
                        phone_pattern = r'\| `phone` \| TEXT \| - \|'
                        if re.search(phone_pattern, table_content):
                            issues.append("'phone' not marked as required (should be ✓)")
                    
                    if issues:
                        all_issues[f"{schema_name}.{table}"] = issues

    return all_tables, all_issues

def generate_comprehensive_sql():
    """Generate SQL to check all schemas and tables"""
    
    schemas = [
        'master',
        'parties',
        'inventory', 
        'sales',
        'procurement',
        'financial',
        'gst',
        'compliance',
        'system_config',
        'analytics'
    ]
    
    sql_queries = []
    
    # Query to check all schemas
    sql_queries.append("""
-- 1. List all schemas in database:
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY schema_name;
""")
    
    # Query to check all tables in each schema
    for schema in schemas:
        sql_queries.append(f"""
-- Tables in {schema} schema:
SELECT table_name, 
       (SELECT COUNT(*) FROM information_schema.columns c 
        WHERE c.table_schema = t.table_schema 
        AND c.table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = '{schema}'
AND table_type = 'BASE TABLE'
ORDER BY table_name;
""")
    
    # Query to find all problematic column names
    sql_queries.append("""
-- Find all columns with potentially wrong naming:
SELECT 
    table_schema,
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE (
    column_name LIKE '%_percentage'
    OR column_name LIKE '%cgst_percentage%'
    OR column_name LIKE '%sgst_percentage%'
    OR column_name LIKE '%igst_percentage%'
    OR column_name LIKE '%tax_percentage%'
    OR column_name = 'line_total_with_tax'
    OR (column_name = 'selling_price' AND table_name = 'batches')
)
AND table_schema IN ('master', 'parties', 'inventory', 'sales', 
                     'procurement', 'financial', 'gst', 'compliance',
                     'system_config', 'analytics')
ORDER BY table_schema, table_name, column_name;
""")
    
    # Query to find the correct column names
    sql_queries.append("""
-- Find actual column names that are correct:
SELECT 
    table_schema,
    table_name,
    column_name
FROM information_schema.columns  
WHERE (
    column_name LIKE '%_percent'
    OR column_name IN ('cgst_rate', 'sgst_rate', 'igst_rate')
    OR column_name = 'line_total'
    OR column_name IN ('uom', 'pack_type', 'taxable_amount', 'total_tax_amount')
    OR column_name = 'sale_price_per_unit'
)
AND table_schema IN ('master', 'parties', 'inventory', 'sales',
                     'procurement', 'financial', 'gst', 'compliance', 
                     'system_config', 'analytics')
ORDER BY table_schema, table_name, column_name;
""")
    
    return "\n".join(sql_queries)

def create_fix_script():
    """Create SQL script to fix column names if needed"""
    
    fix_script = """-- SQL Script to Fix Column Names (IF NEEDED)
-- ⚠️ WARNING: Only run these if the columns actually have wrong names in your database

-- Fix discount_percentage to discount_percent
/*
ALTER TABLE sales.invoice_items 
RENAME COLUMN discount_percentage TO discount_percent;

ALTER TABLE sales.order_items
RENAME COLUMN discount_percentage TO discount_percent;

ALTER TABLE procurement.purchase_order_items
RENAME COLUMN discount_percentage TO discount_percent;

ALTER TABLE inventory.product_supplier_mapping
RENAME COLUMN discount_percentage TO discount_percent;

ALTER TABLE parties.customer_groups
RENAME COLUMN discount_percentage TO discount_percent;
*/

-- Fix GST percentage columns to rate columns
/*
ALTER TABLE sales.invoice_items
RENAME COLUMN cgst_percentage TO cgst_rate;

ALTER TABLE sales.invoice_items  
RENAME COLUMN sgst_percentage TO sgst_rate;

ALTER TABLE sales.invoice_items
RENAME COLUMN igst_percentage TO igst_rate;
*/

-- Fix line_total_with_tax to line_total
/*
ALTER TABLE sales.invoice_items
RENAME COLUMN line_total_with_tax TO line_total;

ALTER TABLE sales.order_items
RENAME COLUMN line_total_with_tax TO line_total;
*/

-- Add missing required columns (if they don't exist)
/*
ALTER TABLE sales.invoice_items
ADD COLUMN IF NOT EXISTS uom TEXT,
ADD COLUMN IF NOT EXISTS pack_type TEXT,
ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS total_tax_amount NUMERIC(15,2);
*/
"""
    
    return fix_script

def main():
    print("\n" + "=" * 80)
    print("🔍 COMPREHENSIVE SCHEMA CHECK - ALL TABLES ACROSS ALL SCHEMAS")
    print("=" * 80)
    
    # Analyze all schema files
    all_tables, all_issues = analyze_all_schema_files()
    
    # Summary of tables found
    print("\n" + "=" * 80)
    print("📊 SUMMARY OF ALL TABLES")
    print("=" * 80)
    
    total_tables = 0
    for schema, tables in all_tables.items():
        print(f"\n{schema} schema: {len(tables)} tables")
        for table in tables:
            print(f"  - {table}")
        total_tables += len(tables)
    
    print(f"\nTotal: {total_tables} tables across {len(all_tables)} schemas")
    
    # Summary of issues found
    print("\n" + "=" * 80)
    print("⚠️ ISSUES FOUND")
    print("=" * 80)
    
    if all_issues:
        for table, issues in all_issues.items():
            print(f"\n{table}:")
            for issue in issues:
                print(f"  ❌ {issue}")
    else:
        print("\n✅ No issues found!")
    
    # Generate SQL queries
    print("\n" + "=" * 80)
    print("📝 SQL QUERIES TO VERIFY")
    print("=" * 80)
    print(generate_comprehensive_sql())
    
    # Generate fix script
    print("\n" + "=" * 80)
    print("🔧 FIX SCRIPT (IF NEEDED)")
    print("=" * 80)
    print(create_fix_script())
    
    print("\n" + "=" * 80)
    print("✅ COMPREHENSIVE CHECK COMPLETE")
    print("=" * 80)
    print(f"\nChecked: {len(all_tables)} schemas, {total_tables} tables")
    print(f"Found issues in: {len(all_issues)} tables")

if __name__ == "__main__":
    main()