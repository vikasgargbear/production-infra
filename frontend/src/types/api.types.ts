// API Response Types for Pharma Management System

// Common Types
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiListResponse<T> {
  data: T[];
  pagination: Pagination;
  summary?: Record<string, any>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

// Address Types
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  state_code?: string;
  pincode: string;
  area?: string;
  route?: string;
}

// Customer Types
export interface Customer {
  customer_id: number;
  customer_code: string;
  name: string;
  legal_name?: string;
  type: 'b2b' | 'b2c';
  phone: string;
  alternate_phone?: string;
  email?: string;
  gstin?: string;
  drug_license?: string;
  fssai_license?: string;
  address: Address;
  billing_address?: Address;
  credit_limit: number;
  credit_days: number;
  current_balance: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at?: string;
  last_transaction?: string;
}

export interface CustomerSearchResult {
  customer_id: number;
  customer_code: string;
  name: string;
  phone: string;
  type: 'b2b' | 'b2c';
  balance: number;
}

export interface CustomerBalance {
  customer_id: number;
  customer_name: string;
  current_balance: number;
  credit_limit: number;
  available_credit: number;
  overdue_amount: number;
  oldest_invoice_days: number;
  status: 'within_limit' | 'limit_exceeded' | 'overdue';
}

// Product Types
export interface Product {
  product_id: number;
  product_code: string;
  name: string;
  composition?: string;
  category: string;
  manufacturer: string;
  unit: string;
  pack_size: number;
  pack_type?: string;
  hsn_code: string;
  gst_rate: number;
  drug_schedule?: string;
  pricing: ProductPricing;
  stock: ProductStock;
  status: 'active' | 'inactive' | 'discontinued';
  requires_prescription: boolean;
}

export interface ProductPricing {
  mrp: number;
  purchase_rate: number;
  selling_rate: number;
  ptr?: number;
  pts?: number;
  trade_discount?: number;
  scheme_discount?: number;
  margin_percent?: number;
}

export interface ProductStock {
  current_stock: number;
  reserved_stock: number;
  available_stock: number;
  reorder_level: number;
  reorder_quantity: number;
  last_purchase_date?: string;
  last_sale_date?: string;
}

export interface ProductBatch {
  batch_id: number;
  batch_number: string;
  expiry_date: string;
  manufacturing_date?: string;
  quantity: number;
  reserved?: number;
  available?: number;
  purchase_rate: number;
  mrp: number;
  location?: string;
  days_to_expiry?: number;
}

// Invoice Types
export interface Invoice {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  invoice_type: 'tax_invoice' | 'bill_of_supply' | 'export_invoice';
  customer: {
    customer_id: number;
    name: string;
    gstin?: string;
    address: Address;
  };
  items: InvoiceItem[];
  totals: InvoiceTotals;
  payment_terms: PaymentTerms;
  status: 'draft' | 'pending' | 'completed' | 'cancelled';
  payment_status: 'paid' | 'partial' | 'unpaid';
  created_by?: string;
  created_at: string;
}

export interface InvoiceItem {
  item_id: number;
  product: {
    product_id: number;
    name: string;
    hsn_code: string;
  };
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit: string;
  mrp: number;
  unit_price: number;
  discount_percent: number;
  discount_amount: number;
  taxable_amount: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceTotals {
  subtotal: number;
  total_discount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_gst: number;
  round_off: number;
  grand_total: number;
}

export interface PaymentTerms {
  mode: 'cash' | 'credit';
  due_days?: number;
  due_date?: string;
}

// Payment Types
export interface Payment {
  payment_id: number;
  receipt_number: string;
  payment_date: string;
  party_type: 'customer' | 'supplier';
  party_id: number;
  party_name: string;
  total_amount: number;
  payment_modes: PaymentMode[];
  allocations?: PaymentAllocation[];
  advance_amount?: number;
  status: 'pending' | 'completed' | 'cancelled';
  collector_name?: string;
  route?: string;
  remarks?: string;
  created_by: string;
  created_at: string;
}

export interface PaymentMode {
  mode: 'cash' | 'cheque' | 'bank_transfer' | 'upi' | 'credit_card';
  amount: number;
  reference?: string;
  bank_name?: string;
  cheque_number?: string;
  transaction_date?: string;
}

export interface PaymentAllocation {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  invoice_amount: number;
  previous_paid: number;
  allocated_amount: number;
  balance: number;
}

export interface OutstandingInvoice {
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  days_overdue: number;
  type: string;
}

// Purchase Types
export interface PurchaseOrder {
  order_id: number;
  order_number: string;
  order_date: string;
  supplier: {
    supplier_id: number;
    name: string;
    gstin?: string;
  };
  items: PurchaseOrderItem[];
  totals: PurchaseTotals;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  created_at: string;
}

export interface PurchaseOrderItem {
  item_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  gst_rate: number;
  total: number;
}

export interface PurchaseTotals {
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  gst_amount: number;
  grand_total: number;
}

export interface GRN {
  grn_id: number;
  grn_number: string;
  grn_date: string;
  supplier_id: number;
  order_id?: number;
  invoice_number: string;
  invoice_date: string;
  items: GRNItem[];
  status: 'draft' | 'completed' | 'cancelled';
}

export interface GRNItem {
  product_id: number;
  batch_number: string;
  expiry_date: string;
  manufacturing_date?: string;
  quantity: number;
  free_quantity?: number;
  purchase_rate: number;
  mrp: number;
  selling_rate: number;
}

// Stock Types
export interface StockMovement {
  movement_id: number;
  date: string;
  type: 'purchase' | 'sale' | 'return' | 'adjustment' | 'transfer';
  reference: string;
  product_id: number;
  batch_number: string;
  quantity: number;
  balance: number;
  party_name?: string;
  remarks?: string;
}

export interface StockAdjustment {
  adjustment_id: number;
  adjustment_date: string;
  type: 'positive' | 'negative';
  reason: string;
  items: StockAdjustmentItem[];
  approved_by?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface StockAdjustmentItem {
  product_id: number;
  batch_id: number;
  current_quantity: number;
  adjusted_quantity: number;
  difference: number;
  remarks?: string;
}

// Return Types
export interface SalesReturn {
  return_id: number;
  return_number: string;
  return_date: string;
  invoice_id: number;
  customer_id: number;
  items: ReturnItem[];
  totals: ReturnTotals;
  reason: string;
  status: 'pending' | 'approved' | 'completed' | 'cancelled';
}

export interface ReturnItem {
  product_id: number;
  batch_number: string;
  quantity: number;
  rate: number;
  amount: number;
  reason?: string;
}

export interface ReturnTotals {
  subtotal: number;
  gst_amount: number;
  total_amount: number;
}

// GST Types
export interface GSTReturn {
  return_period: string;
  return_type: 'GSTR1' | 'GSTR3B';
  status: 'draft' | 'filed' | 'pending';
  summary: GSTSummary;
  details: GSTDetails[];
}

export interface GSTSummary {
  total_taxable: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_cess: number;
  total_tax: number;
}

export interface GSTDetails {
  gstin: string;
  invoice_count: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_value: number;
}

// Dashboard Types
export interface DashboardStats {
  period: {
    from: string;
    to: string;
  };
  sales: {
    total_amount: number;
    invoice_count: number;
    growth_percent: number;
  };
  purchases: {
    total_amount: number;
    order_count: number;
    pending_grn: number;
  };
  inventory: {
    total_value: number;
    low_stock_items: number;
    expiring_items: number;
  };
  receivables: {
    total_outstanding: number;
    overdue_amount: number;
    collection_percent: number;
  };
}

// User & Auth Types
export interface User {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  organization_id: number;
  permissions: string[];
  last_login?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface Organization {
  id: number;
  name: string;
  legal_name: string;
  gstin: string;
  drug_license?: string;
  fssai_license?: string;
  address: Address;
  subscription_plan: string;
  features: Record<string, boolean>;
}