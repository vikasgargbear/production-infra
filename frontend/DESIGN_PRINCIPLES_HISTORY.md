# History Component Design Principles

> Based on Invoice History improvements - Standard patterns for all history/list views

## 1. Component Structure

### Header
- **Use `ModuleHeader` component** for consistency
- **No analytics/stats** in header (keep it clean)
- **Action buttons**: Refresh (icon-only with spin), Export All (black bg)
- **No History button** when already on history page (remove `historyType` prop)

```tsx
<ModuleHeader
  title="[Entity] History"
  documentNumber=""
  status="active"
  icon={EntityIcon}
  iconColor="text-blue-600"
  onClose={onClose}
  showSaveDraft={false}
  additionalActions={[
    {
      label: "",
      onClick: handleRefresh,
      variant: "ghost",
      icon: RefreshCw,
      disabled: loading,
      title: "Refresh",
      className: loading ? "animate-spin" : ""
    },
    {
      label: "Export All",
      onClick: handleExportAll,
      variant: "default",
      className: "bg-gray-900 hover:bg-gray-800 text-white"
    }
  ]}
/>
```

### Filters
- **Use `InlineFilterPanel`** component
- **Show Filters toggle** for clean layout
- **Longer search bar** for entity-specific search

#### Standard Filter Set:
1. **Period dropdown** (Quick date presets)
   - All Time
   - Today
   - Yesterday  
   - Last 7 Days
   - Last 30 Days
   - This Month
   - Last Month
   - This Quarter

2. **Status dropdown** (Entity-specific statuses)
   - Context-appropriate (Paid/Pending for invoices, Received/Pending for purchases, etc.)

3. **Custom Date Range**
   - From Date picker
   - To Date picker

4. **Search** 
   - Entity number, party name, etc.

```tsx
const filterOptions = [
  {
    key: 'date_preset',
    label: 'Period',
    type: 'select',
    options: [/* standard date presets */],
    defaultValue: 'all'
  },
  {
    key: 'status',  // or payment_status, order_status, etc.
    label: 'Status',
    type: 'select',
    options: [/* entity-specific statuses */],
    defaultValue: 'all'
  },
  {
    key: 'dateFrom',
    label: 'From Date',
    type: 'date'
  },
  {
    key: 'dateTo',
    label: 'To Date',
    type: 'date'
  }
];
```

### Table Structure

#### Column Order:
1. **Checkbox** (for bulk actions)
2. **Date** column first (format: "25 Jan 2026")
3. **Entity Number** (Invoice #, Purchase #, etc.)
4. **Party Name** (Customer, Supplier, etc.)
5. **Amount** (right-aligned, show pending if applicable)
6. **Status** (use StatusBadge component)
7. **Due/Expected Date** (if applicable)
8. **Actions**

#### Column Headers:
- Keep concise to avoid wrapping ("Due" not "Due Date")
- Set appropriate widths

```tsx
{
  key: 'entity_date',
  header: 'Date',
  render: (_: any, item: Entity) => (
    <div className="text-gray-700">
      {new Date(item.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })}
    </div>
  ),
  width: '110px'
}
```

### Action Buttons

#### Quick Actions (always visible):
1. **View** (blue) - Opens entity preview
2. **Print** (gray) - Print/PDF download
3. **WhatsApp** (green) - Share via WhatsApp
4. **Email** (orange) - Send via email

#### More Menu (3-dots dropdown):
1. **Edit** - Modify entity
2. **Cancel/Delete** - Remove entity (only if allowed)

```tsx
// Quick actions
<button
  onClick={() => handleView(item)}
  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
  title="View [Entity]"
>
  <Eye className="w-4 h-4" />
</button>

// WhatsApp
<button
  onClick={() => handleWhatsApp(item)}
  className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
  title="Share via WhatsApp"
>
  <MessageCircle className="w-4 h-4" />
</button>
```

## 2. Message Templates

### Standard Format (WhatsApp & Email):
```typescript
const createMessage = (item: Entity) => {
  const { companyInfo } = useCompany();
  const companyName = companyInfo?.name || 'Our Company';
  
  const date = formatDate(item.date);
  const dueDate = item.due_date ? formatDate(item.due_date) : 'Not specified';
  
  return `Dear ${item.party_name},

Your [entity type] from ${companyName} is ready!

[Entity] #: ${item.entity_number}
Date: ${date}
Amount: ₹${item.total_amount.toLocaleString('en-IN')}
${item.due_date ? `Due Date: ${dueDate}\n` : ''}
${item.pending_amount > 0 ? `Pending: ₹${item.pending_amount.toLocaleString('en-IN')}\n` : ''}
Thank you for your business!

---
${companyName}`;
};
```

### Email Subject:
```typescript
const subject = `[Entity] ${item.entity_number} - ₹${item.total_amount.toLocaleString('en-IN')}`;
```

## 3. State Management

- **Use custom hooks** for list state
- **Centralized reducer** pattern (like `useInvoiceListState`)
- **API integration** in separate handler functions

## 4. Styling

- **Background**: `bg-gray-50` for list/history pages (per ui-design-standards.md §6)
  - Note: Transaction CREATE flows use `bg-blue-50`, but LIST views use `bg-gray-50`
- **Cards**: White background with shadow
- **Buttons**: Follow variant system (ghost, default, etc.)
- **Icons**: Use lucide-react for consistency

## 5. Date Preset Logic

Standard date calculation (reusable across all history components):

```typescript
const handleFilterChange = (newFilters: any) => {
  const searchFilters: any = {};
  
  if (newFilters.date_preset && newFilters.date_preset !== 'all') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    switch (newFilters.date_preset) {
      case 'today':
        searchFilters.date_from = today.toISOString().split('T')[0];
        searchFilters.date_to = today.toISOString().split('T')[0];
        break;
      case 'last7days':
        const last7 = new Date(today);
        last7.setDate(last7.getDate() - 7);
        searchFilters.date_from = last7.toISOString().split('T')[0];
        searchFilters.date_to = today.toISOString().split('T')[0];
        break;
      // ... other presets
    }
  }
  
  // Custom date range overrides preset
  if (newFilters.dateFrom) searchFilters.date_from = newFilters.dateFrom;
  if (newFilters.dateTo) searchFilters.date_to = newFilters.dateTo;
  
  fetchEntities(1, searchFilters);
};
```

## 6. Context-Specific Adaptations

### Variable Names by Entity:

| Concept | Invoice | Purchase | Payment | Stock/Inventory |
|---------|---------|----------|---------|-----------------|
| Entity Number | invoice_number | purchase_number | payment_id | transaction_id |
| Party | customer_name | supplier_name | party_name | - |
| Date | invoice_date | purchase_date | payment_date | transaction_date |
| Status | payment_status | order_status | payment_status | transaction_type |
| Amount | total_amount | total_amount | amount | value |
| Due Field | due_date | expected_date | - | - |

### Status Options by Entity:

**Invoice**: Paid, Partial, Pending, Overdue, Cancelled
**Purchase**: Received, Pending, Partial, Cancelled
**Payment**: Completed, Pending, Failed, Cancelled
**Stock**: In, Out, Adjustment, Transfer

## 7. Checklist for Each History Component

- [ ] Uses ModuleHeader (no historyType prop)
- [ ] Uses InlineFilterPanel with Period/Status/Date filters
- [ ] Date column first in table
- [ ] Actions: View, Print, WhatsApp, Email, More (Edit, Cancel)
- [ ] Message templates use company name from context
- [ ] Refresh button icon-only with spin animation
- [ ] Export All button black background, no icon
- [ ] Background color: bg-blue-50
- [ ] Toast notifications for View/Print (until full implementation)
- [ ] API endpoints verified and working
- [ ] Context-appropriate variable names
- [ ] Status badges use proper variant mapping

## Reference Implementation

See: `/components/sales/invoice/InvoiceList.tsx` and `/components/sales/invoice/invoicelist/components/InvoiceTable.tsx`
