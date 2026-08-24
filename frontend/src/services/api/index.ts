// Central API export file - ORGANIZED BY DOMAIN
// All API imports should come from this file for consistency

// Import base utilities
import apiClient, { apiHelpers } from './apiClient';
import * as dataUtils from './utils/dataUtils';

// =========================================================================
// ANALYTICS
// =========================================================================
import { dashboardApi } from './modules/analytics/dashboard.api';
import reportsApi from './modules/analytics/reports.api';
import { collectionCenterApi } from './modules/analytics/collectionCenter.api';
import { customerOutstandingApi } from './modules/analytics/customerOutstanding.api';

// =========================================================================
// AUDIT
// =========================================================================
import { auditApi } from './modules/audit/audit.api';

// =========================================================================
// AUTH
// =========================================================================
import { authApi } from './modules/auth/auth.api';
import { usersApi } from './modules/auth/users.api';
import { roleManagementApi } from './modules/auth/roleManagement.api';

// =========================================================================
// COMPLIANCE
// =========================================================================
import { gstApi } from './modules/compliance/gst.api';
import { taxEntriesApi } from './modules/compliance/taxEntries.api';
import { complianceApi } from './modules/compliance/compliance.api';

// =========================================================================
// FINANCE
// =========================================================================
import { ledgerApi, partyLedgerApi } from './modules/finance/ledger.api';
import { paymentsApi } from './modules/finance/payments.api';
import { paymentAllocationApi } from './modules/finance/paymentAllocation.api';
import { journalApi } from './modules/finance/journal.api';
import { expensesApi } from './modules/finance/expenses.api';
import { notesApi } from './modules/finance/notes.api';

// =========================================================================
// INVENTORY
// =========================================================================
import { stockApi } from './modules/inventory/stock.api';
import { batchesApi } from './modules/inventory/batches.api';
import { inventoryMovementsApi } from './modules/inventory/inventoryMovements.api';
import { conversionsApi } from './modules/inventory/conversions.api';

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
import organizationsApi from './modules/org/organizations.api';
import { branchesApi } from './modules/org/branches.api';
import { departmentsApi } from './modules/org/departments.api';

// =========================================================================
// PURCHASE
// =========================================================================
import { purchasesApi } from './modules/purchase/purchases.api';
import { grnApi } from './modules/purchase/grn.api';
import { supplierInvoicesApi } from './modules/purchase/supplierInvoices.api';

// =========================================================================
// SALES
// =========================================================================
import { invoicesApi } from './modules/sales/invoices.api';
import { ordersApi } from './modules/sales/orders.api';
import { challansApi } from './modules/sales/challans.api';
import { returnsApi } from './modules/sales/returns.api';
import { challanCalculationsApi, invoiceCalculationsApi, salesOrderCalculationsApi } from './modules/sales/calculations.api';

// =========================================================================
// SETTINGS
// =========================================================================
import settingsApi from './modules/settings/settings.api';
import { metadataApi } from './modules/settings/metadata.api';
import { setupApi } from './modules/settings/setup.api';
import utilsApi from './modules/settings/utils.api';

// =========================================================================
// SYSTEM
// =========================================================================
import { documentsApi } from './modules/system/documents.api';

// =========================================================================
// EXPORTS
// =========================================================================

export {
  // API Client
  apiClient,
  apiHelpers,

  // Audit
  auditApi,

  // Analytics
  dashboardApi,
  reportsApi,
  collectionCenterApi,
  customerOutstandingApi,

  // Auth
  authApi,
  usersApi,
  roleManagementApi,

  // Compliance
  gstApi,
  taxEntriesApi,
  complianceApi,

  // Finance
  ledgerApi,
  partyLedgerApi,
  paymentsApi,
  paymentAllocationApi,
  journalApi,
  expensesApi,
  notesApi,

  // Inventory
  stockApi,
  batchesApi,
  inventoryMovementsApi,
  conversionsApi,

  // Master
  customersApi,
  suppliersApi,
  productsApi,
  employeesApi,
  bankAccountsApi,

  // Org
  companyApi,
  organizationsApi,
  branchesApi,
  departmentsApi,

  // Purchase
  purchasesApi,
  grnApi,
  supplierInvoicesApi,

  // Sales
  invoicesApi,
  ordersApi,
  challansApi,
  returnsApi,
  invoiceCalculationsApi,
  salesOrderCalculationsApi,
  challanCalculationsApi,

  // Settings
  settingsApi,
  metadataApi,
  setupApi,
  utilsApi,

  // System
  documentsApi,

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
  // Analytics
  analytics: { dashboard: dashboardApi, reports: reportsApi, collectionCenter: collectionCenterApi, customerOutstanding: customerOutstandingApi },

  // Audit
  audit: { auditLogs: auditApi },

  // Auth
  auth: { auth: authApi, users: usersApi, roles: roleManagementApi },

  // Compliance
  compliance: { gst: gstApi, taxEntries: taxEntriesApi, compliance: complianceApi },

  // Finance
  finance: { ledger: ledgerApi, partyLedger: partyLedgerApi, payments: paymentsApi, paymentAllocation: paymentAllocationApi, journal: journalApi, expenses: expensesApi, notes: notesApi },

  // Inventory
  inventory: { stock: stockApi, batches: batchesApi, movements: inventoryMovementsApi, conversions: conversionsApi },

  // Master
  master: { customers: customersApi, suppliers: suppliersApi, products: productsApi, employees: employeesApi, bankAccounts: bankAccountsApi },

  // Org
  org: { company: companyApi, organizations: organizationsApi, branches: branchesApi, departments: departmentsApi },

  // Purchase
  purchase: { purchases: purchasesApi, grn: grnApi, supplierInvoices: supplierInvoicesApi },

  // Sales
  sales: { invoices: invoicesApi, calculations: invoiceCalculationsApi, orderCalculations: salesOrderCalculationsApi, orders: ordersApi, challans: challansApi, returns: returnsApi },

  // Settings
  settings: { settings: settingsApi, metadata: metadataApi, setup: setupApi, utils: utilsApi },

  // System
  system: { documents: documentsApi }
};

// For backward compatibility: export the raw axios instance as default
// @ts-ignore
const api = apiClient;
Object.assign(api, apiModules);

export { api, apiModules };
export default api;
