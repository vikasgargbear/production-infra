import React from 'react';
import { useNavigate } from 'react-router-dom';
import CompanySettings from '../CompanySettings';

const SettingsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <CompanySettings 
        open={true}
        onClose={() => navigate('/home')}
      />
    </div>
  );
};

export default SettingsPage;