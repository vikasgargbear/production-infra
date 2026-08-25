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
import { CanonicalPurchaseWorkflow } from './purchase-entry';
import CanonicalSupplierInvoiceFlow from './purchase-entry/CanonicalSupplierInvoiceFlow';
import { PurchaseOrderFlow } from './purchase-order';
import { GRNFlow } from './grn';
import PurchaseListHistory from './PurchaseListHistory';
import { toast } from 'react-toastify';
import { usePermissions } from '../../hooks/usePermissions';
import { canonicalGoodsReceiptsApi } from '../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import type { CanonicalReceiptContext } from '../../services/api/modules/purchase/canonicalGoodsReceipts.api';

interface PurchaseHubProps {
  open?: boolean;
  onClose?: () => void;
  /**
   * Deep-link sub-module to open on mount (e.g. "purchase-order").
   * Comes from the URL hash (#/purchase/<subpage>).
   */
  initialSubpage?: string | null;
  /**
   * Called when the user switches sub-modules inside the hub.
   * The parent (App) uses this to keep the URL hash in sync.
   */
  onSubpageChange?: (subpage: string | null) => void;
}

const PurchaseHub: React.FC<PurchaseHubProps> = ({ open = true, onClose, initialSubpage, onSubpageChange }) => {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('purchase', 'create');

  /** All valid sub-module IDs for deep-linking into PurchaseHub. */
  const PURCHASE_SUBPAGE_IDS = ['purchase', 'supplier-invoice', 'purchase-order', 'grn', 'purchase-history'] as const;

  // State for PO → canonical goods-receipt navigation.
  const [receiptContext, setReceiptContext] = useState<CanonicalReceiptContext | null>(null);
  const [receiptReadbackId, setReceiptReadbackId] = useState<string | null>(null);
  const [forceModule, setForceModule] = useState<string | null>(null);

  // Handle "Record Receipt" from a canonical UUID PO. Legacy integer PO
  // identities are rejected by the request adapter before any HTTP call.
  const handleRecordReceipt = useCallback(async (poId: string) => {
    try {
      const response = await canonicalGoodsReceiptsApi.getPurchaseOrderContext(poId);
      const context = response.data;

      if (!context?.lines?.length) {
        toast.warning('No remaining items to receive on this PO');
        return;
      }
      setReceiptContext(context);
      setReceiptReadbackId(null);
      setForceModule('grn');
      onSubpageChange?.('grn');
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : detail?.message || error.message || 'Failed to load canonical receipt context';
      toast.error(msg);
    }
  }, [onSubpageChange]);

  const navigateToCanonicalPurchaseStep = useCallback((moduleId: string) => {
    setForceModule(moduleId);
    onSubpageChange?.(moduleId);
  }, [onSubpageChange]);

  const PurchaseWorkflowWrapper = useCallback((props: any) => (
    <CanonicalPurchaseWorkflow
      {...props}
      onNavigate={navigateToCanonicalPurchaseStep}
    />
  ), [navigateToCanonicalPurchaseStep]);

  const ReceiptWrapper = useCallback((props: any) => (
    <GRNFlow
      {...props}
      prefilledData={receiptContext}
      initialDetailId={receiptReadbackId}
      onReceiptContextConsumed={() => setReceiptContext(null)}
      onReceiptPosted={goodsReceiptId => {
        setReceiptContext(null);
        setReceiptReadbackId(goodsReceiptId);
      }}
      onContinueToSupplierInvoice={() => navigateToCanonicalPurchaseStep('supplier-invoice')}
    />
  ), [navigateToCanonicalPurchaseStep, receiptContext, receiptReadbackId]);

  const HistoryWrapper = useCallback((props: any) => (
    <PurchaseListHistory {...props} onRecordReceipt={handleRecordReceipt} />
  ), [handleRecordReceipt]);

  const purchaseModules = useMemo(() => {
    const modules: any[] = [];

    if (canCreate) {
      modules.push(
        {
          id: 'purchase',
          label: 'Start',
          fullLabel: 'Purchase Workflow',
          description: 'Receipt then invoice',
          icon: ShoppingBag,
          color: 'indigo',
          component: PurchaseWorkflowWrapper
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
          id: 'supplier-invoice',
          label: 'Invoice',
          fullLabel: 'Supplier Invoice',
          description: 'Match posted GRNs',
          icon: FileText,
          color: 'indigo',
          component: CanonicalSupplierInvoiceFlow
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
        component: ReceiptWrapper
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
  }, [canCreate, PurchaseWorkflowWrapper, ReceiptWrapper, HistoryWrapper]);

  // Use forceModule to switch tab when navigating from PO; fall back to deep-link or permission-based default
  const resolvedInitialSubpage =
    initialSubpage && PURCHASE_SUBPAGE_IDS.includes(initialSubpage as any)
      ? initialSubpage
      : null;
  const defaultModule = forceModule || resolvedInitialSubpage || (canCreate ? 'purchase' : 'grn');

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
      onActiveModuleChange={subpage => {
        setForceModule(null);
        onSubpageChange?.(subpage);
      }}
    />
  );
};

export default PurchaseHub;
