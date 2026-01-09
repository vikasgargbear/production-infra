# 🧩 Form Components Reference

> **Complete reference** for all form-related global components

---

## 📋 Available Form Components

| Component | Purpose | Import |
|-----------|---------|--------|
| [CustomerSearch](#customersearch) | Search and select customers | `import { CustomerSearch } from '../global';` |
| [ProductSearch](#productsearch) | Search and add products | `import { ProductSearch } from '../global';` |
| [SupplierSearch](#suppliersearch) | Search suppliers | `import { SupplierSearch } from '../global';` |
| [StandardDatePicker](#standarddatepicker) | Date selection | `import { StandardDatePicker } from '../global';` |
| [MonthYearPicker](#monthyearpicker) | Month/Year selection | `import { MonthYearPicker } from '../global';` |
| [Select](#select) | Dropdown selection | `import { Select } from '../global';` |
| [NumberInput](#numberinput) | Numeric input | `import { NumberInput } from '../global';` |
| [CurrencyInput](#currencyinput) | Currency input | `import { CurrencyInput } from '../global';` |
| [SearchBar](#searchbar) | Search input | `import { SearchBar } from '../global';` |
| [AddressForm](#addressform) | Address input | `import { AddressForm } from '../global';` |

---

## 🔍 CustomerSearch

Autocomplete search for customers with recent history and create option.

```typescript
import { CustomerSearch } from '../global';

<CustomerSearch
  value={selectedCustomer}
  onChange={(customer) => setSelectedCustomer(customer)}
  placeholder="Search by name, phone, or code..."
  showCreateButton={true}
  onCreateNew={() => setShowCreateModal(true)}
  displayMode="compact" // 'compact' | 'full' | 'minimal'
  clearable={true}
  disabled={false}
  ref={customerSearchRef}
/>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `value` | `Customer \| null` | No | Selected customer |
| `onChange` | `(customer: Customer \| null) => void` | Yes | Selection handler |
| `placeholder` | `string` | No | Input placeholder |
| `showCreateButton` | `boolean` | No | Show "Create New" button |
| `onCreateNew` | `() => void` | No | Create new handler |
| `displayMode` | `'compact' \| 'full' \| 'minimal'` | No | Display variant |
| `clearable` | `boolean` | No | Show clear button |
| `disabled` | `boolean` | No | Disable input |
| `ref` | `React.Ref` | No | Ref for focus |

---

## 📦 ProductSearch

Search products with barcode support and batch selection.

```typescript
import { ProductSearch } from '../global';

<ProductSearch
  onAddItem={(product) => addToInvoice(product)}
  onCreateProduct={(name) => {
    setNewProductName(name);
    setShowCreateModal(true);
  }}
  placeholder="Search or scan barcode..."
  showBatchSelection={true}
  priceField="sale_price" // 'sale_price' | 'mrp' | 'cost'
  ref={productSearchRef}
/>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onAddItem` | `(product: Product) => void` | Yes | Add item handler |
| `onCreateProduct` | `(name: string) => void` | No | Create product handler |
| `showBatchSelection` | `boolean` | No | Show batch picker |
| `priceField` | `'sale_price' \| 'mrp' \| 'cost'` | No | Which price to use |
| `ref` | `React.Ref` | No | Ref for focus |

---

## 📅 StandardDatePicker

Date selection with keyboard navigation.

```typescript
import { StandardDatePicker } from '../global';

<StandardDatePicker
  label="Invoice Date"
  value={invoiceDate}
  onChange={(date) => setInvoiceDate(date)}
  required={true}
  minDate="2024-01-01"
  maxDate="2024-12-31"
  disabled={false}
  error="Date is required"
  className="w-full"
/>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `label` | `string` | No | Input label |
| `value` | `string \| Date` | No | Selected date |
| `onChange` | `(date: string) => void` | Yes | Change handler |
| `required` | `boolean` | No | Show required indicator |
| `minDate` | `string` | No | Minimum selectable date |
| `maxDate` | `string` | No | Maximum selectable date |
| `disabled` | `boolean` | No | Disable input |
| `error` | `string` | No | Error message |

---

## 📆 MonthYearPicker

Select month and year (for expiry dates, etc.).

```typescript
import { MonthYearPicker } from '../global';

<MonthYearPicker
  label="Expiry Date"
  value={{ month: 12, year: 2025 }}
  onChange={({ month, year }) => setExpiry({ month, year })}
  minYear={2024}
  maxYear={2030}
/>
```

---

## 📝 Select

Dropdown selection component.

```typescript
import { Select } from '../global';

<Select
  label="Payment Status"
  value={selectedStatus}
  onChange={(value) => setStatus(value)}
  options={[
    { value: 'all', label: 'All Statuses' },
    { value: 'paid', label: 'Paid' },
    { value: 'pending', label: 'Pending' },
    { value: 'overdue', label: 'Overdue' }
  ]}
  placeholder="Select status..."
  required={true}
  disabled={false}
  error={errors.status}
/>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `options` | `{ value: string; label: string }[]` | Yes | Options list |
| `value` | `string` | No | Selected value |
| `onChange` | `(value: string) => void` | Yes | Change handler |
| `label` | `string` | No | Input label |
| `placeholder` | `string` | No | Placeholder text |
| `required` | `boolean` | No | Required indicator |
| `disabled` | `boolean` | No | Disable select |
| `error` | `string` | No | Error message |

---

## 🔢 NumberInput

Numeric input with formatting.

```typescript
import { NumberInput } from '../global';

<NumberInput
  label="Quantity"
  value={quantity}
  onChange={(value) => setQuantity(value)}
  min={0}
  max={1000}
  step={1}
  precision={0}
  required={true}
/>
```

---

## 💰 CurrencyInput

Currency input with ₹ formatting.

```typescript
import { CurrencyInput } from '../global';

<CurrencyInput
  label="Amount"
  value={amount}
  onChange={(value) => setAmount(value)}
  min={0}
  precision={2}
  prefix="₹"
/>
```

---

## 🔍 SearchBar

General search input.

```typescript
import { SearchBar } from '../global';

<SearchBar
  value={searchQuery}
  onChange={(query) => setSearchQuery(query)}
  placeholder="Search invoices..."
  onClear={() => setSearchQuery('')}
  loading={searching}
/>
```

---

## 🏠 AddressForm

Complete address input form.

```typescript
import { AddressForm } from '../global';

<AddressForm
  value={billingAddress}
  onChange={(address) => setBillingAddress(address)}
  label="Billing Address"
  required={true}
/>
```

**Address Data Structure**:
```typescript
interface AddressData {
  street?: string;
  address_line_1?: string;
  address_line_2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}
```

---

## 📦 Import All

```typescript
import {
  CustomerSearch,
  ProductSearch,
  SupplierSearch,
  StandardDatePicker,
  MonthYearPicker,
  Select,
  NumberInput,
  CurrencyInput,
  SearchBar,
  AddressForm
} from '../global';
```
