# AASO Frontend Design Guide

## Container Dimensions

### Standard Content Width
Use these consistent max-width values for different contexts:

| Token | Value | Use Case |
|-------|-------|----------|
| `max-w-6xl` | 1152px | **Default** - Document entry flows, forms, data entry |
| `max-w-7xl` | 1280px | Dashboards, reports with wide tables |
| `max-w-4xl` | 896px | Focused modals, single-purpose dialogs |
| `max-w-3xl` | 768px | Small modals, confirmation dialogs |

### Standard Pattern for Document Flows

```tsx
// Content container pattern
<div className="flex-1 overflow-y-auto bg-{color}-50">
  <div className="max-w-6xl mx-auto px-6 py-6">
    {/* Content here */}
  </div>
</div>
```

### Padding Standards

| Token | Value | Use Case |
|-------|-------|----------|
| `px-6` | 24px | Horizontal padding for main content |
| `py-6` | 24px | Vertical padding for main content |
| `px-4` | 16px | Horizontal padding for cards, sections |
| `py-4` | 16px | Vertical padding for cards, sections |

---

## Sidebar Dimensions

| State | Width | Class |
|-------|-------|-------|
| Collapsed | 64px | `w-16` |
| Expanded | 208px | `w-52` |

Sidebar uses hover-to-expand with 300ms transition and lock toggle.

---

## Module Color Themes

| Module | Background | Accent |
|--------|------------|--------|
| Invoice (Sales) | `bg-blue-50` | `text-blue-600` |
| Purchase | `bg-green-50` | `text-green-600` |
| Delivery Challan | `bg-indigo-50` | `text-indigo-600` |
| Sales Order | `bg-teal-50` | `text-teal-600` |
| Purchase Order | `bg-purple-50` | `text-purple-600` |
| GRN | `bg-orange-50` | `text-orange-600` |
| Returns | `bg-red-50` | `text-red-600` |

---

## Components Using GlobalDocumentFlow

All document entry flows should use `GlobalDocumentFlow` for consistency:
- ✅ Purchase Entry
- ✅ Sales Order
- ✅ Delivery Challan
- ⚠️ Invoice (uses custom steps - should use max-w-6xl)

---

## Last Updated
2026-01-25
