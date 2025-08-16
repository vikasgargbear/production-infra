import React from 'react';
import { useNavigate } from 'react-router-dom';
import MasterHub from '../master/MasterHub';

const SettingsPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <MasterHub 
        open={true}
        onClose={() => navigate('/home')}
      />
    </div>
  );
};

export default SettingsPage;