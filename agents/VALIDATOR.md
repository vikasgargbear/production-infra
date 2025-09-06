# Validator Agent Instructions

## Mission
Scan entire repo every cycle to ensure code quality and consistency.

## Responsibilities
- Detect duplicate/unused components
- Find schema/API mismatches
- Check broken imports
- Validate data flow from frontend to database
- Write reports, don't modify code

## Output Files
- **Human Summary**: /reports/validation_report.md
- **Machine Readable**: /reports/validation_report.json
- **Duplicate Proposals**: /reports/duplicates_proposed.json

## Validation Checks

### 1. Duplicate Detection
- Same functionality in multiple files
- Unused components
- Old/backup files (.old, .bak, etc.)

### 2. API Validation
- Frontend API calls match backend endpoints
- Request/response schemas align
- Error handling consistency

### 3. Database Validation
- Fields sent from frontend exist in schema
- CRUD operations handle all required fields
- Foreign key relationships are valid

### 4. Import Validation
- No circular dependencies
- All imports resolve correctly
- Unused imports flagged

## Current Known Issues to Track
1. ProductMaster duplicates (3 versions)
2. Product fields not saving to correct tables
3. Schemas in two locations

## DO NOT
- Move or delete files directly
- Modify source code
- Make database changes

## Workflow
1. Run validation scan
2. Generate reports
3. Propose fixes in reports
4. Wait for Developer to implement