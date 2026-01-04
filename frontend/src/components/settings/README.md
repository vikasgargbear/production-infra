# Settings Module

Application and system settings management with sub-module structure.

## Structure

```
settings/
├── SettingsHub.tsx          # Main navigation hub
├── index.ts                 # Barrel export
├── README.md
│
├── company/                 # Company settings sub-module
│   ├── CompanySettings.tsx  # Business profile (496 lines)
│   └── index.ts
│
├── employees/               # Employee management sub-module
│   ├── EmployeeManagement.tsx # Staff CRUD (1,007 lines)
│   └── index.ts
│
├── master/                  # Master settings sub-module
│   ├── MasterSettings.tsx   # Feature flags (326 lines)
│   └── index.ts
│
├── types/                   # Shared types
│   ├── settingsSharedTypes.ts
│   └── index.ts
│
└── hooks/                   # Shared hooks (empty)
```

## Components

| Component | Lines | Description |
|-----------|-------|-------------|
| SettingsHub | 60 | Main navigation |
| CompanySettings | 496 | Business profile & info |
| EmployeeManagement | 1,007 | Employee CRUD (backlog: decompose) |
| MasterSettings | 326 | Feature flags & config |

## Usage

```typescript
import { SettingsHub, CompanySettings, EmployeeManagement } from '@/components/settings';
```

## Types

All types defined in `types/settingsSharedTypes.ts`:
- `CompanyProfile` - Company info
- `Employee` - Employee data
- `EmployeeDocument` - Document uploads
- `Department`, `Branch` - Org structure
- `FeatureFlag` - Feature toggles

## Status

✅ Converted to TypeScript  
✅ Sub-module structure created  
✅ SettingsHub navigation  
✅ Shared types defined  
✅ Deleted duplicate (EmployeeManagement.tsx)  
⏳ Backlog: Decompose EmployeeManagement (1,007 lines)
