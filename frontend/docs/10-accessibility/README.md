# ♿ Accessibility

> **Making the application usable for everyone**

---

## 🎯 Accessibility Standards

We follow **WCAG 2.1 Level AA** guidelines:

| Principle | Description |
|-----------|-------------|
| **Perceivable** | Info presentable in ways users can perceive |
| **Operable** | UI components must be operable |
| **Understandable** | Information must be understandable |
| **Robust** | Content must work with assistive technologies |

---

## ⌨️ Keyboard Navigation

### Global Shortcuts
| Shortcut | Action |
|----------|--------|
| `Tab` | Navigate to next element |
| `Shift+Tab` | Navigate to previous element |
| `Enter` | Activate focused element |
| `Escape` | Close modal/cancel action |
| `Arrow keys` | Navigate within components |

### Module-Specific Shortcuts
| Module | Shortcut | Action |
|--------|----------|--------|
| Invoice | `Ctrl+S` | Save invoice |
| Invoice | `Ctrl+P` | Print invoice |
| Invoice | `Ctrl+N` | New customer |
| Invoice | `Ctrl+F` | Focus product search |
| All | `Ctrl+/` | Show keyboard shortcuts |

---

## 👁️ Visual Accessibility

### Color Contrast
```css
/* Minimum 4.5:1 for normal text */
/* Minimum 3:1 for large text (18pt+) */

--text-primary: #1f2937;     /* On white: 12.6:1 ✅ */
--text-secondary: #6b7280;   /* On white: 5.4:1 ✅ */
--error: #dc2626;            /* On white: 5.2:1 ✅ */
```

### Focus Indicators
```css
/* Always visible focus state */
:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}
```

---

## 📝 ARIA Guidelines

```tsx
// Labels for form inputs
<label htmlFor="customer">Customer</label>
<input id="customer" aria-describedby="customer-help" />
<span id="customer-help">Select the customer for this invoice</span>

// Buttons with icons only
<button aria-label="Delete item">
  <TrashIcon />
</button>

// Loading states
<div aria-busy={loading} aria-live="polite">
  {loading ? 'Loading...' : data}
</div>

// Error messages
<input aria-invalid={hasError} aria-errormessage="email-error" />
<span id="email-error" role="alert">{error}</span>
```

---

## 📚 Further Reading

- [Keyboard Navigation](./keyboard-navigation.md)
- [Design Tokens](./design-tokens.md)
