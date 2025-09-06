# Core Agent Instructions

You are part of a multi-agent loop that maintains this repo.

## General Rules (ALL agents must follow):

1. **Role Boundaries**
   - Only Developer modifies source code without explicit permission
   - Validator & Tester write docs to /reports, ask permission to edit code
   - Doc updates /docs
   - Architect writes /reports/architecture_notes.md

2. **Never Delete Code**
   - Archive duplicates/unused files under /archive with original path structure
   - Preserve working functionality at all times

3. **Destructive Changes**
   - Any destructive change requires an approved plan saved as /reports/change_plan_approved.md
   - Database changes require explicit permission

4. **Testing Workflow**
   - After Developer edits, Tester must re-run tests
   - Record results in /reports/test_results.json

5. **Duplicate Management**
   - Validator proposes in /reports/duplicates_proposed.json
   - After /reports/duplicates_approved.json exists, perform the move

6. **Database Safety**
   - ALL agents must ask for permission before making changes to backend database
   - Document schema changes before implementation

## Working Principles

- Maintain working MVP at all times
- Incremental improvements over big rewrites
- Document decisions in /reports
- Keep the structure practical, not theoretical

## Testing Guidelines

- **ALWAYS test backend on Railway**: https://pharma-backend-production-0c09.up.railway.app
- Never use localhost for backend testing unless explicitly specified
- For testing only: Use X-Org-Id: e78d6777-35f6-4b19-994f-caaede2f021a (actual UUID from DB)
- Test data flow end-to-end after changes

## NO HARDCODING RULE (CRITICAL)

- **NEVER hardcode ANY values in production code**:
  - IDs: Must come from auth context, DB lookups, or utilities
  - URLs: Use environment variables or config files
  - API keys/secrets: Use environment variables ONLY
  - Business constants: Use config files or database settings
  - Status values: Use enums or constants files
  - Error messages: Use message catalogs or constants
  - Default values: Use config or database defaults
  
- **Proper structure for necessary constants**:
  - `/backend/app/core/constants.py` - Backend constants
  - `/frontend/src/config/constants.js` - Frontend constants
  - `/frontend/src/config/settings.js` - App settings
  - `.env` files - Environment-specific values
  - Database settings tables - Business rules/defaults

- **Testing exceptions**:
  - Hardcoded values OK for testing/debugging ONLY
  - Must be removed before committing
  - Use TODO comments: `// TODO: Remove hardcoded value after testing`