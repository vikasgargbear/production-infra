#!/usr/bin/env python3
"""Comprehensive fix for all paid_amount issues"""
import os
import re
from pathlib import Path

def fix_file(filepath):
    """Fix all paid_amount issues in a file"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Fix patterns in order of complexity
    
    # 1. Fix invalid Python syntax like "invoice.0 as paid_amount"
    content = re.sub(r'invoice\.0 as paid_amount', '0', content)
    content = re.sub(r'row\.0 as paid_amount', '0', content)
    content = re.sub(r'new_0 as paid_amount', 'new_paid_amount', content)
    
    # 2. Fix SQL column references "i.0 as paid_amount"
    content = re.sub(r'([a-z]+)\.0 as paid_amount', r'0', content)
    
    # 3. Fix SQL expressions "COALESCE(i.0 as paid_amount, 0)"
    content = re.sub(r'COALESCE\(([a-z]+\.)?0 as paid_amount, 0\)', '0', content)
    
    # 4. Fix calculations "final_amount - 0 as paid_amount"
    content = re.sub(r'final_amount - 0 as paid_amount', 'final_amount', content)
    content = re.sub(r'total_amount - 0 as paid_amount', 'total_amount', content)
    
    # 5. Fix SQL SET clauses "SET 0 as paid_amount = "
    content = re.sub(r'SET 0 as paid_amount = ', 'SET paid_amount = ', content)
    
    # 6. Fix SQL column lists "payment_status, 0 as paid_amount,"
    content = re.sub(r', 0 as paid_amount,', ', 0 as paid_amount,', content)
    
    # 7. Fix SUM expressions "SUM(0 as paid_amount)"
    content = re.sub(r'SUM\(0 as paid_amount\)', 'SUM(0)', content)
    
    # 8. Fix Python assignments "0 as paid_amount="
    content = re.sub(r'(\s+)0 as paid_amount=', r'\1paid_amount=', content)
    
    # 9. Fix comparisons "0 as paid_amount < final_amount"
    content = re.sub(r'0 as paid_amount < ([a-z_]+)', r'0 < \1', content)
    content = re.sub(r'0 as paid_amount - ', '0 - ', content)
    
    # 10. Fix UPDATE clauses
    content = re.sub(r'UPDATE([^;]+)0 as paid_amount = 0 as paid_amount', r'UPDATE\1paid_amount = paid_amount', content, flags=re.DOTALL)
    
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