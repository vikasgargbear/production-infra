/**
 * PurchaseHub - Central navigation for Purchase module
 *
 * Manages module switching + PO→Purchase Entry navigation with prefill data.
 * Uses ModuleHub for layout but wraps components to inject extra props.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  ShoppingBag, FileText, Package, ShoppingCart, List
} from 'lucide-react';
import { ModuleHub } from '../global';
import { PurchaseEntryFlow } from './purchase-entry';
import { PurchaseOrderFlow } from './purchase-order';
import { GRNFlow } from './grn';
import PurchaseListHistory from './PurchaseListHistory';
import { purchasesApi } from '../../services/api';
import { toast } from 'react-toastify';
import type { PurchaseData, PurchaseItem } from './purchase-entry/hooks';
import { usePermissions } from '../../hooks/usePermissions';

interface PurchaseHubProps {
  open?: boolean;
  onClose?: () => void;
}

const PurchaseHub: React.FC<PurchaseHubProps> = ({ open = true, onClose }) => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('purchase', 'create');

  // State for PO → Purchase Entry navigation
  const [prefilledData, setPrefilledData] = useState<Partial<PurchaseData> | null>(null);
  const [forceModule, setForceModule] = useState<string | null>(null);

  // Handle "Record Receipt" from PO list → opens Purchase Entry with prefill
  const handleRecordReceipt = useCallback(async (poId: number) => {
    try {
      const response = await purchasesApi.getForEntry(poId);
      const poData = response?.data;

      if (!poData || !poData.items?.length) {
        toast.warning('No remaining items to receive on this PO');
        return;
      }

      // Transform PO data into PurchaseData format for prefill
      const prefill: Partial<PurchaseData> = {
        purchase_order_id: poData.purchase_order_id,
        po_number: poData.po_number,
        supplier_id: poData.supplier_id,
        supplier_name: poData.supplier_name,
        supplier_details: {
          supplier_id: poData.supplier_id,
          supplier_name: poData.supplier_name,
          gst_number: poData.supplier_gst_number,
          address: poData.supplier_address,
          phone: poData.supplier_phone
        },
        notes: `Receipt for PO ${poData.po_number}`,
        items: poData.items.map((item: any) => ({
          po_item_id: item.po_item_id,
          product_id: item.product_id,
          product_name: item.product_name,
          hsn_code: item.hsn_code,
          quantity: Number(item.remaining_quantity),
          ordered_quantity: Number(item.ordered_quantity),
          free_quantity: Number(item.free_quantity || 0),
          unit_price: Number(item.unit_price || 0),
          mrp: Number(item.mrp || 0),
          discount_percent: Number(item.discount_percent || 0),
          tax_percent: Number(item.tax_percent || 0),
          uom: item.uom,
          pack_type: item.pack_type,
          pack_size: item.pack_size,
          batch_number: item.batch_number || '',
          expiry_date: item.expiry_date || '',
          manufacturing_date: item.manufacturing_date || ''
        } as PurchaseItem))
      };

      setPrefilledData(prefill);
      setForceModule('purchase');
    } catch (error: any) {
      const msg = error.response?.data?.detail || 'Failed to load PO data';
      toast.error(msg);
    }
  }, []);

  // Wrapper components that inject extra props
  const PurchaseEntryWrapper = useCallback((props: any) => {
    const data = prefilledData;
    // Clear prefill after passing it (single use)
    if (data) {
      setTimeout(() => setPrefilledData(null), 0);
    }
    return <PurchaseEntryFlow {...props} prefilledData={data} />;
  }, [prefilledData]);

  const HistoryWrapper = useCallback((props: any) => (
    <PurchaseListHistory {...props} onRecordReceipt={handleRecordReceipt} />
  ), [handleRecordReceipt]);

  const purchaseModules = useMemo(() => {
    const modules: any[] = [];

    if (canCreate) {
      modules.push(
        {
          id: 'purchase',
          label: 'Purchase',
          fullLabel: 'Purchase Entry',
          description: 'Record purchases',
          icon: ShoppingBag,
          color: 'indigo',
          component: PurchaseEntryWrapper
        },
        {
          id: 'purchase-order',
          label: 'Order',
          fullLabel: 'Purchase Order',
          description: 'Create POs',
          icon: FileText,
          color: 'indigo',
          component: PurchaseOrderFlow
        }
      );
    }

    modules.push(
      {
        id: 'grn',
        label: 'Receipts',
        fullLabel: 'Goods Receipts',
        description: 'Receipt history',
        icon: Package,
        color: 'green',
        component: GRNFlow
      },
      {
        id: 'purchase-history',
        label: 'Purchase History',
        fullLabel: 'Purchase History',
        description: 'Invoices, Orders & GRN',
        icon: List,
        color: 'gray',
        component: HistoryWrapper
      }
    );

    return modules;
  }, [canCreate, PurchaseEntryWrapper, HistoryWrapper]);

  // Use forceModule to switch tab when navigating from PO
  const defaultModule = forceModule || (canCreate ? 'purchase' : 'grn');

  // Reset forceModule after it's been consumed
  if (forceModule) {
    setTimeout(() => setForceModule(null), 0);
  }

  return (
    <ModuleHub
      key={forceModule || 'default'}
      open={open}
      onClose={onClose || (() => { })}
      title="Purchase"
      subtitle="Manage procurement & inventory"
      icon={ShoppingCart}
      modules={purchaseModules}
      defaultModule={defaultModule}
    />
  );
};

export default PurchaseHub;
