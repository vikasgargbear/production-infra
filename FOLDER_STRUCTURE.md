# Production Infrastructure - Folder Structure Guide

## Overview
This document provides a comprehensive guide to the folder structure of the AASO Pharma ERP production infrastructure. The structure follows enterprise best practices with clear separation of concerns.

## Root Directory Structure

```
production-infra/
├── backend/                 # FastAPI backend application
├── frontend/               # React frontend application
├── database/               # PostgreSQL database schema and migrations
├── infrastructure/         # DevOps and deployment configurations
├── config/                 # Environment-specific configurations
├── docs/                   # Project documentation
├── scripts/                # Utility and deployment scripts
├── tests/                  # End-to-end and integration tests
└── docker-compose.yml      # Local development environment
```

## Backend Structure (`/backend`)

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/         # REST API endpoints
│   │   │   ├── customers_v2.py     # Customer CRUD operations
│   │   │   ├── products.py         # Product management
│   │   │   ├── sales.py            # Sales operations
│   │   │   ├── inventory.py        # Inventory management
│   │   │   └── ...                 # Other domain routes
│   │   ├── schemas/        # Pydantic models for validation
│   │   │   ├── customer_schema.py  # Customer DTOs
│   │   │   ├── product_schema.py   # Product DTOs
│   │   │   └── ...
│   │   ├── services/       # Business logic layer
│   │   │   ├── customer_service.py
│   │   │   ├── inventory_service.py
│   │   │   └── ...
│   │   └── middleware/     # Cross-cutting concerns
│   │       ├── auth.py
│   │       ├── logging.py
│   │       └── cors.py
│   ├── core/              # Core application setup
│   │   ├── config/        # Application configuration
│   │   ├── database.py    # Database connection
│   │   ├── security/      # Security utilities
│   │   └── exceptions/    # Custom exceptions
│   ├── domain/            # Domain models and logic
│   │   ├── customers/
│   │   ├── inventory/
│   │   ├── sales/
│   │   └── products/
│   ├── infrastructure/    # External service integrations
│   │   ├── cache/         # Redis cache
│   │   ├── database/      # Database repositories
│   │   └── parsers/       # Invoice parsers
│   └── main.py           # Application entry point
├── requirements.txt       # Python dependencies
└── Dockerfile            # Container definition
```

### Key Backend Concepts:
- **Routes**: REST API endpoints following RESTful conventions
- **Schemas**: Data validation and serialization (request/response DTOs)
- **Services**: Business logic, independent of web framework
- **Domain**: Core business entities and rules
- **Infrastructure**: External dependencies and integrations

## Frontend Structure (`/frontend`)

```
frontend/
├── src/
│   ├── modules/           # Feature modules
│   │   ├── sales/         # Sales module
│   │   │   ├── SalesHub.tsx
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── purchase/      # Purchase module
│   │   ├── inventory/     # Inventory module
│   │   └── ...
│   ├── shared/            # Shared resources
│   │   ├── components/    # Reusable UI components
│   │   │   ├── ui/        # Basic UI components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   └── ...
│   │   │   └── business/  # Business components
│   │   │       ├── CustomerSearch.tsx
│   │   │       └── ProductSearch.tsx
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utility functions
│   ├── services/          # API and external services
│   │   └── api/
│   │       └── apiClient.ts
│   ├── config/            # Application configuration
│   └── App.tsx           # Root component
├── public/               # Static assets
├── package.json          # Node dependencies
└── Dockerfile           # Container definition
```

### Key Frontend Concepts:
- **Modules**: Feature-based organization (sales, purchase, inventory)
- **Shared Components**: Reusable UI elements
- **Services**: API communication layer
- **Type Safety**: TypeScript throughout

## Database Structure (`/database`)

```
database/
├── 00-preparation/        # Initial setup
├── 01-schemas/           # Schema definitions
├── 02-tables/            # Table definitions
│   ├── 01_master_tables.sql
│   ├── 02_party_tables.sql
│   ├── 03_inventory_tables.sql
│   └── ...
├── 04-triggers/          # Database triggers
├── 05-functions/         # Stored procedures
├── 06-indexes/           # Performance indexes
├── 07-api/               # Database-level API functions
│   ├── 01_master_apis.sql
│   ├── 03_sales_apis.sql
│   └── ...
├── 08-initial-data/      # Seed data
├── schema-docs/          # Schema documentation
└── migrations/           # Database migrations
```

### Database API vs REST API:
- **Database APIs** (`/database/07-api/`): PostgreSQL functions for complex queries
- **REST APIs** (`/backend/app/api/routes/`): HTTP endpoints for CRUD operations

## Configuration (`/config`)

```
config/
├── development/          # Development environment
│   ├── .env
│   └── settings.json
└── production/          # Production environment
    ├── .env
    └── settings.json
```

## Documentation (`/docs`)

```
docs/
├── api/                 # API documentation
├── architecture/        # System architecture
├── deployment/         # Deployment guides
└── guides/             # User and developer guides
```

## Best Practices

### 1. API Development
- **REST APIs** go in `/backend/app/api/routes/`
- Each domain gets its own route file
- Use schemas for validation
- Business logic in services, not routes

### 2. Frontend Development
- Feature modules in `/frontend/src/modules/`
- Shared components in `/frontend/src/shared/components/`
- API calls through centralized client

### 3. Database Changes
- Schema changes in `/database/02-tables/`
- New functions in `/database/05-functions/`
- API functions in `/database/07-api/`
- Always document in schema-docs

### 4. Adding New Features
1. Define database schema if needed
2. Create backend route and service
3. Add frontend module
4. Update documentation

## Module Boundaries

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Database   │
│   (React)   │     │  (FastAPI)  │     │(PostgreSQL) │
└─────────────┘     └─────────────┘     └─────────────┘
     │                   │                     │
     ▼                   ▼                     ▼
  UI Components      REST APIs            SQL Functions
  API Client         Business Logic       Triggers
  State Mgmt         Validation           Stored Procs
```

## Common Tasks

### Adding a New API Endpoint
1. Create route in `/backend/app/api/routes/`
2. Define schemas in `/backend/app/api/schemas/`
3. Implement service in `/backend/app/api/services/`
4. Add tests in `/backend/tests/`

### Adding a New UI Module
1. Create folder in `/frontend/src/modules/`
2. Build components within module
3. Use shared components from `/frontend/src/shared/`
4. Connect to API via `/frontend/src/services/api/`

### Database Schema Changes
1. Add/modify in `/database/02-tables/`
2. Update triggers if needed in `/database/04-triggers/`
3. Document in `/database/schema-docs/`
4. Create migration script

## Security Considerations

- API routes require authentication (except public endpoints)
- Database functions use SECURITY DEFINER
- Environment variables for sensitive data
- CORS configured in backend middleware

## Deployment Flow

1. Database migrations run first
2. Backend deployed as containerized service
3. Frontend built and served via CDN/nginx
4. Environment-specific configs applied

---

This structure ensures:
- **Separation of Concerns**: Clear boundaries between layers
- **Scalability**: Easy to add new features
- **Maintainability**: Consistent organization
- **Testability**: Each layer can be tested independently