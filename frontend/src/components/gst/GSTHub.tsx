import React, { useState } from 'react';
import {
  Home, BarChart3, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import { GSTDashboard } from './dashboard';
import { GSTReports } from './reports';

interface GSTHubProps {
  open?: boolean;
  onClose?: () => void;
}

const GSTHub: React.FC<GSTHubProps> = ({ open = true, onClose }) => {
  const [activeModule, setActiveModule] = useState('gst-dashboard');

  const navigateToReports = () => {
    setActiveModule('gst-reports');
  };

  const gstModules = [
    {
      id: 'gst-dashboard',
      label: 'Dashboard',
      fullLabel: 'GST Dashboard',
      description: 'Tax summary & analytics',
      icon: Home,
      color: 'blue',
      component: (props: any) => (
        <GSTDashboard
          {...props}
          onNavigateToReports={navigateToReports}
        />
      )
    },
    {
      id: 'gst-reports',
      label: 'Reports',
      fullLabel: 'GST Reports',
      description: 'Tax reports & analysis',
      icon: BarChart3,
      color: 'purple',
      component: GSTReports
    },
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="GST Hub"
      subtitle="Tax management & compliance"
      icon={Receipt}
      modules={gstModules}
      defaultModule={activeModule}
    />
  );
};

export default GSTHub;
