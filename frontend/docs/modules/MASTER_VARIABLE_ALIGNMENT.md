# Master Module - Variable Alignment

> **Purpose**: Map frontend variable names to their canonical database column names from `master` and `parties` schemas.

> [!TIP]
> **Status**: ✅ **FIXED** on 2026-01-04

## Schema Tables

| Schema | Table | Columns | Description |
|--------|-------|---------|-------------|
| `parties` | `customers` | 58 | Customer master |
| `parties` | `suppliers` | 54 | Supplier master |
| `master` | `employees` | 33 | Employee master |
| `master` | `addresses` | 27 | Addresses |
| `master` | `org_branches` | ~25 | Branches |
| `master` | `departments` | ~15 | Departments |

---

## parties.customers

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `customer_id` | `customer_id` | ✅ Primary key |
| `customer_code` | `customer_code` | ✅ |
| `customer_name` | `customer_name` | ✅ CANONICAL |
| `customer_type` | `customer_type` | ✅ |
| `primary_phone` | `primary_phone` | ✅ CANONICAL |
| `primary_email` | `primary_email` | ✅ CANONICAL |
| `secondary_phone` | `secondary_phone` | ✅ |
| `whatsapp_number` | `whatsapp_number` | ✅ |
| `contact_person_name` | `contact_person_name` | ✅ |
| `contact_person_phone` | `contact_person_phone` | ✅ |
| `gst_number` | `gst_number` | ✅ CANONICAL (not gstin) |
| `pan_number` | `pan_number` | ✅ |
| `drug_license_number` | `drug_license_number` | ✅ CANONICAL |
| `drug_license_validity` | `drug_license_validity` | ✅ |
| `fssai_number` | `fssai_number` | ✅ |
| `credit_limit` | `credit_limit` | ✅ |
| `current_outstanding` | `current_outstanding` | ✅ CANONICAL |
| `credit_days` | `credit_days` | ✅ |
| `credit_rating` | `credit_rating` | ✅ |
| `payment_terms` | `payment_terms` | ✅ |
| `customer_category` | `customer_category` | ✅ |
| `customer_grade` | `customer_grade` | ✅ |
| `territory_id` | `territory_id` | ✅ |
| `route_id` | `route_id` | ✅ |
| `area_code` | `area_code` | ✅ |
| `assigned_salesperson_id` | `assigned_salesperson_id` | ✅ |
| `loyalty_points` | `loyalty_points` | ✅ |
| `loyalty_tier` | `loyalty_tier` | ✅ |
| `is_active` | `is_active` | ✅ |
| `blacklisted` | `blacklisted` | ✅ |
| `first_transaction_date` | `first_transaction_date` | ✅ |
| `last_transaction_date` | `last_transaction_date` | ✅ |
| `total_business_amount` | `total_business_amount` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `name` | `customer_name` | Use `customer_name` |
| `phone` | `primary_phone` | Use `primary_phone` |
| `mobile` | `primary_phone` | Use `primary_phone` |
| `email` | `primary_email` | Use `primary_email` |
| `gstin` | `gst_number` | Use `gst_number` |
| `gst` | `gst_number` | Use `gst_number` |
| `dl_number` | `drug_license_number` | Use `drug_license_number` |
| `dl_validity` | `drug_license_validity` | Use `drug_license_validity` |
| `outstanding` | `current_outstanding` | Use `current_outstanding` |
| `outstanding_amount` | `current_outstanding` | Use `current_outstanding` |
| `balance` | `current_outstanding` | Use `current_outstanding` |
| `outstanding_balance` | `current_outstanding` | Use `current_outstanding` |
| `contact_person` | `contact_person_name` | Use `contact_person_name` |
| `type` | `customer_type` | Use `customer_type` |
| `category` | `customer_category` | Use `customer_category` |
| `pan` | `pan_number` | Use `pan_number` |

---

## parties.suppliers

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `supplier_id` | `supplier_id` | ✅ Primary key |
| `supplier_code` | `supplier_code` | ✅ |
| `supplier_name` | `supplier_name` | ✅ CANONICAL |
| `supplier_type` | `supplier_type` | ✅ |
| `primary_phone` | `primary_phone` | ✅ CANONICAL |
| `primary_email` | `primary_email` | ✅ CANONICAL |
| `secondary_phone` | `secondary_phone` | ✅ |
| `contact_person_name` | `contact_person_name` | ✅ |
| `contact_person_phone` | `contact_person_phone` | ✅ |
| `gst_number` | `gst_number` | ✅ CANONICAL |
| `pan_number` | `pan_number` | ✅ |
| `drug_license_number` | `drug_license_number` | ✅ |
| `drug_license_validity` | `drug_license_validity` | ✅ |
| `payment_days` | `payment_days` | ✅ |
| `supplier_category` | `supplier_category` | ✅ |
| `supplier_grade` | `supplier_grade` | ✅ |
| `current_outstanding` | `current_outstanding` | ✅ |
| `bank_name` | `bank_name` | ✅ |
| `account_number` | `account_number` | ✅ |
| `ifsc_code` | `ifsc_code` | ✅ |
| `account_type` | `account_type` | ✅ |
| `account_holder_name` | `account_holder_name` | ✅ |
| `is_active` | `is_active` | ✅ |
| `is_approved` | `is_approved` | ✅ |
| `blacklisted` | `blacklisted` | ✅ |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `name` | `supplier_name` | Use `supplier_name` |
| `phone` | `primary_phone` | Use `primary_phone` |
| `email` | `primary_email` | Use `primary_email` |
| `gstin` | `gst_number` | Use `gst_number` |
| `dl_number` | `drug_license_number` | Use `drug_license_number` |
| `contact_person` | `contact_person_name` | Use `contact_person_name` |
| `type` | `supplier_type` | Use `supplier_type` |
| `category` | `supplier_category` | Use `supplier_category` |
| `credit_days` | `payment_days` | Use `payment_days` for suppliers |

---

## master.employees

### ✅ Already Aligned (Canonical Names)

| Frontend | Database | Notes |
|----------|----------|-------|
| `employee_id` | `employee_id` | ✅ Primary key |
| `employee_code` | `employee_code` | ✅ |
| `full_name` | `full_name` | ✅ CANONICAL |
| `first_name` | `first_name` | ✅ |
| `last_name` | `last_name` | ✅ |
| `designation` | `designation` | ✅ |
| `department_id` | `department_id` | ✅ |
| `branch_id` | `branch_id` | ✅ |
| `personal_mobile` | `personal_mobile` | ✅ CANONICAL |
| `personal_email` | `personal_email` | ✅ |
| `date_of_birth` | `date_of_birth` | ✅ |
| `joining_date` | `joining_date` | ✅ |
| `pan_number` | `pan_number` | ✅ |
| `aadhar_number` | `aadhar_number` | ✅ |
| `employment_status` | `employment_status` | ✅ |
| `user_id` | `user_id` | ✅ Linked to users |

### ⚠️ Frontend Aliases (Remove)

| Frontend Alias | Canonical DB Name | Action |
|---------------|-------------------|--------|
| `name` | `full_name` | Use `full_name` |
| `phone` | `personal_mobile` | Use `personal_mobile` |
| `mobile` | `personal_mobile` | Use `personal_mobile` |
| `email` | `personal_email` | Use `personal_email` |
| `dob` | `date_of_birth` | Use `date_of_birth` |
| `aadhar` | `aadhar_number` | Use `aadhar_number` |
| `pan` | `pan_number` | Use `pan_number` |

---

## Summary: Key Canonical Names

### Party Names

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Customer name | `customer_name` | `name` |
| Supplier name | `supplier_name` | `name` |
| Employee name | `full_name` | `name` |

### Contact Information

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Phone (primary) | `primary_phone` | `phone`, `mobile`, `contact_no` |
| Email (primary) | `primary_email` | `email` |
| Employee phone | `personal_mobile` | `phone`, `mobile` |
| Contact person | `contact_person_name` | `contact_person`, `contact` |

### Tax/Compliance

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| GST Number | `gst_number` | `gstin`, `gst`, `gst_no` |
| PAN Number | `pan_number` | `pan`, `pan_no` |
| Drug License | `drug_license_number` | `dl_number`, `dl`, `license` |

### Outstanding

| Concept | Canonical Name | ❌ Don't Use |
|---------|----------------|--------------|
| Amount owed | `current_outstanding` | `outstanding`, `balance`, `outstanding_amount` |

---

## Changes Required

### Priority 1: Remove Fallback Patterns

```typescript
// ❌ AVOID
const phone = customer.phone || customer.mobile || customer.primary_phone;
const gst = customer.gstin || customer.gst_number;

// ✅ USE CANONICAL ONLY
const phone = customer.primary_phone;
const gst = customer.gst_number;
```

### Priority 2: Update Type Definitions

Files to update:
1. `invoiceTypes.ts` - Customer interface has aliases
2. `orderTypes.ts` - Customer interface has aliases
3. `salesSharedTypes.ts` - BaseCustomer has aliases
4. Master module type files

### Priority 3: Frontend Type Files to Audit

| File | Status |
|------|--------|
| `master/hooks/useCustomerEdit.ts` | Check field names |
| `master/hooks/useSupplierEdit.ts` | Check field names |
| `settings/hooks/useEmployeeManagement.ts` | Check field names |

---

## Status: ⚠️ Needs Cleanup

The master module references are spread across multiple type files with many aliases for backward compatibility. Key cleanup areas:

1. **Customer**: Remove `gstin` alias, use `gst_number`
2. **Phone**: Remove `phone`/`mobile` aliases, use `primary_phone`
3. **Email**: Remove `email` alias, use `primary_email`  
4. **Outstanding**: Remove `outstanding`/`balance` aliases, use `current_outstanding`
5. **Name**: Remove `name` alias, use explicit `customer_name`/`supplier_name`/`full_name`
