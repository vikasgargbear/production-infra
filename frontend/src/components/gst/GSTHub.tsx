import React, { useState } from 'react';
import {
  Home, FileText, BarChart3, RefreshCw,
  Settings, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import { GSTDashboard } from './dashboard';
import GSTFiling from './GSTFiling';
import { GSTReports } from './reports';
import GSTReconciliation from './GSTReconciliation';

interface GSTHubProps {
  open?: boolean;
  onClose?: () => void;
}

const GSTHub: React.FC<GSTHubProps> = ({ open = true, onClose }) => {
  const [activeModule, setActiveModule] = useState('gst-dashboard');

  // Function to navigate to reports
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
      component: (props) => <GSTDashboard {...props} onNavigateToReports={navigateToReports} />
    },
    {
      id: 'gst-filing',
      label: 'Filing',
      fullLabel: 'GST Filing',
      description: 'File GSTR-1, GSTR-3B',
      icon: FileText,
      color: 'green',
      component: GSTFiling
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
    {
      id: 'gst-reconciliation',
      label: 'Reconcile',
      fullLabel: 'Reconciliation',
      description: 'Match & verify GST',
      icon: RefreshCw,
      color: 'orange',
      component: GSTReconciliation
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
      defaultModule="gst-dashboard"
    />
  );
};

export default GSTHub;