#!/usr/bin/env python3
"""
Fix schema mappings based on actual database structure
"""
import os
import re

def fix_schema_mappings(file_path):
    """Fix schema mappings in a file"""
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Replace master.customers with parties.customers
    replacements = {
        r'\bmaster\.customers\b': 'parties.customers',
        r'\bMASTER\.CUSTOMERS\b': 'PARTIES.CUSTOMERS',
        r'\bMaster\.Customers\b': 'Parties.Customers',
        
        # Replace master.products with inventory.products
        r'\bmaster\.products\b': 'inventory.products',
        r'\bMASTER\.PRODUCTS\b': 'INVENTORY.PRODUCTS',
        r'\bMaster\.Products\b': 'Inventory.Products',
        
        # Keep sales schema as is (already correct)
        # Keep inventory.batches as is (already correct)
        
        # Fix any references to master.addresses (if exists, should be parties.addresses)
        r'\bmaster\.addresses\b': 'parties.addresses',
        
        # Fix master.organizations 
        r'\bmaster\.organizations\b': 'parties.organizations',
        r'\bmaster\.org_users\b': 'parties.org_users',
    }
    
    for pattern, replacement in replacements.items():
        content = re.sub(pattern, replacement, content)
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        return True
    return False

def main():
    # Directories to process
    dirs_to_process = [
        'app/api/routes',
        'app/api/services',
        'app/core',
        'app/models'
    ]
    
    modified_files = []
    
    for dir_path in dirs_to_process:
        if not os.path.exists(dir_path):
            print(f"Directory {dir_path} not found, skipping...")
            continue
            
        for root, dirs, files in os.walk(dir_path):
            for file in files:
                if file.endswith('.py'):
                    file_path = os.path.join(root, file)
                    if fix_schema_mappings(file_path):
                        modified_files.append(file_path)
                        print(f"Modified: {file_path}")
    
    # Also update schema reference docs
    if os.path.exists('SCHEMA_REFERENCE.md'):
        with open('SCHEMA_REFERENCE.md', 'r') as f:
            content = f.read()
        
        content = content.replace('master.customers', 'parties.customers')
        content = content.replace('master.products', 'inventory.products')
        content = content.replace('master.addresses', 'parties.addresses')
        content = content.replace('master.organizations', 'parties.organizations')
        content = content.replace('master.org_users', 'parties.org_users')
        
        with open('SCHEMA_REFERENCE.md', 'w') as f:
            f.write(content)
        print("Updated SCHEMA_REFERENCE.md")
    
    print(f"\nTotal files modified: {len(modified_files)}")

if __name__ == "__main__":
    main()