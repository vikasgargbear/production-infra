#!/usr/bin/env python3

import os
import re
import sys
import shutil
from pathlib import Path

def remove_console_statements(file_path):
    """Remove console.log, console.warn, console.error, etc. from a JavaScript/TypeScript file"""
    
    # Create backup
    backup_dir = Path("/tmp/console_removal_backup_py")
    backup_dir.mkdir(exist_ok=True)
    backup_path = backup_dir / Path(file_path).name
    shutil.copy2(file_path, backup_path)
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        original_lines = len(content.splitlines())
        
        # Pattern to match console statements
        # This handles single line and simple multi-line console statements
        patterns = [
            # Single line console statements (with optional semicolon)
            r'^\s*console\.(log|warn|error|info|debug)\s*\([^;]*?\)\s*;?\s*$',
            # Console statements at the end of a line
            r'\s*console\.(log|warn|error|info|debug)\s*\([^)]*\)\s*;?\s*$',
            # Console statements in the middle of expressions (be careful with this)
            r'\s*,\s*console\.(log|warn|error|info|debug)\s*\([^)]*\)\s*',
            r'\s*;\s*console\.(log|warn|error|info|debug)\s*\([^)]*\)\s*;?\s*',
        ]
        
        lines = content.splitlines()
        result_lines = []
        
        i = 0
        removed_count = 0
        
        while i < len(lines):
            line = lines[i]
            original_line = line
            
            # Check if this line contains a console statement
            is_console_line = False
            
            # Check for single line console statements
            if re.match(r'^\s*console\.(log|warn|error|info|debug)\s*\(', line):
                # Count parentheses to handle multi-line
                paren_count = 0
                temp_line = line
                
                for char in temp_line:
                    if char == '(':
                        paren_count += 1
                    elif char == ')':
                        paren_count -= 1
                
                if paren_count <= 0:
                    # Single line console statement
                    is_console_line = True
                    removed_count += 1
                else:
                    # Multi-line console statement, find the end
                    j = i + 1
                    while j < len(lines) and paren_count > 0:
                        for char in lines[j]:
                            if char == '(':
                                paren_count += 1
                            elif char == ')':
                                paren_count -= 1
                        j += 1
                    
                    # Skip all lines from i to j-1
                    removed_count += (j - i)
                    i = j
                    continue
            
            # Check for console statements at end of line or inline
            elif 'console.' in line:
                # Remove inline console statements
                new_line = re.sub(r'\s*console\.(log|warn|error|info|debug)\s*\([^)]*\)\s*;?\s*$', '', line)
                new_line = re.sub(r'\s*,\s*console\.(log|warn|error|info|debug)\s*\([^)]*\)', '', new_line)
                new_line = re.sub(r'\s*;\s*console\.(log|warn|error|info|debug)\s*\([^)]*\)\s*;?\s*', ';', new_line)
                
                if new_line != line:
                    if new_line.strip():
                        result_lines.append(new_line)
                    removed_count += 1 if not new_line.strip() else 0
                else:
                    result_lines.append(line)
            else:
                result_lines.append(line)
            
            if not is_console_line:
                i += 1
            else:
                i += 1
        
        # Write the cleaned content back
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write('\n'.join(result_lines))
            
        final_lines = len(result_lines)
        print(f"Processed: {file_path} (removed {removed_count} console statements, {original_lines} -> {final_lines} lines)")
        
        return removed_count
        
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        # Restore backup on error
        shutil.copy2(backup_path, file_path)
        return 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 remove_console.py <file1> [file2] ...")
        sys.exit(1)
    
    total_removed = 0
    files_processed = 0
    
    for file_path in sys.argv[1:]:
        if os.path.isfile(file_path) and file_path.endswith(('.js', '.jsx', '.ts', '.tsx')):
            removed = remove_console_statements(file_path)
            total_removed += removed
            files_processed += 1
        else:
            print(f"Skipping {file_path} (not a JS/TS file or doesn't exist)")
    
    print(f"\nSummary: Processed {files_processed} files, removed {total_removed} console statements total")

if __name__ == "__main__":
    main()