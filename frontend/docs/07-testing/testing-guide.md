# 🧪 Testing Strategy

> **Comprehensive testing approach** for the frontend application

---

## 📋 Testing Stack

| Tool | Purpose | Version |
|------|---------|---------|
| **Vitest** | Unit/Integration tests | 1.x |
| **React Testing Library** | Component testing | 14.x |
| **Playwright** | E2E testing | 1.x |
| **MSW** | API mocking | 2.x |

---

## 🎯 Testing Pyramid

```
                    ╭───────────╮
                    │    E2E    │  ~10% - Critical flows
                    │   Tests   │
                ╭───┴───────────┴───╮
                │   Integration     │  ~30% - API, hooks
                │      Tests        │
            ╭───┴───────────────────┴───╮
            │        Unit Tests         │  ~60% - Components, utils
            ╰───────────────────────────╯
```

---

## 📁 Test File Structure

```
src/
├── components/
│   └── sales/
│       └── invoice/
│           ├── Invoice.tsx
│           ├── Invoice.test.tsx       # Unit tests
│           └── __mocks__/
│               └── invoiceMocks.ts
│
├── hooks/
│   ├── useDebounce.ts
│   └── useDebounce.test.ts           # Hook tests
│
├── utils/
│   ├── formatters.ts
│   └── formatters.test.ts            # Utility tests
│
└── __tests__/
    ├── integration/                   # Integration tests
    │   └── invoiceFlow.test.ts
    └── e2e/                          # Playwright tests
        └── invoice.spec.ts
```

---

## 🧪 Unit Testing

### Testing Components

```typescript
// Invoice.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Invoice from './Invoice';

describe('Invoice', () => {
  it('renders invoice number', () => {
    render(<Invoice invoiceNumber="INV-001" />);
    expect(screen.getByText('INV-001')).toBeInTheDocument();
  });

  it('calls onSave when save button clicked', async () => {
    const onSave = vi.fn();
    render(<Invoice onSave={onSave} />);
    
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('disables submit when form is invalid', () => {
    render(<Invoice />);
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });
});
```

### Testing Hooks

```typescript
// useDebounce.test.ts
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('debounces value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'updated' });
    expect(result.current).toBe('initial'); // Still old value

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe('updated'); // Now updated
  });
});
```

### Testing Utilities

```typescript
// formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatPhone } from './formatters';

describe('formatCurrency', () => {
  it('formats positive numbers with rupee symbol', () => {
    expect(formatCurrency(1000)).toBe('₹1,000.00');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('formats negative numbers', () => {
    expect(formatCurrency(-500)).toBe('-₹500.00');
  });

  it('handles null/undefined', () => {
    expect(formatCurrency(null)).toBe('₹0.00');
    expect(formatCurrency(undefined)).toBe('₹0.00');
  });
});

describe('formatDate', () => {
  it('formats ISO date to DD-MM-YYYY', () => {
    expect(formatDate('2026-01-09')).toBe('09-01-2026');
  });

  it('handles invalid dates', () => {
    expect(formatDate('invalid')).toBe('Invalid Date');
  });
});
```

---

## 🔌 Integration Testing

### Testing with API Mocks (MSW)

```typescript
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/invoices', () => {
    return HttpResponse.json({
      data: [
        { invoice_id: 1, invoice_number: 'INV-001', total: 1000 },
        { invoice_id: 2, invoice_number: 'INV-002', total: 2000 },
      ],
      pagination: { total: 2 }
    });
  }),

  http.post('/api/invoices', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      data: { invoice_id: 3, invoice_number: 'INV-003', ...body }
    }, { status: 201 });
  }),
];
```

```typescript
// InvoiceList.integration.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { handlers } from '../mocks/handlers';
import InvoiceList from './InvoiceList';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('InvoiceList Integration', () => {
  it('fetches and displays invoices', async () => {
    render(<InvoiceList />);

    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument();
      expect(screen.getByText('INV-002')).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    server.use(
      http.get('/api/invoices', () => {
        return HttpResponse.json(
          { error: 'Server Error' },
          { status: 500 }
        );
      })
    );

    render(<InvoiceList />);

    await waitFor(() => {
      expect(screen.getByText(/error loading/i)).toBeInTheDocument();
    });
  });
});
```

---

## 🎭 E2E Testing (Playwright)

### Test Setup

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:5173',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

### E2E Test Example

```typescript
// e2e/invoice.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Invoice Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('creates new invoice successfully', async ({ page }) => {
    // Navigate to invoice creation
    await page.click('text=Sales');
    await page.click('text=Invoice');
    await page.click('text=Create Invoice');

    // Fill customer
    await page.fill('[data-testid="customer-search"]', 'Test Customer');
    await page.click('.customer-option >> text=Test Customer');

    // Add product
    await page.fill('[data-testid="product-search"]', 'Paracetamol');
    await page.click('.product-option >> text=Paracetamol 500mg');
    await page.fill('[data-testid="quantity"]', '10');

    // Save
    await page.click('[data-testid="save-invoice"]');

    // Verify success
    await expect(page.locator('.toast-success')).toBeVisible();
    await expect(page.locator('text=INV-')).toBeVisible();
  });

  test('validates required fields', async ({ page }) => {
    await page.goto('/sales/invoice/new');
    await page.click('[data-testid="save-invoice"]');

    await expect(page.locator('text=Customer is required')).toBeVisible();
    await expect(page.locator('text=Add at least one item')).toBeVisible();
  });
});
```

---

## 📊 Test Coverage

### Running Coverage

```bash
# Unit/Integration coverage
npm run test:coverage

# View coverage report
npx serve coverage
```

### Coverage Targets

| Category | Target | Minimum |
|----------|--------|---------|
| Statements | 80% | 70% |
| Branches | 75% | 60% |
| Functions | 80% | 70% |
| Lines | 80% | 70% |

### Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/mocks/**',
      ],
    },
  },
});
```

---

## 🏃 Running Tests

| Command | Description |
|---------|-------------|
| `npm test` | Run all unit tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | With coverage |
| `npm run test:e2e` | E2E tests (Playwright) |
| `npm run test:e2e:ui` | E2E with UI |

---

## ✅ Test Checklist

### For Every Component

- [ ] Renders without crashing
- [ ] Displays correct initial state
- [ ] Handles user interactions
- [ ] Handles edge cases (empty, null)
- [ ] Accessibility (keyboard, screen reader)

### For Every Hook

- [ ] Returns correct initial value
- [ ] Updates state correctly
- [ ] Handles cleanup
- [ ] Handles edge cases

### For Every API Integration

- [ ] Handles loading state
- [ ] Displays data correctly
- [ ] Handles errors gracefully
- [ ] Handles empty responses

---

## 📚 Further Reading

- [React Testing Library Docs](https://testing-library.com/docs/react-testing-library/intro/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
