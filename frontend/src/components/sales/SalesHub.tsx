import React from 'react';
import {
  FileText, Package, ShoppingCart, Truck, TrendingUp, List, DollarSign, BarChart3
} from 'lucide-react';
import { ModuleHub } from '../global';
import { Module } from '../global/navigation/ModuleHub';
import InvoiceFlow from './invoice/InvoiceFlow';
import InvoiceList from './invoice/InvoiceList';
import { SalesOrderFlow } from './order';
import { ChallanFlow } from './challan';

interface SalesHubProps {
  open?: boolean;
  onClose?: () => void;
}

// Interface SalesModule removed in favor of shared Module interface

const SalesHub: React.FC<SalesHubProps> = ({ open = true, onClose }) => {
  const salesModules: Module[] = [
    {
      id: 'invoice',
      label: 'Create Invoice',
      fullLabel: 'Create New Invoice',
      description: 'GST Tax Invoice',
      icon: FileText,
      color: 'blue',
      component: InvoiceFlow as React.ComponentType<any>
    },
    {
      id: 'challan',
      label: 'Delivery Challan',
      fullLabel: 'Create Delivery Challan',
      description: 'Dispatch Note',
      icon: Truck,
      color: 'emerald',
      component: ChallanFlow as React.ComponentType<any>
    },
    {
      id: 'sales-order',
      label: 'Sales Order',
      fullLabel: 'Create Sales Order',
      description: 'Order Booking',
      icon: ShoppingCart,
      color: 'purple',
      component: SalesOrderFlow as React.ComponentType<any>
    },
    {
      id: 'invoice-list',
      label: 'Invoice History',
      fullLabel: 'Invoice History',
      description: 'View & Manage',
      icon: List,
      color: 'gray',
      component: InvoiceList
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