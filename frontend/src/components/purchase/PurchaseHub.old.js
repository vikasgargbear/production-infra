import React from 'react';
import { 
  ShoppingBag, FileText, Package, ShoppingCart
} from 'lucide-react';
import { ModuleHub } from '../global';
import SimplifiedPurchaseEntry from './SimplifiedPurchaseEntry';
import PurchaseOrderFlow from './PurchaseOrderFlow';
import GRNFlow from './GRNFlow';
import { PurchaseProvider } from '../../contexts/PurchaseContext';

const PurchaseHub = ({ open = true, onClose }) => {
  const purchaseModules = [
    {
      id: 'purchase',
      label: 'Purchase',
      fullLabel: 'Purchase Entry',
      description: 'Record purchases',
      icon: ShoppingBag,
      color: 'indigo',
      component: SimplifiedPurchaseEntry
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
    }
  ];

  // Wrap in PurchaseProvider
  const PurchaseHubContent = (props) => (
    <PurchaseProvider>
      <ModuleHub {...props} />
    </PurchaseProvider>
  );

  return (
    <PurchaseHubContent
      open={open}
      onClose={onClose}
      title="Purchase Hub"
      subtitle="Manage procurement & inventory"
      icon={ShoppingCart}
      modules={purchaseModules}
      defaultModule="purchase"
    />
  );
};

export default PurchaseHub;