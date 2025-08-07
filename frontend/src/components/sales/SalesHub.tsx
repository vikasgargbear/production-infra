import React from 'react';
import { 
  FileText, Package, ShoppingCart, Truck, TrendingUp, List
} from 'lucide-react';
import { ModuleHub } from '../global';
import InvoiceFlowBalanced from './InvoiceFlowBalanced';
import InvoiceListMinimal from './InvoiceListMinimal';
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
      id: 'invoice',
      label: 'New Invoice',
      fullLabel: 'Create Invoice',
      description: 'GST Invoice',
      icon: FileText,
      color: 'blue',
      component: InvoiceFlowBalanced
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
    },
    {
      id: 'invoice-list',
      label: 'All Invoices',
      fullLabel: 'Invoice List',
      description: 'Manage invoices',
      icon: List,
      color: 'gray',
      component: InvoiceListMinimal
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
      defaultModule="invoice"
    />
  );
};

export default SalesHub;