import React, { useState } from 'react';
import {
  Home, BarChart3, Receipt
} from 'lucide-react';
import { ModuleHub } from '../global';
import { GSTDashboard } from './dashboard';
import { GSTReports } from './reports';

export const GST_SUBPAGE_IDS = ['gst-dashboard', 'gst-reports'] as const;
type GSTSubpage = typeof GST_SUBPAGE_IDS[number];

interface GSTHubProps {
  open?: boolean;
  onClose?: () => void;
  initialSubpage?: string | null;
  onSubpageChange?: (subpage: string | null) => void;
}

const GSTHub: React.FC<GSTHubProps> = ({ open = true, onClose, initialSubpage, onSubpageChange }) => {
  const resolvedDefault: GSTSubpage = initialSubpage
    && (GST_SUBPAGE_IDS as readonly string[]).includes(initialSubpage)
    ? initialSubpage as GSTSubpage
    : 'gst-dashboard';
  const [activeModule, setActiveModule] = useState<GSTSubpage>(resolvedDefault);

  React.useEffect(() => {
    setActiveModule(resolvedDefault);
  }, [resolvedDefault]);

  const navigateToReports = () => {
    setActiveModule('gst-reports');
    onSubpageChange?.('gst-reports');
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
      onActiveModuleChange={onSubpageChange}
    />
  );
};

export default GSTHub;
