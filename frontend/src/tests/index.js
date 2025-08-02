/**
 * Main Test Runner
 * Central point for running all tests
 */

// Import all test modules
import { testSalesModule } from './modules/sales.test';
import { testPurchaseModule } from './modules/purchase.test';
import { testReturnsModule } from './modules/returns.test';
import { testPaymentModule } from './modules/payment.test';
import { testInventoryModule } from './modules/inventory.test';
import { testLedgerModule } from './modules/ledger.test';
import { testNotesModule } from './modules/notes.test';

// Import integration tests
import { testSalesIntegration } from './integration/salesFlow.test';
import { testPurchaseIntegration } from './integration/purchaseFlow.test';
import { testAPIConnectivity } from './integration/apiConnectivity.test';

// Import e2e tests
import { testInvoiceE2E } from './e2e/invoice.e2e';
import { testFullWorkflowE2E } from './e2e/fullWorkflow.e2e';

// Test configuration
const TEST_CONFIG = {
  verbose: false,
  stopOnError: false,
  timeout: 30000,
  retries: 1
};

/**
 * Run all tests
 */
export const runAllTests = async (config = {}) => {
  const testConfig = { ...TEST_CONFIG, ...config };
  console.log('🧪 Starting Comprehensive Test Suite...\n');
  
  const startTime = Date.now();
  const results = {
    modules: {},
    integration: {},
    e2e: {},
    summary: {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    }
  };

  // Run module tests
  console.log('📦 Running Module Tests...');
  results.modules = await runModuleTests(testConfig);
  
  // Run integration tests
  console.log('\n🔗 Running Integration Tests...');
  results.integration = await runIntegrationTests(testConfig);
  
  // Run e2e tests
  console.log('\n🚀 Running End-to-End Tests...');
  results.e2e = await runE2ETests(testConfig);
  
  // Calculate summary
  calculateSummary(results);
  
  // Display results
  displayResults(results, Date.now() - startTime);
  
  return results;
};

/**
 * Run module tests
 */
export const runModuleTests = async (config = {}) => {
  const modules = {
    sales: testSalesModule,
    purchase: testPurchaseModule,
    returns: testReturnsModule,
    payment: testPaymentModule,
    inventory: testInventoryModule,
    ledger: testLedgerModule,
    notes: testNotesModule
  };
  
  const results = {};
  
  for (const [name, testFn] of Object.entries(modules)) {
    try {
      console.log(`\n  Testing ${name} module...`);
      results[name] = await runWithTimeout(testFn, config.timeout);
      
      if (config.verbose) {
        console.log(`  ✅ ${name}: ${results[name].passed.length} passed`);
        if (results[name].failed.length > 0) {
          console.log(`  ❌ ${name}: ${results[name].failed.length} failed`);
        }
      }
    } catch (error) {
      console.error(`  ❌ ${name} module test failed:`, error.message);
      results[name] = { passed: [], failed: [{ test: 'Module test', error: error.message }] };
      
      if (config.stopOnError) {
        throw error;
      }
    }
  }
  
  return results;
};

/**
 * Run integration tests
 */
export const runIntegrationTests = async (config = {}) => {
  const tests = {
    salesFlow: testSalesIntegration,
    purchaseFlow: testPurchaseIntegration,
    apiConnectivity: testAPIConnectivity
  };
  
  const results = {};
  
  for (const [name, testFn] of Object.entries(tests)) {
    try {
      console.log(`\n  Testing ${name} integration...`);
      results[name] = await runWithTimeout(testFn, config.timeout);
    } catch (error) {
      console.error(`  ❌ ${name} integration test failed:`, error.message);
      results[name] = { passed: [], failed: [{ test: 'Integration test', error: error.message }] };
    }
  }
  
  return results;
};

/**
 * Run e2e tests
 */
export const runE2ETests = async (config = {}) => {
  const tests = {
    invoice: testInvoiceE2E,
    fullWorkflow: testFullWorkflowE2E
  };
  
  const results = {};
  
  for (const [name, testFn] of Object.entries(tests)) {
    try {
      console.log(`\n  Testing ${name} e2e...`);
      results[name] = await runWithTimeout(testFn, config.timeout);
    } catch (error) {
      console.error(`  ❌ ${name} e2e test failed:`, error.message);
      results[name] = { passed: [], failed: [{ test: 'E2E test', error: error.message }] };
    }
  }
  
  return results;
};

/**
 * Test specific module
 */
export const testModule = async (moduleName, config = {}) => {
  const testConfig = { ...TEST_CONFIG, ...config };
  
  const modules = {
    sales: testSalesModule,
    purchase: testPurchaseModule,
    returns: testReturnsModule,
    payment: testPaymentModule,
    inventory: testInventoryModule,
    ledger: testLedgerModule,
    notes: testNotesModule
  };
  
  if (!modules[moduleName]) {
    throw new Error(`Unknown module: ${moduleName}`);
  }
  
  console.log(`🧪 Testing ${moduleName} module...\n`);
  
  try {
    const results = await runWithTimeout(modules[moduleName], testConfig.timeout);
    displayModuleResults(moduleName, results);
    return results;
  } catch (error) {
    console.error(`❌ ${moduleName} module test failed:`, error);
    throw error;
  }
};

/**
 * Helper: Run with timeout
 */
const runWithTimeout = (fn, timeout) => {
  return Promise.race([
    fn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Test timeout')), timeout)
    )
  ]);
};

/**
 * Helper: Calculate summary
 */
const calculateSummary = (results) => {
  let total = 0;
  let passed = 0;
  let failed = 0;
  
  // Count module tests
  Object.values(results.modules).forEach(module => {
    total += module.passed.length + module.failed.length;
    passed += module.passed.length;
    failed += module.failed.length;
  });
  
  // Count integration tests
  Object.values(results.integration).forEach(test => {
    if (test.passed && test.failed) {
      total += test.passed.length + test.failed.length;
      passed += test.passed.length;
      failed += test.failed.length;
    }
  });
  
  // Count e2e tests
  Object.values(results.e2e).forEach(test => {
    if (test.passed && test.failed) {
      total += test.passed.length + test.failed.length;
      passed += test.passed.length;
      failed += test.failed.length;
    }
  });
  
  results.summary = { total, passed, failed, skipped: 0 };
};

/**
 * Helper: Display results
 */
const displayResults = (results, duration) => {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  // Module results
  console.log('\n📦 Module Tests:');
  Object.entries(results.modules).forEach(([name, result]) => {
    const total = result.passed.length + result.failed.length;
    const status = result.failed.length === 0 ? '✅' : '❌';
    console.log(`  ${status} ${name}: ${result.passed.length}/${total} passed`);
  });
  
  // Integration results
  console.log('\n🔗 Integration Tests:');
  Object.entries(results.integration).forEach(([name, result]) => {
    if (result.passed && result.failed) {
      const total = result.passed.length + result.failed.length;
      const status = result.failed.length === 0 ? '✅' : '❌';
      console.log(`  ${status} ${name}: ${result.passed.length}/${total} passed`);
    }
  });
  
  // E2E results
  console.log('\n🚀 E2E Tests:');
  Object.entries(results.e2e).forEach(([name, result]) => {
    if (result.passed && result.failed) {
      const total = result.passed.length + result.failed.length;
      const status = result.failed.length === 0 ? '✅' : '❌';
      console.log(`  ${status} ${name}: ${result.passed.length}/${total} passed`);
    }
  });
  
  // Summary
  const { total, passed, failed } = results.summary;
  const percentage = total > 0 ? (passed / total * 100).toFixed(1) : 0;
  const status = failed === 0 ? '✅ PASSED' : '❌ FAILED';
  
  console.log('\n' + '='.repeat(60));
  console.log(`${status} - ${passed}/${total} tests passed (${percentage}%)`);
  console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log('='.repeat(60));
};

/**
 * Helper: Display module results
 */
const displayModuleResults = (moduleName, results) => {
  console.log(`\n📊 ${moduleName.toUpperCase()} Module Test Results:`);
  console.log('─'.repeat(40));
  
  if (results.passed.length > 0) {
    console.log('\n✅ Passed Tests:');
    results.passed.forEach(test => console.log(`  ✓ ${test}`));
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(({ test, error }) => {
      console.log(`  ✗ ${test}`);
      console.log(`    Error: ${error}`);
    });
  }
  
  const total = results.passed.length + results.failed.length;
  const percentage = total > 0 ? (results.passed.length / total * 100).toFixed(1) : 0;
  
  console.log('\n' + '─'.repeat(40));
  console.log(`Total: ${results.passed.length}/${total} passed (${percentage}%)`);
};

// Export for browser
if (typeof window !== 'undefined') {
  window.runAllTests = runAllTests;
  window.runModuleTests = runModuleTests;
  window.runIntegrationTests = runIntegrationTests;
  window.runE2ETests = runE2ETests;
  window.testModule = testModule;
}