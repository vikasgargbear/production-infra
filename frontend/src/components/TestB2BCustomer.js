import React, { useState } from 'react';
import CustomerCreationB2B from './global/ui/forms/CustomerCreationB2B';

const TestB2BCustomer = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test B2B Customer Creation</h1>
      
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Open B2B Customer Creation
      </button>

      {showModal && (
        <CustomerCreationB2B
          onClose={() => setShowModal(false)}
          onCustomerCreated={(customer) => {
            console.log('Customer created:', customer);
            alert(`Customer created: ${customer.customer_name}`);
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
};

export default TestB2BCustomer;