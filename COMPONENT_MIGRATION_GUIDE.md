# Component Migration & Cleanup Guide

## 🎯 Goal
Ensure consistency, reusability, and maintainability across the codebase by extracting module-specific components to global and following best practices.

## 📋 Pre-Migration Checklist

### 1. Analyze the Component
- [ ] Is it used in multiple modules or could be?
- [ ] Does it have module-specific dependencies?
- [ ] Can it be made generic with props?
- [ ] What are its current dependencies?

### 2. Dependency Check
```bash
# Check where component is imported
grep -r "ComponentName" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" src/

# Check what the component imports
cat src/components/module/ComponentName.tsx | grep "^import"
```

## 🔄 Migration Steps

### Step 1: Identify Components for Migration

**Good Candidates for Global:**
- UI components (buttons, inputs, modals)
- Data display components (tables, cards, summaries)
- Form components (selectors, date pickers)
- Utility components (loaders, error boundaries)
- Business logic that's reusable (calculators, validators)

**Keep Module-Specific:**
- Components with heavy module context dependencies
- Highly specialized business logic
- Module-specific workflows

### Step 2: Create Generic Version

#### A. Remove Context Dependencies
```typescript
// ❌ BAD - Context dependent
const BillSummary = () => {
  const { salesData, setSalesField } = useSales();
  return <div>{salesData.total}</div>;
};

// ✅ GOOD - Props based
interface BillSummaryProps {
  data: { total: number };
  onFieldChange?: (field: string, value: any) => void;
}
const BillSummary: React.FC<BillSummaryProps> = ({ data, onFieldChange }) => {
  return <div>{data.total}</div>;
};
```

#### B. Fix Import Paths
```typescript
// ❌ BAD - Relative to module
import { Button } from '../../../common';
import { toast } from 'react-toastify';

// ✅ GOOD - Relative to global location
import { Button } from './ui';
import { toast } from 'react-toastify';
```

#### C. Add Configuration Props
```typescript
interface ComponentProps {
  // Required data
  data: DataType;
  
  // Optional callbacks
  onChange?: (value: any) => void;
  onSubmit?: (data: any) => void;
  
  // UI configuration
  readOnly?: boolean;
  showTitle?: boolean;
  variant?: 'default' | 'compact' | 'detailed';
  
  // Feature flags
  enableSearch?: boolean;
  allowMultiple?: boolean;
}
```

### Step 3: File Structure

```
src/components/global/
├── index.js                    # Main export file
├── ui/                         # Basic UI components
│   ├── Button.tsx
│   ├── Input.tsx
│   └── Select.tsx
├── modals/                     # Modal components
│   ├── GenericModal.tsx
│   └── DocumentImportModal.tsx
├── forms/                      # Form components
│   ├── AddressForm.tsx
│   └── PaymentForm.tsx
├── display/                    # Display components
│   ├── DataTable.tsx
│   └── SummaryCard.tsx
├── BillSummary.tsx            # Business components
├── PaymentDetails.tsx
└── TransportDetails.tsx
```

### Step 4: Update Imports

#### A. Add to global/index.js
```javascript
// Group by category
// Display Components
export { default as BillSummary } from './BillSummary';
export { default as PaymentDetails } from './PaymentDetails';

// Modal Components  
export { default as DocumentImportModal } from './modals/DocumentImportModal';
```

#### B. Update Module Imports
```typescript
// ❌ OLD - Local import
import BillSummary from './components/BillSummary';
import PaymentDetails from './components/PaymentDetails';

// ✅ NEW - Global import
import { BillSummary, PaymentDetails } from '../global';
```

### Step 5: Testing After Migration

1. **Build Test**
```bash
cd frontend && npm run build
```

2. **Runtime Test**
- Check all modules that use the component
- Verify props are passed correctly
- Test all interactive features

3. **Import Test**
```bash
# Find all imports of old component
grep -r "from.*components/BillSummary" src/

# Verify new imports work
grep -r "BillSummary.*from.*global" src/
```

## 🗑️ Cleanup Steps

### Step 1: Archive Old Components
```bash
# Create archive directory
mkdir -p src/components/archive/[module-name]

# Move old components
mv src/components/sales/components/BillSummary.tsx src/components/archive/sales/
```

### Step 2: Remove Unused Imports
```typescript
// Check for unused imports in each file
// Remove if no longer needed:
- Module-specific contexts
- Old component imports
- Unused utilities
```

### Step 3: Update Documentation
```markdown
# In module README or docs
## Components
- BillSummary - ✅ Moved to global
- PaymentDetails - ✅ Moved to global
- TransportDetails - ✅ Moved to global
```

## 🏗️ Best Practices

### 1. Component Design
- **Single Responsibility**: Each component should do one thing well
- **Props over Context**: Use props for data flow, context only for truly global state
- **Composition over Inheritance**: Use component composition
- **TypeScript First**: Always add proper TypeScript interfaces

### 2. Naming Conventions
```typescript
// Components - PascalCase
BillSummary.tsx
PaymentDetails.tsx

// Props interfaces - ComponentNameProps
interface BillSummaryProps {}

// Callbacks - onAction format
onSubmit, onChange, onClose

// Boolean props - is/has/should prefix
isLoading, hasError, shouldValidate
```

### 3. Import Organization
```typescript
// 1. React and core libraries
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { toast } from 'react-toastify';
import { Calendar } from 'lucide-react';

// 3. Global components
import { Button, Select, DatePicker } from '../global';

// 4. Local components
import LocalComponent from './LocalComponent';

// 5. Utils and services
import { formatCurrency } from '../../utils';

// 6. Styles
import './styles.css';
```

### 4. Error Handling
```typescript
// Always include error handling
try {
  await apiCall();
  toast.success('Operation successful');
} catch (error) {
  toast.error('Operation failed');
  console.error('Component error:', error);
}
```

### 5. Performance
```typescript
// Use React.memo for expensive renders
export default React.memo(BillSummary);

// Use useCallback for callbacks
const handleChange = useCallback((value) => {
  onChange?.(value);
}, [onChange]);

// Use useMemo for expensive calculations
const total = useMemo(() => {
  return items.reduce((sum, item) => sum + item.amount, 0);
}, [items]);
```

## 📝 Migration Checklist Template

```markdown
## Component: [ComponentName]

### Pre-Migration
- [ ] Analyzed dependencies
- [ ] Identified all usage locations
- [ ] Documented current props/interface

### Migration
- [ ] Created generic version
- [ ] Removed context dependencies
- [ ] Added TypeScript interfaces
- [ ] Fixed import paths
- [ ] Added to global/index.js

### Testing
- [ ] Build passes
- [ ] All modules using component work
- [ ] Props properly typed
- [ ] Error handling in place

### Cleanup
- [ ] Old component archived
- [ ] All imports updated
- [ ] Documentation updated
- [ ] Git commit with clear message
```

## 🚀 Quick Commands

```bash
# Find component usage
find src -name "*.tsx" -o -name "*.jsx" | xargs grep -l "ComponentName"

# Check for broken imports
npm run build 2>&1 | grep "Cannot find module"

# Run type checking
npx tsc --noEmit

# Test specific module
npm test -- --testPathPattern=module-name
```

## 🎯 Success Criteria

1. **No Duplicate Components**: Same functionality not repeated
2. **Clear Separation**: Global vs module-specific is obvious
3. **Type Safety**: All components have TypeScript interfaces
4. **Error Handling**: Toast notifications for all user actions
5. **Performance**: No unnecessary re-renders
6. **Maintainability**: Easy to understand and modify

## 📊 Progress Tracking

| Module | Components | Migrated | Tested | Cleaned |
|--------|------------|----------|---------|---------|
| Sales | BillSummary | ✅ | ⏳ | ⏳ |
| Sales | PaymentDetails | ✅ | ⏳ | ⏳ |
| Sales | TransportDetails | ✅ | ⏳ | ⏳ |
| Sales | ImportModals | ✅ | ⏳ | ⏳ |
| Purchase | TBD | ⏳ | ⏳ | ⏳ |
| Inventory | TBD | ⏳ | ⏳ | ⏳ |

## 🔄 Continuous Improvement

After each migration:
1. Update this guide with lessons learned
2. Add new patterns discovered
3. Document any gotchas
4. Share with team

---

**Remember**: The goal is to make the codebase more maintainable, not just to move files around. Each migration should improve the component's design and usability.