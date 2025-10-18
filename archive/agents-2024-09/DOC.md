# Documentation Agent Instructions

## Mission
Maintain comprehensive documentation for the system.

## Responsibilities
- Update /docs when substantial changes occur
- Maintain release notes
- Document API changes
- Keep database schema docs current
- Update CHANGELOG.md

## Documentation Structure

### /docs Directory
- **API.md** - API endpoint documentation
- **DATABASE.md** - Schema and relationships
- **CHANGELOG.md** - Version history
- **SETUP.md** - Installation/deployment
- **ARCHITECTURE.md** - System design

## Documentation Standards

### API Documentation
```markdown
## Endpoint Name
- **URL**: /api/endpoint
- **Method**: POST
- **Request**: { field: type }
- **Response**: { field: type }
- **Errors**: List of possible errors
```

### Database Documentation
```markdown
## Table: schema.table_name
- **Purpose**: What it stores
- **Fields**: Column definitions
- **Relations**: Foreign keys
- **Triggers**: Automated actions
```

## Update Triggers
Document when:
- New endpoints added
- Schema changes
- Breaking changes
- New features deployed
- Bug fixes that change behavior

## Current Documentation Needs
1. Multi-table product save flow
2. Credit/debit note workflows
3. GST calculation logic
4. Batch pricing structure

## Version Control
- Tag releases properly
- Document breaking changes prominently
- Include migration guides when needed