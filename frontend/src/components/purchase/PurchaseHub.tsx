/**
 * PurchaseHub - Central navigation for Purchase module
 * 
 * Modernized: No longer uses PurchaseContext (each flow uses usePurchaseTransaction)
 */

import React from 'react';
import {
  ShoppingBag, FileText, Package, ShoppingCart, List
} from 'lucide-react';
import { ModuleHub } from '../global';
import { PurchaseEntryFlow } from './purchase-entry';
import { PurchaseOrderFlow } from './purchase-order';
import { GRNFlow } from './grn';
import PurchaseListHistory from './PurchaseListHistory';

interface PurchaseHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface PurchaseModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const PurchaseHub: React.FC<PurchaseHubProps> = ({ open = true, onClose }) => {
  const purchaseModules: PurchaseModule[] = [
    {
      id: 'purchase',
      label: 'Purchase',
      fullLabel: 'Purchase Entry',
      description: 'Record purchases',
      icon: ShoppingBag,
      color: 'indigo',
      component: PurchaseEntryFlow
    },
    {
      id: 'purchase-order',
      label: 'Order',
      fullLabel: 'Purchase Order',
      description: 'Create POs',
      icon: FileText,
      color: 'indigo',
      component: PurchaseOrderFlow
    },
    {
      id: 'grn',
      label: 'GRN',
      fullLabel: 'Goods Receipt',
      description: 'Receive goods',
      icon: Package,
      color: 'green',
      component: GRNFlow
    },
    {
      id: 'purchase-history',
      label: 'All Purchases',
      fullLabel: 'Purchase History',
      description: 'View purchase history',
      icon: List,
      color: 'gray',
      component: PurchaseListHistory
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Purchase Hub"
      subtitle="Manage procurement & inventory"
      icon={ShoppingCart}
      modules={purchaseModules}
      defaultModule="purchase"
    />
  );
};

export default PurchaseHub;