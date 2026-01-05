# Module-by-Module Variable Alias Verification

## Verification Date: 2026-01-05

## Summary
All frontend modules have been verified for variable alias compliance with backend database schema.

---

## Module Status

| Module | Remaining Aliases | Status |
|--------|-------------------|--------|
| **inventory** | 1 (filename string only) | ✅ PASS |
| **purchase** | 0 | ✅ PASS |
| **sales** | 0 | ✅ PASS |
| **master** | 0 | ✅ PASS |
| **ledger** | 0 | ✅ PASS |
| **gst** | 0 | ✅ PASS |
| **returns** | 0 | ✅ PASS |
| **payment** | 0 | ✅ PASS |
| **reports** | 0 | ✅ PASS |
| **settings** | 0 | ✅ PASS |
| **global** | 0 | ✅ PASS |

---

## Aliases Verified As Fixed

| Old Alias | Canonical Name | Status |
|-----------|----------------|--------|
| `gstin` | `gst_number` | ✅ 0 remaining |
| `batch_no` | `batch_number` | ✅ 0 remaining |
| `mfg_date` | `manufacturing_date` | ✅ 0 remaining |
| `exp_date` | `expiry_date` | ✅ 0 remaining |
| `cost_price` | `cost_per_unit` | ✅ 0 remaining |
| `purchase_price` | `unit_price` | ✅ 0 remaining |
| `purchase_rate` | `unit_price` | ✅ 0 remaining |
| `dl_number` | `drug_license_number` | ✅ 0 remaining |
| `grand_total` | `total_amount` | ✅ 0 remaining |
| `current_stock` | `total_quantity_available` | ✅ 0 remaining (1 filename string OK) |
| `outstanding` | `current_outstanding` | ✅ 0 remaining |
| `contact_person` | `contact_person_name` | ✅ 0 remaining |
| `pan` | `pan_number` | ✅ 0 remaining |

---

## Exceptions (Acceptable)

1. **`current_stock` in filename**: `/inventory/stock/CurrentStock.tsx:485` - Used as CSV export filename: `current_stock_*.csv` - This is user-facing and intentional.

2. **`config/fieldAliases.ts`**: Contains alias mappings for API response normalization - intentionally kept for backward compatibility.

---

## TypeScript Status
✅ **Passes with 0 errors**

---

## Reference
See [VARIABLE_NAMING_DICTIONARY.md](../VARIABLE_NAMING_DICTIONARY.md) for the complete canonical naming reference.
