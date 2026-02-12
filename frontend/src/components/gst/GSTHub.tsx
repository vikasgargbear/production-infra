import React, { useState } from 'react';
import {
  Home, FileText, BarChart3,
  Upload, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import { GSTDashboard } from './dashboard';
import GSTFiling from './GSTFiling';
import { GSTReports } from './reports';
import { GSTR2BUpload, ReconciliationDashboard } from './gstr2b';

interface GSTHubProps {
  open?: boolean;
  onClose?: () => void;
}

const GSTHub: React.FC<GSTHubProps> = ({ open = true, onClose }) => {
  const [activeModule, setActiveModule] = useState('gst-dashboard');

  const navigateToReports = () => {
    setActiveModule('gst-reports');
  };

  const navigateToGSTR2B = () => {
    setActiveModule('gstr2b-reconcile');
  };

  const navigateToFiling = () => {
    setActiveModule('gst-filing');
  };

  // GSTR-2B Upload component with reconciliation dashboard
  const GSTR2BModule: React.FC<{ onClose?: () => void }> = () => {
    const [showReconciliation, setShowReconciliation] = useState(false);

    return (
      <div className="p-6 space-y-6">
        {!showReconciliation ? (
          <GSTR2BUpload
            onUploadComplete={() => setShowReconciliation(true)}
            onReconcile={() => setShowReconciliation(true)}
          />
        ) : (
          <ReconciliationDashboard
            onStartReconcile={() => setShowReconciliation(false)}
          />
        )}
      </div>
    );
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
          onNavigateToUpload={navigateToGSTR2B}
          onNavigateToFiling={navigateToFiling}
        />
      )
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
      id: 'gstr2b-reconcile',
      label: '2B Reconcile',
      fullLabel: 'GSTR-2B Reconcile',
      description: 'Upload & reconcile 2B',
      icon: Upload,
      color: 'teal',
      component: GSTR2BModule
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
      defaultModule="gst-dashboard"
    />
  );
};

export default GSTHub;
