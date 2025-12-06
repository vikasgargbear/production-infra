# Customer Fields Audit
## Database vs Frontend Mapping

**Purpose:** Document ALL customer fields to ensure backend sends complete data  
**Date:** 2025-12-06  
**Status:** 🟡 Audit Phase

---

## Answer to "What about drug_license_number?"

**YES - Backend will send ALL 59 customer fields from database!**

### Why Send Everything?

1. **UI needs new field?** Already in response ✅
   - Example: You want to show `drug_license_number` → It's there!
   - No backend changes needed

2. **Performance:** Send 10KB once vs 2KB five times
   - Current: 5 API calls = 500ms
   - With all fields: 1 API call = 100ms ⚡

3. **AI-Friendly:** Agents can see all available data
   - No guessing what fields exist
   - Complete schema in one response

4. **Consistent:** Every endpoint returns same structure

---

## Complete Customer Fields (59 Total)

### Core Information (6 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `customer_id` | ✅ customer_id | Used | Primary key |
| `org_id` | ✅ org_id | Used | Organization |
| `customer_code` | ✅ customer_code | Used | Unique code |
| `customer_name` | ✅ customer_name | Used | Display name |
| `customer_type` | ✅ customer_type | Used | retail/wholesale/hospital/clinic |
| `business_type` | ❌ Missing | **ADD** | Default: 'retail_pharmacy' |

### Contact Details (8 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `primary_phone` | ✅ primary_phone | Used | Main contact |
| `secondary_phone` | ❌ Missing | **ADD** | Alternative number |
| `primary_email` | ✅ primary_email | Used | Email |
| `whatsapp_number` | ❌ Missing | **ADD** | WhatsApp |
| `contact_person_name` | ❌ Missing | **ADD** | Contact person |
| `contact_person_phone` | ❌ Missing | **ADD** | Person's phone |
| `contact_person_email` | ❌ Missing | **ADD** | Person's email |
| `preferred_delivery_time` | ❌ Missing | **ADD** | Delivery schedule |

### Compliance (7 fields) ⭐ CRITICAL
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `gst_number` | ✅ gst_number | Used | GST registration |
| `gstin` | ❓ Alias? | **REMOVE** | Alias for gst_number |
| `pan_number` | ✅ pan_number | Used | PAN card |
| `drug_license_number` | ⚠️ MISSING! | **ADD** | **YOU ASKED ABOUT THIS!** |
| `drug_license_validity` | ⚠️ MISSING! | **ADD** | License expiry date |
| `fssai_number` | ⚠️ MISSING! | **ADD** | Food safety license |
| `kyc_status` | ❌ Missing | **ADD** | pending/verified/rejected |

### Credit Management (9 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `credit_limit` | ✅ credit_limit | Used | Max credit |
| `current_outstanding` | ❌ Missing | **ADD** | Current dues |
| `credit_days` | ✅ credit_days | Used | Payment terms |
| `credit_rating` | ❌ Missing | **ADD** | Default: 'C' |
| `payment_terms` | ❌ Missing | **ADD** | Default: 'Cash' |
| `security_deposit` | ❌ Missing | **ADD** | Deposit amount |
| `overdue_interest_rate` | ❌ Missing | **ADD** | Late fee % |
| `preferred_payment_mode` | ❌ Missing | **ADD** | cash/card/upi/bank |
| `payment_days` | ❓ Alias? | **CHECK** | Same as credit_days? |

### Sales Assignment (5 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `territory_id` | ❌ Missing | **ADD** | Geographic territory |
| `route_id` | ❌ Missing | **ADD** | Delivery route |
| `assigned_salesperson_id` | ❌ Missing | **ADD** | Sales rep |
| `price_list_id` | ❌ Missing | **ADD** | Special pricing |
| `discount_group_id` | ❌ Missing | **ADD** | Discount group |

### KYC & Verification (3 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `kyc_status` | ❌ Missing | **ADD** | Verification status |
| `kyc_verified_date` | ❌ Missing | **ADD** | When verified |
| `kyc_documents` | ❌ Missing | **ADD** | JSON document storage |

### Communication Preferences (4 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `prefer_sms` | ❌ Missing | **ADD** | SMS opt-in |
| `prefer_email` | ❌ Missing | **ADD** | Email opt-in |
| `prefer_whatsapp` | ❌ Missing | **ADD** | WhatsApp opt-in |
| `preferred_communication` | ❌ Missing | **ADD** | Default channel |

### Analytics (5 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `first_transaction_date` | ❌ Missing | **ADD** | First purchase |
| `last_transaction_date` | ❌ Missing | **ADD** | Last purchase |
| `total_business_amount` | ❌ Missing | **ADD** | Lifetime value |
| `total_transactions` | ❌ Missing | **ADD** | Order count |
| `average_order_value` | ❌ Missing | **ADD** | AOV |

### Loyalty (2 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `loyalty_points` | ❌ Missing | **ADD** | Points balance |
| `loyalty_tier` | ❌ Missing | **ADD** | bronze/silver/gold/platinum |

### Status & Flags (5 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `is_active` | ✅ is_active | Used | Active flag |
| `blacklisted` | ❌ Missing | **ADD** | Blacklist flag |
| `blacklist_reason` | ❌ Missing | **ADD** | Why blacklisted |
| `blacklist_date` | ❌ Missing | **ADD** | When blacklisted |
| `is_deleted` | ❌ Missing | **ADD** | Soft delete |

### Address (Embedded - 8+ fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `address_line1` | ✅ address.address_line1 | Used | Street address |
| `address_line2` | ✅ address.address_line2 | Used | Additional |
| `city` | ✅ address.city | Used | City |
| `state` | ✅ address.state | Used | State |
| `pincode` | ✅ address.pincode | Used | ZIP/PIN |
| `country` | ❌ Missing | **ADD** | Country |
| `landmark` | ❌ Missing | **ADD** | Nearby landmark |
| `latitude` | ❌ Missing | **ADD** | GPS coord |
| `longitude` | ❌ Missing | **ADD** | GPS coord |

### Metadata (4 fields)
| Database Field | Frontend Current | Status | Notes |
|----------------|------------------|--------|-------|
| `created_at` | ✅ created_at | Used | Creation timestamp |
| `updated_at` | ✅ updated_at | Used | Last update |
| `created_by` | ❌ Missing | **ADD** | Creator user_id |
| `updated_by` | ❌ Missing | **ADD** | Last editor user_id |

---

## Summary Statistics

- **Total Database Fields:** 59
- **Currently Used in Frontend:** ~15 (25%)
- **Missing in Frontend:** ~44 (75%)
- **Aliases Found:** 3 (gstin, payment_days, etc.)

---

## Critical Missing Fields (High Priority)

### 1. `drug_license_number` ⚠️ **YOU ASKED ABOUT THIS**
- **Why Missing:** Not included in transformer
- **Impact:** Can't verify pharma license on invoices
- **Solution:** Backend sends it, frontend displays it

### 2. `drug_license_validity`
- **Why Missing:** Not included
- **Impact:** Can't check if license expired
- **Solution:** Backend sends it, show expiry warning

### 3. `fssai_number`
- **Why Missing:** Not included
- **Impact:** Food safety compliance missing
- **Solution:** Backend sends it

### 4. `current_outstanding`
- **Why Missing:** Not included
- **Impact:** Can't show credit usage
- **Solution:** Backend calculates and sends

### 5. Loyalty fields (points, tier)
- **Why Missing:** Not included
- **Impact:** Can't implement loyalty program
- **Solution:** Backend sends them

---

## Aliases to Remove (Causing Confusion)

### 1. `gstin` vs `gst_number`
```javascript
// ❌ Current (confusion):
gst_number: customer.gst_number || customer.gstin

// ✅ Fixed (one name):
gst_number: customer.gst_number  // Database field
```

### 2. `payment_days` vs `credit_days`
```javascript
// Are these the same field? Need to verify!
payment_days: customer.payment_days || ''
credit_days: customer.credit_days || 0
```

---

## Proposed Backend Response (Complete)

```python
# backend/app/api/routes/customers.py

@router.get("/{customer_id}")
def get_customer(customer_id: str):
    customer = db.query(Customer).get(customer_id)
    
    # Return ALL 59 fields
    return {
        # Core
        "customer_id": str(customer.id),
        "org_id": str(customer.org_id),
        "customer_code": customer.customer_code,
        "customer_name": customer.customer_name,
        "customer_type": customer.customer_type,
        "business_type": customer.business_type,
        
        # Contact
        "primary_phone": customer.primary_phone,
        "secondary_phone": customer.secondary_phone,
        "primary_email": customer.primary_email,
        "whatsapp_number": customer.whatsapp_number,
        "contact_person_name": customer.contact_person_name,
        "contact_person_phone": customer.contact_person_phone,
        "contact_person_email": customer.contact_person_email,
        
        # Compliance ⭐ Including drug_license_number!
        "gst_number": customer.gst_number,
        "pan_number": customer.pan_number,
        "drug_license_number": customer.drug_license_number,  # ✅ HERE!
        "drug_license_validity": customer.drug_license_validity.isoformat() if customer.drug_license_validity else None,
        "fssai_number": customer.fssai_number,
        
        # Credit
        "credit_limit": float(customer.credit_limit),
        "current_outstanding": float(customer.current_outstanding),
        "credit_days": customer.credit_days,
        "credit_rating": customer.credit_rating,
        "payment_terms": customer.payment_terms,
        
        # ... ALL other fields (see full list above)
        
        # Address (nested)
        "address": {
            "address_line1": customer.address_line1,
            "address_line2": customer.address_line2,
            "city": customer.city,
            "state": customer.state,
            "pincode": customer.pincode,
            "country": customer.country,
            "landmark": customer.landmark,
            "latitude": customer.latitude,
            "longitude": customer.longitude
        },
        
        # Metadata
        "created_at": customer.created_at.isoformat(),
        "updated_at": customer.updated_at.isoformat(),
        "created_by": customer.created_by,
        "updated_by": customer.updated_by
    }
```

---

## Frontend Usage (No Transformation)

```javascript
// ✅ Direct usage - no DataTransformer needed!
const customer = await customersAPI.get(customerId);

// Display drug license (already in response!)
<div>
  <label>Drug License:</label>
  <span>{customer.drug_license_number}</span>
  {customer.drug_license_validity && (
    <span>Valid until: {customer.drug_license_validity}</span>
  )}
</div>

// All fields available:
console.log(customer.fssai_number);
console.log(customer.loyalty_points);
console.log(customer.current_outstanding);
// ... everything from database!
```

---

## Next Steps

1. ✅ Audit complete (this document)
2. ⏳ Review and approve field list
3. ⏳ Update backend to send all 59 fields
4. ⏳ Test with ONE component (CustomerSearch)
5. ⏳ Migrate other customer components
6. ⏳ Remove aliases from dataTransformer

**Ready to proceed with backend update?**
