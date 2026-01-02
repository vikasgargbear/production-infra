import React from 'react';
import {
  FileText, Package, ShoppingCart, Truck, TrendingUp, List, DollarSign, BarChart3
} from 'lucide-react';
import { ModuleHub } from '../global';
import InvoiceFlow from './InvoiceFlow';
import InvoiceListV2 from './InvoiceListV2';
import SalesOrderFlow from './SalesOrderFlow';
import ModularChallanCreatorV5 from './challan/ModularChallanCreatorV5';

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
      label: 'Create Invoice',
      fullLabel: 'Create New Invoice',
      description: 'GST Tax Invoice',
      icon: FileText,
      color: 'blue',
      component: InvoiceFlow
    },
    {
      id: 'challan',
      label: 'Delivery Challan',
      fullLabel: 'Create Delivery Challan',
      description: 'Dispatch Note',
      icon: Truck,
      color: 'emerald',
      component: ModularChallanCreatorV5
    },
    {
      id: 'sales-order',
      label: 'Sales Order',
      fullLabel: 'Create Sales Order',
      description: 'Order Booking',
      icon: ShoppingCart,
      color: 'purple',
      component: SalesOrderFlow
    },
    {
      id: 'invoice-list',
      label: 'Invoice History',
      fullLabel: 'Invoice History',
      description: 'View & Manage',
      icon: List,
      color: 'gray',
      component: InvoiceListV2
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Sales Operations"
      subtitle=""
      icon={TrendingUp}
      modules={salesModules}
      defaultModule="invoice"
    />
  );
};

export default SalesHub;