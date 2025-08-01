#!/bin/bash

# Git initialization script for Pharma ERP Backend
# Run this script to set up git repository with all configurations

echo "🚀 Initializing Git repository for Pharma ERP Backend..."

# Navigate to project root
cd "$(dirname "$0")/../../.."

# Initialize git if not already initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "ℹ️  Git repository already initialized"
fi

# Add all files
echo "📄 Adding files to git..."
git add .

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "feat: Initial commit - Enterprise Pharmaceutical ERP Backend

- 135 tables across 10 schemas (master, inventory, sales, etc.)
- 75+ automated business triggers for complete automation
- 50+ business functions for complex operations
- 40+ REST-style API endpoints
- Complete GST compliance (GSTR-1, GSTR-2A, GSTR-3B, E-way bills)
- Narcotic drug tracking for Schedule X compliance
- Multi-location inventory with FEFO/FIFO allocation
- Double-entry bookkeeping with journal validation
- Comprehensive test suite with 8+ test categories
- Performance optimized with 400+ strategic indexes
- Row-level security for multi-tenant architecture
- Complete audit trail and compliance tracking
- Executive dashboard and analytics
- Migration scripts from old structure
- Deployment scripts for Supabase
- Comprehensive documentation

Built specifically for Indian pharmaceutical industry requirements."

# Create and checkout develop branch
echo "🌿 Creating develop branch..."
git checkout -b develop

# Create feature branches structure
echo "🎯 Creating branch structure..."
git checkout -b feature/inventory-management
git checkout develop
git checkout -b feature/sales-module
git checkout develop
git checkout -b feature/gst-compliance
git checkout develop
git checkout -b feature/financial-module
git checkout develop

# Return to main branch
git checkout main

# Create tags
echo "🏷️  Creating version tags..."
git tag -a v1.0.0 -m "Release v1.0.0 - Initial release of Enterprise Pharma ERP Backend

Features:
- Complete pharmaceutical ERP backend
- Multi-tenant architecture
- GST compliance
- Narcotic tracking
- Inventory management
- Sales and procurement
- Financial management
- Analytics dashboard"

git tag -a v1.0.0-beta -m "Beta release - Core functionality complete"

# Display status
echo ""
echo "✨ Git repository setup complete!"
echo ""
echo "📊 Repository status:"
git status
echo ""
echo "🌳 Branch structure:"
git branch -a
echo ""
echo "🏷️  Tags:"
git tag -l
echo ""
echo "📝 Next steps:"
echo "1. Add remote repository:"
echo "   git remote add origin https://github.com/YOUR_USERNAME/pharma-erp-backend.git"
echo ""
echo "2. Push to remote:"
echo "   git push -u origin main"
echo "   git push origin --all"
echo "   git push origin --tags"
echo ""
echo "3. Set up branch protection rules on GitHub/GitLab"
echo "4. Configure secrets for GitHub Actions"
echo "5. Enable issues and discussions"
echo ""
echo "🎉 Happy coding!"