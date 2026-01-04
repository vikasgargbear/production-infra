import React, { useState } from 'react';
import {
  Building, Package, Users,
  Calculator, UserCheck, Bell, Cog,
  Plug, Database, Receipt, Settings,
  Ruler, Warehouse, Package2, Truck, UsersRound
} from 'lucide-react';
import { ModuleHub } from '../global';
// Master data components
import CompanyProfile from './settings/CompanyProfile';
import ProductMaster from './masters/ProductMaster';
import CustomerMaster from './masters/CustomerMaster';
import SupplierMaster from './masters/SupplierMaster';
import FeatureSettings from './settings/FeatureSettings';
import UserManagement from './settings/UserManagement';
import TaxMaster from './masters/TaxMaster';
import SystemSettings from './settings/SystemSettings';
import NotificationsAlerts from './settings/NotificationsAlerts';
import ThirdPartyIntegrations from './settings/ThirdPartyIntegrations';
import UnitMaster from './masters/UnitMaster';
import WarehouseMaster from './masters/WarehouseMaster';
import BatchMaster from './masters/BatchMaster';
import DataValidationEngine from './utils/DataValidationEngine';
import BulkOperations from './utils/BulkOperations';
import EmployeeManagement from '../settings/employees/EmployeeManagement';

interface MasterHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface MasterModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const MasterHub: React.FC<MasterHubProps> = ({ open = true, onClose }) => {
  const [showValidationEngine, setShowValidationEngine] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const [defaultModule, setDefaultModule] = useState('company-profile');

  // Listen for navigation events
  React.useEffect(() => {
    const handleNavigateToMaster = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.module === 'tax-master') {
        setDefaultModule('tax-master');
      }
    };

    window.addEventListener('navigateToMaster', handleNavigateToMaster);
    return () => window.removeEventListener('navigateToMaster', handleNavigateToMaster);
  }, []);

  const masterModules: MasterModule[] = [
    {
      id: 'company-profile',
      label: 'Company',
      fullLabel: 'Company Profile',
      description: 'Business details & branding',
      icon: Building,
      color: 'blue',
      component: CompanyProfile
    },
    {
      id: 'feature-settings',
      label: 'Features',
      fullLabel: 'Feature Settings',
      description: 'Enable/disable features',
      icon: Cog,
      color: 'purple',
      component: FeatureSettings
    },
    {
      id: 'product-master',
      label: 'Products',
      fullLabel: 'Product Master',
      description: 'Manage item catalog',
      icon: Package,
      color: 'green',
      component: ProductMaster
    },
    {
      id: 'customer-master',
      label: 'Customers',
      fullLabel: 'Customer Master',
      description: 'Manage customer database',
      icon: Users,
      color: 'blue',
      component: CustomerMaster
    },
    {
      id: 'supplier-master',
      label: 'Suppliers',
      fullLabel: 'Supplier Master',
      description: 'Manage supplier network',
      icon: Truck,
      color: 'purple',
      component: SupplierMaster
    },
    {
      id: 'tax-master',
      label: 'Tax',
      fullLabel: 'Tax Master',
      description: 'GST rates & settings',
      icon: Calculator,
      color: 'amber',
      component: TaxMaster
    },
    {
      id: 'user-management',
      label: 'Users',
      fullLabel: 'User Management',
      description: 'Roles & permissions',
      icon: UserCheck,
      color: 'red',
      component: UserManagement
    },
    {
      id: 'employee-management',
      label: 'Employees',
      fullLabel: 'Employee Management',
      description: 'Manage employee records',
      icon: UsersRound,
      color: 'teal',
      component: EmployeeManagement
    },
    {
      id: 'notifications',
      label: 'Alerts',
      fullLabel: 'Notifications & Alerts',
      description: 'Configure alerts',
      icon: Bell,
      color: 'orange',
      component: NotificationsAlerts
    },
    {
      id: 'system-settings',
      label: 'System',
      fullLabel: 'System Settings',
      description: 'Invoice prefix, backup',
      icon: Settings,
      color: 'gray',
      component: SystemSettings
    },
    {
      id: 'integrations',
      label: 'Integrate',
      fullLabel: 'Third-Party Integrations',
      description: 'WhatsApp, Tally, etc.',
      icon: Plug,
      color: 'indigo',
      component: ThirdPartyIntegrations
    },
    {
      id: 'unit-master',
      label: 'Units',
      fullLabel: 'Unit Master',
      description: 'Measurement units',
      icon: Ruler,
      color: 'pink',
      component: UnitMaster
    },
    {
      id: 'warehouse-master',
      label: 'Locations',
      fullLabel: 'Warehouse Master',
      description: 'Storage locations',
      icon: Warehouse,
      color: 'cyan',
      component: WarehouseMaster
    },
    {
      id: 'batch-master',
      label: 'Batches',
      fullLabel: 'Batch Master',
      description: 'Batch tracking',
      icon: Package2,
      color: 'violet',
      component: BatchMaster
    }
  ];

  return (
    <>
      <ModuleHub
        open={open}
        onClose={onClose || (() => { })}
        title="Master Settings"
        subtitle="Configure your platform"
        icon={Settings}
        modules={masterModules}
        defaultModule={defaultModule}
      />

      {/* Enterprise Components */}
      <DataValidationEngine
        open={showValidationEngine}
        onClose={() => setShowValidationEngine(false)}
      />

      <BulkOperations
        open={showBulkOperations}
        onClose={() => setShowBulkOperations(false)}
      />
    </>
  );
};

export default MasterHub;