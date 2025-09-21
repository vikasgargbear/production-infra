// Central API export file - CLEAN VERSION
// All API imports should come from this file for consistency

// Import base utilities
import apiClient, { apiHelpers } from './apiClient';
import * as dataUtils from './utils/dataUtils';

// Import the reliable JavaScript wrapper APIs (these have .search() methods)
import { 
  customerAPI, 
  productAPI, 
  supplierAPI,
  invoiceAPI,
  ordersAPI,
  purchasesAPI,
  paymentAPI,
  challansAPI,
  salesOrdersAPI
} from './apiClientExports';

// Import remaining JavaScript modules
import { authApi } from './modules/auth.api';
import { batchesApi } from './modules/batches.api';
import { challansApi as challansApiModule } from './modules/challans.api';
import { customersApi as customersApiModule } from './modules/customers.api';
import { suppliersApi as suppliersApiModule } from './modules/suppliers.api';
import { productsApi as productsApiModule } from './modules/products.api';
import { deliveryApi } from './modules/delivery.api';
import { ledgerApi } from './modules/ledger.api';
import { notesApi } from './modules/notes.api';
import { purchasesApi } from './modules/purchases.api';
import { returnsApi } from './modules/returns.api';
import { stockApi } from './modules/stock.api';
import { salesApi } from './modules/sales.api';
import { usersApi } from './modules/users.api';
import { dashboardApi } from './modules/dashboard.api';
import { inventoryMovementsApi } from './modules/inventoryMovements.api';
import { orderItemsApi } from './modules/orderItems.api';
import reportsApi from './modules/reports.api';
import settingsApi from './modules/settings.api';
import utilsApi, { apiUtils } from './modules/utils.api';
import organizationsApi from './modules/organizations.api';
import partyLedgerApi from './partyLedgerApi';
import { companyAPI, DEFAULT_COMPANY_INFO } from './company.api';
import { bankAccountsAPI } from './bankAccounts.api';
import { journalApi } from './modules/journal.api';
import { expensesApi } from './modules/expenses.api';
import { metadataApi } from './modules/metadata.api';
import { gstApi, clearGSTCache } from './modules/gst.api';

// Re-export everything for easy access
export {
  // API Client
  apiClient,
  apiHelpers,
  
  // Primary APIs with search methods (from TypeScript wrapper)
  customerAPI,
  productAPI,
  // supplierAPI exported below as suppliersApi to avoid duplicate
  invoiceAPI,
  ordersAPI,
  purchasesAPI,
  paymentAPI,
  challansAPI,
  salesOrdersAPI,
  
  // JavaScript module APIs
  authApi,
  batchesApi,
  deliveryApi,
  ledgerApi,
  notesApi,
  purchasesApi,
  returnsApi,
  stockApi,
  salesApi,
  usersApi,
  dashboardApi,
  inventoryMovementsApi,
  orderItemsApi,
  reportsApi,
  settingsApi,
  utilsApi,
  apiUtils,
  organizationsApi,
  partyLedgerApi,
  companyAPI,
  bankAccountsAPI,
  DEFAULT_COMPANY_INFO,
  journalApi,
  expensesApi,
  metadataApi,
  gstApi,
  clearGSTCache,
  
  // Aliases for backward compatibility
  customerAPI as customersApiOld,
  customersApiModule as customersApi,
  productsApiModule as productsApi,  // Use the full module with CRUD methods
  suppliersApiModule as suppliersApi,
  supplierAPI, // Export supplierAPI here only once
  invoiceAPI as invoicesApi,
  purchasesAPI as purchasesAPIAlias,  // Renamed to avoid conflict with modules/purchases.api
  purchasesAPI as purchaseApi,
  ordersAPI as ordersApi,
  paymentAPI as paymentsApi,
  challansApiModule as challansApi,  // Use the module version which has getAll
  batchesApi as batchAPI,
  partyLedgerApi as partyLedgerAPI,
  salesOrdersAPI as salesOrdersAPIAlias,
  
  // Utilities
  dataUtils,
};

// API object with all modules grouped (for named export)
const apiModules = {
  auth: authApi,
  customers: customersApiModule,
  products: productsApiModule,  // Use the full module with CRUD methods
  suppliers: supplierAPI,
  invoices: invoiceAPI,
  purchases: purchasesAPI,
  challans: challansAPI,
  orders: ordersAPI,
  payments: paymentAPI,
  reports: reportsApi,
  settings: settingsApi,
  utils: utilsApi,
  returns: returnsApi,
  ledger: ledgerApi,
  notes: notesApi,
  stock: stockApi,
  sales: salesApi,
  salesOrders: salesOrdersAPI,
  organizations: organizationsApi.organizations,
  features: organizationsApi.features,
  partyLedger: partyLedgerApi,
  bankAccounts: bankAccountsAPI,
  metadata: metadataApi,
};

// For backward compatibility: export the raw axios instance as default
const api = apiClient;
Object.assign(api, apiModules);

export { api, apiModules };
export default api;