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

jest.mock('./purchase-entry', () => ({ PurchaseEntryFlow: () => null }));
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
    return (
      <div>
        <output aria-label="Purchase default module">{props.defaultModule}</output>
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
    (canonicalGoodsReceiptsApi.getPurchaseOrderContext as jest.Mock).mockResolvedValue({
      data: receiptContext,
    });
    render(<PurchaseHub />);

    fireEvent.click(screen.getByRole('button', { name: 'Start receipt' }));
    await waitFor(() => expect(
      screen.getByLabelText('Purchase default module').textContent,
    ).toBe('grn'));

    act(() => jest.runOnlyPendingTimers());
    expect(screen.getByLabelText('Purchase default module').textContent).toBe('grn');
  });
});
