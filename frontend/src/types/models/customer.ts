/**
 * Customer Type Definitions
 * Matches backend parties.customers schema with frontend field mappings
 */

export interface Customer {
  // Primary fields
  customer_id: number | string; // Can be either number or string from API
  customer_code?: string; // Made optional as it might not always be present
  customer_name: string;
  customer_type?: 'b2b' | 'b2c' | 'pharmacy' | 'hospital' | 'clinic' | 'distributor' | 'other' | string; // Made optional and flexible

  // Contact information - simplified flat structure for MVP
  phone?: string;
  email?: string;

  // Contact information (frontend uses nested, backend uses flat)
  contact_info?: {
    primary_phone: string;
    secondary_phone?: string;
    email?: string;
    website?: string;
  };

  // Address information (frontend uses nested, backend uses flat)
  billing_address?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };

  address_info?: {
    billing_address: string;
    billing_city: string;
    billing_state: string;
    billing_pincode: string;
    billing_country?: string;
    shipping_address?: string;
    shipping_city?: string;
    shipping_state?: string;
    shipping_pincode?: string;
    shipping_country?: string;
  };

  // GST and compliance
  gst_number?: string; // Frontend uses gst_number, backend uses gst_number
  gst_state_code?: string;
  pan_number?: string;
  drug_license_number?: string;
  drug_license_expiry?: Date | string;
  fssai_number?: string;

  // Credit management
  credit_limit?: number; // Made optional as it might not be set initially
  current_outstanding?: number; // Backend field name
  outstanding_balance?: number; // Frontend uses this, backend uses current_outstanding
  credit_days?: number; // Made optional
  payment_terms?: string;

  // Computed fields
  available_credit?: number;

  // Categorization
  customer_group?: string;
  customer_category?: string;
  discount_percentage?: number;

  // Status and metadata
  status?: 'active' | 'inactive' | 'blocked'; // Made optional with default as 'active'
  notes?: string;
  total_business?: number;
  last_transaction_date?: Date | string;
  created_at?: Date | string; // Made optional
  updated_at?: Date | string; // Made optional
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