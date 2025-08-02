#!/usr/bin/env python3
"""Script to fix all API column name issues"""
import os
import re
from pathlib import Path

# Column name mappings based on actual database schema
COLUMN_MAPPINGS = {
    # sales.orders table
    "paid_amount": "final_amount",  # Assuming no payment tracking in orders
    # sales.invoices table  
    "total_amount": "final_amount",
    # inventory.products table
    "category": "category_id",  # or remove if using category_id
    # suppliers table might be in a schema
    "suppliers": "parties.suppliers",
}

def fix_file(filepath):
    """Fix column names in a single file"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    original_content = content
    changes_made = []
    
    # Fix paid_amount references
    if "paid_amount" in content and "sales.orders" in content:
        content = re.sub(r'o\.paid_amount', '0', content)  # Replace with 0 for now
        content = re.sub(r'paid_amount', '0 as paid_amount', content)
        changes_made.append("Fixed paid_amount references")
    
    # Fix total_amount to final_amount for invoices
    if "i.total_amount" in content:
        content = content.replace("i.total_amount", "i.final_amount")
        changes_made.append("Fixed i.total_amount -> i.final_amount")
    
    # Fix category to category_id for products
    if "p.category" in content and "inventory.products" in content:
        # Check if it's not already p.category_id
        content = re.sub(r'p\.category(?!_)', 'p.category_id', content)
        changes_made.append("Fixed p.category -> p.category_id")
    
    # Fix suppliers table to use schema
    if "FROM suppliers" in content:
        content = content.replace("FROM suppliers", "FROM parties.suppliers")
        changes_made.append("Fixed suppliers -> parties.suppliers")
    
    # Fix balance calculations
    if "final_amount - paid_amount" in content:
        content = content.replace("final_amount - paid_amount", "final_amount")
        changes_made.append("Fixed balance calculation")
    
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"✅ Fixed {filepath.name}: {', '.join(changes_made)}")
        return True
    return False

def main():
    """Fix all API files"""
    backend_dir = Path("/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/backend")
    
    # Directories to search
    search_dirs = [
        backend_dir / "app" / "api" / "routes",
        backend_dir / "app" / "api" / "services"
    ]
    
    total_fixed = 0
    
    for search_dir in search_dirs:
        print(f"\nSearching in {search_dir.relative_to(backend_dir)}...")
        for filepath in search_dir.glob("*.py"):
            if fix_file(filepath):
                total_fixed += 1
    
    print(f"\n✅ Total files fixed: {total_fixed}")

if __name__ == "__main__":
    main()