# 🧩 Component Library

> **Shared UI components** used across the application

---

## 📋 Component Categories

| Category | Components | Description |
|----------|------------|-------------|
| [UI Components](#ui-components) | Button, Badge, Card | Basic building blocks |
| [Form Components](#form-components) | Input, Select, DatePicker | Form inputs |
| [Layout Components](#layout-components) | ModuleHeader, Sidebar | Page structure |
| [Data Display](#data-display) | DataTable, Pagination | Data visualization |
| [Modals](#modals) | Modal, ConfirmDialog | Overlays |
| [Search Components](#search-components) | CustomerSearch, ProductSearch | Entity search |

---

## 🎨 UI Components

### Button
```typescript
import { Button } from '../global';

<Button 
  variant="primary" | "secondary" | "danger" | "ghost"
  size="sm" | "md" | "lg"
  loading={boolean}
  disabled={boolean}
  onClick={() => {}}
>
  Click Me
</Button>
```

### StatusBadge
```typescript
<StatusBadge 
  status="paid" | "pending" | "overdue" | "draft"
/>
```

---

## 📝 Form Components

### StandardDatePicker
```typescript
<StandardDatePicker
  label="Invoice Date"
  value={date}
  onChange={(value) => setDate(value)}
  required={true}
  minDate="2024-01-01"
  maxDate="2024-12-31"
/>
```

### CustomerSearch
```typescript
<CustomerSearch
  value={selectedCustomer}
  onChange={(customer) => handleSelect(customer)}
  displayMode="compact" | "full"
  placeholder="Search customer..."
  showCreateButton={true}
  clearable={true}
/>
```

### ProductSearch
```typescript
<ProductSearch
  onAddItem={(product) => addToList(product)}
  onCreateProduct={() => openCreateModal()}
  ref={productSearchRef}
/>
```

---

## 🏗️ Layout Components

### ModuleHeader
```typescript
<ModuleHeader
  title="Invoice"
  documentNumber="INV-2024-001"
  status="draft" | "confirmed" | "cancelled"
  icon={FileText}
  iconColor="text-blue-600"
  onClose={() => {}}
  historyType="invoice"
  showSaveDraft={true}
  onSaveDraft={() => {}}
  additionalActions={[
    { label: "Import", icon: Download, onClick: () => {} }
  ]}
/>
```

### DocumentFooter
```typescript
<DocumentFooter
  totalItems={items.length}
  totalAmount={calculateTotal()}
  onCancel={handleCancel}
  onContinue={handleContinue}
  cancelLabel="Reset"
  continueLabel="Continue"
  continueDisabled={!isValid}
/>
```

---

## 📊 Data Display

### DataTable
```typescript
<DataTable
  columns={[
    { key: 'name', label: 'Name', sortable: true },
    { key: 'amount', label: 'Amount', align: 'right' },
    { key: 'status', label: 'Status', render: (row) => <Badge /> }
  ]}
  data={items}
  onSort={(key, direction) => {}}
  onRowClick={(row) => {}}
  selectable={true}
  selectedIds={selectedIds}
  onSelect={(ids) => {}}
/>
```

### Pagination
```typescript
<Pagination
  currentPage={page}
  totalPages={totalPages}
  totalItems={total}
  itemsPerPage={perPage}
  onPageChange={(page) => setPage(page)}
/>
```

---

## 🔍 Search Components

### CustomerSearch
- Autocomplete with debounced search
- Shows recent customers
- Displays outstanding balance
- Create new customer button

### ProductSearch
- Barcode scan support
- Batch selection
- Shows stock availability
- Last deal information

---

## 🪟 Modals

### GenericSuccessModal
```typescript
<GenericSuccessModal
  isOpen={showSuccess}
  onClose={() => setShowSuccess(false)}
  title="Invoice Created!"
  documentNumber="INV-2024-001"
  documentType="invoice"
  totalAmount={1500.00}
  onPrint={() => {}}
  onWhatsApp={() => {}}
  onDownload={() => {}}
  autoCloseDelay={5}
/>
```

### GSTCalculator
```typescript
<GSTCalculator
  orderData={invoice}
  onCalculationComplete={() => {}}
  showDetails={true}
/>
```

---

## 📍 Import Paths

```typescript
// Global components (recommended)
import { 
  Button, 
  ModuleHeader, 
  CustomerSearch,
  ProductSearch,
  DataTable,
  Pagination,
  StandardDatePicker
} from '../global';

// Individual imports
import Button from '../../components/global/ui/Button';
```

---

## 🎯 Component Props Pattern

All components follow consistent prop patterns:

```typescript
interface ComponentProps {
  // Core props
  value?: any;
  onChange?: (value: any) => void;
  
  // State
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  
  // Styling
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary';
  
  // Refs
  ref?: React.Ref<HTMLElement>;
}
```

---

## 📚 Further Reading

- [Form Components Details](./form-components.md)
- [Layout Components](./layout-components.md)
- [Component Patterns](./patterns.md)
