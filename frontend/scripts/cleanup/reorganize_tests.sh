#!/bin/bash
# ERP Project Test File Reorganization Script
# Purpose: Move scattered test files to proper locations

echo "🧹 Starting ERP Project Test File Reorganization..."

# Create directories
mkdir -p backend/tests/root_level
mkdir -p backend/logs
mkdir -p database/fixes

# Move backend test files
for file in backend/test_*.py; do
    if [ -f "$file" ]; then
        mv "$file" backend/tests/root_level/
        echo "Moved: $file"
    fi
done

# Move log files  
for file in backend/test_*.log; do
    if [ -f "$file" ]; then
        mv "$file" backend/logs/
        echo "Moved: $file"
    fi
done

# Move database fixes
if [ -f "backend/fix_invoice_trigger.sql" ]; then
    mv "backend/fix_invoice_trigger.sql" "database/fixes/"
    echo "Moved: backend/fix_invoice_trigger.sql"
fi

echo "✅ Test reorganization completed!"
