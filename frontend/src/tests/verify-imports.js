/**
 * Import Verification Script
 * Checks that all major imports are working after folder reorganization
 */

console.log('🔍 Verifying imports after folder reorganization...\n');

const importTests = [
  // Global Components
  {
    name: 'Global Components',
    imports: () => {
      const { 
        CustomerSearch, 
        ProductSearch, 
        DataTable, 
        StatusBadge,
        GSTCalculator 
      } = require('../components/global');
      return { CustomerSearch, ProductSearch, DataTable, StatusBadge, GSTCalculator };
    }
  },

  // API Modules
  {
    name: 'API Services',
    imports: () => {
      const {
        customerAPI,
        productAPI,
        ledgerApi,
        invoiceAPI,
        paymentAPI
      } = require('../services/api');
      return { customerAPI, productAPI, ledgerApi, invoiceAPI, paymentAPI };
    }
  },

  // Ledger Components
  {
    name: 'Ledger Module',
    imports: () => {
      const {
        PartyLedger,
        OutstandingBills,
        CollectionCenter,
        AgingAnalysis,
        PartyBalance,
        LedgerReports
      } = require('../components/ledger');
      return { PartyLedger, OutstandingBills, CollectionCenter };
    }
  },

  // Common Components
  {
    name: 'Common Components',
    imports: () => {
      const { ModuleSidebar } = require('../components/common');
      return { ModuleSidebar };
    }
  },

  // Hooks
  {
    name: 'Custom Hooks',
    imports: () => {
      const { useCustomerSearch } = require('../hooks/customers/useCustomers');
      const { useProductSearch } = require('../hooks/products/useProducts');
      return { useCustomerSearch, useProductSearch };
    }
  },

  // Types
  {
    name: 'TypeScript Types',
    imports: () => {
      const customerTypes = require('../types/models/customer');
      const productTypes = require('../types/models/product');
      return { customerTypes, productTypes };
    }
  }
];

let passed = 0;
let failed = 0;

importTests.forEach(test => {
  try {
    const imports = test.imports();
    const importedKeys = Object.keys(imports).filter(key => imports[key] !== undefined);
    
    if (importedKeys.length > 0) {
      console.log(`✅ ${test.name}: Successfully imported ${importedKeys.length} items`);
      console.log(`   Imported: ${importedKeys.join(', ')}`);
      passed++;
    } else {
      console.log(`❌ ${test.name}: No imports found`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${test.name}: Import failed`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
  console.log('');
});

console.log('📊 Summary:');
console.log(`   ✅ Passed: ${passed}`);
console.log(`   ❌ Failed: ${failed}`);
console.log(`   Total: ${importTests.length}`);

if (failed === 0) {
  console.log('\n🎉 All imports are working correctly!');
} else {
  console.log('\n⚠️  Some imports need attention.');
  process.exit(1);
}