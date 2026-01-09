# 🧪 Testing Strategy

> **Quality assurance approach** for the frontend application

---

## 🎯 Testing Pyramid

```
           /\
          /  \         E2E Tests (Playwright)
         /    \        - Critical user flows
        /──────\       - ~10% of tests
       /        \
      /  Integr  \     Integration Tests
     /   ation    \    - Component + API
    /──────────────\   - ~20% of tests
   /                \
  /    Unit Tests    \  Unit Tests (Vitest)
 /                    \ - Hooks, utils, logic
/──────────────────────\ - ~70% of tests
```

---

## 📋 What to Test

| Layer | What to Test | Tool |
|-------|--------------|------|
| **Unit** | Hooks, utils, reducers | Vitest |
| **Component** | UI rendering, props | React Testing Library |
| **Integration** | Component + API | MSW + RTL |
| **E2E** | User flows | Playwright |

---

## 🔧 Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific file
npm test -- useModuleState.test.ts

# Run E2E tests
npm run test:e2e

# Run E2E in UI mode
npm run test:e2e:ui
```

---

## 📝 Test File Organization

```
src/
├── components/
│   └── module/
│       ├── Module.tsx
│       └── __tests__/
│           ├── Module.test.tsx
│           └── useModuleState.test.ts
├── utils/
│   ├── formatters.ts
│   └── __tests__/
│       └── formatters.test.ts
└── __tests__/          # Integration tests
    └── integration/
        └── invoiceFlow.test.tsx

e2e/                    # E2E tests
├── invoice.spec.ts
├── purchase.spec.ts
└── fixtures/
    └── testData.ts
```

---

## 📚 Further Reading

- [Unit Tests](./unit-tests.md)
- [Integration Tests](./integration-tests.md)
- [E2E Tests](./e2e-tests.md)
- [Test Data](./test-data.md)
