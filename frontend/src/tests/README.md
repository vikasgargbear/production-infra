# Pharma ERP Testing Framework

## Overview
Comprehensive testing setup for the Pharma ERP system covering unit tests, integration tests, and end-to-end workflows.

## Test Structure
```
src/tests/
├── components/          # Component unit tests
│   ├── CustomerSearch.test.tsx
│   ├── BatchSelector.test.tsx
│   └── ...
├── modules/            # Module-specific tests
│   ├── customer.test.js
│   ├── product.test.js
│   ├── sales.test.js
│   └── ...
├── integration/        # Integration tests
│   ├── SalesWorkflow.test.tsx
│   └── ...
├── e2e/               # End-to-end tests
├── fixtures/          # Test data generators
├── utils/             # Test utilities
└── setup/             # Jest configuration
```

## Running Tests

### Quick Start
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

### Specific Test Suites
```bash
# Test API endpoints
npm run test:api

# Test React components
npm run test:components

# Test business modules
npm run test:modules

# Test integration workflows
npm run test:integration

# Run all tests with coverage
npm run test:all
```

## Key Test Areas

### 1. Component Tests
- **CustomerSearch**: Tests search, selection, creation modal integration
- **ProductSearch**: Tests search with batch selection
- **BatchSelector**: Tests expiry tracking, FIFO/FEFO, quantity validation
- **GSTCalculator**: Tests GST calculation logic
- **PartyLedger**: Tests ledger entries and balance calculations

### 2. Module Tests
- **Customer Management**: CRUD, credit checks, ledger
- **Product Management**: CRUD, batch management, stock levels
- **Sales Process**: Invoices, GST, orders, challans
- **Purchase Process**: PO, GRN, vendor management
- **Financial**: Ledger, payments, outstanding

### 3. Integration Tests
- **Sales Workflow**: Customer → Product → Batch → Invoice → Payment
- **Purchase Workflow**: Vendor → PO → GRN → Invoice → Payment
- **Returns Workflow**: Invoice → Return → Credit/Debit Note

### 4. Critical Pharma Features
- **Batch Expiry Tracking**: Ensures expired batches are filtered
- **FIFO/FEFO**: Tests First Expiry First Out logic
- **Narcotic Products**: Special handling validation
- **GST Compliance**: CGST/SGST/IGST calculations
- **Credit Limits**: Customer credit validation

## Test Data

### Fixtures
```javascript
// Generate test customer
const customer = generateTestCustomer({
  customer_type: 'wholesale',
  credit_limit: 100000
});

// Generate test product with batch
const product = generateTestProduct();
const batch = generateTestBatch(product.product_id);
```

### Mock Data
- Organization ID: `ad808530-1ddb-4377-ab20-67bef145d80d`
- Test API URL: Railway backend or local mock server

## Coverage Goals
- **Unit Tests**: 80% coverage for components and utilities
- **Integration Tests**: All critical workflows covered
- **E2E Tests**: Happy path for major features

## Performance Testing
```javascript
// API endpoint performance
npm run test:api

// Component render performance
Included in component tests
```

## Debugging Tests
```bash
# Run specific test file
npm test -- CustomerSearch.test.tsx

# Run with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Update snapshots
npm test -- -u
```

## CI/CD Integration
Tests are automatically run on:
- Pre-commit hooks
- Pull requests
- Deployment pipeline

## Best Practices
1. **Isolation**: Each test should be independent
2. **Mocking**: Mock external dependencies (API calls)
3. **Async Testing**: Use waitFor for async operations
4. **Cleanup**: Clean up after each test
5. **Descriptive Names**: Test names should describe what they test

## Common Issues

### API Mocking
```javascript
// Mock API response
customerAPI.search = jest.fn().mockResolvedValue({
  success: true,
  data: mockCustomers
});
```

### React Query Testing
```javascript
// Wrap components with QueryClientProvider
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
});
```

### Async Component Testing
```javascript
// Wait for async updates
await waitFor(() => {
  expect(screen.getByText('Customer Name')).toBeInTheDocument();
});
```