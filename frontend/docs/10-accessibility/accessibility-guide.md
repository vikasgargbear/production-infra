# ♿ Accessibility Guide

> **Building an inclusive application** accessible to all users

---

## 🎯 Accessibility Standards

We follow **WCAG 2.1 AA** guidelines:

| Principle | Description |
|-----------|-------------|
| **Perceivable** | Content can be perceived by all senses |
| **Operable** | Interface can be operated by all users |
| **Understandable** | Content and operation are understandable |
| **Robust** | Content works with assistive technologies |

---

## ⌨️ Keyboard Navigation

### Focus Management

```tsx
// Ensure all interactive elements are focusable
<button
    type="button"
    className="focus:ring-2 focus:ring-blue-500 focus:outline-none"
    onClick={handleClick}
>
    Click Me
</button>

// Custom focusable element
<div
    role="button"
    tabIndex={0}
    onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleClick();
        }
    }}
>
    Custom Button
</div>
```

### Tab Order

```tsx
// Logical tab order (default)
<form>
    <input name="first" />    {/* Tab 1 */}
    <input name="second" />   {/* Tab 2 */}
    <button type="submit" />  {/* Tab 3 */}
</form>

// Skip to main content link
<a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
>
    Skip to main content
</a>

<main id="main-content">
    {/* Main content */}
</main>
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Move to next element |
| `Shift+Tab` | Move to previous element |
| `Enter` | Activate button/link |
| `Space` | Toggle checkbox, activate button |
| `Escape` | Close modal/dropdown |
| `Arrow Keys` | Navigate within components |

### Custom Keyboard Hook

```typescript
// hooks/useKeyboardNavigation.ts
import { useEffect, useCallback } from 'react';

interface KeyboardConfig {
    onEscape?: () => void;
    onEnter?: () => void;
    onArrowDown?: () => void;
    onArrowUp?: () => void;
}

export function useKeyboardNavigation(config: KeyboardConfig) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        switch (e.key) {
            case 'Escape':
                config.onEscape?.();
                break;
            case 'Enter':
                config.onEnter?.();
                break;
            case 'ArrowDown':
                e.preventDefault();
                config.onArrowDown?.();
                break;
            case 'ArrowUp':
                e.preventDefault();
                config.onArrowUp?.();
                break;
        }
    }, [config]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
```

---

## 🏷️ Semantic HTML

### Use Correct Elements

```tsx
// ✅ Good: Semantic HTML
<header>
    <nav aria-label="Main navigation">
        <ul>
            <li><a href="/dashboard">Dashboard</a></li>
            <li><a href="/sales">Sales</a></li>
        </ul>
    </nav>
</header>

<main>
    <article>
        <h1>Page Title</h1>
        <section aria-labelledby="section-heading">
            <h2 id="section-heading">Section Title</h2>
            <p>Content</p>
        </section>
    </article>
</main>

<footer>
    <p>© 2026 Company</p>
</footer>

// ❌ Bad: Div soup
<div class="header">
    <div class="nav">...</div>
</div>
```

### Heading Hierarchy

```tsx
// ✅ Correct hierarchy
<h1>Invoice Management</h1>      {/* One per page */}
<h2>Pending Invoices</h2>
<h3>Invoice INV-001</h3>
<h2>Paid Invoices</h2>
<h3>Invoice INV-002</h3>

// ❌ Skipping levels
<h1>Title</h1>
<h3>Subtitle</h3>  {/* Wrong: skipped h2 */}
```

---

## 🏷️ ARIA Labels

### Label Interactive Elements

```tsx
// Buttons with icons only
<button aria-label="Delete invoice">
    <TrashIcon aria-hidden="true" />
</button>

// Search input
<input
    type="search"
    aria-label="Search invoices"
    placeholder="Search..."
/>

// Form fields with visible labels
<label htmlFor="customer-name">Customer Name</label>
<input id="customer-name" name="customer" />

// Required fields
<label htmlFor="email">
    Email <span aria-hidden="true">*</span>
    <span className="sr-only">(required)</span>
</label>
<input id="email" required aria-required="true" />
```

### Live Regions

```tsx
// Announce changes to screen readers
<div
    role="status"
    aria-live="polite"
    aria-atomic="true"
>
    {message && <p>{message}</p>}
</div>

// Error announcements (more urgent)
<div role="alert" aria-live="assertive">
    {error && <p>{error}</p>}
</div>

// Loading states
<div aria-busy={isLoading} aria-live="polite">
    {isLoading ? 'Loading...' : 'Content loaded'}
</div>
```

### ARIA Roles

| Role | Usage |
|------|-------|
| `button` | Clickable non-button elements |
| `dialog` | Modal windows |
| `alert` | Error/warning messages |
| `status` | Status updates |
| `navigation` | Navigation regions |
| `search` | Search functionality |
| `complementary` | Sidebar content |

---

## 🎨 Color & Contrast

### Minimum Contrast Ratios

| Element | Ratio | Check |
|---------|-------|-------|
| Normal text | 4.5:1 | AA |
| Large text (18px+) | 3:1 | AA |
| UI components | 3:1 | AA |

### Don't Rely on Color Alone

```tsx
// ❌ Bad: Color only
<span className="text-red-500">Required</span>

// ✅ Good: Color + text/icon
<span className="text-red-500">
    <AlertIcon aria-hidden="true" /> Required
</span>

// ❌ Bad: Status by color only
<div className="bg-green-500" />

// ✅ Good: Status with text
<div className="bg-green-500">
    <span className="sr-only">Success</span>
    <CheckIcon aria-hidden="true" />
</div>
```

### Focus Indicators

```css
/* Always visible focus ring */
:focus {
    outline: 2px solid #3B82F6;
    outline-offset: 2px;
}

/* Tailwind utility */
.focus-ring {
    @apply focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none;
}
```

---

## 📊 Tables

### Accessible Tables

```tsx
<table>
    <caption>Invoice List</caption>
    <thead>
        <tr>
            <th scope="col">Invoice #</th>
            <th scope="col">Customer</th>
            <th scope="col">Amount</th>
            <th scope="col">Actions</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>INV-001</td>
            <td>John Doe</td>
            <td>₹1,000</td>
            <td>
                <button aria-label="Edit invoice INV-001">
                    Edit
                </button>
            </td>
        </tr>
    </tbody>
</table>
```

### Sortable Tables

```tsx
<th scope="col">
    <button
        onClick={() => sort('amount')}
        aria-sort={sortColumn === 'amount' ? sortDirection : 'none'}
    >
        Amount
        {sortColumn === 'amount' && (
            <span aria-hidden="true">
                {sortDirection === 'asc' ? '↑' : '↓'}
            </span>
        )}
    </button>
</th>
```

---

## 📝 Forms

### Accessible Form Pattern

```tsx
<form onSubmit={handleSubmit} aria-label="Create Invoice">
    <fieldset>
        <legend>Customer Information</legend>
        
        <div>
            <label htmlFor="customer-name">
                Customer Name
                <span aria-hidden="true" className="text-red-500">*</span>
            </label>
            <input
                id="customer-name"
                type="text"
                required
                aria-required="true"
                aria-describedby="name-hint name-error"
            />
            <p id="name-hint" className="text-gray-500">
                Enter the customer's full name
            </p>
            {errors.name && (
                <p id="name-error" role="alert" className="text-red-500">
                    {errors.name}
                </p>
            )}
        </div>
    </fieldset>

    <button type="submit">
        Create Invoice
    </button>
</form>
```

### Error Handling

```tsx
// Announce errors
<div role="alert" aria-live="assertive">
    {submitError && (
        <p className="text-red-600">
            Error: {submitError}
        </p>
    )}
</div>

// Link errors to fields
<input
    id="email"
    aria-invalid={!!errors.email}
    aria-describedby={errors.email ? 'email-error' : undefined}
/>
{errors.email && (
    <p id="email-error" className="text-red-500">
        {errors.email}
    </p>
)}
```

---

## 🪟 Modals

### Accessible Modal

```tsx
function Modal({ isOpen, onClose, title, children }) {
    const modalRef = useRef<HTMLDivElement>(null);
    
    // Trap focus inside modal
    useEffect(() => {
        if (isOpen) {
            modalRef.current?.focus();
        }
    }, [isOpen]);
    
    // Close on Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            ref={modalRef}
            tabIndex={-1}
        >
            <div className="modal-overlay" onClick={onClose} />
            <div className="modal-content">
                <h2 id="modal-title">{title}</h2>
                {children}
                <button onClick={onClose} aria-label="Close modal">
                    ×
                </button>
            </div>
        </div>
    );
}
```

---

## 🔧 Testing Accessibility

### Automated Testing

```typescript
// Using axe-core with Testing Library
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('Invoice form is accessible', async () => {
    const { container } = render(<InvoiceForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
});
```

### Manual Testing

| Test | How |
|------|-----|
| Keyboard only | Navigate without mouse |
| Screen reader | Use NVDA, VoiceOver, or JAWS |
| Zoom 200% | Content remains usable |
| Color blind | Use simulation tools |
| Reduced motion | Test with `prefers-reduced-motion` |

### Tools

- **axe DevTools** - Browser extension
- **WAVE** - Web accessibility evaluator
- **Lighthouse** - Chrome DevTools audit
- **NVDA** - Free screen reader (Windows)
- **VoiceOver** - Built-in (macOS/iOS)

---

## ✅ Accessibility Checklist

### Keyboard
- [ ] All interactive elements focusable
- [ ] Logical tab order
- [ ] Focus visible
- [ ] Escape closes modals
- [ ] Skip links available

### Screen Readers
- [ ] All images have alt text
- [ ] Buttons/links have labels
- [ ] Form fields have labels
- [ ] Headings in order
- [ ] ARIA used correctly

### Visual
- [ ] Color contrast 4.5:1
- [ ] Text resizable to 200%
- [ ] No color-only information
- [ ] Focus indicators visible

### Forms
- [ ] Labels associated with inputs
- [ ] Errors announced
- [ ] Required fields marked
- [ ] Help text available

---

## 📚 Further Reading

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MDN Accessibility](https://developer.mozilla.org/en-US/docs/Web/Accessibility)
