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