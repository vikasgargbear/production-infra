# Enterprise Return Batch Tracking Guide

## Why Batch Tracking is MANDATORY for Pharmaceutical Returns

### Regulatory Requirements
1. **FDA 21 CFR Part 211** - Requires complete traceability
2. **WHO GMP Guidelines** - Batch identification for all movements
3. **EU Falsified Medicines Directive** - End-to-end tracking
4. **Indian Drugs and Cosmetics Act** - Batch-wise record maintenance

### Business Critical Reasons

#### 1. Product Recalls
- **Scenario**: Manufacturer recalls batch ABC123 due to contamination
- **Without Batch Tracking**: Cannot identify which returns contain this batch
- **With Batch Tracking**: Instantly quarantine all ABC123 returns

#### 2. Expiry Management
- Different batches have different expiry dates
- Returns near expiry need different handling:
  - **>6 months**: Can restock
  - **3-6 months**: Restricted sale/discounted
  - **<3 months**: Destroy or return to vendor

#### 3. Quality Control
- Batch-specific issues (color variation, packaging defects)
- Track patterns: Multiple returns from same batch = quality issue

#### 4. Financial Implications
- Vendor claims require batch numbers
- Insurance claims need batch documentation
- Tax benefits for destroyed expired stock

## Enterprise Return Workflow

### With Invoice (Standard Return)
```
Customer Return Request
    ↓
Select Invoice → Auto-populate batch from original sale
    ↓
Verify Physical Batch → Must match invoice
    ↓
Set Disposition:
  - RESTOCK: Good condition, >6 months expiry
  - QUARANTINE: Needs inspection
  - DESTROY: Damaged/Expired
  - RETURN_TO_VENDOR: Manufacturer defect
    ↓
Generate Credit Note with Batch Details
```

### Without Invoice (Manual Return)
```
Customer Return Request
    ↓
Select Product
    ↓
MANDATORY: Select Batch from Available Batches
    ↓
Physical Verification:
  - Check batch number on product
  - Verify expiry date
  - Check packaging integrity
    ↓
Set Disposition (Default: QUARANTINE)
    ↓
Manager Approval Required
    ↓
Generate Return Document with Complete Batch Trail
```

## Implementation in Our System

### 1. Batch Selection Rules
```javascript
// For returns WITH invoice
if (hasInvoice) {
  // Use batch from original sale
  batch = originalInvoiceItem.batch_id;
  // But VERIFY physically
  requirePhysicalVerification = true;
}

// For returns WITHOUT invoice
if (!hasInvoice) {
  // MUST select batch
  batchSelection = MANDATORY;
  // Default to quarantine for inspection
  defaultDisposition = 'QUARANTINE';
  // Require manager approval
  requireApproval = true;
}
```

### 2. Disposition Decision Matrix

| Condition | Expiry Status | Physical State | Disposition |
|-----------|--------------|----------------|-------------|
| Good | >6 months | Perfect | RESTOCK |
| Good | 3-6 months | Perfect | RESTOCK (with flag) |
| Good | <3 months | Perfect | DESTROY |
| Damaged | Any | Damaged | DESTROY |
| Opened | Any | Seal broken | QUARANTINE → DESTROY |
| Defective | Any | Manufacturing defect | RETURN_TO_VENDOR |

### 3. Audit Requirements

Every return MUST capture:
- Batch number
- Expiry date
- Disposition
- Reason for return
- Physical condition assessment
- Approver (if manual return)
- Timestamp
- Customer details

## Best Practices

### DO ✅
- Always verify physical batch matches system batch
- Set appropriate disposition based on condition
- Document reason for manual returns
- Quarantine suspicious returns
- Track batch patterns for quality issues

### DON'T ❌
- Accept returns without batch verification
- Restock opened/damaged items
- Mix different batches in same return
- Skip manager approval for high-value manual returns
- Ignore expiry dates

## Restocking Process

### Automated Restocking (RESTOCK disposition)
```sql
-- Only items marked as RESTOCK are added back
UPDATE inventory 
SET quantity = quantity + return_quantity
WHERE batch_id = returned_batch_id
  AND disposition = 'RESTOCK'
  AND expiry_date > CURRENT_DATE + INTERVAL '6 months';
```

### Manual Restocking (After QUARANTINE inspection)
1. Quality team inspects quarantined items
2. Updates disposition:
   - RESTOCK if passed inspection
   - DESTROY if failed
3. System automatically updates inventory

## Reports Required

1. **Daily Return Report** - All returns with batch details
2. **Quarantine Report** - Items pending inspection
3. **Destruction Certificate** - For expired/damaged items
4. **Vendor Return Report** - Items to return to manufacturer
5. **Batch Return Pattern** - Identify problematic batches

## Compliance Checklist

- [ ] Batch number captured for EVERY return
- [ ] Disposition set for EVERY item
- [ ] Physical verification documented
- [ ] Manager approval for manual returns
- [ ] Destruction certificate for expired items
- [ ] Vendor claim documentation with batch details
- [ ] Audit trail maintained for 5 years

## System Integration

Our system enforces:
1. **Mandatory batch selection** for manual returns
2. **Automatic quarantine** for items without invoice
3. **Disposition tracking** through entire lifecycle
4. **Audit logging** of all changes
5. **Report generation** for compliance

This ensures 100% pharmaceutical regulatory compliance while maintaining operational efficiency.