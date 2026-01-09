# 🎨 UI/UX Design System

> **Complete design system** for consistent user experience across the application.

---

## 📋 Table of Contents

1. [Design Principles](#design-principles)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Patterns](#component-patterns)
6. [Page Layouts](#page-layouts)
7. [Interaction Patterns](#interaction-patterns)
8. [Icons](#icons)
9. [Feedback & States](#feedback--states)
10. [Accessibility](#accessibility)
11. [Do's and Don'ts](#dos-and-donts)

---

## 🎯 Design Principles

### 1. Clarity First
- Every element should have a clear purpose
- Labels should be descriptive
- Actions should be obvious

### 2. Efficiency
- Minimize clicks to complete tasks
- Provide keyboard shortcuts for power users
- Auto-fill and suggest where possible

### 3. Consistency
- Same patterns for same actions
- Same colors for same meanings
- Same spacing throughout

### 4. Forgiveness
- Allow undo where possible
- Confirm destructive actions
- Clear error messages with solutions

### 5. Professional
- Clean, uncluttered interface
- Business-appropriate colors
- Readable typography

---

## 🎨 Color System

### Primary Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Primary** | `#3B82F6` (Blue-500) | Primary buttons, links, active states |
| **Primary Dark** | `#2563EB` (Blue-600) | Hover states, emphasized elements |
| **Primary Light** | `#DBEAFE` (Blue-100) | Backgrounds, highlights |

### Secondary Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Secondary** | `#6B7280` (Gray-500) | Secondary text, icons |
| **Secondary Dark** | `#374151` (Gray-700) | Headers, important text |
| **Secondary Light** | `#F3F4F6` (Gray-100) | Backgrounds, dividers |

### Semantic Colors

| Meaning | Color | Hex | Usage |
|---------|-------|-----|-------|
| **Success** | Green | `#10B981` | Success messages, paid status |
| **Warning** | Amber | `#F59E0B` | Warnings, pending status |
| **Error** | Red | `#EF4444` | Errors, overdue, delete |
| **Info** | Blue | `#3B82F6` | Information, tips |

### Status Colors

| Status | Background | Text | Border |
|--------|------------|------|--------|
| **Paid** | `#D1FAE5` | `#065F46` | `#10B981` |
| **Pending** | `#FEF3C7` | `#92400E` | `#F59E0B` |
| **Overdue** | `#FEE2E2` | `#991B1B` | `#EF4444` |
| **Draft** | `#E5E7EB` | `#374151` | `#9CA3AF` |
| **Cancelled** | `#F3F4F6` | `#6B7280` | `#D1D5DB` |

### Background Colors

| Usage | Color |
|-------|-------|
| **Page background** | `#F9FAFB` (Gray-50) |
| **Card background** | `#FFFFFF` (White) |
| **Sidebar** | `#1F2937` (Gray-800) |
| **Modal overlay** | `rgba(0,0,0,0.5)` |

---

## 📝 Typography

### Font Family

```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Font Sizes

| Name | Size | Line Height | Usage |
|------|------|-------------|-------|
| **xs** | 12px | 16px | Labels, captions |
| **sm** | 14px | 20px | Body text, inputs |
| **base** | 16px | 24px | Default text |
| **lg** | 18px | 28px | Subheadings |
| **xl** | 20px | 28px | Card titles |
| **2xl** | 24px | 32px | Section headings |
| **3xl** | 30px | 36px | Page titles |

### Font Weights

| Name | Weight | Usage |
|------|--------|-------|
| **Normal** | 400 | Body text |
| **Medium** | 500 | Labels, emphasis |
| **Semibold** | 600 | Headings, buttons |
| **Bold** | 700 | Titles, important |

### Text Colors

| Usage | Color |
|-------|-------|
| **Primary text** | `#1F2937` (Gray-800) |
| **Secondary text** | `#6B7280` (Gray-500) |
| **Disabled text** | `#9CA3AF` (Gray-400) |
| **Placeholder** | `#9CA3AF` (Gray-400) |
| **Link** | `#3B82F6` (Blue-500) |
| **Link hover** | `#2563EB` (Blue-600) |

---

## 📐 Spacing & Layout

### Spacing Scale

| Name | Size | Usage |
|------|------|-------|
| **1** | 4px | Minimal gap |
| **2** | 8px | Tight spacing |
| **3** | 12px | Default gap |
| **4** | 16px | Standard padding |
| **5** | 20px | Section padding |
| **6** | 24px | Card padding |
| **8** | 32px | Section gaps |
| **10** | 40px | Large gaps |
| **12** | 48px | Page margins |

### Border Radius

| Name | Size | Usage |
|------|------|-------|
| **sm** | 4px | Buttons, inputs |
| **md** | 6px | Cards, containers |
| **lg** | 8px | Modals, dropdowns |
| **xl** | 12px | Large cards |
| **full** | 9999px | Pills, avatars |

### Shadows

| Name | Shadow | Usage |
|------|--------|-------|
| **sm** | `0 1px 2px rgba(0,0,0,0.05)` | Subtle elevation |
| **md** | `0 4px 6px rgba(0,0,0,0.1)` | Cards, dropdowns |
| **lg** | `0 10px 15px rgba(0,0,0,0.1)` | Modals |
| **xl** | `0 20px 25px rgba(0,0,0,0.15)` | Floating elements |

---

## 🧩 Component Patterns

### Buttons

#### Primary Button
- Background: `#3B82F6`
- Text: White
- Hover: `#2563EB`
- Use for: Main actions (Save, Submit, Create)

#### Secondary Button
- Background: White
- Border: `#D1D5DB`
- Text: `#374151`
- Hover: `#F9FAFB`
- Use for: Cancel, secondary actions

#### Danger Button
- Background: `#EF4444`
- Text: White
- Hover: `#DC2626`
- Use for: Delete, destructive actions

#### Button Sizes
| Size | Height | Padding | Font |
|------|--------|---------|------|
| sm | 32px | 12px 16px | 14px |
| md | 40px | 16px 20px | 14px |
| lg | 48px | 20px 24px | 16px |

### Form Inputs

#### Text Input
- Height: 40px
- Padding: 8px 12px
- Border: 1px solid `#D1D5DB`
- Border radius: 6px
- Focus: Border `#3B82F6`, ring `#DBEAFE`
- Error: Border `#EF4444`

#### Labels
- Font size: 14px
- Font weight: 500
- Color: `#374151`
- Margin bottom: 4px
- Required indicator: Red asterisk

#### Error Messages
- Font size: 12px
- Color: `#EF4444`
- Margin top: 4px
- Icon: Optional warning icon

### Cards

- Background: White
- Border: 1px solid `#E5E7EB`
- Border radius: 8px
- Shadow: `0 1px 3px rgba(0,0,0,0.1)`
- Padding: 16px or 24px

### Tables

| Element | Style |
|---------|-------|
| Header | Background `#F9FAFB`, font-weight 600 |
| Rows | Border-bottom `#E5E7EB`, hover `#F9FAFB` |
| Cell padding | 12px 16px |
| Selected row | Background `#EFF6FF` |

### Modals

- Overlay: `rgba(0,0,0,0.5)`
- Background: White
- Border radius: 12px
- Shadow: xl
- Max width: 500px (sm), 600px (md), 800px (lg)
- Padding: 24px
- Close button: Top right

---

## 📄 Page Layouts

### Standard Module Page

```
┌─────────────────────────────────────────────────┐
│ [Icon] Module Title              [Actions]  [X] │  ← Header (56px)
├─────────────────────────────────────────────────┤
│ [Filters: Search | Status | Date Range]        │  ← Filters (optional)
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │          Content Area                    │   │  ← Scrollable
│  │     (Table, Cards, Form, etc.)          │   │
│  │                                          │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Cancel]                    [Primary Action]    │  ← Footer (60px)
└─────────────────────────────────────────────────┘
```

### Form Layout

```
┌─────────────────────────────────────────────────┐
│ [Icon] Form Title                          [X]  │
├─────────────────────────────────────────────────┤
│                                                 │
│  Section 1: Basic Info                         │
│  ┌──────────────────┬──────────────────┐       │
│  │ [Label]          │ [Label]          │       │  ← 2-column grid
│  │ [Input]          │ [Input]          │       │
│  └──────────────────┴──────────────────┘       │
│                                                 │
│  Section 2: Items                              │
│  ┌─────────────────────────────────────────┐   │
│  │ [Product Search                       +]│   │
│  ├─────────────────────────────────────────┤   │
│  │ Product | Qty | Rate | Tax | Amount     │   │
│  │ ...                                      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ Summary         Subtotal:    ₹1,000     │   │
│  │                 Tax:            ₹180     │   │
│  │                 Total:       ₹1,180     │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
├─────────────────────────────────────────────────┤
│ [Reset]                        [Save Invoice]   │
└─────────────────────────────────────────────────┘
```

### Key Measurements

| Element | Height |
|---------|--------|
| Page header | 56px |
| Module header | 48-56px |
| Filter bar | 48-56px |
| Table rows | 48px |
| Footer | 60px |
| Sidebar width | 240px (expanded), 64px (collapsed) |

---

## 🎭 Interaction Patterns

### Loading States

| Type | Visual |
|------|--------|
| **Full page** | Centered spinner with "Loading..." |
| **Button** | Spinner inside button, disable click |
| **Table** | Skeleton rows |
| **Inline** | Small spinner next to element |

### Empty States

- Center in content area
- Include: Icon, headline, description, action button
- Example: "No invoices found. Create your first invoice."

### Hover Effects

- Buttons: Slightly darker background
- Links: Underline or color change
- Cards: Subtle shadow increase
- Table rows: Light gray background

### Transitions

- Duration: 150-200ms
- Easing: `ease-in-out`
- Properties: background-color, border-color, opacity, transform

### Focus States

- Ring: 2px solid `#3B82F6`
- Ring offset: 2px
- Applied to all interactive elements

---

## 🎯 Icons

### Icon Library
Use **Lucide React** icons for consistency.

### Icon Sizes

| Context | Size |
|---------|------|
| Inline with text | 16px |
| Buttons | 18px |
| Navigation | 20px |
| Headers | 24px |
| Empty states | 48px |

### Common Icons

| Action | Icon |
|--------|------|
| Add/Create | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Close | `X` |
| Search | `Search` |
| Filter | `Filter` |
| Settings | `Settings` |
| User | `User` |
| Invoice | `FileText` |
| Product | `Package` |
| Customer | `Users` |
| Money | `DollarSign` or `IndianRupee` |
| Print | `Printer` |
| Download | `Download` |
| Upload | `Upload` |
| Check | `Check` |
| Warning | `AlertTriangle` |
| Error | `AlertCircle` |
| Info | `Info` |

---

## 💬 Feedback & States

### Toast Notifications

| Type | Background | Icon | Duration |
|------|------------|------|----------|
| Success | `#D1FAE5` | Check | 3 seconds |
| Error | `#FEE2E2` | AlertCircle | 5 seconds |
| Warning | `#FEF3C7` | AlertTriangle | 4 seconds |
| Info | `#DBEAFE` | Info | 3 seconds |

### Confirmation Dialogs

- Use for: Delete, cancel, irreversible actions
- Include: Clear question, consequences, two buttons
- Primary action: On the right
- Destructive: Use danger button style

### Form Validation

- **When**: On blur + on submit
- **Error display**: Below input, in red
- **Success display**: Green check (optional)
- **Required fields**: Asterisk in label

---

## ♿ Accessibility

### Color Contrast

- Normal text: 4.5:1 minimum
- Large text: 3:1 minimum
- UI elements: 3:1 minimum

### Keyboard Navigation

- All interactive elements focusable
- Tab order logical (left-right, top-bottom)
- Escape closes modals/dropdowns
- Enter activates buttons/links

### Screen Readers

- Semantic HTML (`<main>`, `<nav>`, `<section>`)
- ARIA labels for icons/buttons
- Form labels associated with inputs
- Error messages announced

---

## ✅ Do's and Don'ts

### ✅ DO

- Use consistent colors for same meanings
- Provide visual feedback for all actions
- Keep forms simple, one column when possible
- Use clear, action-oriented button labels ("Save Invoice" not "Submit")
- Show loading states for async actions
- Confirm destructive actions
- Use proper heading hierarchy
- Provide keyboard shortcuts for power users
- Show success messages after actions
- Use placeholder text for examples, not labels

### ❌ DON'T

- Use more than 3 primary colors
- Make users think - be obvious
- Use red for non-error purposes
- Disable buttons without explanation
- Use custom scrollbars
- Rely only on color for meaning (add icons/text)
- Make click targets smaller than 44x44px on mobile
- Use all caps for long text
- Hide important actions in menus
- Use jargon - use user-friendly terms

---

## 📱 Responsive Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| sm | 640px | Mobile phones |
| md | 768px | Tablets |
| lg | 1024px | Small laptops |
| xl | 1280px | Desktops |
| 2xl | 1536px | Large screens |

### Mobile Considerations

- Stack form columns vertically
- Full-width buttons
- Larger touch targets (48px minimum)
- Collapsible sidebar to hamburger menu
- Simplified tables (cards on mobile)

---

**Last Updated**: January 2026  
**Version**: 1.0
