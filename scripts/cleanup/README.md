# 🧹 ERP Project Cleanup Scripts

This directory contains scripts to optimize and maintain the ERP project structure.

## Scripts Overview

| Script | Purpose | Impact |
|--------|---------|---------|
| `reorganize_tests.sh` | Move scattered test files to proper locations | Improves test organization |
| `project_cleanup.sh` | Remove build artifacts and temporary files | Reduces project size |

## Usage

### 1. Test File Reorganization
```bash
bash scripts/cleanup/reorganize_tests.sh
```
**What it does:**
- Moves backend test files from root to `backend/tests/root_level/`
- Moves log files to `backend/logs/`
- Moves database fixes to `database/fixes/`
- Creates proper directory structure

### 2. General Project Cleanup
```bash
bash scripts/cleanup/project_cleanup.sh
```
**What it does:**
- Removes build artifacts (`build/`, `dist/`, `coverage/`)
- Cleans Python cache files (`__pycache__/`, `*.pyc`)
- Removes OS-specific files (`.DS_Store`, `Thumbs.db`)
- Updates `.gitignore` with comprehensive rules

## Recommended Execution Order

1. **First**: Run test reorganization
   ```bash
   bash scripts/cleanup/reorganize_tests.sh
   ```

2. **Second**: Run general cleanup
   ```bash
   bash scripts/cleanup/project_cleanup.sh
   ```

3. **Third**: Verify everything still works
   ```bash
   # Backend tests
   cd backend && python -m pytest tests/

   # Frontend build
   cd frontend && npm run build
   ```

4. **Finally**: Commit changes
   ```bash
   git add -A
   git commit -m "Reorganize project structure and clean up artifacts"
   ```

## Safety Features

- **Backup creation**: Important files are backed up before changes
- **Interactive prompts**: User confirmation for destructive operations
- **Dry-run capability**: Review changes before applying
- **Rollback guidance**: Instructions for undoing changes

## Expected Benefits

### Test Organization
- ✅ All tests in proper locations
- ✅ Clear test structure
- ✅ Easier test discovery and execution

### Project Size Reduction
- 📦 Smaller repository size
- 🚀 Faster clones and builds
- 🧹 Cleaner working directory

### Maintainability
- 📁 Better file organization
- 🔍 Easier navigation
- 📖 Clearer project structure

## Troubleshooting

### If tests fail after reorganization:
1. Check that test imports are still correct
2. Update any hardcoded paths in test files
3. Verify test runner configuration

### If build fails after cleanup:
1. Reinstall dependencies: `npm ci`
2. Clear caches: `npm run clean`
3. Check that no required files were removed

### To undo changes:
1. Use git to revert: `git checkout -- .`
2. Restore from backups created by scripts
3. Check script output for specific rollback instructions

## Regular Maintenance

Run these scripts:
- **Monthly**: General cleanup
- **After major changes**: Test reorganization
- **Before releases**: Full cleanup cycle

## Integration with Development Workflow

These scripts can be integrated into:
- Pre-commit hooks
- CI/CD pipelines
- Regular maintenance schedules
- Release preparation processes

---

*Created by Comprehensive ERP Project Analysis - August 2025*