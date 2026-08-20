/**
 * Customer Type Definitions
 * ALIGNED with backend parties.customers schema
 * NOT NULL fields in DB = required in TypeScript
 */

export interface Customer {
  // Primary fields - NOT NULL in DB
  customer_id: number;  // NOT NULL
  customer_code: string;  // NOT NULL in DB (was incorrectly optional!)
  customer_name: string;  // NOT NULL
  customer_type: string;  // NOT NULL (was incorrectly optional!)
  primary_phone: string;  // NOT NULL (was missing!)

  // Nullable contact fields
  primary_email?: string;
  secondary_phone?: string;
  whatsapp_number?: string;
  contact_person_name?: string;
  contact_person_phone?: string;
  contact_person_email?: string;

  // GST and compliance (all nullable in DB)
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  drug_license_validity?: string | Date;
  fssai_number?: string;
  establishment_year?: number;

  // Business info (nullable)
  business_type?: string;
  customer_category?: string;
  customer_grade?: string;
  territory_id?: number;
  route_id?: number;
  area_code?: string;
  assigned_salesperson_id?: number;
  discount_group_id?: number;

  // Credit management (all nullable)
  credit_limit?: number;
  current_outstanding?: number;
  credit_days?: number;
  credit_rating?: string;
  payment_terms?: string;
  security_deposit?: number;
  overdue_interest_rate?: number;

  // KYC (nullable)
  kyc_status?: string;
  kyc_verified_date?: string;
  kyc_documents?: any;

  // Preferences (nullable)
  preferred_payment_mode?: string;
  preferred_delivery_time?: string;
  prefer_sms?: boolean;
  prefer_email?: boolean;
  prefer_whatsapp?: boolean;

  // Transaction history (nullable)
  first_transaction_date?: string | Date;
  last_transaction_date?: string | Date;
  total_business_amount?: number;
  total_transactions?: number;
  average_order_value?: number;

  // Status and flags (nullable - is_active defaults true in DB)
  is_active?: boolean;
  blacklisted?: boolean;
  blacklist_reason?: string;
  blacklist_date?: string | Date;

  // Notes (nullable)
  internal_notes?: string;

  // Timestamps (nullable)
  created_at?: string | Date;
  updated_at?: string | Date;
  created_by?: number;

  // UI/Frontend compatibility fields (aliases for legacy component support)
  phone?: string;  // Alias for primary_phone
  email?: string;  // Alias for primary_email
  available_credit?: number;
  discount_percentage?: number;
  customer_group?: string;
  status?: 'active' | 'inactive' | 'blocked';
  notes?: string;
  total_business?: number;

  // Nested address structures for UI components
  billing_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  shipping_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
  contact_info?: {
    primary_phone?: string;
    secondary_phone?: string;
    email?: string;
  };
  // Legacy address_info structure for backwards compatibility
  address_info?: {
    billing_address?: string;
    billing_city?: string;
    billing_state?: string;
    billing_pincode?: string;
  };
}

export interface CustomerCreateInput {
  customer_code?: string; // Auto-generated if not provided
  customer_name: string;
  customer_type: Customer['customer_type'];
  contact_info: {
    primary_phone: string;
    secondary_phone?: string;
    email?: string;
  };
  address_info: {
    billing_address: string;
    billing_city: string;
    billing_state: string;
    billing_pincode: string;
    billing_country?: string;
    // Shipping defaults to billing if not provided
    shipping_address?: string;
    shipping_city?: string;
    shipping_state?: string;
    shipping_pincode?: string;
  };
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  credit_limit?: number;
  credit_days?: number;
  customer_group?: string;
  discount_percentage?: number;
}

export interface CustomerUpdateInput extends Partial<CustomerCreateInput> {
  status?: Customer['status'];
  notes?: string;
}

export interface CustomerSearchParams {
  query?: string;
  search?: string;
  customer_type?: Customer['customer_type'];
  status?: Customer['status'];
  has_outstanding?: boolean;
  customer_group?: string;
  page?: number;
  page_size?: number;
  sort_by?: keyof Customer;
  sort_order?: 'asc' | 'desc';
}

export interface CreditCheckRequest {
  customer_id: number;
  order_amount: number;
}

export interface CreditCheckResponse {
  customer_id: number;
  credit_limit: number;
  outstanding_balance: number;
  available_credit: number;
  order_amount: number;
  after_order_outstanding: number;
  credit_status: 'ok' | 'warning' | 'blocked';
  can_proceed: boolean;
  message: string;
}

export interface CustomerTransaction {
  transaction_id: number;
  transaction_date: Date | string;
  transaction_type: 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'return';
  document_number: string;
  debit_amount?: number;
  credit_amount?: number;
  balance: number;
  narration?: string;
  reference_id?: number;
  reference_type?: string;
}
