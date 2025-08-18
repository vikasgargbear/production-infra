#!/bin/bash
# ERP Project Safe Deletion Script
# Purpose: Delete files identified as truly useless/temporary

echo "🗑️ Starting Safe File Deletion..."

# Function to confirm deletion
confirm_delete() {
    local target=$1
    local desc=$2
    
    if [ -d "$target" ] || [ -f "$target" ]; then
        echo "Found: $desc"
        read -p "Delete $target? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if [ -d "$target" ]; then
                rm -rf "$target" && echo "✓ Deleted: $desc"
            else
                rm -f "$target" && echo "✓ Deleted: $desc"
            fi
        else
            echo "Skipped: $desc"
        fi
    else
        echo "Not found: $target"
    fi
}

echo ""
echo "🎯 High Impact Deletion"
confirm_delete "frontend/node_modules" "Node.js dependencies (1GB - can reinstall)"

echo ""
echo "🗃️ Archive Cleanup"  
confirm_delete "archive/backend" "Archived debug endpoints"
confirm_delete "archive/database" "Archived database scripts"

echo ""
echo "🐍 Python Cache Cleanup"
if find . -name "__pycache__" -type d | head -1 | grep -q "__pycache__"; then
    read -p "Delete all Python cache directories? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        find . -name "*.pyc" -delete 2>/dev/null || true
        echo "✓ Cleaned Python cache"
    fi
fi

echo ""
echo "📝 Backup Files"
confirm_delete "frontend/src/components/ledger/PartyLedgerV3.tsx.backup" "Backup file"
confirm_delete "test-results.json" "Test results file"

echo ""
echo "🖥️ OS Files"
find . -name ".DS_Store" -delete 2>/dev/null && echo "✓ Removed .DS_Store files"

echo ""
echo "✅ Safe deletion completed!"
echo ""
echo "Next steps:"
echo "1. cd frontend && npm install (to restore node_modules)"
echo "2. Test that everything still works"
echo "3. Commit the cleaned state"
