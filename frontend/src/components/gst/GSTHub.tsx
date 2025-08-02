import React from 'react';
import { 
  Calculator, FileText, BarChart3, RefreshCw, 
  Settings, AlertCircle, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import GSTReports from './GSTReports';
import GSTFiling from './GSTFiling';
import GSTReconciliation from './GSTReconciliation';

interface GSTHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface GSTModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any> | null;
}

const GSTHub: React.FC<GSTHubProps> = ({ open = true, onClose }) => {
  const gstModules: GSTModule[] = [
    {
      id: 'gst-reports',
      label: 'Reports',
      fullLabel: 'GST Reports',
      description: 'GSTR-1, 3B, HSN Summary',
      icon: BarChart3,
      color: 'blue',
      component: GSTReports
    },
    {
      id: 'gst-filing',
      label: 'Filing',
      fullLabel: 'GST Filing',
      description: 'Monthly returns & filing',
      icon: FileText,
      color: 'green',
      component: GSTFiling
    },
    {
      id: 'gst-reconciliation',
      label: 'Reconcile',
      fullLabel: 'GST Reconciliation',
      description: 'Match & reconcile GST',
      icon: RefreshCw,
      color: 'purple',
      component: GSTReconciliation
    },
    {
      id: 'gst-settings',
      label: 'Settings',
      fullLabel: 'GST Settings',
      description: 'Configure GST rates',
      icon: Settings,
      color: 'gray',
      component: null // Placeholder
    },
    {
      id: 'gst-compliance',
      label: 'Compliance',
      fullLabel: 'Compliance Check',
      description: 'Audit & compliance tools',
      icon: AlertCircle,
      color: 'red',
      component: null // Placeholder
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose}
      title="GST Hub"
      subtitle="Tax management & compliance"
      icon={Receipt}
      modules={gstModules}
      defaultModule="gst-reports"
    />
  );
};

export default GSTHub;