# GST Field Standardization Plan

## Current Chaos
We have 6+ different names for the same GST percentage field across the codebase:
- `gst_percent` 
- `tax_rate`
- `tax_percent` 
- `tax_percentage`
- `gst_percentage`
- `gst_rate`

## Root Causes
1. **No single source of truth** - Database says `gst_percentage`, backend says `tax_percent`, frontend uses everything
2. **Import from multiple sources** - Different document types use different field names
3. **Legacy compatibility** - Trying to support old data formats without proper transformation
4. **Copy-paste development** - Code copied from different sources without standardization

## Proposed Solution

### 1. Single Source of Truth
```javascript
// dataTransformer.js should be THE ONLY place that handles field mapping
class DataTransformer {
  static normalizeGSTField(data) {
    // Map all possible field names to our standard
    const gstValue = data.gst_percent 
      || data.tax_percent 
      || data.tax_rate 
      || data.gst_percentage 
      || data.tax_percentage 
      || 0;
    
    return {
      ...data,
      gst_percent: gstValue // Our standard field name
    };
  }
}
```

### 2. Standard Field Names (Frontend)
- **GST Percentage**: `gst_percent` (number)
- **GST Number**: `gst_number` (string)
- **GST Type**: `gst_type` ('CGST/SGST' | 'IGST')
- **CGST Amount**: `cgst_amount` (number)
- **SGST Amount**: `sgst_amount` (number)
- **IGST Amount**: `igst_amount` (number)
- **CGST Percent**: `cgst_percent` (number, usually gst_percent/2)
- **SGST Percent**: `sgst_percent` (number, usually gst_percent/2)
- **IGST Percent**: `igst_percent` (number, equals gst_percent for interstate)

### 3. Backend API Contract
- **Receive**: Accept multiple field names for compatibility
- **Return**: Always return standardized field names
- **Transform**: Use middleware to normalize fields

### 4. Implementation Steps

#### Step 1: Create Field Normalizer
```javascript
// utils/fieldNormalizer.js
export const normalizeGSTFields = (item) => ({
  ...item,
  gst_percent: parseFloat(
    item.gst_percent || 
    item.tax_percent || 
    item.tax_rate || 
    item.gst_percentage || 
    item.tax_percentage || 
    0
  )
});
```

#### Step 2: Update DataTransformer
- Add normalization to all transform methods
- Ensure consistent output regardless of input

#### Step 3: Update Components
- Use only `gst_percent` internally
- Let DataTransformer handle the mapping

#### Step 4: Update Backend
- Standardize API responses to use `gst_percent`
- Accept multiple names for backward compatibility

## Benefits
1. **Clear data flow** - Always know where GST data comes from
2. **Easy debugging** - Single transformation point
3. **Better maintainability** - Change mapping in one place
4. **Type safety** - Can add TypeScript interfaces

## Migration Strategy
1. **Phase 1**: Add normalizer without breaking existing code
2. **Phase 2**: Update components to use normalized fields
3. **Phase 3**: Update backend to return standard fields
4. **Phase 4**: Remove redundant field checks

## Example Usage
```javascript
// Before (chaos)
const gst = item.gst_percent || item.tax_rate || item.tax_percent || item.tax_percentage || 0;

// After (clean)
const normalizedItem = normalizeGSTFields(item);
const gst = normalizedItem.gst_percent;
```

## Field Mapping Reference

### GST Percentage Variations
| Source | Field Name | Maps To |
|--------|-----------|---------|
| Database | `gst_percentage` | `gst_percent` |
| Backend API | `tax_percent` | `gst_percent` |
| Invoice Import | `tax_rate` | `gst_percent` |
| Legacy Data | `tax_percentage` | `gst_percent` |
| Product Master | `gst_percentage` | `gst_percent` |
| Some APIs | `gst_rate` | `gst_percent` |

### GST Number Variations
| Source | Field Name | Maps To |
|--------|-----------|---------|
| Customer | `gstin` | `gst_number` |
| Supplier | `gst_number` | `gst_number` |
| Legacy | `gstNumber` | `gst_number` |

### CGST/SGST/IGST Variations
| Found Variations | Standard Name | Type |
|-----------------|---------------|------|
| `cgst`, `cgstAmount`, `cgst_value` | `cgst_amount` | Amount |
| `sgst`, `sgstAmount`, `sgst_value` | `sgst_amount` | Amount |
| `igst`, `igstAmount`, `igst_value` | `igst_amount` | Amount |
| `cgstPercent`, `cgst_rate` | `cgst_percent` | Percentage |
| `sgstPercent`, `sgst_rate` | `sgst_percent` | Percentage |
| `igstPercent`, `igst_rate` | `igst_percent` | Percentage |

## The Problem Illustrated
```javascript
// Current chaos - same GST value referenced 6 different ways!
const gst = item.gst_percent || item.tax_rate || item.tax_percent || 
            item.tax_percentage || item.gst_percentage || item.gst_rate || 0;

// Where did 12% come from? No one knows!
const defaultGST = someValue || 12; // Magic number from nowhere
```

## Why This Matters
1. **Data Integrity**: Can't track where values come from
2. **Debugging Nightmare**: "Where did this 12% come from?"
3. **Maintenance Hell**: Need to check 6+ fields every time
4. **Performance**: Multiple fallback checks slow down code
5. **Type Safety**: Can't enforce types with variable field names