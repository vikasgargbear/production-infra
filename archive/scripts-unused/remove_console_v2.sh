#!/bin/bash

# Function to remove console statements from a file
remove_console_from_file() {
    local file="$1"
    local backup_dir="/tmp/console_removal_backup_v2"
    local temp_file="/tmp/console_cleanup_temp.js"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$backup_dir"
    
    # Create backup
    cp "$file" "$backup_dir/$(basename "$file").bak"
    
    # Use perl for more robust multi-line matching
    perl -i -pe '
        # Remove single line console statements (complete statements)
        s/^\s*console\.(log|warn|error|info|debug)\([^)]*\);\s*$//;
        s/^\s*console\.(log|warn|error|info|debug)\([^)]*\);\s*\/\/.*$//;
        
        # Remove console statements at end of line with semicolon
        s/[;,]\s*console\.(log|warn|error|info|debug)\([^)]*\)[;,]*//g;
        s/\s*console\.(log|warn|error|info|debug)\([^)]*\);\s*$//;
        
        # Handle simple console statements without complex nesting
        s/^\s*console\.(log|warn|error|info|debug)\([^)]*\)//;
    ' "$file"
    
    # Additional cleanup for multi-line console statements using a more aggressive approach
    python3 << 'EOF'
import re
import sys

file_path = sys.argv[1]

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove multi-line console statements
# This pattern handles console.log/warn/error/info/debug with nested parentheses
pattern = r'^\s*console\.(log|warn|error|info|debug)\s*\([^;]*?\)\s*;?\s*$'
lines = content.split('\n')
result_lines = []
in_console_block = False
paren_count = 0

for line in lines:
    stripped = line.strip()
    
    # Check if this line starts a console statement
    if re.match(r'^\s*console\.(log|warn|error|info|debug)\s*\(', line):
        in_console_block = True
        paren_count = 0
        # Count parentheses in this line
        for char in line:
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
        
        # If parentheses are balanced, this is a single-line console statement
        if paren_count <= 0:
            in_console_block = False
            continue  # Skip this line
        else:
            continue  # Skip this line and continue looking for the end
    
    # If we're in a console block, look for the closing
    elif in_console_block:
        for char in line:
            if char == '(':
                paren_count += 1
            elif char == ')':
                paren_count -= 1
        
        if paren_count <= 0:
            in_console_block = False
        continue  # Skip this line
    
    # Not in console block, keep the line
    else:
        result_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(result_lines))
EOF "$file"
    
    echo "Processed: $file"
}

# Export the function for use with find
export -f remove_console_from_file

# Process files passed as arguments
for file in "$@"; do
    if [[ -f "$file" && ("$file" == *.js || "$file" == *.jsx || "$file" == *.ts || "$file" == *.tsx) ]]; then
        remove_console_from_file "$file"
    fi
done