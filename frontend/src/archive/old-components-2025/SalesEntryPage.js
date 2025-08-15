import React from 'react';
import { useNavigate } from 'react-router-dom';
import SalesEntryModalV2 from '../SalesEntryModalV2';

const SalesEntryPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <SalesEntryModalV2 
        open={true}
        onClose={() => navigate('/home')}
      />
    </div>
  );
};

export default SalesEntryPage;