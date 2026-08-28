import React, { useMemo } from 'react';
import {
  FileText, ShoppingCart, Truck, ReceiptText, List
} from 'lucide-react';
import { ModuleHub } from '../global';
import { Module } from '../global/navigation/ModuleHub';
import InvoiceFlow from './invoice/InvoiceFlow';
import InvoiceList from './invoice/InvoiceList';
import { SalesOrderFlow } from './order';
import { ChallanFlow } from './challan';
import { usePermissions } from '../../hooks/usePermissions';

interface SalesHubProps {
  open?: boolean;
  onClose?: () => void;
  /**
   * Deep-link sub-module to open on mount (e.g. "invoice").
   * Comes from the URL hash (#/sales/<subpage>).
   */
  initialSubpage?: string | null;
  /**
   * Called when the user switches sub-modules inside the hub.
   * The parent (App) uses this to keep the URL hash in sync.
   */
  onSubpageChange?: (subpage: string | null) => void;
}

const SalesHub: React.FC<SalesHubProps> = ({ open = true, onClose, initialSubpage, onSubpageChange }) => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('sales', 'create');

  /** All valid sub-module IDs for deep-linking into SalesHub. */
  const SALES_SUBPAGE_IDS = ['invoice', 'challan', 'sales-order', 'sales-history'] as const;

  const defaultModule = (() => {
    if (initialSubpage && SALES_SUBPAGE_IDS.includes(initialSubpage as any)) return initialSubpage;
    return canCreate ? 'invoice' : 'sales-history';
  })();

  const salesModules: Module[] = useMemo(() => {
    const modules: Module[] = [];

    if (canCreate) {
      modules.push(
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
        }
      );
    }

    // Sales History is always visible (view permission)
    modules.push({
      id: 'sales-history',
      label: 'Sales History',
      fullLabel: 'Sales History',
      description: 'Invoices, Challans & Orders',
      icon: List,
      color: 'gray',
      component: InvoiceList
    });

    return modules;
  }, [canCreate]);

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Sales"
      subtitle=""
      icon={ReceiptText}
      modules={salesModules}
      defaultModule={defaultModule}
      onActiveModuleChange={onSubpageChange}
    />
  );
};

export default SalesHub;