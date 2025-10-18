# Organization Setup Templates

This directory contains **parameterized setup scripts** for new organization onboarding.

## Important: NO HARDCODED VALUES

These files are **templates** - they must be called with specific org_id parameters during setup.

## Files:

### setup_organization.sql
Template to create a new organization record.
**Usage:** Modify org_id, org_code, org_name before running for each new customer.

### seed_product_categories.sql
Seeds product categories for pharmaceutical inventory.
**Usage:** Contains function `seed_product_categories_simple_for_org(p_org_id)` - call with actual org_id.

## How to Use:

When onboarding a new customer:

1. Create organization in master.organizations
2. Call seed functions with that org's UUID:
   ```sql
   -- Example for new org
   SELECT seed_product_categories_simple_for_org('new-org-uuid-here'::uuid);
   ```

## Scale-Friendly Approach:

✅ **DO**: Use parameterized functions
✅ **DO**: Pass org_id as parameter
✅ **DO**: Let backend use `get_org_id_secure()` from JWT

❌ **DON'T**: Hardcode org_id or branch_id
❌ **DON'T**: Use emergency fix values in production
