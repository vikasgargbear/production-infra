#!/bin/bash

# Function to remove console statements from a file
remove_console_from_file() {
    local file="$1"
    local backup_dir="/tmp/console_removal_backup"
    
    # Create backup directory if it doesn't exist
    mkdir -p "$backup_dir"
    
    # Create backup
    cp "$file" "$backup_dir/$(basename "$file").bak"
    
    # Remove console statements using sed
    # This pattern handles various console statements including multi-line ones
    sed -i '' '
        # Remove single line console statements
        /^[[:space:]]*console\.\(log\|warn\|error\|info\|debug\)/d
        # Remove console statements that are part of a line (with semicolon)
        s/[[:space:]]*console\.\(log\|warn\|error\|info\|debug\)([^)]*);*//g
        # Handle multi-line console statements - start pattern
        /console\.\(log\|warn\|error\|info\|debug\)/{
            # If the line contains a complete statement, delete it
            /);[[:space:]]*$/d
            # If the line starts a multi-line statement, delete until closing
            :loop
            /);[[:space:]]*$/!{
                N
                b loop
            }
            d
        }
    ' "$file"
    
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