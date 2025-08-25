# Calculator Architecture - Maximum 3 Services

## The 3-Calculator Rule

### 1. LocalCalculator.js
**Purpose**: Instant offline calculations
- Real-time UI updates as user types
- No network calls
- Pure JavaScript math
- Response time: <1ms

### 2. BackendCalculator.js  
**Purpose**: Server-side validation
- Called on save/submit
- Tax compliance validation
- Business rule enforcement
- Response time: 100-300ms

### 3. UnifiedCalculator.js
**Purpose**: Smart orchestrator
- Uses LocalCalculator for immediate feedback
- Optionally syncs with BackendCalculator
- Handles offline/online modes
- Single import for all components

## Usage Pattern

```javascript
// In components - only import one
import Calculator from './services/UnifiedCalculator';

// Instant calculation (offline)
const result = Calculator.calculate(invoiceData);

// With backend validation (on save)
const validated = await Calculator.calculateWithValidation(invoiceData);
```

## What to Archive/Delete

### Keep:
- enterpriseCalculator.js → Rename to LocalCalculator.js
- invoiceCalculatorEnterprise.js → Refactor to BackendCalculator.js
- Create new UnifiedCalculator.js

### Archive:
- offlineCalculator.js (duplicate of enterprise)
- salesOrderCalculatorEnterprise.js (use unified)
- purchaseCalculatorEnterprise.js (use unified)
- returnsCalculatorEnterprise.js (use unified)
- simpleCalculator.js (merged into Local)

## Benefits

1. **Fast**: Instant local calculations
2. **Reliable**: Works offline
3. **Validated**: Backend sync when needed
4. **Simple**: One import, clear purpose
5. **Maintainable**: Only 3 files to manage

## Implementation Priority

1. First: Use existing enterpriseCalculator for everything
2. Then: Add backend sync only on save
3. Finally: Clean up and archive unused calculators