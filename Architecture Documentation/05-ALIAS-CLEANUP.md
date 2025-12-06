# Alias Cleanup Strategy
## Standardizing Field Names Across Stack

**Version:** 2.0  
**Date:** 2025-12-06

---

## The Alias Problem

### Example: GST Number Field

```
Database:    gst_number
Backend:     gstin (aliased)
Frontend:    gstin or gst_number (inconsistent)
Invoice.py:  gst_number (expects DB name)
Reports:     gstin (uses backend name)

Result: CONFUSION! Which one to use?
```

### Common Aliases Found

| Database Name | Aliases Used | Impact |
|--------------|--------------|--------|
| `gst_number` | gstin, gst_reg, gstn | High - Used everywhere |
| `primary_email` | email, customer_email | High - Common field |
| `contact_person_name` | contact_person, contact | Medium |
| `current_outstanding` | outstanding_amount, outstanding | Medium |
| `total_business_amount` | total_business, lifetime_value | Low |

---

## Target State: One Name Everywhere

### Standard: Database Name is Source of Truth

```
Database:    gst_number
Backend API: gst_number  ✅
Frontend:    gst_number  ✅
Reports:     gst_number  ✅
Docs:        gst_number  ✅

NO aliases! ONE name everywhere!
```

---

## Migration Strategy

### Phase 1: Support Both Names (Current)

```python
# Backend returns BOTH for compatibility
{
  "gst_number": "27XXXXX...",   # Database name (NEW standard)
  "gstin": "27XXXXX..."          # Alias (backward compatible)
}
```

**Benefits:**
- Old code keeps working ✅
- New code can use correct name ✅
- Gradual migration ✅

### Phase 2: Update Frontend Gradually

```javascript
// Old components (keep working)
<span>{customer.gstin}</span>  // Still works

// New components (use DB name)
<span>{customer.gst_number}</span>  // Correct name

// Both work during transition!
```

### Phase 3: Remove Aliases

```python
# After all frontend updated:
{
  "gst_number": "27XXXXX..."  # ONLY this ✅
  # No more gstin alias
}
```

---

## Complete Field Mapping

### Customers

| Database Field | OLD Aliases | Action |
|----------------|-------------|--------|
| `gst_number` | gstin, gst_reg | Use gst_number |
| `primary_email` | email | Use primary_email |
| `primary_phone` | phone, mobile | Use primary_phone |
| `contact_person_name` | contact_person | Use contact_person_name |
| `current_outstanding` | outstanding_amount | Use current_outstanding |
| `total_business_amount` | total_business | Use total_business_amount |
| `total_transactions` | total_orders | Use total_transactions |

### Products

| Database Field | OLD Aliases | Action |
|----------------|-------------|--------|
| `gst_percentage` | gst_percent, tax_rate | Use gst_percent |
| `product_name` | name | Use product_name |
| `quantity_available` | available_quantity | Use quantity_available |

### Batches

| Database Field | OLD Aliases | Action |
|----------------|-------------|--------|
| `batch_number` | batch_no | Use batch_number |
| `quantity_available` | available_quantity | Use quantity_available |
| `mrp_per_unit` | mrp | Use mrp |
| `sale_price_per_unit` | sale_price | Use sale_price |

---

## Implementation Checklist

### Per Entity

- [ ] **Document all aliases**
  - List all old field names
  - Map to database names
  - Prioritize by usage frequency

- [ ] **Update backend**
  - Return database name as primary
  - Add aliases for compatibility
  - Document deprecation timeline

- [ ] **Update frontend (gradual)**
  - Start with new components
  - Update high-traffic components
  - Leave low-priority for later

- [ ] **Remove aliases**
  - After 100% frontend migrated
  - Remove alias fields from API
  - Update documentation

---

## Timeline

**Week 1-2:** Backend adds aliases (compatibility)  
**Week 3-8:** Frontend gradual migration  
**Week 9:** Remove aliases from backend  
**Week 10:** Final cleanup & documentation  

**Total:** 10 weeks for complete cleanup

---

**Next:** [Migration Roadmap](./06-MIGRATION-ROADMAP.md)
