# Cleanup Phase 3 Plan
Date: 2025-09-08
Agent: CLEANUP

## Overview
Continuing cleanup from Phase 2 where we removed archive components. Phase 3 focuses on versioned components and purchase return cleanup.

## Files to Archive

### 1. Purchase Return Duplicate (35KB)
- **File**: `/frontend/src/components/returns/PurchaseReturnFlow.js`
- **Status**: OBSOLETE - replaced by PurchaseReturnFlowV2.js
- **Action**: Archive to `/archive/duplicates/frontend/src/components/returns/`
- **Reason**: V2 is actively used in ReturnsHub.tsx

### 2. Versioned Components Analysis

#### Components with V2 versions (check if V1 exists):
- `GSTFilingV2.tsx` - Check if old GSTFiling exists
- `BatchSelectionModalV2.js` - Check if V1 exists
- `InvoiceListV2.tsx` - Check if V1 exists
- `CreditNotePreviewV2.tsx` - Check if V1 exists

#### Already Archived:
- `PartyLedgerV2.tsx` - Already in archive, V3 is active

## Pre-Cleanup Verification Checklist

### Step 1: Impact Analysis
- [ ] Verify no imports of PurchaseReturnFlow.js (without V2)
- [ ] Check for dynamic imports
- [ ] Run build to ensure no breaking changes
- [ ] Check git history for recent changes

### Step 2: Check for V1 Components
- [ ] Search for GSTFiling.tsx (non-V2)
- [ ] Search for BatchSelectionModal.js (non-V2)
- [ ] Search for InvoiceList.tsx (non-V2)
- [ ] Search for CreditNotePreview.tsx (non-V2)

## Execution Plan

### Phase 3A: Purchase Return Cleanup
1. Archive PurchaseReturnFlow.js
2. Update any remaining imports
3. Test returns module

### Phase 3B: Version Component Analysis
1. Identify all V1 components that have V2 versions
2. Check which version is actively used
3. Archive unused versions

### Phase 3C: Backend Duplicate Check
1. Scan backend for duplicate routes
2. Check for old API versions
3. Archive unused endpoints

## Archive Structure
```
/archive/
  /duplicates/
    /frontend/
      /src/
        /components/
          /returns/
            PurchaseReturnFlow.js  # Phase 3A
          /gst/
            [potential V1 files]    # Phase 3B
          /invoice/
            [potential V1 files]    # Phase 3B
  ARCHIVE_LOG.md
```

## Success Criteria
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Application starts without errors
- [ ] Returns module functions correctly
- [ ] No broken imports

## Rollback Plan
```bash
# Create backup before changes
git add . && git commit -m "CLEANUP: Pre-Phase3 checkpoint"

# If issues occur:
git reset --hard HEAD^
```

## Files Summary
- **Confirmed for Archive**: 1 file (PurchaseReturnFlow.js - 35KB)
- **To Investigate**: 4 versioned component pairs
- **Estimated Space Recovery**: ~35-50KB

## Next Steps
1. Get approval for this plan
2. Execute Phase 3A (Purchase Return)
3. Investigate V1/V2 components
4. Create Phase 3B plan for versioned components