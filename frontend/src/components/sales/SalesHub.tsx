import React from 'react';
import { 
  FileText, Package, ShoppingCart, Truck, TrendingUp, Home, List
} from 'lucide-react';
import { ModuleHub } from '../global';
import SalesDashboard from './SalesDashboard';
import InvoiceFlow from './InvoiceFlow';
import InvoiceListV2 from './InvoiceListV2';
import SalesOrderFlow from './SalesOrderFlow';
import ModularChallanCreatorV5 from '../challan/ModularChallanCreatorV5';

interface SalesHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface SalesModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const SalesHub: React.FC<SalesHubProps> = ({ open = true, onClose }) => {
  const salesModules: SalesModule[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      fullLabel: 'Sales Overview',
      description: 'Analytics & insights',
      icon: Home,
      color: 'blue',
      component: SalesDashboard
    },
    {
      id: 'invoice',
      label: 'New Invoice',
      fullLabel: 'Create Invoice',
      description: 'GST Invoice',
      icon: FileText,
      color: 'green',
      component: InvoiceFlow
    },
    {
      id: 'invoice-list',
      label: 'All Invoices',
      fullLabel: 'Invoice List',
      description: 'Manage invoices',
      icon: List,
      color: 'purple',
      component: InvoiceListV2
    },
    {
      id: 'challan',
      label: 'Challan',
      fullLabel: 'Delivery Challan',
      description: 'Without GST',
      icon: Truck,
      color: 'emerald',
      component: ModularChallanCreatorV5
    },
    {
      id: 'sales-order',
      label: 'Order',
      fullLabel: 'Sales Order',
      description: 'Booking',
      icon: ShoppingCart,
      color: 'purple',
      component: SalesOrderFlow
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose}
      title="Sales Hub"
      subtitle="Manage your sales operations"
      icon={TrendingUp}
      modules={salesModules}
      defaultModule="dashboard"
    />
  );
};

export default SalesHub;