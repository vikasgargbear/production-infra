import React from 'react';
import CustomerMaster from './CustomerMaster';

// Supplier Master extends Customer Master with supplier-specific fields
const SupplierMaster = (props) => {
  // For now, using CustomerMaster as base since suppliers have similar fields
  // Will be enhanced with supplier-specific fields later
  return <CustomerMaster {...props} />;
};

export default SupplierMaster;