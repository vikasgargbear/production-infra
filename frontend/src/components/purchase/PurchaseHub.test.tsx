import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import PurchaseHub from './PurchaseHub';
import { canonicalGoodsReceiptsApi } from '../../services/api/modules/purchase/canonicalGoodsReceipts.api';


jest.mock('../../hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

jest.mock('../../services/api/modules/purchase/canonicalGoodsReceipts.api', () => ({
  canonicalGoodsReceiptsApi: {
    getPurchaseOrderContext: jest.fn(),
  },
}));

jest.mock('./purchase-entry', () => ({
  CanonicalPurchaseWorkflow: ({ onNavigate }: { onNavigate: (id: string) => void }) => (
    <button type="button" onClick={() => onNavigate('supplier-invoice')}>Open supplier invoice step</button>
  ),
}));
jest.mock('./purchase-entry/CanonicalSupplierInvoiceFlow', () => () => null);
jest.mock('./purchase-order', () => ({ PurchaseOrderFlow: () => null }));
jest.mock('./grn', () => ({ GRNFlow: () => null }));
jest.mock('./PurchaseListHistory', () => ({
  __esModule: true,
  default: ({ onRecordReceipt }: { onRecordReceipt: (id: string) => void }) => (
    <button type="button" onClick={() => onRecordReceipt('10000000-0000-7000-8000-000000000001')}>
      Start receipt
    </button>
  ),
}));

jest.mock('../global', () => ({
  ModuleHub: (props: any) => {
    const History = props.modules.find((module: any) => module.id === 'purchase-history').component;
    const Workflow = props.modules.find((module: any) => module.id === 'purchase').component;
    return (
      <div>
        <output aria-label="Purchase default module">{props.defaultModule}</output>
        <output aria-label="Purchase module labels">{props.modules.map((module: any) => module.fullLabel).join('|')}</output>
        <Workflow />
        <History />
        <button type="button" onClick={() => props.onActiveModuleChange('purchase-history')}>
          Switch module
        </button>
      </div>
    );
  },
}));

const receiptContext = {
  purchase_order_id: '10000000-0000-7000-8000-000000000001',
  purchase_order_number: 'PO-0001',
  branch_id: '10000000-0000-7000-8000-000000000002',
  supplier_account_id: '10000000-0000-7000-8000-000000000003',
  supplier_name: 'Canonical Supplier',
  organization_timezone: 'Asia/Kolkata',
  status: 'approved',
  lines: [{ purchase_order_line_id: '10000000-0000-7000-8000-000000000004' }],
};

describe('PurchaseHub canonical receipt navigation', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('keeps the Receipts module selected after loading canonical PO context', async () => {
    jest.useFakeTimers();
    const onSubpageChange = jest.fn();
    (canonicalGoodsReceiptsApi.getPurchaseOrderContext as jest.Mock).mockResolvedValue({
      data: receiptContext,
    });
    render(<PurchaseHub onSubpageChange={onSubpageChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start receipt' }));
    await waitFor(() => expect(
      screen.getByLabelText('Purchase default module').textContent,
    ).toBe('grn'));

    act(() => jest.runOnlyPendingTimers());
    expect(screen.getByLabelText('Purchase default module').textContent).toBe('grn');
    expect(onSubpageChange).toHaveBeenCalledWith('grn');
  });

  it('routes the workflow CTA directly to the canonical supplier-invoice step', async () => {
    const onSubpageChange = jest.fn();
    render(<PurchaseHub onSubpageChange={onSubpageChange} />);

    expect(screen.getByLabelText('Purchase module labels').textContent).toContain('Purchase Workflow');
    expect(screen.getByLabelText('Purchase module labels').textContent).not.toContain('Purchase Entry');
    fireEvent.click(screen.getByRole('button', { name: 'Open supplier invoice step' }));

    await waitFor(() => expect(
      screen.getByLabelText('Purchase default module').textContent,
    ).toBe('supplier-invoice'));
    expect(onSubpageChange).toHaveBeenCalledWith('supplier-invoice');
  });
});
