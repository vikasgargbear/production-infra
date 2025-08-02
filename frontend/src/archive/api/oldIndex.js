// Central API export file
// All API imports should come from this file for consistency

// Import all API modules
import { authApi } from './modules/auth.api';
import { productsApi } from './modules/products.api';
import { customersApi } from './modules/customers.api';
import { suppliersApi } from './modules/suppliers.api';
import { invoicesApi } from './modules/invoices.api';
import { purchasesApi } from './modules/purchases.api';
import { challansApi } from './modules/challans.api';
import { ordersApi } from './modules/orders.api';
import { paymentsApi } from './modules/payments.api';
import settingsApi from './modules/settings.api';
import utilsApi, { apiUtils } from './modules/utils.api';
import reportsApi from './modules/reports.api';
import { returnsApi } from './modules/returns.api';
import { ledgerApi } from './modules/ledger.api';
import { notesApi } from './modules/notes.api';
import { stockApi } from './modules/stock.api';
import { salesApi } from './modules/sales.api';
import salesOrdersAPI from './modules/salesOrders.api';
import organizationsApi from './modules/organizations.api';
import partyLedgerApi from './partyLedgerApi';

// Import new modules for backward compatibility
import { batchesApi } from './modules/batches.api';
import { orderItemsApi } from './modules/orderItems.api';
import { inventoryMovementsApi } from './modules/inventoryMovements.api';
import { usersApi } from './modules/users.api';
import { dashboardApi } from './modules/dashboard.api';
import { deliveryApi } from './modules/delivery.api';

// Import utilities
import apiClient, { apiHelpers } from './apiClient';
// Import the reliable JavaScript APIs
import { customerAPI, productAPI, supplierAPI, invoiceAPI as invoiceAPIClient, ordersAPI as ordersAPIClient, purchasesAPI as purchasesAPIClient, paymentAPI as paymentAPIClient, challansAPI as challansAPIClient, salesOrdersAPI as salesOrdersAPIClient, partyLedgerAPI as partyLedgerAPIClient } from './apiClientExports';
import * as dataUtils from './utils/dataUtils';

// Re-export everything for easy access
export {
  // API Client
  apiClient,
  apiHelpers,
  
  // API Modules (All from old api.js)
  authApi,
  productsApi,
  customersApi,
  suppliersApi,
  invoicesApi,
  purchasesApi,
  purchasesApi as purchaseApi, // Alias for compatibility
  challansApi,
  ordersApi,
  paymentsApi,
  reportsApi,
  settingsApi,
  utilsApi,
  returnsApi,
  ledgerApi,
  notesApi,
  stockApi,
  salesApi,
  salesOrdersAPI,
  organizationsApi,
  partyLedgerApi,
  partyLedgerAPIClient as partyLedgerAPI,
  batchesApi as batchAPI,
  customerAPI,
  productAPI,
  supplierAPI,
  invoiceAPIClient as invoiceAPI,
  ordersAPIClient as ordersAPI,
  purchasesAPIClient as purchasesAPI,
  paymentAPIClient as paymentAPI,
  challansAPIClient as challansAPI,
  salesOrdersAPIClient as salesOrdersAPI,
  
  // Additional APIs for backward compatibility
  batchesApi,
  orderItemsApi,
  inventoryMovementsApi,
  usersApi,
  dashboardApi,
  deliveryApi,
  apiUtils,
  
  // Utilities
  dataUtils,
};

// API object with all modules grouped (for named export)
const apiModules = {
  auth: authApi,
  products: productsApi,
  customers: customersApi,
  suppliers: suppliersApi,
  invoices: invoicesApi,
  purchases: purchasesApi,
  challans: challansApi,
  orders: ordersApi,
  payments: paymentsApi,
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
};

// For backward compatibility: export the raw axios instance as default
// This allows code that uses api.post(), api.get() etc to continue working
const api = apiClient;

// Also attach all the API modules to the axios instance for convenience
Object.assign(api, apiModules);

export { api, apiModules };
export default api;