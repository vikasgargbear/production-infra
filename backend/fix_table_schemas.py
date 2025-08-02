#!/usr/bin/env python3
"""Fix table references to use correct schema names"""

import os
import re

def fix_table_references_in_file(filepath):
    """Fix table references to use schema prefixes"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Dictionary of table mappings
    table_mappings = {
        # master schema - customers
        r'\bFROM customers\b': 'FROM master.customers',
        r'\bINTO customers\b': 'INTO master.customers',
        r'\bUPDATE customers\b': 'UPDATE master.customers',
        r'\bJOIN customers\b': 'JOIN master.customers',
        r'"customers"': '"master"."customers"',
        
        # master schema
        r'\bFROM products\b': 'FROM master.products',
        r'\bINTO products\b': 'INTO master.products',
        r'\bUPDATE products\b': 'UPDATE master.products',
        r'\bJOIN products\b': 'JOIN master.products',
        r'"products"': '"master"."products"',
        
        # master schema - addresses
        r'\bFROM addresses\b': 'FROM master.addresses',
        r'\bINTO addresses\b': 'INTO master.addresses',
        r'\bUPDATE addresses\b': 'UPDATE master.addresses',
        
        # master schema - organizations
        r'\bFROM organizations\b': 'FROM master.organizations',
        r'\bINTO organizations\b': 'INTO master.organizations',
        r'\bUPDATE organizations\b': 'UPDATE master.organizations',
        
        # sales schema
        r'\bFROM orders\b': 'FROM sales.orders',
        r'\bINTO orders\b': 'INTO sales.orders',
        r'\bUPDATE orders\b': 'UPDATE sales.orders',
        r'\bJOIN orders\b': 'JOIN sales.orders',
        
        r'\bFROM order_items\b': 'FROM sales.order_items',
        r'\bINTO order_items\b': 'INTO sales.order_items',
        r'\bUPDATE order_items\b': 'UPDATE sales.order_items',
        r'\bJOIN order_items\b': 'JOIN sales.order_items',
        
        r'\bFROM invoices\b': 'FROM sales.invoices',
        r'\bINTO invoices\b': 'INTO sales.invoices',
        r'\bUPDATE invoices\b': 'UPDATE sales.invoices',
        r'\bJOIN invoices\b': 'JOIN sales.invoices',
        
        # inventory schema
        r'\bFROM batches\b': 'FROM inventory.batches',
        r'\bINTO batches\b': 'INTO inventory.batches',
        r'\bUPDATE batches\b': 'UPDATE inventory.batches',
        r'\bJOIN batches\b': 'JOIN inventory.batches',
        
        r'\bFROM inventory_movements\b': 'FROM inventory.inventory_movements',
        r'\bINTO inventory_movements\b': 'INTO inventory.inventory_movements',
        r'\bUPDATE inventory_movements\b': 'UPDATE inventory.inventory_movements',
    }
    
    # Apply replacements
    original_content = content
    for pattern, replacement in table_mappings.items():
        content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    
    # Special case for org_users which might be in master schema
    content = re.sub(r'\bFROM org_users\b', 'FROM master.org_users', content, flags=re.IGNORECASE)
    content = re.sub(r'\bINTO org_users\b', 'INTO master.org_users', content, flags=re.IGNORECASE)
    content = re.sub(r'\bUPDATE org_users\b', 'UPDATE master.org_users', content, flags=re.IGNORECASE)
    
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Fixed: {filepath}")
    else:
        print(f"No changes: {filepath}")

# Fix all route files
routes_dir = 'app/api/routes'
for filename in os.listdir(routes_dir):
    if filename.endswith('.py') and filename != '__init__.py':
        filepath = os.path.join(routes_dir, filename)
        fix_table_references_in_file(filepath)

# Fix all service files
services_dir = 'app/api/services'
for filename in os.listdir(services_dir):
    if filename.endswith('.py') and filename != '__init__.py':
        filepath = os.path.join(services_dir, filename)
        fix_table_references_in_file(filepath)

print("Table schema fixes completed!")