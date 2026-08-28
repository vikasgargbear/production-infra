// Central API export file - ORGANIZED BY DOMAIN
// All API imports should come from this file for consistency

// Import base utilities
import apiClient, { apiHelpers } from './apiClient';
import * as dataUtils from './utils/dataUtils';

// =========================================================================
// COMPLIANCE
// =========================================================================
import { gstApi } from './modules/compliance/gst.api';

// =========================================================================
// FINANCE
// =========================================================================
import { ledgerApi } from './modules/finance/ledger.api';
import { paymentsApi } from './modules/finance/payments.api';
import { paymentAllocationApi } from './modules/finance/paymentAllocation.api';
import { reportingApi } from './modules/finance/reporting.api';

// =========================================================================
// INVENTORY
// =========================================================================
import { batchesApi } from './modules/inventory/batches.api';

// =========================================================================
// MASTER
// =========================================================================
import { customersApi } from './modules/master/customers.api';
import { suppliersApi } from './modules/master/suppliers.api';
import { productsApi } from './modules/master/products.api';
import { employeesApi } from './modules/master/employees.api';
import { bankAccountsApi } from './modules/master/bankAccounts.api';

// =========================================================================
// ORG
// =========================================================================
import { companyApi } from './modules/org/company.api';
import { branchesApi } from './modules/org/branches.api';

// =========================================================================
// PURCHASE
// =========================================================================
import { purchasesApi } from './modules/purchase/purchases.api';
import { grnApi } from './modules/purchase/grn.api';

// =========================================================================
// SALES
// =========================================================================
import { invoicesApi } from './modules/sales/invoices.api';
import { ordersApi } from './modules/sales/orders.api';
import { challansApi } from './modules/sales/challans.api';
import { challanCalculationsApi, invoiceCalculationsApi, salesOrderCalculationsApi } from './modules/sales/calculations.api';

// =========================================================================
// SETTINGS
// =========================================================================
import settingsApi from './modules/settings/settings.api';

import {
  canonicalDocumentHistoryApi,
  requireCanonicalHistoryAmount,
} from './modules/history/canonicalDocumentHistory.api';

// =========================================================================
// EXPORTS
// =========================================================================

export {
  // API Client
  apiClient,
  apiHelpers,

  // Compliance
  gstApi,

  // Finance
  ledgerApi,
  paymentsApi,
  paymentAllocationApi,
  reportingApi,

  // Inventory
  batchesApi,

  // Master
  customersApi,
  suppliersApi,
  productsApi,
  employeesApi,
  bankAccountsApi,

  // Org
  companyApi,
  branchesApi,

  // Purchase
  purchasesApi,
  grnApi,

  // Sales
  invoicesApi,
  ordersApi,
  challansApi,
  invoiceCalculationsApi,
  salesOrderCalculationsApi,
  challanCalculationsApi,

  // Settings
  settingsApi,

  // System
  canonicalDocumentHistoryApi,
  requireCanonicalHistoryAmount,

  // Utilities
  dataUtils,
};

// =========================================================================
// BACKWARD COMPATIBILITY ALIASES REMOVED
// All callers have been migrated to use canonical exports (customersApi, productsApi, etc.)
// See docs/API_METHOD_NAMING_DICTIONARY.md for naming conventions
// =========================================================================

// API object with all modules grouped by domain
const apiModules = {
  // Compliance
  compliance: { gst: gstApi },

  // Finance
  finance: { ledger: ledgerApi, payments: paymentsApi, paymentAllocation: paymentAllocationApi },

  // Inventory
  inventory: { batches: batchesApi },

  // Master
  master: { customers: customersApi, suppliers: suppliersApi, products: productsApi, employees: employeesApi, bankAccounts: bankAccountsApi },

  // Org
  org: { company: companyApi, branches: branchesApi },

  // Purchase
  purchase: { purchases: purchasesApi, grn: grnApi },

  // Sales
  sales: { invoices: invoicesApi, calculations: invoiceCalculationsApi, orderCalculations: salesOrderCalculationsApi, orders: ordersApi, challans: challansApi },

  // Settings
  settings: { settings: settingsApi },

};

// For backward compatibility: export the raw axios instance as default
// @ts-ignore
const api = apiClient;
Object.assign(api, apiModules);

export { api, apiModules };
export default api;
