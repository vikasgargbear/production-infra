# 🏗️ Layout Components Reference

> **Layout and structure components** for building pages

---

## 📋 Available Layout Components

| Component | Purpose | Import |
|-----------|---------|--------|
| [ModuleHeader](#moduleheader) | Page header with actions | `import { ModuleHeader } from '../global';` |
| [DocumentFooter](#documentfooter) | Form footer with actions | `import { DocumentFooter } from '../global';` |
| [GlobalLayout](#globallayout) | Main app layout | `import { GlobalLayout } from '../global';` |
| [ContentCard](#contentcard) | Card container | `import { ContentCard } from '../global';` |
| [FormSection](#formsection) | Form section with label | `import { FormSection } from '../global';` |
| [SectionHeader](#sectionheader) | Section divider | `import { SectionHeader } from '../global';` |
| [Sidebar](#sidebar) | Navigation sidebar | `import { Sidebar } from '../global';` |

---

## 📌 ModuleHeader

Standard header for all modules.

```typescript
import { ModuleHeader } from '../global';
import { FileText, Download, Printer } from 'lucide-react';

<ModuleHeader
  title="Invoice"
  documentNumber="INV-2024-001"
  status="draft" // 'draft' | 'confirmed' | 'paid' | 'cancelled'
  icon={FileText}
  iconColor="text-blue-600"
  onClose={() => navigate(-1)}
  historyType="invoice"  // For "View History" button
  showSaveDraft={true}
  onSaveDraft={() => saveDraft()}
  additionalActions={[
    { 
      label: "Export", 
      icon: Download, 
      onClick: () => exportPDF() 
    },
    { 
      label: "Print", 
      icon: Printer, 
      onClick: () => window.print() 
    }
  ]}
/>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | Module title |
| `documentNumber` | `string` | No | Document number to display |
| `status` | `string` | No | Status badge |
| `icon` | `LucideIcon` | No | Icon component |
| `iconColor` | `string` | No | Tailwind color class |
| `onClose` | `() => void` | No | Close button handler |
| `historyType` | `string` | No | Type for history view |
| `showSaveDraft` | `boolean` | No | Show save draft button |
| `onSaveDraft` | `() => void` | No | Save draft handler |
| `additionalActions` | `ModuleHeaderAction[]` | No | Extra action buttons |

---

## 📄 DocumentFooter

Footer for document forms with totals and actions.

```typescript
import { DocumentFooter } from '../global';

<DocumentFooter
  totalItems={invoice.items.length}
  totalAmount={calculateTotal()}
  taxAmount={calculateTax()}
  grandTotal={calculateGrandTotal()}
  onCancel={handleReset}
  onContinue={handleSubmit}
  cancelLabel="Reset"
  continueLabel="Create Invoice"
  continueDisabled={!isValid}
  saving={isSaving}
/>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `totalItems` | `number` | No | Item count |
| `totalAmount` | `number` | No | Subtotal |
| `taxAmount` | `number` | No | Tax amount |
| `grandTotal` | `number` | No | Grand total |
| `onCancel` | `() => void` | No | Cancel handler |
| `onContinue` | `() => void` | Yes | Continue handler |
| `cancelLabel` | `string` | No | Cancel button text |
| `continueLabel` | `string` | No | Continue button text |
| `continueDisabled` | `boolean` | No | Disable continue |
| `saving` | `boolean` | No | Show loading state |

---

## 📦 ContentCard

Card container for content sections.

```typescript
import { ContentCard } from '../global';

<ContentCard>
  <h3>Section Title</h3>
  <p>Content goes here...</p>
</ContentCard>

// With props
<ContentCard 
  className="mt-4"
  padding="lg"  // 'sm' | 'md' | 'lg'
  shadow="md"   // 'sm' | 'md' | 'lg'
>
  <div>Content</div>
</ContentCard>
```

---

## 📝 FormSection

Section container for form groups.

```typescript
import { FormSection } from '../global';

<FormSection title="Customer Details" required>
  <CustomerSearch ... />
</FormSection>

<FormSection title="Items" collapsible defaultOpen={true}>
  <ItemsTable ... />
</FormSection>
```

**Props**:
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `title` | `string` | Yes | Section title |
| `required` | `boolean` | No | Show required indicator |
| `collapsible` | `boolean` | No | Allow collapse |
| `defaultOpen` | `boolean` | No | Initial collapsed state |
| `children` | `ReactNode` | Yes | Section content |

---

## 📊 SectionHeader

Divider with title for separating content.

```typescript
import { SectionHeader } from '../global';

<SectionHeader 
  title="Payment Details" 
  subtitle="Configure payment options"
/>

<SectionHeader 
  title="Items" 
  action={
    <button onClick={addItem}>+ Add Item</button>
  }
/>
```

---

## 🧭 Sidebar / ModuleHub

Navigation components.

```typescript
import { Sidebar, ModuleHub } from '../global';

// Main sidebar (typically in App layout)
<Sidebar 
  collapsed={sidebarCollapsed}
  onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
/>

// Module hub for module selection
<ModuleHub 
  activeModule={currentModule}
  onModuleChange={(module) => navigate(`/${module}`)}
/>
```

---

## 🎨 Layout Patterns

### Standard Module Layout
```tsx
const MyModule: React.FC = () => {
  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <ModuleHeader title="My Module" onClose={onClose} />
      
      {/* Optional Filters */}
      <div className="p-4 border-b">
        <Filters ... />
      </div>
      
      {/* Scrollable Content */}
      <div className="flex-1 overflow-auto p-4">
        <ContentCard>
          <DataTable ... />
        </ContentCard>
      </div>
      
      {/* Fixed Footer */}
      <DocumentFooter ... />
    </div>
  );
};
```

### Form Layout
```tsx
const MyForm: React.FC = () => {
  return (
    <div className="h-full flex flex-col">
      <ModuleHeader title="Create Item" />
      
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <FormSection title="Basic Info">
          <div className="grid grid-cols-2 gap-4">
            <Input ... />
            <Input ... />
          </div>
        </FormSection>
        
        <FormSection title="Details">
          <Textarea ... />
        </FormSection>
      </div>
      
      <DocumentFooter 
        onCancel={handleCancel}
        onContinue={handleSubmit}
        continueLabel="Save"
      />
    </div>
  );
};
```

---

## 📦 Import All

```typescript
import {
  ModuleHeader,
  DocumentFooter,
  GlobalLayout,
  ContentCard,
  FormSection,
  SectionHeader,
  Sidebar,
  ModuleHub
} from '../global';
```
