#!/usr/bin/env python3
"""
Remove schema prefixes from SQL queries
This is needed if the database doesn't have schema separation
"""
import os
import re

def remove_schema_prefixes(file_path):
    """Remove schema prefixes from SQL queries in a file"""
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # Patterns to replace - remove schema prefix
    replacements = {
        # Remove master schema
        r'\bFROM master\.': 'FROM ',
        r'\bINTO master\.': 'INTO ',
        r'\bUPDATE master\.': 'UPDATE ',
        r'\bJOIN master\.': 'JOIN ',
        r'\bLEFT JOIN master\.': 'LEFT JOIN ',
        r'\bRIGHT JOIN master\.': 'RIGHT JOIN ',
        r'\bINNER JOIN master\.': 'INNER JOIN ',
        r'\bFULL JOIN master\.': 'FULL JOIN ',
        r'\bEXISTS \(SELECT .* FROM master\.': lambda m: m.group(0).replace('master.', ''),
        
        # Remove sales schema
        r'\bFROM sales\.': 'FROM ',
        r'\bINTO sales\.': 'INTO ',
        r'\bUPDATE sales\.': 'UPDATE ',
        r'\bJOIN sales\.': 'JOIN ',
        r'\bLEFT JOIN sales\.': 'LEFT JOIN ',
        r'\bRIGHT JOIN sales\.': 'RIGHT JOIN ',
        
        # Remove inventory schema
        r'\bFROM inventory\.': 'FROM ',
        r'\bINTO inventory\.': 'INTO ',
        r'\bUPDATE inventory\.': 'UPDATE ',
        r'\bJOIN inventory\.': 'JOIN ',
        r'\bLEFT JOIN inventory\.': 'LEFT JOIN ',
        
        # Remove purchase schema
        r'\bFROM purchase\.': 'FROM ',
        r'\bINTO purchase\.': 'INTO ',
        r'\bUPDATE purchase\.': 'UPDATE ',
        r'\bJOIN purchase\.': 'JOIN ',
        
        # Remove accounting schema
        r'\bFROM accounting\.': 'FROM ',
        r'\bINTO accounting\.': 'INTO ',
        r'\bUPDATE accounting\.': 'UPDATE ',
        r'\bJOIN accounting\.': 'JOIN ',
        
        # Remove schema from table references in SELECT, WHERE, etc
        r'master\.(\w+)\.': r'\1.',
        r'sales\.(\w+)\.': r'\1.',
        r'inventory\.(\w+)\.': r'\1.',
        r'purchase\.(\w+)\.': r'\1.',
        r'accounting\.(\w+)\.': r'\1.',
        
        # Handle references without dot after table name
        r'master\.(\w+)\s': r'\1 ',
        r'sales\.(\w+)\s': r'\1 ',
        r'inventory\.(\w+)\s': r'\1 ',
        r'purchase\.(\w+)\s': r'\1 ',
        r'accounting\.(\w+)\s': r'\1 ',
    }
    
    for pattern, replacement in replacements.items():
        if callable(replacement):
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
        else:
            content = re.sub(pattern, replacement, content, flags=re.IGNORECASE)
    
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
                    if remove_schema_prefixes(file_path):
                        modified_files.append(file_path)
                        print(f"Modified: {file_path}")
    
    print(f"\nTotal files modified: {len(modified_files)}")

if __name__ == "__main__":
    main()