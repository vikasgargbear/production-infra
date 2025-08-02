import React from 'react';
import { useNavigate } from 'react-router-dom';
import PurchaseHub from '../purchase/PurchaseHub';

const PurchaseEntryPage = () => {
  const navigate = useNavigate();

  return (
    <PurchaseHub 
      open={true}
      onClose={() => navigate('/home')}
    />
  );
};

export default PurchaseEntryPage;