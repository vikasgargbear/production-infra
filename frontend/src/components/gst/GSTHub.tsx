import React, { useState } from 'react';
import {
  Home, FileText, BarChart3, RefreshCw,
  Settings, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import GSTDashboard from './GSTDashboard';
import GSTFiling from './GSTFiling';
import GSTReports from './GSTReports';
import GSTReconciliation from './GSTReconciliation';
// GST Settings removed - now handled in Master → Tax Master

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
    {
      id: 'gst-settings',
      label: 'Settings',
      fullLabel: 'GST Settings',
      description: 'Configure in Master → Tax',
      icon: Settings,
      color: 'gray',
      component: () => (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">GST Settings Moved</h3>
            <p className="text-gray-600 mb-4">
              GST settings are now managed centrally in <span className="font-semibold">Master → Tax Master</span>
            </p>
            <button
              onClick={() => {
                // Navigate to Master module - this will be handled by parent component
                if (onClose) onClose();
                // The parent will need to handle navigation to Master
                window.dispatchEvent(new CustomEvent('navigateToMaster', {
                  detail: { module: 'tax-master', tab: 'gst-config' }
                }));
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to Tax Master
            </button>
          </div>
        </div>
      )
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => {})}
      title="GST Hub"
      subtitle="Tax management & compliance"
      icon={Receipt}
      modules={gstModules}
      defaultModule="gst-dashboard"
    />
  );
};

export default GSTHub;