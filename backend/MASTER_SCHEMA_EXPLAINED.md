# Master Schema Tables Explained

## Purpose of Master Schema
The `master` schema contains **foundational data** that everything else depends on. Think of it as the "core configuration" of your ERP system.

## Tables and Their Unique Purposes:

### 1. **master.organizations**
- **Purpose**: Your company information (the pharma company using this ERP)
- **Example**: "ABC Pharmaceuticals Ltd" with GST number, address, etc.
- **Why needed**: Multi-tenant support, company-specific settings

### 2. **master.org_branches**
- **Purpose**: Different locations/branches of your company
- **Example**: "Mumbai Branch", "Delhi Warehouse", "Pune Store"
- **Why needed**: Multi-location inventory, branch-wise reporting

### 3. **master.org_users**
- **Purpose**: Employees who LOGIN to the system
- **Example**: Admin, Sales Manager, Warehouse Staff
- **Why needed**: Authentication, audit trails (created_by), access control
- **NOT**: Your customers/suppliers (those are in parties schema)

### 4. **master.roles**
- **Purpose**: Define what different user types can do
- **Example**: "Admin" role can do everything, "Sales" role can only create orders
- **Why needed**: Permission control, security
- **Relationship**: Users HAVE roles, Roles HAVE permissions

### 5. **master.products** 
- **Purpose**: Master catalog of all products you sell
- **Example**: "Paracetamol 500mg", "Bandages", "Syringes"
- **Why needed**: Central product database
- **Note**: Should probably be in inventory schema (design inconsistency)

### 6. **master.product_categories**
- **Purpose**: Group products into categories
- **Example**: "Antibiotics", "Pain Relief", "Surgical Items"
- **Why needed**: Organization, filtering, reporting by category

### 7. **master.uom (Units of Measurement)**
- **Purpose**: Define how you measure things
- **Example**: "Tablet", "Box of 10", "Bottle", "ML"
- **Why needed**: Convert between units (10 tablets = 1 strip)

### 8. **master.tax_rates**
- **Purpose**: GST and tax configurations
- **Example**: "GST 12%", "GST 18%", "IGST"
- **Why needed**: Tax calculations on invoices

### 9. **master.number_series**
- **Purpose**: Auto-generate document numbers
- **Example**: Invoice numbers (INV-2024-0001), Order numbers (ORD-2024-0001)
- **Why needed**: Sequential, unique document numbering

### 10. **master.addresses**
- **Purpose**: Polymorphic address storage for any entity
- **Example**: Customer addresses, supplier addresses, branch addresses
- **Why needed**: Centralized address management
- **Design Issue**: Uses polymorphic design (can be problematic)

## Key Relationships:

```
Organizations (Your Company)
    └── Branches (Your Locations)
    └── Users (Your Employees)
         └── Roles (What they can do)
              └── Permissions (Specific actions)
    └── Products (What you sell)
         └── Categories (How products are grouped)
    └── Tax Rates (Tax rules)
    └── Number Series (Document numbering)
```

## Common Confusion Points:

### Users vs Customers
- **master.org_users**: Your EMPLOYEES who use the software
- **parties.customers**: Your CLIENTS who buy from you
- **created_by** field: References org_users (which employee created this)

### Roles vs Permissions
- **Roles**: Named groups like "Admin", "Manager", "Staff"
- **Permissions**: Specific actions like "can_create_invoice", "can_delete_order"
- Users get roles, roles have permissions

### Why These Are "Master" Tables
They are called "master" because:
1. They rarely change (stable data)
2. Everything else depends on them
3. They define the "rules" of the system
4. They're shared across all modules

## Design Issues I Notice:

1. **Products in wrong schema**: Should be in inventory, not master
2. **Addresses polymorphic**: Complex design, could cause issues
3. **Missing tables**: No roles<->users junction table
4. **Inconsistent foreign keys**: Some nullable, some not

## For Your Testing:

The reason write operations are failing:
1. **422 errors**: Missing required fields
2. **500 errors**: Database constraints
3. **201 "errors"**: Actually success (201 = Created)

You need to provide ALL required fields for each table.