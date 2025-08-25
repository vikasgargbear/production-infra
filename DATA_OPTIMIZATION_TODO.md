# Data Optimization TODO

## Issues Identified (2025-08-24)

### 1. Frontend-Backend Data Mismatch
- **Issue**: When entering 10*10 in frontend product creation, packages_per_box is saved as 1 instead of 10
- **Current**: First value (10) for units_per_box is not being captured
- **Location**: ProductCreationModal.js → Backend product/batch creation

### 2. Redundant Fields Between Products and Batches Tables

#### Fields That Should Remain in Batches (Per User Feedback)
- `pack_size`, `units_per_pack`, `packages_per_box`, `pack_type`, `pack_uom`, `base_uom`, `tablets_per_strip`
- **Rationale**: One product can have different packaging across batches

#### Definitely Redundant Fields in Batches
- `category_name`, `category_id` - Already accessible via product relationship
- `product_type` - Should only exist in products table

#### Fields Needing Review
- `storage_condition` - Could be product default with batch override capability
- `storage_location` - Batch-specific, correctly placed

### 3. Database Schema Considerations

#### Current Issues
- Too many nullable fields in both tables
- Missing clear separation between product master data and batch-specific data
- No clear strategy for handling packaging variations

#### Proposed Solutions (To Discuss)
1. Keep packaging fields in batches table (as per user preference)
2. Remove redundant category fields from batches
3. Consider adding default packaging to products as optional reference
4. Add proper constraints to prevent data inconsistencies

### 4. API Response Optimization
- Many null fields being sent in API responses
- Consider creating different response schemas for different use cases
- Implement field filtering based on client needs

## Next Steps
1. Fix packages_per_box not saving correctly from frontend
2. Remove redundant fields (category_name, category_id, product_type) from batches table
3. Create migration script for existing data
4. Update API endpoints to handle the changes
5. Add proper validation to prevent future inconsistencies

## Notes
- User prefers keeping packaging fields in batches table due to packaging variations per batch
- Need to maintain backward compatibility during migration
- Consider performance impact of joins when removing redundant fields