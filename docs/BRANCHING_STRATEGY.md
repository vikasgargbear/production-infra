# Git Branching Strategy

## Branch Structure

```
main (production)
├── develop (staging)
│   ├── feature/sales-invoice-optimization
│   ├── feature/new-parser-vendor
│   └── feature/payment-reconciliation
├── release/v2.1.0
└── hotfix/critical-gst-fix
```

## Branch Types

### 1. Main Branches
- `main` - Production-ready code
- `develop` - Integration branch for features

### 2. Supporting Branches
- `feature/*` - New features
- `release/*` - Release preparation
- `hotfix/*` - Emergency production fixes

## Workflow

### Feature Development
```bash
# Create feature branch from develop
git checkout develop
git checkout -b feature/invoice-parser-update

# Work on feature
git add .
git commit -m "feat(parser): add support for new invoice format"

# Push and create PR
git push origin feature/invoice-parser-update
```

### Release Process
```bash
# Create release branch
git checkout -b release/v2.1.0 develop

# Bump version numbers
npm version minor --prefix frontend
# Update backend version in pyproject.toml

# Merge to main
git checkout main
git merge --no-ff release/v2.1.0
git tag -a v2.1.0 -m "Release version 2.1.0"

# Back-merge to develop
git checkout develop
git merge --no-ff release/v2.1.0
```

## Commit Convention

Use conventional commits for better changelog generation:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style changes
- `refactor:` Code refactoring
- `perf:` Performance improvement
- `test:` Adding tests
- `chore:` Maintenance tasks

Examples:
```
feat(sales): add bulk invoice generation
fix(parser): handle missing GST number gracefully
docs(api): update customer endpoint documentation
perf(db): optimize inventory queries with indexes
```

## Version Tagging

- Production releases: `v2.1.0`
- Pre-releases: `v2.1.0-beta.1`
- Release candidates: `v2.1.0-rc.1`
