# Enterprise V2 Database Folder Structure

## Overview
The folders are numbered to indicate the deployment order. The main deployment script (`deploy-step-by-step.sh`) follows this sequence.

## Core Deployment Sequence (00-08)

### 00-preparation
- **Purpose**: Database roles and permissions setup
- **When**: Steps 2 & 6 of deployment
- **Contents**:
  - `01_create_roles.sql` - Creates database roles
  - `02_grant_permissions.sql` - Grants permissions after tables are created

### 01-schemas  
- **Purpose**: Create all database schemas
- **When**: Step 3 of deployment
- **Contents**: Schema creation script

### 02-tables
- **Purpose**: Create all database tables
- **When**: Step 5 of deployment  
- **Contents**: Table creation scripts for each schema
- **Note**: Run in specific order, foreign keys added last

### 04-triggers
- **Purpose**: Create database triggers for automation
- **When**: Step 8 of deployment
- **Contents**: Trigger definitions for business logic

### 05-functions
- **Purpose**: Create stored procedures and functions
- **When**: Step 9 of deployment
- **Contents**: Business logic functions

### 06-indexes
- **Purpose**: Create performance indexes
- **When**: Step 10 of deployment
- **Contents**: Index definitions for query optimization

### 07-api
- **Purpose**: Create API endpoints (PostgREST compatible)
- **When**: Step 11 of deployment
- **Contents**: API function definitions

### 08-initial-data
- **Purpose**: Load initial master data
- **When**: Step 12 of deployment
- **Contents**:
  - `01_master_data.sql` - Required master data
  - `02_sample_products.sql` - Optional sample data

## Special Purpose Folders (08-10)

### 08-api-compatibility
- **Purpose**: Compatibility layer for different API versions
- **When**: As needed for backward compatibility
- **Contents**: Views and functions for API versioning

### 09-deployment
- **Purpose**: Special deployment scenarios
- **When**: Platform-specific deployments
- **Contents**:
  - `01_deploy_to_supabase.sql` - Supabase-specific deployment
  - `02_migrate_from_old_structure.sql` - Migration from legacy system

### 10-testing
- **Purpose**: Database testing suite
- **When**: After deployment for validation
- **Contents**: Test cases and validation scripts

## Other Folders

### scripts
- **Purpose**: Utility scripts
- **Contents**: Helper scripts for maintenance and operations

## Why This Structure?

1. **Clear Order**: Numbers indicate deployment sequence
2. **Modular**: Each folder has a specific purpose
3. **Flexible**: Core deployment (00-08) vs special cases (09-10)
4. **Maintainable**: Easy to understand and modify

## Note on Numbering Gap
The gap at 03 is intentional - it allows for future insertion of steps without renumbering everything.