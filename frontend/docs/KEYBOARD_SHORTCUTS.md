# Keyboard Shortcuts - AASO ERP

> Reference: MargerERP shortcut conventions adapted for AASO native desktop app.
> Goal: Minimize friction for users migrating from Marg, keep only high-impact shortcuts.

---

## Design Principles

1. **Marg-native shortcuts preserved** - Native app, no browser conflicts. Ctrl+W, Ctrl+T, etc. are all available
2. **Progressive disclosure** - Core shortcuts work everywhere, context shortcuts appear in specific views
3. **Discoverable** - Show shortcut hints in tooltips and a `?` help overlay

---

## Priority Tiers

### Tier 1 - Every Transaction (implement first)

These are used multiple times per minute during billing. Non-negotiable.

| Action | Shortcut | Marg Match | Context | Notes |
|---|---|---|---|---|
| **New Sale Invoice** | `Alt+N` | Yes | Global | Opens new invoice form |
| **New Sale Challan** | `Alt+C` | Yes | Global | Opens new challan form |
| **Save Document** | `Ctrl+W` | Yes | Any form | Marg-native save |
| **Pick All Items** | `Ctrl+W` | Yes | Item window | Save + pick selected items (same key, context-aware) |
| **Search / Find Item** | `/` or `F2` | F2 | Item entry | Focus product search input |
| **Select Batch** | `Ctrl+Tab` | Yes | Item row | Open batch selector for current item |
| **Apply Discount** | `F4` | Yes | Invoice/Challan | Open discount input (bill-level) |
| **Load Tax** | `Ctrl+R` | Yes | Invoice/Challan | Apply/recalculate tax on bill |
| **View Tax Summary** | `F10` | Yes | Invoice/Challan | Toggle tax detail panel |
| **Print Document** | `Ctrl+P` | - | View mode | Standard print |
| **Next Field** | `Tab` | Yes | Any form | Standard field navigation |
| **Previous Field** | `Shift+Tab` | - | Any form | Standard reverse navigation |
| **Submit / Confirm** | `Enter` | Yes | Dialogs, forms | Confirm current action |
| **Cancel / Close** | `Escape` | - | Dialogs, modals | Close current overlay |

### Tier 2 - Frequent Actions (implement second)

Used several times per session. Important for power users.

| Action | Shortcut | Marg Match | Context | Notes |
|---|---|---|---|---|
| **Modify / Edit Document** | `Alt+M` / `Ctrl+F3` | Yes | Document list | Edit selected document |
| **Counter Sale** | `Alt+A` / `Ctrl+A` | Yes | Global | Quick cash-and-carry billing mode |
| **Sale Return** | `*` | Yes | Invoice view | Create return against current invoice (Marg-native) |
| **Copy Bill** | `Ctrl+T` / `Ctrl+Z` | Yes | Document view | Duplicate invoice/challan |
| **View Last Deal** | `Alt+L` | Yes | Item entry | Show last purchase/sale price for item |
| **View Old Dealing** | `F9` | Yes | Item entry | Show customer's purchase history for item |
| **Load Pending Orders** | `Ctrl+P` | Yes | Sale bill | Load pending sale orders / challans |
| **Toggle Rate (Old/New)** | `F6` | Yes | Item entry | Switch between MRP / last rate / deal rate |
| **View Profit** | `Alt+F10` | Yes | Invoice | Show margin/profit on current bill |
| **Change Deal/Discount** | `F3` | Yes | Qty field | Modify deal/scheme after item selection |
| **Ledger Detail** | `F5` | Yes | Party field | View selected party's ledger/outstanding |
| **View Item Tax Status** | `F2` | Yes | Qty field | Tax detail for current item |
| **Switch to Purchase Challan** | `Ctrl+Y` | Yes | Sale bill | Quick context switch |
| **Switch to Stock Receive** | `Ctrl+D` | Yes | Sale bill | Quick context switch |
| **Switch to Stock Issue** | `Ctrl+K` | Yes | Sale bill | Quick context switch |
| **Data Entry Window** | `F7` | Yes | Billing | Switch to data entry mode |

### Tier 3 - Occasional / Power User (implement later)

| Action | Shortcut | Marg Match | Context | Notes |
|---|---|---|---|---|
| **Export/Import Bill** | `Ctrl+O` | Yes | Document view | Export or import bill data |
| **Bill Adjustments** | `Ctrl+F9` | Yes | Invoice | View/edit bill adjustments |
| **E-Invoice Generate** | `Alt+E` | - | Invoice view | Generate e-invoice + e-way bill |
| **Export PDF / Email** | `F11` | Yes | Document view | Save PDF, email softcopy |
| **Switch Entry Mode** | `Ctrl+F2` | Yes | Item entry | Toggle Manual / Auto / FEFO batch pick |
| **Shortage Entry** | `Ctrl+Home` | Yes | Item entry | Mark item shortage during billing |
| **Calculate Return Cash** | `F11` | Yes | Invoice | Quick calculator for change due |
| **View Cost/Avg Rate/Profit** | `Shift+~` | Yes | Item entry | Show item-level cost, avg rate, and profit detail |
| **Change Margin** | `+` | Yes | Qty field | Adjust margin after item selection |
| **View Scheme Net Rate** | `FF` | Yes | Qty field | Double-tap F to view scheme net rate |
| **Multi Rate Change** | `F8` | Yes | Billing | Bulk rate modification window |
| **Bill Conversion** | `/` | Yes | Modify mode | Convert bill type (context: not in item search) |
| **Index Bill** | `F5` | Yes | Modify window | Index/search bills |
| **Bill Status** | `F6` | Yes | Modify window | View bill status |
| **Audit Bill** | `F9` | Yes | Modify window | Audit trail for bill |
| **Item Set Save** | `Alt+F11` | Yes | Item entry | Save current items as a reusable set |
| **Item Set Load** | `Alt+F12` | Yes | Item entry | Load a saved item set |

---

## Intentionally NOT Implemented

These Marg shortcuts are skipped because they are Marg-specific features or unintuitive:

| Marg Shortcut | Marg Action | Reason Skipped |
|---|---|---|
| `Ctrl+N` | Marg Pay Digital Collection | Marg-specific payment gateway feature |
| `Alt+~` | Message window | Marg-specific; use in-app notification panel instead |
| `Alt+Insert` | Switch Sale Bill to Cash Challan | `Alt+C` already handles challan creation |
| `Left Arrow` | Change bill number | Document numbers are system-generated (no manual override) |

---

## Global Navigation Shortcuts

Available from any screen in the app:

| Action | Shortcut | Notes |
|---|---|---|
| Open command palette | `Ctrl+K` or `/` | Quick jump to any module/action |
| Go to Dashboard | `Alt+D` | - |
| Go to Sale Invoice | `Alt+N` | Also creates new |
| Go to Purchase | `Alt+Shift+N` | New purchase entry |
| Go to Inventory | `Alt+I` | Inventory overview |
| Go to Reports | `Alt+Shift+R` | Reports section |
| Go to Settings | `Alt+,` | Settings page |
| Show Shortcut Help | `?` or `F1` | Overlay with all shortcuts for current context |
| Focus Search Bar | `Ctrl+/` | Global search |

---

## Item Entry Grid Shortcuts

When cursor is inside the items table during billing:

| Action | Shortcut | Notes |
|---|---|---|
| Add new row | `Alt+Enter` or `Tab` from last field | Adds blank item row |
| Delete row | `Alt+Delete` | Remove current item row |
| Move to next row | `Down Arrow` or `Enter` | Navigate items |
| Move to previous row | `Up Arrow` | Navigate items |
| Jump to quantity | `Q` (when row focused) | Quick focus qty field |
| Jump to rate | `R` (when row focused) | Quick focus rate field |
| Jump to discount | `D` (when row focused) | Quick focus discount field |
| Select batch | `Ctrl+Tab` or `Enter` on batch column | Open batch picker |

---

## Implementation Notes

### Technical Approach
- Use a global `useKeyboardShortcuts` hook with context-aware bindings
- Register/unregister shortcuts as components mount/unmount
- Prevent shortcuts when user is typing in a text input (except navigation keys)
- Show active shortcuts in a `?` help overlay (grouped by current context)
- Native app: intercept all key events at the app level (no browser to compete with)

### Context-Aware Keys
Some keys serve dual purpose depending on context:
- `F5`: Ledger Detail (party field) vs Index Bill (modify window)
- `F6`: Toggle Rate (item entry) vs Bill Status (modify window)
- `F9`: Old Dealing (item entry) vs Audit Bill (modify window)
- `F11`: Return Cash Calculator (billing) vs Export PDF (modify window)
- `/`: Command palette (global) vs Bill Conversion (modify mode)

### Migration UX
- On first login, show "Keyboard Shortcuts" intro modal for Marg users
- Include a "Marg Mode" toggle in settings that shows Marg-equivalent keys in tooltips
- Add shortcut hints to all major buttons (e.g., "New Invoice (Alt+N)")

### Accessibility
- All shortcuts must have equivalent mouse/touch actions
- Shortcuts should be remappable in user settings (future)
- Screen reader announcements for shortcut-triggered actions

---

*Last updated: 2026-02-07*
*Reference: MargerERP v18 shortcut list*
