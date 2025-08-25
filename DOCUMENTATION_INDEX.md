# Documentation Index

## Essential Documentation (Keep)

### Database Schema Documentation
- `/database/schema-docs/` - Complete database schema documentation
  - `MASTER_SCHEMA_INDEX.md` - Main schema index
  - Individual schema files (01-10) - Detailed table structures
- `/database/README.md` - Database setup guide
- `/database/SCHEMA_QUICK_REFERENCE.md` - Quick schema reference

### API Documentation
- `/database/07-api/API_DOCUMENTATION.md` - API endpoints documentation

### Frontend Documentation
- `/frontend/docs/frontend/` - Frontend architecture docs
  - `COLOR_SYSTEM.md` - Design system colors
  - `THEME_IMPLEMENTATION_GUIDE.md` - Theme implementation
  - `USER_INPUTS_ANALYSIS.md` - User input handling
  - `FRONTEND_TO_BACKEND_API_INPUTS.md` - API integration guide

### Architecture & Guides
- `/COMPREHENSIVE_PROJECT_DOCUMENTATION.md` - Overall project documentation
- `/frontend/UI_FORMATTING_GUIDE.md` - UI formatting standards
- `/frontend/src/services/CALCULATION_RULES.md` - Business calculation rules
- `/frontend/src/services/CALCULATOR_ARCHITECTURE.md` - Calculator architecture

### Configuration Files (Essential)
- `/CLAUDE.md` - Project-specific AI instructions
- `/frontend/public/index.html` - Main HTML entry point
- All `.env.example` files - Environment variable templates

## Archived Files (January 2025)

### Test HTML Files (Archived)
- Test integration files moved to `/archive/temporary_files_2025_01/test_html/`
- These were one-off test files not part of the automated test suite

### Temporary Analysis Reports
- Analysis reports moved to `/archive/temporary_files_2025_01/analysis_reports/`
- These were point-in-time analyses, not living documentation

### Deprecated Documentation
- Old/deprecated docs moved to `/archive/temporary_files_2025_01/temporary_docs/`

## Directory Structure

```
production-infra/
├── database/
│   ├── schema-docs/        # KEEP: Database schema documentation
│   └── 07-api/             # KEEP: API documentation
├── frontend/
│   ├── docs/               # KEEP: Frontend architecture docs
│   ├── public/
│   │   └── index.html      # KEEP: Main entry point
│   └── src/
│       └── services/
│           ├── CALCULATION_RULES.md      # KEEP: Business rules
│           └── CALCULATOR_ARCHITECTURE.md # KEEP: Architecture
├── backend/
│   └── CLAUDE.md          # KEEP: Backend-specific instructions
├── archive/               # Archived files for safe deletion later
│   └── temporary_files_2025_01/
└── DOCUMENTATION_INDEX.md  # This file
```

## Notes
- Archive folder can be deleted after 1 week of stable operation
- All essential documentation is version controlled
- Test files should use proper test frameworks, not standalone HTML