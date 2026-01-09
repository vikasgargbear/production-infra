# 🧩 Global Components

> **Shared component library** used across the application

---

## 📋 Component Index

| Category | Components |
|----------|------------|
| **UI** | Button, Badge, Card, Spinner, Toast |
| **Form** | Input, Select, DatePicker, Checkbox, NumberInput |
| **Layout** | Header, Sidebar, Modal, Drawer |
| **Data** | Table, Pagination, EmptyState |
| **Search** | SearchBar, ProductSearch, CustomerSearch |

---

## 🎛️ Button

### Usage

```tsx
import { Button } from '@/components/global/ui/Button';

// Primary button
<Button variant="primary" onClick={handleSave}>
    Save Invoice
</Button>

// Secondary button
<Button variant="secondary" onClick={handleCancel}>
    Cancel
</Button>

// Danger button
<Button variant="danger" onClick={handleDelete}>
    Delete
</Button>

// With loading state
<Button 
    variant="primary" 
    loading={isLoading}
    disabled={isLoading}
>
    {isLoading ? 'Saving...' : 'Save'}
</Button>

// With icon
<Button variant="primary" leftIcon={<PlusIcon />}>
    Add Item
</Button>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'primary' \| 'secondary' \| 'danger'` | `'primary'` | Button style |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Button size |
| `loading` | `boolean` | `false` | Show loading spinner |
| `disabled` | `boolean` | `false` | Disable button |
| `leftIcon` | `ReactNode` | — | Icon before text |
| `rightIcon` | `ReactNode` | — | Icon after text |
| `fullWidth` | `boolean` | `false` | Full width button |

---

## 📝 Input

### Usage

```tsx
import { Input } from '@/components/global/forms/Input';

// Basic input
<Input
    label="Customer Name"
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="Enter customer name"
/>

// With error
<Input
    label="Email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    error="Invalid email format"
/>

// With help text
<Input
    label="GST Number"
    value={gst}
    onChange={(e) => setGst(e.target.value)}
    helpText="Format: 22AAAAA0000A1Z5"
/>

// Required field
<Input
    label="Phone"
    value={phone}
    onChange={(e) => setPhone(e.target.value)}
    required
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | — | Field label |
| `value` | `string` | — | Input value |
| `onChange` | `(e) => void` | — | Change handler |
| `placeholder` | `string` | — | Placeholder text |
| `error` | `string` | — | Error message |
| `helpText` | `string` | — | Help text below input |
| `required` | `boolean` | `false` | Show required indicator |
| `disabled` | `boolean` | `false` | Disable input |
| `type` | `string` | `'text'` | Input type |

---

## 🔢 NumberInput

### Usage

```tsx
import { NumberInput } from '@/components/global/forms/NumberInput';

// Basic number input
<NumberInput
    label="Quantity"
    value={quantity}
    onChange={setQuantity}
    min={1}
    max={1000}
/>

// Currency input
<NumberInput
    label="Price"
    value={price}
    onChange={setPrice}
    min={0}
    precision={2}
    prefix="₹"
/>

// With step buttons
<NumberInput
    label="Quantity"
    value={qty}
    onChange={setQty}
    showSteppers
    step={1}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `number` | — | Current value |
| `onChange` | `(value: number) => void` | — | Change handler |
| `min` | `number` | — | Minimum value |
| `max` | `number` | — | Maximum value |
| `step` | `number` | `1` | Step increment |
| `precision` | `number` | `0` | Decimal places |
| `prefix` | `string` | — | Prefix (e.g., ₹) |
| `suffix` | `string` | — | Suffix (e.g., %) |
| `showSteppers` | `boolean` | `false` | Show +/- buttons |

---

## 📅 DatePicker

### Usage

```tsx
import { DatePicker } from '@/components/global/forms/DatePicker';

// Single date
<DatePicker
    label="Invoice Date"
    value={invoiceDate}
    onChange={setInvoiceDate}
/>

// Date range
<DatePicker
    label="Date Range"
    mode="range"
    startDate={startDate}
    endDate={endDate}
    onChange={({ start, end }) => {
        setStartDate(start);
        setEndDate(end);
    }}
/>

// With min/max
<DatePicker
    label="Expiry Date"
    value={expiryDate}
    onChange={setExpiryDate}
    minDate={new Date()}
    maxDate={addYears(new Date(), 5)}
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `Date` | — | Selected date |
| `onChange` | `(date: Date) => void` | — | Change handler |
| `mode` | `'single' \| 'range'` | `'single'` | Selection mode |
| `minDate` | `Date` | — | Minimum selectable date |
| `maxDate` | `Date` | — | Maximum selectable date |
| `format` | `string` | `'dd-MM-yyyy'` | Display format |

---

## 🔍 Select

### Usage

```tsx
import { Select } from '@/components/global/forms/Select';

// Basic select
<Select
    label="Status"
    value={status}
    onChange={setStatus}
    options={[
        { value: 'pending', label: 'Pending' },
        { value: 'paid', label: 'Paid' },
        { value: 'overdue', label: 'Overdue' },
    ]}
/>

// Searchable select
<Select
    label="Customer"
    value={customerId}
    onChange={setCustomerId}
    options={customerOptions}
    searchable
    placeholder="Search customers..."
/>

// Multi-select
<Select
    label="Categories"
    value={selectedCategories}
    onChange={setSelectedCategories}
    options={categoryOptions}
    multiple
/>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string \| string[]` | — | Selected value(s) |
| `onChange` | `(value) => void` | — | Change handler |
| `options` | `{value, label}[]` | — | Options array |
| `searchable` | `boolean` | `false` | Enable search |
| `multiple` | `boolean` | `false` | Multi-select |
| `placeholder` | `string` | — | Placeholder text |
| `disabled` | `boolean` | `false` | Disable select |

---

## 🪟 Modal

### Usage

```tsx
import { Modal } from '@/components/global/layout/Modal';

<Modal
    isOpen={isOpen}
    onClose={() => setIsOpen(false)}
    title="Confirm Delete"
    size="sm"
>
    <p>Are you sure you want to delete this invoice?</p>
    
    <Modal.Footer>
        <Button variant="secondary" onClick={() => setIsOpen(false)}>
            Cancel
        </Button>
        <Button variant="danger" onClick={handleDelete}>
            Delete
        </Button>
    </Modal.Footer>
</Modal>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | — | Modal visibility |
| `onClose` | `() => void` | — | Close handler |
| `title` | `string` | — | Modal title |
| `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'md'` | Modal width |
| `closeOnOverlay` | `boolean` | `true` | Close on overlay click |
| `closeOnEscape` | `boolean` | `true` | Close on Escape key |

---

## 📊 Table

### Usage

```tsx
import { Table, Column } from '@/components/global/data/Table';

<Table
    data={invoices}
    loading={isLoading}
    onRowClick={(invoice) => navigate(`/invoices/${invoice.id}`)}
>
    <Column field="invoice_number" header="Invoice #" sortable />
    <Column field="customer_name" header="Customer" sortable />
    <Column 
        field="total" 
        header="Amount" 
        align="right"
        render={(value) => formatCurrency(value)}
    />
    <Column 
        field="status" 
        header="Status"
        render={(status) => <StatusBadge status={status} />}
    />
    <Column
        header="Actions"
        render={(_, invoice) => (
            <ActionMenu invoice={invoice} />
        )}
    />
</Table>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `data` | `T[]` | — | Data array |
| `loading` | `boolean` | `false` | Show loading state |
| `onRowClick` | `(item: T) => void` | — | Row click handler |
| `selectable` | `boolean` | `false` | Enable selection |
| `selectedIds` | `Set<string>` | — | Selected IDs |
| `onSelect` | `(ids: Set) => void` | — | Selection handler |
| `emptyMessage` | `string` | — | Empty state message |

---

## 🔖 Badge

### Usage

```tsx
import { Badge } from '@/components/global/ui/Badge';

<Badge variant="success">Paid</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Overdue</Badge>
<Badge variant="info">Draft</Badge>
<Badge variant="neutral">Cancelled</Badge>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'success' \| 'warning' \| 'error' \| 'info' \| 'neutral'` | `'neutral'` | Badge style |
| `size` | `'sm' \| 'md'` | `'md'` | Badge size |

---

## 📎 Toast

### Usage

```tsx
import { toast } from '@/components/global/ui/Toast';

// Success toast
toast.success('Invoice saved successfully');

// Error toast
toast.error('Failed to save invoice');

// Warning toast
toast.warning('Low stock warning');

// Info toast
toast.info('Sync in progress...');

// With options
toast.success('Invoice created', {
    duration: 5000,
    action: {
        label: 'View',
        onClick: () => navigate('/invoices/123')
    }
});
```

---

## 📁 Component Structure

```
components/global/
├── ui/
│   ├── Button.tsx
│   ├── Badge.tsx
│   ├── Card.tsx
│   ├── Spinner.tsx
│   └── Toast.tsx
├── forms/
│   ├── Input.tsx
│   ├── NumberInput.tsx
│   ├── Select.tsx
│   ├── DatePicker.tsx
│   └── Checkbox.tsx
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── Modal.tsx
│   └── Drawer.tsx
├── data/
│   ├── Table.tsx
│   ├── Pagination.tsx
│   └── EmptyState.tsx
└── search/
    ├── SearchBar.tsx
    ├── ProductSearch.tsx
    └── CustomerSearch.tsx
```

---

## 📚 Further Reading

- [Design System](../design-system.md) - Colors, typography, spacing
- [Form Components](./form-components.md) - Form patterns
- [Layout Components](./layout-components.md) - Page layouts
