#!/usr/bin/env python3
"""Fix the paid_amount issue properly"""
import os
import re
from pathlib import Path

def fix_file(filepath):
    """Fix paid_amount references properly"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Fix incorrect replacements
    content = content.replace('"0 as paid_amount":', '"paid_amount":')
    content = content.replace("'0 as paid_amount':", "'paid_amount':")
    content = content.replace(":0 as paid_amount", ":paid_amount")
    
    # In SQL queries, replace paid_amount references with 0
    # But only in SELECT clauses, not in column definitions
    content = re.sub(
        r'SELECT([^;]+)o\.paid_amount',
        lambda m: m.group(0).replace('o.paid_amount', '0'),
        content,
        flags=re.DOTALL
    )
    
    # Fix UPDATE statements
    content = re.sub(
        r'SET 0 as paid_amount = 0 as paid_amount',
        'SET paid_amount = paid_amount',
        content
    )
    
    # Fix column lists in INSERT
    content = re.sub(
        r'(\n\s+)0 as paid_amount,',
        r'\1paid_amount,',
        content
    )
    
    if content != original_content:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"✅ Fixed {filepath.name}")
        return True
    return False

def main():
    """Fix all files"""
    backend_dir = Path("/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/backend")
    
    # Directories to search
    search_dirs = [
        backend_dir / "app" / "api" / "routes",
        backend_dir / "app" / "api" / "services"
    ]
    
    total_fixed = 0
    
    for search_dir in search_dirs:
        print(f"\nFixing in {search_dir.relative_to(backend_dir)}...")
        for filepath in search_dir.glob("*.py"):
            if fix_file(filepath):
                total_fixed += 1
    
    print(f"\n✅ Total files fixed: {total_fixed}")

if __name__ == "__main__":
    main()