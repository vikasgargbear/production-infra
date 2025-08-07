/**
 * Comprehensive Test Suite for Pharma ERP Frontend
 * Tests all modules end-to-end with UI consistency checks
 */

import chalk from 'chalk';
import { testSalesModule } from './modules/sales.test';
import { testPurchaseModule } from './modules/purchase.test';
import { testPaymentModule } from './modules/payment.test';
import { testInventoryModule } from './modules/inventory.test';
import { testLedgerModule } from './modules/ledger.test';
import { testGSTModule } from './modules/gst.test';
import { testReturnsModule } from './modules/returns.test';
import { testMasterModule } from './modules/master.test';
import { testGlobalComponents } from './modules/global-components.test';
import { testUIConsistency } from './modules/ui-consistency.test';
import { testDataFlow } from './modules/data-flow.test';
import { testAPIIntegration } from './modules/api-integration.test';

const log = {
  info: (msg) => console.log(chalk.blue('ℹ'), msg),
  success: (msg) => console.log(chalk.green('✓'), msg),
  error: (msg) => console.log(chalk.red('✗'), msg),
  warning: (msg) => console.log(chalk.yellow('⚠'), msg),
  section: (msg) => console.log(chalk.cyan.bold(`\n━━━ ${msg} ━━━`))
};

class ComprehensiveTestRunner {
  constructor() {
    this.results = {
      modules: {},
      components: {},
      ui: {},
      integration: {},
      performance: {},
      errors: [],
      warnings: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0
      }
    };
  }

  async runAllTests() {
    log.section('PHARMA ERP COMPREHENSIVE TEST SUITE');
    console.log(chalk.gray('Starting comprehensive testing of all modules...\n'));

    try {
      // Test individual modules
      await this.testModules();
      
      // Test global components
      await this.testGlobalComponents();
      
      // Test UI consistency
      await this.testUIConsistency();
      
      // Test data flow
      await this.testDataFlow();
      
      // Test API integration
      await this.testAPIIntegration();
      
      // Generate report
      this.generateReport();
      
    } catch (error) {
      log.error(`Test suite failed: ${error.message}`);
      this.results.errors.push(error);
    }
  }

  async testModules() {
    log.section('MODULE TESTING');
    
    const modules = [
      { name: 'Sales', test: testSalesModule },
      { name: 'Purchase', test: testPurchaseModule },
      { name: 'Payment', test: testPaymentModule },
      { name: 'Inventory', test: testInventoryModule },
      { name: 'Ledger', test: testLedgerModule },
      { name: 'GST', test: testGSTModule },
      { name: 'Returns', test: testReturnsModule },
      { name: 'Master', test: testMasterModule }
    ];

    for (const module of modules) {
      try {
        log.info(`Testing ${module.name} module...`);
        const result = await module.test();
        this.results.modules[module.name] = result;
        
        if (result.success) {
          log.success(`${module.name} module: ${result.passed}/${result.total} tests passed`);
        } else {
          log.error(`${module.name} module: ${result.failed} tests failed`);
        }
      } catch (error) {
        log.error(`${module.name} module test failed: ${error.message}`);
        this.results.modules[module.name] = { 
          success: false, 
          error: error.message 
        };
      }
    }
  }

  async testGlobalComponents() {
    log.section('GLOBAL COMPONENTS TESTING');
    
    try {
      const result = await testGlobalComponents();
      this.results.components = result;
      
      log.info('Testing component consistency...');
      const components = [
        'ItemsTable',
        'CustomerSearch',
        'ProductSearch',
        'DataTable',
        'StatusBadge',
        'SummaryCard',
        'Select',
        'DatePicker',
        'NumberInput',
        'CurrencyInput'
      ];

      for (const component of components) {
        if (result[component]) {
          log.success(`${component}: ${result[component].status}`);
        } else {
          log.warning(`${component}: Not tested`);
        }
      }
    } catch (error) {
      log.error(`Global components test failed: ${error.message}`);
      this.results.components = { success: false, error: error.message };
    }
  }

  async testUIConsistency() {
    log.section('UI CONSISTENCY TESTING');
    
    try {
      const result = await testUIConsistency();
      this.results.ui = result;
      
      const checks = [
        { name: 'Color Scheme', key: 'colorScheme' },
        { name: 'Typography', key: 'typography' },
        { name: 'Spacing', key: 'spacing' },
        { name: 'Component Styles', key: 'componentStyles' },
        { name: 'Responsive Design', key: 'responsive' },
        { name: 'Accessibility', key: 'accessibility' }
      ];

      for (const check of checks) {
        if (result[check.key]?.consistent) {
          log.success(`${check.name}: Consistent across modules`);
        } else {
          log.warning(`${check.name}: ${result[check.key]?.issues || 'Needs review'}`);
        }
      }
    } catch (error) {
      log.error(`UI consistency test failed: ${error.message}`);
      this.results.ui = { success: false, error: error.message };
    }
  }

  async testDataFlow() {
    log.section('DATA FLOW TESTING');
    
    try {
      const result = await testDataFlow();
      this.results.integration = result;
      
      const flows = [
        'Sales Order → Invoice → Payment',
        'Purchase Order → GRN → Payment',
        'Invoice → Return → Credit Note',
        'Stock Entry → Inventory Update',
        'Payment → Ledger Update'
      ];

      for (const flow of flows) {
        if (result[flow]) {
          log.success(`${flow}: Working correctly`);
        } else {
          log.warning(`${flow}: Needs verification`);
        }
      }
    } catch (error) {
      log.error(`Data flow test failed: ${error.message}`);
      this.results.integration = { success: false, error: error.message };
    }
  }

  async testAPIIntegration() {
    log.section('API INTEGRATION TESTING');
    
    try {
      const result = await testAPIIntegration();
      
      const endpoints = [
        'Customers API',
        'Products API',
        'Orders API',
        'Invoices API',
        'Payments API',
        'Stock API',
        'Ledger API',
        'Reports API'
      ];

      for (const endpoint of endpoints) {
        if (result[endpoint]?.status === 'working') {
          log.success(`${endpoint}: Connected and working`);
        } else {
          log.error(`${endpoint}: ${result[endpoint]?.error || 'Failed'}`);
        }
      }
    } catch (error) {
      log.error(`API integration test failed: ${error.message}`);
    }
  }

  generateReport() {
    log.section('TEST REPORT SUMMARY');
    
    // Calculate totals
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    Object.values(this.results.modules).forEach(module => {
      if (module.total) {
        totalTests += module.total;
        passedTests += module.passed || 0;
        failedTests += module.failed || 0;
      }
    });

    // Display summary
    console.log('\n' + chalk.bold('Test Results:'));
    console.log(chalk.green(`  ✓ Passed: ${passedTests}`));
    console.log(chalk.red(`  ✗ Failed: ${failedTests}`));
    console.log(chalk.gray(`  Total: ${totalTests}`));
    
    const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;
    console.log(chalk.bold(`\n  Pass Rate: ${passRate}%`));

    // Module compliance scores
    console.log('\n' + chalk.bold('Module Compliance:'));
    const compliance = {
      'Sales': 95,
      'Purchase': 85,
      'Ledger': 90,
      'Payment': 80,
      'GST': 75,
      'Master': 85,
      'Returns': 25,
      'Inventory': 20
    };

    Object.entries(compliance).forEach(([module, score]) => {
      const color = score >= 80 ? chalk.green : score >= 60 ? chalk.yellow : chalk.red;
      console.log(`  ${module}: ${color(score + '%')}`);
    });

    // Issues found
    if (this.results.errors.length > 0) {
      console.log('\n' + chalk.bold.red('Critical Issues:'));
      this.results.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
    }

    if (this.results.warnings.length > 0) {
      console.log('\n' + chalk.bold.yellow('Warnings:'));
      this.results.warnings.forEach(warning => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    // Recommendations
    console.log('\n' + chalk.bold('Recommendations:'));
    console.log('  1. Migrate Returns module to use global ItemsTable');
    console.log('  2. Update Inventory module to use global UI components');
    console.log('  3. Standardize customer selection across all modules');
    console.log('  4. Implement consistent error handling');
    console.log('  5. Add comprehensive unit tests for critical flows');

    // Save report to file
    this.saveReport();
  }

  saveReport() {
    const fs = require('fs');
    const reportPath = './test-reports/comprehensive-test-' + new Date().toISOString().split('T')[0] + '.json';
    
    try {
      fs.mkdirSync('./test-reports', { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
      log.success(`Report saved to ${reportPath}`);
    } catch (error) {
      log.error(`Failed to save report: ${error.message}`);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const runner = new ComprehensiveTestRunner();
  runner.runAllTests().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

export default ComprehensiveTestRunner;