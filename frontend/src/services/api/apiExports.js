// Use JavaScript APIs from the new wrapper file - these have the .search() methods
export { 
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

// Keep only the partyLedgerAPI from the old exports
export { default as partyLedgerAPI } from './partyLedgerApi';