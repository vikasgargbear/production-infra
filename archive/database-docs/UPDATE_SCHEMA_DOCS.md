# Schema Documentation Update Log

## Date: 2025-10-16

## Current vs Documented Table Counts

| Schema | Documented | Actual | Status | Notes |
|--------|-----------|---------|--------|-------|
| master | 12 | 14 | ⚠️ Mismatch | +2 tables: branches, system_settings |
| parties | 8 | ? | 🔄 Checking | |
| inventory | 13 | 16 | ⚠️ Mismatch | +3 tables |
| sales | ? | 27 | ⚠️ Mismatch | Large increase |
| procurement | ? | 14 | 🔄 Checking | |
| financial | ? | 16 | 🔄 Checking | |
| gst | ? | 15 | 🔄 Checking | |
| compliance | ? | 28 | ⚠️ Large schema | |
| system_config | ? | 22 | ⚠️ Large schema | |
| analytics | ? | 13 | 🔄 Checking | |
| crm | NEW | ? | ❌ Missing | Need to add |
| auth | NEW | 19 | ❌ Missing | Supabase auth |
| storage | NEW | 7 | ❌ Missing | Supabase storage |
| realtime | NEW | 3 | ❌ Missing | Supabase realtime |
| vault | NEW | 1 | ❌ Missing | Supabase vault |

## Update Strategy

### Phase 1: Core Business Schemas (Priority)
1. master ✅ (checking)
2. parties
3. inventory
4. sales
5. procurement
6. financial

### Phase 2: GST & Compliance
7. gst
8. compliance

### Phase 3: System & Analytics
9. system_config
10. analytics

### Phase 4: New Schemas
11. crm (NEW - contact_history)

### Skip: Supabase Internal Schemas
- auth, storage, realtime, vault, public - These are Supabase internal, no need to document

## Master Schema Tables (14 total)

### Existing in Docs:
1. organizations ✓
2. org_branches ✓
3. org_users ✓
4. roles ✓
5. departments ✓
6. org_bank_accounts ✓
7. addresses ✓
8. employees ✓
9. doctors ✓
10. number_series ✓
11. currencies ✓
12. exchange_rates ✓

### NEW Tables (Not in docs):
13. **branches** - NEW (separate from org_branches?)
14. **system_settings** - NEW

**Action:** Query structure of new tables and add to documentation.
