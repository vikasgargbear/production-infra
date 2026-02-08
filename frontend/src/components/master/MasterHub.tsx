import React, { useState, useMemo } from 'react';
import {
  Building, Package, Users,
  Calculator, UserCheck, Bell, Cog,
  Plug, Database, Receipt, Settings,
  Ruler, Warehouse, Package2, Truck, UsersRound, Shield
} from 'lucide-react';
import { ModuleHub } from '../global';
import { usePermissions } from '../../hooks/usePermissions';
// Master data components
import CompanyProfile from './settings/CompanyProfile';
import ProductMaster from './masters/ProductMaster';
import CustomerMaster from './masters/CustomerMaster';
import SupplierMaster from './masters/SupplierMaster';
import FeatureSettings from './settings/FeatureSettings';
import UserManagement from './settings/UserManagement';
import RoleManagement from './settings/RoleManagement';
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
  group?: string;
}

// IDs that require master:edit (admin-level)
const ADMIN_ONLY_IDS = new Set([
  'company-profile', 'user-management', 'role-management',
  'feature-settings', 'notifications', 'integrations', 'system-settings'
]);

const MasterHub: React.FC<MasterHubProps> = ({ open = true, onClose }) => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('master', 'edit');
  const [showValidationEngine, setShowValidationEngine] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const [defaultModule, setDefaultModule] = useState('product-master');

  // Listen for navigation events
  React.useEffect(() => {
    const handleNavigateToMaster = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.module) {
        setDefaultModule(customEvent.detail.module);
      }
    };

    window.addEventListener('navigateToMaster', handleNavigateToMaster);
    return () => window.removeEventListener('navigateToMaster', handleNavigateToMaster);
  }, []);

  const masterModules: MasterModule[] = [
    // ── Masters ───────────────────────────────────────────
    // Data you manage daily: add, edit, look up
    {
      id: 'product-master',
      label: 'Products',
      fullLabel: 'Product Master',
      description: 'Manage item catalog',
      icon: Package,
      color: 'green',
      component: ProductMaster,
      group: 'Masters'
    },
    {
      id: 'customer-master',
      label: 'Customers',
      fullLabel: 'Customer Master',
      description: 'Manage customer database',
      icon: Users,
      color: 'blue',
      component: CustomerMaster,
      group: 'Masters'
    },
    {
      id: 'supplier-master',
      label: 'Suppliers',
      fullLabel: 'Supplier Master',
      description: 'Manage supplier network',
      icon: Truck,
      color: 'purple',
      component: SupplierMaster,
      group: 'Masters'
    },
    {
      id: 'batch-master',
      label: 'Batches',
      fullLabel: 'Batch Master',
      description: 'Batch tracking & expiry',
      icon: Package2,
      color: 'emerald',
      component: BatchMaster,
      group: 'Masters'
    },
    {
      id: 'employee-management',
      label: 'Employees',
      fullLabel: 'Employee Management',
      description: 'Staff records',
      icon: UsersRound,
      color: 'teal',
      component: EmployeeManagement,
      group: 'Masters'
    },
    // ── Business Setup ────────────────────────────────────
    // One-time setup: your business identity, rules, structure
    {
      id: 'company-profile',
      label: 'Company',
      fullLabel: 'Company Profile',
      description: 'Business identity & GST',
      icon: Building,
      color: 'blue',
      component: CompanyProfile,
      group: 'Business Setup'
    },
    {
      id: 'tax-master',
      label: 'Tax & GST',
      fullLabel: 'Tax Master',
      description: 'GST rates & slabs',
      icon: Calculator,
      color: 'amber',
      component: TaxMaster,
      group: 'Business Setup'
    },
    {
      id: 'unit-master',
      label: 'Units',
      fullLabel: 'Unit Master',
      description: 'Measurement units',
      icon: Ruler,
      color: 'orange',
      component: UnitMaster,
      group: 'Business Setup'
    },
    {
      id: 'warehouse-master',
      label: 'Locations',
      fullLabel: 'Warehouse & Locations',
      description: 'Storage locations',
      icon: Warehouse,
      color: 'indigo',
      component: WarehouseMaster,
      group: 'Business Setup'
    },
    // ── Administration ────────────────────────────────────
    // App admin: who can do what, what's enabled, system config
    {
      id: 'user-management',
      label: 'Users',
      fullLabel: 'User Management',
      description: 'Manage user accounts',
      icon: UserCheck,
      color: 'red',
      component: UserManagement,
      group: 'Administration'
    },
    {
      id: 'role-management',
      label: 'Roles',
      fullLabel: 'Role Management',
      description: 'Roles & permissions',
      icon: Shield,
      color: 'indigo',
      component: RoleManagement,
      group: 'Administration'
    },
    {
      id: 'feature-settings',
      label: 'Features',
      fullLabel: 'Feature Settings',
      description: 'Enable/disable features',
      icon: Cog,
      color: 'purple',
      component: FeatureSettings,
      group: 'Administration'
    },
    {
      id: 'notifications',
      label: 'Alerts',
      fullLabel: 'Notifications & Alerts',
      description: 'Configure alerts',
      icon: Bell,
      color: 'orange',
      component: NotificationsAlerts,
      group: 'Administration'
    },
    {
      id: 'integrations',
      label: 'Integrations',
      fullLabel: 'Integrations',
      description: 'WhatsApp, Tally, etc.',
      icon: Plug,
      color: 'indigo',
      component: ThirdPartyIntegrations,
      group: 'Administration'
    },
    {
      id: 'system-settings',
      label: 'System',
      fullLabel: 'System Settings',
      description: 'Backup & advanced',
      icon: Settings,
      color: 'gray',
      component: SystemSettings,
      group: 'Administration'
    }
  ];

  // Filter out admin-only modules for non-admin users
  const visibleModules = useMemo(
    () => canEdit ? masterModules : masterModules.filter(m => !ADMIN_ONLY_IDS.has(m.id)),
    [canEdit, masterModules]
  );

  return (
    <>
      <ModuleHub
        open={open}
        onClose={onClose || (() => { })}
        title="Master"
        subtitle="Configure your platform"
        icon={Settings}
        modules={visibleModules}
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