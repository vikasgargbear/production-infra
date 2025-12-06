# Test Customer Endpoint - ALL 59 Fields

**Date:** 2025-12-06  
**Commit:** 57e3975  
**Status:** Deployed to Railway

---

## Quick Test (Railway Production)

```bash
# Get your token from browser console:
# localStorage.getItem('token')

# Test single customer
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
     https://your-railway-app.railway.app/api/customers/1 | jq

# Should see ALL fields including:
# - drug_license_number
# - loyalty_points  
# - current_outstanding
# - territory_id
# ... etc
```

---

## What to Check:

### ✅ Old Fields Still Work:
```json
{
  "customer_id": 1,
  "customer_name": "ABC Pharmacy",
  "primary_phone": "9999999999",
  "gstin": "27XXXXX...",  // Alias still works ✅
  "email": "abc@example.com",  // Alias still works ✅
  "credit_limit": 50000
}
```

### ✅ NEW Fields Now Available:
```json
{
  // Compliance (NEW!)
  "drug_license_number": "DL-12345",  ⭐
  "drug_license_validity": "2026-12-31",
  "fssai_number": "12345678901234",
  
  // Loyalty (NEW!)
  "loyalty_points": 1250,
  "loyalty_tier": "gold",
  
  // Analytics (NEW!)
  "first_transaction_date": "2024-01-15",
  "last_transaction_date": "2025-12-05",
  "total_business_amount": 125000.00,
  "total_transactions": 45,
  "average_order_value": 2777.78,
  
  // Sales (NEW!)
  "territory_id": 5,
  "route_id": 12,
  "assigned_salesperson_id": 3,
  
  // Status (NEW!)
  "blacklisted": false,
  "current_outstanding": 25000.00
}
```

### ✅ Both Old AND New Names Work:
```json
{
  // Database name (NEW standard)
  "gst_number": "27XXXXX...",
  "primary_email": "abc@example.com",
  "current_outstanding": 25000.00,
  
  // Alias (backward compatible)
  "gstin": "27XXXXX...",  // Same value ✅
  "email": "abc@example.com",  // Same value ✅
  "outstanding_amount": 25000.00  // Same value ✅
}
```

---

## Frontend Usage (After Backend Deploy):

### Old Frontend Code (Still Works):
```javascript
const customer = await customersAPI.get(id);

// Old fields still work ✅
console.log(customer.gstin);  // "27XXXXX..."
console.log(customer.email);  // "abc@example.com"
```

### New Frontend Code (Can Now Use):
```javascript
const customer = await customersAPI.get(id);

// NEW fields available! ✅
console.log(customer.drug_license_number);  // "DL-12345"
console.log(customer.loyalty_points);        // 1250
console.log(customer.current_outstanding);   // 25000.00

// Use in UI:
<div>
  <h3>{customer.customer_name}</h3>
  <p>License: {customer.drug_license_number}</p>
  <p>Valid until: {customer.drug_license_validity}</p>
  <p>Loyalty: {customer.loyalty_tier} ({customer.loyalty_points} pts)</p>
  <p>Outstanding: ₹{customer.current_outstanding}</p>
</div>
```

---

## Expected Behavior:

### Response Size:
```
Before: ~1KB per customer (15 fields)
After:  ~2KB per customer (59 fields)
Impact: Negligible (1KB more)
Benefit: No future roundtrips needed ⚡
```

### Response Time:
```
Before: ~100ms (SELECT c.* already got all fields)
After:  ~100ms (same - just returning them now)
Impact: NONE - same speed ✅
```

### Backward Compatibility:
```
Old frontend code: Still works ✅
New frontend code: Can use new fields ✅
Migration: Gradual (no breaking changes) ✅
```

---

## Troubleshooting:

### If Fields are Missing:
```bash
# Check Railway logs
railway logs

# Look for:
# - Schema validation errors
# - Missing database columns
# - Pydantic errors
```

### If Response Errors:
```bash
# Check if Railway deployed
railway status

# Redeploy if needed
git push origin main --force-with-lease
```

### If Old Code Breaks:
```python
# Rollback immediately
git reset --hard 7240fcd
git push origin main --force
```

---

## Success Criteria:

- [ ] GET /customers/1 returns 200 OK
- [ ] Response has drug_license_number field
- [ ] Response has loyalty_points field
- [ ] Response has ~59 fields total (vs 25 before)
- [ ] Old aliases still work (gstin, email)
- [ ] Response time < 150ms
- [ ] No errors in Railway logs
- [ ] Frontend customer search still works
- [ ] Invoice customer selection still works

---

## Next Steps After Testing:

1. ✅ Customers working → Move to Batches (fix JOIN)
2. ✅ Batches working → Move to Products
3. ✅ Products working → Move to Suppliers
4. ✅ All entities done → Remove DataTransformer aliases

**Test the customer endpoint and let me know if it works!**

Then we'll fix the batch subquery anti-pattern (27x speedup).
