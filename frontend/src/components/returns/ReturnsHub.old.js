import React from 'react';
import { RotateCcw, ShoppingCart, Package } from 'lucide-react';
import { ModuleHub } from '../global';
import SalesReturnFlow from './SalesReturnFlow';
import PurchaseReturnFlow from './PurchaseReturnFlow';

const ReturnsHub = ({ open = true, onClose }) => {
  const returnsModules = [
    {
      id: 'sales-return',
      label: 'Sales Return',
      fullLabel: 'Sales Return',
      description: 'Process customer returns',
      icon: ShoppingCart,
      color: 'red',
      component: SalesReturnFlow
    },
    {
      id: 'purchase-return',
      label: 'Purchase Return',
      fullLabel: 'Purchase Return',
      description: 'Return to suppliers',
      icon: Package,
      color: 'orange',
      component: PurchaseReturnFlow
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose}
      title="Returns Management"
      subtitle="Process sales and purchase returns"
      icon={RotateCcw}
      modules={returnsModules}
      defaultModule="sales-return"
    />
  );
};

export default ReturnsHub;