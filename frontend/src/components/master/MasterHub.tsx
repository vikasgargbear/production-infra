import React, { useState, useMemo } from 'react';
import {
  Building, Package, Users,
  Calculator, UserCheck, Settings,
  Ruler, Warehouse, Truck, Shield
} from 'lucide-react';
import { ModuleHub } from '../global';
import { usePermissions } from '../../hooks/usePermissions';
// Master data components
import CompanyProfile from './settings/CompanyProfile';
import ProductMaster from './masters/ProductMaster';
import CustomerMaster from './masters/CustomerMaster';
import SupplierMaster from './masters/SupplierMaster';
import UserManagement from './settings/UserManagement';
import RoleManagement from './settings/RoleManagement';
import TaxMaster from './masters/TaxMaster';
import UnitMaster from './masters/UnitMaster';
import WarehouseMaster from './masters/WarehouseMaster';
import DataValidationEngine from './utils/DataValidationEngine';
import BulkOperations from './utils/BulkOperations';

export const MASTER_SUBPAGE_IDS = [
  'product-master',
  'customer-master',
  'supplier-master',
  'company-profile',
  'tax-master',
  'unit-master',
  'warehouse-master',
  'user-management',
  'role-management',
] as const;
type MasterSubpage = typeof MASTER_SUBPAGE_IDS[number];

interface MasterHubProps {
  open?: boolean;
  onClose?: () => void;
  initialSubpage?: string | null;
  onSubpageChange?: (subpage: string | null) => void;
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
]);

const MASTER_MODULES: MasterModule[] = [
  {
    id: 'product-master', label: 'Products', fullLabel: 'Product Master',
    description: 'Manage item catalog', icon: Package, color: 'green',
    component: ProductMaster, group: 'Masters'
  },
  {
    id: 'customer-master', label: 'Customers', fullLabel: 'Customer Master',
    description: 'Manage customer database', icon: Users, color: 'blue',
    component: CustomerMaster, group: 'Masters'
  },
  {
    id: 'supplier-master', label: 'Suppliers', fullLabel: 'Supplier Master',
    description: 'Manage supplier network', icon: Truck, color: 'purple',
    component: SupplierMaster, group: 'Masters'
  },
  {
    id: 'company-profile', label: 'Company', fullLabel: 'Company Profile',
    description: 'Business identity & GST', icon: Building, color: 'blue',
    component: CompanyProfile, group: 'Business Setup'
  },
  {
    id: 'tax-master', label: 'Tax & GST', fullLabel: 'Tax Master',
    description: 'GST rates & slabs', icon: Calculator, color: 'amber',
    component: TaxMaster, group: 'Business Setup'
  },
  {
    id: 'unit-master', label: 'Units', fullLabel: 'Unit Master',
    description: 'Measurement units', icon: Ruler, color: 'orange',
    component: UnitMaster, group: 'Business Setup'
  },
  {
    id: 'warehouse-master', label: 'Locations', fullLabel: 'Warehouse & Locations',
    description: 'Storage locations', icon: Warehouse, color: 'indigo',
    component: WarehouseMaster, group: 'Business Setup'
  },
  {
    id: 'user-management', label: 'Users', fullLabel: 'User Management',
    description: 'Manage user accounts', icon: UserCheck, color: 'red',
    component: UserManagement, group: 'Administration'
  },
  {
    id: 'role-management', label: 'Roles', fullLabel: 'Role Management',
    description: 'Roles & permissions', icon: Shield, color: 'indigo',
    component: RoleManagement, group: 'Administration'
  },
];

const MasterHub: React.FC<MasterHubProps> = ({ open = true, onClose, initialSubpage, onSubpageChange }) => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('master', 'edit');
  const [showValidationEngine, setShowValidationEngine] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const resolvedDefault: MasterSubpage = initialSubpage
    && (MASTER_SUBPAGE_IDS as readonly string[]).includes(initialSubpage)
    ? initialSubpage as MasterSubpage
    : 'product-master';
  const [defaultModule, setDefaultModule] = useState<MasterSubpage>(resolvedDefault);

  React.useEffect(() => {
    setDefaultModule(resolvedDefault);
  }, [resolvedDefault]);

  // Listen for navigation events
  React.useEffect(() => {
    const handleNavigateToMaster = (event: Event) => {
      const customEvent = event as CustomEvent;
      const requestedModule = customEvent.detail?.module;
      if ((MASTER_SUBPAGE_IDS as readonly string[]).includes(requestedModule)) {
        setDefaultModule(requestedModule as MasterSubpage);
        onSubpageChange?.(requestedModule);
      }
    };

    window.addEventListener('navigateToMaster', handleNavigateToMaster);
    return () => window.removeEventListener('navigateToMaster', handleNavigateToMaster);
  }, [onSubpageChange]);

  // Filter out admin-only modules for non-admin users
  const visibleModules = useMemo(
    () => canEdit ? MASTER_MODULES : MASTER_MODULES.filter(m => !ADMIN_ONLY_IDS.has(m.id)),
    [canEdit]
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
        onActiveModuleChange={onSubpageChange}
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
