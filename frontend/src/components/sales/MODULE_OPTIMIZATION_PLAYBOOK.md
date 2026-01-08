as per 
as# Module Optimization Playbook

**Purpose:** A comprehensive guide to optimize any module (inventory, master, returns, etc.) using the patterns and principles proven in the sales module optimization.

**Author:** Based on Sales Module Optimization (Jan 2026)  
**Status:** Production-tested ✅

---

## Table of Contents
1. [Overview & Philosophy](#overview--philosophy)
2. [Assessment Phase](#assessment-phase)
3. [Planning Phase](#planning-phase)
4. [Execution Phases](#execution-phases)
5. [Verification](#verification)
6. [Reusable Patterns](#reusable-patterns)
7. [Quick Start Checklist](#quick-start-checklist)

---

## Overview & Philosophy

### Core Principles

1. **DRY (Don't Repeat Yourself)**
   - Extract common code into shared utilities
   - Create generic functions with type parameters
   - Use composition over duplication

2. **Single Responsibility**
   - Each file should have ONE clear purpose
   - Hooks should be focused and composable
   - Utils should be pure functions

3. **Progressive Enhancement**
   - Start with shared infrastructure
   - Clean dead code first
   - Decompose complex files incrementally
   - Apply patterns module-by-module

4. **Type Safety First**
   - Define shared base types
   - Use generics for reusable code
   - Module-specific types extend base types

5. **Offline-First**
   - Consistent patterns for offline operations
   - Shared helpers for common tasks
   - Clear documentation of constraints

---

## Assessment Phase

### Step 1: Identify Duplication (1-2 hours)

**Goal:** Find repeated code across sub-modules

**Checklist:**
- [ ] List all sub-modules (e.g., invoice, challan, order)
- [ ] Identify similar hooks (e.g., `useInvoiceLogic`, `useChallanLogic`)
- [ ] Identify similar UI components
- [ ] Identify similar utility functions
- [ ] Identify similar types/interfaces

**Tools:**
```bash
# Find duplicate code patterns
grep -r "handleCustomerSelect" src/components/[module]
grep -r "generateTempId" src/components/[module]
grep -r "interface.*Item" src/components/[module]
```

**Results Template:**
```markdown
## Duplication Found

### Hooks
- useInvoiceLogic (1073 lines)
- useChallanLogic (552 lines)
- useSalesOrderLogic (estimate)

Common patterns:
- Customer selection logic
- Employee loading
- Item management
- Calculation logic
- Save logic (online/offline)

### Types
- InvoiceItem, ChallanItem, OrderItem (80% overlap)
- Customer interfaces (exact duplicates)
- Employee interfaces (exact duplicates)

### Utilities
- Product → Item transformation (duplicated 3x)
- Draft auto-save (duplicated 2x)
```

### Step 2: Identify Dead Code (30 min)

**Goal:** Find unused files/exports

**Checklist:**
- [ ] Search for exports never imported
- [ ] Find components never rendered
- [ ] Identify unused types
- [ ] Check for commented-out code

**Tools:**
```bash
# Find files with no imports
grep -r "export.*SalesHeader" src/
# If no results, likely unused

# Check TypeScript unused exports (if available)
npx ts-prune | grep [module]
```

### Step 3: Identify Complex Files (15 min)

**Goal:** Find files >500 lines that need decomposition

**Tools:**
```bash
# Find large files
find src/components/[module] -name "*.ts" -exec wc -l {} \; | sort -nr | head -10
```

**Threshold:** Files >500 lines are candidates for decomposition

---

## Planning Phase

### Step 1: Define Shared Types (30 min)

**Goal:** Create type hierarchy

**Pattern:**
```
Base Types (shared)
  ↓
Module Types (extends base)
  ↓
Component Types (specific)
```

**Template:**
```typescript
// moduleSharedTypes.ts

// Base entity (e.g., customer, employee)
export interface BaseEntity {
  id: string | number;
  name: string;
  // minimal common fields
}

// Base line item
export interface BaseLineItem {
  id?: number | string;
  product_id: string | number;
  product_name: string;
  quantity: number;
  // common fields only
}

// Base document
export interface BaseDocument {
  document_number: string;
  document_date: string;
  items: BaseLineItem[];
  // common fields only
}
```

### Step 2: Design Shared Utilities (1 hour)

**Categories:**

1. **Data Transformation**
   - Product → LineItem
   - API → Local format
   - Form → Backend format

2. **Offline Helpers**
   - Generate temp IDs
   - Stock operations (if applicable)
   - Offline document prep

3. **Hooks**
   - Entity loading (customers, employees, etc.)
   - Draft auto-save
   - Common state management

**Decision Matrix:**

| Utility | Create If... | Don't Create If... |
|---------|-------------|-------------------|
| Generic transform | Used by 2+ modules | Only 1 module needs it |
| Offline helper | Pattern repeats 2+ times | Module-specific logic |
| Hook | State management identical | Each module has unique needs |

### Step 3: Create Execution Plan (30 min)

**Standard Phase Order:**

1. **Infrastructure** - Create shared types, hooks, utils
2. **Cleanup** - Remove dead code
3. **Composition** - Refactor one module to use shared code
4. **Decomposition** - Break down complex hooks (>800 lines)
5. **Distribution** - Apply to remaining modules
6. **Verification** - Test and document

---

## Execution Phases

### Phase 1: Create Shared Infrastructure

#### 1.1 Shared Types

**File:** `src/components/[module]/types/[module]SharedTypes.ts`

**Template:**
```typescript
/**
 * [Module] Shared Types
 * 
 * Common types used across [sub-module1], [sub-module2], [sub-module3].
 */

// Base entity types
export interface Base[Entity] {
  // minimal common fields
}

// Base line item
export interface BaseLineItem {
  // minimal common fields
}

// Callbacks
export type On[Entity]Select<T extends Base[Entity]> = (item: T | null) => void;
```

**Checklist:**
- [ ] Include only truly shared fields
- [ ] Use optional fields (`?`) for conditionals
- [ ] Add JSDoc comments
- [ ] Export as named exports

#### 1.2 Shared Utilities

**File:** `src/components/[module]/utils/[purpose]Helpers.ts`

**Examples:**

**Data Transform:**
```typescript
/**
 * Transform [source] data to [target] format
 * 
 * @param source - Source data
 * @param defaults - Default values
 * @returns Transformed data
 */
export const transform[Source]To[Target] = <T extends Base[Type]>(
  source: SourceType,
  defaults?: Partial<T>
): T => {
  // Generic transformation logic
  return {
    // base fields
    ...defaults
  } as unknown as T;
};
```

**Offline Helpers:**
```typescript
/**
 * Generate temporary ID for offline-first saves
 */
export const generateTempId = (): string => {
  return `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Prepare document for offline storage
 * 
 * ⚠️ Document any constraints (e.g., "use only for X")
 */
export const prepareOffline[Document] = <T>(
  data: T,
  tempId: string
): T & OfflineMetadata => {
  return {
    ...data,
    temp_id: tempId,
    _localId: tempId,
    sync_status: 'pending',
    created_offline: true
  };
};
```

**Checklist:**
- [ ] Pure functions (no side effects)
- [ ] Generic with type parameters
- [ ] Clear JSDoc with warnings
- [ ] Exported as named exports

#### 1.3 Shared Hooks

**File:** `src/components/[module]/hooks/use[Purpose].ts`

**Template:**
```typescript
/**
 * use[Purpose] Hook
 * 
 * [Description of what this hook does]
 * 
 * @example
 * ```ts
 * const { data, loading } = use[Purpose]({ param });
 * ```
 */

export interface Use[Purpose]Options {
  // configuration
}

export interface Use[Purpose]Return {
  // return type
}

export function use[Purpose](options: Use[Purpose]Options): Use[Purpose]Return {
  // Hook logic
}
```

**Common Patterns:**

**Entity Loading:**
```typescript
export function use[Entities]() {
  const [entities, setEntities] = useState<Base[Entity][]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Load with offline fallback
  }, []);
  
  return { entities, loading, reload };
}
```

**Draft Auto-Save:**
```typescript
export function useDraftAutoSave<T>({
  data,
  storageKey,
  shouldSave = () => true,
  intervalMs = 30000
}: Options) {
  const dataRef = useRef(data);
  
  useEffect(() => { dataRef.current = data; }, [data]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (shouldSave(dataRef.current)) {
        storageService.setItem(storageKey, dataRef.current);
      }
    }, intervalMs);
    
    return () => clearInterval(interval);
  }, [storageKey, intervalMs, shouldSave]);
}
```

**Checklist:**
- [ ] Clear interface for options and return
- [ ] Example in JSDoc
- [ ] Handle loading/error states
- [ ] Clean up in useEffect returns

#### 1.4 Barrel Exports

**Always create:**
- `[module]/types/index.ts`
- `[module]/utils/index.ts`
- `[module]/hooks/index.ts`

**Template:**
```typescript
/**
 * [Module] [Category] Barrel Export
 */

export { utility1, utility2 } from './file1';
export type { Type1, Type2 } from './file1';
```

### Phase 2: Cleanup Dead Code

**Process:**

1. **Identify unused:**
   ```bash
   # Search for component usage
   grep -r "import.*SomeComponent" src/
   ```

2. **Verify safe to delete:**
   - Check imports (should be 0)
   - Check in UI (search in JSX)
   - Run TypeScript (ensure no errors after removal)

3. **Delete file**

4. **Update barrel exports:**
   - Remove from `index.ts` exports
   - Update any re-exports

5. **Verify build:**
   ```bash
   npx tsc --noEmit
   ```

**Checklist:**
- [ ] File has 0 imports
- [ ] Not referenced in JSX
- [ ] Removed from barrel exports
- [ ] Build passes

### Phase 3: Compose Shared Code

**Goal:** Refactor ONE module to use shared infrastructure

**Why one first?** Validate patterns work before applying broadly

#### 3.1 Choose Target Module

**Criteria:**
- Medium complexity (not simplest, not most complex)
- Good test coverage
- Frequently used

**Example:** Challan (simpler than invoice, more active than order)

#### 3.2 Refactor Pattern

**Before:**
```typescript
// useChallanLogic.ts (552 lines)
export function useChallanLogic() {
  const [challan, setChallan] = useState(...);
  const [customer, setCustomer] = useState(null);
  const [employees, setEmployees] = useState([]);
  
  // Load employees (50 lines)
  useEffect(() => { /* employee loading */ }, []);
  
  // Handle customer select (30 lines)
  const handleCustomerSelect = useCallback(...);
  
  // Handle product select (40 lines)
  const handleProductSelect = useCallback(...);
  
  // ... 400+ more lines
}
```

**After:**
```typescript
// useChallanLogic.ts (380 lines)
import { useSalesTransaction } from '../../hooks';
import { Use[Module]Transaction } from '../../types';

export function useChallanLogic() {
  // COMPOSE shared logic
  const {
    document: challan,
    setDocument: setChallan,
    selectedCustomer,
    employees,
    handleCustomerSelect,
    handleProductSelect,
    // ... other shared handlers
  } = use[Module]Transaction<Challan, Customer, ChallanItem>({
    getInitialDocument: getInitialChallan,
    documentType: 'challan'
  });
  
  // Module-specific logic only
  const [sameAsBilling, setSameAsBilling] = useState(true);
  
  const generateChallanNumber = useCallback(async () => {
    // Challan-specific logic
  }, []);
  
  return {
    // Shared from composition
    challan,
    selectedCustomer,
    employees,
    handleCustomerSelect,
    // Module-specific
    generateChallanNumber,
    sameAsBilling,
    setSameAsBilling
  };
}
```

**Pattern:**
1. Import shared hook/utility
2. Call it to get shared state/handlers
3. Add only module-specific logic
4. Return combined interface

### Phase 4: Decompose Complex Hooks

**Trigger:** Hook >800 lines

**Goal:** Break into focused pieces

#### 4.1 Identify Extractable Sections

**Common sections:**
- **Utilities** - Pure functions (product transform)
- **Side effects** - Auto-save, loading
- **Save logic** - Large async operations
- **Validation** - Business rules

#### 4.2 Extraction Order

1. **Utilities first** (easiest, pure functions)
2. **Hooks second** (side effects)
3. **Save logic last** (most complex)

#### 4.3 Create Module Utils

**File:** `[module]/[submodule]/utils/[purpose]Utils.ts`

**Pattern:**
```typescript
// [submodule]/utils/[submodule]ItemUtils.ts
import { prepareItemForTransaction } from '../../utils';

export const prepareItemFor[Submodule] = (product) => {
  return prepareItemForTransaction<[Submodule]Item>(product);
};
```

**This is a wrapper pattern:**
- Uses shared generic function
- Returns module-specific type
- Can add module-specific defaults

#### 4.4 Create Module Hooks

**File:** `[module]/[submodule]/hooks/use[Submodule][Purpose].ts`

**Examples:**

**Draft Hook:**
```typescript
// use[Submodule]Draft.ts
import { useDraftAutoSave } from '../../hooks';

export function use[Submodule]Draft({ document, customer }) {
  useDraftAutoSave({
    data: { ...document, customer_id: customer?.id },
    storageKey: STORAGE_KEYS.[SUBMODULE]_DRAFT,
    shouldSave: (data) => data.items.length > 0 && !!customer
  });
}
```

**Save Hook:**
```typescript
// use[Submodule]Save.ts
import { generateTempId, prepareOffline[Document] } from '../../utils';

export function use[Submodule]Save(props) {
  const [saving, setSaving] = useState(false);
  
  const handleSave = useCallback(async () => {
    setSaving(true);
    
    // Validation
    if (!props.customer) throw new Error('...');
    
    // Use shared helpers
    const tempId = generateTempId();
    
    // Save logic
    // ...
    
    setSaving(false);
  }, [props]);
  
  return { saving, handleSave };
}
```

**Benefits:**
- Each hook has single responsibility
- Can be tested independently
- Can be reused by other modules
- Main hook becomes composable

### Phase 5: Apply to Remaining Modules

**For each remaining module:**

1. **Create utils wrapper:**
   ```
   [module]/[submodule]/utils/[submodule]ItemUtils.ts
   ```

2. **Add draft (if needed):**
   ```typescript
   use[Submodule]Draft({ document, customer })
   ```

3. **Update save (if applicable):**
   - Use `generateTempId()`
   - Use shared offline helpers
   - Follow same pattern

4. **Verify:**
   ```bash
   npx tsc --noEmit [module]/[submodule]/**/*.ts
   ```

---

## Verification

### TypeScript Compilation

**All files must compile:**
```bash
# Check specific module
npx tsc --noEmit src/components/[module]/**/*.ts

# Check all
npx tsc --noEmit
```

**Target:** 0 new errors

### File Count Verification

**Track created files:**
```bash
find src/components/[module] -name "*.ts" | grep -E "(utils|hooks)" | wc -l
```

**Expected for typical module:**
- Shared hooks: 2-4 files
- Shared utils: 2-3 files
- Module wrappers: 1 per sub-module

### Line Count Reduction

**Before/After comparison:**
```bash
wc -l src/components/[module]/[submodule]/hooks/use[Submodule]Logic.ts
```

**Target:** 20-40% reduction in main hooks

### Build Test

**Full build:**
```bash
npm run build
```

**Target:** Successful build with no new warnings

---

## Reusable Patterns

### Pattern 1: Generic Transform with Wrappers

**Use when:** Multiple modules need same transformation with different types

**Shared:**
```typescript
// shared/utils/transform.ts
export const genericTransform = <T extends BaseType>(
  source: SourceType,
  defaults?: Partial<T>
): T => {
  return {
    ...baseTransform(source),
    ...defaults
  } as unknown as T;
};
```

**Module Wrapper:**
```typescript
// module/utils/moduleTransform.ts
import { genericTransform } from '../shared';

export const transformForModule = (source) => {
  return genericTransform<ModuleType>(source);
};
```

### Pattern 2: Composable Hooks

**Use when:** Hooks share 70%+ of logic

**Shared:**
```typescript
// shared/hooks/useBaseLogic.ts
export function useBaseLogic<TDoc, TCustomer, TItem>(config) {
  const [document, setDocument] = useState<TDoc>(config.getInitial());
  const [customer, setCustomer] = useState<TCustomer | null>(null);
  
  // Shared handlers
  const handleCustomerSelect = useCallback(...);
  
  return {
    document,
    setDocument,
    customer,
    handleCustomerSelect,
    // ... more shared
  };
}
```

**Module Usage:**
```typescript
// module/hooks/useModuleLogic.ts
import { useBaseLogic } from '../../shared';

export function useModuleLogic() {
  const shared = useBaseLogic<Doc, Customer, Item>({
    getInitial: getInitialDoc
  });
  
  // Module-specific logic
  const moduleSpecific = useState(...);
  
  return {
    ...shared,
    moduleSpecific
  };
}
```

### Pattern 3: Offline-First Save with Helpers

**Use when:** Modules need offline capability

**Shared Helpers:**
```typescript
// shared/utils/offlineHelpers.ts
export const generateTempId = () => `LOCAL_${Date.now()}_${...}`;

export const saveOffline = async <T>(
  collection: string,
  data: T,
  tempId: string
) => {
  await offlineDB.add(collection, {
    ...data,
    temp_id: tempId,
    sync_status: 'pending'
  });
};
```

**Module Save:**
```typescript
// module/hooks/useModuleSave.ts
import { generateTempId, saveOffline } from '../../shared';

export function useModuleSave() {
  const handleSave = async () => {
    const tempId = generateTempId();
    await saveOffline('collection', data, tempId);
    // ... background sync
  };
}
```

### Pattern 4: Draft Auto-Save

**Use when:** Need to save work-in-progress

**Shared Hook:**
```typescript
// shared/hooks/useDraftAutoSave.ts
export function useDraftAutoSave<T>({
  data,
  storageKey,
  shouldSave,
  intervalMs = 30000
}) {
  const dataRef = useRef(data);
  
  useEffect(() => { dataRef.current = data; }, [data]);
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (shouldSave(dataRef.current)) {
        storage.setItem(storageKey, dataRef.current);
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, []);
}
```

**Module Usage:**
```typescript
// module/hooks/useModuleDraft.ts
import { useDraftAutoSave } from '../../shared';

export function useModuleDraft({ doc, customer }) {
  useDraftAutoSave({
    data: { ...doc, customer_id: customer?.id },
    storageKey: KEYS.MODULE_DRAFT,
    shouldSave: (d) => d.items.length > 0
  });
}
```

---

## Quick Start Checklist

### Planning (1-2 hours)
- [ ] List all sub-modules
- [ ] Identify duplicated hooks/utils/types
- [ ] Find files >500 lines
- [ ] Find dead code
- [ ] Design shared type hierarchy
- [ ] Plan utility categories

### Infrastructure (2-3 hours)
- [ ] Create `[module]/types/[module]SharedTypes.ts`
- [ ] Create `[module]/utils/[purpose]Helpers.ts` (2-3 files)
- [ ] Create `[module]/hooks/use[Purpose].ts` (2-4 files)
- [ ] Create barrel exports for all
- [ ] Update main `[module]/index.ts`
- [ ] Verify TypeScript compiles

### Cleanup (30 min)
- [ ] Delete unused files
- [ ] Update barrel exports
- [ ] Verify build

### Composition (2-3 hours per module)
- [ ] Pick first sub-module
- [ ] Refactor to use shared hooks/utils
- [ ] Test manually
- [ ] Verify TypeScript

### Decomposition (3-4 hours per large hook)
- [ ] Extract utils to `[submodule]/utils/`
- [ ] Extract side effects to `[submodule]/hooks/use[Purpose]Draft.ts`
- [ ] Extract save to `[submodule]/hooks/use[Purpose]Save.ts`
- [ ] Update main hook to compose
- [ ] Verify functionality

### Distribution (1-2 hours per remaining module)
- [ ] Create `[submodule]/utils/[submodule]ItemUtils.ts`
- [ ] Add draft if needed
- [ ] Update save to use helpers
- [ ] Verify compilation

### Verification (1 hour)
- [ ] Run TypeScript on all files
- [ ] Check line count reductions
- [ ] Full build test
- [ ] Manual smoke test

---

## Success Metrics

**Code Quality:**
- ✅ 20-40% line reduction in main hooks
- ✅ No files >800 lines
- ✅ 0 TypeScript errors
- ✅ No code duplication >50 lines

**Architecture:**
- ✅ Shared utilities used by 2+ modules
- ✅ Clear type hierarchy (Base → Module → Specific)
- ✅ Single responsibility per file
- ✅ Composable hooks

**Documentation:**
- ✅ JSDoc on all public functions
- ✅ Usage examples in comments
- ✅ Warnings for constraints (e.g., "Invoice only")
- ✅ README updated

---

## Common Pitfalls & Solutions

### Pitfall 1: Over-Abstraction

**Problem:** Creating shared utilities used by only 1 module

**Solution:**
- Create shared utility only if used by 2+ modules
- Keep module-specific logic in module files
- Don't force-fit patterns

### Pitfall 2: Type Gymnastics

**Problem:** Complex type assertions to make generic work

**Solution:**
- Use `as unknown as T` for safe conversions
- Add clear JSDoc explaining type flow
- Consider if really needs to be generic

### Pitfall 3: Breaking Changes

**Problem:** Refactoring breaks existing functionality

**Solution:**
- Refactor incrementally (one module at a time)
- Keep old code until new tested
- Use TypeScript to catch issues
- Manual test after each phase

### Pitfall 4: Wrong Abstraction

**Problem:** Shared code doesn't actually fit all use cases

**Solution:**
- Make utilities accept configuration
- Use optional parameters for variations
- Keep escape hatches for edge cases

---

## Module-Specific Considerations

### Inventory Module

**Key shared utilities:**
- Stock level transforms
- Batch selection logic
- Warehouse helpers

**Watch out for:**
- Stock calculations might differ by operation type
- Batch selection may have module-specific rules

### Master Module

**Key shared utilities:**
- Entity CRUD patterns
- Validation helpers
- Form transforms

**Watch out for:**
- Each entity type (products, customers) has unique fields
- Don't force-fit all into same pattern

### Returns Module

**Key shared utilities:**
- Item matching (original → return)
- Calculation helpers
- Status workflows

**Watch out for:**
- Return logic tied to original transaction
- May need references to invoice/challan/order

---

## Example Timeline

**Small Module (1-2 sub-modules):**
- Planning: 1 hour
- Infrastructure: 2 hours
- Cleanup: 30 min
- Refactoring: 3-4 hours
- Verification: 1 hour
- **Total: ~8 hours**

**Medium Module (3-4 sub-modules):**
- Planning: 2 hours
- Infrastructure: 3 hours
- Cleanup: 1 hour
- Refactoring: 6-8 hours
- Verification: 2 hours
- **Total: ~16 hours**

**Large Module (5+ sub-modules):**
- Planning: 3 hours
- Infrastructure: 4 hours
- Cleanup: 2 hours
- Refactoring: 12-16 hours
- Verification: 3 hours
- **Total: ~28 hours**

---

## Next Steps

After completing module optimization:

1. **Document patterns** in module README
2. **Share knowledge** with team
3. **Create PR template** for future optimizations
4. **Establish guidelines** for new code

---

## Conclusion

This playbook provides a proven methodology for module optimization. Key takeaways:

✅ **Start with assessment** - Understand before changing  
✅ **Plan the architecture** - Design shared patterns  
✅ **Build incrementally** - One phase at a time  
✅ **Verify constantly** - TypeScript + tests  
✅ **Document decisions** - Future you will thank you  

The patterns proven in the sales module are transferable to any module following these principles.
