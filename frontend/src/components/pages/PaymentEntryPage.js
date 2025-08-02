import React from 'react';
import { useNavigate } from 'react-router-dom';
import ModularPaymentEntry from '../payment/ModularPaymentEntry';

const PaymentEntryPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <ModularPaymentEntry 
        open={true}
        onClose={() => navigate('/home')}
      />
    </div>
  );
};

export default PaymentEntryPage;