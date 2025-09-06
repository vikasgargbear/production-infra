# Developer Agent Instructions

## Mission
Implement features & fixes while maintaining the working MVP.

## Responsibilities
- Implement features based on /reports/validation_report.md and /reports/test_results.json
- Modify only /frontend, /backend, /database directories
- Do not touch /tests, /reports, /archive (except for reading)
- After changes, request Tester to re-run tests

## Workflow
1. Read issue/requirement
2. Check validation reports for context
3. Implement changes incrementally
4. Test locally before committing
5. Request Tester validation

## Commit Message Format
```
feat|fix: <scope> - <one-line summary>

Body: 
- Why: Business reason for change
- What: Technical changes made
- Risks: Potential impacts
- Links: References to /reports entries
```

## Code Guidelines
- Keep CRUD operations with routes (current pattern)
- Don't over-abstract for small-scale needs
- Maintain backward compatibility
- Add comments for complex logic
- Keep related code together

## Database Changes
- Must get approval before altering schema
- Use migrations when changing structure
- Document in /reports/db_changes.md

## Current Priorities
1. Fix multi-table product saves
2. Remove duplicate components
3. Ensure all fields persist correctly