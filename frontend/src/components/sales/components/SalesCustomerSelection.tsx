import React from 'react';
import { useSales } from '../../../contexts/SalesContext';
import CustomerSelection from '../../invoice/components/CustomerSelection';

interface Customer {
  customer_id?: number;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

interface SalesCustomerSelectionProps {
  onCreateCustomer?: () => void;
}

const SalesCustomerSelection: React.FC<SalesCustomerSelectionProps> = ({ onCreateCustomer }) => {
  const { 
    selectedParty,
    setParty,
    salesData,
    setSalesField
  } = useSales();

  const handleCustomerSelect = (customer: Customer) => {
    setParty(customer);
  };

  const handleInvoiceUpdate = (updates: Record<string, any>) => {
    // Map invoice updates to our sales context
    Object.entries(updates).forEach(([key, value]) => {
      setSalesField(key, value);
    });
  };

  return (
    <CustomerSelection
      selectedCustomer={selectedParty}
      onCustomerSelect={handleCustomerSelect}
      onCreateCustomer={onCreateCustomer}
      invoice={salesData}
      onInvoiceUpdate={handleInvoiceUpdate}
    />
  );
};

export default SalesCustomerSelection;