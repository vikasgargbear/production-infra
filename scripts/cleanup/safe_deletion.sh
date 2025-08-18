#!/bin/bash

# ERP Project Safe Deletion Script
# Purpose: Delete files identified as truly useless/temporary
# Based on detailed analysis in DELETION_ANALYSIS_REPORT.md

set -e

echo "🗑️  Starting ERP Project Safe File Deletion..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get directory/file size
get_size() {
    if [ -d "$1" ] || [ -f "$1" ]; then
        du -sh "$1" 2>/dev/null | cut -f1
    else
        echo "0B"
    fi
}

# Function to confirm deletion
confirm_delete() {
    local target=$1
    local desc=$2
    local size=$3
    
    echo ""
    echo -e "${YELLOW}Target:${NC} $desc"
    echo -e "${BLUE}Path:${NC} $target"
    echo -e "${BLUE}Size:${NC} $size"
    
    if [ -d "$target" ] || [ -f "$target" ]; then
        read -p "Delete this? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if [ -d "$target" ]; then
                rm -rf "$target"
            else
                rm -f "$target"
            fi
            echo -e "${GREEN}✓ Deleted:${NC} $desc"
            return 0
        else
            echo -e "${YELLOW}⏭  Skipped:${NC} $desc"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠  Not found:${NC} $target"
        return 1
    fi
}

echo ""
echo "📊 Pre-deletion Project Analysis"
echo "================================"

# Get current project size
project_size=$(get_size .)
echo "Current project size: $project_size"

# Analyze specific targets
echo ""
echo "Deletion targets identified:"
if [ -d "frontend/node_modules" ]; then
    nm_size=$(get_size "frontend/node_modules")
    echo "  📦 node_modules: $nm_size"
fi

if [ -d "archive/backend" ]; then
    arch_backend_size=$(get_size "archive/backend")
    echo "  🗃️  archive/backend: $arch_backend_size"
fi

if [ -d "archive/database" ]; then
    arch_db_size=$(get_size "archive/database")
    echo "  🗃️  archive/database: $arch_db_size"
fi

# Count Python cache directories
cache_count=$(find . -name "__pycache__" -type d | wc -l)
echo "  🐍 Python cache dirs: $cache_count"

echo ""
echo "🚨 IMPORTANT: This will delete files permanently!"
echo "📄 Review DELETION_ANALYSIS_REPORT.md for details"
echo ""

read -p "Proceed with safe deletions? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deletion cancelled by user"
    exit 0
fi

echo ""
echo "🎯 Phase 1: High Impact Deletions"
echo "================================="

# Delete node_modules (biggest space saver)
if [ -d "frontend/node_modules" ]; then
    nm_size=$(get_size "frontend/node_modules")
    confirm_delete "frontend/node_modules" "Node.js dependencies (can reinstall with npm install)" "$nm_size"
    if [ $? -eq 0 ]; then
        echo -e "${BLUE}💡 To restore:${NC} cd frontend && npm install"
    fi
fi

echo ""
echo "🗃️  Phase 2: Archive Code Cleanup"
echo "================================="

# Delete archive backend code
if [ -d "archive/backend" ]; then
    arch_size=$(get_size "archive/backend")
    confirm_delete "archive/backend" "Archived debug endpoints (keep documentation)" "$arch_size"
fi

# Delete archive database scripts
if [ -d "archive/database" ]; then
    arch_db_size=$(get_size "archive/database")
    confirm_delete "archive/database" "Archived database scripts (fixed versions in main db/)" "$arch_db_size"
fi

echo ""
echo "🐍 Phase 3: Python Cache Cleanup"
echo "================================"

# Find and delete Python cache
cache_dirs=$(find . -name "__pycache__" -type d 2>/dev/null | head -10)
if [ -n "$cache_dirs" ]; then
    echo -e "${YELLOW}Found Python cache directories:${NC}"
    echo "$cache_dirs"
    if [ $(find . -name "__pycache__" -type d | wc -l) -gt 10 ]; then
        echo "... and more"
    fi
    
    read -p "Delete all Python cache directories? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
        find . -name "*.pyc" -delete 2>/dev/null || true
        echo -e "${GREEN}✓ Cleaned Python cache files${NC}"
    else
        echo -e "${YELLOW}⏭  Skipped Python cache cleanup${NC}"
    fi
fi

echo ""
echo "📝 Phase 4: Backup & Temporary Files"
echo "==================================="

# Delete specific backup files
backup_files=(
    "frontend/src/components/ledger/PartyLedgerV3.tsx.backup"
    "test-results.json"
)

for file in "${backup_files[@]}"; do
    if [ -f "$file" ]; then
        file_size=$(get_size "$file")
        confirm_delete "$file" "Backup/temporary file" "$file_size"
    fi
done

# Delete OS files
echo ""
echo "🖥️  Cleaning OS-specific files..."
find . -name ".DS_Store" -delete 2>/dev/null && echo -e "${GREEN}✓ Removed .DS_Store files${NC}" || echo -e "${YELLOW}⚠  No .DS_Store files found${NC}"

echo ""
echo "📊 Post-deletion Analysis"
echo "========================="

# Get new project size
new_size=$(get_size .)
echo ""
echo "Project size:"
echo "  Before: $project_size"
echo "  After:  $new_size"

echo ""
echo "🧪 Verification Recommendations"
echo "==============================="

echo ""
echo "1. Reinstall frontend dependencies:"
echo "   cd frontend && npm install"
echo ""
echo "2. Test backend functionality:"
echo "   cd backend && python -m pytest tests/"
echo ""
echo "3. Test frontend build:"
echo "   cd frontend && npm run build"
echo ""
echo "4. If anything breaks, restore from git:"
echo "   git checkout -- ."

echo ""
echo "📄 Archive Status"
echo "=================="

if [ -d "archive" ]; then
    remaining_size=$(get_size "archive")
    echo "Archive directory remaining: $remaining_size"
    echo "Contains: documentation and README (kept for reference)"
else
    echo "Archive directory: Not found or completely removed"
fi

echo ""
echo -e "${GREEN}✅ Safe deletion process completed!${NC}"

echo ""
echo "🚀 Next Steps:"
echo "1. Run verification tests"
echo "2. Reinstall node_modules if needed"
echo "3. Commit the cleaned project state"
echo "4. Consider setting up automated cleanup (monthly)"

echo ""
echo -e "${BLUE}💡 Project successfully optimized for better maintainability!${NC}"