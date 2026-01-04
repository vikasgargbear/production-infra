# Master Module

**Status:** ✅ Optimized (Jan 2026)

Master data management module for products, customers, suppliers, and system settings.

---

## 🏗️ Architecture

```
master/
├── MasterHub.tsx           # Main entry point
├── masters/                # Master data components (9)
│   ├── BatchMaster.tsx
│   ├── CategoryMaster.tsx
│   ├── CustomerMaster.tsx
│   ├── EmployeeMaster.tsx
│   ├── ProductMaster.tsx
│   ├── SupplierMaster.tsx
│   ├── TaxMaster.tsx
│   ├── UnitMaster.tsx
│   └── WarehouseMaster.tsx
├── products/               # Product-specific components (2)
│   ├── ProductBarcodeManager.tsx
│   └── Products.tsx
├── settings/               # System settings (8)
│   ├── CompanyProfile.tsx
│   ├── CompanySettings.tsx
│   ├── FeatureSettings.tsx
│   ├── GST_Settings.tsx
│   ├── NotificationsAlerts.tsx
│   ├── PrintSettings.tsx
│   ├── SystemSettings.tsx
│   └── UserManagement.tsx
├── modals/                 # Edit modals (3)
│   ├── CustomerEditModal.tsx
│   ├── ProductEditModal.tsx
│   └── SupplierEditModal.tsx
├── hooks/                  # Shared hooks (3)
│   ├── useMasterData.ts
│   ├── usePagination.ts
│   └── useSearch.ts
├── types/                  # Type definitions (2)
│   ├── index.ts
│   └── masterTypes.ts
├── schemas/                # Validation schemas (3)
│   ├── customerSchema.ts
│   ├── productSchema.ts
│   └── supplierSchema.ts
└── utils/                  # Utilities (5)
    ├── BulkOperations.tsx
    ├── DataValidationEngine.tsx
    ├── ImportExport.tsx
    ├── masterUtils.ts
    └── validationHelpers.ts
```

---

## 📋 Module Categories

### Master Data (`masters/`)
Core entities for business operations:
- **Products** - Product catalog management
- **Customers** - Customer records
- **Suppliers** - Supplier records
- **Batches** - Batch/lot tracking
- **Categories** - Product categorization
- **Units** - Units of measure
- **Tax** - Tax configurations
- **Warehouse** - Location management
- **Employees** - Employee records

### Settings (`settings/`)
System configuration and preferences:
- **Company Profile** - Business information
- **Company Settings** - General settings
- **System Settings** - Technical configuration
- **Feature Settings** - Feature toggles
- **Print Settings** - Print preferences
- **GST Settings** - Tax configuration
- **User Management** - User accounts & permissions
- **Notifications & Alerts** - Alert configuration

### Utilities (`utils/`)
Shared operations:
- **Bulk Operations** - Mass updates/imports
- **Data Validation** - Schema validation engine
- **Import/Export** - CSV/Excel operations
- **Validation Helpers** - Reusable validators

---

## 🚀 Usage

### Using Master Data Hook
```typescript
import { useMasterData } from './hooks';

const { data, loading, refresh } = useMasterData('products');
```

### Using Pagination Hook
```typescript
import { usePagination } from './hooks';

const { 
  currentPage, 
  pageSize, 
  goToPage, 
  nextPage, 
  prevPage 
} = usePagination(totalItems);
```

### Using Search Hook
```typescript
import { useSearch } from './hooks';

const { searchTerm, setSearchTerm, filteredData } = 
  useSearch(data, ['name', 'code']);
```

---

## 🎯 Key Features

### Modular Organization
- 9 master data types
- 8 system settings categories
- Centralized modals for editing

### Validation
- Schema-based validation (`schemas/`)
- Data validation engine
- Reusable validators

### Bulk Operations
- CSV/Excel import
- Bulk updates
- Export functionality

### Hooks Infrastructure
- `useMasterData` - Data fetching & caching
- `usePagination` - Table pagination
- `useSearch` - Client-side search

---

## 🔧 Development

### Adding New Master
1. Create component in `masters/`
2. Add route in `MasterHub.tsx`
3. Create schema in `schemas/` (if needed)
4. Add types in `types/masterTypes.ts`

### Running TypeScript Check
```bash
npx tsc --noEmit src/components/master/**/*.ts
```

---

## 📊 Large Files

The following files are >500 lines and candidates for future decomposition:

| File | Lines | Status |
|------|-------|--------|
| `settings/SystemSettings.tsx` | 1,017 | 🟡 Could split into tabs |
| `modals/SupplierEditModal.tsx` | 984 | 🟡 Could extract form sections |
| `settings/CompanyProfile.tsx` | 978 | 🟡 Could split into sections |
| `masters/BatchMaster.tsx` | 959 | 🟡 Could extract table logic |
| `modals/CustomerEditModal.tsx` | 931 | 🟡 Could extract form components |
| `settings/UserManagement.tsx` | 918 | 🟡 Could split user CRUD |

**Note:** These files are functionally appropriate for their complexity. Decomposition is a low-priority optimization.

---

**Last Updated:** January 4, 2026
