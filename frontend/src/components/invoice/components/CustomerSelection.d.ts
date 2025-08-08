import React from 'react';

interface Customer {
  customer_id?: number;
  id?: number;
  name?: string;
  customer_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  [key: string]: any;
}

interface Invoice {
  [key: string]: any;
}

interface CustomerSelectionProps {
  selectedCustomer?: Customer | null;
  onCustomerSelect: (customer: Customer) => void;
  onCreateCustomer?: () => void;
  invoice?: Invoice;
  onInvoiceUpdate?: (updates: Record<string, any>) => void;
}

declare const CustomerSelection: React.FC<CustomerSelectionProps>;

export default CustomerSelection;