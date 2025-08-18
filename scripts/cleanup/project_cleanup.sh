#!/bin/bash

# ERP Project General Cleanup Script
# Purpose: Remove build artifacts, clean temporary files, optimize project structure
# Created: August 2025

set -e

echo "🧹 Starting ERP Project General Cleanup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get directory size
get_size() {
    if [ -d "$1" ]; then
        du -sh "$1" 2>/dev/null | cut -f1
    else
        echo "0B"
    fi
}

# Function to safely remove directory
safe_remove() {
    local dir=$1
    local desc=$2
    
    if [ -d "$dir" ]; then
        local size=$(get_size "$dir")
        echo -e "${YELLOW}Found:${NC} $desc ($size)"
        read -p "Remove $dir? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$dir"
            echo -e "${GREEN}✓${NC} Removed $desc"
        else
            echo -e "${BLUE}Skipped:${NC} $desc"
        fi
    fi
}

# Function to clean log files
clean_logs() {
    local pattern=$1
    local desc=$2
    
    local files=$(find . -name "$pattern" -type f 2>/dev/null | grep -v node_modules | grep -v .git)
    
    if [ -n "$files" ]; then
        echo -e "${YELLOW}Found ${desc}:${NC}"
        echo "$files" | head -10
        if [ $(echo "$files" | wc -l) -gt 10 ]; then
            echo "... and $(($(echo "$files" | wc -l) - 10)) more"
        fi
        
        read -p "Remove all $desc? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "$files" | xargs rm -f
            echo -e "${GREEN}✓${NC} Removed $desc"
        else
            echo -e "${BLUE}Skipped:${NC} $desc"
        fi
    fi
}

echo ""
echo "📊 Project Size Analysis"
echo "========================"

# Get current project size
project_size=$(du -sh . 2>/dev/null | cut -f1)
echo "Current project size: $project_size"

# Analyze major directories
echo ""
echo "Directory sizes:"
for dir in backend frontend database infrastructure docs; do
    if [ -d "$dir" ]; then
        size=$(get_size "$dir")
        echo "  $dir: $size"
    fi
done

echo ""
echo "🗂️  Phase 1: Build Artifacts Cleanup"
echo "====================================="

# Clean build directories
safe_remove "frontend/build" "Frontend build directory"
safe_remove "frontend/dist" "Frontend dist directory"
safe_remove "backend/build" "Backend build directory"
safe_remove "backend/dist" "Backend dist directory"

# Clean coverage directories
safe_remove "frontend/coverage" "Frontend test coverage"
safe_remove "backend/coverage" "Backend test coverage"

# Clean cache directories
safe_remove "frontend/.cache" "Frontend cache"
safe_remove "backend/.cache" "Backend cache"
safe_remove "backend/.pytest_cache" "Pytest cache"

echo ""
echo "🗂️  Phase 2: Log Files Cleanup"
echo "==============================="

# Clean log files
clean_logs "*.log" "log files"
clean_logs "*.log.*" "rotated log files"

# Clean test outputs
clean_logs "test_output.*" "test output files"
clean_logs "test_results.*" "test result files"

echo ""
echo "🗂️  Phase 3: Temporary Files Cleanup"
echo "===================================="

# Clean Python cache
find . -type d -name "__pycache__" -not -path "./node_modules/*" -not -path "./.git/*" | while read -r dir; do
    if [ -d "$dir" ]; then
        echo -e "${YELLOW}Removing:${NC} $dir"
        rm -rf "$dir"
    fi
done

# Clean Python bytecode
find . -name "*.pyc" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true
find . -name "*.pyo" -not -path "./node_modules/*" -not -path "./.git/*" -delete 2>/dev/null || true

echo -e "${GREEN}✓${NC} Cleaned Python cache files"

# Clean OS specific files
find . -name ".DS_Store" -delete 2>/dev/null || true
find . -name "Thumbs.db" -delete 2>/dev/null || true

echo -e "${GREEN}✓${NC} Cleaned OS-specific files"

echo ""
echo "🗂️  Phase 4: Node Modules Analysis"
echo "=================================="

if [ -d "frontend/node_modules" ]; then
    nm_size=$(get_size "frontend/node_modules")
    echo -e "${BLUE}Frontend node_modules size:${NC} $nm_size"
    echo "To clean: cd frontend && npm prune && npm ci"
fi

echo ""
echo "🗂️  Phase 5: Archive Analysis"
echo "============================="

if [ -d "archive" ]; then
    archive_size=$(get_size "archive")
    echo -e "${BLUE}Archive directory size:${NC} $archive_size"
    
    # List archive contents
    echo ""
    echo "Archive contents:"
    ls -la archive/ | tail -n +2 | while read -r line; do
        echo "  $line"
    done
    
    echo ""
    echo -e "${YELLOW}Archive directory contains:${NC}"
    echo "  - Old debugging tools"
    echo "  - Database fixes"
    echo "  - Documentation"
    echo ""
    echo -e "${BLUE}Recommendation:${NC} Review archive contents and consider:"
    echo "  1. Move truly obsolete files to separate repository"
    echo "  2. Keep recent debugging tools for reference"
    echo "  3. Document archive rationale in README"
fi

echo ""
echo "🗂️  Phase 6: Git Cleanup"
echo "========================"

# Check git status
if [ -d ".git" ]; then
    echo "Checking git status..."
    
    # Check for untracked files
    untracked=$(git ls-files --others --exclude-standard | wc -l)
    if [ "$untracked" -gt 0 ]; then
        echo -e "${YELLOW}Untracked files:${NC} $untracked"
        echo "Run 'git status' to review"
    fi
    
    # Check git repo size
    git_size=$(get_size ".git")
    echo -e "${BLUE}Git repository size:${NC} $git_size"
    
    # Suggest git cleanup if repo is large
    if [[ "$git_size" =~ ([0-9]+)M ]] && [ "${BASH_REMATCH[1]}" -gt 50 ]; then
        echo -e "${YELLOW}Large git repository detected${NC}"
        echo "Consider: git gc --aggressive --prune=now"
    fi
fi

echo ""
echo "🗂️  Phase 7: Update .gitignore"
echo "=============================="

# Enhanced .gitignore rules
gitignore_additions=(
    ""
    "# === Enhanced ERP Project Rules ==="
    ""
    "# Build outputs"
    "build/"
    "dist/"
    "out/"
    "*/build/"
    "*/dist/"
    "*/out/"
    ""
    "# Test coverage and results"
    "coverage/"
    "*/coverage/"
    ".nyc_output"
    "test-results/"
    "test_output.*"
    "test_results.*"
    ""
    "# Logs and temporary files"
    "*.log"
    "*.log.*"
    "logs/"
    "*/logs/"
    ".cache/"
    "*/.cache/"
    ""
    "# Python cache"
    "__pycache__/"
    "*.pyc"
    "*.pyo"
    "*.pyd"
    ".Python"
    "env/"
    "venv/"
    ".venv/"
    ".pytest_cache/"
    ""
    "# IDEs and editors"
    ".vscode/settings.json"
    ".vscode/launch.json"
    ".idea/"
    "*.swp"
    "*.swo"
    "*~"
    ""
    "# OS generated"
    ".DS_Store"
    ".DS_Store?"
    "._*"
    ".Spotlight-V100"
    ".Trashes"
    "ehthumbs.db"
    "Thumbs.db"
    ""
    "# Database dumps and backups"
    "*.dump"
    "*.backup"
    "*.bak"
    ""
    "# Sensitive files"
    ".env.local"
    ".env.production"
    "secrets/"
    "*/secrets/"
)

echo "Checking .gitignore..."

for entry in "${gitignore_additions[@]}"; do
    if [ -n "$entry" ] && ! grep -qF "$entry" .gitignore 2>/dev/null; then
        echo "$entry" >> .gitignore
    fi
done

echo -e "${GREEN}✓${NC} Updated .gitignore with comprehensive rules"

echo ""
echo "📊 Cleanup Summary"
echo "=================="

# Calculate new size
new_project_size=$(du -sh . 2>/dev/null | cut -f1)

echo ""
echo "Project size:"
echo "  Before: $project_size"  
echo "  After:  $new_project_size"

echo ""
echo -e "${GREEN}✅ Project cleanup completed!${NC}"

echo ""
echo "🚀 Next Steps:"
echo "1. Review cleaned files and directories"
echo "2. Test that project still builds and runs"
echo "3. Commit .gitignore updates"
echo "4. Consider running other cleanup scripts:"
echo "   - bash scripts/cleanup/reorganize_tests.sh"
echo "   - bash scripts/cleanup/consolidate_api_clients.sh"

echo ""
echo "💡 Maintenance Tips:"
echo "1. Run this cleanup monthly"
echo "2. Monitor project size growth"
echo "3. Review archive directory quarterly"
echo "4. Keep .gitignore updated with new patterns"

echo ""
echo -e "${BLUE}🎯 Project optimization completed!${NC}"