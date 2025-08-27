import React from 'react';
import CompanyProfile from '../components/settings/CompanyProfile';

const Settings = () => {
  return (
    <div className="h-screen overflow-hidden">
      {/* This wrapper ensures proper scrolling */}
      <div className="h-full overflow-y-auto">
        <CompanyProfile />
      </div>
    </div>
  );
};

export default Settings;