import React from 'react';
import { useSales } from '../../../contexts/SalesContext';
import CustomerSelection from '../../invoice/components/CustomerSelection';

const SalesCustomerSelection = ({ onCreateCustomer }) => {
  const { 
    selectedParty,
    setParty,
    salesData,
    setSalesField
  } = useSales();

  const handleCustomerSelect = (customer) => {
    setParty(customer);
  };

  const handleInvoiceUpdate = (updates) => {
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