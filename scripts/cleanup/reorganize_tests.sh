#!/bin/bash

# ERP Project Test File Reorganization Script
# Purpose: Move scattered test files to proper locations
# Created: August 2025

set -e

echo "🧹 Starting ERP Project Test File Reorganization..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if file exists
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} Found: $1"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} Not found: $1"
        return 1
    fi
}

# Function to move file safely
move_file() {
    local src=$1
    local dest=$2
    
    if [ -f "$src" ]; then
        mkdir -p "$(dirname "$dest")"
        mv "$src" "$dest"
        echo -e "${GREEN}✓${NC} Moved: $src → $dest"
    else
        echo -e "${YELLOW}⚠${NC} File not found: $src"
    fi
}

echo ""
echo "📂 Phase 1: Backend Test Files Reorganization"
echo "============================================="

# Create backend test directories if they don't exist
mkdir -p backend/tests/root_level
mkdir -p backend/logs

# Move backend root-level test files
echo ""
echo "Moving backend test files to proper location..."

# List of test files to move
backend_test_files=(
    "backend/test_all_apis_final.py"
    "backend/test_all_routers.py" 
    "backend/test_api_comprehensive.py"
    "backend/test_frontend_backend_integration.py"
)

for file in "${backend_test_files[@]}"; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        move_file "$file" "backend/tests/root_level/$filename"
    fi
done

echo ""
echo "Moving backend log files..."

# Move log files
backend_log_files=(
    "backend/test_complete_output.log"
    "backend/test_final_output.log"
    "backend/test_fixed_output.log" 
    "backend/test_output.log"
)

for file in "${backend_log_files[@]}"; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        move_file "$file" "backend/logs/$filename"
    fi
done

echo ""
echo "📂 Phase 2: Database Files Reorganization" 
echo "=========================================="

# Move database-related files from backend root
if [ -f "backend/fix_invoice_trigger.sql" ]; then
    move_file "backend/fix_invoice_trigger.sql" "database/fixes/fix_invoice_trigger.sql"
fi

echo ""
echo "📂 Phase 3: Create .gitignore entries"
echo "====================================="

# Create/update .gitignore for build artifacts
echo ""
echo "Updating .gitignore..."

gitignore_entries=(
    "# Build artifacts"
    "build/"
    "dist/"
    "*/build/"
    "*/dist/"
    ""
    "# Test coverage"
    "coverage/"
    "*/coverage/"
    ".nyc_output"
    ""
    "# Logs"
    "*.log"
    "logs/"
    "*/logs/"
    ""
    "# Test outputs"
    "test_output.*"
    "test_results.*"
    ""
    "# OS generated files"
    ".DS_Store"
    ".DS_Store?"
    "._*"
    ".Spotlight-V100"
    ".Trashes"
    "ehthumbs.db"
    "Thumbs.db"
)

# Add to .gitignore if not already present
for entry in "${gitignore_entries[@]}"; do
    if ! grep -qF "$entry" .gitignore 2>/dev/null; then
        echo "$entry" >> .gitignore
    fi
done

echo -e "${GREEN}✓${NC} Updated .gitignore with build artifacts and log files"

echo ""
echo "📂 Phase 4: Create project structure documentation"
echo "================================================="

# Create README for tests directory
cat > backend/tests/README.md << 'EOF'
# Backend Test Suite

## Structure

- `root_level/` - Tests moved from backend root
- `modules/` - Domain-specific tests
- `integration/` - Integration tests
- `validation/` - Business logic validation
- `api/` - API endpoint tests
- `workflows/` - End-to-end workflow tests

## Running Tests

```bash
# Run all tests
python -m pytest tests/

# Run specific module tests
python -m pytest tests/modules/

# Run integration tests
python -m pytest tests/integration/

# Run with coverage
python -m pytest tests/ --cov=app
```

## Test Categories

- `test_01_*.py` through `test_23_*.py` - Comprehensive API tests
- `test_*_workflow.py` - End-to-end workflows
- `test_*_validation.py` - Business logic validation
EOF

echo -e "${GREEN}✓${NC} Created backend/tests/README.md"

echo ""
echo "📊 Summary of Changes"
echo "===================="

echo ""
echo "Files moved:"
find backend/tests/root_level -name "*.py" 2>/dev/null | wc -l | xargs echo "  - Backend test files moved:"
find backend/logs -name "*.log" 2>/dev/null | wc -l | xargs echo "  - Log files moved:"
find database/fixes -name "*.sql" 2>/dev/null | wc -l | xargs echo "  - Database fix files moved:"

echo ""
echo "Directories created:"
echo "  - backend/tests/root_level/"
echo "  - backend/logs/"
echo "  - database/fixes/"

echo ""
echo -e "${GREEN}✅ Test file reorganization completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Review the moved files"
echo "2. Update import paths if necessary"
echo "3. Run tests to ensure everything works"
echo "4. Commit changes: git add -A && git commit -m 'Reorganize test files and clean up project structure'"

echo ""
echo "🎯 Project maintainability improved!"