import React, { useState } from 'react';
import { 
  Building, Package, Users, 
  Calculator, UserCheck, Bell, Cog,
  Plug, Database, Receipt, Settings,
  Ruler, Warehouse, Package2, Truck
} from 'lucide-react';
import { ModuleHub } from '../global';
import CompanyProfile from './CompanyProfile';
import ProductMaster from './ProductMaster';
import CustomerMaster from './CustomerMaster';
import SupplierMaster from './SupplierMaster';
import FeatureSettings from './FeatureSettings';
import UserManagement from './UserManagement';
import TaxMaster from './TaxMaster';
import SystemSettings from './SystemSettings';
import NotificationsAlerts from './NotificationsAlerts';
import ThirdPartyIntegrations from './ThirdPartyIntegrations';
import UnitMaster from './UnitMaster';
import WarehouseMaster from './WarehouseMaster';
import BatchMaster from './BatchMaster';
import DataValidationEngine from './DataValidationEngine';
import BulkOperations from './BulkOperations';

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
        onClose={onClose || (() => {})}
        title="Master Settings"
        subtitle="Configure your platform"
        icon={Settings2}
        modules={masterModules}
        defaultModule="dashboard"
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