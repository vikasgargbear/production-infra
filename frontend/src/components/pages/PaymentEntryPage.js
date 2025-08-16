import React from 'react';
import { useNavigate } from 'react-router-dom';
import FinancialHub from '../payment/FinancialHub';

const PaymentEntryPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <FinancialHub 
        open={true}
        onClose={() => navigate('/home')}
      />
    </div>
  );
};

export default PaymentEntryPage;