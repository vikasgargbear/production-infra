# Master Schema - Addresses Table Documentation

## Overview
The `addresses` table in the `master` schema implements a **polymorphic relationship** pattern to store addresses for multiple entity types (customers, suppliers, branches) in a single table.

---

## Table: addresses

**Purpose**: Centralized address storage for all entities using polymorphic associations  
**API Endpoint**: Addresses are typically managed through their parent entity endpoints

### Schema Definition

| Field | Type | Required | Description | Frontend Usage |
|-------|------|----------|-------------|----------------|
| `address_id` | SERIAL | ✓ | Unique address identifier | Primary key |
| `org_id` | UUID | ✓ | Organization ID | Multi-tenant filtering |
| **`entity_type`** | TEXT | ✓ | Entity type: 'customer', 'supplier', 'branch', 'employee' | **Polymorphic discriminator** |
| **`entity_id`** | INTEGER | ✓ | ID from the respective entity table | **Polymorphic foreign key** |
| `address_type` | TEXT | ✓ | Address type: 'billing', 'shipping', 'registered', 'correspondence' | Address classification |
| `address_line1` | TEXT | ✓ | Primary address line | Main address |
| `address_line2` | TEXT | - | Secondary address line | Additional details |
| `landmark` | TEXT | - | Nearby landmark | Delivery assistance |
| `city` | TEXT | ✓ | City name | Location |
| `state_code` | TEXT | ✓ | GST state code (e.g., '27' for Maharashtra) | GST calculations |
| `state_name` | TEXT | ✓ | State name | Display purposes |
| `pincode` | TEXT | ✓ | Postal code | Delivery zones |
| `country` | TEXT | - | Country (default: 'India') | International addresses |
| `latitude` | NUMERIC | - | GPS latitude | Map integration |
| `longitude` | NUMERIC | - | GPS longitude | Map integration |
| `is_default` | BOOLEAN | - | Default address flag | UI selection |
| `is_active` | BOOLEAN | - | Address active status | Soft delete |
| `created_at` | TIMESTAMPTZ | - | Creation timestamp | Audit trail |
| `updated_at` | TIMESTAMPTZ | - | Last update timestamp | Change tracking |

---

## Polymorphic Relationship Mapping

### How It Works

The combination of `entity_type` and `entity_id` uniquely identifies the owner of each address:

```
entity_type = 'customer' + entity_id = 32 → Links to customers.customer_id = 32
entity_type = 'supplier' + entity_id = 32 → Links to suppliers.supplier_id = 32
entity_type = 'branch'   + entity_id = 32 → Links to branches.branch_id = 32
```

### Important Notes

1. **No Foreign Key Constraint**: `entity_id` cannot have a traditional foreign key constraint because it references different tables based on `entity_type`.

2. **ID Collision is Acceptable**: The same `entity_id` value (e.g., 32) can exist for different entity types. This is safe because we always query with both fields:
   ```sql
   SELECT * FROM master.addresses 
   WHERE entity_type = 'customer' AND entity_id = :customer_id
   ```

3. **Always Use Both Fields**: Never query by `entity_id` alone - always include `entity_type` in WHERE clauses.

---

## Usage Examples

### Creating Customer Addresses

When a customer is created, two address records are typically inserted:

```sql
-- Billing address
INSERT INTO master.addresses (
    org_id, entity_type, entity_id, address_type,
    address_line1, city, state_code, state_name, pincode,
    is_default
) VALUES (
    :org_id, 'customer', :customer_id, 'billing',
    :address_line1, :city, :state_code, :state_name, :pincode,
    true
);

-- Shipping address (can be same as billing)
INSERT INTO master.addresses (
    org_id, entity_type, entity_id, address_type,
    address_line1, city, state_code, state_name, pincode,
    is_default
) VALUES (
    :org_id, 'customer', :customer_id, 'shipping',
    :address_line1, :city, :state_code, :state_name, :pincode,
    true
);
```

### Retrieving Customer Address

```sql
-- Get default billing address for a customer
SELECT * FROM master.addresses
WHERE entity_type = 'customer' 
  AND entity_id = :customer_id
  AND address_type = 'billing'
  AND is_default = true;
```

### Joining with Customer Data

```sql
-- Get customer with billing address
SELECT 
    c.*,
    a.address_line1,
    a.city,
    a.state_name,
    a.pincode
FROM parties.customers c
LEFT JOIN master.addresses a ON 
    a.entity_type = 'customer' AND 
    a.entity_id = c.customer_id AND
    a.address_type = 'billing' AND
    a.is_default = true
WHERE c.customer_id = :customer_id;
```

---

## GST State Codes (Common)

| State | Code | State | Code |
|-------|------|-------|------|
| Maharashtra | 27 | Tamil Nadu | 33 |
| Gujarat | 24 | Karnataka | 29 |
| Rajasthan | 08 | Kerala | 32 |
| Delhi | 07 | Telangana | 36 |
| Uttar Pradesh | 09 | Andhra Pradesh | 37 |
| West Bengal | 19 | Haryana | 06 |
| Punjab | 03 | Madhya Pradesh | 23 |

---

## Best Practices

1. **Always Create Both Address Types**: Create both billing and shipping addresses even if they're the same.

2. **Mark One as Default**: Always have one `is_default = true` for each address_type per entity.

3. **State Code Validation**: Validate GST state codes for proper tax calculations.

4. **Soft Delete**: Use `is_active = false` instead of deleting addresses.

5. **Audit Trail**: Track who created/modified addresses using created_by/updated_by fields if needed.

---

## Example API Response

```json
{
  "address_id": 1,
  "entity_type": "customer",
  "entity_id": 32,
  "address_type": "billing",
  "address_line1": "Shop No. 15, Medical Complex",
  "address_line2": "Near City Hospital, MI Road",
  "city": "Jaipur",
  "state_code": "08",
  "state_name": "Rajasthan",
  "pincode": "302001",
  "country": "India",
  "is_default": true,
  "is_active": true
}
```

---

## Migration Notes

- This polymorphic design allows flexibility but sacrifices referential integrity
- Consider adding a composite unique constraint: `UNIQUE(entity_type, entity_id, address_type, is_default)` where `is_default = true`
- Future enhancement: Consider UUID for entity_id if all tables migrate to UUID primary keys