#!/bin/bash
# Release automation script

set -e

VERSION_TYPE=${1:-patch} # major, minor, or patch

echo "🚀 Creating $VERSION_TYPE release..."

# Ensure on develop branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    echo "❌ Must be on develop branch"
    exit 1
fi

# Ensure working directory is clean
if ! git diff-index --quiet HEAD --; then
    echo "❌ Working directory has uncommitted changes"
    exit 1
fi

# Pull latest changes
git pull origin develop

# Run tests
echo "🧪 Running tests..."
npm test --prefix frontend -- --watchAll=false
cd backend && pytest && cd ..

# Bump version
echo "📦 Bumping version..."
cd frontend && npm version $VERSION_TYPE --no-git-tag-version && cd ..

# Get new version
NEW_VERSION=$(node -p "require('./frontend/package.json').version")

# Update backend version
sed -i '' "s/VERSION = \".*\"/VERSION = \"$NEW_VERSION\"/" backend/app/version.py

# Create release branch
git checkout -b release/v$NEW_VERSION

# Commit version changes
git add .
git commit -m "chore(release): bump version to v$NEW_VERSION"

echo "✅ Release branch release/v$NEW_VERSION created"
echo ""
echo "Next steps:"
echo "1. Push branch: git push origin release/v$NEW_VERSION"
echo "2. Create PR to main"
echo "3. After merge, tag will be created automatically"
