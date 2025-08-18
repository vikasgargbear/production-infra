#!/bin/bash
# ERP Project General Cleanup Script
# Purpose: Remove build artifacts and temporary files

echo "🧹 Starting ERP Project General Cleanup..."

# Remove build artifacts
echo "Removing build artifacts..."
rm -rf frontend/build frontend/dist frontend/coverage
rm -rf backend/build backend/dist backend/coverage
rm -rf backend/.pytest_cache

# Clean Python cache
echo "Cleaning Python cache..."
find . -type d -name "__pycache__" -not -path "./node_modules/*" -exec rm -rf {} + 2>/dev/null || true
find . -name "*.pyc" -not -path "./node_modules/*" -delete 2>/dev/null || true

# Clean OS files
echo "Cleaning OS-specific files..."
find . -name ".DS_Store" -delete 2>/dev/null || true
find . -name "Thumbs.db" -delete 2>/dev/null || true

# Update .gitignore
echo "Updating .gitignore..."
cat >> .gitignore << 'GITIGNORE_END'

# Build artifacts
build/
dist/
coverage/

# Logs
*.log
logs/

# Python cache
__pycache__/
*.pyc

# OS files
.DS_Store
Thumbs.db
GITIGNORE_END

echo "✅ Project cleanup completed!"
